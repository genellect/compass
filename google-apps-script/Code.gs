const CONFIG = Object.freeze({
  ADMIN_EMAIL: "matsui.yuto@st.kitasato-u.ac.jp",
  FORM_SECRET_PROPERTY: "FORM_SHARED_SECRET",
  IDEMPOTENCY_PROPERTY: "COMMUNITY_REGISTRATION_IDEMPOTENCY",
  MAX_BODY_BYTES: 16 * 1024,
  MAX_TRACKED_REQUESTS: 50,
  SENDER_NAME: "学生支援団体COMPASS",
  TIME_ZONE: "Asia/Tokyo",
  YEARS: Object.freeze(["1年", "2年", "3年", "4年", "5・6年", "大学院生"]),
  INTERESTS: Object.freeze([
    "イベント企画",
    "SNS発信",
    "デザイン",
    "カメラマン",
    "動画編集",
    "Web開発",
    "本格的なアプリ開発",
    "AIの使い方",
    "深層学習・AIエージェント",
    "まずは話を聞いてみたい"
  ])
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

  const scriptProperties = PropertiesService.getScriptProperties();
  const expectedSecret = scriptProperties.getProperty(CONFIG.FORM_SECRET_PROPERTY);
  if (!expectedSecret || expectedSecret.length < 32) {
    console.error("Community registration secret is not configured.");
    return jsonResponse_({ ok: false, code: "configuration" });
  }

  if (!constantTimeEquals_(expectedSecret, raw && raw.sharedSecret)) {
    return jsonResponse_({ ok: false, code: "unauthorized" });
  }

  const validated = validateRegistration_(raw);
  if (!validated.ok) {
    return jsonResponse_({ ok: false, code: "validation" });
  }

  const payload = validated.data;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return jsonResponse_({ ok: false, code: "busy" });
  }

  try {
    const ledger = readLedger_(scriptProperties);
    const state = ledger[payload.requestId] || {
      applicantSent: false,
      operatorSent: false,
      updatedAt: ""
    };

    const pendingRecipients = Number(!state.operatorSent) + Number(!state.applicantSent);
    if (pendingRecipients === 0) {
      return jsonResponse_({ ok: true, requestId: payload.requestId, duplicate: true });
    }

    if (MailApp.getRemainingDailyQuota() < pendingRecipients) {
      console.error(`Community registration mail quota is insufficient. requestId=${payload.requestId}`);
      return jsonResponse_({ ok: false, code: "quota" });
    }

    if (!state.operatorSent) {
      MailApp.sendEmail(
        CONFIG.ADMIN_EMAIL,
        "【COMPASS】Community登録申請",
        buildOperatorText_(payload),
        {
          name: CONFIG.SENDER_NAME,
          replyTo: payload.email
        }
      );
      state.operatorSent = true;
      state.updatedAt = new Date().toISOString();
      saveLedgerState_(scriptProperties, ledger, payload.requestId, state);
    }

    if (!state.applicantSent) {
      MailApp.sendEmail(
        payload.email,
        "【COMPASS】コミュニティ参加フォームを受け付けました",
        buildApplicantText_(payload),
        {
          name: CONFIG.SENDER_NAME,
          replyTo: CONFIG.ADMIN_EMAIL
        }
      );
      state.applicantSent = true;
      state.updatedAt = new Date().toISOString();
      saveLedgerState_(scriptProperties, ledger, payload.requestId, state);
    }

    return jsonResponse_({ ok: true, requestId: payload.requestId });
  } catch (_error) {
    console.error(`Community registration email delivery failed. requestId=${payload.requestId}`);
    return jsonResponse_({ ok: false, code: "email" });
  } finally {
    lock.releaseLock();
  }
}

function validateRegistration_(raw) {
  if (!raw || Object.prototype.toString.call(raw) !== "[object Object]") {
    return { ok: false };
  }

  const allowedKeys = [
    "sharedSecret",
    "requestId",
    "receivedAt",
    "name",
    "email",
    "facultyDepartment",
    "studentId",
    "year",
    "interests",
    "motivation"
  ];
  if (Object.keys(raw).some((key) => allowedKeys.indexOf(key) === -1)) {
    return { ok: false };
  }

  if (
    typeof raw.name !== "string" ||
    typeof raw.email !== "string" ||
    typeof raw.facultyDepartment !== "string" ||
    typeof raw.studentId !== "string" ||
    typeof raw.year !== "string" ||
    !Array.isArray(raw.interests) ||
    typeof raw.motivation !== "string" ||
    typeof raw.requestId !== "string" ||
    typeof raw.receivedAt !== "string"
  ) {
    return { ok: false };
  }

  const name = raw.name.trim();
  const email = raw.email.trim().toLowerCase();
  const facultyDepartment = raw.facultyDepartment.trim();
  const studentId = raw.studentId.trim().toUpperCase();
  const year = raw.year.trim();
  const motivation = raw.motivation.trim();
  const interests = raw.interests.map((item) => typeof item === "string" ? item.trim() : "");

  if (name.length < 2 || name.length > 20) return { ok: false };
  if (email.length > 254 || !/^[^\s@]+@st\.kitasato-u\.ac\.jp$/.test(email)) return { ok: false };
  if (facultyDepartment.length < 5 || facultyDepartment.length > 30) return { ok: false };
  if (!/^[A-Z]{2}\d{5,6}$/.test(studentId)) return { ok: false };
  if (CONFIG.YEARS.indexOf(year) === -1) return { ok: false };
  if (interests.length < 1 || interests.length > CONFIG.INTERESTS.length) return { ok: false };
  if (interests.some((item) => CONFIG.INTERESTS.indexOf(item) === -1)) return { ok: false };
  if (new Set(interests).size !== interests.length) return { ok: false };
  if (motivation.length > 1000) return { ok: false };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.requestId)) {
    return { ok: false };
  }

  const receivedDate = new Date(raw.receivedAt);
  if (Number.isNaN(receivedDate.getTime())) return { ok: false };

  return {
    ok: true,
    data: {
      requestId: raw.requestId.toLowerCase(),
      receivedAt: receivedDate.toISOString(),
      name,
      email,
      facultyDepartment,
      studentId,
      year,
      interests,
      motivation
    }
  };
}

function buildOperatorText_(payload) {
  const interests = payload.interests.map((interest) => `  ・${interest}`).join("\n");
  const motivation = payload.motivation || "（記入なし）";
  const receivedAt = Utilities.formatDate(
    new Date(payload.receivedAt),
    CONFIG.TIME_ZONE,
    "yyyy-MM-dd HH:mm:ss"
  );

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

・受付日時：${receivedAt}（日本時間）
・受付ID：${payload.requestId}

※本メールはGoogle Apps Scriptにより自動送信されています。`;
}

function buildApplicantText_(payload) {
  return `${payload.name} さん

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
――――――――――――――――`;
}

function readLedger_(scriptProperties) {
  const raw = scriptProperties.getProperty(CONFIG.IDEMPOTENCY_PROPERTY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed && Object.prototype.toString.call(parsed) === "[object Object]" ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function saveLedgerState_(scriptProperties, ledger, requestId, state) {
  ledger[requestId] = state;

  const trimmedLedger = {};
  Object.keys(ledger)
    .sort((left, right) => String(ledger[right].updatedAt).localeCompare(String(ledger[left].updatedAt)))
    .slice(0, CONFIG.MAX_TRACKED_REQUESTS)
    .forEach((key) => {
      trimmedLedger[key] = ledger[key];
    });

  scriptProperties.setProperty(CONFIG.IDEMPOTENCY_PROPERTY, JSON.stringify(trimmedLedger));
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
