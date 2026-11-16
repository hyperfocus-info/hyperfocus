import { expect, test } from 'bun:test';
import { readPortableAsset3D, readPortableAssets3D } from './portable-assets.ts';

test('worker-cloned assets have fresh descriptors and explicitly borrow their validated byte storage', () => {
  const original = { id: 'pixels', mimeType: 'application/octet-stream', name: undefined, bytes: new Uint8Array([1, 2, 3, 4]), metadata: { retained: true } };
  const transported = structuredClone([original]);
  const parsed = readPortableAssets3D(transported);
  expect(parsed).toEqual(transported);
  expect(parsed === transported).toBe(false);
  expect(parsed[0] === transported[0]).toBe(false);
  expect(parsed[0]!.bytes === transported[0]!.bytes).toBe(true);
  expect(parsed[0]!.bytes === original.bytes).toBe(false);
  expect(Object.hasOwn(parsed[0], 'name')).toBe(true);
  expect(Object.hasOwn(readPortableAsset3D({ id: '', mimeType: '', bytes: new Uint8Array() }), 'name')).toBe(false);
});

test('portable resource validation rejects native-shape substitutes without coercion', () => {
  for (const value of [null, {}, { id: 1, mimeType: '', bytes: new Uint8Array() }, { id: 'a', mimeType: 1, bytes: new Uint8Array() },
    { id: 'a', mimeType: '', bytes: [1, 2] }, { id: 'a', mimeType: '', bytes: new Uint8ClampedArray() },
    { id: 'a', name: 1, mimeType: '', bytes: new Uint8Array() },
  ]) expect(() => readPortableAsset3D(value)).toThrow();
  expect(() => readPortableAssets3D(new Array(1))).toThrow();
});
