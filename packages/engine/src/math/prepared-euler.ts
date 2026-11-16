type Point = readonly [number, number, number];
type Rotation = [number, number, number, number];

/** Prepare scalar coefficients for roll, then pitch, then yaw. This is the
 * unnormalised Math.sin/Math.cos operation order, not a matrix reassociation.
 * Returned functions retain only numbers and return a fresh owned tuple. They
 * deliberately propagate non-finite inputs just like the underlying arithmetic.
 */
export function prepareEulerPointRotation3D(yaw: number, pitch = 0, roll = 0) {
  const cr = Math.cos(roll), sr = Math.sin(roll), cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  return (input: Point): [number, number, number] => {
    const px = input[0] * cr - input[1] * sr, py = input[0] * sr + input[1] * cr, pz = input[2];
    const y = py * cp - pz * sp, z = py * sp + pz * cp;
    return [px * cy + z * sy, y, -px * sy + z * cy];
  };
}

/** Prepare a fixed pitch/roll, preserving the original quaternion expression
 * order for each variable yaw. Every result is independent mutable storage. */
export function prepareEulerQuaternion3D(pitch: number, roll = 0) {
  const sp = Math.sin(pitch / 2), cp = Math.cos(pitch / 2), c = Math.cos(roll / 2), s = Math.sin(roll / 2);
  return (yaw: number): Rotation => {
    const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2);
    const x = cy * sp, y = sy * cp, z = -sy * sp, w = cy * cp;
    return [x * c + y * s, y * c - x * s, z * c + w * s, w * c - z * s];
  };
}
