import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareLibraryUiReviewArtifact } from
  "../scripts/prepare-library-ui-review-artifact.mjs";
import { prepareLibraryRegistrationPreviewArtifact } from
  "../scripts/prepare-library-registration-preview-artifact.mjs";
import {
  renderLibraryDeploymentHeaders,
  requireLibraryRegistrationPreviewReleaseConfig
} from "../scripts/library-release-config.mjs";
import { verifyLibraryRegistrationPreviewBuild } from
  "../scripts/verify-library-registration-preview-build.mjs";
import {
  LEGACY_LIBRARY_FORM_URL,
  requireSafePreviewBranch,
  verifyLegacyLibraryCtaArtifacts
} from "../scripts/verify-library-cloudflare-preview.mjs";

test("preview branch must be namespaced and cannot equal production", () => {
  assert.equal(
    requireSafePreviewBranch("library-registration-preview", "main"),
    "library-registration-preview"
  );
  assert.equal(
    requireSafePreviewBranch("library-registration-preview-gate1", "main"),
    "library-registration-preview-gate1"
  );
  assert.equal(
    requireSafePreviewBranch("library-registration-ui-review-20260803", "main"),
    "library-registration-ui-review-20260803"
  );
  for (const value of ["main", "production", "library-preview", ""] ) {
    assert.throws(() => requireSafePreviewBranch(value, "main"));
  }
  assert.throws(() => requireSafePreviewBranch(
    "library-registration-preview-gate1",
    "library-registration-preview-gate1"
  ));
  assert.throws(() => requireSafePreviewBranch(
    "library-registration-preview-gate1",
    ""
  ));
});

test("preview artifact guard preserves Google Form CTA and rejects cutover", () => {
  const officialLibraryHtml = `<a href="${LEGACY_LIBRARY_FORM_URL}">register</a>`;
  assert.doesNotThrow(() => verifyLegacyLibraryCtaArtifacts({
    officialLibraryHtml,
    officialHomeHtml: '<a href="/future-strategy-library/">library</a>'
  }));
  assert.throws(() => verifyLegacyLibraryCtaArtifacts({
    officialLibraryHtml: '<a href="/library-registration/">register</a>',
    officialHomeHtml: "<main></main>"
  }));
  assert.throws(() => verifyLegacyLibraryCtaArtifacts({
    officialLibraryHtml,
    officialHomeHtml: '<a href="/library-registration/">register</a>'
  }));
});

test("preview deploy wrapper hard-codes project and rechecks production branch", async () => {
  const wrapper = await readFile(
    new URL("../scripts/deploy-library-cloudflare-preview.ps1", import.meta.url),
    "utf8"
  );
  assert.match(wrapper, /--project-name compass-official/);
  assert.doesNotMatch(wrapper, /\[string\]\$ProjectName/);
  assert.match(wrapper, /Preview deployment requires a clean, reviewed Git commit/);
  assert.match(wrapper, /CLOUDFLARE_LIBRARY_PREVIEW_CONFIRMATION/);
  assert.match(wrapper, /I_APPROVED_LIBRARY_PREVIEW_DEPLOYMENT_V1/);
  assert.match(wrapper, /library-registration-preview\(\?:-/);
  assert.match(wrapper, /PSObject\.Properties\['Project Name'\]/);
  assert.match(wrapper, /pages deployment list/);
  assert.match(wrapper, /--environment production/);
  assert.match(wrapper, /production branch invariant is no longer main/);
  assert.equal(wrapper.match(/Get-CloudflareProductionBranch/g)?.length, 3);
  assert.equal(wrapper.match(/Get-CleanReviewedCommit/g)?.length, 3);
  assert.match(wrapper, /postBuildCommitHash -cne \$commitHash/);
  assert.match(wrapper, /--commit-dirty=false/);
  for (const required of [
    "LIBRARY_RELEASE_TARGET = 'registration_preview'",
    "LIBRARY_RELEASE_APPROVED_FRONTEND_ORIGIN",
    "NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE = 'google'",
    "NEXT_PUBLIC_LIBRARY_ADMIN_MODE = 'mock'",
    "NEXT_PUBLIC_LIBRARY_GOOGLE_HOSTED_DOMAIN = 'st.kitasato-u.ac.jp'",
    "prepare-library-registration-preview-artifact.mjs",
    "verify-library-registration-preview-build.mjs",
    "--cwd $stageRoot"
  ]) {
    assert.match(
      wrapper,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }
  assert.doesNotMatch(wrapper, /verify-library-production-build\.mjs/);
  assert.equal(
    wrapper.match(/verify-library-registration-preview-build\.mjs/g)?.length,
    2
  );
  assert.match(
    wrapper,
    /Final Registration Preview staging verification failed[\s\S]*--cwd \$stageRoot pages deploy site/
  );
});

test("UI review wrapper strips executable and administrator surfaces before upload", async () => {
  const wrapper = await readFile(
    new URL("../scripts/deploy-library-cloudflare-ui-review.ps1", import.meta.url),
    "utf8"
  );
  for (const required of [
    "--project-name compass-official",
    "CLOUDFLARE_LIBRARY_UI_REVIEW_CONFIRMATION",
    "I_APPROVED_LIBRARY_UI_REVIEW_DEPLOYMENT_V1",
    "LIBRARY_RELEASE_TARGET = 'ui_review'",
    "NEXT_PUBLIC_LIBRARY_UI_REVIEW = 'true'",
    "prepare-library-ui-review-artifact.mjs",
    "verify-library-ui-review-build.mjs",
    "--cwd $stageRoot",
    "--commit-dirty=false"
  ]) assert.match(wrapper, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(wrapper, /\[string\]\$ProjectName/);
  assert.match(wrapper, /production branch invariant is no longer main/);
  assert.equal(wrapper.match(/Get-CloudflareProductionBranch/g)?.length, 3);
  assert.equal(wrapper.match(/Get-CleanReviewedCommit/g)?.length, 3);

  const packageJson = JSON.parse(await readFile(
    new URL("../package.json", import.meta.url),
    "utf8"
  ));
  assert.match(
    packageJson.scripts["deploy:cloudflare:library-ui-review"],
    /deploy-library-cloudflare-ui-review\.ps1/
  );
});

test("UI review staging removes admin, Functions and synthetic preview artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "fsl-ui-review-"));
  try {
    const source = join(root, "out");
    const stage = join(root, "outputs", "library-ui-review", "unit", "site");
    const stageRoot = join(root, "outputs", "library-ui-review", "unit");
    await mkdir(join(source, "library-registration", "admin"), { recursive: true });
    await mkdir(join(source, "library-registration"), { recursive: true });
    await mkdir(join(source, "_next", "static", "chunks"), { recursive: true });
    await writeFile(join(source, "library-registration", "index.html"), "safe", "utf8");
    await writeFile(join(source, "library-registration", "admin", "index.html"), "admin", "utf8");
    await writeFile(join(source, "_routes.json"), "{}", "utf8");
    await writeFile(join(source, "_worker.js"), "worker", "utf8");
    await writeFile(
      join(source, "_next", "static", "chunks", "preview.js"),
      "const id = 'app-synthetic-001';",
      "utf8"
    );
    await writeFile(
      join(source, "_next", "static", "chunks", "safe.js"),
      "const status = 'disabled';",
      "utf8"
    );
    await mkdir(join(stageRoot, "functions"), { recursive: true });
    await writeFile(join(stageRoot, "functions", "stale.js"), "stale", "utf8");
    await writeFile(join(stageRoot, "wrangler.jsonc"), "{}", "utf8");

    const result = await prepareLibraryUiReviewArtifact({ root, source, stage });
    assert.equal(result.markerFilesRemoved, 1);
    assert.deepEqual(await readdir(stageRoot), ["site"]);
    await assert.rejects(access(join(stage, "library-registration", "admin")));
    await assert.rejects(access(join(stage, "_routes.json")));
    await assert.rejects(access(join(stage, "_worker.js")));
    await assert.rejects(access(join(stage, "_next", "static", "chunks", "preview.js")));
    assert.equal(
      await readFile(join(stage, "_next", "static", "chunks", "safe.js"), "utf8"),
      "const status = 'disabled';"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("registration Preview staging removes admin, Functions and synthetic preview artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "fsl-registration-preview-"));
  try {
    const source = join(root, "out");
    const stage = join(
      root,
      "outputs",
      "library-registration-preview",
      "unit",
      "site"
    );
    const stageRoot = join(
      root,
      "outputs",
      "library-registration-preview",
      "unit"
    );
    await mkdir(join(source, "library-registration", "admin"), { recursive: true });
    await mkdir(join(source, "library-registration"), { recursive: true });
    await mkdir(join(source, "_next", "static", "chunks"), { recursive: true });
    await writeFile(join(source, "library-registration", "index.html"), "safe", "utf8");
    await writeFile(join(source, "library-registration", "admin", "index.html"), "admin", "utf8");
    await writeFile(join(source, "_routes.json"), "{}", "utf8");
    await writeFile(join(source, "_worker.js"), "worker", "utf8");
    await writeFile(
      join(source, "_next", "static", "chunks", "preview.js"),
      "const id = 'app-synthetic-001';",
      "utf8"
    );
    await writeFile(
      join(source, "_next", "static", "chunks", "registration.js"),
      "const runtime = 'GOOGLE API';",
      "utf8"
    );
    await mkdir(join(stageRoot, "functions"), { recursive: true });
    await writeFile(join(stageRoot, "functions", "stale.js"), "stale", "utf8");
    await writeFile(join(stageRoot, ".dev.vars"), "STALE=value", "utf8");

    const result = await prepareLibraryRegistrationPreviewArtifact({
      root,
      source,
      stage
    });
    assert.equal(result.markerFilesRemoved, 1);
    assert.deepEqual(await readdir(stageRoot), ["site"]);
    await assert.rejects(access(join(stage, "library-registration", "admin")));
    await assert.rejects(access(join(stage, "_routes.json")));
    await assert.rejects(access(join(stage, "_worker.js")));
    await assert.rejects(access(join(stage, "_next", "static", "chunks", "preview.js")));
    assert.equal(
      await readFile(
        join(stage, "_next", "static", "chunks", "registration.js"),
        "utf8"
      ),
      "const runtime = 'GOOGLE API';"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("registration Preview verifier requires real registration and excludes admin execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "fsl-registration-preview-verify-"));
  const apiOrigin = "https://library-api-prodgate.a.run.app";
  const clientId =
    "123456789012-registration-prodgate.apps.googleusercontent.com";
  const frontendOrigin =
    "https://library-registration-preview.compass-official.pages.dev";
  const environment = {
    LIBRARY_RELEASE_TARGET: "registration_preview",
    LIBRARY_RELEASE_APPROVED_API_ORIGIN: apiOrigin,
    LIBRARY_RELEASE_APPROVED_FRONTEND_ORIGIN: frontendOrigin,
    NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE: "google",
    NEXT_PUBLIC_LIBRARY_ADMIN_MODE: "mock",
    NEXT_PUBLIC_LIBRARY_API_BASE_URL: apiOrigin,
    NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID: clientId
  };
  try {
    const stage = join(
      root,
      "outputs",
      "library-registration-preview",
      "unit",
      "site"
    );
    await mkdir(join(stage, "library-registration"), { recursive: true });
    await mkdir(join(stage, "future-strategy-library"), { recursive: true });
    await mkdir(join(stage, "_next", "static", "chunks"), { recursive: true });
    await writeFile(
      join(stage, "library-registration", "index.html"),
      "<main>GOOGLE API</main>",
      "utf8"
    );
    await writeFile(
      join(stage, "future-strategy-library", "index.html"),
      `<a href="${LEGACY_LIBRARY_FORM_URL}">register</a>`,
      "utf8"
    );
    await writeFile(
      join(stage, "index.html"),
      '<main>official</main><script src="/_next/static/chunks/registration.js"></script>',
      "utf8"
    );
    const config = requireLibraryRegistrationPreviewReleaseConfig(environment);
    const headersTemplate = await readFile(
      new URL("../_headers", import.meta.url),
      "utf8"
    );
    await writeFile(
      join(stage, "_headers"),
      renderLibraryDeploymentHeaders(headersTemplate, config),
      "utf8"
    );
    await writeFile(
      join(stage, "_next", "static", "chunks", "registration.js"),
      `const clientId="${clientId}";const apiOrigin="${apiOrigin}";`,
      "utf8"
    );

    const result = await verifyLibraryRegistrationPreviewBuild({
      root,
      stage,
      environment
    });
    assert.equal(result.approvedFrontendOrigin, frontendOrigin);
    assert.ok(result.registrationClientOccurrences >= 1);
    assert.ok(result.apiOriginOccurrences >= 2);

    const registrationChunk = join(
      stage,
      "_next",
      "static",
      "chunks",
      "registration.js"
    );
    await rm(registrationChunk);
    await assert.rejects(
      verifyLibraryRegistrationPreviewBuild({ root, stage, environment }),
      /missing Next\.js asset/
    );
    await writeFile(
      registrationChunk,
      `const clientId="${clientId}";const apiOrigin="${apiOrigin}";`,
      "utf8"
    );

    await mkdir(join(stage, "functions"));
    await assert.rejects(
      verifyLibraryRegistrationPreviewBuild({ root, stage, environment }),
      /Pages Functions source/
    );
    await rm(join(stage, "functions"), { recursive: true });

    await mkdir(join(stage, "nested"));
    await writeFile(join(stage, "nested", ".env.preview"), "SECRET=value", "utf8");
    await assert.rejects(
      verifyLibraryRegistrationPreviewBuild({ root, stage, environment }),
      /forbidden deploy path/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generic production deployment is disabled in the release baseline", async () => {
  const packageJson = JSON.parse(await readFile(
    new URL("../package.json", import.meta.url),
    "utf8"
  ));
  assert.match(
    packageJson.scripts.build,
    /^node scripts\/assert-library-build-target\.mjs /
  );
  assert.equal(
    packageJson.scripts["deploy:cloudflare"],
    "node scripts/refuse-cloudflare-production-deploy.mjs"
  );
  assert.doesNotMatch(
    packageJson.scripts["deploy:cloudflare"],
    /wrangler\s+pages\s+deploy/i
  );

  const refusal = await readFile(
    new URL("../scripts/refuse-cloudflare-production-deploy.mjs", import.meta.url),
    "utf8"
  );
  assert.match(refusal, /Production deployment requires a separate approved cutover workflow/);
  assert.match(refusal, /process\.exitCode = 1/);
});
