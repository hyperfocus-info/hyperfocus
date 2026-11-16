import type { CombatFighterState } from '../../../../combat/state.ts';
import type { CombatAiLearning } from './model.ts';

type Level = 'low' | 'medium' | 'high' | 'unknown';
export type LearningDecisionFacts = {
  targetStamina: Level; targetHealth: Level;
  targetMotion: 'retreat' | 'approach' | 'stationary' | 'unknown';
  /** No opponent wall/corner observation is supplied to the learning controller. */
  targetCorner: 'unknown';
};
export type CombatAiLearningOutcomeEvidence = {
  context: string; action: string; facts: LearningDecisionFacts;
  completeCount: number; partialCount: number; censoredCount: number; confidence: number;
  completeReward: number; completeDealt: number; completeReceived: number;
  partialReward: number; partialDealt: number; partialReceived: number;
  outcomeCounts: Record<string, number>;
};
type Sink = { outcomes: CombatAiLearningOutcomeEvidence[]; omittedOutcomes: number };
type Journal = { sink: Sink; latest?: LearningDecisionFacts; attempts: WeakMap<object, LearningDecisionFacts>; closed: WeakSet<object> };
const journals = new WeakMap<CombatAiLearning, Journal>();
const unknown = (): LearningDecisionFacts => ({ targetStamina: 'unknown', targetHealth: 'unknown', targetMotion: 'unknown', targetCorner: 'unknown' });
const level = (value: number, max: number | undefined, low: number, medium: number): Level =>
  max === undefined || !(max > 0) || !Number.isFinite(value) ? 'unknown' : value / max <= low ? 'low' : value / max <= medium ? 'medium' : 'high';

export function trackOutcomeEvidence(memory: CombatAiLearning, sink: Sink) { journals.set(memory, { sink, attempts: new WeakMap(), closed: new WeakSet() }); }

/** Only supplied committed fighter facts; motion measures their own visible radial displacement. */
export function observeOutcomeFacts(memory: CombatAiLearning, self: CombatFighterState, target: CombatFighterState, distance: number, maxHealth?: number, maxStamina?: number) {
  const journal = journals.get(memory);if (!journal) return;
  const t = memory.transient, dx = target.position.x - self.position.x, dz = target.position.z - self.position.z;
  const radial = ((target.position.x - t.x) * dx + (target.position.z - t.z) * dz) / (distance || 1);
  journal.latest = { targetStamina: level(target.stamina, maxStamina, .25, .6), targetHealth: level(target.health, maxHealth, .35, .7),
    targetMotion: t.frame < 0 ? 'unknown' : radial > .015 ? 'retreat' : radial < -.015 ? 'approach' : 'stationary', targetCorner: 'unknown' };
}

/** Facts belong to the decision, and survive delayed delivery and later opponent observations. */
export function startOutcomeAttempt(memory: CombatAiLearning, attempt: object) {
  const journal = journals.get(memory);if (journal) journal.attempts.set(attempt, { ...(journal.latest ?? unknown()) });
}

export function finishOutcomeAttempt(memory: CombatAiLearning, attempt: { context: string; action: string; dealt: number; received: number }, status: 'complete' | 'partial' | 'censored', outcome: string, reward = 0) {
  const journal = journals.get(memory);if (!journal) return;
  if (journal.closed.has(attempt)) return;journal.closed.add(attempt);
  const facts = journal.attempts.get(attempt) ?? unknown();journal.attempts.delete(attempt);
  const action = attempt.action.startsWith('forced:') ? `attack:${attempt.action.slice(7)}` : attempt.action;
  const rows = journal.sink.outcomes;
  let row = rows.find(row => row.context === attempt.context && row.action === action && row.facts.targetStamina === facts.targetStamina
    && row.facts.targetHealth === facts.targetHealth && row.facts.targetMotion === facts.targetMotion);
  if (!row) {
    if (rows.length >= 64) { const old = rows.shift()!;journal.sink.omittedOutcomes += old.completeCount + old.partialCount + old.censoredCount; }
    row = { context: attempt.context, action, facts, completeCount: 0, partialCount: 0, censoredCount: 0, confidence: 0,
      completeReward: 0, completeDealt: 0, completeReceived: 0, partialReward: 0, partialDealt: 0, partialReceived: 0, outcomeCounts: {} };rows.push(row);
  }
  row[`${status}Count`]++;row.outcomeCounts[outcome] = (row.outcomeCounts[outcome] ?? 0) + 1;
  if (status === 'censored') return;
  row.confidence += status === 'partial' ? .25 : 1;
  row[`${status}Reward`] += reward;row[`${status}Dealt`] += attempt.dealt;row[`${status}Received`] += attempt.received;
}
