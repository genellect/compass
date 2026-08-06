/**
 * Future Strategy Library notification gateway.
 *
 * This web app is deliberately limited to MailApp. It does not read or mutate
 * Google Drive, Forms, Sheets, or the registration database. The caller must
 * submit only a minimized HMAC-signed payload after either a Drive grant or a
 * server-side manual-review decision.
 */

const CONFIG = Object.freeze({
  ADMIN_EMAIL_PROPERTY: "FSL_NOTIFICATION_ADMIN_EMAIL",
  ALLOWED_EMAIL_DOMAIN: "st.kitasato-u.ac.jp",
  CONTACT_URL: "https://compass-official.pages.dev/contact/",
  DRIVE_URL_PROPERTY: "FSL_NOTIFICATION_DRIVE_URL",
  HMAC_KEY_PROPERTY: "FSL_NOTIFICATION_HMAC_KEY",
  LEDGER_PREFIX: "FSL_NOTIFICATION_LEDGER_",
  LEDGER_RETENTION_MILLISECONDS: 8 * 24 * 60 * 60 * 1000,
  MAX_BODY_BYTES: 16 * 1024,
  MAX_CLOCK_SKEW_MILLISECONDS: 5 * 60 * 1000,
  MAX_LEDGER_ENTRIES: 250,
  SENDER_NAME: "未来戦略ライブラリ",
  TIME_ZONE: "Asia/Tokyo",
  VERSION: "fsl-notification-v1"
});

const ENVELOPE_KEYS = Object.freeze([
  "issuedAt",
  "messageId",
  "payload",
  "signature",
  "version"
]);

const PAYLOAD_KEYS = Object.freeze([
  "driveAccessStatus",
  "email",
  "eligibilityStatus",
  "fullName",
  "grade",
  "processedAt",
  "question",
  "registrationId",
  "studentNumber"
]);

const REQUIRED_PAYLOAD_KEYS = Object.freeze([
  "eligibilityStatus",
  "fullName",
  "processedAt",
  "registrationId"
]);

function authorizeNotificationGateway() {
  const configured = readConfiguration_(
    PropertiesService.getScriptProperties()
  );
  if (!configured.ok) {
    throw new Error("Notification gateway configuration is incomplete.");
  }
  const remainingQuota = MailApp.getRemainingDailyQuota();
  if (remainingQuota < 2) {
    throw new Error("MailApp recipient quota is insufficient.");
  }
  return "notification_gateway_authorized";
}

function doGet() {
  return jsonResponse_({ ok: false, code: "method_not_allowed" });
}

function doPost(event) {
  try {
    return handlePost_(event);
  } catch (_error) {
    // Never log the request, signature, recipient, or payload.
    console.error("Library notification gateway failed closed.");
    return jsonResponse_({ ok: false, code: "internal" });
  }
}

function handlePost_(event) {
  if (
    !event ||
    !event.postData ||
    typeof event.postData.type !== "string" ||
    !event.postData.type.toLowerCase().startsWith("application/json")
  ) {
    return jsonResponse_({ ok: false, code: "content_type" });
  }

  const contents = event.postData.contents || "";
  if (Utilities.newBlob(contents).getBytes().length > CONFIG.MAX_BODY_BYTES) {
    return jsonResponse_({ ok: false, code: "body_too_large" });
  }

  let envelope;
  try {
    envelope = JSON.parse(contents);
  } catch (_error) {
    return jsonResponse_({ ok: false, code: "invalid_json" });
  }

  const validatedEnvelope = validateEnvelope_(envelope);
  if (!validatedEnvelope.ok) {
    return jsonResponse_({ ok: false, code: "validation" });
  }

  const scriptProperties = PropertiesService.getScriptProperties();
  const configured = readConfiguration_(scriptProperties);
  if (!configured.ok) {
    console.error("Library notification gateway configuration is incomplete.");
    return jsonResponse_({ ok: false, code: "configuration" });
  }

  const request = validatedEnvelope.data;
  const canonicalRequest = buildSignatureInput_(request);
  const expectedSignature = hmacSha256Hex_(canonicalRequest, configured.hmacKey);
  if (!constantTimeEquals_(expectedSignature, request.signature)) {
    return jsonResponse_({ ok: false, code: "unauthorized" });
  }
  const payloadTag = hmacSha256Hex_(
    "payload\n" + canonicalJson_(request.payload),
    configured.hmacKey
  );

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return jsonResponse_({ ok: false, code: "busy" });
  }

  try {
    const ledgerKey = CONFIG.LEDGER_PREFIX + request.messageId;
    const existingState = readLedgerState_(scriptProperties, ledgerKey);
    if (existingState && existingState.payloadTag !== payloadTag) {
      return jsonResponse_({ ok: false, code: "conflict" });
    }
    const sendApplicant = request.payload.eligibilityStatus === "approved";
    if (
      existingState &&
      existingState.adminSent === true &&
      (!sendApplicant || existingState.applicantSent === true)
    ) {
      return jsonResponse_({
        ok: true,
        duplicate: true,
        messageId: request.messageId
      });
    }

    if (!isWithinClockSkew_(request.issuedAt)) {
      return jsonResponse_({ ok: false, code: "stale" });
    }

    const state = existingState || {
      adminSent: false,
      applicantSent: false,
      payloadTag: payloadTag,
      updatedAt: new Date().toISOString()
    };
    const pendingRecipients = Number(!state.adminSent) +
      Number(sendApplicant && !state.applicantSent);
    if (MailApp.getRemainingDailyQuota() < pendingRecipients) {
      return jsonResponse_({ ok: false, code: "quota" });
    }

    if (!state.adminSent) {
      MailApp.sendEmail(
        configured.adminEmail,
        sendApplicant
          ? "【新規承認】未来戦略ライブラリ 登録処理完了"
          : "【個別確認】未来戦略ライブラリ 登録申請",
        buildAdminText_(request.payload),
        {
          name: CONFIG.SENDER_NAME
        }
      );
      state.adminSent = true;
      state.updatedAt = new Date().toISOString();
      writeLedgerState_(scriptProperties, ledgerKey, state);
    }

    if (sendApplicant && !state.applicantSent) {
      MailApp.sendEmail(
        request.payload.email,
        "【未来戦略ライブラリ】利用登録が完了しました",
        buildApplicantText_(request.payload, configured),
        {
          htmlBody: buildApplicantHtml_(request.payload, configured),
          name: CONFIG.SENDER_NAME,
          replyTo: configured.adminEmail
        }
      );
      state.applicantSent = true;
      state.updatedAt = new Date().toISOString();
      writeLedgerState_(scriptProperties, ledgerKey, state);
    }

    pruneLedger_(scriptProperties);
    return jsonResponse_({ ok: true, messageId: request.messageId });
  } catch (_error) {
    console.error("Library notification email delivery failed.");
    return jsonResponse_({ ok: false, code: "email" });
  } finally {
    lock.releaseLock();
  }
}

function validateEnvelope_(raw) {
  if (!isPlainObject_(raw) || !hasOnlyKeys_(raw, ENVELOPE_KEYS)) {
    return { ok: false };
  }
  if (
    raw.version !== CONFIG.VERSION ||
    typeof raw.issuedAt !== "string" ||
    !isUuid_(raw.messageId) ||
    raw.messageId !== raw.messageId.toLowerCase() ||
    typeof raw.signature !== "string" ||
    !/^[0-9a-f]{64}$/.test(raw.signature)
  ) {
    return { ok: false };
  }
  if (!isUtcTimestamp_(raw.issuedAt)) {
    return { ok: false };
  }

  const validatedPayload = validatePayload_(raw.payload);
  if (!validatedPayload.ok) {
    return { ok: false };
  }

  return {
    ok: true,
    data: {
      version: raw.version,
      issuedAt: raw.issuedAt,
      messageId: raw.messageId.toLowerCase(),
      payload: validatedPayload.data,
      signature: raw.signature
    }
  };
}

function validatePayload_(raw) {
  if (
    !isPlainObject_(raw) ||
    !hasRequiredAndOnlyKeys_(raw, REQUIRED_PAYLOAD_KEYS, PAYLOAD_KEYS)
  ) {
    return { ok: false };
  }
  if (
    !isUuid_(raw.registrationId) ||
    raw.registrationId !== raw.registrationId.toLowerCase() ||
    typeof raw.fullName !== "string" ||
    typeof raw.eligibilityStatus !== "string" ||
    typeof raw.processedAt !== "string"
  ) {
    return { ok: false };
  }

  const fullName = raw.fullName.trim();
  const email = typeof raw.email === "string"
    ? raw.email.trim().toLowerCase()
    : "";
  const grade = typeof raw.grade === "string" ? raw.grade.trim() : "その他";
  const question = typeof raw.question === "string" ? raw.question.trim() : "";
  const studentNumber = typeof raw.studentNumber === "string"
    ? raw.studentNumber.trim()
    : "";
  const driveStatuses = ["granted", "already_granted"];
  const grades = ["1年", "2年", "3年", "4年", "5年", "6年", "M1", "M2", "その他"];

  if (
    fullName.length < 1 ||
    fullName.length > 200 ||
    raw.fullName !== fullName ||
    /[\u0000-\u001f\u007f]/.test(fullName) ||
    grades.indexOf(grade) === -1 ||
    (raw.grade !== undefined && raw.grade !== grade) ||
    question.length > 1000 ||
    (raw.question !== undefined && raw.question !== question) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(question) ||
    studentNumber.length > 32 ||
    (raw.studentNumber !== undefined && raw.studentNumber !== studentNumber) ||
    /[\u0000-\u001f\u007f]/.test(studentNumber) ||
    ["approved", "manual_review"].indexOf(raw.eligibilityStatus) === -1 ||
    !isUtcTimestamp_(raw.processedAt)
  ) {
    return { ok: false };
  }

  const approved = raw.eligibilityStatus === "approved";
  if (
    approved && (
      typeof raw.email !== "string" ||
      email.length > 254 ||
      raw.email !== email ||
      !isAllowedRecipient_(email) ||
      typeof raw.driveAccessStatus !== "string" ||
      driveStatuses.indexOf(raw.driveAccessStatus) === -1
    )
  ) {
    return { ok: false };
  }
  if (
    !approved && (
      raw.email !== undefined ||
      raw.driveAccessStatus !== undefined
    )
  ) {
    return { ok: false };
  }

  const data = {
    registrationId: raw.registrationId.toLowerCase(),
    fullName: fullName,
    eligibilityStatus: raw.eligibilityStatus,
    processedAt: raw.processedAt
  };
  if (raw.grade !== undefined) data.grade = grade;
  if (approved) {
    data.email = email;
    data.driveAccessStatus = raw.driveAccessStatus;
  }
  if (raw.question !== undefined) data.question = question;
  if (raw.studentNumber !== undefined) data.studentNumber = studentNumber;
  return { ok: true, data: data };
}

function readConfiguration_(scriptProperties) {
  const hmacKey = scriptProperties.getProperty(CONFIG.HMAC_KEY_PROPERTY);
  const adminEmail = normalizeEmail_(
    scriptProperties.getProperty(CONFIG.ADMIN_EMAIL_PROPERTY)
  );
  const driveUrl = String(
    scriptProperties.getProperty(CONFIG.DRIVE_URL_PROPERTY) || ""
  ).trim();

  if (
    typeof hmacKey !== "string" ||
    !/^[0-9a-f]{64}$/.test(hmacKey) ||
    !isEmail_(adminEmail) ||
    !/^https:\/\/drive\.google\.com\/drive\/(?:u\/[0-9]+\/)?folders\/[A-Za-z0-9_-]{10,}(?:\?[^\s#]*)?$/.test(driveUrl)
  ) {
    return { ok: false };
  }
  return { ok: true, hmacKey: hmacKey, adminEmail: adminEmail, driveUrl: driveUrl };
}

function buildSignatureInput_(request) {
  return [
    request.version,
    request.issuedAt,
    request.messageId,
    canonicalJson_(request.payload)
  ].join("\n");
}

function canonicalJson_(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite JSON number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson_).join(",") + "]";
  }
  if (isPlainObject_(value)) {
    return "{" + Object.keys(value).sort().map(function(key) {
      return JSON.stringify(key) + ":" + canonicalJson_(value[key]);
    }).join(",") + "}";
  }
  throw new Error("Unsupported JSON value.");
}

function hmacSha256Hex_(value, key) {
  const valueBytes = Utilities.newBlob(value).getBytes();
  const keyBytes = [];
  for (let index = 0; index < key.length; index += 2) {
    const unsigned = parseInt(key.slice(index, index + 2), 16);
    keyBytes.push(unsigned > 127 ? unsigned - 256 : unsigned);
  }
  const bytes = Utilities.computeHmacSha256Signature(
    valueBytes,
    keyBytes
  );
  return bytes.map(function(byte) {
    const unsigned = byte < 0 ? byte + 256 : byte;
    return unsigned.toString(16).padStart(2, "0");
  }).join("");
}

function constantTimeEquals_(expected, actual) {
  if (typeof expected !== "string" || typeof actual !== "string") return false;
  let difference = expected.length ^ actual.length;
  const length = Math.max(expected.length, actual.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (expected.charCodeAt(index) || 0) ^ (actual.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function isWithinClockSkew_(issuedAt) {
  return Math.abs(Date.now() - new Date(issuedAt).getTime()) <= CONFIG.MAX_CLOCK_SKEW_MILLISECONDS;
}

function isUtcTimestamp_(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
  ) {
    return false;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const canonicalValue = value.includes(".") ? value : value.replace("Z", ".000Z");
  return parsed.toISOString() === canonicalValue;
}

function isUuid_(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isPlainObject_(value) {
  return value !== null && Object.prototype.toString.call(value) === "[object Object]";
}

function hasOnlyKeys_(value, expectedKeys) {
  const keys = Object.keys(value).sort();
  const expected = expectedKeys.slice().sort();
  return keys.length === expected.length && keys.every(function(key, index) {
    return key === expected[index];
  });
}

function hasRequiredAndOnlyKeys_(value, requiredKeys, allowedKeys) {
  const keys = Object.keys(value);
  return requiredKeys.every(function(key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }) && keys.every(function(key) {
    return allowedKeys.indexOf(key) !== -1;
  });
}

function normalizeEmail_(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isEmail_(value) {
  return value.length >= 3 &&
    value.length <= 254 &&
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(value);
}

function isAllowedRecipient_(email) {
  return isEmail_(email) && email.endsWith("@" + CONFIG.ALLOWED_EMAIL_DOMAIN);
}

function readLedgerState_(scriptProperties, key) {
  const raw = scriptProperties.getProperty(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      !isPlainObject_(parsed) ||
      typeof parsed.payloadTag !== "string" ||
      !/^[0-9a-f]{64}$/.test(parsed.payloadTag) ||
      typeof parsed.adminSent !== "boolean" ||
      typeof parsed.applicantSent !== "boolean" ||
      !isUtcTimestamp_(parsed.updatedAt)
    ) {
      return { payloadTag: "invalid", adminSent: false, applicantSent: false, updatedAt: "" };
    }
    return parsed;
  } catch (_error) {
    return { payloadTag: "invalid", adminSent: false, applicantSent: false, updatedAt: "" };
  }
}

function writeLedgerState_(scriptProperties, key, state) {
  scriptProperties.setProperty(key, JSON.stringify(state));
}

function pruneLedger_(scriptProperties) {
  const allProperties = scriptProperties.getProperties();
  const now = Date.now();
  const entries = Object.keys(allProperties)
    .filter(function(key) { return key.startsWith(CONFIG.LEDGER_PREFIX); })
    .map(function(key) {
      try {
        const state = JSON.parse(allProperties[key]);
        return { key: key, updatedAt: new Date(state.updatedAt).getTime() || 0 };
      } catch (_error) {
        return { key: key, updatedAt: 0 };
      }
    })
    .sort(function(left, right) { return right.updatedAt - left.updatedAt; });

  entries.forEach(function(entry, index) {
    if (
      index >= CONFIG.MAX_LEDGER_ENTRIES ||
      now - entry.updatedAt > CONFIG.LEDGER_RETENTION_MILLISECONDS
    ) {
      scriptProperties.deleteProperty(entry.key);
    }
  });
}

function buildAdminText_(payload) {
  const lines = [
    `【氏名】${payload.fullName}`,
    `【学年】${payload.grade || "その他"}`,
    `【学籍番号】${payload.studentNumber || "—"}`,
    payload.eligibilityStatus === "approved"
      ? "【判定結果】承認"
      : "【判定結果】個別確認"
  ];
  if (payload.question) {
    lines.push(`【連絡事項】${payload.question}`);
  }
  return lines.join("\n");
}

function buildApplicantText_(payload, configured) {
  return `${payload.fullName} さん

未来戦略ライブラリへの登録申請を受け付けました。

Google Driveを開く
${configured.driveUrl}

上記URLからアクセスできます。
24時間経過してもアクセスできない場合は、公式サイトのお問い合わせフォームよりご連絡ください。
${CONFIG.CONTACT_URL}

学生支援団体 COMPASS
代表　YUTO MATSUI`;
}

function buildApplicantHtml_(payload, configured) {
  const fullName = escapeHtml_(payload.fullName);
  const driveUrl = escapeHtml_(configured.driveUrl);
  const contactUrl = escapeHtml_(CONFIG.CONTACT_URL);

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>未来戦略ライブラリ</title>
</head>
<body style="margin:0;padding:0;background:#020812;color:#0b1b2e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Kaku Gothic ProN','Yu Gothic',Meiryo,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#020812;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#f4f7f8;border:1px solid #17334a;border-radius:18px;border-collapse:separate;overflow:hidden;">
          <tr>
            <td style="height:4px;background:#66e6ef;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:30px 36px 28px;background:#071629;color:#fbfdff;">
              <p style="margin:0;font-size:17px;font-weight:700;letter-spacing:0.04em;line-height:1.6;">未来戦略ライブラリ</p>
            </td>
          </tr>
          <tr>
            <td style="padding:38px 36px 36px;background:#f4f7f8;">
              <p style="margin:0 0 26px;font-size:18px;font-weight:700;line-height:1.8;color:#0b1b2e;">${fullName} さん</p>
              <p style="margin:0 0 30px;font-size:15px;line-height:1.9;color:#30465b;">未来戦略ライブラリへの登録申請を受け付けました。</p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
                <tr>
                  <td bgcolor="#087f99" style="border-radius:10px;">
                    <a href="${driveUrl}" style="display:inline-block;padding:14px 24px;color:#ffffff;font-size:15px;font-weight:700;line-height:1.4;text-decoration:none;border-radius:10px;">Google Driveを開く</a>
                  </td>
                </tr>
              </table>

              <p style="margin:28px 0 0;font-size:14px;line-height:1.9;color:#516074;">上記URLからアクセスできます。<br>24時間経過してもアクセスできない場合は、公式サイトの<a href="${contactUrl}" style="color:#087f99;font-weight:700;text-decoration:underline;">お問い合わせフォーム</a>よりご連絡ください。</p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:34px;border-top:1px solid #cedae0;border-collapse:collapse;">
                <tr>
                  <td style="padding-top:22px;">
                    <p style="margin:0;font-size:13px;font-weight:700;line-height:1.8;color:#0b1b2e;">学生支援団体 COMPASS</p>
                    <p style="margin:2px 0 0;font-size:13px;line-height:1.8;color:#516074;">代表　YUTO MATSUI</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml_(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function jsonResponse_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
