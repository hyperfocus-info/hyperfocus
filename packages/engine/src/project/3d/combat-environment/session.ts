import { createCombatHazards, type HazardState } from './hazards/session.ts';
import type { CombatSnapshot } from '../../../combat/state.ts';
import type { RigidWorld3D, RigidContact3D } from '../../../physics/rigid-3d.ts';
import type { CombatEnvironment } from './config.ts';
import type { CombatConfig } from '../../../combat/config.ts';
import { createWeaponSurfaceProbe } from '../combat-interaction/surfaces.ts';
import { createCombatTraffic, type TrafficContact } from './traffic.ts';
import type { Hyperfocus3DDeclaration } from '../declaration.ts';
import { createVehicleMotion, type VehicleStop } from './vehicles/vehicle-motion.ts';
import { readCombatEnvironmentState3D } from './snapshot.ts';

type Transition = { frame: number; entityId: string; kind: 'warning' | 'removed'; cause: 'impact' | 'scheduled'; actor: string; speed: number };
type Saved = { frame: number; surfaces: Array<{ entityId: string; phase: 'intact' | 'warning' | 'removed' }>; trace: Transition[]; attackContacts?: string[]; traffic?: TrafficContact[]; vehicleStops?: VehicleStop[]; hazards?: HazardState };
export type TerrainAttackContact = { frame: number; actor: string; entityId: string; moveId: string; position: { x: number; y: number; z: number } };

/** Topology stays stable: removed surfaces have no collision mask for save/rollback. */
export function createCombatEnvironment(options: { definition: CombatEnvironment; world: RigidWorld3D; entityIds: readonly string[]; entities?: readonly Hyperfocus3DDeclaration['scenes'][number]['entities'][number][] }) {
  const { definition, world } = options;
  const definitions = new Map(definition.surfaces.map(surface => [surface.entityId, surface])), entityIds = new Set(options.entityIds);
  for (const surface of definition.surfaces) for (const id of surface.stopMotionIds ?? []) if (world.body(id)) definitions.set(id, surface);
  const vehicles = createVehicleMotion({ definition, world, entities: options.entities ?? [] });
  const traffic = createCombatTraffic({ definition, world, entities: options.entities ?? [], stopped: vehicles.has });
  const initial: Saved = { frame: 0, surfaces: definition.surfaces.map(surface => ({ entityId: surface.entityId, phase: 'intact' })), trace: [] };
  const originals = new Map(definition.surfaces.map(surface => {
    const body = world.body(surface.entityId);
    if (!body || body.type !== 'static' || body.trigger) throw new Error(`Environment surface ${surface.entityId} needs a solid static body.`);
    for (const id of [...surface.revealIds ?? [], ...surface.debrisIds ?? [], ...surface.warningIds ?? [], ...surface.hideIds ?? [], ...surface.toolIds ?? []]) {
      if (!entityIds.has(id) || world.body(id)) throw new Error(`Environment feedback ${id} needs a render-only scene entity.`);
    }
    return [surface.entityId, { collisionMask: body.collisionMask }];
  }));
  let saved = structuredClone(initial), transitions: Transition[] = [], motionTransitions: Transition[] = [];
  let phases = new Map(saved.surfaces.map(surface => [surface.entityId, surface]));
  const hazards = createCombatHazards({ hazards: definition.hazards ?? [], entities: options.entities ?? [], world, removed: id => phases.get(id)?.phase === 'removed' });
  const probe = createWeaponSurfaceProbe(world, options.entityIds.filter(id => world.body(id)?.type === 'static'));
  const impactProbe = createWeaponSurfaceProbe(world, [...definitions].filter(([, surface]) => surface.trigger.kind === 'impact').map(([id]) => id));
  const contact: RigidContact3D = { a: 0, b: 0, aId: '', bId: '', normalX: 0, normalY: 0, normalZ: 0, penetration: 0, pointX: 0, pointY: 0, pointZ: 0, trigger: false, closingSpeedMetersPerSecond: 0, effectiveMassKg: 0, impactEnergyJoules: 0, normalImpulseNewtonSeconds: 0, breakthrough: false };
  function sync() {
    phases = new Map(saved.surfaces.map(surface => [surface.entityId, surface]));
    for (const surface of saved.surfaces) world.configureBody(surface.entityId, surface.phase === 'removed' && !definitions.get(surface.entityId)?.stopMotionIds ? { collisionMask: 0 } : originals.get(surface.entityId)!);
  }
  function change(entityId: string, kind: Transition['kind'], cause: Transition['cause'], actor = '', speed = 0) {
    phases.get(entityId)!.phase = kind === 'removed' ? 'removed' : 'warning';
    if (kind === 'removed') { if (definitions.get(entityId)?.stopMotionIds) vehicles.stop(entityId);else world.configureBody(entityId, { collisionMask: 0 }); }
    const event = { frame: saved.frame, entityId, kind, cause, actor, speed };
    saved.trace.push(event);transitions.push(event);
    if (saved.trace.length > 128) saved.trace.shift();
    return event;
  }
  function platformPositions(tick: number, seed: number) {
    const positions = vehicles.plan(tick, seed);
    for (const impact of vehicles.impacts) {
      if (phases.get(impact.entityId)?.phase !== 'removed') {
        // Motion runs after this tick's audio consumer. Keep presentation only until
        // its next pass; the damage and trace already belong to the atomic save.
        const event = change(impact.entityId, 'removed', 'impact', impact.blockerId, impact.speed);
        if (motionTransitions.length < 128) motionTransitions.push(event);
      }
    }
    vehicles.clearImpacts();
    return positions;
  }
  function step(combat: CombatSnapshot) {
    transitions = motionTransitions;motionTransitions = [];saved.frame = combat.frame;
    for (const surface of definition.surfaces) {
      const state = phases.get(surface.entityId)!;
      if (state.phase === 'removed') continue;
      const trigger = surface.trigger;
      if (trigger.kind === 'scheduled') {
        if (combat.frame >= trigger.warningFrame && state.phase === 'intact') change(surface.entityId, 'warning', 'scheduled');
        if (combat.frame >= trigger.removeFrame) change(surface.entityId, 'removed', 'scheduled');
      }
    }
    const fighters = new Map(combat.fighters.map(fighter => [fighter.id, fighter]));
    for (let index = 0; index < world.contactCount(); index++) {
        world.contact(index, contact);
        const surface = definitions.get(contact.aId) ?? definitions.get(contact.bId);
        if (!surface || phases.get(surface.entityId)!.phase === 'removed' || surface.trigger.kind !== 'impact' || contact.trigger || contact.closingSpeedMetersPerSecond < surface.trigger.minSpeed) continue;
        const actor = definitions.has(contact.aId) ? contact.bId : contact.aId;
        const fighter = fighters.get(actor);
        if (!fighter || fighter.stunKind !== 'hit' || fighter.health <= 0) continue;
        change(surface.entityId, 'removed', 'impact', actor, contact.closingSpeedMetersPerSecond);
        if (surface.stopMotionIds) continue;
        // Preserve the launch through the opened surface instead of retaining the solver's stop/bounce.
        const body = world.body(actor)!;
        const sign = (body.x - contact.pointX) * contact.normalX + (body.y - contact.pointY) * contact.normalY + (body.z - contact.pointZ) * contact.normalZ >= 0 ? 1 : -1;
        const nx = contact.normalX * sign, ny = contact.normalY * sign, nz = contact.normalZ * sign;
        const outward = body.velocityX * nx + body.velocityY * ny + body.velocityZ * nz;
        const correction = outward + contact.closingSpeedMetersPerSecond * .85;
        world.setVelocity(actor, body.velocityX - nx * correction, body.velocityY - ny * correction, body.velocityZ - nz * correction);
    }
  }
  function validate(value: unknown): Saved {
    if (value === undefined) return structuredClone(initial);
    if (!value || typeof value !== 'object' || !('frame' in value) || typeof value.frame !== 'number' || !Number.isSafeInteger(value.frame) || value.frame < 0 || !('surfaces' in value) || !Array.isArray(value.surfaces) || value.surfaces.length !== initial.surfaces.length || !('trace' in value) || !Array.isArray(value.trace) || value.trace.length > 128) throw new Error('Invalid environment snapshot.');
    const surfaces = value.surfaces.map((surface: unknown, index: number): Saved['surfaces'][number] => {
      if (!surface || typeof surface !== 'object' || !('entityId' in surface) || surface.entityId !== initial.surfaces[index]!.entityId || !('phase' in surface) || surface.phase !== 'intact' && surface.phase !== 'warning' && surface.phase !== 'removed') throw new Error('Invalid saved environment surface.');
      return { entityId: initial.surfaces[index]!.entityId, phase: surface.phase };
    });
    const frame = value.frame;
    const trace = value.trace.map((entry: unknown): Transition => {
      if (!entry || typeof entry !== 'object' || !('frame' in entry) || typeof entry.frame !== 'number' || !Number.isSafeInteger(entry.frame) || entry.frame < 0 || entry.frame > frame || !('entityId' in entry) || typeof entry.entityId !== 'string' || !originals.has(entry.entityId) || !('kind' in entry) || entry.kind !== 'warning' && entry.kind !== 'removed' || !('cause' in entry) || entry.cause !== 'impact' && entry.cause !== 'scheduled' || !('actor' in entry) || typeof entry.actor !== 'string' || entry.actor.length > 160 || !('speed' in entry) || typeof entry.speed !== 'number' || !Number.isFinite(entry.speed) || entry.speed < 0) throw new Error('Invalid environment causal trace.');
      return { frame: entry.frame, entityId: entry.entityId, kind: entry.kind, cause: entry.cause, actor: entry.actor, speed: entry.speed };
    });
    const attackContacts = 'attackContacts' in value ? value.attackContacts : [];
    if (!Array.isArray(attackContacts) || attackContacts.length > 512 || attackContacts.some(key => typeof key !== 'string' || key.length > 512)) throw new Error('Invalid terrain attack contacts.');
    const vehicleStops = vehicles.validate('vehicleStops' in value ? value.vehicleStops : undefined);
    for (const surface of surfaces) if (definitions.get(surface.entityId)?.stopMotionIds && (surface.phase === 'removed') !== vehicleStops.some(stop => stop.entityId === surface.entityId && stop.cause === 'impact')) throw new Error('Wreck phase must match its stopped motion.');
    const hazardState = definition.hazards?.length ? hazards.validate('hazards' in value ? value.hazards : undefined) : undefined;
    if (hazardState && hazardState.frame > frame) throw Error('Hazard state cannot be ahead of its environment.');
    return readCombatEnvironmentState3D({ frame: value.frame, surfaces, trace, ...(hazardState ? { hazards: hazardState } : {}), ...(attackContacts.length ? { attackContacts: [...attackContacts] } : {}), ...(definition.traffic?.length ? { traffic: traffic.validate('traffic' in value ? value.traffic : undefined) } : {}), ...(vehicleStops.length ? { vehicleStops } : {}) });
  }
  function attack(combat: CombatSnapshot, config: CombatConfig, reachScales: Readonly<Record<string, number>> = {}) {
    saved.frame = combat.frame;
    const contacts: TerrainAttackContact[] = [];
    for (const fighter of combat.fighters) {
      const move = config.moves.find(move => move.id === fighter.moveId);
      // Called after combat advances moveFrame; inspect the volume that was active this tick.
      const activeFrame = fighter.moveFrame - 1 - (move?.startupFrames ?? 0);
      if (!move || fighter.health <= 0 || fighter.stunFrames || move.damage <= 0 || activeFrame < 0 || activeFrame >= move.activeFrames) continue;
      const reach = move.reach * (reachScales[fighter.id] ?? 1);
      const center = { x: fighter.position.x + fighter.facing.x * reach, y: fighter.position.y + fighter.facing.y * reach, z: fighter.position.z + fighter.facing.z * reach };
      const obstruction = probe(fighter.position, center, 0);
      const hit = impactProbe(center, { ...center, y: center.y + (move.hitHeight ?? 0) }, move.hitRadius, obstruction?.id);
      if (!hit || obstruction && obstruction.id !== hit.id) continue;
      const strike = move.strikeFrames?.filter(frame => frame <= activeFrame).length ?? 1;
      const key = JSON.stringify([fighter.id, fighter.attackSerial, move.id, strike, hit.id]);
      if (saved.attackContacts?.includes(key)) continue;
      (saved.attackContacts ??= []).push(key);if (saved.attackContacts.length > 512) saved.attackContacts.shift();
      contacts.push({ frame: combat.frame, actor: fighter.id, entityId: hit.id, moveId: move.id, position: hit.position });
      const surface = definitions.get(hit.id);
      if (!surface || surface.trigger.kind !== 'impact') continue;
      if (phases.get(surface.entityId)?.phase === 'removed') continue;
      change(surface.entityId, phases.get(surface.entityId)?.phase === 'warning' || move.impulse >= surface.trigger.minSpeed ? 'removed' : 'warning', 'impact', fighter.id, move.impulse);
    }
    return contacts;
  }
  return { step, attack, audioInactive: (id: string) => phases.get(id)?.phase === 'removed' || vehicles.has(id), hazardAudio: () => ({ state: hazards.current, activeIds: (definition.hazards ?? []).filter(hazard => !hazard.activationSurfaceId || phases.get(hazard.activationSurfaceId)?.phase === 'removed').map(hazard => hazard.entityId) }), removed: (id: string) => phases.get(id)?.phase === 'removed', hazards: hazards.step, groundSpeedScales: hazards.groundSpeedScales, traffic(...args: Parameters<typeof traffic.step>) { vehicles.setClock(args[4], args[5]);return traffic.step(...args); }, platformPositions, validate, capture: () => ({ ...structuredClone(saved), ...(definition.hazards?.length ? { hazards: hazards.capture() } : {}), ...(definition.traffic?.length ? { traffic: traffic.capture() } : {}), ...(vehicles.positions.size ? { vehicleStops: vehicles.capture() } : {}) }), get transitions() { return transitions; }, restore(value: Saved) { saved = structuredClone(value);hazards.restore(value.hazards ?? hazards.validate(undefined));traffic.restore(value.traffic ?? []);vehicles.restore(value.vehicleStops ?? []);transitions = [];motionTransitions = [];sync(); }, reset() { saved = structuredClone(initial);hazards.reset();traffic.reset();vehicles.reset();transitions = [];motionTransitions = [];sync(); } };
}
