import type { GameplayProject3D, PortableAsset3D } from '@hyperfocus/engine/project/runtime-3d';
import { createBulkPool, type BulkStatus } from './pool.ts';
import { watchLocalCpu } from './cpu.ts';
import { readBulkHistory, serializeBulkHistory } from './history.ts';
import { createLearningControls } from './learning/controls.ts';
import type { createPolicyStore } from './learning/store.ts';
import type { createSharedPolicySync } from './learning/shared/sync.ts';
import { bulkObservations, createBulkDisplay } from './observations.ts';
import { createTrainingView } from './ui/view.ts';
import { createTrainingLog } from './ui/log.ts';
import { createTrainingTelemetry } from './ui/telemetry.ts';
import { createContextualTrainingStore } from './adaptation/storage.ts';
import { createContextualPersistence } from './adaptation/persistence.ts';
import { tacticalFindings, tacticalFindingLines } from './tactical-findings.ts';
import { createScenarioControls } from './scenario/controls.ts';

export function createBulkTrainingPanel(options: { host: HTMLElement; project: GameplayProject3D; assets: readonly PortableAsset3D[]; contentIdentity: string; contextualStore?: ReturnType<typeof createContextualTrainingStore>; liveLearning?: { snapshot(): { pending: number; error?: string }; retry(): Promise<void> }; policyStore?: ReturnType<typeof createPolicyStore>; sharedPolicy?: ReturnType<typeof createSharedPolicySync> }) {
  const launcher = document.createElement('button');launcher.type = 'button';launcher.textContent = 'AI training';launcher.dataset.bulkTrainingOpen = '';launcher.style.display = 'none';launcher.tabIndex = -1;
  const view = createTrainingView(), { dialog } = view, log = createTrainingLog(), telemetry = createTrainingTelemetry();
  let persistedAt = 0, persistedKey = '', cpuText = 'CPU · sampling…', logText = '';
  let sample: { seed?: number; ticks: number; time: number } | undefined, rate = '—';
  let learning: ReturnType<typeof createLearningControls> | undefined;
  let scenarios: ReturnType<typeof createScenarioControls> | undefined;
  let disposed = false, previousState: BulkStatus['state'] = 'idle';
  const text = (node: HTMLElement, value: string) => { if (node.textContent !== value) node.textContent = value; };
  const disable = (node: HTMLButtonElement, value: boolean) => { if (node.disabled !== value) node.disabled = value; };
  function render(value: BulkStatus) {
    text(view.percent, `${value.effort}%`);text(view.cpu, cpuText);
    learning?.update(value);learning?.render();
    scenarios?.update(value);
    const investigation = scenarios?.status;
    const now = performance.now();
    const cpuMatch = cpuText.match(/(\d+(?:\.\d+)?)%/);
    telemetry.update({ value, now, systemCpuPercent: cpuMatch ? Number(cpuMatch[1]) : undefined });
    if (value.state !== 'running' || sample?.seed !== value.runSeed) { sample = undefined;rate = '—'; }
    else if (sample && now - sample.time >= 1000) { rate = Math.round((value.ticks - sample.ticks) * 1000 / (now - sample.time)).toLocaleString();sample = undefined; }
    if (value.state === 'running') sample ??= { seed: value.runSeed, ticks: value.ticks, time: now };
    text(view.sets, value.fights.toLocaleString());text(view.rate, rate);text(view.workers, `${value.busyWorkers ?? value.workers} / ${value.workers}`);
    text(view.state, `${value.state === 'idle' ? 'Ready' : value.state} · ${value.ticks.toLocaleString()} fight ticks${value.error ? ` · ${value.error}` : investigation ? ' · fights and investigations share workers' : value.state === 'running' ? ' · runs until stopped' : ''}`);
    const savedLessons = persistence.snapshot(), contextual = value.contextual, live = options.liveLearning?.snapshot();
    text(view.lessons, live?.error ? `Fight lesson storage: ${live.error} · ${live.pending} batches pending. Retry lesson storage to save them.`
      : savedLessons.persistence === 'loading' ? 'Loading learned lessons…'
      : savedLessons.error ? `Lesson storage: ${savedLessons.error} Pending evidence remains in this session's export.`
      : savedLessons.persistence === 'pending' ? 'Learned lessons · pending save'
      : `Learned lessons · saved revision ${savedLessons.storageRevision} · available next match`);
    const estimates = savedLessons.actionContexts;
    text(view.adaptation, contextual ? `${contextual.informative} fights contributed lessons · ${estimates} action/context estimates` : 'Start training to learn which actions work in which situations.');
    const finishedEvaluations = (value.experiments?.completed ?? 0) + (value.experiments?.pending.filter(row => ['approved', 'rejected'].includes(row.learning.status)).length ?? 0);
    text(view.phase, investigation ? `Investigations · ${value.investigationQueue?.active ?? 0} workers · ${value.investigationQueue?.queued ?? 0} tasks queued · ${investigation.checkpoints} situations` : value.benchmark ? `Saved model vs cold · ${value.benchmark.sets ? (100 * value.benchmark.points / value.benchmark.sets).toFixed(1) : '—'}% score · ${value.benchmark.sets} sets · seats alternate` : value.learning ? `Fight lessons · ${finishedEvaluations} policy evaluations` : 'Fight lessons · learning continuously');
    text(view.coverage, `${value.trials?.length ?? 0}/${value.fights + value.capped} detailed sets`);
    const evidenceValue = value.contextual?.modelRecordsOmitted ? { ...value, contextual: { ...value.contextual, models: persistence.rows() } } : value;
    text(view.feed, [scenarios?.finding(), ...tacticalFindingLines(evidenceValue)].filter(Boolean).join('\n\n'));text(view.history, logText);
    const working = ['running', 'paused'].includes(value.state);
    view.retryLessons.hidden = savedLessons.persistence !== 'error' && !live?.error;disable(view.retryLessons, savedLessons.persistence === 'loading');
    disable(view.resetLessons, value.workers > 0 || working || savedLessons.persistence === 'loading');
    disable(view.benchmark, value.workers > 0 || working);disable(view.pause, !working);text(view.pause, value.state === 'paused' ? 'Resume' : 'Pause');disable(view.stop, !working);disable(view.download, value.ticks === 0);
    const persistKey = `${value.runSeed}:${value.ticks}:${value.state}:${value.learning?.trials.length}:${value.experiments?.completed}:${value.contextual?.revision}:${savedLessons.storageRevision}:${savedLessons.persistence}:${savedLessons.error}`;
    if (persistKey !== persistedKey && (now - persistedAt > 2000 || ['paused','stopped','error'].includes(value.state))) {
      persistedAt = now;persistedKey = persistKey;
      try { localStorage.setItem('tod-bulk-last-run', serializeBulkHistory({ identity: options.contentIdentity, totals: { ...value, ...(value.contextual ? { contextual: { ...value.contextual, ...savedLessons } } : {}) } })); } catch { /* Export remains available. */ }
    }
  }
  const display = createBulkDisplay({ render });
  const persistence = createContextualPersistence({ store: options.contextualStore ?? createContextualTrainingStore({ contentIdentity: options.contentIdentity }),
    changed: () => { if (!disposed) display.update(pool.status); } });
  const pool = createBulkPool({ project: options.project, assets: options.assets,
    changed: value => {
      if (value.state !== previousState && ['paused', 'stopped', 'error'].includes(value.state)) void persistence.flush().catch(() => undefined);
      previousState = value.state;logText = log.update(value);display.update(value);
    }, initial: readBulkHistory(options.contentIdentity), onContextual: rows => {
      persistence.update(rows);
      if (['paused', 'stopped', 'error'].includes(pool.status.state)) void persistence.flush().catch(() => undefined);
    },
    onExperiment: experiment => learning!.finish(experiment) });
  learning = createLearningControls({ host: view.tools, actions: view.actions, secondaryActions: view.secondary,
    identity: options.contentIdentity, store: options.policyStore, shared: options.sharedPolicy,
    requestRender: () => display.update(pool.status), trainingBlocked: () => ['loading', 'error'].includes(persistence.snapshot().persistence),
    train: async value => { await options.liveLearning?.retry();const loaded = await persistence.load();pool.start({ learning: value, contextualRows: loaded.rows }); },
    continuous: async () => { await options.liveLearning?.retry();const loaded = await persistence.load();pool.start({ contextualRows: loaded.rows }); } });
  scenarios = createScenarioControls({ tools: view.tools, actions: view.actions, enqueue: request => pool.enqueueScenario(request), record: (progress, input) => pool.recordScenario(progress, input) });
  void persistence.load().catch(() => undefined);
  const stopCpu = watchLocalCpu({ active: () => dialog.open, update: value => { cpuText = value;display.update(pool.status); } });
  view.effort.oninput = () => pool.effort(Number(view.effort.value));view.benchmark.onclick = () => { void (async () => {
    disable(view.benchmark, true);await options.liveLearning?.retry();const loaded = await persistence.load();
    if (disposed || pool.status.workers || ['running', 'paused'].includes(pool.status.state)) return;
    view.tools.open = false;pool.start({ contextualRows: loaded.rows, benchmark: true });
  })().catch(() => display.update(pool.status)); };
  view.pause.onclick = () => pool.status.state === 'paused' ? pool.resume() : pool.pause();view.stop.onclick = () => pool.stop();
  view.retryLessons.onclick = () => { void (async () => { await options.liveLearning?.retry();await persistence.retry();learning?.clearTrainingError(); })().catch(() => display.update(pool.status)); };
  view.resetLessons.onclick = () => {
    if (pool.status.workers || ['running', 'paused'].includes(pool.status.state)) return;
    void (async () => { await options.liveLearning?.retry();await persistence.reset();learning?.clearTrainingError(); })().catch(() => display.update(pool.status));
  };
  view.download.onclick = () => {
    const value = pool.status;
    const report = { version: 1, contentIdentity: options.contentIdentity, recordedAt: new Date().toISOString(), ingestionStatus: value.benchmark ? 'evaluation-only' : persistence.snapshot().persistence,
      opponents: [{ type: 'ai', level: 9 }, { type: 'ai', level: 9 }], ...(value.learning ? {} : value.benchmark ? { seedSchedule: 'paired-seeds-swapped-seats' } : { seedStride: 1 }),
      analysisGuide: 'Continuous training immediately ingests fresh fight and replay evidence into shared contextual lessons. Saved lessons activate next match. Training explores legal choices; benchmark freezes the saved model between sets and compares it against a cold opponent on paired seeds with seats swapped, without persisting benchmark evidence. Legacy explicit offset experiments retain their own approval gate. Recent diagnostic history is bounded; learned action estimates are retained. Match totals alone do not prove strength.',
      ...value, ...(value.contextual ? { contextual: { ...value.contextual, ...persistence.snapshot() } } : {}),
      ...(value.contextual?.modelRecordsOmitted ? { contextualStorageModels: persistence.rows() } : {}),
      observations: bulkObservations(value), tacticalFindings: tacticalFindings(value.contextual?.modelRecordsOmitted ? { ...value, contextual: { ...value.contextual, models: persistence.rows() } } : value), scenarioReplays: scenarios?.snapshot(), investigationFindings: scenarios?.report(), log: logText.split('\n\n'), performance: telemetry.snapshot() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');link.href = url;link.download = 'touch-of-death-bulk-training.json';link.click();setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  view.back.onclick = () => dialog.close();dialog.addEventListener('close', () => { pool.pause();launcher.focus(); });
  launcher.onclick = () => { dialog.showModal();view.actions.querySelector<HTMLButtonElement>('[data-policy-train]')?.focus(); };
  options.host.append(view.style, launcher, dialog);logText = log.update(pool.status);display.update(pool.status);
  return { get open() { return dialog.open; }, available(value: boolean) { launcher.hidden = !value;if (!value && dialog.open) dialog.close(); },
    dispose() { disposed = true;pool.dispose();scenarios?.dispose();void persistence.dispose().catch(error => console.error("Failed to save AI training lessons during cleanup.", error));display.dispose();learning?.dispose();stopCpu();dialog.remove();launcher.remove();view.style.remove(); } };
}
