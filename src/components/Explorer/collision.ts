import { Box3, Matrix4, Mesh, Object3D, Triangle, Vector3 } from 'three';
import type { NavMesh, Point } from './contracts';
import { Octree } from 'three/addons/math/Octree.js';
import { Capsule } from 'three/addons/math/Capsule.js';

export const BODY_RADIUS = .3;
const capsuleAt = (point: Vector3) => new Capsule(
  new Vector3(point.x, .34, point.z), new Vector3(point.x, 1.48, point.z), BODY_RADIUS);

/** A level building needs a bounded XZ index, not recursive octants of broad,
 * almost coplanar glass. Triangles are shared between cells, never subdivided. */
class BodyIndex {
  private cells = new Map<string, Triangle[]>();
  private intersect = new Octree();
  addTriangle(triangle: Triangle) {
    const x0 = Math.floor(Math.min(triangle.a.x,triangle.b.x,triangle.c.x)/2);
    const x1 = Math.floor(Math.max(triangle.a.x,triangle.b.x,triangle.c.x)/2);
    const z0 = Math.floor(Math.min(triangle.a.z,triangle.b.z,triangle.c.z)/2);
    const z1 = Math.floor(Math.max(triangle.a.z,triangle.b.z,triangle.c.z)/2);
    for(let x=x0;x<=x1;x++) for(let z=z0;z<=z1;z++) {
      const key=x+','+z;let bucket=this.cells.get(key);if(!bucket){bucket=[];this.cells.set(key,bucket);}bucket.push(triangle);
    }
  }
  capsuleIntersect(source: Capsule) {
    const body=source.clone(), triangles=new Set<Triangle>();
    for(let x=Math.floor((body.start.x-body.radius)/2);x<=Math.floor((body.start.x+body.radius)/2);x++)
      for(let z=Math.floor((body.start.z-body.radius)/2);z<=Math.floor((body.start.z+body.radius)/2);z++)
        for(const triangle of this.cells.get(x+','+z)??[])triangles.add(triangle);
    let collided=false;
    for(const triangle of triangles){
      const result=this.intersect.triangleCapsuleIntersect(body,triangle);
      if(result){body.translate(result.normal.multiplyScalar(result.depth));collided=true;}
    }
    if(!collided)return false;
    const correction=body.getCenter(new Vector3()).sub(source.getCenter(new Vector3()));
    return {depth:correction.length(),normal:correction.normalize()};
  }
  clear(){this.cells.clear();}
}

/** Level floors use an upright body, independently of the camera and A* grid.
 * Only triangles intersecting body height are indexed. Glass is solid too.
 * Moving doors have separate trees, rebuilt only when their transform changes.
 */
export class CollisionWorld {
  private trees = new Map<Object3D, BodyIndex>();
  private boxes = new Map<Object3D, Box3>();
  private matrices = new Map<Object3D, Matrix4>();
  private masks = new Map<Object3D, { mesh: NavMesh; cells: Set<string> }>();

  add(group: Object3D, doors = false) {
    group.updateWorldMatrix(true, true);
    const tree = new BodyIndex();
    group.traverse(object => {
      if (!(object instanceof Mesh)) return;
      let ancestor: Object3D | null = object;
      while (ancestor && ancestor !== group) {
        if (ancestor.userData.explorer_ignore_collision) return;
        if (!doors && ancestor.userData.explorer_door) return;
        ancestor = ancestor.parent;
      }
      if (!doors && object.userData.explorer_door) return;
      if (object.userData.explorer_ignore_collision) return;
      const geometry = object.geometry, position = geometry.getAttribute('position'), indices = geometry.index;
      if (!position) return;
      for (let i = 0; i < (indices?.count ?? position.count); i += 3) {
        const points = [0, 1, 2].map(offset => new Vector3().fromBufferAttribute(position, indices ? indices.getX(i + offset) : i + offset).applyMatrix4(object.matrixWorld));
        if (Math.max(...points.map(p => p.y)) < .06 || Math.min(...points.map(p => p.y)) > 1.8) continue;
        const [a, b, c] = points;
        tree.addTriangle(new Triangle(a, b, c));
        // Interior/exterior faces and transparent single-sided panes both block.
        tree.addTriangle(new Triangle(c.clone(), b.clone(), a.clone()));
      }
    });
    this.trees.get(group)?.clear(); this.trees.set(group, tree);
    this.boxes.set(group, new Box3().setFromObject(group));
    this.matrices.set(group, group.matrixWorld.clone());
    this.masks.delete(group);
  }

  updateDoor(group: Object3D) {
    group.updateWorldMatrix(true, true);
    if (!this.matrices.get(group)?.equals(group.matrixWorld)) this.add(group, true);
  }
  remove(group: Object3D) { this.trees.get(group)?.clear(); this.trees.delete(group); this.boxes.delete(group); this.matrices.delete(group); this.masks.delete(group); }
  clear() { for (const tree of this.trees.values()) tree.clear(); this.trees.clear(); this.boxes.clear(); this.matrices.clear(); this.masks.clear(); }

  /** Static architecture is sampled once. Loading a chair never re-samples all nine shells. */
  navigationCells(mesh: NavMesh): Point[] {
    const blocked = new Set<string>();
    for (const [group, tree] of this.trees) {
      let mask = this.masks.get(group);
      if (!mask || mask.mesh !== mesh) {
        const cells = new Set<string>(), box = this.boxes.get(group)!;
        for (const [x, z] of mesh.cells) {
          const wx = x * mesh.cellSize, wz = z * mesh.cellSize;
          if (wx < box.min.x - BODY_RADIUS || wx > box.max.x + BODY_RADIUS || wz < box.min.z - BODY_RADIUS || wz > box.max.z + BODY_RADIUS) continue;
          const hit = tree.capsuleIntersect(capsuleAt(new Vector3(wx, 1.65, wz)));
          if (hit && hit.depth > .003) cells.add(x + ',' + z);
        }
        mask = { mesh, cells }; this.masks.set(group, mask);
      }
      for (const cell of mask.cells) blocked.add(cell);
    }
    return mesh.cells.filter(([x, z]) => !blocked.has(x + ',' + z));
  }

  blocked(point: Vector3) {
    const body = capsuleAt(point);
    for (const [group, tree] of this.trees) {
      const box = this.boxes.get(group)!;
      if (point.x < box.min.x - BODY_RADIUS || point.x > box.max.x + BODY_RADIUS || point.z < box.min.z - BODY_RADIUS || point.z > box.max.z + BODY_RADIUS) continue;
      const hit = tree.capsuleIntersect(body);
      if (hit && hit.depth > .003) return true;
    }
    return false;
  }

  /** Swept in <= 5cm substeps, so a slow frame cannot tunnel through thin glass.
   * Resolve the body and slide along walls; never use a distant safe cell as a
   * correction, which could teleport the visitor to the other side of a wall.
   */
  move(point: Vector3, displacement: Vector3, onFloor: (x: number, z: number) => boolean) {
    const steps = Math.max(1, Math.ceil(displacement.length() / .05));
    const step = displacement.clone().multiplyScalar(1 / steps), next = point.clone();
    for (let i = 0; i < steps; i++) {
      const attempt = next.clone().add(step), body = capsuleAt(attempt);
      for (let pass = 0; pass < 3; pass++) for (const [group, tree] of this.trees) {
        const box = this.boxes.get(group)!;
        if (attempt.x < box.min.x - 1 || attempt.x > box.max.x + 1 || attempt.z < box.min.z - 1 || attempt.z > box.max.z + 1) continue;
        const hit = tree.capsuleIntersect(body);
        if (hit) {
          const correction = hit.normal.multiplyScalar(hit.depth + .001); correction.y = 0;
          body.translate(correction); attempt.add(correction);
        }
      }
      if (onFloor(attempt.x, attempt.z) && !this.blocked(attempt)) next.copy(attempt);
      else {
        const slideX = new Vector3(next.x + step.x, point.y, next.z);
        const slideZ = new Vector3(next.x, point.y, next.z + step.z);
        if (onFloor(slideX.x, slideX.z) && !this.blocked(slideX)) next.copy(slideX);
        if (onFloor(slideZ.x, slideZ.z) && !this.blocked(slideZ)) next.copy(slideZ);
      }
    }
    point.copy(next);
  }
}
