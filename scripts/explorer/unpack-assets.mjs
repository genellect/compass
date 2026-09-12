/** Offline authoring bridge. Existing v3 delivery bytes are never changed. */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
const [toolchain, destination] = process.argv.slice(2);
if (!toolchain || !destination) throw new Error('Usage: node unpack-assets.mjs TOOLCHAIN_DIRECTORY OUTPUT_DIRECTORY');
const require = createRequire(path.resolve(toolchain, 'package.json'));
const { NodeIO } = await import(pathToFileURL(require.resolve('@gltf-transform/core')));
const { ALL_EXTENSIONS } = await import(pathToFileURL(require.resolve('@gltf-transform/extensions')));
const { dequantize } = await import(pathToFileURL(require.resolve('@gltf-transform/functions')));
const { MeshoptDecoder } = await import(pathToFileURL(require.resolve('meshoptimizer')));
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
await mkdir(destination, { recursive: true });
for (const id of ['top','vision','experience','technology','resources','manifesto','community','founder','contact']) {
  const document = await io.read(`public/habitat/v3/${id}.glb`);
  for (const extension of document.getRoot().listExtensionsUsed()) if (extension.extensionName === 'EXT_meshopt_compression') extension.dispose();
  await document.transform(dequantize());
  for (const texture of document.getRoot().listTextures()) texture.setImage(await sharp(texture.getImage()).png().toBuffer()).setMimeType('image/png');
  await io.write(path.join(destination, id + '.glb'), document);
  console.log('Prepared Blender input:', id);
}
