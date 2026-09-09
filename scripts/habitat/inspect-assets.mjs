import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

const directory=path.resolve('public/habitat/v3');
const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));
const report={generatedAt:new Date().toISOString(),blender:manifest.blender,assets:[],posters:[],lightmaps:[],totalBytes:0};
for(const asset of manifest.assets){
  const bytes=await readFile(path.join(directory,asset.file));
  if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw new Error(`Invalid GLB: ${asset.file}`);
  const length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.toString('utf8',20,20+length));
  const binary=bytes.subarray(28+length);
  if(gltf.buffers.some(b=>b.uri)||gltf.images?.some(i=>i.uri))throw new Error(`External GLB dependency: ${asset.file}`);
  const triangles=gltf.meshes.reduce((sum,m)=>sum+m.primitives.reduce((n,p)=>n+gltf.accessors[p.indices??p.attributes.POSITION].count/3,0),0);
  if(triangles!==asset.triangles||bytes.length!==asset.bytes)throw new Error(`Manifest mismatch: ${asset.file}`);
  const textures=await Promise.all((gltf.images??[]).map(async image=>{
    const view=gltf.bufferViews[image.bufferView],start=view.byteOffset??0;
    const info=await sharp(binary.subarray(start,start+view.byteLength)).metadata();
    return {name:image.name,width:info.width,height:info.height,format:info.format,bytes:view.byteLength};
  }));
  report.assets.push({file:asset.file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),triangles,
    materials:gltf.materials.map(m=>m.name),animatedNodes:gltf.nodes.filter(n=>/^(Float_|Spin_)/.test(n.name??'')).map(n=>n.name),textures});
  report.totalBytes+=bytes.length;
}
for(const item of manifest.posters){
  const bytes=await readFile(path.join(directory,item.file)),info=await sharp(bytes).metadata();
  if(info.width!==1920||info.height!==1080)throw new Error(`Poster resolution mismatch: ${item.file}`);
  report.posters.push({file:item.file,bytes:bytes.length,width:info.width,height:info.height,sha256:createHash('sha256').update(bytes).digest('hex')});
  report.totalBytes+=bytes.length;
}
for(const item of manifest.environment)report.totalBytes+=(await readFile(path.join(directory,item.file))).length;
if(manifest.lightmaps?.length!==manifest.sections.length-1)throw new Error('Room lightmaps are incomplete');
for(const item of manifest.lightmaps){
  const bytes=await readFile(path.join(directory,item.file)),info=await sharp(bytes).metadata();
  if(bytes.length!==item.bytes||info.width<2048||info.height<2048)throw new Error('Invalid room lightmap: '+item.file);
  report.lightmaps.push({file:item.file,bytes:bytes.length,width:info.width,height:info.height,sha256:createHash('sha256').update(bytes).digest('hex')});
  report.totalBytes+=bytes.length;
}
if(report.totalBytes!==manifest.totalBytes||report.totalBytes>40e6)throw new Error('Total asset budget or manifest mismatch');
const output=process.argv[2];if(output)await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({assets:report.assets.length,posters:report.posters.length,totalBytes:report.totalBytes,pass:true}));
