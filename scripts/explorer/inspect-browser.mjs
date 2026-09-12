import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const destination=process.argv[2]??'outputs/explorer-first';
await mkdir(destination,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
await context.route(/google-analytics|googletagmanager|cloudflareinsights|challenges\.cloudflare/,route=>route.abort());
const page=await context.newPage(),errors=[],requests=[];
// Visual/interaction fixtures may control time. These results are NOT hardware measurements.
const deterministic=process.argv.includes('--deterministic');
if(deterministic)await page.addInitScript(()=>{
  const original=requestAnimationFrame.bind(window),clocks=new WeakMap();
  window.requestAnimationFrame=callback=>original(()=>{const time=(clocks.get(callback)??performance.now())+1000/60;clocks.set(callback,time);callback(time);});
  const getExtension=WebGL2RenderingContext.prototype.getExtension;
  WebGL2RenderingContext.prototype.getExtension=function(name){return name==='EXT_disjoint_timer_query_webgl2'?null:getExtension.call(this,name);};
});
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
page.on('requestfailed',request=>requests.push({url:request.url(),error:request.failure()?.errorText}));
await page.addInitScript(()=>localStorage.setItem('compass-explorer-preference','explore'));
await page.goto(process.env.EXPLORER_BASE_URL??'http://127.0.0.1:8813/',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(deterministic?28000:18000);
const result=await page.evaluate(()=>({
  active:document.querySelector('[data-habitat]')?.getAttribute('data-explorer-active'),
  habitat:document.querySelector('[data-habitat]')?.getAttribute('data-scene-state'),
  metrics:{...document.querySelector('[data-explorer-canvas]')?.dataset},
  notice:document.querySelector('[data-explorer-controls]')?.textContent,
  panel:document.querySelector('[data-explorer-panel]')?.getBoundingClientRect().toJSON(),
  h1:document.querySelector('h1')?.getBoundingClientRect().toJSON(),
  canvasCount:document.querySelectorAll('canvas').length,
}));
await page.screenshot({path:destination+'/hero.png'});
await writeFile(destination+'/result.json',JSON.stringify({deterministic,result,errors,requests},null,2));
console.log(JSON.stringify({result,errors,requests:requests.filter(r=>r.url.includes('127.0.0.1'))},null,2));
await browser.close();
