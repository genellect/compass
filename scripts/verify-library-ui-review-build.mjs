import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  LIBRARY_ADMIN_PREVIEW_ARTIFACT_MARKERS,
  requireLibraryUiReviewReleaseConfig,
  verifyLibraryHeaderBoundary
} from "./library-release-config.mjs";
import { verifyLegacyLibraryCtaArtifacts } from
  "./verify-library-cloudflare-preview.mjs";
import { publicSourceFindings } from "./verify-public-source-boundary.mjs";

const TEXT_ARTIFACT_PATTERN =
  /(?:^|[\\/])(?:_headers|_redirects)$|\.(?:css|html|js|json|map|svg|txt|xml)$/i;

async function collectFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

async function requireAbsent(target, label) {
  try {
    await access(target);
  } catch {
    return;
  }
  throw new Error(`${label} must be absent from the UI review artifact.`);
}

async function verifyRegistrationAssetReferences(stage, registrationHtml) {
  const references = [...registrationHtml.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1].split(/[?#]/, 1)[0])
    .filter((value) => value.startsWith("/_next/"));
  for (const reference of new Set(references)) {
    await access(path.join(stage, ...reference.slice(1).split("/")));
  }
}

export async function verifyLibraryUiReviewBuild({
  root = process.cwd(),
  stage,
  environment = process.env
}) {
  if (!stage) throw new Error("UI review staging directory is required.");
  const resolvedStage = path.resolve(stage);
  const stageRoot = path.dirname(resolvedStage);
  const config = requireLibraryUiReviewReleaseConfig(environment);

  const stageRootEntries = await readdir(stageRoot, { withFileTypes: true });
  if (
    stageRootEntries.length !== 1
    || stageRootEntries[0].name !== "site"
    || !stageRootEntries[0].isDirectory()
    || path.resolve(stageRoot, stageRootEntries[0].name) !== resolvedStage
  ) {
    throw new Error("UI review staging root must contain exactly the site directory.");
  }

  await Promise.all([
    requireAbsent(
      path.join(resolvedStage, "library-registration", "admin"),
      "Library administrator route"
    ),
    requireAbsent(path.join(resolvedStage, "_routes.json"), "Pages Functions route map"),
    requireAbsent(path.join(resolvedStage, "_worker.js"), "Pages Worker bundle"),
    requireAbsent(path.join(resolvedStage, "functions"), "Pages Functions source"),
    requireAbsent(path.join(resolvedStage, "wrangler.toml"), "Published Wrangler configuration"),
    requireAbsent(path.join(resolvedStage, "wrangler.json"), "Published Wrangler configuration"),
    requireAbsent(path.join(resolvedStage, "wrangler.jsonc"), "Published Wrangler configuration"),
    requireAbsent(path.join(resolvedStage, ".env"), "Published dotenv configuration"),
    requireAbsent(path.join(resolvedStage, ".dev.vars"), "Published Wrangler secrets"),
    requireAbsent(path.join(stageRoot, "functions"), "Sibling Pages Functions source"),
    requireAbsent(path.join(stageRoot, "wrangler.toml"), "Sibling Wrangler configuration"),
    requireAbsent(path.join(stageRoot, "wrangler.json"), "Sibling Wrangler configuration"),
    requireAbsent(path.join(stageRoot, "wrangler.jsonc"), "Sibling Wrangler configuration"),
    requireAbsent(path.join(stageRoot, ".env"), "Sibling dotenv configuration"),
    requireAbsent(path.join(stageRoot, ".dev.vars"), "Sibling Wrangler secrets")
  ]);

  const [registrationHtml, officialLibraryHtml, officialHomeHtml, headers] =
    await Promise.all([
      readFile(path.join(resolvedStage, "library-registration", "index.html"), "utf8"),
      readFile(path.join(resolvedStage, "future-strategy-library", "index.html"), "utf8"),
      readFile(path.join(resolvedStage, "index.html"), "utf8"),
      readFile(path.join(resolvedStage, "_headers"), "utf8")
    ]);

  if (!registrationHtml.includes("REGISTRATION DISABLED")) {
    throw new Error("UI review registration must remain explicitly fail-closed.");
  }
  for (const forbidden of [
    'class="mock-account-select"',
    "GOOGLE API",
    "LOCAL MOCK",
    "apps.googleusercontent.com"
  ]) {
    if (registrationHtml.includes(forbidden)) {
      throw new Error(`UI review registration HTML contains forbidden marker: ${forbidden}.`);
    }
  }

  verifyLibraryHeaderBoundary(headers, config);
  verifyLegacyLibraryCtaArtifacts({ officialLibraryHtml, officialHomeHtml });
  await verifyRegistrationAssetReferences(resolvedStage, registrationHtml);

  const textArtifacts = (await collectFiles(resolvedStage))
    .filter((file) => TEXT_ARTIFACT_PATTERN.test(file));
  for (const artifact of textArtifacts) {
    const contents = await readFile(artifact, "utf8");
    const relative = path.relative(root, artifact).replaceAll("\\", "/");
    const [privateFinding] = publicSourceFindings([{
      file: relative,
      contents,
      tracked: false
    }]);
    if (privateFinding) {
      throw new Error(
        `UI review artifact contains forbidden private material [${privateFinding.rule}].`
      );
    }
    const adminMarker = LIBRARY_ADMIN_PREVIEW_ARTIFACT_MARKERS.find(
      (marker) => marker && contents.includes(marker)
    );
    if (adminMarker) {
      throw new Error(`UI review artifact retains an administrator preview marker in ${relative}.`);
    }
    if (/\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com/i.test(contents)) {
      throw new Error(`UI review artifact retains a Google OAuth client ID in ${relative}.`);
    }
  }

  return { inspectedArtifactCount: textArtifacts.length };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  const result = await verifyLibraryUiReviewBuild({
    stage: argumentValue("--stage")
  });
  console.log(
    `Verified protected UI review artifact across ${result.inspectedArtifactCount} text files.`
  );
}
