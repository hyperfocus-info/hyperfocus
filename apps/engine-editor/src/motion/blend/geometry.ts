export type Point = readonly [number, number];

export function signedArea(a: Point, b: Point, c: Point) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

export const MESH_AREA_EPSILON = 1e-8;

/** Positive triangle area for the whole continuous interpolation, not just samples. */
export function minimumMovingArea(from: readonly Point[], to: readonly Point[]) {
  const start = signedArea(from[0]!, from[1]!, from[2]!);
  const end = signedArea(to[0]!, to[1]!, to[2]!);
  const middle = from.map((p, i): Point => [(p[0] + to[i]![0]) / 2, (p[1] + to[i]![1]) / 2]);
  const half = signedArea(middle[0]!, middle[1]!, middle[2]!);
  const a = 2 * (end + start - 2 * half), b = end - start - a;
  const critical = a > 0 ? -b / (2 * a) : -1;
  return Math.min(start, end, critical > 0 && critical < 1 ? a * critical * critical + b * critical + start : start);
}
