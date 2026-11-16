import type { CombatFighterState } from '../../../../combat/state.ts';
import type { CombatAiBody3D } from '../../combat-ai.ts';
import type { CombatWeaponObservation } from '../../combat-interaction/ai-observation.ts';
import { object } from '../../gameplay-contracts.ts';
import type { TacticalCandidate } from './selection.ts';

export type MovementPlan = { key: string; choice: TacticalCandidate; until: number; serial: number };
const movementIds = new Set(['approach', 'sprint', 'flank', 'space']);
const directions = new Set(['toward', 'away', 'flank']);

/** Full scoring may reuse only ordinary movement and resource recovery. */
export function reusableMovement(choice: TacticalCandidate) {
  return !choice.moveId && !choice.grapple && !choice.dash && !choice.jump && !choice.priority
    && (movementIds.has(choice.id) && choice.movement !== undefined && directions.has(choice.movement)
      || choice.id === 'recover' && !choice.movement && !choice.sprint);
}

function quantize(value: number, scale: number) { return Math.floor(Math.max(-1000000, Math.min(1000000, value)) * scale); }
function staminaKey(value: number, max: number | undefined) {
  return `${max ? quantize(value / max, 10) : 10},${max ? Number(value >= max * .15) : 1},${Number(value >= 24)},${Number(value >= 32)}`;
}
function fighterKey(fighter: CombatFighterState, max: number | undefined) {
  return [fighter.id, fighter.moveId, fighter.attackSerial, fighter.stunKind,
    Number(fighter.stunFrames > 0), Number(fighter.landingFrames > 0), Number(fighter.armorFrames > 0),
    Number(fighter.protectionFrames > 0), Number(fighter.followupFrames > 0), Number(fighter.guardBrokenFrames > 0),
    Number(fighter.guarding), Number(fighter.charging), fighter.health, staminaKey(fighter.stamina, max),
    quantize(fighter.facing.x, 10), quantize(fighter.facing.y, 10), quantize(fighter.facing.z, 10)];
}

/** Visible state signature; callers still perform safety checks every frame and bound reuse to six ticks. */
export function movementPlanKey(options: {
  self: CombatFighterState; target: CombatFighterState; body: CombatAiBody3D; targetBody: CombatAiBody3D;
  distance: number; grounded: boolean; targetGrounded: boolean; dashing?: boolean; difficulty: number;
  enemyPhase: string; maxStamina?: number; weapons?: readonly CombatWeaponObservation[]; reroute?: number; positioning?: number;
}) {
  const { self, target, body, targetBody } = options;
  const weapon = (id: string) => {
    const held = options.weapons?.find(item => item.owner === id);
    return held ? [held.lightMoveId, held.heavyMoveId, held.length] : [];
  };
  const key = JSON.stringify([fighterKey(self, options.maxStamina), fighterKey(target, options.maxStamina),
    quantize(options.distance, 10), quantize(targetBody.x - body.x, 10), quantize(targetBody.y - body.y, 10), quantize(targetBody.z - body.z, 10),
    quantize(body.velocityX, 1), quantize(body.velocityY, 1), quantize(body.velocityZ, 1),
    quantize(targetBody.velocityX, 1), quantize(targetBody.velocityY, 1), quantize(targetBody.velocityZ, 1),
    options.grounded, options.targetGrounded, !!options.dashing, options.difficulty, options.enemyPhase,
    quantize(options.reroute ?? 0, 10), options.positioning ?? 0, weapon(self.id), weapon(target.id)]);
  if (key.length > 2048) throw Error('Oversized AI movement plan signature.');
  return key;
}

/** Old checkpoints have no plan; restored plans cannot smuggle an attack or an unknown field. */
export function readPlan(value: unknown): MovementPlan | undefined {
  if (value === undefined) return undefined;
  const row = object(value), choice = object(row.choice);
  if (Object.keys(row).some(key => !['key', 'choice', 'until', 'serial'].includes(key))
    || typeof row.key !== 'string' || !row.key || row.key.length > 2048
    || typeof row.until !== 'number' || !Number.isSafeInteger(row.until) || row.until < 0
    || typeof row.serial !== 'number' || !Number.isSafeInteger(row.serial) || row.serial < 0
    || Object.keys(choice).some(key => !['id', 'score', 'movement', 'sprint'].includes(key))
    || typeof choice.id !== 'string' || typeof choice.score !== 'number' || !Number.isFinite(choice.score)
    || choice.movement !== undefined && choice.movement !== 'toward' && choice.movement !== 'away' && choice.movement !== 'flank'
    || choice.sprint !== undefined && typeof choice.sprint !== 'boolean') throw Error('Invalid AI movement plan.');
  const candidate: TacticalCandidate = { id: choice.id, score: choice.score,
    ...(choice.movement === undefined ? {} : { movement: choice.movement }), ...(choice.sprint === undefined ? {} : { sprint: choice.sprint }) };
  if (!reusableMovement(candidate)) throw Error('Invalid AI movement plan choice.');
  return { key: row.key, choice: candidate, until: row.until, serial: row.serial };
}
