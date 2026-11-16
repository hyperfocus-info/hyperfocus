import { expect, test } from 'bun:test';
import { createQuaternionMagnitudeTest3D } from "./quaternion-magnitude.ts";

test('bounded quaternion predicate preserves the hypot threshold oracle for finite input', () => {
  const epsilon = 1e-12, original = createQuaternionMagnitudeTest3D('original', epsilon), bounded = createQuaternionMagnitudeTest3D('bounded', epsilon);
  const values = [0, -0, Number.MIN_VALUE, -Number.MIN_VALUE, epsilon / 2, -epsilon / 2,
    epsilon * (1 - Number.EPSILON), epsilon, epsilon * (1 + Number.EPSILON), -epsilon, 1, -1, Number.MAX_VALUE];
  for (const x of values) for (const y of values) for (const z of values) for (const w of values) {
    expect(bounded.test(x, y, z, w)).toBe(original.test(x, y, z, w));
  }
  expect(original.work.checks).toBe(values.length ** 4);expect(original.work.hypotCalls).toBe(original.work.checks);
  expect(bounded.work.boundAccepts + bounded.work.fallbacks).toBe(bounded.work.checks);
  expect(bounded.work.hypotCalls).toBe(bounded.work.fallbacks);expect(bounded.work.boundAccepts).toBeGreaterThan(0);
});

test('ordinary rotations avoid norm calculation; threshold cases use the unchanged oracle', () => {
  const bound = createQuaternionMagnitudeTest3D('bounded', 1e-12);
  const rotations: Parameters<typeof bound.test>[] = [[0, 0, 0, 1], [0, 1, 0, 0], [.5, .5, .5, .5], [0, 0, 0, -1]];
  for (const q of rotations) expect(bound.test(...q)).toBe(true);
  expect(bound.work).toEqual({ checks: 4, hypotCalls: 0, boundAccepts: 4, fallbacks: 0 });
  expect(bound.test(0, 0, 0, 1e-12)).toBe(false);expect(bound.test(1e-12, 1e-12, 0, 0)).toBe(true);
  expect(bound.work).toEqual({ checks: 6, hypotCalls: 2, boundAccepts: 4, fallbacks: 2 });
  bound.resetWork();expect(bound.work).toEqual({ checks: 0, hypotCalls: 0, boundAccepts: 0, fallbacks: 0 });
});

test('invalid strategy and epsilon reject before an owner can select a predicate', () => {
  expect(() => Reflect.apply(createQuaternionMagnitudeTest3D, undefined, ['bad', 1e-12])).toThrow('Unsupported');
  for (const epsilon of [0, -0, -1, NaN, Infinity, -Infinity]) expect(() => createQuaternionMagnitudeTest3D('original', epsilon)).toThrow('positive and finite');
});
