import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const source=process.argv[2];
if(!source)throw new Error('Usage: node prepare-photography.mjs ISS061-E-110527.jpg');
const data=await readFile(source),output=await sharp(data).resize({width:4096,withoutEnlargement:true}).webp({quality:91}).toBuffer();
await writeFile('public/habitat/explorer/v1/iss-horizon.webp',output);
await writeFile('public/habitat/explorer/v1/photography.json',JSON.stringify({source:'https://eol.jsc.nasa.gov/SearchPhotos/photo.pl?mission=ISS061&roll=E&frame=110527',credit:'NASA / Earth Science and Remote Sensing Unit, Johnson Space Center',sourceSha256:createHash('sha256').update(data).digest('hex'),outputSha256:createHash('sha256').update(output).digest('hex'),bytes:output.length,processing:'Resize and WebP encoding only; no generative editing. Distant repeating cyclorama, not a measured panoramic reconstruction.'},null,2)+'\n');
console.log({bytes:output.length});
