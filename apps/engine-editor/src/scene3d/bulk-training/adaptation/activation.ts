import type { CombatAiLearning } from '@hyperfocus/engine/project/runtime-3d';
import { generalTrainingModel } from './general.ts';
import type { createContextualTrainingStore } from './storage.ts';

type Store = ReturnType<typeof createContextualTrainingStore>;

/** Only durable lessons reach the next match; restores keep their current fight's exact model. */
export function createContextualTrainingActivation(options: {
  store: Store;
  initial?: Awaited<ReturnType<Store['load']>>;
  queue: (models: readonly [CombatAiLearning, CombatAiLearning]) => void;
}) {
  let revision = -1, disposed = false;
  let active: CombatAiLearning | undefined;
  function accept(value: Awaited<ReturnType<Store['load']>>) {
    if (disposed || value.revision <= revision) return;
    active = generalTrainingModel(value.rows);revision = value.revision;
    options.queue([structuredClone(active), structuredClone(active)]);
  }
  const unsubscribe = options.store.subscribe(accept);
  if (options.initial) accept(options.initial);
  return {
    // Storage failures remain visible in the training panel; they never replace a working model.
    async refresh() { if (!disposed) { try { accept(await options.store.load()); } catch { /* Keep the last durable revision. */ } } },
    reapply() { if (!disposed && active) options.queue([structuredClone(active), structuredClone(active)]); },
    dispose() { disposed = true;unsubscribe(); },
  };
}
