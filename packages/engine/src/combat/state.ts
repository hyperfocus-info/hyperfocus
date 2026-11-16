import { hypot } from '../math/simulation.ts';
import type { CombatDirection, CombatVector } from "./config.ts";

export type CombatFighter = { id: string; position: CombatVector; facing?: CombatVector };
export type CombatInput = { fighterId: string; pressed?: string[]; held?: string[]; guard?: boolean; guardFresh?: boolean; tech?: boolean; direction?: CombatVector; influenceDirection?: CombatVector; dashing?: boolean; dashStart?: boolean; drive?: boolean; airborne?: boolean; idle?: boolean; locomotionCost?: number };
export type CombatCollision = { fighterId: string; normal: CombatVector; impulse?: number; contactPoint?: CombatVector };
export type CombatContact = { attackerId: string; targetId: string };
export type CombatEvent = CombatContact & {
  id: string;
  frame: number;
  moveId: string;
  kind: "hit" | "block" | "parry" | "guard-break" | "tech" | "bounce" | "escape";
  guardDamage?: number;
  /** A physical arena actor caused this contact; attackerId is that actor, never the opponent. */
  environmentId?: string;
  /** Observed resolution cause, for replays/debugging; never prescribes a counterfactual. */
  defenseReason?: 'guard-not-held' | 'outside-guard-arc' | 'guard-broken' | 'attack-commitment' | 'hit-recoil' | 'parry-recoil' | 'fresh-parry' | 'held-block' | 'surface-recovery' | 'missed-surface-recovery' | 'grapple-teched' | 'grapple-not-teched' | 'traffic-impact' | 'fire-exposure' | 'out-of-bounds';
  /** A hit interrupted startup or an active attack; presentation metadata, not bonus damage. */
  counter?: true;
  /** Duration resolved by this contact, not the target's accumulated remaining stun. */
  hitstunFrames?: number;
  /** Damage landed while armor prevented interruption and launch. */
  armored?: true;
  /** World-space attack contact anchor, retained for effects after knockback. */
  contactPoint?: CombatVector;
  /** Collision surface normal for world-anchored recovery feedback. */
  contactNormal?: CombatVector;
  damage: number;
  impulse: CombatVector;
  /** Unsteered launch retained for the host's bounded late-input correction. */
  baseImpulse?: CombatVector;
};

export function createFighter(fighter: CombatFighter, health: number) {
  if (!fighter.id || fighter.id.length > 128) throw new Error("fighter id must contain 1Ã¢â‚¬â€œ128 characters");
  const hitTargets: string[] = [];
  const history: { key: string; frame: number; direction: CombatDirection; side: number; dashing?: boolean; drive: boolean; airborne: boolean }[] = [];
  return {
    id: fighter.id, position: copyPosition(fighter.position), facing: normalizeFacing(fighter.facing ?? { x: 1, y: 0, z: 0 }),
    attackSide: 1, stamina: 0, locomotionAllowed: false, refunded: false, hitConfirmed: false, influenceDirection: { x: 0, y: 0, z: 0 },
    guardMeter: 0, guardBrokenFrames: 0, escapeCharges: 0, armorFrames: 0, followupFrames: 0,
    techHeld: false, techWindowFrames: 0, techLockoutFrames: 0, protectionFrames: 0,
    techDirection: { x: 0, y: 0, z: 0 }, strikeIndex: -1,
    health, wasAirborne: false, landingFrames: 0, stunFrames: 0, stunKind: initialStunKind(), guarding: false, guardStarted: -1,
    moveId: "", moveFrame: 0, chargeFrames: 0, charging: false, attackSerial: 0, hitTargets, history,
  };
}
function initialStunKind(): "" | "hit" | "block" | "parry" { return ""; }
export type CombatFighterState = ReturnType<typeof createFighter>;
export type CombatSnapshot = { version: 1; configKey: string; frame: number; fighters: CombatFighterState[] };

export function copyPosition(vector: CombatVector) {
  if (![vector.x, vector.y, vector.z].every(Number.isFinite)) throw new Error("combat vectors must be finite");
  return { x: vector.x, y: vector.y, z: vector.z };
}
export function normalizeFacing(vector: CombatVector) {
  const result = copyPosition(vector);
  const scale = Math.max(Math.abs(result.x), Math.abs(result.y), Math.abs(result.z));
  if (scale === 0) throw new Error("combat facing must be nonzero");
  const x = result.x / scale, y = result.y / scale, z = result.z / scale;
  const length = hypot(x, y, z);
  return { x: x / length, y: y / length, z: z / length };
}
