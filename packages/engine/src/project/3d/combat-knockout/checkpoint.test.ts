import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { createCombatKnockout3D } from './index.ts';

// Component tests: defeated state is supplied directly, not evidence of a combat conversion.
async function fixture() {
  const { runtime, game } = await combatMotionFixture();
  const knockout = createCombatKnockout3D({ runtime, fighterIds: ['a', 'b'] });
  const state = game.snapshot().combat!.state;
  const checkpoint = () => {
    const corpse = knockout.checkpoint(), host = runtime.snapshot(), physics = runtime.physics.checkpoint();
    return { state: corpse.state, restore() { corpse.restore();runtime.restore(host);runtime.physics.restoreCheckpoint(physics); } };
  };
  const advance = (frames: number) => { for (let frame = 0; frame < frames; frame++) knockout.step(state, []); };
  return { runtime, knockout, state, checkpoint, advance };
}

test('knockout rollback restores before-KO topology and replays physical corpse contacts', async () => {
  const f = await fixture(), before = f.checkpoint();
  f.state.fighters[0]!.health = 0;
  f.advance(50);
  const expected = f.checkpoint();
  expect(expected.state.physics.contacts.count).toBeGreaterThan(0);
  expect(f.runtime.physics.body('a')!.collisionMask).toBe(0);
  before.restore();
  expect(f.knockout.has('a')).toBe(false);
  expect(f.runtime.physics.body('a')!.collisionMask).not.toBe(0);
  f.advance(50);
  expect(f.checkpoint().state).toEqual(expected.state);
});

test('retained active solver checkpoint survives a second KO and repeated round resets', async () => {
  const f = await fixture();
  f.state.fighters[0]!.health = 0;f.advance(35);
  const active = f.checkpoint(), host = f.runtime.snapshot(), hostPhysics = f.runtime.physics.checkpoint();
  f.advance(20);
  const continuation = f.checkpoint().state;
  active.restore();
  f.state.fighters[1]!.health = 0;f.advance(15);
  const both = f.checkpoint();
  expect(both.state.active).toEqual(['a', 'b']);
  f.knockout.reset();f.knockout.reset();
  active.restore();
  expect(f.runtime.snapshot()).toEqual(host);
  expect(f.runtime.physics.checkpoint()).toEqual(hostPhysics);
  expect(f.checkpoint().state).toEqual(active.state);
  expect(f.knockout.has('b')).toBe(false);
  f.state.fighters[1]!.health = 100;f.advance(20);
  expect(f.checkpoint().state).toEqual(continuation);
  active.restore();f.state.fighters[1]!.health = 0;f.advance(15);
  expect(f.checkpoint().state).toEqual(both.state);
  both.restore();
  expect(f.checkpoint().state).toEqual(both.state);
  expect(f.runtime.physics.body('a')!.collisionMask).toBe(0);
  expect(f.runtime.physics.body('b')!.collisionMask).toBe(0);
});

test('portable restore does not invalidate retained rollback checkpoints', async () => {
  const f = await fixture();
  f.state.fighters[0]!.health = 0;f.advance(30);
  const retained = f.checkpoint(), portable = f.knockout.capture();
  f.advance(8);const expected = f.checkpoint().state;
  f.knockout.restore(portable);
  for (const [index, body] of f.knockout.capture()[0]!.bodies.entries()) {
    for (const [axis, value] of body.pose.entries()) expect(value).toBeCloseTo(portable[0]!.bodies[index]!.pose[axis]!, 12);
  }
  retained.restore();f.advance(8);
  expect(f.checkpoint().state).toEqual(expected);
});

test('knockout diagnostics are detached and follow replacement worlds after reset and restore', async () => {
  const f = await fixture(), read = f.knockout.diagnostics, empty = read();
  f.state.fighters[0]!.health = 0;f.advance(3);
  const historical = read(), expected = structuredClone(historical), retained = f.checkpoint(), portable = f.knockout.capture();
  expect(historical).toMatchObject({ bodies: empty.bodies + 10, steps: 3 });
  const edited = read();edited.steps = -1;edited.ccdEligiblePairs = -1;edited.ccdBoundsRejects = -1;
  expect(read()).toEqual(expected);
  f.advance(2);expect(read().steps).toBe(5);expect(historical).toEqual(expected);
  f.knockout.reset();
  expect(read()).toMatchObject({ bodies: empty.bodies, steps: 0, ccdTests: 0, ccdEligiblePairs: 0, ccdBoundsRejects: 0 });
  f.knockout.restore(portable);
  expect(read()).toMatchObject({ bodies: empty.bodies + 10, steps: 0 });
  f.advance(1);expect(read().steps).toBe(1);
  retained.restore();expect(read()).toEqual(expected);
  expect(historical).toEqual(expected);expect(empty.steps).toBe(0);
});
