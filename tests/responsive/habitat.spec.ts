import { test, expect, devices } from '@playwright/test';

const ids = ['top','vision','experience','technology','resources','manifesto','community','founder','contact'];

test('Desktop Hero fits the first screen and the new header remains keyboard operable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [width,height] of [[901,768],[1024,768],[1275,553],[1440,900],[1920,1080],[3840,2160]]) {
    await page.setViewportSize({width,height}); await page.goto('/');
    await expect(page.locator('[data-habitat]')).toHaveAttribute('data-enabled','true');
    const bounds=await page.evaluate(()=>{
      const hero=document.querySelector('#top')!.getBoundingClientRect();
      const header=document.querySelector('.site-header')!.getBoundingClientRect();
      const copy=document.querySelector('.li-hero-copy')!.getBoundingClientRect();
      const controls=document.querySelector('nav[aria-label="このページの案内"]')!.getBoundingClientRect();
      const range=document.createRange();range.selectNodeContents(document.querySelector('h1')!);
      return {heroBottom:hero.bottom,copyBottom:copy.bottom,copyTop:copy.top,headerBottom:header.bottom,controlsTop:controls.top,
        textFits:[...range.getClientRects()].every(r=>r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight),overflow:document.documentElement.scrollWidth-innerWidth};
    });
    expect(bounds.heroBottom).toBeLessThanOrEqual(height+1);
    expect(bounds.copyBottom).toBeLessThanOrEqual(height-10);
    expect(bounds.copyBottom).toBeLessThanOrEqual(bounds.controlsTop-8);
    expect(bounds.copyTop).toBeGreaterThanOrEqual(bounds.headerBottom);
    expect(bounds.textFits).toBe(true); expect(bounds.overflow).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({width:1440,height:900});
  const nav=page.getByRole('navigation',{name:'Main navigation',exact:true});
  await expect(nav.getByRole('link',{name:'Interactive',exact:true})).toHaveAttribute('href','INTRO_Interactive/');
  await expect(nav.getByText('Technology Core',{exact:true})).toHaveCount(0);
  const resources=nav.getByRole('button',{name:'Resources',exact:true});
  await resources.focus();await page.keyboard.press('ArrowDown');
  await expect(resources).toHaveAttribute('aria-expanded','true');
  await expect(nav.getByRole('link',{name:'未来戦略ライブラリ 北里薬学生への未来の羅針盤'})).toBeFocused();
  await page.keyboard.press('Escape');await expect(resources).toBeFocused();
  await expect(resources).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('#resources-menu')).toBeHidden();
  await page.screenshot({path:'test-results/habitat-header.png'});
});
test.beforeEach(async ({ page }) => {
  await page.route(/google-analytics|googletagmanager|cloudflareinsights|challenges\.cloudflare/, route => route.abort());
});
test('Desktop visits all nine areas and retains working disclosure and pause controls', async ({ page }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const root = page.locator('[data-habitat]');
  await expect(root).toHaveAttribute('data-enabled', 'true');
  // Pause on the first successful frame. Software GPU screenshot capture can itself
  // exceed the live frame budget; that fallback has a separate moving-renderer test.
  await page.waitForFunction(()=>{
    if(document.querySelector('[data-habitat]')?.getAttribute('data-scene-state')!=='ready')return false;
    const button=[...document.querySelectorAll('button')].find(b=>b.textContent?.includes('動きを止める'));
    button?.click();return Boolean(button);
  },undefined,{timeout:40000});
  await expect(root).toHaveAttribute('data-scene-state', 'paused',{timeout:20000});
  for (const id of ids) {
    await page.locator('#' + id).scrollIntoViewIfNeeded();
    // Anchor-like positioning avoids centering tall sections in the following scene.
    await page.evaluate(id => window.scrollTo({ top: document.getElementById(id)!.getBoundingClientRect().top + scrollY, behavior: 'instant' }), id);
    await expect(root).toHaveAttribute('data-scene-section', id);
    await expect(root).toHaveAttribute('data-scene-state', 'paused', { timeout: 20000 });
    await expect(page.locator('[data-habitat-backdrop] canvas')).toHaveCount(1);
    await page.screenshot({ path: `test-results/habitat-${id}.png` });
    const metrics = await page.locator('[data-quality]').evaluate(element => ({ ...((element as HTMLElement).dataset) }));
    expect(Number(metrics.triangles)).toBeLessThanOrEqual(300000);
    expect(Number(metrics.drawCalls)).toBeLessThanOrEqual(150);
  }
  await page.locator('#community summary').click();
  await expect(page.locator('#community details')).toHaveAttribute('open', '');
  await page.locator('#contact').scrollIntoViewIfNeeded();
  await expect(page.locator('#contact a')).toHaveAttribute('href', '/contact/');
  expect(errors).toEqual([]);
});

test('Mobile preserves the current layout without fetching habitat assets or engine', async ({ browser }) => {
  const context = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
  const page = await context.newPage(); const assets: string[] = []; const engines: Promise<boolean>[] = [];
  await page.route(/google-analytics|googletagmanager|cloudflareinsights|challenges\.cloudflare/, route => route.abort());
  page.on('request', request => { if (request.url().includes('/habitat/')) assets.push(request.url()); });
  page.on('response', response => { if (response.url().endsWith('.js')) engines.push(response.text().then(text => text.includes('Habitat asset unavailable')).catch(() => false)); });
  await page.goto('/'); await expect(page.locator('[data-habitat]')).toHaveAttribute('data-enabled','false');
  await expect(page.locator('.v4-technology__interactive-title')).toHaveText('LET EVERYTHING MOVE');
  await expect(page.locator('.v4-technology__interactive-copy p').nth(0)).toHaveText('あなたが飲み込んだその疑問を、誰かも同じように抱えているかもしれない。');
  await expect(page.locator('.v4-technology__interactive-copy p').nth(1)).toHaveText('問いも、迷いも、ひらめきも。その場にいる全員の思考が重なったとき、講義はただの説明ではなく、自分たちの学びに変わります。');
  await page.locator('#contact').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-habitat-backdrop] canvas')).toHaveCount(0);
  expect(assets).toEqual([]); expect((await Promise.all(engines)).some(Boolean)).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await context.close();
});

test('Sustained low frame rate chooses the static render without degrading the 3D quality', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({width:1280,height:720});
  await page.addInitScript(()=>{
    const request=window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame=callback=>request(()=>{const start=performance.now();while(performance.now()-start<45){} callback(performance.now());});
  });
  await page.goto('/');
  await expect(page.locator('[data-habitat]')).toHaveAttribute('data-scene-state',/ready|static/,{timeout:40000});
  await expect(page.locator('[data-habitat]')).toHaveAttribute('data-scene-state','static',{timeout:40000});
  await expect(page.locator('[data-fallback-reason]')).toHaveAttribute('data-fallback-reason','sustained-frame-budget');
  await expect(page.locator('[data-habitat-backdrop] canvas')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'3Dを再試行'})).toBeVisible();
  await expect(page.locator('.li-system-index a').first()).toBeVisible();
});

test('Reduced motion renders section posters without WebGL and without a motion control', async ({ page }) => {
  const models: string[] = []; page.on('request', request => { if (request.url().endsWith('.glb')) models.push(request.url()); });
  await page.setViewportSize({ width: 1280, height: 720 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#resources');
  await expect(page.locator('[data-habitat]')).toHaveAttribute('data-scene-state','static');
  await expect(page.locator('[data-habitat]')).toHaveAttribute('data-scene-section','resources');
  await expect(page.locator('[data-habitat-backdrop] canvas')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '動きを止める' })).toHaveCount(0);
  await expect.poll(() => page.locator('[data-habitat-backdrop] > div').first().evaluate(e => getComputedStyle(e).backgroundImage)).toContain('resources.webp');
  expect(models).toEqual([]);
});

test('Chapter navigation seeks to the correct room and sound is opt-in and disposable', async ({ page }) => {
  await page.setViewportSize({width:1440,height:900});await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(()=>{
    const Original=window.AudioContext;
    (window as unknown as {__audioContexts:AudioContext[]}).__audioContexts=[];
    window.AudioContext=class extends Original{constructor(){super();(window as unknown as {__audioContexts:AudioContext[]}).__audioContexts.push(this);}};
  });
  await page.goto('/');
  expect(await page.evaluate(()=>(window as unknown as {__audioContexts:AudioContext[]}).__audioContexts.length)).toBe(0);
  await page.getByRole('button',{name:'音を入れる'}).click();
  await expect(page.getByRole('button',{name:'音を切る'})).toHaveAttribute('aria-pressed','true');
  const chapters=page.getByRole('navigation',{name:'このページの案内'});
  await chapters.getByRole('link',{name:'人と活動',exact:true}).click();
  await expect(page.locator('[data-habitat]')).toHaveAttribute('data-scene-section','community');
  await expect(chapters.getByRole('link',{name:'人と活動',exact:true})).toHaveAttribute('aria-current','step');
  await page.getByRole('button',{name:'音を切る'}).click();
  await expect(page.getByRole('button',{name:'音を入れる'})).toHaveAttribute('aria-pressed','false');
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {__audioContexts:AudioContext[]}).__audioContexts[0]?.state)).toBe('closed');
  await expect(page.getByRole('navigation',{name:'このページの案内'})).toHaveCount(0);
});

test('Model failure leaves a readable poster, then a user can retry', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.route('**/habitat/**/*.glb', route => route.fulfill({ status: 503, body: '' }));
  await page.goto('/');
  await expect(page.locator('[data-habitat]')).toHaveAttribute('data-scene-state','failed');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.li-system-index a').first()).toBeVisible();
  await expect(page.locator('[data-habitat-backdrop] canvas')).toHaveCount(0);
  await page.unroute('**/habitat/**/*.glb');
  await page.getByRole('button', { name: '3Dを再試行' }).click();
  await expect(page.locator('[data-habitat]')).toHaveAttribute('data-scene-state','ready', { timeout: 30000 });
});

test('Viewport changes and repeated route visits dispose the renderer', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 }); await page.goto('/');
  await expect(page.locator('[data-habitat]')).toHaveAttribute('data-scene-state','ready', { timeout: 30000 });
  await page.setViewportSize({ width: 900, height: 720 });
  await expect(page.locator('[data-habitat]')).toHaveAttribute('data-enabled','false');
  await expect(page.locator('[data-habitat-backdrop] canvas')).toHaveCount(0);
  await page.setViewportSize({ width: 901, height: 720 });
  await expect(page.locator('[data-habitat]')).toHaveAttribute('data-enabled','true');
  await expect(page.locator('[data-habitat-backdrop] canvas')).toHaveCount(1);
  await page.goto('/contact/'); await expect(page.locator('[data-habitat]')).toHaveCount(0);
  await page.goBack(); await expect(page.locator('[data-habitat]')).toHaveCount(1);
  await expect(page.locator('[data-habitat-backdrop] canvas')).toHaveCount(1);
});

test('Lost WebGL context fails over without losing page content', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 }); await page.goto('/');
  await expect(page.locator('[data-habitat]')).toHaveAttribute('data-scene-state','ready', { timeout: 30000 });
  await page.locator('[data-habitat-backdrop] canvas').evaluate(canvas => {
    (canvas as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
  });
  await expect(page.locator('[data-habitat]')).toHaveAttribute('data-scene-state','failed');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('[data-habitat-backdrop] canvas')).toHaveCount(0);
});

test('A destination selected during the first download becomes ready without another scroll', async ({ page }) => {
  test.setTimeout(60000);
  let release!: () => void, requested!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const initialRequest = new Promise<void>(resolve => { requested = resolve; });
  await page.route('**/habitat/**/top.glb', async route => { requested(); await gate; await route.continue(); });
  await page.setViewportSize({width:1280,height:720});
  await page.goto('/'); await initialRequest;
  await page.evaluate(() => document.getElementById('resources')!.scrollIntoView({behavior:'instant',block:'start'}));
  await expect(page.locator('[data-habitat]')).toHaveAttribute('data-scene-section','resources');
  release();
  await expect(page.locator('[data-habitat]')).toHaveAttribute('data-scene-state','ready',{timeout:30000});
  await expect(page.locator('[data-habitat]')).toHaveAttribute('data-scene-section','resources');
});
