import type { CombatVector } from '../../../combat/config.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { atan2, cos, sin } from '../../../math/simulation.ts';
import { poseContactArm, poseContactLeg } from './contact-pose.ts';

export function presentWallPose(frame: Hyperfocus3DEvaluatedFrame, id: string, tick: number, normal: CombatVector, running: boolean) {
  const root = frame.entities.find(entity => entity.id === id);
  if (!root) return;
  const [x, y, z] = root.position, nx = normal.x, nz = normal.z;
  const yaw = atan2(-nx, -nz), stride = running ? sin(tick * .65) : 0;
  // Face the actual contact plane, with a planted palm and alternating bent legs.
  root.rotation = [cos(yaw / 2) * sin(.12), sin(yaw / 2) * cos(.12), -sin(yaw / 2) * sin(.12), cos(yaw / 2) * cos(.12)];
  for (const part of ['head', 'hair', 'face']) {
    const entity = frame.entities.find(item => item.id === `${id}:${part}`);
    if (!entity) continue;
    const front = part === 'face' ? .25 : .06;
    entity.position = [x - nx * front, y + (part === 'hair' ? 1 : .78), z - nz * front];
    entity.rotation = [0, sin(yaw / 2), 0, cos(yaw / 2)];
  }
  for (const side of [-1, 1]) {
    const beat = stride * side, across = side * .3;
    poseContactArm(frame, id, side, yaw, [x - nx * .82 + nz * across, y + .45 + (side < 0 ? .23 : -.16) + beat * .08, z - nz * .82 - nx * across]);
    poseContactLeg(frame, id, side, yaw,
      [x - nx * .36 + nz * across, y - .3 + beat * .16, z - nz * .36 - nx * across],
      [x - nx * .8 + nz * (across + beat * .25), y - .55 + beat * .3, z - nz * .8 - nx * (across + beat * .25)]);
  }
}
