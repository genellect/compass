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

for (const contract of routeContracts.filter(({ sharedMobileMenu }) => sharedMobileMenu !== false)) {
  test(`Mobile navigation opens, traps focus, and closes: ${contract.name}`, async ({ page }) => {
    const runtimeErrors = await openRoute(page, contract.path, phone);
    const toggle = page.locator("button.menu-toggle").first();
    const menu = page.locator("#mobile-menu").first();

    await expect(toggle).toBeVisible();
    await expect.poll(
      () => toggle.evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps$"))),
      { message: "menu toggle did not hydrate" },
    ).toBe(true);
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
  {
    name: "Developer Windows short",
    path: "/INTRO_Interactive/developers/",
    viewport: { name: "developer-short-action", width: 1275, height: 553 },
    selector: ".developer-hero__actions .developer-button--primary",
  },
  {
    name: "Developer mobile",
    path: "/INTRO_Interactive/developers/",
    viewport: { name: "developer-mobile-action", width: 390, height: 844 },
    selector: ".developer-hero__actions .developer-button--primary",
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
    const links = page.locator('a[href="https://github.com/genellect"]');
    await expect(links).toHaveCount(1);
    const link = links.first();
    await expect(link).toHaveAttribute("href", "https://github.com/genellect");
    await expect(link).toContainText("GitHub Portfolio");
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeVisible();
    expect(runtimeErrors, `runtime errors while checking GitHub Portfolio on ${path}`).toEqual([]);
  });
}

test("Interactive introduction shows Web Portfolio before GitHub Portfolio", async ({ page }) => {
  const runtimeErrors = await openRoute(page, "/INTRO_Interactive/", {
    name: "interactive-portfolio-links",
    width: 390,
    height: 844,
  });
  const links = page.locator("#developers .developer-credit__portfolio-links > a");
  await expect(links).toHaveCount(2);
  await expect(links.nth(0)).toHaveAttribute("href", "/founder/");
  await expect(links.nth(0)).toContainText("Web Portfolio");
  await expect(links.nth(1)).toHaveAttribute("href", "https://github.com/genellect");
  await expect(page.locator('#adoption a[href="/contact/"]')).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("Founder product links include equal-size ProtoPedia CTA in the requested order", async ({ page }) => {
  const runtimeErrors = await openRoute(page, "/founder/", {
    name: "founder-product-links",
    width: 1440,
    height: 900,
  });
  const links = page.locator('[data-product="interactive"] nav a');
  await expect(links).toHaveCount(3);
  await expect(links.nth(0)).toContainText("紹介サイト");
  await expect(links.nth(1)).toHaveAttribute(
    "href",
    "https://protopedia.net/prototype/private/59f061db-936a-4fa3-abc2-438a98711e9e",
  );
  await expect(links.nth(1)).toContainText("ProtoPedia");
  await expect(links.nth(2)).toContainText("開発者向けポートフォリオ");
  const dimensions = await links.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );
  expect(new Set(dimensions.map(({ width }) => width)).size).toBe(1);
  expect(new Set(dimensions.map(({ height }) => height)).size).toBe(1);
  expect(runtimeErrors).toEqual([]);
});

test("Interactive footer exposes Source and ProtoPedia as compact CTAs", async ({ page }) => {
  const runtimeErrors = await openRoute(page, "/INTRO_Interactive/", {
    name: "interactive-footer-links",
    width: 390,
    height: 844,
  });
  const footer = page.locator("footer.site-footer");
  const source = footer.getByRole("link", { name: "COMPASS Interactive source code on GitHub" });
  const protoPedia = footer.getByRole("link", { name: "ProtoPedia", exact: true });
  await expect(source).toHaveAttribute("href", "https://github.com/genellect/compass-interactive");
  await expect(source.locator("svg")).toHaveCount(1);
  await expect(protoPedia).toHaveAttribute(
    "href",
    "https://protopedia.net/prototype/private/59f061db-936a-4fa3-abc2-438a98711e9e",
  );
  await expect(footer).not.toContainText("疑問が動けば、講義が変わる。");
  await expect(footer).not.toContainText("https://");
  expect(runtimeErrors).toEqual([]);
});

test("Interactive Desktop navigation and adoption disclosure follow the approved hierarchy", async ({ page }) => {
  let runtimeErrors = await openRoute(page, "/INTRO_Interactive/", {
    name: "interactive-adoption-desktop",
    width: 1440,
    height: 900,
  });

  const desktopNav = page.locator(".site-header .desktop-nav");
  const desktopLinks = desktopNav.locator("a");
  await expect(desktopLinks).toHaveCount(5);
  await expect(desktopLinks).toHaveText([
    "学生の体験",
    "AI学習支援",
    "教員の使い方",
    "導入・ご相談",
    "設計・技術",
  ]);
  await expect(desktopLinks.nth(2)).toHaveAttribute("href", "#educator-operations");
  await expect(desktopLinks.nth(3)).toHaveAttribute("href", "#adoption");
  await expect(desktopNav).not.toContainText("こんな場面で");

  const disclosure = page.locator("#adoption details");
  const detailBody = disclosure.locator(".adoption-contact__details");
  await expect(disclosure).not.toHaveAttribute("open", "");
  await expect(detailBody).not.toBeVisible();
  await expect(page.locator("#adoption .adoption-contact__cta")).toHaveAttribute("href", "/contact/");
  await disclosure.locator("summary").click();
  await expect(disclosure).toHaveAttribute("open", "");
  await expect(detailBody).toBeVisible();
  await expect(detailBody).toContainText("利用内容に応じて個別にご相談を承ります。");
  const emphasis = await detailBody.locator("strong").first().evaluate((element) => {
    const style = getComputedStyle(element);
    const parentStyle = getComputedStyle(element.parentElement!);
    return {
      fontWeight: Number(style.fontWeight),
      fontSize: style.fontSize,
      parentFontSize: parentStyle.fontSize,
    };
  });
  expect(emphasis.fontWeight).toBe(600);
  expect(emphasis.fontSize).toBe(emphasis.parentFontSize);
  await disclosure.locator("summary").click();
  await expect(detailBody).not.toBeVisible();
  expect(runtimeErrors).toEqual([]);

  runtimeErrors = await openRoute(page, "/INTRO_Interactive/", {
    name: "interactive-adoption-mobile",
    width: 390,
    height: 844,
  });
  await expect(page.locator(".site-header .desktop-nav")).not.toBeVisible();
  const mobileDisclosure = page.locator("#adoption details");
  await expect(mobileDisclosure.locator(".adoption-contact__details")).not.toBeVisible();
  await mobileDisclosure.locator("summary").click();
  await expect(mobileDisclosure.locator(".adoption-contact__details")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(runtimeErrors).toEqual([]);
});

test("Interactive educator operations follows Trust with deliberate heading lines", async ({ page }) => {
  let runtimeErrors = await openRoute(page, "/INTRO_Interactive/", {
    name: "interactive-educator-desktop",
    width: 1440,
    height: 900,
  });

  await expect(page.locator("#teachers h2")).toHaveText("学生の反応が、次の説明を変える。");
  await expect(page.locator("#educator-operations h2")).toHaveText(
    "講義の準備から画面共有まで、ひとつの管理画面で。",
  );
  await expect(page.locator("#educator-operations .educator-control__workflow li")).toHaveCount(4);
  await expect(page.locator("#educator-operations .educator-control__live")).toContainText("LIVE");
  await expect(page.locator("#educator-operations .educator-control__share")).toContainText("画面共有を開始");
  await expect(page.locator("#educator-operations .ai-review")).toContainText("Reviewed by educator");

  const desktopHierarchy = await page.evaluate(() => {
    const top = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().top ?? -1;
    const headingLines = Array.from(
      document.querySelectorAll<HTMLElement>("#educator-operations h2 > .title-line"),
      (line) => line.getBoundingClientRect().top,
    );
    return {
      trust: top("#security"),
      educator: top("#educator-operations"),
      adoption: top("#adoption"),
      developers: top("#developers"),
      headingLines,
    };
  });
  expect(desktopHierarchy.trust).toBeLessThan(desktopHierarchy.educator);
  expect(desktopHierarchy.educator).toBeLessThan(desktopHierarchy.adoption);
  expect(desktopHierarchy.adoption).toBeLessThan(desktopHierarchy.developers);
  expect(desktopHierarchy.headingLines).toHaveLength(2);
  expect(desktopHierarchy.headingLines[1]).toBeGreaterThan(desktopHierarchy.headingLines[0]);
  expect(runtimeErrors).toEqual([]);

  runtimeErrors = await openRoute(page, "/INTRO_Interactive/", {
    name: "interactive-educator-mobile",
    width: 390,
    height: 844,
  });
  const mobileLineBreak = await page.locator("#educator-operations .title-continuation--mobile").evaluate(
    (continuation) => ({
      display: getComputedStyle(continuation).display,
      top: continuation.getBoundingClientRect().top,
      previousTop: continuation.previousElementSibling?.getBoundingClientRect().top ?? -1,
    }),
  );
  expect(mobileLineBreak.display).toBe("block");
  expect(mobileLineBreak.top).toBeGreaterThan(mobileLineBreak.previousTop);
  expect(runtimeErrors).toEqual([]);
});

test("Interactive Developer Gateway keeps the product engineering message", async ({ page }) => {
  const runtimeErrors = await openRoute(page, "/INTRO_Interactive/", {
    name: "interactive-developer-gateway",
    width: 1440,
    height: 900,
  });
  const gateway = page.locator("#developers");
  await expect(gateway.getByText("設計判断をたどる", { exact: true })).toBeVisible();
  await expect(gateway.getByRole("heading", { name: "この体験を、見えない設計から支える。" })).toBeVisible();
  await expect(gateway.getByText("Product ownership", { exact: true })).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});

test("Interactive developer content remains visible without repeated scale metrics", async ({ page }) => {
  const runtimeErrors = await openRoute(page, "/INTRO_Interactive/developers/", {
    name: "developer-content-contract",
    width: 1440,
    height: 900,
  });

  const securityCopy = page.getByText(
    "教員側はGoogle認証に加えてTOTPによるAAL2を要求し、学生用の認証とはクライアントと保存領域を分離します。",
    { exact: true },
  );
  const decisionCopy = page.getByText(
    /COMPASS Interactiveでは、特に影響の大きい状態同期、講義終了、資料公開、AI実行について、通常系だけでなく失敗時の挙動まで設計しています。/,
  );
  await expect(securityCopy).toBeVisible();
  await expect(decisionCopy).toBeVisible();
  await expect(securityCopy.locator("xpath=ancestor::details")).toHaveCount(0);
  await expect(decisionCopy.locator("xpath=ancestor::details")).toHaveCount(0);
  await expect(page.locator(".developer-codebase__metrics")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "WebからWindowsまで、単一リポジトリで管理。" })).toBeVisible();
  await expect(page.locator(".developer-table-wrap--directories thead th")).toHaveCount(2);

  const spacing = await page.evaluate(
    ({ verificationSelector, headingSelector }) => {
      const previous = document.querySelector<HTMLElement>(verificationSelector);
      const heading = document.querySelector<HTMLElement>(headingSelector);
      if (!previous || !heading) return -1;
      return heading.getBoundingClientRect().top - previous.getBoundingClientRect().bottom;
    },
    { verificationSelector: ".developer-verification", headingSelector: "#classroom-title" },
  );
  expect(spacing, "CLASSROOM VALIDATION heading needs a clear Desktop section break").toBeGreaterThanOrEqual(80);
  expect(runtimeErrors).toEqual([]);
});

test("FSL Mobile registration prompt follows the reading position", async ({ page }) => {
  const runtimeErrors = await openRoute(page, "/future-strategy-library/", {
    name: "fsl-sticky-registration",
    width: 390,
    height: 844,
  });
  const prompt = page.locator("[data-mobile-registration-prompt]");
  await expect(prompt).toHaveCount(0);

  await page.locator('[data-library-section="thesis"]').scrollIntoViewIfNeeded();
  await expect(prompt).toHaveCount(1);
  await expect(prompt).toHaveAttribute("data-visible", "true");
  await expect(prompt.locator('[data-placement="sticky"]')).toContainText("無料で登録する");

  const menuToggle = page.locator("button.menu-toggle").first();
  await menuToggle.click();
  await expect(prompt).toHaveAttribute("data-visible", "false");
  await page.keyboard.press("Escape");
  await expect(prompt).toHaveAttribute("data-visible", "true");

  await page.locator('[data-library-section="final"]').scrollIntoViewIfNeeded();
  await expect(prompt).toHaveAttribute("data-visible", "false");
  expect(runtimeErrors).toEqual([]);
});

test("Parent and Manifesto footer hierarchy remains route-specific", async ({ page }) => {
  let runtimeErrors = await openRoute(page, "/", {
    name: "parent-footer-desktop",
    width: 1363,
    height: 936,
  });
  const parentFooter = page.locator('.site-footer[data-route-context="root"]');
  await expect(parentFooter.locator(".footer-brand > p").last()).toHaveText(
    "Don’t Just Learn. Build What’s Next.",
  );
  await expect(parentFooter.locator(".footer-source-link")).toBeVisible();
  expect(runtimeErrors).toEqual([]);

  runtimeErrors = await openRoute(page, "/messages/", {
    name: "manifesto-footer-desktop",
    width: 1363,
    height: 936,
  });
  const manifestoFooter = page.locator('.site-footer[data-route-context="messages"]');
  await manifestoFooter.scrollIntoViewIfNeeded();
  await expect(manifestoFooter.locator(".footer-nav")).toBeHidden();
  await expect(manifestoFooter.locator(".footer-note")).toBeVisible();
  await expect(manifestoFooter.locator(".copyright")).toBeVisible();
  expect(runtimeErrors).toEqual([]);

  runtimeErrors = await openRoute(page, "/messages/", {
    name: "manifesto-footer-mobile",
    width: 390,
    height: 844,
  });
  await page.locator('.site-footer[data-route-context="messages"]').scrollIntoViewIfNeeded();
  await expect(page.locator('.site-footer[data-route-context="messages"] .footer-nav')).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

for (const viewport of [
  { name: "library-admin-mobile", width: 390, height: 844 },
  { name: "library-admin-desktop", width: 1440, height: 900 },
] satisfies ResponsiveViewport[]) {
  test(`Library administrator roster preserves COMPASS layout: ${viewport.name}`, async ({ page }) => {
    const runtimeErrors = collectRuntimeErrors(page);
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const response = await page.goto("/library-registration/admin/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const openButton = page.getByRole("button", { name: "管理画面を開く" });
    await expect(openButton).toBeEnabled();
    await expect(page.locator("#mock-admin-role")).toHaveCount(0);
    await openButton.click();
    await expect(page.getByRole("heading", { name: "登録者名簿", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "名簿出力", exact: true })).toBeVisible();

    const report = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const header = document.querySelector<HTMLElement>(".admin-header");
      const workspace = document.querySelector<HTMLElement>(".admin-workspace");
      const tableWrap = document.querySelector<HTMLElement>(".admin-roster-table-wrap");
      const tableHeader = document.querySelector<HTMLElement>(".admin-roster-table thead th");
      return {
        tokens: {
          night: root.getPropertyValue("--admin-night-950").trim(),
          cyan: root.getPropertyValue("--admin-cyan").trim(),
          gold: root.getPropertyValue("--admin-gold").trim(),
        },
        headerBackground: header ? getComputedStyle(header).backgroundColor : "",
        workspaceBackground: workspace ? getComputedStyle(workspace).backgroundColor : "",
        tableHeaderPosition: tableHeader ? getComputedStyle(tableHeader).position : "",
        tableClientWidth: tableWrap?.clientWidth ?? 0,
        tableScrollWidth: tableWrap?.scrollWidth ?? 0,
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
        visibleText: document.body.innerText,
      };
    });

    expect(report.tokens).toEqual({ night: "#020812", cyan: "#66e6ef", gold: "#e7bc5d" });
    const headerChannels = report.headerBackground.match(
      /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/,
    );
    expect(headerChannels, "administrator header must retain the COMPASS night color").not.toBeNull();
    expect(headerChannels?.slice(1, 4).map(Number)).toEqual([2, 8, 18]);
    const headerAlpha = Number(headerChannels?.[4] ?? 1);
    expect(headerAlpha).toBeGreaterThanOrEqual(0.94);
    expect(headerAlpha).toBeLessThanOrEqual(1);
    expect(report.workspaceBackground).toBe("rgb(245, 246, 247)");
    expect(report.tableHeaderPosition).toBe("sticky");
    expect(report.pageOverflow).toBeLessThanOrEqual(1);
    if (viewport.width === 390) {
      expect(report.tableScrollWidth).toBeGreaterThan(report.tableClientWidth);
    }
    expect(report.visibleText).not.toMatch(/PHASE|SYNTHETIC|MOCK|ADMIN API|生成AI|開発版/i);
    await expect(page.locator(".site-header, .desktop-nav, #mobile-menu")).toHaveCount(0);
    expect(runtimeErrors).toEqual([]);
  });
}

for (const viewport of [
  { name: "library-registration-mobile", width: 390, height: 844 },
  { name: "library-registration-desktop", width: 1440, height: 900 },
] satisfies ResponsiveViewport[]) {
  test(`Library registration keeps the approved single-column flow: ${viewport.name}`, async ({ page }) => {
    const runtimeErrors = await openRoute(page, "/library-registration/", viewport);
    const title = page.getByRole("heading", {
      name: "ようこそ、 未来戦略ライブラリへ。",
      exact: true,
    });
    await expect(title).toBeVisible();
    await expect(page.getByRole("heading", { name: "大学アカウント認証" })).toBeVisible();
    await expect(page.getByRole("button", { name: "登録内容を確認する" })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "入力状況" })).toHaveCount(0);

    const termsCheckbox = page.getByRole("checkbox", {
      name: /上記の利用規約を確認し、同意します。/,
    });
    await expect(termsCheckbox).toBeDisabled();
    await page.getByRole("button", { name: /利用規約 全5項目/ }).click();
    await expect(termsCheckbox).toBeEnabled();

    const report = await page.evaluate(() => {
      const heading = document.querySelector<HTMLElement>("#registration-title");
      const headingBounds = heading?.getBoundingClientRect();
      const visibleText = document.body.innerText;
      return {
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
        headingLeft: headingBounds?.left ?? -1,
        headingRight: headingBounds?.right ?? window.innerWidth + 1,
        visibleText,
      };
    });
    expect(report.pageOverflow).toBeLessThanOrEqual(1);
    expect(report.headingLeft).toBeGreaterThanOrEqual(0);
    expect(report.headingRight).toBeLessThanOrEqual(viewport.width + 1);
    expect(report.visibleText).not.toMatch(/入力状況|検証|モック|PHASE|SYNTHETIC/i);
    expect(runtimeErrors).toEqual([]);
  });
}
