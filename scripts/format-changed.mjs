// Prettier for changed files only. The repository is not bulk-formatted yet,
// so a whole-file rewrite of an untouched legacy file would bury the real
// change and collide with parallel branches.
//
//   node scripts/format-changed.mjs [base] [--write] [--include-legacy]
//
// Changed files = committed changes since merge-base(base, HEAD) plus staged,
// unstaged and untracked files. base defaults to origin/main.
//
// Check mode fails for a file that is new, or that already matched Prettier at
// the merge-base and no longer does. A modified file that never matched
// Prettier ("legacy") is reported as a warning only.
// --write formats new and already-formatted files; --include-legacy also
// rewrites legacy files in full.
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import * as prettier from "prettier";

const args = process.argv.slice(2);
const write = args.includes("--write");
const includeLegacy = args.includes("--include-legacy");
const base = args.find((arg) => !arg.startsWith("--")) ?? "origin/main";
const root = git(["rev-parse", "--show-toplevel"]).trim();
const github = process.env.GITHUB_ACTIONS === "true";

function git(gitArgs, options = {}) {
  return execFileSync("git", gitArgs, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

function lines(output) {
  return output.split("\n").filter(Boolean);
}

let mergeBase;
try {
  mergeBase = git(["merge-base", base, "HEAD"]).trim();
} catch {
  console.error(`Cannot find a merge-base with "${base}". Fetch it first or pass another base.`);
  process.exit(2);
}

const changed = new Set([
  ...lines(git(["diff", "--name-only", "--diff-filter=ACMR", `${mergeBase}...HEAD`])),
  ...lines(git(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"])),
  ...lines(git(["ls-files", "--others", "--exclude-standard"])),
]);

async function isFormatted(source, file, options) {
  try {
    return await prettier.check(source, { ...options, filepath: file });
  } catch {
    return false;
  }
}

function baseSource(file) {
  try {
    return git(["show", `${mergeBase}:${file}`], { stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null; // added in this change
  }
}

const failures = [];
const legacy = [];
const formatted = [];
let considered = 0;

for (const file of [...changed].sort()) {
  const absolute = path.join(root, file);
  const info = await prettier.getFileInfo(absolute, {
    ignorePath: path.join(root, ".prettierignore"),
  });
  if (info.ignored || !info.inferredParser) continue;
  let source;
  try {
    source = await readFile(absolute, "utf8");
  } catch {
    continue; // deleted in the working tree
  }
  considered++;
  const options = (await prettier.resolveConfig(absolute, { editorconfig: true })) ?? {};
  if (await isFormatted(source, file, options)) continue;

  const previous = baseSource(file);
  const isLegacy = previous !== null && !(await isFormatted(previous, file, options));
  if (write && (!isLegacy || includeLegacy)) {
    await writeFile(absolute, await prettier.format(source, { ...options, filepath: file }));
    formatted.push(file);
  } else if (isLegacy) {
    legacy.push(file);
  } else {
    failures.push(file);
  }
}

console.log(
  `Prettier: ${considered} changed file(s) in scope since ${mergeBase.slice(0, 12)} (${base}).`,
);
for (const file of formatted) console.log(`formatted  ${file}`);
for (const file of legacy) {
  const message = `${file} predates Prettier; left as is (${write ? "pass --include-legacy to rewrite it" : "not enforced"}).`;
  console.log(github ? `::warning file=${file}::${message}` : `legacy     ${message}`);
}
for (const file of failures) {
  const message = `${file} is not Prettier-formatted. Run: npm run format:changed`;
  console.log(github ? `::error file=${file}::${message}` : `error      ${message}`);
}
process.exit(failures.length ? 1 : 0);
