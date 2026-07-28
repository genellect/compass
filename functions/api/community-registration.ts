import {
  communityRegistrationRequestSchema,
  FORM_ERROR_MESSAGE,
  getFieldErrors,
  TURNSTILE_ACTION,
  type CommunityRegistrationRequest
} from "../../src/lib/community-registration-schema";

const MAX_BODY_BYTES = 16 * 1024;
const OPERATOR_EMAIL = "matsui.yuto@st.kitasato-u.ac.jp";
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const TURNSTILE_ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type RegistrationEnv = {
  REGISTRATION_FROM_EMAIL?: string;
  RESEND_API_KEY?: string;
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

type ResendMessage = {
  from: string;
  reply_to: string;
  subject: string;
  text: string;
  to: string[];
};

const jsonHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff"
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function hasRequiredConfiguration(env: RegistrationEnv): env is Required<RegistrationEnv> {
  return Boolean(
    env.REGISTRATION_FROM_EMAIL &&
    env.RESEND_API_KEY &&
    env.TURNSTILE_SECRET_KEY
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

function buildOperatorText(payload: CommunityRegistrationRequest, receivedAt: string) {
  const interests = payload.interests.map((interest) => `  ・${interest}`).join("\n");
  const motivation = payload.motivation || "（記入なし）";

  return `COMPASS Communityの登録申請がありました。

・氏名：${payload.name}
・学生メールアドレス：${payload.email}
・学部・学科：${payload.facultyDepartment}
・学籍番号：${payload.studentId}
・学年：${payload.year}
・やってみたい活動：
${interests}
・興味を持った理由や、やってみたいこと：
${motivation}

・受付日時：${receivedAt}
・受付ID：${payload.requestId}`;
}

function buildApplicantText(payload: CommunityRegistrationRequest) {
  return `${payload.name} さん

COMPASSにご関心をお寄せいただき、ありがとうございます。

コミュニティ参加フォームへのご登録を受け付けました。
今後の活動等につきましては、内容を確認のうえ、代表よりご登録のメールアドレス宛にご連絡いたします。

今後ともCOMPASSをよろしくお願いいたします。

【本メールにお心当たりのない方へ】

メールアドレスが誤って入力された可能性がございます。大変お手数ですが、本メールへの返信、または公式サイトのお問い合わせフォームよりご連絡いただけますと幸いです。

――――――――――――――――
学生支援団体COMPASS
代表　Yuto Matsui

公式サイト
https://compass-official.pages.dev/
――――――――――――――――`;
}

async function sendResendEmail(env: Required<RegistrationEnv>, message: ResendMessage, idempotencyKey: string) {
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify(message)
  });

  return response.ok;
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

  const receivedAt = new Date().toISOString();
  const operatorMessage: ResendMessage = {
    from: env.REGISTRATION_FROM_EMAIL,
    to: [OPERATOR_EMAIL],
    reply_to: parsed.data.email,
    subject: "【COMPASS】Community登録申請",
    text: buildOperatorText(parsed.data, receivedAt)
  };
  const applicantMessage: ResendMessage = {
    from: env.REGISTRATION_FROM_EMAIL,
    to: [parsed.data.email],
    reply_to: OPERATOR_EMAIL,
    subject: "【COMPASS】コミュニティ参加フォームを受け付けました",
    text: buildApplicantText(parsed.data)
  };

  try {
    const operatorAccepted = await sendResendEmail(
      env,
      operatorMessage,
      `community-operator-${parsed.data.requestId}`
    );
    if (!operatorAccepted) throw new Error("operator_email_rejected");

    const applicantAccepted = await sendResendEmail(
      env,
      applicantMessage,
      `community-applicant-${parsed.data.requestId}`
    );
    if (!applicantAccepted) throw new Error("applicant_email_rejected");
  } catch {
    console.error(`Community registration email delivery failed for request ${parsed.data.requestId}.`);
    return jsonResponse({ ok: false, code: "email", message: "メール送信を完了できませんでした。時間をおいて再度お試しください。" }, 502);
  }

  return jsonResponse({ ok: true, requestId: parsed.data.requestId }, 200);
}
