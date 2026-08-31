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
    await expect(nav.getByRole("link", { name: "Founder", exact: true })).toHaveAttribute(
      "href",
      "https://yuto-matsui.com/",
    );
    if (route.active) {
      const current = nav.locator('[aria-current="page"]');
      await expect(current).toHaveCount(1);
      await expect(current).toContainText(route.active);
    }
    expect(runtimeErrors, `runtime errors while checking ${route.path} Desktop navigation`).toEqual([]);
  });
}

test("Every parent Founder entry point uses the new portfolio URL", async ({ page }) => {
  const runtimeErrors = await openRoute(page, "/", {
    name: "founder-entry-points",
    width: 390,
    height: 844,
  });
  const expected = "https://yuto-matsui.com/";

  await expect(page.locator("#founder .v4-founder__web-portfolio")).toHaveAttribute("href", expected);
  await expect(page.locator(".site-footer .footer-nav").getByRole("link", { name: "Founder" })).toHaveAttribute(
    "href",
    expected,
  );

  await page.locator("button.menu-toggle").first().click();
  await expect(page.locator("#mobile-menu").getByRole("link", { name: /代表について/ })).toHaveAttribute(
    "href",
    expected,
  );
  expect(runtimeErrors).toEqual([]);
});

test("Founder consumes the GA linker parameter without changing other URL state or CONTACT UI", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  const response = await page.goto("/founder/?_gl=linker-test&utm_source=compass#contact-cta", {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);

  await expect.poll(() => page.url()).not.toContain("_gl=");
  expect(page.url()).toContain("utm_source=compass");
  expect(page.url().endsWith("#contact-cta")).toBe(true);

  const emailDetails = page.locator("#contact-cta details");
  await expect(emailDetails).not.toHaveAttribute("open", "");
  await expect(emailDetails).toContainText("contact@yuto-matsui.com");
  await expect(emailDetails).toContainText("matsui.yuto@st.kitasato-u.ac.jp");
  await expect(emailDetails).not.toContainText("my270yuto0413@gmail.com");
  expect(runtimeErrors).toEqual([]);
});

test("Founder EXPERIENCE leads English Proficiency and owns the Desktop Credentials destination", async ({ page }) => {
  const runtimeErrors = await openRoute(page, "/founder/", {
    name: "founder-experience-desktop",
    width: 1440,
    height: 900,
  });
  const credentialsLink = page
    .getByRole("navigation", { name: "Portfolio navigation" })
    .getByRole("link", { name: "Credentials", exact: true });

  await expect(credentialsLink).toHaveAttribute("href", "#experience");
  await credentialsLink.click();
  await expect(page).toHaveURL(/#experience$/);

  const report = await page.evaluate(() => {
    const experience = document.querySelector<HTMLElement>("#experience")!;
    const proficiency = document.querySelector<HTMLElement>("#credentials")!;
    const offHours = document.querySelector<HTMLElement>("#off-hours")!;
    const cards = [...experience.querySelectorAll<HTMLElement>("article")];
    return {
      order: [experience, proficiency, offHours].map((element) => element.offsetTop),
      heights: {
        experience: experience.offsetHeight,
        proficiency: proficiency.offsetHeight,
        offHours: offHours.offsetHeight,
      },
      cards: cards.map((card) => {
        const area = card.querySelector<HTMLElement>("h3")!;
        const tenure = card.querySelector<HTMLElement>("strong")!;
        const focus = card.querySelector<HTMLElement>("[class*='experienceFocus'] p")!;
        const image = card.querySelector<HTMLElement>("[class*='experienceVisual']")!;
        const focusBox = card.querySelector<HTMLElement>("[class*='experienceFocus']")!;
        return {
          areaSize: Number.parseFloat(getComputedStyle(area).fontSize),
          tenureSize: Number.parseFloat(getComputedStyle(tenure).fontSize),
          focusSize: Number.parseFloat(getComputedStyle(focus).fontSize),
          focusWeight: Number.parseInt(getComputedStyle(focus).fontWeight, 10),
          focusLines: [...focus.querySelectorAll("span")].map((line) => line.textContent),
          focusBackground: getComputedStyle(focusBox).backgroundColor,
          focusBorderWidth: Number.parseFloat(getComputedStyle(focusBox).borderLeftWidth),
          imageWidth: image.getBoundingClientRect().width,
          cardWidth: card.getBoundingClientRect().width,
        };
      }),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });

  expect(report.order[0]).toBeLessThan(report.order[1]);
  expect(report.order[1]).toBeLessThan(report.order[2]);
  expect(report.heights.experience).toBeGreaterThan(report.heights.proficiency);
  expect(report.heights.experience).toBeLessThan(report.heights.offHours);
  expect(report.cards).toHaveLength(3);
  expect(report.cards.map((card) => card.focusLines)).toEqual([
    ["分子生物学", "細胞生物学", "神経科学"],
    ["フルスタックWeb開発", "クラウドエンジニアリング", "Agentic Workflows"],
    ["英語教育", "生命科学教育", "AIリテラシー"],
  ]);
  for (const card of report.cards) {
    expect(card.areaSize).toBeGreaterThan(card.focusSize);
    expect(card.areaSize).toBeGreaterThan(card.tenureSize);
    expect(card.focusWeight).toBe(600);
    expect(card.focusBackground).not.toBe("rgba(0, 0, 0, 0)");
    expect(card.focusBorderWidth).toBeGreaterThanOrEqual(3);
    expect(card.imageWidth / card.cardWidth).toBeGreaterThan(0.95);
  }
  expect(report.overflow).toBeLessThanOrEqual(1);
  expect(runtimeErrors).toEqual([]);
});

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

test("Founder FRAGMENTS preserves its editorial order, ambient motion, and shared Library hero", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const response = await page.goto("/founder/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);

  const fragments = page.locator("#fragments");
  await expect(fragments.locator("[data-slot]")).toHaveCount(19);
  await expect(fragments.locator("[data-fragment-ambient]")).toHaveCount(1);
  await expect(page.locator('[data-product="library"] [data-library-hero-preview="true"]')).toHaveCount(1);
  await expect(page.locator('[data-product="library"] img')).toHaveCount(0);

  const report = await page.evaluate(() => ({
    order: [...document.querySelectorAll("#fragments [data-slot]")]
      .map((element) => element.getAttribute("data-slot")),
    pictureAnimation: getComputedStyle(document.querySelector("#fragments picture")!).animationName,
    ambientAnimation: getComputedStyle(document.querySelector("#fragments [data-fragment-ambient] > g")!).animationName,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    copyright: document.querySelector("footer > p:last-of-type")?.textContent?.trim(),
  }));

  expect(report.order).toEqual([
    "yuto-696", "dna-automation", "yuto-706", "microfluidic", "code-terminal",
    "yuto-701", "pipette", "yuto-698", "code-data", "yuto-703",
    "code-window", "yuto-695", "servers", "yuto-707", "silicon-wafer",
    "yuto-697", "yuto-700", "yuto-699", "yuto-704",
  ]);
  expect(report.pictureAnimation).not.toBe("none");
  expect(report.ambientAnimation).not.toBe("none");
  expect(report.overflow).toBeLessThanOrEqual(1);
  expect(report.copyright).toBe(
    "© 2026 Yuto Matsui. Designed and developed by Yuto Matsui. All rights reserved.",
  );

  const mobileReel = fragments.locator("[class*='fragmentReelViewport']").first();
  const mobileReelContract = await mobileReel.evaluate((element) => ({
    overflowX: getComputedStyle(element).overflowX,
    hasScrollableContent: element.scrollWidth > element.clientWidth,
  }));
  expect(mobileReelContract).toEqual({ overflowX: "auto", hasScrollableContent: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  const spreadButtons = fragments.getByRole("button", { name: /写真セット/ });
  await expect(spreadButtons).toHaveCount(4);
  await spreadButtons.nth(2).click();
  await expect(spreadButtons.nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect(fragments.locator('[data-spread="3"]')).toHaveAttribute("data-active", "true");

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedMotion = await page.evaluate(() => ({
    picture: getComputedStyle(document.querySelector("#fragments picture")!).animationName,
    ambient: getComputedStyle(document.querySelector("#fragments [data-fragment-ambient] > g")!).animationName,
  }));
  expect(reducedMotion).toEqual({ picture: "none", ambient: "none" });
  expect(runtimeErrors).toEqual([]);
});

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
  await expect(links.nth(0)).toHaveAttribute("href", "https://yuto-matsui.com/");
  await expect(links.nth(0)).toContainText("Web Portfolio");
  await expect(links.nth(1)).toHaveAttribute("href", "https://github.com/genellect");
  await expect(page.locator('#adoption a[href="/contact/"]')).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("Interactive product film is visible, privacy-gated, and links to YouTube", async ({ page }) => {
  const runtimeErrors = await openRoute(page, "/INTRO_Interactive/", {
    name: "interactive-product-film",
    width: 390,
    height: 844,
  });

  const film = page.locator(".product-film");
  const youtubeLink = film.getByRole("link", { name: "COMPASS Interactive紹介動画をYouTubeで見る" });
  await film.scrollIntoViewIfNeeded();
  await expect(film).toBeVisible();
  await expect(film.locator("iframe")).toHaveCount(0);
  await expect(youtubeLink).toHaveAttribute("href", "https://www.youtube.com/watch?v=BL-9TVJ-ph8");
  await expect(youtubeLink).toHaveAttribute("target", "_blank");

  await film.getByRole("button", { name: "90秒のCOMPASS Interactive紹介動画を再生" }).click();
  await expect(film.locator("iframe")).toHaveAttribute(
    "src",
    /youtube-nocookie\.com\/embed\/BL-9TVJ-ph8\?autoplay=1/,
  );
  expect(runtimeErrors).toEqual([]);
});

test("Interactive mobile navigation follows the real page hierarchy", async ({ page }) => {
  const runtimeErrors = await openRoute(page, "/INTRO_Interactive/", {
    name: "interactive-mobile-navigation",
    width: 390,
    height: 844,
  });

  await page.getByRole("button", { name: "メニューを開く" }).click();
  const menu = page.locator("#mobile-menu");
  await expect(menu).toBeVisible();
  const educatorGroup = menu.locator(".mobile-nav-group").filter({ hasText: "FOR EDUCATORS" });
  const educatorLinks = educatorGroup.locator("a");
  await expect(educatorLinks).toHaveCount(3);
  await expect(educatorLinks).toHaveText([
    "学生の反応を活かすTeaching Flow",
    "教員の使い方Operations",
    "導入・ご相談Adoption",
  ]);
  await expect(educatorLinks.nth(0)).toHaveAttribute("href", "#teachers");
  await expect(educatorLinks.nth(1)).toHaveAttribute("href", "#educator-operations");
  await expect(educatorLinks.nth(2)).toHaveAttribute("href", "#adoption");
  await expect(educatorGroup.locator('a[href="#use-cases"]')).toHaveCount(0);
  await expect(educatorGroup.locator('a[href="#security"]')).toHaveCount(0);
  await expect(menu.getByRole("link", { name: /開発者・プロダクト設計者/ })).toHaveAttribute("href", "https://yuto-matsui.com/");
  await expect(menu.getByRole("button", { name: "メニューを閉じる" })).toHaveCount(1);
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

test("Founder language controls connect the Japanese and English portfolio routes", async ({ page }) => {
  let runtimeErrors = await openRoute(page, "/founder/", {
    name: "founder-language-desktop",
    width: 1440,
    height: 900,
  });
  const language = page.locator('[aria-label="言語切替"]').first();
  await expect(language.getByRole("link", { name: "JP", exact: true })).toHaveAttribute("href", "/");
  await expect(language.getByRole("link", { name: "EN", exact: true })).toHaveAttribute("href", "/en/");
  const footerLanguage = page.locator("footer").locator('[aria-label="言語切替"]');
  await expect(footerLanguage).toBeVisible();
  await expect(footerLanguage.getByRole("link", { name: "EN", exact: true })).toHaveAttribute("href", "/en/");
  expect(runtimeErrors).toEqual([]);

  runtimeErrors = await openRoute(page, "/founder/", {
    name: "founder-language-mobile",
    width: 390,
    height: 844,
  });
  await page.getByRole("button", { name: "外部リンクを表示" }).click();
  const mobileLanguage = page.locator('[class*="mobileLanguagePanel"]');
  await expect(mobileLanguage).toContainText("Language");
  await expect(mobileLanguage.getByRole("link", { name: "EN", exact: true })).toHaveAttribute("href", "/en/");
  await page.locator("footer").scrollIntoViewIfNeeded();
  await expect(page.locator("footer").locator('[aria-label="言語切替"]')).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("English Founder keeps the full statement and 19-photo archive in accessible inline disclosures", async ({ page }) => {
  const runtimeErrors = await openRoute(page, "/en/", {
    name: "founder-english-disclosures",
    width: 1440,
    height: 900,
  });

  const statementButton = page.getByRole("button", { name: "Read the full statement" });
  const continuation = page.locator("#english-statement-continuation");
  await expect(statementButton).toHaveAttribute("aria-expanded", "false");
  await expect(continuation).toBeHidden();
  await expect(continuation).toContainText("If that foundation can help science move faster");
  await statementButton.click();
  await expect(continuation).toBeVisible();
  await expect(page.getByRole("button", { name: "Close statement" })).toBeFocused();
  await page.getByRole("button", { name: "Close statement" }).click();
  await expect(continuation).toBeHidden();

  const archiveButton = page.getByRole("button", { name: "Open the full archive — 19 images" });
  await expect(page.locator("[data-preview-photo]")).toHaveCount(5);
  await expect(page.locator("[data-archive-photo]")).toHaveCount(19);
  await expect(page.locator("#english-fragments-archive")).toBeHidden();
  await archiveButton.click();
  await expect(page.locator("#english-fragments-archive")).toBeVisible();
  await expect(page.getByRole("button", { name: "Close archive" })).toBeFocused();
  await page.getByRole("button", { name: "Close archive" }).click();
  await expect(page.locator("#english-fragments-preview")).toBeVisible();
  const englishFooterLanguage = page.locator("footer").locator('[aria-label="Language"]');
  await expect(englishFooterLanguage).toBeVisible();
  await expect(englishFooterLanguage.getByRole("link", { name: "JP", exact: true })).toHaveAttribute("href", "/");
  expect(runtimeErrors).toEqual([]);
});

test("English Founder remains overflow-free at the approved responsive viewports", async ({ page }) => {
  const viewports = [
    { width: 320, height: 568 },
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const response = await page.goto("/en/", { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${viewport.width}x${viewport.height}`).toBe(200);
    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      heroName: document.querySelector("#english-founder-title")?.getBoundingClientRect(),
      thesis: document.querySelector('[class*="heroThesis"]')?.getBoundingClientRect(),
      domains: document.querySelector('[class*="heroDomains"]')?.getBoundingClientRect(),
    }));
    expect(geometry.overflow, `${viewport.width}x${viewport.height} overflow`).toBeLessThanOrEqual(1);
    expect(geometry.heroName?.width, `${viewport.width}x${viewport.height} hero name`).toBeGreaterThan(0);
    expect(geometry.thesis?.width, `${viewport.width}x${viewport.height} thesis`).toBeGreaterThan(0);
    expect(geometry.domains?.width, `${viewport.width}x${viewport.height} domains`).toBeGreaterThan(0);
  }
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
  const teacherTitle = page.locator("#teachers h2");
  const teacherLines = await teacherTitle.locator(".teacher-title-line").evaluateAll((lines) =>
    lines.map((line) => ({ display: getComputedStyle(line).display, top: line.getBoundingClientRect().top })),
  );
  expect(teacherLines).toHaveLength(2);
  expect(teacherLines[0].display).toBe("block");
  expect(teacherLines[1].top).toBeGreaterThan(teacherLines[0].top);
  await expect(teacherTitle).toHaveCSS("text-align", "center");
  await expect(page.locator("#teachers .section-header .lead")).toHaveCSS("text-align", "center");
  await expect(page.locator("#security .section-header")).toHaveCSS("text-align", "center");
  await expect(page.locator("#security .section-header .lead")).toHaveCSS("text-align", "center");
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
