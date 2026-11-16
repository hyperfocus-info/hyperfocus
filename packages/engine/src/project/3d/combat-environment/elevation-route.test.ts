import { expect, test } from 'bun:test';
import { createRigidWorld3D } from '../../../physics/rigid-3d.ts';
import { createCombatElevationRoute } from './elevation-route.ts';
import { createCombatJumpClearance } from './jump-clearance.ts';

function fixture(capacity = 8) {
  const world = createRigidWorld3D({ capacity, gravityY: -20 });
  world.addBody({ id: 'actor', shape: { kind: 'sphere', radius: .5 }, x: -5, y: .5 });
  world.addBody({ id: 'target', shape: { kind: 'sphere', radius: .5 }, y: 1.5 });
  world.addBody({ id: 'floor', type: 'static', shape: { kind: 'box', halfX: 10, halfY: .5, halfZ: 10 }, y: -.5 });
  world.addBody({ id: 'roof', type: 'static', shape: { kind: 'box', halfX: 1.5, halfY: .5, halfZ: 1.5 }, y: .5 });
  const bodyIds = ['actor', 'target', 'floor', 'roof', 'ceiling'];
  const route = createCombatElevationRoute({ world, bodyIds, gravityY: () => -20, movement: { speed: 7, jumpSpeed: 10, jumpCost: 10, dashSpeed: 14, dashFrames: 10, dashRecoveryFrames: 10 } });
  const request = { fighterId: 'actor', targetId: 'target', grounded: true, stamina: 100, delay: 0 };
  return { world, route, request, bodyIds };
}

test('remote districts do not disable a local rooftop approach', () => {
  const f = fixture(90), baseline = f.route(f.request);
  expect(baseline?.plan).toBeDefined();
  for (let index = 0; index < 80; index++) {
    const id = `remote:${index}`;f.bodyIds.push(id);
    f.world.addBody({ id, type: 'static', shape: { kind: 'box', halfX: 2, halfY: 1, halfZ: 2 }, x: 100 + index * 5, y: 1, z: 100 });
  }
  expect(f.route(f.request)).toEqual(baseline);
});

test('navigation waits for ordinary stamina and invalidates removed landing supports', () => {
  const f = fixture(), approach = f.route(f.request)!;
  expect(approach).toBeDefined();
  const takeoff = approach.plan!.takeoff;f.world.setPosition('actor', takeoff.x, takeoff.y, takeoff.z);
  expect(f.route({ ...f.request, stamina: 0, plan: approach.plan })!.jump).toBe(false);
  expect(f.route({ ...f.request, stamina: 10, plan: approach.plan })!.jump).toBe(true);
  f.world.configureBody('roof', { collisionMask: 0 });
  expect(f.route({ ...f.request, plan: approach.plan })).toBeUndefined();
});

test('a directly underneath target produces an outward drop rather than zero movement', () => {
  const f = fixture();f.world.setPosition('actor', 0, 1.5, 0);f.world.setPosition('target', 0, .5, 0);
  // Use a taller support to represent two genuinely distinct floors.
  f.world.setPosition('roof', 0, 2.5, 0);f.world.setPosition('actor', 0, 3.5, 0);
  const decision = f.route(f.request)!;
  expect(decision.plan!.phase).toBe('drop');expect(Math.hypot(decision.direction.x, decision.direction.z)).toBeGreaterThan(.9);
});

test('a planned rooftop drop detours around solid clutter before approaching its edge', () => {
  const f = fixture();
  f.world.setPosition('roof', 0, 2.5, 0);f.world.setPosition('actor', -1, 3.5, 0);
  f.world.setPosition('target', 4, .5, 0);
  f.world.addBody({ id: 'clutter', type: 'static', shape: { kind: 'box', halfX: .3, halfY: .5, halfZ: .3 }, x: 0, y: 3.5 });
  f.bodyIds.push('clutter');
  const decision = f.route({ ...f.request, plan: { surfaceId: 'floor', point: { x: 4, y: .5, z: 0 }, takeoff: { x: 3, y: 3.5, z: 0 }, phase: 'drop', wait: 0 } })!;
  expect(decision.plan!.phase).toBe('drop');expect(decision.jump).toBe(false);
  expect(Math.abs(decision.direction.z)).toBeGreaterThan(.2);
});

test('airborne neutral movement is not captured by traversal; obstructed arcs are rejected', () => {
  const f = fixture();expect(f.route({ ...f.request, grounded: false })).toBeUndefined();
  const clear = createCombatJumpClearance(f);
  f.world.addBody({ id: 'ceiling', type: 'static', shape: { kind: 'box', halfX: 4, halfY: .2, halfZ: 4 }, y: 2 });
  expect(clear({ x: -2.4, y: .5, z: 0 }, { x: 0, y: 1.5, z: 0 }, 10, 20, .5)).toBe(false);
});

test('delayed landing corrections release the stick before ground movement resumes', () => {
  const f = fixture(), plan = f.route(f.request)!.plan!;
  plan.phase = 'air';
  f.world.setPosition('actor', plan.point.x - .2, plan.point.y + .2, plan.point.z);
  f.world.setVelocity('actor', 2, -5, 0);
  const decision = f.route({ ...f.request, grounded: false, delay: 12, plan })!;
  expect(decision.direction).toEqual({ x: 0, y: 0, z: 0 });
  expect(decision.jump).toBe(false);
});

test('same-height pursuit uses a narrow connecting bridge instead of a diagonal gap', () => {
  const world = createRigidWorld3D({ capacity: 5 });
  world.addBody({ id: 'actor', shape: { kind: 'sphere', radius: 1 }, x: -8, y: 7, z: -4.8 });
  world.addBody({ id: 'target', shape: { kind: 'sphere', radius: 1 }, x: -3, y: 7, z: -1 });
  world.addBody({ id: 'landing', type: 'static', shape: { kind: 'box', halfX: 1.5, halfY: 3, halfZ: 1 }, x: -8, y: 3, z: -5 });
  world.addBody({ id: 'bridge', type: 'static', shape: { kind: 'box', halfX: .5, halfY: .2, halfZ: 1 }, x: -6.5, y: 5.8, z: -5 });
  world.addBody({ id: 'roof', type: 'static', shape: { kind: 'box', halfX: 3, halfY: .2, halfZ: 5 }, x: -3, y: 5.8, z: -1 });
  const route = createCombatElevationRoute({ world, bodyIds: ['landing', 'bridge', 'roof'], gravityY: () => -20, movement: { speed: 9.1, jumpSpeed: 10.5, dashSpeed: 16.8, dashFrames: 12, dashRecoveryFrames: 18 } });
  const direction = route({ fighterId: 'actor', targetId: 'target', grounded: true, stamina: 100, delay: 12 })!.direction;
  expect(direction.x).toBeGreaterThan(.9);
  expect(direction.z).toBeLessThan(0);
});

test('connected auto-step risers beat an unrelated prop jump and invalidate when a riser disappears', () => {
  const world = createRigidWorld3D({ capacity: 12 });
  world.addBody({ id: 'actor', shape: { kind: 'sphere', radius: .5 }, y: .5, z: 4 });
  world.addBody({ id: 'target', shape: { kind: 'sphere', radius: .5 }, y: 3.5, z: -4 });
  world.addBody({ id: 'floor', type: 'static', shape: { kind: 'box', halfX: 10, halfY: .5, halfZ: 10 }, y: -.5 });
  world.addBody({ id: 'roof', type: 'static', shape: { kind: 'box', halfX: 2, halfY: 1.5, halfZ: 1 }, y: 1.5, z: -4 });
  world.addBody({ id: 'crate', type: 'static', shape: { kind: 'box', halfX: .8, halfY: .65, halfZ: .8 }, x: 3, y: .65, z: 5 });
  const bodyIds = ['floor', 'roof', 'crate'];
  for (let step = 0; step < 6; step++) {
    const id = `step:${step}`, height = (step + 1) * .25;bodyIds.push(id);
    world.addBody({ id, type: 'static', shape: { kind: 'box', halfX: 1, halfY: height, halfZ: .5 }, y: height, z: 2.5 - step });
  }
  const route = createCombatElevationRoute({ world, bodyIds, gravityY: () => -20,
    movement: { speed: 7, jumpSpeed: 10, dashSpeed: 14, dashFrames: 10, dashRecoveryFrames: 10, autoStepHeight: .55 } });
  const request = { fighterId: 'actor', targetId: 'target', grounded: true, stamina: 100, delay: 0 };
  expect(route(request)).toEqual({ direction: { x: 0, y: 0, z: -1 }, jump: false });
  world.configureBody('step:2', { collisionMask: 0 });
  expect(route(request)).not.toEqual({ direction: { x: 0, y: 0, z: -1 }, jump: false });
  world.configureBody('step:2', { collisionMask: 0xffffffff });
  expect(route(request)).toEqual({ direction: { x: 0, y: 0, z: -1 }, jump: false });
  // The physical step allowance can span two risers, but a side approach must
  // enter the first tread rather than aim under the third riser's corner.
  world.setPosition('actor', 3, .5, 2.5);
  const wideStep = createCombatElevationRoute({ world, bodyIds, gravityY: () => -20,
    movement: { speed: 7, jumpSpeed: 10, dashSpeed: 14, dashFrames: 10, dashRecoveryFrames: 10, autoStepHeight: 1.05 } });
  const decision = wideStep(request)!;
  expect(decision.jump).toBe(false);expect(decision.direction.x).toBeLessThan(-.9);
  expect(Math.abs(decision.direction.z)).toBeLessThan(.2);
  // Approaching from beside the upper stairs must go around their solid side.
  world.setPosition('actor', 3, .5, -1);
  const side = wideStep(request)!;
  expect(side.direction.z).toBeGreaterThan(.8);
  // Auto-step lifts the sphere slightly above its tread before contact catches
  // up. Do not substitute a direct airborne pursuit toward the roof mid-step.
  world.setPosition('actor', .8, 1.002, 2.5);
  world.setVelocity('actor', 0, -.3, 0);
  const gap = wideStep({ ...request, grounded: false })!;
  expect(gap).toBeDefined();expect(gap.jump).toBe(false);
  expect(gap.direction.x).toBeLessThan(-.1);expect(gap.direction.z).toBeLessThan(0);
  world.setVelocity('actor', 0, 5, 0);
  expect(wideStep({ ...request, grounded: false })).toBeUndefined();
});
