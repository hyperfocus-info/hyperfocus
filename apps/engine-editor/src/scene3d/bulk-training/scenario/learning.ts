import type { CombatAiLearningEvidence } from '@hyperfocus/engine/project/runtime-3d';
import type { ScenarioProgress } from './simulation.ts';

/** Raw attempts remain raw; one checkpoint contributes at most one effective sample per choice. */
export function scenarioLessonEvidence(progress: ScenarioProgress, opponentId: string, already: ReadonlyMap<string, number>) {
  const actions: CombatAiLearningEvidence['actions'] = [], credits: { key: string; samples: number }[] = [];
  let completeWindows = 0;
  for (const action of progress.actions) {
    const seen = new Set<string>(), sourcePrefix = `${JSON.stringify([opponentId, progress.seed, progress.frame, progress.seat, action])}:`;
    const credited = [...already].filter(([key]) => key.startsWith(sourcePrefix)).reduce((sum, [, samples]) => sum + samples, 0);
    const results = progress.results.filter(row => {
      if (row.action !== action || !(row.rollout ? row.rollout.complete : row.status === 'complete')) return false;
      const key = `${sourcePrefix}${row.opponentSeed}`;
      if (already.has(key) || seen.has(key) || seen.size >= Math.floor(Math.max(0, 1 - credited) * 16 + 1e-9)) return false;
      seen.add(key);credits.push({ key, samples: 0.0625 });return true;
    });
    const samples = results.length / 16;
    if (!samples) continue;
    actions.push({ context: progress.context, action: action.replace(/^forced:/, 'attack:'), decay: 1, samples,
      reward: samples * results.reduce((sum, row) => sum + (row.rollout?.reward ?? row.reward), 0) / results.length });
    completeWindows += results.length;
  }
  const evidence: CombatAiLearningEvidence = { version: 1, opponentId, actions, habits: [], probes: progress.decisionProbe ? [progress.decisionProbe] : [],
    omittedProbes: 0, omittedActions: 0, omittedHabits: 0 };
  return { evidence, credits, completeWindows };
}
