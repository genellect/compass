import { chromium } from '@playwright/test';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
const out=process.argv[2]??'outputs/3d-room-review';await mkdir(out,{recursive:true});
const manifest=JSON.parse(await readFile('public/habitat/explorer/v1/manifest.json','utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--use-angle=d3d11']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],results=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(new URL('/3d/',process.env.EXPLORER_BASE_URL??'http://127.0.0.1:8813/').href);
  await page.locator('[data-explorer-page][data-status="ready"]').waitFor({timeout:90000});
  for(const room of manifest.rooms){
    if(room.id!=='top'){
      await page.getByRole('button',{name:'館内案内',exact:true}).click();
      await page.getByRole('button',{name:room.label+'へ移動',exact:true}).click();
      await page.locator('[data-explorer-canvas][data-room="'+room.id+'"]').waitFor({timeout:30000});
      await page.locator('[data-room-exhibit="'+room.id+'"]').waitFor({state:'visible'});
    }
    await page.screenshot({path:out+'/'+room.id+'.png'});
    results.push(await page.locator('[data-explorer-canvas]').evaluate(element=>({...element.dataset})));
  }
  await writeFile(out+'/result.json',JSON.stringify({mode:'real clock, headless Edge; not physical-device acceptance',results,errors},null,2));
  console.log(JSON.stringify({rooms:results.length,errors},null,2));
} finally { await browser.close(); }
