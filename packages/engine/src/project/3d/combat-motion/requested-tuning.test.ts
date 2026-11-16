import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { readCombatProject3D } from '../combat-declaration.ts';

const movement = {
  separateJump: true,
  speed: 7.28,
  sprintSpeed: 12.48,
  dashSpeed: 15.96,
  dashFrames: 10,
  dashEndSpeedRatio: .5905,
  sprintCost: 1.12,
  jumpCost: 12.6,
  wallRunFrames: 36,
  wallRunSpeed: 10,
  wallRunCost: .54,
  wallSlideSpeed: 3,
  wallJumpSpeed: 9,
  wallJumpPushSpeed: 7,
  wallJumpCost: 12.6,
  stepCost: 10.8
};

async function fixture(obstacle = false) {
  return combatMotionFixture({ obstacle, movement, gravityScale: 1.9, staminaRegen: 0, airStaminaRegen: 0 });
}

test('requested walk, dash duration/falloff, sprint speed and payments use authored final values', async () => {
  const walking = await fixture();
  expect(readCombatProject3D(walking.project.extensions.hyperfocusCombat)!.movement).toMatchObject(movement);
  walking.game.step(['move-left']);
  // The physics tick retains ordinary floor friction after movement commands.
  expect(Math.abs(walking.runtime.physics.body('a')!.velocityX)).toBeGreaterThan(7);
  expect(Math.abs(walking.runtime.physics.body('a')!.velocityX)).toBeLessThanOrEqual(7.28);
  expect(walking.game.snapshot().combat!.state.fighters[0]!.stamina).toBe(100);

  const dash = await fixture();
  const speeds: number[] = [];
  for (let frame = 0; frame < 10; frame++) {
    dash.game.step(frame === 0 ? ['a:dash', 'move-left'] : ['move-left']);
    speeds.push(Math.abs(dash.runtime.physics.body('a')!.velocityX));
  }
  expect(speeds[0]!).toBeGreaterThan(15.7);
  expect(speeds[0]!).toBeLessThanOrEqual(15.96);
  expect(Math.abs(speeds[9]! / speeds[0]! - .5905)).toBeLessThan(.01);
  expect(dash.game.snapshot().combat!.motion[0]!.dash).toBe(0);
  expect(dash.game.snapshot().combat!.state.fighters[0]!.stamina).toBeCloseTo(89.2, 8);

  const sprint = await fixture();
  for (let frame = 0; frame < 25; frame++) sprint.game.step(['a:dash', 'move-left']);
  expect(Math.abs(sprint.runtime.physics.body('a')!.velocityX)).toBeGreaterThan(12.2);
  expect(Math.abs(sprint.runtime.physics.body('a')!.velocityX)).toBeLessThanOrEqual(12.48);
  const before = sprint.game.snapshot().combat!.state.fighters[0]!.stamina;
  sprint.game.step(['a:dash', 'move-left']);
  expect(sprint.game.snapshot().combat!.state.fighters[0]!.stamina).toBeCloseTo(before - 1.12, 8);
});

test('requested jump and wall payments remain one payment per legal action/tick', async () => {
  const jump = await fixture();
  jump.game.step(['a:jump']);
  expect(jump.game.snapshot().combat!.state.fighters[0]!.stamina).toBeCloseTo(87.4, 8);
  for (let frame = 0; frame < 4; frame++) jump.game.step(['a:jump']);
  expect(jump.game.snapshot().combat!.state.fighters[0]!.stamina).toBeCloseTo(87.4, 8);

  const wall = await fixture(true);
  wall.runtime.applyCommands({ commands: [{ type: 'teleport', entityId: 'a', position: [0, 5, 0] }] });
  for (let frame = 0; frame < 8; frame++) wall.game.step(['move-left']);
  wall.runtime.physics.setVelocity('a', -2, -8, 0);
  const beforeRun = wall.game.snapshot().combat!.state.fighters[0]!.stamina;
  wall.game.step(['move-left', 'move-up']);
  expect(wall.game.snapshot().combat!.motion[0]!.wallRunning).toBe(true);
  expect(wall.game.snapshot().combat!.state.fighters[0]!.stamina).toBeCloseTo(beforeRun - .54, 8);
  const beforeJump = wall.game.snapshot().combat!.state.fighters[0]!.stamina;
  wall.game.step(['a:jump', 'move-left']);
  expect(wall.runtime.physics.body('a')!.velocityX).toBeGreaterThan(6);
  expect(wall.runtime.physics.body('a')!.velocityY).toBeGreaterThan(8);
  expect(wall.game.snapshot().combat!.state.fighters[0]!.stamina).toBeCloseTo(beforeJump - 12.6, 8);
});
