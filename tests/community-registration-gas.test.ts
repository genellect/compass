import { readFileSync } from "node:fs";
import { createContext, runInContext, type Context } from "node:vm";
import { describe, expect, it } from "vitest";
import { INTEREST_OPTIONS } from "../src/lib/community-registration-schema";

const gasSource = readFileSync(new URL("../google-apps-script/Code.gs", import.meta.url), "utf8");
const sharedSecret = "a-secure-shared-secret-with-more-than-32-characters";
const adminRecipient = "community-operator@example.invalid";
const requestId = "1f386090-84e0-4c2f-a4d7-6f8f4f8ad141";
const payload = {
  sharedSecret,
  requestId,
  receivedAt: "2026-07-29T01:23:45.000Z",
  name: "松井 優人",
  email: "sample@st.kitasato-u.ac.jp",
  facultyDepartment: "薬学部 薬学科",
  studentId: "PP00000",
  year: "1年",
  interests: [INTEREST_OPTIONS[0], INTEREST_OPTIONS[1]],
  motivation: "英語学習イベントを企画してみたいです。"
};

type SentEmail = {
  body: string;
  options: { name: string; replyTo: string };
  subject: string;
  to: string;
};

type GasResponse = {
  content: string;
  mimeType?: string;
  setMimeType: (mimeType: string) => GasResponse;
};

type GasContext = Context & {
  doPost: (event: { postData: { contents: string; type: string } }) => GasResponse;
};

function createGasRuntime(options: {
  adminEmail?: string;
  quota?: number;
  secret?: string;
} = {}) {
  const properties = new Map<string, string>();
  if (options.secret !== "missing") {
    properties.set("FORM_SHARED_SECRET", options.secret ?? sharedSecret);
  }
  if (options.adminEmail !== "missing") {
    properties.set(
      "COMMUNITY_ADMIN_RECIPIENT_EMAIL",
      options.adminEmail ?? adminRecipient
    );
  }
  const sentEmails: SentEmail[] = [];
  const scriptProperties = {
    getProperty(key: string) {
      return properties.get(key) ?? null;
    },
    setProperty(key: string, value: string) {
      properties.set(key, value);
      return scriptProperties;
    }
  };

  const context = createContext({
    console: { error: () => undefined },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput(content: string): GasResponse {
        return {
          content,
          setMimeType(mimeType: string) {
            this.mimeType = mimeType;
            return this;
          }
        };
      }
    },
    LockService: {
      getScriptLock: () => ({
        releaseLock: () => undefined,
        tryLock: () => true
      })
    },
    MailApp: {
      getRemainingDailyQuota: () => options.quota ?? 1000,
      sendEmail(to: string, subject: string, body: string, emailOptions: SentEmail["options"]) {
        sentEmails.push({ to, subject, body, options: emailOptions });
      }
    },
    PropertiesService: {
      getScriptProperties: () => scriptProperties
    },
    Utilities: {
      formatDate: () => "2026-07-29 10:23:45",
      newBlob: (content: string) => ({ getBytes: () => Array.from(new TextEncoder().encode(content)) })
    }
  }) as GasContext;

  runInContext(gasSource, context);
  return { context, properties, sentEmails };
}

function post(context: GasContext, body: unknown) {
  const response = context.doPost({
    postData: {
      contents: JSON.stringify(body),
      type: "application/json"
    }
  });
  return JSON.parse(response.content) as { code?: string; duplicate?: boolean; ok: boolean; requestId?: string };
}

describe("Community registration Google Apps Script", () => {
  it("sends the operator and applicant emails with the required content", () => {
    const runtime = createGasRuntime();
    const result = post(runtime.context, payload);

    expect(result).toEqual({ ok: true, requestId });
    expect(runtime.sentEmails).toHaveLength(2);

    const operator = runtime.sentEmails[0];
    expect(operator.to).toBe(adminRecipient);
    expect(operator.subject).toBe("【COMPASS】Community登録申請");
    expect(operator.options).toEqual({
      name: "学生支援団体COMPASS",
      replyTo: payload.email
    });
    expect(operator.body).toContain("COMPASS Communityの登録申請がありました。");
    expect(operator.body).toContain("・氏名：松井 優人");
    expect(operator.body).toContain("・学籍番号：PP00000");
    expect(operator.body).toContain(`・${INTEREST_OPTIONS[1]}`);
    expect(operator.body).toContain("※本メールはGoogle Apps Scriptにより自動送信されています。");

    const applicant = runtime.sentEmails[1];
    expect(applicant.to).toBe(payload.email);
    expect(applicant.subject).toBe("【COMPASS】コミュニティ参加フォームを受け付けました");
    expect(applicant.options).toEqual({
      name: "学生支援団体COMPASS",
      replyTo: adminRecipient
    });
    expect(applicant.body).toBe(`松井 優人 さん

COMPASSにご関心をお寄せいただき、ありがとうございます。

コミュニティ参加フォームへのご登録を受け付けました。
今後の活動等につきましては、内容を確認のうえ、代表よりご登録のメールアドレス宛にご連絡いたします。

今後ともCOMPASSをよろしくお願いいたします。

※本メールはGoogle Apps Scriptにより自動送信されています。

【本メールにお心当たりのない方へ】

メールアドレスが誤って入力された可能性がございます。大変お手数ですが、本メールへの返信、または公式サイトのお問い合わせフォームよりご連絡いただけますと幸いです。

――――――――――――――――
学生支援団体COMPASS
代表　Yuto Matsui

公式サイト
https://compass-official.pages.dev/
――――――――――――――――`);
  });

  it("does not resend either email for an already completed request", () => {
    const runtime = createGasRuntime();
    expect(post(runtime.context, payload).ok).toBe(true);
    const duplicate = post(runtime.context, payload);

    expect(duplicate).toEqual({ ok: true, requestId, duplicate: true });
    expect(runtime.sentEmails).toHaveLength(2);
  });

  it("rejects an invalid shared secret and invalid student email", () => {
    const runtime = createGasRuntime();
    const unauthorized = post(runtime.context, { ...payload, sharedSecret: "wrong" });
    const invalidEmail = post(runtime.context, { ...payload, email: "student@example.com" });

    expect(unauthorized).toEqual({ ok: false, code: "unauthorized" });
    expect(invalidEmail).toEqual({ ok: false, code: "validation" });
    expect(runtime.sentEmails).toHaveLength(0);
  });

  it("fails closed when the operator recipient is missing or malformed", () => {
    for (const adminEmail of [
      "missing",
      "invalid-address",
      "operator@example.invalid\nBcc:x@example.invalid",
      "first@example.invalid,second@example.invalid"
    ]) {
      const runtime = createGasRuntime({ adminEmail });
      expect(post(runtime.context, payload)).toEqual({
        ok: false,
        code: "configuration"
      });
      expect(runtime.sentEmails).toHaveLength(0);
    }
  });

  it("stops before sending when the Apps Script daily quota is insufficient", () => {
    const runtime = createGasRuntime({ quota: 1 });
    const result = post(runtime.context, payload);

    expect(result).toEqual({ ok: false, code: "quota" });
    expect(runtime.sentEmails).toHaveLength(0);
  });
});
