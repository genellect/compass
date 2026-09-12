import {test,expect,devices,type Page} from '@playwright/test';
import {Navigation} from '../../src/components/Explorer/navigation';
import floor from '../../public/habitat/explorer/v1/navigation.json';

const rooms=[['top','COMPASS'],['vision','Vision'],['experience','Experience'],['technology','Interactive'],['resources','Library'],['manifesto','Manifesto'],['community','Community'],['founder','Founder'],['contact','Contact']] as const;
const nav=new Navigation({cellSize:floor.cellSize,cells:floor.cells.map(([x,z])=>[x,z])});
test.use({viewport:{width:1440,height:900},launchOptions:{args:['--enable-gpu','--use-angle=d3d11']}});
test.beforeEach(async({page})=>{await page.route(/google-analytics|googletagmanager|cloudflareinsights|challenges\.cloudflare/,route=>route.fulfill({status:200,body:''}));});

async function fixture(page:Page){
  // These are controlled rendering/interaction checks, never hardware FPS proof.
  await page.addInitScript(()=>{
    localStorage.setItem('compass-3d-mode','on');
    const native=requestAnimationFrame.bind(window),clocks=new WeakMap<FrameRequestCallback,number>();
    window.requestAnimationFrame=callback=>native(()=>{const time=(clocks.get(callback)??performance.now())+1000/60;clocks.set(callback,time);callback(time);});
    const extension=WebGL2RenderingContext.prototype.getExtension as (this:WebGL2RenderingContext,name:string)=>unknown;
    Object.defineProperty(WebGL2RenderingContext.prototype,'getExtension',{value:function(this:WebGL2RenderingContext,name:string){return name==='EXT_disjoint_timer_query_webgl2'?null:extension.call(this,name);}});
  });
}
async function enter(page:Page,id:string,label:string,instant=true){
  await page.getByRole('button',{name:'館内案内',exact:false}).click();
  if(instant)await page.getByRole('button',{name:label+'の紹介を移動せずに読む',exact:true}).click();
  else await page.locator('#explorer-guide').getByRole('button',{name:new RegExp(label+'$')}).click();
  if(instant)await expect(page.locator('#'+id+'[data-explorer-panel]')).toBeVisible();
}
const luminance=(rgb:number[])=>rgb.map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((s,n,i)=>s+n*[.2126,.7152,.0722][i],0);

test('all nine room panels preserve source text, links, usable contrast and disclosures',async({page})=>{
  test.setTimeout(240000);await fixture(page);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  const original=await page.locator('#main > section,#main .v4-closing > section').evaluateAll(elements=>elements.map(el=>({id:el.id,text:el.textContent,links:[...el.querySelectorAll('a')].map(a=>[a.textContent,a.getAttribute('href')])})));
  await expect(page.locator('[data-habitat]')).toHaveAttribute('data-explorer-active','true',{timeout:90000});
  await expect(page.locator('[data-explorer-panel]')).toHaveCount(0);
  for(const [id,label] of rooms){
    await enter(page,id,label);
    const panel=page.locator('#'+id+'[data-explorer-panel]');
    const actual=await panel.evaluate(el=>({id:el.id,text:el.textContent,links:[...el.querySelectorAll('a')].map(a=>[a.textContent,a.getAttribute('href')])}));
    expect(actual).toEqual(original.find(item=>item.id===id));
    const content=await panel.locator('h1,h2,h3,p').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>({text:n.textContent,color:getComputedStyle(n).color,font:parseFloat(getComputedStyle(n).fontSize)})));
    // Explicit reading has an opaque, bounded surface; sample the actual CSS
    // surface colour rather than assuming a photographic frame underneath it.
    const paper=await panel.evaluate(el=>getComputedStyle(el).backgroundColor);
    const background=luminance(paper.match(/[\d.]+/g)!.slice(0,3).map(Number));
    for(const item of content){const ink=luminance(item.color.match(/[\d.]+/g)!.slice(0,3).map(Number));const contrast=(Math.max(ink,background)+.05)/(Math.min(ink,background)+.05);expect(contrast,id+':'+item.text).toBeGreaterThanOrEqual(4.5);}
    const box=await panel.boundingBox();expect(box).not.toBeNull();expect(box!.y).toBeGreaterThan(80);expect(box!.y+box!.height).toBeLessThan(790);
    const overflow=await panel.evaluate(el=>el.scrollWidth-el.clientWidth);expect(overflow,id).toBeLessThanOrEqual(1);
  }
  await enter(page,'community','Community');
  const disclosure=page.locator('#community details');await disclosure.locator('summary').focus();await page.keyboard.press('Enter');
  await expect(disclosure).toHaveAttribute('open','');
  const text=await disclosure.locator('.v4-community__details-copy').textContent();
  await enter(page,'founder','Founder');await expect(page.locator('#founder .v4-founder__web-portfolio')).toHaveAttribute('href','https://yuto-matsui.com/');
  await enter(page,'community','Community');await expect(disclosure).toHaveAttribute('open','');expect(await disclosure.locator('.v4-community__details-copy').textContent()).toBe(text);
  await page.getByRole('button',{name:'設定',exact:false}).click();await page.getByRole('button',{name:'サイト情報',exact:true}).click();
  await expect(page.locator('.site-footer')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('.site-footer')).toBeHidden();
  expect(errors).toEqual([]);await page.screenshot({path:'test-results/explorer-community.png'});
});

test('navigation can turn, stop, skip, return through history, and release the renderer',async({page})=>{
  test.setTimeout(180000);await fixture(page);await page.goto('/');
  const root=page.locator('[data-habitat]');await expect(root).toHaveAttribute('data-explorer-active','true',{timeout:90000});
  await enter(page,'technology','Interactive',false);
  const locations:number[][]=[];
  for(let n=0;n<20;n++){await page.waitForTimeout(150);locations.push((await page.locator('[data-explorer-canvas]').getAttribute('data-position'))!.split(',').map(Number));}
  expect(new Set(locations.map(p=>p.join(','))).size).toBeGreaterThan(5);
  for(const p of locations)expect(nav.contains([p[0],p[2]])).toBe(true);
  await page.keyboard.press('Escape');const stopped=await page.locator('[data-explorer-canvas]').getAttribute('data-position');await page.waitForTimeout(350);expect(await page.locator('[data-explorer-canvas]').getAttribute('data-position')).toBe(stopped);
  await enter(page,'resources','Library',false);await page.getByRole('button',{name:'移動をスキップ',exact:true}).click();await expect(root).toHaveAttribute('data-explorer-room','resources');await expect(page.locator('[data-explorer-panel]')).toHaveCount(0);
  await page.getByRole('button',{name:'紹介を読む',exact:true}).click();await expect(page.locator('#resources[data-explorer-panel]')).toBeVisible();
  await enter(page,'contact','Contact');await page.goBack();await expect(page.locator('#resources[data-explorer-panel]')).toBeVisible();
  await page.getByRole('button',{name:'空間に戻る',exact:true}).click();
  const position=await page.locator('[data-explorer-canvas]').getAttribute('data-position');
  await page.mouse.move(1300,400);await page.mouse.down();await page.mouse.move(900,480,{steps:20});await page.mouse.up();await page.waitForTimeout(200);
  expect(await page.locator('[data-explorer-canvas]').getAttribute('data-position')).toBe(position);
  await page.getByRole('radio',{name:'3D OFF',exact:true}).check();
  await expect(root).not.toHaveAttribute('data-explorer-active','true');await expect(page.locator('[data-explorer-canvas] canvas')).toHaveCount(0);
  expect(await page.locator('body').evaluate(el=>getComputedStyle(el).overflow)).not.toBe('hidden');
});

test('short and zoom-equivalent viewports keep actual text sizes, controls and panel scrolling',async({page})=>{
  test.setTimeout(180000);await fixture(page);await page.goto('/');await expect(page.locator('[data-habitat]')).toHaveAttribute('data-explorer-active','true',{timeout:90000});
  for(const [width,height] of [[901,768],[1024,768],[1275,553],[960,540],[1920,1080],[3840,2160]]){
    await page.setViewportSize({width,height});await enter(page,'community','Community');
    const bounds=await page.locator('#community[data-explorer-panel]').boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width+1);
    expect(bounds!.y).toBeGreaterThanOrEqual(80);expect(bounds!.y+bounds!.height).toBeLessThan(height-75);
    const controls=await page.locator('[data-explorer-controls]').boundingBox();expect(controls!.width).toBeLessThanOrEqual(width-24);
    const header=await page.locator('.site-header').boundingBox(),toggle=await page.locator('.site-header [data-3d-toggle]').boundingBox();
    expect(toggle!.x).toBeGreaterThan(header!.x);expect(toggle!.x+toggle!.width).toBeLessThanOrEqual(header!.x+header!.width);
    expect(toggle!.y+toggle!.height).toBeLessThanOrEqual(header!.y+header!.height);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);expect(overflow).toBeLessThanOrEqual(1);
  }
});

test('context loss restores current content and prevents automatic re-entry',async({page})=>{
  test.setTimeout(120000);await fixture(page);await page.goto('/');const root=page.locator('[data-habitat]');await expect(root).toHaveAttribute('data-explorer-active','true',{timeout:90000});
  await enter(page,'founder','Founder');await page.locator('[data-explorer-canvas] canvas').evaluate(canvas=>{(canvas as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();});
  await expect(root).not.toHaveAttribute('data-explorer-active','true');await expect(page.locator('[data-explorer-canvas] canvas')).toHaveCount(0);
  await expect(page.locator('#founder .v4-founder__web-portfolio')).toBeVisible();expect(await page.evaluate(()=>sessionStorage.getItem('compass-explorer-failed-2'))).toBe('true');
  await expect(page.getByRole('radio',{name:'3D OFF',exact:true})).toBeChecked();
});

test('sound only loads after consent and decodes real buffers',async({page})=>{
  test.setTimeout(150000);await fixture(page);const soundRequests:string[]=[];page.on('request',request=>{if(request.url().includes('/media/explorer/audio/'))soundRequests.push(request.url());});
  await page.goto('/');await expect(page.locator('[data-habitat]')).toHaveAttribute('data-explorer-active','true',{timeout:90000});expect(soundRequests).toEqual([]);
  await page.getByRole('button',{name:'設定',exact:false}).click();await page.getByRole('button',{name:'音響 OFF',exact:true}).click();await expect(page.getByRole('button',{name:'音響 ON',exact:true})).toHaveAttribute('aria-pressed','true',{timeout:20000});
  expect(soundRequests.filter(url=>url.endsWith('.mp3'))).toHaveLength(4);
  await page.getByRole('button',{name:'音響 ON',exact:true}).click();await expect(page.getByRole('button',{name:'音響 OFF',exact:true})).toHaveAttribute('aria-pressed','false');
});

test('protected devices and standard preference never fetch the new renderer or assets',async({browser})=>{
  test.setTimeout(120000);
  for(const kind of ['mobile','ipad-landscape','ipad-mouse','standard','reduced','paused','900']){
    const context=await browser.newContext(kind==='mobile'?devices['iPhone 13']:kind==='ipad-landscape'?{...devices['iPad Pro 11'],viewport:{width:1194,height:834}}:{viewport:{width:kind==='900'?900:1440,height:900},reducedMotion:kind==='reduced'?'reduce':'no-preference'});
    const page=await context.newPage();await page.route(/google-analytics|googletagmanager|cloudflareinsights|challenges\.cloudflare/,route=>route.fulfill({status:200,body:''}));
    await page.addInitScript(kind=>{
      localStorage.setItem('compass-3d-mode',kind==='standard'?'off':'on');
      if(kind==='paused')sessionStorage.setItem('compass-habitat-paused','true');
      if(kind==='ipad-mouse'){Object.defineProperty(navigator,'platform',{get:()=> 'MacIntel'});Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5});}
    },kind);
    const requests:string[]=[];page.on('request',request=>{if(/\/habitat\/explorer\/|\/media\/explorer\/|Explorer_engine/.test(request.url()))requests.push(request.url());});
    await page.goto('/');await page.waitForTimeout(1200);expect(requests,kind).toEqual([]);await expect(page.locator('[data-habitat]')).not.toHaveAttribute('data-explorer-active','true');await context.close();
  }
});

test('the photographic TV film loads in its room, advances, pauses and preserves its frame',async({page})=>{
  test.setTimeout(150000);await fixture(page);
  const films:string[]=[];page.on('request',request=>{if(request.url().endsWith('/iss-film.mp4'))films.push(request.url());});
  await page.goto('/');const root=page.locator('[data-habitat]'),host=page.locator('[data-explorer-canvas]');
  await expect(root).toHaveAttribute('data-explorer-active','true',{timeout:90000});expect(films).toEqual([]);
  await enter(page,'technology','Interactive',false);await page.getByRole('button',{name:'移動をスキップ',exact:true}).click();
  await expect(root).toHaveAttribute('data-explorer-room','technology');await expect(page.locator('[data-explorer-panel]')).toHaveCount(0);
  await expect.poll(async()=>Number(await host.getAttribute('data-film-time'))).toBeGreaterThan(.5);
  await page.getByRole('button',{name:'設定',exact:false}).click();await page.getByRole('button',{name:'動きを止める',exact:true}).click();await page.waitForTimeout(250);
  const stopped=Number(await host.getAttribute('data-film-time'));await page.waitForTimeout(800);
  expect(Number(await host.getAttribute('data-film-time'))).toBeCloseTo(stopped,1);
  await page.getByRole('button',{name:'動きを再開',exact:true}).click();await expect.poll(async()=>Number(await host.getAttribute('data-film-time'))).toBeGreaterThan(stopped+.2);
  await page.getByRole('button',{name:'設定',exact:false}).click();
  await page.getByRole('button',{name:'紹介を読む',exact:true}).click();await expect(page.locator('#technology[data-explorer-panel]')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'紹介を読む',exact:true})).toBeFocused();
  expect(films.length).toBeGreaterThan(0);await page.screenshot({path:'test-results/explorer-physical-tv.png'});
});

test('a fresh PC starts real 3D automatically and OFF disposes both renderers',async({page})=>{
  test.setTimeout(150000);
  // No clock or GPU timer overrides: this verifies real admission on the test
  // machine. It is not a certification for other hardware or 15-minute use.
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  const root=page.locator('[data-habitat]');
  await expect(root).toHaveAttribute('data-explorer-active','true',{timeout:90000});
  await expect(page.getByRole('radio',{name:'3D ON',exact:true})).toBeChecked();
  await expect(page.locator('[data-3d-toggle] input')).toHaveCount(2);
  await expect(page.locator('.site-header .header-actions [data-3d-toggle]')).toBeVisible();
  await expect(page.getByRole('navigation',{name:'行き先',exact:true})).toHaveCount(0);
  await expect(page.getByText('空間を探索',{exact:true})).toHaveCount(0);
  await expect(page.locator('[data-habitat-backdrop] canvas')).toHaveCount(0);
  await page.screenshot({path:'outputs/explorer-on-off-real-pc.png'});
  const library=page.locator('.site-header .header-cta--optional');
  await expect(library).toHaveAttribute('href','/future-strategy-library/');
  await library.click();await expect(page).toHaveURL(/\/#resources$/);
  await page.getByRole('button',{name:'移動をスキップ',exact:true}).click();
  await expect(root).toHaveAttribute('data-explorer-room','resources');
  await page.getByRole('button',{name:'紹介を読む',exact:true}).click();
  await expect(page.locator('#resources[data-explorer-panel] a[href="/future-strategy-library/"]').first()).toBeVisible();
  await page.getByRole('radio',{name:'3D OFF',exact:true}).check();
  await expect(page.locator('[data-explorer-canvas] canvas,[data-habitat-backdrop] canvas')).toHaveCount(0);
  await expect(root).not.toHaveAttribute('data-explorer-active','true');
  await page.reload();await expect(page.getByRole('radio',{name:'3D OFF',exact:true})).toBeChecked();
  await page.waitForTimeout(1000);await expect(page.locator('[data-explorer-canvas] canvas,[data-habitat-backdrop] canvas')).toHaveCount(0);
  await page.getByRole('radio',{name:'3D ON',exact:true}).check();
  await expect(root).toHaveAttribute('data-explorer-active','true',{timeout:60000});
  expect(errors).toEqual([]);
});
