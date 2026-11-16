import type { CombatMove } from '@hyperfocus/engine/combat';

export const weaponIntents = ['check', 'lunge', 'withdraw', 'return', 'pressure', 'body', 'anti-air', 'counter', 'overhead', 'sweep', 'evade', 'rising-entry'] as const;
export type WeaponIntent = typeof weaponIntents[number];
const sources: Record<string, WeaponIntent> = {
  jab: 'check', 'jab-toward': 'lunge', 'jab-away': 'withdraw',
  'jab-link': 'return', 'jab-toward-link': 'return', 'jab-away-link': 'withdraw',
  'drive-jab': 'pressure', 'drive-jab-toward': 'pressure', 'drive-jab-away': 'pressure',
  'drive-jab-link': 'pressure', 'drive-jab-toward-link': 'pressure', 'drive-jab-away-link': 'pressure',
  heavy: 'anti-air', 'heavy-toward': 'lunge', 'heavy-away': 'counter',
  'drive-heavy': 'anti-air', 'drive-heavy-toward': 'overhead', 'drive-heavy-away': 'sweep',
  'dash-jab-neutral': 'check', 'dash-jab-toward': 'lunge', 'dash-jab-away': 'withdraw',
  'dash-heavy-neutral': 'anti-air', 'dash-heavy-toward': 'body', 'dash-heavy-away': 'counter',
  'dash-drive-jab-neutral': 'body', 'dash-drive-jab-toward': 'rising-entry', 'dash-drive-jab-away': 'sweep',
  'dash-drive-heavy-neutral': 'anti-air', 'dash-drive-heavy-toward': 'overhead', 'dash-drive-heavy-away': 'evade', 'dash-wheel-kick': 'sweep',
};

/** Preserve the source move's job even when synthesis rewrites its pose label. */
export function weaponIntent(move: CombatMove): WeaponIntent {
  if (!move.weaponSourceMoveId) {
    if (move.id === 'weapon-heavy-heavy') return 'overhead';
    if (move.id === 'weapon-heavy-light') return 'check';
    if (move.id.startsWith('weapon-')) return move.id.endsWith('heavy') ? 'anti-air' : 'check';
  }
  const id = move.weaponSourceMoveId ?? move.id, intent = sources[id];
  if (!intent) throw new Error(`Weapon intent missing for ${id}`);
  return intent;
}
