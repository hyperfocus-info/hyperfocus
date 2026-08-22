import { expect, test } from "bun:test";
import { defineSchema, encodeDelta, encodeSnapshot } from "./index.ts";

const worldSchema = defineSchema({
  entities: {
    type: "array",
    item: {
      type: "entity",
      fields: {
        id: "u16",
        x: "f32",
        y: "f32",
        hp: "u16"
      }
    }
  }
});

function percentile(samples: readonly number[], quantile: number) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)] ?? 0;
}

test("protocol encodes 1000 simple entities under target", () => {
  const state = { entities: Array.from({ length: 1000 }, (_, id) => ({ id, x: id * 0.5, y: id * 0.25, hp: 100 })) };
  let bytes = encodeSnapshot(worldSchema, state);
  for (let i = 0; i < 3; i += 1) encodeSnapshot(worldSchema, state);
  const samples: number[] = [];
  for (let i = 0; i < 9; i += 1) {
    const start = performance.now();
    bytes = encodeSnapshot(worldSchema, state);
    samples.push(performance.now() - start);
  }

  expect(bytes.byteLength).toBeLessThanOrEqual(12002);
  expect(percentile(samples, 0.95)).toBeLessThan(2);
});

test("protocol encodes delta for 100 changed entities under target", () => {
  const before = { entities: Array.from({ length: 100 }, (_, id) => ({ id, x: id, y: id, hp: 100 })) };
  const after = { entities: before.entities.map((entity) => ({ ...entity, x: entity.x + 1 })) };
  let bytes = encodeDelta(worldSchema, before, after);
  for (let i = 0; i < 3; i += 1) encodeDelta(worldSchema, before, after);
  const samples: number[] = [];
  for (let i = 0; i < 9; i += 1) {
    const start = performance.now();
    bytes = encodeDelta(worldSchema, before, after);
    samples.push(performance.now() - start);
  }

  expect(bytes.byteLength).toBeGreaterThan(0);
  expect(percentile(samples, 0.95)).toBeLessThan(1);
});
