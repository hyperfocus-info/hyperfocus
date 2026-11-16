import { expect, test } from 'bun:test';
import { createPhysicsWorld2D, type PhysicsBody2DDefinition } from '../2d.ts';
import { createPhysics2DHandles } from './handles-2d.ts';
import { createRigidWorld3D, type RigidBodyDefinition3D } from '../rigid-3d.ts';

test('rejected 2D registrations preserve all capacity and query state', () => {
  const invalid: Partial<PhysicsBody2DDefinition>[] = [{ mass: 0 }, { x: NaN }, { y: Infinity },
    { velocityX: NaN }, { velocityY: NaN }, { angle: NaN }, { angularVelocity: NaN },
    { restitution: 2 }, { friction: -1 }, { gravityScale: NaN }, { collisionLayer: -1 }];
  const world = createPhysicsWorld2D({ capacity: 1, gravityY: 0 });
  for (const fields of invalid) {
    expect(() => world.addBody({ id: 'body', shape: { kind: 'circle', radius: 1 }, ...fields })).toThrow();
    expect(world.hasBody('body')).toBe(false);
    expect(world.body(0)).toBeUndefined();
    expect(world.queryAabb(-10, -10, 10, 10, new Int32Array(1))).toBe(0);
  }
  const handle = world.addBody({ id: 'body', shape: { kind: 'circle', radius: 1 } });
  expect(world.body(handle)?.id).toBe('body');
});

test('recycled 2D identities agree across queries, contacts and joint endpoints', () => {
  const world = createPhysicsWorld2D({ capacity: 2, maxJoints: 1, gravityY: 0 });
  const old = world.addBody({ id: 'old', type: 'static', shape: { kind: 'circle', radius: 1 } });
  world.removeBody('old');
  const fresh = world.addBody({ id: 'fresh', type: 'static', shape: { kind: 'box', halfWidth: 1, halfHeight: 1 } });
  const other = world.addBody({ id: 'other', trigger: true, shape: { kind: 'circle', radius: 1 }, x: 1 });
  expect(world.bodyIndex('fresh')).toBe(fresh);
  expect(world.body(fresh)?.index).toBe(fresh);
  expect(() => world.applyImpulse(old, 1, 0)).toThrow();
  expect(() => world.addDistanceJoint({ id: 'bad', a: old, b: other })).toThrow();
  const output = new Int32Array(2);
  expect(world.queryAabb(-3, -3, 3, 3, output)).toBe(2);
  expect([...output]).toEqual([fresh, other]);
  expect(world.raycast(-5, 0, 1, 0, 10)?.index).toBe(fresh);
  expect(world.shapeCast({ kind: 'circle', radius: 0.5 }, -5, 0, 0, 10, 0)?.index).toBe(fresh);
  world.step(0.01);
  expect(new Set([world.contact(0).aIndex, world.contact(0).bIndex])).toEqual(new Set([fresh, other]));
  const joint = world.addDistanceJoint({ id: 'joint', a: fresh, b: other });
  expect(world.joint(joint)).toMatchObject({ aIndex: fresh, bIndex: other });
  world.removeJoint('joint');
  const replacement = world.addDistanceJoint({ id: 'next', a: fresh, b: other });
  expect(replacement).not.toBe(joint);
  expect(world.joint(joint)).toBeUndefined();
  expect(world.joint(replacement)?.index).toBe(replacement);
  expect(() => world.removeBody('fresh')).toThrow();
  expect(world.contactCount()).toBe(1);
  world.removeJoint('next');
  world.removeBody('fresh');
  expect(world.contactCount()).toBe(0);
});

test('2D identity generations retire instead of wrapping an Int32 handle', () => {
  const alive = new Uint8Array(65_536);
  const handles = createPhysics2DHandles(alive);
  alive[65_535] = 1;
  for (let generation = 0; generation < 32_767; generation++) {
    if (!handles.retire(65_535)) throw Error('Identity retired before its Int32 budget was exhausted');
  }
  expect(handles.at(65_535)).toBe(2_147_483_647);
  expect(handles.resolve(65_535)).toBeUndefined();
  expect(handles.retire(65_535)).toBe(false);
  alive[65_535] = 0;
  expect(handles.resolve(2_147_483_647)).toBeUndefined();
});

test('rejected rigid body rotations and damping preserve IDs, diagnostics and capacity', () => {
  const invalid: Partial<RigidBodyDefinition3D>[] = [{ linearDamping: -1 }, { angularDamping: -1 },
    { rotation: [0, 0, 0, 0] }, { rotation: [NaN, 0, 0, 1] }];
  const world = createRigidWorld3D({ capacity: 1 });
  for (const fields of invalid) {
    expect(() => world.addBody({ id: 'body', shape: { kind: 'sphere', radius: 1 }, ...fields })).toThrow();
    expect(world.hasBody('body')).toBe(false);
    expect(world.diagnostics.bodies).toBe(0);
  }
  expect(world.hasBody(world.addBody({ id: 'body', shape: { kind: 'sphere', radius: 1 }, rotation: [0, 0, 0, 2] }))).toBe(true);
  expect(world.body('body')?.rotationW).toBe(1);
});

test('all rigid constraint creation paths validate before consuming their slot', () => {
  const world = createRigidWorld3D({ capacity: 2, maxConstraints: 1 });
  world.addBody({ id: 'a', shape: { kind: 'sphere', radius: 1 } });
  world.addBody({ id: 'b', shape: { kind: 'sphere', radius: 1 }, x: 3 });
  const pair = { id: 'joint', a: 'a', b: 'b' };
  const invalid = [
    () => world.addDistanceConstraint({ ...pair, b: 'missing' }),
    () => world.addDistanceConstraint({ ...pair, b: 'a' }),
    () => world.addDistanceConstraint({ ...pair, stiffness: -1 }),
    () => world.addDistanceConstraint({ ...pair, distance: -1 }),
    () => world.addPointConstraint({ ...pair, damping: -1 }),
    () => world.addAngularMotorConstraint({ ...pair, maxTorqueImpulse: -1 }),
    () => world.addAngularLimitConstraint({ ...pair, maxAngleRadians: -1 }),
    () => world.addAngularSwingTwistLimitConstraint({ ...pair, twistAxis: [0, 0, 1], maxSwingRadians: 1, minTwistRadians: 2, maxTwistRadians: 1 })
  ];
  for (const create of invalid) {
    expect(create).toThrow();
    expect(world.constraint('joint')).toBeUndefined();
    const handle = world.addDistanceConstraint(pair);
    expect(world.constraint(handle)?.id).toBe('joint');
    expect(world.removeConstraint(handle)).toBe(true);
  }
});
