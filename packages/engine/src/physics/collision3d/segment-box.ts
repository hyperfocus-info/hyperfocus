import type { Point3 } from './geometry.ts';

/** Exact segment-to-solid-box distance, minimizing each piece of its convex quadratic. */
export function segmentBoxDistance(a: Point3, b: Point3, half: Point3) {
  const cuts = [0, 1];
  const delta = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  for (let axis = 0; axis < 3; axis += 1) {
    if (delta[axis] === 0) continue;
    for (const side of [-half[axis], half[axis]]) {
      const t = (side - a[axis]) / delta[axis];
      if (t > 0 && t < 1) cuts.push(t);
    }
  }
  cuts.sort((x, y) => x - y);
  let best = Infinity;
  function evaluate(t: number) {
    let distance = 0;
    for (let axis = 0; axis < 3; axis += 1) distance += Math.max(0, Math.abs(a[axis] + delta[axis] * t) - half[axis]) ** 2;
    best = Math.min(best, distance);
  }
  for (let index = 1; index < cuts.length; index += 1) {
    const low = cuts[index - 1], high = cuts[index], middle = (low + high) / 2;
    let numerator = 0, denominator = 0;
    for (let axis = 0; axis < 3; axis += 1) {
      const position = a[axis] + delta[axis] * middle;
      if (Math.abs(position) <= half[axis]) continue;
      numerator += delta[axis] * (a[axis] - Math.sign(position) * half[axis]);
      denominator += delta[axis] ** 2;
    }
    evaluate(low); evaluate(high);
    if (denominator > 0) evaluate(Math.max(low, Math.min(high, -numerator / denominator)));
  }
  return best;
}
