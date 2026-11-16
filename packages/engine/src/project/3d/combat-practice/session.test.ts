import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createCombatPractice3D } from './session.ts';

test('Practice presents guided lessons first while preserving every selectable preset', () => {
  const session = createCombatPractice3D({ config: createTouchOfDeathPreset() });
  const actions = session.presentation({ title: 'Practice' }).actions!;
  expect(actions.slice(0, 3).map(action => action.action)).toEqual(['practice:parry-drill', 'practice:tech-drill', 'practice:combo-lesson']);
  expect(new Set(actions.map(action => action.action)).size).toBe(14);
  for (const action of actions.slice(0, -2)) {
    session.select(new Set([action.action]));
    expect(action.action).toBe(`practice:${session.capture().preset}`);
    expect(session.presentation({ title: 'Practice' }).actions!.find(item => item.action === action.action)?.disabled).toBe(true);
  }
});

test('defender presets expose ordinary steering, guard, tech and escape inputs without moving the dummy', () => {
  const config = createTouchOfDeathPreset(), session = createCombatPractice3D({ config });
  const state = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }, { id: 'b', position: { x: 2, y: 1, z: 0 } }] }).capture();
  const before = structuredClone(state);
  const observation = { state, fighterId: 'b', targetId: 'a', body: { x: 2, y: 1, z: 0, velocityX: 0, velocityY: -3, velocityZ: 0 }, collision: true };
  session.select(new Set(['practice:outward']));
  expect(session.decide(observation).input.direction).toEqual({ x: 1, y: 0, z: 0 });
  expect(session.decide(observation).direction).toEqual({ x: 0, y: 0, z: 0 });
  session.select(new Set(['practice:sideways'])); expect(session.decide(observation).input.direction?.z).toBe(1);
  session.select(new Set(['practice:guard'])); expect(session.decide(observation).input.guard).toBe(true);
  expect(state).toEqual(before);
  state.fighters[1]!.stunKind = 'hit'; state.fighters[1]!.stunFrames = 20;
  session.select(new Set(['practice:tech'])); expect(session.decide(observation).input.tech).toBe(true);
  state.frame++; expect(session.decide(observation).input.tech).toBe(true);
  expect(session.decide({ ...observation, collision: false }).input.tech).toBe(false);
  session.select(new Set(['practice:escape'])); expect(session.decide(observation).input.pressed).toEqual(config.moves.find(move => move.armoredEscape)!.command);
  state.fighters[1]!.escapeCharges = 0; expect(session.decide(observation).input.pressed).toEqual([]);
});

test('random defense varies ordinary inputs, replays saves and gives a new reset attempt', () => {
  const config = createTouchOfDeathPreset(), session = createCombatPractice3D({ config });
  const state = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }, { id: 'b', position: { x: 2, y: 1, z: 0 } }] }).capture();
  state.fighters[1]!.stunKind = 'hit';state.fighters[1]!.stunFrames = 20;
  const observation = { state, fighterId: 'b', targetId: 'a', body: { x: 2, y: 1, z: 0, velocityX: 0, velocityY: -3, velocityZ: 0 }, collision: true };
  session.select(new Set(['practice:random']));const saved = session.capture();
  const run = () => Array.from({ length: 40 }, (_, serial) => { state.fighters[0]!.attackSerial = serial;session.decide({ ...observation, collision: false });return session.decide(observation); });
  const first = run();session.restore(saved);expect(run()).toEqual(first);
  expect(new Set(first.map(item => JSON.stringify(item.input.direction))).size).toBe(5);
  expect(first.some(item => item.input.tech)).toBe(true);expect(first.some(item => !item.input.tech)).toBe(true);
  expect(first.every(item => !item.jump && !item.dash && !item.sprint && !item.input.pressed?.length)).toBe(true);
  expect(state.fighters[1]!.health).toBe(100);expect(state.fighters[1]!.stunFrames).toBe(20);
  const seed = session.capture().random!.seed;session.resetRound();expect(session.capture().random!.seed).not.toBe(seed);
  const malformed = { ...session.capture(), random: { ...session.capture().random!, seed: -1 } };
  expect(() => session.restore(malformed)).toThrow('random defense');
});
