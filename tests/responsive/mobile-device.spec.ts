import { devices } from "@playwright/test";

import { expect, test } from "./responsive-fixture";
import {
  assertResponsiveContract,
  auditRenderedPage,
  collectRuntimeErrors,
  settleRenderedPage,
} from "./layout-audit";
import { routeContracts, type ResponsiveViewport } from "./route-contracts";

const iphone13 = devices["iPhone 13"];

const iphoneViewport = {
  name: "iphone-device-context",
  width: iphone13.viewport.width,
  height: iphone13.viewport.height,
} satisfies ResponsiveViewport;

// Keep the iPhone viewport/input semantics while running on the Chromium
// browser installed by the responsive CI job. Spreading the descriptor would
// also copy `defaultBrowserType: "webkit"` and silently change the runner.
test.use({
  viewport: iphone13.viewport,
  userAgent: iphone13.userAgent,
  deviceScaleFactor: iphone13.deviceScaleFactor,
  isMobile: iphone13.isMobile,
  hasTouch: iphone13.hasTouch,
});

test.describe("iPhone device semantics", () => {
  for (const contract of routeContracts) {
    test(`${contract.name} uses the approved Mobile surface`, async ({ page }, testInfo) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      const runtimeErrors = collectRuntimeErrors(page);
      const response = await page.goto(contract.path, { waitUntil: "domcontentloaded" });
      expect(response?.status(), `${contract.path} did not return HTTP 200`).toBe(200);
      await settleRenderedPage(page);

      const inputSemantics = await page.evaluate(() => ({
        coarsePointer: matchMedia("(pointer: coarse)").matches,
        noHover: matchMedia("(hover: none)").matches,
        touchPoints: navigator.maxTouchPoints,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        devicePixelRatio,
      }));
      expect(inputSemantics.coarsePointer).toBe(true);
      expect(inputSemantics.noHover).toBe(true);
      expect(inputSemantics.touchPoints).toBeGreaterThan(0);
      expect(inputSemantics.viewportWidth).toBe(iphoneViewport.width);
      expect(inputSemantics.viewportHeight).toBe(iphoneViewport.height);
      expect(inputSemantics.devicePixelRatio).toBeGreaterThanOrEqual(2);

      const report = await auditRenderedPage(page, contract, iphoneViewport);
      await assertResponsiveContract(report, runtimeErrors, testInfo);
    });
  }
});
