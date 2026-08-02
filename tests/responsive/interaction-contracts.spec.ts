import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./responsive-fixture";

import {
  assertResponsiveContract,
  auditRenderedPage,
  collectRuntimeErrors,
  settleRenderedPage,
} from "./layout-audit";
import { routeContracts, type ResponsiveViewport } from "./route-contracts";

async function openRoute(page: Page, path: string, viewport: ResponsiveViewport) {
  const runtimeErrors = collectRuntimeErrors(page);
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status(), `${path} did not return HTTP 200`).toBe(200);
  await settleRenderedPage(page);
  return runtimeErrors;
}

async function expectInitialHitTarget(page: Page, locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).toBeTruthy();
  if (!box) return;
  const viewport = page.viewportSize()!;
  expect(box.y, "action begins above the viewport").toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, "action is below the initial viewport").toBeLessThanOrEqual(viewport.height + 1);
  const hit = await page.evaluate(
    ({ x, y, selector }) => {
      const target = document.querySelector(selector);
      const point = document.elementFromPoint(x, y);
      return Boolean(target && point && (target === point || target.contains(point)));
    },
    {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      selector: await locator.evaluate((element) => {
        const token = `responsive-hit-${Math.random().toString(36).slice(2)}`;
        element.setAttribute("data-responsive-hit", token);
        return `[data-responsive-hit="${token}"]`;
      }),
    },
  );
  expect(hit, "action center is covered by another element").toBe(true);
}

const phone = { name: "mobile-menu", width: 390, height: 844 } satisfies ResponsiveViewport;

for (const contract of routeContracts) {
  test(`Mobile navigation opens, traps focus, and closes: ${contract.name}`, async ({ page }) => {
    const runtimeErrors = await openRoute(page, contract.path, phone);
    const toggle = page.locator("button.menu-toggle").first();
    const menu = page.locator("#mobile-menu").first();

    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute("aria-hidden", "false");
    expect(await menu.locator("a[href]").count()).toBeGreaterThanOrEqual(5);
    await expect(page.locator("body")).toHaveClass(/menu-open/);
    expect(await page.evaluate(() => document.querySelector("#mobile-menu")?.contains(document.activeElement))).toBe(true);

    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator("body")).not.toHaveClass(/menu-open/);
    await expect(toggle).toBeFocused();
    expect(runtimeErrors, `runtime errors while exercising ${contract.path} Mobile menu`).toEqual([]);
  });
}

const officialDesktopRoutes = [
  { path: "/", active: null },
  { path: "/future-strategy-library/", active: "Resources" },
  { path: "/messages/", active: "Resources" },
  { path: "/community/join/", active: "Community" },
  { path: "/contact/", active: "Contact" },
];

for (const route of officialDesktopRoutes) {
  test(`Official Desktop navigation contract: ${route.path}`, async ({ page }) => {
    const runtimeErrors = await openRoute(page, route.path, { name: "desktop-nav", width: 1363, height: 936 });
    const nav = page.locator(".site-header .desktop-nav");
    await expect(nav).toBeVisible();
    for (const label of ["Technology", "Resources", "Community"]) {
      await expect(nav.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
    for (const label of ["Founder", "Contact"]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    if (route.active) {
      const current = nav.locator('[aria-current="page"]');
      await expect(current).toHaveCount(1);
      await expect(current).toContainText(route.active);
    }
    expect(runtimeErrors, `runtime errors while checking ${route.path} Desktop navigation`).toEqual([]);
  });
}

for (const viewport of [
  { name: "community-mobile", width: 390, height: 844 },
  { name: "community-desktop", width: 1363, height: 936 },
] satisfies ResponsiveViewport[]) {
  test(`Parent Community disclosure remains stable: ${viewport.name}`, async ({ page }, testInfo) => {
    const parent = routeContracts.find((contract) => contract.name === "parent")!;
    const runtimeErrors = await openRoute(page, parent.path, viewport);
    const details = page.locator("#community details.v4-community__details");
    const toggle = details.locator("summary");
    const body = details.locator(".v4-community__details-copy");
    await toggle.scrollIntoViewIfNeeded();
    expect(await details.getAttribute("open")).toBeNull();
    await toggle.click();
    await expect(details).toHaveAttribute("open", "");
    await expect(body).toBeVisible();
    const report = await auditRenderedPage(page, parent, viewport);
    await assertResponsiveContract(report, runtimeErrors, testInfo);
    await toggle.click();
    expect(await details.getAttribute("open")).toBeNull();
  });
}

for (const scenario of [
  {
    name: "FSL scaled browser",
    path: "/future-strategy-library/",
    viewport: { name: "fsl-action", width: 1275, height: 553 },
    selector: '[class*="heroActionGroup"] a',
  },
  {
    name: "Manifesto mobile",
    path: "/messages/",
    viewport: { name: "manifesto-action", width: 390, height: 844 },
    selector: '[class*="coverActions"] button',
  },
  {
    name: "Interactive laptop",
    path: "/INTRO_Interactive/",
    viewport: { name: "interactive-action", width: 1024, height: 768 },
    selector: "a#hero-primary-cta.hero-cta",
  },
] satisfies Array<{
  name: string;
  path: string;
  viewport: ResponsiveViewport;
  selector: string;
}>) {
  test(`Initial CTA is visible and clickable: ${scenario.name}`, async ({ page }) => {
    const runtimeErrors = await openRoute(page, scenario.path, scenario.viewport);
    await expectInitialHitTarget(page, page.locator(scenario.selector).first());
    expect(runtimeErrors, `runtime errors while checking ${scenario.name}`).toEqual([]);
  });
}

for (const path of ["/", "/INTRO_Interactive/", "/INTRO_Interactive/developers/"]) {
  test(`GitHub Portfolio link contract: ${path}`, async ({ page }) => {
    const runtimeErrors = await openRoute(page, path, { name: "github-link", width: 390, height: 844 });
    const link = page.locator('a[href="https://github.com/my270yuto0413-cmyk"]').first();
    await expect(link).toHaveAttribute("href", "https://github.com/my270yuto0413-cmyk");
    await expect(link).toContainText("GitHub Portfolio");
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeVisible();
    expect(runtimeErrors, `runtime errors while checking GitHub Portfolio on ${path}`).toEqual([]);
  });
}
