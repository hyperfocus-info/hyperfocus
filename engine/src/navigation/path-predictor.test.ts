import { expect, test } from "bun:test";
import { createPathPredictor } from "./path-predictor.ts";

test("path predictor learns complete routes and reports fallback conditions", () => {
  const predictor = createPathPredictor({ nodeCount: 10, capacity: 16 });
  predictor.train(new Int32Array([0, 1, 4, 7]), 4);
  const output = new Int32Array(10);
  expect(predictor.predict(0, 7, output)).toEqual({ status: "hit", length: 4 });
  expect(Array.from(output.slice(0, 4))).toEqual([0, 1, 4, 7]);
  expect(predictor.predict(2, 7, output).status).toBe("miss");
  const blocked = new Uint8Array(10); blocked[4] = 1;
  expect(predictor.predict(0, 7, output, blocked).status).toBe("blocked");
  expect(predictor.predict(0, 7, new Int32Array(2))).toEqual({ status: "output-too-small", length: 4 });
});

test("path predictor reinforces stable transitions and validates nodes", () => {
  const predictor = createPathPredictor({ nodeCount: 4, capacity: 4 });
  predictor.train([0, 1, 3]);
  predictor.train([0, 1, 3]);
  expect(predictor.confidence(0, 3)).toBe(2);
  expect(() => predictor.train([0, 4])).toThrow("outside nodeCount");
});
