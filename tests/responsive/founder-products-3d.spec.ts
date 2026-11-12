import { expect, test } from "./responsive-fixture";

for (const language of ["ja", "en"] as const) {
  test(`Equal product cards: ${language} 2×2 layout, imagery, links, recognition and reading order`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(language === "ja" ? "/founder/" : "/en/");
    const products = page.locator("[data-products-cinematic]");
    const cards = products.locator("article");
    await expect(cards).toHaveCount(4);
    expect(await cards.evaluateAll(nodes => nodes.map(n => n.getAttribute("data-product")))).toEqual(["cytellect", "topos", "interactive", "platform"]);
    await expect(products.locator("a")).toHaveCount(4);
    await expect(cards.nth(0).getByRole("link")).toHaveAttribute("href", "https://cytellect.vercel.app/");
    await expect(cards.nth(1).getByRole("link")).toHaveAttribute("href", "https://web--devfest2026-t167.asia-east1.hosted.app/lp");
    await expect(cards.nth(1).getByRole("link")).toHaveAttribute("target", "_blank");
    await expect(cards.nth(2).getByRole("link")).toHaveAttribute("href", "https://compass-official.pages.dev/INTRO_Interactive/");
    await expect(cards.nth(3).getByRole("link")).toHaveAttribute("href", "https://compass-official.pages.dev/");
    await expect(cards.nth(2).getByRole("navigation")).toHaveCount(0);
    await expect(products.locator("h3")).toHaveCount(4);
    if (language === "ja") {
      await expect(cards.nth(0).locator("li")).toHaveText(["北里大学ChatGPTハッカソン2026準優勝", "東京AIハッカソン2026本選進出", "技育展2026決勝進出"]);
      await expect(cards.nth(1).locator("li")).toHaveText(["チーム「Triple Helix」Project Manager", "DevFest GDGoC Hackathon 2026出展", "Gemini 3.5 Flash / sherpa-onnx技術"]);
    } else {
      expect(await products.innerText()).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff]/);
      await expect(cards.nth(1).locator("li")).toHaveText(["DevFest GDGoC Hackathon 2026Exhibited Project", "Team Triple HelixProject Manager"]);
    }
    for (const [width, height] of [[1440, 900], [1180, 820], [1024, 1366], [1001, 900], [1000, 900], [768, 1024], [390, 844], [320, 568]]) {
      await page.setViewportSize({ width, height });
      await products.scrollIntoViewIfNeeded();
      const stages = await cards.evaluateAll(nodes => nodes.map(node => {
        const r = node.firstElementChild!.getBoundingClientRect();
        const m = node.firstElementChild!.firstElementChild!.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, mediaHeight: m.height };
      }));
      // Every card keeps the production frame: same width and the same media size.
      expect(Math.max(...stages.map(s => s.width)) - Math.min(...stages.map(s => s.width))).toBeLessThan(1);
      expect(Math.max(...stages.map(s => s.mediaHeight)) - Math.min(...stages.map(s => s.mediaHeight))).toBeLessThan(1);
      if (width > 1000) {
        // 2×2: cards in a row share one height and their destinations align.
        expect(stages[0].y).toBe(stages[1].y);
        expect(stages[2].y).toBe(stages[3].y);
        expect(stages[1].y).toBeLessThan(stages[2].y);
        expect(stages[0].x).toBeLessThan(stages[1].x);
        expect(stages[2].x).toBe(stages[0].x);
        expect(Math.abs(stages[0].height - stages[1].height)).toBeLessThan(1);
        expect(Math.abs(stages[2].height - stages[3].height)).toBeLessThan(1);
        // The lead cards' recognition blocks share one height and bottom edge.
        const ledgers = await cards.evaluateAll(nodes => nodes.slice(0, 2).map(node => { const r = node.querySelector("ul")?.getBoundingClientRect(); return r ? { height: r.height, bottom: r.bottom } : null; }));
        if (ledgers[0] && ledgers[1]) {
          expect(Math.abs(ledgers[0].height - ledgers[1].height)).toBeLessThan(1);
          expect(Math.abs(ledgers[0].bottom - ledgers[1].bottom)).toBeLessThan(1);
        }
      } else {
        for (let i = 1; i < 4; i++) expect(stages[i - 1].y).toBeLessThan(stages[i].y);
      }
      for (const [index, naturalWidth] of [[0, 1920], [1, 1280], [3, 1920]] as const) {
        const image = cards.nth(index).locator("img");
        await image.scrollIntoViewIfNeeded();
        await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(naturalWidth);
        await expect(cards.nth(index).locator("canvas, video")).toHaveCount(0);
      }
      // Visible card titles must not overflow, including the restored EN Topos headline.
      expect(await products.locator("h3").evaluateAll(nodes => nodes.filter(n => n.clientWidth > 1).every(n => n.scrollWidth <= n.clientWidth))).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (width === 1440 || width === 390) await products.screenshot({ path: testInfo.outputPath(`${language}-${width}.png`) });
    }
    await cards.nth(0).getByRole("link").focus();
    await page.keyboard.press("Tab");
    await expect(cards.nth(1).getByRole("link").first()).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test("Interactive retains animated WebGL and the shared pause control", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/founder/");
  const products = page.locator("[data-products-cinematic]");
  const scene = products.locator('[data-product="interactive"] [data-ready="true"] canvas');
  await products.scrollIntoViewIfNeeded();
  await expect(scene).toBeVisible({ timeout: 30_000 });
  const first = await scene.screenshot();
  await page.waitForTimeout(800);
  expect(Buffer.compare(first, await scene.screenshot())).not.toBe(0);
  const pause = products.getByRole("button");
  await pause.click();
  await expect(pause).toHaveAttribute("aria-pressed", "true");
  await scene.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(650);
  const still = await scene.screenshot();
  await page.waitForTimeout(250);
  expect(Buffer.compare(still, await scene.screenshot())).toBe(0);
});

test("Product stills and links work before JavaScript", async ({ browser }, testInfo) => {
  for (const route of ["founder", "en"]) {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      await page.goto(`${testInfo.project.use.baseURL}/${route}/`);
      const products = page.locator("[data-products-cinematic]");
      for (const [key, naturalWidth] of [["cytellect", 1920], ["topos", 1280], ["platform", 1920]] as const) {
        const card = products.locator(`[data-product="${key}"]`);
        await card.scrollIntoViewIfNeeded();
        await expect.poll(() => card.locator("img").evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(naturalWidth);
        await expect(card.getByRole("link")).toBeVisible();
      }
      await expect(products.locator("article")).toHaveCount(4);
    } finally { await context.close(); }
  }
});

test("WebGL failure leaves all product destinations available", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, name: string, ...args: unknown[]) {
      if (name.startsWith("webgl") || name === "experimental-webgl") return null;
      return Reflect.apply(original, this, [name, ...args]);
    } as typeof original;
  });
  await page.goto("/en/");
  const products = page.locator("[data-products-cinematic]");
  await products.scrollIntoViewIfNeeded();
  await expect(products.locator("a")).toHaveCount(4);
  await expect(products.locator('[data-product="interactive"] svg').first()).toBeVisible();
  await expect(products.locator('[data-product="topos"] img')).toBeVisible();
  await expect(products.locator('[data-product="cytellect"] img')).toBeVisible();
  await expect(products.locator('[data-product="platform"] img')).toBeVisible();
});
