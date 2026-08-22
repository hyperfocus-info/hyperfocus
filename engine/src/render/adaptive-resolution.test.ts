import { expect, test } from "bun:test";
import { createAdaptiveResolutionController } from "./adaptive-resolution.ts";

test("adaptive resolution responds with hysteresis and bounded scale", () => {
  const controller = createAdaptiveResolutionController({
    targetFrameMs: 10,
    initialScale: 1,
    minScale: 0.75,
    scaleStep: 0.1,
    smoothing: 1,
    decreaseAfterFrames: 2,
    increaseAfterFrames: 3,
    cooldownFrames: 1
  });
  expect(controller.sample(12)).toBe(1);
  expect(controller.sample(12)).toBeCloseTo(0.9);
  expect(controller.snapshot()).toMatchObject({ changed: true, cooldownFrames: 1 });
  controller.sample(5);
  expect(controller.sample(5)).toBeCloseTo(0.9);
  expect(controller.sample(5)).toBeCloseTo(0.9);
  expect(controller.sample(5)).toBe(1);
  for (let index = 0; index < 20; index += 1) controller.sample(30);
  expect(controller.scale).toBe(0.75);
});

test("adaptive resolution rejects unsafe tuning values", () => {
  expect(() => createAdaptiveResolutionController({ minScale: 0 })).toThrow("minScale");
  expect(() => createAdaptiveResolutionController({ minScale: 0.9, maxScale: 0.8 })).toThrow("minScale");
  expect(() => createAdaptiveResolutionController({ increaseThreshold: 2, decreaseThreshold: 1 })).toThrow("lower");
  const controller = createAdaptiveResolutionController();
  expect(() => controller.sample(Number.NaN)).toThrow("frameMs");
});
