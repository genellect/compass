import { expect, test } from "./responsive-fixture";
import { collectRuntimeErrors } from "./layout-audit";

const destinations = [
  "https://yuto-matsui.com/",
  "https://yuto-matsui.com/en/",
  "https://compass-official.pages.dev/",
  "https://compass-official.pages.dev/INTRO_Interactive/",
];

for (const width of [320, 340, 341, 390, 430, 768, 900, 901, 1024, 1280, 1440]) {
  test(`Contact independent navigation and form at ${width}px`, async ({ page }, testInfo) => {
    const errors = collectRuntimeErrors(page);
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/contact/");
    const header = page.locator("[data-contact-header]");
    await page.keyboard.press("Tab");
    const skip = header.getByRole("link", { name: "本文へスキップ" });
    await expect(skip).toBeFocused();
    const skipBox = await skip.boundingBox();
    expect(skipBox!.y).toBeGreaterThanOrEqual(0);
    expect(skipBox!.x + skipBox!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press("Tab");
    await expect(header).toContainText("CONTACT");
    await expect(page.locator(".site-header, .site-footer")).toHaveCount(0);
    await expect(page).toHaveTitle("Contact | お問い合わせ");
    await expect(page.locator("[data-contact-footer]")).toContainText("Yuto Matsui. All rights reserved.");
    await expect(page.locator("[data-contact-entrance]")).toBeVisible();
    const h1 = await page.locator("h1").boundingBox();
    const headerBox = await header.boundingBox();
    expect(h1!.y).toBeGreaterThan(headerBox!.height);
    expect(await header.evaluate((element) => getComputedStyle(element).position)).toBe("fixed");
    const nav = page.getByRole("navigation", { name: "Contact navigation", exact: true });
    const menu = page.getByRole("button", { name: "Menu" });
    if (width <= 900) {
      await expect(nav).toBeHidden();
      await menu.click();
      await expect(menu).toHaveAttribute("aria-expanded", "true");
      await expect(nav).toBeVisible();
      const box = await nav.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(16);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width - 16);
      expect(box!.y + box!.height).toBeLessThan(844);
      if (width === 390) await page.screenshot({ path: testInfo.outputPath("mobile-bubble.png"), fullPage: true });
    } else {
      await expect(menu).toBeHidden();
      await expect(nav).toBeVisible();
    }
    expect(await nav.locator("a").evaluateAll((anchors) => anchors.map((a) => (a as HTMLAnchorElement).href))).toEqual(destinations);
    if (width <= 900) {
      await page.keyboard.press("Escape");
      await expect(menu).toBeFocused();
      await expect(nav).toBeHidden();
      await menu.click();
      // The bubble intentionally overlaps the heading; use the outer gutter.
      await page.mouse.click(4, 400);
      await expect(nav).toBeHidden();
    }
    await page.locator('[data-door="representative"]').click();
    await page.locator("#name").fill("テスト利用者");
    if (width <= 900) { await menu.click(); await menu.click(); }
    await expect(page.locator("#name")).toHaveValue("テスト利用者");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await expect(page.locator("canvas")).toHaveCount(0);
    if (width === 1440) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: testInfo.outputPath("desktop-gallery.png"), fullPage: true }); }
    expect(errors).toEqual([]);
  });
}

test("Contact bubble supports keyboard departure, link selection and short screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 320 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/contact/");
  const button = page.getByRole("button", { name: "Menu" });
  const bubble = page.locator("#contact-navigation");
  await button.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(bubble.locator("a").first()).toBeFocused();
  const last = bubble.locator("a").last();
  await last.focus();
  await page.keyboard.press("Tab");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await button.click();
  await expect(last).toBeVisible();
  await last.scrollIntoViewIfNeeded();
  const lastBox = await last.boundingBox();
  expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(320);
  // Prevent actual cross-site navigation; exercise the link's close handler.
  await bubble.evaluate((element) => element.addEventListener("click", (event) => event.preventDefault()));
  await last.click();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await button.click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(button).toHaveAttribute("aria-expanded", "false");
});

test("Contact remains usable without WebGL", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      if (String(args[0]).startsWith("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto("/contact/");
  await page.getByRole("button", { name: "演出なしで入力へ" }).click();
  await page.locator('input[value="compass"]').check();
  await expect(page.locator("#name")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
});

test.describe("Contact touch navigation", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  test("bubble opens above the form and closes without changing the destination", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/contact/");
    await page.locator('[data-door="compass"]').tap();
    await page.getByRole("button", { name: "Menu" }).tap();
    await expect(page.locator("#contact-navigation")).toBeVisible();
    expect(await page.evaluate(() => ({ width: innerWidth, coarse: matchMedia("(pointer: coarse)").matches }))).toEqual({ width: 390, coarse: true });
    await page.getByRole("button", { name: "Menu" }).tap();
    await expect(page.locator('input[value="compass"]')).toBeChecked();
  });
});

for (const target of ["representative", "compass"]) {
  test(`Contact ${target}: mocked verification, retry and success survive menu use`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/turnstile/**", (route) => route.fulfill({
      contentType: "application/javascript",
      body: `window.turnstile={render(el,options){setTimeout(()=>options.callback('local-test-token'),0);return 'test-widget'},remove(){},reset(){}};`,
    }));
    let verifyAttempts = 0;
    let submitAttempts = 0;
    const actions: string[] = [];
    await page.route("**/api/contact", async (route) => {
      const request = route.request().postDataJSON();
      actions.push(request.action);
      let response: Record<string, unknown>;
      if (request.action === "request_code") response = { ok: true, challengeId: "local-test-challenge" };
      else if (request.action === "verify_code") response = ++verifyAttempts === 1 ? { ok: false, message: "テスト：確認コードを確認してください。" } : { ok: true, verificationProof: "local-test-proof" };
      else {
        expect(request.details).toMatch(target === "compass" ? /^【送信先：COMPASS】/ : /^【送信先：代表】/);
        response = ++submitAttempts === 1 ? { ok: false, message: "テスト：送信を再試行してください。" } : { ok: true };
      }
      await route.fulfill({ status: response.ok ? 200 : 400, contentType: "application/json", body: JSON.stringify(response) });
    });
    await page.goto("/contact/");
    await page.locator(`[data-door="${target}"]`).click();
    await page.locator("#name").fill("テスト利用者");
    await page.locator("#affiliation").fill("テスト機関");
    await page.locator("#email").fill("contact-test@example.com");
    await page.locator("#details").fill("外部送信を行わないローカル動作確認用のメッセージです。");
    await page.getByRole("button", { name: "確認コードを受け取る", exact: true }).click();
    await page.locator("#verificationCode").fill("123456");
    await page.getByRole("button", { name: "メールアドレスを確認", exact: true }).click();
    await expect(page.getByText("テスト：確認コードを確認してください。", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "メールアドレスを確認", exact: true }).click();
    await expect(page.getByText("メールアドレス確認済み", { exact: false })).toBeVisible();
    const menu = page.getByRole("button", { name: "Menu" });
    await menu.click();
    await page.keyboard.press("Escape");
    await expect(page.getByText("メールアドレス確認済み", { exact: false })).toBeVisible();
    const submit = page.getByRole("button", { name: target === "compass" ? "COMPASSへ送信" : "代表へ送信", exact: true });
    await submit.click();
    await expect(page.getByText("テスト：送信を再試行してください。", { exact: true })).toBeVisible();
    await submit.click();
    await expect(page.getByRole("heading", { name: "ご連絡を受け付けました" })).toBeVisible();
    await expect(page.locator("[data-contact-header]")).toBeVisible();
    expect(actions).toEqual(["request_code", "verify_code", "verify_code", "submit", "submit"]);
  });
}
