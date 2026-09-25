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
}
