import type { PlayBox, PlayVector } from './contracts.ts';

/** Segment versus expanded authored AABBs. Also used for camera clearance and particle sweeps. */
export function sweepPlayBoxes(from: readonly number[], to: readonly number[], boxes: readonly PlayBox[], half: readonly number[] = [0, 0, 0]) {
  let nearest: { fraction: number; normal: PlayVector; entityId: string; position?: PlayVector } | undefined;
  for (const box of boxes) {
    if (from.every((n, i) => n > box.center[i]! - box.halfSize[i]! - half[i]! && n < box.center[i]! + box.halfSize[i]! + half[i]!)) {
      let distance = Infinity, axis = 0, sign = 1;
      for (let i = 0; i < 3; i++) for (const direction of [-1, 1]) { const gap = Math.abs(box.center[i]! + direction * (box.halfSize[i]! + half[i]!) - from[i]!);if (gap < distance) { distance = gap;axis = i;sign = direction; } }
      const normal: PlayVector = [0, 0, 0], position: PlayVector = [from[0]!, from[1]!, from[2]!];normal[axis] = sign;position[axis] += distance * sign;
      nearest = { fraction: 0, normal, position, entityId: box.entityId };continue;
    }
    let enter = 0, exit = 1, normal: PlayVector = [0, 0, 0], valid = true;
    for (let axis = 0; axis < 3; axis++) {
      const low = box.center[axis]! - box.halfSize[axis]! - half[axis]!, high = box.center[axis]! + box.halfSize[axis]! + half[axis]!, delta = to[axis]! - from[axis]!;
      if (Math.abs(delta) < 1e-12) { if (from[axis]! < low || from[axis]! > high || half[axis]! > 0 && (from[axis] === low || from[axis] === high)) { valid = false;break; }continue; }
      const first = (low - from[axis]!) / delta, last = (high - from[axis]!) / delta, near = Math.min(first, last), far = Math.max(first, last);
      if (near >= enter) { enter = near;normal = [0, 0, 0];normal[axis] = delta > 0 ? -1 : 1; }
      exit = Math.min(exit, far);if (enter > exit) { valid = false;break; }
    }
    if (valid && exit > 0 && enter >= 0 && enter <= 1 && normal.some(n => n !== 0) && (!nearest || enter < nearest.fraction)) nearest = { fraction: enter, normal, entityId: box.entityId };
  }
  return nearest;
}
export function overlapPlayBox(position: readonly number[], half: readonly number[], box: PlayBox, tolerance = .0001) {
  return position.every((n, i) => Math.abs(n - box.center[i]!) < half[i]! + box.halfSize[i]! - tolerance);
}
export function movePlayBody(position: PlayVector, delta: PlayVector, radius: number, height: number, boxes: readonly PlayBox[]) {
  const center: PlayVector = [position[0], position[1] + height / 2, position[2]], rest: PlayVector = [...delta];let grounded = false;
  for (let pass = 0; pass < 4; pass++) {
    const to: PlayVector = [center[0] + rest[0], center[1] + rest[1], center[2] + rest[2]], hit = sweepPlayBoxes(center, to, boxes, [radius, height / 2, radius]);
    if (!hit) { for (let i = 0; i < 3; i++) center[i] += rest[i]!;break; }
    for (let i = 0; i < 3; i++) { center[i] += rest[i]! * Math.max(0, hit.fraction - .00001);rest[i] *= 1 - hit.fraction;if (hit.normal[i]) rest[i] = 0; }
    if (hit.normal[1] > .5) grounded = true;
    if (Math.hypot(...rest) < .000001) break;
  }
  const moved: PlayVector = [center[0], center[1] - height / 2, center[2]];
  return { position: moved, grounded };
}
export function playCamera(position: PlayVector, yaw: number, pitch: number, options: { height: number; distance: number; shoulder: number; clearance: number }, boxes: readonly PlayBox[]) {
  const target: PlayVector = [position[0] + Math.cos(yaw) * options.shoulder, position[1] + options.height, position[2] - Math.sin(yaw) * options.shoulder], distance = options.distance * Math.cos(pitch);
  const desired: PlayVector = [target[0] + Math.sin(yaw) * distance, target[1] + Math.sin(pitch) * options.distance, target[2] + Math.cos(yaw) * distance];
  const hit = sweepPlayBoxes(target, desired, boxes, [options.clearance, options.clearance, options.clearance]);
  const fraction = hit ? Math.max(0, hit.fraction - .01) : 1;
  const camera: PlayVector = [target[0] + (desired[0] - target[0]) * fraction, target[1] + (desired[1] - target[1]) * fraction, target[2] + (desired[2] - target[2]) * fraction];
  return { position: camera, target };
}
