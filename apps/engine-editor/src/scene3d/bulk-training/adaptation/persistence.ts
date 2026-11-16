import { createContextualTrainingStore, type ContextualTrainingRow } from './storage.ts';

/** One save owns a revision at a time; newer observations remain pending until that save completes. */
export function createContextualPersistence(options: { store: ReturnType<typeof createContextualTrainingStore>; changed?: () => void; delayMs?: number }) {
  let state: 'loading' | 'pending' | 'saved' | 'error' = 'loading', error = '', storageRevision = 0, loaded = false;
  let latest: ContextualTrainingRow[] = [], sequence = 0, committed = 0, disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined, loading: Promise<Awaited<ReturnType<typeof options.store.load>>> | undefined, saving: Promise<void> | undefined;
  let resetting: Promise<void> | undefined;
  const notify = () => options.changed?.();
  const cancel = () => { clearTimeout(timer);timer = undefined; };
  const failed = (cause: unknown) => { state = 'error';error = cause instanceof Error ? cause.message : String(cause);notify(); };
  function flush(): Promise<void> {
    if (resetting) return resetting.then(flush);
    cancel();if (saving) return saving;
    if (!loaded || sequence === committed) return Promise.resolve();
    const run = async () => {
      try {
        while (sequence !== committed) {
          const captured = sequence, rows = structuredClone(latest);state = 'pending';error = '';notify();
          const record = await options.store.save({ rows, expectedRevision: storageRevision });
          storageRevision = record.revision;committed = captured;
        }
        state = 'saved';error = '';notify();
      } catch (cause) { failed(cause);throw cause; }
    };
    saving = run().finally(() => { saving = undefined; });return saving;
  }
  function load(): Promise<Awaited<ReturnType<typeof options.store.load>>> {
    if (resetting) return resetting.then(load);
    if (loading) return loading;
    const run = async () => {
      try {
        await flush();state = 'loading';error = '';notify();
        const record = await options.store.load();latest = record.rows;storageRevision = record.revision;loaded = true;
        state = 'saved';notify();return record;
      } catch (cause) { failed(cause);throw cause; }
    };
    loading = run().finally(() => { loading = undefined; });return loading;
  }
  return {
    load, flush,
    update(rows: readonly ContextualTrainingRow[]) {
      if (disposed) return;
      if (!loaded) throw Error('Load contextual lessons before collecting a training set.');
      latest = structuredClone([...rows]);sequence++;
      if (state !== 'error') state = 'pending';notify();
      if (!timer && !saving && state !== 'error') timer = setTimeout(() => { timer = undefined;void flush().catch(() => undefined); }, options.delayMs ?? 2000);
    },
    async retry() { if (!loaded) await load();else if (sequence !== committed) await flush();else await load(); },
    reset() {
      if (resetting) return resetting;
      cancel();const priorLoading = loading, priorSaving = saving;
      const run = async () => {
        await priorLoading?.catch(() => undefined);await priorSaving?.catch(() => undefined);
        let revision = 0, discardInvalid = false;
        try { revision = (await options.store.load()).revision; } catch { discardInvalid = true; }
        try {
          const record = await options.store.reset({ expectedRevision: revision, discardInvalid });
          latest = [];sequence++;committed = sequence;storageRevision = record.revision;loaded = true;state = 'saved';error = '';notify();
        } catch (cause) { failed(cause);throw cause; }
      };
      resetting = Promise.resolve().then(run).finally(() => { resetting = undefined;notify(); });
      state = 'loading';error = '';notify();return resetting;
    },
    rows() { return structuredClone(latest); },
    snapshot() { return { persistence: resetting ? 'loading' as const : state, storageRevision, opponents: latest.length,
      actionContexts: latest.reduce((sum, row) => sum + row.model.actions.length, 0), habitContexts: latest.reduce((sum, row) => sum + row.model.habits.length, 0),
      pending: sequence !== committed, ...(error ? { error } : {}) }; },
    async dispose() { disposed = true;cancel();await flush(); },
  };
}
