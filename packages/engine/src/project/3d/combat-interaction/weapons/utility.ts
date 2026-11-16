import type { CombatConfig, CombatVector } from '../../../../combat/config.ts';
import type { CombatEvent, CombatSnapshot } from '../../../../combat/state.ts';
import { hypot } from '../../../../math/simulation.ts';
import { object } from '../../gameplay-contracts.ts';
import type { CombatInteractions } from '../config.ts';

export type WeaponState = { id: string; owner: string; durability: number; length: number; position: CombatVector; velocity: CombatVector; projectileOwner: string; serial: number; active?: boolean; ammo?: number; spentSerial?: number; effectSerial?: number; terrainContact?: CombatVector };
type Zone = { id: string; weaponId: string; position: CombatVector; radius: number; movementScale: number; remaining: number };
type Slow = { fighterId: string; weaponId: string; movementScale: number; remaining: number };
export type UtilityState = { zones?: Zone[]; slows?: Slow[] };
type Surface = (from: CombatVector, to: CombatVector) => { position: CombatVector; normal?: CombatVector } | undefined;

export function advanceWeaponEffects(saved: UtilityState) {
  saved.zones = (saved.zones ?? []).filter(zone => --zone.remaining > 0);
  saved.slows = (saved.slows ?? []).filter(slow => --slow.remaining > 0);
}

/** Only normal landed spray contacts restrict movement; guard/parry remain useful. */
export function activateWeaponEffect(saved: UtilityState, item: WeaponState, weapon: CombatInteractions['weapons'][number], state: CombatSnapshot, config: CombatConfig, events: readonly CombatEvent[], surface?: Surface) {
  const actor = state.fighters.find(fighter => fighter.id === item.owner), effect = weapon.effect;
  if (!actor || !effect) return;
  const move = config.moves.find(move => move.id === actor.moveId);
  if (weapon.kit === 'ground' && actor.attackSerial === item.spentSerial && move && actor.moveFrame === move.startupFrames + 1 && item.effectSerial !== actor.attackSerial) {
    item.effectSerial = actor.attackSerial;
    // Air deployment is spent, but does not leave an invisible floating hazard.
    if (actor.wasAirborne) return;
    const distance = effect.radius ?? 1.2, length = hypot(actor.facing.x, actor.facing.z) || 1;
    const ahead = { x: actor.position.x + actor.facing.x / length * distance, y: actor.position.y, z: actor.position.z + actor.facing.z / length * distance };
    if (surface?.(actor.position, ahead)) return;
    const support = surface?.({ ...ahead, y: ahead.y + .2 }, { ...ahead, y: ahead.y - 2 });
    if (surface && (!support || (support.normal?.y ?? 1) < .5)) return;
    const position = support?.position ?? ahead;
    (saved.zones ??= []).push({ id: `${item.id}:${actor.attackSerial}`, weaponId: item.id, position: { ...position }, radius: effect.radius ?? 1.2, movementScale: effect.movementScale, remaining: effect.durationFrames });
  }
  if (weapon.kit !== 'spray' || actor.moveId !== weapon.heavyMoveId) return;
  for (const contact of events) {
    if (contact.attackerId !== actor.id || contact.moveId !== weapon.heavyMoveId || !['hit', 'guard-break'].includes(contact.kind)) continue;
    const target = state.fighters.find(fighter => fighter.id === contact.targetId);
    if (!target) continue;
    const slows = saved.slows ??= [];
    const previous = slows.find(slow => slow.fighterId === target.id && slow.weaponId === item.id);
    if (previous) { previous.remaining = effect.durationFrames;previous.movementScale = effect.movementScale; }
    else slows.push({ fighterId: target.id, weaponId: item.id, movementScale: effect.movementScale, remaining: effect.durationFrames });
  }
}

export function weaponMovementScales(saved: UtilityState, state: CombatSnapshot, grounded: ReadonlySet<string>, surface?: Surface) {
  const scales = new Map<string, number>();
  for (const fighter of state.fighters) {
    if (!grounded.has(fighter.id)) continue;
    let scale = 1;
    for (const slow of saved.slows ?? []) if (slow.fighterId === fighter.id) scale = Math.min(scale, slow.movementScale);
    const support = surface && saved.zones?.length ? surface(fighter.position, { ...fighter.position, y: fighter.position.y - 2 }) : undefined;
    for (const zone of saved.zones ?? []) {
      const sameFloor = surface ? support && (support.normal?.y ?? 1) > .5 && Math.abs(support.position.y - zone.position.y) < .15 : Math.abs(fighter.position.y - zone.position.y) <= 2;
      if (!sameFloor || hypot(fighter.position.x - zone.position.x, fighter.position.z - zone.position.z) > zone.radius) continue;
      if (surface?.({ ...zone.position, y: zone.position.y + .15 }, { x: fighter.position.x, y: zone.position.y + .15, z: fighter.position.z })) continue;
      scale = Math.min(scale, zone.movementScale);
    }
    if (scale < 1) scales.set(fighter.id, scale);
  }
  return scales;
}

export function validateWeaponEffects(value: unknown, definition: CombatInteractions, fighterIds: readonly string[]) {
  const saved = object(value);
  for (const key of ['zones', 'slows'] as const) {
    const rows = saved[key];
    if (rows === undefined) continue;
    if (!Array.isArray(rows) || rows.length > (key === 'zones' ? definition.weapons.length : definition.weapons.length * fighterIds.length)) throw Error('Invalid saved weapon effects.');
    const seen = new Set<string>();
    for (const value of rows) {
      const row = object(value), weapon = definition.weapons.find(weapon => weapon.entityId === row.weaponId), effect = weapon?.effect;
      const identity = key === 'zones' ? row.id : `${row.weaponId}:${row.fighterId}`;
      if (!effect || weapon?.kit !== (key === 'zones' ? 'ground' : 'spray') || typeof identity !== 'string' || seen.has(identity)
        || !Number.isInteger(row.remaining) || typeof row.remaining !== 'number' || row.remaining <= 0 || row.remaining > effect.durationFrames || row.movementScale !== effect.movementScale) throw Error('Invalid saved weapon effect.');
      seen.add(identity);
      if (key === 'zones') {
        const position = object(row.position);
        if (typeof row.id !== 'string' || row.id.length > 180 || row.radius !== (effect.radius ?? 1.2) || !['x', 'y', 'z'].every(key => typeof position[key] === 'number' && Number.isFinite(position[key]) && Math.abs(position[key]) <= 1e6)) throw Error('Invalid saved ground zone.');
      } else if (typeof row.fighterId !== 'string' || !fighterIds.includes(row.fighterId)) throw Error('Invalid saved spray slow.');
    }
  }
}
