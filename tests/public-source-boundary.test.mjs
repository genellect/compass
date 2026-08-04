import assert from "node:assert/strict";
import test from "node:test";
import {
  publicSourceFindings,
  verifyPublicSourceBoundary
} from "../scripts/verify-public-source-boundary.mjs";

test("public source boundary passes the current Git-visible source set", async () => {
  const result = await verifyPublicSourceBoundary();
  assert.equal(result.findingCount, 0);
  assert.ok(result.inspectedFileCount > 100);
});

test("public source boundary reports only paths and rule identifiers", () => {
  const value = `npg_${"R".repeat(16)}`;
  const findings = publicSourceFindings([
    { file: "reserved-fixture.txt", contents: value }
  ]);
  assert.deepEqual(findings, [
    { file: "reserved-fixture.txt", rule: "neon_password" }
  ]);
  assert.ok(!JSON.stringify(findings).includes(value));
});

test("public source boundary rejects a literal admin email allowlist but permits secret references", () => {
  const literal = publicSourceFindings([
    {
      file: ".env.production",
      contents: "GOOGLE_ADMIN_ALLOWED_EMAILS=owner@example.com\n"
    }
  ]);
  assert.deepEqual(literal, [
    { file: ".env.production", rule: "committed_admin_allowlist" }
  ]);

  const secretReference = publicSourceFindings([
    {
      file: "main.tf",
      contents: "GOOGLE_ADMIN_ALLOWED_EMAILS = { secret = var.secret_ids.admin_allowed_emails }\n"
    }
  ]);
  assert.deepEqual(secretReference, []);
});

test("public source boundary rejects registry dumps and tracked build output", () => {
  const findings = publicSourceFindings([
    { file: "private/roster.xlsx", contents: "", tracked: false },
    { file: "infra/production.tfvars", contents: "", tracked: true },
    { file: "infra/terraform.tfstate", contents: "", tracked: true },
    { file: "out/index.html", contents: "safe", tracked: true }
  ]);
  assert.deepEqual(findings, [
    { file: "private/roster.xlsx", rule: "private_data_artifact" },
    { file: "infra/production.tfvars", rule: "private_data_artifact" },
    { file: "infra/terraform.tfstate", rule: "private_data_artifact" },
    { file: "out/index.html", rule: "tracked_generated_artifact" }
  ]);
});

test("public workflows accept immutable action SHAs and reject mutable tags", () => {
  const mutable = publicSourceFindings([
    {
      file: ".github/workflows/example.yml",
      contents: "      - uses: actions/checkout@v6\n"
    }
  ]);
  assert.deepEqual(mutable, [
    { file: ".github/workflows/example.yml", rule: "unpinned_github_action" }
  ]);

  const immutable = publicSourceFindings([
    {
      file: ".github/workflows/example.yml",
      contents: `      - uses: actions/checkout@${"a".repeat(40)} # v6\n`
    }
  ]);
  assert.deepEqual(immutable, []);
});

test("public Dockerfiles require immutable external base-image digests", () => {
  const mutable = publicSourceFindings([
    {
      file: "services/example/Dockerfile",
      contents: "FROM python:3.12-slim-bookworm AS production\nFROM production AS app\n"
    }
  ]);
  assert.deepEqual(mutable, [
    { file: "services/example/Dockerfile", rule: "unpinned_docker_base" }
  ]);

  const immutable = publicSourceFindings([
    {
      file: "services/example/Dockerfile",
      contents: `FROM python:3.12-slim-bookworm@sha256:${"a".repeat(64)} AS production\nFROM production AS app\n`
    }
  ]);
  assert.deepEqual(immutable, []);
});

test("tracked dotenv and credential helper files fail by file type", () => {
  const privateConfig = publicSourceFindings([
    { file: ".env.production", contents: "SAFE_LOOKING_VALUE=reserved", tracked: true },
    { file: "tools/.netrc", contents: "machine example.invalid", tracked: true }
  ]);
  assert.deepEqual(privateConfig, [
    { file: ".env.production", rule: "tracked_private_configuration" },
    { file: "tools/.netrc", rule: "tracked_private_configuration" }
  ]);

  const examples = publicSourceFindings([
    { file: ".env.example", contents: "VALUE=", tracked: true },
    { file: ".dev.vars.example", contents: "SECRET=", tracked: true }
  ]);
  assert.deepEqual(examples, []);
});
