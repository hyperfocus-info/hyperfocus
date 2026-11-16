import { expect, test } from 'bun:test';
import { checkpointDifference } from '@hyperfocus/utilities/compare';

test('checkpoint differences ignore object key order and locate exact typed-array elements', () => {
  expect(checkpointDifference({ a: 1, b: 2 }, { b: 2, a: 1 })).toBeUndefined();
  const difference = checkpointDifference({ bodies: new Float64Array([0, 1, -0]) }, { bodies: new Float64Array([0, 1, 0]) });
  if (!difference || !('index' in difference)) throw new Error('Expected typed-array byte difference.');
  expect(difference.path).toBe('$.bodies');expect(difference.index).toBe(2);
  expect(Object.is(difference.a, -0)).toBe(true);expect(Object.is(difference.b, 0)).toBe(true);
  const reordered = checkpointDifference([1, 2], [2, 1]);if (!reordered) throw new Error('Expected array ordering difference.');
  expect(reordered.path).toBe('$.0');
  const missing = checkpointDifference({ missing: undefined }, {});if (!missing || !('aPresent' in missing)) throw new Error('Expected missing property difference.');
  expect(missing.aPresent).toBe(true);
});
