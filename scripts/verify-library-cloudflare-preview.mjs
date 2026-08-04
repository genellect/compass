import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const OFFICIAL_CLOUDFLARE_PROJECT = "compass-official";
export const LEGACY_LIBRARY_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSf8gLujuK-giYnkCnv-Cxp7qon1kY8mhnGvfkA62hOlrJgAHA/viewform";

const PREVIEW_BRANCH_PATTERN =
  /^library-registration-(?:preview(?:-[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?)?|ui-review-[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?)$/;
const FORBIDDEN_BRANCHES = new Set(["main", "master", "production"]);

export function requireSafePreviewBranch(previewBranch, productionBranch) {
  const candidate = String(previewBranch ?? "").trim();
  const production = String(productionBranch ?? "").trim();
  if (!production) {
    throw new Error("Cloudflare production branch is unavailable; refusing deployment.");
  }
  if (!PREVIEW_BRANCH_PATTERN.test(candidate)) {
    throw new Error(
      "Preview branch must use the library-registration-preview-* or library-registration-ui-review-* namespace."
    );
  }
  if (
    FORBIDDEN_BRANCHES.has(candidate.toLowerCase())
    || candidate.toLowerCase() === production.toLowerCase()
  ) {
    throw new Error("Preview branch resolves to the production branch.");
  }
  return candidate;
}

export function verifyLegacyLibraryCtaArtifacts({
  officialLibraryHtml,
  officialHomeHtml
}) {
  const legacyHref = `href="${LEGACY_LIBRARY_FORM_URL}"`;
  if (!officialLibraryHtml.includes(legacyHref)) {
    throw new Error("Future Strategy Library CTA no longer targets the legacy Google Form.");
  }

  for (const [label, html] of [
    ["official library", officialLibraryHtml],
    ["official home", officialHomeHtml]
  ]) {
    if (
      /href=["']\/library-registration\/?["']/i.test(html)
      || /href=["']https:\/\/compass-official\.pages\.dev\/library-registration\/?["']/i.test(html)
    ) {
      throw new Error(`${label} artifact contains a registration cutover link.`);
    }
  }
}

export async function verifyCloudflarePreviewArtifacts({
  root = process.cwd(),
  previewBranch,
  productionBranch
} = {}) {
  requireSafePreviewBranch(previewBranch, productionBranch);
  const out = path.join(root, "out");
  const [officialLibraryHtml, officialHomeHtml] = await Promise.all([
    readFile(path.join(out, "future-strategy-library", "index.html"), "utf8"),
    readFile(path.join(out, "index.html"), "utf8")
  ]);
  verifyLegacyLibraryCtaArtifacts({ officialLibraryHtml, officialHomeHtml });
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  const previewBranch = argumentValue("--preview-branch");
  const productionBranch = argumentValue("--production-branch");
  await verifyCloudflarePreviewArtifacts({ previewBranch, productionBranch });
  console.log(
    `Verified non-production Cloudflare branch ${previewBranch} and unchanged legacy Library CTA.`
  );
}
