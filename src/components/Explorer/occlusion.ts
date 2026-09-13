import { Box3, Mesh, Object3D, Ray, Triangle, Vector3 } from 'three';

const CELL = 3;
const WALKABLE_SIGHT = new Box3(new Vector3(-65, -.2, -65), new Vector3(65, 12, 65));
/** Static visual geometry is indexed once. Grid traversal tests only triangles
 * on the sight line, including both sides of glass. Door leaves remain dynamic. */
export class OcclusionWorld {
  private groups = new Map<Object3D, { box: Box3; cells: Map<string, Triangle[]> }>();
  add(group: Object3D) {
    group.updateWorldMatrix(true, true);
    const cells = new Map<string, Triangle[]>(), box = new Box3();
    group.traverse(object => {
      if (!(object instanceof Mesh)) return;
      for (let node: Object3D | null = object; node; node = node.parent) if (!node.visible || node.userData.explorer_door || node.userData.explorer_ignore_collision) return;
      const geometry = object.geometry, positions = geometry.getAttribute('position'), indices = geometry.index;
      if (!positions) return;
      for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
        const points = [0, 1, 2].map(offset => new Vector3().fromBufferAttribute(positions, indices ? indices.getX(i + offset) : i + offset).applyMatrix4(object.matrixWorld));
        const triangle = new Triangle(points[0], points[1], points[2]);
        const bounds = new Box3().setFromPoints(points).intersect(WALKABLE_SIGHT);
        if(bounds.isEmpty())continue;
        box.union(bounds);
        for (let x = Math.floor(bounds.min.x / CELL); x <= Math.floor(bounds.max.x / CELL); x++)
          for (let y = Math.floor(bounds.min.y / CELL); y <= Math.floor(bounds.max.y / CELL); y++)
            for (let z = Math.floor(bounds.min.z / CELL); z <= Math.floor(bounds.max.z / CELL); z++) {
              const key = `${x},${y},${z}`, bucket = cells.get(key);
              if (bucket) bucket.push(triangle); else cells.set(key, [triangle]);
            }
      }
    });
    this.groups.set(group, { box, cells });
  }
  remove(group: Object3D) { this.groups.delete(group); }
  clear() { this.groups.clear(); }
  intersect(ray: Ray, maximum = 100) {
    let nearest = maximum; const hitPoint = new Vector3();
    for (const [group, { box, cells }] of this.groups) {
      if (!group.visible || box.isEmpty()) continue;
      let near = 0, far = nearest;
      for (const axis of ['x', 'y', 'z'] as const) {
        const d = ray.direction[axis], origin = ray.origin[axis];
        if (Math.abs(d) < 1e-10) { if (origin < box.min[axis] || origin > box.max[axis]) far = -1; }
        else { const a = (box.min[axis] - origin) / d, b = (box.max[axis] - origin) / d; near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b)); }
      }
      if (far < near) continue;
      const start = ray.at(near + 1e-6, new Vector3()), axes = ['x', 'y', 'z'] as const;
      const cell = axes.map(axis => Math.floor(start[axis] / CELL));
      const signs = axes.map(axis => Math.sign(ray.direction[axis]));
      const delta = axes.map(axis => Math.abs(CELL / ray.direction[axis]));
      const next = axes.map((axis, i) => signs[i] ? (((cell[i] + (signs[i] > 0 ? 1 : 0)) * CELL) - ray.origin[axis]) / ray.direction[axis] : Infinity);
      const checked = new Set<Triangle>(); let at = near;
      while (at <= Math.min(far, nearest) + 1e-6) {
        for (const triangle of cells.get(cell.join(',')) ?? []) {
          if (checked.has(triangle)) continue; checked.add(triangle);
          if (ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hitPoint)) nearest = Math.min(nearest, hitPoint.distanceTo(ray.origin));
        }
        const axis = next[0] <= next[1] && next[0] <= next[2] ? 0 : next[1] <= next[2] ? 1 : 2;
        at = next[axis]; if (!Number.isFinite(at)) break; cell[axis] += signs[axis]; next[axis] += delta[axis];
      }
    }
    return nearest < maximum ? { distance: nearest } : null;
  }
}
