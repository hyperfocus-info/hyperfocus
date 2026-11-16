import { isFiniteNumber } from '@hyperfocus/utilities/math';
import { isObject, requireRecordCopy } from '@hyperfocus/utilities/records';

export type Reader<Value = unknown> = (value: unknown) => Value;
export type OptionalReader<Value> = Reader<Value | undefined> & { readonly optional: true };
type RequiredReader<Value> = Reader<Value> & { readonly optional?: false };
export type ObjectReaders<Value> = {
  [Key in keyof Value]-?: {} extends Pick<Value, Key> ? OptionalReader<Value[Key]> : RequiredReader<Value[Key]>;
};
type Fields = Record<string, Reader>;
type ReadObject<Shape extends Fields> = {
  [Key in keyof Shape as Shape[Key] extends { readonly optional: true } ? never : Key]: ReturnType<Shape[Key]>;
} & {
  [Key in keyof Shape as Shape[Key] extends { readonly optional: true } ? Key : never]?: ReturnType<Shape[Key]>;
};
type ReadTuple<Readers extends readonly Reader[]> = { -readonly [Key in keyof Readers]: ReturnType<Readers[Key]> };

/** Optional absence stays absent; an explicitly present undefined stays present. */
export function optional<Value>(reader: Reader<Value>): OptionalReader<Value> {
  return Object.assign((value: unknown) => value === undefined ? undefined : reader(value), { optional: true as const });
}

/** Each declared field is parsed by its supplied typed reader. Unknown own fields
 * are retained shallowly; a domain boundary owns deeper clone/borrow policy. */
export function readObject<const Shape extends Fields>(value: unknown, fields: Shape): ReadObject<Shape>;
export function readObject(value: unknown, fields: Fields) {
  const prototype = Object.getPrototypeOf(fields);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError('Object reader fields must be a plain data object.');
  const keys = Object.keys(fields);
  if (Reflect.ownKeys(fields).length !== keys.length) throw new TypeError('Object reader fields must be enumerable string keys.');
  const input = requireRecordCopy(value, 'value');
  const output = { ...input };
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(fields, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new TypeError('Object reader fields must be data properties.');
    const reader = fields[key];
    if (typeof reader !== 'function') throw new TypeError('Object reader fields must be readers.');
    const present = Object.hasOwn(input, key);
    const isOptional = 'optional' in reader && reader.optional === true;
    if (!present && !isOptional) throw new TypeError(`Missing required field ${key}.`);
    const parsed = reader(present ? input[key] : undefined);
    if (present || parsed !== undefined) {
      Object.defineProperty(output, key, { value: parsed, enumerable: true, writable: true, configurable: true });
    }
  }
  return output;
}

export function readList<Value>(value: unknown, reader: Reader<Value>) {
  return requireArray(value).map(item => reader(item));
}

/** Typed arrays and indexed objects become detached dense arrays. No iterator or
 * numeric coercion is used; each indexed value passes through its actual reader. */
export function readArrayLike<Value>(value: unknown, reader: Reader<Value>, options: {
  minimum?: number; maximum?: number; label?: string;
} = {}) {
  if (!isObject(value)) throw new TypeError(`${options.label ?? 'value'} must be an indexed object.`);
  const length = requireNumber(value.length, { minimum: Math.max(0, options.minimum ?? 0), maximum: options.maximum ?? Infinity, integer: true, label: options.label ?? 'array-like length' });
  return Array.from({ length }, (_, index) => {
    const key = String(index);
    if (!(key in value)) throw new TypeError(`Missing array-like index ${index}.`);
    return reader(value[key]);
  });
}

export function readTuple<const Readers extends readonly Reader[]>(value: unknown, readers: Readers): ReadTuple<Readers>;
export function readTuple(value: unknown, readers: readonly Reader[]) {
  const input = requireArray(value, { minimum: readers.length, maximum: readers.length });
  return Array.from({ length: readers.length }, (_, index) => {
    const reader = readers[index];
    if (typeof reader !== 'function') throw new TypeError('Tuple fields must be readers.');
    return reader(input[index]);
  });
}

export function readDictionary<Value>(value: unknown, reader: Reader<Value>) {
  const input = requireRecordCopy(value, 'dictionary');
  return Object.fromEntries(Object.entries(input).map(([key, item]) => [key, reader(item)] as const));
}

export function readUnion<const Readers extends readonly Reader[]>(value: unknown, readers: Readers): ReturnType<Readers[number]>;
export function readUnion(value: unknown, readers: readonly Reader[]) {
  const errors: unknown[] = [];
  for (const reader of readers) {
    try { return reader(value); } catch (error) { errors.push(error); }
  }
  throw new AggregateError(errors, 'Value does not match any supported shape.');
}

export type NumberReaderOptions = { label?: string } & (
  | { finite?: true; minimum?: number; maximum?: number; integer?: boolean }
  | { finite: false; minimum?: never; maximum?: never; integer?: never }
);

export function requireNumber(value: unknown, { finite = true, minimum = -Infinity, maximum = Infinity, integer = false, label = 'value' }: NumberReaderOptions = {}) {
  if (!finite) {
    if (minimum !== -Infinity || maximum !== Infinity || integer) throw new TypeError('Unrestricted number admission cannot combine with bounds or integer checks.');
    if (typeof value !== 'number') throw new TypeError(`${label} must be a number.`);
    return value;
  }
  if (!isFiniteNumber(value) || value < minimum || value > maximum || integer && !Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be a finite ${integer ? 'safe integer' : 'number'} in range.`);
  }
  return value;
}

export function requireBigInt(value: unknown, label = 'value') {
  if (typeof value !== 'bigint') throw new TypeError(`${label} must be bigint.`);
  return value;
}

export function requireBoolean(value: unknown, label = 'value') {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean.`);
  return value;
}

/** Dense unknown values, ready for the caller's element reader; never a typed cast. */
export function requireArray(value: unknown, { minimum = 0, maximum = Infinity, label = 'value' }: {
  minimum?: number; maximum?: number; label?: string;
} = {}): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new TypeError(`${label} must be an array in range.`);
  const input: readonly unknown[] = value;
  return Array.from({ length: input.length }, (_, index) => input[index]);
}

export function requireOneOf<const Values extends readonly unknown[]>(value: unknown, values: Values, label = 'value'): Values[number] {
  for (const candidate of values) if (Object.is(candidate, value)) return candidate;
  throw new TypeError(`${label} is not a supported value.`);
}
