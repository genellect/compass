import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "out");

await mkdir(outDir, { recursive: true });

for (const directory of ["future-strategy-library"]) {
  await cp(path.join(root, directory), path.join(outDir, directory), {
    recursive: true,
    force: true,
    filter(source) {
      return !["node_modules", ".git", "dist", ".build", ".next", "out"].includes(path.basename(source));
    }
  });
}

for (const file of [
  ".nojekyll",
  "_headers",
  "_redirects",
  "google1a9ab00aa28adfe2.html",
  "robots.txt",
  "sitemap.xml"
]) {
  await cp(path.join(root, file), path.join(outDir, file), { force: true });
}

console.log("Assembled the frozen library and Cloudflare control files into out/.");
