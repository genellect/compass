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
import { verifyLibraryRegistrationProductionBuild } from
  "../scripts/verify-library-registration-production-build.mjs";
import { LEGACY_LIBRARY_FORM_URL } from
  "../scripts/verify-library-cloudflare-preview.mjs";

const registrationClientId =
  "123456789012-registration-prodgate.apps.googleusercontent.com";

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
