import { readdir, readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createPlanetTexture } from './planet-texture.mjs';

const root = process.cwd();
const directory = path.resolve(root, 'public/habitat/v1');
const intermediate = path.resolve(root, '../habitat-renders');
await mkdir(intermediate, { recursive: true });
for (const filename of await readdir(directory)) {
  if (!filename.endsWith('.png')) continue;
  const input = path.join(directory, filename);
  await sharp(input).webp({ quality: 84 }).toFile(path.join(directory, filename.replace('.png', '.webp')));
  // Both resolved paths are under this isolated workspace; retain source renders outside public/.
  if (!input.startsWith(root + path.sep) || !intermediate.startsWith(path.dirname(root) + path.sep)) throw new Error('Unsafe asset path');
  await rename(input, path.join(intermediate, filename));
}
const manifestPath = path.join(directory, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.posters = [];
await createPlanetTexture(path.join(directory, 'planet.webp'));
manifest.environment = await Promise.all(['planet.webp','room.hdr'].map(async file=>({file,bytes:(await readFile(path.join(directory,file))).byteLength})));
for (const section of manifest.sections) {
  section.filmOffset = [-4.32,4.32,-1.728,4.32,-4.32,4.32,-4.32,4.32,-4.32][manifest.sections.indexOf(section)];
  const file = section.id + '.webp';
  const buffer = await readFile(path.join(directory, file));
  manifest.posters.push({ file, bytes: buffer.byteLength });
}
manifest.totalBytes = [...manifest.assets, ...manifest.posters, ...manifest.environment].reduce((sum, asset) => sum + asset.bytes, 0);
if (manifest.totalBytes > 40_000_000) throw new Error('Habitat exceeds 40MB quality-first asset budget');
for (const asset of manifest.assets) if (asset.bytes > 8_000_000) throw new Error(`${asset.file} exceeds 8MB quality-first budget`);
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ totalBytes: manifest.totalBytes, assets: manifest.assets.length, posters: manifest.posters.length }));
