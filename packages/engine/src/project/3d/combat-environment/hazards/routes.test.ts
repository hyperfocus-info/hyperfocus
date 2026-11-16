import { expect, test } from 'bun:test';
import { createRigidWorld3D } from '../../../../physics/rigid-3d.ts';
import { createCombatObstaclePlanner } from '../obstacle-route.ts';
import { createObservedHazardRegions, hazardSegmentCost } from './routes.ts';

function fixture() {
  const world = createRigidWorld3D({ capacity: 8, gravityY: 0 });
  world.addBody({ id: 'a', shape: { kind: 'sphere', radius: .5 }, x: -5, y: .5 });
  world.addBody({ id: 'b', shape: { kind: 'sphere', radius: .5 }, x: 5, y: .5 });
  let active = false;
  const entities: Parameters<typeof createObservedHazardRegions>[0]['entities'] = [{ id: 'fire', meshId: 'mesh', materialId: 'material', position: [0, .5, 0], scale: [1, .5, 1], rotationY: 0 },
    { id: 'wall', meshId: 'mesh', materialId: 'material', position: [-2, 1, 0], scale: [.2, 1, 3], rotationY: 0, physics: { type: 'static', shape: 'box', continuous: false, gravityScale: 0 } }];
  const observed = createObservedHazardRegions({ world, entities, definition: { surfaces: [], hazards: [{ entityId: 'fire', kind: 'fire', damage: 2, intervalFrames: 30, activationSurfaceId: 'supply' }] }, active: () => active });
  const route = createCombatObstaclePlanner({ world, bodyIds: ['wall', 'north', 'south'], hazards: observed });
  return { world, route, observed, activate: () => { active = true; } };
}

test('inactive, hidden and distant hazards grant no route knowledge; visible active fire creates a dry detour', () => {
  const { world, observed, route, activate } = fixture();
  expect(observed('a')).toEqual([]);expect(route('a', 'b')!.direction).toBeUndefined();
  activate();expect(observed('a')).toHaveLength(1);const detour = route('a', 'b')!.direction!;
  expect(detour.x).toBeGreaterThan(0);expect(Math.abs(detour.z)).toBeGreaterThan(.2);
  world.addBody({ id: 'wall', type: 'static', shape: { kind: 'box', halfX: .2, halfY: 1, halfZ: 3 }, x: -2, y: 1 });
  expect(observed('a')).toEqual([]);
  world.configureBody('wall', { collisionMask: 0 });world.setPosition('a', -30, .5, 0);expect(observed('a')).toEqual([]);
});

test('finite hazard cost crosses when walls close the dry detour instead of refusing engagement', () => {
  const { world, route, activate } = fixture();activate();
  for (const [id, z] of [['north', -1.7], ['south', 1.7]] as const) world.addBody({ id, type: 'static', shape: { kind: 'box', halfX: 10, halfY: 2, halfZ: .2 }, y: 2, z });
  const plan = route('a', 'b')!;expect(Number.isFinite(plan.distance)).toBe(true);expect(plan.direction).toBeUndefined();
  expect(hazardSegmentCost({ x: -5, z: 0 }, { x: 5, z: 0 }, [{ id: 'water', x: 0, z: 0, halfX: 1, halfZ: 1, penalty: 0.5384615384615383 }], .5)).toBeGreaterThan(10);
});

test('route cache restores active costs exactly without changing any physical state', () => {
  const { world, route, activate } = fixture();activate();
  const original = world.checkpoint(), first = route('a', 'b');world.setPosition('a', 1, .5, 3);route('a', 'b');world.restoreCheckpoint(original);
  expect(route('a', 'b')).toEqual(first);expect(world.body('a')!.x).toBe(-5);
});
