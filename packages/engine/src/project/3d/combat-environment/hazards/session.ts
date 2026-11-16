import type { CombatEvent, CombatSnapshot } from '../../../../combat/state.ts';
import { cos, sin } from '../../../../math/simulation.ts';
import type { RigidWorld3D } from '../../../../physics/rigid-3d.ts';
import type { Hyperfocus3DDeclaration } from '../../declaration.ts';
import type { CombatHazard } from './config.ts';

type Entity = Hyperfocus3DDeclaration['scenes'][number]['entities'][number];
type Contact = { entityId: string; fighterId: string; active: boolean; nextDamageFrame: number };
type Trace = { entityId: string; fighterId: string; frame: number; kind: 'enter' | 'exit' | 'damage'; damage: number };
export type HazardState = { frame: number; contacts: Contact[]; trace: Trace[] };

/** Stationary, visibly authored volumes. This does not add physics bodies or alter impact travel. */
export function createCombatHazards(options: { hazards: readonly CombatHazard[]; entities: readonly Entity[]; world: RigidWorld3D; removed: (id: string) => boolean }) {
  const entities = new Map(options.entities.map(entity => [entity.id, entity]));
  const initial = (): HazardState => ({ frame: -1, contacts: [], trace: [] });
  let saved = initial();
  const groundSpeedScales = new Map<string, number>();
  function append(contact: Contact, kind: Trace['kind'], damage = 0) {
    saved.trace.push({ entityId: contact.entityId, fighterId: contact.fighterId, frame: saved.frame, kind, damage });
    if (saved.trace.length > 128) saved.trace.shift();
  }
  function step(state: CombatSnapshot, grounded: ReadonlySet<string>): CombatEvent[] {
    const events: CombatEvent[] = [];
    if (state.frame <= saved.frame) return events;
    saved.frame = state.frame;groundSpeedScales.clear();
    for (const hazard of options.hazards) {
      const zone = entities.get(hazard.entityId)!;
      const enabled = !hazard.activationSurfaceId || options.removed(hazard.activationSurfaceId);
      const c = cos(zone.rotationY), s = sin(zone.rotationY);
      for (const fighter of state.fighters) {
        const actor = options.world.body(fighter.id);
        if (!actor) continue;
        const halfY = actor.shape.kind === 'sphere' ? actor.shape.radius : actor.shape.halfY;
        const radius = actor.shape.kind === 'sphere' ? actor.shape.radius : Math.max(actor.shape.halfX, actor.shape.halfZ);
        const dx = fighter.position.x - zone.position[0], dz = fighter.position.z - zone.position[2];
        const inside = enabled && fighter.health > 0 && Math.abs(dx * c - dz * s) < zone.scale[0] + radius && Math.abs(dx * s + dz * c) < zone.scale[2] + radius && Math.abs(fighter.position.y - zone.position[1]) < zone.scale[1] + halfY;
        let contact = saved.contacts.find(row => row.entityId === hazard.entityId && row.fighterId === fighter.id);
        if (!inside && !contact) continue;
        if (!contact) { contact = { entityId: hazard.entityId, fighterId: fighter.id, active: false, nextDamageFrame: 0 };saved.contacts.push(contact); }
        if (inside !== contact.active) { contact.active = inside;append(contact, inside ? 'enter' : 'exit'); }
        if (!inside || fighter.protectionFrames > 0) continue;
        if (hazard.kind === 'flood') {
          if (grounded.has(fighter.id)) groundSpeedScales.set(fighter.id, Math.min(groundSpeedScales.get(fighter.id) ?? 1, hazard.groundSpeedScale));
        } else if (state.frame >= contact.nextDamageFrame) {
          // Keep this deadline on exit. Boundary tapping cannot multiply damage.
          contact.nextDamageFrame = state.frame + hazard.intervalFrames;
          const damage = Math.min(fighter.health, hazard.damage);fighter.health -= damage;append(contact, 'damage', damage);
          events.push({ id: `${state.frame}:fire:${hazard.entityId}:${fighter.id}`, frame: state.frame, attackerId: hazard.entityId, environmentId: hazard.entityId, targetId: fighter.id,
            moveId: '', kind: 'hit', defenseReason: 'fire-exposure', damage, hitstunFrames: 0, impulse: { x: 0, y: 0, z: 0 }, contactPoint: { ...fighter.position } });
        }
      }
    }
    return events;
  }
  function validate(value: unknown): HazardState {
    if (value === undefined) return initial();
    if (!value || typeof value !== 'object' || !('frame' in value) || typeof value.frame !== 'number' || !Number.isSafeInteger(value.frame) || value.frame < -1 || !('contacts' in value) || !Array.isArray(value.contacts) || value.contacts.length > options.hazards.length * 16 || !('trace' in value) || !Array.isArray(value.trace) || value.trace.length > 128) throw Error('Invalid hazard snapshot.');
    const frame = value.frame;
    const identity = (row: unknown): row is { entityId: string; fighterId: string } => !!row && typeof row === 'object' && 'entityId' in row && options.hazards.some(hazard => hazard.entityId === row.entityId) && 'fighterId' in row && typeof row.fighterId === 'string' && !!row.fighterId && row.fighterId.length <= 128 && options.world.body(row.fighterId)?.type === 'dynamic';
    const seen = new Set<string>();
    const contacts = value.contacts.map((row: unknown): Contact => {
      if (!identity(row) || !('active' in row) || typeof row.active !== 'boolean' || !('nextDamageFrame' in row) || typeof row.nextDamageFrame !== 'number' || !Number.isSafeInteger(row.nextDamageFrame) || row.nextDamageFrame < 0 || row.nextDamageFrame > frame + 3600 || Object.keys(row).some(key => !['entityId', 'fighterId', 'active', 'nextDamageFrame'].includes(key))) throw Error('Invalid hazard contact.');
      const key = row.entityId + '\0' + row.fighterId;if (seen.has(key)) throw Error('Duplicate hazard contact.');seen.add(key);
      return { entityId: row.entityId, fighterId: row.fighterId, active: row.active, nextDamageFrame: row.nextDamageFrame };
    });
    const trace = value.trace.map((row: unknown): Trace => {
      if (!identity(row) || !('frame' in row) || typeof row.frame !== 'number' || !Number.isSafeInteger(row.frame) || row.frame < 0 || row.frame > frame || !('kind' in row) || row.kind !== 'enter' && row.kind !== 'exit' && row.kind !== 'damage' || !('damage' in row) || typeof row.damage !== 'number' || !Number.isFinite(row.damage) || row.damage < 0 || row.damage > 100 || Object.keys(row).some(key => !['entityId', 'fighterId', 'frame', 'kind', 'damage'].includes(key))) throw Error('Invalid hazard trace.');
      return { entityId: row.entityId, fighterId: row.fighterId, frame: row.frame, kind: row.kind, damage: row.damage };
    });
    if (trace.some((row, index) => index > 0 && row.frame < trace[index - 1]!.frame)) throw Error('Hazard trace must be chronological.');
    return { frame, contacts, trace };
  }
  return { step, validate, groundSpeedScales, get current(): Readonly<HazardState> { return saved; }, capture: () => structuredClone(saved), restore(value: HazardState) { saved = structuredClone(value);groundSpeedScales.clear(); }, reset() { saved = initial();groundSpeedScales.clear(); } };
}
