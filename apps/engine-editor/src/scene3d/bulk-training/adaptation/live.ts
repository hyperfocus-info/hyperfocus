import type { createGameplay3D } from '@hyperfocus/engine/project/runtime-3d';
import { createContextualTrainingSession, type ContextualTrialResult } from './session.ts';
import type { createContextualTrainingStore } from './storage.ts';

type Game = Pick<ReturnType<typeof createGameplay3D>, 'startCombatAiLearningEvidence' | 'finishCombatAiLearningEvidence'> & { combatMatch(): { phase: string } | undefined };
function generalEvidence(value: ContextualTrialResult['evidence'][number]) {
  return value ? { ...value, opponentId: 'general', habits: [], probes: value.probes.map(probe => ({ ...probe, opponentId: 'general' })) } : undefined;
}

/** Live play supplies only fresh journals, using the same updater as bulk fights. */
export function createLiveCombatLearning(options: { game: Game; store: Pick<ReturnType<typeof createContextualTrainingStore>, 'load' | 'save'> }) {
  const pending: { sequence: number; complete: boolean; result: NonNullable<ReturnType<Game['finishCombatAiLearningEvidence']>> }[] = [];
  let sequence = 0, tracking = false, finished = false, disposed = false, error = '';
  let saving: Promise<void> | undefined;
  function flush(): Promise<void> {
    if (saving) return saving;
    const run = async () => {
      try {
        while (pending.length) {
          const batch = pending.slice();
          let committed = false;
          for (let attempt = 0; attempt < 3 && !committed; attempt++) {
            const stored = await options.store.load(), session = createContextualTrainingSession({ general: true, rows: stored.rows });
            for (const item of batch) {
              const evidence = [generalEvidence(item.result.evidence[0]), generalEvidence(item.result.evidence[1])] as const;
              session.record({ job: 'live', seed: item.sequence, complete: item.complete,
                result: { input: await session.input(), learning: item.result.learning, evidence } });
            }
            try { await options.store.save({ rows: session.rows(), expectedRevision: stored.revision });committed = true; }
            catch (cause) { if (attempt === 2 || !(cause instanceof Error) || !cause.message.includes('revision conflict')) throw cause; }
          }
          pending.splice(0, batch.length);
        }
        error = '';
      } catch (cause) { error = cause instanceof Error ? cause.message : String(cause);throw cause; }
    };
    saving = run().finally(() => { saving = undefined; });return saving;
  }
  function finish(complete: boolean) {
    if (!tracking) return;
    tracking = false;finished = true;
    const result = options.game.finishCombatAiLearningEvidence();
    if (!result?.evidence.some(value => value?.actions.length)) return;
    pending.push({ sequence: sequence++, complete, result });void flush().catch(() => undefined);
  }
  function observe(excluded: boolean, actions?: Iterable<string>) {
    if (disposed) return;
    const phase = options.game.combatMatch()?.phase;
    if (excluded || phase === 'practice') { tracking = false;finished = false;return; }
    if (actions && [...actions].some(action => action === 'match:quit' || action === 'match:menu')) { finish(false);return; }
    if (phase === 'match-result') { finish(true);return; }
    if (!phase || phase === 'menu') { finish(false);finished = false;return; }
    if (phase === 'intro' || phase === 'countdown') finished = false;
    if (!['intro', 'countdown', 'fighting', 'round-result'].includes(phase)) return;
    if (!tracking && !finished) {
      // A restored/reviewed pending attempt predates this journal and cannot earn fresh credit.
      options.game.finishCombatAiLearningEvidence();options.game.startCombatAiLearningEvidence();tracking = true;
    }
  }
  return {
    before(options: { excluded?: boolean; actions?: Iterable<string> } = {}) { observe(options.excluded ?? false, options.actions); },
    after(options: { excluded?: boolean } = {}) { observe(options.excluded ?? false); },
    invalidate() { tracking = false;finished = false; },
    snapshot() { return { pending: pending.length, ...(error ? { error } : {}) }; },
    retry: flush,
    async dispose() { finish(false);disposed = true;await flush(); },
  };
}
