import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/** Offline collision audit: decode shipped geometry, without image pixels or a
 * browser/GPU. This reads the GLB itself, not the authored navigation mask. */
export async function geometryOnly(file) {
  globalThis.self ??= globalThis;
  globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const bytes = await readFile(file);
  const result = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return result.scene;
}
