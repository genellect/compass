import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  LIBRARY_ADMIN_PREVIEW_ARTIFACT_MARKERS,
  requireLibraryRegistrationPreviewReleaseConfig,
  verifyLibraryHeaderBoundary
} from "./library-release-config.mjs";
import { verifyLegacyLibraryCtaArtifacts } from
  "./verify-library-cloudflare-preview.mjs";
import { publicSourceFindings } from "./verify-public-source-boundary.mjs";

const TEXT_ARTIFACT_PATTERN =
  /(?:^|[\\/])(?:_headers|_redirects)$|\.(?:css|html|js|json|map|svg|txt|xml)$/i;
const GOOGLE_CLIENT_ID_PATTERN =
  /\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com/gi;

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
  throw new Error(`${label} must be absent from the Registration Preview artifact.`);
}

async function verifyHtmlAssetReferences(stage, htmlFiles) {
  for (const htmlFile of htmlFiles) {
    const html = await readFile(htmlFile, "utf8");
    const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => match[1].split(/[?#]/, 1)[0])
      .filter((value) => value.startsWith("/_next/"));
    for (const reference of new Set(references)) {
      try {
        await access(path.join(stage, ...reference.slice(1).split("/")));
      } catch {
        throw new Error(
          `Staged HTML references a missing Next.js asset: ${reference}.`
        );
      }
    }
  }
}

async function verifyNoForbiddenDeployPaths(stage, directory = stage) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(stage, absolute).replaceAll("\\", "/");
    const lowerRelative = relative.toLowerCase();
    const basename = entry.name.toLowerCase();
    const segments = lowerRelative.split("/");
    const forbiddenConfiguration = (
      basename === ".env"
      || basename.startsWith(".env.")
      || basename === ".dev.vars"
      || basename.startsWith(".dev.vars.")
      || /^wrangler\.(?:toml|json|jsonc)$/.test(basename)
    );
    if (
      forbiddenConfiguration
      || basename === "_routes.json"
      || basename === "_worker.js"
      || basename === "_worker.js.map"
      || segments.includes("functions")
      || lowerRelative.startsWith("library-registration/admin/")
      || lowerRelative.includes("/library-registration/admin/")
    ) {
      throw new Error(
        `Registration Preview contains a forbidden deploy path: ${relative}.`
      );
    }
    if (entry.isDirectory()) {
      await verifyNoForbiddenDeployPaths(stage, absolute);
    }
  }
}

export async function verifyLibraryRegistrationPreviewBuild({
  root = process.cwd(),
  stage,
  environment = process.env
}) {
  if (!stage) {
    throw new Error("Registration Preview staging directory is required.");
  }
  const resolvedStage = path.resolve(stage);
  const stageRoot = path.dirname(resolvedStage);
  const config = requireLibraryRegistrationPreviewReleaseConfig(environment);

  const stageRootEntries = await readdir(stageRoot, { withFileTypes: true });
  if (
    stageRootEntries.length !== 1
    || stageRootEntries[0].name !== "site"
    || !stageRootEntries[0].isDirectory()
    || path.resolve(stageRoot, stageRootEntries[0].name) !== resolvedStage
  ) {
    throw new Error(
      "Registration Preview staging root must contain exactly the site directory."
    );
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

  if (!registrationHtml.includes("GOOGLE API")) {
    throw new Error(
      "Registration Preview must contain the Google registration runtime."
    );
  }
  for (const forbidden of [
    'class="mock-account-select"',
    "LOCAL MOCK",
    "REGISTRATION DISABLED"
  ]) {
    if (registrationHtml.includes(forbidden)) {
      throw new Error(
        `Registration Preview HTML contains forbidden marker: ${forbidden}.`
      );
    }
  }

  verifyLibraryHeaderBoundary(headers, config);
  verifyLegacyLibraryCtaArtifacts({ officialLibraryHtml, officialHomeHtml });

  const apiOriginHeaderOccurrences =
    headers.split(config.approvedApiOrigin).length - 1;
  if (apiOriginHeaderOccurrences !== 1) {
    throw new Error(
      `Approved API origin must occur exactly once in generated headers; found ${apiOriginHeaderOccurrences}.`
    );
  }

  const allFiles = await collectFiles(resolvedStage);
  await verifyNoForbiddenDeployPaths(resolvedStage);
  await verifyHtmlAssetReferences(
    resolvedStage,
    allFiles.filter((file) => file.toLowerCase().endsWith(".html"))
  );
  const textArtifacts = allFiles
    .filter((file) => TEXT_ARTIFACT_PATTERN.test(file));
  let registrationClientOccurrences = 0;
  let apiOriginOccurrences = 0;
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
        `Registration Preview artifact contains forbidden private material [${privateFinding.rule}].`
      );
    }
    const adminMarker = LIBRARY_ADMIN_PREVIEW_ARTIFACT_MARKERS.find(
      (marker) => marker && contents.includes(marker)
    );
    if (adminMarker) {
      throw new Error(
        `Registration Preview retains an administrator preview marker in ${relative}.`
      );
    }

    const clientIds = contents.match(GOOGLE_CLIENT_ID_PATTERN) ?? [];
    for (const clientId of clientIds) {
      if (clientId !== config.googleClientId) {
        throw new Error(
          `Registration Preview contains an unapproved Google OAuth client ID in ${relative}.`
        );
      }
      registrationClientOccurrences += 1;
    }
    apiOriginOccurrences +=
      contents.split(config.approvedApiOrigin).length - 1;
  }

  if (registrationClientOccurrences < 1) {
    throw new Error(
      "Registration Preview is missing its approved registration Google OAuth client ID."
    );
  }
  if (apiOriginOccurrences < 2) {
    throw new Error(
      "Registration Preview must contain the approved API origin in its CSP and registration runtime."
    );
  }

  return {
    approvedFrontendOrigin: config.approvedFrontendOrigin,
    inspectedArtifactCount: textArtifacts.length,
    registrationClientOccurrences,
    apiOriginOccurrences
  };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  const result = await verifyLibraryRegistrationPreviewBuild({
    stage: argumentValue("--stage")
  });
  console.log(
    `Verified registration-only Preview artifact for ${result.approvedFrontendOrigin}; `
      + `inspected ${result.inspectedArtifactCount} text files; `
      + "administrator route and executable Pages surfaces are absent."
  );
}
