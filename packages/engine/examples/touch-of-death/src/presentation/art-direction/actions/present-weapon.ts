import type { Hyperfocus3DEvaluatedFrame } from '@hyperfocus/engine/project/runtime-3d';
import type { ArtMotion } from '../motion.ts';
import type { ArtWeapon } from './weapons.ts';

/** Models are normalized along Y. Their authored grip remains on the resolved wrist. */
export function presentArtWeapon(options: { frame: Hyperfocus3DEvaluatedFrame; entityId: string; wrist: number[]; root: number[]; yaw: number; pose: ArtMotion; weapon: ArtWeapon; flexiblePrefix?: string }) {
  const { frame, entityId, wrist, yaw, pose, weapon } = options, entity = frame.entities.find(e => e.id === entityId);
  if (!entity) throw new Error(`Missing weapon model: ${entityId}`);
  const a = pose.weapon?.axis ?? [0, 1, .2], norm = Math.max(.001, Math.hypot(...a));
  const axis = [(a[0]! * Math.cos(yaw) + a[2]! * Math.sin(yaw)) / norm, a[1]! / norm, (-a[0]! * Math.sin(yaw) + a[2]! * Math.cos(yaw)) / norm];
  const grip = (pose.weapon?.grip ?? 0) * weapon.length / 2;
  entity.position = [wrist[0]! - axis[0]! * grip, wrist[1]! - axis[1]! * grip, wrist[2]! - axis[2]! * grip];
  const qn = Math.hypot(axis[2]!, -axis[0]!, 1 + axis[1]!);
  entity.rotation = qn < .0001 ? [1, 0, 0, 0] : [axis[2]! / qn, 0, -axis[0]! / qn, (1 + axis[1]!) / qn];
  entity.scale = [weapon.width / 2, weapon.length / 2, weapon.depth / 2]; entity.visible = true;
  if (pose.weapon?.releasedPosition) {
    const point = pose.weapon.releasedPosition;
    entity.position = [options.root[0]! + point[0] * Math.cos(yaw) + point[2] * Math.sin(yaw), options.root[1]! + point[1], options.root[2]! - point[0] * Math.sin(yaw) + point[2] * Math.cos(yaw)];
  }
  if (weapon.family === 'flexible') {
    entity.visible = false;
    const rotate = (local: number[]) => { const d = Math.max(.001, Math.hypot(...local)); return [(local[0]! * Math.cos(yaw) + local[2]! * Math.sin(yaw)) / d, local[1]! / d, (-local[0]! * Math.sin(yaw) + local[2]! * Math.cos(yaw)) / d]; };
    const follow = rotate(pose.weapon?.follow ?? [0, -1, 0]), chain = rotate(pose.weapon?.chain ?? pose.weapon?.follow ?? [0, -1, 0]);
    const part = (suffix: string, start: number[], direction: number[], length: number, width: number) => {
      const mesh = frame.entities.find(e => e.id === `${options.flexiblePrefix ?? 'flexible'}:${suffix}`);
      if (!mesh) throw new Error('Flexible weapon requires articulated handles');
      const norm = Math.hypot(direction[2]!, -direction[0]!, 1 + direction[1]!);
      mesh.position = [start[0]! + direction[0]! * length / 2, start[1]! + direction[1]! * length / 2, start[2]! + direction[2]! * length / 2];
      mesh.rotation = norm < .0001 ? [1, 0, 0, 0] : [direction[2]! / norm, 0, -direction[0]! / norm, (1 + direction[1]!) / norm];
      mesh.scale = [width, length / 2, width]; mesh.visible = true;
      return start.map((n, i) => n + direction[i]! * length);
    };
    const reversed = pose.weapon?.hand === 'left';
    const base = wrist.map((n, i) => n - axis[i]! * .10), end = part(reversed ? 'tail' : 'handle', base, axis, .34, .022);
    const chainEnd = part('chain', end, chain, .14, .008);
    part(reversed ? 'handle' : 'tail', chainEnd, follow, .34, .022);
  }
  return { grip: [entity.position[0] + axis[0]! * grip, entity.position[1] + axis[1]! * grip, entity.position[2] + axis[2]! * grip], axis };
}
