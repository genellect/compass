/** Offline preparation after downloading the sources listed in ASSET_CREDITS.md.
 * node scripts/habitat/prepare-source-materials.mjs SOURCE_DIR DESTINATION_DIR
 * Kept separate from Next.js builds; no API or authoring inputs are fetched by visitors.
 */
import sharp from 'sharp';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
if(process.argv.length<4)throw new Error('Pass authoring sources and output directory.');
const [source,destination]=process.argv.slice(2).map(p=>path.resolve(p));
await mkdir(destination,{recursive:true});
const input=path.join(source,'nasa-blue-marble-july.jpg');
const bytes=await readFile(input);
await sharp(bytes).resize(4096,2048,{fit:'fill'}).webp({quality:94}).toFile(path.join(destination,'planet.webp'));
await writeFile(path.join(destination,'earth-source.json'),JSON.stringify({
 credit:'NASA Earth Observatory',asset:'Blue Marble: Next Generation, July 2004',
 source:'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography/july/world.topo.200407.3x5400x2700.jpg',
 sha256:createHash('sha256').update(bytes).digest('hex'),width:4096,height:2048,
},null,2)+'\n');
