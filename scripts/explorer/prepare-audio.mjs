import {spawnSync} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const [ffmpeg,source]=process.argv.slice(2);
if(!ffmpeg||!source)throw new Error('Usage: node prepare-audio.mjs FFMPEG SOURCE_DIRECTORY');
const destination='public/media/explorer/audio';await mkdir(destination,{recursive:true});
const jobs=[
  ['room','room-tone.mp3',['-filter_complex','[0:a]atrim=start=20:end=62,asetpts=PTS-STARTPTS,highpass=f=110,lowpass=f=5500,asplit[a][b];[a]atrim=end=40[x];[b]atrim=start=40,asetpts=PTS-STARTPTS[y];[y][x]acrossfade=d=2,loudnorm=I=-20:TP=-3:LRA=7[out]','-map','[out]']],
  ['door','scifi/Audio/doorOpen_001.ogg',['-af','highpass=f=100,lowpass=f=5200,afade=t=in:d=0.035,afade=t=out:st=0.55:d=0.2','-t','0.75']],
  ['select','interface/Audio/click_003.ogg',['-af','highpass=f=220,lowpass=f=4800,afade=t=out:st=0.08:d=0.08','-t','0.16']],
  ['equipment','scifi/Audio/computerNoise_003.ogg',['-af','highpass=f=160,lowpass=f=1900,afade=t=in:d=0.08,afade=t=out:st=0.7:d=0.2','-t','0.9']],
];
const assets=[];
for(const [name,input,filters] of jobs){
  const target=path.join(destination,name+'.mp3'),file=path.join(source,input);
  const result=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',file,...filters,'-ar','48000','-ac','2','-c:a','libmp3lame','-b:a',name==='room'?'192k':'160k','-map_metadata','-1',target],{encoding:'utf8'});
  if(result.status!==0)throw new Error(result.stderr);
  const bytes=await readFile(target);assets.push({file:name+'.mp3',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),source:input});
}
await writeFile(destination+'/manifest.json',JSON.stringify({version:'1',sampleRate:48000,channels:2,assets},null,2)+'\n');
console.log(assets.map(({file,bytes})=>({file,bytes})));
