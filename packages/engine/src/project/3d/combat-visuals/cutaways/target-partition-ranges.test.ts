import { expect, test } from 'bun:test';
import { createPartitionedTargetRayQuery3D } from "./target-partitions.ts";
import { anyTargetIntersects } from "../../../../physics/target-rays.ts";

test('range callbacks retain group references, offsets, clipped prefix order and full fallback', () => {
  const eye: [number, number, number] = [0, 0, 10], aim: typeof eye = [0, 0, 0];
  const targets: Array<typeof eye> = Array.from({ length: 35 }, (_, index) => [index - 17, 0, 0]);
  const box: Parameters<typeof anyTargetIntersects>[3] = { position: [100, 0, 5], scale: [1, 1, 1], rotation: [0, .5, 0, Math.sqrt(.75)] };
  const seen: number[] = [];
  const range = createPartitionedTargetRayQuery3D(eye, eye, targets, { queryRange(local, samples, count, shape, padding, offset) {
    seen.push(offset);for (let i = 0; i < count; i++) expect(samples[i]).toBe(targets[offset + i]);
    return anyTargetIntersects(local, samples, count, shape, padding);
  } });
  expect(range.test(eye, 17, box, 0)).toBe(anyTargetIntersects(eye, targets, 17, box, 0));expect(seen).toEqual([0]);
  seen.length = 0;box.rotation = [0, 0, 0, 1];
  const local: typeof eye = [-100, 0, 5];
  expect(range.test(local, 17, box, 0)).toBe(anyTargetIntersects(local, targets, 17, box, 0));expect(seen).toEqual([0, 16]);
  expect(() => createPartitionedTargetRayQuery3D(eye, aim, targets, { query: anyTargetIntersects, queryRange: () => false })).toThrow('one target partition query owner');
});
