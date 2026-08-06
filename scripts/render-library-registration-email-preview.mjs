import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { chromium } from "playwright";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const outputDirectory = resolve(
  repositoryRoot,
  "outputs",
  "library-registration-email-review"
);
const gasSource = readFileSync(
  resolve(
    repositoryRoot,
    "google-apps-script",
    "library-registration-notifications",
    "Code.gs"
  ),
  "utf8"
);

const context = createContext({});
runInContext(gasSource, context);

const payload = {
  fullName: "北里 花子",
  driveAccessStatus: "granted"
};
const configured = {
  adminEmail: "operator@example.invalid",
  driveUrl: "https://drive.google.com/drive/folders/approved-folder-id-12345?usp=sharing"
};
const html = runInContext(
  `buildApplicantHtml_(${JSON.stringify(payload)}, ${JSON.stringify(configured)})`,
  context
);

mkdirSync(outputDirectory, { recursive: true });
const htmlPath = resolve(outputDirectory, "registration-complete.html");
writeFileSync(htmlPath, html, "utf8");

const browser = await chromium.launch({ headless: true });
try {
  for (const preview of [
    { name: "desktop", width: 900, height: 920 },
    { name: "mobile", width: 390, height: 844 }
  ]) {
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: { width: preview.width, height: preview.height }
    });
    await page.setContent(html, { waitUntil: "load" });
    await page.screenshot({
      fullPage: true,
      path: resolve(outputDirectory, `${preview.name}.png`)
    });
    await page.close();
  }
} finally {
  await browser.close();
}

process.stdout.write(`${outputDirectory}\n`);
