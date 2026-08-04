import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  LIBRARY_ADMIN_PREVIEW_ARTIFACT_MARKERS,
  LIBRARY_REGISTRATION_PRODUCTION_API_ORIGIN,
  LIBRARY_REGISTRATION_PRODUCTION_FRONTEND_ORIGIN,
  requireLibraryRegistrationProductionReleaseConfig,
  verifyLibraryHeaderBoundary
} from "./library-release-config.mjs";
import { LEGACY_LIBRARY_FORM_URL } from
  "./verify-library-cloudflare-preview.mjs";
import { publicSourceFindings } from "./verify-public-source-boundary.mjs";

const TEXT_ARTIFACT_PATTERN =
  /(?:^|[\\/])(?:_headers|_redirects)$|\.(?:css|html|js|json|map|svg|ts|txt|xml)$/i;
const GOOGLE_CLIENT_ID_PATTERN =
  /\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com/gi;
const ADMIN_ARTIFACT_MARKERS = Object.freeze([
  ...LIBRARY_ADMIN_PREVIEW_ARTIFACT_MARKERS,
  "/library-registration/admin",
  "NEXT_PUBLIC_LIBRARY_ADMIN_",
  "LIBRARY_ADMIN_"
]);
const EXPECTED_FUNCTION_ROUTES = Object.freeze({
  version: 1,
  include: ["/api/community-registration", "/api/contact"],
  exclude: []
});

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
  throw new Error(`${label} must be absent from registration-only production.`);
}

async function requireExactFiles(directory, expected, label) {
  const actual = (await collectFiles(directory))
    .map((file) => path.relative(directory, file).replaceAll("\\", "/"))
    .sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${label} contains an unreviewed file: ${actual.join(", ")}.`);
  }
}

async function verifyHtmlAssetReferences(stage, htmlFiles) {
  for (const htmlFile of htmlFiles) {
    const html = await readFile(htmlFile, "utf8");
    const references = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map((match) => match[1].split(/[?#]/, 1)[0])
      .filter((value) => value.startsWith("/_next/"));
    for (const reference of new Set(references)) {
      try {
        await access(path.join(stage, ...reference.slice(1).split("/")));
      } catch {
        throw new Error(`Staged HTML references a missing Next.js asset: ${reference}.`);
      }
    }
  }
}

function verifyProductionCta(officialLibraryHtml) {
  if (officialLibraryHtml.includes(LEGACY_LIBRARY_FORM_URL)) {
    throw new Error("Production Library CTA retains the legacy Google Form URL.");
  }
  if (!/href=["']\/library-registration\/?["']/i.test(officialLibraryHtml)) {
    throw new Error("Production Library CTA does not target /library-registration/.");
  }
}

export async function verifyLibraryRegistrationProductionBuild({
  root = process.cwd(),
  stage,
  environment = process.env
}) {
  if (!stage) throw new Error("Registration production staging directory is required.");
  const resolvedStage = path.resolve(stage);
  const stageRoot = path.dirname(resolvedStage);
  const config = requireLibraryRegistrationProductionReleaseConfig(environment);

  const stageRootEntries = (await readdir(stageRoot, { withFileTypes: true }))
    .map((entry) => `${entry.isDirectory() ? "d" : "f"}:${entry.name}`)
    .sort();
  if (JSON.stringify(stageRootEntries) !== JSON.stringify(["d:functions", "d:site", "d:src"])) {
    throw new Error(
      `Registration production staging root contains an unreviewed entry: ${stageRootEntries.join(", ")}.`
    );
  }

  await requireExactFiles(
    path.join(stageRoot, "functions"),
    ["api/community-registration.ts", "api/contact.ts"],
    "Staged Pages Functions"
  );
  await requireExactFiles(
    path.join(stageRoot, "src"),
    ["lib/community-registration-schema.ts", "lib/contact-schema.ts"],
    "Staged Pages Function dependencies"
  );
  await Promise.all([
    requireAbsent(
      path.join(resolvedStage, "library-registration", "admin"),
      "Library administrator UI"
    ),
    requireAbsent(
      path.join(stageRoot, "functions", "library-registration"),
      "Library administrator Pages Function"
    ),
    requireAbsent(path.join(resolvedStage, "_worker.js"), "Pages Worker bundle"),
    requireAbsent(path.join(stageRoot, "wrangler.toml"), "Sibling Wrangler configuration"),
    requireAbsent(path.join(stageRoot, "wrangler.json"), "Sibling Wrangler configuration"),
    requireAbsent(path.join(stageRoot, "wrangler.jsonc"), "Sibling Wrangler configuration"),
    requireAbsent(path.join(stageRoot, ".env"), "Sibling dotenv configuration"),
    requireAbsent(path.join(stageRoot, ".dev.vars"), "Sibling Wrangler secrets")
  ]);

  const routes = JSON.parse(
    await readFile(path.join(resolvedStage, "_routes.json"), "utf8")
  );
  if (JSON.stringify(routes) !== JSON.stringify(EXPECTED_FUNCTION_ROUTES)) {
    throw new Error("Registration production Function routes are not the exact reviewed pair.");
  }

  const [registrationHtml, officialLibraryHtml, headers] = await Promise.all([
    readFile(path.join(resolvedStage, "library-registration", "index.html"), "utf8"),
    readFile(path.join(resolvedStage, "future-strategy-library", "index.html"), "utf8"),
    readFile(path.join(resolvedStage, "_headers"), "utf8")
  ]);
  if (!registrationHtml.includes("GOOGLE API")) {
    throw new Error("Registration production must contain the Google registration runtime.");
  }
  for (const forbidden of ["LOCAL MOCK", "REGISTRATION DISABLED", "mock-account-select"]) {
    if (registrationHtml.includes(forbidden)) {
      throw new Error(`Registration production HTML contains forbidden marker: ${forbidden}.`);
    }
  }
  verifyProductionCta(officialLibraryHtml);
  verifyLibraryHeaderBoundary(headers, config);
  if (headers.includes("/library-registration/admin")) {
    throw new Error("Registration production headers retain the administrator route.");
  }

  const allFiles = await collectFiles(stageRoot);
  await verifyHtmlAssetReferences(
    resolvedStage,
    allFiles.filter((file) => file.toLowerCase().endsWith(".html"))
  );
  const textArtifacts = allFiles.filter((file) => TEXT_ARTIFACT_PATTERN.test(file));
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
        `Registration production artifact contains forbidden private material [${privateFinding.rule}].`
      );
    }
    const adminMarker = ADMIN_ARTIFACT_MARKERS.find(
      (marker) => marker && contents.includes(marker)
    );
    if (adminMarker) {
      throw new Error(
        `Registration production retains an administrator or synthetic marker in ${relative}.`
      );
    }

    for (const clientId of contents.match(GOOGLE_CLIENT_ID_PATTERN) ?? []) {
      if (clientId !== config.googleClientId) {
        throw new Error(
          `Registration production contains an unapproved Google OAuth client ID in ${relative}.`
        );
      }
      registrationClientOccurrences += 1;
    }
    apiOriginOccurrences += contents.split(config.approvedApiOrigin).length - 1;
  }

  if (registrationClientOccurrences < 1) {
    throw new Error("Registration production is missing its approved Google OAuth client ID.");
  }
  if (apiOriginOccurrences < 2) {
    throw new Error(
      "Registration production must contain the approved API origin in its CSP and registration runtime."
    );
  }

  return {
    approvedApiOrigin: LIBRARY_REGISTRATION_PRODUCTION_API_ORIGIN,
    approvedFrontendOrigin: LIBRARY_REGISTRATION_PRODUCTION_FRONTEND_ORIGIN,
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
  const result = await verifyLibraryRegistrationProductionBuild({
    stage: argumentValue("--stage")
  });
  console.log(
    `Verified registration-only production artifact for ${result.approvedFrontendOrigin}; `
      + `${result.inspectedArtifactCount} text artifacts inspected; `
      + "administrator surfaces and private material absent."
  );
}
