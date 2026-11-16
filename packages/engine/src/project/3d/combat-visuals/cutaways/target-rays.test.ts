import { expect, test } from 'bun:test';
import { intersects, writeLocal } from '../obstructions.ts';
import { anyTargetIntersects } from "../../../../physics/target-rays.ts";
import { tuple3, tuple4 } from '../../../../math/tuples.ts';

test('batched sight rays match the single-ray oracle for rotations, thin boxes, padding and prefixes', () => {
  let seed = 714;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;return seed / 4294967296; };
  const vector = (): [number, number, number] => [random() * 30 - 15, random() * 10 - 5, random() * 30 - 15];
  for (let trial = 0; trial < 4000; trial++) {
    const angle = random() * Math.PI, rotation: [number, number, number, number] = trial % 3 === 0 ? [0, 0, 0, 1] : [random(), Math.sin(angle), random(), Math.cos(angle)];
    // Also cover non-unit rotations: the old quaternion arithmetic remains the contract.
    if (trial % 3 === 1) { const length = Math.hypot(...rotation);for (let axis = 0; axis < 4; axis++) rotation[axis]! /= length; }
    const scale = vector();
    const box = { position: vector(), rotation, scale: tuple3(Math.abs(scale[0]), Math.abs(scale[1]), Math.abs(scale[2])) };
    if (trial % 5 === 0) box.scale[trial % 3] = 1e-10;
    const eye: [number, number, number] = [0, 0, 0], local: [number, number, number] = [0, 0, 0], targets = Array.from({ length: 12 }, vector);
    writeLocal(vector(), box, eye);
    for (const padding of [0, .35]) for (const count of [0, 1, 7, 12]) {
      const expected = targets.slice(0, count).some(target => { writeLocal(target, box, local);return intersects(eye, local, box.scale, padding); });
      expect(anyTargetIntersects(eye, targets, count, box, padding)).toBe(expected);
    }
  }
});

test('parallel and endpoint-tolerance rays preserve the slab boundary decisions', () => {
  const box = { position: tuple3(0, 0, 0), rotation: tuple4(0, 0, 0, 1), scale: tuple3(1, 1, 1) };
  for (const eyeX of [-1, 1, 1.000000000001, 2]) for (const delta of [-1e-8, -1e-9, -0, 0, 1e-9, 1e-8, -66.66666666666667, -1.015228426395939]) {
    const eye: [number, number, number] = [eyeX, 0, 0], target: [number, number, number] = [eyeX + delta, 0, 0];
    expect(anyTargetIntersects(eye, [target], 1, box, 0)).toBe(intersects(eye, target, box.scale));
  }
});
