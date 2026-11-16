import { expect, test } from 'bun:test';
import { exactHash } from './exact-hash.ts';

test('checkpoint objects ignore property construction order while arrays retain order', () => {
  expect(exactHash({ a: 1, b: [2, 3] })).toBe(exactHash({ b: [2, 3], a: 1 }));
  expect(exactHash([2, 3])).not.toBe(exactHash([3, 2]));
  expect(exactHash(new Array(2))).not.toBe(exactHash([]));
});
test('physics byte and number identity preserves signed zero, type and view boundaries', () => {
  expect(exactHash(0)).not.toBe(exactHash(-0));
  expect(exactHash(new Float64Array([0]))).not.toBe(exactHash(new Float64Array([-0])));
  expect(exactHash(new Uint8Array([1, 2]))).not.toBe(exactHash(new Int8Array([1, 2])));
  expect(exactHash(new Uint8Array([0, 1, 2, 3]).subarray(1, 3))).toBe(exactHash(new Uint8Array([1, 2])));
  expect(exactHash({ a: undefined })).not.toBe(exactHash({}));
});
