import { expect, test } from "./responsive-fixture";

for (const language of ["ja", "en"] as const) {
  test(`Sculptural products: ${language} content, canvas, and responsive CTA`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(language === "ja" ? "/founder/" : "/en/", { waitUntil: "domcontentloaded" });
    const products = page.locator("[data-products-cinematic]");
    await expect(products.locator("article")).toHaveCount(3);
    await expect(products.locator("a")).toHaveCount(5);
    if (language === "en") {
      expect(await products.innerText()).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff]/);
      const labels = await products.locator("[aria-label]").evaluateAll((elements) => elements.map((el) => el.getAttribute("aria-label")).join(" "));
      expect(labels).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff]/);
      await expect(products.getByRole("link", { name: "COMPASS Interactive: Explore Interactive", exact: true })).toHaveAttribute("href", "https://compass-official.pages.dev/INTRO_Interactive/");
    }
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const primary = products.locator('[data-product="interactive"]');
      await primary.scrollIntoViewIfNeeded();
      await expect(primary.locator('[data-scene][data-ready="true"] canvas')).toBeVisible({ timeout: 20_000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const heading = primary.locator("h3");
      expect(await heading.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${language}-${width}.png`) });
    }
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const pause = products.locator("button[aria-pressed]");
    await pause.click();
    await expect(pause).toHaveAttribute("aria-pressed", "true");
    await pause.click();
    await expect(pause).toHaveAttribute("aria-pressed", "false");
    expect(errors).toEqual([]);
  });
}
