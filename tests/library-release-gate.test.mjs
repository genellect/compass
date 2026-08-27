import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  LIBRARY_ADMIN_API_BASE_PATH,
  LIBRARY_REGISTRATION_HOSTED_DOMAIN,
  isLibraryProductionRelease,
  renderLibraryDeploymentHeaders,
  requireExactRegistrationPreviewOrigin,
  requireLibraryProductionReleaseConfig,
  requireLibraryRegistrationPreviewReleaseConfig,
  requireLibraryUiReviewReleaseConfig,
  resolveLibraryReleaseConfig,
  resolveLibraryBuildConfig,
  verifyLibraryHeaderBoundary
} from "../scripts/library-release-config.mjs";
import {
  collectProductionTextArtifacts,
  verifyLibraryProductionArtifacts
} from
  "../scripts/verify-library-production-build.mjs";
import { collectMockTextArtifacts } from
  "../scripts/verify-library-mock-build.mjs";

const apiOrigin = "https://library-api-prodgate.a.run.app";
const registrationClientId =
  "123456789012-registration-prodgate.apps.googleusercontent.com";
const adminClientId =
  "210987654321-admin-prodgate.apps.googleusercontent.com";
const registrationPreviewOrigin =
  "https://library-registration-preview.compass-official.pages.dev";
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

test("release artifact scanners include every deployable text format and skip binary assets", async () => {
  const root = await mkdtemp(join(tmpdir(), "fsl-artifact-scan-"));
  try {
    const nested = join(root, "nested");
    await mkdir(nested);
    const expected = [
      "_headers",
      "bundle.js",
      "manifest.json",
      "page.html",
      "route.txt",
      "styles.css",
      "vector.svg"
    ];
    for (const file of expected) await writeFile(join(nested, file), "reviewed text", "utf8");
    await writeFile(join(nested, "image.webp"), Buffer.from([0, 1, 2, 3]));

    for (const collect of [collectProductionTextArtifacts, collectMockTextArtifacts]) {
      const selected = (await collect(root)).map((file) => basename(file)).sort();
      assert.deepEqual(selected, expected);
      assert.ok(!selected.includes("image.webp"));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function collectSourceFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(path));
    } else if ([".ts", ".tsx", ".js", ".jsx"].includes(extname(entry.name))) {
      files.push(path);
    }
  }
  return files;
}

function productionEnvironment(overrides = {}) {
  return {
    LIBRARY_RELEASE_TARGET: "production",
    LIBRARY_RELEASE_APPROVED_API_ORIGIN: apiOrigin,
    NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE: "google",
    NEXT_PUBLIC_LIBRARY_ADMIN_MODE: "google",
    NEXT_PUBLIC_LIBRARY_API_BASE_URL: apiOrigin,
    NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL: LIBRARY_ADMIN_API_BASE_PATH,
    NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID: registrationClientId,
    NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID: adminClientId,
    ...overrides
  };
}

function registrationPreviewEnvironment(overrides = {}) {
  return {
    LIBRARY_RELEASE_TARGET: "registration_preview",
    LIBRARY_RELEASE_APPROVED_API_ORIGIN: apiOrigin,
    LIBRARY_RELEASE_APPROVED_FRONTEND_ORIGIN: registrationPreviewOrigin,
    NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE: "google",
    NEXT_PUBLIC_LIBRARY_ADMIN_MODE: "mock",
    NEXT_PUBLIC_LIBRARY_API_BASE_URL: apiOrigin,
    NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID: registrationClientId,
    ...overrides
  };
}

function cssHexVariable(css, name) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})\\s*;`, "i"));
  assert.ok(match, `missing CSS color variable --${name}`);
  return match[1];
}

function relativeLuminance(hex) {
  const channels = hex.slice(1).match(/../g).map((value) => {
    const channel = Number.parseInt(value, 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

test("ordinary mock build remains available and emits no API CSP origin", async () => {
  const template = await readFile(new URL("../_headers", import.meta.url), "utf8");
  const config = resolveLibraryBuildConfig({
    NEXT_PUBLIC_LIBRARY_API_BASE_URL: "https://leftover.a.run.app"
  });
  const rendered = renderLibraryDeploymentHeaders(template, config);

  assert.equal(config.registrationMode, "mock");
  assert.equal(config.adminMode, "mock");
  assert.equal(config.apiOrigin, "");
  assert.equal(config.adminApiBaseUrl, "");
  assert.equal(config.googleClientId, "");
  assert.equal(config.adminGoogleClientId, "");
  assert.doesNotMatch(rendered, /https:\/\/[^\s;]+\.run\.app/i);
  assert.doesNotMatch(rendered, /https:\/\/\*\.run\.app/i);
  verifyLibraryHeaderBoundary(rendered, config);
});

test("google build emits exactly its validated API origin and no wildcard", async () => {
  const template = await readFile(new URL("../_headers", import.meta.url), "utf8");
  const config = resolveLibraryBuildConfig(productionEnvironment());
  const rendered = renderLibraryDeploymentHeaders(template, config);

  assert.equal(config.googleClientId, registrationClientId);
  assert.equal(config.adminGoogleClientId, adminClientId);
  assert.equal(config.adminApiBaseUrl, LIBRARY_ADMIN_API_BASE_PATH);
  assert.equal(rendered.split(apiOrigin).length - 1, 1);
  assert.doesNotMatch(rendered, /https:\/\/\*\.run\.app/i);
  verifyLibraryHeaderBoundary(rendered, config);
});

test("google build rejects non-exact, non-HTTPS, loopback and synthetic origins", () => {
  for (const value of [
    "http://library-api-prodgate.a.run.app",
    `${apiOrigin}/`,
    `${apiOrigin}/v1`,
    "https://127.0.0.1",
    "https://library-api-synthetic.a.run.app",
    "https://example.invalid"
  ]) {
    assert.throws(() => resolveLibraryBuildConfig(productionEnvironment({
      NEXT_PUBLIC_LIBRARY_API_BASE_URL: value
    })));
  }
});

test("google build rejects malformed and synthetic OAuth client IDs", () => {
  for (const value of [
    "public-client-id",
    "123-example.apps.googleusercontent.com",
    "123-synthetic.apps.googleusercontent.com",
    "123-prodgate@apps.googleusercontent.com"
  ]) {
    assert.throws(() => resolveLibraryBuildConfig(productionEnvironment({
      NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID: value
    })));
    assert.throws(() => resolveLibraryBuildConfig(productionEnvironment({
      NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID: value
    })));
  }
});

test("google build requires separate registration and administrator OAuth audiences", () => {
  assert.throws(() => resolveLibraryBuildConfig(productionEnvironment({
    NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID: ""
  })));
  assert.throws(() => resolveLibraryBuildConfig(productionEnvironment({
    NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID: registrationClientId
  })), /must be different/);

  const registrationOnly = resolveLibraryBuildConfig(productionEnvironment({
    NEXT_PUBLIC_LIBRARY_ADMIN_MODE: "mock",
    NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID: ""
  }));
  assert.equal(registrationOnly.googleClientId, registrationClientId);
  assert.equal(registrationOnly.adminGoogleClientId, "");
  assert.equal(registrationOnly.apiOrigin, apiOrigin);
  assert.equal(registrationOnly.adminApiBaseUrl, "");

  const adminOnly = resolveLibraryBuildConfig(productionEnvironment({
    NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE: "mock",
    NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID: ""
  }));
  assert.equal(adminOnly.googleClientId, "");
  assert.equal(adminOnly.adminGoogleClientId, adminClientId);
  assert.equal(adminOnly.apiOrigin, "");
  assert.equal(adminOnly.adminApiBaseUrl, LIBRARY_ADMIN_API_BASE_PATH);
});

test("google administrator build requires the exact same-origin proxy base", () => {
  for (const value of [
    "",
    "/library-registration/admin/api/",
    "/library-registration/admin/api/extra",
    "https://library-api-prodgate.a.run.app",
    "http://127.0.0.1:8000"
  ]) {
    assert.throws(() => resolveLibraryBuildConfig(productionEnvironment({
      NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL: value
    })));
  }
});

test("public site surfaces never link to the administrator route", async () => {
  const publicSourceRoots = [
    join(repositoryRoot, "src", "app", "(official)"),
    join(repositoryRoot, "src", "app", "(interactive)"),
    join(repositoryRoot, "src", "components"),
    join(repositoryRoot, "src", "interactive"),
    join(repositoryRoot, "src", "sections")
  ];
  const publicFiles = (await Promise.all(
    publicSourceRoots.map((root) => collectSourceFiles(root))
  )).flat();
  publicFiles.push(
    join(repositoryRoot, "src", "App.tsx"),
    join(repositoryRoot, "src", "LegacyPageBody.tsx"),
    join(repositoryRoot, "src", "library-registration", "RegistrationMvp.tsx"),
    join(repositoryRoot, "src", "app", "(library)", "library-registration", "page.tsx"),
    join(repositoryRoot, "src", "app", "(library)", "library-registration", "layout.tsx"),
    join(repositoryRoot, "sitemap.xml")
  );

  for (const path of publicFiles) {
    const source = await readFile(path, "utf8");
    assert.ok(
      !source.includes("/library-registration/admin/"),
      `public surface links or refers to the administrator route: ${relative(repositoryRoot, path)}`
    );
  }
});

test("Cloudflare routes execute only the reviewed Founder, public API and administrator proxy functions", async () => {
  const routes = JSON.parse(await readFile(join(repositoryRoot, "public", "_routes.json"), "utf8"));
  assert.deepEqual(routes, {
    version: 1,
    include: [
      "/",
      "/api/community-registration",
      "/api/contact",
      "/library-registration/admin/api/*"
    ],
    exclude: []
  });
  assert.ok(!routes.include.includes("/library-registration/admin/*"));
  assert.ok(!routes.include.includes("/*"));
});

test("administrator documents and API responses are explicitly non-cacheable", async () => {
  const headers = await readFile(join(repositoryRoot, "_headers"), "utf8");
  const match = headers.match(
    /(?:^|\n)\/library-registration\/admin\/\*\r?\n([\s\S]*?)(?=\r?\n\/|$)/
  );
  assert.ok(match, "administrator header block is missing");
  const block = match[1];
  for (const expected of [
    "Cache-Control: private, no-store, max-age=0",
    "Pragma: no-cache",
    "Referrer-Policy: no-referrer",
    "Cross-Origin-Opener-Policy: same-origin-allow-popups",
    "Cross-Origin-Resource-Policy: same-origin",
    "X-Content-Type-Options: nosniff",
    "X-Frame-Options: DENY",
    "X-Robots-Tag: noindex, nofollow"
  ]) {
    assert.ok(block.includes(expected), `administrator headers omit ${expected}`);
  }
});

test("current administrator gates require a private initial two-account allowlist and no second human", async () => {
  const currentPolicyPaths = [
    "project.guide.md",
    "docs/library-registration/admin-access-security-boundary.md",
    "docs/library-registration/phase-roadmap-v3.md",
    "docs/library-registration/phase8b-admin-operations-runbook.md",
    "docs/library-registration/production-gate-handoff-2026-08-02.md"
  ];
  const currentPolicies = await Promise.all(currentPolicyPaths.map(async (path) => ({
    path,
    source: await readFile(join(repositoryRoot, path), "utf8")
  })));

  for (const { path, source } of currentPolicies) {
    assert.ok(source.includes("GOOGLE_ADMIN_ALLOWED_EMAILS"), `${path} omits the private admin allowlist contract`);
    assert.match(source, /大学Workspace[^\n]*個人Gmail|大学Workspace[\s\S]{0,160}個人Gmail/, `${path} omits the two owner-account classes`);
    assert.match(source, /第二管理者[^\n]*(?:要件としない|必須条件にも含めない)/, `${path} does not remove the second-human requirement`);
    assert.ok(source.includes("single-operator risk"), `${path} omits the accepted same-person recovery risk`);
    assert.doesNotMatch(source, /[\w.+-]+@(gmail\.com|st\.kitasato-u\.ac\.jp)/i, `${path} exposes an administrator allowlist value`);

    for (const obsoleteGate of [
      "第二管理者を1名以上",
      "第二管理者未準備",
      "第二管理者は構築開始には不要だが、Production Cutoverには必須",
      "Second administrator required"
    ]) {
      assert.ok(!source.includes(obsoleteGate), `${path} retains obsolete gate: ${obsoleteGate}`);
    }
  }

  const securityPolicy = currentPolicies.find(({ path }) =>
    path.endsWith("admin-access-security-boundary.md")
  ).source;
  assert.ok(securityPolicy.includes("Cloudflare Access"));
  assert.ok(securityPolicy.includes("`noindex`は検索エンジン向けの指示であり、アクセス制御ではない"));
  assert.ok(securityPolicy.includes("管理専用Google Web OAuth Client"));
  assert.ok(securityPolicy.includes("library_admins.google_sub"));
});

test("historical second-administrator artifacts cannot override the current owner-only gate", async () => {
  const historicalPaths = [
    "docs/library-registration/adr/0002-drive-resource-automation.md",
    "docs/library-registration/phase-roadmap-v2.md",
    "docs/library-registration/phase4-admin-oauth-succession-record.md",
    "docs/library-registration/phase4-blocker-resolution-pack.md",
    "docs/library-registration/phase4-evidence-and-decision.md",
    "docs/library-registration/phase4-hd-evidence-record.md",
    "docs/library-registration/phase5-implementation-report.md",
    "docs/library-registration/phase5-postgresql-integration-gate.md",
    "docs/library-registration/phase6a-implementation-report.md",
    "docs/library-registration/phase7-implementation-report.md"
  ];
  for (const path of historicalPaths) {
    const source = await readFile(join(repositoryRoot, path), "utf8");
    assert.match(source.slice(0, 500), /履歴/);
    assert.match(source.slice(0, 500), /ADR-0003/);
    assert.match(source.slice(0, 500), /廃止|置き換え/);
  }

  const activeDriveRunbook = await readFile(
    join(repositoryRoot, "docs/library-registration/phase7-google-drive-e2e-runbook.md"),
    "utf8"
  );
  assert.match(activeDriveRunbook.slice(0, 500), /現行補足/);
  assert.match(activeDriveRunbook.slice(0, 500), /ADR-0003/);
  assert.match(activeDriveRunbook.slice(0, 500), /現行Gateには適用しない/);

  const historicalTool = await readFile(
    join(repositoryRoot, "services/library-api/scripts/phase4_oauth_handoff_server.py"),
    "utf8"
  );
  assert.match(historicalTool.slice(0, 500), /Historical OAuth succession drill/);
  assert.match(historicalTool, /第二管理者は現行のPASS\/Production Gate要件ではありません/);
});

test("production gate requires an explicit target, both google modes and approved origin equality", () => {
  assert.equal(isLibraryProductionRelease({}), false);
  assert.equal(isLibraryProductionRelease({ LIBRARY_RELEASE_TARGET: "local" }), false);
  assert.equal(isLibraryProductionRelease({ LIBRARY_RELEASE_TARGET: "ui_review" }), false);
  assert.equal(
    isLibraryProductionRelease({ LIBRARY_RELEASE_TARGET: "registration_preview" }),
    false
  );
  assert.equal(
    isLibraryProductionRelease({ LIBRARY_RELEASE_TARGET: "production" }),
    true
  );
  assert.throws(() => isLibraryProductionRelease({
    LIBRARY_RELEASE_TARGET: "prod"
  }));
  assert.throws(() => isLibraryProductionRelease({
    CF_PAGES: "1",
    CF_PAGES_BRANCH: "feature/library-preview"
  }));
  assert.equal(isLibraryProductionRelease({
    CF_PAGES: "1",
    CF_PAGES_BRANCH: "feature/library-preview",
    LIBRARY_RELEASE_TARGET: "local"
  }), false);
  assert.equal(isLibraryProductionRelease({
    CF_PAGES: "1",
    CF_PAGES_BRANCH: "library-registration-ui-review-gate1",
    LIBRARY_RELEASE_TARGET: "ui_review"
  }), false);
  assert.equal(isLibraryProductionRelease({
    CF_PAGES: "1",
    CF_PAGES_BRANCH: "library-registration-preview-gate1",
    LIBRARY_RELEASE_TARGET: "registration_preview"
  }), false);
  assert.throws(() => isLibraryProductionRelease({
    CF_PAGES: "1",
    CF_PAGES_BRANCH: "main",
    LIBRARY_RELEASE_TARGET: "local"
  }));
  assert.throws(() => isLibraryProductionRelease({
    CF_PAGES: "1",
    CF_PAGES_BRANCH: "main",
    LIBRARY_RELEASE_TARGET: "ui_review"
  }));
  assert.throws(() => isLibraryProductionRelease({
    CF_PAGES: "1",
    CF_PAGES_BRANCH: "main",
    LIBRARY_RELEASE_TARGET: "registration_preview"
  }));
  assert.equal(isLibraryProductionRelease({
    CF_PAGES: "1",
    CF_PAGES_BRANCH: "main",
    LIBRARY_RELEASE_TARGET: "production"
  }), true);
  assert.throws(() => requireLibraryProductionReleaseConfig(
    productionEnvironment({ LIBRARY_RELEASE_TARGET: "" })
  ));
  assert.throws(() => requireLibraryProductionReleaseConfig(
    productionEnvironment({ NEXT_PUBLIC_LIBRARY_ADMIN_MODE: "mock" })
  ));
  assert.throws(() => requireLibraryProductionReleaseConfig(
    productionEnvironment({
      LIBRARY_RELEASE_APPROVED_API_ORIGIN:
        "https://library-api-approved.a.run.app"
    })
  ));

  const config = requireLibraryProductionReleaseConfig(productionEnvironment());
  assert.equal(config.approvedApiOrigin, apiOrigin);
  assert.equal(config.adminApiBaseUrl, LIBRARY_ADMIN_API_BASE_PATH);
  assert.equal(config.googleClientId, registrationClientId);
  assert.equal(config.adminGoogleClientId, adminClientId);

  const uiReview = requireLibraryUiReviewReleaseConfig({
    LIBRARY_RELEASE_TARGET: "ui_review",
    NEXT_PUBLIC_LIBRARY_UI_REVIEW: "true",
    NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE: "mock",
    NEXT_PUBLIC_LIBRARY_ADMIN_MODE: "mock"
  });
  assert.equal(uiReview.googleBuild, false);
  assert.equal(resolveLibraryReleaseConfig({
    LIBRARY_RELEASE_TARGET: "ui_review",
    NEXT_PUBLIC_LIBRARY_UI_REVIEW: "true",
    NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE: "mock",
    NEXT_PUBLIC_LIBRARY_ADMIN_MODE: "mock"
  }).uiReviewRelease, true);
  assert.throws(() => requireLibraryUiReviewReleaseConfig({
    LIBRARY_RELEASE_TARGET: "ui_review",
    NEXT_PUBLIC_LIBRARY_UI_REVIEW: "true",
    NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE: "google"
  }));
  assert.throws(() => requireLibraryUiReviewReleaseConfig({
    LIBRARY_RELEASE_TARGET: "ui_review",
    NEXT_PUBLIC_LIBRARY_UI_REVIEW: "true",
    NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE: "mock",
    NEXT_PUBLIC_LIBRARY_ADMIN_MODE: "mock",
    NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID: registrationClientId
  }));

  assert.equal(
    requireExactRegistrationPreviewOrigin(registrationPreviewOrigin),
    registrationPreviewOrigin
  );
  for (const invalidOrigin of [
    "https://compass-official.pages.dev",
    "https://library-registration-preview-gate1.example.com",
    "https://abc.compass-official.pages.dev",
    `${registrationPreviewOrigin}/library-registration/`
  ]) {
    assert.throws(() => requireExactRegistrationPreviewOrigin(invalidOrigin));
  }

  const registrationPreview =
    requireLibraryRegistrationPreviewReleaseConfig(
      registrationPreviewEnvironment()
    );
  assert.equal(registrationPreview.registrationMode, "google");
  assert.equal(registrationPreview.adminMode, "mock");
  assert.equal(registrationPreview.approvedApiOrigin, apiOrigin);
  assert.equal(
    registrationPreview.approvedFrontendOrigin,
    registrationPreviewOrigin
  );
  assert.equal(registrationPreview.googleClientId, registrationClientId);
  assert.equal(registrationPreview.adminGoogleClientId, "");
  assert.equal(registrationPreview.adminApiBaseUrl, "");
  assert.equal(
    registrationPreview.approvedHostedDomain,
    LIBRARY_REGISTRATION_HOSTED_DOMAIN
  );
  assert.equal(
    resolveLibraryReleaseConfig(registrationPreviewEnvironment())
      .registrationPreviewRelease,
    true
  );
  assert.throws(() => requireLibraryRegistrationPreviewReleaseConfig(
    registrationPreviewEnvironment({
      NEXT_PUBLIC_LIBRARY_ADMIN_MODE: "google",
      NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID: adminClientId,
      NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL: LIBRARY_ADMIN_API_BASE_PATH
    })
  ));
  assert.throws(() => requireLibraryRegistrationPreviewReleaseConfig(
    registrationPreviewEnvironment({
      NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID: adminClientId
    })
  ));
  assert.throws(() => requireLibraryRegistrationPreviewReleaseConfig(
    registrationPreviewEnvironment({
      LIBRARY_RELEASE_APPROVED_API_ORIGIN:
        "https://library-api-approved.a.run.app"
    })
  ));
  assert.throws(() => requireLibraryRegistrationPreviewReleaseConfig(
    registrationPreviewEnvironment({
      LIBRARY_RELEASE_APPROVED_FRONTEND_ORIGIN:
        "https://compass-official.pages.dev"
    })
  ));
  assert.throws(() => requireLibraryRegistrationPreviewReleaseConfig(
    registrationPreviewEnvironment({
      NEXT_PUBLIC_LIBRARY_GOOGLE_HOSTED_DOMAIN: "gmail.com"
    })
  ));
});

test("production artifact verifier rejects visible mock administrator copy", async () => {
  const template = await readFile(new URL("../_headers", import.meta.url), "utf8");
  const config = requireLibraryProductionReleaseConfig(productionEnvironment());
  const deploymentHeaders = renderLibraryDeploymentHeaders(template, config);
  const artifacts = {
    registrationHtml: '<main><span>GOOGLE API</span></main>',
    adminHtml: '<main><h1>管理者ログイン</h1></main>',
    deploymentHeaders,
    config,
    textArtifacts: [
      {
        label: "out/_next/static/chunks/registration.js",
        contents: `registration audience ${registrationClientId}`
      },
      {
        label: "out/_next/static/chunks/admin.js",
        contents:
          `administrator audience ${adminClientId} ${LIBRARY_ADMIN_API_BASE_PATH}`
      }
    ]
  };

  assert.doesNotThrow(() => verifyLibraryProductionArtifacts(artifacts));
  assert.throws(() => verifyLibraryProductionArtifacts({
    ...artifacts,
    adminHtml: '<main><h1>管理者ログイン</h1><label id="mock-admin-role">local</label></main>'
  }));
  assert.throws(() => verifyLibraryProductionArtifacts({
    ...artifacts,
    registrationHtml: '<main><span>GOOGLE API</span><span>LOCAL MOCK</span></main>'
  }));
  assert.throws(() => verifyLibraryProductionArtifacts({
    ...artifacts,
    registrationHtml: '<main><span>GOOGLE API</span><span>REGISTRATION DISABLED</span></main>'
  }));
  assert.throws(() => verifyLibraryProductionArtifacts({
    ...artifacts,
    textArtifacts: [
      {
        label: "out/_next/static/chunks/preview.js",
        contents:
          `const email="hanako@example.invalid";${registrationClientId}${adminClientId}`
      }
    ]
  }));
  assert.throws(() => verifyLibraryProductionArtifacts({
    ...artifacts,
    textArtifacts: [
      {
        label: "out/_next/static/chunks/registration.js",
        contents: registrationClientId
      }
    ]
  }), /administrator Google OAuth client ID/);
  assert.throws(() => verifyLibraryProductionArtifacts({
    ...artifacts,
    textArtifacts: [
      ...artifacts.textArtifacts,
      {
        label: "out/_next/static/chunks/forbidden.js",
        contents: `const leaked="npg_${"A".repeat(12)}";`
      }
    ]
  }), /forbidden private material \[neon_password\]/);
  assert.doesNotThrow(() => verifyLibraryProductionArtifacts({
    ...artifacts,
    textArtifacts: [
      ...artifacts.textArtifacts,
      {
        label: "out/_next/static/css/admin.css",
        contents: ".admin-mock-login{display:none}"
      }
    ]
  }));
});

test("registration UI keeps the approved public copy and accessibility contract", async () => {
  const [registrationSource, layoutSource, siteHeaderSource] = await Promise.all([
    readFile(new URL("../src/library-registration/RegistrationMvp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/(library)/library-registration/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/SiteHeader.tsx", import.meta.url), "utf8")
  ]);

  for (const required of [
    '<SiteHeader routeContext="library" hideLibraryRegistrationAction />',
    'className="registration-page-heading"',
    "ようこそ、",
    "未来戦略ライブラリへ。",
    "必要事項を入力してください。現在は北里大学薬学部生の方を対象としており、登録は3分ほどで完了します。",
    "大学アカウント認証",
    "hostedDomain={runtimeConfig.expectedHostedDomain}",
    "isTrustedRegistrationPreviewLocation(window.location)",
    "REGISTRATION_PREVIEW_BUILD && previewHostAllowed",
    "現在、利用登録を受け付けていません。時間をおいて再度お試しください。",
    "このアカウントで続ける",
    "Google Drive上のライブラリ共有フォルダ",
    "登録内容を確認する",
    'if (result.status === "approved")',
    "お申し込みを受け付けました。",
    "通常は数分から15分程度で処理が完了しますが、システム上の不具合等により正常に送信されない場合があります。",
    "24時間以上経過しても招待メールが届かない場合は、お手数ですが",
    '<a href="/contact/">問い合わせフォーム</a>',
    "今後とも、未来戦略ライブラリをよろしくお願いいたします。",
    "const [termsOpen, setTermsOpen] = useState(false)",
    "const [termsReviewed, setTermsReviewed] = useState(false)",
    "const [privacyOpen, setPrivacyOpen] = useState(false)",
    'aria-controls="terms-content"',
    "disabled={!termsReviewed}",
    'aria-describedby="terms-review-help"',
    "tabIndex={-1}",
    "aria-busy={isSubmitting}",
    "aria-invalid={studentNumberHasError}",
    "required={requiresStudentDetails}",
    "aria-required={requiresStudentDetails}",
    "aria-required=\"true\"",
    "const hasAllowedWorkspaceAccount = Boolean(",
    "const canSubmit = hasAllowedWorkspaceAccount",
    "ご意見・ご質問 <span>任意</span>"
  ]) {
    assert.ok(registrationSource.includes(required), `missing registration UI contract: ${required}`);
  }

  for (const removedProgressUi of [
    'className="decision-card"',
    "入力状況",
    "必要項目の入力状況を確認できます。"
  ]) {
    assert.ok(
      !registrationSource.includes(removedProgressUi),
      `registration UI retains removed progress panel: ${removedProgressUi}`
    );
  }

  assert.match(
    registrationSource,
    /checked=\{form\.termsAccepted\}[\s\S]{0,420}required=\{requiresStudentDetails\}[\s\S]{0,120}aria-required=\{requiresStudentDetails\}/
  );
  assert.match(
    registrationSource,
    /checked=\{form\.privacyAccepted\}[\s\S]{0,240}\brequired\b[\s\S]{0,120}aria-required="true"/
  );

  for (const forbidden of [
    "LIBRARY REGISTRATION / PHASE 7",
    "SERVER-SIDE DECISION CONTRACT",
    "判定条件プレビュー",
    "認証済み登録APIテスト",
    "PREVIEW STATUS",
    "Future Strategy Library Registration / Phase 7",
    "LOCAL PREVIEW",
    "ローカル検証版",
    "検証用アカウント",
    "モックアカウントで確認する",
    "個人Googleアカウント",
    "personal@gmail.com",
    "IDトークン",
    "phase3-draft",
    "必要事項を入力し、大学アカウントを確認してください。",
    "所要時間は約3分です。",
    "必要事項が揃うと、登録内容を確認できます。",
    "残り:",
    'id="registration-readiness"',
    'className="registration-hero"',
    'className="registration-intro-shell"',
    'className="form-introduction"',
    "共有ドライブ"
  ]) {
    assert.ok(!registrationSource.includes(forbidden), `obsolete public copy remains: ${forbidden}`);
  }

  assert.ok(layoutSource.includes('title: "利用登録 | 未来戦略ライブラリ"'));
  assert.ok(layoutSource.includes('description: "未来戦略ライブラリの利用登録フォームです。"'));
  assert.ok(layoutSource.includes('import "../../../styles/legacy.css";'));
  assert.ok(!layoutSource.includes("MVP"));
  assert.ok(siteHeaderSource.includes("hideLibraryRegistrationAction = false"));
  assert.ok(siteHeaderSource.includes("routeContext === \"library\" && !hideLibraryRegistrationAction"));
});

test("public library registration CTA defaults to the internal route with an exact legacy rollback", async () => {
  const [libraryConfigSource, registrationCtaSource, siteHeaderSource] = await Promise.all([
    readFile(new URL("../src/lib/futureStrategyLibrary.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../src/app/(official)/future-strategy-library/components/RegistrationCTA.client.tsx",
        import.meta.url
      ),
      "utf8"
    ),
    readFile(new URL("../src/components/SiteHeader.tsx", import.meta.url), "utf8")
  ]);

  assert.match(libraryConfigSource, /: "\/library-registration\/"/);
  assert.match(
    libraryConfigSource,
    /process\.env\.NEXT_PUBLIC_FSL_REGISTRATION_URL ===\s*FUTURE_STRATEGY_LIBRARY_LEGACY_FORM_HREF/
  );
  assert.match(registrationCtaSource, /isExternal \? "↗" : "→"/);
  assert.match(
    registrationCtaSource,
    /<Link[\s\S]*?href=\{FUTURE_STRATEGY_LIBRARY_REGISTRATION_HREF\}[\s\S]*?prefetch=\{false\}/
  );
  assert.match(siteHeaderSource, /libraryRegistrationIsExternal/);
  assert.match(
    siteHeaderSource,
    /target=\{libraryRegistrationIsExternal \? "_blank" : undefined\}/
  );
});

test("registration responsive CSS preserves narrow-screen and readable-color contracts", async () => {
  const css = await readFile(
    new URL("../src/library-registration/registration.css", import.meta.url),
    "utf8"
  );

  for (const requiredPattern of [
    /form:focus-visible/,
    /\.sr-only\s*\{/,
    /@media\s*\(max-width:\s*900px\)/,
    /@media\s*\(max-width:\s*620px\)/,
    /@media\s*\(max-width:\s*360px\)/,
    /\.google-sign-in-container\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;/s,
    /\.field-grid\s*\{\s*grid-template-columns:\s*1fr;/,
    /\.agreement-disclosure\s*\{/,
    /\.agreement-trigger\s*\{/,
    /\.check-row\.is-locked/,
    /\.button-submit\s*\{[^}]*width:\s*100%;[^}]*min-height:\s*56px;/s,
    /\.registration-page-heading\s*\{\s*padding:\s*28px\s+20px\s+24px;/,
    /\.registration-page-heading h1\s*\{[^}]*font-size:\s*clamp\(1\.3rem,\s*6\.5vw,\s*1\.72rem\);[^}]*white-space:\s*nowrap;/s,
    /\.registration-page-heading,\s*\.registration-grid,\s*\.registration-footer\s*\{[^}]*width:\s*calc\(100%\s*-\s*24px\);/s,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)/
  ]) {
    assert.match(css, requiredPattern);
  }

  const paper = cssHexVariable(css, "registration-paper");
  for (const name of ["registration-blue", "registration-gold"]) {
    const ratio = contrastRatio(cssHexVariable(css, name), paper);
    assert.ok(ratio >= 4.5, `${name} contrast ${ratio.toFixed(2)} must be at least 4.5`);
  }
});

test("public repository CI runs the locked frontend and backend security gates with least privilege", async () => {
  const workflow = await readFile(
    join(repositoryRoot, ".github", "workflows", "library-security-quality.yml"),
    "utf8"
  );
  assert.match(workflow, /^permissions:\r?\n\s+contents: read$/m);
  assert.equal((workflow.match(/persist-credentials: false/g) ?? []).length, 2);
  assert.match(workflow, /run: npm run verify:public-source/);
  assert.match(workflow, /run: npm audit --audit-level=high/);
  assert.match(workflow, /run: npm run rehearse:library-production/);
  assert.match(workflow, /run: uv sync --locked --dev/);
  assert.match(workflow, /run: uv run --locked pytest/);
  assert.match(
    workflow,
    /uses: actions\/dependency-review-action@[0-9a-f]{40}\s+# v5(?:\.\d+){0,2}/
  );
  assert.match(workflow, /fail-on-severity: moderate/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);

  const dependabot = await readFile(
    join(repositoryRoot, ".github", "dependabot.yml"),
    "utf8"
  );
  for (const ecosystem of ["npm", "uv", "terraform", "github-actions"]) {
    assert.match(dependabot, new RegExp(`package-ecosystem: ${ecosystem}`));
  }

  const codeql = await readFile(
    join(repositoryRoot, ".github", "workflows", "codeql.yml"),
    "utf8"
  );
  assert.match(codeql, /security-events: write/);
  assert.match(codeql, /javascript-typescript/);
  assert.match(codeql, /- python/);
  assert.match(codeql, /queries: security-extended/);
  assert.doesNotMatch(codeql, /\$\{\{\s*secrets\./);

  const securityPolicy = await readFile(
    join(repositoryRoot, ".github", "SECURITY.md"),
    "utf8"
  );
  assert.match(securityPolicy, /private vulnerability reporting/i);
  assert.match(securityPolicy, /Never include real access tokens/i);
});
