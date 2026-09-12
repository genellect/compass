import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const require=createRequire(path.resolve(process.argv[2],'package.json'));
const {NodeIO}=await import(pathToFileURL(require.resolve('@gltf-transform/core')));
const {ALL_EXTENSIONS}=await import(pathToFileURL(require.resolve('@gltf-transform/extensions')));
const {getBounds}=await import(pathToFileURL(require.resolve('@gltf-transform/functions')));
const {MeshoptDecoder}=await import(pathToFileURL(require.resolve('meshoptimizer')));await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
for(const file of process.argv.slice(3)){
  const doc=await io.read(file);console.log(JSON.stringify({file,bounds:getBounds(doc.getRoot().listScenes()[0]),
    nodes:doc.getRoot().listNodes().filter(n=>n.getMesh()).map(n=>({name:n.getName(),translation:n.getTranslation(),bounds:getBounds(n)})),
    textures:doc.getRoot().listTextures().map(t=>({name:t.getName(),size:t.getSize()}))},null,2));
}
