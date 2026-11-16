import { expect, test } from 'bun:test';
import { comparablePhysics, physicsWorkCounters } from './physics-parity.ts';
import { exactHash } from './exact-hash.ts';

test('only audited angular work counter can be omitted, without changing physical bytes or budget counters', () => {
  expect(() => physicsWorkCounters('ccdTests')).toThrow();
  expect(() => physicsWorkCounters('ccdOverflow')).toThrow();
  const allow = physicsWorkCounters('ccdAngularTests');
  const control = { bodies: new Float64Array([1, -0]), diagnostics: { ccdAngularTests: 4, ccdTests: 8, overflow: 0 } };
  const candidate = { ...control, diagnostics: { ...control.diagnostics, ccdAngularTests: 2 } };
  expect(exactHash(control)).not.toBe(exactHash(candidate));
  expect(exactHash(comparablePhysics(control, allow))).toBe(exactHash(comparablePhysics(candidate, allow)));
  expect(control.diagnostics.ccdAngularTests).toBe(4);
  expect(exactHash(comparablePhysics({ ...candidate, bodies: new Float64Array([1, 0]) }, allow))).not.toBe(exactHash(comparablePhysics(control, allow)));
  expect(exactHash(comparablePhysics({ ...candidate, diagnostics: { ...candidate.diagnostics, ccdTests: 7 } }, allow))).not.toBe(exactHash(comparablePhysics(control, allow)));
});
