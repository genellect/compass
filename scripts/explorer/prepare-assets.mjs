import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { mkdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import sharp from 'sharp';
const [toolchain, source] = process.argv.slice(2);
if (!toolchain || !source) throw new Error('Usage: node prepare-assets.mjs TOOLCHAIN_DIRECTORY RAW_DIRECTORY');
const destination='public/habitat/explorer/v1';
const require=createRequire(path.resolve(toolchain,'package.json'));
const {NodeIO}=await import(pathToFileURL(require.resolve('@gltf-transform/core')));
const {ALL_EXTENSIONS}=await import(pathToFileURL(require.resolve('@gltf-transform/extensions')));
const {meshopt,dedup,prune}=await import(pathToFileURL(require.resolve('@gltf-transform/functions')));
const {MeshoptEncoder,MeshoptDecoder}=await import(pathToFileURL(require.resolve('meshoptimizer')));
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
await mkdir(destination,{recursive:true});
const manifest=JSON.parse(await readFile(path.join(source,'manifest.json'),'utf8'));
manifest.assets=[];
for(const [from,to] of [['concourse.glb','concourse.glb'],['vision-shell.glb','room-shell.glb'],['signs.glb','signs.glb']]) {
  const document=await io.read(path.join(source,from));
  for(const texture of document.getRoot().listTextures()) {
    texture.setImage(await sharp(texture.getImage()).resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).webp({quality:92}).toBuffer()).setMimeType('image/webp');
  }
  await document.transform(dedup(),prune(),meshopt({encoder:MeshoptEncoder,level:'high'}));
  const target=path.join(destination,to);await io.write(target,document);
  const tris=document.getRoot().listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((s,p)=>s+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0),0);
  manifest.assets.push({file:to,bytes:(await stat(target)).size,triangles:tris});
  console.log('Optimized',to,(await stat(target)).size);
}
for(const room of manifest.rooms) if(room.id!=='top')room.shell='room-shell.glb';
delete manifest.environment;
manifest.exhibits='exhibits.glb';
await copyFile(path.join(source,'navigation.json'),path.join(destination,'navigation.json'));
await writeFile(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
