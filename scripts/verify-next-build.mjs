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

for (const expected of [
  '<html lang="ja"',
  "Better Education.",
  "Better Decisions.",
  'id="vision"',
  'id="experience"',
  'id="technology"',
  'id="products"',
  'id="resources"',
  'id="workshops"',
  'id="founder"',
  'id="education"',
  'id="community"',
  'id="contact"',
  'href="messages/index.html"',
  'href="INTRO_Interactive/"',
  'rel="canonical" href="https://compass-official.pages.dev/"',
  'type="application/ld+json"',
  "次の1歩は、",
  "ここから始まる。",
  "わからないが、",
  "動き出す。",
  "未来を体験する",
  "まだ知らない未来を見る",
  "薬学部生以外の方はこちら",
  "ひとりでは、",
  "たどり着けない場所へ。",
  "面白そうなので、",
  "始めました。",
  "Web開発・プログラミング 4年",
  "学生主導の教育・テクノロジープラットフォーム",
  "G-EHKJ8B8N0Y"
]) expectIncludes(official, expected, "Official page");

for (const unexpected of [
  "β版",
  "E2E",
  "フロントエンド",
  "バックエンド",
  "フルスタック",
  "Developer Portfolio",
  "Collaboration",
  "For Faculty",
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
  "資料が届く。疑問を送れる。理解を確かめられる。講義のあとも振り返れる。"
]) expectExcludes(official, unexpected, "Official page");

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

for (const relative of [
  "messages/index.html",
  "future-strategy-library/index.html",
  "images/compass-mark.svg",
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
