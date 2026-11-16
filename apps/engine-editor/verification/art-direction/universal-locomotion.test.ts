import { expect, test } from 'bun:test';
import { sample3DFrame } from '@hyperfocus/engine/project/runtime-3d';
import { readUniversalLocomotion } from './universal-source.ts';
import { createArtFixture, addFighter } from '@hyperfocus/touch-of-death/presentation/art-direction/fixture';
import { fighterCandidates } from '@hyperfocus/touch-of-death/presentation/art-direction/candidates';
import { refineFighter } from '@hyperfocus/touch-of-death/presentation/art-direction/refine';
import { sampleUniversalLocomotion, universalLocomotionProfile } from '@hyperfocus/touch-of-death/presentation/art-direction/universal-locomotion';
import { presentArtFighter } from '@hyperfocus/touch-of-death/presentation/art-direction/pose';
import { sampleUniversalCombat, universalStudyTime } from '@hyperfocus/touch-of-death/presentation/art-direction/universal-combat';
import { blendArtMotion } from '@hyperfocus/touch-of-death/presentation/art-direction/transition';

test('actual UAL walk/jog transfer keeps fixed limbs, loop continuity and articulated feet', async () => {
  const { bank } = await readUniversalLocomotion();
  expect(bank.clips.map(clip => clip.name)).toEqual(['Walk_Loop', 'Jog_Fwd_Loop']);
  expect(bank.sha256).toHaveLength(64);
  expect(universalLocomotionProfile(bank, 3).stride / 3).toBeCloseTo(bank.clips[1]!.duration, 6);
  const fixture = createArtFixture();
  addFighter({ fixture, candidate: fighterCandidates[2], id: 'actor' }); refineFighter(fixture, 'actor', false);
  const frame = sample3DFrame({ declaration: fixture.declaration, clock: { kind: 'simulation', tick: 0, ticksPerSecond: 60 }, viewport: { width: 900, height: 800 } });
  let maxPitch = 0, unreachable = 0, maxLengthError = 0, backwardsKnees = 0;
  for (const speed of [1.6, 2.3, 3]) for (const weight of [.1, .5, 1]) for (let i = 0; i < 120; i++) {
    const motion = sampleUniversalLocomotion(bank, { cycle: i / 120, speed, weight });
    const measured = presentArtFighter({ frame, declaration: fixture.declaration, id: 'actor', root: [0, 0, 0], yaw: 0, motion });
    for (const joint of measured) {
      if (joint.legClamped) unreachable++;
      const length = Math.hypot(...joint.wrist.map((n, axis) => n - joint.elbow[axis]!));
      maxLengthError = Math.max(maxLengthError, Math.abs(length - .29));
      // In the fighter's sagittal plane, a knee flexes forward relative to the
      // hip-to-ankle line. A negative signed bend is the owner's reversed knee.
      const thighY = joint.knee[1] - joint.hip[1], thighZ = joint.knee[2] - joint.hip[2];
      const shinY = joint.ankle[1] - joint.knee[1], shinZ = joint.ankle[2] - joint.knee[2];
      if (thighY * shinZ - thighZ * shinY < -.0001) backwardsKnees++;
    }
    maxPitch = Math.max(maxPitch, Math.abs(motion.authored!.leftFootPitch));
    expect(frame.entities.every(entity => [...entity.position, ...entity.rotation, ...entity.scale].every(Number.isFinite))).toBe(true);
  }
  expect(unreachable).toBe(0); expect(maxLengthError).toBeLessThan(.00001); expect(maxPitch).toBeGreaterThan(.35);
  expect(backwardsKnees).toBe(0);
  const start = sampleUniversalLocomotion(bank, { cycle: 0, speed: 3, weight: 1 });
  const end = sampleUniversalLocomotion(bank, { cycle: .9999999, speed: 3, weight: 1 });
  expect(Math.hypot(...start.leftFoot.map((n, i) => n - end.leftFoot[i]!))).toBeLessThan(.0001);
});

test('source jab keeps contact aligned for hit and whiff timing; the full motion set preserves reachable support', async () => {
  const { bank } = await readUniversalLocomotion();
  expect(bank.studies!.map(clip => clip.name)).toEqual(['Idle_Loop', 'Punch_Jab', 'Punch_Cross', 'Hit_Chest']);
  const jab = bank.studies!.find(clip => clip.kind === 'light')!;
  for (const recovery of [8, 16]) {
    expect(universalStudyTime({ clip: jab, frame: 14, startup: 14, active: 3, recovery })).toBeCloseTo(jab.contact * jab.duration, 6);
    expect(universalStudyTime({ clip: jab, frame: 17 + recovery, startup: 14, active: 3, recovery })).toBeCloseTo(jab.duration, 6);
  }
  const fixture = createArtFixture();
  addFighter({ fixture, candidate: fighterCandidates[2], id: 'actor' }); refineFighter(fixture, 'actor');
  const frame = sample3DFrame({ declaration: fixture.declaration, clock: { kind: 'simulation', tick: 0, ticksPerSecond: 60 }, viewport: { width: 900, height: 800 } });
  let clamped = 0, reversed = 0, invalid = 0;
  for (const kind of ['idle', 'light', 'heavy', 'hit'] as const) for (let tick = 0; tick < 150; tick++) {
    const motion = sampleUniversalCombat(bank, { kind, frame: tick, reactionFrames: 110 });
    const measured = presentArtFighter({ frame, declaration: fixture.declaration, id: 'actor', root: [0, 0, 0], yaw: 0, motion });
    for (const joint of measured) {
      if (joint.legClamped) clamped++;
      const thighY = joint.knee[1] - joint.hip[1], thighZ = joint.knee[2] - joint.hip[2];
      const shinY = joint.ankle[1] - joint.knee[1], shinZ = joint.ankle[2] - joint.knee[2];
      if (thighY * shinZ - thighZ * shinY < -.0001) reversed++;
    }
    if (frame.entities.some(entity => [...entity.position, ...entity.rotation, ...entity.scale].some(n => !Number.isFinite(n)))) invalid++;
  }
  expect({ clamped, reversed, invalid }).toEqual({ clamped: 0, reversed: 0, invalid: 0 });
  const lightHit = sampleUniversalCombat(bank, { kind: 'hit', frame: 5, strength: .48, reactionFrames: 22 });
  const heavyHit = sampleUniversalCombat(bank, { kind: 'hit', frame: 5, strength: 1, reactionFrames: 110 });
  expect(Math.abs(heavyHit.pitch)).toBeGreaterThan(Math.abs(lightHit.pitch) * 2);
});

test('every run phase settles into the same idle elbows, without retaining a moving bend target', async () => {
  const { bank } = await readUniversalLocomotion();
  const fixture = createArtFixture();
  addFighter({ fixture, candidate: fighterCandidates[2], id: 'actor' }); refineFighter(fixture, 'actor');
  const frame = sample3DFrame({ declaration: fixture.declaration, clock: { kind: 'simulation', tick: 0, ticksPerSecond: 60 }, viewport: { width: 900, height: 800 } });
  const measure = (motion: Parameters<typeof presentArtFighter>[0]['motion']) => presentArtFighter({ frame, declaration: fixture.declaration, id: 'actor', root: [0, 0, 0], yaw: 0, motion });
  const idle = sampleUniversalCombat(bank, { kind: 'idle', frame: 0 }), neutral = measure(idle);
  let settledError = 0, raisedElbows = 0, transitionJump = 0;
  for (let phase = 0; phase < 120; phase++) {
    const run = sampleUniversalLocomotion(bank, { cycle: phase / 120, speed: 3, weight: 1 });
    let previous = measure(run);
    // Cover both the gait's own stop weight and the state blend used by attacks/idle.
    for (let tick = 0; tick <= 40; tick++) {
      const weight = 1 - tick / 40;
      for (const motion of [sampleUniversalLocomotion(bank, { cycle: phase / 120, speed: 3, weight }), blendArtMotion({ from: run, to: idle, weight: 1 - weight })]) {
        const joints = measure(motion);
        for (let side = 0; side < 2; side++) {
          const joint = joints[side]!;
          if (weight <= .1 && joint.elbow[1] > joint.shoulder[1] - .12) raisedElbows++;
          if (weight === 0) settledError = Math.max(settledError, Math.hypot(...joint.elbow.map((n, axis) => n - neutral[side]!.elbow[axis]!)));
        }
      }
      const joints = measure(blendArtMotion({ from: run, to: idle, weight: 1 - weight }));
      for (let side = 0; side < 2; side++) transitionJump = Math.max(transitionJump, Math.hypot(...joints[side]!.elbow.map((n, axis) => n - previous[side]!.elbow[axis]!)));
      previous = joints;
    }
  }
  expect({ raisedElbows, settledError }).toEqual({ raisedElbows: 0, settledError: expect.closeTo(0, 6) });
  expect(transitionJump).toBeLessThan(.08);
});

test('3m/s jog does not inherit the fast source run vertical extremes', async () => {
  const { bank } = await readUniversalLocomotion();
  let low = Infinity, high = -Infinity, ankle = 0, pitch = 0, roll = 0;
  for (let tick = 0; tick < 240; tick++) {
    const pose = sampleUniversalLocomotion(bank, { cycle: tick / 240, speed: 3, weight: 1 });
    low = Math.min(low, pose.hip[1]); high = Math.max(high, pose.hip[1]);
    ankle = Math.max(ankle, pose.leftFoot[1], pose.rightFoot[1]);
    pitch = Math.max(pitch, Math.abs(pose.pitch)); roll = Math.max(roll, Math.abs(pose.roll ?? 0));
  }
  // Consumer-specific regression envelope for the owner's rejected crouch/high-knee run.
  // Passing it does not establish appealing motion or apply to the selected deep heavy.
  expect(low).toBeGreaterThan(.90); expect(high - low).toBeLessThan(.13);
  expect(ankle).toBeLessThan(.36); expect(pitch).toBeLessThan(.22); expect(roll).toBeLessThan(.15);
});
