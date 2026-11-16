import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { createCombatProject3D, readCombatProject3D } from '../combat-declaration.ts';

const movement = { separateJump: true, jumpSpeed: 10.5, jumpHoldFrames: 30, jumpHoldGravityScale: .62, speed: 9.1, sprintSpeed: 15.6, dashSpeed: 16.8, dashEndSpeedRatio: .685, coastDeceleration: 19.8, airJumps: 1 };

test('separate jump rises immediately with directional input; Circle steps then sprints without jumping', async () => {
  const jump = await combatMotionFixture({ movement, gravityScale: 1.9 });
  jump.game.step(['a:jump', 'move-up']);
  expect(jump.runtime.physics.body('a')!.velocityY).toBeGreaterThan(10);
  expect(jump.game.snapshot().combat!.motion[0]!.dash).toBe(0);
  const dash = await combatMotionFixture({ movement, gravityScale: 1.9 });
  const floor = dash.runtime.physics.body('a')!.y;
  dash.game.step(['a:dash', 'move-up']);
  expect(dash.runtime.physics.body('a')!.velocityZ).toBeLessThan(-16.5);
  expect(dash.runtime.physics.body('a')!.velocityY).toBeLessThan(.1);
  for (let index = 0; index < 20; index++) dash.game.step(['a:dash', 'move-up']);
  expect(dash.runtime.physics.body('a')!.velocityZ).toBeLessThan(-15.3);
  expect(dash.runtime.physics.body('a')!.y).toBeCloseTo(floor, 3);
  dash.game.step(['move-up']);
  expect(dash.runtime.physics.body('a')!.velocityY).toBeLessThan(.1);
});

test('holding jump monotonically scales height, caps after thirty ticks, and restores its saved hold budget', async () => {
  const heights: number[] = [];
  for (const held of [1, 10, 20, 30, 60]) {
    const { game, runtime } = await combatMotionFixture({ movement, gravityScale: 1.9 });
    const floor = runtime.physics.body('a')!.y;
    let peak = floor;
    for (let tick = 0; tick < 160; tick++) {
      game.step(tick < held ? ['a:jump'] : []);peak = Math.max(peak, runtime.physics.body('a')!.y);
      if (tick === 6) { const saved = game.snapshot();game.restore(saved);expect(game.snapshot().combat!.motion[0]!.jumpHold).toBe(saved.combat!.motion[0]!.jumpHold); }
    }
    heights.push(peak - floor);
  }
  const baseline = await combatMotionFixture({ movement: { ...movement, jumpHoldFrames: 0 }, gravityScale: 1.9 });
  const floor = baseline.runtime.physics.body('a')!.y;let oldPeak = floor;
  for (let tick = 0; tick < 160; tick++) { baseline.game.step(tick === 0 ? ['a:jump'] : []);oldPeak = Math.max(oldPeak, baseline.runtime.physics.body('a')!.y); }
  expect(heights[3]! / (oldPeak - floor)).toBeCloseTo(1.5, 1);
  expect(heights[1]!).toBeGreaterThan(heights[0]!);expect(heights[2]!).toBeGreaterThan(heights[1]!);expect(heights[3]!).toBeGreaterThan(heights[2]!);
  expect(heights[4]).toBeCloseTo(heights[3]!, 5);
});

test('new movement tuning is authored and old movement checkpoints default to no active jump hold', async () => {
  const project = createCombatProject3D();project.movement = { ...movement, dashFrames: 12, dashRecoveryFrames: 18 };
  expect(readCombatProject3D(project)!.movement).toEqual(project.movement);
  for (const extra of [{ separateJump: 1 }, { jumpHoldFrames: 31 }, { jumpHoldFrames: -1 }, { jumpHoldGravityScale: 1.1 }]) expect(() => readCombatProject3D({ ...project, movement: { ...project.movement, ...extra } })).toThrow();
  const { game } = await combatMotionFixture({ movement });
  const old = game.snapshot();Reflect.deleteProperty(old.combat!.motion[0]!, 'jumpHold');game.restore(old);
  expect(game.snapshot().combat!.motion[0]!.jumpHold).toBe(0);
  const malformed = game.snapshot();malformed.combat!.motion[0]!.jumpHold = 31;
  expect(() => game.restore(malformed)).toThrow('jump hold');
});

test('a paid wall run refreshes the spent air dash and its next press works after a rollback restore', async () => {
  const { game, runtime } = await combatMotionFixture({ obstacle: true, gravityScale: 1.9, staminaRegen: 0, airStaminaRegen: 0,
    movement: { ...movement, wallRunFrames: 36, wallRunSpeed: 10, wallRunCost: .6, wallSlideSpeed: 3 } });
  runtime.applyCommands({ commands: [{ type: 'teleport', entityId: 'b', position: [20, 2, 0] }] });
  game.step(['a:jump']);game.step(['a:dash', 'move-left']);
  expect(game.snapshot().combat!.motion[0]!.airDash).toBe(true);
  let running = false;
  for (let frame = 0; frame < 20; frame++) {
    game.step(['move-left', 'move-up']);
    if (game.snapshot().combat!.motion[0]!.wallRunning) { running = true;break; }
  }
  expect(running).toBe(true);expect(game.snapshot().combat!.motion[0]!.airDash).toBe(false);
  const before = game.snapshot(), rollback = game.checkpoint();
  const dashAway = () => { game.step(['a:dash', 'move-right']);const first = game.snapshot();for (let index = 0; index < 12; index++) game.step(['a:dash', 'move-right']);return { first, after: game.snapshot() }; };
  const original = dashAway();
  expect(original.first.combat!.motion[0]!.airDash).toBe(true);
  expect(original.first.combat!.motion[0]!.dash).toBeGreaterThan(0);
  expect(original.after.combat!.state.fighters[0]!.stamina).toBeCloseTo(before.combat!.state.fighters[0]!.stamina - 12);
  rollback.restore();const repeated = dashAway();
  expect(repeated.after.combat!.motion).toEqual(original.after.combat!.motion);
  expect(repeated.after.entities).toEqual(original.after.entities);
});

test('held jump restores identically mid-ascent and release never rearms its boost', async () => {
  const { game, runtime } = await combatMotionFixture({ movement, gravityScale: 1.9 });
  for (let frame = 0; frame < 8; frame++) game.step(['a:jump', 'move-up']);
  const saved = game.snapshot();
  const sequence = () => { for (let frame = 0; frame < 35; frame++) game.step(frame < 9 ? ['a:jump', 'move-up'] : ['move-up']);return game.snapshot(); };
  const before = sequence();game.restore(saved);expect(sequence()).toEqual(before);
  const speed = runtime.physics.body('a')!.velocityY;
  game.step(['a:jump']); // One legal air jump, with its own bounded boost.
  expect(runtime.physics.body('a')!.velocityY).toBeGreaterThan(speed);
  game.step();game.step(['a:jump']);
  expect(game.snapshot().combat!.motion[0]!.jumpHold).toBe(0);
});
