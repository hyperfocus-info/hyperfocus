import { normalizeVector3, quaternionFromUnitVectors, rotateVector3ByQuaternion, subtractVector3 } from '../math.ts';
import type { MutableMotionVector } from '../math.ts';

/** Reusable scratch storage. Each evaluation derives from its input pose, so seeking is order independent. */
export function createBendReferenceTransport() {
  const source = [0, 0, 0], target = [0, 0, 0], bend = [0, 0, 0], rotation = [0, 0, 0, 1];
  return {
    /** All points share a coordinate frame. A straight source uses the caller's calibrated fallback. */
    apply(options: { root: ArrayLike<number>; middle: ArrayLike<number>; end: ArrayLike<number>; targetDirection: ArrayLike<number>; fallback: ArrayLike<number> }, out: MutableMotionVector) {
      subtractVector3(options.end, options.root, source);
      subtractVector3(options.middle, options.root, bend);
      normalizeVector3(source, source); normalizeVector3(options.targetDirection, target);
      const along = bend[0]! * source[0]! + bend[1]! * source[1]! + bend[2]! * source[2]!;
      for (let i = 0; i < 3; i++) bend[i] -= along * source[i]!;
      const usable = Math.hypot(...bend) > 1e-6;
      if (usable) {
        normalizeVector3(bend, bend);
        const dot = source[0]! * target[0]! + source[1]! * target[1]! + source[2]! * target[2]!;
        // A reversed reach has no unique shortest transport. Keep the authored plane there.
        if (dot > -.9999) { quaternionFromUnitVectors(source, target, rotation); rotateVector3ByQuaternion(bend, rotation, bend); }
      } else for (let i = 0; i < 3; i++) bend[i] = options.fallback[i]!;
      const projection = bend[0]! * target[0]! + bend[1]! * target[1]! + bend[2]! * target[2]!;
      for (let i = 0; i < 3; i++) out[i] = bend[i]! - projection * target[i]!;
      if (Math.hypot(...out) < 1e-8) throw Error('Arm reference has no usable bend plane; supply a calibrated bend direction.');
      normalizeVector3(out, out);
      return usable;
    },
  };
}
