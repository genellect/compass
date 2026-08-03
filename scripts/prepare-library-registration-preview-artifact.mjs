import { cp, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { LIBRARY_ADMIN_PREVIEW_ARTIFACT_MARKERS } from
  "./library-release-config.mjs";

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

function requireSafeStage(root, stage) {
  const allowedRoot = path.join(
    root,
    "outputs",
    "library-registration-preview"
  );
  const normalizedRoot = path.resolve(allowedRoot);
  const normalizedStage = path.resolve(stage);
  const stageRoot = path.dirname(normalizedStage);
  if (
    path.basename(normalizedStage) !== "site"
    || stageRoot === normalizedRoot
    || !stageRoot.startsWith(`${normalizedRoot}${path.sep}`)
  ) {
    throw new Error(
      "Registration Preview stage must be outputs/library-registration-preview/<isolated-id>/site."
    );
  }
  return { normalizedStage, stageRoot };
}

export async function prepareLibraryRegistrationPreviewArtifact({
  root = process.cwd(),
  source = path.join(root, "out"),
  stage
}) {
  if (!stage) {
    throw new Error("Registration Preview staging directory is required.");
  }
  const { normalizedStage: safeStage, stageRoot } = requireSafeStage(root, stage);

  // Wrangler resolves Functions and configuration from --cwd. Recreate the
  // isolated container so no stale sibling can introduce executable code.
  await rm(stageRoot, { recursive: true, force: true });
  await cp(path.resolve(source), safeStage, { recursive: true });

  const explicitlyRemoved = [
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
    path.join(safeStage, "_routes.json"),
    path.join(safeStage, "_worker.js"),
    path.join(safeStage, "_worker.js.map")
  ];
  for (const target of explicitlyRemoved) {
    await rm(target, { recursive: true, force: true });
  }

  let markerFilesRemoved = 0;
  const copiedFiles = await collectFiles(safeStage);
  for (const file of copiedFiles) {
    if (!TEXT_ARTIFACT_PATTERN.test(file)) continue;
    const contents = await readFile(file, "utf8");
    if (
      LIBRARY_ADMIN_PREVIEW_ARTIFACT_MARKERS.some(
        (marker) => marker && contents.includes(marker)
      )
    ) {
      await rm(file, { force: true });
      markerFilesRemoved += 1;
    }
  }

  return {
    stage: safeStage,
    stageRoot,
    markerFilesRemoved,
    retainedFiles: (await collectFiles(safeStage)).length
  };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  const result = await prepareLibraryRegistrationPreviewArtifact({
    source: argumentValue("--source") || path.join(process.cwd(), "out"),
    stage: argumentValue("--stage")
  });
  console.log(
    `Prepared registration-only Preview artifact: ${result.retainedFiles} files retained; `
      + `${result.markerFilesRemoved} administrator-marker files removed.`
  );
}
