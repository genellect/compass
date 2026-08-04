import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createContext, runInContext, type Context } from "node:vm";
import { describe, expect, it } from "vitest";

const gasSource = readFileSync(new URL("../google-apps-script/contact/Code.gs", import.meta.url), "utf8");
const sharedSecret = "contact-shared-secret-with-more-than-32-characters";
const otpPepper = "contact-otp-pepper-with-more-than-32-characters";
const adminRecipient = "contact-operator@example.invalid";
const issueRequestId = "1f386090-84e0-4c2f-a4d7-6f8f4f8ad141";
const submitRequestId = "8ab3959a-7184-40ca-8208-b4cb481ede35";
const verifyRequestId = "4cf7ccfe-6142-4541-b6fe-2e8cb996db63";
const verificationProof = "b".repeat(43);
const identity = {
  name: "松井優人",
  affiliation: "北里大学薬学部",
  email: "contact@example.com"
};
const issuePayload = {
  action: "request_code",
  sharedSecret,
  requestId: issueRequestId,
  receivedAt: "2026-07-29T01:23:45.000Z",
  challengeId: issueRequestId,
  clientFingerprint: "a".repeat(43),
  verificationCode: "123456",
  ...identity
};
const submitPayload = {
  action: "submit",
  sharedSecret,
  requestId: submitRequestId,
  receivedAt: "2026-07-29T01:25:00.000Z",
  challengeId: issueRequestId,
  verificationProof,
  details: "教育活動に関する共同企画について相談を希望します。",
  ...identity
};
const verifyPayload = {
  action: "verify_code",
  sharedSecret,
  requestId: verifyRequestId,
  receivedAt: "2026-07-29T01:24:00.000Z",
  challengeId: issueRequestId,
  verificationCode: "123456",
  verificationProof,
  ...identity
};

type SentEmail = {
  body: string;
  options: { name: string; noReply?: boolean; replyTo?: string };
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
  pepper?: string;
  quota?: number;
  secret?: string;
} = {}) {
  let now = Date.parse("2026-07-29T01:30:00.000Z");
  let failAtEmail = 0;
  const properties = new Map<string, string>();
  if (options.secret !== "missing") {
    properties.set("CONTACT_FORM_SHARED_SECRET", options.secret ?? sharedSecret);
  }
  if (options.pepper !== "missing") {
    properties.set("CONTACT_OTP_PEPPER", options.pepper ?? otpPepper);
  }
  if (options.adminEmail !== "missing") {
    properties.set(
      "CONTACT_ADMIN_RECIPIENT_EMAIL",
      options.adminEmail ?? adminRecipient
    );
  }
  const sentEmails: SentEmail[] = [];
  const scriptProperties = {
    deleteProperty(key: string) {
      properties.delete(key);
      return scriptProperties;
    },
    getProperties() {
      return Object.fromEntries(properties);
    },
    getProperty(key: string) {
      return properties.get(key) ?? null;
    },
    setProperty(key: string, value: string) {
      properties.set(key, value);
      return scriptProperties;
    }
  };

  class FakeDate extends Date {
    constructor(value?: string | number | Date) {
      super(value === undefined ? now : value instanceof Date ? value.getTime() : value);
    }

    static now() {
      return now;
    }
  }

  const context = createContext({
    Date: FakeDate,
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
        if (failAtEmail && sentEmails.length + 1 === failAtEmail) throw new Error("simulated mail failure");
        sentEmails.push({ to, subject, body, options: emailOptions });
      }
    },
    PropertiesService: {
      getScriptProperties: () => scriptProperties
    },
    Utilities: {
      Charset: { UTF_8: "UTF-8" },
      computeHmacSha256Signature(value: string, key: string) {
        return Array.from(createHmac("sha256", key).update(value, "utf8").digest());
      },
      formatDate: () => "2026-07-29 10:25:00",
      newBlob: (content: string) => ({ getBytes: () => Array.from(new TextEncoder().encode(content)) })
    }
  }) as GasContext;

  runInContext(gasSource, context);
  return {
    advance(milliseconds: number) {
      now += milliseconds;
    },
    context,
    properties,
    sentEmails,
    setFailAtEmail(index: number) {
      failAtEmail = index;
    }
  };
}

function post(context: GasContext, body: unknown) {
  const response = context.doPost({
    postData: {
      contents: JSON.stringify(body),
      type: "application/json"
    }
  });
  return JSON.parse(response.content) as {
    challengeId?: string;
    code?: string;
    duplicate?: boolean;
    ok: boolean;
    requestId?: string;
    retryAfter?: number;
  };
}

describe("Contact Google Apps Script", () => {
  it("sends one verification email and stores no plaintext identity or code", () => {
    const runtime = createGasRuntime();
    const result = post(runtime.context, issuePayload);

    expect(result).toEqual({ ok: true, requestId: issueRequestId, challengeId: issueRequestId });
    expect(runtime.sentEmails).toHaveLength(1);
    expect(runtime.sentEmails[0]).toMatchObject({
      to: identity.email,
      subject: "【COMPASS】お問い合わせ確認コード",
      options: {
        name: "学生支援団体COMPASS",
        noReply: true
      }
    });
    expect(runtime.sentEmails[0]?.options.replyTo).toBeUndefined();
    expect(runtime.sentEmails[0]?.body).toContain("123456");
    expect(runtime.sentEmails[0]?.body).toContain("※本メールはGoogle Apps Scriptにより自動送信されています。");

    const stored = [...runtime.properties.entries()]
      .filter(([key]) => ![
        "CONTACT_ADMIN_RECIPIENT_EMAIL",
        "CONTACT_FORM_SHARED_SECRET",
        "CONTACT_OTP_PEPPER"
      ].includes(key))
      .map(([key, value]) => `${key}:${value}`)
      .join("\n");
    expect(stored).not.toContain(identity.email);
    expect(stored).not.toContain(identity.name);
    expect(stored).not.toContain(identity.affiliation);
    expect(stored).not.toContain("123456");
  });

  it("keeps a repeated issue request idempotent", () => {
    const runtime = createGasRuntime();
    expect(post(runtime.context, issuePayload).ok).toBe(true);
    const duplicate = post(runtime.context, issuePayload);

    expect(duplicate).toEqual({
      ok: true,
      requestId: issueRequestId,
      challengeId: issueRequestId,
      duplicate: true
    });
    expect(runtime.sentEmails).toHaveLength(1);
  });

  it("enforces the identity requirements before sending a code", () => {
    const runtime = createGasRuntime();

    expect(post(runtime.context, { ...issuePayload, name: "松" })).toEqual({ ok: false, code: "validation" });
    expect(post(runtime.context, { ...issuePayload, affiliation: "学" })).toEqual({ ok: false, code: "validation" });
    expect(post(runtime.context, { ...issuePayload, email: "invalid" })).toEqual({ ok: false, code: "validation" });
    expect(runtime.sentEmails).toHaveLength(0);
  });

  it("throttles immediate code sends to the same email", () => {
    const runtime = createGasRuntime();
    expect(post(runtime.context, issuePayload).ok).toBe(true);
    const secondRequestId = "eb7d3201-a592-4f20-8d36-eaf079aa6ae9";
    const throttled = post(runtime.context, {
      ...issuePayload,
      requestId: secondRequestId,
      challengeId: secondRequestId
    });

    expect(throttled.ok).toBe(false);
    expect(throttled.code).toBe("rate_limited");
    expect(throttled.retryAfter).toBe(60);
    expect(runtime.sentEmails).toHaveLength(1);
  });

  it("stops distributed code sends at the global daily circuit breaker", () => {
    const runtime = createGasRuntime();
    const now = Date.parse("2026-07-29T01:30:00.000Z");
    runtime.properties.set("CONTACT_RATE_GLOBAL", JSON.stringify({
      timestamps: Array.from({ length: 100 }, (_, index) => now - index * 1000),
      updatedAt: now
    }));

    const result = post(runtime.context, issuePayload);

    expect(result.ok).toBe(false);
    expect(result.code).toBe("rate_limited");
    expect(runtime.sentEmails).toHaveLength(0);
  });

  it("verifies ownership, sends both final emails, and blocks duplicate delivery", () => {
    const runtime = createGasRuntime();
    expect(post(runtime.context, issuePayload).ok).toBe(true);
    expect(post(runtime.context, verifyPayload)).toEqual({
      ok: true,
      requestId: verifyRequestId,
      challengeId: issueRequestId
    });
    expect(post(runtime.context, verifyPayload)).toEqual({
      ok: true,
      requestId: verifyRequestId,
      challengeId: issueRequestId,
      duplicate: true
    });
    expect([...runtime.properties.values()].join("\n")).not.toContain(verificationProof);
    const result = post(runtime.context, submitPayload);

    expect(result).toEqual({ ok: true, requestId: submitRequestId });
    expect(runtime.sentEmails).toHaveLength(3);

    const operator = runtime.sentEmails[1];
    expect(operator).toMatchObject({
      to: adminRecipient,
      subject: "【COMPASS】お問い合わせ",
      options: { name: "学生支援団体COMPASS", replyTo: identity.email }
    });
    expect(operator?.body).toContain(`・お名前：${identity.name}`);
    expect(operator?.body).toContain(`・学部・学科 / 所属：${identity.affiliation}`);
    expect(operator?.body).toContain("メールアドレス（所有確認済み）");
    expect(operator?.body).toContain(submitPayload.details);

    const applicant = runtime.sentEmails[2];
    expect(applicant).toMatchObject({
      to: identity.email,
      subject: "【COMPASS】お問い合わせを受け付けました",
      options: { name: "学生支援団体COMPASS", replyTo: adminRecipient }
    });
    expect(applicant?.body).toContain(submitPayload.details);
    expect(applicant?.body).toContain("※本メールはGoogle Apps Scriptにより自動送信されています。");

    expect(post(runtime.context, submitPayload)).toEqual({ ok: true, requestId: submitRequestId, duplicate: true });
    expect(runtime.sentEmails).toHaveLength(3);
  });

  it("rejects changed identity, expired codes, and five incorrect attempts during verification", () => {
    const changed = createGasRuntime();
    expect(post(changed.context, issuePayload).ok).toBe(true);
    expect(post(changed.context, { ...verifyPayload, affiliation: "別の所属" }).code).toBe("verification_invalid");
    expect(changed.sentEmails).toHaveLength(1);

    const expired = createGasRuntime();
    expect(post(expired.context, issuePayload).ok).toBe(true);
    expired.advance(10 * 60 * 1000 + 1);
    expect(post(expired.context, verifyPayload).code).toBe("verification_expired");
    expect(expired.sentEmails).toHaveLength(1);

    const locked = createGasRuntime();
    expect(post(locked.context, issuePayload).ok).toBe(true);
    for (let index = 0; index < 5; index += 1) {
      expect(post(locked.context, { ...verifyPayload, verificationCode: "000000" }).code).toBe("verification_invalid");
    }
    expect(post(locked.context, verifyPayload).code).toBe("verification_used");
    expect(locked.sentEmails).toHaveLength(1);
  });

  it("does not accept a final submission before the explicit verification step", () => {
    const runtime = createGasRuntime();
    expect(post(runtime.context, issuePayload).ok).toBe(true);

    expect(post(runtime.context, submitPayload)).toEqual({ ok: false, code: "verification_used" });
    expect(runtime.sentEmails).toHaveLength(1);
  });

  it("resumes only the unsent final email after a transient failure", () => {
    const runtime = createGasRuntime();
    expect(post(runtime.context, issuePayload).ok).toBe(true);
    expect(post(runtime.context, verifyPayload).ok).toBe(true);
    runtime.setFailAtEmail(3);

    expect(post(runtime.context, submitPayload)).toEqual({ ok: false, code: "email" });
    expect(runtime.sentEmails).toHaveLength(2);

    runtime.setFailAtEmail(0);
    expect(post(runtime.context, submitPayload)).toEqual({ ok: true, requestId: submitRequestId });
    expect(runtime.sentEmails).toHaveLength(3);
    expect(runtime.sentEmails.filter((email) => email.to === adminRecipient)).toHaveLength(1);
  });

  it("rejects missing secrets and insufficient mail quota", () => {
    const missing = createGasRuntime({ secret: "missing" });
    expect(post(missing.context, issuePayload)).toEqual({ ok: false, code: "configuration" });

    const quota = createGasRuntime({ quota: 0 });
    expect(post(quota.context, issuePayload)).toEqual({ ok: false, code: "quota" });
    expect(quota.sentEmails).toHaveLength(0);
  });

  it("fails closed when the operator recipient is missing or malformed", () => {
    for (const adminEmail of [
      "missing",
      "invalid-address",
      "operator@example.invalid\r\nBcc:x@example.invalid",
      "first@example.invalid,second@example.invalid"
    ]) {
      const runtime = createGasRuntime({ adminEmail });
      expect(post(runtime.context, issuePayload)).toEqual({
        ok: false,
        code: "configuration"
      });
      expect(runtime.sentEmails).toHaveLength(0);
    }
  });
});
