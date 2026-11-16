import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../../combat-motion-fixture.ts';
import { createGameplay3D, createHyperfocus3DRuntime } from '../../../runtime-3d.ts';
import { createCombatInteractions } from '../session.ts';
import { synthesizeWeaponAttacks } from './attacks.ts';

async function fixture(airborne = false) {
  const base = await combatMotionFixture({ independentCombatInputs: true, movement: { separateJump: true } });
  const config = base.project.extensions.hyperfocusCombat.config;
  for (const [id, source] of [['tool-light', 'jab'], ['tool-heavy', 'heavy']] as const) {
    const move = config.moves.find(move => move.id === source)!;
    config.moves.push({ ...structuredClone(move), id, command: [id], reach: 1.7, damage: move.damage * 1.5, cancels: [] });
  }
  const weapon = { entityId: 'tool', material: 'wood' as const, durability: 100, length: 1.7, lightMoveId: 'tool-light', heavyMoveId: 'tool-heavy' };
  synthesizeWeaponAttacks({ config, weapons: [weapon] });
  const declaration = base.project.extensions.hyperfocus3D;
  const project = { ...base.project, extensions: { ...base.project.extensions,
    hyperfocusCombat: { ...base.project.extensions.hyperfocusCombat, interactions: { weapons: [weapon] } },
    hyperfocus3D: { ...declaration, scenes: declaration.scenes.map(scene => ({ ...scene, entities: [
      ...scene.entities.map(entity => entity.id === 'b' ? { ...entity, position: [30, 1, 0] } : entity),
      { id: 'tool', meshId: 'mesh', materialId: 'material', position: [.5, .15, 0], scale: [.1, .1, .5], rotationY: 0 },
    ] })) },
  } };
  const runtime = await createHyperfocus3DRuntime(project, base.assets), game = createGameplay3D({ project, runtime, independentCombatInputs: true });
  const control = (actions: string[] = [], x = 0) => ({ actions: new Set(actions), direction: { x, y: 0, z: 0 } });
  const step = (actions: string[] = [], x = 0) => game.step([], [control(actions, x), control()]);
  for (let i = 0; i < 30; i++) step();
  step(['interact'], 1);step();
  expect(game.snapshot().combat!.interactions!.weapons[0]!.owner).toBe('a');
  if (airborne) { runtime.physics.setPosition('a', 0, 10, 0);runtime.physics.setPosition('b', 30, 10, 0);step(); }
  step(['dash'], 1);
  expect(game.snapshot().combat!.motion[0]!.dash).toBeGreaterThan(0);
  return { game, runtime, config, step, weapon };
}

test('real grounded and airborne weapon dash cancellations select all twelve authored roles and preserve rollback', async () => {
  for (const airborne of [false, true]) for (const direction of ['neutral', 'toward', 'away'] as const) for (const drive of [false, true]) for (const key of ['jab', 'heavy'] as const) {
    const { game, config, step } = await fixture(airborne);
    const before = game.checkpoint(), actions = drive ? [key, 'drive'] : [key], x = direction === 'neutral' ? 0 : direction === 'toward' ? 1 : -1;
    step(actions, x);
    const expected = game.snapshot(), actor = expected.combat!.state.fighters[0]!, selected = config.moves.find(move => move.id === actor.moveId)!;
    expect(selected.weaponSourceMoveId).toBe(`dash-${drive ? 'drive-' : ''}${key}-${direction}`);
    expect(expected.combat!.motion[0]!.dash).toBe(0);
    expect(expected.combat!.interactions!.weapons[0]!.durability).toBe(selected.pose === 'back-hop' ? 100 : key === 'heavy' ? 95 : 99);
    before.restore();step(actions, x);expect(game.snapshot()).toEqual(expected);
  }
});

test('runtime armed back hop requires released Drive and actual fresh re-press on ground and in air', async () => {
  for (const airborne of [false, true]) {
    const { game, config, step } = await fixture(airborne);
    step(['heavy', 'drive'], -1);
    for (let i = 0; i < 8; i++) step(['drive']);
    expect(config.moves.find(move => move.id === game.snapshot().combat!.state.fighters[0]!.moveId)!.weaponSourceMoveId).toBe('dash-drive-heavy-away');
    expect(game.snapshot().combat!.interactions!.weapons[0]!.durability).toBe(100);
    step();const released = game.snapshot();step(['drive']);
    const expected = game.snapshot();
    expect(config.moves.find(move => move.id === expected.combat!.state.fighters[0]!.moveId)!.weaponSourceMoveId).toBe('dash-wheel-kick');
    expect(expected.combat!.interactions!.weapons[0]!.durability).toBe(95);
    game.restore(released);step(['drive']);expect(game.snapshot()).toEqual(expected);
  }
});

test('runtime held Heavy increases armed dive travel without freezing the attack', async () => {
  for (const airborne of [false, true]) {
    const { game, runtime, step } = await fixture(airborne);
    step(['heavy', 'drive'], 1);const start = game.snapshot();
    for (let i = 0; i < 8; i++) step(['heavy']);
    const held = game.snapshot(), speed = runtime.physics.body('a')!.velocityX;
    expect(held.combat!.state.fighters[0]!.chargeFrames).toBeGreaterThan(0);
    expect(held.combat!.state.fighters[0]!.moveFrame).toBeGreaterThan(8);
    game.restore(start);for (let i = 0; i < 8; i++) step();
    expect(speed).toBeGreaterThan(runtime.physics.body('a')!.velocityX);
    game.restore(start);for (let i = 0; i < 8; i++) step(['heavy']);expect(game.snapshot()).toEqual(held);
  }
});

test('a fresh Drive during the armed wheel cannot substitute unarmed reach normalization', async () => {
  const { game, config, step, weapon } = await fixture();
  step(['heavy', 'drive'], -1);for (let i = 0; i < 8; i++) step(['drive']);step();step(['drive']);
  for (let i = 0; i < 8; i++) step();
  const state = game.snapshot().combat!.state;
  expect(config.moves.find(move => move.id === state.fighters[0]!.moveId)!.weaponSourceMoveId).toBe('dash-wheel-kick');
  const interaction = createCombatInteractions({ config, fighterIds: ['a', 'b'], positions: new Map([['tool', { x: 0, y: 1, z: 0 }]]), definition: { weapons: [weapon] } });
  interaction.restore(game.snapshot().combat!.interactions!);
  expect(interaction.reachScales(state, [{ fighterId: 'a', pressed: ['drive'], drive: true }])).toEqual(interaction.reachScales(state, []));
});
