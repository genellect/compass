import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  REHEARSAL_API_ORIGIN,
  REHEARSAL_ADMIN_GOOGLE_CLIENT_ID,
  REHEARSAL_REGISTRATION_GOOGLE_CLIENT_ID,
  verifyLibraryMockArtifacts
} from "../scripts/verify-library-mock-build.mjs";
import {
  renderLibraryDeploymentHeaders,
  resolveLibraryBuildConfig
} from "../scripts/library-release-config.mjs";

test("mock artifact verifier rejects production-shaped markers and rehearsal values", async () => {
  const template = await readFile(new URL("../_headers", import.meta.url), "utf8");
  const config = resolveLibraryBuildConfig({
    LIBRARY_RELEASE_TARGET: "local",
    NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE: "mock",
    NEXT_PUBLIC_LIBRARY_ADMIN_MODE: "mock"
  });
  const artifacts = {
    registrationHtml:
      "<main>REGISTRATION DISABLED 現在、利用登録を受け付けていません。時間をおいて再度お試しください。</main>",
    adminHtml: "<main>管理画面の認証設定が完了していません。</main>",
    deploymentHeaders: renderLibraryDeploymentHeaders(template, config),
    config
  };

  assert.doesNotThrow(() => verifyLibraryMockArtifacts(artifacts));
  assert.throws(() => verifyLibraryMockArtifacts({
    ...artifacts,
    registrationHtml:
      "<main>REGISTRATION DISABLED 現在、利用登録を受け付けていません。時間をおいて再度お試しください。 GOOGLE API</main>"
  }));
  assert.throws(() => verifyLibraryMockArtifacts({
    ...artifacts,
    deploymentHeaders: `${artifacts.deploymentHeaders}\n${REHEARSAL_API_ORIGIN}`
  }));
  assert.throws(() => verifyLibraryMockArtifacts({
    ...artifacts,
    adminHtml: '<main><div class="admin-mock-login">画面を準備しています</div></main>'
  }));
});

test("PowerShell rehearsal is local-only, restores mock output, and guards COMPASS Interactive", async () => {
  const script = await readFile(
    new URL("../scripts/library-frontend-production-rehearsal.ps1", import.meta.url),
    "utf8"
  );

  for (const required of [
    "COMPASS Interactive",
    "Set-ProductionRehearsalEnvironment",
    "Set-ExplicitMockEnvironment",
    "Restore-EnvironmentSnapshot",
    "production_normal_verify",
    "production_dedicated_verify",
    "admin_preview_marker_occurrences",
    "mock_restore_normal_verify",
    "mock_restore_dedicated_verify",
    "finally",
    "google_or_library_api_request_invoked = $false",
    "deployment_invoked = $false",
    REHEARSAL_API_ORIGIN,
    REHEARSAL_REGISTRATION_GOOGLE_CLIENT_ID,
    REHEARSAL_ADMIN_GOOGLE_CLIENT_ID,
    "NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL",
    "NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID",
    "rehearsal_registration_client_text_occurrences",
    "rehearsal_admin_client_text_occurrences"
  ]) {
    assert.ok(
      script.includes(required),
      `Production rehearsal script is missing required marker: ${required}`
    );
  }

  for (const forbidden of [
    /deploy:cloudflare/i,
    /wrangler\s+pages\s+deploy/i,
    /git\s+push/i,
    /Invoke-WebRequest/i,
    /Invoke-RestMethod/i,
    /curl(?:\.exe)?\s/i
  ]) {
    assert.doesNotMatch(script, forbidden);
  }
});

test("canonical local gate rejects dirty or changing source and records both snapshots", async () => {
  const script = await readFile(
    new URL("../scripts/library-local-preproduction-gate.ps1", import.meta.url),
    "utf8"
  );

  for (const required of [
    "Get-SourceIntegritySnapshot",
    "Assert-SourceSnapshotUnchanged",
    "worktree_must_be_clean",
    "source_changed_during_gate",
    "source_snapshot_pre",
    "source_snapshot_post",
    "source_integrity_unchanged",
    "source_integrity_state",
    "source_integrity_post_cleanup",
    "WorktreeStatusSha256",
    "NEXT_TELEMETRY_DISABLED",
    "NPM_CONFIG_OFFLINE",
    "NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID",
    "NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL"
  ]) {
    assert.match(script, new RegExp(required));
  }

  assert.doesNotMatch(
    script,
    /\$script:sourceManifestSha256\s*=/,
    "pre/post source snapshots must not overwrite one shared manifest variable"
  );
  assert.ok(
    script.indexOf("$script:currentStep = 'docker_cleanup'") <
      script.indexOf("$script:currentStep = 'source_integrity_post_cleanup'"),
    "the final source snapshot must be captured after Docker cleanup"
  );
});
