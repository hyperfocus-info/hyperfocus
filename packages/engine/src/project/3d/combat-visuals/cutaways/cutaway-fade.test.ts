import { expect, test } from 'bun:test';
import { createCutawayFade } from './cutaway-fade.ts';

test('cutaways ease in simulation time, hold through boundary chatter, and return to opaque', () => {
  const fade = createCutawayFade();expect(fade.sample('wall', 1, 0)).toBe(1);
  const first = fade.sample('wall', .035, .016);expect(first).toBeGreaterThan(.035);expect(first).toBeLessThan(1);
  expect(fade.sample('wall', .035, .016)).toBe(first);
  for (const time of [.032, .048, .064, .08]) fade.sample('wall', .035, time);
  expect(fade.sample('wall', .035, .096)).toBeCloseTo(.035);
  expect(fade.sample('wall', 1, .112)).toBeCloseTo(.035);
  expect(fade.sample('wall', .035, .128)).toBeCloseTo(.035);
  expect(fade.sample('wall', 1, .144)).toBeCloseTo(.035);
  for (let tick = 10; tick <= 40; tick++) fade.sample('wall', 1, tick * .016);
  expect(fade.sample('wall', 1, .656)).toBe(1);
  expect(fade.sample('wall', .035, 0)).toBe(.035);
  fade.reset();expect(fade.sample('wall', 1, 0)).toBe(1);
});
