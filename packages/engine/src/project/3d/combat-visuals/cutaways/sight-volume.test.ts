import { expect, test } from 'bun:test';
import { aabbIntersectsFrustum3D } from '../../../../render/3d-core.ts';
import { createSightVolumePlanes3D } from './sight-volume.ts';

test('sight volume rejects empty space inside the coarse eye/target box and retains segment boundaries', () => {
  const eye: [number, number, number] = [0, 3, 10], targets: [number, number, number][] = [[-1, 0, 0], [1, 2, 0]];
  const planes = createSightVolumePlanes3D(eye, [0, 1, 0], targets)!;
  expect(aabbIntersectsFrustum3D(planes, [.8, 0, 8], [1, .2, 8.2])).toBe(false);
  expect(aabbIntersectsFrustum3D(planes, [-.1, 2.9, 9.9], [.1, 3.1, 10.1])).toBe(true);
  for (const target of targets) for (const t of [0, .015, .5, .985, 1]) {
    const point: [number, number, number] = [eye[0] + t * (target[0] - eye[0]), eye[1] + t * (target[1] - eye[1]), eye[2] + t * (target[2] - eye[2])];
    expect(aabbIntersectsFrustum3D(planes, point, point)).toBe(true);
  }
  expect(createSightVolumePlanes3D(eye, eye, targets)).toBeUndefined();
  expect(createSightVolumePlanes3D(eye, [0, 0, 0], [[0, 3, 12]])).toBeUndefined();
  expect(createSightVolumePlanes3D(eye, [0, 0, 0], [])).toBeUndefined();
});

test('rotated sight volumes conservatively contain every sampled segment at large coordinates', () => {
  let seed = 0xface;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 | 0) >>> 0) / 0x100000000;
  for (let i = 0; i < 400; i++) {
    const eye: [number, number, number] = [random() * 1e6, random() * 1e6, random() * 1e6];
    const aim: [number, number, number] = [eye[0] + random() * 100 - 50, eye[1] + random() * 100 - 50, eye[2] + random() * 100 - 50];
    const targets: [number, number, number][] = Array.from({ length: 12 }, () => [aim[0] + random() * 5, aim[1] + random() * 5, aim[2] + random() * 5]);
    const planes = createSightVolumePlanes3D(eye, aim, targets);if (!planes) continue;
    for (const target of targets) for (const t of [0, random(), 1]) {
      const point: [number, number, number] = [eye[0] + t * (target[0] - eye[0]), eye[1] + t * (target[1] - eye[1]), eye[2] + t * (target[2] - eye[2])];
      expect(aabbIntersectsFrustum3D(planes, point, point)).toBe(true);
    }
  }
});
