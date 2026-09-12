import { expect, test } from "./responsive-fixture";

const engine = process.env.PORTFOLIO_WEBKIT === "1" ? "webkit" : "chromium";

test.use({ browserName: engine });

for (const language of ["ja", "en"] as const) {
  for (const mobile of [false, true]) {
    test.describe(`${language}: static cards / ${mobile ? `Mobile ${engine}` : `Desktop ${engine}`}`, () => {
      test.use({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
        isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1,
      });
      test("photos and copy render before touch; cards remain still on interaction", async ({ page }, info) => {
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(language === "ja" ? "/founder/" : "/en/");
        await page.evaluate(() => document.fonts.ready);
        // Photos start before scrolling or touching a card.
        await expect.poll(() => page.locator("[data-depth-card] img").evaluateAll(images => images.every(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
        for (const id of ["expertise", "experience", "off-hours"]) {
          const cards = page.locator(`#${id} [data-depth-card]`);
          await expect(cards).toHaveCount(3);
          await expect(cards.locator("[data-depth-geometry]")).toHaveCount(3);
          for (const card of await cards.all()) {
            await card.scrollIntoViewIfNeeded();
            const photo = card.locator("[data-depth-visual] img");
            await expect.poll(() => photo.evaluate(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)).toBe(true);
            await expect(card).toHaveCSS("perspective", "none");
            await expect(card).toHaveCSS("transform-style", "flat");
            await expect(card.locator("p").first()).toBeVisible();
          }
          const card = cards.first();
          await card.scrollIntoViewIfNeeded();
          // Capture the untouched reading surface, including text (not just download state).
          await card.screenshot({ path: info.outputPath(`${language}-${mobile ? "mobile" : "desktop"}-${id}-untouched.png`) });
          const before = await card.evaluate(el => ({width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height}));
          const box = (await card.locator("[data-depth-visual] img").boundingBox())!;
          const x = box.x + box.width * .5;
          const y = box.y + Math.min(60, box.height * .25);
          if (mobile) await page.touchscreen.tap(x, y);
          else await page.mouse.move(x, y);
          await expect(card).toHaveCSS("transform", "none");
          await expect(card.locator("[data-depth-visual] img")).toHaveCSS("transform", "none");
          expect(await card.evaluate(el => ({width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height}))).toEqual(before);
          await expect(card.locator("button")).toHaveCount(0);
        }
        await expect(page.getByRole("dialog")).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(errors).toEqual([]);
      });
    });
  }
}
