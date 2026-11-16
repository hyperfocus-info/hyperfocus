import { segmentBoxDistance } from './segment-box.ts';
import { cos, sin } from '../../math/simulation.ts';
import type { Physics3DBoxCollider, Physics3DCapsuleCollider, Physics3DSphereCollider, Vec3Input } from "../3d.ts";
import { MAX_QUERY_MAGNITUDE_3D, point, pointSegmentDistance, segmentTriangleDistance, type Point3 } from "./geometry.ts";

export function capsuleRadius(radius: number) {
  if (!Number.isFinite(radius) || radius < 0 || radius > MAX_QUERY_MAGNITUDE_3D) throw new RangeError("capsule radius must be finite, non-negative and at most 1e30");
  return radius;
}
export function capsuleIntersectsSphere3D(options: { capsule: Physics3DCapsuleCollider; sphere: Physics3DSphereCollider }) {
  const radius = capsuleRadius(options.capsule.radius) + capsuleRadius(options.sphere.radius);
  return pointSegmentDistance(point(options.sphere.center), point(options.capsule.a), point(options.capsule.b)) <= radius * radius;
}
export function capsuleIntersectsTriangle3D(options: { capsule: Physics3DCapsuleCollider; a: Vec3Input; b: Vec3Input; c: Vec3Input }) {
  const radius = capsuleRadius(options.capsule.radius);
  return segmentTriangleDistance(point(options.capsule.a), point(options.capsule.b), point(options.a), point(options.b), point(options.c)) <= radius * radius;
}

export function capsuleIntersectsBox3D(options: { capsule: Physics3DCapsuleCollider; box: Physics3DBoxCollider }) {
  const radius = capsuleRadius(options.capsule.radius), center = point(options.box.center), half = point(options.box.halfSize);
  if (half.some((value) => value < 0)) throw new RangeError("box half sizes must be non-negative");
  const yaw = options.box.rotationY ?? 0;
  if (!Number.isFinite(yaw)) throw new RangeError("box rotation must be finite");
  const cosine = cos(yaw), sine = sin(yaw);
  function local(value: Vec3Input): Point3 {
    const p = point(value), x = p[0] - center[0], z = p[2] - center[2];
    return [cosine * x + sine * z, p[1] - center[1], -sine * x + cosine * z];
  }
  return segmentBoxDistance(local(options.capsule.a), local(options.capsule.b), half) <= radius * radius;
}
