import { hypot, sqrt } from '../../math/simulation.ts';
type Sweep = { time: number; normalX: number; normalY: number; normalZ: number };

/** Exact rounded-box sweep: each slab crossing starts a quadratic distance interval. */
export function refineSphereBoxSweep(origin: number[], delta: number[], halfX: number, halfY: number, halfZ: number, radius: number, output: Sweep): boolean {
  let start = output.time;
  for (let interval = 0; interval < 8 && start <= 1; interval++) {
    let end = 1, a = 0, b = 0, c = -radius * radius;
    for (let axis = 0; axis < 3; axis++) {
      const extent = axis === 0 ? halfX : axis === 1 ? halfY : halfZ;
      const p = origin[axis]!, v = delta[axis]!;
      if (v !== 0) for (let side = -1; side <= 1; side += 2) {
        const crossing = (side * extent - p) / v;
        if (crossing > start + 1e-12 && crossing < end) end = crossing;
      }
      const at = p + v * (start + 1e-12);
      const offset = at < -extent ? p + extent : at > extent ? p - extent : 0;
      if (at < -extent || at > extent) { a += v * v; b += 2 * offset * v; c += offset * offset; }
    }
    let time = Number.POSITIVE_INFINITY;
    if (a * start * start + b * start + c <= 1e-12) time = start;
    else if (a > 0) {
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) time = (-b - sqrt(discriminant)) / (2 * a);
    }
    if (time >= start - 1e-10 && time <= end + 1e-10) {
      const x = origin[0]! + delta[0]! * time, y = origin[1]! + delta[1]! * time, z = origin[2]! + delta[2]! * time;
      const nx = x - Math.max(-halfX, Math.min(halfX, x)), ny = y - Math.max(-halfY, Math.min(halfY, y)), nz = z - Math.max(-halfZ, Math.min(halfZ, z));
      const length = hypot(nx, ny, nz);
      if (length === 0) return false;
      output.time = Math.max(start, Math.min(end, time));
      output.normalX = nx / length; output.normalY = ny / length; output.normalZ = nz / length;
      return true;
    }
    if (end === 1) return false;
    start = end;
  }
  return false;
}
