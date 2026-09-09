/** Extract room-specific architecture lighting from raw Blender GLBs.
 * Geometry, albedo and normal maps remain shared in architecture.glb.
 * node scripts/habitat/prepare-lightmaps.mjs GLTF_TRANSFORM_CLI RAW_DIR PUBLIC_DIR
 */
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {readdir,readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const [cli,source,destination]=process.argv.slice(2);
if(!destination)throw new Error('Pass the CLI path, raw GLB directory and output directory.');
const require=createRequire(path.resolve(cli));
const {NodeIO}=await import(pathToFileURL(require.resolve('@gltf-transform/core')).href);
const {ALL_EXTENSIONS}=await import(pathToFileURL(require.resolve('@gltf-transform/extensions')).href);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const lightmaps=[];
for(const file of await readdir(source)){
  if(!/^architecture-[a-z]+\.glb$/.test(file))continue;
  const doc=await io.read(path.join(source,file));
  const textures=doc.getRoot().listTextures().filter(t=>t.getName().includes('indirect radiance'));
  if(textures.length!==1)throw new Error('Expected one shared architectural lightmap: '+file);
  const target=file.replace('.glb','.webp');
  await sharp(textures[0].getImage()).webp({quality:94}).toFile(path.join(destination,target));
  lightmaps.push({file:target,bytes:(await stat(path.join(destination,target))).size});
  console.log('Prepared '+file.replace('.glb','.webp'));
}
const manifestPath=path.join(destination,'manifest.json');
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));manifest.lightmaps=lightmaps;
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
