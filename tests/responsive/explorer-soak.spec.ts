import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import manifest from '../../public/habitat/explorer/v1/manifest.json';

test.use({ viewport:{width:1440,height:900}, trace:'off', launchOptions:{channel:'msedge',args:['--enable-gpu','--use-angle=d3d11']} });
test('15 minute continuous room travel retains one renderer and bounded resources',async({page})=>{
  test.skip(process.env.EXPLORER_SOAK!=='1','Explicit, long-running GPU acceptance check');
  test.setTimeout(1020000);
  await page.route(/google-analytics|googletagmanager|cloudflareinsights|challenges\.cloudflare/,r=>r.fulfill({status:200,body:''}));
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/3d/');await expect(page.locator('[data-explorer-page]')).toHaveAttribute('data-status','ready',{timeout:60000});
  const started=Date.now(), samples:Record<string,string|number|undefined>[]=[], route=manifest.rooms.slice(1);let visits=0;
  while(Date.now()-started<900000){
    const room=route[visits%route.length];
    await page.getByRole('button',{name:'館内案内',exact:true}).click();
    await page.getByRole('button',{name:room.label+'へ移動',exact:true}).click();
    await expect(page.locator('[data-explorer-canvas]')).toHaveAttribute('data-room',room.id,{timeout:35000});
    await expect(page.locator('[data-explorer-page]')).toHaveAttribute('data-explorer-phase','idle',{timeout:7000});
    await page.waitForTimeout(3200);
    await page.keyboard.down('KeyW');await page.waitForTimeout(180);await page.keyboard.up('KeyW');
    await page.keyboard.down('KeyS');await page.waitForTimeout(180);await page.keyboard.up('KeyS');
    await expect(page.locator('canvas')).toHaveCount(1);
    const metrics=await page.locator('[data-explorer-canvas]').evaluate(el=>({...((el as HTMLElement).dataset)}));
    samples.push({seconds:Math.round((Date.now()-started)/1000),...metrics});visits++;
    if(visits%8===0)console.log('Soak:',Math.round((Date.now()-started)/1000),'seconds,',visits,'room visits; fps',metrics.fps,'estimated MiB',metrics.gpuEstimatedMiB);
  }
  const renderer=await page.locator('canvas').evaluate(el=>{const gl=(el as HTMLCanvasElement).getContext('webgl2')!,extension=gl.getExtension('WEBGL_debug_renderer_info');return extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
  await writeFile('outputs/explorer-soak-20260913.json',JSON.stringify({date:new Date().toISOString(),renderer,viewport:{width:1440,height:900},seconds:(Date.now()-started)/1000,visits,errors,samples},null,2));
  expect(errors).toEqual([]);expect(visits).toBeGreaterThan(24);
  await expect(page.locator('[data-explorer-page]')).toHaveAttribute('data-status','ready');
  // Estimates are not a driver memory measurement; compare matching rooms across revisits.
  for(const room of route){const same=samples.filter(s=>s.room===room.id);if(same.length>1)expect(Number(same.at(-1)!.gpuEstimatedMiB)-Number(same[0].gpuEstimatedMiB),room.id).toBeLessThan(40);}
});
