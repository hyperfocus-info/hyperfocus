import type { CombatConfig } from '../../../combat/config.ts';
import type { CombatEvent, CombatSnapshot } from '../../../combat/state.ts';
import { cos, hypot, sin } from '../../../math/simulation.ts';
import type { RigidWorld3D } from '../../../physics/rigid-3d.ts';
import type { Hyperfocus3DDeclaration } from '../declaration.ts';
import { samplePlatformPosition3D, samplePlatformRotation3D } from '../motion/platform-motion.ts';
import type { CombatEnvironment } from './config.ts';

type Entity = Hyperfocus3DDeclaration['scenes'][number]['entities'][number];
export type TrafficContact = { entityId: string; fighterId: string };

/** Vehicle contacts use the same sampled motion as the visible solid, including match variation. */
export function createCombatTraffic(options: { definition: CombatEnvironment; world: RigidWorld3D; entities: readonly Entity[]; stopped?: (entityId: string) => boolean }) {
  const entities = new Map(options.entities.map(entity => [entity.id, entity]));
  const traffic = options.definition.traffic ?? [];
  let contacts: TrafficContact[] = [];
  function validate(value: unknown): TrafficContact[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > traffic.length * 16) throw new Error('Invalid traffic contacts.');
    const unique = new Set<string>();
    return value.map(row => {
      if (!row || typeof row !== 'object' || typeof row.entityId !== 'string' || !traffic.some(item => item.entityId === row.entityId) || typeof row.fighterId !== 'string' || !row.fighterId || row.fighterId.length > 128 || Object.keys(row).some(key => key !== 'entityId' && key !== 'fighterId')) throw new Error('Invalid traffic contact identity.');
      const key = `${row.entityId}\0${row.fighterId}`;
      if (unique.has(key)) throw new Error('Duplicate traffic contact.');unique.add(key);
      return { entityId: row.entityId, fighterId: row.fighterId };
    });
  }
  function step(state: CombatSnapshot, before: CombatSnapshot, config: CombatConfig, grounded: ReadonlySet<string>, tick: number, seed: number) {
    const events: CombatEvent[] = [], next: TrafficContact[] = [];
    const moves = new Map(config.moves.map(move => [move.id, move])), latched = new Set(contacts.map(contact => `${contact.entityId}\0${contact.fighterId}`));
    for (const vehicle of traffic) {
      if (options.stopped?.(vehicle.entityId)) continue;
      const body = options.world.body(vehicle.entityId), entity = entities.get(vehicle.entityId);
      if (!body || !entity || body.shape.kind !== 'box' || body.trigger || !body.collisionMask) continue;
      const from = samplePlatformPosition3D(entity, Math.max(0, tick - 1), seed);
      const dx = body.x - from[0], dy = body.y - from[1], dz = body.z - from[2], distance = hypot(dx, dy, dz);
      const move = moves.get(vehicle.moveId)!;
      const rotation = samplePlatformRotation3D(entity, tick, seed), c = cos(rotation), s = sin(rotation);
      for (const fighter of state.fighters) {
        const actor = options.world.body(fighter.id), previous = before.fighters.find(other => other.id === fighter.id);
        if (!actor || !previous) continue;
        const halfY = actor.shape.kind === 'sphere' ? actor.shape.radius : actor.shape.halfY;
        const radius = actor.shape.kind === 'sphere' ? actor.shape.radius : Math.max(actor.shape.halfX, actor.shape.halfZ);
        const a = previous.position, b = fighter.position;
        const px = a.x - from[0], pz = a.z - from[2], qx = b.x - body.x, qz = b.z - body.z;
        const start = [px * c - pz * s, a.y - from[1], px * s + pz * c];
        const end = [qx * c - qz * s, b.y - body.y, qx * s + qz * c];
        const extent = [body.shape.halfX + radius, body.shape.halfY + halfY, body.shape.halfZ + radius];
        const time = sweepBox(start, end, extent);
        if (time === undefined) continue;
        const already = latched.has(`${vehicle.entityId}\0${fighter.id}`);
        // A rider's feet remain on the roof; genuine clearance is geometric, not an airborne flag.
        const riding = Math.min(a.y - halfY - from[1], b.y - halfY - body.y) >= body.shape.halfY - .1;
        if (already) next.push({ entityId: vehicle.entityId, fighterId: fighter.id });
        if (already || riding || fighter.health <= 0 || fighter.protectionFrames > 0 || distance * 60 < vehicle.minSpeed) continue;
        const damage = Math.min(fighter.health, move.damage);
        fighter.health -= damage;
        const escapeArmor = moves.get(fighter.moveId)?.armoredEscape;
        const heavy = move.command.some(command => command === 'heavy' || command.endsWith('-heavy'));
        const absorbed = fighter.armorFrames > 0 && fighter.health > 0 && (escapeArmor || !heavy);
        if (!absorbed) {
          fighter.armorFrames = 0;
          fighter.stunFrames = Math.max(fighter.stunFrames, grounded.has(fighter.id) ? move.groundedHitstunFrames ?? move.hitstunFrames : move.hitstunFrames);fighter.stunKind = 'hit';
          fighter.guarding = false;fighter.moveId = '';fighter.moveFrame = 0;fighter.history = [];fighter.hitTargets = [];fighter.followupFrames = 0;
        }
        events.push({ id: `${state.frame}:traffic:${vehicle.entityId}:${fighter.id}`, frame: state.frame, attackerId: vehicle.entityId, environmentId: vehicle.entityId, targetId: fighter.id,
          moveId: move.id, kind: 'hit', damage, defenseReason: 'traffic-impact', hitstunFrames: absorbed ? 0 : grounded.has(fighter.id) ? move.groundedHitstunFrames ?? move.hitstunFrames : move.hitstunFrames, ...(absorbed ? { armored: true as const } : {}), impulse: absorbed ? { x: 0, y: 0, z: 0 } : { x: dx / distance * move.impulse, y: move.verticalImpulse ?? 0, z: dz / distance * move.impulse },
          contactPoint: { x: a.x + (b.x - a.x) * time, y: a.y + (b.y - a.y) * time, z: a.z + (b.z - a.z) * time } });
        next.push({ entityId: vehicle.entityId, fighterId: fighter.id });
      }
    }
    contacts = next;return events;
  }
  return { step, validate, capture: () => contacts.map(contact => ({ ...contact })), restore: (value: TrafficContact[]) => { contacts = value.map(contact => ({ ...contact })); }, reset: () => { contacts = []; } };
}

function sweepBox(start: readonly number[], end: readonly number[], extent: readonly number[]) {
  let first = 0, last = 1;
  for (let axis = 0; axis < 3; axis++) {
    const a = start[axis]!, delta = end[axis]! - a, half = extent[axis]!;
    if (Math.abs(delta) < 1e-10) { if (Math.abs(a) > half) return;continue; }
    const enter = (-half - a) / delta, leave = (half - a) / delta;
    first = Math.max(first, Math.min(enter, leave));last = Math.min(last, Math.max(enter, leave));
    if (first > last) return;
  }
  return first;
}
