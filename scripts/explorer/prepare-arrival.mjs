import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { Quaternion, Vector3 } from 'three';
const require = createRequire(path.resolve(process.argv[2], 'package.json'));
const { NodeIO } = await import(pathToFileURL(require.resolve('@gltf-transform/core')));
const { ALL_EXTENSIONS } = await import(pathToFileURL(require.resolve('@gltf-transform/extensions')));
const { prune, dedup, meshopt } = await import(pathToFileURL(require.resolve('@gltf-transform/functions')));
const { MeshoptDecoder, MeshoptEncoder } = await import(pathToFileURL(require.resolve('meshoptimizer')));
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read('public/habitat/v3/top.glb');
// Reuse furniture; the old baked set also includes a ceiling, floor and glazing
// from a different building. Those must not float inside the new concourse.
for (const node of [...doc.getRoot().listNodes()]) {
  if (/^(Float_Core|Spin_Orbit|Static_panoramic)/.test(node.getName())) { node.dispose(); continue; }
  const matrix=node.getWorldMatrix();
  for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
    const positions=primitive.getAttribute('POSITION'), indices=primitive.getIndices(), kept=[], vertices=[], parent=[], weld=new Map();
    const find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
    for(let i=0;i<positions.getCount();i++){
      const v=positions.getElement(i,[]),world=[0,1,2].map(axis=>matrix[axis]*v[0]+matrix[axis+4]*v[1]+matrix[axis+8]*v[2]+matrix[axis+12]);
      vertices.push(world);const key=world.map(n=>Math.round(n*500)).join(',');parent[i]=weld.get(key)??i;weld.set(key,parent[i]);
    }
    const triangles=[];
    for(let i=0;i<(indices?.getCount()??positions.getCount());i+=3){const tri=[0,1,2].map(j=>indices?indices.getScalar(i+j):i+j);triangles.push(tri);parent[find(tri[1])]=find(tri[0]);parent[find(tri[2])]=find(tri[0]);}
    const bounds=new Map();
    for(let i=0;i<vertices.length;i++){const root=find(i);let box=bounds.get(root);if(!box){box={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};bounds.set(root,box);}for(let axis=0;axis<3;axis++){box.min[axis]=Math.min(box.min[axis],vertices[i][axis]);box.max[axis]=Math.max(box.max[axis],vertices[i][axis]);}}
    for(const tri of triangles){const box=bounds.get(find(tri[0]));if(box.max[1]>2.9||box.max[1]<.06||box.max[0]-box.min[0]>4||box.max[2]-box.min[2]>4)continue;kept.push(...tri);}
    if(!kept.length){primitive.dispose();continue;}
    primitive.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(kept)).setBuffer(doc.getRoot().listBuffers()[0]));
  }
}
await doc.transform(prune(),dedup(),meshopt({encoder:MeshoptEncoder,level:'high'}));
const target='public/habitat/explorer/v1/top.glb';await io.write(target,doc);
const manifest=JSON.parse(await readFile('public/habitat/explorer/v1/manifest.json','utf8'));
manifest.rooms[0].model='/habitat/explorer/v1/top.glb';
manifest.rooms[0].reading=[-3,1.65,7];manifest.rooms[0].panel=[-1,1.85,-6];
manifest.assets=manifest.assets.filter(a=>a.file!=='top.glb');
manifest.assets.push({file:'top.glb',bytes:(await stat(target)).size,triangles:doc.getRoot().listMeshes().reduce((sum,mesh)=>sum+mesh.listPrimitives().reduce((n,p)=>n+p.getIndices().getCount()/3,0),0)});
await writeFile('public/habitat/explorer/v1/manifest.json',JSON.stringify(manifest,null,2)+'\n');
// Correct the historical Blender/web Y-axis sign on physical room lettering.
// A marker makes this migration idempotent for repeated exports.
const signs=await io.read('public/habitat/explorer/v1/signs.glb');
for(const node of signs.getRoot().listNodes()){
  const room=manifest.rooms.slice(1).find(room=>node.getName().startsWith('Lettering_'+room.label));
  if(!room||node.getExtras().orientationCorrected)continue;
  const angle=room.yaw+(node.getExtras().explorer_room_sign?0:Math.PI/2);
  const rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),2*angle).multiply(new Quaternion().fromArray(node.getRotation()));
  node.setRotation(rotation.toArray()).setExtras({...node.getExtras(),orientationCorrected:true});
}
await io.write('public/habitat/explorer/v1/signs.glb',signs);
manifest.assets.find(asset=>asset.file==='signs.glb').bytes=(await stat('public/habitat/explorer/v1/signs.glb')).size;
await writeFile('public/habitat/explorer/v1/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(manifest.assets.at(-1));
