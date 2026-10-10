import { expect, test } from "./responsive-fixture";

for (const language of ["ja", "en"] as const) {
  test(`Sculptural products: ${language} content, canvas, and responsive CTA`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(language === "ja" ? "/founder/" : "/en/", { waitUntil: "domcontentloaded" });
    const products = page.locator("[data-products-cinematic]");
    await expect(products.locator("article:visible")).toHaveCount(3);
    await expect(products.locator("a:visible")).toHaveCount(5);
    if (language === "en") {
      expect(await products.innerText()).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff]/);
      const labels = await products.locator("[aria-label]").evaluateAll((elements) => elements.map((el) => el.getAttribute("aria-label")).join(" "));
      expect(labels).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff]/);
      await expect(products.getByRole("link", { name: "COMPASS Interactive: Explore Interactive", exact: true })).toHaveAttribute("href", "https://compass-official.pages.dev/INTRO_Interactive/");
    }
    for (const [width, height] of [[1440, 900], [1024, 768], [1180, 820], [390, 844], [430, 932], [768, 1024], [1024, 1366], [900, 700], [901, 700], [901, 901], [320, 568]]) {
      await page.setViewportSize({ width, height });
      const visible = products.locator("article:visible");
      await expect(visible).toHaveCount(3);
      expect(await visible.evaluateAll(nodes => nodes.map(n => n.getAttribute("data-product")))).toEqual(["interactive", "cytellect", "platform"]);
      await expect(products.locator('article').filter({ visible: false }).locator('canvas')).toHaveCount(0);
      const replacement = products.locator('[data-product="platform"]');
      await replacement.scrollIntoViewIfNeeded();
      await expect(replacement.locator('[data-ready="true"] canvas')).toBeVisible({ timeout: 20_000 });
      await expect(replacement.getByRole("link")).toHaveAttribute("href", "https://compass-official.pages.dev/");
      const cell = products.locator('[data-product="cytellect"]');
      await expect(cell.getByRole("link")).toHaveAttribute("href", "https://cytellect.vercel.app/");
      await expect(cell.getByRole("link")).toHaveAccessibleName(`cytellect: ${language === "en" ? "Explore cytellect" : "プロダクトLP"}`);
      await expect(cell.locator("canvas")).toHaveCount(0);
      await expect(cell.locator("img")).toBeVisible();
      expect(await cell.locator("h3").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      if (width > 900) {
        const platform = await replacement.boundingBox();
        const cellBounds = await cell.boundingBox();
        expect(platform!.height).toBe(296);
        expect(cellBounds!.height).toBe(320);
        expect(platform!.y).toBeGreaterThan(cellBounds!.y);
        const title = replacement.locator("h3");
        const text = await title.boundingBox();
        expect(text!.x + text!.width).toBeLessThan(platform!.x + platform!.width);
        expect(await title.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        const cta = replacement.getByRole("link");
        await expect(cta).toHaveAccessibleName(`COMPASS: ${language === "en" ? "Explore COMPASS" : "COMPASSを体験する"}`);
        await cell.getByRole("link").focus();
        await page.keyboard.press("Tab");
        await expect(cta).toBeFocused();
      }
      const primary = products.locator('[data-product="interactive"]');
      await primary.scrollIntoViewIfNeeded();
      await expect(primary.locator('[data-scene][data-ready="true"] canvas')).toBeVisible({ timeout: 20_000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const heading = primary.locator("h3");
      expect(await heading.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await products.screenshot({ path: testInfo.outputPath(`${language}-${width}-${height}.png`) });
    }
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1180, height: 820 });
    const platform = products.locator('[data-product="platform"]');
    await platform.scrollIntoViewIfNeeded();
    await expect(platform.locator('[data-ready="true"] canvas')).toBeVisible();
    const frame = await platform.screenshot();
    await page.waitForTimeout(2000);
    expect(Buffer.compare(frame, await platform.screenshot())).not.toBe(0);
    await platform.screenshot({ path: testInfo.outputPath(`${language}-motion-quarter.png`) });
    await page.waitForTimeout(6000);
    const pause = products.locator("button[aria-pressed]");
    await pause.click();
    await expect(pause).toHaveAttribute("aria-pressed", "true");
    await platform.scrollIntoViewIfNeeded();
    // Compare the rendered scene, not the card's hover/focus CTA transition.
    await page.waitForTimeout(650);
    const still = await platform.locator("canvas").screenshot();
    await page.waitForTimeout(200);
    expect(Buffer.compare(still, await platform.locator("canvas").screenshot())).toBe(0);
    await pause.click();
    await expect(pause).toHaveAttribute("aria-pressed", "false");
    expect(errors).toEqual([]);
  });
}

test("Platform remains a working link without WebGL", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, name: string, ...args: unknown[]) {
      if (name.startsWith("webgl") || name === "experimental-webgl") return null;
      return Reflect.apply(original, this, [name, ...args]);
    } as typeof original;
  });
  await page.goto("/en/", { waitUntil: "domcontentloaded" });
  const platform = page.locator('[data-product="platform"]');
  await platform.scrollIntoViewIfNeeded();
  await expect(platform.locator("svg[class*='platformFallback']")).toBeVisible();
  await expect(platform.getByRole("link", { name: "COMPASS: Explore COMPASS" })).toHaveAttribute("href", "https://compass-official.pages.dev/");
  const cell = page.locator('[data-product="cytellect"]');
  await cell.scrollIntoViewIfNeeded();
  await expect(cell.locator("img")).toBeVisible();
  await expect(cell.locator("img")).toHaveCSS("opacity", "1");
  await expect.poll(() => cell.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(cell.getByRole("link")).toHaveAttribute("href", "https://cytellect.vercel.app/");
});

test("Cell is present before JavaScript initializes", async ({ browser }, testInfo) => {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
    try {
      const page = await context.newPage();
      await page.goto(`${testInfo.project.use.baseURL}/${mobile ? "en" : "founder"}/`, { waitUntil: "domcontentloaded" });
      const cell = page.locator('[data-product="cytellect"]');
      await cell.scrollIntoViewIfNeeded();
      await expect(cell.locator("img")).toHaveCSS("opacity", "1");
      await expect.poll(() => cell.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
      await expect(cell.locator("canvas")).toHaveCount(0);
      await expect(cell.getByRole("link")).toHaveAttribute("href", "https://cytellect.vercel.app/");
    } finally { await context.close(); }
  }
});

for (const mobile of [false, true]) {
  test(`Cell motion and lifecycle: ${mobile ? "touch mobile" : "desktop"}`, async ({ browser }, testInfo) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: "no-preference" });
    const origin = new URL(String(testInfo.project.use.baseURL)).origin;
    await context.route("**/*", route => {
      const request = route.request();
      if (new URL(request.url()).origin !== origin || !["GET", "HEAD"].includes(request.method())) return route.fulfill({ status: 204, body: "" });
      return route.continue();
    });
    const page = await context.newPage();
    try {
      await page.goto(`${testInfo.project.use.baseURL}/founder/`, { waitUntil: "domcontentloaded" });
      const products = page.locator("[data-products-cinematic]");
      const cell = products.locator('[data-scene="cytellect"]');
      await cell.scrollIntoViewIfNeeded();
      await expect(cell).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
      const frames = () => cell.getAttribute("data-render-count").then(Number);
      const before = await frames();
      await expect.poll(frames).toBeGreaterThan(before);
      await cell.locator("..").screenshot({ path: testInfo.outputPath(`cell-${mobile ? "mobile" : "desktop"}-motion.png`) });
      const pause = products.locator("button[aria-pressed]");
      await pause.click();
      await cell.scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      const stopped = await frames();
      await page.waitForTimeout(250);
      expect(await frames()).toBe(stopped);
      await pause.click();
      await cell.scrollIntoViewIfNeeded();
      await expect.poll(frames).toBeGreaterThan(stopped);
      await page.setViewportSize({ width: mobile ? 844 : 1024, height: mobile ? 390 : 1366 });
      await expect(cell.locator("canvas")).toHaveCount(1);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(cell.locator("canvas")).toHaveCount(0);
      await expect(cell.locator("img")).toHaveCSS("opacity", "1");
    } finally { await context.close(); }
  });
}
