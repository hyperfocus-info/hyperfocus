import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../combat-motion-fixture.ts';

const movement = { wallRunFrames: 4, wallRunSpeed: 10, wallRunCost: 2, wallJumpCost: 14, wallJumpSpeed: 9, wallJumpPushSpeed: 7 };
async function atWall() {
  const result = await combatMotionFixture({ obstacle: true, staminaRegen: 0, airStaminaRegen: 0, movement });
  result.runtime.applyCommands({ commands: [{ type: 'teleport', entityId: 'a', position: [0, 5, 0] }] });
  for (let i = 0; i < 8; i++) result.game.step(['move-left']);
  return result;
}

test('wall run needs physical contact and directional intent, spends stamina and ends at its authored duration', async () => {
  const { game, runtime } = await atWall();
  runtime.physics.setVelocity('a', -2, -8, 0);
  for (let i = 0; i < 4; i++) {
    game.step(['move-left', 'move-up']);
    expect(game.snapshot().combat!.motion[0]!.wallRunning).toBe(true);
    expect(runtime.physics.body('a')!.velocityZ).toBeLessThan(-9);
  }
  expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBe(92);
  const save = game.snapshot(); game.restore(save);
  game.step(['move-left', 'move-up']);
  expect(game.snapshot().combat!.motion[0]!.wallRunning).toBe(false);
  expect(game.snapshot().combat!.motion[0]!.wallRunTicks).toBe(4);
  game.step(); game.step(['move-left', 'move-up']);
  expect(game.snapshot().combat!.motion[0]!.wallRunning).toBe(false);
});

test('wall jump spends stamina, pushes away and preserves spent air resources', async () => {
  const { game, runtime } = await atWall();
  const save = game.snapshot(); Object.assign(save.combat!.motion[0]!, { airDash: true, airJumpUsed: true }); game.restore(save);
  game.step(['a:jump', 'move-left']);
  expect(runtime.physics.body('a')!.velocityX).toBeGreaterThan(6);
  expect(runtime.physics.body('a')!.velocityY).toBeGreaterThan(8);
  expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBe(86);
  expect(game.snapshot().combat!.motion[0]!).toMatchObject({ airDash: true, airJumpUsed: true, wallRunning: false });
});

test('wall movement cannot bypass unavailable stamina or hitstun', async () => {
  for (const restriction of ['stamina', 'stun']) {
    const { game, runtime } = await atWall();
    const save = game.snapshot();
    save.combat!.motion[0]!.airDash = true;
    if (restriction === 'stamina') save.combat!.state.fighters[0]!.stamina = 0;
    else Object.assign(save.combat!.state.fighters[0]!, { stunKind: 'hit', stunFrames: 30 });
    game.restore(save); runtime.physics.setVelocity('a', 0, -8, 0);
    game.step(['a:jump', 'move-left']);
    expect(runtime.physics.body('a')!.velocityY).toBeLessThan(0);
    game.step(['move-left', 'move-up']);
    expect(game.snapshot().combat!.motion[0]!.wallRunning).toBe(false);
    expect(game.snapshot().combat!.motion[0]!.airDash).toBe(true);
  }
});

test('contact with a different wall rearms a run without landing; empty space does not support a run', async () => {
  const { game, runtime } = await atWall();
  const saved = game.snapshot();
  Object.assign(saved.combat!.motion[0]!, { wallId: 'previous-wall', wallRunTicks: 4, airDash: true, airJumpUsed: true });
  game.restore(saved); game.step(['move-left', 'move-up']);
  expect(game.snapshot().combat!.motion[0]!).toMatchObject({ wallId: 'obstacle', wallRunTicks: 1, wallRunning: true, airDash: false, airJumpUsed: true });
  runtime.applyCommands({ commands: [{ type: 'teleport', entityId: 'a', position: [20, 5, 0] }] });
  game.step(); game.step(['move-left', 'move-up']);
  expect(game.snapshot().combat!.motion[0]!.wallRunning).toBe(false);
});

test('pursuit gap reproduction: equal straight-line sprint preserves separation without a route interception', async () => {
  const { game, runtime } = await combatMotionFixture({ independentCombatInputs: true, staminaRegen: 0, movement: { sprintSpeed: 12, sprintCost: .35 } });
  runtime.applyCommands({ commands: [{ type: 'teleport', entityId: 'b', position: [8, .81, 0] }] });
  for (let frame = 0; frame < 120; frame++) game.step([], [
    { actions: new Set(['jump']), direction: { x: 1, y: 0, z: 0 } },
    { actions: new Set(['jump']), direction: { x: 1, y: 0, z: 0 } },
  ]);
  const separation = runtime.physics.body('b')!.x - runtime.physics.body('a')!.x;
  expect(separation).toBeGreaterThan(7);
  expect(game.snapshot().combat!.state.fighters.every(fighter => fighter.health === 100)).toBe(true);
});
