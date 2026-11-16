import { hypot, sqrt } from '../math/simulation.ts';
/**
 * Finds the nearest point inside a convex support polygon expanded by a circular
 * contact margin. Points are packed x,z pairs. Scratch arrays are caller-owned so
 * fixed-step ragdoll evaluation does not allocate.
 */
export function closestExpandedSupportPoint3D(points: Float64Array, count: number, x: number, z: number, radius: number, order: Uint32Array, hull: Uint32Array, output: Float64Array): number {
  for (let index = 0; index < count; index += 1) {
    let cursor = index; order[index] = index;
    while (cursor > 0 && comparePoint(points, order[cursor - 1]!, index) > 0) { order[cursor] = order[cursor - 1]!; cursor -= 1; }
    order[cursor] = index;
  }
  let uniqueCount = 0;
  for (let index = 0; index < count; index += 1) {
    const point = order[index]!, prior = uniqueCount ? order[uniqueCount - 1]! : -1;
    if (prior >= 0 && points[prior * 2] === points[point * 2] && points[prior * 2 + 1] === points[point * 2 + 1]) continue;
    order[uniqueCount++] = point;
  }
  if (uniqueCount === 0) { output[0] = x; output[1] = z; return 0; }
  if (uniqueCount === 1) return expandedPoint(points, order[0]!, x, z, radius, output);

  let hullCount = 0;
  for (let index = 0; index < uniqueCount; index += 1) {
    const point = order[index]!;
    while (hullCount >= 2 && cross(points, hull[hullCount - 2]!, hull[hullCount - 1]!, point) <= 1e-12) hullCount -= 1;
    hull[hullCount++] = point;
  }
  const lowerCount = hullCount;
  for (let index = uniqueCount - 2; index >= 0; index -= 1) {
    const point = order[index]!;
    while (hullCount > lowerCount && cross(points, hull[hullCount - 2]!, hull[hullCount - 1]!, point) <= 1e-12) hullCount -= 1;
    hull[hullCount++] = point;
  }
  hullCount -= 1;

  if (hullCount >= 3) {
    let inside = true;
    for (let index = 0; index < hullCount; index += 1) {
      const a = hull[index]!, b = hull[(index + 1) % hullCount]!;
      if ((points[b * 2]! - points[a * 2]!) * (z - points[a * 2 + 1]!) - (points[b * 2 + 1]! - points[a * 2 + 1]!) * (x - points[a * 2]!) < -1e-12) { inside = false; break; }
    }
    if (inside) { output[0] = x; output[1] = z; return 0; }
  }

  let nearestX = 0, nearestZ = 0, nearestSquared = Number.POSITIVE_INFINITY;
  const edgeCount = hullCount === 2 ? 1 : hullCount;
  for (let index = 0; index < edgeCount; index += 1) {
    const a = hull[index]!, b = hull[(index + 1) % hullCount]!, ax = points[a * 2]!, az = points[a * 2 + 1]!, dx = points[b * 2]! - ax, dz = points[b * 2 + 1]! - az, denominator = dx * dx + dz * dz;
    const t = denominator <= 1e-12 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / denominator)), px = ax + dx * t, pz = az + dz * t, squared = (x - px) ** 2 + (z - pz) ** 2;
    if (squared < nearestSquared) { nearestSquared = squared; nearestX = px; nearestZ = pz; }
  }
  const distance = sqrt(nearestSquared);
  if (distance <= radius) { output[0] = x; output[1] = z; return 0; }
  const scale = radius / distance; output[0] = nearestX + (x - nearestX) * scale; output[1] = nearestZ + (z - nearestZ) * scale; return distance - radius;
}

export type SupportAwareJoint3D = { id: string; parentHandle: number; childHandle: number };
export type SupportAwareAnchor3D = { id: string; boneId: string; bodyHandle: number };
export type SupportAwareEffectorPath3D = { supportId: string; boneId: string; jointIds: string[] };

/** Resolves one stable planted-body-to-effector chain once when an action activates. */
export function resolveSupportAwareEffectorPath3D(joints: readonly SupportAwareJoint3D[], supports: readonly SupportAwareAnchor3D[], effectorHandle: number): SupportAwareEffectorPath3D | undefined {
  let best: SupportAwareEffectorPath3D | undefined;
  for (const support of [...supports].sort((left, right) => left.id.localeCompare(right.id) || left.boneId.localeCompare(right.boneId))) {
    if (support.bodyHandle === effectorHandle) continue;
    const jointIds = shortestJointPath(joints, support.bodyHandle, effectorHandle);
    if (!jointIds || best && jointIds.length >= best.jointIds.length) continue;
    best = { supportId: support.id, boneId: support.boneId, jointIds };
  }
  return best;
}

function shortestJointPath(joints: readonly SupportAwareJoint3D[], startHandle: number, endHandle: number): string[] | undefined {
  const queue = [startHandle], previous = new Map<number, { handle: number; jointId: string }>(); previous.set(startHandle, { handle: startHandle, jointId: "" });
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const handle = queue[cursor]!; if (handle === endHandle) break;
    for (const joint of joints) {
      const next = joint.parentHandle === handle ? joint.childHandle : joint.childHandle === handle ? joint.parentHandle : undefined;
      if (next === undefined || previous.has(next)) continue;
      previous.set(next, { handle, jointId: joint.id }); queue.push(next);
    }
  }
  if (!previous.has(endHandle)) return undefined;
  const path: string[] = []; let handle = endHandle;
  while (handle !== startHandle) { const edge = previous.get(handle)!; path.push(edge.jointId); handle = edge.handle; }
  return path.reverse();
}

function expandedPoint(points: Float64Array, index: number, x: number, z: number, radius: number, output: Float64Array) {
  const px = points[index * 2]!, pz = points[index * 2 + 1]!, dx = x - px, dz = z - pz, distance = hypot(dx, dz);
  if (distance <= radius) { output[0] = x; output[1] = z; return 0; }
  const scale = radius / distance; output[0] = px + dx * scale; output[1] = pz + dz * scale; return distance - radius;
}
function comparePoint(points: Float64Array, a: number, b: number) { return points[a * 2]! - points[b * 2]! || points[a * 2 + 1]! - points[b * 2 + 1]! || a - b; }
function cross(points: Float64Array, a: number, b: number, c: number) { return (points[b * 2]! - points[a * 2]!) * (points[c * 2 + 1]! - points[a * 2 + 1]!) - (points[b * 2 + 1]! - points[a * 2 + 1]!) * (points[c * 2]! - points[a * 2]!); }
