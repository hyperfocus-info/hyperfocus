/** Non-null objects, including arrays and non-plain objects. */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Non-null objects excluding arrays. No prototype restriction is implied. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return isObject(value) && !Array.isArray(value);
}

export function asRecord(value: unknown) { return isRecord(value) ? value : {}; }

export function asObject(value: unknown) { return isObject(value) ? value : {}; }

/** Shallow own enumerable string-key copy; arrays and nonobjects return undefined. */
export function copyRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? Object.fromEntries(Object.entries(value)) : undefined;
}

export function requireRecordCopy(value: unknown, label: string) {
  const record = copyRecord(value);
  if (!record) throw new TypeError(`${label} must be an object.`);
  return record;
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function requireRecord(value: unknown, { message = 'Expected an object.' }: { message?: string } = {}) {
  if (!isRecord(value)) throw new Error(message);
  return value;
}

export function recordField(value: unknown, key: string, options: Parameters<typeof requireRecord>[1] = {}) {
  return Reflect.get(requireRecord(value, options), key);
}

/** Filters an untrusted array to non-null objects, retaining arrays as objects. */
export function objectRows(value: unknown) { return Array.isArray(value) ? value.filter(isObject) : []; }
