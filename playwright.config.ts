import { defineConfig } from "@playwright/test";
import { resolveChromium } from "./scripts/dev-env.cjs";

// When the Chromium bundled with the installed Playwright is absent (for
// example a Claude Code cloud session that disables browser downloads), use
// PLAYWRIGHT_CHROMIUM_EXECUTABLE or the preinstalled /opt/pw-browsers/chromium.
// Windows, CI and the Dev Container have the bundled browser and are unchanged.
// Specs that set their own launchOptions (msedge Explorer) are not affected.
const chromium = resolveChromium();
if (chromium.executablePath && !process.env.COMPASS_PLAYWRIGHT_FALLBACK_LOGGED) {
  process.env.COMPASS_PLAYWRIGHT_FALLBACK_LOGGED = "1";
  console.warn(
    `[playwright] Bundled Chromium is missing (${chromium.bundled.reason}); ` +
      `falling back to ${chromium.executablePath} (${chromium.source}). ` +
      "The browser revision may differ from the pinned Playwright.",
  );
}

export default defineConfig({
  testDir: "./tests/responsive",
  timeout: 45_000,
  expect: { timeout: 7_500 },
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  outputDir: "test-results/responsive",
  use: {
    baseURL: process.env.RESPONSIVE_BASE_URL ?? "http://127.0.0.1:8798",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    ...(chromium.executablePath
      ? { launchOptions: { executablePath: chromium.executablePath } }
      : {}),
  },
  webServer: process.env.RESPONSIVE_BASE_URL
    ? undefined
    : {
        command: "npm run serve:responsive",
        url: "http://127.0.0.1:8798/",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
