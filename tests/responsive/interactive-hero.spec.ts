import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./responsive-fixture";
import { collectRuntimeErrors, settleRenderedPage } from "./layout-audit";
import type { ResponsiveViewport } from "./route-contracts";

const heroViewports: ResponsiveViewport[] = [
  { name: "small-phone", width: 320, height: 568 },
  { name: "phone", width: 390, height: 844 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "compact-landscape", width: 900, height: 800 },
  { name: "laptop", width: 1024, height: 768 },
  { name: "windows-short", width: 1275, height: 553 },
  { name: "requested-desktop", width: 1363, height: 936 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "windows-125-percent", width: 1536, height: 672 },
  { name: "raw-4k", width: 3840, height: 2160 },
];

async function renderedLineCount(locator: Locator) {
  return locator.evaluate((element) => {
    const rows: number[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode) {
      const value = textNode.textContent ?? "";
      for (let index = 0; index < value.length; index += 1) {
        if (/\s/u.test(value[index])) continue;
        const range = document.createRange();
        range.setStart(textNode, index);
        range.setEnd(textNode, index + 1);
        const rect = [...range.getClientRects()].at(-1);
        if (rect && rect.width > 0 && !rows.some((top) => Math.abs(top - rect.top) <= 2)) {
          rows.push(rect.top);
        }
      }
      textNode = walker.nextNode();
    }
    return rows.length;
  });
}

async function expectInsideInitialViewport(page: Page, locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).toBeTruthy();
  if (!box) return;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function expectInitialHitTarget(page: Page, locator: Locator) {
  await expectInsideInitialViewport(page, locator);
  const box = await locator.boundingBox();
  if (!box) return;

  const token = await locator.evaluate((element) => {
    const value = `signal-hit-${Math.random().toString(36).slice(2)}`;
    element.setAttribute("data-interactive-hero-hit", value);
    return value;
  });
  const hit = await page.evaluate(
    ({ x, y, value }) => {
      const target = document.querySelector(`[data-interactive-hero-hit="${value}"]`);
      const point = document.elementFromPoint(x, y);
      return Boolean(target && point && (target === point || target.contains(point)));
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2, value: token },
  );
  expect(hit, "primary CTA center is covered by another Hero layer").toBe(true);
}

async function expectProductProofReadable(page: Page, mobile: boolean) {
  const proof = page.locator(mobile ? ".hero-mobile-product-proof" : ".hero-product-experience");
  await expectInsideInitialViewport(page, proof);
  const selectors = mobile
    ? [
        ".hero-mobile-product-proof__status strong",
        ".hero-mobile-product-proof__caption strong",
        ".hero-mobile-product-proof__recap strong",
      ]
    : [
        ".product-experience-mock__live",
        ".product-caption p",
        ".product-ai-recap p strong",
      ];
  for (const selector of selectors) {
    const locator = proof.locator(selector);
    await expect(locator).toBeVisible();
    const fontSize = await locator.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize, `${selector} is too small to function as product proof`).toBeGreaterThanOrEqual(9);
  }
}

for (const viewport of heroViewports) {
  test(`Interactive product-led Hero: ${viewport.name} ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const runtimeErrors = collectRuntimeErrors(page);
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const response = await page.goto("/INTRO_Interactive/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await settleRenderedPage(page);

    const hero = page.locator("section#top.hero-section--signal");
    const title = page.locator("h1#hero-title");
    const lead = page.locator(".hero-lead");
    const primary = page.locator("#hero-primary-cta");
    const secondary = page.locator('.hero-secondary-cta[href="https://compass-interactive.pages.dev/join"]');
    const stage = page.locator(".hero-signal-stage");
    const canvas = stage.locator("canvas.hero-signal-matrix");
    const ambientCanvas = page.locator("canvas.hero-ai-field");
    const mobileLearningField = page.locator("canvas.hero-mobile-learning-field");
    const origin = title.locator(".hero-title__core[data-signal-origin]");

    await expect(hero).toHaveCount(1);
    await expect(title).toHaveAccessibleName("LET EVERYTHING MOVE.");
    await expect(primary).toHaveAttribute("href", "https://compass-interactive.pages.dev/demo");
    await expect(secondary).toHaveCount(1);
    await expectInsideInitialViewport(page, title);
    await expectInsideInitialViewport(page, lead);
    await expectInitialHitTarget(page, primary);
    expect(await renderedLineCount(title)).toBe(viewport.width <= 680 ? 2 : 1);

    const documentGeometry = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(documentGeometry.scrollWidth).toBeLessThanOrEqual(documentGeometry.clientWidth + 1);

    const heroBox = await hero.boundingBox();
    expect(heroBox).toBeTruthy();
    if (heroBox) {
      expect(heroBox.y + heroBox.height, "Hero extends below the initial viewport").toBeLessThanOrEqual(viewport.height + 1);
    }

    if (viewport.width <= 680) {
      const primaryBox = await primary.boundingBox();
      expect(primaryBox).toBeTruthy();
      if (primaryBox) {
        const layoutWidth = await page.evaluate(() => document.documentElement.clientWidth);
        const centerDelta = Math.abs(primaryBox.x + primaryBox.width / 2 - layoutWidth / 2);
        expect(centerDelta, "Mobile primary CTA is not centered").toBeLessThanOrEqual(2);
      }
    }

    await expect(origin).toHaveCount(1);
    await expect(origin).toHaveText(".");
    await expect(origin).toBeVisible();
    await expect(ambientCanvas).toHaveCount(1);
    await expect(mobileLearningField).toHaveCount(1);

    if (viewport.width <= 680) {
      await expect(ambientCanvas).toBeHidden();
      await expect(ambientCanvas).toHaveAttribute("data-render-state", "ready");
      await expect(ambientCanvas).toHaveAttribute("data-renderer", "inactive");
      await expect(mobileLearningField).toBeVisible();
      await expect(mobileLearningField).toHaveAttribute("data-render-state", "ready");
      await expect(mobileLearningField).toHaveAttribute("data-renderer", "canvas2d");
      await expect(mobileLearningField).toHaveAttribute("data-motion-state", "reduced");
      const mobileBudget = await mobileLearningField.evaluate((element) => {
        const canvasElement = element as HTMLCanvasElement;
        return {
          pixels: canvasElement.width * canvasElement.height,
          pixelRatio: Number.parseFloat(canvasElement.dataset.pixelRatio ?? "0"),
        };
      });
      expect(mobileBudget.pixels).toBeLessThanOrEqual(710_000);
      expect(mobileBudget.pixelRatio).toBeGreaterThanOrEqual(0.59);
      expect(mobileBudget.pixelRatio).toBeLessThanOrEqual(1.4);
    } else {
      await expect(ambientCanvas).toBeVisible();
      await expect(ambientCanvas).toHaveAttribute("data-render-state", "ready");
      await expect(ambientCanvas).toHaveAttribute("data-renderer", "canvas2d");
      await expect(ambientCanvas).toHaveAttribute("data-motion-state", "reduced");
      await expect(mobileLearningField).toBeHidden();
      const ambientBudget = await ambientCanvas.evaluate((element) => {
        const canvasElement = element as HTMLCanvasElement;
        return {
          pixels: canvasElement.width * canvasElement.height,
          pixelRatio: Number.parseFloat(canvasElement.dataset.pixelRatio ?? "0"),
        };
      });
      expect(ambientBudget.pixels).toBeLessThanOrEqual(1_510_000);
      expect(ambientBudget.pixelRatio).toBeGreaterThanOrEqual(0.33);
      expect(ambientBudget.pixelRatio).toBeLessThanOrEqual(1.25);
    }

    const productProofIsIntentionallyHidden = viewport.width <= 680;
    if (productProofIsIntentionallyHidden) {
      await expect(stage).toBeHidden();
    } else {
      await expectInsideInitialViewport(page, stage);
      await expectProductProofReadable(page, viewport.width <= 680);
      await expect(canvas).toBeVisible();
      await expect(canvas).toHaveAttribute("aria-hidden", "true");
      await expect(canvas).toHaveAttribute("data-render-state", "ready");
      await expect(canvas).toHaveAttribute("data-renderer", "canvas2d");
      await expect(canvas).toHaveAttribute("data-motion-state", "reduced");
      const canvasBudget = await canvas.evaluate((element) => {
        const canvasElement = element as HTMLCanvasElement;
        return {
          pixels: canvasElement.width * canvasElement.height,
          pixelRatio: Number.parseFloat(canvasElement.dataset.pixelRatio ?? "0"),
        };
      });
      expect(canvasBudget.pixels).toBeLessThanOrEqual(2_310_000);
      expect(canvasBudget.pixelRatio).toBeGreaterThanOrEqual(0.49);
      expect(canvasBudget.pixelRatio).toBeLessThanOrEqual(1.5);
    }

    expect(runtimeErrors).toEqual([]);
  });
}

test("Interactive signal field provides a complete reduced-motion frame", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/INTRO_Interactive/", { waitUntil: "domcontentloaded" });
  await settleRenderedPage(page);

  const canvas = page.locator("canvas.hero-signal-matrix");
  const ambientCanvas = page.locator("canvas.hero-ai-field");
  const mobileLearningField = page.locator("canvas.hero-mobile-learning-field");
  await expect(canvas).toHaveAttribute("data-render-state", "ready");
  await expect(canvas).toHaveAttribute("data-motion-state", "reduced");
  await expect(ambientCanvas).toHaveAttribute("data-render-state", "ready");
  await expect(ambientCanvas).toHaveAttribute("data-renderer", "inactive");
  await expect(ambientCanvas).toHaveAttribute("data-motion-state", "paused");
  await expect(mobileLearningField).toBeVisible();
  await expect(mobileLearningField).toHaveAttribute("data-render-state", "ready");
  await expect(mobileLearningField).toHaveAttribute("data-renderer", "canvas2d");
  await expect(mobileLearningField).toHaveAttribute("data-motion-state", "reduced");
  await expect(page.locator(".hero-signal-stage")).toBeHidden();
  await expect(page.locator(".hero-mobile-product-proof")).toBeHidden();
  await expect(page.locator("h1#hero-title")).toBeVisible();
  await expect(page.locator("#hero-primary-cta")).toBeVisible();
});

test("Interactive Mobile learning signal advances when motion is allowed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/INTRO_Interactive/", { waitUntil: "domcontentloaded" });

  const field = page.locator("canvas.hero-mobile-learning-field");
  await expect(field).toBeVisible();
  await expect(field).toHaveAttribute("data-render-state", "ready");
  await expect(field).toHaveAttribute("data-motion-state", "running");
  const initialFrame = await field.evaluate((element) =>
    Number.parseInt((element as HTMLCanvasElement).dataset.frameCount ?? "0", 10),
  );
  await page.waitForTimeout(360);
  const laterFrame = await field.evaluate((element) =>
    Number.parseInt((element as HTMLCanvasElement).dataset.frameCount ?? "0", 10),
  );
  expect(laterFrame).toBeGreaterThan(initialFrame);
});

test("Interactive Mobile learning signal has a CSS fallback", async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/INTRO_Interactive/", { waitUntil: "domcontentloaded" });

  const field = page.locator("canvas.hero-mobile-learning-field");
  await expect(field).toBeVisible();
  await expect(field).toHaveAttribute("data-render-state", "ready");
  await expect(field).toHaveAttribute("data-renderer", "css");
  await expect(field).toHaveAttribute("data-motion-state", "paused");
});

test("Interactive ambient AI field advances when motion is allowed", async ({ page }) => {
  await page.setViewportSize({ width: 1363, height: 936 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/INTRO_Interactive/", { waitUntil: "domcontentloaded" });

  const ambientCanvas = page.locator("canvas.hero-ai-field");
  await expect(ambientCanvas).toHaveAttribute("data-render-state", "ready");
  await expect(ambientCanvas).toHaveAttribute("data-motion-state", "running");
  const initialFrame = await ambientCanvas.evaluate((element) =>
    Number.parseInt((element as HTMLCanvasElement).dataset.frameCount ?? "0", 10),
  );
  await page.waitForTimeout(360);
  const laterFrame = await ambientCanvas.evaluate((element) =>
    Number.parseInt((element as HTMLCanvasElement).dataset.frameCount ?? "0", 10),
  );
  expect(laterFrame).toBeGreaterThan(initialFrame);
});

test("Interactive signal field has a CSS fallback when Canvas is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const runtimeErrors = collectRuntimeErrors(page);
  await page.goto("/INTRO_Interactive/", { waitUntil: "domcontentloaded" });
  await settleRenderedPage(page);

  const stage = page.locator(".hero-signal-stage");
  const canvas = stage.locator("canvas.hero-signal-matrix");
  const ambientCanvas = page.locator("canvas.hero-ai-field");
  await expect(canvas).toHaveAttribute("data-render-state", "ready");
  await expect(canvas).toHaveAttribute("data-renderer", "css");
  await expect(canvas).toHaveAttribute("data-motion-state", "paused");
  await expect(ambientCanvas).toHaveAttribute("data-render-state", "ready");
  await expect(ambientCanvas).toHaveAttribute("data-renderer", "css");
  await expect(ambientCanvas).toHaveAttribute("data-motion-state", "paused");
  await expectProductProofReadable(page, false);
  await expect(page.locator("h1#hero-title")).toBeVisible();
  await expect(page.locator("#hero-primary-cta")).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});
