import {chromium,webkit,devices} from 'playwright';
import {writeFileSync} from 'node:fs';
const base=process.argv[2]??'http://127.0.0.1:8808',results=[];
for(const [name,engine,profile] of [['chromium',chromium,devices['Pixel 7']],['webkit',webkit,devices['iPhone 13']]]){
 console.log('Starting '+name);let browser,page;const errors=[],requests=[];
 try{
  browser=await engine.launch();page=await browser.newPage({...profile});
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('.mp4'))requests.push({url:r.url(),status:r.status()});});
  await page.route(/google-analytics|googletagmanager|cloudflareinsights|challenges\.cloudflare/,r=>r.abort());
  await page.goto(base);await page.waitForFunction(()=>document.querySelector('[data-mobile-scene="top"]')?.getAttribute('data-film-state')==='playing',null,{timeout:12000});
  const before=await page.locator('[data-mobile-scene="top"] video').evaluate(v=>({width:v.videoWidth,height:v.videoHeight,time:v.currentTime,duration:v.duration,muted:v.muted}));
  await page.getByRole('button',{name:'映像を停止',exact:true}).first().click();
  const paused=await page.locator('[data-mobile-scene="top"] video').evaluate(v=>v.paused);
  await page.getByRole('button',{name:'映像を再生',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('[data-mobile-scene="top"]')?.getAttribute('data-film-state')==='ended',null,{timeout:15000});
  const end=await page.locator('[data-mobile-scene="top"] img').getAttribute('src');
  results.push({engine:name,emulation:true,before,paused,end,errors,requests});
 }catch(error){
  const state=await page?.evaluate(()=>({state:document.querySelector('[data-mobile-scene="top"]')?.getAttribute('data-film-state'),visibility:document.visibilityState,width:innerWidth,video:[...document.querySelectorAll('video')].map(v=>({src:v.src,error:v.error?.message,ready:v.readyState,paused:v.paused,muted:v.muted,time:v.currentTime}))})).catch(()=>null);
  results.push({engine:name,emulation:true,error:String(error),state,errors,requests});process.exitCode=1;
 }finally{await browser?.close();}
 writeFileSync('../mobile-space-review/codecs.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results.at(-1)));
}
