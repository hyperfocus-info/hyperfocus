import { validateCombatConfig, COMBAT_ATTACK_POSES, type CombatDirection, type CombatConfig } from "./config.ts";

/** Validate persisted editor data and return an independently owned configuration. */
export function readCombatConfig(value: unknown): CombatConfig {
  const root = record(value, ['maxHealth', 'hurtRadius', 'inputBufferFrames', 'commandWindowFrames', 'parryFrames', 'guardArcDegrees', 'directionMode', 'moves', ...ruleNumbers]);
  const config = {
    ...(root.directionMode === undefined ? {} : { directionMode: directionMode(root.directionMode) }),
    maxHealth: number(root.maxHealth), hurtRadius: number(root.hurtRadius),
    inputBufferFrames: number(root.inputBufferFrames), commandWindowFrames: number(root.commandWindowFrames), parryFrames: number(root.parryFrames),
    ...readOptionalNumbers(root, ruleNumbers),
    ...readOptionalNumbers(root, ['guardArcDegrees']),
    moves: array(root.moves).map((value) => {
      const move = record(value, ['id', 'command', 'startupFrames', 'activeFrames', 'recoveryFrames', 'damage', 'hitstunFrames', 'blockstunFrames', 'impulse', 'hitRadius', 'reach', 'cancels', ...moveNumbers, 'special', 'parryFollowup', 'armoredEscape', 'strikeFrames', 'direction', 'drive', 'airborne', 'stringOnly', 'dashAttack', 'pose', 'chargeMode', 'weaponAttack', 'weaponBaseMoveId', 'weaponSourceMoveId']);
      return {
        ...readOptionalNumbers(move, moveNumbers),
        ...(move.dashAttack === undefined ? {} : { dashAttack: boolean(move.dashAttack) }),
        ...(move.weaponAttack === undefined ? {} : { weaponAttack: weaponAttack(move.weaponAttack) }),
        ...(move.weaponBaseMoveId === undefined ? {} : { weaponBaseMoveId: string(move.weaponBaseMoveId) }),
        ...(move.weaponSourceMoveId === undefined ? {} : { weaponSourceMoveId: string(move.weaponSourceMoveId) }),
        ...(move.pose === undefined ? {} : { pose: pose(move.pose) }),
        ...(move.chargeMode === undefined ? {} : { chargeMode: chargeMode(move.chargeMode) }),
        ...(move.direction === undefined ? {} : { direction: direction(move.direction) }),
        ...(move.drive === undefined ? {} : { drive: boolean(move.drive) }),
        ...(move.airborne === undefined ? {} : { airborne: boolean(move.airborne) }),
        ...(move.stringOnly === undefined ? {} : { stringOnly: boolean(move.stringOnly) }),
        ...(move.parryFollowup === undefined ? {} : { parryFollowup: boolean(move.parryFollowup) }),
        ...(move.special === undefined ? {} : { special: boolean(move.special) }),
        ...(move.armoredEscape === undefined ? {} : { armoredEscape: boolean(move.armoredEscape) }),
        ...(move.strikeFrames === undefined ? {} : { strikeFrames: array(move.strikeFrames).map(number) }),
        id: string(move.id), command: array(move.command).map(string), startupFrames: number(move.startupFrames),
        activeFrames: number(move.activeFrames), recoveryFrames: number(move.recoveryFrames), damage: number(move.damage),
        hitstunFrames: number(move.hitstunFrames), blockstunFrames: number(move.blockstunFrames), impulse: number(move.impulse),
        hitRadius: number(move.hitRadius), reach: number(move.reach), cancels: array(move.cancels).map((value) => {
          const cancel = record(value, ['moveId', 'fromFrame', 'toFrame', 'hitOnly']);
          return { moveId: string(cancel.moveId), fromFrame: number(cancel.fromFrame), toFrame: number(cancel.toFrame), ...(cancel.hitOnly === undefined ? {} : { hitOnly: boolean(cancel.hitOnly) }) };
        }),
      };
    }),
  };
  validateCombatConfig({ config });
  return config;
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("expected combat object");
  const extra = Object.keys(value).find(key => !keys.includes(key));
  if (extra !== undefined) throw new Error(`Unknown combat field: ${extra}`);
  return Object.fromEntries(Object.entries(value));
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("expected combat array");
  return value;
}
function number(value: unknown) {
  if (typeof value !== "number") throw new Error("expected combat number");
  return value;
}
function string(value: unknown) {
  if (typeof value !== "string") throw new Error("expected combat string");
  return value;
}

const ruleNumbers = ["hitstopScale", "guardTurnSpeed", "lateInfluenceFrames", "landingRecoveryFrames", "chipRatio", "maxGuard", "guardBreakFrames", "parryPushback", "parryGuardRestore", "parryFollowupFrames", "parryRecoveryFrames", "escapeCharges", "techWindowFrames", "techLockoutFrames", "techProtectionFrames", "maxStamina", "staminaRegen", "idleStaminaRegen", "airStaminaRegen", "hitstunStaminaRegen", "parryStaminaRestore", "directionalInfluence"] as const;
const moveNumbers = ["hitRecoveryFrames", "startupHopSpeed", "dashTransitionFrames", "startupMovementSpeed", "activeMovementSpeed", "chargeFrames", "chargeSpeedScale", "diveAngle", "downwardImpulse", "hitHeight", "hitArcDegrees", "startupTracking", "guardDamage", "verticalImpulse", "armorFrames", "movementSpeed", "steering", "staminaCost", "contactRefund", "movementAngle", "impulseAngle", "groundedHitstunFrames"] as const;
function readOptionalNumbers<K extends string>(value: Record<string, unknown>, keys: readonly K[]): Partial<Record<K, number>> {
  const result: Partial<Record<K, number>> = {};
  for (const key of keys) if (value[key] !== undefined) result[key] = number(value[key]);
  return result;
}
function boolean(value: unknown) { if (typeof value !== "boolean") throw new Error("expected combat boolean"); return value; }

function direction(value: unknown): CombatDirection { if (value !== "neutral" && value !== "toward" && value !== "away" && value !== "side") throw new Error("invalid move direction"); return value; }

function weaponAttack(value: unknown): 'light' | 'heavy' { if (value !== 'light' && value !== 'heavy') throw Error('Invalid weapon attack kind');return value; }
function directionMode(value: unknown): 'forward-back' { if (value !== 'forward-back') throw Error('Invalid attack direction mode');return value; }
function chargeMode(value: unknown): 'startup' | 'travel' { if (value !== 'startup' && value !== 'travel') throw Error('Invalid charge mode');return value; }
function pose(value: unknown) { const result = COMBAT_ATTACK_POSES.find(pose => pose === value);if (!result) throw Error('Invalid combat pose');return result; }
