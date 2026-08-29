import { describe, expect, test } from "bun:test";
import { createMeasuredWindowModel } from "./measured-window-model";

describe("measured window model", () => {
  test("finds variable-height rows and windows from prefix sums", () => {
    const model = createMeasuredWindowModel();
    model.sync(["one", "two", "three", "four"], 100);
    model.measure("two", 150);
    model.measure("three", 50);

    expect(model.totalSize).toBe(400);
    expect([0, 1, 2, 3, 4].map((index) => model.offsetAt(index))).toEqual([0, 100, 250, 300, 400]);
    expect(model.indexAtOffset(249)).toBe(1);
    expect(model.indexAtOffset(250)).toBe(2);
    expect(model.windowAt(240, 20, 1)).toEqual({ first: 0, last: 3 });
  });

  test("retains measurements by key across insertions and drops removed keys", () => {
    const model = createMeasuredWindowModel();
    model.sync(["one", "two"], 100);
    model.measure("two", 180);
    expect(model.sync(["zero", "one", "two"], 100)).toBe(true);
    expect(model.offsetAt(3)).toBe(380);

    model.sync(["zero", "one"], 100);
    model.sync(["two"], 100);
    expect(model.totalSize).toBe(100);
  });

  test("updates a measurement without rebuilding a 100k-row structure", () => {
    const model = createMeasuredWindowModel();
    const keys = Array.from({ length: 100_000 }, (_, index) => `row-${index}`);
    model.sync(keys, 64);
    expect(model.sync(keys, 64)).toBe(false);

    expect(model.measure("row-50", 96)).toBe(true);
    expect(model.measure("row-50", 96)).toBe(false);
    expect(model.totalSize).toBe(6_400_032);
    expect(model.indexAtOffset(model.offsetAt(90_000))).toBe(90_000);
  });
});
