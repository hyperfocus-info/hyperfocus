import { hypot } from '../math/simulation.ts';
import type { RigidBodyState3D, RigidRaycastHit3D, RigidWorld3D } from "./rigid-3d.ts";

export type RagdollRecoveryBlocker3D = "position" | "linear-motion" | "angular-motion" | "obstructed" | "unsupported";
export type RagdollPosture3D = "upright" | "face-up" | "face-down" | "left-side" | "right-side";
export type RagdollRecoveryEnvironment3D = "open" | "crouched" | "wall-supported" | "ledge-supported";

export type RagdollRecoveryClearance3D = {
  position: readonly [number, number, number];
  rotation: readonly [number, number, number, number];
  padding: number;
  groundLayerMask: number;
};

export type RagdollRecoveryEnvironmentInspection3D = {
  environment: RagdollRecoveryEnvironment3D;
  rootPosition: [number, number, number];
  bodyId?: string;
};

export type RagdollRecoveryBodyClearance3D = {
  boneId: string;
  body: RigidBodyState3D;
  targetPosition: readonly [number, number, number];
  targetRotation: readonly [number, number, number, number];
};

export type RagdollRecoveryBodyObstruction3D = {
  boneId: string;
  bodyId: string;
  phase: "path" | "target";
};

/** Returns the first stable body id occupying a requested root recovery volume. */
export function findRagdollRecoveryObstruction3D(options: {
  world: RigidWorld3D;
  root: RigidBodyState3D;
  selfHandles: readonly number[];
  clearance: RagdollRecoveryClearance3D;
  queryHandles: Float64Array;
}): string | undefined {
  const { world, root, selfHandles, clearance, queryHandles } = options;
  const target = aabb(root.shape, clearance.position, clearance.rotation, clearance.padding);
  const count = world.queryAabb(target[0], target[1], target[2], target[3], target[4], target[5], queryHandles);
  for (let index = 0; index < count; index += 1) {
    const handle = queryHandles[index]!;
    if (selfHandles.includes(handle)) continue;
    const body = world.body(handle);
    if (!body || body.trigger || (root.collisionLayer & body.collisionMask) === 0 || (body.collisionLayer & root.collisionMask) === 0) continue;
    const occupied = aabb(body.shape, [body.x, body.y, body.z], [body.rotationX, body.rotationY, body.rotationZ, body.rotationW], 0);
    if (!overlapsVolume(target, occupied)) continue;
    const unpadded = aabb(root.shape, clearance.position, clearance.rotation, 0);
    const isSupportingGround = (body.collisionLayer & clearance.groundLayerMask) !== 0 && occupied[4] <= unpadded[1] + 1e-6;
    if (!isSupportingGround) return body.id;
  }
  return undefined;
}

/** Finds a stable obstacle in any body's requested target volume or conservative transition sweep. */
export function findRagdollRecoveryBodyObstruction3D(options: {
  world: RigidWorld3D;
  bodies: readonly RagdollRecoveryBodyClearance3D[];
  selfHandles: readonly number[];
  clearance: Pick<RagdollRecoveryClearance3D, "padding" | "groundLayerMask">;
  queryHandles: Float64Array;
}): RagdollRecoveryBodyObstruction3D | undefined {
  const { world, selfHandles, clearance, queryHandles } = options;
  for (const targetBody of options.bodies) {
    const body = targetBody.body, start = [body.x, body.y, body.z] as const, target = targetBody.targetPosition, radius = body.shape.kind === "sphere" ? body.shape.radius + clearance.padding : hypot(body.shape.halfX, body.shape.halfY, body.shape.halfZ) + clearance.padding;
    const targetVolume = aabb(body.shape, target, targetBody.targetRotation, clearance.padding), targetUnpadded = aabb(body.shape, target, targetBody.targetRotation, 0), startUnpadded = aabb(body.shape, start, [body.rotationX, body.rotationY, body.rotationZ, body.rotationW], 0);
    const count = world.queryAabb(Math.min(start[0], target[0]) - radius, Math.min(start[1], target[1]) - radius, Math.min(start[2], target[2]) - radius, Math.max(start[0], target[0]) + radius, Math.max(start[1], target[1]) + radius, Math.max(start[2], target[2]) + radius, queryHandles);
    for (let index = 0; index < count; index += 1) {
      const handle = queryHandles[index]!; if (selfHandles.includes(handle)) continue;
      const obstacle = world.body(handle); if (!obstacle || obstacle.trigger || (body.collisionLayer & obstacle.collisionMask) === 0 || (obstacle.collisionLayer & body.collisionMask) === 0) continue;
      const occupied = aabb(obstacle.shape, [obstacle.x, obstacle.y, obstacle.z], [obstacle.rotationX, obstacle.rotationY, obstacle.rotationZ, obstacle.rotationW], 0), targetOverlap = overlapsVolume(targetVolume, occupied);
      const supportingGround = (obstacle.collisionLayer & clearance.groundLayerMask) !== 0 && occupied[4] <= targetUnpadded[1] + 1e-6 && start[1] >= occupied[4] - 1e-6;
      if (supportingGround) continue;
      if (targetOverlap) return { boneId: targetBody.boneId, bodyId: obstacle.id, phase: "target" };
      if (overlapsVolume(startUnpadded, occupied)) continue;
      if (hypot(target[0] - start[0], target[1] - start[1], target[2] - start[2]) > 1e-8 && segmentIntersectsAabb(start, target, [occupied[0] - radius, occupied[1] - radius, occupied[2] - radius, occupied[3] + radius, occupied[4] + radius, occupied[5] + radius])) return { boneId: targetBody.boneId, bodyId: obstacle.id, phase: "path" };
    }
  }
  return undefined;
}

/** Requires every authored support bone to reach a real, upward-facing scene body. */
export function hasStableRagdollRecoverySupport3D(options: {
  world: RigidWorld3D;
  bodies: readonly RigidBodyState3D[];
  selfHandles: readonly number[];
  groundLayerMask: number;
  probeDistance: number;
  minimumNormalY: number;
  hit: RigidRaycastHit3D;
}): boolean {
  for (const body of options.bodies) {
    const halfHeight = body.shape.kind === "sphere" ? body.shape.radius : body.shape.halfY;
    const reached = options.world.raycast(body.x, body.y, body.z, 0, -1, 0, halfHeight + options.probeDistance, options.groundLayerMask, options.hit);
    if (!reached || options.selfHandles.includes(options.hit.handle) || options.hit.normalY < options.minimumNormalY) return false;
  }
  return options.bodies.length > 0;
}

/** Classifies stable scene geometry around a requested recovery root without mutating physics. */
export function inspectRagdollRecoveryEnvironment3D(options: {
  world: RigidWorld3D;
  root: RigidBodyState3D;
  selfHandles: readonly number[];
  clearance: RagdollRecoveryClearance3D;
  queryHandles: Float64Array;
  raycastHit: RigidRaycastHit3D;
  proximityMeters: number;
  standingHeadroomMeters: number;
  ledgeProbeDistance: number;
  ledgeHeightTolerance: number;
}): RagdollRecoveryEnvironmentInspection3D {
  const { world, root, selfHandles, clearance, queryHandles } = options;
  const base = aabb(root.shape, clearance.position, clearance.rotation, clearance.padding), unpadded = aabb(root.shape, clearance.position, clearance.rotation, 0);
  const obstruction = findRagdollRecoveryObstruction3D({ world, root, selfHandles, clearance, queryHandles });
  if (obstruction) {
    return { environment: "open", rootPosition: [...clearance.position], bodyId: obstruction };
  }

  if (options.standingHeadroomMeters > 0) {
    const count = world.queryAabb(base[0], unpadded[4], base[2], base[3], unpadded[4] + options.standingHeadroomMeters, base[5], queryHandles);
    let overhead: { id: string; minimumY: number; handle: number } | undefined;
    for (let index = 0; index < count; index += 1) {
      const handle = queryHandles[index]!; if (selfHandles.includes(handle)) continue;
      const body = world.body(handle); if (!body || body.type === "dynamic" || body.trigger || (root.collisionLayer & body.collisionMask) === 0 || (body.collisionLayer & root.collisionMask) === 0) continue;
      const occupied = aabb(body.shape, [body.x, body.y, body.z], [body.rotationX, body.rotationY, body.rotationZ, body.rotationW], 0);
      if (occupied[1] < unpadded[4] - 1e-6 || occupied[1] > unpadded[4] + options.standingHeadroomMeters + 1e-6) continue;
      if (overhead && (occupied[1] > overhead.minimumY + 1e-10 || Math.abs(occupied[1] - overhead.minimumY) <= 1e-10 && handle >= overhead.handle)) continue;
      overhead = { id: body.id, minimumY: occupied[1], handle };
    }
    if (overhead) return { environment: "crouched", rootPosition: [...clearance.position], bodyId: overhead.id };
  }

  const nearby = aabb(root.shape, clearance.position, clearance.rotation, clearance.padding + options.proximityMeters);
  const count = world.queryAabb(nearby[0], base[1], nearby[2], nearby[3], base[4], nearby[5], queryHandles);
  let wall: { id: string; gap: number; handle: number } | undefined;
  for (let index = 0; index < count; index += 1) {
    const handle = queryHandles[index]!;
    if (selfHandles.includes(handle)) continue;
    const body = world.body(handle);
    if (!body || body.type === "dynamic" || body.trigger || (root.collisionLayer & body.collisionMask) === 0 || (body.collisionLayer & root.collisionMask) === 0) continue;
    const occupied = aabb(body.shape, [body.x, body.y, body.z], [body.rotationX, body.rotationY, body.rotationZ, body.rotationW], 0);
    if (occupied[4] <= unpadded[1] + 1e-6 || occupied[1] >= unpadded[4] - 1e-6) continue;
    const gapX = Math.max(occupied[0] - base[3], base[0] - occupied[3], 0), gapZ = Math.max(occupied[2] - base[5], base[2] - occupied[5], 0), gap = hypot(gapX, gapZ);
    if (gap > options.proximityMeters + 1e-8 || wall && (gap > wall.gap + 1e-10 || Math.abs(gap - wall.gap) <= 1e-10 && handle >= wall.handle)) continue;
    wall = { id: body.id, gap, handle };
  }
  if (wall) return { environment: "wall-supported", rootPosition: [...clearance.position], bodyId: wall.id };

  const inset = 0.8, centerX = (base[0] + base[3]) * .5, centerZ = (base[2] + base[5]) * .5, halfX = (base[3] - base[0]) * .5 * inset, halfZ = (base[5] - base[2]) * .5 * inset;
  const samples = [[centerX, centerZ], [centerX - halfX, centerZ - halfZ], [centerX + halfX, centerZ - halfZ], [centerX - halfX, centerZ + halfZ], [centerX + halfX, centerZ + halfZ]] as const;
  let supported = 0, minimumHeight = Number.POSITIVE_INFINITY, maximumHeight = Number.NEGATIVE_INFINITY, supportBodyId: string | undefined;
  const originY = base[1] + options.ledgeProbeDistance, distance = options.ledgeProbeDistance * 2 + clearance.padding + .05;
  for (const [x, z] of samples) if (raycastNonSelfGround(world, selfHandles, x, originY, z, distance, clearance.groundLayerMask, options.raycastHit)) {
    supported += 1; minimumHeight = Math.min(minimumHeight, options.raycastHit.y); maximumHeight = Math.max(maximumHeight, options.raycastHit.y); supportBodyId ??= options.raycastHit.id;
  }
  if (supported > 0 && (supported < samples.length || maximumHeight - minimumHeight > options.ledgeHeightTolerance)) return { environment: "ledge-supported", rootPosition: [...clearance.position], ...(supportBodyId ? { bodyId: supportBodyId } : {}) };
  return { environment: "open", rootPosition: [...clearance.position] };
}

/** Classifies the stable body's local forward/right/up frame against world up. */
export function classifyRagdollPosture3D(body: Pick<RigidBodyState3D, "rotationX" | "rotationY" | "rotationZ" | "rotationW">): RagdollPosture3D {
  const length = hypot(body.rotationX, body.rotationY, body.rotationZ, body.rotationW); if (length <= 1e-12) throw new RangeError("posture rotation must be non-zero.");
  const qx = body.rotationX / length, qy = body.rotationY / length, qz = body.rotationZ / length, qw = body.rotationW / length, rightY = 2 * (qx * qy + qz * qw), upY = 1 - 2 * (qx * qx + qz * qz), forwardY = 2 * (qy * qz - qx * qw);
  if (upY >= .55) return "upright";
  if (Math.abs(forwardY) >= Math.abs(rightY)) return forwardY >= 0 ? "face-up" : "face-down";
  return rightY >= 0 ? "left-side" : "right-side";
}

function aabb(shape: RigidBodyState3D["shape"], position: readonly [number, number, number], rotation: readonly [number, number, number, number], padding: number): [number, number, number, number, number, number] {
  let x: number, y: number, z: number;
  if (shape.kind === "sphere") x = y = z = shape.radius;
  else {
    const [qx, qy, qz, qw] = rotation;
    const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
    const m00 = 1 - 2 * (yy + zz), m01 = 2 * (xy - wz), m02 = 2 * (xz + wy);
    const m10 = 2 * (xy + wz), m11 = 1 - 2 * (xx + zz), m12 = 2 * (yz - wx);
    const m20 = 2 * (xz - wy), m21 = 2 * (yz + wx), m22 = 1 - 2 * (xx + yy);
    x = Math.abs(m00) * shape.halfX + Math.abs(m01) * shape.halfY + Math.abs(m02) * shape.halfZ;
    y = Math.abs(m10) * shape.halfX + Math.abs(m11) * shape.halfY + Math.abs(m12) * shape.halfZ;
    z = Math.abs(m20) * shape.halfX + Math.abs(m21) * shape.halfY + Math.abs(m22) * shape.halfZ;
  }
  return [position[0] - x - padding, position[1] - y - padding, position[2] - z - padding, position[0] + x + padding, position[1] + y + padding, position[2] + z + padding];
}

function overlapsVolume(a: readonly number[], b: readonly number[]) {
  return Math.min(a[3]!, b[3]!) - Math.max(a[0]!, b[0]!) > 1e-8
    && Math.min(a[4]!, b[4]!) - Math.max(a[1]!, b[1]!) > 1e-8
    && Math.min(a[5]!, b[5]!) - Math.max(a[2]!, b[2]!) > 1e-8;
}

function segmentIntersectsAabb(start: readonly [number, number, number], end: readonly [number, number, number], bounds: readonly [number, number, number, number, number, number]) {
  let minimum = 0, maximum = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const delta = end[axis]! - start[axis]!, low = bounds[axis]!, high = bounds[axis + 3]!;
    if (Math.abs(delta) <= 1e-12) { if (start[axis]! < low || start[axis]! > high) return false; continue; }
    const inverse = 1 / delta, first = (low - start[axis]!) * inverse, second = (high - start[axis]!) * inverse, enter = Math.min(first, second), exit = Math.max(first, second);
    minimum = Math.max(minimum, enter); maximum = Math.min(maximum, exit); if (minimum > maximum) return false;
  }
  return maximum >= 0 && minimum <= 1;
}

function raycastNonSelfGround(world: RigidWorld3D, selfHandles: readonly number[], x: number, originY: number, z: number, distance: number, layerMask: number, hit: RigidRaycastHit3D): boolean {
  let y = originY, remaining = distance;
  for (let attempt = 0; attempt <= selfHandles.length + 2 && remaining > 1e-6; attempt += 1) {
    if (!world.raycast(x, y, z, 0, -1, 0, remaining, layerMask, hit)) return false;
    if (!selfHandles.includes(hit.handle)) { const body = world.body(hit.handle); return !!body && !body.trigger; }
    const body = world.body(hit.handle); if (!body) return false;
    const occupied = aabb(body.shape, [body.x, body.y, body.z], [body.rotationX, body.rotationY, body.rotationZ, body.rotationW], 0), nextY = Math.min(hit.y - 1e-6, occupied[1] - 1e-6), advance = y - nextY;
    if (advance <= 1e-8) return false;
    y = nextY; remaining -= advance;
  }
  return false;
}
