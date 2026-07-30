import {
  CONTACT_FORM_ERROR_MESSAGE,
  CONTACT_TURNSTILE_ACTION,
  contactApiRequestSchema,
  getContactFieldErrors,
  type ContactApiRequest,
  type ContactCodeRequest
} from "../../src/lib/contact-schema";

const MAX_BODY_BYTES = 16 * 1024;
const GAS_TIMEOUT_MS = 20_000;
const TURNSTILE_ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type ContactEnv = {
  CONTACT_GOOGLE_APPS_SCRIPT_SECRET?: string;
  CONTACT_GOOGLE_APPS_SCRIPT_URL?: string;
  CONTACT_RATE_LIMIT_SECRET?: string;
  CONTACT_TURNSTILE_SECRET_KEY?: string;
};

type PagesContext = {
  env: ContactEnv;
  request: Request;
};

type TurnstileResult = {
  action?: string;
  hostname?: string;
  success: boolean;
};

type GasRelayResult = {
  challengeId?: string;
  code?: string;
  duplicate?: boolean;
  ok?: boolean;
  requestId?: string;
  retryAfter?: number;
};

type GasRelayOutcome = {
  accepted: boolean;
  contentType: string;
  finalHost: string;
  reason: string;
  redirected: boolean;
  result?: GasRelayResult;
  status: number;
};

const jsonHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff"
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function isAllowedGasWebAppUrl(value: string | undefined) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "script.google.com" &&
      /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname) &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function hasRequiredConfiguration(env: ContactEnv): env is Required<ContactEnv> {
  return Boolean(
    env.CONTACT_GOOGLE_APPS_SCRIPT_SECRET &&
    env.CONTACT_GOOGLE_APPS_SCRIPT_SECRET.length >= 32 &&
    env.CONTACT_RATE_LIMIT_SECRET &&
    env.CONTACT_RATE_LIMIT_SECRET.length >= 32 &&
    env.CONTACT_TURNSTILE_SECRET_KEY &&
    isAllowedGasWebAppUrl(env.CONTACT_GOOGLE_APPS_SCRIPT_URL)
  );
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}

async function verifyTurnstile(
  request: Request,
  env: Required<ContactEnv>,
  payload: ContactCodeRequest
) {
  const formData = new FormData();
  formData.set("secret", env.CONTACT_TURNSTILE_SECRET_KEY);
  formData.set("response", payload.turnstileToken);
  formData.set("idempotency_key", payload.requestId);

  const remoteIp = request.headers.get("CF-Connecting-IP");
  if (remoteIp) formData.set("remoteip", remoteIp);

  const response = await fetch(TURNSTILE_ENDPOINT, { method: "POST", body: formData });
  if (!response.ok) return false;

  const result = await response.json() as TurnstileResult;
  return (
    result.success &&
    result.hostname === new URL(request.url).hostname &&
    result.action === CONTACT_TURNSTILE_ACTION
  );
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacSha256Base64Url(secret: string, value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

function generateVerificationCode() {
  const range = 1_000_000;
  const limit = Math.floor(0x1_0000_0000 / range) * range;
  const random = new Uint32Array(1);

  do {
    crypto.getRandomValues(random);
  } while (random[0] >= limit);

  return String(random[0] % range).padStart(6, "0");
}

function gasPayload(
  request: Request,
  env: Required<ContactEnv>,
  payload: ContactApiRequest,
  receivedAt: string,
  generated?: {
    challengeId?: string;
    clientFingerprint?: string;
    verificationCode?: string;
    verificationProof?: string;
  }
) {
  if (
    payload.action === "request_code" &&
    generated?.challengeId &&
    generated.clientFingerprint &&
    generated.verificationCode
  ) {
    return {
      action: payload.action,
      affiliation: payload.affiliation,
      challengeId: generated.challengeId,
      clientFingerprint: generated.clientFingerprint,
      email: payload.email,
      name: payload.name,
      receivedAt,
      requestId: payload.requestId,
      sharedSecret: env.CONTACT_GOOGLE_APPS_SCRIPT_SECRET,
      verificationCode: generated.verificationCode
    };
  }

  if (payload.action === "verify_code" && generated?.verificationProof) {
    return {
      action: payload.action,
      affiliation: payload.affiliation,
      challengeId: payload.challengeId,
      email: payload.email,
      name: payload.name,
      receivedAt,
      requestId: payload.requestId,
      sharedSecret: env.CONTACT_GOOGLE_APPS_SCRIPT_SECRET,
      verificationCode: payload.verificationCode,
      verificationProof: generated.verificationProof
    };
  }

  if (payload.action === "submit") {
    return {
      action: payload.action,
      affiliation: payload.affiliation,
      challengeId: payload.challengeId,
      details: payload.details,
      email: payload.email,
      name: payload.name,
      receivedAt,
      requestId: payload.requestId,
      sharedSecret: env.CONTACT_GOOGLE_APPS_SCRIPT_SECRET,
      verificationProof: payload.verificationProof
    };
  }

  throw new Error(`Unsupported contact action for ${new URL(request.url).pathname}.`);
}

async function relayToGoogleAppsScript(
  env: Required<ContactEnv>,
  body: Record<string, unknown>
): Promise<GasRelayOutcome> {
  const response = await fetch(env.CONTACT_GOOGLE_APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    redirect: "follow",
    signal: AbortSignal.timeout(GAS_TIMEOUT_MS),
    body: JSON.stringify(body)
  });

  const contentType = response.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase() || "unknown";
  let finalHost = "unknown";
  try {
    if (response.url) finalHost = new URL(response.url).hostname;
  } catch {
    finalHost = "invalid";
  }

  const outcome = (accepted: boolean, reason: string, result?: GasRelayResult): GasRelayOutcome => ({
    accepted,
    contentType,
    finalHost,
    reason,
    redirected: response.redirected,
    result,
    status: response.status
  });

  if (!response.ok) return outcome(false, `http_${response.status}`);

  let result: GasRelayResult;
  try {
    result = await response.json() as GasRelayResult;
  } catch {
    return outcome(false, "invalid_json");
  }

  if (result.ok !== true) {
    const safeCode = typeof result.code === "string" && /^[a-z][a-z0-9_]{0,39}$/.test(result.code)
      ? result.code
      : "rejected";
    return outcome(false, `gas_${safeCode}`, result);
  }

  if (result.requestId !== body.requestId) return outcome(false, "request_id_mismatch", result);
  if (["request_code", "verify_code"].includes(String(body.action)) && result.challengeId !== body.challengeId) {
    return outcome(false, "challenge_id_mismatch", result);
  }

  return outcome(true, "accepted", result);
}

function gasDiagnostic(outcome: GasRelayOutcome) {
  return [
    `reason=${outcome.reason}`,
    `status=${outcome.status}`,
    `contentType=${outcome.contentType}`,
    `redirected=${outcome.redirected}`,
    `finalHost=${outcome.finalHost}`
  ].join(" ");
}

function gasErrorResponse(outcome: GasRelayOutcome) {
  if (outcome.reason === "gas_rate_limited") {
    const retryAfter = Number.isInteger(outcome.result?.retryAfter)
      ? Math.max(1, Math.min(3600, Number(outcome.result?.retryAfter)))
      : 60;
    return jsonResponse({
      ok: false,
      code: "rate_limited",
      message: "確認コードの送信回数が上限に達しました。時間をおいて再度お試しください。",
      retryAfter
    }, 429);
  }

  if (["gas_verification_invalid", "gas_verification_expired", "gas_verification_used"].includes(outcome.reason)) {
    return jsonResponse({
      ok: false,
      code: "verification",
      message: "確認コードが正しくないか、有効期限が切れています。"
    }, 422);
  }

  if (outcome.reason === "gas_validation") {
    return jsonResponse({ ok: false, code: "validation", message: CONTACT_FORM_ERROR_MESSAGE }, 422);
  }

  return jsonResponse({
    ok: false,
    code: "email",
    message: "メール送信を完了できませんでした。時間をおいて再度お試しください。"
  }, 502);
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { ...jsonHeaders, Allow: "POST" } });
  }

  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    return jsonResponse({ ok: false, code: "content_type", message: CONTACT_FORM_ERROR_MESSAGE }, 415);
  }

  if (!isSameOrigin(request)) {
    return jsonResponse({ ok: false, code: "origin", message: "送信元を確認できませんでした。" }, 403);
  }

  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ ok: false, code: "body_too_large", message: CONTACT_FORM_ERROR_MESSAGE }, 413);
  }

  let bodyText: string;
  try {
    bodyText = await request.text();
  } catch {
    return jsonResponse({ ok: false, code: "body", message: CONTACT_FORM_ERROR_MESSAGE }, 400);
  }

  if (new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) {
    return jsonResponse({ ok: false, code: "body_too_large", message: CONTACT_FORM_ERROR_MESSAGE }, 413);
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(bodyText);
  } catch {
    return jsonResponse({ ok: false, code: "json", message: CONTACT_FORM_ERROR_MESSAGE }, 400);
  }

  const parsed = contactApiRequestSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return jsonResponse({
      ok: false,
      code: "validation",
      message: CONTACT_FORM_ERROR_MESSAGE,
      fieldErrors: getContactFieldErrors(parsed.error)
    }, 422);
  }

  if (!hasRequiredConfiguration(env)) {
    console.error("Contact form configuration is incomplete.");
    return jsonResponse({
      ok: false,
      code: "configuration",
      message: "現在フォームを送信できません。時間をおいて再度お試しください。"
    }, 503);
  }

  let generated: {
    challengeId?: string;
    clientFingerprint?: string;
    verificationCode?: string;
    verificationProof?: string;
  } | undefined;
  if (parsed.data.action === "request_code") {
    let turnstileValid = false;
    try {
      turnstileValid = await verifyTurnstile(request, env, parsed.data);
    } catch {
      console.error(`Contact Turnstile verification failed for request ${parsed.data.requestId}.`);
    }

    if (!turnstileValid) {
      return jsonResponse({
        ok: false,
        code: "turnstile",
        message: "Bot確認を完了できませんでした。もう一度お試しください。"
      }, 422);
    }

    const remoteIp = request.headers.get("CF-Connecting-IP") || "unavailable";
    generated = {
      // The request ID is already a cryptographically random UUID. Reusing it
      // keeps retries idempotent even when the first GAS response is lost.
      challengeId: parsed.data.requestId,
      clientFingerprint: await hmacSha256Base64Url(env.CONTACT_RATE_LIMIT_SECRET, remoteIp),
      verificationCode: generateVerificationCode()
    };
  } else if (parsed.data.action === "verify_code") {
    generated = {
      verificationProof: await hmacSha256Base64Url(
        env.CONTACT_RATE_LIMIT_SECRET,
        `contact-proof:${parsed.data.challengeId}:${parsed.data.requestId}`
      )
    };
  }

  try {
    const body = gasPayload(request, env, parsed.data, new Date().toISOString(), generated);
    const outcome = await relayToGoogleAppsScript(env, body);
    if (!outcome.accepted) {
      console.error(`Contact delivery failed for request ${parsed.data.requestId}. ${gasDiagnostic(outcome)}`);
      return gasErrorResponse(outcome);
    }

    if (parsed.data.action === "request_code") {
      return jsonResponse({
        ok: true,
        requestId: parsed.data.requestId,
        challengeId: outcome.result?.challengeId
      }, 200);
    }

    if (parsed.data.action === "verify_code") {
      return jsonResponse({
        ok: true,
        requestId: parsed.data.requestId,
        challengeId: parsed.data.challengeId,
        verificationProof: generated?.verificationProof
      }, 200);
    }
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network_error";
    console.error(`Contact delivery failed for request ${parsed.data.requestId}. reason=${reason}`);
    return jsonResponse({
      ok: false,
      code: "email",
      message: "メール送信を完了できませんでした。時間をおいて再度お試しください。"
    }, 502);
  }

  return jsonResponse({ ok: true, requestId: parsed.data.requestId }, 200);
}
