import { expect, test } from 'bun:test';
import { sin, cos } from './trig.ts';
import { atan2 } from './atan.ts';
import { acos } from './acos.ts';
import { getHighWord, getLowWord, fromWords } from './bits.ts';

function bits(value: number) { return getHighWord(value).toString(16).padStart(8, '0') + getLowWord(value).toString(16).padStart(8, '0'); }

// Exact fixtures from pinned @stdlib sin/cos@0.3.1 pure JS lib/main.js, evaluated in Bun 1.4.2.
// They lock arithmetic evaluation order, not agreement with host-native transcendental bits.
test('fdlibm sine/cosine golden words cover ordinary, medium and huge finite argument reduction', () => {
  const cases: Array<[number, string, string]> = [
    [0.1, '3fb98eaecb8bcb2c', '3fefd712f9a817c1'], [0.5, '3fdeaee8744b05f0', '3fec1528065b7d50'],
    [1, '3feaed548f090cee', '3fe14a280fb5068c'], [Math.PI, '3ca1a62633145c07', 'bff0000000000000'],
    [1e6, 'bfd6664b2568d867', '3fedf9df9906d32c'], [1e20, 'bfe4a5e605fd6450', '3fe872720fc60d3d'],
    [1e100, 'bfd85c5e5b929359', '3fed9757496841f5'], [1e300, 'bfea2c16b010e385', 'bfe2699022adc4c1'],
    [Number.MAX_VALUE, '3f7452fc98b34e97', 'bfefffe62ecfab75'],
  ];
  for (const [x, s, c] of cases) { expect(bits(sin(x))).toBe(s);expect(bits(cos(x))).toBe(c);expect(sin(-x)).toBe(-sin(x));expect(cos(-x)).toBe(cos(x)); }
});

test('signed zeros, subnormals, infinities and invalid domains preserve numerical contracts', () => {
  expect(Object.is(sin(-0), -0)).toBe(true);expect(sin(Number.MIN_VALUE)).toBe(Number.MIN_VALUE);expect(cos(-0)).toBe(1);
  for (const x of [Infinity, -Infinity, NaN]) { expect(Number.isNaN(sin(x))).toBe(true);expect(Number.isNaN(cos(x))).toBe(true);expect(Number.isNaN(acos(x))).toBe(true); }
  for (const x of [1.0000000000000002, -1.0000000000000002]) expect(Number.isNaN(acos(x))).toBe(true);
  expect(acos(1)).toBe(0);expect(acos(-1)).toBe(Math.PI);expect(acos(0)).toBe(Math.PI / 2);
  for (const y of [-Infinity, -1, -Number.MIN_VALUE, -0, 0, Number.MIN_VALUE, 1, Infinity]) {
    for (const x of [-Infinity, -Number.MAX_VALUE, -1, -0, 0, 1, Number.MAX_VALUE, Infinity]) {
      const actual = atan2(y, x), expected = Math.atan2(y, x);
      if (expected === 0) expect(Object.is(actual, expected)).toBe(true);
      else expect(Math.abs(actual - expected)).toBeLessThanOrEqual(4 * Number.EPSILON);
    }
  }
  expect(atan2(-Number.MIN_VALUE, -Number.MAX_VALUE)).toBe(-Math.PI);
  expect(Number.isNaN(atan2(NaN, 1))).toBe(true);expect(Number.isNaN(atan2(1, NaN))).toBe(true);
});

// Cephes acos@0.2.4 oracle words. Domain endpoints additionally have exact mathematical checks above.
test('acos golden words preserve near-endpoint and rational kernel arithmetic', () => {
  for (const [x, word] of [[0.1, '3ff787b22ce3f590'], [0.5, '3ff0c152382d7365'], [0.625, '3feca94936b98a21'], [1e-12, '3ff921fb54441b81']] as const) expect(bits(acos(x))).toBe(word);
});

test('atan2 retains exact golden quadrant words', () => {
  expect(bits(atan2(1, 1))).toBe('3fe921fb54442d18');
  expect(bits(atan2(-1, -1))).toBe('c002d97c7f3321d2');
  expect(bits(atan2(1, 0))).toBe('3ff921fb54442d18');
  expect(bits(atan2(-0, -1))).toBe('c00921fb54442d18');
});

test('broad deterministic f64 corpus remains accurate against independent host implementations', () => {
  let seed = 0x10203040;
  const random = () => { seed ^= seed << 13;seed ^= seed >>> 17;seed ^= seed << 5;return seed >>> 0; };
  for (let index = 0; index < 5000; index++) {
    const x = fromWords(random(), random());
    if (Number.isFinite(x)) { expect(Math.abs(sin(x) - Math.sin(x))).toBeLessThanOrEqual(4e-16);expect(Math.abs(cos(x) - Math.cos(x))).toBeLessThanOrEqual(4e-16); }
    const a = random() / 0xffffffff * 2 - 1, b = random() / 0xffffffff * 2 - 1;
    expect(Math.abs(acos(a) - Math.acos(a))).toBeLessThanOrEqual(9e-16);expect(Math.abs(atan2(a, b) - Math.atan2(a, b))).toBeLessThanOrEqual(9e-16);
  }
});
