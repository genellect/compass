import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { PUBLIC_SOURCE_RULES } from "./verify-public-source-boundary.mjs";

const execFileAsync = promisify(execFile);
const MAX_BLOB_BYTES = 10 * 1024 * 1024;
const COMMIT_SEPARATOR = "\u001e";
const FIELD_SEPARATOR = "\u001f";

const HISTORY_ONLY_RULES = Object.freeze([
  [
    "postgres_credential_url",
    /postgres(?:ql)?(?:\+psycopg)?:\/\/[^\s:'"@]+:[^\s:'"@]+@[^\s:'"]+/i
  ],
  ["google_oauth_client_id_identifier", /[0-9]{6,}-[0-9A-Za-z_-]{20,}\.apps\.googleusercontent\.com/],
  ["google_service_account_json", /"type"\s*:\s*"service_account"[\s\S]{0,4096}"private_key"\s*:/i],
  ["slack_token", /xox[baprs]-[0-9A-Za-z-]{20,}/],
  ["stripe_live_secret", /sk_live_[0-9A-Za-z]{16,}/]
]);

const RULES = Object.freeze([...PUBLIC_SOURCE_RULES, ...HISTORY_ONLY_RULES]);

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}

function parseReachableObjects(output) {
  const objects = new Map();
  for (const line of output.split(/\r?\n/u)) {
    const match = /^([0-9a-f]{40,64})(?:\s+(.*))?$/u.exec(line);
    if (!match) continue;
    const [, oid, rawPath = ""] = match;
    if (!objects.has(oid)) objects.set(oid, normalizePath(rawPath));
  }
  return objects;
}

async function readBatchObjects({ root, objects, onBlob }) {
  const child = spawn("git", ["cat-file", "--batch"], {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"]
  });
  const stderrChunks = [];
  child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
  const exitPromise = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  child.stdin.end(`${[...objects.keys()].join("\n")}\n`);

  let pending = Buffer.alloc(0);
  let current = null;
  let scannedBlobCount = 0;
  let skippedLargeBlobCount = 0;

  for await (const chunk of child.stdout) {
    pending = Buffer.concat([pending, chunk]);
    while (true) {
      if (current === null) {
        const newline = pending.indexOf(0x0a);
        if (newline === -1) break;
        const header = pending.subarray(0, newline).toString("ascii");
        pending = pending.subarray(newline + 1);
        const match = /^([0-9a-f]{40,64})\s+(\S+)\s+(\d+)$/u.exec(header);
        if (!match) throw new Error("Unexpected git cat-file batch header.");
        current = { oid: match[1], type: match[2], size: Number(match[3]) };
      }

      if (pending.length < current.size + 1) break;
      const contents = pending.subarray(0, current.size);
      pending = pending.subarray(current.size + 1);
      if (current.type === "blob") {
        if (current.size > MAX_BLOB_BYTES) {
          skippedLargeBlobCount += 1;
        } else {
          scannedBlobCount += 1;
          await onBlob({
            oid: current.oid,
            path: objects.get(current.oid) ?? "",
            contents
          });
        }
      }
      current = null;
    }
  }

  const exitCode = await exitPromise;
  if (exitCode !== 0) {
    throw new Error(
      `git cat-file failed (${exitCode}): ${Buffer.concat(stderrChunks).toString("utf8").trim()}`
    );
  }
  if (current !== null || pending.length !== 0) {
    throw new Error("Incomplete git cat-file batch response.");
  }
  return { scannedBlobCount, skippedLargeBlobCount };
}

export function matchingRuleValues(contents) {
  const text = contents.toString("utf8");
  return RULES.flatMap(([rule, pattern]) => {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const matcher = new RegExp(pattern.source, flags);
    return [...text.matchAll(matcher)].map((match) => ({ rule, value: match[0] }));
  });
}

export function classifyValue(rule, value) {
  if (rule === "hardcoded_gas_recipient" || rule === "committed_admin_allowlist") {
    const domain = /@([^"'\s]+)/u.exec(value)?.[1]?.toLowerCase() ?? "";
    const localPart = /["']([^"'@]+)@/u.exec(value)?.[1]?.toLowerCase() ?? "";
    if (/^(?:example\.(?:com|net|org|invalid)|invalid)$/u.test(domain)) {
      return "reserved_example";
    }
    if (/^(?:gmail\.com|outlook\.com|hotmail\.com|yahoo\.)/u.test(domain)) {
      return "consumer_mail";
    }
    if (/^(?:admin|test|fake|example|noreply|no-reply)$/u.test(localPart)) {
      return "generic_role_address";
    }
    return "apparently_real_other";
  }
  if (rule === "postgres_credential_url" || rule === "neon_credential_url") {
    if (
      /\$\{[A-Z0-9_]+\}|\{[a-z_][a-z0-9_]*\}|<[^>]+>|%[A-Z0-9_]+%/iu.test(value)
    ) {
      return "template_placeholder";
    }
    const rawHost = /@([^/?#\s'")]+)/u.exec(value)?.[1]?.toLowerCase() ?? "";
    const host = rawHost.replace(/:\d+$/u, "");
    if (
      ["localhost", "127.0.0.1", "postgres", "db", "database"].includes(host)
      || (!host.includes(".") && /^[a-z0-9_-]+$/u.test(host))
    ) {
      return "local_or_container";
    }
    if (
      /(?:^|\.)example\.(?:com|net|org)$/u.test(host)
      || host.endsWith(".invalid")
    ) {
      return "reserved_example";
    }
    if (host.endsWith(".neon.tech")) return "neon_external";
    return "other_external";
  }
  if (rule === "google_oauth_client_id_identifier") {
    return /(?:test|mock|example|fake)/iu.test(value) || /^(?:123456|000000)/u.test(value)
      ? "synthetic_identifier"
      : "apparently_real_identifier";
  }
  if (rule === "absolute_windows_user_path") return "local_user_path";
  return "high_confidence_secret_pattern";
}

export function severityFor(rule, classification) {
  if (rule === "google_oauth_client_id_identifier") return "info";
  if (rule === "absolute_windows_user_path") return "review";
  if (rule === "hardcoded_gas_recipient" || rule === "committed_admin_allowlist") {
    return classification === "reserved_example" ? "info" : "review";
  }
  if (rule === "postgres_credential_url") {
    if (
      ["local_or_container", "reserved_example", "template_placeholder"].includes(classification)
    ) {
      return "info";
    }
    return "review";
  }
  return "high";
}

async function introductionCommit(root, oid) {
  const { stdout } = await execFileAsync(
    "git",
    ["log", "--all", `--find-object=${oid}`, "--format=%H", "--reverse"],
    { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
  return stdout.split(/\r?\n/u).find(Boolean) ?? "unknown";
}

async function scanCommitMessages(root) {
  const { stdout } = await execFileAsync(
    "git",
    ["log", "--all", `--format=%H%x1f%B%x1e`],
    { cwd: root, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 }
  );
  const findings = [];
  for (const record of stdout.toString("utf8").split(COMMIT_SEPARATOR)) {
    const separator = record.indexOf(FIELD_SEPARATOR);
    if (separator === -1) continue;
    const commit = record.slice(0, separator).trim();
    const message = Buffer.from(record.slice(separator + 1), "utf8");
    if (!/^[0-9a-f]{40,64}$/u.test(commit)) continue;
    for (const { rule, value } of matchingRuleValues(message)) {
      findings.push({
        scope: "commit_message",
        rule,
        classification: classifyValue(rule, value),
        valueFingerprint: createHash("sha256").update(value).digest("hex"),
        commit,
        blob: "-",
        path: "-"
      });
    }
  }
  return findings;
}

export async function scanReachableGitHistory({ root = process.cwd() } = {}) {
  const [{ stdout: objectOutput }, { stdout: commitOutput }] = await Promise.all([
    execFileAsync("git", ["rev-list", "--objects", "--all"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024
    }),
    execFileAsync("git", ["rev-list", "--all"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024
    })
  ]);
  const objects = parseReachableObjects(objectOutput);
  const blobMatches = [];
  const counts = await readBatchObjects({
    root,
    objects,
    onBlob: async ({ oid, path: blobPath, contents }) => {
      for (const { rule, value } of matchingRuleValues(contents)) {
        blobMatches.push({
          scope: "blob",
          rule,
          classification: classifyValue(rule, value),
          valueFingerprint: createHash("sha256").update(value).digest("hex"),
          oid,
          path: blobPath
        });
      }
    }
  });
  const uniqueBlobMatches = [
    ...new Map(
      blobMatches.map((finding) => [
        `${finding.rule}\u0000${finding.classification}\u0000${finding.valueFingerprint}\u0000${finding.oid}\u0000${finding.path}`,
        finding
      ])
    ).values()
  ];
  const blobFindings = await Promise.all(
    (() => {
      const introductionCache = new Map();
      return uniqueBlobMatches.map(async (finding) => {
        if (!introductionCache.has(finding.oid)) {
          introductionCache.set(finding.oid, introductionCommit(root, finding.oid));
        }
        return {
          scope: finding.scope,
          rule: finding.rule,
          classification: finding.classification,
          valueFingerprint: finding.valueFingerprint,
          commit: await introductionCache.get(finding.oid),
          blob: finding.oid,
          path: finding.path || "-"
        };
      });
    })()
  );
  const commitFindings = await scanCommitMessages(root);
  const findings = [...blobFindings, ...commitFindings]
    .map((finding) => ({
      ...finding,
      severity: severityFor(finding.rule, finding.classification)
    }))
    .sort((left, right) =>
      `${left.severity}\u0000${left.rule}\u0000${left.commit}\u0000${left.blob}\u0000${left.path}`.localeCompare(
        `${right.severity}\u0000${right.rule}\u0000${right.commit}\u0000${right.blob}\u0000${right.path}`
      )
    );
  return {
    reachableCommitCount: commitOutput.split(/\r?\n/u).filter(Boolean).length,
    reachableObjectCount: objects.size,
    ...counts,
    findings
  };
}

export async function runHistoryScanCli({
  root = process.cwd(),
  summaryOnly = false,
  failOnReview = false
} = {}) {
  const result = await scanReachableGitHistory({ root: path.resolve(root) });
  console.log(`reachable_commits=${result.reachableCommitCount}`);
  console.log(`reachable_objects=${result.reachableObjectCount}`);
  console.log(`scanned_blobs=${result.scannedBlobCount}`);
  console.log(`skipped_blobs_over_10MiB=${result.skippedLargeBlobCount}`);
  console.log(`findings=${result.findings.length}`);
  const classificationCounts = new Map();
  const classificationValues = new Map();
  for (const finding of result.findings) {
    const key = `${finding.severity}\u0000${finding.rule}\u0000${finding.classification}`;
    classificationCounts.set(key, (classificationCounts.get(key) ?? 0) + 1);
    if (!classificationValues.has(key)) classificationValues.set(key, new Set());
    classificationValues.get(key).add(finding.valueFingerprint);
  }
  for (const [key, count] of [...classificationCounts].sort()) {
    const [severity, rule, classification] = key.split("\u0000");
    console.log(
      `summary severity=${severity} rule=${rule} classification=${classification} findings=${count} distinct_values=${classificationValues.get(key).size}`
    );
  }
  if (!summaryOnly) {
    for (const finding of result.findings) {
      console.log(
        `scope=${finding.scope} severity=${finding.severity} rule=${finding.rule} classification=${finding.classification} commit=${finding.commit} blob=${finding.blob} path=${finding.path}`
      );
    }
  }
  const blockingFindings = result.findings.filter(
    ({ severity }) => severity === "high" || (failOnReview && severity === "review")
  );
  console.log(`blocking_findings=${blockingFindings.length}`);
  return { ...result, blockingFindingCount: blockingFindings.length };
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  const result = await runHistoryScanCli({
    summaryOnly: process.argv.includes("--summary-only"),
    failOnReview: process.argv.includes("--fail-on-review")
  });
  if (result.blockingFindingCount > 0) process.exitCode = 1;
}
