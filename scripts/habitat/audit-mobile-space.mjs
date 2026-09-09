import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const base=process.argv[2]??'http://127.0.0.1:8808',out=process.argv[3]??'../mobile-space-review';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch();const report=[];
const ids=['top','vision','experience','technology','resources','manifesto','community','founder','contact'];
for(const width of [320,340,341,390,430,834]){
 const context=await browser.newContext({...devices['iPhone 13'],viewport:{width,height:width===834?1194:844},deviceScaleFactor:1,reducedMotion:'reduce'});
 const page=await context.newPage();const urls=[],errors=[];
 page.on('request',r=>urls.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
 await page.route(/google-analytics|googletagmanager|cloudflareinsights|challenges\.cloudflare/,r=>r.abort());
 await page.goto(base);await page.evaluate(()=>document.fonts.ready);
 for(const id of ids){
  await page.locator('#'+id).scrollIntoViewIfNeeded();
  await page.locator('[data-mobile-scene="'+id+'"] img').waitFor();
  await page.locator('[data-mobile-scene="'+id+'"] img').evaluate(img=>img.decode());
 }
 await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(100);
 await page.screenshot({path:out+'/hero-'+width+'.png'});
 if(width===390){
  for(const id of ids){
   await page.locator('#'+id).evaluate(el=>scrollTo(0,el.getBoundingClientRect().top+scrollY-64));
   await page.waitForTimeout(100);await page.screenshot({path:out+'/'+id+'.png'});
  }
  await page.screenshot({path:out+'/full-390.png',fullPage:true});
 }
 const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,height:document.documentElement.scrollHeight,
  h1:document.querySelectorAll('h1').length,sections:[...document.querySelectorAll('[data-mobile-scene]')].map(el=>({id:el.getAttribute('data-mobile-scene'),state:el.getAttribute('data-film-state'),image:el.querySelector('img')?.currentSrc}))}));
 report.push({width,...geometry,errors,media:urls.filter(u=>u.includes('/habitat/'))});await context.close();
}
await browser.close();writeFileSync(out+'/report.json',JSON.stringify(report,null,2));
