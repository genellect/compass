import { cp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { LIBRARY_ADMIN_PREVIEW_ARTIFACT_MARKERS } from
  "./library-release-config.mjs";
import { publicSourceFindings } from "./verify-public-source-boundary.mjs";

const TEXT_ARTIFACT_PATTERN =
  /(?:^|[\\/])(?:_headers|_redirects|_routes\.json)$|\.(?:css|html|js|json|map|svg|txt|xml)$/i;
const PRODUCTION_FUNCTION_ROUTES = Object.freeze({
  version: 1,
  include: [
    "/api/community-registration",
    "/api/contact",
    "/library-registration/admin/api/*"
  ],
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
  const allowedRoot = path.join(root, "outputs", "library-full-production");
  const normalizedRoot = path.resolve(allowedRoot);
  const normalizedStage = path.resolve(stage);
  const stageRoot = path.dirname(normalizedStage);
  if (
    path.basename(normalizedStage) !== "site"
    || stageRoot === normalizedRoot
    || !stageRoot.startsWith(`${normalizedRoot}${path.sep}`)
  ) {
    throw new Error(
      "Full production stage must be outputs/library-full-production/<reviewed-commit>/site."
    );
  }
  return { normalizedStage, stageRoot };
}

export async function prepareLibraryFullProductionArtifact({
  root = process.cwd(),
  source = path.join(root, "out"),
  stage
}) {
  if (!stage) throw new Error("Full production staging directory is required.");
  const { normalizedStage: safeStage, stageRoot } = requireSafeStage(root, stage);
  await rm(stageRoot, { recursive: true, force: true });
  await cp(path.resolve(source), safeStage, { recursive: true });
  await writeFile(
    path.join(safeStage, "_routes.json"),
    `${JSON.stringify(PRODUCTION_FUNCTION_ROUTES, null, 2)}\n`,
    "utf8"
  );

  const files = await collectFiles(safeStage);
  for (const file of files) {
    if (!TEXT_ARTIFACT_PATTERN.test(file)) continue;
    const contents = await readFile(file, "utf8");
    const previewMarker = LIBRARY_ADMIN_PREVIEW_ARTIFACT_MARKERS.find(
      (marker) => marker && contents.includes(marker)
    );
    if (previewMarker) {
      throw new Error(
        `Full production artifact contains an administrator preview marker in ${path.relative(root, file)}.`
      );
    }
    const [privateFinding] = publicSourceFindings([{
      file: path.relative(root, file).replaceAll("\\", "/"),
      contents,
      tracked: false
    }]);
    if (privateFinding) {
      throw new Error(
        `Full production artifact contains forbidden private material [${privateFinding.rule}].`
      );
    }
  }

  return {
    stage: safeStage,
    stageRoot,
    retainedSiteFiles: files.length
  };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  const result = await prepareLibraryFullProductionArtifact({
    source: argumentValue("--source") || path.join(process.cwd(), "out"),
    stage: argumentValue("--stage")
  });
  console.log(
    `Prepared full Library production artifact: ${result.retainedSiteFiles} site files retained.`
  );
}
