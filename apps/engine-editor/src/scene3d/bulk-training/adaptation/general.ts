import { prepareCombatAiLearning, type CombatAiLearning } from '@hyperfocus/engine/project/runtime-3d';
import type { ContextualTrainingRow } from './storage.ts';

/** Migrate legacy banks once without counting shared inherited estimates more than once. */
export function generalTrainingModel(rows: readonly ContextualTrainingRow[]): CombatAiLearning {
  const existing = rows.find(row => row.opponentKey === 'general');
  const model = prepareCombatAiLearning({ model: existing?.model, opponentId: 'general' });
  model.habits = [];
  if (existing) return model;
  const actions = new Map<string, CombatAiLearning['actions'][number]>();
  const ordered = [...rows.filter(row => row.opponentKey === 'default'), ...rows.filter(row => row.opponentKey !== 'default')];
  const defaults = new Set(ordered.find(row => row.opponentKey === 'default')?.model.actions.map(row => `${row.context}|${row.action}`));
  for (const row of ordered) for (const action of row.model.actions) {
    const key = `${action.context}|${action.action}`, prior = actions.get(key);
    if (!prior || !defaults.has(key) && action.samples > prior.samples) actions.set(key, { ...action });
  }
  model.actions = [...actions.values()];
  return model;
}
