import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const [before='http://127.0.0.1:8809',after='http://127.0.0.1:8808',output='../mobile-boundary-review']=process.argv.slice(2);
mkdirSync(output,{recursive:true});
const browser=await chromium.launch();
const results=[];
const protectedCases=[
  ...[[901,553],[1275,553],[1440,900]].map(([width,height])=>({path:'/',width,height,scope:'page'})),
  {path:'/',width:1194,height:834,scope:'page',touch:true},
  ...['/INTRO_Interactive/','/INTRO_Interactive/developers/','/founder/','/en/'].flatMap(path=>[390,1440].map(width=>({path,width,height:width===390?844:900,scope:'page'}))),
  ...['/future-strategy-library/','/messages/','/contact/','/community/join/'].map(path=>({path,width:390,height:844,scope:'main'})),
];
for(const item of protectedCases){
  const context=await browser.newContext({...item.touch?devices['iPad Pro 11']:{},viewport:{width:item.width,height:item.height},reducedMotion:'reduce'});
  const snapshots=[];
  for(const [label,base] of [['before',before],['after',after]]){
    const page=await context.newPage();
    await page.route(/google-analytics|googletagmanager|cloudflareinsights|challenges\.cloudflare/,r=>r.abort());
    await page.goto(base+item.path);await page.evaluate(()=>document.fonts.ready);
    await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important} [data-reveal]{opacity:1!important;transform:none!important}'});
    await page.waitForTimeout(500);
    const state=await page.evaluate(scope=>{
      const main=document.querySelector('main');const root=scope==='main'?main:document.body;
      const properties=['display','position','color','backgroundColor','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textAlign','padding','margin','borderWidth','borderColor','borderRadius','boxShadow','opacity'];
      return [...root.querySelectorAll('*')].filter(e=>!e.closest('script,style,[data-mobile-scene]')).map(e=>{
        const c=getComputedStyle(e),r=e.getBoundingClientRect();
        return {tag:e.tagName,text:e.children.length?null:e.textContent?.trim(),href:e.getAttribute('href'),
          box:[r.x,r.y,r.width,r.height].map(v=>Math.round(v*100)/100),style:Object.fromEntries(properties.map(p=>[p,c[p]]))};
      });
    },item.scope);
    const digest=createHash('sha256').update(JSON.stringify(state)).digest('hex');
    const name=`${item.path.replaceAll('/','_')||'root'}-${item.width}${item.touch?'-touch':''}-${label}`;
    if(item.scope==='page') await page.screenshot({path:`${output}/${name}.png`});
    snapshots.push({digest,state});await page.close();
  }
  const equal=snapshots[0].digest===snapshots[1].digest;
  const changes=equal?[]:snapshots[0].state.flatMap((value,index)=>JSON.stringify(value)===JSON.stringify(snapshots[1].state[index])?[]:[{index,before:value,after:snapshots[1].state[index]}]).slice(0,20);
  results.push({...item,equal,beforeCount:snapshots[0].state.length,afterCount:snapshots[1].state.length,changes});
  console.log(JSON.stringify({...item,equal}));await context.close();
}
await browser.close();writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
if(results.some(r=>!r.equal))process.exitCode=1;
