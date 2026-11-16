export type CombatVector = { x: number; y: number; z: number };
export type CombatDirection = "neutral" | "toward" | "away" | "side";
export const COMBAT_ATTACK_POSES = ['jolt', 'gazelle', 'retreat-jab', 'hook', 'liver-punch', 'reelback-armor', 'dive', 'wheel-kick', 'back-hop', 'stopping-straight', 'uppercut', 'body-blows', 'rising-knee'] as const;
export type CombatMove = {
  dashAttack?: boolean;
  weaponAttack?: 'light' | 'heavy';
  weaponBaseMoveId?: string;
  weaponSourceMoveId?: string;
  pose?: typeof COMBAT_ATTACK_POSES[number];
  chargeMode?: 'startup' | 'travel';
  startupHopSpeed?: number;
  dashTransitionFrames?: number;
  direction?: CombatDirection;
  movementAngle?: number;
  impulseAngle?: number;
  drive?: boolean;
  airborne?: boolean;
  stringOnly?: boolean;
  staminaCost?: number;
  contactRefund?: number;
  id: string;
  command: string[];
  startupFrames: number;
  activeFrames: number;
  recoveryFrames: number;
  /** Recovery after a confirmed body hit, including armor absorption; omitted keeps ordinary recovery. */
  hitRecoveryFrames?: number;
  damage: number;
  hitstunFrames: number;
  /** Recoil when the host reports a grounded defender; otherwise use hitstunFrames. */
  groundedHitstunFrames?: number;
  blockstunFrames: number;
  impulse: number;
  hitRadius: number;
  /** Upward extension of the spherical contact volume in metres. */
  hitHeight?: number;
  /** Full horizontal sector angle in degrees; omitted uses the normal tip capsule. */
  hitArcDegrees?: number;
  /** Maximum automatic yaw adjustment per fixed startup frame, in radians. */
  startupTracking?: number;
  reach: number;
  guardDamage?: number;
  verticalImpulse?: number;
  special?: boolean;
  parryFollowup?: boolean;
  armoredEscape?: boolean;
  armorFrames?: number;
  movementSpeed?: number;
  /** Signed anticipation travel; negative retreats along the facing axis. */
  startupMovementSpeed?: number;
  activeMovementSpeed?: number;
  /** Extra held-command frames at the anticipation pose. */
  chargeFrames?: number;
  chargeSpeedScale?: number;
  /** Free-running launch pitch; locked attacks use their visible target direction. */
  diveAngle?: number;
  downwardImpulse?: number;
  steering?: number;
  strikeFrames?: number[];
  cancels: { moveId: string; fromFrame: number; toFrame: number; hitOnly?: boolean }[];
};
export type CombatConfig = {
  /** Contact pause multiplier; omitted preserves the original whole-frame pauses. */
  hitstopScale?: number;
  /** Maximum guard/blockstun yaw in degrees per second at 60 Hz. */
  guardTurnSpeed?: number;
  /** Optional authored lateral attack fallback; does not change physical movement. */
  directionMode?: 'forward-back';
  maxStamina?: number;
  staminaRegen?: number;
  /** Grounded neutral recovery; omitted uses base recovery. */
  idleStaminaRegen?: number;
  /** Idle recovery per frame while airborne; omitted uses staminaRegen. */
  airStaminaRegen?: number;
  /** Defender recovery per fixed frame in hitstun; omitted disables recovery. */
  hitstunStaminaRegen?: number;
  /** Stamina restored per confirmed parry; omitted disables the refund. */
  parryStaminaRestore?: number;
  directionalInfluence?: number;
  /** Additional live-input ticks after hitstop; omitted retains impact-only DI. */
  lateInfluenceFrames?: number;
  /** Neutral landing commitment; guard and parry remain immediately available. */
  landingRecoveryFrames?: number;
  maxHealth: number;
  hurtRadius: number;
  inputBufferFrames: number;
  commandWindowFrames: number;
  parryFrames: number;
  /** Horizontal guard cone in degrees, centered on facing; defaults to 180. */
  guardArcDegrees?: number;
  chipRatio?: number;
  maxGuard?: number;
  guardBreakFrames?: number;
  parryPushback?: number;
  /** Fraction of maximum guard restored by a successful parry (default .25). */
  parryGuardRestore?: number;
  parryFollowupFrames?: number;
  /** Attacker recoil after being parried; zero preserves neutral-reset rules. */
  parryRecoveryFrames?: number;
  escapeCharges?: number;
  techWindowFrames?: number;
  techLockoutFrames?: number;
  techProtectionFrames?: number;
  moves: CombatMove[];
};

/** A small editable baseline; all timing is measured in simulation frames. */
export function createCombatPreset(): CombatConfig {
  return {
    maxHealth: 100, hurtRadius: 0.5, inputBufferFrames: 6, commandWindowFrames: 20, parryFrames: 3,
    moves: [
      { id: "jab", command: ["jab"], startupFrames: 4, activeFrames: 3, recoveryFrames: 10,
        damage: 8, hitstunFrames: 10, blockstunFrames: 5, impulse: 2, hitRadius: 0.35, reach: 0.8,
        cancels: [{ moveId: "heavy", fromFrame: 7, toFrame: 12 }] },
      { id: "heavy", command: ["heavy"], special: true, startupFrames: 12, activeFrames: 4, recoveryFrames: 22,
        damage: 20, hitstunFrames: 22, blockstunFrames: 10, impulse: 8, hitRadius: 0.5, reach: 1,
        cancels: [] },
    ],
  };
}

export function validateCombatConfig({ config }: { config: CombatConfig }) {
  finitePositive(config.maxHealth, "maxHealth");
  finitePositive(config.hurtRadius, "hurtRadius");
  frameCount(config.inputBufferFrames, "inputBufferFrames", 1);
  frameCount(config.commandWindowFrames, "commandWindowFrames", 1);
  frameCount(config.parryFrames, "parryFrames");
  if (config.hitstopScale !== undefined && (!Number.isFinite(config.hitstopScale) || config.hitstopScale < 0 || config.hitstopScale > 1)) throw new Error('hitstopScale must be between 0 and 1');
  if (config.guardTurnSpeed !== undefined && (!Number.isFinite(config.guardTurnSpeed) || config.guardTurnSpeed < 0 || config.guardTurnSpeed > 3600)) throw new Error('Invalid guardTurnSpeed');
  if (config.lateInfluenceFrames !== undefined) { frameCount(config.lateInfluenceFrames, 'lateInfluenceFrames');if (config.lateInfluenceFrames > 6) throw new Error('lateInfluenceFrames must be <= 6'); }
  if (config.guardArcDegrees !== undefined && (!Number.isFinite(config.guardArcDegrees) || config.guardArcDegrees <= 0 || config.guardArcDegrees > 360)) throw new Error("guardArcDegrees must be > 0 and <= 360");
  if (!config.moves.length || config.moves.length > 256 || config.commandWindowFrames > 120) throw new Error("combat supports 1–256 moves and up to 120 command frames");
  for (const key of ["landingRecoveryFrames", "guardBreakFrames", "parryFollowupFrames", "parryRecoveryFrames", "escapeCharges", "techWindowFrames", "techLockoutFrames", "techProtectionFrames"] as const) if (config[key] !== undefined) frameCount(config[key], key);
  for (const key of ["chipRatio", "maxGuard", "parryPushback", "parryGuardRestore", "maxStamina", "staminaRegen", "idleStaminaRegen", "airStaminaRegen", "hitstunStaminaRegen", "parryStaminaRestore", "directionalInfluence"] as const) if (config[key] !== undefined && (!Number.isFinite(config[key]) || config[key] < 0)) throw new Error(`invalid ${key}`);
  if ((config.parryGuardRestore ?? .25) > 1) throw new Error("parryGuardRestore must be <= 1");
  if ((config.chipRatio ?? 0) > 1) throw new Error("chipRatio must be <= 1");
  if ((config.directionalInfluence ?? 0) > 1) throw new Error("directionalInfluence must be <= 1");
  if (config.directionMode !== undefined && config.directionMode !== 'forward-back') throw Error('Invalid side attack direction');
  const ids = new Set<string>();
  for (const move of config.moves) {
    if (!move.id || move.id.length > 128 || ids.has(move.id)) throw new Error("combat move ids must be unique and contain 1–128 characters");
    ids.add(move.id);
    if (!move.command.length || move.command.length > 32 || move.command.some((key) => !key || key.length > 128) || move.cancels.length > 256) throw new Error("move command must contain 1–32 input names and at most 256 cancels");
    if (move.weaponAttack !== undefined && move.weaponAttack !== 'light' && move.weaponAttack !== 'heavy') throw Error('Invalid weapon attack kind');
    if (move.weaponBaseMoveId !== undefined && (!move.weaponBaseMoveId || !config.moves.some(base => base.id === move.weaponBaseMoveId))) throw Error('Invalid weapon base move');
    if (move.weaponSourceMoveId !== undefined && (!move.weaponSourceMoveId || !config.moves.some(source => source.id === move.weaponSourceMoveId && source.id !== move.id))) throw Error('Invalid weapon source move');
    if (move.pose !== undefined && !COMBAT_ATTACK_POSES.includes(move.pose)) throw Error('Invalid combat attack pose');
    if (move.chargeMode !== undefined && move.chargeMode !== 'startup' && move.chargeMode !== 'travel') throw Error('Invalid charge mode');
    if (move.dashTransitionFrames !== undefined) { frameCount(move.dashTransitionFrames, 'dashTransitionFrames');if (move.dashTransitionFrames > 12) throw Error('Dash transition must be at most 12 frames'); }
    if (move.startupHopSpeed !== undefined && (!Number.isFinite(move.startupHopSpeed) || move.startupHopSpeed < 0 || move.startupHopSpeed > 30)) throw Error('Invalid startup hop speed');
    frameCount(move.startupFrames, "startupFrames");
    frameCount(move.activeFrames, "activeFrames", 1);
    frameCount(move.recoveryFrames, "recoveryFrames");
    if (move.hitRecoveryFrames !== undefined) {
      frameCount(move.hitRecoveryFrames, 'hitRecoveryFrames');
      if (move.hitRecoveryFrames > move.recoveryFrames) throw new Error('hitRecoveryFrames must be <= recoveryFrames');
    }
    frameCount(move.hitstunFrames, "hitstunFrames");
    if (move.groundedHitstunFrames !== undefined) frameCount(move.groundedHitstunFrames, "groundedHitstunFrames");
    frameCount(move.blockstunFrames, "blockstunFrames");
    for (const value of [move.damage, move.impulse, move.reach]) {
      if (!Number.isFinite(value) || value < 0) throw new Error("damage, impulse and reach must be finite and nonnegative");
    }
    for (const key of ["hitHeight", "startupTracking", "guardDamage", "verticalImpulse", "movementSpeed", "chargeSpeedScale", "downwardImpulse", "steering", "staminaCost", "contactRefund"] as const) if (move[key] !== undefined && (!Number.isFinite(move[key]) || move[key] < 0)) throw new Error(`invalid ${key}`);
    if (move.hitArcDegrees !== undefined && (!Number.isFinite(move.hitArcDegrees) || move.hitArcDegrees <= 0 || move.hitArcDegrees > 180)) throw Error('Invalid attack sector angle.');
    if (move.activeMovementSpeed !== undefined && !Number.isFinite(move.activeMovementSpeed)) throw Error('invalid active movement speed');
    if (move.startupMovementSpeed !== undefined && !Number.isFinite(move.startupMovementSpeed)) throw new Error('invalid startup movement speed');
    if (move.diveAngle !== undefined && (!Number.isFinite(move.diveAngle) || Math.abs(move.diveAngle) > Math.PI / 2)) throw new Error('invalid dive angle');
    if (move.chargeFrames !== undefined) { frameCount(move.chargeFrames, 'chargeFrames'); if (move.chargeFrames > 120 || move.chargeFrames > 0 && move.startupFrames < 2) throw new Error('charge requires startup and at most 120 frames'); }
    for (const key of ["special", "parryFollowup", "armoredEscape", "drive", "airborne", "stringOnly", "dashAttack"] as const) if (move[key] !== undefined && typeof move[key] !== "boolean") throw new Error(`invalid ${key}`);
    for (const angle of [move.movementAngle, move.impulseAngle]) if (angle !== undefined && (!Number.isFinite(angle) || Math.abs(angle) > Math.PI)) throw new Error("invalid combat angle");
    if (move.direction !== undefined && !["neutral", "toward", "away", "side"].includes(move.direction)) throw new Error("invalid move direction");
    if ((move.contactRefund ?? 0) > 0 && (move.contactRefund ?? 0) >= (move.staminaCost ?? 0)) throw new Error("contact refund must be below stamina cost");
    if ((move.startupTracking ?? 0) > Math.PI) throw new Error("startupTracking must be <= PI");
    if ((move.steering ?? 0) > 1) throw new Error("steering must be <= 1");
    if (move.armorFrames !== undefined) frameCount(move.armorFrames, "armorFrames");
    if (move.strikeFrames && (move.strikeFrames.length > 32 || !move.strikeFrames.length || move.strikeFrames.some((value, index) => !Number.isSafeInteger(value) || value < 0 || value >= move.activeFrames || (index > 0 && value <= (move.strikeFrames?.[index - 1] ?? 0))))) throw new Error("invalid strike frames");
    finitePositive(move.hitRadius, "hitRadius");
  }
  for (const move of config.moves) for (const cancel of move.cancels) {
    frameCount(cancel.fromFrame, "cancel.fromFrame");
    frameCount(cancel.toFrame, "cancel.toFrame");
    if (cancel.hitOnly !== undefined && typeof cancel.hitOnly !== 'boolean') throw new Error('invalid cancel.hitOnly');
    if (!ids.has(cancel.moveId) || cancel.toFrame < cancel.fromFrame ||
      cancel.toFrame >= move.startupFrames + move.activeFrames + move.recoveryFrames) throw new Error("invalid combat cancel window");
  }
}

export function frameCount(value: number, name: string, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${name} must be an integer >= ${minimum}`);
}
function finitePositive(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive and finite`);
}
