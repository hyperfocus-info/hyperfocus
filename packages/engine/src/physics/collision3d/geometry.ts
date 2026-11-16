import { clamp01 as clampUnit } from "@hyperfocus/utilities/math";
import type { Vec3Input } from "../3d.ts";

export type Point3 = readonly [number, number, number];
/** Keeps sixth-order distance intermediates within finite Number arithmetic. */
export const MAX_QUERY_MAGNITUDE_3D = 1e30;
export function queryCoordinate(value: number) {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_QUERY_MAGNITUDE_3D) throw new RangeError('collision coordinates must be finite and within +/-1e30');
  return value;
}
export function point(value: Vec3Input): Point3 {
  const result: Point3 = "x" in value ? [value.x, value.y, value.z] : [value[0], value[1], value[2]];
  for (const coordinate of result) queryCoordinate(coordinate);
  return result;
}
export function subtract(a: Point3, b: Point3): Point3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function dot(a: Point3, b: Point3) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function cross(a: Point3, b: Point3): Point3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function along(a: Point3, direction: Point3, t: number): Point3 {
  return [a[0] + direction[0] * t, a[1] + direction[1] * t, a[2] + direction[2] * t];
}
export function distanceSquared(a: Point3, b: Point3) { const delta = subtract(a, b); return dot(delta, delta); }
export { clamp01 as clampUnit } from "@hyperfocus/utilities/math";
export function pointSegmentDistance(p: Point3, a: Point3, b: Point3) {
  const delta = subtract(b, a), length = dot(delta, delta);
  return distanceSquared(p, along(a, delta, length === 0 ? 0 : clampUnit(dot(subtract(p, a), delta) / length)));
}
export function segmentDistance(a: Point3, b: Point3, c: Point3, d: Point3) {
  const u = subtract(b, a), v = subtract(d, c), w = subtract(a, c);
  const uu = dot(u, u), vv = dot(v, v), uv = dot(u, v), uw = dot(u, w), vw = dot(v, w);
  if (uu === 0) return pointSegmentDistance(a, c, d);
  if (vv === 0) return pointSegmentDistance(c, a, b);
  const denominator = uu * vv - uv * uv;
  let s = denominator > 0 ? clampUnit((uv * vw - vv * uw) / denominator) : 0;
  let t = (uv * s + vw) / vv;
  if (t < 0) { t = 0; s = clampUnit(-uw / uu); }
  else if (t > 1) { t = 1; s = clampUnit((uv - uw) / uu); }
  return distanceSquared(along(a, u, s), along(c, v, t));
}
export function pointTriangleDistance(p: Point3, a: Point3, b: Point3, c: Point3) {
  const ab = subtract(b, a), ac = subtract(c, a), normal = cross(ab, ac), nn = dot(normal, normal);
  if (nn > 0) {
    const signed = dot(subtract(p, a), normal), projected = along(p, normal, -signed / nn);
    if (dot(cross(ab, subtract(projected, a)), normal) >= 0
      && dot(cross(subtract(c, b), subtract(projected, b)), normal) >= 0
      && dot(cross(subtract(a, c), subtract(projected, c)), normal) >= 0) return signed * signed / nn;
  }
  return Math.min(pointSegmentDistance(p, a, b), pointSegmentDistance(p, b, c), pointSegmentDistance(p, c, a));
}
export function rayTriangle(origin: Point3, direction: Point3, a: Point3, b: Point3, c: Point3) {
  const ab = subtract(b, a), ac = subtract(c, a), p = cross(direction, ac), determinant = dot(ab, p);
  if (determinant === 0) return null;
  const offset = subtract(origin, a), u = dot(offset, p) / determinant;
  if (u < 0 || u > 1) return null;
  const q = cross(offset, ab), v = dot(direction, q) / determinant;
  if (v < 0 || u + v > 1) return null;
  const t = dot(ac, q) / determinant;
  return t >= 0 ? t : null;
}
export function segmentTriangleDistance(p: Point3, q: Point3, a: Point3, b: Point3, c: Point3) {
  const t = rayTriangle(p, subtract(q, p), a, b, c);
  if (t !== null && t <= 1) return 0;
  return Math.min(pointTriangleDistance(p, a, b, c), pointTriangleDistance(q, a, b, c),
    segmentDistance(p, q, a, b), segmentDistance(p, q, b, c), segmentDistance(p, q, c, a));
}
