import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

const TEXT_FILE = /(?:^|\/)(?:Dockerfile(?:\.[^/]+)?|_headers|_redirects|\.env(?:\.[^/]+)?|\.dev\.vars(?:\.[^/]+)?|\.npmrc|\.pypirc|\.netrc)$|\.(?:cfg|conf|css|hcl|html|ini|js|json|key|mjs|md|pem|properties|py|ps1|sql|tf|toml|ts|tsx|txt|xml|ya?ml)$/i;
const PRIVATE_DATA_FILE = /\.(?:backup|csv|db|dump|ods|sqlite3?|tfstate|tfvars(?:\.json)?|tsv|xlsx?)$/i;
const PRIVATE_CONFIG_FILE = /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.dev\.vars(?:\.[^/]*)?|\.netrc|\.pypirc)$/i;
const GENERATED_ARTIFACT_PREFIX = /^(?:\.next(?:-[^/]+)?|out|outputs|__pycache__)(?:\/|$)/;

export const PUBLIC_SOURCE_RULES = Object.freeze([
  ["private_key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["neon_password", /npg_[A-Za-z0-9]{8,}/],
  ["neon_credential_url", /postgres(?:ql)?(?:\+psycopg)?:\/\/[^\s:'"@]+:[^\s:'"@]+@[^\s:'"]*\.neon\.tech(?:[/?#][^\s'"]*)?/i],
  ["google_client_secret", /GOCSPX-[A-Za-z0-9_-]{10,}/],
  ["google_api_key", /AIza[0-9A-Za-z_-]{35}/],
  ["oauth_refresh_token", /1\/\/[0-9A-Za-z_-]{20,}/],
  ["oauth_access_token", /ya29\.[0-9A-Za-z_-]{20,}/],
  ["openai_api_key", /sk-(?:proj-)?[0-9A-Za-z_-]{20,}/],
  ["aws_access_key", /AKIA[0-9A-Z]{16}/],
  ["github_token", /gh[pousr]_[0-9A-Za-z]{20,}/],
  ["absolute_windows_user_path", /[A-Z]:[\\/]Users[\\/][^\\/\s'"]+/i],
  [
    "committed_admin_allowlist",
    /^\s*(?:GOOGLE_ADMIN_ALLOWED_EMAILS|admin_allowed_emails)\s*[:=]\s*["']?[^#\r\n]*@(?!(?:example\.)?invalid\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}[^\r\n]*$/m
  ],
  ["hardcoded_gas_recipient", /\b(?:ADMIN_EMAIL|ADMIN_RECIPIENT_EMAIL)\s*[:=]\s*["'][^"']+@[^"']+["']/i]
]);

export function publicSourceFindings(entries) {
  const findings = [];
  for (const { file, contents, tracked = false } of entries) {
    if (PRIVATE_DATA_FILE.test(file)) {
      findings.push({ file, rule: "private_data_artifact" });
    }
    if (tracked && GENERATED_ARTIFACT_PREFIX.test(file)) {
      findings.push({ file, rule: "tracked_generated_artifact" });
    }
    if (
      tracked
      && PRIVATE_CONFIG_FILE.test(file)
      && !file.toLowerCase().endsWith(".example")
    ) {
      findings.push({ file, rule: "tracked_private_configuration" });
    }
    if (
      file.startsWith(".github/workflows/")
      && /^\s*(?:-\s*)?uses:\s*(?!\.\/)[^@\r\n]+@(?![0-9a-f]{40}(?:\s|#|$))[^\r\n]+$/im.test(contents)
    ) {
      findings.push({ file, rule: "unpinned_github_action" });
    }
    if (
      /(?:^|\/)Dockerfile(?:\.[^/]+)?$/i.test(file)
      && /^FROM\s+(?:--platform=\S+\s+)?[A-Za-z0-9._/-]+:[^\s@]+(?:\s+AS\s+\S+)?$/im.test(contents)
    ) {
      findings.push({ file, rule: "unpinned_docker_base" });
    }
    for (const [rule, pattern] of PUBLIC_SOURCE_RULES) {
      if (pattern.test(contents)) findings.push({ file, rule });
    }
  }
  return findings;
}

async function gitFileList(root, args) {
  const { stdout } = await execFileAsync("git", [...args, "-z"], {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 16 * 1024 * 1024
  });
  return stdout
    .toString("utf8")
    .split("\0")
    .map((value) => value.replaceAll("\\", "/"))
    .filter(Boolean);
}

async function sourceFiles(root) {
  const tracked = await gitFileList(root, ["ls-files", "--cached"]);
  const untracked = await gitFileList(root, [
    "ls-files",
    "--others",
    "--exclude-standard"
  ]);
  const selected = new Map();
  for (const file of tracked) {
    if (TEXT_FILE.test(file) || PRIVATE_DATA_FILE.test(file) || GENERATED_ARTIFACT_PREFIX.test(file)) {
      selected.set(file, { file, tracked: true });
    }
  }
  for (const file of untracked) {
    if (TEXT_FILE.test(file) || PRIVATE_DATA_FILE.test(file)) {
      selected.set(file, { file, tracked: false });
    }
  }
  return [...selected.values()].sort((left, right) => left.file.localeCompare(right.file));
}

export async function verifyPublicSourceBoundary({ root = process.cwd() } = {}) {
  const files = await sourceFiles(root);
  if (files.length === 0) throw new Error("No public source files were selected.");
  const entries = await Promise.all(files.map(async ({ file, tracked }) => ({
    file,
    tracked,
    contents: await readFile(path.join(root, file), "utf8")
  })));
  const findings = publicSourceFindings(entries);
  if (findings.length > 0) {
    const sanitized = findings.map(({ file, rule }) => `${file} [${rule}]`);
    throw new Error(`Public source boundary findings: ${sanitized.join(", ")}`);
  }
  return { inspectedFileCount: files.length, findingCount: 0 };
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  const result = await verifyPublicSourceBoundary();
  console.log(
    `Verified ${result.inspectedFileCount} public source files; found 0 high-confidence private-material patterns.`
  );
}
