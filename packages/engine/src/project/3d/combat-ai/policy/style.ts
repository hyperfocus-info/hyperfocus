import { clampLowerFirst as clamp } from "@hyperfocus/utilities/math";
import type { CombatMove } from '../../../../combat/config.ts';
import type { personalityWeights } from '../personality/index.ts';
import type { TacticalCandidate } from './selection.ts';


const trait = (value: number) => clamp((value - 1) / .7, -1, 1);

/** Centered exploration preferences, bounded independently of tactical value and legal admission. */
export function combatStyleScore(options: {
  preferences: ReturnType<typeof personalityWeights>; candidate: TacticalCandidate; move?: CombatMove;
  distance: number; grounded: boolean; targetGrounded: boolean; punish?: boolean; safeProbe?: boolean;
  grappleAvailable?: boolean; held?: boolean;
}) {
  const { preferences: p, candidate: c, move } = options;
  if (c.priority) return 0;
  const close = clamp((3.2 - options.distance) / 1.5, 0, 1);
  let value = 0;
  if (move) {
    const quick = clamp((32 - move.startupFrames) / 20, 0, 1), payoff = clamp(move.damage / 30, 0, 1);
    value = trait(p.fast) * quick + trait(p.reckless) * payoff - trait(p.defensive) * clamp(move.recoveryFrames / 45, 0, 1)
      + trait(p.dogfighter) * close + trait(p.eager) * .25;
    value += options.punish ? trait(p.whiffPunisher) : 0;
    value += options.safeProbe || c.probe ? trait(p.bait) : -trait(p.bait) * .35;
    value += options.grappleAvailable ? -trait(p.grappler) * .35 : 0;
    value += options.held || move.weaponAttack ? trait(p.items) * .7 : 0;
    value += trait(options.grounded ? p.grounded : p.jumping) * .25;
  } else if (c.grapple) {
    value = trait(p.grappler) + trait(p.dogfighter) * close * .3 + trait(p.eager) * .2;
  } else if (c.jump) {
    value = trait(p.jumping) + trait(p.reckless) * .25 - trait(p.defensive) * .4;
  } else if (c.movement === 'flank') {
    value = trait(p.positioning) + trait(p.defensive) * .25 - trait(p.eager) * .35;
  } else if (c.movement === 'toward') {
    value = trait(p.eager) + trait(p.dogfighter) * close * .4 - trait(p.defensive) * .5 - trait(p.positioning) * .6;
    if (c.sprint || c.dash) value += trait(p.fast) * .8 + trait(p.reckless) * .3;
  } else if (c.movement === 'away' || c.id === 'recover') {
    value = trait(p.defensive) - trait(p.eager) * .7 - trait(p.reckless) * .4;
    if (c.movement === 'away') value += trait(p.bait) * .6 - trait(p.dogfighter) * close * .5;
  }
  return clamp(value, -1, 1) * 1.4;
}

/** Item enthusiasts pursue nearly every safe pickup opportunity; avoiders almost never do. */
export function pickupStyleProbability(items: number) {
  return .5 + .48 * trait(items);
}
