import { expect, test } from "bun:test";
import { createTextureUnitBatchPlanner, planTextureUnitBatches } from "./texture-batches.ts";

test("texture batch planning preserves order and respects unit limits", () => {
  expect(planTextureUnitBatches(new Int32Array([1, 2, 1, -1, 3, 4, 3]), 2)).toEqual([
    { start: 0, count: 4, textureCount: 2 },
    { start: 4, count: 3, textureCount: 2 }
  ]);
});

test("texture batch planning reuses caller output objects", () => {
  const first = { start: 99, count: 99, textureCount: 99 };
  const output = [first, { start: 0, count: 0, textureCount: 0 }];
  expect(planTextureUnitBatches([5, 5, 5], 1, output)).toBe(output);
  expect(output).toEqual([{ start: 0, count: 3, textureCount: 1 }]);
  expect(output[0]).toBe(first);
  expect(() => planTextureUnitBatches([1], 0)).toThrow("maxTextureUnits");
});

test("texture batch planner reuses its active texture workspace", () => {
  const planner = createTextureUnitBatchPlanner();
  const output = [{ start: 0, count: 0, textureCount: 0 }];
  expect(planner.plan([1, 2, 3], 2, output)).toBe(output);
  expect(output).toHaveLength(2);
  expect(planner.plan([9, 9], 2, output)).toEqual([{ start: 0, count: 2, textureCount: 1 }]);
});
