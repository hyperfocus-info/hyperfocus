import { atan2, cos, hypot, sin } from '../math/simulation.ts';
import { createCombatPreset, frameCount, type CombatConfig, type CombatVector } from "./config.ts";
import { readCombatConfig } from "./read.ts";
import { readCombatSnapshot } from "./snapshot.ts";
import { copyPosition, createFighter, normalizeFacing, type CombatCollision, type CombatContact, type CombatEvent, type CombatFighter, type CombatInput, type CombatSnapshot } from "./state.ts";
import { resolveCollisions } from "./tech.ts";
import { advanceFighter, resolveContacts } from "./step.ts";

/** Host owns movement/physics. Call once per fixed tick; replay returns identical event IDs. */
export function createCombatSimulation({ config = createCombatPreset(), fighters: initial }: { config?: CombatConfig; fighters: CombatFighter[] }) {
  const settings = readCombatConfig(config);
  const configKey = JSON.stringify(settings);
  let fighters = initial.map((fighter) => createFighter(fighter, settings.maxHealth)).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  for (const fighter of fighters) { fighter.stamina = settings.maxStamina ?? 0; fighter.guardMeter = settings.maxGuard ?? 0; fighter.escapeCharges = settings.escapeCharges ?? 0; }
  const ids = new Set(fighters.map((fighter) => fighter.id));
  if (!fighters.length || fighters.length > 256 || ids.size !== fighters.length) throw new Error("combat requires 1Ã¢â‚¬â€œ256 unique fighter ids");
  let frame = 0;
  function capture(): CombatSnapshot {
    // The schema's other fields are primitives; keep immutable config text out of the clone serializer.
    return { version: 1, configKey, frame, fighters: fighters.map(fighter => ({
      ...fighter, position: { ...fighter.position }, facing: { ...fighter.facing },
      influenceDirection: { ...fighter.influenceDirection }, techDirection: { ...fighter.techDirection },
      hitTargets: [...fighter.hitTargets], history: fighter.history.map(entry => ({ ...entry })),
    })) };
  }
  function restore({ snapshot: value }: { snapshot: unknown }) {
    const snapshot = readCombatSnapshot(value);
    frameCount(snapshot.frame, "snapshot.frame");
    if (snapshot.version !== 1 || snapshot.configKey !== configKey || snapshot.fighters.length !== ids.size || new Set(snapshot.fighters.map((fighter) => fighter.id)).size !== ids.size) throw new Error("incompatible combat snapshot");
    for (const fighter of snapshot.fighters) {
      if (!ids.has(fighter.id) || !Number.isFinite(fighter.health) || fighter.health < 0 || fighter.health > settings.maxHealth || (fighter.moveId && !settings.moves.some((move) => move.id === fighter.moveId))) throw new Error("invalid combat snapshot fighter");
      copyPosition(fighter.position); normalizeFacing(fighter.facing);
      if (Math.abs(hypot(fighter.facing.x, fighter.facing.y, fighter.facing.z) - 1) > 1e-8) throw new Error('invalid combat snapshot facing');
      if (!["", "hit", "block", "parry"].includes(fighter.stunKind) || typeof fighter.guarding !== "boolean" || !Number.isSafeInteger(fighter.guardStarted) || fighter.guardStarted < -1 || fighter.guardStarted > snapshot.frame) throw new Error("invalid combat snapshot guard");
      for (const count of [fighter.landingFrames, fighter.moveFrame, fighter.attackSerial, fighter.stunFrames, fighter.guardBrokenFrames, fighter.escapeCharges, fighter.armorFrames, fighter.followupFrames, fighter.techWindowFrames, fighter.techLockoutFrames, fighter.protectionFrames]) frameCount(count, "snapshot counter");
      if (fighter.guardMeter < 0 || fighter.guardMeter > (settings.maxGuard ?? 0) || fighter.escapeCharges > (settings.escapeCharges ?? 0) || !Number.isSafeInteger(fighter.strikeIndex) || fighter.strikeIndex < -1 || fighter.strikeIndex > 31) throw new Error("invalid combat defense snapshot");
      if (fighter.attackSide !== -1 && fighter.attackSide !== 1) throw new Error("invalid attack side");
      if (fighter.stamina < 0 || fighter.stamina > (settings.maxStamina ?? 0) || hypot(fighter.influenceDirection.x, fighter.influenceDirection.y, fighter.influenceDirection.z) > 1.00000001) throw new Error("invalid combat stamina or influence");
      const move = settings.moves.find((entry) => entry.id === fighter.moveId);
      frameCount(fighter.chargeFrames, 'chargeFrames');
      if (fighter.chargeFrames > 120 || fighter.charging && (!move || move.chargeMode === 'travel' || fighter.chargeFrames > (move.chargeFrames ?? 0) || fighter.moveFrame !== Math.ceil(move.startupFrames * .6))) throw new Error('invalid combat charge snapshot');
      if ((move && fighter.moveFrame > move.startupFrames + move.activeFrames + move.recoveryFrames) || (!move && fighter.moveFrame !== 0) || fighter.attackSerial > snapshot.frame) throw new Error("invalid combat snapshot move timing");
      if (fighter.hitTargets.some((id) => !ids.has(id))) throw new Error("invalid combat snapshot hit target");
      for (const entry of fighter.history) {
        if (entry.side !== -1 && entry.side !== 1) throw new Error("invalid buffered side");
        frameCount(entry.frame, "input frame");
        if (entry.frame > snapshot.frame || typeof entry.key !== "string") throw new Error("invalid combat snapshot input");
      }
    }
    // readCombatSnapshot already owns every validated object, vector and history entry.
    fighters = snapshot.fighters.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    frame = snapshot.frame;
  }
  function step({ inputs = [], poses = [], contacts, collisions = [], attackReachScales = {}, attackArcDegrees = {}, attackVisibility }: { inputs?: CombatInput[]; poses?: (Omit<CombatFighter, "id"> & { fighterId: string; airborne?: boolean; /** Metres/second at contact; omitted means stationary. */ velocity?: CombatVector })[]; contacts?: CombatContact[]; collisions?: CombatCollision[]; attackReachScales?: Record<string, number>; attackArcDegrees?: Record<string, number>; attackVisibility?: (from: CombatVector, to: CombatVector) => boolean } = {}) {
    for (const [id, scale] of Object.entries(attackReachScales)) if (!ids.has(id) || !Number.isFinite(scale) || scale < 0) throw new Error('attack reach scales require known fighters and finite nonnegative values');
    for (const [id, degrees] of Object.entries(attackArcDegrees)) if (!ids.has(id) || !Number.isFinite(degrees) || degrees <= 0 || degrees > 180) throw Error('Attack sector overrides require known fighters and angles in (0, 180].');
    if (attackVisibility !== undefined && typeof attackVisibility !== 'function') throw Error('Attack visibility must be a host query.');
    const inputIds = new Set<string>();
    for (const input of inputs) {
      if (!ids.has(input.fighterId) || inputIds.has(input.fighterId)) throw new Error("inputs need unique known fighter ids");
      if (input.guard !== undefined && typeof input.guard !== 'boolean') throw new Error("combat guard must be a boolean");
      if ((input.pressed?.length ?? 0) > 32 || input.pressed?.some((key) => typeof key !== "string" || !key || key.length > 128)) throw new Error("combat accepts up to 32 named presses per frame");
      if (input.held !== undefined && (!Array.isArray(input.held) || input.held.length > 32 || input.held.some(key => typeof key !== 'string' || !key || key.length > 128))) throw new Error('invalid held combat commands');
      if (input.tech !== undefined && typeof input.tech !== "boolean") throw new Error("combat tech must be a boolean");
      for (const key of ["drive", "airborne", "guardFresh", "idle", "dashing", "dashStart"] as const) if (input[key] !== undefined && typeof input[key] !== "boolean") throw new Error("invalid combat input boolean");
      if (input.locomotionCost !== undefined && (!Number.isFinite(input.locomotionCost) || input.locomotionCost < 0)) throw new Error("invalid locomotion cost");
      if (input.direction) copyPosition(input.direction);
      if (input.influenceDirection) { const direction = copyPosition(input.influenceDirection);if (hypot(direction.x, direction.y, direction.z) > 1.000001) throw Error('Influence direction must be bounded'); }
      inputIds.add(input.fighterId);
    }
    const prepared = poses.map((pose) => {
      if (!ids.has(pose.fighterId)) throw new Error("unknown combat pose fighter");
      if (pose.airborne !== undefined && typeof pose.airborne !== 'boolean') throw new Error('invalid combat pose airborne');
      return { fighterId: pose.fighterId, position: copyPosition(pose.position), facing: pose.facing ? normalizeFacing(pose.facing) : undefined, velocity: pose.velocity ? copyPosition(pose.velocity) : undefined };
    });
    for (const contact of contacts ?? []) if (!ids.has(contact.attackerId) || !ids.has(contact.targetId)) throw new Error("unknown combat contact fighter");
    const collisionIds = new Set<string>();
    for (const collision of collisions) {
      if (!ids.has(collision.fighterId) || collisionIds.has(collision.fighterId)) throw new Error("collisions require unique known fighters");
      normalizeFacing(collision.normal);
      if (collision.contactPoint) copyPosition(collision.contactPoint);
      if (collision.impulse !== undefined && (!Number.isFinite(collision.impulse) || collision.impulse < 0)) throw new Error("invalid collision impulse");
      collisionIds.add(collision.fighterId);
    }
    for (const pose of prepared) {
      const fighter = fighters.find((entry) => entry.id === pose.fighterId);
      if (fighter) {
        fighter.position = pose.position;
        if (pose.facing) {
          const blocked = fighter.stunKind === 'block' && fighter.stunFrames > 0;
          const guarding = !fighter.moveId && !fighter.guardBrokenFrames && inputs.some(input => input.fighterId === fighter.id && input.guard);
          if ((blocked || guarding) && settings.guardTurnSpeed !== undefined) {
            const yaw = atan2(fighter.facing.z, fighter.facing.x), desired = atan2(pose.facing.z, pose.facing.x);
            const delta = atan2(sin(desired - yaw), cos(desired - yaw)), limit = settings.guardTurnSpeed * Math.PI / 10800;
            const turn = Math.max(-limit, Math.min(limit, delta));
            fighter.facing = { x: cos(yaw + turn), y: 0, z: sin(yaw + turn) };
          } else if (!blocked) fighter.facing = pose.facing;
        }
      }
    }
    const actions: CombatEvent[] = [];
    for (const fighter of fighters) {
      const charges = fighter.escapeCharges;
      advanceFighter(fighter, inputs.find((input) => input.fighterId === fighter.id), settings, frame);
      if (fighter.escapeCharges < charges) actions.push({ id: `${frame}:escape:${fighter.id}`, frame,
        attackerId: fighter.id, targetId: fighter.id, moveId: fighter.moveId, kind: "escape", damage: 0, impulse: { x: 0, y: 0, z: 0 } });
    }
    for (const fighter of fighters) {
      const move = settings.moves.find(entry => entry.id === fighter.moveId);
      if (!move || !move.startupTracking || fighter.moveFrame >= move.startupFrames || fighter.stunFrames || fighter.health <= 0) continue;
      let target: typeof fighter | undefined, nearest = Infinity;
      for (const other of fighters) {
        if (other.id === fighter.id || other.health <= 0) continue;
        const distance = (other.position.x-fighter.position.x) ** 2 + (other.position.z-fighter.position.z) ** 2;
        if (distance < nearest) { target = other;nearest = distance; }
      }
      if (!target) continue;
      const yaw = atan2(fighter.facing.z, fighter.facing.x), desired = atan2(target.position.z-fighter.position.z,target.position.x-fighter.position.x);
      const delta = atan2(sin(desired-yaw),cos(desired-yaw));
      const turn = Math.max(-move.startupTracking, Math.min(move.startupTracking, delta));
      const length = hypot(fighter.facing.x,fighter.facing.z);
      fighter.facing.x = cos(yaw+turn)*length;fighter.facing.z = sin(yaw+turn)*length;
    }
    const collisionEvents = resolveCollisions(fighters, collisions, settings, frame);
    const events = resolveContacts(fighters, settings, frame, contacts, new Set(poses.filter(pose => pose.airborne === false).map(pose => pose.fighterId)), attackReachScales, new Map(prepared.map(pose => [pose.fighterId, pose.velocity])), attackArcDegrees, attackVisibility);
    frame++;
    return [...actions, ...collisionEvents, ...events];
  }
  return { step, capture, restore, inspect: capture };
}
