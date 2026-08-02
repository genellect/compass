import { expect, test } from "./responsive-fixture";

import {
  assertResponsiveContract,
  auditRenderedPage,
  collectRuntimeErrors,
  settleRenderedPage,
} from "./layout-audit";
import { extendedViewports, routeContracts } from "./route-contracts";

for (const contract of routeContracts) {
  test.describe(`${contract.name} extended`, () => {
    for (const viewport of extendedViewports) {
      test(`${viewport.name} ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ reducedMotion: "reduce" });
        const runtimeErrors = collectRuntimeErrors(page);
        const response = await page.goto(contract.path, { waitUntil: "domcontentloaded" });
        expect(response?.status(), `${contract.path} did not return HTTP 200`).toBe(200);
        await settleRenderedPage(page);
        const report = await auditRenderedPage(page, contract, viewport);
        await assertResponsiveContract(report, runtimeErrors, testInfo);
      });
    }
  });
}
