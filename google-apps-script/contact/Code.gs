const CONFIG = Object.freeze({
  ADMIN_EMAIL: "matsui.yuto@st.kitasato-u.ac.jp",
  FORM_SECRET_PROPERTY: "CONTACT_FORM_SHARED_SECRET",
  OTP_PEPPER_PROPERTY: "CONTACT_OTP_PEPPER",
  CHALLENGE_PREFIX: "CONTACT_CHALLENGE_",
  LATEST_PREFIX: "CONTACT_LATEST_",
  EMAIL_RATE_PREFIX: "CONTACT_RATE_EMAIL_",
  IP_RATE_PREFIX: "CONTACT_RATE_IP_",
  GLOBAL_RATE_PROPERTY: "CONTACT_RATE_GLOBAL",
  SUBMISSION_PREFIX: "CONTACT_SUBMISSION_",
  CHALLENGE_TTL_MS: 10 * 60 * 1000,
  CHALLENGE_RETENTION_MS: 24 * 60 * 60 * 1000,
  SUBMISSION_RETENTION_MS: 7 * 24 * 60 * 60 * 1000,
  RESEND_COOLDOWN_MS: 60 * 1000,
  EMAIL_RATE_WINDOW_MS: 15 * 60 * 1000,
  EMAIL_RATE_LIMIT: 3,
  IP_RATE_WINDOW_MS: 60 * 60 * 1000,
  IP_RATE_LIMIT: 10,
  GLOBAL_RATE_WINDOW_MS: 24 * 60 * 60 * 1000,
  GLOBAL_RATE_LIMIT: 100,
  MAX_CODE_ATTEMPTS: 5,
  MAX_BODY_BYTES: 16 * 1024,
  SENDER_NAME: "学生支援団体COMPASS",
  TIME_ZONE: "Asia/Tokyo"
});

function doGet() {
  return jsonResponse_({ ok: false, code: "method_not_allowed" });
}

function doPost(event) {
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

  let raw;
  try {
    raw = JSON.parse(contents);
  } catch (_error) {
    return jsonResponse_({ ok: false, code: "invalid_json" });
  }

  if (!raw || Object.prototype.toString.call(raw) !== "[object Object]") {
    return jsonResponse_({ ok: false, code: "validation" });
  }

  const scriptProperties = PropertiesService.getScriptProperties();
  const expectedSecret = scriptProperties.getProperty(CONFIG.FORM_SECRET_PROPERTY);
  const otpPepper = scriptProperties.getProperty(CONFIG.OTP_PEPPER_PROPERTY);
  if (!expectedSecret || expectedSecret.length < 32 || !otpPepper || otpPepper.length < 32) {
    console.error("Contact form secrets are not configured.");
    return jsonResponse_({ ok: false, code: "configuration" });
  }

  if (!constantTimeEquals_(expectedSecret, raw.sharedSecret)) {
    return jsonResponse_({ ok: false, code: "unauthorized" });
  }

  const validated = raw.action === "request_code"
    ? validateCodeRequest_(raw)
    : raw.action === "verify_code"
      ? validateVerificationRequest_(raw)
    : raw.action === "submit"
      ? validateSubmission_(raw)
      : { ok: false };

  if (!validated.ok) {
    return jsonResponse_({ ok: false, code: "validation" });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return jsonResponse_({ ok: false, code: "busy" });
  }

  try {
    const now = Date.now();
    cleanupProperties_(scriptProperties, now);

    if (validated.data.action === "request_code") {
      return requestCode_(scriptProperties, otpPepper, validated.data, now);
    }

    if (validated.data.action === "verify_code") {
      return verifyCode_(scriptProperties, otpPepper, validated.data, now);
    }

    return submitContact_(scriptProperties, otpPepper, validated.data, now);
  } catch (_error) {
    console.error(`Contact mail processing failed. requestId=${validated.data.requestId}`);
    return jsonResponse_({ ok: false, code: "email" });
  } finally {
    lock.releaseLock();
  }
}

function requestCode_(scriptProperties, otpPepper, payload, now) {
  const challengeKey = challengeKey_(payload.challengeId);
  const existingChallenge = readJsonProperty_(scriptProperties, challengeKey);
  if (existingChallenge && existingChallenge.issueRequestId === payload.requestId) {
    return jsonResponse_({
      ok: true,
      requestId: payload.requestId,
      challengeId: payload.challengeId,
      duplicate: true
    });
  }

  const emailHash = hmacHex_(otpPepper, payload.email);
  const identityHash = identityHash_(otpPepper, payload);
  const emailRateKey = `${CONFIG.EMAIL_RATE_PREFIX}${emailHash}`;
  const ipRateKey = `${CONFIG.IP_RATE_PREFIX}${payload.clientFingerprint}`;
  const emailTimestamps = readRate_(scriptProperties, emailRateKey, now - CONFIG.EMAIL_RATE_WINDOW_MS);
  const ipTimestamps = readRate_(scriptProperties, ipRateKey, now - CONFIG.IP_RATE_WINDOW_MS);
  const globalTimestamps = readRate_(
    scriptProperties,
    CONFIG.GLOBAL_RATE_PROPERTY,
    now - CONFIG.GLOBAL_RATE_WINDOW_MS
  );

  if (emailTimestamps.length && now - emailTimestamps[emailTimestamps.length - 1] < CONFIG.RESEND_COOLDOWN_MS) {
    return jsonResponse_({
      ok: false,
      code: "rate_limited",
      retryAfter: Math.ceil((CONFIG.RESEND_COOLDOWN_MS - (now - emailTimestamps[emailTimestamps.length - 1])) / 1000)
    });
  }

  if (emailTimestamps.length >= CONFIG.EMAIL_RATE_LIMIT) {
    return jsonResponse_({
      ok: false,
      code: "rate_limited",
      retryAfter: retryAfterSeconds_(emailTimestamps[0], CONFIG.EMAIL_RATE_WINDOW_MS, now)
    });
  }

  if (ipTimestamps.length >= CONFIG.IP_RATE_LIMIT) {
    return jsonResponse_({
      ok: false,
      code: "rate_limited",
      retryAfter: retryAfterSeconds_(ipTimestamps[0], CONFIG.IP_RATE_WINDOW_MS, now)
    });
  }

  if (globalTimestamps.length >= CONFIG.GLOBAL_RATE_LIMIT) {
    return jsonResponse_({
      ok: false,
      code: "rate_limited",
      retryAfter: retryAfterSeconds_(globalTimestamps[0], CONFIG.GLOBAL_RATE_WINDOW_MS, now)
    });
  }

  if (MailApp.getRemainingDailyQuota() < 1) {
    return jsonResponse_({ ok: false, code: "quota" });
  }

  const latestKey = `${CONFIG.LATEST_PREFIX}${emailHash}`;
  const previousChallengeId = scriptProperties.getProperty(latestKey);
  const challenge = {
    attempts: 0,
    codeHash: hmacHex_(otpPepper, `${payload.challengeId}\u001f${payload.email}\u001f${payload.verificationCode}`),
    createdAt: now,
    emailHash,
    expiresAt: now + CONFIG.CHALLENGE_TTL_MS,
    identityHash,
    issueRequestId: payload.requestId,
    proofHash: "",
    status: "pending",
    submissionRequestId: "",
    verificationRequestId: "",
    updatedAt: now
  };

  scriptProperties.setProperty(challengeKey, JSON.stringify(challenge));
  scriptProperties.setProperty(latestKey, payload.challengeId);

  try {
    MailApp.sendEmail(
      payload.email,
      "【COMPASS】お問い合わせ確認コード",
      buildVerificationText_(payload.name, payload.verificationCode),
      {
        name: CONFIG.SENDER_NAME,
        noReply: true
      }
    );
  } catch (error) {
    scriptProperties.deleteProperty(challengeKey);
    if (previousChallengeId) scriptProperties.setProperty(latestKey, previousChallengeId);
    else scriptProperties.deleteProperty(latestKey);
    throw error;
  }

  if (previousChallengeId && previousChallengeId !== payload.challengeId) {
    const previousKey = challengeKey_(previousChallengeId);
    const previous = readJsonProperty_(scriptProperties, previousKey);
    if (previous) {
      previous.status = "superseded";
      previous.updatedAt = now;
      scriptProperties.setProperty(previousKey, JSON.stringify(previous));
    }
  }

  writeRate_(scriptProperties, emailRateKey, emailTimestamps.concat(now), now);
  writeRate_(scriptProperties, ipRateKey, ipTimestamps.concat(now), now);
  writeRate_(scriptProperties, CONFIG.GLOBAL_RATE_PROPERTY, globalTimestamps.concat(now), now);

  return jsonResponse_({
    ok: true,
    requestId: payload.requestId,
    challengeId: payload.challengeId
  });
}

function verifyCode_(scriptProperties, otpPepper, payload, now) {
  const challengeKey = challengeKey_(payload.challengeId);
  const challenge = readJsonProperty_(scriptProperties, challengeKey);
  if (!challenge) return jsonResponse_({ ok: false, code: "verification_invalid" });

  if (now > Number(challenge.expiresAt)) {
    challenge.status = "expired";
    challenge.updatedAt = now;
    scriptProperties.setProperty(challengeKey, JSON.stringify(challenge));
    return jsonResponse_({ ok: false, code: "verification_expired" });
  }

  const submittedIdentityHash = identityHash_(otpPepper, payload);
  const submittedProofHash = hmacHex_(
    otpPepper,
    `${payload.challengeId}\u001f${payload.email}\u001f${payload.verificationProof}`
  );

  if (challenge.status === "verified" && challenge.verificationRequestId === payload.requestId) {
    if (
      constantTimeEquals_(challenge.identityHash, submittedIdentityHash) &&
      constantTimeEquals_(challenge.proofHash, submittedProofHash)
    ) {
      return jsonResponse_({
        ok: true,
        requestId: payload.requestId,
        challengeId: payload.challengeId,
        duplicate: true
      });
    }
    return jsonResponse_({ ok: false, code: "verification_used" });
  }

  if (challenge.status !== "pending") {
    return jsonResponse_({ ok: false, code: "verification_used" });
  }

  if (!constantTimeEquals_(challenge.identityHash, submittedIdentityHash)) {
    return recordInvalidAttempt_(scriptProperties, challengeKey, challenge, now);
  }

  const submittedCodeHash = hmacHex_(
    otpPepper,
    `${payload.challengeId}\u001f${payload.email}\u001f${payload.verificationCode}`
  );
  if (!constantTimeEquals_(challenge.codeHash, submittedCodeHash)) {
    return recordInvalidAttempt_(scriptProperties, challengeKey, challenge, now);
  }

  challenge.proofHash = submittedProofHash;
  challenge.status = "verified";
  challenge.updatedAt = now;
  challenge.verificationRequestId = payload.requestId;
  scriptProperties.setProperty(challengeKey, JSON.stringify(challenge));

  return jsonResponse_({
    ok: true,
    requestId: payload.requestId,
    challengeId: payload.challengeId
  });
}

function submitContact_(scriptProperties, otpPepper, payload, now) {
  const submissionKey = `${CONFIG.SUBMISSION_PREFIX}${payload.requestId}`;
  const existingSubmission = readJsonProperty_(scriptProperties, submissionKey);
  if (existingSubmission && existingSubmission.completed) {
    return jsonResponse_({ ok: true, requestId: payload.requestId, duplicate: true });
  }

  const challengeKey = challengeKey_(payload.challengeId);
  const challenge = readJsonProperty_(scriptProperties, challengeKey);
  if (!challenge) return jsonResponse_({ ok: false, code: "verification_invalid" });

  if (now > Number(challenge.expiresAt)) {
    challenge.status = "expired";
    challenge.updatedAt = now;
    scriptProperties.setProperty(challengeKey, JSON.stringify(challenge));
    return jsonResponse_({ ok: false, code: "verification_expired" });
  }

  if (challenge.status !== "verified" && challenge.status !== "processing") {
    return jsonResponse_({ ok: false, code: "verification_used" });
  }

  if (!constantTimeEquals_(challenge.identityHash, identityHash_(otpPepper, payload))) {
    return jsonResponse_({ ok: false, code: "verification_used" });
  }

  if (challenge.submissionRequestId && challenge.submissionRequestId !== payload.requestId) {
    return jsonResponse_({ ok: false, code: "verification_used" });
  }

  const submittedProofHash = hmacHex_(
    otpPepper,
    `${payload.challengeId}\u001f${payload.email}\u001f${payload.verificationProof}`
  );
  if (!constantTimeEquals_(challenge.proofHash, submittedProofHash)) {
    return jsonResponse_({ ok: false, code: "verification_used" });
  }

  challenge.status = "processing";
  challenge.submissionRequestId = payload.requestId;
  challenge.updatedAt = now;
  scriptProperties.setProperty(challengeKey, JSON.stringify(challenge));

  const state = existingSubmission || {
    applicantSent: false,
    challengeId: payload.challengeId,
    completed: false,
    operatorSent: false,
    updatedAt: now
  };
  if (state.challengeId !== payload.challengeId) {
    return jsonResponse_({ ok: false, code: "verification_used" });
  }

  const pendingRecipients = Number(!state.operatorSent) + Number(!state.applicantSent);
  if (MailApp.getRemainingDailyQuota() < pendingRecipients) {
    return jsonResponse_({ ok: false, code: "quota" });
  }

  if (!state.operatorSent) {
    MailApp.sendEmail(
      CONFIG.ADMIN_EMAIL,
      "【COMPASS】お問い合わせ",
      buildOperatorText_(payload),
      {
        name: CONFIG.SENDER_NAME,
        replyTo: payload.email
      }
    );
    state.operatorSent = true;
    state.updatedAt = Date.now();
    scriptProperties.setProperty(submissionKey, JSON.stringify(state));
  }

  if (!state.applicantSent) {
    MailApp.sendEmail(
      payload.email,
      "【COMPASS】お問い合わせを受け付けました",
      buildApplicantText_(payload),
      {
        name: CONFIG.SENDER_NAME,
        replyTo: CONFIG.ADMIN_EMAIL
      }
    );
    state.applicantSent = true;
    state.updatedAt = Date.now();
    scriptProperties.setProperty(submissionKey, JSON.stringify(state));
  }

  state.completed = true;
  state.updatedAt = Date.now();
  challenge.status = "used";
  challenge.updatedAt = state.updatedAt;
  scriptProperties.setProperty(submissionKey, JSON.stringify(state));
  scriptProperties.setProperty(challengeKey, JSON.stringify(challenge));

  return jsonResponse_({ ok: true, requestId: payload.requestId });
}

function recordInvalidAttempt_(scriptProperties, challengeKey, challenge, now) {
  challenge.attempts = Number(challenge.attempts || 0) + 1;
  challenge.updatedAt = now;
  if (challenge.attempts >= CONFIG.MAX_CODE_ATTEMPTS) challenge.status = "locked";
  scriptProperties.setProperty(challengeKey, JSON.stringify(challenge));
  return jsonResponse_({ ok: false, code: "verification_invalid" });
}

function validateCodeRequest_(raw) {
  const allowedKeys = [
    "action",
    "affiliation",
    "challengeId",
    "clientFingerprint",
    "email",
    "name",
    "receivedAt",
    "requestId",
    "sharedSecret",
    "verificationCode"
  ];
  if (Object.keys(raw).some((key) => allowedKeys.indexOf(key) === -1)) return { ok: false };

  const identity = validateIdentity_(raw);
  if (!identity.ok) return { ok: false };
  if (!isUuid_(raw.challengeId) || raw.challengeId.toLowerCase() !== identity.data.requestId) return { ok: false };
  if (typeof raw.verificationCode !== "string" || !/^\d{6}$/.test(raw.verificationCode)) return { ok: false };
  if (typeof raw.clientFingerprint !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(raw.clientFingerprint)) return { ok: false };

  return {
    ok: true,
    data: {
      action: "request_code",
      affiliation: identity.data.affiliation,
      challengeId: raw.challengeId.toLowerCase(),
      clientFingerprint: raw.clientFingerprint,
      email: identity.data.email,
      name: identity.data.name,
      receivedAt: identity.data.receivedAt,
      requestId: identity.data.requestId,
      verificationCode: raw.verificationCode
    }
  };
}

function validateVerificationRequest_(raw) {
  const allowedKeys = [
    "action",
    "affiliation",
    "challengeId",
    "email",
    "name",
    "receivedAt",
    "requestId",
    "sharedSecret",
    "verificationCode",
    "verificationProof"
  ];
  if (Object.keys(raw).some((key) => allowedKeys.indexOf(key) === -1)) return { ok: false };

  const identity = validateIdentity_(raw);
  if (!identity.ok) return { ok: false };
  if (!isUuid_(raw.challengeId)) return { ok: false };
  if (typeof raw.verificationCode !== "string" || !/^\d{6}$/.test(raw.verificationCode)) return { ok: false };
  if (typeof raw.verificationProof !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(raw.verificationProof)) {
    return { ok: false };
  }

  return {
    ok: true,
    data: {
      action: "verify_code",
      affiliation: identity.data.affiliation,
      challengeId: raw.challengeId.toLowerCase(),
      email: identity.data.email,
      name: identity.data.name,
      receivedAt: identity.data.receivedAt,
      requestId: identity.data.requestId,
      verificationCode: raw.verificationCode,
      verificationProof: raw.verificationProof
    }
  };
}

function validateSubmission_(raw) {
  const allowedKeys = [
    "action",
    "affiliation",
    "challengeId",
    "details",
    "email",
    "name",
    "receivedAt",
    "requestId",
    "sharedSecret",
    "verificationProof"
  ];
  if (Object.keys(raw).some((key) => allowedKeys.indexOf(key) === -1)) return { ok: false };

  const identity = validateIdentity_(raw);
  if (!identity.ok) return { ok: false };
  if (!isUuid_(raw.challengeId)) return { ok: false };
  if (typeof raw.verificationProof !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(raw.verificationProof)) {
    return { ok: false };
  }
  if (typeof raw.details !== "string") return { ok: false };

  const details = raw.details.trim();
  if (details.length < 10 || details.length > 1000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(details)) {
    return { ok: false };
  }

  return {
    ok: true,
    data: {
      action: "submit",
      affiliation: identity.data.affiliation,
      challengeId: raw.challengeId.toLowerCase(),
      details,
      email: identity.data.email,
      name: identity.data.name,
      receivedAt: identity.data.receivedAt,
      requestId: identity.data.requestId,
      verificationProof: raw.verificationProof
    }
  };
}

function validateIdentity_(raw) {
  if (
    typeof raw.name !== "string" ||
    typeof raw.affiliation !== "string" ||
    typeof raw.email !== "string" ||
    typeof raw.requestId !== "string" ||
    typeof raw.receivedAt !== "string"
  ) return { ok: false };

  const name = raw.name.trim();
  const affiliation = raw.affiliation.trim();
  const email = raw.email.trim().toLowerCase();
  if (name.length < 2 || name.length > 20 || /[\u0000-\u001F\u007F]/.test(name)) return { ok: false };
  if (affiliation.length < 2 || affiliation.length > 20 || /[\u0000-\u001F\u007F]/.test(affiliation)) return { ok: false };
  if (email.length < 5 || email.length > 50 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false };
  if (!isUuid_(raw.requestId)) return { ok: false };

  const receivedDate = new Date(raw.receivedAt);
  if (Number.isNaN(receivedDate.getTime())) return { ok: false };

  return {
    ok: true,
    data: {
      affiliation,
      email,
      name,
      receivedAt: receivedDate.toISOString(),
      requestId: raw.requestId.toLowerCase()
    }
  };
}

function buildVerificationText_(name, verificationCode) {
  return `${name} さん

COMPASSお問い合わせフォームの確認コードは、以下の6桁です。

${verificationCode}

確認コードの有効期限は10分です。
本メールにお心当たりがない場合は、破棄してください。

※本メールはGoogle Apps Scriptにより自動送信されています。

――――――――――――――――
学生支援団体COMPASS
公式サイト
https://compass-official.pages.dev/
――――――――――――――――`;
}

function buildOperatorText_(payload) {
  const receivedAt = Utilities.formatDate(
    new Date(payload.receivedAt),
    CONFIG.TIME_ZONE,
    "yyyy-MM-dd HH:mm:ss"
  );

  return `COMPASSへのお問い合わせがありました。

・お名前：${payload.name}
・学部・学科 / 所属：${payload.affiliation}
・メールアドレス（所有確認済み）：${payload.email}
・お問い合わせ内容：
${payload.details}

・受付日時：${receivedAt}（日本時間）
・受付ID：${payload.requestId}

※本メールはGoogle Apps Scriptにより自動送信されています。`;
}

function buildApplicantText_(payload) {
  return `${payload.name} さん

COMPASSへお問い合わせいただき、ありがとうございます。

以下の内容でお問い合わせを受け付けました。
内容を確認のうえ、COMPASSよりご登録のメールアドレス宛にご連絡いたします。

【お問い合わせ内容】
${payload.details}

※本メールはGoogle Apps Scriptにより自動送信されています。

【本メールにお心当たりのない方へ】
大変お手数ですが、本メールへの返信にてご連絡ください。

――――――――――――――――
学生支援団体COMPASS
代表　Yuto Matsui

公式サイト
https://compass-official.pages.dev/
――――――――――――――――`;
}

function identityHash_(otpPepper, payload) {
  return hmacHex_(otpPepper, `${payload.name}\u001f${payload.affiliation}\u001f${payload.email}`);
}

function hmacHex_(secret, value) {
  return Utilities
    .computeHmacSha256Signature(value, secret, Utilities.Charset.UTF_8)
    .map((byte) => (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, "0"))
    .join("");
}

function challengeKey_(challengeId) {
  return `${CONFIG.CHALLENGE_PREFIX}${challengeId}`;
}

function readJsonProperty_(scriptProperties, key) {
  const raw = scriptProperties.getProperty(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && Object.prototype.toString.call(parsed) === "[object Object]" ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function readRate_(scriptProperties, key, cutoff) {
  const record = readJsonProperty_(scriptProperties, key);
  if (!record || !Array.isArray(record.timestamps)) return [];
  return record.timestamps
    .filter((value) => Number.isFinite(value) && value >= cutoff)
    .sort((left, right) => left - right);
}

function writeRate_(scriptProperties, key, timestamps, now) {
  scriptProperties.setProperty(key, JSON.stringify({ timestamps, updatedAt: now }));
}

function retryAfterSeconds_(oldestTimestamp, windowMs, now) {
  return Math.max(1, Math.ceil((oldestTimestamp + windowMs - now) / 1000));
}

function cleanupProperties_(scriptProperties, now) {
  const properties = scriptProperties.getProperties();

  Object.keys(properties).forEach((key) => {
    if (key.startsWith(CONFIG.CHALLENGE_PREFIX)) {
      const record = readJsonProperty_(scriptProperties, key);
      if (!record || Number(record.expiresAt || 0) + CONFIG.CHALLENGE_RETENTION_MS < now) {
        scriptProperties.deleteProperty(key);
      }
      return;
    }

    if (key.startsWith(CONFIG.SUBMISSION_PREFIX)) {
      const record = readJsonProperty_(scriptProperties, key);
      if (!record || Number(record.updatedAt || 0) + CONFIG.SUBMISSION_RETENTION_MS < now) {
        scriptProperties.deleteProperty(key);
      }
      return;
    }

    if (key.startsWith(CONFIG.EMAIL_RATE_PREFIX) || key.startsWith(CONFIG.IP_RATE_PREFIX)) {
      const record = readJsonProperty_(scriptProperties, key);
      if (!record || Number(record.updatedAt || 0) + CONFIG.IP_RATE_WINDOW_MS < now) {
        scriptProperties.deleteProperty(key);
      }
      return;
    }

    if (key === CONFIG.GLOBAL_RATE_PROPERTY) {
      const record = readJsonProperty_(scriptProperties, key);
      if (!record || Number(record.updatedAt || 0) + CONFIG.GLOBAL_RATE_WINDOW_MS < now) {
        scriptProperties.deleteProperty(key);
      }
      return;
    }

    if (key.startsWith(CONFIG.LATEST_PREFIX)) {
      const challengeId = properties[key];
      if (!properties[challengeKey_(challengeId)]) scriptProperties.deleteProperty(key);
    }
  });
}

function isUuid_(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function constantTimeEquals_(expected, actual) {
  if (typeof expected !== "string" || typeof actual !== "string") return false;
  if (expected.length !== actual.length) return false;

  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  }
  return difference === 0;
}

function jsonResponse_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
