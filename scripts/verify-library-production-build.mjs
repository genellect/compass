import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  LIBRARY_ADMIN_PREVIEW_ARTIFACT_MARKERS,
  requireLibraryProductionReleaseConfig,
  verifyLibraryHeaderBoundary
} from "./library-release-config.mjs";
import { publicSourceFindings } from "./verify-public-source-boundary.mjs";

const TEXT_ARTIFACT_PATTERN = /(?:^|[\\/])(?:_headers|_redirects)$|\.(?:css|html|js|json|map|svg|txt|xml)$/i;

export async function collectProductionTextArtifacts(directory) {
  const artifacts = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      artifacts.push(...await collectProductionTextArtifacts(absolute));
    } else if (entry.isFile() && TEXT_ARTIFACT_PATTERN.test(absolute)) {
      artifacts.push(absolute);
    }
  }
  return artifacts;
}

function requireIncludes(value, expected, label) {
  if (!value.includes(expected)) {
    throw new Error(`${label} is missing required production marker: ${expected}`);
  }
}

function requireExcludes(value, unexpected, label) {
  if (value.includes(unexpected)) {
    throw new Error(`${label} contains forbidden mock/synthetic marker: ${unexpected}`);
  }
}

function requireNoSecrets(value, label) {
  const [finding] = publicSourceFindings([{
    file: label.replaceAll("\\", "/"),
    contents: value,
    tracked: false
  }]);
  if (finding) {
    throw new Error(`${label} contains forbidden private material [${finding.rule}].`);
  }
}

export function verifyLibraryProductionArtifacts({
  registrationHtml,
  adminHtml,
  deploymentHeaders,
  config,
  textArtifacts = []
}) {
  verifyLibraryHeaderBoundary(deploymentHeaders, config);
  requireNoSecrets(deploymentHeaders, "Generated deployment headers");

  requireIncludes(registrationHtml, "GOOGLE API", "Library registration HTML");
  requireIncludes(adminHtml, "管理者として認証", "Library administrator HTML");

  for (const marker of [
    "LOCAL MOCK",
    "REGISTRATION DISABLED",
    "mock-account-select"
  ]) {
    requireExcludes(registrationHtml, marker, "Library registration HTML");
  }
  for (const marker of LIBRARY_ADMIN_PREVIEW_ARTIFACT_MARKERS) {
    requireExcludes(adminHtml, marker, "Library administrator HTML");
  }

  let registrationOAuthClientOccurrences = 0;
  let adminOAuthClientOccurrences = 0;
  let adminApiBaseOccurrences = 0;
  for (const artifact of textArtifacts) {
    requireNoSecrets(artifact.contents, artifact.label);
    registrationOAuthClientOccurrences +=
      artifact.contents.split(config.googleClientId).length - 1;
    adminOAuthClientOccurrences +=
      artifact.contents.split(config.adminGoogleClientId).length - 1;
    adminApiBaseOccurrences +=
      artifact.contents.split(config.adminApiBaseUrl).length - 1;
    if (/\.(?:html|js)$/i.test(artifact.label)) {
      for (const marker of LIBRARY_ADMIN_PREVIEW_ARTIFACT_MARKERS) {
        requireExcludes(artifact.contents, marker, artifact.label);
      }
    }
  }
  if (textArtifacts.length > 0) {
    if (registrationOAuthClientOccurrences < 1) {
      throw new Error(
        "Production export is missing the registration Google OAuth client ID."
      );
    }
    if (adminOAuthClientOccurrences < 1) {
      throw new Error(
        "Production export is missing the administrator Google OAuth client ID."
      );
    }
    if (adminApiBaseOccurrences < 1) {
      throw new Error(
        "Production export is missing the same-origin administrator API base."
      );
    }
  }

  const apiOriginOccurrences =
    deploymentHeaders.split(config.approvedApiOrigin).length - 1;
  if (apiOriginOccurrences !== 1) {
    throw new Error(
      `Approved API origin must occur exactly once in generated headers; found ${apiOriginOccurrences}.`
    );
  }

  return {
    registrationOAuthClientOccurrences,
    adminOAuthClientOccurrences,
    adminApiBaseOccurrences
  };
}

export async function verifyLibraryProductionBuild({
  root = process.cwd(),
  environment = process.env
} = {}) {
  const config = requireLibraryProductionReleaseConfig(environment);
  const out = path.join(root, "out");
  const artifactPaths = await collectProductionTextArtifacts(out);
  const [registrationHtml, adminHtml, deploymentHeaders, artifactContents] = await Promise.all([
    readFile(path.join(out, "library-registration", "index.html"), "utf8"),
    readFile(
      path.join(out, "library-registration", "admin", "index.html"),
      "utf8"
    ),
    readFile(path.join(out, "_headers"), "utf8"),
    Promise.all(artifactPaths.map(async (artifact) => ({
      label: path.relative(root, artifact),
      contents: await readFile(artifact, "utf8")
    })))
  ]);

  const verification = verifyLibraryProductionArtifacts({
    registrationHtml,
    adminHtml,
    deploymentHeaders,
    config,
    textArtifacts: artifactContents
  });
  return {
    ...config,
    ...verification,
    inspectedArtifactCount: artifactContents.length
  };
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  const config = await verifyLibraryProductionBuild();
  console.log(
    `Verified fail-closed library production build for ${config.approvedApiOrigin}; `
      + `inspected ${config.inspectedArtifactCount} deployable text artifacts; `
      + `found ${config.registrationOAuthClientOccurrences} registration and `
      + `${config.adminOAuthClientOccurrences} administrator OAuth client references; `
      + `found ${config.adminApiBaseOccurrences} administrator proxy-base references; `
      + "found 0 administrator preview markers."
  );
}
