import { expect, test } from "bun:test";
import {
  crossVector3,
  dotVector3,
  isNormalizedQuaternion,
  multiplyQuaternions,
  normalizeQuaternion,
  normalizeVector3,
  quaternionFromAxisAngle,
  quaternionFromUnitVectors,
  rotateVector3ByQuaternion,
  slerpQuaternions,
  vector3Length,
} from "./math.ts";

function closeArray(actual: ArrayLike<number>, expected: readonly number[], tolerance = 1e-5) {
  expect(actual.length).toBe(expected.length);
  for (const [index, value] of expected.entries()) expect(actual[index]).toBeCloseTo(value, Math.max(0, Math.floor(-Math.log10(tolerance))));
}

test("motion quaternion math writes into caller-owned XYZW outputs", () => {
  const first = new Float32Array(4);
  const second = new Float32Array(4);
  const product = new Float32Array(4);
  const vector = new Float32Array(3);
  quaternionFromAxisAngle([0, 1, 0], Math.PI * 0.5, first);
  quaternionFromAxisAngle([1, 0, 0], Math.PI * 0.5, second);
  expect(multiplyQuaternions(first, second, product)).toBe(product);
  expect(isNormalizedQuaternion(product)).toBe(true);
  expect(rotateVector3ByQuaternion([0, 0, 1], first, vector)).toBe(vector);
  closeArray(vector, [1, 0, 0]);
});

test("vector reference helpers cover dot, cross, length, and normalization", () => {
  const output = [0, 0, 0];
  expect(dotVector3([1, 2, 3], [4, 5, 6])).toBe(32);
  expect(crossVector3([1, 0, 0], [0, 1, 0], output)).toBe(output);
  expect(output).toEqual([0, 0, 1]);
  expect(vector3Length([0, 3, 4])).toBe(5);
  normalizeVector3([0, 3, 4], output);
  closeArray(output, [0, 0.6, 0.8]);
});

test("unit-vector rotation handles aligned and opposite directions", () => {
  const rotation = new Float32Array(4);
  const rotated = new Float32Array(3);
  quaternionFromUnitVectors([1, 0, 0], [-1, 0, 0], rotation);
  expect(isNormalizedQuaternion(rotation)).toBe(true);
  rotateVector3ByQuaternion([1, 0, 0], rotation, rotated);
  closeArray(rotated, [-1, 0, 0]);
  quaternionFromUnitVectors([0, 1, 0], [0, 1, 0], rotation);
  closeArray(rotation, [0, 0, 0, 1]);
});

test("normalization rejects non-finite and zero transforms", () => {
  expect(() => normalizeQuaternion([0, 0, 0, 0], new Float32Array(4))).toThrow(/non-zero/);
  expect(() => normalizeQuaternion([0, 0, Number.NaN, 1], new Float32Array(4))).toThrow(/finite/);
  expect(() => normalizeVector3([0, 0, 0], new Float32Array(3))).toThrow(/non-zero/);
  expect(isNormalizedQuaternion([0, 0, 0, 2])).toBe(false);
});

test("slerp uses the shortest quaternion hemisphere and stays normalized", () => {
  const output = new Float32Array(4);
  slerpQuaternions([0, 0, 0, 1], [0, 0, 0, -1], 0.5, output);
  closeArray(output, [0, 0, 0, 1]);
  expect(isNormalizedQuaternion(output)).toBe(true);
});
