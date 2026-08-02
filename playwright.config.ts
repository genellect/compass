import { defineConfig } from "@playwright/test";

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
