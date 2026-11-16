import type { CombatProject3D, GameplaySnapshot3D } from '@hyperfocus/engine/project/runtime-3d';

/** Preview the defeated fighter's next-round refill; survivors show real stamina. */
export function recoveryResourceProgress(snapshot: GameplaySnapshot3D) {
  const match = snapshot.combat?.match;
  if (!match || match.phase !== 'round-result' || match.winner === 'player' && match.playerWins >= 2 || match.winner === 'opponent' && match.opponentWins >= 2) return 0;
  const t = Math.max(0, Math.min(1, (90 - match.ticks) / 89));
  return t * t * (3 - 2 * t);
}

export function presentedFighterResources(options: { snapshot: GameplaySnapshot3D; definition?: CombatProject3D; fighter: { health: number; stamina: number } }) {
  const { snapshot, definition, fighter } = options, progress = recoveryResourceProgress(snapshot);
  return { health: fighter.health + ((definition?.config.maxHealth ?? 100) - fighter.health) * progress,
    stamina: fighter.health > 0 ? fighter.stamina : fighter.stamina + ((definition?.config.maxStamina ?? 100) - fighter.stamina) * progress, progress };
}
