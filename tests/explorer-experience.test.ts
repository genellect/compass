import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { BoxGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, Ray, Raycaster, Vector3 } from 'three';
import { OcclusionWorld } from '../src/components/Explorer/occlusion';
import { CollisionWorld } from '../src/components/Explorer/collision';
import { arrivalSpeed, doorPassage, movement } from '../src/components/Explorer/movement';
import { activityItems, chapterIds, communityCopy, libraryItems, questionExamples } from '../src/components/Explorer/experience-content';
import { exhibitDocuments } from '../src/components/Explorer/exhibit-documents';
import type { Room } from '../src/components/Explorer/contracts';
import manifest from '../public/habitat/explorer/v1/manifest.json';

test('entry and exit approach the correct side of every actual doorway without crossing it first', () => {
  for (const room of manifest.rooms.slice(1) as unknown as Room[]) {
    const enter = doorPassage(room, [0, 1.65, 0]);
    const local = (p: readonly number[]) => (p[0] - room.door[0]) * Math.sin(room.yaw) + (p[1] - room.door[2]) * Math.cos(room.yaw);
    expect(local(enter.approach)).toBeCloseTo(1.8); expect(local(enter.arrival)).toBeCloseTo(-1.8);
    const exit = doorPassage(room, room.origin, true);
    expect(local(exit.approach)).toBeCloseTo(-1.8); expect(local(exit.arrival)).toBeCloseTo(1.8);
  }
});

test('manual movement reaches twice the previous walking speed rapidly and never tunnels through a wall', () => {
  let speed = 0, distance = 0;
  for (let i = 0; i < 60; i++) { speed += (movement.walk - speed) * (1 - Math.exp(-movement.acceleration / 60)); distance += speed / 60; }
  expect(distance).toBeGreaterThan(4.5); expect(movement.fast).toBeGreaterThan(movement.walk);
  expect(arrivalSpeed(.1, movement.assisted)).toBeLessThan(1);
  const world = new CollisionWorld(), wall = new Mesh(new BoxGeometry(10, 4, .03), new MeshBasicMaterial()); world.add(wall);
  const point = new Vector3(0, 1.65, 1); world.move(point, new Vector3(0, 0, -movement.fast), () => true);
  expect(point.z).toBeGreaterThan(.29);
});

test('cached navigation occupancy equals body collision after adding and removing a room', () => {
  const world = new CollisionWorld(), wall = new Group(); wall.add(new Mesh(new BoxGeometry(2, 4, 1), new MeshBasicMaterial())); world.add(wall);
  const cells: [number, number][] = []; for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) cells.push([x, z]);
  const floor = { cellSize: .5, cells };
  const expected = () => cells.filter(([x, z]) => !world.blocked(new Vector3(x * .5, 1.65, z * .5)));
  expect(world.navigationCells(floor)).toEqual(expected()); expect(world.navigationCells(floor)).toEqual(expected());
  const room = wall.clone(); room.position.x = 3; world.add(room); expect(world.navigationCells(floor)).toEqual(expected());
  world.remove(room); expect(world.navigationCells(floor)).toEqual(expected());
});

test('spatial sight-line index matches triangle raycasts across cell boundaries and from inside', () => {
  const group = new Group(), material = new MeshBasicMaterial({ side: DoubleSide });
  for (const [x, y, z] of [[-4, 2, 0], [4, 2, 0], [0, .01, 0]]) {
    const box = new Mesh(new BoxGeometry(x ? .02 : 12, x ? 4 : .02, 12), material); box.position.set(x,y,z); group.add(box);
  }
  group.updateMatrixWorld(true); const index = new OcclusionWorld(); index.add(group);
  for (let i = 0; i < 80; i++) {
    const origin = new Vector3(Math.sin(i) * 8, 1.65, Math.cos(i) * 7), direction = new Vector3(Math.cos(i * 2), Math.sin(i) * .2, Math.sin(i * 2)).normalize();
    const expected = new Raycaster(origin, direction).intersectObject(group,true)[0];
    const actual = index.intersect(new Ray(origin, direction));
    if (expected) expect(actual?.distance).toBeCloseTo(expected.distance,4); else expect(actual).toBeNull();
  }
  index.remove(group); expect(index.intersect(new Ray(new Vector3(0,1,0),new Vector3(1,0,0)))).toBeNull();
});

test('exhibits reuse actual public copy and complete Manifesto chapters', async () => {
  const chapters = await exhibitDocuments(); expect(chapters.map(chapter => chapter.id)).toEqual(chapterIds);
  expect(chapters.every(chapter => chapter.blocks.length > 2)).toBe(true);
  expect(libraryItems).toHaveLength(3); expect(questionExamples).toHaveLength(3);
  const source = readFileSync('src/sections/OfficialCoreSections.tsx', 'utf8').replace(/<[^>]*>/g, '').replace(/\s+/g, '');
  for (const item of activityItems) for (const text of [item.label, item.title, item.text]) expect(source).toContain(text.replace(/\s+/g, ''));
  for (const text of [communityCopy.introduction, ...communityCopy.paragraphs]) expect(source).toContain(text.replace(/\s+/g, ''));
});
