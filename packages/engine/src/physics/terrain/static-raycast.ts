import { hypot, sqrt } from '../../math/simulation.ts';
import type { RigidBodyDefinition3D } from "../rigid-3d.ts";

export type StaticTerrainHit3D = {
  body?: RigidBodyDefinition3D;
  y: number;
  normalX: number;
  normalY: number;
  normalZ: number;
};

/** Caller-owned result storage for repeated terrain queries. */
export function createStaticTerrainHit3D(): StaticTerrainHit3D {
  return { y: 0, normalX: 0, normalY: 1, normalZ: 0 };
}

/** Finds the closest upward-facing static surface below one world-space point. */
export function raycastStaticTerrainDown3D(
  bodies: readonly RigidBodyDefinition3D[],
  x: number,
  y: number,
  z: number,
  maximumDistance: number,
  collisionMask: number | undefined,
  out: StaticTerrainHit3D,
) {
  let closestDistance = Number.POSITIVE_INFINITY;
  const candidate = createStaticTerrainHit3D();
  out.body = undefined;
  for (const body of bodies) {
    if (body.type !== "static" || body.trigger || collisionMask !== undefined && ((body.collisionLayer ?? 1) & collisionMask) === 0) continue;
    const distance = body.shape.kind === "sphere"
      ? intersectSphereDown(body, x, y, z, candidate)
      : intersectBoxDown(body, x, y, z, candidate);
    if (distance === undefined || distance > maximumDistance || distance >= closestDistance || candidate.normalY <= 1e-6) continue;
    closestDistance = distance;
    out.body = body;
    out.y = candidate.y;
    out.normalX = candidate.normalX;
    out.normalY = candidate.normalY;
    out.normalZ = candidate.normalZ;
  }
  return out.body ? out : null;
}

/** Samples a static surface without assuming that its box is axis-aligned. */
export function sampleStaticTerrainHeight3D(bodies: readonly RigidBodyDefinition3D[], x: number, z: number) {
  let originY = 1;
  for (const body of bodies) {
    if (body.type !== "static" || body.trigger) continue;
    originY = Math.max(originY, (body.y ?? 0) + verticalExtent(body) + 1);
  }
  const hit = raycastStaticTerrainDown3D(bodies, x, originY, z, 20_000, undefined, createStaticTerrainHit3D());
  return hit?.y;
}

function intersectSphereDown(body: RigidBodyDefinition3D, x: number, y: number, z: number, out: StaticTerrainHit3D) {
  if (body.shape.kind !== "sphere") return undefined;
  const centerX = body.x ?? 0, centerY = body.y ?? 0, centerZ = body.z ?? 0;
  const dx = x - centerX, dz = z - centerZ, horizontalSquared = dx * dx + dz * dz;
  const radiusSquared = body.shape.radius * body.shape.radius;
  if (horizontalSquared > radiusSquared) return undefined;
  const dy = sqrt(Math.max(0, radiusSquared - horizontalSquared)), surfaceY = centerY + dy;
  const distance = y - surfaceY;
  if (distance < -1e-8) return undefined;
  out.y = surfaceY;
  out.normalX = dx / body.shape.radius;
  out.normalY = dy / body.shape.radius;
  out.normalZ = dz / body.shape.radius;
  return Math.max(0, distance);
}

function intersectBoxDown(body: RigidBodyDefinition3D, x: number, y: number, z: number, out: StaticTerrainHit3D) {
  if (body.shape.kind !== "box") return undefined;
  const rotation = normalizedRotation(body.rotation), inverse = [-rotation[0], -rotation[1], -rotation[2], rotation[3]] as const;
  const origin = rotate(inverse, x - (body.x ?? 0), y - (body.y ?? 0), z - (body.z ?? 0));
  const direction = rotate(inverse, 0, -1, 0);
  const extents = [body.shape.halfX, body.shape.halfY, body.shape.halfZ];
  let near = Number.NEGATIVE_INFINITY, far = Number.POSITIVE_INFINITY;
  let nearAxis = -1, nearSign = 0, farAxis = -1, farSign = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const component = direction[axis]!, coordinate = origin[axis]!, extent = extents[axis]!;
    if (Math.abs(component) <= 1e-12) {
      if (coordinate < -extent || coordinate > extent) return undefined;
      continue;
    }
    let first = (-extent - coordinate) / component, second = (extent - coordinate) / component;
    let firstSign = -1, secondSign = 1;
    if (first > second) { [first, second] = [second, first]; [firstSign, secondSign] = [secondSign, firstSign]; }
    if (first > near) { near = first; nearAxis = axis; nearSign = firstSign; }
    if (second < far) { far = second; farAxis = axis; farSign = secondSign; }
    if (near > far) return undefined;
  }
  if (far < -1e-8) return undefined;
  const distance = near >= 0 ? near : far;
  const axis = near >= 0 ? nearAxis : farAxis, sign = near >= 0 ? nearSign : farSign;
  if (axis < 0) return undefined;
  const localNormal: [number, number, number] = [0, 0, 0];
  localNormal[axis] = sign;
  const normal = rotate(rotation, localNormal[0], localNormal[1], localNormal[2]);
  out.y = y - Math.max(0, distance);
  out.normalX = normal[0];
  out.normalY = normal[1];
  out.normalZ = normal[2];
  return Math.max(0, distance);
}

function normalizedRotation(value: ArrayLike<number> | undefined): readonly [number, number, number, number] {
  const x = value?.[0] ?? 0, y = value?.[1] ?? 0, z = value?.[2] ?? 0, w = value?.[3] ?? 1;
  const inverse = 1 / Math.max(1e-12, hypot(x, y, z, w));
  return [x * inverse, y * inverse, z * inverse, w * inverse];
}

function rotate(rotation: readonly [number, number, number, number], x: number, y: number, z: number): [number, number, number] {
  const [qx, qy, qz, qw] = rotation, tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + qy * tz - qz * ty, y + qw * ty + qz * tx - qx * tz, z + qw * tz + qx * ty - qy * tx];
}

function verticalExtent(body: RigidBodyDefinition3D) {
  if (body.shape.kind === "sphere") return body.shape.radius;
  const [x, y, z, w] = normalizedRotation(body.rotation);
  const rowX = 2 * (x * y + z * w), rowY = 1 - 2 * (x * x + z * z), rowZ = 2 * (y * z - x * w);
  return Math.abs(rowX) * body.shape.halfX + Math.abs(rowY) * body.shape.halfY + Math.abs(rowZ) * body.shape.halfZ;
}
