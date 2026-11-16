import type { TacticalCandidate } from './selection.ts';

/** Opt-in controlled experiments. Callbacks belong to the host, never to checkpoints. */
export type CombatAiDecisionOverride = (seat: 0 | 1, frame: number, candidates: readonly TacticalCandidate[]) => string | undefined;
export type CombatAiControllerDecisionOverride = (frame: number, candidates: readonly TacticalCandidate[]) => string | undefined;

export function bindCombatAiDecisionOverride(override: CombatAiDecisionOverride | undefined, seat: 0 | 1): CombatAiControllerDecisionOverride | undefined {
  return override ? (frame, candidates) => override(seat, frame, candidates) : undefined;
}

/** A detached read-only view cannot mutate legal candidates or bypass their identity gate. */
export function overrideCombatAiDecision(candidates: readonly TacticalCandidate[], frame: number, override?: CombatAiControllerDecisionOverride) {
  if (!override) return undefined;
  const view = Object.freeze(candidates.map(candidate => Object.freeze({ ...candidate })));
  const id = override(frame, view);
  if (id === undefined) return undefined;
  const chosen = candidates.find(candidate => candidate.id === id);
  if (typeof id !== 'string' || !chosen) throw Error('AI scenario override must choose an available legal candidate');
  return chosen;
}
