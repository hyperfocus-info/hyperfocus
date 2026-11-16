import { describe, expect, test } from 'bun:test';
import { createFighter, type CombatEvent, type CombatSnapshot } from '../../../../combat/state.ts';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import { initialPersonality, movePreference, observeEvents, observePersonality, personalityWeights, resetPersonalityRound } from './index.ts';
import { readPersonality } from './validation.ts';

function fixture() {
  const memory = initialPersonality({ seed: 12, fighterId: 'a' });
  const state: CombatSnapshot = { version: 1, configKey: '', frame: 0, fighters: [createFighter({ id: 'a', position: { x: 0, y: 0, z: 0 } }, 100), createFighter({ id: 'b', position: { x: 4, y: 0, z: 0 } }, 100)] };
  const observe = () => observePersonality(memory, { state, fighterId: 'a', targetId: 'b', distance: 4, moving: true });
  const event = (kind: CombatEvent['kind'], id: string, moveId = 'jab'): CombatEvent => ({ kind, id, moveId, frame: state.frame, attackerId: 'a', targetId: 'b', damage: 1, impulse: { x: 0, y: 0, z: 0 } });
  const events = (events: CombatEvent[]) => observeEvents(memory, { state, events, fighterId: 'a', targetId: 'b' });
  return { memory, state, observe, events, event };
}
describe('observable AI personality and adaptation', () => {
  test('spawn preferences reproduce, differ by seat and seed, and cover diverse traits', () => {
    const a = initialPersonality({ seed: 12, fighterId: 'a' });
    expect(a).toEqual(initialPersonality({ seed: 12, fighterId: 'a' }));
    expect(a.preferences).not.toEqual(initialPersonality({ seed: 12, fighterId: 'b' }).preferences);
    expect(a.preferences).not.toEqual(initialPersonality({ seed: 13, fighterId: 'a' }).preferences);
    expect(new Set(Object.values(a.preferences)).size).toBe(11);
    expect(personalityWeights(a).grounded + a.preferences.jumping).toBe(2);
  });
  test('resolved parries discourage that move and encourage feints; duplicate contacts do not learn twice', () => {
    const f = fixture();f.observe();
    f.events([f.event('parry', 'one')]);f.events([f.event('parry', 'one')]);
    expect(f.memory.parried).toBe(1);expect(f.memory.round.parries).toBe(1);
    expect(personalityWeights(f.memory).feint).toBeGreaterThan(.15);
    expect(movePreference(f.memory, 'jab')).toBeLessThan(movePreference(f.memory, 'heavy'));
    f.events([f.event('hit', 'two', 'heavy')]);expect(movePreference(f.memory, 'heavy')).toBeGreaterThan(1);
  });
  test('completed whiffs count once; ordinary contact suppresses false whiff inference', () => {
    const f = fixture(), self = f.state.fighters[0]!;
    self.moveId = 'jab';self.attackSerial = 1;f.observe();
    f.state.frame++;self.moveId = '';f.observe();f.observe();expect(f.memory.round.whiffs).toBe(1);
    f.state.frame++;self.moveId = 'heavy';self.attackSerial++;f.observe();
    f.events([f.event('parry', 'contact', 'heavy')]);
    f.state.frame++;self.moveId = '';f.observe();expect(f.memory.round.whiffs).toBe(1);
  });
  test('observed feints and failed movement accumulate, stunned idle does not imply stuck', () => {
    const f = fixture();f.state.fighters[1]!.moveId = 'feint';f.state.fighters[1]!.attackSerial = 1;
    for (let i = 0; i < 100; i++) { f.state.frame++;f.observe(); }
    expect(f.memory.enemyFeints).toBe(1);expect(f.memory.stuck).toBe(1);
    expect(personalityWeights(f.memory).parryCaution).toBeGreaterThan(0);
    expect(personalityWeights(f.memory).reroute).toBeGreaterThan(.9);
    const g = fixture();g.state.fighters[0]!.stunFrames = 200;
    for (let i = 0; i < 200; i++) { g.state.frame++;g.observe(); }
    expect(g.memory.stuck).toBe(0);
  });
  test('chasing a moving opponent is not stuck and a deliberate feint is not a whiff', () => {
    const f = fixture(), self = f.state.fighters[0]!;
    for (let i = 0; i < 120; i++) { f.state.frame++;self.position.x += .1;f.observe(); }
    expect(f.memory.stuck).toBe(0);
    self.moveId = 'heavy';self.attackSerial++;f.state.frame++;f.observe();
    self.moveId = 'feint';self.attackSerial++;f.state.frame++;f.observe();
    expect(f.memory.round.whiffs).toBe(0);
  });
  test('restored learning evolves identically from subsequent committed events', () => {
    const f = fixture();f.observe();f.events([f.event('parry', 'one')]);
    const restored = readPersonality(JSON.parse(JSON.stringify(f.memory)));
    const next = [f.event('hit', 'two')];f.events(next);
    observeEvents(restored, { state: f.state, events: next, fighterId: 'a', targetId: 'b' });
    expect(restored).toEqual(f.memory);
  });
  test('full move histories keep adapting to changed outcomes without distorting successful hit rates', () => {
    const f = fixture(), self = f.state.fighters[0]!;
    let restored: ReturnType<typeof readPersonality> | undefined;
    const observe = () => {
      f.observe();
      if (restored) observePersonality(restored, { state: f.state, fighterId: 'a', targetId: 'b', distance: 4, moving: true });
    };
    const attempt = (hit: boolean) => {
      f.state.frame++;self.moveId = 'jab';self.attackSerial++;observe();
      if (hit) {
        const events = [f.event('hit', `hit-${f.state.frame}`)];f.events(events);
        if (restored) observeEvents(restored, { state: f.state, events, fighterId: 'a', targetId: 'b' });
      }
      f.state.frame++;self.moveId = '';observe();
    };
    for (let i = 0; i < 96; i++) attempt(true);
    expect(movePreference(f.memory, 'jab')).toBeCloseTo(1.4);
    for (let i = 0; i < 96; i++) attempt(false);
    expect(movePreference(f.memory, 'jab')).toBeLessThan(.7);
    restored = readPersonality(JSON.parse(JSON.stringify(f.memory)));
    expect(restored).toEqual(f.memory);
    for (let i = 0; i < 96; i++) attempt(true);
    expect(movePreference(f.memory, 'jab')).toBeGreaterThan(1.35);
    expect(restored).toEqual(f.memory);
    for (const entry of f.memory.moves) for (const key of ['attempts', 'hits', 'parries', 'blocks', 'whiffs'] as const) {
      expect(entry[key]).toBeGreaterThanOrEqual(0);expect(entry[key]).toBeLessThanOrEqual(32);
    }
  });
  test('round clears transient state but retains learned match tendencies; fresh match resets', () => {
    const f = fixture();f.events([f.event('parry', 'one')]);const before = structuredClone(f.memory.preferences);
    resetPersonalityRound(f.memory);expect(f.memory.round.parries).toBe(0);expect(f.memory.parried).toBe(.8);
    expect(f.memory.moves[0]!.parries).toBe(1);expect(f.memory.preferences).toEqual(before);
    expect(f.memory.transient.frame).toBe(-1);expect(initialPersonality({ seed: 12, fighterId: 'a' }).parried).toBe(0);
  });
  test('actual post-KO contacts suppress false whiffs without rewarding zero-damage hits', () => {
    const memory = initialPersonality({ fighterId: 'a' });memory.parried = 2;
    const sim = createCombatSimulation({ fighters: [{ id: 'a', position: { x: 0, y: 0, z: 0 } }, { id: 'b', position: { x: 1, y: 0, z: 0 } }] });
    const defeated = sim.capture();defeated.fighters[1]!.health = 0;sim.restore({ snapshot: defeated });
    let contacts = 0;
    for (let frame = 0; frame < 60; frame++) {
      observePersonality(memory, { state: sim.capture(), fighterId: 'a', targetId: 'b', distance: 1, moving: false });
      const events = sim.step({ inputs: [{ fighterId: 'a', pressed: frame % 20 === 0 ? ['jab'] : [] }] });
      contacts += events.length;
      expect(events.every(event => event.kind === 'hit' && event.damage === 0)).toBe(true);
      observeEvents(memory, { state: sim.capture(), events, fighterId: 'a', targetId: 'b' });
    }
    expect(contacts).toBe(3);
    expect(memory.moves[0]).toMatchObject({ id: 'jab', attempts: 3, hits: 0, whiffs: 0 });
    expect(memory.round.hits).toBe(0);expect(memory.parried).toBe(2);
    expect(movePreference(memory, 'jab')).toBe(1);
  });
  test('bounded history and save restore are exact and reject malformed data', () => {
    const f = fixture();
    for (let i = 0; i < 1000; i++) f.events([f.event('parry', String(i), `move-${i % 40}`)]);
    expect(f.memory.moves.length).toBe(24);expect(f.memory.transient.eventIds.length).toBe(64);expect(f.memory.parried).toBe(32);
    const restored = readPersonality(JSON.parse(JSON.stringify(f.memory)));expect(restored).toEqual(f.memory);
    restored.moves[0]!.hits++;expect(restored).not.toEqual(f.memory);
    expect(() => readPersonality({ ...f.memory, extra: true })).toThrow();
    expect(() => readPersonality({ ...f.memory, parried: NaN })).toThrow();
    expect(() => readPersonality({ ...f.memory, preferences: { ...f.memory.preferences, fast: 2 } })).toThrow();
    expect(() => readPersonality({ ...f.memory, moves: [...f.memory.moves, f.memory.moves[0]] })).toThrow();
  });
  test('older preference snapshots receive neutral new-role weights without changing original traits', () => {
    const f = fixture(), legacy = JSON.parse(JSON.stringify(f.memory));
    for (const key of ['dogfighter', 'whiffPunisher', 'bait', 'grappler']) delete legacy.preferences[key];
    const restored = readPersonality(legacy);
    expect(restored.preferences.fast).toBe(f.memory.preferences.fast);
    expect(restored.preferences).toMatchObject({ dogfighter: 1, whiffPunisher: 1, bait: 1, grappler: 1 });
  });
});
