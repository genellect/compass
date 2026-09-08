import { chromium, webkit, firefox } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = new Map(process.argv.slice(2).map(arg => { const i=arg.indexOf('=');return [arg.slice(0,i),arg.slice(i+1)]; }));
const origin = args.get('--url') ?? 'http://127.0.0.1:8983';
const destination = path.resolve(args.get('--out') ?? 'test-results/habitat-audit');
await mkdir(destination,{recursive:true});
const headed = args.get('--headed') === 'true';
const engine = args.get('--browser') === 'webkit' ? webkit : args.get('--browser') === 'firefox' ? firefox : chromium;
const browser = await engine.launch({headless:!headed, ...(args.get('--channel') ? {channel:args.get('--channel')} : {}),
  ...(engine === chromium ? {args:['--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']} : {})});
const context=await browser.newContext({viewport:{width:1440,height:900},locale:'ja-JP',reducedMotion:args.get('--static')==='true'?'reduce':'no-preference'});
await context.route('**/*', route => {
  const request=route.request(), url=new URL(request.url());
  if (!['GET','HEAD'].includes(request.method()) || /google-analytics|googletagmanager|cloudflareinsights|challenges\.cloudflare/.test(url.hostname)) return route.abort();
  return route.continue();
});
const page=await context.newPage();
const report={date:new Date().toISOString(),origin,browser:await browser.version(),headed,viewports:[],scenes:[],errors:[]};
const network=async target=>{
  if(args.get('--network')!=='wifi'||engine!==chromium)return;
  const session=await context.newCDPSession(target);
  await session.send('Network.enable');
  await session.send('Network.setCacheDisabled',{cacheDisabled:true});
  await session.send('Network.emulateNetworkConditions',{offline:false,latency:20,downloadThroughput:5_000_000,uploadThroughput:2_500_000,connectionType:'wifi'});
  report.network={simulated:true,latencyMs:20,downloadBytesPerSecond:5_000_000,uploadBytesPerSecond:2_500_000,cacheDisabled:true};
};
await network(page);
page.on('pageerror',error=>report.errors.push(error.message));
const collectVitals=()=>{
  window.__habitatVitals={cls:0,lcp:0};
  if(PerformanceObserver.supportedEntryTypes.includes('layout-shift')) new PerformanceObserver(list=>{for(const e of list.getEntries()) if(!e.hadRecentInput) window.__habitatVitals.cls+=e.value;}).observe({type:'layout-shift',buffered:true});
  if(PerformanceObserver.supportedEntryTypes.includes('largest-contentful-paint')) new PerformanceObserver(list=>{window.__habitatVitals.lcp=list.getEntries().at(-1)?.startTime??0;}).observe({type:'largest-contentful-paint',buffered:true});
};
await context.addInitScript(collectVitals);
try {
  await page.goto(origin);await page.locator('[data-habitat][data-enabled]').waitFor();
  await page.waitForFunction(()=>['ready','failed','static'].includes(document.querySelector('[data-habitat]')?.dataset.sceneState),{},{timeout:45000});
  await page.waitForTimeout(3000);
  report.initialVitals=await page.evaluate(()=>window.__habitatVitals);
  report.initialTransfers=await page.evaluate(()=>performance.getEntriesByType('resource')
    .filter(e=>new URL(e.name).origin===location.origin)
    .map(e=>({path:new URL(e.name).pathname,encodedBodySize:e.encodedBodySize,transferSize:e.transferSize})));
  report.renderer=await page.locator('[data-habitat-backdrop] canvas').evaluate(canvas=>{
    const gl=canvas.getContext('webgl2'), debug=gl?.getExtension('WEBGL_debug_renderer_info');
    return debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unavailable';
  }).catch(()=> 'No WebGL renderer');
  // A headed run records real renderer frames on this machine; headless is functional evidence.
  const ids=['top','vision','experience','technology','resources','manifesto','community','founder','contact'];
  for(const id of ids) {
    await page.evaluate(id=>document.getElementById(id).scrollIntoView({behavior:'instant',block:'start'}),id);
    await page.waitForFunction(id=>document.querySelector('[data-habitat]')?.dataset.sceneSection===id,id);
    await page.waitForTimeout(headed?12000:1000);
    report.scenes.push(await page.evaluate(()=>({section:document.querySelector('[data-habitat]').dataset.sceneSection,state:document.querySelector('[data-habitat]').dataset.sceneState,...document.querySelector('[data-habitat-backdrop] > div:nth-child(2)').dataset})));
  }
  const viewports=[[320,844],[390,844],[430,932],[900,768],[901,768],[1024,768],[1275,553],[1280,720],[1366,768],[1440,900],[1920,1080],[2560,1440],[3840,2160]];
  for(const [width,height] of viewports) {
    await page.setViewportSize({width,height});
    await page.evaluate(()=>document.getElementById('technology').scrollIntoView({behavior:'instant',block:'start'}));
    await page.locator('.v4-technology__interactive-title').scrollIntoViewIfNeeded();
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForTimeout(800);
    report.viewports.push(await page.evaluate(()=>{
      const title=document.querySelector('.v4-technology__interactive-title'), card=title.closest('article');
      const range=document.createRange();range.selectNodeContents(title);
      const bounds=card.getBoundingClientRect(),lines=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0);
      return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,enabled:document.querySelector('[data-habitat]').dataset.enabled,
        overflow:document.documentElement.scrollWidth-innerWidth,titleFits:lines.every(r=>r.left>=bounds.left-1&&r.right<=bounds.right+1),h1:document.querySelectorAll('h1').length,
        card:{left:bounds.left,right:bounds.right},titleLines:lines.map(r=>({left:r.left,right:r.right}))};
    }));
  }
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(()=>document.getElementById('top').scrollIntoView({behavior:'instant',block:'start'}));
  await page.waitForTimeout(1000);
  await page.screenshot({path:path.join(destination,'desktop.png')});
  const content = () => {
    const main=document.querySelector('main').cloneNode(true);
    main.querySelectorAll('.v4-technology__interactive-title').forEach(n=>n.remove());
    return {copy:main.textContent.replace(/\s+/g,' ').trim(),links:[...main.querySelectorAll('a')].map(a=>a.getAttribute('href')),
      sections:[...main.querySelectorAll('section[id]')].map(n=>n.id)};
  };
  if(args.get('--baseline')) {
    const current=await page.evaluate(content),baseline=await context.newPage();
    await network(baseline);
    await baseline.goto(args.get('--baseline'));await baseline.waitForTimeout(3000);
    report.baselineVitals=await baseline.evaluate(()=>window.__habitatVitals);
    const before=await baseline.evaluate(content);
    report.preservedContent=JSON.stringify(current)===JSON.stringify(before);
    await baseline.close();
  }
  report.pass=report.errors.length===0&&report.viewports.every(v=>v.overflow<=1&&v.titleFits&&v.h1===1)&&report.preservedContent!==false;
  await writeFile(path.join(destination,'audit.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  if(!report.pass) process.exitCode=1;
} finally {await browser.close();}
