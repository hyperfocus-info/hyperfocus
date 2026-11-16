import { configureDashAttacks } from './dash-attacks.ts';
import { applyTouchOfDeathBalance } from './balance.ts';
import { configureTouchOfDeathCombos } from './combos.ts';
import { createCombatPreset, type CombatConfig, type CombatDirection, type CombatMove } from '@hyperfocus/engine/combat';

/** 60 Hz practice rules. Every value remains editable by the host/editor. */
export function createTouchOfDeathPreset(): CombatConfig {
  const baseline = createCombatPreset().moves[0];
  if (!baseline) throw new Error("combat baseline is missing");
  const move = (id: string, values: Partial<CombatMove>): CombatMove => ({ ...baseline, id, command: [id], cancels: [], impulse: 1.8, ...values });
  const config: CombatConfig = {
    hitstopScale: .8, guardTurnSpeed: 60,
    maxStamina: 100, staminaRegen: .6075, idleStaminaRegen: .759375, airStaminaRegen: .2025, hitstunStaminaRegen: .405, parryStaminaRestore: 6, directionalInfluence: 0.495, lateInfluenceFrames: 3,
    landingRecoveryFrames: 5, maxHealth: 100, hurtRadius: 0.6, inputBufferFrames: 5, commandWindowFrames: 20, parryFrames: 6,
    guardArcDegrees: 120, chipRatio: 0.35, maxGuard: 100, guardBreakFrames: 600, parryPushback: 3, parryGuardRestore: .25, parryFollowupFrames: 24, parryRecoveryFrames: 20,
    escapeCharges: 1, techWindowFrames: 6, techLockoutFrames: 12, techProtectionFrames: 12,
    moves: [
      move("jab", { startupFrames: 14, recoveryFrames: 12, damage: 8, hitstunFrames: 23, blockstunFrames: 18, guardDamage: 12, movementSpeed: 2, steering: 0.2 }),
      move("heavy", { startupFrames: 28, activeFrames: 3, recoveryFrames: 36, damage: 24, hitstunFrames: 136,
        blockstunFrames: 40, guardDamage: 38, impulse: 1.8, verticalImpulse: 10, reach: 1.3, hitRadius: 0.7, movementSpeed: 3, steering: 0.15 }),
      move("flurry", { startupFrames: 8, activeFrames: 19, recoveryFrames: 20, damage: 10, hitstunFrames: 50,
        blockstunFrames: 24, guardDamage: 10, impulse: 0.45, reach: 1.2, strikeFrames: [0, 6, 12, 18], movementSpeed: 4.5, steering: 0.25 }),
      move("escape", { startupFrames: 16, activeFrames: 4, recoveryFrames: 51, damage: 12, hitstunFrames: 45,
        impulse: 10.8, hitRadius: 1.2, reach: 0.5, armoredEscape: true, armorFrames: 20, steering: 0.1 }),
      move("evade", { startupFrames: 4, activeFrames: 2, recoveryFrames: 22, damage: 5, hitstunFrames: 19,
        special: true, movementSpeed: 9, steering: 1 }),
      move("followup", { startupFrames: 3, activeFrames: 2, recoveryFrames: 15, damage: 6, hitstunFrames: 23,
        movementSpeed: 3, steering: 0.4, parryFollowup: true }),
      move("sidestep", { startupFrames: 0, activeFrames: 1, recoveryFrames: 10, damage: 0, impulse: 0,
        hitstunFrames: 0, blockstunFrames: 0, guardDamage: 0, movementSpeed: 12, steering: 1, parryFollowup: true }),
      move("feint", { startupFrames: 0, activeFrames: 1, recoveryFrames: 14, damage: 0, impulse: 0,
        hitstunFrames: 0, blockstunFrames: 0, guardDamage: 0, movementSpeed: 1, steering: 0.5 }),
      move("evasive", { startupFrames: 5, activeFrames: 3, recoveryFrames: 15, damage: 8,
        hitstunFrames: 30, movementSpeed: 8, steering: 1, parryFollowup: true }),
    ],
  };
  expandAttacks(config);
  configureDashAttacks(config);
  applyTouchOfDeathBalance(config);
  configureTouchOfDeathCombos(config);
  for (const move of config.moves) if (move.diveAngle !== undefined) move.hitRecoveryFrames = Math.round((move.hitRecoveryFrames ?? move.recoveryFrames) * 1.1);
  return config;
}


function expandAttacks(config: CombatConfig) {
  const jab = config.moves.find(move => move.id === 'jab');
  const heavy = config.moves.find(move => move.id === 'heavy');
  const flurry = config.moves.find(move => move.id === 'flurry');
  if (!jab || !heavy || !flurry) throw new Error('missing attack templates');
  const directions: CombatDirection[] = ['neutral', 'toward', 'away', 'side'];
  const attacks: CombatMove[] = [];
  for (const command of ['jab', 'heavy']) for (const direction of directions) for (const drive of [false, true]) {
    const template = command === 'jab' ? jab : heavy;
    const suffix = direction === 'neutral' ? '' : `-${direction}`;
    const id = `${drive ? 'drive-' : ''}${command}${suffix}`;
    const isHeavy = command === 'heavy';
    const move: CombatMove = { ...template, id, command: [command], direction, drive,
      staminaCost: isHeavy ? (drive ? 28 : 20) : (drive ? 18 : 9), contactRefund: isHeavy ? (drive ? 18 : 12) : (drive ? 12 : 6),
      startupFrames: template.startupFrames + (drive ? 4 : 0), recoveryFrames: template.recoveryFrames + (drive ? 10 : 0),
      movementSpeed: direction === 'toward' ? (drive ? 11 : 7) : direction === 'away' ? 4 : direction === 'side' ? 4 : template.movementSpeed,
      movementAngle: direction === 'away' ? Math.PI : direction === 'side' ? Math.PI / 2 : 0,
      impulseAngle: direction === 'side' ? Math.PI / 2 : 0, cancels: [] };
    if (direction === 'toward') { move.impulse = isHeavy ? (drive ? 12.6 : 9) : 2.7; move.verticalImpulse = isHeavy ? 3 : 0; move.reach = 1.5; }
    if (direction === 'away') { move.impulse = isHeavy ? 8.1 : 4.5; move.verticalImpulse = isHeavy ? 4 : 0; move.startupFrames += 3; }
    if (direction === 'side') { move.impulse = isHeavy ? 7.2 : 3.6; move.verticalImpulse = isHeavy ? 5 : 0; move.reach = isHeavy ? 1.3 : 1.2; move.hitRadius = isHeavy ? 1 : 0.65; move.startupFrames += 3; }
    // Direction chooses a job, not just another damage skin. String hitstun and
    // air routes remain intact; the retreating setup has a shorter ground route.
    if (direction === 'away' && !isHeavy) Object.assign(move, { movementSpeed: 6, damage: 6, impulse: 5.4 });
    if (direction === 'away' && isHeavy) Object.assign(move, { startupFrames: drive ? 22 : 18, recoveryFrames: drive ? 34 : 26,
      damage: drive ? 16 : 12, guardDamage: 20, blockstunFrames: 20, impulse: 1.8, verticalImpulse: 6, movementSpeed: 2, groundedHitstunFrames: drive ? 85 : 78 });
    if (direction === 'toward' && isHeavy) Object.assign(move, { startupFrames: drive ? 28 : 24, recoveryFrames: drive ? 42 : 34, damage: 30 });
    if (direction === 'side' && isHeavy) Object.assign(move, { startupFrames: drive ? 28 : 24, recoveryFrames: drive ? 36 : 28, damage: 18 });
    if (drive && !isHeavy) Object.assign(move, { startupFrames: 16, activeFrames: 19, recoveryFrames: 29,
      strikeFrames: [0, 6, 12, 18], damage: 4, hitstunFrames: 64, groundedHitstunFrames: 34,
      blockstunFrames: 8, guardDamage: 10, staminaCost: 30, contactRefund: 12, startupTracking: .045,
      impulse: direction === 'neutral' ? .45 : direction === 'side' ? 3.6 : 1.8,
      movementSpeed: direction === 'toward' ? 6 : direction === 'away' ? 2 : 4.5, reach: 1.2 });
    if (drive && isHeavy) Object.assign(move, { hitRadius: direction === 'side' ? 1.2 : 1,
      hitHeight: direction === 'away' ? 1.4 : .9,
      verticalImpulse: direction === 'neutral' ? 13 : direction === 'away' ? 12 : direction === 'side' ? 7 : 5,
      startupTracking: .025 });
    if (drive && direction === 'neutral' && isHeavy) move.verticalImpulse = 13;
    if (!drive && direction === 'away' && isHeavy) Object.assign(move, { movementAngle: 0, movementSpeed: 3,
      armorFrames: move.startupFrames + move.activeFrames, impulse: 8.1, verticalImpulse: 0, reach: 1.5 });
    if (drive && isHeavy && direction === 'toward') Object.assign(move, { startupFrames: 30, activeFrames: 16, recoveryFrames: 36,
      startupMovementSpeed: 0, activeMovementSpeed: 12.6, movementSpeed: 2, movementAngle: 0, steering: .08,
      chargeFrames: 30, chargeSpeedScale: .68, diveAngle: -.35, downwardImpulse: 12, verticalImpulse: 0,
      damage: 24, impulse: 2.7, hitstunFrames: 176, groundedHitstunFrames: 176, reach: 1.65, hitHeight: 0, startupTracking: .04 });
    if (drive && isHeavy && direction === 'away') Object.assign(move, { pose: 'wheel-kick', startupFrames: 22, activeFrames: 19, recoveryFrames: 39,
      startupMovementSpeed: -8, activeMovementSpeed: 12, movementSpeed: 1, movementAngle: 0, steering: .08,
      damage: 22, impulse: 1.08, verticalImpulse: 2,
      hitstunFrames: 90, groundedHitstunFrames: 90, blockstunFrames: 12, guardDamage: 9, reach: 1.5, hitHeight: .8, startupTracking: .04 });
    attacks.push(move);
  }

  const seconds: CombatMove[] = attacks.filter(move => move.command[0] === 'jab').map(move => ({ ...move, id: `${move.id}-link`, stringOnly: true,
    startupFrames: move.drive ? 10 : 5, damage: move.drive ? 4.8 : move.damage + 2, hitstunFrames: 71, cancels: [] }));
  const heavies = attacks.filter(move => move.command[0] === 'heavy');
  seconds.find(move => move.id === 'drive-jab-link')!.damage = 4.8;
  for (const move of attacks.filter(move => move.command[0] === 'jab')) move.cancels = seconds.map(next => ({ moveId: next.id, fromFrame: move.startupFrames + move.activeFrames, toFrame: move.startupFrames + move.activeFrames + 6 }));
  for (const move of seconds) move.cancels = heavies.map(next => ({ moveId: next.id, fromFrame: move.startupFrames + move.activeFrames, toFrame: move.startupFrames + move.activeFrames + 6 }));
  for (const move of heavies) move.cancels.push({ moveId: 'feint', fromFrame: 6, toFrame: move.startupFrames - 6 });
  const driveFlurry = attacks.find(move => move.id === "drive-jab");
  if (!driveFlurry) throw new Error("missing Drive flurry");
  config.moves = [...attacks, ...seconds, ...config.moves.filter(move => move.id !== 'jab' && move.id !== 'heavy').map(move => move.id === 'flurry' ? { ...driveFlurry, id: 'flurry', command: ['flurry'], direction: undefined, drive: undefined } : { ...move, staminaCost: move.armoredEscape ? 0 : move.id === 'feint' ? 6 : 14, contactRefund: move.armoredEscape || move.id === 'feint' ? 0 : 9 })];
}
