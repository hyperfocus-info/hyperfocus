import type { BulkStatus } from '../pool.ts';
import type { BulkSimulationOptions } from '../protocol.ts';
import { createPolicyStore } from './store.ts';
import type { createSharedPolicySync } from './shared/sync.ts';

/** A passing run commits against the revision it trained from, then activates automatically. */
export function createLearningControls(options: {
  host: HTMLElement; actions: HTMLElement; secondaryActions?: HTMLElement; identity: string;
  requestRender?: () => void;
  train: ((learning: NonNullable<BulkSimulationOptions['learning']>) => void) | ((learning: NonNullable<BulkSimulationOptions['learning']>) => Promise<void>);
  trainingBlocked?: () => boolean;
  /** Ordinary training uses contextual evidence and is independent of offset storage. */
  continuous?: () => Promise<void>;
  store?: ReturnType<typeof createPolicyStore>;
  shared?: ReturnType<typeof createSharedPolicySync>;
}) {
  const store = options.store ?? createPolicyStore({ identity: options.identity });
  const status = document.createElement('p');status.dataset.policyStatus = '';status.setAttribute('role', 'status');
  options.host.append(status);
  const sharedStatus = document.createElement('p');sharedStatus.dataset.sharedPolicyStatus = '';sharedStatus.setAttribute('role', 'status');options.host.append(sharedStatus);
  const button = (text: string) => { const value = document.createElement('button');value.type = 'button';value.textContent = text;(options.secondaryActions ?? options.actions).append(value);return value; };
  const train = button('Start training'), retry = button('Retry saving policy'), refresh = button('Retry policy storage');
  const restore = button('Revert last improvement'), clear = button('Reset AI to baseline');
  options.actions.prepend(train);
  train.dataset.policyTrain = '';restore.dataset.policyRestore = '';clear.dataset.policyClear = '';
  let error = '', saved = false, busy = !options.continuous, disposed = false, trainingError = false;
  let baseRevision: number | undefined, last: BulkStatus | undefined;
  let pending: { experiment: NonNullable<BulkStatus['learning']>; expectedRevision: number } | undefined;
  const text = (node: HTMLElement, value: string) => { if (node.textContent !== value) node.textContent = value; };
  const flag = (node: HTMLButtonElement, key: 'disabled' | 'hidden', value: boolean) => { if (node[key] !== value) node[key] = value; };
  const requestRender = () => options.requestRender ? options.requestRender() : render();
  function render() {
    if (disposed) return;
    const snapshot = store.snapshot(), experiment = last?.learning;
    const shared = options.shared?.snapshot();
    if (sharedStatus.hidden !== !shared) sharedStatus.hidden = !shared;
    text(sharedStatus, shared?.available
      ? `Shared revision ${shared.revision} · ${shared.pending} uploads pending${shared.error ? ` · ${shared.error}` : ''}`
      : shared?.error ? `Local training · ${shared.error}` : 'Local training');
    const working = busy || !!last && (last.workers > 0 || last.state === 'running' || last.state === 'paused');
    const problem = error || snapshot.error;
    flag(train, 'disabled', working || (!options.continuous && (!!problem || snapshot.stale)) || !!options.trainingBlocked?.());
    flag(restore, 'disabled', working || !!problem || snapshot.stale || !snapshot.evidence && !snapshot.previous);
    flag(clear, 'disabled', working || !!snapshot.error || snapshot.stale);
    flag(retry, 'hidden', !error || !pending);flag(retry, 'disabled', working);
    flag(refresh, 'hidden', !problem);flag(refresh, 'disabled', working);
    const progress = experiment ? ` · ${experiment.status} ${experiment.trials.length}/${experiment.totalTrials}` : '';
    text(status, busy ? 'Updating policy storage…'
      : problem ? `${trainingError ? 'Training' : 'Policy storage'}: ${problem} The last verified policy stays active.`
      : `AI revision ${snapshot.revision}${progress}${saved ? ' · Saved for the next match' : ''}`);
  }
  async function execute(action: () => Promise<unknown>) {
    if (disposed || busy) return;
    busy = true;trainingError = false;requestRender();
    try { await action();error = ''; }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    finally { busy = false;requestRender(); }
  }
  async function save() {
    if (!pending) return;
    await store.save(pending);pending = undefined;saved = true;
  }
  const unsubscribe = store.subscribe(requestRender);
  const unsubscribeShared = options.shared?.subscribe(requestRender);
  const ready = store.read().then(() => { if (!options.continuous) busy = false;requestRender(); });
  requestRender();
  train.onclick = () => { void execute(async () => {
    if (options.continuous) {
      try { await options.continuous(); }
      catch (cause) { trainingError = true;throw cause; }
      return;
    }
    // Auth is requested only by this user action. Offline training remains usable.
    await options.shared?.prepare().catch(() => undefined);
    const current = await store.read();
    if (current.error || current.stale) throw Error(current.error || 'Refresh policy storage before training.');
    baseRevision = current.revision;saved = false;pending = undefined;
    trainingError = false;
    try { await options.train({ active: current.active, previous: current.previous }); }
    catch (cause) { trainingError = true;throw cause; }
  }); };
  retry.onclick = () => { void execute(save); };
  refresh.onclick = () => { void execute(async () => {
    const current = await store.read({ force: true });
    if (current.error) throw Error(current.error);
    // Refresh never rebases a failed candidate's evaluation onto a different revision.
  }); };
  restore.onclick = () => { void execute(async () => { await store.restorePrevious({ expectedRevision: store.snapshot().revision });saved = true; }); };
  clear.onclick = () => { void execute(async () => { await store.useOriginal({ expectedRevision: store.snapshot().revision });saved = true; }); };
  return {
    ready,
    render,
    clearTrainingError() { if (trainingError) { trainingError = false;error = '';requestRender(); } },
    /** Called by the coordinator, independently of the throttled display. */
    async finish(experiment: NonNullable<BulkStatus['learning']>) {
      await ready;
      if (disposed || busy || baseRevision === undefined) throw Error('Policy storage is not ready to finalize training.');
      busy = true;trainingError = false;requestRender();
      try {
        if (experiment.status === 'approved' && experiment.approved) {
          pending = { experiment: structuredClone(experiment), expectedRevision: baseRevision };
          await save();
        } else if (experiment.status !== 'rejected') throw Error('Cannot finalize incomplete policy evidence.');
        const current = await store.read();
        if (current.error || current.stale) throw Error(current.error || 'Refresh policy storage before continuing training.');
        baseRevision = current.revision;error = '';
        return { active: current.active, previous: current.previous };
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);throw cause;
      } finally { busy = false;requestRender(); }
    },
    update(value: BulkStatus) {
      last = value;
      if (!options.requestRender) render();
    },
    dispose() { disposed = true;unsubscribe();unsubscribeShared?.();if (!options.store) store.dispose(); },
  };
}
