import { expect, test } from "bun:test";
import {
  copyPoseBuffer,
  createPoseBuffer,
  createPoseBufferLayout,
  resetPoseBuffer,
  validatePoseBuffer,
} from "./pose-buffer.ts";

test("pose buffers expose one contiguous injectable transform layout", () => {
  const layout = createPoseBufferLayout(3, 5, { includeScales: true });
  const buffer = new ArrayBuffer(layout.byteLength + 16);
  const pose = createPoseBuffer(layout, { buffer, byteOffset: 16 });
  expect(pose.buffer).toBe(buffer);
  expect(pose.byteOffset).toBe(16);
  expect(pose.rotations.byteOffset).toBe(16);
  expect(pose.translations.byteOffset).toBe(16 + 5 * 4 * 4);
  expect(pose.scales?.byteOffset).toBe(16 + (5 * 4 + 5 * 3) * 4);
  expect(pose.deformCount).toBe(3);
  expect(pose.totalCount).toBe(5);
  expect(validatePoseBuffer(pose)).toEqual([]);
});

test("pose construction enforces counts, alignment, and injected buffer bounds", () => {
  expect(() => createPoseBufferLayout(2, 1)).toThrow(/cannot exceed/);
  const layout = createPoseBufferLayout(2, 3);
  expect(() => createPoseBuffer(layout, { buffer: new ArrayBuffer(layout.byteLength - 1) })).toThrow(/requires/);
  expect(() => createPoseBuffer(layout, { buffer: new ArrayBuffer(layout.byteLength + 2), byteOffset: 2 })).toThrow(/multiple of four/);
});

test("reference reset and pose copy preserve transforms without reallocating", () => {
  const layout = createPoseBufferLayout(2, 3, { includeScales: true });
  const reference = createPoseBuffer(layout);
  const target = createPoseBuffer(layout);
  reference.translations[4] = 2.5;
  reference.scales![0] = 1.2;
  expect(resetPoseBuffer(target, reference)).toBe(target);
  expect(target.translations[4]).toBe(2.5);
  expect(target.scales![0]).toBeCloseTo(1.2);
  target.translations[0] = 7;
  expect(copyPoseBuffer(target, reference)).toBe(reference);
  expect(reference.translations[0]).toBe(7);
});

test("pose validation reports non-finite and non-normalized transforms by joint", () => {
  const pose = createPoseBuffer(createPoseBufferLayout(2, 2, { includeScales: true }));
  pose.rotations[3] = 2;
  pose.translations[3] = Number.NaN;
  pose.scales![4] = Number.POSITIVE_INFINITY;
  expect(validatePoseBuffer(pose).map((entry) => entry.code)).toEqual([
    "non-normalized-rotation",
    "non-finite-translation",
    "non-finite-scale",
  ]);
});
