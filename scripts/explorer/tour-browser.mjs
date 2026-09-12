import { chromium } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
const out=process.argv[2]??'outputs/explorer-tour';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--use-angle=d3d11']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
await page.route(/google-analytics|googletagmanager|cloudflareinsights|challenges\.cloudflare/,route=>route.fulfill({status:200,body:''}));
const errors=[];page.on('pageerror',e=>errors.push(e.message));
// Only visual/interaction fixture time is deterministic. Never cite this as FPS evidence.
await page.addInitScript(()=>{
  localStorage.setItem('compass-explorer-preference','explore');
  const native=requestAnimationFrame.bind(window),clocks=new WeakMap();
  window.requestAnimationFrame=callback=>native(()=>{const time=(clocks.get(callback)??performance.now())+1000/60;clocks.set(callback,time);callback(time);});
  const extension=WebGL2RenderingContext.prototype.getExtension;
  WebGL2RenderingContext.prototype.getExtension=function(name){return name==='EXT_disjoint_timer_query_webgl2'?null:extension.call(this,name);};
});
await page.goto(process.env.EXPLORER_BASE_URL??'http://127.0.0.1:8813/',{waitUntil:'domcontentloaded'});
await page.locator('[data-explorer-active="true"]').waitFor({timeout:90000});
const results=[];
for(const [id,label] of [['top','COMPASS'],['vision','Vision'],['experience','Experience'],['technology','Interactive'],['resources','Library'],['manifesto','Manifesto'],['community','Community'],['founder','Founder'],['contact','Contact']]){
  await page.getByRole('button',{name:'館内案内',exact:false}).click();
  await page.getByRole('button',{name:label+'の紹介を移動せずに読む',exact:true}).click();
  await page.locator('#'+id+'[data-explorer-panel]').waitFor();await page.waitForTimeout(1400);
  results.push(await page.locator('#'+id).evaluate(el=>{
    const b=el.getBoundingClientRect(),h=el.querySelector('h1,h2'),hs=getComputedStyle(h);
    return{id:el.id,bounds:b.toJSON(),heading:h?.textContent,color:hs.color,fill:hs.webkitTextFillColor,scroll:[el.clientWidth,el.scrollWidth,el.clientHeight,el.scrollHeight],metrics:{...document.querySelector('[data-explorer-canvas]').dataset}};
  }));
  await page.screenshot({path:out+'/'+id+'-read.png'});
  await page.getByRole('button',{name:'空間に戻る',exact:true}).click();
  await page.mouse.move(1310,410);await page.mouse.down();await page.mouse.move(780,450,{steps:15});await page.mouse.up();
  await page.waitForTimeout(400);await page.screenshot({path:out+'/'+id+'-room.png'});
}
await writeFile(out+'/result.json',JSON.stringify({fixture:'deterministic visual only',results,errors},null,2));
console.log(JSON.stringify({rooms:results.length,errors},null,2));await browser.close();
