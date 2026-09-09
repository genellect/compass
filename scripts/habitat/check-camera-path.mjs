/** Offline geometry check. Uses the uncompressed authoring exports, not screenshots.
 * node scripts/habitat/check-camera-path.mjs GLTF_TRANSFORM_CLI RAW_DIRECTORY REPORT
 */
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';

const [cli,source,output]=process.argv.slice(2);
if(!output)throw new Error('Pass the CLI entry point, raw asset directory and report path.');
const require=createRequire(path.resolve(cli));
const {NodeIO}=await import(pathToFileURL(require.resolve('@gltf-transform/core')).href);
const {ALL_EXTENSIONS}=await import(pathToFileURL(require.resolve('@gltf-transform/extensions')).href);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const manifest=JSON.parse(await readFile(path.join(source,'manifest.json'),'utf8'));
async function load(file){
  const doc=await io.read(path.join(source,file)),group=new THREE.Group();
  for(const node of doc.getRoot().listNodes())for(const primitive of node.getMesh()?.listPrimitives()??[]){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(primitive.getAttribute('POSITION').getArray(),3));
    if(primitive.getIndices())geometry.setIndex(new THREE.BufferAttribute(primitive.getIndices().getArray(),1));
    geometry.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
    mesh.name=node.getName();group.add(mesh);
  }
  return group;
}
const architecture=await load('architecture.glb'),ray=new THREE.Raycaster(),direction=new THREE.Vector3();
const report={clearanceRadius:.18,samplesPerTransition:160,transitions:[]};
for(let i=0;i<manifest.sections.length-1;i++){
  const a=manifest.sections[i],b=manifest.sections[i+1],world=new THREE.Group();
  for(const section of [a,b]){
    const room=architecture.clone(),zone=await load(section.id+'.glb');
    room.position.fromArray(section.origin);zone.position.fromArray(section.origin);world.add(room,zone);
  }
  world.updateMatrixWorld(true);
  const curve=new THREE.CatmullRomCurve3([
    new THREE.Vector3().fromArray(a.camera),new THREE.Vector3(a.exit[0],1.72,9),
    new THREE.Vector3().fromArray(a.exit),new THREE.Vector3(a.exit[0],1.72,16),
    new THREE.Vector3(b.arrival[0],1.72,16),new THREE.Vector3().fromArray(b.arrival),
    new THREE.Vector3(b.arrival[0],1.72,9),new THREE.Vector3().fromArray(b.camera),
  ],false,'centripetal');
  const collisions=[];
  for(let sample=0;sample<160;sample++){
    const from=curve.getPoint(sample/160),to=curve.getPoint((sample+1)/160);
    direction.copy(to).sub(from);ray.far=direction.length();direction.normalize();
    for(const offset of [new THREE.Vector3(),new THREE.Vector3(.18,0,0),new THREE.Vector3(-.18,0,0),new THREE.Vector3(0,.18,0),new THREE.Vector3(0,-.18,0)]){
      ray.set(from.clone().add(offset),direction);
      const hit=ray.intersectObjects(world.children,true)[0];
      if(hit){collisions.push({progress:sample/160,point:hit.point.toArray(),mesh:hit.object.name});break;}
    }
  }
  report.transitions.push({from:a.id,to:b.id,collisions});
}
report.pass=report.transitions.every(t=>!t.collisions.length);
await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if(!report.pass)process.exitCode=1;
