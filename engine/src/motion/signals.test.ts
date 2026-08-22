import { expect, test } from "bun:test";
import { compileMotionSignalLayout, createMotionSignalBuffer, standardMotionSignalSchema } from "./signals.ts";

test("motion signals accept fixed-length typed-array inputs and expose stable borrowed views", () => {
  const signals = createMotionSignalBuffer(compileMotionSignalLayout(standardMotionSignalSchema));
  signals.set("velocity", new Float32Array([1, 2, 3]));
  const first = signals.get("velocity") as Float32Array;
  expect([...first]).toEqual([1, 2, 3]);

  signals.set("velocity", new Float64Array([4, 5, 6]));
  const second = signals.get("velocity") as Float32Array;
  expect(second).toBe(first);
  expect([...second]).toEqual([4, 5, 6]);
});

test("motion signal vector inputs retain exact arity and finite-value validation", () => {
  const signals = createMotionSignalBuffer(compileMotionSignalLayout(standardMotionSignalSchema));
  expect(() => signals.set("velocity", new Float32Array([1, 2]))).toThrow("must be a vec3");
  expect(() => signals.set("velocity", new Float32Array([1, Number.NaN, 3]))).toThrow("must be finite");
});
