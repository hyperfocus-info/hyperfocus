import { expect, test } from 'bun:test';
import { heavyCandidates, sampleArtMotion, solveArtLimb } from './motion.ts';

test('two-bone solve preserves limb lengths even when a target is unreachable', () => {
  const targets: [number, number, number][] = [[0, 0, 0], [8, 2, -3], [0, -.3, 0]];
  for (const target of targets) {
    const result = solveArtLimb({ start: [0, 0, 0], target, pole: [0, -1, 0], upper: .31, lower: .29 });
    expect(Math.hypot(...result.joint)).toBeCloseTo(.31, 5);
    expect(Math.hypot(...result.end.map((value, i) => value - result.joint[i]!))).toBeCloseTo(.29, 5);
    expect([...result.joint, ...result.end].every(Number.isFinite)).toBe(true);
  }
});
test('planted walking foot cancels root travel during its support phase', () => {
  const a = sampleArtMotion({ kind: 'walk', frame: 0, travel: .1 });
  const b = sampleArtMotion({ kind: 'walk', frame: 1, travel: .13 });
  expect(a.leftFoot[2] + .1).toBeCloseTo(b.leftFoot[2] + .13, 6);
  expect(a.leftFoot[1]).toBe(b.leftFoot[1]);
});
test('all heavy alternatives visit the full grammar and retain support position', () => {
  for (const heavy of heavyCandidates) {
    const poses = Array.from({ length: 90 }, (_, frame) => sampleArtMotion({ kind: 'heavy', frame, heavy }));
    expect(new Set(poses.map(pose => pose.phase))).toEqual(new Set(['read', 'anticipation', 'commitment', 'impact', 'follow-through', 'recovery']));
    for (const pose of poses) expect(pose.leftFoot).toEqual([-.205, .10, .21]);
    for (let i = 1; i < poses.length; i++) expect(Math.hypot(...poses[i]!.right.map((n, axis) => n - poses[i - 1]!.right[axis]!))).toBeLessThan(.38);
  }
});
