import { expect, test } from 'bun:test';
import { createCombatSimulation } from './simulation.ts';
import { createTouchOfDeathPreset } from './touch-of-death.ts';
import { sampleAttackTravel } from '../project/3d/combat-motion/attack.ts';

const config = createTouchOfDeathPreset();
function fight() {
  return createCombatSimulation({ config, fighters: [
    { id: 'a', position: { x: 0, y: 0, z: 0 } },
    { id: 'b', position: { x: 1.5, y: 0, z: 0 }, facing: { x: -1, y: 0, z: 0 } },
  ] });
}
function dive(hold: number) {
  const sim = fight();
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['heavy'], held: ['heavy'], drive: true, direction: { x: 1, y: 0, z: 0 } }], contacts: [] });
  for (let frame = 1; frame < 100; frame++) {
    const events = sim.step({ inputs: [{ fighterId: 'a', held: frame < hold ? ['heavy'] : [] }] });
    if (events.length) return { sim, event: events[0]! };
  }
  throw Error('Dive never released');
}
test('tap dive releases promptly; held dive charges distance without adding damage and caps automatically', () => {
  const tap = dive(1), held = dive(100), move = config.moves.find(m => m.id === 'drive-heavy-toward')!;
  expect(tap.event.frame).toBe(move.startupFrames);
  expect(held.event.frame).toBe(move.startupFrames + move.chargeFrames!);
  expect(held.event.damage).toBe(tap.event.damage);
  expect(held.event.impulse.y).toBeLessThan(0);
  expect(sampleAttackTravel(move, held.sim.capture().fighters[0]!).speed).toBeGreaterThan(sampleAttackTravel(move, tap.sim.capture().fighters[0]!).speed);
});
test('charge checkpoint resumes identically, release survives restore and a jab interrupts the charge', () => {
  const sim = fight();
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['heavy'], drive: true, direction: { x: 1, y: 0, z: 0 } }], contacts: [] });
  for (let i = 0; i < 20; i++) sim.step({ inputs: [{ fighterId: 'a', held: ['heavy'] }], contacts: [] });
  const snapshot = sim.capture(), restored = fight(); restored.restore({ snapshot });
  expect(snapshot.fighters[0]!.charging).toBe(true);
  for (let i = 0; i < 12; i++) expect(restored.step()).toEqual(sim.step());
  expect(restored.capture()).toEqual(sim.capture());
  sim.restore({ snapshot });
  sim.step({ inputs: [{ fighterId: 'a', held: ['heavy'] }, { fighterId: 'b', pressed: ['jab'] }] });
  for (let i = 0; i < 14; i++) sim.step({ inputs: [{ fighterId: 'a', held: ['heavy'] }] });
  expect(sim.capture().fighters[0]).toMatchObject({ moveId: '', charging: false, stunKind: 'hit' });
  expect(() => restored.restore({ snapshot: sim.capture() })).not.toThrow();
});
test('dive slam uses ordinary ground bounce and fresh surface tech can end its combo', () => {
  for (const tech of [false, true]) {
    const { sim } = dive(1);
    const events = sim.step({ inputs: [{ fighterId: 'b', tech }], collisions: [{ fighterId: 'b', normal: { x: 0, y: 1, z: 0 }, impulse: 8 }] });
    expect(events[0]!.kind).toBe(tech ? 'tech' : 'bounce');
    expect(events[0]!.impulse.y).toBeGreaterThan(0);
    expect(sim.capture().fighters[1]!.stunFrames > 0).toBe(!tech);
  }
});
test('back Drive heavy retreats then advances into one wheel kick contact', () => {
  const sim = fight(), move = config.moves.find(m => m.id === 'drive-heavy-away')!;
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['heavy'], drive: true, direction: { x: -1, y: 0, z: 0 } }] });
  expect(sampleAttackTravel(move, sim.capture().fighters[0]!).speed).toBeLessThan(0);
  const hits = [];
  for (let i = 1; i < move.startupFrames + move.activeFrames; i++) {
    hits.push(...sim.step());
    if (i === move.startupFrames) expect(sampleAttackTravel(move, sim.capture().fighters[0]!).speed).toBeGreaterThan(0);
  }
  expect(hits.filter(e => e.attackerId === 'a').length).toBe(1);
  expect(hits[0]!.damage).toBe(22);
});
