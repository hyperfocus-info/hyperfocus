import type { GameplaySnapshot3D } from '@hyperfocus/engine/project/runtime-3d';

/** Translate round-local contact time to recording time, retaining one second of lead-in. */
export function decisiveReplayFrame(combat: GameplaySnapshot3D['combat'], frame: number, length: number) {
  if (!combat) return 0;
  let opening = [...combat.exchange].reverse().find(event => event.decisive);
  if (!opening) return 0;
  const visited = new Set<string>();
  while (opening.previousId && !visited.has(opening.previousId)) {
    visited.add(opening.previousId);const previous = combat.exchange.find(event => event.id === opening!.previousId);
    if (!previous) break;opening = previous;
  }
  return Math.max(0, Math.min(length, frame - (combat.state.frame - opening.frame) - 60));
}
