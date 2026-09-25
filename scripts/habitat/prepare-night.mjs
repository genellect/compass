import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const source = process.argv[2];
const maps = process.argv[3] || source;
if (!source) throw new Error('Usage: node scripts/habitat/prepare-night.mjs <Blender output directory> [raw map directory]');
const target = 'public/habitat/night-v1';
await mkdir(target, { recursive: true });
await copyFile(path.join(source, 'manifest.json'), path.join(target, 'manifest.json'));
for (const id of ['top', 'vision', 'experience', 'technology', 'resources', 'manifesto', 'community', 'founder', 'contact']) {
  const dimensions = await sharp(path.join(source, `${id}.png`)).metadata();
  if (dimensions.width !== 1920 || dimensions.height !== 1080) throw new Error(`Final 1920x1080 render required: ${id}`);
  await sharp(path.join(source, `${id}.png`)).webp({ quality: 82, effort: 5 }).toFile(path.join(target, `${id}.webp`));
  await sharp(path.join(maps, `${id}-map-0001.png`)).resize(960,540).webp({ lossless: true, effort: 5 }).toFile(path.join(target, `${id}.map.webp`));
  const { data, info } = await sharp(path.join(maps, `${id}-map-0001.png`)).resize(960,540).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let p=0;p<data.length;p+=4) { data[p+3]=data[p+1]; data[p]=data[p+1]=data[p+2]=255; }
  await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).webp({lossless:true}).toFile(path.join(target,`${id}.water.webp`));
}
