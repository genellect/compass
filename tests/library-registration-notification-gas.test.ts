import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createContext, runInContext, type Context } from "node:vm";
import { describe, expect, it } from "vitest";

const gasSource = readFileSync(
  new URL("../google-apps-script/library-registration-notifications/Code.gs", import.meta.url),
  "utf8"
);
const manifest = JSON.parse(readFileSync(
  new URL("../google-apps-script/library-registration-notifications/appsscript.json", import.meta.url),
  "utf8"
) as string) as { oauthScopes?: string[] };
const testVector = JSON.parse(readFileSync(
  new URL("../contracts/library-registration/mailapp-notification-v1-test-vector.json", import.meta.url),
  "utf8"
) as string) as {
  derivedKeyHex: string;
  request: ReturnType<typeof signedEnvelope>;
  syntheticOnly: boolean;
};

const hmacKey = "00".repeat(32);
const adminEmail = "library-operator@example.invalid";
const driveUrl = "https://drive.google.com/drive/folders/approved-folder-id-12345?usp=sharing";
const messageId = "8ab3959a-7184-40ca-8208-b4cb481ede35";
const registrationId = "1f386090-84e0-4c2f-a4d7-6f8f4f8ad141";
const issuedAt = "2026-08-04T10:00:00.000Z";

const payload = {
  registrationId,
  fullName: "北里 花子",
  email: "student@st.kitasato-u.ac.jp",
  eligibilityStatus: "approved",
  driveAccessStatus: "granted",
  processedAt: "2026-08-04T09:59:30.000Z"
};

type SentEmail = {
  body: string;
  options: { name: string; replyTo?: string };
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

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`
  )).join(",")}}`;
}

function signedEnvelope(overrides: {
  issuedAt?: string;
  messageId?: string;
  payload?: Record<string, unknown>;
} = {}) {
  const envelope = {
    version: "fsl-notification-v1",
    issuedAt: overrides.issuedAt ?? issuedAt,
    messageId: overrides.messageId ?? messageId,
    payload: overrides.payload ?? payload
  };
  const input = [
    envelope.version,
    envelope.issuedAt,
    envelope.messageId,
    canonicalJson(envelope.payload)
  ].join("\n");
  return {
    ...envelope,
    signature: createHmac("sha256", Buffer.from(hmacKey, "hex"))
      .update(input, "utf8")
      .digest("hex")
  };
}

function createGasRuntime(options: {
  adminEmail?: string;
  driveUrl?: string;
  hmacKey?: string;
  lockAvailable?: boolean;
  quota?: number;
} = {}) {
  let now = Date.parse(issuedAt);
  let failAtEmail = 0;
  const properties = new Map<string, string>();
  if (options.hmacKey !== "missing") {
    properties.set("FSL_NOTIFICATION_HMAC_KEY", options.hmacKey ?? hmacKey);
  }
  if (options.adminEmail !== "missing") {
    properties.set("FSL_NOTIFICATION_ADMIN_EMAIL", options.adminEmail ?? adminEmail);
  }
  if (options.driveUrl !== "missing") {
    properties.set("FSL_NOTIFICATION_DRIVE_URL", options.driveUrl ?? driveUrl);
  }
  const errors: string[] = [];
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
    console: { error: (message: string) => errors.push(String(message)) },
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
        tryLock: () => options.lockAvailable ?? true
      })
    },
    MailApp: {
      getRemainingDailyQuota: () => options.quota ?? 1000,
      sendEmail(to: string, subject: string, body: string, emailOptions: SentEmail["options"]) {
        if (failAtEmail && sentEmails.length + 1 === failAtEmail) {
          throw new Error("simulated mail failure");
        }
        sentEmails.push({ to, subject, body, options: emailOptions });
      }
    },
    PropertiesService: {
      getScriptProperties: () => scriptProperties
    },
    Utilities: {
      Charset: { UTF_8: "UTF-8" },
      computeHmacSha256Signature(value: number[], key: number[]) {
        const valueBytes = Uint8Array.from(value.map((byte) => byte < 0 ? byte + 256 : byte));
        const keyBytes = Uint8Array.from(key.map((byte) => byte < 0 ? byte + 256 : byte));
        return Array.from(createHmac("sha256", keyBytes).update(valueBytes).digest())
          .map((byte) => byte > 127 ? byte - 256 : byte);
      },
      formatDate: () => "2026-08-04 18:59:30",
      newBlob: (content: string) => ({
        getBytes: () => Array.from(new TextEncoder().encode(content))
      })
    }
  }) as GasContext;

  runInContext(gasSource, context);
  return {
    advance(milliseconds: number) {
      now += milliseconds;
    },
    context,
    errors,
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
    code?: string;
    duplicate?: boolean;
    messageId?: string;
    ok: boolean;
  };
}

describe("Future Strategy Library notification GAS", () => {
  it("matches the public synthetic cross-runtime signature vector", () => {
    expect(testVector.syntheticOnly).toBe(true);
    expect(testVector.derivedKeyHex).toBe(hmacKey);
    expect(signedEnvelope()).toEqual(testVector.request);
  });

  it("sends the requested admin summary and a legacy-equivalent applicant acceptance", () => {
    const runtime = createGasRuntime();
    const enrichedPayload = {
      ...payload,
      grade: "3年",
      question: "利用開始時期について確認したいです。"
    };
    const result = post(runtime.context, signedEnvelope({ payload: enrichedPayload }));

    expect(result).toEqual({ ok: true, messageId });
    expect(runtime.sentEmails).toHaveLength(2);

    const admin = runtime.sentEmails[0];
    expect(admin).toMatchObject({
      to: adminEmail,
      subject: "【新規承認】未来戦略ライブラリ 登録処理完了",
      options: { name: "未来戦略ライブラリ" }
    });
    expect(admin?.body).toContain(`【氏名】${payload.fullName}`);
    expect(admin?.body).toContain("【学年】3年");
    expect(admin?.body).toContain("【判定結果】承認");
    expect(admin?.body).toContain("【連絡事項】利用開始時期について確認したいです。");
    expect(admin?.body).not.toContain(registrationId);
    expect(admin?.body).not.toContain(payload.email);

    const applicant = runtime.sentEmails[1];
    expect(applicant).toMatchObject({
      to: payload.email,
      subject: "【未来戦略ライブラリ】登録申請を受け付けました",
      options: { name: "未来戦略ライブラリ", replyTo: adminEmail }
    });
    expect(applicant?.body).toContain(`${payload.fullName} 様`);
    expect(applicant?.body).toContain(driveUrl);
    expect(applicant?.body).toContain("Googleから届く共有案内");

    const ledger = [...runtime.properties.entries()]
      .filter(([key]) => key.startsWith("FSL_NOTIFICATION_LEDGER_"))
      .map(([key, value]) => `${key}:${value}`)
      .join("\n");
    expect(ledger).not.toContain(payload.fullName);
    expect(ledger).not.toContain(payload.email);
    expect(ledger).not.toContain(driveUrl);
    expect(ledger).not.toContain(hmacKey);
  });

  it("sends a manual-review summary only to the administrator", () => {
    const runtime = createGasRuntime();
    const manualPayload = {
      registrationId,
      fullName: "北里 教員",
      grade: "その他",
      question: "所属確認をお願いします。",
      eligibilityStatus: "manual_review",
      processedAt: "2026-08-04T09:59:30.000Z"
    };

    expect(post(runtime.context, signedEnvelope({ payload: manualPayload }))).toEqual({
      ok: true,
      messageId
    });
    expect(runtime.sentEmails).toHaveLength(1);
    expect(runtime.sentEmails[0]).toMatchObject({
      to: adminEmail,
      subject: "【個別確認】未来戦略ライブラリ 登録申請",
      options: { name: "未来戦略ライブラリ" }
    });
    expect(runtime.sentEmails[0]?.body).toBe([
      "【氏名】北里 教員",
      "【学年】その他",
      "【判定結果】個別確認",
      "【連絡事項】所属確認をお願いします。"
    ].join("\n"));

    runtime.advance(60 * 1000);
    expect(post(runtime.context, signedEnvelope({
      issuedAt: "2026-08-04T10:01:00.000Z",
      payload: manualPayload
    }))).toEqual({ ok: true, duplicate: true, messageId });
    expect(runtime.sentEmails).toHaveLength(1);
  });

  it("authenticates canonical JSON independent of payload insertion order", () => {
    const runtime = createGasRuntime();
    const reordered = Object.fromEntries(Object.entries(payload).reverse());

    expect(post(runtime.context, signedEnvelope({ payload: reordered }))).toEqual({
      ok: true,
      messageId
    });
    expect(runtime.sentEmails).toHaveLength(2);
  });

  it("rejects tampering, an untrusted domain, extra PII, and a non-approved result", () => {
    const runtime = createGasRuntime();
    const tampered = signedEnvelope();
    tampered.payload = { ...tampered.payload, fullName: "改ざん" };

    expect(post(runtime.context, tampered)).toEqual({ ok: false, code: "unauthorized" });
    expect(post(runtime.context, signedEnvelope({
      payload: { ...payload, email: "student@st.kitasato-u.ac.jp.attacker.invalid" }
    }))).toEqual({ ok: false, code: "validation" });
    expect(post(runtime.context, signedEnvelope({
      payload: { ...payload, studentNumber: "PP23000" }
    }))).toEqual({ ok: false, code: "validation" });
    expect(post(runtime.context, signedEnvelope({
      payload: { ...payload, eligibilityStatus: "manual_review" }
    }))).toEqual({ ok: false, code: "validation" });
    expect(runtime.sentEmails).toHaveLength(0);
  });

  it("rejects stale and future effectful requests but acknowledges a completed duplicate", () => {
    const stale = createGasRuntime();
    expect(post(stale.context, signedEnvelope({ issuedAt: "2026-08-04T09:54:59.000Z" })))
      .toEqual({ ok: false, code: "stale" });
    expect(post(stale.context, signedEnvelope({ issuedAt: "2026-08-04T10:05:01.000Z" })))
      .toEqual({ ok: false, code: "stale" });
    expect(stale.sentEmails).toHaveLength(0);

    const completed = createGasRuntime();
    expect(post(completed.context, signedEnvelope()).ok).toBe(true);
    completed.advance(60 * 60 * 1000);
    expect(post(completed.context, signedEnvelope({
      issuedAt: "2026-08-04T11:00:00.000Z"
    }))).toEqual({
      ok: true,
      duplicate: true,
      messageId
    });
    expect(completed.sentEmails).toHaveLength(2);
  });

  it("keeps a message id bound to one signed payload", () => {
    const runtime = createGasRuntime();
    expect(post(runtime.context, signedEnvelope()).ok).toBe(true);

    const changed = signedEnvelope({
      payload: { ...payload, driveAccessStatus: "already_granted" }
    });
    expect(post(runtime.context, changed)).toEqual({ ok: false, code: "conflict" });
    expect(runtime.sentEmails).toHaveLength(2);
  });

  it("resumes only the unsent applicant message after a transient failure", () => {
    const runtime = createGasRuntime();
    runtime.setFailAtEmail(2);

    expect(post(runtime.context, signedEnvelope())).toEqual({ ok: false, code: "email" });
    expect(runtime.sentEmails).toHaveLength(1);
    expect(runtime.sentEmails[0]?.to).toBe(adminEmail);

    runtime.setFailAtEmail(0);
    runtime.advance(60 * 1000);
    expect(post(runtime.context, signedEnvelope({
      issuedAt: "2026-08-04T10:01:00.000Z"
    }))).toEqual({ ok: true, messageId });
    expect(runtime.sentEmails).toHaveLength(2);
    expect(runtime.sentEmails.filter((email) => email.to === adminEmail)).toHaveLength(1);
    expect(runtime.sentEmails.filter((email) => email.to === payload.email)).toHaveLength(1);
  });

  it("fails closed for quota, lock, and configuration errors", () => {
    const quota = createGasRuntime({ quota: 1 });
    expect(post(quota.context, signedEnvelope())).toEqual({ ok: false, code: "quota" });
    expect(quota.sentEmails).toHaveLength(0);

    const locked = createGasRuntime({ lockAvailable: false });
    expect(post(locked.context, signedEnvelope())).toEqual({ ok: false, code: "busy" });
    expect(locked.sentEmails).toHaveLength(0);

    for (const invalid of [
      createGasRuntime({ hmacKey: "missing" }),
      createGasRuntime({ adminEmail: "invalid\r\nBcc:x@example.invalid" }),
      createGasRuntime({ driveUrl: "https://example.invalid/folder" })
    ]) {
      expect(post(invalid.context, signedEnvelope())).toEqual({ ok: false, code: "configuration" });
      expect(invalid.sentEmails).toHaveLength(0);
    }
  });

  it("keeps responses and error logs free of secrets and PII", () => {
    const runtime = createGasRuntime();
    runtime.setFailAtEmail(1);
    const result = post(runtime.context, signedEnvelope());
    const observable = JSON.stringify({ result, errors: runtime.errors });

    expect(result).toEqual({ ok: false, code: "email" });
    expect(observable).not.toContain(hmacKey);
    expect(observable).not.toContain(payload.fullName);
    expect(observable).not.toContain(payload.email);
    expect(observable).not.toContain(driveUrl);
  });

  it("declares only the MailApp scope and contains no Drive, Form, or Sheet service", () => {
    expect(manifest.oauthScopes).toEqual([
      "https://www.googleapis.com/auth/script.send_mail"
    ]);
    for (const forbidden of [
      "DriveApp",
      "Drive.Permissions",
      "FormApp",
      "SpreadsheetApp",
      "GmailApp",
      "UrlFetchApp"
    ]) {
      expect(gasSource).not.toContain(forbidden);
    }
  });
});
