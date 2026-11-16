import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { combatRoundStandingTargets } from './round-recovery.ts';
import { createCombatKnockout3D } from '../combat-knockout/index.ts';

test('get-up raises a corpse to live-body clearance without moving its opponent or horizontal position', async () => {
  const { runtime, game } = await combatMotionFixture();
  const state = game.snapshot().combat!.state;
  state.fighters[0]!.health = 0;
  runtime.physics.setPosition('a', -10, .6, 3);
  const before = runtime.snapshot();
  const target = combatRoundStandingTargets({ runtime, state });
  expect(target.size).toBe(1); expect(target.has('b')).toBe(false);
  expect(target.get('a')!.x).toBe(-10); expect(target.get('a')!.z).toBe(3);
  expect(target.get('a')!.y).toBeGreaterThanOrEqual(1.85);
  expect(runtime.snapshot()).toEqual(before);
  expect(combatRoundStandingTargets({ runtime, state })).toEqual(target);
});

test('removed supports are excluded from get-up and corpse physics immediately', async () => {
  const { runtime, game } = await combatMotionFixture();
  const state = game.snapshot().combat!.state; state.fighters[0]!.health = 0;
  runtime.physics.setPosition('a', -10, .6, 3);
  const knockout = createCombatKnockout3D({ runtime, fighterIds: ['a', 'b'] });
  for (let i = 0; i < 30; i++) knockout.step(state, []);
  expect(runtime.physics.body('a')!.y).toBeGreaterThan(0);
  runtime.physics.configureBody('floor', { collisionMask: 0 });
  const y = runtime.physics.body('a')!.y;
  expect(combatRoundStandingTargets({ runtime, state }).get('a')!.y).toBe(y);
  for (let i = 0; i < 60; i++) knockout.step(state, []);
  expect(runtime.physics.body('a')!.y).toBeLessThan(-2);
});

test('blocked get-up chooses deterministic nearby clearance instead of a spawn point', async () => {
  const { runtime, game } = await combatMotionFixture({ obstacle: true });
  const state = game.snapshot().combat!.state; state.fighters[0]!.health = 0;
  runtime.physics.setPosition('a', -1, .6, 5);
  const target = combatRoundStandingTargets({ runtime, state }).get('a')!;
  expect(Math.abs(target.x + 1)).toBeLessThan(8);
  expect(target.x).toBeGreaterThan(.9);
  expect(target.z).toBe(5);
  expect(target.y).toBeGreaterThanOrEqual(1.85);
});

test('close fighters recover away from the winner without crossing a surviving wall', async () => {
  const { runtime, game } = await combatMotionFixture({ obstacle: true });
  const state = game.snapshot().combat!.state;state.fighters[0]!.health = 0;
  runtime.physics.setPosition('a', -4, .6, 0);
  runtime.physics.setPosition('b', -4.5, 1.855, 0);
  const before = runtime.snapshot(), target = combatRoundStandingTargets({ runtime, state }).get('a')!;
  expect(target.x).toBeLessThan(-1.45);
  const shape = runtime.physics.body('a')!.shape;
  const radius = shape.kind === 'sphere' ? shape.radius : shape.kind === 'box' ? Math.max(shape.halfX, shape.halfZ) : 1;
  expect(Math.hypot(target.x + 4.5, target.z)).toBeGreaterThanOrEqual(radius * 4);
  for (let step = 0; step <= 90; step++) {
    const t = step / 90, x = -4 + (target.x + 4) * t, z = target.z * t;
    expect(Math.hypot(x + 4.5, z)).toBeGreaterThanOrEqual(.5);
    expect(x).toBeLessThan(-1.45);
  }
  expect(runtime.snapshot()).toEqual(before);
  expect(combatRoundStandingTargets({ runtime, state }).get('a')).toEqual(target);
});
