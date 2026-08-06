import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCloudflareGitBuildEnvironment } from
  "./cloudflare-git-build-environment.mjs";
import { prepareLibraryFullProductionArtifact } from
  "./prepare-library-full-production-artifact.mjs";
import { prepareLibraryUiReviewArtifact } from
  "./prepare-library-ui-review-artifact.mjs";
import { verifyLibraryProductionBuild } from
  "./verify-library-production-build.mjs";
import { verifyLibraryUiReviewBuild } from
  "./verify-library-ui-review-build.mjs";

async function replaceOutputWithStage(root, stage) {
  const output = path.join(root, "out");
  const stageRoot = path.dirname(stage);
  await rm(output, { recursive: true, force: true });
  await rename(stage, output);
  await rm(stageRoot, { recursive: true, force: true });
}

async function requireExactProductionFunctions(root) {
  const functionsRoot = path.join(root, "functions");
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) {
        files.push(path.relative(functionsRoot, absolute).replaceAll("\\", "/"));
      }
    }
  }
  await visit(functionsRoot);
  const expected = [
    "api/community-registration.ts",
    "api/contact.ts",
    "library-registration/admin/api/[[path]].ts"
  ];
  if (JSON.stringify(files.sort()) !== JSON.stringify(expected)) {
    throw new Error(
      `Cloudflare production Functions are not the exact reviewed pair: ${files.join(", ")}.`
    );
  }
}

async function buildAdvancedModeWorker(root, outputDirectory) {
  const temporaryParent = path.join(root, "outputs");
  await mkdir(temporaryParent, { recursive: true });
  const temporaryOutput = await mkdtemp(
    path.join(temporaryParent, ".cloudflare-functions-")
  );
  const wranglerEntry = fileURLToPath(
    new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url)
  );

  try {
    const result = spawnSync(process.execPath, [
      wranglerEntry,
      "pages",
      "functions",
      "build",
      path.join(root, "functions"),
      "--outdir",
      temporaryOutput,
      "--fallback-service",
      "ASSETS",
      "--build-output-directory",
      outputDirectory
    ], {
      cwd: root,
      env: {
        ...process.env,
        WRANGLER_WRITE_LOGS: "false"
      },
      encoding: "utf8"
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(
        `Cloudflare Pages Functions build failed with exit code ${result.status}: `
          + `${result.stderr || result.stdout}`.trim()
      );
    }
    const builtFiles = (await readdir(temporaryOutput)).sort();
    if (JSON.stringify(builtFiles) !== JSON.stringify(["index.js"])) {
      throw new Error(
        `Cloudflare Functions build produced unexpected files: ${builtFiles.join(", ")}.`
      );
    }
    await copyFile(
      path.join(temporaryOutput, "index.js"),
      path.join(outputDirectory, "_worker.js")
    );
  } finally {
    await rm(temporaryOutput, { recursive: true, force: true });
  }
}

export async function finalizeFullProductionArtifact({
  root = process.cwd(),
  environment = process.env,
  commit = "rehearsal"
} = {}) {
  const stage = path.join(
    root,
    "outputs",
    "library-full-production",
    commit,
    "site"
  );
  const prepared = await prepareLibraryFullProductionArtifact({
    root,
    source: path.join(root, "out"),
    stage
  });
  await replaceOutputWithStage(root, stage);
  await requireExactProductionFunctions(root);
  await buildAdvancedModeWorker(root, path.join(root, "out"));
  await verifyLibraryProductionBuild({
    root,
    environment,
    outputDirectory: path.join(root, "out")
  });
  return { retainedFiles: prepared.retainedSiteFiles + 1 };
}

export async function finalizeCloudflareGitBuild({
  root = process.cwd(),
  environment = process.env
} = {}) {
  const profile = resolveCloudflareGitBuildEnvironment(environment);
  if (profile.mode === "local") {
    if (String(environment.LIBRARY_RELEASE_TARGET ?? "").trim() !== "production") {
      return { mode: "local", finalized: false };
    }

    await requireExactProductionFunctions(root);
    await buildAdvancedModeWorker(root, path.join(root, "out"));
    return { mode: "local-production", finalized: true, retainedFiles: null };
  }

  if (profile.mode === "production") {
    const finalized = await finalizeFullProductionArtifact({
      root,
      environment: profile.environment,
      commit: profile.metadata.commit
    });
    return {
      mode: "production",
      finalized: true,
      retainedFiles: finalized.retainedFiles
    };
  }

  const stage = path.join(
    root,
    "outputs",
    "library-ui-review",
    profile.metadata.commit,
    "site"
  );
  const prepared = await prepareLibraryUiReviewArtifact({
    root,
    source: path.join(root, "out"),
    stage
  });
  await verifyLibraryUiReviewBuild({
    root,
    stage,
    environment: profile.environment
  });
  await replaceOutputWithStage(root, stage);
  await rm(path.join(root, "functions"), { recursive: true, force: true });
  return {
    mode: "preview",
    finalized: true,
    retainedFiles: prepared.retainedFiles
  };
}

const invokedAsScript = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  if (!process.argv.includes("--production-rehearsal")) {
    throw new Error("Direct invocation requires --production-rehearsal.");
  }
  const finalized = await finalizeFullProductionArtifact({
    root: process.cwd(),
    environment: process.env,
    commit: "rehearsal"
  });
  console.log(
    `Finalized production-shaped rehearsal artifact: ${finalized.retainedFiles} site files retained.`
  );
}
