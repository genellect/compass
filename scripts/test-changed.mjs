// Run only the Vitest unit tests affected by the current change.
//
//   node scripts/test-changed.mjs [base] [extra vitest args]
//
// base defaults to origin/main. Vitest follows the module graph from files
// changed since merge-base(base, HEAD), including uncommitted files. A change
// to package.json, a lockfile or vitest.config.* reruns the whole suite
// (Vitest forceRerunTriggers). node:test files (`npm run test:library-release-gate`)
// are outside Vitest and are not selected here.
import { execFileSync, spawnSync } from "node:child_process";
import process from "node:process";

const args = process.argv.slice(2);
const base = args[0] && !args[0].startsWith("-") ? args.shift() : "origin/main";

let since;
try {
  since = execFileSync("git", ["merge-base", base, "HEAD"], { encoding: "utf8" }).trim();
} catch {
  console.error(`Cannot find a merge-base with "${base}". Fetch it first or pass another base.`);
  process.exit(2);
}

console.log(`Vitest: tests related to changes since ${since.slice(0, 12)} (${base}).`);
const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["vitest", "run", "--changed", since, "--passWithNoTests", ...args],
  { stdio: "inherit", shell: process.platform === "win32" },
);
process.exit(result.status ?? 1);
