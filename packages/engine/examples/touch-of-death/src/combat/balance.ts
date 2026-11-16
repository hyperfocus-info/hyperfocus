import type { CombatConfig, CombatMove } from '@hyperfocus/engine/combat';

// September 2026 baseline tuning: damage 5–30 maps light-to-heavy hitstun +20% to −5%,
// launch −25% to unchanged, and recovery +30% (whole simulation frames).
// October 2026: airborne and grounded hitstun reduced by 20%, rounded to frames.
const balance: Record<string, Partial<CombatMove>> = {
  "jab": {"hitstunFrames":22,"recoveryFrames":16,"impulse":1.404},
  "drive-jab": {"hitstunFrames":62,"groundedHitstunFrames":33,"recoveryFrames":38,"impulse":0.3375},
  "jab-toward": {"hitstunFrames":22,"recoveryFrames":16,"impulse":2.106,"verticalImpulse":0},
  "drive-jab-toward": {"hitstunFrames":62,"groundedHitstunFrames":33,"recoveryFrames":38,"impulse":1.35,"verticalImpulse":0},
  "jab-away": {"hitstunFrames":22,"recoveryFrames":16,"impulse":4.104,"verticalImpulse":0},
  "drive-jab-away": {"hitstunFrames":62,"groundedHitstunFrames":33,"recoveryFrames":38,"impulse":1.35,"verticalImpulse":0},
  "heavy": {"hitstunFrames":110,"recoveryFrames":47,"impulse":1.692,"verticalImpulse":9.4},
  "drive-heavy": {"hitstunFrames":110,"recoveryFrames":60,"impulse":1.692,"verticalImpulse":12.22},
  "heavy-toward": {"hitstunFrames":103,"recoveryFrames":45,"impulse":9,"verticalImpulse":3},
  "drive-heavy-toward": {"hitstunFrames":142,"groundedHitstunFrames":142,"recoveryFrames":47,"impulse":2.538,"verticalImpulse":0,"downwardImpulse":11.28},
  "heavy-away": {"hitstunFrames":123,"groundedHitstunFrames":70,"recoveryFrames":34,"impulse":6.642,"verticalImpulse":0},
  "drive-heavy-away": {"hitstunFrames":74,"groundedHitstunFrames":74,"recoveryFrames":51,"impulse":0.9936,"verticalImpulse":1.84},
  "jab-link": {"hitstunFrames":66,"recoveryFrames":16,"impulse":1.44},
  "drive-jab-link": {"hitstunFrames":67,"groundedHitstunFrames":32,"recoveryFrames":38,"impulse":0.342},
  "jab-toward-link": {"hitstunFrames":66,"recoveryFrames":16,"impulse":2.16,"verticalImpulse":0},
  "drive-jab-toward-link": {"hitstunFrames":67,"groundedHitstunFrames":32,"recoveryFrames":38,"impulse":1.368,"verticalImpulse":0},
  "jab-away-link": {"hitstunFrames":66,"recoveryFrames":16,"impulse":4.212,"verticalImpulse":0},
  "drive-jab-away-link": {"hitstunFrames":67,"groundedHitstunFrames":32,"recoveryFrames":38,"impulse":1.368,"verticalImpulse":0},
  "flurry": {"hitstunFrames":62,"groundedHitstunFrames":33,"recoveryFrames":38,"impulse":0.3375},
  "escape": {"hitstunFrames":41,"recoveryFrames":67,"impulse":8.856},
  "evade": {"hitstunFrames":18,"recoveryFrames":29,"impulse":1.35},
  "followup": {"hitstunFrames":22,"recoveryFrames":20,"impulse":1.368},
  "sidestep": {"hitstunFrames":0,"recoveryFrames":13,"impulse":0},
  "feint": {"hitstunFrames":0,"recoveryFrames":19,"impulse":0},
  "evasive": {"hitstunFrames":28,"recoveryFrames":20,"impulse":1.404},
  "dash-jab-toward": {"hitstunFrames":48,"recoveryFrames":36,"impulse":2.16},
  "dash-heavy-toward": {"hitstunFrames":110,"groundedHitstunFrames":110,"recoveryFrames":51,"impulse":1.269,"verticalImpulse":0},
  "dash-jab-away": {"hitstunFrames":43,"recoveryFrames":32,"impulse":2.808},
  "dash-heavy-away": {"hitstunFrames":94,"recoveryFrames":47,"impulse":4.968,"verticalImpulse":0},
  "dash-drive-jab-toward": {"hitstunFrames":66,"recoveryFrames":38,"impulse":2.268,"verticalImpulse":3.36},
  "dash-drive-heavy-toward": {"hitstunFrames":142,"groundedHitstunFrames":142,"recoveryFrames":47,"impulse":2.538,"verticalImpulse":0,"downwardImpulse":11.28},
  "dash-drive-jab-away": {"hitstunFrames":62,"recoveryFrames":38,"impulse":5.166,"verticalImpulse":1.64},
  "dash-drive-heavy-away": {"hitstunFrames":0,"recoveryFrames":50,"impulse":0,"verticalImpulse":0},
  "dash-jab-neutral": {"hitstunFrames":43,"recoveryFrames":29,"impulse":1.404},
  "dash-heavy-neutral": {"hitstunFrames":112,"recoveryFrames":45,"impulse":1.242,"verticalImpulse":9.2},
  "dash-drive-jab-neutral": {"hitstunFrames":64,"recoveryFrames":39,"impulse":1.026},
  "dash-drive-heavy-neutral": {"hitstunFrames":112,"recoveryFrames":51,"impulse":1.656,"verticalImpulse":11.04},
  "dash-wheel-kick": {"hitstunFrames":74,"recoveryFrames":45,"impulse":0.9936,"verticalImpulse":5.52},
};

export function applyTouchOfDeathBalance(config: CombatConfig) {
  for (const move of config.moves) {
    Object.assign(move, balance[move.id]);
    applyAttackWeight(move);
    if (move.diveAngle !== undefined) {
      move.startupFrames = Math.round(move.startupFrames * 1.1);
      move.recoveryFrames = Math.round(move.recoveryFrames * 1.1);
      move.startupTracking = (move.startupTracking ?? 0) * .5;
      move.steering = (move.steering ?? 0) * .5;
    }
  }
}

/** October 17: +5% recoil duration; 10% less launch on light hits, 5% on the heaviest. */
export function applyAttackWeight(move: CombatMove) {
  const velocity = attackVelocityScale(move.damage);
  move.hitstunFrames = Math.round(move.hitstunFrames * 1.05);
  if (move.groundedHitstunFrames !== undefined) move.groundedHitstunFrames = Math.round(move.groundedHitstunFrames * 1.05);
  move.impulse *= velocity;
  if (move.verticalImpulse !== undefined) move.verticalImpulse *= velocity;
  if (move.downwardImpulse !== undefined) move.downwardImpulse *= velocity;
}

export function attackVelocityScale(damage: number) {
  return .9 + Math.max(0, Math.min(1, (damage - 4) / 26)) * .05;
}
