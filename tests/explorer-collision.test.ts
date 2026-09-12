import { beforeAll, expect, test } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { CollisionWorld } from '../src/components/Explorer/collision';
// @ts-expect-error Geometry-only Node test helper has no browser interface.
import { geometryOnly } from '../scripts/explorer/geometry-only.mjs';
import { Navigation } from '../src/components/Explorer/navigation';
import type { Point } from '../src/components/Explorer/contracts';
import floor from '../public/habitat/explorer/v1/floor.json';
import manifest from '../public/habitat/explorer/v1/manifest.json';

let world: CollisionWorld, navigation: Navigation;
beforeAll(async () => {
  world = new CollisionWorld();
  for (const file of ['concourse.glb', 'exhibits.glb']) world.add(await geometryOnly('public/habitat/explorer/v1/' + file));
  const shell = await geometryOnly('public/habitat/explorer/v1/room-shell.glb');
  for (const room of manifest.rooms.slice(1)) {
    const instance = shell.clone(true); instance.position.fromArray(room.origin); instance.rotation.y = room.yaw; world.add(instance);
  }
  navigation = new Navigation({ cellSize: floor.cellSize, cells: floor.cells.filter(([x,z]) => !world.blocked(new Vector3(x * floor.cellSize,1.65,z * floor.cellSize))).map(([x,z]):Point => [x,z]) });
}, 60000);

test('the shipped atrium glazing stops all previously walkable crossing paths, even a 2m frame', () => {
  for (let x = -8; x <= 8; x += .5) {
    const point = new Vector3(x,1.65,-10.5);
    world.move(point,new Vector3(0,0,-2),()=>true);
    expect(point.z, 'glass at x=' + x).toBeGreaterThan(-10.83);
    expect(navigation.clearLine([x,-10.5],[x,-12.5])).toBe(false);
  }
});

test('the shipped architecture remains connected across all nine rooms after actual walls are applied', () => {
  const start = navigation.nearest([manifest.rooms[0].reading[0],manifest.rooms[0].reading[2]],6)!;
  expect(start).not.toBeNull();
  for (const room of manifest.rooms.slice(1)) {
    const destination = navigation.nearest([room.reading[0],room.reading[2]],6)!;
    expect(destination,room.id).not.toBeNull();
    const route = navigation.path(start,destination);
    expect(route,room.id).not.toBeNull();
    let from = start;
    for (const to of route!) {
      for (let t = 0; t <= 1; t += .02) expect(world.blocked(new Vector3(from[0]+(to[0]-from[0])*t,1.65,from[1]+(to[1]-from[1])*t)),room.id).toBe(false);
      from = to;
    }
  }
}, 60000);

test('body slides along a wall and moving door geometry blocks until its opening is wide enough', () => {
  const body = new CollisionWorld(), door = new Group();
  door.add(new Mesh(new BoxGeometry(.06,4,4),new MeshBasicMaterial())); door.position.set(0,2,0); body.add(door,true);
  const point = new Vector3(-1,1.65,0);
  body.move(point,new Vector3(2,0,1),()=>true); expect(point.x).toBeLessThan(-.29); expect(point.z).toBeGreaterThan(.8);
  door.position.z = 5; body.updateDoor(door);
  body.move(point,new Vector3(2,0,0),()=>true); expect(point.x).toBeGreaterThan(1);
});
