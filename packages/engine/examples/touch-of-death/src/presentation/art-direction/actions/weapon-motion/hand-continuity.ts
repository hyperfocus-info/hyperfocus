import type { ArtMotion } from '../../motion.ts';

const reflect = ([x, y, z]: [number, number, number]): [number, number, number] => [-x, y, z];
function mirror(pose: ArtMotion): ArtMotion {
  const weapon = pose.weapon!;
  return { ...pose, hip: reflect(pose.hip), twist: -pose.twist, roll: -(pose.roll ?? 0),
    left: reflect(pose.right), right: reflect(pose.left), leftFoot: reflect(pose.rightFoot), rightFoot: reflect(pose.leftFoot),
    ...(pose.head ? { head: { ...pose.head, twist: -pose.head.twist, roll: -pose.head.roll } } : {}),
    ...(pose.elbows ? { elbows: { left: reflect(pose.elbows.right), right: reflect(pose.elbows.left) } } : {}),
    ...(pose.feet ? { feet: { leftPitch: pose.feet.rightPitch, rightPitch: pose.feet.leftPitch } } : {}),
    ...(pose.authored ? { authored: { ...pose.authored, leftElbow: reflect(pose.authored.rightElbow), rightElbow: reflect(pose.authored.leftElbow),
      leftKnee: reflect(pose.authored.rightKnee), rightKnee: reflect(pose.authored.leftKnee),
      leftKneePole: pose.authored.rightKneePole ? reflect(pose.authored.rightKneePole) : undefined,
      rightKneePole: pose.authored.leftKneePole ? reflect(pose.authored.leftKneePole) : undefined,
      leftFootPitch: pose.authored.rightFootPitch, rightFootPitch: pose.authored.leftFootPitch } } : {}),
    weapon: { ...weapon, hand: weapon.hand === 'left' ? 'right' : 'left', axis: reflect(weapon.axis),
      ...(weapon.chain ? { chain: reflect(weapon.chain) } : {}), ...(weapon.follow ? { follow: reflect(weapon.follow) } : {}) },
  };
}

/** Interruptions start with the held handle; a new move cannot reset it to the other fist. */
export function createFlexibleHandContinuity() {
  let key = '', mirrored = false, hand: 'left' | 'right' = 'right';
  return {
    reset() { key = ''; mirrored = false; hand = 'right'; },
    sample(nextKey: string, pose: ArtMotion) {
      if (!pose.weapon) return pose;
      if (nextKey !== key) { mirrored = hand === 'left'; key = nextKey; }
      const next = mirrored ? mirror(pose) : pose;
      hand = next.weapon?.hand ?? 'right';
      return next;
    },
  };
}
