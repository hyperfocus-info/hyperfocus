import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { createCombatMotion3D } from '../combat-motion.ts';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';

test('exhausted held sprint recovers while walking; release rearms the paid gesture', async () => {
  const { game, runtime } = await combatMotionFixture({ movement: { sprintCost: 5 } });
  let exhausted = false;
  for (let frame = 0; frame < 100; frame++) {
    game.step(['a:jump', 'move-up']);
    if (game.snapshot().combat!.motion[0]!.sprintExhausted) { exhausted = true; break; }
  }
  expect(exhausted).toBe(true);
  const saved = game.snapshot(), stamina = saved.combat!.state.fighters[0]!.stamina;
  for (let frame = 0; frame < 40; frame++) game.step(['a:jump', 'move-up']);
  expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBeCloseTo(stamina + 24.3);
  expect(Math.abs(runtime.physics.body('a')!.velocityZ)).toBeGreaterThan(5.8);
  expect(Math.abs(runtime.physics.body('a')!.velocityZ)).toBeLessThan(6.1);
  expect(game.snapshot().combat!.motion[0]!.sprintExhausted).toBe(true);
  const restored = game.snapshot();
  game.restore(restored);
  game.step(['a:jump', 'move-up']);
  expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBeCloseTo(restored.combat!.state.fighters[0]!.stamina + .6075);
  expect(game.snapshot().combat!.motion[0]!.sprintExhausted).toBe(true);
  game.step(['move-up']);
  expect(game.snapshot().combat!.motion[0]!.sprintExhausted).toBe(false);
  for (let frame = 0; frame < 16; frame++) game.step(['a:jump', 'move-up']);
  expect(Math.abs(runtime.physics.body('a')!.velocityZ)).toBeGreaterThan(11);
  expect(game.snapshot().combat!.state.fighters[0]!.locomotionAllowed).toBe(true);
});

test('AI motion controls share exhausted sprint payment and recovery', async () => {
  const { runtime } = await combatMotionFixture();
  const config = createTouchOfDeathPreset();
  const motion = createCombatMotion3D({ runtime, definition: { version: 1, config,
    fighters: [{ entityId: 'a', actionPrefix: 'a:', control: 'dummy' }],
    movement: { speed: 6, jumpSpeed: 9, dashSpeed: 18, dashFrames: 10, dashRecoveryFrames: 16, sprintCost: 5 } } });
  const sim = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }] });
  let previous = new Set<string>();
  const actions = new Set(['a:jump']), direction = { x: 0, y: 0, z: -1 };
  for (let frame = 0; frame < 100; frame++) {
    const grounded = motion.surfaces().grounded;
    const control = { actions, previous, direction };
    sim.step({ inputs: [{ fighterId: 'a', locomotionCost: motion.cost('a', actions, previous, grounded, control) }] });
    const suppressed = motion.step(sim.capture(), new Set(), previous, grounded, new Map([['a', control]]));
    runtime.step(new Set(), { suppressedControllerIds: suppressed });
    previous = actions;
  }
  expect(motion.capture()[0]!.sprintExhausted).toBe(true);
  expect(sim.capture().fighters[0]!.stamina).toBeGreaterThan(20);
  expect(Math.abs(runtime.physics.body('a')!.velocityZ)).toBeLessThan(6.1);
});

test('sprint exhaustion latch accepts old saves and rejects malformed values transactionally', async () => {
  const { game } = await combatMotionFixture();
  const saved = game.snapshot();
  const legacy = JSON.parse(JSON.stringify(saved));
  delete legacy.combat.motion[0].sprintExhausted;
  game.restore(legacy);
  expect(game.snapshot().combat!.motion[0]!.sprintExhausted).toBe(false);
  const before = game.snapshot(), malformed = JSON.parse(JSON.stringify(before));
  malformed.combat.motion[0].sprintExhausted = 'yes';
  expect(() => game.restore(malformed)).toThrow('Invalid exhausted sprint state');
  expect(game.snapshot()).toEqual(before);
});
