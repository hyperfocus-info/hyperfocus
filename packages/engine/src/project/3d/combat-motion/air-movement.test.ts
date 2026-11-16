import { expect, test } from 'bun:test';
import { combatMotionFixture as fixture } from '../combat-motion-fixture.ts';
import { createCombatProject3D, readCombatProject3D } from '../combat-declaration.ts';

test('one neutral air jump spends once; holding and later taps cannot refresh until actual landing', async () => {
  const { game, runtime } = await fixture({ staminaRegen: 0, airStaminaRegen: 0, jumpCost: 14, movement: { airJumps: 1 } });
  game.step(['a:jump']);game.step();game.step(['a:jump']);
  expect(runtime.physics.body('a')!.velocityY).toBeGreaterThan(8);
  expect(game.snapshot().combat!.motion[0]!.airJumpUsed).toBe(true);
  expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBe(72);
  const airborneSave = game.snapshot();game.restore(airborneSave);
  expect(game.snapshot().combat!.motion[0]!.airJumpUsed).toBe(true);
  for (let i = 0; i < 12; i++) game.step(['a:jump']);
  const falling = runtime.physics.body('a')!.velocityY;
  game.step();game.step(['a:jump']);
  expect(runtime.physics.body('a')!.velocityY).toBeLessThan(falling);
  expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBe(72);
  for (let i = 0; i < 120; i++) game.step();
  expect(game.snapshot().combat!.motion[0]!.airJumpUsed).toBe(false);
  game.step(['a:jump']);game.step();game.step(['a:jump']);
  expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBe(44);
});

test('air jump cannot escape hitstun, bypass attack commitment or spend unavailable stamina', async () => {
  for (const restriction of ['stun', 'attack', 'energy']) {
    const { game, runtime } = await fixture({ staminaRegen: 0, airStaminaRegen: 0, jumpCost: 14, movement: { airJumps: 1 } });
    runtime.applyCommands({ commands: [{ type: 'teleport', entityId: 'a', position: [-20, 8, 0] }] });game.step();
    const saved = game.snapshot(), fighter = saved.combat!.state.fighters[0]!;
    if (restriction === 'stun') { fighter.stunKind = 'hit';fighter.stunFrames = 30; }
    if (restriction === 'attack') { fighter.moveId = 'heavy';fighter.moveFrame = 1; }
    if (restriction === 'energy') fighter.stamina = 0;
    game.restore(saved);runtime.physics.setVelocity('a', 0, -4, 0);game.step(['a:jump']);
    expect(runtime.physics.body('a')!.velocityY).toBeLessThan(0);
    expect(game.snapshot().combat!.motion[0]!.airJumpUsed).toBe(false);
  }
});

test('directional airborne Cross still dashes immediately; a Drive tap separately spends the one air jump', async () => {
  const { game, runtime } = await fixture({ staminaRegen: 0, airStaminaRegen: 0, jumpCost: 14, movement: { airJumps: 1 } });
  runtime.applyCommands({ commands: [{ type: 'teleport', entityId: 'a', position: [-20, 10, 0] }] });
  for (let i = 0; i < 8; i++) game.step();
  game.step(['a:jump', 'move-right']);
  expect(game.snapshot().combat!.motion[0]!).toMatchObject({ airDash: true, airJumpUsed: false });
  expect(runtime.physics.body('a')!.velocityX).toBeGreaterThan(17);
  game.step();game.step(['a:jump-tap', 'move-right']);
  expect(runtime.physics.body('a')!.velocityY).toBeGreaterThan(8);
  expect(game.snapshot().combat!.motion[0]!).toMatchObject({ airDash: true, airJumpUsed: true });
  expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBe(74);
});

test('actual wall contact plus inward intent slows a neutral fall, never refills air resources or escapes stun', async () => {
  const { game, runtime } = await fixture({ obstacle: true, movement: { airJumps: 1, wallSlideSpeed: 3 } });
  runtime.applyCommands({ commands: [{ type: 'teleport', entityId: 'a', position: [0, 5, 0] }] });
  for (let i = 0; i < 8; i++) game.step(['move-left']);
  runtime.physics.setVelocity('a', -2, -8, 0);game.step(['move-left']);
  expect(game.snapshot().combat!.motion[0]!.wallSliding).toBe(true);
  expect(runtime.physics.body('a')!.velocityY).toBeGreaterThan(-3.5);
  game.step();expect(game.snapshot().combat!.motion[0]!.wallSliding).toBe(false);
  const saved = game.snapshot();Object.assign(saved.combat!.motion[0]!, { airDash: true, airJumpUsed: true });game.restore(saved);
  game.step(['move-left']);expect(game.snapshot().combat!.motion[0]!).toMatchObject({ airDash: true, airJumpUsed: true });
  const stunned = game.snapshot();Object.assign(stunned.combat!.state.fighters[0]!, { stunKind: 'hit', stunFrames: 30 });game.restore(stunned);
  runtime.physics.setVelocity('a', 0, -8, 0);game.step(['move-left']);
  expect(game.snapshot().combat!.motion[0]!.wallSliding).toBe(false);expect(runtime.physics.body('a')!.velocityY).toBeLessThan(-8);
});

test('dash falloff is authored and monotonic; absent fields retain constant speed and legacy saves load', async () => {
  for (const ratio of [undefined, .65]) {
    const { game, runtime } = await fixture({ movement: { dashSpeed: 14, ...(ratio === undefined ? {} : { dashEndSpeedRatio: ratio }) } });
    runtime.applyCommands({ commands: [{ type: 'teleport', entityId: 'b', position: [20, 1, 0] }] });
    const speeds: number[] = [];
    for (let i = 0; i < 10; i++) { game.step(i === 0 ? ['a:dash', 'move-right'] : []);speeds.push(runtime.physics.body('a')!.velocityX); }
    // The rigid body applies its ordinary damping after commanded movement.
    expect(speeds[0]).toBeGreaterThan(13.8);expect(speeds[0]).toBeLessThanOrEqual(14);
    expect(speeds[9]! / speeds[0]!).toBeCloseTo(ratio ?? 1, 2);
    for (let i = 1; i < speeds.length; i++) {
      if (ratio !== undefined) expect(speeds[i]!).toBeLessThan(speeds[i - 1]!);
      else expect(speeds[i]!).toBeGreaterThan(13.8);
    }
    const save = game.snapshot();Reflect.deleteProperty(save.combat!.motion[0]!, 'airJumpUsed');Reflect.deleteProperty(save.combat!.motion[0]!, 'wallSliding');
    expect(() => game.restore(save)).not.toThrow();expect(game.snapshot().combat!.motion[0]!.airJumpUsed).toBe(false);
  }
  const project = createCombatProject3D();project.movement = { speed: 6, jumpSpeed: 9, dashSpeed: 14, dashFrames: 10, dashRecoveryFrames: 16, airJumps: 1, wallSlideSpeed: 3, dashEndSpeedRatio: .65 };
  expect(readCombatProject3D(project)?.movement).toEqual(project.movement);
  for (const extra of [{ airJumps: 2 }, { airJumps: .5 }, { dashEndSpeedRatio: 1.1 }, { wallSlideSpeed: -1 }]) expect(() => readCombatProject3D({ ...project, movement: { ...project.movement, ...extra } })).toThrow();
});
