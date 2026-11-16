import { expect, test } from 'bun:test';
import { prepareEulerPointRotation3D, prepareEulerQuaternion3D } from './prepared-euler.ts';

test('prepared coefficients preserve scalar expression bits, signed zero and non-finite propagation', () => {
  const values = [0, -0, .17, -2.3, Math.PI, 1e20, NaN, Infinity, -Infinity];
  for (const yaw of values) for (const pitch of values) for (const roll of [0, -0, .4, NaN]) {
    const point: [number, number, number] = [yaw, -0, pitch];
    const p = [point[0] * Math.cos(roll) - point[1] * Math.sin(roll), point[0] * Math.sin(roll) + point[1] * Math.cos(roll), point[2]];
    const y = p[1]! * Math.cos(pitch) - p[2]! * Math.sin(pitch), z = p[1]! * Math.sin(pitch) + p[2]! * Math.cos(pitch);
    const expected = [p[0]! * Math.cos(yaw) + z * Math.sin(yaw), y, -p[0]! * Math.sin(yaw) + z * Math.cos(yaw)];
    const rotate = prepareEulerPointRotation3D(yaw, pitch, roll), result = rotate(point);
    expect(result.every((n, i) => Object.is(n, expected[i]))).toBe(true);
    expect(rotate(point)).not.toBe(result);
    const x = Math.cos(yaw / 2) * Math.sin(pitch / 2), qy = Math.sin(yaw / 2) * Math.cos(pitch / 2), qz = -Math.sin(yaw / 2) * Math.sin(pitch / 2), w = Math.cos(yaw / 2) * Math.cos(pitch / 2), c = Math.cos(roll / 2), s = Math.sin(roll / 2);
    const q = [x * c + qy * s, qy * c - x * s, qz * c + w * s, w * c - qz * s];
    const sample = prepareEulerQuaternion3D(pitch, roll), actual = sample(yaw);
    expect(actual.every((n, i) => Object.is(n, q[i]))).toBe(true);expect(sample(yaw)).not.toBe(actual);
  }
});
