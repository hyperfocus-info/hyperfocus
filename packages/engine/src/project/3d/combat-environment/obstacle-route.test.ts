import { expect, test } from 'bun:test';
import { createRigidWorld3D } from '../../../physics/rigid-3d.ts';
import { createCombatObstacleRoute } from './obstacle-route.ts';

test('a corner inside another solid never becomes a route waypoint', () => {
  const world = createRigidWorld3D({ capacity: 4, gravityY: 0 });
  world.addBody({ id: 'actor', shape: { kind: 'sphere', radius: 1 }, x: -5.2, y: .9998, z: 7.3 });
  world.addBody({ id: 'target', shape: { kind: 'sphere', radius: 1 }, x: -12, y: .9998, z: 5 });
  world.addBody({ id: 'stair', type: 'static', shape: { kind: 'box', halfX: 1.5, halfY: .5, halfZ: 1 }, x: -8, y: .5, z: 5 });
  world.addBody({ id: 'panel', type: 'static', shape: { kind: 'box', halfX: .1, halfY: 2, halfZ: .2 }, x: -5.9, y: 2, z: 4 });
  const direction = createCombatObstacleRoute({ world, bodyIds: ['stair', 'panel'] })('actor', 'target')!;
  expect(direction.x).toBeLessThan(-.9);
  expect(direction.z).toBeGreaterThanOrEqual(0);
});

test('AI route cache follows live wall removal and restoration without changing physical state', () => {
  const world = createRigidWorld3D({ capacity: 3, gravityY: 0 });
  world.addBody({ id: 'actor', shape: { kind: 'sphere', radius: .5 }, x: 3, y: 1 });
  world.addBody({ id: 'target', shape: { kind: 'sphere', radius: .5 }, x: -3, y: 1 });
  world.addBody({ id: 'wall', type: 'static', shape: { kind: 'box', halfX: .2, halfY: 2, halfZ: 2 }, y: 2 });
  const route = createCombatObstacleRoute({ world, bodyIds: ['actor', 'target', 'wall'] });
  const position = world.body('actor'), direction = route('actor', 'target');
  expect(direction).toBeDefined();expect(direction!.x).toBeLessThan(0);expect(Math.abs(direction!.z)).toBeGreaterThan(.2);
  expect(world.body('actor')).toEqual(position);
  const mask = world.body('wall')!.collisionMask;
  world.configureBody('wall', { collisionMask: 0 });expect(route('actor', 'target')).toBeUndefined();
  world.configureBody('wall', { collisionMask: mask });expect(route('actor', 'target')).toEqual(direction);
  world.setPosition('wall', 0, 2, 8);expect(route('actor', 'target')).toBeUndefined();
});

test('remote city obstacles do not exhaust the local routing budget', () => {
  const world = createRigidWorld3D({ capacity: 90, gravityY: 0 });
  world.addBody({ id: 'actor', shape: { kind: 'sphere', radius: .5 }, x: 3, y: 1 });
  world.addBody({ id: 'target', shape: { kind: 'sphere', radius: .5 }, x: -3, y: 1 });
  world.addBody({ id: 'wall', type: 'static', shape: { kind: 'box', halfX: .2, halfY: 2, halfZ: 2 }, y: 2 });
  const ids = ['actor', 'target', 'wall'];
  const baseline = createCombatObstacleRoute({ world, bodyIds: ids })('actor', 'target');
  for (let i = 0; i < 80; i++) {
    const id = `remote:${i}`; ids.push(id);
    world.addBody({ id, type: 'static', shape: { kind: 'box', halfX: 1, halfY: 2, halfZ: 1 }, x: 40 + i * 3, y: 2, z: 40 });
  }
  expect(createCombatObstacleRoute({ world, bodyIds: ids })('actor', 'target')).toEqual(baseline);
});
