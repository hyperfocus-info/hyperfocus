import { expect, test } from 'bun:test';
import { createCombatSimulation } from './simulation.ts';
import { createTouchOfDeathPreset } from './touch-of-death.ts';

const fighters = [{ id: 'a', position: { x: 0, y: 0, z: 0 } }, { id: 'b', position: { x: 1, y: 0, z: 0 }, facing: { x: -1, y: 0, z: 0 } }];
const config = () => createTouchOfDeathPreset();
const make = () => createCombatSimulation({ config: config(), fighters });

test('direction and Drive select on press; ordinary strings require their authored window', () => {
  const sim = make();
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'], direction: { x: 1, y: 0, z: 0 } }], contacts: [] });
  expect(sim.inspect().fighters[0]?.moveId).toBe('jab-toward');
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['heavy'], drive: true }], contacts: [] });
  expect(sim.inspect().fighters[0]?.moveId).toBe('jab-toward');
  while (sim.inspect().fighters[0]!.moveFrame < config().moves.find(move => move.id === 'jab-toward')!.cancels[0]!.fromFrame) sim.step();
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'], drive: true, direction: { x: 0, y: 0, z: -1 } }], contacts: [] });
  expect(sim.inspect().fighters[0]?.moveId).toBe('drive-jab-toward-link');
  expect(sim.inspect().fighters[0]?.attackSide).toBe(-1);
  const snapshot = sim.capture();
  const restored = make(); restored.restore({ snapshot });
  expect(restored.step({ contacts: [] })).toEqual(sim.step({ contacts: [] }));
  expect(restored.capture()).toEqual(sim.capture());
});

test('stamina gates fixed attacks, attack takes priority over movement, and flurry refunds once', () => {
  const sim = make();
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'], drive: true, locomotionCost: 10 }], contacts: [] });
  expect(sim.inspect().fighters[0]?.stamina).toBe(70);
  expect(sim.inspect().fighters[0]?.locomotionAllowed).toBe(false);
  for (let frame = 1; frame < 35; frame++) sim.step({ contacts: [{ attackerId: 'a', targetId: 'b' }] });
  expect(sim.inspect().fighters[0]?.stamina).toBe(82);
  const drained = make();
  drained.step({ inputs: [{ fighterId: 'a', locomotionCost: 100 }], contacts: [] });
  expect(drained.inspect().fighters[0]?.locomotionAllowed).toBe(true);
  drained.step({ inputs: [{ fighterId: 'a', pressed: ['heavy'] }], contacts: [] });
  expect(drained.inspect().fighters[0]?.moveId).toBe('');
  drained.step({ inputs: [{ fighterId: 'a', pressed: ['escape'] }], contacts: [] });
  expect(drained.inspect().fighters[0]?.moveId).toBe('escape');
});

test('parried contact grants no refund and DI bends launch without changing speed or damage', () => {
  const parry = make();
  parry.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }], contacts: [] });
  for (let i = 1; i < config().moves.find(move => move.id === 'jab')!.startupFrames; i++) parry.step({ contacts: [] });
  const events = parry.step({ inputs: [{ fighterId: 'b', guard: true }], contacts: [{ attackerId: 'a', targetId: 'b' }] });
  expect(events[0]?.kind).toBe('parry'); expect(parry.inspect().fighters[0]?.stamina).toBe(91);
  const launch = (influence: boolean) => {
    const sim = make(); sim.step({ inputs: [{ fighterId: 'a', pressed: ['heavy'] }], contacts: [] });
    for (let i = 1; i < 28; i++) sim.step({ contacts: [] });
    return sim.step({ inputs: [{ fighterId: 'b', direction: { x: 0, y: 0, z: influence ? 1 : 0 } }], contacts: [{ attackerId: 'a', targetId: 'b' }] })[0];
  };
  const straight = launch(false), bent = launch(true);
  if (!straight || !bent) throw new Error("missing launch event");
  expect(straight?.damage).toBe(bent?.damage);
  expect(bent?.impulse.z).toBeGreaterThan(0);
  expect(Math.hypot(bent.impulse.x, bent.impulse.y, bent.impulse.z)).toBeCloseTo(Math.hypot(straight.impulse.x, straight.impulse.y, straight.impulse.z));
});

test('invalid movement costs and foreign snapshot state reject atomically', () => {
  const sim = make(), before = sim.capture();
  expect(() => sim.step({ inputs: [{ fighterId: 'a', locomotionCost: -1 }] })).toThrow();
  expect(sim.capture()).toEqual(before);
  const bad = sim.capture(); if (bad.fighters[0]) bad.fighters[0].stamina = 101;
  expect(() => sim.restore({ snapshot: bad })).toThrow(); expect(sim.capture()).toEqual(before);
});

test('every flurry impact samples current direction, not a previous held launch direction', () => {
  const sim = make();
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'], drive: true }] });
  const impacts = [];
  for (let frame = 1; frame <= 34; frame++) {
    const side = frame === 16 || frame === 28 ? 1 : -1;
    const events = sim.step({ inputs: [{ fighterId: 'b', direction: { x: 0, y: 0, z: side } }] });
    for (const event of events) { impacts.push(event); expect(Math.sign(event.impulse.z)).toBe(side); }
  }
  expect(impacts).toHaveLength(4);
  expect(impacts.map(event => Math.sign(event.impulse.z))).toEqual([1, -1, 1, -1]);
  expect(impacts.every(event => event.damage === 4)).toBe(true);
});
