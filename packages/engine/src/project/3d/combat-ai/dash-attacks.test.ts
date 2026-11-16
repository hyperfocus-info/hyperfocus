import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createCombatAi3D } from '../combat-ai.ts';
import { synthesizeWeaponAttacks, weaponAttackMove } from '../combat-interaction/weapons/attacks.ts';
import { dashAttackCandidates } from './dash-attacks.ts';

function fixture() {
  const config = createTouchOfDeathPreset();
  const sim = createCombatSimulation({ config, fighters: [{ id: 'ai', position: { x: 0, y: 1, z: 0 } }, { id: 'player', position: { x: 1.5, y: 1, z: 0 } }] });
  const ai = createCombatAi3D({ config });
  const options = { state: sim.capture(), fighterId: 'ai', targetId: 'player', difficulty: 9, grounded: true, targetGrounded: true, dashing: true,
    body: { x: 0, y: 1, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 }, targetBody: { x: 1.5, y: 1, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 } };
  return { config, sim, ai, options };
}

test('dash policy ranks neutral close-range and forward distance roles without emitting a dash privilege', () => {
  const { config, ai, options, sim } = fixture();
  const close = ai.step(options);
  expect(close.input.direction).toEqual({ x: 0, y: 0, z: 0 });
  expect(close.input).not.toHaveProperty('dashing');
  sim.step({ inputs: [{ ...close.input, dashing: true }] });
  expect(config.moves.find(move => move.id === sim.inspect().fighters[0]!.moveId)?.dashAttack).toBe(true);
  const ranks = dashAttackCandidates({ moves: config.moves, distance: 7, above: 0, targetAirborne: false, targetStun: 0, closingSpeed: 0, enemyRecovery: 0 });
  expect(ranks[0]!.id).toBe('dash-drive-heavy-toward');
  expect(ranks).toHaveLength(12);
});

test('standing AI and stale delayed dash commands remain subject to shared dash gates', () => {
  const { config, ai, options, sim } = fixture();
  const standing = ai.step({ ...options, dashing: false });
  sim.step({ inputs: [standing.input] });
  expect(config.moves.find(move => move.id === sim.inspect().fighters[0]!.moveId)?.dashAttack).not.toBe(true);
  ai.reset();options.difficulty = 8;
  ai.step(options);const saved = ai.capture();
  const run = () => Array.from({ length: 3 }, () => ai.step({ ...options, dashing: false }));
  const first = run();ai.restore(saved);expect(run()).toEqual(first);
  expect(first[2]!.input).not.toHaveProperty('dashing');
  const fresh = createCombatSimulation({ config, fighters: options.state.fighters.map(fighter => ({ id: fighter.id, position: fighter.position })) });
  fresh.step({ inputs: [first[2]!.input] });
  expect(config.moves.find(move => move.id === fresh.inspect().fighters[0]!.moveId)?.dashAttack).not.toBe(true);
});

test('wheel followup releases Drive before a fresh re-press and survives rollback', () => {
  const { config, ai, options, sim } = fixture();
  const hop = config.moves.find(move => move.id === 'dash-drive-heavy-away')!;
  expect(hop).toBeDefined();
  Object.assign(options.state.fighters[0]!, { moveId: hop.id, moveFrame: 6 });
  ai.restore({ ...ai.capture(), drive: true });
  expect(ai.step(options).input.drive).not.toBe(true);
  const saved = ai.capture();
  const wheel = ai.step(options);
  expect(wheel.input.pressed).toContain('drive');expect(wheel.input.drive).toBe(true);
  ai.restore(saved);expect(ai.step(options)).toEqual(wheel);
  sim.restore({ snapshot: options.state });sim.step({ inputs: [wheel.input] });
  expect(sim.inspect().fighters[0]!.moveId).toBe('dash-wheel-kick');
});

test('travelling dive holds Heavy only while its active acceleration can still increase', () => {
  const { config, ai, options } = fixture();
  const dive = config.moves.find(move => move.id === 'dash-drive-heavy-toward')!;
  Object.assign(options.state.fighters[0]!, { moveId: dive.id, moveFrame: 8, chargeFrames: 0 });
  options.targetBody.x = 9;
  expect(ai.step(options).input.held).toEqual(['heavy']);
  options.state.fighters[0]!.moveFrame = dive.startupFrames + dive.activeFrames;
  expect(ai.step(options).input.held).toBeUndefined();
});

test('held weapons retain dash role selection through ordinary inputs and use shared reach prediction', () => {
  const { config, options } = fixture();
  const jab = config.moves.find(move => move.id === 'jab')!, heavy = config.moves.find(move => move.id === 'heavy')!;
  config.moves.push({ ...jab, id: 'tool-light', command: ['tool-light'], reach: 3 }, { ...heavy, id: 'tool-heavy', command: ['tool-heavy'], reach: 3 });
  const tool = { owner: 'ai', projectileOwner: '', position: { x: 0, y: 1, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, length: 1.6, lightMoveId: 'tool-light', heavyMoveId: 'tool-heavy' };
  synthesizeWeaponAttacks({ config, weapons: [tool] });
  const ai = createCombatAi3D({ config });
  const action = ai.step({ ...options, weapons: [tool] });
  expect(action.input.pressed).toEqual(['jab']);expect(action.input.direction).toEqual({ x: 0, y: 0, z: 0 });
  const variant = weaponAttackMove(config, config.moves.find(move => move.id === 'dash-jab-neutral')!, tool);
  expect(variant.dashAttack).toBe(true);expect(variant.weaponSourceMoveId).toBe('dash-jab-neutral');expect(variant.reach).toBe(1.6);
  const hop = config.moves.find(move => move.weaponSourceMoveId === 'dash-drive-heavy-away')!;
  Object.assign(options.state.fighters[0]!, { moveId: hop.id, moveFrame: 6 });
  ai.restore({ ...ai.capture(), drive: false });
  expect(ai.step({ ...options, weapons: [tool] }).input.pressed).toContain('drive');
});
