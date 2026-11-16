import { expect, test } from 'bun:test';
import { checkpointDifference } from './compare';

test('checkpoint comparison retains primitive, property-presence and ordinal path policy', () => {
  expect(checkpointDifference({ b: 2, a: 1 }, { a: 1, b: 2 })).toBeUndefined();
  expect(checkpointDifference({ z: 1, a: { x: 2 } }, { z: 2, a: { x: 3 } })).toEqual({ path: '$.a.x', a: 2, b: 3 });
  expect(checkpointDifference([1, 2], [2, 1])).toEqual({ path: '$.0', a: 1, b: 2 });
  expect(checkpointDifference({ missing: undefined }, {})).toEqual({ path: '$.missing', aPresent: true, bPresent: false });
  expect(checkpointDifference(NaN, NaN)).toBeUndefined();
  expect(checkpointDifference(-0, 0)).toEqual({ path: '$', a: '-0', b: 0 });
  expect(checkpointDifference(1n, 2n, 'checkpoint')).toEqual({ path: 'checkpoint', a: 1n, b: 2n });
  const inherited = Object.create({ ignored: 1 });
  expect(checkpointDifference(inherited, {})).toBeUndefined();
  expect(checkpointDifference(Array(1), [])).toBeUndefined();
});

test('typed views compare only their selected bytes and retain first differing element values', () => {
  const left = new Float64Array([0, 1, -0]), right = new Float64Array([0, 1, 0]);
  const difference = checkpointDifference({ bodies: left }, { bodies: right });
  if (!difference || !('byteOffset' in difference)) throw new Error('Missing byte difference');
  expect(difference.path).toBe('$.bodies'); expect(difference.index).toBe(2);
  expect(Object.is(difference.a, -0)).toBe(true); expect(Object.is(difference.b, 0)).toBe(true);
  expect(difference.byteOffset).toBe(23);
  expect(checkpointDifference(new Uint8Array([9, 1, 2, 9]).subarray(1, 3), new Uint8Array([1, 2]))).toBeUndefined();
  expect(checkpointDifference(new Uint8Array([1]), new Uint8Array([1, 2]))).toEqual({ path: '$', aType: 'Uint8Array', bType: 'Uint8Array', aBytes: 1, bBytes: 2 });
  expect(checkpointDifference(new Uint8Array([1]), new Int8Array([1]))).toEqual({ path: '$', aType: 'Uint8Array', bType: 'Int8Array', aBytes: 1, bBytes: 1 });
  expect(left[2]).toBe(-0); expect(right[2]).toBe(0);
});

test('DataView and bigint view diagnostics retain byte offsets without numeric coercion', () => {
  const difference = checkpointDifference(new DataView(new Uint8Array([1, 2]).buffer), new DataView(new Uint8Array([1, 3]).buffer));
  // Bun 1.4 exposes DataView.BYTES_PER_ELEMENT=1; Node/browser do not. Retain either native diagnostic.
  const dataViewIndex = Reflect.get(DataView, 'BYTES_PER_ELEMENT') === 1 ? 1 : undefined;
  expect(difference).toEqual({ path: '$', byteOffset: 1, index: dataViewIndex, a: undefined, b: undefined, aByte: 2, bByte: 3 });
  const bigint = checkpointDifference(new BigInt64Array([1n]), new BigInt64Array([2n]));
  if (!bigint || !('byteOffset' in bigint)) throw new Error('Missing bigint byte difference');
  expect(bigint.index).toBe(0); expect(bigint.a).toBe(1n); expect(bigint.b).toBe(2n);
});
