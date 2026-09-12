import { expect, test, devices, type Page } from '@playwright/test';
import manifest from '../../public/habitat/explorer/v1/manifest.json';

test.use({viewport:{width:1440,height:900},launchOptions:{channel:'msedge',args:['--enable-gpu','--use-angle=d3d11']}});
const prepare=async(page:Page)=>{await page.route(/google-analytics|googletagmanager|cloudflareinsights|challenges\.cloudflare/,route=>route.fulfill({status:200,body:''}));};
const ready=async(page:Page,hash='')=>{await prepare(page);await page.goto('/3d/'+hash);await expect(page.locator('[data-explorer-page]')).toHaveAttribute('data-status','ready',{timeout:60000});};
const position=async(page:Page)=>(await page.locator('[data-explorer-canvas]').getAttribute('data-position'))!.split(',').map(Number);
const visit=async(page:Page,id:string)=>{const label=manifest.rooms.find(room=>room.id===id)!.label;await page.getByRole('button',{name:'館内案内',exact:true}).click();await page.getByRole('button',{name:label+'へ移動',exact:true}).click();await expect(page.locator('[data-explorer-canvas]')).toHaveAttribute('data-room',id,{timeout:30000});};

test('parent page has one integrated entry and never requests the new 3D assets',async({page})=>{
  await prepare(page);const requests:string[]=[];page.on('request',request=>{if(/\/habitat\/explorer\/|\/media\/explorer\/|Explorer_engine/.test(request.url()))requests.push(request.url());});
  await page.goto('/');await expect(page.locator('[data-habitat-media] [data-explorer-entry]')).toBeVisible();
  await expect(page.locator('[data-explorer-page]')).toHaveCount(0);await expect(page.locator('h1')).toHaveCount(1);
  await page.waitForTimeout(1200);expect(requests).toEqual([]);
  await page.locator('[data-explorer-entry]').click();await expect(page).toHaveURL(/\/3d\//);
});

test('fresh arrival stays still; walking, release, look and glass collisions respect direct input',async({page})=>{
  test.setTimeout(100000);await page.addInitScript(()=>sessionStorage.setItem('compass-3d-page-visit',JSON.stringify({room:'top',position:[-5,1.65,-10.5],yaw:0,pitch:0,reading:false})));
  await ready(page);const before=await position(page);await page.waitForTimeout(500);expect(await position(page)).toEqual(before);
  await page.keyboard.down('KeyW');await page.waitForTimeout(1400);await page.keyboard.up('KeyW');
  const stopped=await position(page);expect(stopped[2]).toBeGreaterThan(-10.84);await page.waitForTimeout(350);expect(await position(page)).toEqual(stopped);
  await page.keyboard.down('KeyS');await page.waitForTimeout(700);await page.keyboard.up('KeyS');expect((await position(page))[2]).toBeGreaterThan(stopped[2]+.7);
  await page.mouse.move(700,460);await page.mouse.down();await page.mouse.move(920,460,{steps:12});await page.mouse.up();
  const afterDrag=await position(page);await page.waitForTimeout(2800);expect(await position(page)).toEqual(afterDrag);
  await page.screenshot({path:'outputs/3d-manual-glass.png'});
});

test('all rooms have their contextual source CTA and no generic reader',async({page})=>{
  test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await ready(page);
  await page.screenshot({path:'outputs/3d-hero-review.png'});
  await page.locator('[data-explorer-canvas] canvas').screenshot({path:'outputs/3d-arrival-canvas.png'});
  for(const room of manifest.rooms.slice(1)){
    await visit(page,room.id);
    const exhibit=page.locator('[data-room-exhibit="'+room.id+'"]');await expect(exhibit).toBeVisible({timeout:10000});
    await expect(exhibit.locator('a')).toHaveAttribute('href',/^\/(#|INTRO_Interactive|future-strategy-library|messages|community|contact)|^https:\/\/yuto-matsui\.com/);
    if(['technology','resources','contact'].includes(room.id))await page.screenshot({path:'outputs/3d-room-'+room.id+'.png'});
    await exhibit.locator('a').focus();const before=await position(page);await page.keyboard.press('ArrowDown');expect(await position(page)).toEqual(before);
  }
  await expect(page.getByRole('button',{name:'紹介を読む',exact:true})).toHaveCount(0);expect(errors).toEqual([]);
});

test('closed doors block walking and explicit opening allows forward/backward passage',async({page})=>{
  test.setTimeout(100000);const room=manifest.rooms.find(room=>room.id==='technology')!;
  const point=[room.origin[0]+10*Math.sin(room.yaw),1.65,room.origin[2]+10*Math.cos(room.yaw)];
  await page.addInitScript(({point,yaw})=>sessionStorage.setItem('compass-3d-page-visit',JSON.stringify({room:'technology',position:point,yaw,pitch:0,reading:false})),{point,yaw:room.yaw});
  await ready(page,'#technology');
  const localZ=async()=>{const p=await position(page);return (p[0]-room.origin[0])*Math.sin(room.yaw)+(p[2]-room.origin[2])*Math.cos(room.yaw);};
  await page.keyboard.down('KeyS');await page.waitForTimeout(1500);await page.keyboard.up('KeyS');expect(await localZ()).toBeLessThan(11.72);
  await page.keyboard.press('KeyE');await page.waitForTimeout(1200);const before=await position(page);await page.waitForTimeout(400);expect(await position(page)).toEqual(before);
  await page.keyboard.down('KeyS');await page.waitForTimeout(1800);await page.keyboard.up('KeyS');expect(await localZ()).toBeGreaterThan(12.6);
  await page.keyboard.down('KeyW');try{await expect.poll(localZ,{timeout:6000}).toBeLessThan(11.5);}finally{await page.keyboard.up('KeyW');}
});

test('context loss releases the renderer and keeps direct links and return available',async({page})=>{
  test.setTimeout(100000);await ready(page);
  await page.locator('[data-explorer-canvas] canvas').evaluate(canvas=>(canvas as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext());
  await expect(page.locator('[data-explorer-page]')).toHaveAttribute('data-status','failed');await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'もう一度試す'})).toBeVisible();await page.getByRole('button',{name:'館内案内',exact:true}).click();await expect(page.getByRole('link',{name:'Contactのサイトを開く',exact:true})).toBeVisible();
});

test('Mobile, iPad and reduced motion never start the independent renderer',async({browser})=>{
  test.setTimeout(120000);
  for(const kind of ['mobile','ipad','ipad-mouse','900','reduced']){
    const context=await browser.newContext(kind==='mobile'?devices['iPhone 13']:kind==='ipad'?{...devices['iPad Pro 11'],viewport:{width:1194,height:834}}:{viewport:{width:kind==='900'?900:1440,height:900},reducedMotion:kind==='reduced'?'reduce':'no-preference'});
    const page=await context.newPage();await prepare(page);
    if(kind==='ipad-mouse')await page.addInitScript(()=>{Object.defineProperty(navigator,'platform',{get:()=> 'MacIntel'});Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5});});
    const requests:string[]=[];page.on('request',request=>{if(/\/habitat\/explorer\/|\/media\/explorer\/|Explorer_engine/.test(request.url()))requests.push(request.url());});
    await page.goto('/');if(kind!=='reduced')await expect(page.locator('[data-explorer-entry]')).toHaveCount(0);
    await page.goto('/3d/');await expect(page.locator('[data-explorer-page]')).toHaveAttribute('data-status',kind==='reduced'?'stopped':'unsupported');expect(requests,kind).toEqual([]);await context.close();
  }
});

test('room CTA and controls fit short and wide PC viewports; resizing back restores the page',async({page})=>{
  test.setTimeout(150000);await ready(page);await visit(page,'contact');
  for(const [width,height] of [[901,768],[1024,768],[1275,553],[1440,900],[1920,1080],[3840,2160]]){
    await page.setViewportSize({width,height});
    const exhibit=page.locator('[data-room-exhibit="contact"]');await expect(exhibit).toBeVisible();
    await exhibit.locator('a').scrollIntoViewIfNeeded();
    const bounds=await exhibit.locator('a').boundingBox();expect(bounds).not.toBeNull();
    expect(bounds!.x,width+'px').toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width+1);
    expect(bounds!.y).toBeGreaterThanOrEqual(68);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(height-65);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(page.getByRole('link',{name:'通常サイトへ戻る',exact:false}).first()).toBeVisible();
    await page.getByRole('button',{name:'館内案内',exact:true}).click();
    await page.getByRole('button',{name:'Contactへ移動',exact:true}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'Contactへ移動',exact:true})).toBeInViewport();
    await page.getByRole('button',{name:'館内案内',exact:true}).click();
    if(height===553)await page.screenshot({path:'outputs/3d-low-screen.png'});
  }
  await page.setViewportSize({width:900,height:768});await expect(page.locator('[data-explorer-page]')).toHaveAttribute('data-status','unsupported');await expect(page.locator('canvas')).toHaveCount(0);
  await page.setViewportSize({width:1440,height:900});await expect(page.locator('[data-explorer-page]')).toHaveAttribute('data-status','ready',{timeout:60000});await expect(page.locator('canvas')).toHaveCount(1);
});

test('navigation history, reload, pause, sound opt-in and return retain usable state',async({page})=>{
  test.setTimeout(180000);await prepare(page);await page.goto('/');
  await expect(page.locator('[data-explorer-entry]')).toBeVisible();await page.locator('#community').scrollIntoViewIfNeeded();
  const scroll=await page.evaluate(()=>scrollY);
  await page.locator('[data-explorer-entry]').click();await expect(page.locator('[data-explorer-page]')).toHaveAttribute('data-status','ready',{timeout:60000});
  const audio:string[]=[];page.on('request',r=>{if(r.url().includes('/media/explorer/audio/'))audio.push(r.url());});
  await visit(page,'resources');await visit(page,'contact');await page.goBack();await expect(page.locator('[data-explorer-canvas]')).toHaveAttribute('data-room','resources',{timeout:30000});
  await page.reload();await expect(page.locator('[data-explorer-page]')).toHaveAttribute('data-status','ready',{timeout:60000});await expect(page.locator('[data-explorer-canvas]')).toHaveAttribute('data-room','resources');expect(audio).toEqual([]);
  await page.getByRole('button',{name:'設定',exact:true}).click();await page.getByRole('button',{name:'動きを止める',exact:true}).click();
  await expect(page.locator('[data-explorer-page]')).toHaveAttribute('data-explorer-paused','true');await page.getByRole('button',{name:'動きを再開',exact:true}).click();
  await page.getByRole('button',{name:'音響 OFF',exact:true}).click();await expect(page.getByRole('button',{name:'音響 ON',exact:true})).toHaveAttribute('aria-pressed','true',{timeout:20000});expect(audio.length).toBeGreaterThan(0);
  await page.getByRole('button',{name:'音響 ON',exact:true}).click();await expect(page.getByRole('button',{name:'音響 OFF',exact:true})).toHaveAttribute('aria-pressed','false');
  await page.getByRole('link',{name:'通常サイトへ戻る',exact:false}).first().click();await expect(page).toHaveURL(/\/$/);
  await expect.poll(()=>page.evaluate(savedScroll=>Math.abs(scrollY-savedScroll),scroll),{timeout:10000}).toBeLessThan(12);await expect(page.locator('[data-explorer-page]')).toHaveCount(0);
});
