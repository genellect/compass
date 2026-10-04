import { expect, test } from "./responsive-fixture";
import { lakePortraitAnchors as anchors } from "../../src/app/(official)/founder/hero-composition";

test("JP lake portrait: measured composition at desktop and iPhone sizes", async ({ page }, info) => {
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/founder/");
  await page.getByRole("button",{name:"写真 2 を表示",exact:true}).click();
  for (const [width,height] of [[1440,900],[1024,768],[320,568],[375,667],[390,844],[430,932]]) {
    await page.setViewportSize({width,height});
    const crop=page.locator('[data-composition="lake-portrait"] img');
    await expect.poll(async()=>crop.evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(width/2);
    const geometry=await crop.evaluate((el,a)=>{
      const image=el.getBoundingClientRect(),frame=el.closest("figure")!.getBoundingClientRect();
      const scale=image.width/a.sourceWidth;
      return { nose:(image.x+a.noseX*scale-frame.x)/frame.width,head:(image.y+a.headY*scale-frame.y)/frame.height,
        hands:(image.y+a.handsY*scale-frame.y)/frame.height,left:(image.x+a.leftElbowX*scale-frame.x)/frame.width,right:(image.x+a.rightElbowX*scale-frame.x)/frame.width,
        uncovered:image.x>frame.x+.5||image.y>frame.y+.5||image.right<frame.right-.5||image.bottom<frame.bottom-.5};
    },anchors);
    expect(geometry.nose).toBeCloseTo(.5,2); expect(geometry.head).toBeCloseTo(.2,2);
    expect(geometry.hands).toBeLessThan(.9); expect(geometry.left).toBeGreaterThanOrEqual(.059);expect(geometry.right).toBeLessThanOrEqual(.941);
    expect(geometry.uncovered).toBe(false);
    await page.locator('#top').screenshot({path:info.outputPath(`jp-hero-${width}.png`)});
  }
});

for (const route of ["/founder/","/en/"]) {
  test(`Mobile film: composition, controls and lifecycle ${route}`, async ({ page }, info) => {
    const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
    await page.addInitScript(()=>{
      for(const method of ['drawElements','drawArrays'] as const){
        const original=WebGL2RenderingContext.prototype[method];
        Object.defineProperty(WebGL2RenderingContext.prototype,method,{configurable:true,writable:true,value:function(this:WebGL2RenderingContext,...args:unknown[]){
          const canvas=this.canvas as HTMLCanvasElement;
          canvas.dataset.renderCommands=String(Number(canvas.dataset.renderCommands??0)+1);
          return Reflect.apply(original,this,args);
        }});
      }
    });
    await page.setViewportSize({width:390,height:844});
    await page.goto(route);
    const section=page.locator('#fragments');await section.scrollIntoViewIfNeeded();
    const film=section.locator('[data-mobile-fragment-film]');
    await expect(film).toHaveAttribute('data-ready','true',{timeout:20000});
    await expect(section.locator('canvas:visible')).toHaveCount(1);
    await section.screenshot({path:info.outputPath(`mobile-${route.includes('en')?'en':'jp'}-390.png`)});
    const canvas=film.locator('canvas');const moving=await canvas.screenshot();await page.waitForTimeout(700);expect(Buffer.compare(moving,await canvas.screenshot())).not.toBe(0);
    const pause=film.getByRole('button',{name:/一時停止|Pause automatic/});await pause.click();await page.waitForTimeout(250);
    const still=await canvas.screenshot();await page.waitForTimeout(150);expect(Buffer.compare(still,await canvas.screenshot())).toBe(0);
    const viewport=film.locator('[role="group"]');
    const before=await viewport.getAttribute('data-current-photo');await film.getByRole('button',{name:/次の写真|Next image/}).click();
    await expect.poll(()=>viewport.getAttribute('data-current-photo')).not.toBe(before);
    await section.getByRole('button',{name:'Original',exact:true}).click();
    await expect(section.locator('[data-mobile-fragment-film]')).toHaveCount(0);
    await expect(section.locator('img:visible').first()).toBeVisible();
    await section.getByRole('button',{name:'3D',exact:true}).click();await expect(film).toHaveAttribute('data-ready','true');
    await page.setViewportSize({width:701,height:900});await expect(section.locator('[data-mobile-fragment-film]')).toHaveCount(0);await expect(section.locator('canvas')).toHaveCount(0);
    await page.setViewportSize({width:700,height:900});await expect(film).toHaveAttribute('data-ready','true');await expect(section.locator('canvas:visible')).toHaveCount(1);
    for (const [width,height] of [[320,568],[430,932]]) {
      await page.setViewportSize({width,height});await section.scrollIntoViewIfNeeded();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await section.screenshot({path:info.outputPath(`mobile-${route.includes('en')?'en':'jp'}-${width}.png`)});
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    await expect(viewport).toHaveAttribute('data-motion','still');
    await expect(viewport).toHaveAttribute('data-pending-textures','0');
    // Assert the actual GPU draw count and linked background state. Transparent
    // canvas screenshots include compositor-dithered CSS gradients underneath.
    const captureState=()=>canvas.evaluate(el=>({commands:el.getAttribute('data-render-commands'),styles:el.closest('#fragments')!.getAttribute('style')}));
    await canvas.screenshot({path:info.outputPath('reduced-motion.png')});
    const frozen=await captureState();expect(Number(frozen.commands)).toBeGreaterThan(0);
    await page.waitForTimeout(150);expect(await captureState()).toEqual(frozen);
    await film.getByRole('button',{name:/次の写真|Next image/}).click();
    expect(errors).toEqual([]);
    const products=page.locator('[data-products-cinematic]');
    await expect(products.getByRole('link',{name:'GitHub',exact:true})).toHaveAttribute('href','https://github.com/genellect/compass-interactive');
    await expect(products.locator('[data-product="cytellect"] strong')).toHaveText('publication-ready.');
    await expect(products.getByRole('link',{name:route==='/en/'?'Technical Overview':'開発者向け技術情報',exact:true})).toHaveAttribute('href','https://compass-official.pages.dev/INTRO_Interactive/developers/');
  });
}

test('Mobile WebGL failure retains Original photographs',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,name:string,...args:unknown[]){if(name.startsWith('webgl'))return null;return Reflect.apply(original,this,[name,...args]);} as typeof original;});
  await page.goto('/founder/');const section=page.locator('#fragments');await section.scrollIntoViewIfNeeded();
  await expect(section).toHaveAttribute('data-fragment-view','original');await expect(section.locator('img:visible').first()).toBeVisible();
});

test.describe('iPhone-sized touch gestures',()=>{
  test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  test('horizontal drag keeps its position and vertical touch scroll remains native',async({page,context},info)=>{
    await page.goto('/founder/');const section=page.locator('#fragments');await section.scrollIntoViewIfNeeded();
    const film=section.locator('[data-mobile-fragment-film]');await expect(film).toHaveAttribute('data-ready','true');
    const viewport=film.locator('[role="group"]');const bounds=await viewport.boundingBox();expect(bounds).not.toBeNull();
    await film.getByRole('button',{name:'写真フィルムの自動送りを一時停止',exact:true}).click();
    const y=bounds!.y+bounds!.height*.55;
    const cdp=await context.newCDPSession(page);
    const gesture=async(x:number,y:number,dx:number,dy:number)=>{
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/8,y:y+dy*i/8}]});await page.waitForTimeout(20);}
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    };
    const before=await viewport.getAttribute('data-current-photo');
    await gesture(350,y,-310,0);await expect.poll(()=>viewport.getAttribute('data-current-photo')).not.toBe(before);
    const scrollBefore=await page.evaluate(()=>scrollY);
    await gesture(190,y,0,-150);await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(scrollBefore+30);
    await section.scrollIntoViewIfNeeded();await section.screenshot({path:info.outputPath('iphone-touch-film.png')});
    await page.emulateMedia({reducedMotion:'reduce'});
    const seen=new Set<string>();
    for(let i=0;i<19;i++){
      await expect(viewport).toHaveAttribute('data-pending-textures','0');
      seen.add((await viewport.getAttribute('data-current-photo'))!);
      const key=await viewport.getAttribute('data-current-photo');await film.getByRole('button',{name:'次の写真',exact:true}).click();
      await expect.poll(()=>viewport.getAttribute('data-current-photo')).not.toBe(key);
    }
    expect(seen.size).toBe(19);await cdp.detach();
  });
});
