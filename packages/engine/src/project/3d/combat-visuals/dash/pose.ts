import { smoothstep01 as smooth } from "@hyperfocus/utilities/math";
import { map4 } from '@hyperfocus/utilities/tuples';
import type { Hyperfocus3DEvaluatedFrame } from '../../../../frame/3d.ts';
import { atan2, cos, hypot, sin } from '../../../../math/simulation.ts';
import { poseContactLeg } from '../contact-pose.ts';

type Cue = { id: string; dx: number; dz: number; dashCue: number; dashAge?: number; dashDuration?: number; dashAirborne?: boolean; poseWeight?: number };


/** Grounded feet skid along their support; airborne legs tuck. Physics is untouched. */
export function presentDashPose(frame: Hyperfocus3DEvaluatedFrame, cue: Cue) {
  const root = frame.entities.find(entity => entity.id === cue.id);
  if (!root) return;
  const age = cue.dashAge ?? Math.max(0, 12 - cue.dashCue), duration = cue.dashDuration ?? 12;
  const weight = smooth(age / 3) * smooth(Math.min(cue.dashCue, duration + 4 - age) / 4) * (cue.poseWeight ?? 1);
  if (!weight) return;
  const speed = hypot(cue.dx, cue.dz);
  if (speed < .00001) return;
  const dx = cue.dx / speed, dz = cue.dz / speed, yaw = atan2(dx, dz), [x, y, z] = root.position;
  const airborne = cue.dashAirborne === true, angle = (airborne ? .68 : .4) * weight;
  const cosine = cos(angle), sine = sin(angle), ax = dz * sin(angle / 2), az = -dx * sin(angle / 2), w = cos(angle / 2);
  for (const part of frame.entities) {
    if (part !== root && (!part.id.startsWith(cue.id + ':') || !/:(head|hair|face|belt|(?:left|right)-(?:hand|arm|forearm))$/.test(part.id))) continue;
    const px = part.position[0] - x, py = part.position[1] - y, pz = part.position[2] - z;
    const along = px * dx + pz * dz, change = along * (cosine - 1) + py * sine;
    part.position = [x + px + dx * change, y + py * cosine - along * sine - (part === root ? 0 : .12 * weight), z + pz + dz * change];
    const [qx, qy, qz, qw] = part.rotation;
    part.rotation = [w * qx + ax * qw - az * qy, w * qy + az * qx - ax * qz, w * qz + az * qw + ax * qy, w * qw - ax * qx - az * qz];
  }
  for (const side of [-1, 1]) {
    const name = side < 0 ? 'left' : 'right', boot = frame.entities.find(entity => entity.id === `${cue.id}:${name}-boot`);
    if (!boot) continue;
    const reach = airborne ? -.18 : side * .3;
    const ankle: [number, number, number] = [boot.position[0] + dx * reach * weight, boot.position[1] + (airborne ? .43 * weight : 0), boot.position[2] + dz * reach * weight];
    const thigh = frame.entities.find(entity => entity.id === `${cue.id}:${name}-thigh`), shin = frame.entities.find(entity => entity.id === `${cue.id}:${name}-shin`);
    const originals = [thigh, shin, boot].filter(part => part !== undefined).map(part => ({ part, position: [...part.position], rotation: [...part.rotation], scale: [...part.scale] }));
    const baseKnee = thigh && shin ? [thigh.position[0] + shin.position[0] - (x + side * .16 * cos(yaw) + boot.position[0]) / 2, thigh.position[1] + shin.position[1] - (y - .26 + boot.position[1]) / 2, thigh.position[2] + shin.position[2] - (z - side * .16 * sin(yaw) + boot.position[2]) / 2] : [x + side * .19 * dz, y - .54, z - side * .19 * dx];
    const knee: [number, number, number] = [baseKnee[0]! + dx * (airborne ? .35 : .2) * weight, baseKnee[1]! + (airborne ? .35 : -.06) * weight, baseKnee[2]! + dz * (airborne ? .35 : .2) * weight];
    poseContactLeg(frame, cue.id, side, yaw, knee, ankle);
    for (const { part, position, rotation, scale } of originals) {
      for (let index = 0; index < 3; index++) { part.position[index] = position[index]! + (part.position[index]! - position[index]!) * weight;part.scale[index] = scale[index]! + (part.scale[index]! - scale[index]!) * weight; }
      const sign = part.rotation.reduce((sum, value, index) => sum + value * rotation[index]!, 0) < 0 ? -1 : 1;
      const q = map4(part.rotation, (value, index) => rotation[index]! * (1 - weight) + sign * value * weight), length = hypot(...q) || 1;
      part.rotation = map4(q, value => value / length);
    }
  }
}
