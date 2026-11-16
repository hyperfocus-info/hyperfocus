import { expect, test } from 'bun:test';
import { createFrameWorkPolicy } from "./frame-work-policy.ts";

test('optional jobs coalesce, respect budget and cannot starve; urgent work runs immediately', () => {
  let clock = 0, runs = 0;
  const policy = createFrameWorkPolicy([{ id: 'panel', intervalMs: 50, maxAgeMs: 100, estimatedCostMs: 2 }], () => clock);
  const operation = () => { runs++;clock += 2; };
  expect(policy.run('panel', { nowMs: 0, remainingMs: 0, revision: 1 }, operation)).toBe(true);
  for (let nowMs = 10; nowMs < 100; nowMs += 10) expect(policy.run('panel', { nowMs, remainingMs: 0, revision: nowMs }, operation)).toBe(false);
  expect(policy.work.pending).toBe(1);expect(policy.work.peakPending).toBe(1);
  expect(policy.run('panel', { nowMs: 100, remainingMs: -10, revision: 100 }, operation)).toBe(true);
  expect(policy.run('panel', { nowMs: 101, remainingMs: -10, revision: 100, urgent: true }, operation)).toBe(true);
  expect(runs).toBe(3);expect(policy.work.pending).toBe(0);
  expect(policy.run('panel', { nowMs: 102, remainingMs: 10, revision: 100 }, operation)).toBe(false);
  expect(() => policy.run('panel', { nowMs: 1, remainingMs: 10, revision: 1 }, operation)).toThrow();
  policy.reset();expect(policy.run('panel', { nowMs: 0, remainingMs: 0, revision: 1 }, operation)).toBe(true);
});

test('failed operations retain pending work and invalid contracts are rejected', () => {
  const job = { id: 'panel', intervalMs: 1, maxAgeMs: 2, estimatedCostMs: 0 };
  const policy = createFrameWorkPolicy([job], () => 0);
  expect(() => policy.run('missing', { nowMs: 0, remainingMs: 0, revision: 0 }, () => {})).toThrow();
  expect(() => policy.run('panel', { nowMs: 0, remainingMs: 0, revision: 0 }, () => { throw Error('failed'); })).toThrow();
  expect(policy.work.runs).toBe(0);
  expect(policy.run('panel', { nowMs: 0, remainingMs: 0, revision: 0 }, () => {})).toBe(true);
  expect(() => createFrameWorkPolicy([job, job], () => 0)).toThrow();
  expect(() => createFrameWorkPolicy([{ ...job, maxAgeMs: 0 }], () => 0)).toThrow();
});
