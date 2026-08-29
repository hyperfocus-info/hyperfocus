import { expect, test } from "bun:test";
import { selectTransientEffectsForViewer, spawnTransientEffect, updateTransientEffects, type CompactTransientEffect } from "./transient-effects.ts";

function effect() {
  return {
    id: "fx",
    kind: "aoe" as const,
    zoneId: "arena",
    x: 0,
    y: 0,
    toX: 0,
    toY: 0,
    radius: 1,
    lifetimeMs: 100,
    effectKind: "spark"
  };
}

test("transient effect limits reject values that could hang or corrupt a lane", () => {
  const lane: CompactTransientEffect[] = [];
  expect(() => spawnTransientEffect(lane, effect(), -1)).toThrow("non-negative safe integer");
  expect(() => updateTransientEffects(lane, Number.NaN)).toThrow("non-negative finite");
  expect(() => selectTransientEffectsForViewer(lane, { x: 0, y: 0, radius: 1 }, { maxEffects: -1 })).toThrow("non-negative safe integer");
  expect(lane).toHaveLength(0);
});

test("zero transient effect capacity drops the new effect without looping", () => {
  const lane: CompactTransientEffect[] = [];
  spawnTransientEffect(lane, effect(), 0);
  expect(lane).toHaveLength(0);
});

test("very large finite deltas expire effects instead of wrapping to zero elapsed time", () => {
  const lane: CompactTransientEffect[] = [];
  spawnTransientEffect(lane, effect(), 1);

  updateTransientEffects(lane, Number.MAX_VALUE);

  expect(lane).toHaveLength(0);
});
