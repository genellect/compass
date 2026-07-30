import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "out");

function expectIncludes(html, expected, label) {
  if (!html.includes(expected)) throw new Error(`${label} is missing: ${expected}`);
}

function expectExcludes(html, unexpected, label) {
  if (html.includes(unexpected)) throw new Error(`${label} still contains: ${unexpected}`);
}

function expectOneH1(html, label) {
  const count = (html.match(/<h1\b/gi) ?? []).length;
  if (count !== 1) throw new Error(`${label} must contain exactly one h1; found ${count}.`);
}

async function fileMap(directory) {
  const result = new Map();

  async function visit(current, relative = "") {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      const nextRelative = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) await visit(absolute, nextRelative);
      if (entry.isFile()) {
        const bytes = await readFile(absolute);
        result.set(nextRelative, createHash("sha256").update(bytes).digest("hex"));
      }
    }
  }

  await visit(directory);
  return result;
}

function expectSameMap(label, expected, actual) {
  const keys = new Set([...expected.keys(), ...actual.keys()]);
  const differences = [...keys].filter((key) => expected.get(key) !== actual.get(key));
  if (differences.length) throw new Error(`${label} changed: ${differences.slice(0, 10).join(", ")}`);
}

const official = await readFile(path.join(out, "index.html"), "utf8");
const interactive = await readFile(path.join(out, "INTRO_Interactive", "index.html"), "utf8");
const communityJoin = await readFile(path.join(out, "community", "join", "index.html"), "utf8");
const contact = await readFile(path.join(out, "contact", "index.html"), "utf8");
const messages = await readFile(path.join(out, "messages", "index.html"), "utf8");
const registrationFunction = await readFile(path.join(root, "functions", "api", "community-registration.ts"), "utf8");
const gasCode = await readFile(path.join(root, "google-apps-script", "Code.gs"), "utf8");
const contactFunction = await readFile(path.join(root, "functions", "api", "contact.ts"), "utf8");
const contactGasCode = await readFile(path.join(root, "google-apps-script", "contact", "Code.gs"), "utf8");
const contactFormSource = await readFile(
  path.join(root, "src", "app", "(official)", "contact", "ContactForm.tsx"),
  "utf8"
);
const contactStyles = await readFile(
  path.join(root, "src", "app", "(official)", "contact", "contact.module.css"),
  "utf8"
);
const siteHeaderSource = await readFile(path.join(root, "src", "components", "SiteHeader.tsx"), "utf8");

for (const expected of [
  '<html lang="ja"',
  "Better Education.",
  "Better Decisions.",
  'id="vision"',
  'id="experience"',
  'id="technology"',
  'id="resources"',
  'id="founder"',
  'id="community"',
  'id="contact"',
  'href="messages/index.html"',
  'href="INTRO_Interactive/"',
  'href="/community/join/"',
  'href="/contact/"',
  'href="https://forms.gle/sW49M329Dcets8ga9"',
  'rel="canonical" href="https://compass-official.pages.dev/"',
  'type="application/ld+json"',
  'class="v4-vision-line"',
  'class="v4-technology__interactive"',
  "次の1歩は、",
  "ここから始まる。",
  "わからないが、",
  "動き出す。",
  "あなたが飲み込んだその疑問を、誰かも同じように抱えているかもしれない。",
  "未来の講義を、いま体験。",
  "ひとりでは見えない、",
  "新しい場所へ。",
  "今すぐ使えて、数年後の選択にも効いてくる。",
  "未来戦略ライブラリは、学生生活の「次に知りたい」を、一つの場所につなぎます。",
  "まだ知らない世界を見る",
  "北里大学薬学部生対象",
  "薬学部生以外の方はこちら",
  "Community / 運営メンバー募集",
  'class="v4-community__details"',
  "続きを読む",
  "面白い大学生活は、",
  "待っていても始まらない。",
  "ふと思いついた企画を、休み時間に誰かと話してみる。",
  "COMPASSは、白金キャンパスを拠点に、学生の「やってみたい」を、仲間と形にするコミュニティです。",
  "完全な初心者からでも大丈夫です。",
  "大学生活に、予定されていなかった挑戦と出会いを。",
  "面白そうなので、",
  "始めました。",
  "About COMPASS",
  "COMPASS Essentials",
  "お問い合わせフォーム",
  "Web開発・プログラミング 4年",
  "/images/founder/yuto-matsui-portrait-800.jpg",
  "学生主導の教育・テクノロジープラットフォーム",
  "G-EHKJ8B8N0Y"
]) expectIncludes(official, expected, "Official page");

expectExcludes(
  official,
  "https://docs.google.com/forms/u/1/d/e/1FAIpQLSe8Z0GkK9lmXKutLWO8lGezBoP5zPstNlkAnUEqVOx_IY7v7g/viewform",
  "Official page"
);
expectExcludes(
  official,
  "https://docs.google.com/forms/d/e/1FAIpQLSehSdW10_HOjAigq_42AzooHtiV1P8AvI_1tWu5D3DaR2QxJQ/viewform?usp=publish-editor",
  "Official contact link"
);

for (const unexpected of [
  "β版",
  "E2E",
  "フロントエンド",
  "バックエンド",
  "フルスタック",
  "Developer Portfolio",
  "Collaboration",
  "For Faculty",
  'id="products"',
  'id="workshops"',
  "Products & Validation / 実装と検証",
  "構想を、",
  "Workshops / 実際に試す",
  "興味が、",
  "体験に変わる場所。",
  "QUESTION",
  "RESPONSE",
  "NEXT",
  "DESIGN PRINCIPLES / 設計方針",
  "現在の公開・試験状況",
  "約20名・複数端末で一連の講義操作を確認",
  "学生用・教員用・会場表示の画面を用意",
  "3分で試せる公開デモ",
  "COMPASSの運営システム",
  "登録・案内・利用権限を、",
  "知らなかった選択肢に出会う。",
  "疑問を言葉にする。",
  "自分の手で試してみる。",
  "その一つひとつが、未来を選ぶ力になります。",
  "知る。試す。つくる。",
  "資料が届く。疑問を送れる。理解を確かめられる。講義のあとも振り返れる。",
  "未来を体験する",
  "教室にいる全員の疑問が、次の説明を動かす。",
  "COMPASS Interactiveは、一方向だった講義を、学生の反応によって変化する体験へ変えます。",
  "まだ知らない未来を見る",
  "目の前で使える情報から、",
  "これからの選択を有利にする知識まで。",
  "知らないまま進む前に、一度ここを見てください。",
  "講義はもう、聞くだけじゃない。",
  'class="v4-community__lead"',
  'class="v4-community__support"',
  'class="v4-community__invitation"',
  "イベントも、デザインも、映像も、Webサービスも。"
]) expectExcludes(official, unexpected, "Official page");

const visionLineCount = (official.match(/class="v4-vision-line"/g) ?? []).length;
if (visionLineCount !== 2) throw new Error(`Official page must contain exactly two Vision lines; found ${visionLineCount}.`);

const interactiveCard = official.match(/<article class="v4-technology__interactive"[\s\S]*?<\/article>/)?.[0];
if (!interactiveCard) throw new Error("Official page is missing the Interactive card.");
expectIncludes(interactiveCard, "未来の講義を、いま体験。", "Interactive card");
expectIncludes(interactiveCard, 'href="/INTRO_Interactive/"', "Interactive card");

const communitySection = official.match(/<section id="community"[\s\S]*?<\/section>/)?.[0];
if (!communitySection) throw new Error("Official page is missing the Community section.");
expectIncludes(communitySection, '<details class="v4-community__details">', "Community section");
expectIncludes(communitySection, "続きを読む", "Community section");
expectIncludes(communitySection, "SNSでの情報発信", "Community section");
if (/<details class="v4-community__details"\s+open/.test(communitySection)) {
  throw new Error("Community details must be closed by default.");
}

const resourcesCard = official.match(/<article class="v4-experience-card v4-experience-card--resources"[\s\S]*?<\/article>/)?.[0];
if (!resourcesCard) throw new Error("Official page is missing the Resources experience card.");
expectIncludes(resourcesCard, "ライブラリを見る", "Resources experience card");
expectIncludes(resourcesCard, 'href="https://compass-official.pages.dev/future-strategy-library/"', "Resources experience card");

for (const expected of [
  '<html lang="ja"',
  'id="main"',
  'id="top"',
  'id="students"',
  'id="features"',
  'id="ai-support"',
  'id="teachers"',
  'id="developers"',
  "わからないが、動き出す。",
  "未来の講義を、いま体験。",
  'rel="canonical" href="https://compass-official.pages.dev/INTRO_Interactive/"',
  "G-7VT6Z59NE0"
]) expectIncludes(interactive, expected, "Interactive page");

if (interactive.includes('<div id="root"></div>')) {
  throw new Error("Interactive page regressed to an empty client-rendered shell.");
}

expectOneH1(official, "Official page");
expectOneH1(interactive, "Interactive page");

for (const expected of [
  '<html lang="ja"',
  "COMPASS Communityに参加する",
  "必要事項をご入力ください。",
  "氏名",
  "学生メールアドレス",
  "学部・学科",
  "学籍番号",
  "やってみたい活動",
  "デザイン",
  "カメラマン",
  "Web開発",
  "AIの使い方",
  "深層学習・AIエージェント",
  "大学院生",
  "興味を持った理由や、やってみたいことがあればご記入ください",
  "参加を申し込む",
  'rel="canonical" href="https://compass-official.pages.dev/community/join/"',
  'content="noindex, follow"'
]) expectIncludes(communityJoin, expected, "Community registration page");

for (const unexpected of [
  "興味を、",
  "フォームを入力",
  "所要時間 約3分",
  "北里大学の学生が対象です",
  "APPLICATION FORM",
  "sample@st.kitasato-u.ac.jp",
  "自由にご記入ください",
  "私はロボットではありません",
  "For testing only."
]) expectExcludes(communityJoin, unexpected, "Community registration page");

expectOneH1(communityJoin, "Community registration page");

for (const expected of [
  '<html lang="ja"',
  "COMPASS お問い合わせフォーム",
  "Webサイト、イベント、講演、共同企画、取材、共同開発など、COMPASSに関するお問い合わせを受け付けています。",
  "学生・教職員・団体・企業の方など、どなたでもお気軽にお問い合わせください。",
  "お名前",
  "学部・学科 / 所属",
  "メールアドレス",
  "メールアドレスの確認",
  "お問い合わせ内容",
  "確認コードを送信",
  "お問い合わせを送信",
  'minLength="2"',
  'maxLength="20"',
  'minLength="5"',
  'maxLength="50"',
  'minLength="10"',
  'maxLength="1000"',
  'rel="canonical" href="https://compass-official.pages.dev/contact/"',
  'content="noindex, follow"'
]) expectIncludes(contact, expected, "Contact page");

for (const expected of [
  "メールアドレスを確認",
  "メールアドレスの確認が完了しました。",
  'action: "verify_code"',
  "verificationProof"
]) expectIncludes(contactFormSource, expected, "Contact form source");

for (const unexpected of [
  "@st.kitasato-u.ac.jp",
  "sample@",
  "Googleフォーム",
  "For testing only."
]) expectExcludes(contact, unexpected, "Contact page");

expectOneH1(contact, "Contact page");

for (const expected of [
  'activeId: "contact"',
  'href: "/contact/"',
  'mobileLabel: "お問い合わせ"'
]) expectIncludes(siteHeaderSource, expected, "Official header source");
expectExcludes(siteHeaderSource, 'mobileLabel: "お問い合わせフォーム"', "Official header source");
expectIncludes(
  contactStyles,
  ".helper {\n  margin: 7px 0 11px;\n  color: var(--copy);",
  "Contact helper contrast"
);

expectIncludes(
  messages,
  '<a href="/community/join/" target="_blank" rel="noopener noreferrer">コミュニティに参加する</a>',
  "Messages community link"
);
expectExcludes(
  messages,
  "https://docs.google.com/forms/u/1/d/e/1FAIpQLSe8Z0GkK9lmXKutLWO8lGezBoP5zPstNlkAnUEqVOx_IY7v7g/viewform",
  "Messages community link"
);

for (const expected of [
  "GOOGLE_APPS_SCRIPT_URL",
  "GOOGLE_APPS_SCRIPT_SECRET",
  "TURNSTILE_SECRET_KEY",
  "script.google.com",
  "sharedSecret"
]) expectIncludes(registrationFunction, expected, "Community registration Pages Function");

for (const expected of [
  'ADMIN_EMAIL: "matsui.yuto@st.kitasato-u.ac.jp"',
  'FORM_SECRET_PROPERTY: "FORM_SHARED_SECRET"',
  "COMPASS Communityの登録申請がありました。",
  "コミュニティ参加フォームへのご登録を受け付けました。",
  "MailApp.sendEmail",
  "validateRegistration_",
  "constantTimeEquals_"
]) expectIncludes(gasCode, expected, "Community registration GAS code");

for (const unexpected of ["RESEND_API_KEY", "REGISTRATION_FROM_EMAIL", "api.resend.com"]) {
  expectExcludes(registrationFunction, unexpected, "Community registration Pages Function");
  expectExcludes(gasCode, unexpected, "Community registration GAS code");
}

for (const expected of [
  "CONTACT_GOOGLE_APPS_SCRIPT_URL",
  "CONTACT_GOOGLE_APPS_SCRIPT_SECRET",
  "CONTACT_RATE_LIMIT_SECRET",
  "CONTACT_TURNSTILE_SECRET_KEY",
  "CONTACT_TURNSTILE_ACTION",
  "clientFingerprint",
  "generateVerificationCode",
  "verificationProof",
  "verify_code",
  "script.google.com"
]) expectIncludes(contactFunction, expected, "Contact Pages Function");

for (const expected of [
  'FORM_SECRET_PROPERTY: "CONTACT_FORM_SHARED_SECRET"',
  'OTP_PEPPER_PROPERTY: "CONTACT_OTP_PEPPER"',
  "MAX_CODE_ATTEMPTS: 5",
  "RESEND_COOLDOWN_MS: 60 * 1000",
  "EMAIL_RATE_LIMIT: 3",
  "IP_RATE_LIMIT: 10",
  "GLOBAL_RATE_LIMIT: 100",
  "computeHmacSha256Signature",
  "verifyCode_",
  "MailApp.sendEmail",
  "COMPASSへのお問い合わせがありました。",
  "お問い合わせを受け付けました",
  "※本メールはGoogle Apps Scriptにより自動送信されています。"
]) expectIncludes(contactGasCode, expected, "Contact GAS code");

for (const unexpected of ['FORM_SECRET_PROPERTY: "FORM_SHARED_SECRET"', "COMMUNITY_REGISTRATION_IDEMPOTENCY", "@st.kitasato-u.ac.jp$"]) {
  expectExcludes(contactFunction, unexpected, "Contact Pages Function");
  expectExcludes(contactGasCode, unexpected, "Contact GAS code");
}

for (const relative of [
  "messages/index.html",
  "future-strategy-library/index.html",
  "images/compass-mark.svg",
  "_routes.json",
  "_headers",
  "_redirects",
  "robots.txt",
  "sitemap.xml"
]) await access(path.join(out, relative));

for (const directory of ["messages", "future-strategy-library"]) {
  const source = await fileMap(path.join(root, directory));
  const built = await fileMap(path.join(out, directory));
  expectSameMap(directory, source, built);
  console.log(`${directory}: ${source.size} files preserved byte-for-byte`);
}

await access(path.join(out, "_next", "static"));
console.log("Verified static HTML, route metadata, one h1 per Next route, frozen sites, and deployment assets.");
