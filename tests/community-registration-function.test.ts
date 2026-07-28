import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequest, type RegistrationEnv } from "../functions/api/community-registration";
import { INTEREST_OPTIONS, TURNSTILE_ACTION } from "../src/lib/community-registration-schema";

const origin = "https://compass-official.pages.dev";
const requestId = "1f386090-84e0-4c2f-a4d7-6f8f4f8ad141";
const env: RegistrationEnv = {
  REGISTRATION_FROM_EMAIL: "COMPASS <community@mail.compass-official.example>",
  RESEND_API_KEY: "test-resend-key",
  TURNSTILE_SECRET_KEY: "test-turnstile-secret"
};
const payload = {
  name: "松井 優人",
  email: "sample@st.kitasato-u.ac.jp",
  facultyDepartment: "薬学部 薬学科",
  studentId: "PP00000",
  year: "1年",
  interests: [INTEREST_OPTIONS[0], INTEREST_OPTIONS[1]],
  motivation: "英語学習イベントを企画してみたいです。",
  requestId,
  turnstileToken: "verified-token",
  website: ""
};

function registrationRequest(body: unknown = payload, requestOrigin = origin) {
  return new Request(`${origin}/api/community-registration`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: requestOrigin,
      "CF-Connecting-IP": "192.0.2.10"
    },
    body: JSON.stringify(body)
  });
}

function acceptedTurnstile() {
  return new Response(JSON.stringify({ success: true, hostname: "compass-official.pages.dev", action: TURNSTILE_ACTION }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("community registration Pages Function", () => {
  it("verifies Turnstile and sends the operator and applicant emails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(acceptedTurnstile())
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "operator-email" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "applicant-email" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({ env, request: registrationRequest() });
    const result = await response.json() as { ok: boolean; requestId: string };

    expect(response.status).toBe(200);
    expect(result).toEqual({ ok: true, requestId });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const turnstileCall = fetchMock.mock.calls[0];
    expect(turnstileCall[0]).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const turnstileBody = turnstileCall[1]?.body as FormData;
    expect(turnstileBody.get("response")).toBe("verified-token");
    expect(turnstileBody.get("remoteip")).toBe("192.0.2.10");

    const operatorInit = fetchMock.mock.calls[1][1] as RequestInit;
    const operator = JSON.parse(String(operatorInit.body)) as { reply_to: string; subject: string; text: string; to: string[] };
    expect(operator.to).toEqual(["matsui.yuto@st.kitasato-u.ac.jp"]);
    expect(operator.reply_to).toBe(payload.email);
    expect(operator.subject).toBe("【COMPASS】Community登録申請");
    expect(operator.text).toContain("COMPASS Communityの登録申請がありました。");
    expect(operator.text).toContain("・氏名：松井 優人");
    expect(operator.text).toContain("・学籍番号：PP00000");
    expect(operator.text).toContain(`・${INTEREST_OPTIONS[1]}`);
    expect(new Headers(operatorInit.headers).get("Idempotency-Key")).toBe(`community-operator-${requestId}`);

    const applicantInit = fetchMock.mock.calls[2][1] as RequestInit;
    const applicant = JSON.parse(String(applicantInit.body)) as { reply_to: string; subject: string; text: string; to: string[] };
    expect(applicant.to).toEqual([payload.email]);
    expect(applicant.reply_to).toBe("matsui.yuto@st.kitasato-u.ac.jp");
    expect(applicant.subject).toBe("【COMPASS】コミュニティ参加フォームを受け付けました");
    expect(applicant.text).toBe(`松井 優人 さん

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
――――――――――――――――`);
    expect(new Headers(applicantInit.headers).get("Idempotency-Key")).toBe(`community-applicant-${requestId}`);
  });

  it("rejects malformed fields before any external request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({ env, request: registrationRequest({ ...payload, email: "student@example.com" }) });
    const result = await response.json() as { code: string; fieldErrors: { email: string } };

    expect(response.status).toBe(422);
    expect(result.code).toBe("validation");
    expect(result.fieldErrors.email).toBe("正しい形式で入力してください");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects cross-origin and honeypot submissions", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const crossOrigin = await onRequest({ env, request: registrationRequest(payload, "https://attacker.example") });
    const honeypot = await onRequest({ env, request: registrationRequest({ ...payload, website: "spam" }) });

    expect(crossOrigin.status).toBe(403);
    expect(honeypot.status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops before email delivery when Turnstile evidence is invalid", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ success: false }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({ env, request: registrationRequest() });
    const result = await response.json() as { code: string };

    expect(response.status).toBe(422);
    expect(result.code).toBe("turnstile");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
