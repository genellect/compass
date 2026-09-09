/** Real headed-browser tour. Do not run alongside render/build jobs.
 * --record captures a short video for visual review, not a performance benchmark.
 */
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const option=(key,fallback)=>process.argv.find(a=>a.startsWith(key+'='))?.slice(key.length+1)??fallback;
const url=option('--url','http://127.0.0.1:8983'),out=path.resolve(option('--out','test-results/habitat-tour'));
const record=process.argv.includes('--record');await mkdir(out,{recursive:true});
const ids=['top','vision','experience','technology','resources','manifesto','community','founder','contact'];
const browser=await chromium.launch({channel:'msedge',headless:false,args:['--start-maximized']});
const context=await browser.newContext({viewport:null,locale:'ja-JP',...(record?{recordVideo:{dir:out,size:{width:1272,height:588}}}:{})});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&/THREE|WebGL|shader/i.test(m.text()))errors.push(m.text());});
await page.route(/google-analytics|googletagmanager|cloudflareinsights/,r=>r.abort());
const report={date:new Date().toISOString(),url,browser:browser.version(),recording:record,errors,areas:[],transitions:[]};
try{
 await page.goto(url);await page.evaluate(()=>document.fonts.ready);
 await page.waitForFunction(()=>document.querySelector('[data-habitat]')?.dataset.sceneState==='ready',null,{timeout:60000});
 report.screen=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio}));
 report.gpu=await page.locator('[data-habitat-backdrop] canvas').evaluate(c=>{const gl=c.getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'Unavailable';});
 const count=record?3:ids.length;
 for(let i=0;i<count;i++){
  const states=[],entered=await page.evaluate(()=>performance.now());
  for(let j=0;j<(record?2:16);j++){
   await page.waitForTimeout(1000);
   states.push(await page.evaluate(()=>({at:performance.now(),visible:!document.hidden,state:document.querySelector('[data-habitat]').dataset.sceneState,section:document.querySelector('[data-habitat]').dataset.sceneSection,...document.querySelector('[data-quality]')?.dataset})));
  }
  const fresh=states.filter(s=>s.fps&&Number(s.fpsAt)>entered);
  const fps=[...new Set(fresh.map(s=>s.fpsAt))].map(at=>Number(fresh.find(s=>s.fpsAt===at).fps));
  report.areas.push({id:ids[i],states,fps,pass:!record&&fps.length>=2&&fps.every(f=>f>=30)&&states.every(s=>s.state==='ready'&&s.section===ids[i]&&s.visible)});
  await writeFile(path.join(out,'tour.json'),JSON.stringify(report,null,2));
  if(i===count-1)break;
  const transition=await page.evaluate(async({from,to})=>{
   const a=document.getElementById(from).getBoundingClientRect(),b=document.getElementById(to).getBoundingClientRect();
   const start=scrollY+a.bottom-innerHeight*.25,end=scrollY+b.top-innerHeight*.34;
   scrollTo({top:start,behavior:'instant'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   const samples=[];let lastSample=-1,started;
   await new Promise(resolve=>{
    const move=time=>{
     started??=time;const p=Math.min(1,(time-started)/8000);
     scrollTo({top:start+(end-start)*p,behavior:'instant'});
     if(Math.floor(p*40)!==lastSample){lastSample=Math.floor(p*40);samples.push({p,state:document.querySelector('[data-habitat]').dataset.sceneState,visible:!document.hidden,...document.querySelector('[data-quality]')?.dataset});}
     if(p<1)requestAnimationFrame(move);else resolve();
    };requestAnimationFrame(move);
   });
   document.getElementById(to).scrollIntoView({behavior:'instant',block:'start'});
   return {from,to,start,end,samples};
  },{from:ids[i],to:ids[i+1]});
  report.transitions.push(transition);
  await page.waitForFunction(id=>document.querySelector('[data-habitat]')?.dataset.sceneSection===id&&document.querySelector('[data-habitat]')?.dataset.sceneState==='ready',ids[i+1],{timeout:30000});
 }
 report.pass=!record&&!errors.length&&report.areas.every(a=>a.pass)&&report.transitions.every(t=>t.samples.every(s=>s.visible&&s.state==='ready'));
 await page.screenshot({path:path.join(out,'final-area.png')});
}finally{
 await context.close();await browser.close();await writeFile(path.join(out,'tour.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({areas:report.areas.map(({id,fps,pass})=>({id,fps,pass})),pass:report.pass,recording:record,errors}));
}
