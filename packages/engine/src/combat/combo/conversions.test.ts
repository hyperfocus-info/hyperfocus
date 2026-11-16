import { expect, test } from 'bun:test';
import { createCombatSimulation } from '../simulation.ts';
import { createTouchOfDeathPreset } from '../touch-of-death.ts';
import { readCombatConfig } from '../read.ts';
import { combatMoveDuration } from './timing.ts';
import { inspectCombatInput } from './input.ts';

const fighters = [{ id: 'a', position: { x: 0, y: 0, z: 0 } }, { id: 'b', position: { x: 1, y: 0, z: 0 }, facing: { x: -1, y: 0, z: 0 } }];
const config = createTouchOfDeathPreset();
const make = () => createCombatSimulation({ config, fighters });

test('an early fresh second jab buffers into a real hit and repeated jabs keep converting until KO', () => {
  const sim = make();
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }] });
  const hits = [];
  let previousContact = -1;
  for (let tick = 1; tick < 130 && sim.inspect().fighters[1]!.health > 0; tick++) {
    const state = sim.inspect(), a = state.fighters[0]!, b = state.fighters[1]!;
    const press = a.moveId === 'jab' ? a.moveFrame === 10 : a.moveFrame === 4;
    const events = sim.step({ inputs: [{ fighterId: 'a', ...(press ? { pressed: ['jab'] } : {}) }] });
    for (const event of events) {
      if (previousContact >= 0) expect(b.stunFrames).toBeGreaterThan(0);
      previousContact = event.frame;hits.push(event);
    }
  }
  expect(hits[0]?.moveId).toBe('jab');expect(hits[1]?.moveId).toBe('jab-link');
  expect(hits.slice(1).every(event => event.moveId === 'jab-link')).toBe(true);
  expect(hits.length).toBeGreaterThan(8);expect(sim.inspect().fighters[1]!.health).toBe(0);
  expect(sim.inspect().fighters[0]!.stamina).toBeGreaterThan(0);
});

test('jab, second jab and launcher connect before the defender exits real hitstun', () => {
  const sim = make(), ids = [];
  let confirmed = false;
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }] });
  for (let tick = 1; tick < 60; tick++) {
    const state = sim.inspect(), a = state.fighters[0]!, b = state.fighters[1]!;
    const pressed = a.moveId === 'jab' && a.moveFrame === 10 ? ['jab'] : a.moveId === 'jab-link' && a.moveFrame === 6 ? ['heavy'] : [];
    const events = sim.step({ inputs: [{ fighterId: 'a', pressed }] });
    for (const event of events) { if (confirmed) expect(b.stunFrames).toBeGreaterThan(0);confirmed = true;ids.push(event.moveId); }
    if (ids.length === 3) break;
  }
  expect(ids).toEqual(['jab', 'jab-link', 'heavy']);
  expect(sim.inspect().fighters[0]!.hitConfirmed).toBe(true);
});

test('late confirmation accepts the eighth recovery frame, while holding the button never repeats attacks', () => {
  const late = make();late.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }] });
  while (late.inspect().fighters[0]!.moveFrame < 24) late.step();
  late.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }] });
  expect(late.inspect().fighters[0]!).toMatchObject({ moveId: 'jab-link', attackSerial: 2 });
  const held = make();held.step({ inputs: [{ fighterId: 'a', pressed: ['jab'], held: ['jab'] }] });
  for (let tick = 0; tick < 80; tick++) held.step({ inputs: [{ fighterId: 'a', held: ['jab'] }] });
  expect(held.inspect().fighters[0]!).toMatchObject({ moveId: '', attackSerial: 1 });
  expect(held.inspect().fighters[1]!.health).toBe(92);
});

test('dash approach hits convert to standing fast jabs instead of restarting a dash attack', () => {
  const sim = make();sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'], dashing: true }] });
  while (sim.inspect().fighters[0]!.moveFrame < 14) sim.step();
  expect(sim.inspect().fighters[0]!).toMatchObject({ moveId: 'dash-jab-neutral', hitConfirmed: true });
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }] });sim.step();
  expect(sim.inspect().fighters[0]!.moveId).toBe('jab-link');
});

test('whiffs and held blocks retain full recovery and reject hit-only links', () => {
  for (const blocked of [false, true]) {
    const sim = make(), jab = config.moves.find(move => move.id === 'jab')!;
    sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }, ...(blocked ? [{ fighterId: 'b', guard: true }] : [])], ...(blocked ? {} : { contacts: [] }) });
    const events = [];
    for (let tick = 1; tick < jab.startupFrames + jab.activeFrames + jab.recoveryFrames; tick++) {
      events.push(...sim.step({ inputs: [{ fighterId: 'a', ...(tick === 17 ? { pressed: ['jab'] } : {}) }, ...(blocked ? [{ fighterId: 'b', guard: true }] : [])], ...(blocked ? {} : { contacts: [] }) }));
      expect(sim.inspect().fighters[0]!.attackSerial).toBe(1);expect(sim.inspect().fighters[0]!.hitConfirmed).toBe(false);
    }
    if (blocked) expect(events[0]?.kind).toBe('block');else expect(events).toHaveLength(0);
    sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }], contacts: [] });
    expect(sim.inspect().fighters[0]!).toMatchObject({ moveId: 'jab', attackSerial: 2 });
  }
});

test('armor absorption confirms a damaging hit while parries grant no recovery or route benefit', () => {
  for (const armor of [false, true]) {
    const sim = make();sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }] });
    while (sim.inspect().fighters[0]!.moveFrame < 14) sim.step({ contacts: [] });
    if (armor) { const saved = sim.capture();Object.assign(saved.fighters[1]!, { moveId: 'heavy-away', moveFrame: 1, armorFrames: 20 });sim.restore({ snapshot: saved }); }
    const events = sim.step({ inputs: [{ fighterId: 'b', guard: !armor }] });
    expect(events[0]?.kind).toBe(armor ? 'hit' : 'parry');expect(events[0]?.armored).toBe(armor ? true : undefined);
    expect(sim.inspect().fighters[0]!.hitConfirmed).toBe(armor);
  }
});

test('a landed heavy exits recovery early without requiring a next attack; idle whiffs stay committed', () => {
  const heavy = config.moves.find(move => move.id === 'heavy')!;
  for (const hit of [false, true]) {
    const sim = make();sim.step({ inputs: [{ fighterId: 'a', pressed: ['heavy'] }], ...(hit ? {} : { contacts: [] }) });
    for (let tick = 1; tick < 45; tick++) sim.step(hit ? {} : { contacts: [] });
    expect(sim.inspect().fighters[0]!.moveId).toBe(hit ? '' : 'heavy');
    const a = sim.inspect().fighters[0]!;expect(combatMoveDuration(heavy, a)).toBe(hit ? 43 : 78);
  }
});

test('hit confirmation persists through JSON restore/replay, resets on each attack, and old saves default false', () => {
  const sim = make();sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }] });
  while (!sim.inspect().fighters[0]!.hitConfirmed) sim.step();
  const checkpoint = JSON.parse(JSON.stringify(sim.capture())), restored = make();restored.restore({ snapshot: checkpoint });
  for (let tick = 0; tick < 12; tick++) {
    const options = { inputs: [{ fighterId: 'a', ...(tick === 1 ? { pressed: ['jab'] } : {}) }] };
    expect(restored.step(options)).toEqual(sim.step(options));expect(restored.capture()).toEqual(sim.capture());
    if (sim.inspect().fighters[0]!.moveId === 'jab-link' && sim.inspect().fighters[0]!.moveFrame === 1) expect(sim.inspect().fighters[0]!.hitConfirmed).toBe(false);
  }
  const legacy = sim.capture();for (const fighter of legacy.fighters) Reflect.deleteProperty(fighter, 'hitConfirmed');
  restored.restore({ snapshot: legacy });expect(restored.inspect().fighters.every(fighter => !fighter.hitConfirmed)).toBe(true);
  const invalid = sim.capture();Reflect.set(invalid.fighters[0]!, 'hitConfirmed', 1);
  const before = sim.capture();expect(() => sim.restore({ snapshot: invalid })).toThrow();expect(sim.capture()).toEqual(before);
});

test('finished optional values persist, reject malformed frames and preserve baseline projects', () => {
  expect(readCombatConfig(config)).toEqual(config);
  for (const value of [-1, .5, Infinity, 17]) {
    const invalid = structuredClone(config);invalid.moves[0]!.hitRecoveryFrames = value;
    expect(() => readCombatConfig(invalid)).toThrow('hitRecoveryFrames');
  }
  const invalid = structuredClone(config);Reflect.set(invalid.moves[0]!.cancels[0]!, 'hitOnly', 'true');
  expect(() => readCombatConfig(invalid)).toThrow('boolean');
});

test('Practice diagnoses actual pending input expiry, missing hits, timing and stamina using shared selection', () => {
  const sim = make();sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }], contacts: [] });
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }], contacts: [] });
  expect(inspectCombatInput({ config, fighter: sim.inspect().fighters[0]!, frame: sim.inspect().frame })?.reason).toBe('outside-cancel-window');
  for (let tick = 0; tick < 9; tick++) sim.step({ contacts: [] });
  expect(inspectCombatInput({ config, fighter: sim.inspect().fighters[0]!, frame: sim.inspect().frame })?.reason).toBe('buffer-expired');
  while (sim.inspect().fighters[0]!.moveFrame < 17) sim.step({ contacts: [] });
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }], contacts: [] });
  expect(inspectCombatInput({ config, fighter: sim.inspect().fighters[0]!, frame: sim.inspect().frame })?.reason).toBe('hit-not-confirmed');
  const drained = make(), saved = drained.capture();saved.fighters[0]!.stamina = 0;drained.restore({ snapshot: saved });
  drained.step({ inputs: [{ fighterId: 'a', pressed: ['heavy'] }] });
  expect(inspectCombatInput({ config, fighter: drained.inspect().fighters[0]!, frame: drained.inspect().frame })?.reason).toBe('insufficient-stamina');
  drained.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }] });
  expect(inspectCombatInput({ config, fighter: drained.inspect().fighters[0]!, frame: drained.inspect().frame })).toMatchObject({ moveId: 'jab', reason: 'insufficient-stamina' });
  const affordable = drained.capture();affordable.fighters[0]!.stamina = 20;drained.restore({ snapshot: affordable });
  expect(inspectCombatInput({ config, fighter: drained.inspect().fighters[0]!, frame: drained.inspect().frame })).toMatchObject({ moveId: 'jab', reason: 'ready' });
});
