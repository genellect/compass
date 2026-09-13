import { readFile, writeFile } from 'node:fs/promises';
import { Mesh, Vector3 } from 'three';
import { geometryOnly } from './geometry-only.mjs';
const base='public/habitat/explorer/v1/',manifest=JSON.parse(await readFile(base+'manifest.json','utf8'));
const architecture=await geometryOnly(base+manifest.architecture),shell=await geometryOnly(base+manifest.rooms[1].shell);
const groups=[architecture,...manifest.rooms.slice(1).map(room=>{const copy=shell.clone(true);copy.position.fromArray(room.origin);copy.rotation.y=room.yaw;return copy;})];
const triangles=[];
for(const group of groups){group.updateWorldMatrix(true,true);group.traverse(object=>{
  if(!(object instanceof Mesh))return;
  const p=object.geometry.getAttribute('position'),indices=object.geometry.index;
  for(let i=0;i<(indices?.count??p.count);i+=3){
    const points=[0,1,2].map(j=>new Vector3().fromBufferAttribute(p,indices?indices.getX(i+j):i+j).applyMatrix4(object.matrixWorld));
    if(points.some(v=>v.y<-.06||v.y>.015))continue;
    const [a,b,c]=points,area=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
    if(Math.abs(area)>.00001)triangles.push(points);
  }
});}
const size=.5,raw=new Set();
const contains=(x,z,[a,b,c])=>{
  const d1=(x-b.x)*(a.z-b.z)-(a.x-b.x)*(z-b.z),d2=(x-c.x)*(b.z-c.z)-(b.x-c.x)*(z-c.z),d3=(x-a.x)*(c.z-a.z)-(c.x-a.x)*(z-a.z);
  return !(Math.min(d1,d2,d3)<-1e-6&&Math.max(d1,d2,d3)>1e-6);
};
for(const triangle of triangles){
  const minx=Math.ceil(Math.min(...triangle.map(v=>v.x))/size),maxx=Math.floor(Math.max(...triangle.map(v=>v.x))/size);
  const minz=Math.ceil(Math.min(...triangle.map(v=>v.z))/size),maxz=Math.floor(Math.max(...triangle.map(v=>v.z))/size);
  for(let x=minx;x<=maxx;x++)for(let z=minz;z<=maxz;z++)if(contains(x*size,z*size,triangle))raw.add(x+','+z);
}
// Keep a full body-width margin at open edges. Static geometry is applied by
// the engine after upload; furniture removed from v3 cannot leave ghost walls.
const cells=[...raw].map(key=>key.split(',').map(Number)).filter(([x,z])=>[[1,0],[-1,0],[0,1],[0,-1]].every(([dx,dz])=>raw.has((x+dx)+','+(z+dz))));
await writeFile(base+'floor.json',JSON.stringify({cellSize:size,cells})+'\n');manifest.nav='floor.json';
await writeFile(base+'manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log({floorTriangles:triangles.length,walkableCells:cells.length});
