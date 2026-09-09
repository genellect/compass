import sharp from 'sharp';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Original fictional planet, sampled on a sphere so longitude has no seam.
// No external imagery or geographic claim. Fractal relief and cloud bands.
export async function createPlanetTexture(filename) {
  const width = 4096, height = 2048, pixels = Buffer.alloc(width * height * 3);
  const hash = (x, y, z) => {
    const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const mix = (a, b, t) => a + (b - a) * t;
  const noise = (x, y, z) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const smooth = n => n * n * (3 - 2 * n);
    const a = smooth(x - ix), b = smooth(y - iy), c = smooth(z - iz);
    return mix(
      mix(mix(hash(ix,iy,iz), hash(ix+1,iy,iz),a), mix(hash(ix,iy+1,iz),hash(ix+1,iy+1,iz),a),b),
      mix(mix(hash(ix,iy,iz+1),hash(ix+1,iy,iz+1),a), mix(hash(ix,iy+1,iz+1),hash(ix+1,iy+1,iz+1),a),b), c);
  };
  const fbm = (x,y,z) => noise(x,y,z)*.52+noise(x*2.1,y*2.1,z*2.1)*.27+noise(x*4.3,y*4.3,z*4.3)*.14+noise(x*8.7,y*8.7,z*8.7)*.07;
  for (let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const lat = (y/height-.5)*Math.PI, lon=x/width*Math.PI*2;
    const a=Math.cos(lat)*Math.cos(lon), b=Math.sin(lat), c=Math.cos(lat)*Math.sin(lon);
    const terrain=fbm(a*3+12,b*3+9,c*3+6);
    const warp=fbm(a*11+33,b*11+41,c*11+27);
    const cloud=Math.min(1,Math.max(0,(fbm(a*27+b*warp*3+33,b*37+41,c*27+27)-.48)*5))
      *Math.min(1,Math.max(0,(fbm(a*6+6,b*8+7,c*6+8)-.37)*5));
    const ice=Math.max(0,(Math.abs(b)-.89)*8);
    const land=terrain>.53;
    const color=land?[32+terrain*37,47+terrain*40,34+terrain*27]:[7+terrain*8,22+terrain*20,39+terrain*26];
    for(let k=0;k<3;k++) pixels[(y*width+x)*3+k]=Math.round(mix(color[k],225,Math.min(1,cloud+ice)));
  }
  await sharp(pixels,{raw:{width,height,channels:3}}).webp({quality:90}).toFile(filename);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await createPlanetTexture(path.resolve(process.argv[2] ?? 'public/habitat/v2/planet.webp'));
}
