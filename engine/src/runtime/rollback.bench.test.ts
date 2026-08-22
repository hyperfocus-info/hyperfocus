import { expect, test } from "bun:test";
import { createRollbackLoop } from "./rollback.ts";

function percentile(samples: readonly number[], quantile: number) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)] ?? 0;
}

function createRollbackBenchCase() {
  let state = {
    entities: Array.from({ length: 10 }, (_, id) => ({ id, x: 0, y: id }))
  };
  const loop = createRollbackLoop<number, typeof state>({
    peerIds: ["local", "remote"],
    localPeerId: "local",
    defaultInput: 0,
    getLocalInput: () => 1,
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    cloneState: (source) => ({ entities: source.entities.map((entity) => ({ ...entity })) }),
    cloneInput: (input) => input,
    compareInput: (a, b) => a === b,
    update: (inputs) => {
      for (const entity of state.entities) {
        entity.x += inputs.local + inputs.remote + entity.id * 0.001;
      }
    }
  });

  for (let i = 0; i < 10; i += 1) loop.tick();
  return loop;
}

test("rollback re-simulates 10 entities over 10 frames inside target", () => {
  for (let warmup = 0; warmup < 3; warmup += 1) createRollbackBenchCase().receiveInput("remote", 0, 1);
  const samples: number[] = [];
  for (let run = 0; run < 9; run += 1) {
    const loop = createRollbackBenchCase();
    const start = performance.now();
    loop.receiveInput("remote", 0, 1);
    samples.push(performance.now() - start);
  }

  expect(percentile(samples, 0.95)).toBeLessThan(1);
});
