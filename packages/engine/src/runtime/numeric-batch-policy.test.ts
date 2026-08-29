import { describe, expect, test } from "bun:test";
import { DEFAULT_MINIMUM_WASM_BATCH_SIZE, createNumericBatchSelector } from "./numeric-batch-policy.ts";

describe("numeric batch policy", () => {
  test("uses the conservative measured crossover by default", () => {
    const selector = createNumericBatchSelector();
    expect(selector.policy.minimumWasmBatchSize).toBe(DEFAULT_MINIMUM_WASM_BATCH_SIZE);
    expect(selector.backendFor(DEFAULT_MINIMUM_WASM_BATCH_SIZE - 1)).toBe("typescript");
    expect(selector.backendFor(DEFAULT_MINIMUM_WASM_BATCH_SIZE)).toBe("wasm");
    expect(selector.backendFor(DEFAULT_MINIMUM_WASM_BATCH_SIZE, false)).toBe("typescript");
  });

  test("supports forced backends and calibrated thresholds", () => {
    expect(createNumericBatchSelector({ backend: "typescript" }).backendFor(10_000)).toBe("typescript");
    expect(createNumericBatchSelector({ backend: "wasm" }).backendFor(1)).toBe("wasm");
    expect(createNumericBatchSelector({ minimumWasmBatchSize: 64 }).backendFor(64)).toBe("wasm");
  });

  test("supports calibrated thresholds per numeric operation", () => {
    const selector = createNumericBatchSelector({
      minimumWasmBatchSize: 256,
      minimumWasmBatchSizeByOperation: {
        movement: 64,
        "circle-rect-overlap": 512
      }
    });

    expect(selector.backendFor(64, true, "movement")).toBe("wasm");
    expect(selector.backendFor(256, true, "circle-rect-overlap")).toBe("typescript");
    expect(selector.backendFor(256, true, "unconfigured")).toBe("wasm");
    expect(() => createNumericBatchSelector({ minimumWasmBatchSizeByOperation: { movement: -1 } }))
      .toThrow("minimumWasmBatchSizeByOperation.movement");
  });

  test("rejects invalid configuration and counts", () => {
    expect(() => createNumericBatchSelector({ minimumWasmBatchSize: -1 })).toThrow("minimumWasmBatchSize");
    const selector = createNumericBatchSelector();
    expect(() => selector.backendFor(Number.NaN)).toThrow("count");
  });
});
