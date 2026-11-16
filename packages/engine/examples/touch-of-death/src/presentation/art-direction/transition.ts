import { solveArtArm, type ArtMotion } from './motion.ts';

type Point = [number, number, number];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const point = (a: Point, b: Point, t: number): Point => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
export function blendArtMotion(options: { from: ArtMotion; to: ArtMotion; weight: number }): ArtMotion {
  const { from, to, weight: t } = options;
  const a = from.head ?? { pitch: from.pitch, twist: from.twist, roll: from.roll ?? 0 };
  const b = to.head ?? { pitch: to.pitch, twist: to.twist, roll: to.roll ?? 0 };
  return { ...to, hip: point(from.hip, to.hip, t), left: point(from.left, to.left, t), right: point(from.right, to.right, t),
    leftFoot: point(from.leftFoot, to.leftFoot, t), rightFoot: point(from.rightFoot, to.rightFoot, t),
    pitch: mix(from.pitch, to.pitch, t), twist: mix(from.twist, to.twist, t), roll: mix(from.roll ?? 0, to.roll ?? 0, t),
    head: { pitch: mix(a.pitch, b.pitch, t), twist: mix(a.twist, b.twist, t), roll: mix(a.roll, b.roll, t) },
    ...(to.weapon ? { weapon: { ...to.weapon, axis: point(from.weapon?.axis ?? to.weapon.axis, to.weapon.axis, t), grip: mix(from.weapon?.grip ?? to.weapon.grip, to.weapon.grip, t), ...(to.weapon.chain ? { chain: point(from.weapon?.chain ?? to.weapon.chain, to.weapon.chain, t) } : {}), ...(to.weapon.follow ? { follow: point(from.weapon?.follow ?? to.weapon.follow, to.weapon.follow, t) } : {}) } } : {}),
    // Blend resolved elbows with wrists. Copying the destination's bend target
    // can flip an arm even while its wrist follows a continuous trajectory.
    elbows: {
      left: point(solveArtArm({ pose: from, side: 'left' }).joint, solveArtArm({ pose: to, side: 'left' }).joint, t),
      right: point(solveArtArm({ pose: from, side: 'right' }).joint, solveArtArm({ pose: to, side: 'right' }).joint, t),
    },
    feet: {
      leftPitch: mix(from.feet?.leftPitch ?? from.authored?.leftFootPitch ?? 0, to.feet?.leftPitch ?? to.authored?.leftFootPitch ?? 0, t),
      rightPitch: mix(from.feet?.rightPitch ?? from.authored?.rightFootPitch ?? 0, to.feet?.rightPitch ?? to.authored?.rightFootPitch ?? 0, t),
    } };
}

/** State changes blend once in simulation time. Repeated renders cannot advance a transition. */
export function createArtMotionTransition() {
  let last: ArtMotion | undefined, from: ArtMotion | undefined, key = '', started = 0, previousTick = -1;
  return {
    sample(options: { pose: ArtMotion; key: string; tick: number; frames: number; impact?: boolean }) {
      if (options.tick === previousTick && options.key === key && last) return last;
      if (options.key !== key) { from = last; key = options.key; started = options.tick; }
      previousTick = options.tick;
      const age = Math.max(0, options.tick - started), u = Math.min(1, age / Math.max(1, options.frames));
      const weight = (options.impact ? .8 : 0) + (options.impact ? .2 : 1) * u * u * (3 - 2 * u);
      last = from && weight < 1 ? blendArtMotion({ from, to: options.pose, weight }) : options.pose;
      return last;
    },
  };
}
