import { expect, test } from 'bun:test';
import { getContrastRatio } from './contrast';

test('opaque hex contrast is symmetric, accepts short notation and fails closed', () => {
  expect(getContrastRatio('#fff', '#000')).toBe(21);
  expect(getContrastRatio('#123456', '#abcdef')).toBe(getContrastRatio('#abcdef', '#123456'));
  expect(getContrastRatio('#2c3847', '#2c3847')).toBe(1);
  expect(getContrastRatio('transparent', '#ffffff')).toBe(1);
  expect(getContrastRatio('#ffffff00', '#ffffff')).toBe(1);
});
