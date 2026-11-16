import type { GameplaySnapshot3D } from '@hyperfocus/engine/project/runtime-3d';

type Combat = NonNullable<GameplaySnapshot3D['combat']>;
const language = {
  parry: { label: 'PARRY', detail: 'Opening denied', symbol: '◇' },
  tech: { label: 'TECH', detail: 'Recovery timed', symbol: '⌑' },
  escape: { label: 'ARMOR ESCAPE', detail: 'Charge spent', symbol: '◆' },
  di: { label: 'DI', detail: 'Launch steered', symbol: '↗' },
} as const;
export type DefenseMoment = { kind: keyof typeof language; frame: number; label: string; detail: string; symbol: string };
function latestContact(combat: Combat, fighterId: string) {
  for (let index = combat.exchange.length - 1; index >= 0; index--) if (combat.exchange[index]!.targetId === fighterId) return combat.exchange[index];
}

/** Name observed outcomes, never infer an escape from a button press or a tinted body. */
export function observedDefense(combat: Combat, fighterId: string): DefenseMoment | undefined {
  const fighter = combat.state.fighters.find(fighter => fighter.id === fighterId);
  if (!fighter || fighter.health <= 0) return;
  const contact = latestContact(combat, fighterId);
  if (!contact || combat.state.frame < contact.frame || combat.state.frame - contact.frame >= 90) return;
  const kind = contact.kind;
  if (kind === 'parry' || kind === 'tech' || kind === 'escape') return { kind, frame: contact.frame, ...language[kind] };
  const influence = combat.influence.find(item => item.id === fighterId);
  if (kind === 'hit' && influence && Math.hypot(influence.applied.x - influence.base.x, influence.applied.y - influence.base.y, influence.applied.z - influence.base.z) > .01) {
    return { kind: 'di', frame: contact.frame, ...language.di };
  }
}

/** Hold a brief DI confirmation after its small input window, until another contact supersedes it. */
export function createDefenseMoments() {
  const remembered = new Map<string, DefenseMoment>();let previous = -1;
  return (combat: Combat, fighterId: string) => {
    if (combat.state.frame < previous) remembered.clear();previous = combat.state.frame;
    const current = observedDefense(combat, fighterId), contact = latestContact(combat, fighterId);
    if (current) remembered.set(fighterId, current);
    const value = remembered.get(fighterId), fighter = combat.state.fighters.find(fighter => fighter.id === fighterId);
    if (value && (fighter?.health === 0 || combat.state.frame - value.frame >= 90 || !contact || contact.frame > value.frame || combat.state.frame < value.frame)) { remembered.delete(fighterId);return; }
    return value;
  };
}
