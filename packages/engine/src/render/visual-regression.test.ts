import { expect, test } from "bun:test";
import { structuralSimilarityRgba } from "./visual-regression.ts";

test("visual similarity is exact for identical RGBA and detects changed structure", () => {
  const reference = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255, 40, 40, 40, 255]);
  expect(structuralSimilarityRgba(reference, reference)).toBe(1);
  const changed = new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255, 40, 40, 40, 255]);
  expect(structuralSimilarityRgba(changed, reference)).toBeLessThan(0.5);
  expect(() => structuralSimilarityRgba([0, 0], [0, 0])).toThrow("RGBA");
});
