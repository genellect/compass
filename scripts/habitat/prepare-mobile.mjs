/** Offline only: node scripts/habitat/prepare-mobile.mjs SOURCE_DIR FFMPEG_PATH.
 * Actual ISS photos/timelapse. Download/trim commands: docs/mobile-space-media.md.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
const [inputArg, ffmpegArg] = process.argv.slice(2);
if (!inputArg || !ffmpegArg) throw new Error('Supply source directory and FFmpeg executable');
const input=resolve(inputArg),ffmpeg=resolve(ffmpegArg),output=resolve('public/habitat/mobile-v1');
const base='/habitat/mobile-v1/',temp=join(input,'prepared');
mkdirSync(temp,{recursive:true});mkdirSync(output,{recursive:true});
const svs='https://svs.gsfc.nasa.gov/31375/';
const eol='https://eol.jsc.nasa.gov/SearchPhotos/photo.pl?mission=ISS061&roll=E&frame=110527';
const wallpapers='https://www.nasa.gov/international-space-station/desktop-and-mobile-wallpapers/';
const shots=[
 {id:'top',file:'aurora-hero-source.mp4',film:true,x:1050,source:svs,sourceStart:8},
 {id:'vision',file:'ISS061-E-110527.jpg',x:.36,source:eol},
 {id:'experience',file:'jet.png',x:.5,source:wallpapers},
 {id:'technology',file:'aurora-full.tif',x:.63,source:svs},
 {id:'resources',file:'ISS061-E-110527.jpg',x:.68,source:eol},
 {id:'manifesto',file:'sunset.png',x:.5,source:wallpapers},
 {id:'community',file:'aurora-community-source.mp4',film:true,x:1700,source:svs,sourceStart:54},
 {id:'founder',file:'wispy.png',x:.5,source:wallpapers},
 {id:'contact',file:'sunset.png',x:.5,source:wallpapers}
];
const run=args=>execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y',...args],{stdio:'inherit'});
const frame=(source,time,name)=>{
 const file=join(temp,name+'.png');run(['-ss',String(time),'-i',source,'-frames:v','1',file]);return file;
};
const encodeImage=async(source,stem,widths,ratio,focus=.5)=>{
 const m=await sharp(source).metadata(),height=m.height,width=m.width;
 const cropWidth=Math.min(width,Math.floor(height/ratio)),cropHeight=Math.min(height,Math.floor(width*ratio));
 const crop={left:Math.round((width-cropWidth)*focus),top:Math.round((height-cropHeight)*.5),width:cropWidth,height:cropHeight};
 const variants=[];
 for(const targetWidth of widths){
  const file=stem+'-'+targetWidth+'.webp',targetHeight=Math.round(targetWidth*ratio);
  await sharp(source).extract(crop).resize(targetWidth,targetHeight).webp({quality:83,effort:6}).toFile(join(output,file));
  variants.push({src:base+file,width:targetWidth,height:targetHeight,bytes:statSync(join(output,file)).size});
 }
 return variants;
};
const sections=[];
for(const shot of shots){
 const sourceFile=join(input,shot.file),hash=createHash('sha256').update(readFileSync(sourceFile)).digest('hex');
 const videos=[];let initial=sourceFile,last=null,tablet=sourceFile;
 if(shot.film){
  for(const width of [720,1080]){
   const file=shot.id+'-'+width+'.mp4';
   const filter='crop=1152:2048:'+shot.x+':0,scale='+width+':'+width*16/9+':flags=lanczos,fps=24';
   run(['-i',sourceFile,'-t','8','-vf',filter,'-c:v','libx264','-preset','slow','-crf','20',
    '-maxrate','3500k','-bufsize','7000k','-pix_fmt','yuv420p','-movflags','+faststart','-an',join(output,file)]);
   const bytes=statSync(join(output,file)).size;
   if(bytes>4_000_000)throw new Error(file+' exceeds 4MB');
   videos.push({src:base+file,width,height:width*16/9,bytes,duration:8,fps:24,audio:false});
  }
  const encoded=join(output,shot.id+'-1080.mp4');
  initial=frame(encoded,0,shot.id+'-first');last=frame(encoded,191/24,shot.id+'-last');
  tablet=frame(sourceFile,0,shot.id+'-tablet');
 }
 const posters=await encodeImage(initial,shot.id,[720,1080],16/9,shot.film?.5:shot.x);
 const tablets=await encodeImage(tablet,shot.id+'-tablet',[768,1080],4/3,shot.film?.5:shot.x);
 const ends=last?await encodeImage(last,shot.id+'-end',[720,1080],16/9):[];
 sections.push({id:shot.id,poster:posters[0].src,tablet:tablets[0].src,end:ends[0]?.src??null,
  video:shot.film?base+shot.id+'-{size}.mp4':null,posters,tablets,ends,videos,focus:[50,50],
  source:shot.source,sourceFile:shot.file,sourceSha256:hash,sourceStart:shot.sourceStart??null,
  credit:'NASA / Earth Science and Remote Sensing Unit, Johnson Space Center'});
 console.log(shot.id+': '+posters[0].bytes+'B poster; '+videos.map(v=>v.bytes+'B').join(', ')+' film');
}
if(sections[0].posters.some(p=>p.bytes>250_000))throw new Error('Hero poster exceeds 250KB');
for(const kind of ['posters','tablets'])for(const size of [0,1]){
 if(sections.reduce((sum,s)=>sum+s[kind][size].bytes,0)>2_500_000)throw new Error('Still budget exceeded');
}
writeFileSync(join(output,'manifest.json'),JSON.stringify({version:'mobile-space-v1',productionReady:false,
 status:'Actual footage encoded; browser and Preview acceptance pending',
 method:'ISS photography and photographic timelapse; crop, resize and H.264/WebP encode only',
 sourcePolicy:'https://www.nasa.gov/nasa-brand-center/images-and-media/',sections},null,2)+'\n');
