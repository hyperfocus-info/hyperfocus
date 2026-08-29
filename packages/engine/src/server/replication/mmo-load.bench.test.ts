import { expect, test } from "bun:test";
import { createInterestGrid } from "../interest-grid.ts";

function percentile(samples: readonly number[], quantile: number) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)] ?? 0;
}

test("interest grid handles 100 clients x 1000 entities under target", () => {
  const grid = createInterestGrid({ cellSize: 64, maxEntitiesPerClient: 512 });
  for (let i = 0; i < 1000; i += 1) {
    grid.upsert({ id: `e${i}`, x: (i % 100) * 12, y: Math.floor(i / 100) * 12, priority: i % 10 });
  }
  for (let i = 0; i < 100; i += 1) {
    grid.computeVisibility(`warm${i}`, { x: (i % 20) * 40, y: Math.floor(i / 20) * 40, radius: 8 });
  }

  const samples: number[] = [];
  for (let run = 0; run < 25; run += 1) {
    const start = performance.now();
    for (let i = 0; i < 100; i += 1) {
      grid.computeVisibility(`c${run}-${i}`, { x: (i % 20) * 40, y: Math.floor(i / 20) * 40, radius: 8 });
    }
    samples.push(performance.now() - start);
  }

  // A median gate catches algorithmic regressions while the wider p95 gate
  // tolerates one unrelated scheduler pause during the full parallel suite.
  expect(percentile(samples, 0.5)).toBeLessThan(2);
  expect(percentile(samples, 0.95)).toBeLessThan(10);
});
