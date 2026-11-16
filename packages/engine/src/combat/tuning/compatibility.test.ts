import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../touch-of-death.ts';
import preset from '../legacy-preset.json';

test('deprecated preset retains frozen values and returns independently mutable move trees', () => {
  const first = createTouchOfDeathPreset();
  expect<unknown>(first).toEqual(preset);
  first.maxHealth = 1;
  first.moves[0]!.command.push('changed');
  first.moves[0]!.cancels.length = 0;
  expect<unknown>(createTouchOfDeathPreset()).toEqual(preset);
});
