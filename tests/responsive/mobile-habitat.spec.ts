import { test, expect, devices } from '@playwright/test';
import { DESKTOP_QUERY } from '../../src/components/Habitat/scene-config';
import { readFileSync } from 'node:fs';

const film = readFileSync('tests/fixtures/mobile-film.mp4');
async function mockFilms(page: import('@playwright/test').Page) {
  await page.route('**/habitat/mobile-v1/*.mp4', route=>route.fulfill({contentType:'video/mp4',body:film}));
}

test.beforeEach(async({page})=>{
  await page.route(/google-analytics|googletagmanager|cloudflareinsights|challenges\.cloudflare/,route=>route.abort());
});
for (const width of [320,340,341,390,430,768,900]) {
  test(`Mobile habitat is readable without 3D downloads at ${width}`,async({page})=>{
    await page.setViewportSize({width,height:width>=768?1024:844});
    await page.emulateMedia({reducedMotion:'reduce'});
    const resources:string[]=[];const errors:string[]=[];
    page.on('request',r=>resources.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/');
    await expect(page.locator('[data-mobile-scene]')).toHaveCount(9);
    await expect(page.locator('[data-mobile-scene="top"] img')).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('[data-mobile-scene] video')).toHaveCount(0);
    await expect(page.locator('[data-mobile-scene] a')).toHaveCount(0);
    const credits=page.locator('.site-footer [data-mobile-media-credits]');
    await expect(credits).toHaveCount(1);
    await expect(credits).not.toHaveAttribute('open');
    await credits.locator('summary').click();
    await expect(credits.locator('a')).toHaveCount(3);
    await expect(credits.locator('a').first()).toBeVisible();
    await credits.locator('summary').click();
    for (const id of ['top','vision','experience','technology','resources','manifesto','community','founder','contact']) {
      await page.locator('#'+id).scrollIntoViewIfNeeded();
      const bounds=await page.locator('#'+id).evaluate(el=>{
        const heading=el.querySelector('h1,h2')!; const r=heading.getBoundingClientRect();
        return {left:r.left,right:r.right,width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth};
      });
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(width+1);expect(bounds.overflow).toBeLessThanOrEqual(1);
    }
    expect(resources.filter(url=>/\.(glb|hdr)(\?|$)|meshopt_decoder/.test(url))).toEqual([]);
    expect(errors).toEqual([]);
    await page.goto('/'); await page.screenshot({path:`test-results/mobile-habitat-${width}.png`});
  });
}

test('Mobile menu and Community disclosure remain operable',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  await page.getByRole('button',{name:'メニューを開く',exact:true}).click();
  await expect(page.locator('#mobile-menu')).toHaveAttribute('aria-hidden','false');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'メニューを開く',exact:true})).toBeFocused();
  await page.locator('.v4-community__details summary').click();
  await expect(page.locator('.v4-community__details')).toHaveAttribute('open','');
  await expect(page.locator('.v4-founder__web-portfolio')).toHaveAttribute('href','https://yuto-matsui.com/');
});

test('Desktop never mounts or requests Mobile media',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await page.emulateMedia({reducedMotion:'reduce'});
  const urls:string[]=[];page.on('request',r=>urls.push(r.url()));
  await page.goto('/');await expect(page.locator('[data-habitat]')).toHaveAttribute('data-enabled','true');
  await expect(page.locator('[data-mobile-scene]')).toHaveCount(0);
  expect(urls.filter(url=>url.includes('/habitat/mobile-'))).toEqual([]);
});

test('iPad rotation follows the existing Desktop query and releases Mobile media',async({browser})=>{
  const context=await browser.newContext({...devices['iPad Pro 11'],viewport:{width:834,height:1194},reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.goto('/');await expect(page.locator('[data-mobile-scene]')).toHaveCount(9);
  await page.setViewportSize({width:1194,height:834});
  expect(await page.evaluate(query=>matchMedia(query).matches,DESKTOP_QUERY)).toBe(true);
  await expect(page.locator('[data-habitat]')).toHaveAttribute('data-enabled','true');
  await expect(page.locator('[data-mobile-scene]')).toHaveCount(0);
  await page.setViewportSize({width:834,height:1194});await expect(page.locator('[data-mobile-scene]')).toHaveCount(9);
  await context.close();
});

test('Films play once, keep the end poster, and never play simultaneously',async({page})=>{
  await page.setViewportSize({width:390,height:844}); await mockFilms(page); await page.goto('/');
  const top=page.locator('[data-mobile-scene="top"]');
  await expect(top).toHaveAttribute('data-film-state','playing');
  await expect(top).toHaveAttribute('data-film-state','ended',{timeout:12000});
  await expect(top.locator('video')).toHaveCount(0); await expect(top.locator('img')).toBeVisible();
  await page.locator('#community').scrollIntoViewIfNeeded();
  const community=page.locator('[data-mobile-scene="community"]');
  await expect(community).toHaveAttribute('data-film-state','playing');
  expect(await page.locator('[data-mobile-scene] video').evaluateAll(videos=>videos.filter(v=>!(v as HTMLVideoElement).paused).length)).toBe(1);
  await page.locator('#top').scrollIntoViewIfNeeded();
  await expect(top).toHaveAttribute('data-film-state','ended');
  expect(await community.locator('video').evaluate(v=>(v as HTMLVideoElement).paused)).toBe(true);
});

test('Pause persists in the tab; opening navigation pauses playback',async({page})=>{
  await page.setViewportSize({width:390,height:844}); await mockFilms(page); await page.goto('/');
  const top=page.locator('[data-mobile-scene="top"]');
  await expect(top).toHaveAttribute('data-film-state','playing');
  await page.getByRole('button',{name:'メニューを開く',exact:true}).click();
  await expect.poll(()=>top.locator('video').evaluate(v=>(v as HTMLVideoElement).paused)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(top).toHaveAttribute('data-film-state','playing');
  await top.getByRole('button',{name:'映像を停止'}).click();
  await expect(top).toHaveAttribute('data-film-state','paused');
  await page.reload();await expect(top).toHaveAttribute('data-film-state','paused');
  expect(await top.locator('video').evaluate(v=>(v as HTMLVideoElement).paused)).toBe(true);
  await top.getByRole('button',{name:'映像を再生'}).click();
  await expect(top).toHaveAttribute('data-film-state','playing');
});

test('Real delivered films decode and finish without rewinding',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const failures:string[]=[];
  page.on('response',r=>{if(r.url().includes('/habitat/mobile-v1/') && r.status()>=400) failures.push(r.url());});
  await page.goto('/');
  for(const id of ['top','community']){
    await page.locator('#'+id).evaluate(el=>scrollTo(0,el.getBoundingClientRect().top+scrollY));
    const scene=page.locator(`[data-mobile-scene="${id}"]`);
    await expect(scene).toHaveAttribute('data-film-state','playing');
    const properties=await scene.locator('video').evaluate(v=>{const p=v as HTMLVideoElement;
      return {width:p.videoWidth,height:p.videoHeight,muted:p.muted,duration:p.duration};});
    expect(properties.width).toBe(720);expect(properties.height).toBe(1280);expect(properties.muted).toBe(true);
    expect(properties.duration).toBeCloseTo(8,1);
    await expect(scene).toHaveAttribute('data-film-state','ended',{timeout:12000});
    await expect(scene.locator('img')).toHaveAttribute('src',new RegExp(`${id}-end-`));
  }
  expect(failures).toEqual([]);
});

test('Images failing to load and 200 percent text retain the reading flow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('**/habitat/mobile-v1/*.webp',route=>route.abort());await page.goto('/');
  await page.addStyleTag({content:'[data-mobile-habitat] :is(h1,h2,h3,p,a,summary,button){font-size:200% !important}'});
  for(const id of ['top','vision','experience','technology','resources','manifesto','community','founder','contact']){
    await page.locator('#'+id).scrollIntoViewIfNeeded();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  }
  await expect(page.locator('.v4-founder__web-portfolio')).toBeVisible();
});

for(const reason of ['autoplay','network','stall','save-data']) {
  test(`Film ${reason} fallback keeps readable content`,async({page})=>{
    await page.setViewportSize({width:390,height:844});
    if(reason==='autoplay') await page.addInitScript(()=>{HTMLMediaElement.prototype.play=()=>Promise.reject(new DOMException('Blocked','NotAllowedError'));});
    if(reason==='save-data') await page.addInitScript(()=>{Object.defineProperty(navigator,'connection',{value:Object.assign(new EventTarget(),{saveData:true})});});
    if(reason==='network') await page.route('**/habitat/mobile-v1/*.mp4',route=>route.abort());
    else if(reason==='stall') await page.route('**/habitat/mobile-v1/*.mp4',async route=>{await new Promise(resolve=>setTimeout(resolve,4500));await route.fulfill({contentType:'video/mp4',body:film}).catch(()=>{});});
    else await mockFilms(page);
    await page.goto('/');
    await expect(page.locator('[data-mobile-scene="top"]')).toHaveAttribute('data-film-state',reason==='save-data'?'static':'failed');
    await expect(page.locator('h1')).toBeVisible();await expect(page.locator('.li-system-index a').first()).toBeVisible();
    await expect(page.locator('[data-mobile-scene="top"] img')).toBeVisible();
    await expect(page.locator('[data-mobile-scene="top"] video')).toHaveCount(0);
  });
}
