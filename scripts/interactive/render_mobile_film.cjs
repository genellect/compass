/** Offline derivative of the shipped Blender/Three.js scene; never runs on the website.
 * node scripts/interactive/render_mobile_film.cjs [--still]
 * Set FFMPEG_PATH to an installed ffmpeg executable for the H.264 export.
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { build } = require('esbuild');
const { chromium } = require('playwright');
const sharp = require('sharp');

async function main() {
  const root = path.resolve(__dirname, '../..');
  const output = path.join(root, 'public/interactive/future-hall');
  const frames = path.join(root, 'work/mobile-hall-frames');
  await fs.mkdir(frames, { recursive: true });
  let source = await fs.readFile(path.join(root, 'src/interactive/components/hero/futureHallScene.ts'), 'utf8');
  // Changes apply only to this offline bundle; the Desktop renderer is untouched.
  const replace = (from, to) => {
    if (!source.includes(from)) throw new Error('Capture adapter needs updating: ' + from);
    source = source.replace(from, to);
  };
  replace('resize(); sync();', 'resize();');
  replace('camera.fov = 2 * Math.atan(Math.tan(authoredFov / 2) * Math.min(1, 1.6 / camera.aspect)) * 180 / Math.PI;', 'camera.fov = 58;');
  replace('elapsed * .18', 'elapsed * (Math.PI * 2 / 12)');
  source = source.replaceAll('elapsed * .12', 'elapsed * (Math.PI * 2 / 12)');
  replace('return { setPaused(value)', 'return { captureFrame(time: number) { stop(); elapsed = time; mixer?.setTime(3 * (1 - Math.cos(time * Math.PI * 2 / 12))); render(); return canvas.toDataURL("image/png"); }, setPaused(value)');
  const bundled = await build({ stdin: { contents: source, loader: 'ts', resolveDir: root }, bundle: true, format: 'esm', platform: 'browser', write: false });
  const html = '<!doctype html><style>html,body,section,#scene{margin:0;width:100%;height:100%;overflow:hidden}canvas{display:block}</style><section><div id="scene"></div></section><script type="module">import {createFutureHall} from "/capture.js";window.hall=await createFutureHall(document.querySelector("#scene"),new AbortController().signal,()=>{});window.hall.setPaused(true);window.ready=true;</script>';
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost').pathname;
    if (url === '/') { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
    if (url === '/capture.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(bundled.outputFiles[0].contents); }
    if (!/^\/interactive\/future-hall\/[a-z-]+\.(glb|hdr)$/.test(url)) { res.writeHead(404); return res.end(); }
    try { res.end(await fs.readFile(path.join(root, 'public', url))); } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chromium' });
  try {
    const page = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.ready, undefined, { timeout: 60000 });
    const count = process.argv.includes('--still') ? 1 : 288;
    for (let frame = 0; frame < count; frame++) {
      const data = await page.evaluate(time => window.hall.captureFrame(time), frame / 24);
      await fs.writeFile(path.join(frames, `${String(frame).padStart(4, '0')}.png`), Buffer.from(data.split(',')[1], 'base64'));
      if (frame % 48 === 0) console.log(`Rendered ${frame + 1}/${count}`);
    }
  } finally { await browser.close(); server.close(); }
  await sharp(path.join(frames, '0000.png')).webp({ quality: 88 }).toFile(path.join(output, 'mobile-poster.webp'));
  if (!process.argv.includes('--still')) {
    execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-y', '-framerate', '24', '-i', path.join(frames, '%04d.png'), '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(output, 'mobile-hall.mp4')], { stdio: 'inherit' });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
