import type { Point, Room, Vector } from './contracts';

export const movement = { walk: 4.8, fast: 7, assisted: 6, threshold: 2.8, acceleration: 20 } as const;
export const moveKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];

/** A door journey ends just beyond the threshold, not at the room's reading camera. */
export function doorPassage(room: Room, from: Vector, outward?: boolean) {
  const nx = Math.sin(room.yaw), nz = Math.cos(room.yaw);
  const outside = outward === undefined
    ? (from[0] - room.door[0]) * nx + (from[2] - room.door[2]) * nz >= 0
    : !outward;
  const side = outside ? 1 : -1;
  const at = (offset: number): Point => [room.door[0] + nx * offset, room.door[2] + nz * offset];
  return { approach: at(side * 1.8), arrival: at(-side * 1.8), outside };
}

/** Limit the last step instead of orbiting or overshooting a clicked point. */
export function arrivalSpeed(distance: number, maximum: number) {
  return Math.min(maximum, Math.max(.35, distance * 5));
}
