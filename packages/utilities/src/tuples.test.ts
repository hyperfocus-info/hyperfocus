import { expect, test } from 'bun:test';
import { map3, map4 } from './tuples';

test('map3 retains source identity, live reads, callback order and an independent result', () => {
  const values: [number, number, number] = [1, 2, 3];
  const seen: Array<[number, number, boolean]> = [];
  const result: [number, number, number] = map3(values, (value, index, source) => {
    seen.push([value, index, source === values]);
    if (index === 0) values[1] = 8;
    return value * 2;
  });
  expect(result).toEqual([2, 16, 6]);
  expect(seen).toEqual([[1, 0, true], [8, 1, true], [3, 2, true]]);
  expect(result === values).toBe(false);
  result[0] = 99; expect(values[0]).toBe(1);
});

test('map4 retains readonly heterogeneous input, numeric identity and thrown-callback order', () => {
  const values = Object.freeze([1, 'two', false, 4n] as const);
  const result: [string, string, string, string] = map4(values, value => String(value));
  expect(result).toEqual(['1', 'two', 'false', '4']);
  const numeric = map4([NaN, Infinity, -0, 1] as const, value => value);
  expect(Number.isNaN(numeric[0])).toBe(true); expect(numeric[1]).toBe(Infinity); expect(Object.is(numeric[2], -0)).toBe(true);
  const calls: number[] = [];
  expect(() => map4(values, (_value, index) => { calls.push(index); if (index === 1) throw new Error('stop'); return index; })).toThrow('stop');
  expect(calls).toEqual([0, 1]);
});
