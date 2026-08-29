import { expect, test } from "bun:test";
import { createMovementPredictor, type MovementPrediction } from "./movement-predictor.ts";

test("movement predictor extrapolates from smoothed velocity and one-way latency", () => {
  const predictor = createMovementPredictor({ maxPredictionMs: 200, velocitySmoothing: 1, latencySmoothing: 1 });
  predictor.observe({ time: 0, x: 0, y: 0 });
  predictor.observe({ time: 100, x: 1, y: 0 });
  predictor.observeRtt(100);
  expect(predictor.predict(150)).toMatchObject({ x: 2, y: 0, velocityX: 10, horizonMs: 100 });
});

test("movement predictor bounds speed, horizon, stale samples, and caller-owned output", () => {
  const predictor = createMovementPredictor({ maxPredictionMs: 100, maxSpeed: 5, velocitySmoothing: 1 });
  expect(predictor.observe({ time: 10, x: 0, y: 0 })).toBe(true);
  expect(predictor.observe({ time: 20, x: 100, y: 0 })).toBe(true);
  expect(predictor.observe({ time: 20, x: 200, y: 0 })).toBe(false);
  const target: MovementPrediction = {
    x: 0,
    y: 0,
    z: 0,
    velocityX: 0,
    velocityY: 0,
    velocityZ: 0,
    horizonMs: 0,
    confidence: 0
  };
  expect(predictor.predict(1_000, target)).toBe(target);
  expect(target).toMatchObject({ x: 100.5, velocityX: 5, horizonMs: 100, confidence: 0 });
});

test("movement predictor validates timing and tuning inputs", () => {
  expect(() => createMovementPredictor({ velocitySmoothing: 2 })).toThrow("velocitySmoothing");
  const predictor = createMovementPredictor();
  expect(() => predictor.observeRtt(-1)).toThrow("latency");
  expect(() => predictor.observe({ time: Number.NaN, x: 0, y: 0 })).toThrow("time");
});
