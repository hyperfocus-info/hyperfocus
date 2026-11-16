import { expect, test } from 'bun:test';
import { createCombatMatch3D } from './index.ts';
import { readGameplayPresentation3D } from '../gameplay-contracts.ts';
import type { CombatSnapshot } from '../../../combat/state.ts';

test('difficulty slider values survive portable presentation and set the next match directly', () => {
  const match = createCombatMatch3D();
  const state: CombatSnapshot = { version: 1, configKey: '', frame: 0, fighters: [] };
  const step = (...actions: string[]) => match.step({ actions: new Set(actions), state, playerId: 'a', opponentId: 'b' });
  const presentation = readGameplayPresentation3D(match.presentation({ title: 'Fight' }));
  expect(presentation.actions?.find(action => action.action === 'match:difficulty')?.range).toEqual({ min: 1, max: 9, value: 5 });
  for (const level of [1, 9, 3]) {
    step(`match:difficulty:${level}`);expect(match.difficulty).toBe(level);
    expect(() => match.restore(match.capture())).not.toThrow();step();
  }
  step('match:difficulty:10');expect(match.difficulty).toBe(3);
  step('match:start');expect(match.difficulty).toBe(3);
  step('match:difficulty:9');expect(match.difficulty).toBe(3);
});

test('portable ranges reject malformed and out-of-bounds values', () => {
  for (const range of [{ min: 1, max: 9, value: 10 }, { min: 9, max: 1, value: 5 }, { min: 1, max: 9, value: 2.5 }]) {
    expect(() => readGameplayPresentation3D({ title: 'Fight', actions: [{ action: 'level', label: 'Level', range }] })).toThrow('range');
  }
});
