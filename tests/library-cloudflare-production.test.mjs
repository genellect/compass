import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  LIBRARY_REGISTRATION_PRODUCTION_API_ORIGIN,
  LIBRARY_REGISTRATION_PRODUCTION_CONFIRMATION,
  LIBRARY_REGISTRATION_PRODUCTION_FRONTEND_ORIGIN,
  renderLibraryDeploymentHeaders,
  requireLibraryRegistrationProductionReleaseConfig,
  resolveLibraryReleaseConfig
} from "../scripts/library-release-config.mjs";
import { prepareLibraryRegistrationProductionArtifact } from
  "../scripts/prepare-library-registration-production-artifact.mjs";
import {
  LIBRARY_ADMIN_PRODUCTION_GOOGLE_CLIENT_ID,
  LIBRARY_REGISTRATION_PRODUCTION_GOOGLE_CLIENT_ID,
  resolveCloudflareGitBuildEnvironment
} from "../scripts/cloudflare-git-build-environment.mjs";
import { finalizeCloudflareGitBuild } from
  "../scripts/finalize-cloudflare-git-build.mjs";
import { verifyLibraryRegistrationProductionBuild } from
  "../scripts/verify-library-registration-production-build.mjs";
import { LEGACY_LIBRARY_FORM_URL } from
  "../scripts/verify-library-cloudflare-preview.mjs";

const registrationClientId =
  "123456789012-registration-prodgate.apps.googleusercontent.com";
const adminClientId =
  "123456789012-admin-prodgate.apps.googleusercontent.com";

function productionEnvironment(overrides = {}) {
  return {
    LIBRARY_RELEASE_TARGET: "production",
    LIBRARY_RELEASE_SCOPE: "registration_only",
    LIBRARY_RELEASE_CONFIRMATION:
      LIBRARY_REGISTRATION_PRODUCTION_CONFIRMATION,
    LIBRARY_RELEASE_APPROVED_API_ORIGIN:
      LIBRARY_REGISTRATION_PRODUCTION_API_ORIGIN,
    LIBRARY_RELEASE_APPROVED_FRONTEND_ORIGIN:
      LIBRARY_REGISTRATION_PRODUCTION_FRONTEND_ORIGIN,
    NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE: "google",
    NEXT_PUBLIC_LIBRARY_ADMIN_MODE: "mock",
    NEXT_PUBLIC_LIBRARY_API_BASE_URL:
      LIBRARY_REGISTRATION_PRODUCTION_API_ORIGIN,
    NEXT_PUBLIC_LIBRARY_GOOGLE_HOSTED_DOMAIN: "st.kitasato-u.ac.jp",
    NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID: registrationClientId,
    ...overrides
  };
}

function cloudflareEnvironment(overrides = {}) {
  return {
    CF_PAGES: "1",
    CF_PAGES_BRANCH: "main",
    CF_PAGES_COMMIT_SHA: "a".repeat(40),
    CF_PAGES_URL: "https://a1b2c3d4.compass-official.pages.dev",
    ...overrides
  };
}

test("Cloudflare Git builds derive reviewed production and fail-closed preview profiles", () => {
  const production = resolveCloudflareGitBuildEnvironment(
    cloudflareEnvironment()
  );
  assert.equal(production.mode, "production");
  assert.equal(production.metadata.branch, "main");
  assert.equal(
    production.environment.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID,
    LIBRARY_REGISTRATION_PRODUCTION_GOOGLE_CLIENT_ID
  );
  assert.equal(
    production.environment.NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID,
    LIBRARY_ADMIN_PRODUCTION_GOOGLE_CLIENT_ID
  );
  assert.equal(
    resolveLibraryReleaseConfig(production.environment)
      .registrationOnlyProductionRelease,
    false
  );
  assert.equal(production.environment.NEXT_PUBLIC_LIBRARY_ADMIN_MODE, "google");
  assert.equal(
    production.environment.NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL,
    "/library-registration/admin/api"
  );

  const canonical = resolveCloudflareGitBuildEnvironment(
    cloudflareEnvironment({
      CF_PAGES_URL: "https://compass-official.pages.dev"
    })
  );
  assert.equal(canonical.mode, "production");

  const preview = resolveCloudflareGitBuildEnvironment(
    cloudflareEnvironment({
      CF_PAGES_BRANCH: "codex/cloudflare-preview",
      CF_PAGES_URL: "https://codex-cloudflare-preview.compass-official.pages.dev",
      NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID: ""
    })
  );
  assert.equal(preview.mode, "preview");
  assert.equal(preview.environment.LIBRARY_RELEASE_TARGET, "ui_review");
  assert.equal(preview.environment.NEXT_PUBLIC_LIBRARY_UI_REVIEW, "true");
  assert.equal(preview.environment.NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE, "mock");
  assert.equal(preview.environment.NEXT_PUBLIC_LIBRARY_API_BASE_URL, "");
  assert.equal(
    resolveLibraryReleaseConfig(preview.environment).uiReviewRelease,
    true
  );

  const local = resolveCloudflareGitBuildEnvironment({ NODE_ENV: "test" });
  assert.equal(local.mode, "local");
  assert.equal(local.environment.NODE_ENV, "test");
});

test("Cloudflare Git profile rejects malformed provenance and conflicting release inputs", () => {
  for (const overrides of [
    { CF_PAGES_BRANCH: "" },
    { CF_PAGES_COMMIT_SHA: "short" },
    { CF_PAGES_URL: "http://a1b2c3d4.compass-official.pages.dev" },
    { CF_PAGES_URL: "https://compass-official.pages.dev/path" },
    { CF_PAGES_URL: "https://compass-official.example.com" },
    { LIBRARY_RELEASE_TARGET: "ui_review" },
    { NEXT_PUBLIC_LIBRARY_ADMIN_MODE: "mock" },
    { NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL: "/invalid" },
    {
      NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID:
        LIBRARY_REGISTRATION_PRODUCTION_GOOGLE_CLIENT_ID
    }
  ]) {
    assert.throws(() => resolveCloudflareGitBuildEnvironment(
      cloudflareEnvironment(overrides)
    ));
  }
});

test("registration-only production configuration is explicit and exact", () => {
  const config = requireLibraryRegistrationProductionReleaseConfig(
    productionEnvironment()
  );
  assert.equal(config.registrationMode, "google");
  assert.equal(config.adminMode, "mock");
  assert.equal(config.approvedApiOrigin, LIBRARY_REGISTRATION_PRODUCTION_API_ORIGIN);
  assert.equal(
    config.approvedFrontendOrigin,
    LIBRARY_REGISTRATION_PRODUCTION_FRONTEND_ORIGIN
  );
  assert.equal(
    resolveLibraryReleaseConfig(productionEnvironment())
      .registrationOnlyProductionRelease,
    true
  );

  for (const overrides of [
    { LIBRARY_RELEASE_SCOPE: "" },
    { LIBRARY_RELEASE_SCOPE: "full_admin" },
    { LIBRARY_RELEASE_CONFIRMATION: "approved" },
    { LIBRARY_RELEASE_APPROVED_FRONTEND_ORIGIN: "https://preview.example.com" },
    { LIBRARY_RELEASE_APPROVED_API_ORIGIN: "https://other.a.run.app" },
    { NEXT_PUBLIC_LIBRARY_API_BASE_URL: "https://other.a.run.app" },
    { NEXT_PUBLIC_LIBRARY_ADMIN_MODE: "google" },
    { NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL: "/library-registration/admin/api" },
    { NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID: registrationClientId },
    { NEXT_PUBLIC_FSL_REGISTRATION_URL: LEGACY_LIBRARY_FORM_URL }
  ]) {
    assert.throws(() =>
      requireLibraryRegistrationProductionReleaseConfig(
        productionEnvironment(overrides)
      )
    );
  }
  assert.throws(() => resolveLibraryReleaseConfig({
    LIBRARY_RELEASE_TARGET: "production"
  }), /Production requires both library registration and administrator modes to be google/);
});

async function createProductionFixture(root) {
  const source = join(root, "out");
  await mkdir(join(source, "library-registration", "admin"), { recursive: true });
  await mkdir(join(source, "future-strategy-library"), { recursive: true });
  await mkdir(join(source, "_next", "static", "chunks"), { recursive: true });
  await mkdir(join(root, "functions", "api"), { recursive: true });
  await mkdir(join(root, "src", "lib"), { recursive: true });

  const config = requireLibraryRegistrationProductionReleaseConfig(
    productionEnvironment()
  );
  const headersTemplate = await readFile(
    new URL("../_headers", import.meta.url),
    "utf8"
  );
  await writeFile(
    join(source, "_headers"),
    renderLibraryDeploymentHeaders(headersTemplate, config),
    "utf8"
  );
  await writeFile(
    join(source, "_routes.json"),
    JSON.stringify({
      version: 1,
      include: [
        "/",
        "/api/community-registration",
        "/api/contact",
        "/library-registration/admin/api/*"
      ],
      exclude: []
    }),
    "utf8"
  );
  await writeFile(
    join(source, "library-registration", "index.html"),
    '<main>GOOGLE API</main><script src="/_next/static/chunks/registration.js"></script>',
    "utf8"
  );
  await writeFile(
    join(source, "library-registration", "admin", "index.html"),
    '<main class="admin-mock-login">admin-mock-login</main>',
    "utf8"
  );
  await writeFile(
    join(source, "future-strategy-library", "index.html"),
    '<a href="/library-registration/">register</a>',
    "utf8"
  );
  await writeFile(join(source, "index.html"), "<main>official</main>", "utf8");
  await writeFile(
    join(source, "_next", "static", "chunks", "registration.js"),
    `const clientId="${registrationClientId}";const api="${LIBRARY_REGISTRATION_PRODUCTION_API_ORIGIN}";`,
    "utf8"
  );
  await writeFile(
    join(source, "_next", "static", "chunks", "admin-preview.js"),
    "const marker='app-synthetic-001';",
    "utf8"
  );
  await writeFile(
    join(root, "functions", "api", "community-registration.ts"),
    "export async function onRequest(){return new Response('community')}",
    "utf8"
  );
  await writeFile(
    join(root, "functions", "api", "contact.ts"),
    "export async function onRequest(){return new Response('contact')}",
    "utf8"
  );
  await writeFile(
    join(root, "functions", "index.ts"),
    "export async function onRequest({env,request,next}){const url=new URL(request.url);return url.hostname==='yuto-matsui.com'?env.ASSETS.fetch(new Request(new URL('/founder/',url),request)):next()}",
    "utf8"
  );
  await writeFile(
    join(root, "src", "lib", "community-registration-schema.ts"),
    "export const schema='community';",
    "utf8"
  );
  await writeFile(
    join(root, "src", "lib", "contact-schema.ts"),
    "export const schema='contact';",
    "utf8"
  );
  return source;
}

test("production staging keeps public Functions and removes every administrator surface", async () => {
  const root = await mkdtemp(join(tmpdir(), "fsl-registration-production-"));
  try {
    const source = await createProductionFixture(root);
    const stage = join(
      root,
      "outputs",
      "library-registration-production",
      "reviewed-commit",
      "site"
    );
    const result = await prepareLibraryRegistrationProductionArtifact({
      root,
      source,
      stage
    });
    assert.equal(result.markerFilesRemoved, 1);
    await assert.rejects(access(join(stage, "library-registration", "admin")));
    await assert.rejects(access(join(result.stageRoot, "functions", "library-registration")));
    await access(join(result.stageRoot, "functions", "api", "community-registration.ts"));
    await access(join(result.stageRoot, "functions", "api", "contact.ts"));

    const routes = JSON.parse(await readFile(join(stage, "_routes.json"), "utf8"));
    assert.deepEqual(routes.include, ["/api/community-registration", "/api/contact"]);
    assert.doesNotMatch(await readFile(join(stage, "_headers"), "utf8"), /library-registration\/admin/);

    const verified = await verifyLibraryRegistrationProductionBuild({
      root,
      stage,
      environment: productionEnvironment()
    });
    assert.equal(
      verified.approvedFrontendOrigin,
      LIBRARY_REGISTRATION_PRODUCTION_FRONTEND_ORIGIN
    );

    await mkdir(join(result.stageRoot, "functions", "library-registration"));
    await writeFile(
      join(result.stageRoot, "functions", "library-registration", "admin.ts"),
      "export const admin=true;",
      "utf8"
    );
    await assert.rejects(
      verifyLibraryRegistrationProductionBuild({
        root,
        stage,
        environment: productionEnvironment()
      }),
      /Staged Pages Functions contains an unreviewed file/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Cloudflare Git production finalization retains the protected administrator surface", async () => {
  const root = await mkdtemp(join(tmpdir(), "fsl-cloudflare-git-production-"));
  try {
    await createProductionFixture(root);
    await writeFile(
      join(root, "out", "_next", "static", "chunks", "registration.js"),
      `const clientId="${LIBRARY_REGISTRATION_PRODUCTION_GOOGLE_CLIENT_ID}";const api="${LIBRARY_REGISTRATION_PRODUCTION_API_ORIGIN}";`,
      "utf8"
    );
    await writeFile(
      join(root, "out", "library-registration", "admin", "index.html"),
      '<main><h1>管理者ログイン</h1></main>',
      "utf8"
    );
    await rm(
      join(root, "out", "_next", "static", "chunks", "admin-preview.js"),
      { force: true }
    );
    await writeFile(
      join(root, "out", "_next", "static", "chunks", "admin.js"),
      `const clientId="${LIBRARY_ADMIN_PRODUCTION_GOOGLE_CLIENT_ID}";const base="/library-registration/admin/api";`,
      "utf8"
    );
    await mkdir(join(root, "functions", "library-registration", "admin", "api"), {
      recursive: true
    });
    await writeFile(
      join(root, "functions", "library-registration", "admin", "api", "[[path]].ts"),
      "export async function onRequest(){return new Response('admin')}",
      "utf8"
    );

    const result = await finalizeCloudflareGitBuild({
      root,
      environment: cloudflareEnvironment()
    });
    assert.equal(result.mode, "production");
    assert.equal(result.finalized, true);
    await access(join(root, "out", "library-registration", "index.html"));
    await access(join(root, "out", "library-registration", "admin", "index.html"));
    const worker = await readFile(join(root, "out", "_worker.js"), "utf8");
    assert.match(worker, /\/library-registration\/admin\/api/);
    assert.ok(worker.includes("yuto-matsui.com"));
    assert.match(worker, /env\["ASSETS"\]\.fetch/);
    await access(join(root, "functions", "api", "community-registration.ts"));
    await access(join(root, "functions", "api", "contact.ts"));
    await access(join(root, "functions", "index.ts"));
    await access(join(
      root,
      "functions",
      "library-registration",
      "admin",
      "api",
      "[[path]].ts"
    ));
    await assert.rejects(access(
      join(
        root,
        "outputs",
        "library-full-production",
        "a".repeat(40)
      )
    ));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("production deploy wrapper pins provenance, project, branch, scope and staged upload", async () => {
  const wrapper = await readFile(
    new URL(
      "../scripts/deploy-library-cloudflare-registration-production.ps1",
      import.meta.url
    ),
    "utf8"
  );
  for (const required of [
    "I_APPROVED_LIBRARY_REGISTRATION_ONLY_PRODUCTION_V1",
    "LIBRARY_RELEASE_REVIEWED_COMMIT",
    "git fetch --quiet origin main",
    "refs/remotes/origin/main",
    "LIBRARY_RELEASE_TARGET = 'production'",
    "LIBRARY_RELEASE_SCOPE = 'registration_only'",
    "LIBRARY_RELEASE_APPROVED_FRONTEND_ORIGIN = 'https://compass-official.pages.dev'",
    `LIBRARY_RELEASE_APPROVED_API_ORIGIN = '${LIBRARY_REGISTRATION_PRODUCTION_API_ORIGIN}'`,
    "NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE = 'google'",
    "NEXT_PUBLIC_LIBRARY_ADMIN_MODE = 'mock'",
    "prepare-library-registration-production-artifact.mjs",
    "verify-library-registration-production-build.mjs",
    "--project-name compass-official",
    "--branch main",
    "--cwd $stageRoot",
    "--commit-dirty=false"
  ]) {
    assert.ok(wrapper.includes(required), `wrapper is missing: ${required}`);
  }
  assert.equal(wrapper.match(/Get-CleanReviewedOriginMainCommit/g)?.length, 3);
  assert.equal(wrapper.match(/Get-CloudflareProductionBranch/g)?.length, 3);
  assert.equal(
    wrapper.match(/verify-library-registration-production-build\.mjs/g)?.length,
    2
  );
  assert.doesNotMatch(wrapper, /NEXT_PUBLIC_LIBRARY_ADMIN_MODE\s*=\s*'google'/);
  assert.doesNotMatch(wrapper, /functions\\library-registration/);
  assert.doesNotMatch(wrapper, /Write-(?:Host|Output).*\$env:/i);
});
