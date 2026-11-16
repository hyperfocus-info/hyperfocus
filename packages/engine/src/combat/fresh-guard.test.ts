import { expect, test } from 'bun:test';
import { createCombatSimulation } from './simulation.ts';
import { createCombatPreset } from './config.ts';

function fixture() {
  const config = createCombatPreset();
  // A short authored strike exposes the first-frame guard boundary through contact.
  config.moves = [{ ...config.moves[0]!, startupFrames: 1, activeFrames: 1, recoveryFrames: 1, blockstunFrames: 12, impulse: 0, cancels: [] }];
  return createCombatSimulation({ config, fighters: [
    { id: 'a', position: { x: 0, y: 0, z: 0 }, facing: { x: 1, y: 0, z: 0 } },
    { id: 'b', position: { x: 1, y: 0, z: 0 }, facing: { x: -1, y: 0, z: 0 } },
  ] });
}

test('preheld guard blocks actual contact without parrying; release/repress can parry through block recoil', () => {
  const simulation = fixture();
  simulation.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }, { fighterId: 'b', guard: true, guardFresh: false }] });
  const block = simulation.step({ inputs: [{ fighterId: 'b', guard: true, guardFresh: false }] });
  expect(block.map(event => event.kind)).toContain('block');expect(block.some(event => event.kind === 'parry')).toBe(false);
  expect(simulation.capture().fighters[1]!.stunKind).toBe('block');
  simulation.step({ inputs: [{ fighterId: 'b', guard: false }] });
  simulation.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }, { fighterId: 'b', guard: true, guardFresh: true }] });
  const parry = simulation.step({ inputs: [{ fighterId: 'b', guard: true, guardFresh: true }] });
  expect(parry.map(event => event.kind)).toContain('parry');
});

test('guardFresh true cannot renew a held guard window and malformed flags reject atomically', () => {
  const simulation = fixture();
  for (let frame = 0; frame < 20; frame++) simulation.step({ inputs: [{ fighterId: 'b', guard: true, guardFresh: true }] });
  simulation.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }, { fighterId: 'b', guard: true, guardFresh: true }] });
  expect(simulation.step({ inputs: [{ fighterId: 'b', guard: true, guardFresh: true }] }).map(event => event.kind)).toContain('block');
  const before = simulation.capture();
  expect(() => simulation.step({ inputs: JSON.parse('[{"fighterId":"b","guardFresh":"true"}]') })).toThrow('boolean');
  expect(simulation.capture()).toEqual(before);
});
