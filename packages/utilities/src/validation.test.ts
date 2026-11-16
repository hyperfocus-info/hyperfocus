import { expect, test } from 'bun:test';
import { requireText } from './text';
import { optional, readArrayLike, readDictionary, readList, readObject, readTuple, readUnion, requireArray, requireBigInt, requireBoolean, requireNumber, requireOneOf, type NumberReaderOptions, type ObjectReaders } from './validation';

type Message = { count: number; label?: string; flag: boolean };
const messageFields: ObjectReaders<Message> = { count: requireNumber, label: optional(requireText), flag: requireBoolean };
// @ts-expect-error Complete schemas must cover optional canonical fields too.
const missingOptional: ObjectReaders<Message> = { count: requireNumber, flag: requireBoolean };
void missingOptional;
// @ts-expect-error A required unknown field cannot use the optional absence marker.
const optionalRequired: ObjectReaders<{ payload: unknown }> = { payload: optional(value => value) };
void optionalRequired;
// @ts-expect-error Unrestricted protocol numbers cannot claim finite bounds.
const unrestrictedBounds: NumberReaderOptions = { finite: false, minimum: 0 };
void unrestrictedBounds;

test('field composition checks every known field, retains extras, and distinguishes absence from explicit undefined', () => {
  const extra = { untouched: true };
  const absent = readObject({ count: 2, flag: false, extra }, messageFields);
  const typed: Message = absent; expect(typed.count).toBe(2);
  expect(Object.hasOwn(absent, 'label')).toBe(false);
  expect(Reflect.get(absent, 'extra') === extra).toBe(true);
  const explicit = readObject({ count: 2, flag: true, label: undefined }, messageFields);
  expect(Object.hasOwn(explicit, 'label')).toBe(true);
  expect(() => readObject({ count: '2', flag: true }, messageFields)).toThrow();
  expect(() => readObject({ count: 2 }, messageFields)).toThrow('flag');
  expect(() => readObject({}, { required: (_value: unknown) => undefined })).toThrow('required');
  const dictionary = JSON.parse('{"__proto__":1,"constructor":2}');
  expect(Object.getPrototypeOf(readDictionary(dictionary, requireNumber))).toBe(Object.prototype);
  expect(Object.hasOwn(readDictionary(dictionary, requireNumber), '__proto__')).toBe(true);
});

test('lists, exact tuples, dictionaries and unions validate nested fields without coercion', () => {
  const tuple = readTuple([4, 'four', undefined], [requireNumber, requireText, optional(requireBoolean)]);
  const typed: [number, string, boolean | undefined] = tuple; expect(typed).toEqual([4, 'four', undefined]);
  expect(() => readTuple([4], [requireNumber, optional(requireText)])).toThrow();
  expect(readList([{ count: 1, flag: true }], value => readObject(value, messageFields))).toEqual([{ count: 1, flag: true }]);
  expect(() => readList([{ count: 1, flag: 1 }], value => readObject(value, messageFields))).toThrow();
  expect(readDictionary({ a: 1, b: 2 }, requireNumber)).toEqual({ a: 1, b: 2 });
  expect(() => readDictionary({ a: NaN }, requireNumber)).toThrow();
  const choice = readUnion('ok', [requireNumber, requireText]);
  const typedChoice: number | string = choice; expect(typedChoice).toBe('ok');
  expect(() => readUnion([], [requireNumber, requireText])).toThrow(AggregateError);
  expect(requireOneOf('on', ['on', 'off'] as const)).toBe('on');
  expect(() => requireNumber(1.1, { integer: true })).toThrow();
  expect(() => requireNumber(Infinity)).toThrow();
  expect(() => requireNumber(2, { maximum: 1 })).toThrow();
});

test('sparse inputs expose missing elements and custom iterators cannot replace indexed values', () => {
  expect(() => readList(new Array(2), requireNumber)).toThrow();
  const values = [1, 2];
  Object.defineProperty(values, Symbol.iterator, { value: function* () { yield 99; } });
  expect(requireArray(values)).toEqual([1, 2]);
  const requiredUndefined = readObject({ field: undefined }, { field: (_value: unknown) => undefined });
  expect(Object.hasOwn(requiredUndefined, 'field')).toBe(true);
  const reserved = readObject({}, { constructor: optional(requireText) });
  expect(Object.hasOwn(reserved, 'constructor')).toBe(false);
});

test('array-like readers detach typed buffers and reject unsafe lengths, holes and coerced values', () => {
  const input = new Float32Array([1, 2, 3]);
  const output = readArrayLike(input, requireNumber, { minimum: 3, maximum: 3 });
  expect(output).toEqual([1, 2, 3]); output[0] = 9; expect(input[0]).toBe(1);
  expect(readArrayLike({ length: 2, 0: 2, 1: 4 }, requireNumber)).toEqual([2, 4]);
  for (const value of [{ length: -1 }, { length: 1.5 }, { length: Infinity }, { length: Number.MAX_SAFE_INTEGER + 1 },
    { length: '2', 0: 1, 1: 2 }, { length: 1 }, { length: 1, 0: '2' }, new Float64Array([NaN]), '12',
  ]) expect(() => readArrayLike(value, requireNumber)).toThrow();
  expect(() => readArrayLike(input, requireNumber, { maximum: 2 })).toThrow();
});

test('explicit protocol scalar admission preserves nonfinite numbers and bigint without coercion', () => {
  for (const value of [NaN, Infinity, -Infinity, -0, 1]) expect(Object.is(requireNumber(value, { finite: false }), value)).toBe(true);
  for (const value of [NaN, Infinity, -Infinity]) expect(() => requireNumber(value)).toThrow('finite');
  for (const value of ['1', 1n, null, undefined, {}, new Number(1)]) expect(() => requireNumber(value, { finite: false })).toThrow();
  for (const value of [0n, -1n, 18446744073709551615n]) expect(requireBigInt(value)).toBe(value);
  for (const value of [0, '0', undefined, {}, Object(0n)]) expect(() => requireBigInt(value)).toThrow();
  expect(() => Reflect.apply(requireNumber, undefined, [NaN, { finite: false, minimum: 0 }])).toThrow('cannot combine');
  expect(() => requireNumber(1.5, { integer: true })).toThrow('safe integer');
  expect(() => requireNumber(2, { maximum: 1 })).toThrow('in range');
});
