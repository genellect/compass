import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { scanReachableGitHistory } from "../scripts/scan-git-history-secrets.mjs";

const execFileAsync = promisify(execFile);

async function git(root, args) {
  await execFileAsync("git", args, { cwd: root, encoding: "utf8" });
}

test("history scan finds a deleted secret without returning its value", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "fsl-history-scan-"));
  const secret = `npg_${"S".repeat(24)}`;
  try {
    await git(root, ["init", "--quiet"]);
    await git(root, ["config", "user.name", "Security Test"]);
    await git(root, ["config", "user.email", "security-test@example.invalid"]);
    await writeFile(path.join(root, "config.txt"), `DATABASE_TOKEN=${secret}\n`, "utf8");
    await git(root, ["add", "config.txt"]);
    await git(root, ["commit", "--quiet", "-m", "fixture with deleted value"]);
    await writeFile(path.join(root, "config.txt"), "DATABASE_TOKEN=removed\n", "utf8");
    await git(root, ["add", "config.txt"]);
    await git(root, ["commit", "--quiet", "-m", "remove fixture value"]);

    const result = await scanReachableGitHistory({ root });
    const finding = result.findings.find(({ rule }) => rule === "neon_password");
    assert.ok(finding);
    assert.equal(finding.severity, "high");
    assert.equal(finding.path, "config.txt");
    assert.match(finding.commit, /^[0-9a-f]{40}$/u);
    assert.match(finding.blob, /^[0-9a-f]{40}$/u);
    assert.ok(!JSON.stringify(result).includes(secret));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
