import type {
  HeightField3D,
  Physics3DCollider,
  Physics3DVerticalRange,
  Physics3DWaterVolume,
  PlaceOnGround3DOptions,
  Vec3,
  Vec3ArrayLike,
  Vec3Input,
} from "./3d.ts";

type CircleFootprint = {
  kind: "circle";
  x: number;
  z: number;
  radius: number;
};

type SegmentFootprint = {
  kind: "segment";
  ax: number;
  az: number;
  bx: number;
  bz: number;
  radius: number;
};

type BoxFootprint = {
  kind: "box";
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  rotationY: number;
};

type Footprint = CircleFootprint | SegmentFootprint | BoxFootprint;

export function colliderVerticalRange(collider: Physics3DCollider): Physics3DVerticalRange {
  switch (collider.kind) {
    case "sphere": {
      const radius = nonNegative(collider.radius, "sphere radius");
      const y = vecY(collider.center);
      return { minY: y - radius, maxY: y + radius };
    }
    case "cylinder": {
      const half = nonNegative(collider.height, "cylinder height") * 0.5;
      const y = vecY(collider.center);
      return { minY: y - half, maxY: y + half };
    }
    case "box": {
      const y = vecY(collider.center);
      const halfY = nonNegative(vecY(collider.halfSize), "box halfSize.y");
      return { minY: y - halfY, maxY: y + halfY };
    }
    case "capsule": {
      const radius = nonNegative(collider.radius, "capsule radius");
      return {
        minY: Math.min(vecY(collider.a), vecY(collider.b)) - radius,
        maxY: Math.max(vecY(collider.a), vecY(collider.b)) + radius
      };
    }
  }
}

export function verticalRangesOverlap(
  a: Physics3DVerticalRange,
  b: Physics3DVerticalRange,
  padding = 0
): boolean {
  const pad = Math.max(0, finiteOr(padding, 0));
  return a.minY <= b.maxY + pad && a.maxY >= b.minY - pad;
}

export function collidersOverlap3D(a: Physics3DCollider, b: Physics3DCollider, padding = 0): boolean {
  const pad = Math.max(0, finiteOr(padding, 0));
  if (!verticalRangesOverlap(colliderVerticalRange(a), colliderVerticalRange(b), pad)) return false;
  return footprintsOverlap(colliderFootprint(a), colliderFootprint(b), pad);
}

export function submersionRatio(collider: Physics3DCollider, water: number | Physics3DWaterVolume): number {
  const range = colliderVerticalRange(collider);
  const height = Math.max(EPSILON, range.maxY - range.minY);
  const waterMinY = typeof water === "number" ? range.minY : (water.minY ?? Number.NEGATIVE_INFINITY);
  const waterMaxY = typeof water === "number" ? water : water.maxY;
  const submerged = Math.max(0, Math.min(range.maxY, waterMaxY) - Math.max(range.minY, waterMinY));
  return clamp01(submerged / height);
}

export function isFullySubmerged(collider: Physics3DCollider, water: number | Physics3DWaterVolume, epsilon = 1e-6): boolean {
  return submersionRatio(collider, water) >= 1 - Math.max(0, finiteOr(epsilon, 0));
}

export function groundYAt(field: HeightField3D, x: number, z: number): number {
  const y = field.heightAt(assertFinite(x, "height field x"), assertFinite(z, "height field z"));
  return assertFinite(y, "height field y");
}

export function placeOnGround3D(position: Vec3Input, field: HeightField3D, options: PlaceOnGround3DOptions = {}): Vec3 {
  const out = options.out ?? vec3();
  out.x = vecX(position);
  out.z = vecZ(position);
  out.y = groundYAt(field, out.x, out.z) + finiteOr(options.yOffset, 0);
  return out;
}

function colliderFootprint(collider: Physics3DCollider): Footprint {
  switch (collider.kind) {
    case "sphere":
      return { kind: "circle", x: vecX(collider.center), z: vecZ(collider.center), radius: nonNegative(collider.radius, "sphere radius") };
    case "cylinder":
      return { kind: "circle", x: vecX(collider.center), z: vecZ(collider.center), radius: nonNegative(collider.radius, "cylinder radius") };
    case "box":
      return {
        kind: "box",
        x: vecX(collider.center),
        z: vecZ(collider.center),
        halfX: nonNegative(vecX(collider.halfSize), "box halfSize.x"),
        halfZ: nonNegative(vecZ(collider.halfSize), "box halfSize.z"),
        rotationY: finiteOr(collider.rotationY, 0)
      };
    case "capsule":
      return {
        kind: "segment",
        ax: vecX(collider.a),
        az: vecZ(collider.a),
        bx: vecX(collider.b),
        bz: vecZ(collider.b),
        radius: nonNegative(collider.radius, "capsule radius")
      };
  }
}

function footprintsOverlap(a: Footprint, b: Footprint, padding: number): boolean {
  if (a.kind === "circle" && b.kind === "circle") return circleCircleOverlap(a, b, padding);
  if (a.kind === "circle" && b.kind === "segment") return pointSegmentDistanceSq(a.x, a.z, b.ax, b.az, b.bx, b.bz) <= square(a.radius + b.radius + padding);
  if (a.kind === "segment" && b.kind === "circle") return footprintsOverlap(b, a, padding);
  if (a.kind === "segment" && b.kind === "segment") return segmentSegmentDistanceSq(a, b) <= square(a.radius + b.radius + padding);
  if (a.kind === "circle" && b.kind === "box") return circleBoxOverlap(a, b, padding);
  if (a.kind === "box" && b.kind === "circle") return circleBoxOverlap(b, a, padding);
  if (a.kind === "box" && b.kind === "box") return boxBoxOverlap(a, b, padding);
  if (a.kind === "segment" && b.kind === "box") return segmentBoxOverlap(a, b, padding);
  if (a.kind === "box" && b.kind === "segment") return segmentBoxOverlap(b, a, padding);
  return false;
}

function circleCircleOverlap(a: CircleFootprint, b: CircleFootprint, padding: number) {
  return square(a.x - b.x) + square(a.z - b.z) <= square(a.radius + b.radius + padding);
}

function circleBoxOverlap(circle: CircleFootprint, box: BoxFootprint, padding: number) {
  const local = toBoxLocal(circle.x, circle.z, box);
  const nearX = clamp(local.x, -box.halfX, box.halfX);
  const nearZ = clamp(local.z, -box.halfZ, box.halfZ);
  return square(local.x - nearX) + square(local.z - nearZ) <= square(circle.radius + padding);
}

function segmentBoxOverlap(segment: SegmentFootprint, box: BoxFootprint, padding: number) {
  const a = toBoxLocal(segment.ax, segment.az, box);
  const b = toBoxLocal(segment.bx, segment.bz, box);
  return segmentAabbDistanceSq(
    a.x,
    a.z,
    b.x,
    b.z,
    -box.halfX,
    -box.halfZ,
    box.halfX,
    box.halfZ
  ) <= square(segment.radius + padding);
}

function boxBoxOverlap(a: BoxFootprint, b: BoxFootprint, padding: number) {
  const axes = [...boxAxes(a), ...boxAxes(b)];
  const cornersA = boxCorners(a, padding);
  const cornersB = boxCorners(b);
  for (const axis of axes) {
    const rangeA = projectPoints(cornersA, axis);
    const rangeB = projectPoints(cornersB, axis);
    if (rangeA.max < rangeB.min || rangeB.max < rangeA.min) return false;
  }
  return true;
}

function boxAxes(box: BoxFootprint) {
  const c = Math.cos(box.rotationY);
  const s = Math.sin(box.rotationY);
  return [
    { x: c, z: s },
    { x: -s, z: c }
  ];
}

function boxCorners(box: BoxFootprint, padding = 0) {
  const axes = boxAxes(box);
  const halfX = box.halfX + padding;
  const halfZ = box.halfZ + padding;
  return [
    { x: box.x + axes[0].x * halfX + axes[1].x * halfZ, z: box.z + axes[0].z * halfX + axes[1].z * halfZ },
    { x: box.x + axes[0].x * halfX - axes[1].x * halfZ, z: box.z + axes[0].z * halfX - axes[1].z * halfZ },
    { x: box.x - axes[0].x * halfX + axes[1].x * halfZ, z: box.z - axes[0].z * halfX + axes[1].z * halfZ },
    { x: box.x - axes[0].x * halfX - axes[1].x * halfZ, z: box.z - axes[0].z * halfX - axes[1].z * halfZ }
  ];
}

function projectPoints(points: Array<{ x: number; z: number }>, axis: { x: number; z: number }) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const value = point.x * axis.x + point.z * axis.z;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

function toBoxLocal(x: number, z: number, box: BoxFootprint) {
  const dx = x - box.x;
  const dz = z - box.z;
  const c = Math.cos(box.rotationY);
  const s = Math.sin(box.rotationY);
  return { x: dx * c + dz * s, z: -dx * s + dz * c };
}

function segmentAabbOverlap(ax: number, az: number, bx: number, bz: number, minX: number, minZ: number, maxX: number, maxZ: number) {
  if (pointInAabb(ax, az, minX, minZ, maxX, maxZ) || pointInAabb(bx, bz, minX, minZ, maxX, maxZ)) return true;
  return segmentsIntersect(ax, az, bx, bz, minX, minZ, maxX, minZ)
    || segmentsIntersect(ax, az, bx, bz, maxX, minZ, maxX, maxZ)
    || segmentsIntersect(ax, az, bx, bz, maxX, maxZ, minX, maxZ)
    || segmentsIntersect(ax, az, bx, bz, minX, maxZ, minX, minZ);
}

function segmentAabbDistanceSq(ax: number, az: number, bx: number, bz: number, minX: number, minZ: number, maxX: number, maxZ: number) {
  if (segmentAabbOverlap(ax, az, bx, bz, minX, minZ, maxX, maxZ)) return 0;
  const segment: SegmentFootprint = { kind: "segment", ax, az, bx, bz, radius: 0 };
  const edges: SegmentFootprint[] = [
    { kind: "segment", ax: minX, az: minZ, bx: maxX, bz: minZ, radius: 0 },
    { kind: "segment", ax: maxX, az: minZ, bx: maxX, bz: maxZ, radius: 0 },
    { kind: "segment", ax: maxX, az: maxZ, bx: minX, bz: maxZ, radius: 0 },
    { kind: "segment", ax: minX, az: maxZ, bx: minX, bz: minZ, radius: 0 }
  ];
  let distanceSq = Number.POSITIVE_INFINITY;
  for (const edge of edges) distanceSq = Math.min(distanceSq, segmentSegmentDistanceSq(segment, edge));
  return distanceSq;
}

function pointInAabb(x: number, z: number, minX: number, minZ: number, maxX: number, maxZ: number) {
  return x >= minX && x <= maxX && z >= minZ && z <= maxZ;
}

function segmentSegmentDistanceSq(a: SegmentFootprint, b: SegmentFootprint) {
  if (segmentsIntersect(a.ax, a.az, a.bx, a.bz, b.ax, b.az, b.bx, b.bz)) return 0;
  return Math.min(
    pointSegmentDistanceSq(a.ax, a.az, b.ax, b.az, b.bx, b.bz),
    pointSegmentDistanceSq(a.bx, a.bz, b.ax, b.az, b.bx, b.bz),
    pointSegmentDistanceSq(b.ax, b.az, a.ax, a.az, a.bx, a.bz),
    pointSegmentDistanceSq(b.bx, b.bz, a.ax, a.az, a.bx, a.bz)
  );
}

function pointSegmentDistanceSq(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= EPSILON) return square(px - ax) + square(pz - az);
  const t = clamp01(((px - ax) * dx + (pz - az) * dz) / lengthSq);
  return square(px - (ax + dx * t)) + square(pz - (az + dz * t));
}

function segmentsIntersect(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) {
  const d1 = direction(cx, cz, dx, dz, ax, az);
  const d2 = direction(cx, cz, dx, dz, bx, bz);
  const d3 = direction(ax, az, bx, bz, cx, cz);
  const d4 = direction(ax, az, bx, bz, dx, dz);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return d1 === 0 && onSegment(cx, cz, dx, dz, ax, az)
    || d2 === 0 && onSegment(cx, cz, dx, dz, bx, bz)
    || d3 === 0 && onSegment(ax, az, bx, bz, cx, cz)
    || d4 === 0 && onSegment(ax, az, bx, bz, dx, dz);
}

function direction(ax: number, az: number, bx: number, bz: number, px: number, pz: number) {
  return (px - ax) * (bz - az) - (pz - az) * (bx - ax);
}

function onSegment(ax: number, az: number, bx: number, bz: number, px: number, pz: number) {
  return px >= Math.min(ax, bx) - EPSILON && px <= Math.max(ax, bx) + EPSILON
    && pz >= Math.min(az, bz) - EPSILON && pz <= Math.max(az, bz) + EPSILON;
}

const EPSILON = 1e-9;

function vec3(x = 0, y = 0, z = 0) { return { x, y, z }; }
function vecX(value: Vec3Input) { return isVec3Tuple(value) ? assertFinite(value[0], "vec3 x") : assertFinite(value.x, "vec3 x"); }
function vecY(value: Vec3Input) { return isVec3Tuple(value) ? assertFinite(value[1], "vec3 y") : assertFinite(value.y, "vec3 y"); }
function vecZ(value: Vec3Input) { return isVec3Tuple(value) ? assertFinite(value[2], "vec3 z") : assertFinite(value.z, "vec3 z"); }
function isVec3Tuple(value: Vec3Input): value is Vec3ArrayLike { return Array.isArray(value) || ArrayBuffer.isView(value); }
function finiteOr(value: unknown, fallback: number) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function assertFinite(value: unknown, label: string) { const number = Number(value); if (!Number.isFinite(number)) throw new Error(`${label} must be finite`); return number; }
function nonNegative(value: unknown, label: string) { return Math.max(0, assertFinite(value, label)); }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function clamp01(value: number) { return clamp(finiteOr(value, 0), 0, 1); }
function square(value: number) { return value * value; }
