import sharp from 'sharp';
import { stat } from 'node:fs/promises';
// Capture the actual arrival canvas with inspect-browser.mjs first.
const source=process.argv[2]??'outputs/3d-inspect/canvas.png';
const target='public/habitat/explorer/v1/arrival.webp';
await sharp(source).resize({width:1440,withoutEnlargement:true}).webp({quality:78}).toFile(target);
console.log(JSON.stringify({target,bytes:(await stat(target)).size}));
