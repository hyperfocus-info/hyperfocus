import { expect, test } from 'bun:test';
import { inspectLimbGeometry, inspectSignedJoint, type SignedJointEnvelope } from './pose-safety.ts';
import { multiplyQuaternions, quaternionFromAxisAngle } from '../math.ts';

const envelope: SignedJointEnvelope = { axis: [1, 0, 0], reference: [0, 0, 0, 1], minRadians: -.05, maxRadians: 2.6, maxOffAxisRadians: .15 };
test('calibrated elbows distinguish backward bending from valid flexion, including quaternion sign and rotated rest frames', () => {
  for (const restAngle of [0, .7, -1.2]) for (const sign of [-1, 1]) {
    const reference = new Float32Array(4), delta = new Float32Array(4), rotation = new Float32Array(4);
    quaternionFromAxisAngle([0, 1, 0], restAngle, reference);
    quaternionFromAxisAngle([1, 0, 0], Math.PI / 2, delta); multiplyQuaternions(reference, delta, rotation);
    for (let i = 0; i < 4; i++) rotation[i] *= sign;
    const calibrated = { ...envelope, reference: [reference[0]!, reference[1]!, reference[2]!, reference[3]!] as const };
    expect(inspectSignedJoint('elbow', rotation, calibrated)).toEqual([]);
    quaternionFromAxisAngle([1, 0, 0], -Math.PI / 2, delta); multiplyQuaternions(reference, delta, rotation);
    expect(inspectSignedJoint('elbow', rotation, calibrated).map(f => f.code)).toContain('joint-direction');
  }
});
test('valid lengths and locked wrists cannot conceal a torso collision', () => {
  const root = [.2, 0, .6] as const, end = [.2, 0, .12] as const;
  const along = 0.24614583333333334, radius = Math.sqrt(0.09 - along ** 2);
  for (const sign of [-1, 1]) {
    const findings = inspectLimbGeometry({ subject: 'arm', root, end, middle: [.2 + sign * radius, 0, .6 - along], upperLength: .3, lowerLength: .29, radius: .01,
      exclusions: [{ id: 'torso', center: [0, 0, .425], halfSize: [.16, .1, .225] }] });
    expect(findings.some(f => f.code === 'limb-length')).toBe(false);
    expect(findings.some(f => f.code === 'limb-collision')).toBe(sign === -1);
  }
});
test('hinge-plane violations and malformed calibration fail instead of becoming a pass', () => {
  const rotation = new Float32Array(4); quaternionFromAxisAngle([0, 0, 1], 1, rotation);
  expect(inspectSignedJoint('elbow', rotation, envelope).some(f => f.code === 'joint-plane')).toBe(true);
  expect(() => inspectSignedJoint('elbow', rotation, { ...envelope, axis: [0, 0, 0] })).toThrow('calibration');
  expect(() => inspectSignedJoint('elbow', [NaN, 0, 0, 1], envelope)).toThrow('rotation');
});

test('body clearance follows a rotated torso capsule instead of a fixed world box', () => {
  const findings = inspectLimbGeometry({ subject: 'arm', root: [1, 0, 0], middle: [0, 0, 0], end: [0, 0, 1], upperLength: 1, lowerLength: 1, radius: .03, exclusions: [], bodyCapsules: [{ id: 'bent-torso', a: [-.5, -.5, 0], b: [.5, .5, 0], radius: .1 }] });
  expect(findings.map(f => f.code)).toEqual(['limb-collision']);
});
