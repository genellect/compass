import { expect, test } from "./responsive-fixture";
import { collectRuntimeErrors } from "./layout-audit";

for (const width of [390, 1440]) {
  for (const target of ["representative", "compass"]) {
    test(`Contact door ${target} plays a two-second film at ${width}px then leaves a quiet form`, async ({ page }, testInfo) => {
      const errors = collectRuntimeErrors(page);
      const cancelledPosters = new Set<string>();
      page.on("requestfailed", request => {
        // Removing a picture can cancel an unused responsive source candidate.
        const pathname = new URL(request.url()).pathname;
        if (request.failure()?.errorText === "net::ERR_ABORTED" && /^\/media\/contact-entry\/lobby-(desktop|mobile)\.webp$/.test(pathname)) cancelledPosters.add(`requestfailed: GET ${pathname}`);
      });
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const requestedFilms: string[] = [];
      page.on("request", request => { if (request.url().endsWith(".mp4")) requestedFilms.push(request.url()); });
      await page.goto("/contact/");
      const poster = page.locator("[data-contact-entrance] img");
      await expect.poll(() => poster.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      expect(requestedFilms).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`lobby-${width}.png`), fullPage: true });
      await page.locator(`[data-door="${target}"]`).click();
      const film = page.locator("video");
      await expect(film).toBeVisible();
      await expect.poll(() => film.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(.08);
      const meta = await film.evaluate((element: HTMLVideoElement) => ({duration: element.duration, muted: element.muted, inline: element.playsInline, src: element.currentSrc}));
      expect(meta.duration).toBeGreaterThanOrEqual(1.95);
      expect(meta.duration).toBeLessThanOrEqual(2.05);
      expect(meta.muted && meta.inline).toBe(true);
      expect(meta.src).toContain(`${target}-${width === 390 ? "mobile" : "desktop"}.mp4`);
      await expect(page.locator("[data-contact-entrance]")).toHaveCount(0);
      await expect(page.locator("#form-title")).toBeFocused();
      await expect(page.locator(`input[value="${target}"]`)).toBeChecked();
      await page.locator("#name").fill("テスト利用者");
      await page.locator(`input[value="${target === "compass" ? "representative" : "compass"}"]`).check();
      await expect(page.locator("#name")).toHaveValue("テスト利用者");
      await expect(page.locator("video, canvas")).toHaveCount(0);
      expect(requestedFilms.every(url => url.includes(target))).toBe(true);
      await page.evaluate(() => scrollTo(0,0));
      await page.screenshot({ path: testInfo.outputPath(`form-${width}.png`), fullPage: true });
      expect(errors.filter(error => !cancelledPosters.has(error))).toEqual([]);
    });
  }
}

test("Contact entry skip is keyboard operable and cannot reset the destination", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/contact/");
  await page.locator('[data-door="compass"]').focus();
  await page.keyboard.press("Enter");
  const skip=page.getByRole("button",{name:"スキップ"});
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator('input[value="compass"]')).toBeChecked();
  await page.locator("#name").fill("入力保持テスト");
  await page.waitForTimeout(2900);
  await expect(page.locator("#name")).toHaveValue("入力保持テスト");
  await expect(page.locator("#name")).toBeFocused();
});

for (const mode of ["reject-play", "missing-media", "slow-media", "reduced-motion", "save-data"]) {
  test(`Contact entry remains usable with ${mode}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: mode === "reduced-motion" ? "reduce" : "no-preference" });
    if (mode === "reject-play") await page.addInitScript(() => { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException("Blocked", "NotAllowedError")); });
    if (mode === "save-data") await page.addInitScript(() => { Object.defineProperty(navigator, "connection", { value: { saveData: true }, configurable: true }); });
    let requests=0;
    await page.route("**/media/contact-entry/*.mp4", async route => {
      requests++;
      if (mode === "slow-media") await new Promise(resolve => setTimeout(resolve,1200));
      await route.fulfill({status:404,body:""});
    });
    await page.goto("/contact/");
    await page.locator('[data-door="representative"]').click();
    await expect(page.locator("#name")).toBeVisible();
    await expect(page.locator('input[value="representative"]')).toBeChecked();
    await expect(page.locator("video, canvas")).toHaveCount(0);
    if (mode === "reduced-motion" || mode === "save-data") expect(requests).toBe(0);
  });
}

test("Contact normal entry bypass preserves destination choice and no film is requested", async ({ page }) => {
  await page.goto("/contact/");
  await page.getByRole("button",{name:"演出なしで入力へ"}).click();
  await expect(page.locator('input[name="contactTarget"]:checked')).toHaveCount(0);
  await page.locator('input[value="compass"]').check();
  await expect(page.locator("#name")).toBeVisible();
  await expect(page.locator("video, canvas")).toHaveCount(0);
});

test("Contact entry finishes safely when reduced motion is enabled during playback", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({width:1280,height:800});
  await page.goto("/contact/");
  await page.locator('[data-door="representative"]').click();
  await expect(page.locator("video")).toBeVisible();
  await page.emulateMedia({reducedMotion:"reduce"});
  await expect(page.locator("video")).toHaveCount(0);
  await expect(page.locator('input[value="representative"]')).toBeChecked();
  await expect(page.locator("#form-title")).toBeFocused();
});

test("Contact entry completion keeps focus in an open header menu", async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.goto("/contact/");
  await page.locator('[data-door="compass"]').click();
  await expect(page.locator("video")).toBeVisible();
  const menu=page.getByRole("button",{name:"Menu"});
  await menu.click();
  await page.keyboard.press("Tab");
  const firstLink=page.locator("#contact-navigation a").first();
  await expect(firstLink).toBeFocused();
  await expect(page.locator("video")).toHaveCount(0);
  await expect(firstLink).toBeFocused();
  await expect(menu).toHaveAttribute("aria-expanded","true");
  await expect(page.locator('input[value="compass"]')).toBeChecked();
});

test("Contact architecture stays unobscured and its door controls remain accessible", async ({ page }) => {
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/contact/");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({width,height:900});
    const image=page.locator('[data-contact-entrance] picture');
    const question=page.getByRole("heading",{name:"どちらへのご連絡ですか？"});
    await expect(image).toBeVisible();
    const imageBox=(await image.boundingBox())!;
    const questionBox=(await question.boundingBox())!;
    expect(questionBox.y+questionBox.height).toBeLessThanOrEqual(imageBox.y);
    for (const target of ["representative","compass"]) {
      const door=page.locator(`[data-door="${target}"]`);
      await expect(door).toHaveAccessibleName(target==="representative" ? /執務室.*Yuto Matsui/ : /会議室.*COMPASS/);
      await expect(door).toHaveText("");
      expect(await door.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
      const box=(await door.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(imageBox.x);
      expect(box.x+box.width).toBeLessThanOrEqual(imageBox.x+imageBox.width+1);
      await door.focus();
      await expect(door).toBeFocused();
    }
  }
});

for (const target of ["representative","compass"]) {
  test(`Contact external text alternative opens ${target} without obscuring the film`, async ({page})=>{
    await page.setViewportSize({width:390,height:844});
    await page.emulateMedia({reducedMotion:"reduce"});
    await page.goto("/contact/");
    const alternatives=page.locator('[aria-label="お問い合わせ先"]');
    const button=alternatives.getByRole("button").nth(target==="representative" ? 0 : 1);
    const imageBox=(await page.locator('[data-contact-entrance] picture').boundingBox())!;
    const buttonBox=(await button.boundingBox())!;
    expect(buttonBox.y).toBeGreaterThanOrEqual(imageBox.y+imageBox.height);
    await button.click();
    await expect(page.locator(`#name`)).toBeVisible();
    await expect(page.locator(`input[value="${target}"]`)).toBeChecked();
  });
}

test("Contact portrait film keeps its framing when the viewport rotates", async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.goto("/contact/");
  await page.locator('[data-door="compass"]').click();
  const video=page.locator("video");
  await expect.poll(()=>video.evaluate((el:HTMLVideoElement)=>el.currentTime)).toBeGreaterThan(.08);
  await video.evaluate((el:HTMLVideoElement)=>el.pause());
  await page.setViewportSize({width:1440,height:900});
  const box=(await video.boundingBox())!;
  expect(box.width/box.height).toBeCloseTo(.75,2);
  expect(box.height).toBeLessThanOrEqual(670);
  await expect(video).toHaveAttribute("src",/compass-mobile\.mp4$/);
  await page.getByRole("button",{name:"スキップ"}).click();
  await expect(page.locator('input[value="compass"]')).toBeChecked();
});
