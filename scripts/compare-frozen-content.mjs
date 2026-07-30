import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const originalRoot = process.argv[2];
if (!originalRoot) throw new Error("Pass the original COMPASS directory as the first argument.");
const originalHtmlPath = process.argv[3] ?? path.join(originalRoot, "index.html");

const projectRoot = process.cwd();
const distRoot = path.join(projectRoot, "out");
const frozenDirectories = ["future-strategy-library"];
const ignoredSegments = new Set(["node_modules", "dist", ".build", ".git"]);

async function fileMap(root) {
  const result = new Map();

  async function visit(directory, relative = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (ignoredSegments.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      const nextRelative = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute, nextRelative);
      } else if (entry.isFile()) {
        const bytes = await readFile(absolute);
        result.set(nextRelative, createHash("sha256").update(bytes).digest("hex"));
      }
    }
  }

  await visit(root);
  return result;
}

function assertSameMap(label, expected, actual) {
  const keys = new Set([...expected.keys(), ...actual.keys()]);
  const differences = [...keys].filter((key) => expected.get(key) !== actual.get(key));
  if (differences.length) {
    throw new Error(`${label} changed: ${differences.slice(0, 8).join(", ")}`);
  }
}

for (const directory of frozenDirectories) {
  const original = await fileMap(path.join(originalRoot, directory));
  const source = await fileMap(path.join(projectRoot, directory));
  const built = await fileMap(path.join(distRoot, directory));
  assertSameMap(`${directory} source`, original, source);
  assertSameMap(`${directory} dist`, original, built);
  console.log(`${directory}: ${original.size} frozen files unchanged`);
}

const originalHtml = await readFile(originalHtmlPath, "utf8");
const builtHtml = await readFile(path.join(distRoot, "index.html"), "utf8");

function uniqueMatches(html, expression) {
  return [...new Set([...html.matchAll(expression)].map((match) => match[1]))].sort();
}

function assertSameList(label, expected, actual) {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    const expectedSet = new Set(expected);
    const actualSet = new Set(actual);
    const removed = expected.filter((item) => !actualSet.has(item));
    const added = actual.filter((item) => !expectedSet.has(item));
    throw new Error(`${label} changed; removed=[${removed}] added=[${added}]`);
  }
}

assertSameList(
  "Anchor destinations",
  uniqueMatches(originalHtml, /<a\b[^>]*\bhref="([^"]+)"/gi),
  uniqueMatches(builtHtml, /<a\b[^>]*\bhref="([^"]+)"/gi)
);

assertSameList(
  "Document IDs",
  uniqueMatches(originalHtml.replace(/<script[\s\S]*?<\/script>/gi, ""), /\bid="([^"]+)"/gi).filter((id) => id !== "app"),
  uniqueMatches(builtHtml.replace(/<script[\s\S]*?<\/script>/gi, ""), /\bid="([^"]+)"/gi)
);

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function normalizedPostHeroText(html) {
  const start = html.indexOf('<section id="vision"');
  if (start < 0) throw new Error("Vision section was not found.");
  return decodeEntities(
    html
      .slice(start)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

if (normalizedPostHeroText(originalHtml) !== normalizedPostHeroText(builtHtml)) {
  throw new Error("Text after the Hero differs from the frozen original.");
}

console.log("Anchor destinations, IDs, and all post-Hero text are unchanged.");
