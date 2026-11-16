import { expect, test } from 'bun:test';
import { hypot } from './simulation.ts';

test('portable norm handles signed zero, exceptional values and extreme finite scales', () => {
  expect(Object.is(hypot(), 0)).toBe(true);expect(Object.is(hypot(-0, -0), 0)).toBe(true);
  expect(hypot(3, 4)).toBe(5);expect(hypot(-3, -4)).toBe(5);
  expect(hypot(Infinity, NaN)).toBe(Infinity);expect(hypot(NaN, -Infinity)).toBe(Infinity);
  expect(hypot(NaN, 1)).toBeNaN();expect(hypot(1e308, 1e308)).toBeFinite();
  expect(hypot(1e-308, 1e-308)).toBeGreaterThan(1e-308);
  expect(hypot(Number.MIN_VALUE)).toBe(Number.MIN_VALUE);
  expect(hypot(-3.37390451177296e-8, -.1572151651286667, -5.157100879702314e-19)).toBe(.15721516512867031);
});
