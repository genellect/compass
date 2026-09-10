import { expect, test } from './responsive-fixture';

for (const path of ['/', '/future-strategy-library/', '/messages/', '/community/join/']) {
  test(`Official mobile return links are reachable after Other: ${path}`, async ({page}, testInfo) => {
    await page.setViewportSize({width:390,height:844});
    await page.goto(path);
    await page.locator('button.menu-toggle').click();
    const menu=page.locator('#mobile-menu');
    const home=menu.getByRole('link',{name:'公式サイトへ戻る'});
    await expect(home).toHaveAttribute('href','/');
    await home.scrollIntoViewIfNeeded();
    const other=(await menu.locator('#mobile-other-title').boundingBox())!;
    const link=(await home.boundingBox())!;
    expect(link.y).toBeGreaterThan(other.y+other.height);
    expect(link.height).toBeGreaterThanOrEqual(44);
    if (path === '/community/join/') await page.screenshot({path:testInfo.outputPath('mobile-return-menu.png')});
    await home.click();
    await expect(page).toHaveURL(new URL('/',page.url()).href);
    await expect(menu).not.toBeVisible();
    await page.goto(path);
    await page.locator('button.menu-toggle').click();
    const brand=page.locator('.mobile-home-brand');
    await expect(brand).toHaveAttribute('href','/');
    await brand.click();
    await expect(page).toHaveURL(new URL('/',page.url()).href);
  });
}

test('Community mobile footer matches the parent palette, desktop keeps its existing palette', async ({page}, testInfo) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const palette=await page.locator('footer.site-footer').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,fg:getComputedStyle(el).color}));
  await page.goto('/community/join/');
  expect(await page.locator('footer.site-footer').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,fg:getComputedStyle(el).color}))).toEqual(palette);
  await page.locator('footer.site-footer').screenshot({path:testInfo.outputPath('community-mobile-footer.png')});
  await page.setViewportSize({width:1440,height:900});
  const footer=page.locator('footer.site-footer');
  const before=await footer.evaluate(el=>({bg:getComputedStyle(el).backgroundColor,fg:getComputedStyle(el).color}));
  expect(before.bg).not.toBe(palette.bg);
  // The added mobile theme class must have no effect on desktop rendering.
  await footer.evaluate(el=>el.classList.remove(...Array.from(el.classList).filter(name=>name.includes('_dark'))));
  expect(await footer.evaluate(el=>({bg:getComputedStyle(el).backgroundColor,fg:getComputedStyle(el).color}))).toEqual(before);
  await expect(page.locator('button.menu-toggle')).not.toBeVisible();
  await expect(page.locator('.mobile-menu-home')).not.toBeVisible();
});
