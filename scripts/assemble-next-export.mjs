import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  renderLibraryDeploymentHeaders,
  resolveLibraryReleaseConfig
} from "./library-release-config.mjs";

const root = process.cwd();
const outDir = path.join(root, "out");
const { config: libraryBuildConfig } = resolveLibraryReleaseConfig(process.env);

await mkdir(outDir, { recursive: true });

for (const file of [
  ".nojekyll",
  "_redirects",
  "google1a9ab00aa28adfe2.html",
  "robots.txt",
  "sitemap.xml"
]) {
  await cp(path.join(root, file), path.join(outDir, file), { force: true });
}

const headerTemplate = await readFile(path.join(root, "_headers"), "utf8");
const deploymentHeaders = renderLibraryDeploymentHeaders(
  headerTemplate,
  libraryBuildConfig
);
await writeFile(path.join(outDir, "_headers"), deploymentHeaders, "utf8");

console.log(
  `Assembled Cloudflare control files into the Next.js export (${libraryBuildConfig.googleBuild ? "google" : "mock"} library CSP).`
);
