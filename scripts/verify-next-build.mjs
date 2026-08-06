import { access, readFile } from "node:fs/promises";
import path from "node:path";
import {
  resolveLibraryReleaseConfig,
  verifyLibraryHeaderBoundary
} from "./library-release-config.mjs";
import { verifyLibraryProductionArtifacts } from
  "./verify-library-production-build.mjs";

const root = process.cwd();
const out = path.join(root, "out");
const {
  productionRelease,
  registrationOnlyProductionRelease,
  config: libraryBuildConfig
} = resolveLibraryReleaseConfig(process.env);
const legacyLibraryRegistrationHref =
  "https://docs.google.com/forms/d/e/1FAIpQLSf8gLujuK-giYnkCnv-Cxp7qon1kY8mhnGvfkA62hOlrJgAHA/viewform";
const requestedLibraryRegistrationHref = String(
  process.env.NEXT_PUBLIC_FSL_REGISTRATION_URL ?? ""
).trim();
if (
  requestedLibraryRegistrationHref
  && requestedLibraryRegistrationHref !== legacyLibraryRegistrationHref
) {
  throw new Error(
    "NEXT_PUBLIC_FSL_REGISTRATION_URL may only select the approved legacy Google Form rollback."
  );
}
const expectedLibraryRegistrationHref =
  requestedLibraryRegistrationHref || "/library-registration/";
const libraryRegistrationUsesLegacyForm =
  expectedLibraryRegistrationHref === legacyLibraryRegistrationHref;

function expectIncludes(html, expected, label) {
  if (!html.includes(expected)) throw new Error(`${label} is missing: ${expected}`);
}

function expectExcludes(html, unexpected, label) {
  if (html.includes(unexpected)) throw new Error(`${label} still contains: ${unexpected}`);
}

function expectOrdered(html, expected, label) {
  let cursor = -1;
  for (const item of expected) {
    const next = html.indexOf(item, cursor + 1);
    if (next === -1) throw new Error(`${label} is missing or out of order: ${item}`);
    cursor = next;
  }
}

function expectOneH1(html, label) {
  const count = (html.match(/<h1\b/gi) ?? []).length;
  if (count !== 1) throw new Error(`${label} must contain exactly one h1; found ${count}.`);
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function normalizeText(value) {
  return decodeEntities(value)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMessageSource(value) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/^---\s*$/gm, "")
    .replace(/^#{1,2}\s+/gm, "")
    .replace(/\*\*([\s\S]*?)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function renderedMessageCopy(html) {
  return [...html.matchAll(/<span\b[^>]*\bdata-message-copy="true"[^>]*>([\s\S]*?)<\/span>/g)]
    .map((match) => normalizeText(match[1]))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

const official = await readFile(path.join(out, "index.html"), "utf8");
const interactive = await readFile(path.join(out, "INTRO_Interactive", "index.html"), "utf8");
const interactiveDevelopers = await readFile(
  path.join(out, "INTRO_Interactive", "developers", "index.html"),
  "utf8"
);
const communityJoin = await readFile(path.join(out, "community", "join", "index.html"), "utf8");
const contact = await readFile(path.join(out, "contact", "index.html"), "utf8");
const messages = await readFile(path.join(out, "messages", "index.html"), "utf8");
const library = await readFile(path.join(out, "future-strategy-library", "index.html"), "utf8");
const libraryRegistration = await readFile(
  path.join(out, "library-registration", "index.html"),
  "utf8"
);
const libraryAdmin = await readFile(
  path.join(out, "library-registration", "admin", "index.html"),
  "utf8"
);
const deploymentRoutes = JSON.parse(await readFile(path.join(out, "_routes.json"), "utf8"));
const messageSource = await readFile(
  path.join(root, "src", "app", "(official)", "messages", "message.md"),
  "utf8"
);
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
const libraryStyles = await readFile(
  path.join(root, "src", "app", "(official)", "future-strategy-library", "future-strategy-library.module.css"),
  "utf8"
);
const livingHeroStyles = await readFile(
  path.join(root, "src", "styles", "living-intelligence-hero.css"),
  "utf8"
);
const brandSystemStyles = await readFile(
  path.join(root, "src", "styles", "official-brand-system.css"),
  "utf8"
);
const coreRedesignStyles = await readFile(
  path.join(root, "src", "styles", "official-core-redesign.css"),
  "utf8"
);
const fourDirectionsStyles = await readFile(
  path.join(root, "src", "styles", "official-four-directions.css"),
  "utf8"
);
const legacyInteractions = await readFile(path.join(root, "src", "legacy-interactions.ts"), "utf8");
const legacyInteractionComponent = await readFile(
  path.join(root, "src", "components", "LegacyInteractions.tsx"),
  "utf8"
);
const legacyStyles = await readFile(path.join(root, "src", "styles", "legacy.css"), "utf8");
const deploymentHeaders = await readFile(path.join(out, "_headers"), "utf8");
const libraryEligibilitySource = await readFile(
  path.join(root, "src", "library-registration", "eligibility.ts"),
  "utf8"
);
const libraryApiEligibilitySource = await readFile(
  path.join(root, "services", "library-api", "app", "eligibility.py"),
  "utf8"
);
const libraryAdminClientSource = await readFile(
  path.join(root, "src", "library-registration", "admin", "adminClient.ts"),
  "utf8"
);
const libraryAdminProxyFunctionSource = await readFile(
  path.join(
    root,
    "functions",
    "library-registration",
    "admin",
    "api",
    "[[path]].ts"
  ),
  "utf8"
);

expectIncludes(
  fourDirectionsStyles.replace(/\r\n/g, "\n"),
  '@media (min-width: 1281px) and (max-width: 1399px) {\n  .site-header .header-actions .header-cta--optional {\n    display: none;',
  "Parent optional Library CTA breakpoint"
);
for (const expected of [
  "@media (min-width: 901px) and (max-width: 1240px)",
  ".hero--living-intelligence .li-intelligence-visual",
  "inset: auto;",
  "width: 100%;",
  "opacity: 1;"
]) expectIncludes(livingHeroStyles, expected, "Parent laptop Hero visual containment");
for (const expected of [
  ".trustCopy h2 > span",
  "white-space: nowrap;",
  "font-size: clamp(1.48rem, 7.35vw, 1.9rem);"
]) expectIncludes(libraryStyles, expected, "Library trust heading two-line fit");
for (const expected of [
  "padding: clamp(28px, calc(10.9svh - 21.6px), 160px) 0 clamp(5px, 1svh, 22px);",
  "transform: translateX(clamp(230px, 24vw, 360px));",
  "@media (min-width: 901px) and (max-width: 1179px)",
  "@media (min-width: 1180px)",
  "clamp(1200px, 90vw, 2880px)",
  "min(calc(5.51vw + 19.36px), 11.3svh)",
  "clamp(5rem, calc(137.5px - 4.5vw), 5.27rem)",
  "min(5.8vw, 10.4svh)",
  "padding-left: clamp(12px, calc(312px - 20vw), 76px);",
  "calc(136% + 71.6vw - 733.2px)",
  "clamp(86svh, calc(86svh + 80vw - 944px), 98svh)",
  "clamp(-126px, -16.5svh, -60px) -",
  "clamp(0px, calc(16.67vw - 170.67px), 44px)",
  "margin-top: clamp(-151px, calc(-291.6px + 11.92vw), -112px);",
  "animation: desktopKnowledgeFieldDrift 34s ease-in-out infinite alternate;",
  "animation: desktopParticleDrift 18s ease-in-out infinite alternate;",
  "radial-gradient(circle at 86% 66%, rgba(87, 90, 209, 0.13)",
  "font-size: clamp(2.5rem, 3.55vw, 3.55rem);",
  "font-size: clamp(1rem, 4.25vw, 1.12rem);"
]) expectIncludes(libraryStyles, expected, "Library Desktop Hero refinement and responsive rhythm");
for (const unexpected of [
  "@media (min-width: 901px) and (min-height: 761px)",
  "@media (min-width: 901px) and (max-height: 760px)",
  "@media (min-width: 2400px) and (min-height: 1300px)"
]) expectExcludes(libraryStyles, unexpected, "Library continuous Desktop Hero responsiveness");
for (const expected of [
  ".compass-v4-page + .site-footer .footer-inner",
  ".site-footer[data-route-context=\"messages\"] .footer-inner",
  'grid-template-areas:\n      "brand"\n      "cta"\n      "note"\n      "copyright";',
  ".compass-v4-page + .site-footer .footer-nav",
  ".site-footer[data-route-context=\"messages\"] .footer-nav",
  "display: none;",
  ".compass-v4-page + .site-footer .footer-note",
  "grid-template-columns: repeat(2, minmax(0, 1fr));"
]) expectIncludes(coreRedesignStyles.replace(/\r\n/g, "\n"), expected, "Parent Footer hierarchy");
expectIncludes(official, "Don’t Just Learn. Build What’s Next.", "Parent Footer Hero message");
expectIncludes(official, 'data-route-context="root"', "Parent Footer route context");
expectIncludes(messages, 'data-route-context="messages"', "Manifesto Footer route context");

for (const expected of [
  '.js.reveal-ready [data-reveal]',
  '.js.reveal-ready [data-reveal].is-visible'
]) expectIncludes(legacyStyles, expected, "Failure-safe reveal styles");
for (const expected of [
  'root.classList.add("reveal-ready")',
  'root.classList.remove("reveal-ready")',
  'target.getBoundingClientRect()'
]) expectIncludes(legacyInteractions, expected, "Failure-safe reveal initialization");
for (const expected of [
  '.catch(() =>',
  'root.classList.remove("reveal-ready")',
  'target.classList.add("is-visible")'
]) expectIncludes(legacyInteractionComponent, expected, "Failure-safe reveal fallback");

const githubProfileUrl = "https://github.com/genellect";
for (const [html, label] of [
  [official, "Official founder profile"],
  [interactive, "Interactive developer profile"],
  [interactiveDevelopers, "Interactive developer introduction profile"]
]) {
  const links = html.match(new RegExp(`<a\\b[^>]*href="${githubProfileUrl}"[^>]*>`, "g")) ?? [];
  if (links.length !== 1) {
    throw new Error(`${label} must contain exactly one GitHub portfolio link; found ${links.length}.`);
  }
  expectIncludes(links[0], 'target="_blank"', `${label} GitHub link`);
  expectIncludes(links[0], 'rel="noopener noreferrer"', `${label} GitHub link`);
  expectIncludes(html, "GitHub Portfolio", `${label} GitHub CTA label`);
}

if (!/<h2 id="resources-title"><span>知らなかった未来に、<\/span><span>出会う。<\/span><\/h2>/.test(official)) {
  throw new Error("Resources title must preserve its semantic two-line structure.");
}

const parentGaMeasurementId = "G-EHKJ8B8N0Y";
for (const [html, label] of [
  [official, "Official page"],
  [interactive, "Interactive introduction"],
  [interactiveDevelopers, "Interactive developer introduction"],
  [communityJoin, "Community join"],
  [contact, "Contact"],
  [messages, "Messages"],
  [library, "Future Strategy Library"]
]) {
  expectIncludes(html, parentGaMeasurementId, `${label} parent GA4`);
  expectExcludes(html, "G-7VT6Z59NE0", `${label} legacy Interactive GA4`);
  expectExcludes(html, "G-6M7JL9VCWK", `${label} legacy Library GA4`);
}

expectIncludes(
  livingHeroStyles,
  "-webkit-text-fill-color: #e6fbff;",
  "Mobile Hero solid title fallback"
);
expectIncludes(
  legacyInteractions,
  "isLivingIntelligence ||",
  "Living Intelligence desktop particle layer"
);
for (const expected of [
  ".v4-brand-field--vision",
  ".v4-brand-field--experience",
  ".v4-brand-field--resources",
  ".v4-community__network",
  "@media (prefers-reduced-motion: reduce)"
]) expectIncludes(brandSystemStyles, expected, "Official brand system");
expectExcludes(brandSystemStyles, ".hero--living-intelligence", "Hero protection");
expectExcludes(brandSystemStyles, ".v4-manifesto", "Manifesto protection");

for (const expected of [
  '<html lang="ja"',
  "Don’t Just Learn.",
  "Build What’s",
  "独自システム、実践資料、教育活動、",
  "学生コミュニティをひとつに。",
  "学生の「知る」を、",
  "「選ぶ」「動く」へ変える。",
  'id="vision"',
  'id="experience"',
  'id="technology"',
  'id="resources"',
  'id="founder"',
  'id="community"',
  'id="contact"',
  'id="manifesto"',
  'href="/messages/"',
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
  "次の試験に役立つ情報を",
  "探しに来たはずが、",
  "気づけば、その先の未来まで",
  "見えてくる。",
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
  "COMPASSを知る",
  "MANIFESTO",
  "Manifesto",
  "観客席から",
  "見ているには、",
  "この時代は",
  "面白すぎる。",
  "AI時代の学生へ贈る、",
  "COMPASSからの招待状。",
  "ストーリーを読む",
  "お問い合わせフォーム",
  "Web開発・プログラミング 4年",
  "/images/founder/yuto-matsui-portrait-800.jpg",
  "学生主導の教育・テクノロジープラットフォーム",
  "COMPASS Interactive紹介サイト",
  "未来戦略ライブラリ紹介サイト",
  "Community参加フォーム",
  "https://github.com/genellect/compass",
  'aria-label="COMPASS source code on GitHub"',
  'class="footer-source-link"',
  "<span>Source</span>",
  parentGaMeasurementId
]) expectIncludes(official, expected, "Official page");

expectExcludes(official, "AI時代の学生へ贈る、COMPASSの決意。", "Manifesto declaration");

expectOrdered(
  official,
  ['id="resources"', 'id="manifesto"', 'id="community"', 'id="founder"', 'id="contact"', 'class="site-footer"'],
  "Official closing section order"
);

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
expectExcludes(official, 'href="#contact"', "Official contact navigation");
expectExcludes(official, "未来の後輩へ。", "Retired message section");
expectExcludes(official, "創設者メッセージを見る", "Retired message CTA");
expectExcludes(official, ">Message<", "Retired Message navigation label");
expectExcludes(official, "未来戦略ライブラリを見る", "Retired footer CTA");
expectExcludes(official, "COMPASSに参加する", "Retired footer CTA");

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
expectIncludes(communitySection, 'class="v4-community__network-compact"', "Community compact graphic");
expectIncludes(communitySection, 'class="v4-community__network-trajectory"', "Community expanded graphic");
if (/<details class="v4-community__details"\s+open/.test(communitySection)) {
  throw new Error("Community details must be closed by default.");
}
expectOrdered(
  communitySection,
  [
    'class="v4-community__overview"',
    '<details class="v4-community__details">',
    'class="v4-community__network"',
    'class="v4-button v4-community__cta"'
  ],
  "Community reading and action flow"
);

const resourcesSection = official.match(/<section id="resources"[\s\S]*?<\/section>/)?.[0];
if (!resourcesSection) throw new Error("Official page is missing the Resources section.");
expectOrdered(
  resourcesSection,
  ['class="v4-resources__story"', 'class="v4-resource-gateway"'],
  "Resources reading and action flow"
);

const resourcesCard = official.match(/<article class="v4-experience-card v4-experience-card--resources"[\s\S]*?<\/article>/)?.[0];
if (!resourcesCard) throw new Error("Official page is missing the Resources experience card.");
expectIncludes(resourcesCard, "ライブラリを見る", "Resources experience card");
expectIncludes(resourcesCard, 'href="/future-strategy-library/"', "Resources experience card");

for (const experienceName of ["technology", "resources", "workshops", "community"]) {
  const experienceCard = official.match(new RegExp(`<article class="v4-experience-card v4-experience-card--${experienceName}"[\\s\\S]*?<\\/article>`))?.[0];
  if (!experienceCard) throw new Error(`Official page is missing the ${experienceName} experience card.`);
  expectExcludes(experienceCard, "data-reveal", `${experienceName} experience card initial motion`);
}

const officialLibraryLinks = official.match(/<a\b[^>]*href="\/future-strategy-library\/"[^>]*>/g) ?? [];
if (officialLibraryLinks.length !== 6) {
  throw new Error(`Official page must contain six same-domain library links; found ${officialLibraryLinks.length}.`);
}
for (const link of officialLibraryLinks) {
  expectExcludes(link, 'target="_blank"', "Same-domain library link");
}
if (/<a\b[^>]*href="https:\/\/compass-official\.pages\.dev\/future-strategy-library\/"[^>]*>/.test(official)) {
  throw new Error("Official page must not retain a legacy external library link.");
}

for (const expected of [
  '<html lang="ja"',
  'id="main"',
  'id="top"',
  'id="students"',
  'id="features"',
  'id="ai-support"',
  'id="teachers"',
  'id="developers"',
  "LET EVERYTHING MOVE.",
  "未来の講義を、いま体験。",
  'rel="canonical" href="https://compass-official.pages.dev/INTRO_Interactive/"',
  parentGaMeasurementId
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
  'mobileLabel: "お問い合わせ"',
  'label: "教育を変える"',
  'label: "学ぶ・考える"',
  'label: "コミュニティに参加する"',
  'label: "その他"',
  'mobileLabel: "代表について"',
  "疑問が届く、参加型講義システム",
  "北里薬学生への未来の羅針盤",
  "運営メンバーとして参加する",
  "無料で資料を見る"
]) expectIncludes(siteHeaderSource, expected, "Official header source");
expectIncludes(
  siteHeaderSource.replace(/\r\n/g, "\n"),
  'href: "/messages/",\n        label: "AI時代をどう生きるか",\n        description: "COMPASS Manifesto",\n        mobileDescription: "COMPASS Manifesto"',
  "Resources Manifesto navigation"
);
expectExcludes(siteHeaderSource, 'activeId: "manifesto"', "Independent Manifesto navigation");
expectIncludes(siteHeaderSource, 'label: "Technology Core"', "Desktop Technology navigation");
expectIncludes(siteHeaderSource, "items: [navGroups[0].items[0]]", "Mobile Technology navigation");
expectExcludes(siteHeaderSource, 'mobileLabel: "お問い合わせフォーム"', "Official header source");
expectExcludes(siteHeaderSource, 'label: "COMPASS Essentials"', "Official header source");
expectExcludes(siteHeaderSource, "https://forms.gle/sW49M329Dcets8ga9", "Official header source");
expectExcludes(siteHeaderSource, "panel-link-interactive", "Official header source");
expectExcludes(siteHeaderSource, "mobile-nav-highlight", "Official header source");
expectIncludes(
  contactStyles.replace(/\r\n/g, "\n"),
  ".helper {\n  margin: 7px 0 11px;\n  color: var(--copy);",
  "Contact helper contrast"
);

for (const expected of [
  '<html lang="ja"',
  "そのAI、",
  "まだ質問相手ですか？",
  "私は先に、AIを部下にしました。",
  "観客席から見ているには、この時代は面白すぎる。",
  'rel="canonical" href="https://compass-official.pages.dev/messages/"',
  'data-reader-state="cover"',
  'data-message-manuscript="true"',
  'data-message-copy="true"',
  "第1章を読む",
  "章を選ぶ",
  "CHAPTERS",
  'href="/#technology"',
  'href="/INTRO_Interactive/"',
  'href="/messages/"',
  'type="application/ld+json"'
]) expectIncludes(messages, expected, "Messages page");

for (const unexpected of [
  "messages/script.js",
  "messages/style.css",
  "series-desktop.css",
  "未来の後輩へ",
  "FINAL MESSAGE TEXT - DO NOT EDIT"
]) expectExcludes(messages, unexpected, "Messages page");

expectOneH1(messages, "Messages page");

const expectedMessageCopy = normalizeMessageSource(messageSource);
const actualMessageCopy = renderedMessageCopy(messages);
if (actualMessageCopy !== expectedMessageCopy) {
  throw new Error(
    `Messages copy differs from message.md (expected ${expectedMessageCopy.length} normalized characters, found ${actualMessageCopy.length}).`
  );
}

for (const expected of [
  '<html lang="ja"',
  'data-library-page="true"',
  'data-fsl-landing-header="true"',
  'data-site-header="true"',
  'data-library-section="hero"',
  'data-library-section="thesis"',
  'data-library-section="materials"',
  'data-library-section="fields"',
  'data-library-section="trust"',
  'data-library-section="final"',
  "BEYOND THE SYLLABUS.",
  "FSL / KNOWLEDGE HORIZON",
  "4 DOMAIN RAILS",
  'data-library-material="true"',
  "無料で資料を見る",
  "大学アカウントで無料登録する",
  `href="${expectedLibraryRegistrationHref}"`,
  'rel="canonical" href="https://compass-official.pages.dev/future-strategy-library/"',
  '/images/future-strategy-library/why-english.webp',
  '/images/future-strategy-library/ai-guide-sanitized.webp',
  '/images/future-strategy-library/research-career.webp',
  '/images/future-strategy-library/knowledge-horizon-og.png',
  'type="application/ld+json"'
]) expectIncludes(library, expected, "Future Strategy Library page");

for (const unexpected of [
  "future-strategy-library/style.css",
  "compact-desktop.css",
  "desktop-editorial.css",
  "series-desktop.css",
  "G-6M7JL9VCWK",
  "OPEN THE ESSAY",
  "PROJECT TIMELINE",
  "学びに使える。",
  "未来につながる。",
  "まだ知らない未来への、三つの入口。",
  "安心して学びに使えるために。",
  "利用登録・ご相談はGoogleフォームから受け付けています。",
  "Development%26Governance.pdf",
  "Future_Strategy_Library_Design_Philosophy.pdf.pdf",
  "/images/future-strategy-library/ai-guide.webp",
  'data-mobile-hero="legacy"',
  'data-mobile-hero-needs="true"',
  "COMPASS Interactive紹介サイト",
  "未来戦略ライブラリ紹介サイト",
  "Community参加フォーム"
]) expectExcludes(library, unexpected, "Future Strategy Library page");

expectOneH1(library, "Future Strategy Library page");

for (const expected of [
  '<html lang="ja"',
  "Future Strategy Library",
  "ようこそ、",
  "未来戦略ライブラリへ。",
  "必要事項を入力してください。現在は北里大学薬学部生の方を対象としており、登録は3分ほどで完了します。",
  "大学アカウント認証",
  "登録内容を確認する",
  "noindex",
  "nofollow"
]) expectIncludes(libraryRegistration, expected, "Library registration preview");

for (const removedProgressUi of [
  "入力状況",
  "必要項目の入力状況を確認できます。",
  'class="decision-card"'
]) expectExcludes(
  libraryRegistration,
  removedProgressUi,
  "Library registration removed progress panel"
);

expectIncludes(
  libraryRegistration,
  libraryBuildConfig.registrationMode === "google"
    ? "GOOGLE API"
    : "REGISTRATION DISABLED",
  "Library registration runtime mode"
);
expectExcludes(
  libraryRegistration,
  libraryBuildConfig.registrationMode === "google" ? "LOCAL MOCK" : "GOOGLE API",
  "Library registration runtime mode"
);
if (libraryBuildConfig.registrationMode !== "google") {
  expectExcludes(
    libraryRegistration,
    "LOCAL MOCK",
    "Library registration fail-closed static HTML"
  );
  expectExcludes(
    libraryRegistration,
    'class="mock-account-select"',
    "Library registration fail-closed static HTML"
  );
  expectIncludes(
    libraryRegistration,
    "現在、利用登録を受け付けていません。時間をおいて再度お試しください。",
    "Library registration fail-closed static HTML"
  );
}

for (const unexpected of [
  "G-EHKJ8B8N0Y",
  "G-7VT6Z59NE0",
  "G-6M7JL9VCWK",
  "forms.gle",
  "docs.google.com/forms",
  "LIBRARY REGISTRATION / PHASE 7",
  "SERVER-SIDE DECISION CONTRACT",
  "判定条件プレビュー",
  "認証済み登録APIテスト",
  "PREVIEW STATUS",
  "Future Strategy Library Registration / Phase 7",
  "LOCAL PREVIEW",
  "ローカル検証版",
  "検証用アカウント",
  "モックアカウント",
  "個人Googleアカウント",
  "personal@gmail.com",
  "IDトークン",
  "phase3-draft",
  "必要事項を入力し、大学アカウントを確認してください。",
  "所要時間は約3分です。",
  "必要事項が揃うと、登録内容を確認できます。",
  "残り:",
  "registration-hero",
  "共有ドライブ"
]) expectExcludes(libraryRegistration, unexpected, "Library registration preview");

expectOneH1(libraryRegistration, "Library registration preview");

const libraryAdminExpected = [
  '<html lang="ja"',
  "未来戦略ライブラリ",
  "管理者ログイン",
  "noindex",
  "nofollow"
];
for (const expected of libraryAdminExpected) {
  expectIncludes(libraryAdmin, expected, "Library administrator page");
}
if (libraryBuildConfig.adminMode === "mock") {
  expectIncludes(
    libraryAdmin,
    "管理画面の認証設定が完了していません。",
    "Library administrator static fail-closed state"
  );
  expectExcludes(
    libraryAdmin,
    'class="admin-mock-login"',
    "Library administrator server-rendered preview isolation"
  );
  expectExcludes(
    libraryAdmin,
    'id="mock-admin-role"',
    "Library administrator owner-only preview"
  );
} else {
  expectExcludes(
    libraryAdmin,
    'id="mock-admin-role"',
    "Library administrator production login"
  );
}

for (const unexpected of [
  "RESTRICTED OPERATIONS",
  "SYNTHETIC MOCK",
  "ADMIN API",
  "合成管理者として開始"
]) expectExcludes(libraryAdmin, unexpected, "Library administrator page");

for (const unexpected of [
  "G-EHKJ8B8N0Y",
  "G-7VT6Z59NE0",
  "G-6M7JL9VCWK",
  "forms.gle",
  "docs.google.com/forms"
]) expectExcludes(libraryAdmin, unexpected, "Library administrator page");

expectExcludes(
  library,
  '/library-registration/admin/',
  "Future Strategy Library public page"
);
expectExcludes(
  libraryRegistration,
  '/library-registration/admin/',
  "Library registration public page"
);
expectOneH1(libraryAdmin, "Library administrator page");

for (const expected of [
  '"/admin/v1/applications/search"',
  "drivePermissionManaged",
  '"Idempotency-Key"',
  '}/deactivate`',
  "NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL",
  'credentials: "same-origin"',
  "adminProxyUrl",
  "isTrustedAdminPreviewLocation"
]) expectIncludes(libraryAdminClientSource, expected, "Library administrator client contract");
expectExcludes(
  libraryAdminClientSource,
  '"/admin/v1/applications?',
  "Library administrator PII search URL"
);
expectExcludes(
  libraryAdminClientSource,
  "NEXT_PUBLIC_LIBRARY_API_BASE_URL",
  "Library administrator same-origin proxy boundary"
);

for (const expected of [
  'const ADMIN_PROXY_PREFIX = "/library-registration/admin/api"',
  'const UPSTREAM_ADMIN_PREFIX = "/admin/v1"',
  "LIBRARY_ADMIN_CANONICAL_ORIGIN",
  "LIBRARY_ADMIN_API_ORIGIN",
  "LIBRARY_ADMIN_EDGE_SHARED_SECRET",
  '"X-Library-Admin-Edge-Secret"',
  '"Idempotency-Key"',
  "MAX_REQUEST_BODY_BYTES",
  "MAX_RESPONSE_BODY_BYTES",
  'redirect: "manual"',
  '"Cache-Control": "private, no-store, max-age=0"'
]) expectIncludes(
  libraryAdminProxyFunctionSource,
  expected,
  "Library administrator Pages Function boundary"
);
for (const unexpected of [
  "Access-Control-Allow-Origin",
  "CF-Access-Jwt-Assertion",
  'headers.set("Cookie"',
  'headers.set("Set-Cookie"'
]) expectExcludes(
  libraryAdminProxyFunctionSource,
  unexpected,
  "Library administrator Pages Function boundary"
);

for (const expected of [
  "/^(PP|PL|MP)[0-9]{5}$/",
  'registration.faculty !== "pharmacy"',
  'registration.academicRole === "doctoral" || registration.academicRole === "staff"',
  "allowedHostedDomains"
]) expectIncludes(libraryEligibilitySource, expected, "Library registration browser decision contract");

for (const expected of [
  "STUDENT_NUMBER_PATTERN",
  "allowed_hosted_domains",
  "ReasonCode.FACULTY_REQUIRES_MANUAL_REVIEW",
  "ReasonCode.ROLE_REQUIRES_MANUAL_REVIEW"
]) expectIncludes(libraryApiEligibilitySource, expected, "Library registration server decision contract");

const libraryMain = library.match(/<main\b[\s\S]*?<\/main>/)?.[0];
if (!libraryMain) throw new Error("Future Strategy Library main content was not found.");

const librarySectionCount = (libraryMain.match(/<section\b/g) ?? []).length;
if (librarySectionCount !== 6) {
  throw new Error(`Future Strategy Library page must contain six primary sections; found ${librarySectionCount}.`);
}

const libraryText = normalizeText(libraryMain);
expectOrdered(libraryText, [
  "BEYOND THE SYLLABUS.",
  "未来は、知っている人から動き出す。",
  "北里大学薬学部生のための、 学生目線の資料ライブラリ。",
  "WHY THIS LIBRARY",
  "未来戦略ライブラリは、北里大学薬学部生のための資料ライブラリです。",
  "試験対策、英語、AI、研究室、大学院、キャリア。 一見ばらばらに見えるテーマをつなぎ、大学で学ぶ「今」を、これからの選択へ変えていきます。",
  "まずは、次の試験のためでも構いません。 登録した理由より、登録したあとに見える景色のほうが大切です。",
  "2024.02活動開始",
  "73+利用登録者 2026年6月時点",
  "100+掲載資料",
  "FEATURED MATERIALS",
  "未来は、案外、一つの資料から動き出す。",
  "まずは、気になるテーマから。",
  "読み始める理由は、英語でも、AIでも、研究室選びでも構いません。 読み終える頃に、少し先の自分まで見える資料を目指しています。",
  "翻訳できる時代に、なぜ英語を学ぶのか。",
  "翻訳AIがあっても、英語を使える人の選択肢は減りません。むしろ、これまで以上に広がります。",
  "資格勉強を、試験のためだけで終わらせず、専門性を世界へ届ける力へ変えるための導入資料です。",
  "AIで、未来を設計する。",
  "答えを出させるだけなら、AIの力のほんの一部です。",
  "学習、研究、開発、情報整理、アイデアの実現。AIを「便利なチャットボット」で終わらせず、自分の可能性を広げるための実践ガイドです。",
  "研究を、未来の仕事にする。",
  "研究室は、配属先を決めるだけの場所ではありません。",
  "研究テーマ、指導環境、大学院、企業、アカデミア。研究室選びとその先の進路を、一続きで考えるガイドです。",
  "掲載資料は100点以上。試験対策、TOEIC・英検、英会話、大学院進学なども扱っています。",
  "WHAT YOU GET",
  "目の前の試験も、その先の未来も。",
  "必要なのは、全部を知ることではありません。 今の自分に必要な知識から、選択肢を増やしていくことです。",
  "まず、次の試験を乗り切る。でも、そこで終わらない。",
  "試験前に使える対策資料から、暗記に頼りすぎない理解の組み立て方まで。",
  "講義で学んだ知識が、実習・研究・臨床へどうつながるのかを扱います。",
  "点数を取る。その英語を、使える力に変える。",
  "TOEIC・英検などの資格対策から、論文読解、研究発表、英会話まで。",
  "試験のために覚えた英語を、その先で実際に使うところまで支えます。",
  "AIを使う。AIに使われない。",
  "学習・研究・制作のどこをAIに任せ、どこを人間が確かめるのか。",
  "便利さだけでなく、精度・責任・信頼まで含めたAI活用を考えます。",
  "配属されてから考えるには、進路は少し大きすぎる。",
  "研究テーマ、指導環境、大学院進学、その先の仕事まで。",
  "誰かの正解を押しつけるのではなく、自分で比較し、選ぶための判断材料を整理します。",
  "FOR KITASATO PHARMACY STUDENTS",
  "北里薬学生のためだけに、つくりました。",
  "このライブラリは、北里大学薬学部生だけが利用できる限定公開です。 登録・利用は無料。大学アカウントによる認証で、資料と利用者の信頼を守ります。",
  "COMPASSは、学生有志による独立した活動です。 大学・学部が運営する公式サービスではありません。",
  "個人の学習利用に限ります無断共有・転載・再配布は禁止です",
  "試験、履修、進級、研究室配属、進路などの重要事項は、 必ず大学・学部が発信する最新の公式情報と照合してください。",
  "YOUR NEXT MOVE",
  "まだ知らない未来は、ここから選択肢になる。",
  "入口は、次の試験でも、英語でも、研究室選びでも構いません。 今の自分に必要な一つを知ることから、未来は少しずつ動き始めます。"
], "Future Strategy Library canonical copy");

for (const expected of ["2024.02", "73", "100"]) {
  expectIncludes(libraryMain, expected, "Future Strategy Library server-rendered metrics");
}
for (const unexpected of ['data-count-target=', ">0+</", "/images/future-strategy-library/library-horizon.webp"]) {
  expectExcludes(libraryMain, unexpected, "Future Strategy Library initial render");
}

const libraryRegistrationCount = (
  library.match(/data-library-registration="true"/g) ?? []
).length;
if (libraryRegistrationCount !== 4) {
  throw new Error("Future Strategy Library must contain four server-rendered registration actions; found " + libraryRegistrationCount + ".");
}

const libraryRegistrationActions = library.match(/<a\b[^>]*data-library-registration="true"[^>]*>[\s\S]*?<\/a>/g) ?? [];
for (const action of libraryRegistrationActions) {
  expectIncludes(
    action,
    `href="${expectedLibraryRegistrationHref}"`,
    "Library registration action"
  );
  if (libraryRegistrationUsesLegacyForm) {
    expectIncludes(action, 'target="_blank"', "Library registration rollback action");
  } else {
    expectExcludes(action, 'target="_blank"', "Library registration internal action");
  }
  const visibleLabel = normalizeText(action).replace("（新しいタブで開きます）", "").trim();
  const expectedLabel = action.includes('data-placement="header"')
    ? "無料で資料を見る"
    : action.includes('data-placement="sticky"')
      ? `無料で登録する${libraryRegistrationUsesLegacyForm ? "↗" : "→"}`
      : `大学アカウントで無料登録する${libraryRegistrationUsesLegacyForm ? "↗" : "→"}`;
  if (visibleLabel !== expectedLabel) {
    throw new Error("Future Strategy Library registration CTA label changed: " + normalizeText(action));
  }
}

const libraryMaterialStatuses = libraryMain.match(/<span\b[^>]*data-library-material="true"[^>]*>[\s\S]*?<\/span>/g) ?? [];
if (libraryMaterialStatuses.length !== 3) {
  throw new Error("Future Strategy Library must contain three non-interactive material statuses; found " + libraryMaterialStatuses.length + ".");
}
for (const status of libraryMaterialStatuses) {
  if (normalizeText(status) !== "登録後に閲覧できます") {
    throw new Error("Future Strategy Library material status changed: " + normalizeText(status));
  }
}

for (const expected of [
  "GOOGLE_APPS_SCRIPT_URL",
  "GOOGLE_APPS_SCRIPT_SECRET",
  "TURNSTILE_SECRET_KEY",
  "script.google.com",
  "sharedSecret"
]) expectIncludes(registrationFunction, expected, "Community registration Pages Function");

for (const expected of [
  'ADMIN_EMAIL_PROPERTY: "COMMUNITY_ADMIN_RECIPIENT_EMAIL"',
  'FORM_SECRET_PROPERTY: "FORM_SHARED_SECRET"',
  "COMPASS Communityの登録申請がありました。",
  "コミュニティ参加フォームへのご登録を受け付けました。",
  "MailApp.sendEmail",
  "validateRegistration_",
  "constantTimeEquals_",
  "readConfiguredEmail_"
]) expectIncludes(gasCode, expected, "Community registration GAS code");

for (const unexpected of [
  'ADMIN_EMAIL:',
  "RESEND_API_KEY",
  "REGISTRATION_FROM_EMAIL",
  "api.resend.com"
]) {
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
  'ADMIN_EMAIL_PROPERTY: "CONTACT_ADMIN_RECIPIENT_EMAIL"',
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
  "※本メールはGoogle Apps Scriptにより自動送信されています。",
  "readConfiguredEmail_"
]) expectIncludes(contactGasCode, expected, "Contact GAS code");

for (const unexpected of [
  'ADMIN_EMAIL:',
  'FORM_SECRET_PROPERTY: "FORM_SHARED_SECRET"',
  "COMMUNITY_REGISTRATION_IDEMPOTENCY",
  "@st.kitasato-u.ac.jp$"
]) {
  expectExcludes(contactFunction, unexpected, "Contact Pages Function");
  expectExcludes(contactGasCode, unexpected, "Contact GAS code");
}

const cloudflareBeaconOrigin = "https://static.cloudflareinsights.com";
const beaconCspOccurrences = deploymentHeaders.split(cloudflareBeaconOrigin).length - 1;
if (beaconCspOccurrences !== 2) {
  throw new Error(
    `Deployment headers must allow the Cloudflare Web Analytics beacon on both form routes; found ${beaconCspOccurrences}.`
  );
}

for (const expected of [
  "/library-registration/*",
  "/library-registration/admin/*",
  "https://accounts.google.com",
  "Cache-Control: private, no-store, max-age=0",
  "Referrer-Policy: no-referrer",
  "Cross-Origin-Opener-Policy: same-origin-allow-popups",
  "Cross-Origin-Resource-Policy: same-origin",
  "X-Robots-Tag: noindex, nofollow"
]) expectIncludes(deploymentHeaders, expected, "Library registration deployment boundary");
expectExcludes(
  deploymentHeaders,
  "https://*.run.app",
  "Library registration deployment boundary"
);
verifyLibraryHeaderBoundary(deploymentHeaders, libraryBuildConfig);
if (productionRelease && !registrationOnlyProductionRelease) {
  verifyLibraryProductionArtifacts({
    registrationHtml: libraryRegistration,
    adminHtml: libraryAdmin,
    deploymentHeaders,
    config: libraryBuildConfig
  });
}

for (const relative of [
  "messages/index.html",
  "future-strategy-library/index.html",
  "library-registration/index.html",
  "library-registration/admin/index.html",
  "images/compass-mark.svg",
  "images/future-strategy-library/knowledge-horizon-og.png",
  "images/future-strategy-library/why-english.webp",
  "images/future-strategy-library/ai-guide-sanitized.webp",
  "images/future-strategy-library/research-career.webp",
  "_routes.json",
  "_headers",
  "_redirects",
  "robots.txt",
  "sitemap.xml"
]) await access(path.join(out, relative));

await access(path.join(out, "_next", "static"));
const expectedFunctionRoutes = [
  "/api/community-registration",
  "/api/contact",
  "/library-registration/admin/api/*"
];
if (
  deploymentRoutes.version !== 1
  || JSON.stringify(deploymentRoutes.include) !== JSON.stringify(expectedFunctionRoutes)
  || !Array.isArray(deploymentRoutes.exclude)
  || deploymentRoutes.exclude.length !== 0
) {
  throw new Error("Cloudflare _routes.json does not match the reviewed exact Function boundary.");
}
console.log("Verified Next routes, the library gateway, registration and administrator previews, and deployment assets.");
