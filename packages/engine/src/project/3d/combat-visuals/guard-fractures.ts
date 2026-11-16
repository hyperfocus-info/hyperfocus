import { atan2, cos, hypot, sin } from '../../../math/simulation.ts';
import type { CombatConfig, CombatVector } from '../../../combat/config.ts';
import type { CombatSnapshot } from '../../../combat/state.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import type { FrameRecordLookup } from '../../../frame/record-lookup.ts';
import { poseCombatLimb } from './effects.ts';

/** Keep a shield visibly broad even when the threat is side-on to the camera. */
export function readableGuardYaw(yaw: number, camera: readonly number[], position: readonly number[]): number {
  const cameraYaw = atan2(camera[0]! - position[0]!, camera[2]! - position[2]!);
  const delta = atan2(sin(cameraYaw - yaw), cos(cameraYaw - yaw));
  const edgeDistance = Math.abs(Math.abs(delta) - Math.PI / 2);
  if (edgeDistance >= Math.PI / 6) return yaw;
  return yaw + Math.sign(delta) * (Math.PI / 6 - edgeDistance) * (Math.abs(delta) <= Math.PI / 2 ? 1 : -1);
}

/** Authored shield fragments show damage; the broken shield reforms in place. */
export function presentGuardFractures3D(options: { frame: Hyperfocus3DEvaluatedFrame; state: CombatSnapshot; config: CombatConfig; velocities?: ReadonlyMap<string, CombatVector>; entityLookup?: FrameRecordLookup }) {
  const { frame, state, config } = options;
  for (const fighter of state.fighters) {
    const root = options.entityLookup ? options.entityLookup.get(frame.entities, fighter.id) : frame.entities.find(e => e.id === fighter.id);
    if (!root) continue;
    const broken = fighter.guardBrokenFrames > 0;
    const integrity = broken ? 1 - fighter.guardBrokenFrames / Math.max(1, config.guardBreakFrames ?? 600) : fighter.guardMeter / Math.max(1, config.maxGuard ?? 100);
    const guarding = fighter.guarding && !fighter.moveId && (fighter.stunKind === '' || fighter.stunKind === 'block');
    const visible = fighter.health > 0 && (broken || guarding);
    const yaw = atan2(fighter.facing.x, fighter.facing.z), readableYaw = readableGuardYaw(yaw, frame.camera.position, root.position), c = cos(readableYaw), s = sin(readableYaw);
    const point = (x: number, y: number): [number, number, number] => [root.position[0] + x * c + sin(yaw) * .77, root.position[1] + .18 + y, root.position[2] - x * s + cos(yaw) * .77];
    for (let i = 0; i < 24; i++) {
      const shard = options.entityLookup ? options.entityLookup.get(frame.entities, `${fighter.id}:shield:${i}`) : frame.entities.find(e => e.id === `${fighter.id}:shield:${i}`);
      if (!shard) continue;
      const segment = i % 12, angle = segment * Math.PI / 6;
      const crack = i >= 12;
      shard.visible = visible && (crack ? segment / 12 >= integrity : !broken || segment / 12 < integrity);
      if (!shard.visible) continue;
      if (crack) {
        const radius = .2 + (segment % 3) * .1;
        poseCombatLimb(shard, point(cos(angle) * radius, sin(angle) * radius * 1.2), point(cos(angle + .24) * .81, sin(angle + .24) * .98), .026);
      } else {
        const end = angle + Math.PI / 6 * (integrity < .35 ? .7 : .95);
        poseCombatLimb(shard, point(cos(angle) * .84, sin(angle) * 1.02), point(cos(end) * .84, sin(end) * 1.02), broken ? .025 : .045);
      }
    }
    for (let i = 0; i < 3; i++) {
      const trail = options.entityLookup ? options.entityLookup.get(frame.entities, `${fighter.id}:influence:${i}`) : frame.entities.find(e => e.id === `${fighter.id}:influence:${i}`);
      if (!trail) continue;
      const velocity = options.velocities?.get(fighter.id), speed = hypot(velocity?.x ?? 0, velocity?.y ?? 0, velocity?.z ?? 0);
      trail.visible = fighter.health > 0 && fighter.stunKind === 'hit' && speed > 1;
      if (!trail.visible) continue;
      const d = { x: velocity!.x / speed, y: velocity!.y / speed, z: velocity!.z / speed };
      const offset = (i - 1) * .13;
      const a: [number, number, number] = [root.position[0] - d.z * offset, root.position[1] + .1 + offset, root.position[2] + d.x * offset];
      poseCombatLimb(trail, [a[0] - d.x * .8, a[1] - d.y * .8, a[2] - d.z * .8], [a[0] - d.x * .25, a[1] - d.y * .25, a[2] - d.z * .25], .022);
    }
  }
}
