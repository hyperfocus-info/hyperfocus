import { expect, test } from "bun:test";
import { runAuthoritativeSoak } from "./authoritative-soak.ts";

test("authoritative soak harness tracks real time, load, and memory bounds", async () => {
  const evidence = await runAuthoritativeSoak({ durationMs: 250, clients: 10, tickRate: 60 });
  expect(evidence.durationMs).toBeGreaterThanOrEqual(200);
  expect(evidence.clients).toBe(10);
  expect(evidence.ticks).toBeGreaterThan(5);
  expect(evidence.inputs).toBe(evidence.ticks * evidence.clients);
  expect(evidence.failures).toBe(0);
  expect(evidence.tickP95Ms).toBeLessThan(16.7);
});
