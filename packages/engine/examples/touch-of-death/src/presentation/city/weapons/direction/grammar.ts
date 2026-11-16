import { compileArtDirection, type ArtDirectionGrammar } from '@hyperfocus/artifact-review/direction';
import type { CombatConfig, CombatMove } from '@hyperfocus/engine/combat';
import { weaponIntent, weaponIntents, type WeaponIntent } from './intent.ts';

export const directedFamilies = ['blade', 'piercing', 'blunt', 'long', 'heavy', 'flexible'] as const;
export type DirectedFamily = typeof directedFamilies[number];
export function isDirectedFamily(family: string): family is DirectedFamily { return directedFamilies.some(value => value === family); }
const identities: Record<DirectedFamily, { strength: string; weakness: string; paths: readonly string[] }> = {
  blade: { strength: 'Clean directional cuts and narrow lunging thrusts', weakness: 'Committed edge alignment and exposed recovery after a miss', paths: ['diagonal-cut', 'point-lunge', 'retreat-cut', 'reverse-cut', 'cross-cuts', 'low-cut', 'rising-cut', 'draw-counter', 'descending-cut', 'waist-sweep', 'guard-withdraw', 'step-rising-cut'] },
  piercing: { strength: 'Fast compact point attacks', weakness: 'Short reach and narrow coverage', paths: ['short-stab', 'extended-stab', 'withdraw-stab', 'reverse-stab', 'alternating-stabs', 'body-stab', 'rising-stab', 'slip-stab', 'down-stab', 'cross-stab', 'point-withdraw', 'step-rising-stab'] },
  blunt: { strength: 'Heavy strikes deliver exceptional damage and guard shock', weakness: 'Long load, strong commitment and slow missed recovery', paths: ['baton-check', 'driving-blow', 'retreat-swat', 'backhand', 'rebound-blows', 'rib-blow', 'loaded-rising-blow', 'shoulder-counter', 'overhand-smash', 'hip-sweep', 'loaded-withdraw', 'step-rising-blow'] },
  long: { strength: 'Long point control and two-handed space clearing', weakness: 'Slow redirection and wide recovery exposure', paths: ['staff-probe', 'shaft-lunge', 'withdraw-butt', 'butt-return', 'alternating-ends', 'low-shaft', 'vertical-lever', 'lever-counter', 'staff-downstroke', 'wide-sweep', 'shaft-withdraw', 'vaulting-lever'] },
  heavy: { strength: 'Highest single-contact damage and guard break pressure', weakness: 'Longest telegraph, costly stamina and very slow recovery', paths: ['haft-check', 'weighted-drive', 'weighted-withdraw', 'weighted-backhand', 'weighted-rebounds', 'low-maul', 'weighted-rise', 'braced-counter', 'full-body-smash', 'weighted-sweep', 'braced-withdraw', 'step-weighted-rise'] },
  flexible: { strength: 'Continuous chained pressure and changing attack planes', weakness: 'Short contact reach and catch/regrip recovery vulnerability', paths: ['outside-orbit', 'forward-uncoil', 'retreat-reel', 'reverse-orbit', 'hand-change-chain', 'low-orbit', 'rising-orbit', 'catch-counter', 'overhead-release', 'waist-orbit', 'closed-catch', 'step-rising-orbit'] },
};

export const weaponDirectionGrammar: ArtDirectionGrammar = {
  id: 'touch-of-death-weapons-v2', owner: 'packages/engine/examples/touch-of-death/docs/touch-of-death-art-constitution.md',
  requiredEvidence: ['neutral', 'gameplay', 'contact', 'strip'],
  recipes: directedFamilies.flatMap(family => weaponIntents.map((intent, index) => ({ id: `${family}.${intent}`, family, intent,
    motion: identities[family].paths[index]!, strength: identities[family].strength, weakness: identities[family].weakness }))),
};
export function weaponRecipe(family: DirectedFamily, intent: WeaponIntent) {
  const recipe = weaponDirectionGrammar.recipes.find(recipe => recipe.family === family && recipe.intent === intent);
  if (!recipe) throw new Error(`No weapon direction for ${family}/${intent}`);
  return recipe;
}
export function directedMoveFamily(move: CombatMove): DirectedFamily | undefined {
  const family = /^weapon-([a-z]+)-(light|heavy)/.exec(move.weaponBaseMoveId ?? move.id)?.[1];
  if (family && isDirectedFamily(family)) return family;
  // Utility treatments and the named legacy staff are separate existing consumers.
  // Adding a new family cannot silently enter the generic utility path.
  if (family && !['fragile', 'distraction', 'spray', 'shield', 'ground', 'staff'].includes(family)) throw new Error(`No authored weapon family treatment: ${family}`);
  return undefined;
}
export function compileWeaponDirection(config: CombatConfig) {
  return compileArtDirection(weaponDirectionGrammar, config.moves.flatMap(move => {
    const family = directedMoveFamily(move);
    return family ? [{ id: move.id, family, intent: weaponIntent(move) }] : [];
  }));
}
