import { expect, test } from "bun:test";
import { createFrameMetrics } from "./frame-metrics.ts";

test("frame metrics retain bounded rolling summaries and long frames", () => {
  let now = 0;
  const metrics = createFrameMetrics({ capacity: 3, maxSeries: 2, maxLongFrames: 2, longFrameMs: 10, now: () => now });
  for (const value of [1, 2, 3, 20]) {
    now += 1;
    metrics.record("frame.ms", value);
  }
  metrics.record("drawn", 8);
  expect(metrics.record("third", 1)).toBe(false);

  const snapshot = metrics.snapshot();
  expect(snapshot.series["frame.ms"]).toMatchObject({ count: 3, latest: 20, min: 2, max: 20, p50: 3, p95: 3 });
  expect(snapshot.longFrames).toEqual([{ durationMs: 20, at: 4 }]);
  expect(snapshot.droppedSeries).toBe(1);
});

test("frame metric timers record once and isolate reset state", () => {
  let now = 5;
  const metrics = createFrameMetrics({ now: () => now });
  const end = metrics.start("update.ms");
  now = 8;
  expect(end()).toBe(3);
  expect(end()).toBe(0);
  metrics.reset();
  expect(metrics.snapshot().series).toEqual({});
});
