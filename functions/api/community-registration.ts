import {
  communityRegistrationRequestSchema,
  FORM_ERROR_MESSAGE,
  getFieldErrors,
  TURNSTILE_ACTION,
  type CommunityRegistrationRequest
} from "../../src/lib/community-registration-schema";

const MAX_BODY_BYTES = 16 * 1024;
const GAS_TIMEOUT_MS = 20_000;
const TURNSTILE_ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type RegistrationEnv = {
  GOOGLE_APPS_SCRIPT_SECRET?: string;
  GOOGLE_APPS_SCRIPT_URL?: string;
  TURNSTILE_SECRET_KEY?: string;
};

type PagesContext = {
  env: RegistrationEnv;
  request: Request;
};

type TurnstileResult = {
  action?: string;
  hostname?: string;
  success: boolean;
};

type GasRelayResult = {
  code?: string;
  ok?: boolean;
  requestId?: string;
};

type GasRelayOutcome = {
  accepted: boolean;
  contentType: string;
  finalHost: string;
  reason: string;
  redirected: boolean;
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

function hasRequiredConfiguration(env: RegistrationEnv): env is Required<RegistrationEnv> {
  return Boolean(
    env.GOOGLE_APPS_SCRIPT_SECRET &&
    env.GOOGLE_APPS_SCRIPT_SECRET.length >= 32 &&
    env.TURNSTILE_SECRET_KEY &&
    isAllowedGasWebAppUrl(env.GOOGLE_APPS_SCRIPT_URL)
  );
}

function getRequestOrigin(request: Request) {
  return new URL(request.url).origin;
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  return Boolean(origin && origin === getRequestOrigin(request));
}

async function verifyTurnstile(request: Request, env: Required<RegistrationEnv>, payload: CommunityRegistrationRequest) {
  const formData = new FormData();
  formData.set("secret", env.TURNSTILE_SECRET_KEY);
  formData.set("response", payload.turnstileToken);
  formData.set("idempotency_key", payload.requestId);

  const remoteIp = request.headers.get("CF-Connecting-IP");
  if (remoteIp) formData.set("remoteip", remoteIp);

  const response = await fetch(TURNSTILE_ENDPOINT, { method: "POST", body: formData });
  if (!response.ok) return false;

  const result = await response.json() as TurnstileResult;
  const requestHostname = new URL(request.url).hostname;
  return result.success && result.hostname === requestHostname && result.action === TURNSTILE_ACTION;
}

async function relayToGoogleAppsScript(
  env: Required<RegistrationEnv>,
  payload: CommunityRegistrationRequest,
  receivedAt: string
): Promise<GasRelayOutcome> {
  const response = await fetch(env.GOOGLE_APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    redirect: "follow",
    signal: AbortSignal.timeout(GAS_TIMEOUT_MS),
    body: JSON.stringify({
      sharedSecret: env.GOOGLE_APPS_SCRIPT_SECRET,
      requestId: payload.requestId,
      receivedAt,
      name: payload.name,
      email: payload.email,
      facultyDepartment: payload.facultyDepartment,
      studentId: payload.studentId,
      year: payload.year,
      interests: payload.interests,
      motivation: payload.motivation
    })
  });

  const contentType = response.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase() || "unknown";
  let finalHost = "unknown";
  try {
    if (response.url) finalHost = new URL(response.url).hostname;
  } catch {
    finalHost = "invalid";
  }

  const outcome = (accepted: boolean, reason: string): GasRelayOutcome => ({
    accepted,
    contentType,
    finalHost,
    reason,
    redirected: response.redirected,
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
    return outcome(false, `gas_${safeCode}`);
  }

  if (result.requestId !== payload.requestId) return outcome(false, "request_id_mismatch");
  return outcome(true, "accepted");
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

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { ...jsonHeaders, Allow: "POST" } });
  }

  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    return jsonResponse({ ok: false, code: "content_type", message: FORM_ERROR_MESSAGE }, 415);
  }

  if (!isSameOrigin(request)) {
    return jsonResponse({ ok: false, code: "origin", message: "送信元を確認できませんでした。" }, 403);
  }

  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ ok: false, code: "body_too_large", message: FORM_ERROR_MESSAGE }, 413);
  }

  let bodyText: string;
  try {
    bodyText = await request.text();
  } catch {
    return jsonResponse({ ok: false, code: "body", message: FORM_ERROR_MESSAGE }, 400);
  }

  if (new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) {
    return jsonResponse({ ok: false, code: "body_too_large", message: FORM_ERROR_MESSAGE }, 413);
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(bodyText);
  } catch {
    return jsonResponse({ ok: false, code: "json", message: FORM_ERROR_MESSAGE }, 400);
  }

  const parsed = communityRegistrationRequestSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return jsonResponse({
      ok: false,
      code: "validation",
      message: FORM_ERROR_MESSAGE,
      fieldErrors: getFieldErrors(parsed.error)
    }, 422);
  }

  if (!hasRequiredConfiguration(env)) {
    console.error("Community registration configuration is incomplete.");
    return jsonResponse({ ok: false, code: "configuration", message: "現在フォームを送信できません。時間をおいて再度お試しください。" }, 503);
  }

  let turnstileValid = false;
  try {
    turnstileValid = await verifyTurnstile(request, env, parsed.data);
  } catch {
    console.error(`Turnstile verification failed for request ${parsed.data.requestId}.`);
  }

  if (!turnstileValid) {
    return jsonResponse({ ok: false, code: "turnstile", message: "Bot確認を完了できませんでした。もう一度お試しください。" }, 422);
  }

  try {
    const outcome = await relayToGoogleAppsScript(env, parsed.data, new Date().toISOString());
    if (!outcome.accepted) {
      console.error(
        `Community registration email delivery failed for request ${parsed.data.requestId}. ${gasDiagnostic(outcome)}`
      );
      return jsonResponse({ ok: false, code: "email", message: "メール送信を完了できませんでした。時間をおいて再度お試しください。" }, 502);
    }
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network_error";
    console.error(`Community registration email delivery failed for request ${parsed.data.requestId}. reason=${reason}`);
    return jsonResponse({ ok: false, code: "email", message: "メール送信を完了できませんでした。時間をおいて再度お試しください。" }, 502);
  }

  return jsonResponse({ ok: true, requestId: parsed.data.requestId }, 200);
}
