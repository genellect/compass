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
const founder = await readFile(path.join(out, "founder", "index.html"), "utf8");
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
  ".heroLower",
  "grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);",
  ".heroEditorial",
  ".knowledgeGraphic",
  ".heroIntelligenceField",
  "mix-blend-mode: screen;",
  "animation: desktopAmbientLightSweep 22s ease-in-out infinite alternate;",
  "animation: desktopParticleDrift 18s ease-in-out infinite alternate;",
  "@media (min-width: 901px) and (max-width: 1179px)",
  "@media (min-width: 1180px)",
  "min-height: 100svh;"
]) expectIncludes(libraryStyles, expected, "Library Desktop Hero refinement and responsive rhythm");
for (const unexpected of [
  "@media (min-width: 901px) and (min-height: 761px)",
  "@media (min-width: 901px) and (max-height: 760px)",
  "@media (min-width: 2400px) and (min-height: 1300px)"
]) expectExcludes(libraryStyles, unexpected, "Library continuous Desktop Hero responsiveness");
for (const expected of [
  ".site-footer[data-ui-variant=\"root\"] .footer-inner",
  ".site-footer[data-route-context=\"messages\"] .footer-inner",
  'grid-template-areas:\n      "brand"\n      "cta"\n      "note"\n      "copyright";',
  ".site-footer[data-ui-variant=\"root\"] .footer-nav",
  ".site-footer[data-route-context=\"messages\"] .footer-nav",
  "display: none;",
  ".site-footer[data-ui-variant=\"root\"] .footer-note",
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
for (const [html, label, expectedCount] of [
  [official, "Official founder profile", 1],
  [interactive, "Interactive developer profile", 1],
  [interactiveDevelopers, "Interactive developer introduction profile", 1]
]) {
  const links = html.match(new RegExp(`<a\\b[^>]*href="${githubProfileUrl}"[^>]*>`, "g")) ?? [];
  if (links.length !== expectedCount) {
    throw new Error(`${label} must contain exactly ${expectedCount} GitHub portfolio link(s); found ${links.length}.`);
  }
  for (const link of links) {
    expectIncludes(link, 'target="_blank"', `${label} GitHub link`);
    expectIncludes(link, 'rel="noopener noreferrer"', `${label} GitHub link`);
  }
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
  'id="adoption"',
  'id="developers"',
  'id="educator-operations"',
  "LET EVERYTHING MOVE.",
  "未来の講義を、いま体験。",
  "聞き逃しも、疑問も、",
  "その場で次の理解へ。",
  "最新AIが、講義中に生まれる「わからない」を拾い、字幕・要点・質問・学術情報へつなぎます。",
  "GPT-Realtime-Whisper｜搭載中",
  "学生の反応が、次の説明を変える。",
  "講義の準備から",
  "画面共有まで、",
  "ひとつの管理画面で。",
  "スライド、コメント、ライブ投票を統合した教室表示を開始。AIが生成した要点や回答も、教員が確認・修正してから学生へ共有できます。",
  "講義や研修への",
  "導入をご検討の方へ",
  "COMPASS Interactiveは、",
  "大学講義や研究室セミナー、",
  "学会、企業研修など、",
  "さまざまな教育・学習環境で",
  "ご利用いただけます。",
  "続きを読む",
  "利用環境の設定、操作方法のご案内、講義当日の運用支援まで個別にサポートいたします。",
  "利用内容に応じて個別にご相談を承ります。",
  'href="/contact/"',
  'href="/founder/"',
  "Web Portfolio",
  "設計判断をたどる",
  "この体験を、見えない設計から支える。",
  'rel="canonical" href="https://compass-official.pages.dev/INTRO_Interactive/"',
  parentGaMeasurementId
]) expectIncludes(interactive, expected, "Interactive page");

const interactiveDesktopNav = interactive.match(/<nav class="desktop-nav"[\s\S]*?<\/nav>/)?.[0];
if (!interactiveDesktopNav) throw new Error("Interactive page is missing its Desktop navigation.");
for (const [href, label] of [
  ["#students", "学生の体験"],
  ["#ai-support", "AI学習支援"],
  ["#educator-operations", "教員の使い方"],
  ["#adoption", "導入・ご相談"],
  ["#developers", "設計・技術"]
]) {
  expectIncludes(interactiveDesktopNav, `href="${href}"`, "Interactive Desktop navigation");
  expectIncludes(interactiveDesktopNav, label, "Interactive Desktop navigation");
}
expectExcludes(interactiveDesktopNav, "こんな場面で", "Interactive Desktop navigation");
expectExcludes(interactiveDesktopNav, 'href="#teachers"', "Interactive Desktop navigation");

const interactiveSectionOrder = [
  'id="security"',
  'id="educator-operations"',
  'id="adoption"',
  'id="developers"'
].map((marker) => interactive.indexOf(marker));
if (
  interactiveSectionOrder.some((index) => index < 0)
  || interactiveSectionOrder.some((index, position) => position > 0 && index <= interactiveSectionOrder[position - 1])
) {
  throw new Error("Interactive hierarchy must remain Trust, Educator Operations, Adoption, then Developers.");
}

if (interactive.includes('<div id="root"></div>')) {
  throw new Error("Interactive page regressed to an empty client-rendered shell.");
}

expectOneH1(official, "Official page");
expectOneH1(interactive, "Interactive page");
expectExcludes(interactiveDevelopers, 'href="/founder/"', "Interactive developer page Web Portfolio scope");
expectIncludes(official, 'href="/founder/"', "Official Founder portfolio link");
expectIncludes(official, "Web Portfolio", "Official Founder Web Portfolio CTA");
expectIncludes(official, "GitHub Portfolio", "Official Founder GitHub Portfolio CTA");

for (const expected of [
  '<html lang="ja"',
  'id="founder-title"',
  'id="expertise"',
  'id="fragments"',
  'id="story"',
  'id="products"',
  'id="credentials"',
  'id="off-hours"',
  'id="contact-cta"',
  "Yuto Matsui",
  "松井優知",
  "Molecular Biology Research",
  "分子生物学研究",
  "AIネイティブ開発",
  "大学教育支援",
  "FRAGMENTS",
  'href="#message"',
  'aria-label="Mobile portfolio navigation"',
  'aria-label="外部リンクを表示"',
  "/images/founder-portfolio/yuto-matsui-education-support.webp",
  "/images/founder-portfolio/yuto-matsui-lab-hero.webp",
  "/images/founder-portfolio/off-hours-drive.webp",
  "/images/founder-portfolio/off-hours-shogi.webp",
  "/images/founder-portfolio/off-hours-climbing.webp",
  "/images/founder-portfolio/source/software-development-unsplash.jpg",
  "/images/Image4.jpg",
  "/images/founder-portfolio/yuto-matsui-profile-hero.webp",
  "/images/founder-portfolio/yuto-matsui-queens-square.webp",
  "/images/founder-portfolio/yuto-matsui-front.webp",
  "/images/founder-portfolio/fragments/yuto-696-1566.webp",
  "/images/founder-portfolio/fragments/dna-automation-1920.webp",
  "/images/founder-portfolio/fragments/microfluidic-1920.webp",
  "/images/founder-portfolio/fragments/code-terminal-1920.webp",
  "/images/founder-portfolio/fragments/yuto-698-1566.webp",
  "/images/founder-portfolio/fragments/code-data-1920.webp",
  "/images/founder-portfolio/fragments/yuto-703-1044.webp",
  "/images/founder-portfolio/fragments/silicon-wafer-1920.webp",
  "/images/founder-portfolio/fragments/yuto-704-1372.webp",
  'data-library-hero-preview="true"',
  "FSL / KNOWLEDGE HORIZON",
  "© 2026 Yuto Matsui. Designed and developed by Yuto Matsui. All rights reserved.",
  "境界を越え、新しい可能性へ。",
  "COMPASS Interactive",
  "LET EVERYTHING",
  "MOVE.",
  "未来戦略ライブラリ",
  "COMPASS Manifesto",
  "English Proficiency",
  "TOEIC L&amp;R",
  "965",
  "IELTS Academic",
  "7.5",
  "OFF HOURS",
  "自然の中で車を走らせるのが好きです。",
  "棋力はアマチュア三段です。",
  "高校時代はクライミング部。",
  "続きを読む",
  "お問い合わせ",
  "メールでのご連絡",
  "Researcher &amp; Engineer",
  "my270yuto0413@gmail.com",
  "matsui.yuto@st.kitasato-u.ac.jp",
  "https://www.instagram.com/n.m.w.314/?__pwa=1#",
  "さまざまな方とのご縁を歓迎しています。",
  "CONTACT",
  'href="/contact/"',
  'rel="canonical" href="https://compass-official.pages.dev/founder/"',
  parentGaMeasurementId
]) expectIncludes(founder, expected, "Founder portfolio");

expectOrdered(founder, ['id="expertise"', 'id="fragments"', 'id="story"'], "Founder FRAGMENTS section order");

const founderFragmentPhotoCount = (founder.match(/data-slot=/g) ?? []).length;
if (founderFragmentPhotoCount !== 19) {
  throw new Error(`Founder FRAGMENTS must contain exactly 19 photos, found ${founderFragmentPhotoCount}.`);
}

const founderFragmentAmbientCount = (founder.match(/data-fragment-ambient=/g) ?? []).length;
if (founderFragmentAmbientCount !== 1) {
  throw new Error(`Founder FRAGMENTS must contain exactly 1 continuous signal field, found ${founderFragmentAmbientCount}.`);
}

expectExcludes(
  founder,
  "© 2026 Yuto Matsui. Personal portfolio hosted within the COMPASS site.",
  "Founder legacy copyright"
);
expectExcludes(
  founder,
  "研究支援やデータ解析から再びソフトウェア開発へ軸足を広げました。",
  "Founder legacy Origin copy"
);

expectOneH1(founder, "Founder portfolio");

const founderStory = founder.match(/<section id="story"[\s\S]*?<\/section>\s*<\/main>/)?.[0];
if (!founderStory) throw new Error("Founder portfolio is missing the fixed personal statement.");
// Chapters 02-05 are serialized as the client continuation slot and mount after expansion.
// Verify the fixed copy in the complete static document while retaining the section check above.
const founderStoryText = normalizeText(founder);
expectOrdered(founderStoryText, [
  "高校時代の2020年頃から趣味でプログラミングを始め、Webフロントエンド開発を中心に学びました。当時は現在のようなLLMやコーディングエージェントはなく、実装、デバッグ、Git操作の多くを手作業で行う時代でした。開発そのものには強く惹かれましたが、大学では、より関心のあった生命科学・薬学を選びました。",
  "大学では学部2年次から実験系研究室に所属し、神経変性疾患に関わる遺伝子変異と分子病態を研究してきました。その一方で、生成AIとコーディングエージェントの急速な進歩をきっかけに、研究データ解析からフルスタック開発へと領域を広げ、ソフトウェア開発にも再び軸足を置くようになりました。",
  "そこで実感したのは、AIの価値は単にコーディングを高速化することではなく、一人の人間が設計・実装できるシステムの規模を拡張することにあるという点です。",
  "この考えを最初に形にしたのが、現在のCOMPASS Platformにつながる開発です。当初は、学生向け資料を共有するGoogle Driveの招待や名簿管理を自動化する小さな仕組みでした。その後、学生支援団体COMPASSの設立、大学講義支援システムCOMPASS Interactiveの開発へと対象を広げてきました。",
  "現在は、生命科学研究を継続しながら、教育・研究支援システムの開発、研究OSの構築、ITベンチャーでのエンジニアリングにも取り組んでいます。研究現場の課題を理解し、それを要件へ落とし込み、実装可能なシステムへ変換することが、現在の私のエンジニアリングの中心です。",
  "私が長期的に取り組んでいるテーマは、大きく二つあります。",
  "一つは、学生が自分の可能性を知り、将来の選択肢を広げられる仕組みをつくることです。能力や意欲があっても、情報や機会へのアクセスによって選択肢は大きく変わります。COMPASSでは、教育やキャリアに関する機会を、偶然だけに左右されにくい構造へ変えていくことを目指しています。",
  "もう一つは、AIとソフトウェアによって、生命科学研究の生産性と研究環境そのものを再設計することです。",
  "実験研究では、不確実性の高い仮説検証に多くの時間と認知資源が必要です。一方、ソフトウェア開発では、AIによって情報処理、実装、検証の速度が大きく変わりました。私はこの二つの現場を同時に経験してきたからこそ、その間にまだ大きな未開拓領域があると考えています。",
  "私が目指しているのは、研究者として生命科学の課題を理解し、エンジニアとして、その解決を支えるシステムを実装することです。一人の研究成果だけでなく、多くの研究者の生産性や研究体験を改善することで、より大きなスケールで生命科学に貢献することを目指しています。",
  "そのため、生命科学、ソフトウェア開発、AIのいずれか一つに自分を限定するのではなく、研究とエンジニアリングのインターフェースを自分の専門領域として深めることを目指しています。",
  "生命科学研究、ソフトウェア開発、大学教育、英語学習。扱う領域は異なりますが、根底にある考え方は共通しています。",
  "人が持つ能力や知識を、より大きな成果につなげる仕組みをつくること。",
  "それを実現することが、私が目標とする未来です。"
], "Founder fixed personal statement");

for (const expected of [
  'id="developer-top"',
  'id="stack"',
  'id="architecture"',
  'id="security"',
  'id="decisions"',
  'id="verification"',
  'id="classroom-validation"',
  'id="codebase"',
  'id="developer-profile"',
  'id="developer-final"',
  "One real-time foundation",
  "Web、DB、Edge、Windowsを、ひとつのコードベースでつなぐ。",
  "748",
  "56",
  "31",
  "43",
  "18",
  "x86 + x64",
  "匿名参加でも、権限は曖昧にしない。",
  "75 / 75",
  "WebからWindowsまで、単一リポジトリで管理。",
  "専門領域を超え、COMPASSシリーズを一つの体験で貫く。",
  "/INTRO_Interactive/developers/opengraph-image-",
  "/INTRO_Interactive/developers/twitter-image-",
  'rel="canonical" href="https://compass-official.pages.dev/INTRO_Interactive/developers/"'
]) expectIncludes(interactiveDevelopers, expected, "Interactive developer page");

for (const unexpected of [
  'class="developer-codebase__metrics"',
  '<th scope="col">Files</th>'
]) expectExcludes(interactiveDevelopers, unexpected, "Interactive developer codebase section");

for (const unexpected of [
  "学びの熱を、",
  "ESSAY: AI時代に、専門性を「実装」するということ",
  "教育体験を支える、統合技術基盤",
  "変更を、安心して積み重ねるために。",
  'property="og:image" content="https://compass-official.pages.dev/images/hero.desktop.highlight.png"',
  'id="educational-design"',
  'id="developer-message"',
  'id="quality-assurance"'
]) expectExcludes(interactiveDevelopers, unexpected, "Interactive developer page");

expectOneH1(interactiveDevelopers, "Interactive developer page");

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
  "お問い合わせ",
  "COMPASSおよび代表（松井）へのお問い合わせ・ご連絡を受け付けています。",
  "送信いただいた内容は、代表（松井）が確認し、必要に応じて返信いたします。",
  "学生・教職員・研究者・団体・企業の方を問わず、どうぞお気軽にご連絡ください。",
  "お名前",
  "学部・学科 / 所属",
  "メールアドレス",
  "メールアドレスの確認",
  "お問い合わせ内容",
  "ご質問、ご相談、ご依頼、ご提案など、内容を自由にご記入ください。",
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
  "Don’t Just Learn. Build What’s Next.",
  "COMPASS source code on GitHub",
  'data-ui-variant="root"'
]) expectIncludes(contact, expected, "Contact root footer UI");

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
  "For testing only.",
  "COMPASS お問い合わせフォーム",
  "参加希望、企画のご提案"
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
  "founder/index.html",
  "future-strategy-library/index.html",
  "library-registration/index.html",
  "library-registration/admin/index.html",
  "images/compass-mark.svg",
  "images/future-strategy-library/knowledge-horizon-og.png",
  "images/future-strategy-library/why-english.webp",
  "images/future-strategy-library/ai-guide-sanitized.webp",
  "images/future-strategy-library/research-career.webp",
  "images/founder-portfolio/yuto-matsui-profile-hero.webp",
  "images/founder-portfolio/yuto-matsui-queens-square.webp",
  "images/founder-portfolio/yuto-matsui-front.webp",
  "images/founder-portfolio/yuto-matsui-education-support.webp",
  "images/founder-portfolio/yuto-matsui-lab-hero.webp",
  "images/founder-portfolio/off-hours-drive.webp",
  "images/founder-portfolio/off-hours-shogi.webp",
  "images/founder-portfolio/off-hours-climbing.webp",
  "images/founder-portfolio/fragments/yuto-695-1566.webp",
  "images/founder-portfolio/fragments/yuto-696-1566.webp",
  "images/founder-portfolio/fragments/yuto-697-1044.webp",
  "images/founder-portfolio/fragments/yuto-698-1566.webp",
  "images/founder-portfolio/fragments/yuto-699-1044.webp",
  "images/founder-portfolio/fragments/yuto-700-1477.webp",
  "images/founder-portfolio/fragments/yuto-701-1108.webp",
  "images/founder-portfolio/fragments/yuto-703-1044.webp",
  "images/founder-portfolio/fragments/yuto-704-1372.webp",
  "images/founder-portfolio/fragments/yuto-706-1044.webp",
  "images/founder-portfolio/fragments/yuto-707-1477.webp",
  "images/founder-portfolio/fragments/dna-automation-1920.webp",
  "images/founder-portfolio/fragments/pipette-1920.webp",
  "images/founder-portfolio/fragments/code-window-1920.webp",
  "images/founder-portfolio/fragments/code-terminal-1920.webp",
  "images/founder-portfolio/fragments/code-data-1920.webp",
  "images/founder-portfolio/fragments/servers-1920.webp",
  "images/founder-portfolio/fragments/microfluidic-1920.webp",
  "images/founder-portfolio/fragments/silicon-wafer-1920.webp",
  "images/founder-portfolio/source/life-science-unsplash.jpg",
  "images/founder-portfolio/source/ai-abstract-unsplash.jpg",
  "images/founder-portfolio/source/software-development-unsplash.jpg",
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
