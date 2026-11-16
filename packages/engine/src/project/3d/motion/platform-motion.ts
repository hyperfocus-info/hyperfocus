import { atan2, cos, sin } from '../../../math/simulation.ts';
import type { RigidWorld3D } from '../../../physics/rigid-3d.ts';
import type { Hyperfocus3DDeclaration } from '../declaration.ts';
import { sampleCircuitMotion3D } from './circuit-motion.ts';

type Entity = Hyperfocus3DDeclaration['scenes'][number]['entities'][number];

/** Absolute tick sampling makes pause, round reset and portable restore agree. */
export function samplePlatformPosition3D(entity: Entity, tick: number, seed = 0): [number, number, number] {
  const motion = entity.animation;
  if (motion?.kind !== 'ping-pong') return [...entity.position];
  const circuit = sampleCircuitMotion3D(entity, tick, seed);
  if (circuit) return circuit.position;
  if (motion.travelSeconds !== undefined) {
    const variant = motion.varyByMatch ? seed % 3 : 0;
    const travel = motion.travelSeconds, dwell = Math.max(0, (motion.periodSeconds - travel * 2) / 2) * [1, 2.5, .25][variant]!;
    const period = travel * 2 + dwell * 2;
    const phase = (motion.phase + (motion.varyByMatch ? (seed % 97) / 97 : 0)) % 1;
    const time = (tick / 60 + phase * period) % period;
    const t = time < dwell ? 0 : time < dwell + travel ? (time - dwell) / travel : time < dwell * 2 + travel ? 1 : 1 - (time - dwell * 2 - travel) / travel;
    return [entity.position[0] + motion.offset[0] * t, entity.position[1] + motion.offset[1] * t, entity.position[2] + motion.offset[2] * t];
  }
  const start = (1 - cos(motion.phase * Math.PI * 2)) * .5;
  const t = (1 - cos((tick / (motion.periodSeconds * 60) + motion.phase) * Math.PI * 2)) * .5 - start;
  return [entity.position[0] + motion.offset[0] * t, entity.position[1] + motion.offset[1] * t, entity.position[2] + motion.offset[2] * t];
}

export function samplePlatformRotation3D(entity: Entity, tick: number, seed = 0) {
  return sampleCircuitMotion3D(entity, tick, seed)?.rotationY ?? entity.rotationY;
}

/** Move the solid surface and supported riders together, before ordinary physics.
 * Jumping riders detach immediately; horizontal input remains relative to the deck.
 */
export function carryPlatformRiders3D(physics: RigidWorld3D, platform: Entity, entities: readonly Entity[], next: readonly number[], rotationY = platform.rotationY) {
  const deck = physics.body(platform.id);
  if (!deck || deck.type !== 'static' || deck.shape.kind !== 'box') return;
  const dx = next[0]! - deck.x, dy = next[1]! - deck.y, dz = next[2]! - deck.z;
  const previousYaw = atan2(deck.rotationY, deck.rotationW) * 2, delta = rotationY - previousYaw;
  const top = deck.y + deck.shape.halfY;
  for (const entity of entities) {
    if (entity.physics?.type !== 'dynamic') continue;
    const rider = physics.body(entity.id);
    if (!rider || rider.velocityY > .2) continue;
    const radius = rider.shape.kind === 'sphere' ? rider.shape.radius : rider.shape.halfY;
    if (Math.abs(rider.y - radius - top) > .09) continue;
    const angle = previousYaw, x = rider.x - deck.x, z = rider.z - deck.z;
    const localX = x * cos(angle) - z * sin(angle), localZ = x * sin(angle) + z * cos(angle);
    if (Math.abs(localX) > deck.shape.halfX || Math.abs(localZ) > deck.shape.halfZ) continue;
    physics.setPosition(entity.id, rider.x + dx + x * (cos(delta) - 1) + z * sin(delta), rider.y + dy, rider.z + dz - x * sin(delta) + z * (cos(delta) - 1));
  }
  physics.setPosition(platform.id, next[0]!, next[1]!, next[2]!);
  physics.setRotation(platform.id, 0, sin(rotationY / 2), 0, cos(rotationY / 2));
}
