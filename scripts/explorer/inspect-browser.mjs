import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const destination=process.argv[2]??'outputs/3d-inspect';
await mkdir(destination,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--use-angle=d3d11']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(new URL('/3d/',process.env.EXPLORER_BASE_URL??'http://127.0.0.1:8813/').href);
  await page.locator('[data-explorer-page][data-status="ready"]').waitFor({timeout:90000});
  const metrics=await page.locator('[data-explorer-canvas]').evaluate(element=>({...element.dataset}));
  await page.screenshot({path:destination+'/hero.png'});
  await page.locator('[data-explorer-canvas] canvas').screenshot({path:destination+'/canvas.png'});
  await writeFile(destination+'/result.json',JSON.stringify({mode:'real clock, headless Edge; not physical-device acceptance',metrics,errors},null,2));
  console.log(JSON.stringify({metrics,errors},null,2));
} finally { await browser.close(); }
