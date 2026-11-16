import { expect, test } from 'bun:test';
import { createRigidWorld3D } from '../rigid-3d.ts';

function fixture() {
  const world = createRigidWorld3D({ capacity: 3, maxContacts: 2, gravityY: -9.81 });
  world.addBody({ id: 'floor', type: 'static', shape: { kind: 'box', halfX: 10, halfY: .5, halfZ: 10 }, y: -.5 });
  world.addBody({ id: 'box', shape: { kind: 'box', halfX: .5, halfY: .5, halfZ: .5 }, y: .5 });
  for (let i = 0; i < 20; i++) world.step(0.016666666666666666);
  return world;
}

test('portable contacts preserve manifold warm starts and remap IDs across body storage order', () => {
  const world = fixture(), saved = JSON.parse(JSON.stringify(world.captureContactState()));
  expect(saved.contacts).toHaveLength(1);expect(saved.contacts[0].warmStartedPointCount).toBeGreaterThan(0);
  const other = createRigidWorld3D({ capacity: 3, maxContacts: 2, gravityY: -9.81 });
  other.addBody({ id: 'box', shape: { kind: 'box', halfX: .5, halfY: .5, halfZ: .5 }, y: .5 });
  other.addBody({ id: 'floor', type: 'static', shape: { kind: 'box', halfX: 10, halfY: .5, halfZ: 10 }, y: -.5 });
  other.configureBody('floor', { collisionMask: 0 });
  // A saved environment can re-enable a currently disabled solid after validation.
  expect(other.validateContactState(saved)).toEqual(saved);
  other.restoreContactState(saved);expect(other.captureContactState()).toEqual(saved);
  const body = world.body('box')!;
  other.configureBody('floor', { collisionMask: 0xffffffff });
  other.setPosition('box', body.x, body.y, body.z);other.setRotation('box', body.rotationX, body.rotationY, body.rotationZ, body.rotationW);
  other.setVelocity('box', body.velocityX, body.velocityY, body.velocityZ);other.setAngularVelocity('box', body.angularVelocityX, body.angularVelocityY, body.angularVelocityZ);
  world.step(0.016666666666666666);other.step(0.016666666666666666);
  const expected = world.body('box')!, actual = other.body('box')!;
  for (const field of ['x', 'y', 'z', 'velocityX', 'velocityY', 'velocityZ', 'angularVelocityX', 'angularVelocityY', 'angularVelocityZ'] as const) expect(actual[field]).toBeCloseTo(expected[field], 12);
  expect(other.captureContactState().contacts[0]!.warmStartedPointCount).toBeGreaterThan(0);
  world.setPosition('box', 0, 5, 0);world.step(0.016666666666666666);expect(world.contactCount()).toBe(0);
  world.restoreContactState(saved);expect(world.captureContactState()).toEqual(saved);
});

test('portable contact validation is bounded and atomic even for sparse or partial JS payloads', () => {
  const world = fixture(), saved = world.captureContactState(), checkpoint = world.checkpoint();
  const invalid: unknown[] = [null, { version: 2, contacts: [] }, { version: 1, contacts: Array(2) }, { version: 1, contacts: Array(3).fill(saved.contacts[0]) }];
  for (const change of [
    { aId: 'unknown' }, { aId: 'box', bId: 'box' }, { normal: [1, 1, 1] }, { point: [0, NaN, 0] },
    { failedBodyId: 'unknown' }, { manifold: Array(4) }, { manifoldPointCount: 5 }, { warmStartedPointCount: 5 },
    { penetration: -1 }, { trigger: 1 }, { closingSpeed: Infinity },
  ]) invalid.push({ version: 1, contacts: [{ ...saved.contacts[0], ...change }] });
  for (const value of invalid) { expect(() => world.restoreContactState(value)).toThrow();expect(world.checkpoint()).toEqual(checkpoint); }
});

test('removed contacts and reused body slots never produce unrestorable portable history', () => {
  const world = fixture();expect(world.captureContactState().contacts).toHaveLength(1);
  world.removeBody('box');
  const removed = JSON.parse(JSON.stringify(world.captureContactState()));expect(removed.contacts).toEqual([]);
  expect(() => world.restoreContactState(removed)).not.toThrow();
  world.addBody({ id: 'box', shape: { kind: 'box', halfX: .5, halfY: .5, halfZ: .5 }, y: .5 });world.step(0.016666666666666666);
  expect(world.captureContactState().contacts).toHaveLength(1);
  world.removeBody('box');world.addBody({ id: 'box', shape: { kind: 'box', halfX: .5, halfY: .5, halfZ: .5 }, y: 5 });
  const reused = JSON.parse(JSON.stringify(world.captureContactState()));expect(reused.contacts).toEqual([]);
  expect(() => world.restoreContactState(reused)).not.toThrow();
});
