import { readdir, readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const directory = path.resolve(root, 'public/habitat/v3');
const intermediate = path.resolve(root, '../habitat-renders/v3');
await mkdir(intermediate, { recursive: true });
for (const filename of await readdir(directory)) {
  if (!filename.endsWith('.png')) continue;
  const input = path.join(directory, filename);
  const metadata=await sharp(input).metadata();
  if(metadata.width!==1920||metadata.height!==1080)throw new Error('Draft render cannot be published: '+filename);
  await sharp(input).webp({ quality: 90 }).toFile(path.join(directory, filename.replace('.png', '.webp')));
  // Both resolved paths are under this isolated workspace; retain source renders outside public/.
  if (!input.startsWith(root + path.sep) || !intermediate.startsWith(path.dirname(root) + path.sep)) throw new Error('Unsafe asset path');
  await rename(input, path.join(intermediate, filename));
}
const manifestPath = path.join(directory, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.posters = [];
manifest.environment = await Promise.all(['planet.webp','room.hdr'].map(async file=>({file,bytes:(await readFile(path.join(directory,file))).byteLength})));
for (const section of manifest.sections) {
  const file = section.id + '.webp';
  const buffer = await readFile(path.join(directory, file));
  manifest.posters.push({ file, bytes: buffer.byteLength });
}
if(manifest.sections.some(section=>section.id!=='top'&&!manifest.lightmaps?.some(item=>item.file===`architecture-${section.id}.webp`)))throw new Error('Room-specific architectural lighting is incomplete');
manifest.totalBytes = [...manifest.assets, ...manifest.posters, ...manifest.environment, ...manifest.lightmaps].reduce((sum, asset) => sum + asset.bytes, 0);
if (manifest.totalBytes > 40_000_000) throw new Error('Habitat exceeds 40MB quality-first asset budget');
for (const asset of manifest.assets) if (asset.bytes > 8_000_000) throw new Error(`${asset.file} exceeds 8MB quality-first budget`);
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ totalBytes: manifest.totalBytes, assets: manifest.assets.length, posters: manifest.posters.length }));
