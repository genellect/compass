import { expect, test } from "./responsive-fixture";

import {
  assertResponsiveContract,
  auditRenderedPage,
  collectRuntimeErrors,
  settleRenderedPage,
} from "./layout-audit";
import { routeContracts, type ResponsiveViewport } from "./route-contracts";

const fsl = routeContracts.find((contract) => contract.name === "future-strategy-library")!;
const contact = routeContracts.find((contract) => contract.name === "contact")!;

const boundaryViewports: ResponsiveViewport[] = [
  { name: "short-laptop-600", width: 1024, height: 600 },
  { name: "short-laptop-657", width: 1024, height: 657 },
  { name: "laptop-768", width: 1024, height: 768 },
  { name: "height-759", width: 1280, height: 759 },
  { name: "height-760", width: 1280, height: 760 },
  { name: "height-761", width: 1280, height: 761 },
  { name: "scaled-height-759", width: 1536, height: 759 },
  { name: "scaled-height-760", width: 1536, height: 760 },
  { name: "scaled-height-761", width: 1536, height: 761 },
  { name: "wide-height-899", width: 1920, height: 899 },
  { name: "wide-height-900", width: 1920, height: 900 },
  { name: "wide-height-901", width: 1920, height: 901 },
  { name: "scaled-4k-height-1299", width: 2560, height: 1299 },
  { name: "scaled-4k-height-1300", width: 2560, height: 1300 },
  { name: "scaled-4k-height-1301", width: 2560, height: 1301 },
  { name: "desktop-breakpoint-900", width: 900, height: 760 },
  { name: "desktop-breakpoint-901", width: 901, height: 760 },
  { name: "wide-layout-1179", width: 1179, height: 760 },
  { name: "wide-layout-1180", width: 1180, height: 760 },
  { name: "large-layout-2399", width: 2399, height: 1300 },
  { name: "large-layout-2400", width: 2400, height: 1300 },
];

type HeroMetrics = {
  titleTop: number;
  titleLeft: number;
  titleRight: number;
  titleSize: number;
  innerLeft: number;
  innerWidth: number;
  graphicTop: number;
  graphicLeft: number;
  graphicRight: number;
  graphicWidth: number;
};

test.describe("FSL breakpoint boundaries", () => {
  test.describe.configure({ mode: "serial" });
  const heightMetrics = new Map<string, HeroMetrics>();

  for (const viewport of boundaryViewports) {
    test(`${viewport.name} ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: "reduce" });
      const runtimeErrors = collectRuntimeErrors(page);
      const response = await page.goto(fsl.path, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(200);
      await settleRenderedPage(page);
      const report = await auditRenderedPage(page, fsl, viewport);
      await assertResponsiveContract(report, runtimeErrors, testInfo);

      if (viewport.width >= 1179 && viewport.height >= 759) {
        const metrics = await page.evaluate(() => {
          const title = document.querySelector("h1")!;
          const graphic = document.querySelector('[class*="knowledgeGraphic"]')!;
          const inner = document.querySelector('[class*="heroInner"]')!;
          const titleRect = title.getBoundingClientRect();
          const graphicRect = graphic.getBoundingClientRect();
          const innerRect = inner.getBoundingClientRect();
          return {
            titleTop: titleRect.top,
            titleLeft: titleRect.left,
            titleRight: titleRect.right,
            titleSize: Number.parseFloat(getComputedStyle(title).fontSize),
            innerLeft: innerRect.left,
            innerWidth: innerRect.width,
            graphicTop: graphicRect.top,
            graphicLeft: graphicRect.left,
            graphicRight: graphicRect.right,
            graphicWidth: graphicRect.width,
          };
        });
        heightMetrics.set(`${viewport.width}x${viewport.height}`, metrics);
      }
    });
  }

  test.afterAll(() => {
    for (const [width, boundary] of [[1280, 760], [1536, 760], [1920, 900], [2560, 1300]]) {
      for (const [from, to] of [[boundary - 1, boundary], [boundary, boundary + 1]]) {
        const below = heightMetrics.get(`${width}x${from}`);
        const above = heightMetrics.get(`${width}x${to}`);
        expect(below, `missing ${width}x${from} metrics`).toBeTruthy();
        expect(above, `missing ${width}x${to} metrics`).toBeTruthy();
        if (!below || !above) continue;
        expect(Math.abs(above.titleTop - below.titleTop), `${width}px title top jump`).toBeLessThanOrEqual(2);
        expect(Math.abs(above.titleLeft - below.titleLeft), `${width}px title left jump`).toBeLessThanOrEqual(2);
        expect(Math.abs(above.titleRight - below.titleRight), `${width}px title right jump`).toBeLessThanOrEqual(3);
        expect(Math.abs(above.innerLeft - below.innerLeft), `${width}px inner left jump`).toBeLessThanOrEqual(2);
        expect(Math.abs(above.innerWidth - below.innerWidth), `${width}px inner width jump`).toBeLessThanOrEqual(2);
        expect(Math.abs(above.graphicTop - below.graphicTop), `${width}px graphic top jump`).toBeLessThanOrEqual(3);
        expect(Math.abs(above.graphicLeft - below.graphicLeft), `${width}px graphic left jump`).toBeLessThanOrEqual(3);
        expect(Math.abs(above.graphicRight - below.graphicRight), `${width}px graphic right jump`).toBeLessThanOrEqual(3);
        expect(
          Math.abs(above.titleSize - below.titleSize) / Math.max(above.titleSize, below.titleSize),
          `${width}px title size jump`,
        ).toBeLessThanOrEqual(0.01);
        expect(
          Math.abs(above.graphicWidth - below.graphicWidth) /
            Math.max(above.graphicWidth, below.graphicWidth),
          `${width}px graphic width jump`,
        ).toBeLessThanOrEqual(0.01);
      }
    }

    const narrow = heightMetrics.get("1179x760");
    const wide = heightMetrics.get("1180x760");
    expect(narrow, "missing 1179x760 metrics").toBeTruthy();
    expect(wide, "missing 1180x760 metrics").toBeTruthy();
    if (narrow && wide) {
      expect(Math.abs(wide.titleLeft - narrow.titleLeft), "1179/1180 title left jump").toBeLessThanOrEqual(12);
      expect(Math.abs(wide.titleRight - narrow.titleRight), "1179/1180 title right jump").toBeLessThanOrEqual(12);
      expect(Math.abs(wide.innerLeft - narrow.innerLeft), "1179/1180 inner left jump").toBeLessThanOrEqual(4);
      expect(Math.abs(wide.innerWidth - narrow.innerWidth), "1179/1180 inner width jump").toBeLessThanOrEqual(8);
      expect(Math.abs(wide.graphicTop - narrow.graphicTop), "1179/1180 graphic top jump").toBeLessThanOrEqual(8);
      expect(Math.abs(wide.graphicLeft - narrow.graphicLeft), "1179/1180 graphic left jump").toBeLessThanOrEqual(8);
      expect(Math.abs(wide.graphicRight - narrow.graphicRight), "1179/1180 graphic right jump").toBeLessThanOrEqual(8);
      expect(
        Math.abs(wide.titleSize - narrow.titleSize) / Math.max(wide.titleSize, narrow.titleSize),
        "1179/1180 title size jump",
      ).toBeLessThanOrEqual(0.01);
      expect(
        Math.abs(wide.graphicWidth - narrow.graphicWidth) / Math.max(wide.graphicWidth, narrow.graphicWidth),
        "1179/1180 graphic width jump",
      ).toBeLessThanOrEqual(0.01);
    }

    const preLarge = heightMetrics.get("2399x1300");
    const large = heightMetrics.get("2400x1300");
    expect(preLarge, "missing 2399x1300 metrics").toBeTruthy();
    expect(large, "missing 2400x1300 metrics").toBeTruthy();
    if (preLarge && large) {
      expect(Math.abs(large.titleLeft - preLarge.titleLeft), "2399/2400 title left jump").toBeLessThanOrEqual(2);
      expect(Math.abs(large.innerWidth - preLarge.innerWidth), "2399/2400 inner width jump").toBeLessThanOrEqual(2);
      expect(Math.abs(large.graphicWidth - preLarge.graphicWidth), "2399/2400 graphic width jump").toBeLessThanOrEqual(3);
    }
  });
});

for (const viewport of [
  { name: "contact-320", width: 320, height: 568 },
  { name: "contact-340", width: 340, height: 640 },
  { name: "contact-341", width: 341, height: 640 },
] satisfies ResponsiveViewport[]) {
  test(`Contact ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const runtimeErrors = collectRuntimeErrors(page);
    const response = await page.goto(contact.path, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await settleRenderedPage(page);
    const report = await auditRenderedPage(page, contact, viewport);
    await assertResponsiveContract(report, runtimeErrors, testInfo);
  });
}
