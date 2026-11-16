import { expect, test } from 'bun:test';
import { createRigidWorld3D, type RigidPhysicsPrecision3D, type RigidWorld3D } from '../rigid-3d.ts';

const step = 0.016666666666666666;

function clutter(world: RigidWorld3D) {
  // Eligible by layer, but disjoint from every complete sweep. Insert first so
  // charging these pairs to maxCcdTests starves even the final continuous body.
  for (let index = 0; index < 64; index++) world.addBody({ id: `clutter-${index}`, type: 'static',
    shape: { kind: 'box', halfX: .5, halfY: .5, halfZ: .5 }, x: 1000 + index * 3, y: 1000, z: 1000,
    collisionLayer: 4, collisionMask: 2 });
}

function barriers(count: number, axis: 'x' | 'y', maxCcdTests: number, precision: RigidPhysicsPrecision3D) {
  const world = createRigidWorld3D({ capacity: 64 + count * 5, gravityY: 0, maxCcdTests, precision });
  clutter(world);
  for (let index = 0; index < count; index++) {
    const shape = axis === 'x' ? { kind: 'box' as const, halfX: .05, halfY: .6, halfZ: .6 }
      : { kind: 'box' as const, halfX: .6, halfY: .05, halfZ: .6 };
    const decoyPosition = axis === 'x' ? { x: -1 } : { y: 1 };
    // Both directions of the mask contract and trigger exclusion must survive
    // moving bounds rejection ahead of the admission budget.
    world.addBody({ id: `trigger-${index}`, type: 'static', shape, z: index * 6, ...decoyPosition, trigger: true, collisionLayer: 4, collisionMask: 2 });
    world.addBody({ id: `other-layer-${index}`, type: 'static', shape, z: index * 6, ...decoyPosition, collisionLayer: 8, collisionMask: 2 });
    world.addBody({ id: `other-mask-${index}`, type: 'static', shape, z: index * 6, ...decoyPosition, collisionLayer: 4, collisionMask: 8 });
    world.addBody({ id: `barrier-${index}`, type: 'static', shape, z: index * 6, collisionLayer: 4, collisionMask: 2 });
  }
  for (let index = 0; index < count; index++) world.addBody({ id: `actor-${index}`, shape: { kind: 'sphere', radius: .2 },
    z: index * 6, ...(axis === 'x' ? { x: -2, velocityX: 240 } : { y: 2, velocityY: -240 }),
    continuous: true, friction: 0, collisionLayer: 2, collisionMask: 4 });
  return world;
}

function expectSameSimulation(actual: RigidWorld3D, reference: RigidWorld3D) {
  const first = actual.checkpoint(), second = reference.checkpoint();
  expect(first.bodies).toEqual(second.bodies);
  expect(first.contacts).toEqual(second.contacts);
  expect(first.constraints).toEqual(second.constraints);
}

for (const count of [10, 20]) for (const axis of ['x', 'y'] as const) for (const precision of ['float32', 'float64'] as const) {
  test(`${count} late continuous bodies retain thin ${axis === 'x' ? 'wall' : 'floor'} coverage with bounded CCD (${precision})`, () => {
    const reference = barriers(count, axis, 8192, precision), bounded = barriers(count, axis, count, precision);
    reference.step(step);bounded.step(step);
    const sign = axis === 'x' ? -1 : 1;
    expect(reference.body(`actor-${count - 1}`)![axis] * sign).toBeCloseTo(.25, 5);
    expect(bounded.body(`actor-${count - 1}`)![axis] * sign).toBeCloseTo(.25, 5);
    expectSameSimulation(bounded, reference);
    expect(bounded.diagnostics).toMatchObject({ ccdTests: count, ccdTestOverflows: 0, ccdHits: count });
    expect(bounded.contactCount()).toBe(count);
  });
}

function movingObstacles(count: number, rotating: boolean, maxCcdTests?: number) {
  const world = createRigidWorld3D({ capacity: 64 + count * 2, maxCcdTests, gravityY: 0, velocityIterations: 6 });
  clutter(world);
  for (let index = 0; index < count; index++) world.addBody({ id: `obstacle-${index}`, type: 'kinematic', z: index * 6,
    ...(rotating ? { shape: { kind: 'box' as const, halfX: 2, halfY: .04, halfZ: .04 },
      rotation: [0, 0, Math.sin(-Math.PI / 8), Math.cos(-Math.PI / 8)], angularVelocity: [0, 0, Math.PI * 2], angularDamping: 0 }
      : { shape: { kind: 'box' as const, halfX: .05, halfY: .6, halfZ: .6 }, x: 4, velocityX: -480 }),
    collisionLayer: 4, collisionMask: 2 });
  for (let index = 0; index < count; index++) world.addBody({ id: `actor-${index}`, shape: { kind: 'sphere', radius: rotating ? .04 : .2 },
    x: rotating ? 1.92 : 0, z: index * 6, velocityX: .01, continuous: true, friction: 0, collisionLayer: 2, collisionMask: 4 });
  return world;
}

for (const count of [10, 20]) for (const rotating of [false, true]) {
  test(`${count} late continuous bodies retain ${rotating ? 'rotating' : 'moving'} obstacle coverage and replay`, () => {
    const reference = movingObstacles(count, rotating, 8192), bounded = movingObstacles(count, rotating, count);
    const checkpoint = bounded.checkpoint(), seconds = rotating ? .25 : step;
    reference.step(seconds);bounded.step(seconds);
    expect(reference.diagnostics.ccdHits).toBe(count);
    expect(bounded.diagnostics.ccdHits).toBe(count);
    if (rotating) expect(bounded.diagnostics.ccdAngularHits).toBe(count);
    else expect(bounded.body(`actor-${count - 1}`)!.x).toBeLessThan(-.25);
    expectSameSimulation(bounded, reference);
    expect(bounded.diagnostics.ccdTests).toBe(count);
    expect(bounded.diagnostics.ccdTestOverflows).toBe(0);
    const first = bounded.checkpoint();
    bounded.restoreCheckpoint(checkpoint);bounded.step(seconds);expect(bounded.checkpoint()).toEqual(first);
  });
}

for (const count of [10, 20]) test(`default CCD budget covers ${count} continuous bodies among eligible distant clutter`, () => {
  const world = movingObstacles(count, false), reference = movingObstacles(count, false, 8192);
  expect(world.maxCcdTests).toBe(world.capacity * 8);
  reference.step(step);world.step(step);
  expect(world.diagnostics.ccdHits).toBe(count);
  expect(world.diagnostics.ccdTestOverflows).toBe(0);
  expectSameSimulation(world, reference);
});

test('CCD accounting restores legacy checkpoints and resets per-step eligibility counters', () => {
  const world = barriers(10, 'y', 10, 'float64'), checkpoint = world.checkpoint();
  Reflect.deleteProperty(checkpoint.diagnostics, 'ccdEligiblePairs');
  Reflect.deleteProperty(checkpoint.diagnostics, 'ccdBoundsRejects');
  world.step(step);world.restoreCheckpoint(checkpoint);
  expect(world.diagnostics).toMatchObject({ ccdEligiblePairs: 0, ccdBoundsRejects: 0 });
  world.step(step);const result = world.checkpoint();
  expect(world.diagnostics).toMatchObject({ ccdTests: 10, ccdEligiblePairs: 740, ccdBoundsRejects: 730, ccdTestOverflows: 0 });
  world.restoreCheckpoint(checkpoint);world.step(step);expect(world.checkpoint()).toEqual(result);
  for (let index = 0; index < 10; index++) world.setVelocity(`actor-${index}`, 0, 0, 0);
  world.step(step);
  expect(world.diagnostics).toMatchObject({ ccdTests: 0, ccdEligiblePairs: 0, ccdBoundsRejects: 0 });
});

test('nearby candidates still obey the CCD work limit and report saturation', () => {
  const world = createRigidWorld3D({ capacity: 3, maxCcdTests: 1, gravityY: 0 });
  world.addBody({ id: 'near-miss', type: 'static', shape: { kind: 'box', halfX: .05, halfY: .6, halfZ: .6 }, z: 1 });
  world.addBody({ id: 'wall', type: 'static', shape: { kind: 'box', halfX: .05, halfY: .6, halfZ: .6 } });
  world.addBody({ id: 'actor', shape: { kind: 'sphere', radius: .2 }, x: -2, velocityX: 240, continuous: true });
  world.step(step);
  expect(world.diagnostics).toMatchObject({ ccdTests: 1, ccdTestOverflows: 1, ccdHits: 0 });
});

/** Preserve endpoint rounding across interleaved swept-bounds decisions. */
function interleavedCandidatesWorld(precision: RigidPhysicsPrecision3D,
  targetType: 'static' | 'kinematic' | 'dynamic') {
  const world = createRigidWorld3D({ capacity: 12, maxCcdTests: 128, gravityY: 0, precision });
  world.addBody({ id: 'actor', shape: { kind: 'box', halfX: .2, halfY: .2, halfZ: .2 },
    x: -2, velocityX: 240, angularVelocity: [3, 5, 7], angularDamping: 0, continuous: true,
    rotation: [-.4, -.6, -.8, -1], friction: 0 });
  const far = (id: string, offset: number) => world.addBody({ id, type: 'static',
    shape: { kind: 'box', halfX: .5, halfY: .7, halfZ: .3 }, x: 100 + offset, y: 80, z: 60,
    rotation: offset % 2 ? [-.2, .6, -.4, -1.4] : [-0, 0, -0, -3] });
  far('far-before-overlap', 0);
  world.addBody({ id: 'separating-overlap', type: 'static', shape: { kind: 'sphere', radius: .25 }, x: -2.35 });
  far('far-after-overlap', 1);
  world.addBody({ id: 'near-miss', type: 'static', shape: { kind: 'box', halfX: .05, halfY: .6, halfZ: .6 }, z: 1.4 });
  far('far-after-miss', 2);
  world.addBody({ id: 'target', type: targetType, shape: { kind: 'box', halfX: .05, halfY: .7, halfZ: .7 },
    x: targetType === 'static' ? 0 : 4, velocityX: targetType === 'static' ? 0 : -240,
    rotation: [.2, -.4, .6, -1.2], angularVelocity: targetType === 'static' ? undefined : [1, 2, 3],
    angularDamping: 0, continuous: targetType === 'dynamic', friction: 0 });
  far('far-after-target', 3);
  // Restore retains packed values exactly. Exercise nonunit endpoint rounding,
  // signed zero, and both quaternion hemispheres independently of API normalization.
  const checkpoint = world.checkpoint();
  for (const field of ['rotationX', 'rotationY', 'rotationZ', 'rotationW'] as const)
    for (let index = 0; index < 8; index++) checkpoint.bodies[field][index]! *= index % 2 ? -1.0000002 : 1.0000002;
  world.restoreCheckpoint(checkpoint);
  return world;
}

for (const precision of ['float32', 'float64'] as const) for (const targetType of ['static', 'kinematic', 'dynamic'] as const) {
  test(`interleaved CCD endpoint restores replay exactly with ${targetType} targets (${precision})`, () => {
    const world = interleavedCandidatesWorld(precision, targetType), initial = world.checkpoint();
    const expected = Array.from({ length: 8 }, () => { world.step(step);return world.checkpoint(); });
    expect(expected[0]!.diagnostics.ccdBoundsRejects).toBeGreaterThanOrEqual(4);
    expect(expected[0]!.diagnostics.ccdTests).toBeGreaterThanOrEqual(3);
    expect(expected[0]!.diagnostics.ccdAngularTests).toBeGreaterThan(0);
    expect(expected[0]!.diagnostics.ccdTestOverflows).toBe(0);
    world.restoreCheckpoint(initial);
    for (const checkpoint of expected) { world.step(step);expect(world.checkpoint()).toEqual(checkpoint); }
  });
}
