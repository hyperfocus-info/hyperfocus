import { expect, test } from 'bun:test';
import { createLocomotionClock, locomotionProfile, sampleLocomotion } from './locomotion.ts';
import { sampleArtMotion } from './motion.ts';

test('stopping freezes the last gait phase and style while the guard blends in', () => {
  const clock = createLocomotionClock();
  for (let tick = 0; tick < 60; tick++) clock.advance(.05, true);
  const running = clock.snapshot(), stopped = clock.advance(0, true);
  expect(stopped.cycle).toBe(running.cycle);
  expect(stopped.poseSpeed).toBe(running.poseSpeed);
  expect(stopped.speed).toBeLessThan(running.speed);
  expect(stopped.weight).toBeGreaterThan(.85);
  for (let tick = 0; tick < 90; tick++) clock.advance(0, true);
  expect(clock.snapshot().weight).toBeLessThan(.01);
});

test('jog cadence counts two steps per cycle and does not become a six-step shuffle', () => {
  for (const speed of [1.6, 2, 3]) expect(speed / locomotionProfile(speed).stride * 2).toBeLessThan(3.5);
  expect(locomotionProfile(3).stride).toBe(2);
});
test('constant-speed stance cancels root travel and swing clears the ground', () => {
  for (const speed of [1.6, 3]) {
    const { stride, stance } = locomotionProfile(speed);
    const a = sampleLocomotion({ cycle: .1, speed }), b = sampleLocomotion({ cycle: .1 + .02 / stride, speed });
    expect(a.leftFoot[2]).toBeCloseTo(b.leftFoot[2] + .02, 6);
    expect(a.leftFoot[1]).toBe(.1);
    expect(sampleLocomotion({ cycle: (stance + 1) / 2, speed }).leftFoot[1]).toBeGreaterThan(.19);
  }
});
test('collisions stop gait advancement and neutral studies actually move', () => {
  const clock = createLocomotionClock();
  for (let i = 0; i < 60; i++) clock.advance(.05, true);
  const moving = clock.snapshot();
  for (let i = 0; i < 60; i++) clock.advance(0, true);
  expect(clock.snapshot().cycle).toBe(moving.cycle);
  expect(clock.snapshot().weight).toBeLessThan(.001);
  const poses = [0, 10, 20, 30].map(frame => sampleArtMotion({ kind: 'walk', frame }));
  expect(new Set(poses.map(pose => pose.leftFoot.join(','))).size).toBe(4);
  expect(poses[0]!.left[2]).toBeLessThan(poses[0]!.right[2]);
});
