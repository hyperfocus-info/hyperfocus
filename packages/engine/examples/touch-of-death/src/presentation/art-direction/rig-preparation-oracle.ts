import { isObject } from '@hyperfocus/utilities/records';

/** Independent recursive oracle: preserve key order, NaN and signed zero. */
export function exact(a: unknown, b: unknown): boolean {
  if (!isObject(a) || !isObject(b)) return Object.is(a, b);
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && exact(a[k], b[k]));
}
