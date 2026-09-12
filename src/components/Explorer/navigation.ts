import type { NavMesh, Point } from './contracts';

const key = (x: number, z: number) => `${x},${z}`;
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Authored floor grid is the navigation mesh. No visual mesh or physics world is sampled per frame. */
export class Navigation {
  private cells: Set<string>;
  constructor(private mesh: NavMesh) { this.cells = new Set(mesh.cells.map(([x, z]) => key(x, z))); }
  private cell(p: Point): Point { return [Math.round(p[0] / this.mesh.cellSize), Math.round(p[1] / this.mesh.cellSize)]; }
  private world(p: Point): Point { return [p[0] * this.mesh.cellSize, p[1] * this.mesh.cellSize]; }
  contains(p: Point) { const [x, z] = this.cell(p); return this.cells.has(key(x, z)); }
  nearest(p: Point, radius = 3): Point | null {
    const [x, z] = this.cell(p); let nearest: Point | null = null; let best = radius;
    const steps = Math.ceil(radius / this.mesh.cellSize);
    for (let dx = -steps; dx <= steps; dx++) for (let dz = -steps; dz <= steps; dz++) {
      if (!this.cells.has(key(x + dx, z + dz))) continue;
      const world = this.world([x + dx, z + dz]), gap = distance(world, p);
      if (gap <= best) { best = gap; nearest = world; }
    }
    return nearest;
  }
  clearLine(a: Point, b: Point) {
    const steps = Math.max(1, Math.ceil(distance(a, b) / (this.mesh.cellSize * .2)));
    let previous = this.cell(a);
    for (let n = 0; n <= steps; n++) {
      const current = this.cell([a[0] + (b[0] - a[0]) * n / steps, a[1] + (b[1] - a[1]) * n / steps]);
      if (!this.cells.has(key(...current))) return false;
      // Never cut across the shared corner of two blocked cells.
      if (previous[0] !== current[0] && previous[1] !== current[1]
        && (!this.cells.has(key(previous[0], current[1])) || !this.cells.has(key(current[0], previous[1])))) return false;
      previous = current;
    }
    return true;
  }
  path(from: Point, to: Point): Point[] | null {
    const origin = this.nearest(from), destination = this.nearest(to, 1);
    if (!origin || !destination) return null;
    if (this.clearLine(origin, destination)) return [destination];
    const start = this.cell(origin), end = this.cell(destination), startKey = key(...start), endKey = key(...end);
    const open: { p: Point; g: number; f: number }[] = [{ p: start, g: 0, f: distance(start, end) }];
    const scores = new Map([[startKey, 0]]), parents = new Map<string, Point>(), closed = new Set<string>();
    while (open.length && closed.size < this.cells.size) {
      let best = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i;
      const current = open.splice(best, 1)[0], currentKey = key(...current.p);
      if (closed.has(currentKey)) continue;
      if (currentKey === endKey) {
        const reversed: Point[] = [destination]; let p = current.p;
        while (key(...p) !== startKey) { p = parents.get(key(...p))!; reversed.push(this.world(p)); }
        const raw = reversed.reverse(), result: Point[] = []; let anchor = 0;
        while (anchor < raw.length - 1) {
          let far = anchor + 1;
          while (far + 1 < raw.length && this.clearLine(raw[anchor], raw[far + 1])) far++;
          result.push(raw[far]); anchor = far;
        }
        return result;
      }
      closed.add(currentKey);
      for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const next: Point = [current.p[0] + dx, current.p[1] + dz], nextKey = key(...next);
        if (!this.cells.has(nextKey) || closed.has(nextKey)) continue;
        if (dx && dz && (!this.cells.has(key(current.p[0] + dx, current.p[1])) || !this.cells.has(key(current.p[0], current.p[1] + dz)))) continue;
        const score = current.g + Math.hypot(dx, dz);
        if (score >= (scores.get(nextKey) ?? Infinity)) continue;
        scores.set(nextKey, score); parents.set(nextKey, current.p);
        open.push({ p: next, g: score, f: score + distance(next, end) });
      }
    }
    return null;
  }
}
