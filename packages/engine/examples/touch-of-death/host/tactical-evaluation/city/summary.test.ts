import { expect, test } from 'bun:test';
import { benchmarkSummary } from './summary.ts';

test('benchmark gate keeps median tail regressions and raw parity independent from wall gains', () => {
  const report = { control: { engineSha256: 'a' }, candidate: { engineSha256: 'b' }, controlWallMilliseconds: 1000, candidateWallMilliseconds: 920, wallReductionFraction: .08,
    results: ['control', 'candidate', 'candidate', 'control', 'control', 'candidate', 'candidate', 'control'].map((label, index) => ({ label,
      p95: label === 'control' ? 4 : 2.5, p99: label === 'control' ? 13 : 14, rawPhysics: [{ hash: index === 2 ? 'different' : 'same' }] })) };
  const summary = benchmarkSummary(report);
  expect(summary.reachesFivePercentWallThreshold).toBe(true);expect(summary.p95.reductionFraction).toBe(.375);
  expect(summary.p99.reductionFraction).toBeLessThan(0);expect(summary.rawPhysicsAllExact).toBe(false);
  expect(benchmarkSummary({ ...report, wallReductionFraction: .049 }).reachesFivePercentWallThreshold).toBe(false);
});
