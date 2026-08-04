/**
 * Future Strategy Library notification gateway.
 *
 * This web app is deliberately limited to MailApp. It does not read or mutate
 * Google Drive, Forms, Sheets, or the registration database. The caller must
 * first complete the server-side eligibility decision and Drive operation,
 * then submit the minimized HMAC-signed completion payload documented in the
 * deployment runbook.
 */

const CONFIG = Object.freeze({
  ADMIN_EMAIL_PROPERTY: "FSL_NOTIFICATION_ADMIN_EMAIL",
  ALLOWED_EMAIL_DOMAIN: "st.kitasato-u.ac.jp",
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
    if (
      existingState &&
      existingState.adminSent === true &&
      existingState.applicantSent === true
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
    const pendingRecipients = Number(!state.adminSent) + Number(!state.applicantSent);
    if (MailApp.getRemainingDailyQuota() < pendingRecipients) {
      return jsonResponse_({ ok: false, code: "quota" });
    }

    if (!state.adminSent) {
      MailApp.sendEmail(
        configured.adminEmail,
        "【新規承認】未来戦略ライブラリ 登録処理完了",
        buildAdminText_(request.payload),
        {
          name: CONFIG.SENDER_NAME
        }
      );
      state.adminSent = true;
      state.updatedAt = new Date().toISOString();
      writeLedgerState_(scriptProperties, ledgerKey, state);
    }

    if (!state.applicantSent) {
      MailApp.sendEmail(
        request.payload.email,
        "【未来戦略ライブラリ】登録申請を受け付けました",
        buildApplicantText_(request.payload, configured),
        {
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
  if (!isPlainObject_(raw) || !hasOnlyKeys_(raw, PAYLOAD_KEYS)) {
    return { ok: false };
  }
  if (
    !isUuid_(raw.registrationId) ||
    raw.registrationId !== raw.registrationId.toLowerCase() ||
    typeof raw.fullName !== "string" ||
    typeof raw.email !== "string" ||
    typeof raw.eligibilityStatus !== "string" ||
    typeof raw.driveAccessStatus !== "string" ||
    typeof raw.processedAt !== "string"
  ) {
    return { ok: false };
  }

  const fullName = raw.fullName.trim();
  const email = raw.email.trim().toLowerCase();
  const driveStatuses = ["granted", "already_granted"];

  if (
    fullName.length < 1 ||
    fullName.length > 200 ||
    raw.fullName !== fullName ||
    /[\u0000-\u001f\u007f]/.test(fullName) ||
    email.length > 254 ||
    raw.email !== email ||
    !isAllowedRecipient_(email) ||
    raw.eligibilityStatus !== "approved" ||
    driveStatuses.indexOf(raw.driveAccessStatus) === -1 ||
    !isUtcTimestamp_(raw.processedAt)
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    data: {
      registrationId: raw.registrationId.toLowerCase(),
      fullName: fullName,
      email: email,
      eligibilityStatus: raw.eligibilityStatus,
      driveAccessStatus: raw.driveAccessStatus,
      processedAt: raw.processedAt
    }
  };
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
  const processedAt = Utilities.formatDate(
    new Date(payload.processedAt),
    CONFIG.TIME_ZONE,
    "yyyy-MM-dd HH:mm:ss"
  );
  return `未来戦略ライブラリの登録処理が完了しました。

【判定結果】承認
【Google Drive処理】${driveStatusLabel_(payload.driveAccessStatus)}
【処理日時】${processedAt}（日本時間）
【登録ID】${payload.registrationId}

氏名、メールアドレス、申請内容の詳細は、認証済みの登録者管理画面でご確認ください。

※本メールはGoogle Apps Scriptにより自動送信されています。`;
}

function buildApplicantText_(payload, configured) {
  if (payload.driveAccessStatus === "already_granted") {
    return `${payload.fullName} 様

既に未来戦略ライブラリの利用登録は完了しております。

引き続き、以下のURLよりご利用ください。

${configured.driveUrl}

ご不明な点などございましたら、お気軽にご連絡ください。

――――――――――
大学生のための未来戦略ライブラリ
Yuto Matsui（松井 優知）
学生支援団体 COMPASS 代表
✉ ${configured.adminEmail}
――――――――――

※本メールはGoogle Apps Scriptにより自動送信されています。`;
  }

  return `${payload.fullName} 様

大学生のための未来戦略ライブラリへのお申し込みを受け付けました。

システムによる登録情報の照合の結果、利用条件を満たしていることを確認しました。
Google Drive共有フォルダの閲覧権限を付与しました。Googleから届く共有案内をご確認ください。

以下のURLからもライブラリを開くことができます。
${configured.driveUrl}

通常は数分以内にアクセス権の反映が確認できます。
24時間以上経過しても確認できない場合は、運営代表者までお問い合わせください。

今後とも、大学生のための未来戦略ライブラリをよろしくお願いいたします。

――――――――――
大学生のための未来戦略ライブラリ
Yuto Matsui（松井 優知）
学生支援団体 COMPASS 代表
✉ ${configured.adminEmail}
――――――――――

※本メールはGoogle Apps Scriptにより自動送信されています。`;
}

function driveStatusLabel_(status) {
  return status === "granted" ? "閲覧権限付与済み" : "既存の閲覧権限を確認";
}

function jsonResponse_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
