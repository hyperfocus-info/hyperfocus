import { atan2, cos, hypot, sin } from '../../../math/simulation.ts';
import type { Hyperfocus3DDeclaration } from '../declaration.ts';

type Entity = Hyperfocus3DDeclaration['scenes'][number]['entities'][number];

/** A capsule circuit has two separate lanes, tangent semicircular turns and no wrap. */
export function sampleCircuitMotion3D(entity: Entity, tick: number, seed: number) {
  const motion = entity.animation;
  if (motion?.kind !== 'ping-pong' || motion.turnRadius === undefined || !motion.turnPivot || !motion.travelSeconds) return;
  const radius = Math.abs(motion.turnRadius), side = Math.sign(motion.turnRadius);
  const length = hypot(motion.offset[0], motion.offset[2]), ux = motion.offset[0] / length, uz = motion.offset[2] / length;
  const travel = motion.travelSeconds, turn = (motion.periodSeconds - travel * 2) / 2;
  const rate = motion.varyByMatch ? [1, 1.2, .9][seed % 3]! : 1;
  const phase = (motion.phase + (motion.varyByMatch ? (seed % 97) / 97 : 0)) % 1;
  const elapsed = tick / (60 * rate) + phase * motion.periodSeconds, time = elapsed % motion.periodSeconds;
  // Match straight-leg endpoint speed to the curved segment; no instant braking.
  const edge = Math.min(1, radius * Math.PI * travel / (turn * length));
  const distance = (t: number) => length * (edge * t + (1 - edge) * t * t * (3 - 2 * t));
  let along: number, across: number, yaw: number, travelled: number;
  if (time < travel) { along = distance(time / travel);across = 0;yaw = 0;travelled = along; }
  else if (time < travel + turn) {
    const angle = (time - travel) / turn * Math.PI;
    along = length + radius * sin(angle);across = side * radius * (1 - cos(angle));yaw = -side * angle;travelled = length + radius * angle;
  } else if (time < travel * 2 + turn) {
    along = length - distance((time - travel - turn) / travel);across = side * radius * 2;yaw = -side * Math.PI;travelled = length * 2 + Math.PI * radius - along;
  } else {
    const angle = (time - travel * 2 - turn) / turn * Math.PI;
    along = -radius * sin(angle);across = side * radius * (1 + cos(angle));yaw = -side * (Math.PI + angle);travelled = length * 2 + radius * (Math.PI + angle);
  }
  const [px, , pz] = motion.turnPivot, dx = entity.position[0] - px, dz = entity.position[2] - pz;
  const c = cos(yaw), s = sin(yaw);
  const position: [number, number, number] = [px + ux * along - uz * across + dx * c + dz * s, entity.position[1], pz + uz * along + ux * across - dx * s + dz * c];
  return { position, rotationY: entity.rotationY + yaw, distance: travelled + Math.floor(elapsed / motion.periodSeconds) * (length * 2 + Math.PI * radius * 2) };
}

/** Infer within-lap travel from a real stopped pose, including a clipped impact. */
export function circuitPoseDistance(entity: Entity, position: readonly number[], yaw: number) {
  const motion = entity.animation;
  if (motion?.kind !== 'ping-pong' || motion.turnRadius === undefined) return 0;
  const radius = Math.abs(motion.turnRadius), length = hypot(motion.offset[0], motion.offset[2]);
  const angle = ((entity.rotationY - yaw) * Math.sign(motion.turnRadius) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  const dx = position[0]! - entity.position[0], dz = position[2]! - entity.position[2];
  const along = (dx * motion.offset[0] + dz * motion.offset[2]) / length, across = (-dx * motion.offset[2] + dz * motion.offset[0]) / length * Math.sign(motion.turnRadius);
  if (along > length) return length + radius * atan2(along - length, radius - across);
  if (along < 0) return length * 2 + Math.PI * radius + radius * atan2(-along, across - radius);
  if (angle < .00001 || Math.PI * 2 - angle < .00001) return along;
  if (Math.abs(angle - Math.PI) < .00001) return length * 2 + Math.PI * radius - along;
  return angle < Math.PI ? length + radius * angle : length * 2 + radius * angle;
}
