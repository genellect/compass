/** Run with the gltf-transform CLI v4.5.0 on PATH; retains Blender exports outside public. */
import {spawnSync} from 'node:child_process';
import {mkdir,readFile,copyFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';

const option=(name,fallback)=>process.argv.find(arg=>arg.startsWith(name+'='))?.slice(name.length+1)??fallback;
const directory=path.resolve(option('--directory','public/habitat/v3'));
const originals=path.resolve(option('--originals','../habitat-glb/v3'));
await mkdir(originals,{recursive:true});
const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));
const cli=process.argv[2];
if(!cli)throw new Error('Pass the installed @gltf-transform/cli v4.5.0 JavaScript entry path.');
const cliRequire=createRequire(path.resolve(cli));
const {NodeIO}=await import(pathToFileURL(cliRequire.resolve('@gltf-transform/core')).href);
const {ALL_EXTENSIONS}=await import(pathToFileURL(cliRequire.resolve('@gltf-transform/extensions')).href);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const only=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7).split(',');
for(const asset of manifest.assets){
 if(only&&!only.includes(asset.file.replace('.glb','')))continue;
 const source=path.join(originals,asset.file),target=path.join(directory,asset.file);
 if(!process.argv.includes('--reuse-originals'))await copyFile(target,source);
 const document=await io.read(source);
 let resized=0;
 for(const texture of document.getRoot().listTextures()){
   if(/occlusion|indirect radiance/i.test(texture.getName()))continue;
   const metadata=await sharp(texture.getImage()).metadata();
   if(Math.max(metadata.width??0,metadata.height??0)>1024){
     texture.setImage(await sharp(texture.getImage()).resize({width:1024,height:1024,fit:'inside'}).png().toBuffer()).setMimeType('image/png');resized++;
   }
 }
 const indirect=document.getRoot().listTextures().filter(texture=>texture.getName().includes('indirect radiance'));
 let prepared=source;
 if(indirect.length||resized){
   for(const texture of indirect)texture.setImage(await sharp(texture.getImage()).blur(1.3).png().toBuffer()).setMimeType('image/png');
   prepared=path.join(originals,'filtered-'+asset.file);await io.write(prepared,document);
 }
 const textured=path.join(originals,'webp-'+asset.file);
 const textureResult=spawnSync(process.execPath,[cli,'webp',prepared,textured,'--quality','92'],{stdio:'inherit'});
 if(textureResult.status!==0)throw new Error('Texture conversion failed: '+asset.file);
 let geometrySource=textured;
 if(asset.file==='environment.glb'){
   // Only the distant skyline receives geometric simplification. Interior
   // furniture, the core and their silhouettes keep the full authored meshes.
   geometrySource=path.join(originals,'simplified-'+asset.file);
   const simplify=spawnSync(process.execPath,[cli,'simplify',textured,geometrySource,'--ratio','0.75','--error','0.0015','--lock-border','false'],{stdio:'inherit'});
   if(simplify.status!==0)throw new Error('Skyline simplification failed');
   asset.simplification={ratio:.75,maximumRelativeError:.0015};
 }
 const result=spawnSync(process.execPath,[cli,'meshopt',geometrySource,target,'--quantize-position','16'],{stdio:'inherit'});
 if(result.status!==0)throw new Error('Meshopt failed: '+asset.file);
 const bytes=await readFile(target),length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.toString('utf8',20,20+length));
 asset.rawBytes=(await readFile(source)).length;asset.bytes=bytes.length;
 asset.meshes=gltf.meshes.length;asset.textures=gltf.images?.length??0;
 asset.indirectLightmaps=indirect.length;
 asset.triangles=gltf.meshes.reduce((n,m)=>n+m.primitives.reduce((a,p)=>a+gltf.accessors[p.indices??p.attributes.POSITION].count/3,0),0);
}
manifest.optimizer={name:'@gltf-transform/cli',version:'4.5.0',compression:'EXT_meshopt_compression',positionBits:16};
await writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
