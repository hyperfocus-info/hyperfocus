import { createFighter, type CombatFighterState, type CombatSnapshot } from "./state.ts";
import { readCombatVector } from './observation-readers.ts';

export function readCombatSnapshot(value: unknown): CombatSnapshot {
  return readSnapshot(value, false);
}

/** Current complete shape without legacy defaults or authored config/move checks. */
export function readCombatSnapshotStructure(value: unknown): CombatSnapshot {
  return readSnapshot(value, true);
}

function readSnapshot(value: unknown, current: boolean): CombatSnapshot {
  const root = record(value, current ? undefined : ["version", "configKey", "frame", "fighters"]);
  if (root.version !== 1) throw new Error("unsupported combat snapshot");
  const fighters = array(root.fighters, 256).map((value): CombatFighterState => {
    const fighter = record(value, current ? undefined : fighterKeys);
    const stunKind = fighter.stunKind;
    if (stunKind !== "" && stunKind !== "hit" && stunKind !== "block" && stunKind !== "parry") throw new Error("invalid combat stun kind");
    if (typeof fighter.guarding !== "boolean") throw new Error("invalid combat guard");
    return {
      ...(current ? fighter : {}),
      hitConfirmed: !current && fighter.hitConfirmed === undefined ? false : boolean(fighter.hitConfirmed),
      attackSide: number(fighter.attackSide), stamina: number(fighter.stamina), locomotionAllowed: boolean(fighter.locomotionAllowed), refunded: boolean(fighter.refunded), influenceDirection: vector(fighter.influenceDirection, current),
      guardMeter: number(fighter.guardMeter), guardBrokenFrames: number(fighter.guardBrokenFrames),
      escapeCharges: number(fighter.escapeCharges), armorFrames: number(fighter.armorFrames), followupFrames: number(fighter.followupFrames),
      techHeld: boolean(fighter.techHeld), techWindowFrames: number(fighter.techWindowFrames), techLockoutFrames: number(fighter.techLockoutFrames),
      protectionFrames: number(fighter.protectionFrames), techDirection: vector(fighter.techDirection, current), strikeIndex: number(fighter.strikeIndex),
      id: string(fighter.id), position: vector(fighter.position, current), facing: vector(fighter.facing, current), health: number(fighter.health),
      wasAirborne: !current && fighter.wasAirborne === undefined ? false : boolean(fighter.wasAirborne), landingFrames: !current && fighter.landingFrames === undefined ? 0 : number(fighter.landingFrames),
      stunFrames: number(fighter.stunFrames), stunKind, guarding: fighter.guarding, guardStarted: number(fighter.guardStarted),
      moveId: string(fighter.moveId), moveFrame: number(fighter.moveFrame), chargeFrames: !current && fighter.chargeFrames === undefined ? 0 : number(fighter.chargeFrames), charging: !current && fighter.charging === undefined ? false : boolean(fighter.charging), attackSerial: number(fighter.attackSerial),
      hitTargets: array(fighter.hitTargets, 256).map((value) => string(value)),
      history: array(fighter.history, 4096).map((value) => { const entry = record(value, current ? undefined : ["key", "frame", "direction", "side", "drive", "airborne", "dashing"]); const direction = entry.direction; if (direction !== "neutral" && direction !== "toward" && direction !== "away" && direction !== "side") throw new Error("invalid input direction"); return { ...(current ? entry : {}), ...(entry.dashing === undefined ? {} : { dashing: boolean(entry.dashing) }), key: string(entry.key), frame: number(entry.frame), direction, side: number(entry.side), drive: boolean(entry.drive), airborne: boolean(entry.airborne) }; }),
    };
  });
  const snapshot: CombatSnapshot = { ...(current ? root : {}), version: 1, configKey: string(root.configKey, 1_000_000), frame: number(root.frame), fighters };
  return current ? structuredClone(snapshot) : snapshot;
}
function record(value: unknown, keys?: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid combat snapshot object");
  if (keys && Object.keys(value).some((key) => !keys.includes(key))) throw new Error("unknown combat snapshot field");
  return Object.fromEntries(Object.entries(value));
}
function array(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error("invalid combat snapshot array");
  return value;
}
function string(value: unknown, maximum = 128) {
  if (typeof value !== "string" || value.length > maximum) throw new Error("invalid combat snapshot string");
  return value;
}
function number(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("invalid combat snapshot number");
  return value;
}
function vector(value: unknown, current = false) { if (current) return readCombatVector(value);const result = record(value, ["x", "y", "z"]); return { x: number(result.x), y: number(result.y), z: number(result.z) }; }

function boolean(value: unknown) { if (typeof value !== "boolean") throw new Error("invalid combat snapshot boolean"); return value; }


const fighterKeys = Object.keys(createFighter({ id: "schema", position: { x: 0, y: 0, z: 0 } }, 0));
