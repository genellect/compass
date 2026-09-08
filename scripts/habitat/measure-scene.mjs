/** Measure a real headed browser without emulating a viewport larger than its window.
 * node scripts/habitat/measure-scene.mjs --url=http://127.0.0.1:8983 --out=../scene-measure
 * Run with other render/build jobs stopped. Browser visibility is recorded, not assumed.
 */
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const option=(name,fallback)=>process.argv.find(a=>a.startsWith(name+'='))?.slice(name.length+1)??fallback;
const base=option('--url','http://127.0.0.1:8983'),out=path.resolve(option('--out','test-results/scene-measure'));
const section=option('--section','top');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:false,args:['--start-maximized']});
const context=await browser.newContext({viewport:null,locale:'ja-JP'});
await context.route(/google-analytics|googletagmanager|cloudflareinsights/,r=>r.abort());
const page=await context.newPage();const errors=[],states=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error'&&/THREE|WebGL|shader/i.test(message.text()))errors.push(message.text());});
const report={date:new Date().toISOString(),browser:browser.version(),section,url:base,errors,states};
try {
 await page.goto(base+'/#'+section);await page.evaluate(()=>document.fonts.ready);
 report.screen=await page.evaluate(()=>({innerWidth,innerHeight,outerWidth,outerHeight,dpr:devicePixelRatio,
  available:[screen.availWidth,screen.availHeight],visual:{width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale},visible:!document.hidden}));
 await page.waitForFunction(()=>['ready','failed','static'].includes(document.querySelector('[data-habitat]')?.dataset.sceneState),null,{timeout:60000});
 report.gpu=await page.locator('[data-habitat-backdrop] canvas').evaluateAll(canvases=>{
  const gl=canvases[0]?.getContext('webgl2'),ext=gl?.getExtension('WEBGL_debug_renderer_info');
  return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'No active WebGL context';
 });
 for(let i=0;i<20;i++){
  await page.waitForTimeout(1000);
  states.push(await page.evaluate(()=>({at:performance.now(),visible:!document.hidden,section:document.querySelector('[data-habitat]').dataset.sceneSection,
   state:document.querySelector('[data-habitat]').dataset.sceneState,...document.querySelector('[data-habitat-backdrop]>div:nth-child(2)').dataset})));
 }
 await page.screenshot({path:path.join(out,section+'.png')});
 const frames=states.filter(s=>s.state==='ready'&&s.fps&&Number(s.fpsAt)>=states[0].at);
 report.measuredFps=[...new Set(frames.map(s=>s.fpsAt))].map(at=>Number(frames.find(s=>s.fpsAt===at).fps));
 report.hardware=typeof report.gpu==='string'&&!/SwiftShader|llvmpipe|software|No active/i.test(report.gpu);
 report.correctSection=states.every(s=>s.section===section);
 report.animationStayedReady=states.every(s=>s.state==='ready'&&s.visible);
 report.performanceTargetMet=!errors.length&&report.hardware&&report.correctSection&&report.animationStayedReady&&report.measuredFps.length>=2&&report.measuredFps.every(f=>f>=30);
 console.log(JSON.stringify(report,null,2));
}finally{
 await writeFile(path.join(out,'measurement.json'),JSON.stringify(report,null,2));await browser.close();
}
