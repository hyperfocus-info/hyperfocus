

import type { PhysicsShape2D } from "./2d.ts";

export const PHYSICS_DEBUG_SEGMENT_STRIDE = 5;
export const PHYSICS_DEBUG_STATIC = 0;
export const PHYSICS_DEBUG_DYNAMIC = 1;
export const PHYSICS_DEBUG_KINEMATIC = 2;
export const PHYSICS_DEBUG_TRIGGER = 3;
export const PHYSICS_DEBUG_CONTACT = 4;
export const PHYSICS_DEBUG_JOINT = 5;

export const BODY_STATIC = 0;
export const BODY_DYNAMIC = 1;
export const BODY_KINEMATIC = 2;
export const SHAPE_BOX = 0;
export const SHAPE_CIRCLE = 1;
export const DEFAULT_LAYER = 1;
export const DEFAULT_MASK = 0xffff_ffff;
export const POSITION_SLOP = 0.0001;
export const POSITION_PERCENT = 0.8;
export const CONTINUOUS_EPSILON = 1e-7;
export const BOX_CORNER_X = [-1, 1, 1, -1] as const;
export const BOX_CORNER_Y = [-1, -1, 1, 1] as const;

export type CollisionResult = { normalX: number; normalY: number; penetration: number; pointX: number; pointY: number };

export function validateShape(shape: PhysicsShape2D): PhysicsShape2D {
  if (shape.kind === "box") {
    return { kind: "box", halfWidth: positive(shape.halfWidth, "halfWidth"), halfHeight: positive(shape.halfHeight, "halfHeight") };
  }
  if (shape.kind === "circle") return { kind: "circle", radius: positive(shape.radius, "radius") };
  throw new TypeError(`Unsupported 2D physics shape: ${String(Reflect.get(shape, "kind"))}`);
}

export function sweepPointAgainstBox(
  originX: number,
  originY: number,
  deltaX: number,
  deltaY: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
) {
  if (originX > minX && originX < maxX && originY > minY && originY < maxY) return undefined;
  let nearX = -Infinity;
  let farX = Infinity;
  if (deltaX === 0) {
    if (originX < minX || originX > maxX) return undefined;
  } else {
    nearX = (minX - originX) / deltaX;
    farX = (maxX - originX) / deltaX;
    if (nearX > farX) [nearX, farX] = [farX, nearX];
  }
  let nearY = -Infinity;
  let farY = Infinity;
  if (deltaY === 0) {
    if (originY < minY || originY > maxY) return undefined;
  } else {
    nearY = (minY - originY) / deltaY;
    farY = (maxY - originY) / deltaY;
    if (nearY > farY) [nearY, farY] = [farY, nearY];
  }
  const near = Math.max(nearX, nearY);
  const far = Math.min(farX, farY);
  if (near > far || far < 0 || near < 0 || near > 1) return undefined;
  if (nearX > nearY) return { time: near, normalX: deltaX > 0 ? -1 : 1, normalY: 0 };
  return { time: near, normalX: 0, normalY: deltaY > 0 ? -1 : 1 };
}

export function rayBox(
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  maximum: number,
  centerX: number,
  centerY: number,
  halfWidth: number,
  halfHeight: number,
  output: Float32Array | Float64Array,
) {
  const minX = centerX - halfWidth;
  const maxX = centerX + halfWidth;
  const minY = centerY - halfHeight;
  const maxY = centerY + halfHeight;
  if (originX >= minX && originX <= maxX && originY >= minY && originY <= maxY) {
    output[0] = 0;
    output[1] = -directionX;
    output[2] = -directionY;
    return true;
  }
  let nearX = -Infinity;
  let farX = Infinity;
  if (directionX === 0) {
    if (originX < minX || originX > maxX) return false;
  } else {
    nearX = (minX - originX) / directionX;
    farX = (maxX - originX) / directionX;
    if (nearX > farX) [nearX, farX] = [farX, nearX];
  }
  let nearY = -Infinity;
  let farY = Infinity;
  if (directionY === 0) {
    if (originY < minY || originY > maxY) return false;
  } else {
    nearY = (minY - originY) / directionY;
    farY = (maxY - originY) / directionY;
    if (nearY > farY) [nearY, farY] = [farY, nearY];
  }
  const near = Math.max(nearX, nearY);
  if (near < 0 || near > maximum || near > Math.min(farX, farY)) return false;
  output[0] = near;
  if (nearX > nearY) {
    output[1] = directionX > 0 ? -1 : 1;
    output[2] = 0;
  } else {
    output[1] = 0;
    output[2] = directionY > 0 ? -1 : 1;
  }
  return true;
}

export function rayCircle(
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  maximum: number,
  centerX: number,
  centerY: number,
  radius: number,
  output: Float32Array | Float64Array,
) {
  const offsetX = originX - centerX;
  const offsetY = originY - centerY;
  const inside = offsetX * offsetX + offsetY * offsetY <= radius * radius;
  if (inside) {
    output[0] = 0;
    output[1] = -directionX;
    output[2] = -directionY;
    return true;
  }
  const projection = offsetX * directionX + offsetY * directionY;
  const discriminant = projection * projection - (offsetX * offsetX + offsetY * offsetY - radius * radius);
  if (discriminant < 0) return false;
  const distance = -projection - Math.sqrt(discriminant);
  if (distance < 0 || distance > maximum) return false;
  const hitX = originX + directionX * distance;
  const hitY = originY + directionY * distance;
  output[0] = distance;
  output[1] = (hitX - centerX) / radius;
  output[2] = (hitY - centerY) / radius;
  return true;
}

export function finite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}

export function positive(value: number, label: string) {
  const checked = finite(value, label);
  if (checked <= 0) throw new RangeError(`${label} must be greater than zero`);
  return checked;
}

export function nonnegative(value: number, label: string) {
  const checked = finite(value, label);
  if (checked < 0) throw new RangeError(`${label} must not be negative`);
  return checked;
}

export function unitInterval(value: number, label: string) {
  const checked = finite(value, label);
  if (checked < 0 || checked > 1) throw new RangeError(`${label} must be between zero and one`);
  return checked;
}

export function unsignedBits(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) throw new RangeError(`${label} must be an unsigned 32-bit integer`);
  return value >>> 0;
}

export function boundedInteger(value: number, minimum: number, maximum: number, label: string) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

export { clampLowerFirst as clamp } from "@hyperfocus/utilities/math";

export function normalizeAngle(value: number) {
  const wrapped = (value + Math.PI) % (Math.PI * 2);
  return (wrapped < 0 ? wrapped + Math.PI * 2 : wrapped) - Math.PI;
}

export function bodyPairKey(a: number, b: number) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function incrementPair(entries: Map<string, number>, key: string) {
  entries.set(key, (entries.get(key) ?? 0) + 1);
}

export function decrementPair(entries: Map<string, number>, key: string) {
  const count = entries.get(key);
  if (count === undefined || count <= 1) entries.delete(key);
  else entries.set(key, count - 1);
}
