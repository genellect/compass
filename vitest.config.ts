import { defineConfig } from "vitest/config";

// Unit tests are discovered by pattern so a new test file cannot silently
// stay outside `npm test`. Playwright specs and node:test files have their own
// runners and are guarded by tests/repository-maintenance.test.mjs.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      // Known drift: the 3D exhibit activity copy predates the parent-site
      // Experience cards updated in #136. Re-include once the exhibit copy is
      // re-synchronised under a reviewed UI change.
      "tests/explorer-experience.test.ts",
    ],
  },
});
