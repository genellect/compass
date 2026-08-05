import { spawnSync } from "node:child_process";
import path from "node:path";
import { resolveCloudflareGitBuildEnvironment } from
  "./cloudflare-git-build-environment.mjs";
import { finalizeCloudflareGitBuild } from "./finalize-cloudflare-git-build.mjs";

const root = process.cwd();
const profile = resolveCloudflareGitBuildEnvironment(process.env);
const environment = profile.environment;

function run(label, executable, args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    env: environment,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}.`);
  }
}

run("Next output cleanup", process.execPath, ["scripts/clean-next-output.mjs"]);
run("Image optimization", process.execPath, ["scripts/optimize-images.mjs"]);
run("Next production build", process.execPath, [
  path.join("node_modules", "next", "dist", "bin", "next"),
  "build",
  "--webpack"
]);
run("Static export assembly", process.execPath, [
  "scripts/assemble-next-export.mjs"
]);

const finalized = await finalizeCloudflareGitBuild({ root, environment });
if (finalized.finalized) {
  console.log(
    `Finalized Cloudflare Git ${finalized.mode} artifact: ${finalized.retainedFiles} site files retained.`
  );
}
