import { expect, test } from "./responsive-fixture";
import { collectRuntimeErrors, settleRenderedPage } from "./layout-audit";
import path from "node:path";

// The full Chromium browser uses the Windows GPU. The default headless shell
// uses SwiftShader here and does not represent the shipped Desktop renderer.
test.use({ channel: "chromium" });

const route = "/INTRO_Interactive/";
const viewports = [
  { width: 320, height: 568 }, { width: 390, height: 844 },
  { width: 680, height: 844 }, { width: 681, height: 844 },
  { width: 768, height: 1024 }, { width: 820, height: 1180 },
  { width: 1024, height: 1366 }, { width: 1024, height: 768 },
  { width: 1275, height: 553 }, { width: 1440, height: 900 },
  { width: 3840, height: 2160 },
];
for (const viewport of viewports) {
  test(`Interactive future hall layout ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const errors = collectRuntimeErrors(page);
    const models: string[] = [];
    page.on("request", request => { if (/lecture-hall\.glb|futureHallScene/.test(request.url())) models.push(request.url()); });
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect((await page.goto(route))?.status()).toBe(200);
    await settleRenderedPage(page);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("#hero-title")).toHaveAccessibleName("LET EVERYTHING MOVE.");
    await expect(page.locator("#hero-primary-cta")).toHaveAttribute("href", "https://compass-interactive.pages.dev/demo");
    await expect(page.locator(".hero-secondary-cta")).toHaveAttribute("href", "https://compass-interactive.pages.dev/join");
    await expect(page.locator(".hero-product-experience")).toHaveCount(0);
    for (const selector of ["#hero-title", ".hero-lead", "#hero-primary-cta"]) {
      const element = page.locator(selector);
      await expect(element).toBeVisible();
      const box = (await element.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    }
    expect(await page.locator("#hero-primary-cta").evaluate(element => {
      const box = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    if (viewport.width <= 680) {
      await expect(page.locator(".future-hall")).toBeHidden();
      const mobile = page.locator(".hero-mobile-learning-field");
      await expect(mobile).toBeVisible();
      await expect(mobile).toHaveAttribute("data-renderer", "canvas2d");
      await expect(mobile).toHaveAttribute("data-motion-state", "reduced");
      expect(await mobile.evaluate(node => (node as HTMLCanvasElement).width * (node as HTMLCanvasElement).height)).toBeLessThanOrEqual(710_000);
    } else {
      await expect(page.locator(".future-hall__poster")).toBeVisible();
      expect(await page.locator(".future-hall__poster").evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(1000);
      await expect(page.locator(".future-hall__canvas")).toHaveCount(0);
    }
    expect(models).toEqual([]);
    expect(errors).toEqual([]);
    if (viewport.width >= 681 && viewport.width <= 1199 && viewport.height > viewport.width) {
      const title = (await page.locator('#hero-title').boundingBox())!;
      const scene = (await page.locator('.future-hall__scene').boundingBox())!;
      expect(title.y).toBeLessThan(viewport.height * .25);
      expect(title.height).toBeGreaterThan(100);
      expect(scene.y).toBeGreaterThan(viewport.height * .3);
      expect(scene.y).toBeLessThan(viewport.height * .4);
    }
    if (process.env.HERO_EVIDENCE_DIR && [390, 768, 1440].includes(viewport.width)) {
      await page.screenshot({ path: path.join(process.env.HERO_EVIDENCE_DIR, `future-hall-${viewport.width}.png`) });
    }
  });
}
test("Desktop scene animates, pauses, and suspends offscreen", async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(route);
  const scene = page.locator(".future-hall__scene");
  await expect(scene).toHaveAttribute("data-render-state", "ready", { timeout: 30_000 });
  await expect(scene).toHaveAttribute("data-motion-state", "running");
  const frame = async () => Number(await scene.getAttribute("data-frame-count"));
  const first = await frame();
  await expect.poll(frame).toBeGreaterThan(first);
  expect(Number(await scene.getAttribute("data-render-pixels"))).toBeLessThanOrEqual(2_305_000);
  await expect.poll(() => page.locator(".future-hall__canvas").evaluate(node => getComputedStyle(node).opacity)).toBe("1");
  if (process.env.HERO_EVIDENCE_DIR) {
    await page.screenshot({ path: path.join(process.env.HERO_EVIDENCE_DIR, "future-hall-desktop.png") });
  }
  for (const [width, height] of [[768, 1024], [1024, 1366]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => scene.evaluate(node => Math.round(node.getBoundingClientRect().top))).toBe(Math.round(height * .34));
    const beforeResize = await frame();
    await expect.poll(frame).toBeGreaterThan(beforeResize);
    if (process.env.HERO_EVIDENCE_DIR) await page.screenshot({ path: path.join(process.env.HERO_EVIDENCE_DIR, `future-hall-ipad-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => scene.evaluate(node => node.getBoundingClientRect().top)).toBe(0);
  await page.getByRole("button", { name: "背景を停止" }).click();
  await expect(scene).toHaveAttribute("data-motion-state", "paused");
  const stopped = await frame();
  await page.waitForTimeout(250);
  expect(await frame()).toBe(stopped);
  await page.getByRole("button", { name: "背景を再生" }).click();
  await expect.poll(frame).toBeGreaterThan(stopped);
  await page.locator("footer.site-footer").scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute("data-motion-state", "paused");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(scene).toHaveAttribute("data-motion-state", "running");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(scene).toHaveAttribute("data-motion-state", "paused");
  const hiddenFrame = await frame();
  await page.waitForTimeout(250);
  expect(await frame()).toBe(hiddenFrame);
  await page.evaluate(() => {
    delete (document as unknown as { visibilityState?: string }).visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(scene).toHaveAttribute("data-motion-state", "running");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".future-hall__canvas")).toHaveCount(0);
  await expect(scene).toHaveAttribute("data-render-state", "poster");
  expect(errors).toEqual([]);
});
test("Mobile avoids 3D downloads and 680/681 resize creates then releases the scene", async ({ page }) => {
  const assets: string[] = [];
  page.on("request", request => { if (/future-hall\/|futureHallScene/.test(request.url())) assets.push(request.url()); });
  await page.setViewportSize({ width: 680, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(route);
  const mobile = page.locator(".hero-mobile-learning-field");
  await expect(mobile).toHaveAttribute("data-motion-state", "running");
  const initial = Number(await mobile.getAttribute("data-frame-count"));
  await expect.poll(async () => Number(await mobile.getAttribute("data-frame-count"))).toBeGreaterThan(initial);
  expect(assets).toEqual([]);
  await page.setViewportSize({ width: 681, height: 844 });
  await expect(page.locator(".future-hall__scene")).toHaveAttribute("data-render-state", "ready", { timeout: 30_000 });
  await page.setViewportSize({ width: 680, height: 844 });
  await expect(page.locator(".future-hall__canvas")).toHaveCount(0);
  await expect(mobile).toHaveAttribute("data-motion-state", "running");
});
for (const asset of ["lecture-hall.glb", "room-light.hdr", "sky.hdr"]) {
test(`Asset failure (${asset}) preserves poster and CTA`, async ({ page }) => {
  await page.route(`**/${asset}`, request => request.fulfill({ status: 503, body: "" }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(route);
  await expect(page.locator(".future-hall__scene")).toHaveAttribute("data-render-state", "fallback");
  await expect(page.locator(".future-hall__poster")).toBeVisible();
  await expect(page.locator(".future-hall__canvas")).toHaveCount(0);
  await expect(page.locator("#hero-primary-cta")).toBeVisible();
});
}

test("WebGL context loss returns to the poster", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(route);
  await expect(page.locator(".future-hall__scene")).toHaveAttribute("data-render-state", "ready", { timeout: 30_000 });
  await page.locator(".future-hall__canvas").evaluate(node => {
    const context = (node as HTMLCanvasElement).getContext("webgl2");
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  });
  await expect(page.locator(".future-hall__scene")).toHaveAttribute("data-render-state", "fallback");
  await expect(page.locator(".future-hall__canvas")).toHaveCount(0);
  await expect(page.locator(".future-hall__poster")).toBeVisible();
  await expect(page.locator("#hero-primary-cta")).toBeVisible();
});
test("WebGL unavailable preserves poster and title", async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof getContext>) {
      if (String(args[0]).includes("webgl")) return null;
      return getContext.apply(this, args);
    } as typeof getContext;
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(route);
  await expect(page.locator(".future-hall__scene")).toHaveAttribute("data-render-state", "fallback");
  await expect(page.locator("#hero-title")).toBeVisible();
  await expect(page.locator(".future-hall__poster")).toBeVisible();
});
test("Mobile retains CSS fallback without Canvas2D", async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(route);
  await expect(page.locator(".hero-mobile-learning-field")).toHaveAttribute("data-renderer", "css");
  await expect(page.locator("#hero-primary-cta")).toBeVisible();
});

test("Interactive Mobile learning signal advances at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(route);
  const field = page.locator("canvas.hero-mobile-learning-field");
  await expect(field).toBeVisible();
  await expect(field).toHaveAttribute("data-render-state", "ready");
  await expect(field).toHaveAttribute("data-motion-state", "running");
  const initial = Number(await field.getAttribute("data-frame-count"));
  await expect.poll(async () => Number(await field.getAttribute("data-frame-count"))).toBeGreaterThan(initial);
});
