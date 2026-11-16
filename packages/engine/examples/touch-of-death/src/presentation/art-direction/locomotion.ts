import { smoothstep01 as smooth } from "@hyperfocus/utilities/math";

type Point = [number, number, number];



/** A cycle is two steps. The rejected .9m cycle produced over six steps/second. */
export function locomotionProfile(speed: number) {
  const run = smooth((speed - 1.7) / 1.3);
  return { run, stride: 1.25 + .75 * run, stance: .62 - .20 * run };
}

export function sampleLocomotion(options: { cycle: number; speed: number }) {
  const { run, stride, stance } = locomotionProfile(options.speed);
  const phase = ((options.cycle % 1) + 1) % 1;
  const foot = (offset: number, side: number): Point => {
    const t = (phase + offset) % 1, reach = stride * stance / 2;
    if (t < stance) return [side * .145, .10, reach - t * stride];
    const u = (t - stance) / (1 - stance), u2 = u * u, u3 = u2 * u;
    // Hermite end tangents match backward stance velocity: no forward landing skid.
    const tangent = -stride * (1 - stance);
    const z = (2 * u3 - 3 * u2 + 1) * -reach + (u3 - 2 * u2 + u) * tangent + (-2 * u3 + 3 * u2) * reach + (u3 - u2) * tangent;
    return [side * .145, .10 + Math.sin(u * Math.PI) ** 1.2 * (.10 + run * .16), z];
  };
  const swing = Math.cos(phase * Math.PI * 2), bounce = Math.cos(phase * Math.PI * 4);
  const arm = (side: number, forward: number): Point => [side * .265, 1.12 + forward * (.12 + .16 * run), .025 + forward * (.23 + .12 * run)];
  const hip: Point = [0, .956 - run * .031 + bounce * (.009 + .022 * run), .025 * run];
  return {
    hip,
    pitch: .065 + .12 * run, twist: swing * (.065 + .045 * run),
    left: arm(-1, (1 - swing) / 2), right: arm(1, (1 + swing) / 2),
    leftFoot: foot(0, -1), rightFoot: foot(.5, 1), phase: 'locomotion',
  };
}

/** Advance once per simulation tick from actual displacement, including collision stops. */
export function createLocomotionClock(strideForSpeed = (value: number) => locomotionProfile(value).stride) {
  let cycle = 0, speed = 0, weight = 0, poseSpeed = 0;
  return {
    advance(distance: number, enabled: boolean) {
      const target = enabled ? distance * 60 : 0;
      speed += (target - speed) * .24;
      const moving = target > .12;
      if (moving) poseSpeed = speed;
      // Keep the last gait during stopping instead of changing gait and guard together.
      weight += ((moving ? 1 : 0) - weight) * (moving ? .22 : .12);
      if (enabled) cycle += distance / strideForSpeed(poseSpeed);
      return { cycle, speed, weight, poseSpeed };
    },
    snapshot: () => ({ cycle, speed, weight, poseSpeed }),
  };
}
