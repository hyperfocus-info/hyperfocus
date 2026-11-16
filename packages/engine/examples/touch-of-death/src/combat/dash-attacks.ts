import type { CombatConfig, CombatMove } from '@hyperfocus/engine/combat';

/** Authored dash cancellations. Ordinary standing attacks keep their own rules. */
export function configureDashAttacks(config: CombatConfig) {
  const light = config.moves.find(move => move.id === 'jab'), heavy = config.moves.find(move => move.id === 'heavy');
  if (!light || !heavy) throw Error('Dash attacks need light and heavy templates');
  const attacks: CombatMove[] = [];
  const add = (id: string, command: 'jab' | 'heavy', direction: 'neutral' | 'toward' | 'away', drive: boolean, values: Partial<CombatMove>) => {
    attacks.push({ ...(command === 'jab' ? light : heavy), id, command: [command], direction, drive, dashAttack: true,
      dashTransitionFrames: 6, cancels: [], steering: .08, startupTracking: .025, movementAngle: 0,
      staminaCost: command === 'heavy' ? drive ? 28 : 20 : drive ? 20 : 9,
      contactRefund: command === 'heavy' ? drive ? 18 : 12 : drive ? 12 : 6, ...values });
  };
  add('dash-jab-toward', 'jab', 'toward', false, { pose: 'jolt', startupFrames: 12, activeFrames: 4, recoveryFrames: 27,
    damage: 10, hitstunFrames: 52, impulse: 2.7, reach: 1.5, startupMovementSpeed: 10, activeMovementSpeed: 8, movementSpeed: 2 });
  add('dash-heavy-toward', 'heavy', 'toward', false, { pose: 'liver-punch', startupFrames: 26, activeFrames: 4, recoveryFrames: 39,
    damage: 24, hitstunFrames: 136, groundedHitstunFrames: 136, impulse: 1.35, verticalImpulse: 0, reach: 1.5,
    startupMovementSpeed: 5, activeMovementSpeed: 6, movementSpeed: 1 });
  add('dash-jab-away', 'jab', 'away', false, { pose: 'retreat-jab', startupFrames: 14, activeFrames: 4, recoveryFrames: 24,
    damage: 8, hitstunFrames: 46, impulse: 3.6, reach: 1.6, hitRadius: .95, startupMovementSpeed: -6, activeMovementSpeed: -3, movementSpeed: 0 });
  add('dash-heavy-away', 'heavy', 'away', false, { pose: 'reelback-armor', startupFrames: 18, activeFrames: 4, recoveryFrames: 36,
    damage: 22, hitstunFrames: 115, impulse: 5.4, verticalImpulse: 0, reach: 1.6, armorFrames: 22,
    startupMovementSpeed: -7, activeMovementSpeed: 13, movementSpeed: 1 });
  add('dash-drive-jab-toward', 'jab', 'toward', true, { pose: 'gazelle', startupFrames: 8, activeFrames: 5, recoveryFrames: 29,
    damage: 11.2, hitstunFrames: 75, impulse: 2.7, verticalImpulse: 4, reach: 1.45, startupHopSpeed: 3,
    startupMovementSpeed: 13, activeMovementSpeed: 10, movementSpeed: 2 });
  add('dash-drive-heavy-toward', 'heavy', 'toward', true, { pose: 'dive', startupFrames: 10, activeFrames: 22, recoveryFrames: 36,
    damage: 24, hitstunFrames: 176, groundedHitstunFrames: 176, impulse: 2.7, verticalImpulse: 0, reach: 1.65, hitHeight: 0,
    startupMovementSpeed: 12, activeMovementSpeed: 10.8, movementSpeed: 2, chargeMode: 'travel', chargeFrames: 30,
    chargeSpeedScale: .68, diveAngle: -.35, downwardImpulse: 12 });
  add('dash-drive-jab-away', 'jab', 'away', true, { pose: 'hook', startupFrames: 12, activeFrames: 5, recoveryFrames: 29,
    damage: 9.6, hitstunFrames: 69, impulse: 6.3, verticalImpulse: 2, reach: 1.6, hitRadius: 1.1,
    startupMovementSpeed: -8, activeMovementSpeed: -4, movementSpeed: 0 });
  add('dash-drive-heavy-away', 'heavy', 'away', true, { pose: 'back-hop', startupFrames: 4, activeFrames: 1, recoveryFrames: 38,
    damage: 0, guardDamage: 0, hitstunFrames: 0, blockstunFrames: 0, impulse: 0, verticalImpulse: 0, startupHopSpeed: 6,
    startupMovementSpeed: -10, activeMovementSpeed: -10, movementSpeed: 0, contactRefund: 0,
    cancels: [{ moveId: 'dash-wheel-kick', fromFrame: 6, toFrame: 28 }] });
  add('dash-jab-neutral', 'jab', 'neutral', false, { pose: 'stopping-straight', startupFrames: 12, activeFrames: 3, recoveryFrames: 22,
    damage: 8, hitstunFrames: 46, impulse: 1.8, startupMovementSpeed: 1, activeMovementSpeed: 1, movementSpeed: 0 });
  add('dash-heavy-neutral', 'heavy', 'neutral', false, { pose: 'uppercut', startupFrames: 22, activeFrames: 4, recoveryFrames: 34,
    damage: 22, hitstunFrames: 136, impulse: 1.35, verticalImpulse: 10, startupMovementSpeed: 1, activeMovementSpeed: 2, movementSpeed: 0 });
  add('dash-drive-jab-neutral', 'jab', 'neutral', true, { pose: 'body-blows', startupFrames: 12, activeFrames: 7, recoveryFrames: 30,
    damage: 4.8, hitstunFrames: 67, blockstunFrames: 12, impulse: 1.35, strikeFrames: [0, 6], startupMovementSpeed: 3, activeMovementSpeed: 3, movementSpeed: 0 });
  add('dash-drive-heavy-neutral', 'heavy', 'neutral', true, { pose: 'rising-knee', startupFrames: 20, activeFrames: 5, recoveryFrames: 39,
    damage: 22, hitstunFrames: 136, impulse: 1.8, verticalImpulse: 12, hitHeight: 1.8, startupHopSpeed: 4,
    startupMovementSpeed: 1.5, activeMovementSpeed: 2, movementSpeed: 0 });
  attacks.push({ ...heavy, id: 'dash-wheel-kick', command: ['drive'], direction: undefined, drive: undefined, stringOnly: true,
    pose: 'wheel-kick', startupFrames: 8, activeFrames: 19, recoveryFrames: 34, damage: 22, hitstunFrames: 90,
    blockstunFrames: 12, guardDamage: 9, impulse: 1.08, verticalImpulse: 6, reach: 1.4, hitHeight: 2,
    startupHopSpeed: 6, startupMovementSpeed: 3, activeMovementSpeed: 9,
    movementSpeed: 1, staminaCost: 14, contactRefund: 9, cancels: [] });
  const removed = new Set(config.moves.filter(move => move.direction === 'side' || move.id.startsWith('dash-')).map(move => move.id));
  config.moves = [...config.moves.filter(move => !removed.has(move.id)).map(move => ({ ...move, cancels: move.cancels.filter(cancel => !removed.has(cancel.moveId)) })), ...attacks];
  config.directionMode = 'forward-back';
}
