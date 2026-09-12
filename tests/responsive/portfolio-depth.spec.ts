import { expect, test } from "./responsive-fixture";

for (const language of ["ja", "en"] as const) {
  const path = language === "ja" ? "/founder/" : "/en/";
  const enlarge = language === "ja" ? "写真を拡大：DRIVE" : "Enlarge photo: DRIVE";
  const close = language === "ja" ? "写真を閉じる" : "Close photo";

  test(`${language}: depth follows the pointer, settles, and respects the desktop boundary`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    for (const id of ["expertise", "experience", "off-hours"]) {
      const section = page.locator(`#${id}`);
      const card = section.locator("article").first();
      await card.scrollIntoViewIfNeeded();
      const content = await card.innerText();
      await expect(card).toHaveAttribute("data-depth-enabled", "true");
      // Use the image, keeping the pointer clear of the navigation and long EN copy.
      const image = card.locator("img");
      const box = (await image.boundingBox())!;
      await page.mouse.move(box.x + box.width * .8, box.y + Math.min(60, box.height * .25));
      await expect(card).toHaveAttribute("data-depth-active", "true");
      expect(await card.evaluate(el => { const m = new DOMMatrix(getComputedStyle(el).transform); return [m.b, m.c, m.m13, m.m23]; })).toEqual([0, 0, 0, 0]);
      const plane = card.locator('[data-depth-face="right"]');
      await expect.poll(() => plane.evaluate(el => getComputedStyle(el).transform)).toMatch(/^matrix3d/);
      if (id === "off-hours") {
        // A tilted photo must stay in front of the parent article's hit plane.
        await expect.poll(() => image.evaluate(img => {
          const box = img.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return Boolean(img.parentElement?.querySelector("button")?.contains(hit));
        })).toBe(true);
      }
      expect(await card.innerText()).toBe(content);
      await expect(section.locator("canvas")).toHaveCount(0);
      await page.mouse.move(1, 100);
      await expect(card).not.toHaveAttribute("data-depth-moving", "true");
      await expect(card.locator("[data-depth-face]")).toHaveCount(5);
      await expect(card).toHaveCSS("transform", "none");
      await expect.poll(() => plane.evaluate(el => getComputedStyle(el).transform)).toMatch(/^matrix3d/);
    }
    await page.setViewportSize({ width: 900, height: 900 });
    await expect(page.getByRole("button", { name: enlarge, exact: true })).toHaveCount(0);
    await expect(page.locator('[data-depth-enabled="true"]')).toHaveCount(0);
    await page.setViewportSize({ width: 901, height: 900 });
    await expect(page.getByRole("button", { name: enlarge, exact: true })).toBeAttached();
    await expect(page.locator('[data-depth-enabled="true"]')).toHaveCount(9);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });

  test(`${language}: photo expands without changing copy or assets and returns focus`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    const section = page.locator("#off-hours");
    const trigger = page.getByRole("button", { name: enlarge, exact: true });
    await expect(trigger).toBeVisible();
    const card = section.locator("article").first();
    const src = await card.locator("img").getAttribute("src");
    const copy = await card.locator("p").innerText();
    const bounds = (await section.boundingBox())!;
    await trigger.focus();
    await page.keyboard.press("Enter");
    const modal = page.getByRole("dialog", { name: "DRIVE", exact: true });
    await expect(modal).toBeVisible();
    const lockedScroll = await page.evaluate(() => window.scrollY);
    await expect(modal.getByRole("button", { name: close })).toBeFocused();
    await expect(modal).toHaveAttribute("data-traveling", "false");
    expect(await page.evaluate(() => window.scrollY)).toBe(lockedScroll);
    const expanded = modal.locator("figure img");
    await expect(expanded).toHaveAttribute("src", src!);
    expect(await modal.locator("figcaption p").innerText()).toBe(copy);
    await expect(modal.locator("figcaption p")).toHaveCSS("color", language === "ja" ? "rgb(51, 75, 91)" : "rgb(77, 73, 86)");
    const dimensions = await expanded.evaluate(img => ({ rendered: img.getBoundingClientRect().toJSON(), width: (img as HTMLImageElement).naturalWidth, height: (img as HTMLImageElement).naturalHeight }));
    expect(dimensions.rendered.width / dimensions.rendered.height).toBeCloseTo(dimensions.width / dimensions.height, 2);
    expect(dimensions.rendered.width).toBeLessThanOrEqual(dimensions.width);
    expect(dimensions.rendered.height).toBeLessThanOrEqual(dimensions.height);
    await page.keyboard.press("Tab");
    await expect(modal.getByRole("button", { name: close })).toBeFocused();
    await page.screenshot({ path: info.outputPath(`${language}-photo-open.png`) });
    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect((await section.boundingBox())!.height).toBeCloseTo(bounds.height, 1);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    // A resize during flight must clean up the dialog, scroll lock and obsolete trigger.
    await trigger.click();
    await expect(modal).toBeVisible();
    await page.setViewportSize({ width: 900, height: 900 });
    await expect(modal).toHaveCount(0);
    await expect(trigger).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  });

  test(`${language}: reduced motion keeps photo viewing usable and stops all card depth`, async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(path);
    await expect(page.locator('[data-depth-enabled="true"]')).toHaveCount(0);
    const trigger = page.getByRole("button", { name: enlarge, exact: true });
    await trigger.click();
    const modal = page.getByRole("dialog", { name: "DRIVE", exact: true });
    await expect(modal).toBeVisible();
    expect(await modal.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
    await modal.getByRole("button", { name: close }).click();
    await expect(modal).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test(`${language}: closing during the opening animation is reversible`, async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(path);
    const trigger = page.getByRole("button", { name: enlarge, exact: true });
    // Reach the section instantly; hash navigation's page-wide smooth scroll
    // is independent of this mid-animation close/reopen contract.
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(page.getByRole("dialog")).toHaveAttribute("data-traveling", "false");
    await page.mouse.click(10, 100);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test(`${language}: a click made before the photo finishes loading opens after decode`, async ({ page }) => {
    let release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/off-hours-drive.webp", async route => { await ready; await route.continue(); });
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const trigger = page.getByRole("button", { name: enlarge, exact: true });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    release();
    await expect(page.getByRole("dialog", { name: "DRIVE", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test.describe(`${language}: without JavaScript`, () => {
    test.use({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
    test("original content remains readable", async ({ page }) => {
      await page.goto(path);
      for (const id of ["expertise", "experience", "off-hours"]) {
        const cards = page.locator(`#${id} article`).filter({ has: page.locator("img") });
        await expect(cards).toHaveCount(3);
        await expect(cards.first().locator("img")).toBeVisible();
      }
      await expect(page.getByRole("button", { name: enlarge, exact: true })).toHaveCount(0);
    });
  });
}

test.describe("coarse-pointer desktop", () => {
  test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 2, viewport: { width: 1194, height: 834 } });
  test("keeps photo viewing but does not animate cards", async ({ page }) => {
    await page.goto("/en/");
    await expect(page.locator('[data-depth-enabled="true"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Enlarge photo: DRIVE" }).tap();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Close photo", exact: true }).tap();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

for (const language of ["ja", "en"]) {
  test.describe(language + ": mobile solid cards", () => {
    test.use({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });
    test("touch keeps the reading plane horizontal and returns to rest", async ({ page }) => {
      await page.goto(language === "ja" ? "/founder/" : "/en/");
      for (const id of ["expertise", "experience", "off-hours"]) {
        const card = page.locator("#" + id + " [data-depth-card]").first();
        await card.scrollIntoViewIfNeeded();
        const box = (await card.locator("img").boundingBox())!;
        await page.touchscreen.tap(box.x + box.width * .5, box.y + Math.min(60, box.height * .25));
        expect(await card.evaluate(el => { const m = new DOMMatrix(getComputedStyle(el).transform); return [m.b, m.c, m.m13, m.m23]; })).toEqual([0, 0, 0, 0]);
        await expect(card).not.toHaveAttribute("data-depth-moving", "true");
        await expect(card).toHaveCSS("transform", "none");
        await expect(card.locator("[data-depth-face]")).toHaveCount(5);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  });
}
