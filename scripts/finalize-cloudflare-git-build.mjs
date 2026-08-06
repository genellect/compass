import { readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
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

export async function finalizeCloudflareGitBuild({
  root = process.cwd(),
  environment = process.env
} = {}) {
  const profile = resolveCloudflareGitBuildEnvironment(environment);
  if (profile.mode === "local") return { mode: "local", finalized: false };

  if (profile.mode === "production") {
    const stage = path.join(
      root,
      "outputs",
      "library-full-production",
      profile.metadata.commit,
      "site"
    );
    const prepared = await prepareLibraryFullProductionArtifact({
      root,
      source: path.join(root, "out"),
      stage
    });
    await verifyLibraryProductionBuild({
      root,
      environment: profile.environment,
      outputDirectory: stage
    });
    await replaceOutputWithStage(root, stage);
    await requireExactProductionFunctions(root);
    return {
      mode: "production",
      finalized: true,
      retainedFiles: prepared.retainedSiteFiles
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
