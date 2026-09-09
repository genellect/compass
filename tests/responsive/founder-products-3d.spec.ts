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
      const wide = width >= 901 && width > height;
      const visible = products.locator("article:visible");
      await expect(visible).toHaveCount(3);
      expect(await visible.evaluateAll(nodes => nodes.map(n => n.getAttribute("data-product")))).toEqual(wide ? ["interactive", "platform", "library"] : ["interactive", "library", "manifesto"]);
      await expect(products.locator('article').filter({ visible: false }).locator('canvas')).toHaveCount(0);
      const replacement = products.locator(wide ? '[data-product="platform"]' : '[data-product="manifesto"]');
      await replacement.scrollIntoViewIfNeeded();
      await expect(replacement.locator('[data-ready="true"] canvas')).toBeVisible({ timeout: 20_000 });
      await expect(replacement.getByRole("link")).toHaveAttribute("href", wide ? "https://compass-official.pages.dev/" : "https://compass-official.pages.dev/messages/");
      if (wide) {
        const platform = await replacement.boundingBox();
        const library = await products.locator('[data-layout="wide"][data-product="library"]').boundingBox();
        expect(platform!.height).toBe(320);
        expect(library!.height).toBe(296);
        expect(library!.y).toBeGreaterThan(platform!.y);
        const title = replacement.locator("h3");
        const text = await title.boundingBox();
        expect(text!.x + text!.width).toBeLessThan(platform!.x + platform!.width);
        expect(await title.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        const cta = replacement.getByRole("link");
        await expect(cta).toHaveAccessibleName(`COMPASS Platform: ${language === "en" ? "Explore COMPASS" : "COMPASSを体験する"}`);
        await cta.focus();
        await page.keyboard.press("Tab");
        await expect(products.locator('[data-layout="wide"][data-product="library"] a')).toBeFocused();
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
    await page.waitForTimeout(100);
    const still = await platform.screenshot();
    await page.waitForTimeout(200);
    expect(Buffer.compare(still, await platform.screenshot())).toBe(0);
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
  await expect(platform.getByRole("link", { name: "COMPASS Platform: Explore COMPASS" })).toHaveAttribute("href", "https://compass-official.pages.dev/");
});
