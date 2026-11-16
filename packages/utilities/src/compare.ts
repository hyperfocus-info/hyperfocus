import { isObject } from '@hyperfocus/utilities/records';

export type CheckpointDifference =
  | { path: string; aType: string; bType: string; aBytes: number; bBytes: number }
  | { path: string; byteOffset: number; index: number | undefined; a: unknown; b: unknown; aByte: number | undefined; bByte: number | undefined }
  | { path: string; aPresent: boolean; bPresent: boolean }
  | { path: string; a: unknown; b: unknown };

/** First difference in acyclic checkpoints: exact view bytes, own enumerable
 * string keys in ordinal order, then Object.is primitives. Never mutates inputs. */
export function checkpointDifference(a: unknown, b: unknown, path = '$'): CheckpointDifference | undefined {
  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
    if (a.constructor !== b.constructor || a.byteLength !== b.byteLength) return { path, aType: a.constructor.name, bType: b.constructor.name, aBytes: a.byteLength, bBytes: b.byteLength };
    const left = new Uint8Array(a.buffer, a.byteOffset, a.byteLength), right = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    for (let offset = 0; offset < left.length; offset++) if (left[offset] !== right[offset]) {
      const width: unknown = Reflect.get(a.constructor, 'BYTES_PER_ELEMENT');
      const index = typeof width === 'number' && width ? Math.floor(offset / width) : undefined;
      const aValue: unknown = index === undefined ? undefined : Reflect.get(a, String(index));
      const bValue: unknown = index === undefined ? undefined : Reflect.get(b, String(index));
      return { path, byteOffset: offset, index, a: aValue, b: bValue, aByte: left[offset], bByte: right[offset] };
    }
    return;
  }
  if (isObject(a) && isObject(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const key of keys) {
      if (!Object.hasOwn(a, key) || !Object.hasOwn(b, key)) return { path: `${path}.${key}`, aPresent: Object.hasOwn(a, key), bPresent: Object.hasOwn(b, key) };
      const difference = checkpointDifference(a[key], b[key], `${path}.${key}`);
      if (difference) return difference;
    }
    return;
  }
  if (!Object.is(a, b)) return { path, a: Object.is(a, -0) ? '-0' : a, b: Object.is(b, -0) ? '-0' : b };
}
