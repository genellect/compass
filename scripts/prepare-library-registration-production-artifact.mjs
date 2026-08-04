import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { LIBRARY_ADMIN_PREVIEW_ARTIFACT_MARKERS } from
  "./library-release-config.mjs";

const TEXT_ARTIFACT_PATTERN =
  /(?:^|[\\/])(?:_headers|_redirects)$|\.(?:css|html|js|json|map|svg|ts|txt|xml)$/i;
const ADMIN_ARTIFACT_MARKERS = Object.freeze([
  ...LIBRARY_ADMIN_PREVIEW_ARTIFACT_MARKERS,
  "/library-registration/admin",
  "NEXT_PUBLIC_LIBRARY_ADMIN_",
  "LIBRARY_ADMIN_"
]);
const PRODUCTION_FUNCTION_ROUTES = Object.freeze({
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

function requireSafeStage(root, stage) {
  const allowedRoot = path.join(root, "outputs", "library-registration-production");
  const normalizedRoot = path.resolve(allowedRoot);
  const normalizedStage = path.resolve(stage);
  const stageRoot = path.dirname(normalizedStage);
  if (
    path.basename(normalizedStage) !== "site"
    || stageRoot === normalizedRoot
    || !stageRoot.startsWith(`${normalizedRoot}${path.sep}`)
  ) {
    throw new Error(
      "Registration production stage must be outputs/library-registration-production/<reviewed-commit>/site."
    );
  }
  return { normalizedStage, stageRoot };
}

function withoutAdministratorHeaders(headers) {
  const normalized = headers.replaceAll("\r\n", "\n");
  const marker = "/library-registration/admin/*\n";
  const start = normalized.indexOf(marker);
  if (start === -1) {
    throw new Error("Administrator deployment header block is missing before staging.");
  }
  const next = normalized.indexOf("\n/", start + marker.length);
  const end = next === -1 ? normalized.length : next + 1;
  return `${normalized.slice(0, start)}${normalized.slice(end)}`.trimEnd() + "\n";
}

export async function prepareLibraryRegistrationProductionArtifact({
  root = process.cwd(),
  source = path.join(root, "out"),
  stage
}) {
  if (!stage) throw new Error("Registration production staging directory is required.");
  const { normalizedStage: safeStage, stageRoot } = requireSafeStage(root, stage);

  // Wrangler resolves Functions from --cwd. Rebuild the entire isolated root so
  // a stale administrator proxy, configuration file, or secret cannot hitchhike.
  await rm(stageRoot, { recursive: true, force: true });
  await cp(path.resolve(source), safeStage, { recursive: true });

  for (const target of [
    path.join(safeStage, "library-registration", "admin"),
    path.join(
      safeStage,
      "_next",
      "static",
      "chunks",
      "app",
      "(library)",
      "library-registration",
      "admin"
    ),
    path.join(safeStage, "_worker.js"),
    path.join(safeStage, "_worker.js.map")
  ]) {
    await rm(target, { recursive: true, force: true });
  }

  const headersPath = path.join(safeStage, "_headers");
  await writeFile(
    headersPath,
    withoutAdministratorHeaders(await readFile(headersPath, "utf8")),
    "utf8"
  );
  await writeFile(
    path.join(safeStage, "_routes.json"),
    `${JSON.stringify(PRODUCTION_FUNCTION_ROUTES, null, 2)}\n`,
    "utf8"
  );

  let markerFilesRemoved = 0;
  for (const file of await collectFiles(safeStage)) {
    if (!TEXT_ARTIFACT_PATTERN.test(file)) continue;
    const contents = await readFile(file, "utf8");
    if (ADMIN_ARTIFACT_MARKERS.some((marker) => marker && contents.includes(marker))) {
      await rm(file, { force: true });
      markerFilesRemoved += 1;
    }
  }

  const functionsApi = path.join(stageRoot, "functions", "api");
  const sourceLib = path.join(stageRoot, "src", "lib");
  await mkdir(functionsApi, { recursive: true });
  await mkdir(sourceLib, { recursive: true });
  for (const name of ["community-registration.ts", "contact.ts"]) {
    await cp(path.join(root, "functions", "api", name), path.join(functionsApi, name));
  }
  for (const name of ["community-registration-schema.ts", "contact-schema.ts"]) {
    await cp(path.join(root, "src", "lib", name), path.join(sourceLib, name));
  }

  return {
    stage: safeStage,
    stageRoot,
    markerFilesRemoved,
    retainedSiteFiles: (await collectFiles(safeStage)).length
  };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  const result = await prepareLibraryRegistrationProductionArtifact({
    source: argumentValue("--source") || path.join(process.cwd(), "out"),
    stage: argumentValue("--stage")
  });
  console.log(
    `Prepared registration-only production artifact: ${result.retainedSiteFiles} site files retained; `
      + `${result.markerFilesRemoved} administrator-marker files removed.`
  );
}
