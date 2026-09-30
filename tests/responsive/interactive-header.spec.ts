import { expect, test } from "./responsive-fixture";
import { collectRuntimeErrors, settleRenderedPage } from "./layout-audit";
import path from "node:path";
const anchors = [["講義の体験","students"],["講義の流れ","features"],["AI学習支援","ai-support"],["学生の反応を活かす","teachers"],["教員の使い方","educator-operations"],["導入・ご相談","adoption"],["設計・技術","developers"]];
const targets = [["COMPASS公式サイト","/"],["Meet the Developer","https://yuto-matsui.com/"],["開発者向け技術情報","/INTRO_Interactive/developers/"]];
async function shot(page: import("@playwright/test").Page, name:string) {
  if (process.env.HERO_EVIDENCE_DIR) await page.screenshot({path:path.join(process.env.HERO_EVIDENCE_DIR,name+".png")});
}
test("Desktop header exposes destinations and supports page navigation and keyboard", async ({page})=>{
  const errors=collectRuntimeErrors(page);
  await page.setViewportSize({width:1440,height:900});
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/INTRO_Interactive/"); await settleRenderedPage(page);
  const header=page.locator("[data-interactive-desktop-header]");
  await expect(header.getByRole('link',{name:'COMPASS Interactive トップへ',exact:true})).toHaveAttribute('href','#top');
  const sites=header.getByRole("navigation",{name:"公式サイト・技術情報・開発者"});
  for(const [name,href] of targets) {
    await expect(sites.getByRole("link",{name,exact:true})).toBeVisible();
    await expect(sites.getByRole("link",{name,exact:true})).toHaveAttribute("href",href);
  }
  await expect(header.getByRole("link",{name:"講義を体験する",exact:true})).toHaveAttribute("href","https://compass-interactive.pages.dev/demo");
  const toggle=header.getByRole("button",{name:"ページ内ナビゲーション",exact:true});
  const panel=page.locator("#desktop-page-navigation");
  await shot(page,"header-desktop");
  await toggle.click(); await shot(page,"header-expanded");
  await expect(panel.getByRole("link")).toHaveCount(8);
  await expect(panel.getByRole("link",{name:"講義コードで参加する"})).toHaveAttribute("href","https://compass-interactive.pages.dev/join");
  await page.keyboard.press("Escape"); await expect(toggle).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(panel.getByRole("link",{name:"講義の体験",exact:true})).toBeFocused();
  await page.keyboard.press("Escape");
  for(const [name,id] of anchors) {
    await toggle.click(); await panel.getByRole("link",{name,exact:true}).click();
    await expect(page).toHaveURL(new RegExp("#"+id+"$"));
    await expect(toggle).toHaveAttribute("aria-expanded","false");
    const bottom=await page.locator("header.site-header").evaluate(el=>el.getBoundingClientRect().bottom);
    await expect.poll(()=>page.locator("#"+id).evaluate(el=>el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(bottom);
  }
  await toggle.click(); await page.mouse.click(8,880); await expect(panel).toBeHidden();
  await expect(page.locator("#developer-profile")).toHaveCount(0);
  for(const [name,href] of targets) await expect(page.locator("footer.site-footer").getByRole("link",{name,exact:true})).toHaveAttribute("href",href);
  await expect(page.locator('#start a[data-cta-location="final-code-join"]')).toHaveAttribute("href","https://compass-interactive.pages.dev/join");
  expect(errors).toEqual([]);
});

test("Header and ending retain readable layouts across Desktop and Mobile widths",async({page})=>{
  const errors=collectRuntimeErrors(page);
  await page.emulateMedia({reducedMotion:"reduce"}); await page.goto("/INTRO_Interactive/"); await settleRenderedPage(page);
  for(const [width,height] of [[390,844],[680,900],[681,900],[768,1024],[1024,768],[1199,900],[1200,900],[1275,553],[1440,900],[3840,2160]]) {
    await page.setViewportSize({width,height}); await page.evaluate(()=>scrollTo(0,0));
    const header=page.locator("[data-interactive-desktop-header]");
    if(width>680) {
      await expect(header).toBeVisible(); await expect(page.locator(".menu-toggle")).toBeHidden();
      let right=0;
      for(const link of await header.locator("a,button").all()) {
        if(!await link.isVisible()) continue;
        const box=(await link.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(right-1); right=box.x+box.width;
        expect(right).toBeLessThanOrEqual(width);
        expect(await link.evaluate(el=>{const b=el.getBoundingClientRect();return el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));})).toBe(true);
      }
      await header.getByRole("button").click();
      const panel=page.locator("#desktop-page-navigation");
      const b=(await panel.boundingBox())!;expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(width);
      if(width===681) await shot(page,"header-expanded-681");
      await page.keyboard.press("Escape");
    } else { await expect(header).toBeHidden(); await expect(page.locator(".menu-toggle")).toBeVisible(); }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    if([390,681,1024].includes(width)) await shot(page,"header-"+width);
    await page.locator("#start").scrollIntoViewIfNeeded();
    for(const element of await page.locator("#start h2,#start a").all()) {
      const b=(await element.boundingBox())!;expect(b.x).toBeGreaterThanOrEqual(19);expect(b.x+b.width).toBeLessThanOrEqual(width-19);
    }
    if([390,1440].includes(width)) {
      await page.evaluate(()=>scrollTo(0,document.querySelector('#start')!.getBoundingClientRect().top+scrollY-96));
      await shot(page,"ending-"+width);
      await page.locator("footer.site-footer").scrollIntoViewIfNeeded(); await shot(page,"footer-"+width);
    }
    const footer=page.locator("footer.site-footer");
    for(const link of await footer.getByRole("link").all()) {
      const b=(await link.boundingBox())!;expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(width);
    }
  }
  expect(errors).toEqual([]);
});

test("Desktop and Mobile navigation release state at the boundary",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"}); await page.setViewportSize({width:681,height:900});
  await page.goto("/INTRO_Interactive/");
  const desktop=page.locator('[data-interactive-desktop-header]');
  await desktop.getByRole("button").click(); await page.setViewportSize({width:680,height:900});
  await expect(desktop).toBeHidden(); await page.getByRole("button",{name:"メニューを開く",exact:true}).click();
  const mobile=page.locator("#mobile-menu");await expect(mobile).toBeVisible();
  for(const [name,id] of anchors) await expect(mobile.getByRole("link",{name:new RegExp("^"+name)})).toHaveAttribute("href","#"+id);
  await page.setViewportSize({width:681,height:900}); await expect(mobile).toBeHidden();
  await expect(page.locator("body")).not.toHaveClass(/menu-open/); await expect(desktop.getByRole("button")).toHaveAttribute("aria-expanded","false");
});
