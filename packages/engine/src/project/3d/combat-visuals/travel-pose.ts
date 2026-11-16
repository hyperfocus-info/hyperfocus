import type { CombatVector } from '../../../combat/config.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { cos, hypot, sin } from '../../../math/simulation.ts';

/** Lean the torso and its attachments toward actual travel; grounded feet remain planted. */
export function presentCombatTravelLean(frame: Hyperfocus3DEvaluatedFrame, id: string, velocity: CombatVector, reducedMotion: boolean) {
  const root = frame.entities.find(entity => entity.id === id), speed = hypot(velocity.x, velocity.z);
  if (!root || speed < .2) return;
  const [x, y, z] = root.position, dx = velocity.x / speed, dz = velocity.z / speed;
  const angle = Math.min(.34, speed * .022) * (reducedMotion ? .5 : 1), cosine = cos(angle), sine = sin(angle);
  const ax = dz * sin(angle / 2), az = -dx * sin(angle / 2), w = cos(angle / 2);
  for (const part of frame.entities) {
    if (part !== root && (!part.id.startsWith(id + ':') || !/:(head|hair|face|belt|(?:left|right)-(?:hand|arm|forearm))$/.test(part.id))) continue;
    const px = part.position[0] - x, py = part.position[1] - y, pz = part.position[2] - z;
    const along = px * dx + pz * dz, change = along * (cosine - 1) + py * sine;
    part.position = [x + px + dx * change, y + py * cosine - along * sine, z + pz + dz * change];
    const [qx, qy, qz, qw] = part.rotation;
    part.rotation = [w * qx + ax * qw - az * qy, w * qy + az * qx - ax * qz, w * qz + az * qw + ax * qy, w * qw - ax * qx - az * qz];
  }
}
