import { expect, test } from 'bun:test';
import { createCombatProject3D, readCombatProject3D } from '../project/3d/combat-declaration.ts';

test('combat import rejects unknown settings instead of silently discarding authored intent', () => {
  const baseline = createCombatProject3D();
  baseline.fighters.push({ entityId: 'hero', control: 'player', actionPrefix: 'hero:' });
  expect(() => readCombatProject3D({ ...baseline, network: true })).toThrow('Unknown combat field: network');
  expect(() => readCombatProject3D({ ...baseline, config: { ...baseline.config, maxHeath: 10 } })).toThrow('Unknown combat field: maxHeath');
  expect(() => readCombatProject3D({ ...baseline, fighters: [{ ...baseline.fighters[0], attackPrefix: 'other:' }] })).toThrow('Unknown combat field: attackPrefix');
  const move = baseline.config.moves[0]!;
  expect(() => readCombatProject3D({ ...baseline, config: { ...baseline.config, moves: [{ ...move, startup: 1 }] } })).toThrow('Unknown combat field: startup');
  expect(() => readCombatProject3D({ ...baseline, config: { ...baseline.config, moves: [{ ...move, cancels: [{ ...move.cancels[0], frame: 0 }] }] } })).toThrow('Unknown combat field: frame');
  const restored = readCombatProject3D(baseline)!;
  restored.config.moves[0]!.damage = 99;
  expect(baseline.config.moves[0]!.damage).not.toBe(99);
});
