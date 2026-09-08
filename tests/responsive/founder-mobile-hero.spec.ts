import { expect, test } from "./responsive-fixture";

test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

test("JP mobile full-bleed portrait, signals and balanced external menu", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/founder/", { waitUntil: "domcontentloaded" });
  const hero = page.locator("#top");
  await expect(hero.locator('svg[class*="mobileHeroSignals"]')).toBeVisible();
  const pause = hero.getByRole("button", { name: "写真の自動切替を一時停止", exact: true });
  await pause.click();
  await expect(hero.locator('[data-paused="true"]')).toBeVisible();
  for (const index of [1, 2, 3]) {
    await hero.getByRole("button", { name: `写真 ${index} を表示`, exact: true }).click();
    const image = hero.locator('figure[data-active="true"] img');
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`portrait-${index}.png`), animations: "disabled" });
  }
  for (const [width, height] of [[320, 568], [375, 667], [390, 844], [430, 932], [640, 900]]) {
    await page.setViewportSize({ width, height });
    const frame = await hero.locator("figure").first().boundingBox();
    expect(frame!.width).toBeGreaterThan(width * 0.85);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const links = hero.getByRole("navigation", { name: "Yuto Matsuiの外部リンク" }).getByRole("link");
    for (const link of await links.all()) {
      const box = await link.boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
    }
    const lines = await hero.locator('p[class*="heroStatement"] > span').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().top));
    expect(lines[1]).toBeGreaterThan(lines[0]);
    await page.getByRole("button", { name: "外部リンクを表示", exact: true }).click();
    const icons = page.locator('[class*="mobileExternalIcons"] > a');
    await expect(icons).toHaveCount(3);
    expect(await icons.allTextContents()).toEqual(["", "", ""]);
    const geometry = await icons.evaluateAll(nodes => nodes.map(node => {
      const box = node.getBoundingClientRect();
      const icon = node.querySelector("svg, img")!.getBoundingClientRect();
      return { width: box.width, height: box.height, offset: Math.abs((icon.left + icon.right - box.left - box.right) / 2) };
    }));
    for (const item of geometry) {
      expect(item.offset).toBeLessThan(1);
      expect(item.height).toBeGreaterThanOrEqual(44);
      expect(Math.abs(item.width - geometry[0].width)).toBeLessThan(1);
    }
    const panel = page.locator('[class*="mobileExternalPopover"]');
    await expect(panel.getByRole("link", { name: "GitHub", exact: true })).toHaveAttribute("href", "https://github.com/genellect");
    await expect(panel.getByRole("link", { name: "EN", exact: true })).toHaveAttribute("href", "https://yuto-matsui.com/en/");
    await page.screenshot({ path: testInfo.outputPath(`menu-${width}.png`), animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(page.getByRole("button", { name: "外部リンクを表示", exact: true })).toBeFocused();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await hero.getByRole("button", { name: "写真 1 を表示", exact: true }).click();
  await hero.getByRole("button", { name: "写真の自動切替を再開", exact: true }).click();
  await expect(hero.getByRole("button", { name: "写真 2 を表示", exact: true })).toHaveAttribute("aria-pressed", "true", { timeout: 6500 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(hero.locator("canvas")).toHaveCount(0);
  await expect(hero.locator('figure[data-active="true"] img')).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(hero.locator('svg[class*="mobileHeroSignals"]')).toBeHidden();
  expect(errors).toEqual([]);
});
