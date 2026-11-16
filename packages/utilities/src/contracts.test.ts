import { describe, expect, test } from 'bun:test';
import { assert } from './assert';
import { clamp, clamp01, clamp01Or, clampInteger, clampLowerFirst, finiteOr, isFiniteNumber, mean, modulo, nonNegativeNumberOr, nonNegativeSafeIntegerOr, parseBoundedDecimal, parseBoundedInteger, positiveNumberOr, positiveSafeIntegerOr, roundDecimal, smoothstep01 } from './math';
import { asObject, asRecord, copyRecord, isObject, isPlainRecord, isRecord, objectRows, recordField, requireRecordCopy } from './records';
import { compareText, constantTimeTextEqual, encodePath, errorMessage, escapeHtml, escapeInlineJson, escapeRegExp, formatBytes, formatPercent, normalizeWhitespace, parseBooleanText, readText, requireText, stringValues, text } from './text';
import { decimalCents } from './money';
import { csvCell } from './csv';

test('record copies retain own enumerable strings and shallow references without accepting arrays', () => {
  const nested = { shared: true };
  const source = { own: nested, [Symbol('private')]: true };
  Object.setPrototypeOf(source, { inherited: true });
  const copied = copyRecord(source);
  expect(copied).toEqual({ own: nested });
  expect(copied === source).toBe(false);
  expect(copied?.own === nested).toBe(true);
  expect(copyRecord([])).toBeUndefined();
  expect(copyRecord(null)).toBeUndefined();
  expect(() => requireRecordCopy([], 'response')).toThrow(new TypeError('response must be an object.'));
  expect(() => copyRecord({ get broken() { throw new Error('getter failure'); } })).toThrow('getter failure');
});

describe('numeric policies', () => {
  test('preserves both legacy clamp orders and exceptional numeric inputs', () => {
    expect([clamp(-1, 0, 10), clamp(4, 0, 10), clamp(12, 0, 10)]).toEqual([0, 4, 10]);
    expect(clamp(5, 10, 0)).toBe(0);
    expect(clamp(5, 10, 0, 'minimum')).toBe(10);
    expect(clampLowerFirst(5, 10, 0)).toBe(10);
    expect([clamp01Or(undefined), clamp01Or(NaN, -1), clamp01Or(2)]).toEqual([0, -1, 1]);
    expect([clampInteger(1.7, 0, 3), clampInteger(Infinity, -1, 3), clampInteger(5, 10, 0)]).toEqual([2, -1, 0]);
    expect(isFiniteNumber(1)).toBe(true); expect(isFiniteNumber('1')).toBe(false);
    expect(clamp(NaN, 0, 1)).toBeNaN();
    expect([clamp01(Infinity), clamp01(-Infinity), roundDecimal(1.235, 2), roundDecimal(-1.5)]).toEqual([1, 0, 1.24, -1]);
  });
  test.each([[0, '0.00'], [-0, '0.00'], [1, '0.01'], [-1, '-0.01'], [120, '1.20'], [-109, '-1.09'],
    [Number.MAX_SAFE_INTEGER, '90071992547409.91'], [Number.MIN_SAFE_INTEGER, '-90071992547409.91']] as const)('serializes cents %s exactly', (value, expected) => {
    expect(decimalCents(value)).toBe(expected);
  });
  test.each([0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid cents %s', value => expect(() => decimalCents(value)).toThrow(RangeError));
});

test('record policies keep arrays distinct and preserve object identity', () => {
  const record = { a: 1 };
  expect(isRecord(record)).toBe(true); expect(asRecord(record)).toBe(record);
  expect(isObject([])).toBe(true); expect(isRecord([])).toBe(false);
  for (const value of [null, undefined, 0, '', true, () => {}]) expect(isObject(value)).toBe(false);
  expect(asRecord(null)).toEqual({}); expect(isRecord(new Date())).toBe(true);
  const array: unknown[] = []; expect(Object.is(asObject(array), array)).toBe(true);
  expect(isPlainRecord(new Date())).toBe(false); expect(isPlainRecord(Object.create(null))).toBe(true);
  const rows = objectRows([null, record, array, 'text']);
  expect(rows).toHaveLength(2); expect(Object.is(rows[0], record)).toBe(true); expect(Object.is(rows[1], array)).toBe(true);
  expect(recordField(record, 'a')).toBe(1);
  expect(() => recordField([], 'a', { message: 'Invalid row.' })).toThrow('Invalid row.');
});

test('text contracts separate extraction, validation, units, normalization and errors', () => {
  expect(text('  ')).toBe('  '); expect(text(1)).toBe('');
  expect(readText('  name  ', { nonBlank: true })).toBe('  name  ');
  expect(readText('  name  ', { trim: true, max: 4 })).toBe('name');
  expect(readText('  ', { nonBlank: true })).toBeUndefined();
  expect(readText('é', { max: 1 })).toBe('é');
  expect(readText('é', { max: 1, unit: 'utf8' })).toBeUndefined();
  expect(readText('', { min: 1 })).toBeUndefined();
  expect(() => requireText(null, { message: 'Missing label.' })).toThrow('Missing label.');
  expect(requireText('', { max: 1 })).toBe('');
  expect(errorMessage(new Error('problem'))).toBe('problem');
  expect(errorMessage(null, { fallback: 'Unavailable' })).toBe('Unavailable');
  expect(errorMessage(17, { stringify: true })).toBe('17');
  expect(escapeHtml(`<a title="A&B">'x'</a>`)).toBe('&lt;a title=&quot;A&amp;B&quot;&gt;&#39;x&#39;&lt;/a&gt;');
  expect(escapeHtml(null, { coerce: true })).toBe('null');
  expect(escapeHtml("A&B'", { apostrophe: '&#039;' })).toBe('A&amp;B&#039;');
  expect(normalizeWhitespace(' A\n  B\t')).toBe('A B');
  expect(stringValues([1, 'a', null, ''])).toEqual(['a', '']);
  expect(encodePath("one two/a'b.png")).toBe('one%20two/a%27b.png');
});

test('CSV quoting preserves data and neutralizes formula-shaped strings', () => {
  expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
  expect(csvCell('=SUM(A1)')).toBe('"\'=SUM(A1)"');
  expect(csvCell('-1')).toBe('"\'-1"'); expect(csvCell(-1)).toBe('"-1"');
  expect(csvCell('=SUM(A1)', { preventFormulas: false })).toBe('"=SUM(A1)"');
  expect(csvCell(' =SUM(1,2)', { formulaPolicy: 'whitespace' })).toBe('"\' =SUM(1,2)"');
  expect(csvCell('\nreadable', { formulaPolicy: 'whitespace' })).toBe('"\'\nreadable"');
  expect(csvCell('-1.23', { formulaPolicy: 'whitespace', numeric: true })).toBe('"-1.23"');
  expect(csvCell('-1.23', { formulaPolicy: 'whitespace' })).toBe('"\'-1.23"');
});

test('numeric fallbacks distinguish finite numbers, signs, fractions and safe integer bounds', () => {
  for (const value of [undefined, null, '1', NaN, Infinity, -Infinity]) expect(finiteOr(value, 7)).toBe(7);
  expect(finiteOr(-0.5, 7)).toBe(-0.5);
  expect(positiveNumberOr(0, 7)).toBe(7); expect(positiveNumberOr(0.5, 7)).toBe(0.5);
  expect(nonNegativeNumberOr(0, 7)).toBe(0); expect(nonNegativeNumberOr(-1, 7)).toBe(7);
  expect(positiveSafeIntegerOr(1.5, 7)).toBe(7); expect(positiveSafeIntegerOr(Number.MAX_SAFE_INTEGER, 7)).toBe(Number.MAX_SAFE_INTEGER);
  expect(positiveSafeIntegerOr(Number.MAX_SAFE_INTEGER + 1, 7)).toBe(7);
  expect(nonNegativeSafeIntegerOr(0, 7)).toBe(0); expect(nonNegativeSafeIntegerOr(-1, 7)).toBe(7);
});

test('error policies preserve Error-only and nonblank fallback contracts; regexp escaping is literal', () => {
  expect(errorMessage('text', { acceptStrings: false, fallback: 'fallback' })).toBe('fallback');
  expect(errorMessage(new Error('   '), { nonBlank: true, fallback: 'fallback' })).toBe('fallback');
  expect(errorMessage(new Error(''), { fallback: 'fallback' })).toBe('');
  expect(errorMessage(new Error(' detail '), { nonBlank: true })).toBe(' detail ');
  const literal = '[a-z]+(x)?.*^${}|\\';
  expect(new RegExp(`^${escapeRegExp(literal)}$`).test(literal)).toBe(true);
  expect(new RegExp(`^${escapeRegExp(literal)}$`).test('axb')).toBe(false);
});

test('portable interpolation, remainder and ordinal comparisons retain existing edge policies', () => {
  expect([smoothstep01(-1), smoothstep01(0.5), smoothstep01(2)]).toEqual([0, 0.5, 1]);
  expect(smoothstep01(NaN)).toBeNaN();
  expect([modulo(-5, 4), modulo(5, -4)]).toEqual([3, -3]); expect(modulo(1, 0)).toBeNaN();
  expect([compareText('a', 'b'), compareText('b', 'a'), compareText('a', 'a')]).toEqual([-1, 1, 0]);
  expect(constantTimeTextEqual('', '')).toBe(true);
  expect(constantTimeTextEqual('é\0', 'é\0')).toBe(true);
  expect(constantTimeTextEqual('a', 'a\0')).toBe(false);
  expect(constantTimeTextEqual('ab', 'ac')).toBe(false);
});

test('byte labels preserve the editor thresholds, units and nonfinite display policy', () => {
  expect([formatBytes(-1), formatBytes(1023), formatBytes(1024), formatBytes(1048576)]).toEqual(['-1 B', '1023 B', '1.0 KB', '1.0 MB']);
  expect(formatBytes(1073741824)).toBe('1024.0 MB'); expect(formatBytes(NaN)).toBe('NaN MB');
  expect(formatBytes(512, { unit: 'KB', places: 2 })).toBe('0.50 KB');
  expect(formatBytes(1024, { unit: 'MB', places: 2 })).toBe('0.00 MB');
  const storage = { maximumUnit: 'GB', bytesLabel: 'bytes', nanUnit: 'bytes' } as const;
  expect([formatBytes(1023, storage), formatBytes(1073741824, storage), formatBytes(NaN, storage), formatBytes(Infinity, storage)])
    .toEqual(['1023 bytes', '1.0 GB', 'NaN bytes', 'Infinity GB']);
});

test('prefix parsers retain stored-value policies without coercing invalid values', () => {
  expect(parseBoundedInteger('12.7 seconds', 1, 10)).toBe(10);
  expect(parseBoundedInteger('1e3', 1, 10)).toBe(1);
  expect(parseBoundedInteger('5', 10, 0)).toBe(10);
  expect(parseBoundedInteger('5', 10, 0, 'maximum')).toBe(0);
  expect(parseBoundedInteger(' ', 1, 10)).toBeUndefined();
  expect(parseBoundedDecimal('-1.25 seconds', -10, 10, 0.5)).toBe(-1);
  expect(parseBoundedDecimal('1e3', -10, 10, 0.5)).toBe(10);
  expect(parseBoundedDecimal('Infinity', -10, 10, 0.5)).toBeUndefined();
  expect([parseBooleanText('true'), parseBooleanText('false'), parseBooleanText(true), parseBooleanText('TRUE')]).toEqual([true, false, undefined, undefined]);
});

test('means and percentage labels keep ordinary arithmetic and rounding', () => {
  expect(mean([])).toBe(0); expect(mean([1, -2, 4])).toBe(1); expect(mean([NaN])).toBeNaN();
  expect([formatPercent(0.125), formatPercent(-0.125), formatPercent(NaN)]).toEqual(['13%', '-12%', 'NaN%']);
});

test('runtime assertions retain truthiness, messages and narrowing', () => {
  const value: unknown = 'known'; assert(typeof value === 'string', 'Must be text');
  expect(value.toUpperCase()).toBe('KNOWN');
  for (const condition of [false, 0, '', null, undefined, NaN]) expect(() => assert(condition, 'Expected condition')).toThrow('Expected condition');
  expect(assert({}, 'truthy')).toBeUndefined();
});

test('inline JSON escapes literal less-than without swallowing serialization failures', () => {
  expect(escapeInlineJson({ value: '</script>&' })).toBe('{"value":"\\u003c/script>&"}');
  expect(() => escapeInlineJson(undefined)).toThrow(TypeError);
  expect(() => escapeInlineJson(1n)).toThrow(TypeError);
  const circular: { self?: unknown } = {}; circular.self = circular;
  expect(() => escapeInlineJson(circular)).toThrow(TypeError);
});
