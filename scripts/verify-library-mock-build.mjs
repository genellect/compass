import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  resolveLibraryReleaseConfig,
  verifyLibraryHeaderBoundary
} from "./library-release-config.mjs";
import { publicSourceFindings } from "./verify-public-source-boundary.mjs";

export const REHEARSAL_API_ORIGIN = "https://192.0.2.1";
export const REHEARSAL_REGISTRATION_GOOGLE_CLIENT_ID =
  "999999999999-registration-rehearsal.apps.googleusercontent.com";
export const REHEARSAL_ADMIN_GOOGLE_CLIENT_ID =
  "888888888888-admin-rehearsal.apps.googleusercontent.com";

function requireIncludes(value, expected, label) {
  if (!value.includes(expected)) {
    throw new Error(`${label} is missing required mock marker: ${expected}`);
  }
}

function requireExcludes(value, unexpected, label) {
  if (value.includes(unexpected)) {
    throw new Error(`${label} contains forbidden production rehearsal value.`);
  }
}

function requireNoPrivateMaterial(value, label) {
  const [finding] = publicSourceFindings([{
    file: label.replaceAll("\\", "/"),
    contents: value,
    tracked: false
  }]);
  if (finding) {
    throw new Error(`${label} contains forbidden private material [${finding.rule}].`);
  }
}

const TEXT_ARTIFACT_PATTERN = /(?:^|[\\/])(?:_headers|_redirects)$|\.(?:css|html|js|json|map|svg|txt|xml)$/i;

export async function collectMockTextArtifacts(directory) {
  const artifacts = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      artifacts.push(...await collectMockTextArtifacts(absolute));
    } else if (entry.isFile() && TEXT_ARTIFACT_PATTERN.test(absolute)) {
      artifacts.push(absolute);
    }
  }
  return artifacts;
}

export function verifyLibraryMockArtifacts({
  registrationHtml,
  adminHtml,
  deploymentHeaders,
  config
}) {
  if (config.registrationMode !== "mock" || config.adminMode !== "mock") {
    throw new Error("Mock artifact verification requires both library modes to be mock.");
  }
  verifyLibraryHeaderBoundary(deploymentHeaders, config);

  requireIncludes(
    registrationHtml,
    "REGISTRATION DISABLED",
    "Library registration fail-closed HTML"
  );
  requireIncludes(
    registrationHtml,
    "現在、利用登録を受け付けていません。時間をおいて再度お試しください。",
    "Library registration fail-closed HTML"
  );
  requireExcludes(
    registrationHtml,
    'class="mock-account-select"',
    "Library registration HTML"
  );
  requireIncludes(
    adminHtml,
    "管理画面の認証設定が完了していません。",
    "Library administrator fail-closed HTML"
  );
  requireExcludes(adminHtml, 'class="admin-mock-login"', "Library administrator HTML");
  requireExcludes(adminHtml, 'id="mock-admin-role"', "Library administrator HTML");
  requireExcludes(adminHtml, "画面を準備しています", "Library administrator HTML");
  for (const marker of ["GOOGLE API", "ADMIN API"]) {
    requireExcludes(registrationHtml, marker, "Library registration HTML");
    requireExcludes(adminHtml, marker, "Library administrator HTML");
  }
  requireExcludes(
    deploymentHeaders,
    REHEARSAL_API_ORIGIN,
    "Generated deployment headers"
  );
}

export async function verifyLibraryMockBuild({
  root = process.cwd(),
  environment = process.env
} = {}) {
  const { productionRelease, config } = resolveLibraryReleaseConfig(environment);
  if (productionRelease) {
    throw new Error("Mock artifact verification refuses a production release target.");
  }
  if (config.registrationMode !== "mock" || config.adminMode !== "mock") {
    throw new Error("Final export is not explicitly configured for mock mode.");
  }

  const out = path.join(root, "out");
  const [registrationHtml, adminHtml, deploymentHeaders] = await Promise.all([
    readFile(path.join(out, "library-registration", "index.html"), "utf8"),
    readFile(
      path.join(out, "library-registration", "admin", "index.html"),
      "utf8"
    ),
    readFile(path.join(out, "_headers"), "utf8")
  ]);

  verifyLibraryMockArtifacts({
    registrationHtml,
    adminHtml,
    deploymentHeaders,
    config
  });

  const forbiddenValues = [
    REHEARSAL_API_ORIGIN,
    REHEARSAL_REGISTRATION_GOOGLE_CLIENT_ID,
    REHEARSAL_ADMIN_GOOGLE_CLIENT_ID
  ];
  const textArtifacts = await collectMockTextArtifacts(out);
  let adminPreviewDataPresent = false;
  for (const artifact of textArtifacts) {
    const contents = await readFile(artifact, "utf8");
    const label = path.relative(root, artifact);
    requireNoPrivateMaterial(contents, label);
    if (contents.includes("app-synthetic-001")) adminPreviewDataPresent = true;
    for (const forbidden of forbiddenValues) {
      requireExcludes(contents, forbidden, label);
    }
  }
  if (!adminPreviewDataPresent) {
    throw new Error("Mock export is missing the isolated administrator preview data chunk.");
  }

  return {
    config,
    inspectedArtifactCount: textArtifacts.length,
    adminPreviewDataPresent
  };
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  const result = await verifyLibraryMockBuild();
  console.log(
    `Verified explicit mock library export and absence of rehearsal values in ${result.inspectedArtifactCount} text artifacts.`
  );
}
