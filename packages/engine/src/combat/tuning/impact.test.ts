import { expect, test } from 'bun:test';
import { createCombatSimulation } from '../simulation.ts';
import { createTouchOfDeathPreset } from '../touch-of-death.ts';
import { sampleAttackTravel } from '../../project/3d/combat-motion/attack.ts';

const config = createTouchOfDeathPreset();
const fighters = [{ id: 'a', position: { x: 0, y: 0, z: 0 } }, { id: 'b', position: { x: 1, y: 0, z: 0 }, facing: { x: -1, y: 0, z: 0 } }];
function contact(a = { x: 0, y: 0, z: 0 }, b = { x: 0, y: 0, z: 0 }, airborne = false) {
  const sim = createCombatSimulation({ config, fighters });
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['heavy'] }], contacts: [] });
  const saved = sim.capture();saved.fighters[0]!.moveFrame = config.moves.find(move => move.id === 'heavy')!.startupFrames;
  sim.restore({ snapshot: saved });
  const options = { poses: fighters.map((fighter, index) => ({ fighterId: fighter.id, position: fighter.position, velocity: index ? b : a, airborne })) };
  const event = sim.step(options)[0]!;
  const after = sim.capture();sim.restore({ snapshot: saved });expect(sim.step(options)[0]).toEqual(event);expect(sim.capture()).toEqual(after);
  return { event, stun: after.fighters[1]!.stunFrames };
}

test('relative closing velocity mildly changes damage, hitstun and the full launch, with deterministic restore', () => {
  const still = contact(), closing = contact({ x: 3, y: 0, z: 0 }, { x: -2, y: 0, z: 0 });
  const retreat = contact({ x: -3, y: 0, z: 0 }, { x: 2, y: 0, z: 0 });
  expect(closing.event.damage).toBeCloseTo(still.event.damage * 1.05);
  expect(retreat.event.damage).toBeCloseTo(still.event.damage * .95);
  expect(closing.stun).toBe(Math.round(still.stun * 1.05));expect(retreat.stun).toBe(Math.round(still.stun * .95));
  expect(still.event.hitstunFrames).toBe(still.stun);expect(closing.event.hitstunFrames).toBe(closing.stun);expect(retreat.event.hitstunFrames).toBe(retreat.stun);
  for (const axis of ['x', 'y', 'z'] as const) expect(closing.event.baseImpulse![axis]).toBeCloseTo(still.event.baseImpulse![axis] * 1.05);
  expect(contact({ x: 20, y: 0, z: 0 }, { x: 20, y: 0, z: 0 }).event).toEqual(still.event);
  expect(contact({ x: 0, y: 50, z: 50 }).event).toEqual(still.event);
  expect(contact({ x: 100, y: 0, z: 0 }).event.damage).toBeCloseTo(still.event.damage * 1.1);
  expect(contact({ x: -100, y: 0, z: 0 }).event.damage).toBeCloseTo(still.event.damage * .9);
});

test('invalid contact velocity is rejected before advancing or mutating fighters', () => {
  const sim = createCombatSimulation({ config, fighters }), before = sim.capture();
  expect(() => sim.step({ poses: [{ fighterId: 'a', position: fighters[0]!.position, velocity: { x: NaN, y: 0, z: 0 } }] })).toThrow();
  expect(sim.capture()).toEqual(before);
});

test('light flurry retains four contacts while both wheel variants hit once per attack', () => {
  for (const id of ['flurry', 'drive-heavy-away', 'dash-wheel-kick']) {
    const sim = createCombatSimulation({ config, fighters }), move = config.moves.find(move => move.id === id)!;
    sim.step({ contacts: [] });const saved = sim.capture();
    Object.assign(saved.fighters[0]!, { moveId: id, moveFrame: move.startupFrames, attackSerial: 1 });sim.restore({ snapshot: saved });
    const hits = [];
    for (let tick = 0; tick < move.activeFrames; tick++) hits.push(...sim.step({ contacts: [{ attackerId: 'a', targetId: 'b' }] }));
    expect(hits).toHaveLength(id === 'flurry' ? 4 : 1);
    expect(hits.reduce((sum, event) => sum + event.damage, 0)).toBe(id === 'flurry' ? 16 : 22);
  }
});

test('added recovery prevents fresh ordinary attacks until the final vulnerable frame ends', () => {
  const sim = createCombatSimulation({ config, fighters }), move = config.moves.find(move => move.id === 'heavy')!;
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['heavy'] }], contacts: [] });
  const end = move.startupFrames + move.activeFrames + move.recoveryFrames;
  while (sim.capture().fighters[0]!.moveFrame < end) {
    sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }], contacts: [] });
    expect(sim.capture().fighters[0]!.attackSerial).toBe(1);
  }
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }], contacts: [] });expect(sim.capture().fighters[0]!.attackSerial).toBe(2);
});

test('dive variants keep longer windup and bounded slower held acceleration', () => {
  for (const [id, startup] of [['drive-heavy-toward', 30], ['dash-drive-heavy-toward', 10]] as const) {
    const move = config.moves.find(move => move.id === id)!;
    expect(move.startupFrames).toBe(startup);
    const tap = sampleAttackTravel(move, { moveFrame: startup + 1, chargeFrames: 0 });
    const held = sampleAttackTravel(move, { moveFrame: startup + 1, chargeFrames: 30 });
    expect(held.speed).toBeCloseTo(tap.speed * 1.68);
  }
  const light = config.moves.find(move => move.id === 'drive-jab')!, heavy = config.moves.find(move => move.id === 'heavy-toward')!;
  expect(light.hitstunFrames).toBe(62);expect(light.impulse).toBe(.3375);
  expect(heavy.hitstunFrames).toBe(103);expect(heavy.impulse).toBe(9);expect(heavy.verticalImpulse).toBe(3);
  expect(config.directionalInfluence).toBe(.495);
});
