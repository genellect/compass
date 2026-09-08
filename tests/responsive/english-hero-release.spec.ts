import { expect, test } from "./responsive-fixture";

test("EN Convergence Hero: photos, responsive layout, controls and retained work", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/en/", { waitUntil: "domcontentloaded" });
  const hero = page.locator("[data-hero-interface]");
  await expect(hero).toBeVisible();
  await expect(page.locator("[data-products-cinematic] article")).toHaveCount(3);
  const order = await page.locator("main > section[id]").evaluateAll(nodes => nodes.map(n => n.id));
  expect(order.indexOf("experience")).toBeLessThan(order.indexOf("statement"));
  expect(order.indexOf("statement")).toBeLessThan(order.indexOf("work"));
  for (const [width, height] of [[1440, 900], [1024, 768], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    for (const index of [1, 2, 3]) {
      await hero.getByRole("button", { name: `Show portrait ${index}`, exact: true }).click();
      const image = hero.locator('figure[data-active="true"] img');
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      const bounds = await image.boundingBox();
      expect(bounds!.height).toBeGreaterThan(height * 0.6);
      expect(bounds!.width).toBeGreaterThan(width * 0.48);
      const overflow = await hero.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return Array.from(el.querySelectorAll("h1, p, button")).some(node => {
          const box = node.getBoundingClientRect();
          return box.width > 0 && (box.right > rect.right + 1 || box.left < rect.left - 1 || node.scrollWidth > node.clientWidth + 1);
        });
      });
      expect(overflow).toBe(false);
      await page.screenshot({ path: testInfo.outputPath(`hero-${width}-${index}.png`) });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await hero.getByRole("region").focus();
  await page.keyboard.press("ArrowRight");
  await expect(hero.getByRole("button", { name: "Show portrait 1", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const pause = hero.getByRole("button", { name: "Pause automatic portrait changes" });
  await pause.click();
  await expect(hero).toHaveAttribute("data-hero-paused", "true");
  await hero.getByRole("button", { name: "Resume automatic portrait changes" }).click();
  await expect(hero).toHaveAttribute("data-hero-paused", "false");
  await expect(hero.locator('[data-transitioning="true"]')).toBeVisible({ timeout: 9_000 });
  await expect(hero.getByRole("button", { name: "Show portrait 2", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});
