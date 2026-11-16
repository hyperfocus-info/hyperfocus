import type { CombatConfig, CombatMove } from '@hyperfocus/engine/combat';
import type { CombatProject3D } from '@hyperfocus/engine/project/runtime-3d';
import { CITY_WEAPONS, cityWeapon } from '../../city/weapons/catalogue.ts';
import { directedMoveFamily, weaponRecipe } from '../../city/weapons/direction/grammar.ts';
import { weaponIntent } from '../../city/weapons/direction/intent.ts';

export const traversalActions = ['idle', 'walk', 'run', 'sprint', 'dash-forward', 'dash-back', 'dash-left', 'dash-right', 'dash-brake', 'air-dash', 'jump-start', 'jump-rise', 'jump-fall', 'double-jump', 'land-soft', 'land-hard', 'wall-run-left', 'wall-run-right', 'wall-slide', 'wall-jump', 'air-steer'] as const;
export const reactionActions = ['guard', 'guard-walk', 'block', 'parry', 'parried', 'guard-break', 'hit-light', 'hit-heavy', 'air-hit', 'wall-impact', 'floor-impact', 'surface-tech', 'get-up', 'knockout', 'victory', 'exhausted', 'ready'] as const;
export const interactionActions = ['pickup', 'weapon-ready', 'weapon-walk', 'weapon-run', 'weapon-throw', 'weapon-drop', 'grapple-reach', 'grapple-hold', 'grapple-held', 'grapple-throw', 'grapple-tech'] as const;
export type TraversalAction = typeof traversalActions[number];
export type ReactionAction = typeof reactionActions[number];
export type InteractionAction = typeof interactionActions[number];

const standingRoles = {
  jab: 'jab', 'jab-toward': 'jolt', 'jab-away': 'retreat-jab',
  'jab-link': 'cross', 'jab-toward-link': 'cross', 'jab-away-link': 'retreat-jab',
  'drive-jab': 'flurry', 'drive-jab-toward': 'flurry', 'drive-jab-away': 'flurry',
  'drive-jab-link': 'flurry', 'drive-jab-toward-link': 'flurry', 'drive-jab-away-link': 'flurry', flurry: 'flurry',
  heavy: 'uppercut', 'drive-heavy': 'uppercut', 'heavy-toward': 'cross-heavy',
  'heavy-away': 'reelback-armor', 'drive-heavy-toward': 'dive', 'drive-heavy-away': 'wheel-kick',
  escape: 'escape', evade: 'evade', followup: 'cross', sidestep: 'sidestep', feint: 'feint', evasive: 'evade',
} as const;
export type AttackRole = typeof standingRoles[keyof typeof standingRoles] | NonNullable<CombatMove['pose']>;

/** Unmapped mechanics are an error, never a generic punch. */
export function attackRole(move: CombatMove): AttackRole {
  if (move.pose) return move.pose;
  const id = move.weaponSourceMoveId ?? move.id;
  const roles: Readonly<Record<string, AttackRole | undefined>> = standingRoles;
  const role = Object.hasOwn(roles, id) ? roles[id] : undefined;
  if (role !== undefined) return role;
  throw new Error(`No authored animation role for ${move.id}`);
}
export function weaponFamily(move: CombatMove) {
  const base = move.weaponBaseMoveId ?? move.id;
  const match = /^weapon-([a-z]+)-(light|heavy)$/.exec(base);
  // The saved city's original worksite offcuts use a staff kit. Its explicit
  // long-tool grammar also covers synthesized directional and dash variants.
  if (match?.[1] === 'staff') return cityWeapon('long-pipe');
  const weapon = CITY_WEAPONS.find(row => row[2] === match?.[1]);
  if (weapon) return cityWeapon(weapon[0]);
  if (move.weaponAttack) throw new Error(`No weapon animation family for ${move.id}`);
  return undefined;
}

export function animationCatalogue(options: { config: CombatConfig; movement?: CombatProject3D['movement'] }) {
  const movement = traversalActions.map(id => ({ id, group: 'Traversal', duration: id === 'dash-brake' ? options.movement?.dashRecoveryFrames ?? 12 : id.startsWith('dash-') || id === 'air-dash' ? options.movement?.dashFrames ?? 10 : id === 'land-soft' ? 12 : id === 'land-hard' ? 20 : id === 'jump-start' ? 8 : id === 'double-jump' ? 16 : id === 'wall-jump' ? 24 : id.includes('wall-run') || ['walk', 'run', 'sprint', 'idle'].includes(id) ? 90 : 60 }));
  const reactions = reactionActions.map(id => ({ id, group: 'Defense / reactions', duration: ['knockout', 'get-up', 'victory'].includes(id) ? 100 : 60 }));
  const interactions = interactionActions.map(id => ({ id, group: 'Interaction', duration: 70 }));
  const attacks = options.config.moves.map(move => {
    const weapon = weaponFamily(move), role = weapon ? `${weapon.family}-${move.weaponAttack ?? (move.id.endsWith('heavy') ? 'heavy' : 'light')}` : attackRole(move);
    const family = directedMoveFamily(move), recipe = family ? weaponRecipe(family, weaponIntent(move)) : undefined;
    return { id: move.id, group: weapon ? `Weapon / ${weapon.family}` : move.dashAttack || move.id === 'dash-wheel-kick' ? 'Dash attacks' : 'Standing / Drive attacks', duration: move.startupFrames + move.activeFrames + move.recoveryFrames + 12, role, ...(recipe ? { intent: recipe.intent, recipe: recipe.id, motion: recipe.motion, strength: recipe.strength, weakness: recipe.weakness } : {}) };
  });
  return [...movement, ...reactions, ...interactions, ...attacks];
}
