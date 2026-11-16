import { expect, test } from 'bun:test';
import { createRigidWorld3D } from '../../../physics/rigid-3d.ts';
import { createWeaponSurfaceProbe } from './surfaces.ts';

test('weapon sweeps use the current moving surface position and rotated box extents', () => {
  const world = createRigidWorld3D({ capacity: 2, gravityY: 0 });
  world.addBody({ id: 'platform', type: 'kinematic', shape: { kind: 'box', halfX: 2, halfY: .2, halfZ: .2 }, x: 5, y: 1, rotation: [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)] });
  const sweep = createWeaponSurfaceProbe(world, ['platform']);
  const from = { x: -1, y: 1, z: 1.5 }, to = { x: 1, y: 1, z: 1.5 };
  expect(sweep(from, to)).toBeUndefined();
  world.setPosition('platform', 0, 1, 0);
  expect(sweep(from, to)?.id).toBe('platform');
  expect(sweep(from, to)?.position.x).toBeCloseTo(-.265, 3);
  world.configureBody('platform', { collisionMask: 0 });
  expect(sweep(from, to)).toBeUndefined();
  world.configureBody('platform', { collisionMask: 0xffffffff });
  world.setPosition('platform', 5, 1, 0);
  expect(sweep(from, to)).toBeUndefined();
});

test('weapon sweep returns the nearest contact and ignores nonblocking trigger geometry', () => {
  const world = createRigidWorld3D({ capacity: 3, gravityY: 0 });
  for (const [id, x] of [['near', 1], ['far', 3], ['trigger', .2]] as const) world.addBody({ id, type: 'static', shape: { kind: 'box', halfX: .1, halfY: 1, halfZ: 1 }, x, trigger: id === 'trigger' });
  const sweep = createWeaponSurfaceProbe(world, ['far', 'trigger', 'near']);
  expect(sweep({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 })?.id).toBe('near');
});

test('broad rejection preserves long crossings and weapon-radius grazing near distant clutter', () => {
  const world = createRigidWorld3D({ capacity: 102, gravityY: 0 });
  const ids: string[] = [];
  for (let index = 0; index < 100; index++) {
    const id = `clutter-${index}`;ids.push(id);
    world.addBody({ id, type: 'static', shape: { kind: 'box', halfX: 1, halfY: 1, halfZ: 1 }, x: index * 3, z: 100 });
  }
  world.addBody({ id: 'crossed', type: 'static', shape: { kind: 'box', halfX: .1, halfY: .1, halfZ: .1 }, x: 0 });
  ids.push('crossed');
  const sweep = createWeaponSurfaceProbe(world, ids);
  const from = { x: -20, y: .16, z: 0 }, to = { x: 20, y: .16, z: 0 };
  expect(sweep(from, to)?.id).toBe('crossed');
  expect(sweep({ ...from, y: .17 }, { ...to, y: .17 })).toBeUndefined();
  world.setPosition('crossed', 0, 20, 0);
  expect(sweep(from, to)).toBeUndefined();
});

test('stationary attack spheres overlap thin and rotated walls without treating nearby empty corners as hits', () => {
  const world = createRigidWorld3D({ capacity: 1, gravityY: 0 });
  world.addBody({ id: 'wall', type: 'static', shape: { kind: 'box', halfX: .16, halfY: 2.7, halfZ: 1.8 }, x: -55, y: 2.7, z: -22 });
  const probe = createWeaponSurfaceProbe(world, ['wall']);
  const center = { x: -54.66, y: 1, z: -22 };
  expect(probe(center, center, .7)?.id).toBe('wall');
  expect(probe(center, center, .7)?.normal.x).toBeCloseTo(1);
  expect(probe(center, center, 0)).toBeUndefined();
  const outside = { x: -54.1, y: 1, z: -22 };
  expect(probe(outside, outside, .7)).toBeUndefined();
  world.setPosition('wall', 0, 0, 0);world.setRotation('wall', 0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4));
  const rotated = { x: 0, y: 0, z: .34 };
  expect(probe(rotated, rotated, .7)?.id).toBe('wall');
  const corner = { x: 2.35, y: 0, z: .71 };
  expect(probe(corner, corner, .7)).toBeUndefined();
});

test('surface queries materialize only nearby bodies and preserve authored tie order', () => {
  const world = createRigidWorld3D({ capacity: 128, gravityY: 0 }), ids: string[] = [];
  for (let index = 0; index < 100; index++) {
    const id = `far-${index}`;ids.push(id);
    world.addBody({ id, type: 'static', shape: { kind: 'box', halfX: 1, halfY: 1, halfZ: 1 }, z: 100 + index });
  }
  for (const id of ['first', 'last']) world.addBody({ id, type: 'static', shape: { kind: 'box', halfX: .1, halfY: 1, halfZ: 1 }, x: 1 });
  ids.push('last', 'first');
  const probe = createWeaponSurfaceProbe(world, ids), body = world.body;let reads = 0;
  world.body = id => { reads++;return body(id); };
  const from = { x: 0, y: 0, z: 0 }, to = { x: 2, y: 0, z: 0 };
  expect(probe(from, to)?.id).toBe('first');expect(reads).toBe(2);
  reads = 0;expect(probe(from, to, .065, 'last')?.id).toBe('last');expect(reads).toBe(2);
  expect(world.diagnostics.queryTruncations).toBe(0);
  const checkpoint = world.checkpoint();
  world.setPosition('first', 50, 0, 0);expect(probe(from, to)?.id).toBe('last');
  world.restoreCheckpoint(checkpoint);expect(probe(from, to)?.id).toBe('first');
  world.setPosition('first', 50, 0, 0);world.removeBody('last');expect(probe(from, to)).toBeUndefined();
});
