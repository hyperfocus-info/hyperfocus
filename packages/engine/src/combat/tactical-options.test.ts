import { expect, test } from 'bun:test';
import { createCombatSimulation } from './simulation.ts';
import { createTouchOfDeathPreset } from './touch-of-death.ts';

const jabStartup = createTouchOfDeathPreset().moves.find(move => move.id === 'jab')!.startupFrames;
function practice() {
  return createCombatSimulation({ config: createTouchOfDeathPreset(), fighters: [
    { id: 'a', position: { x: 0, y: 0, z: 0 } },
    { id: 'b', position: { x: 1, y: 0, z: 0 }, facing: { x: -1, y: 0, z: 0 } },
  ] });
}

test('a whiffed launcher has a punish window and cannot guard during recovery', () => {
  const sim = practice();
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['heavy'] }], contacts: [] });
  for (let frame = 1; frame < 31; frame++) sim.step({ contacts: [] });
  expect(sim.inspect().fighters[0]).toMatchObject({ moveId: 'heavy', moveFrame: 31 });
  sim.step({ inputs: [{ fighterId: 'b', pressed: ['jab'] }, { fighterId: 'a', guard: true }] });
  for (let i = 0; i < jabStartup - 1; i++) sim.step({ inputs: [{ fighterId: 'a', guard: true }] });
  const events = sim.step({ inputs: [{ fighterId: 'a', guard: true }] });
  expect(events[0]).toMatchObject({ attackerId: 'b', targetId: 'a', kind: 'hit', damage: 8 });
  expect(events[0]?.counter).toBeUndefined();
  expect(sim.inspect().fighters[0]).toMatchObject({ moveId: '', stunKind: 'hit' });
});

test('exhausted attack mashing expires instead of firing after stamina regenerates', () => {
  const sim = practice();
  sim.step({ inputs: [{ fighterId: 'a', locomotionCost: 100 }], contacts: [] });
  for (let frame = 0; frame < 20; frame++) {
    sim.step({ inputs: [{ fighterId: 'a', pressed: ['heavy'] }], contacts: [] });
    expect(sim.inspect().fighters[0]?.attackSerial).toBe(0);
  }
  for (let frame = 0; frame < 100; frame++) sim.step({ contacts: [] });
  expect(sim.inspect().fighters[0]?.stamina).toBeGreaterThan(25);
  expect(sim.inspect().fighters[0]?.attackSerial).toBe(0);
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['heavy'] }], contacts: [] });
  expect(sim.inspect().fighters[0]?.moveId).toBe('heavy');
});

test('spent escape cannot cancel a later hitstun', () => {
  const sim = practice();
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['escape'] }], contacts: [] });
  for (let frame = 0; frame < 70; frame++) sim.step({ contacts: [] });
  sim.step({ inputs: [{ fighterId: 'b', pressed: ['jab'] }] });
  for (let frame = 0; frame < jabStartup; frame++) sim.step();
  expect(sim.inspect().fighters[0]).toMatchObject({ escapeCharges: 0, stunKind: 'hit' });
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['escape'] }] });
  expect(sim.inspect().fighters[0]).toMatchObject({ escapeCharges: 0, moveId: '', stunKind: 'hit' });
});
