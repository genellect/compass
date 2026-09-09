import { expect, test } from "./responsive-fixture";

test("JP film is landscape-only and Original retains every photo and control", async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && /THREE|shader|WebGLProgram/.test(m.text())) errors.push(m.text()); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/founder/#fragments", { waitUntil: "domcontentloaded" });
  const film = page.locator("[data-fragment-film]");
  const toggle = page.getByRole("group", { name: "FRAGMENTSの表示形式", exact: true });
  const original = page.locator("#fragment-original-view");
  await film.scrollIntoViewIfNeeded();
  await expect(film).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  const originals = await original.locator("img").evaluateAll(imgs => imgs.map(img => img.getAttribute("src")));
  expect(originals).toHaveLength(19);
  expect(await film.locator("img").evaluateAll(imgs => imgs.map(img => img.getAttribute("src")))).toEqual(originals);
  const canvas = film.locator("canvas");
  const before = await canvas.screenshot();
  await film.getByRole("button", { name: "次の写真", exact: true }).click();
  expect(Buffer.compare(before, await canvas.screenshot())).not.toBe(0);
  const still = await canvas.screenshot();
  await page.waitForTimeout(300);
  expect(Buffer.compare(still, await canvas.screenshot())).toBe(0);
  await page.locator("#fragments").screenshot({ path: info.outputPath("film-desktop.png") });
  await toggle.getByRole("button", { name: "Original", exact: true }).click();
  await expect(original).toBeVisible();
  await expect(film.locator("canvas")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /写真セット \d を表示/ })).toHaveCount(4);
  await page.getByRole("button", { name: "写真セット 3 を表示" }).click();
  await expect(original.locator('[data-spread="3"]')).toHaveAttribute("data-active", "true");
  await page.locator("#fragments").screenshot({ path: info.outputPath("original-desktop.png") });
  await toggle.getByRole("button", { name: "3D", exact: true }).click();
  for (const [width, height] of [[1180,820],[1024,768],[901,700],[900,700],[390,844],[430,932],[768,1024],[1024,1366],[901,901]]) {
    await page.setViewportSize({ width, height });
    const wide = width >= 901 && width > height;
    if (wide) {
      await expect(toggle).toBeVisible();
      await film.scrollIntoViewIfNeeded();
      await expect(film).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
      await expect(canvas).toHaveCount(1);
      if (width === 1180) await page.locator("#fragments").screenshot({ path: info.outputPath("film-ipad-landscape.png") });
    } else {
      await expect(toggle).toBeHidden();
      await expect(film).toBeHidden();
      await expect(canvas).toHaveCount(0);
      await expect(width <= 900 ? page.getByLabel("FRAGMENTS photo reel", { exact: true }) : original).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-fragment-film]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Film auto motion, pause, manual drag and wheel coexist with page scrolling", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto("/founder/#fragments", { waitUntil: "domcontentloaded" });
  const film = page.locator("[data-fragment-film]");
  await film.scrollIntoViewIfNeeded();
  await expect(film).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  const canvas = film.locator("canvas");
  const first = await canvas.screenshot();
  await page.waitForTimeout(500);
  expect(Buffer.compare(first, await canvas.screenshot())).not.toBe(0);
  await film.getByRole("button", { name: "写真フィルムの自動送りを一時停止", exact: true }).click();
  await page.waitForTimeout(1000);
  const paused = await canvas.screenshot();
  await page.waitForTimeout(300);
  expect(Buffer.compare(paused, await canvas.screenshot())).toBe(0);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * .6, box.y + box.height * .5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .3, box.y + box.height * .5, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  const dragged = await canvas.screenshot();
  expect(Buffer.compare(paused, dragged)).not.toBe(0);
  await page.mouse.wheel(160, 0);
  await page.waitForTimeout(600);
  expect(Buffer.compare(dragged, await canvas.screenshot())).not.toBe(0);
  const scrollY = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollY);
  await film.getByRole("button", { name: "写真フィルムの自動送りを再開", exact: true }).click();
  await expect(film.getByRole("button", { name: "写真フィルムの自動送りを一時停止", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("Without WebGL the same 19 photos remain horizontally scrollable", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, name: string, ...args: unknown[]) {
      if (name.startsWith("webgl") || name === "experimental-webgl") return null;
      return Reflect.apply(original, this, [name, ...args]);
    } as typeof original;
  });
  await page.goto("/founder/#fragments", { waitUntil: "domcontentloaded" });
  const fallback = page.getByLabel("FRAGMENTSの写真一覧", { exact: true });
  await fallback.scrollIntoViewIfNeeded();
  await expect(fallback.locator("img")).toHaveCount(19);
  await expect(fallback).toHaveAttribute("tabindex", "0");
  expect(await fallback.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  await fallback.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => fallback.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  await expect(page.locator("[data-fragment-film] canvas")).toHaveCount(0);
});
