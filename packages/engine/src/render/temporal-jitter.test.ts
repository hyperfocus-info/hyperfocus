import { expect, test } from "bun:test";
import { createTemporalJitterController } from "./temporal-jitter.ts";

test("temporal jitter is deterministic and drops history after invalidation", () => {
  const a = createTemporalJitterController({ sequenceLength: 2, historyWeight: 0.8 });
  const first = a.sample(100, 50);
  expect(first).toMatchObject({ pixelX: 0, historyWeight: 0 });
  expect(first.clipX).toBe(0);
  expect(a.sample(100, 50).historyWeight).toBe(0.8);
  expect(a.sample(100, 50).pixelX).toBe(first.pixelX);
  a.invalidateHistory();
  const output = { pixelX: 99, pixelY: 99, clipX: 99, clipY: 99, historyWeight: 99 };
  expect(a.sample(100, 50, output)).toBe(output);
  expect(output.historyWeight).toBe(0);
});
