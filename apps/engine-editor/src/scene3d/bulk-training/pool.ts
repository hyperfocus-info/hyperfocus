import type { GameplayProject3D, PortableAsset3D } from '@hyperfocus/engine/project/runtime-3d';
import { createBulkWorker } from './bootstrap.ts';
import type { BulkProgress, BulkSimulationOptions, BulkWorkerRequest, BulkWorkerResponse } from './protocol.ts';
import { createPolicyPipeline, policyJobKey } from './learning/pipeline.ts';
import { createContextualTrainingSession } from './adaptation/session.ts';
import type { ContextualTrainingRow } from './adaptation/storage.ts';
import type { PolicyTrial } from '@hyperfocus/touch-of-death/learning/trials';
import { createScenarioQueue, type ScenarioQueueJob, type ScenarioQueueRequest } from './scenario/queue.ts';

/** Pool transport contract; native Workers remain structurally compatible. */
export type BulkWorker = {
  onmessage: ((event: MessageEvent<BulkWorkerResponse>) => void) | null;
  onerror?: ((event: ErrorEvent) => void) | null;
  postMessage(message: BulkWorkerRequest): void;
  terminate(): void;
};

export type BulkTotals = Omit<BulkProgress, 'seed' | 'current'>;
export type BulkStatus = BulkTotals & { state: 'idle' | 'running' | 'paused' | 'stopped' | 'error'; workers: number; busyWorkers?: number; investigating?: boolean; investigationQueue?: { queued: number; active: number }; effort: number; error?: string; runSeed?: number; runId?: number; lanes?: string[] };
export const emptyTotals = (): BulkTotals => ({ fights: 0, p1Wins: 0, p2Wins: 0, draws: 0, capped: 0, ticks: 0, droppedMoveSummaries: 0, insights: [], moves: [] });
export function bulkBudget(effort: number, threads: number) {
  const percent = Number.isFinite(effort) ? Math.max(1, Math.min(100, Math.round(effort))) : 40;
  const available = Math.max(1, Math.floor(Number.isFinite(threads) ? threads || 1 : 1));
  const capacity = available * percent;
  const workers = Math.max(1, Math.ceil(capacity / 100));
  return { workers, duty: Math.max(1, Math.min(100, capacity / workers)), percent };
}

/** Worker count and duty cycle are an effort budget, not CPU-utilization telemetry. */
export function createBulkPool(options: { project: GameplayProject3D; assets: readonly PortableAsset3D[]; changed: (status: BulkStatus) => void; threads?: number; factory?: () => BulkWorker; initial?: BulkTotals; onExperiment?: Parameters<typeof createPolicyPipeline>[0]['finish']; onContextual?: (rows: ContextualTrainingRow[]) => void }) {
  let status: BulkStatus = { ...(options.initial ?? emptyTotals()), state: options.initial ? 'stopped' : 'idle', workers: 0, effort: 40 };
  type Slot = { worker: BulkWorker; totals: BulkTotals; ready: boolean; job?: NonNullable<ReturnType<ReturnType<typeof createPolicyPipeline>['take']>>; scenario?: ScenarioQueueJob; contextualConsumed?: boolean; current?: BulkProgress['current'] };
  const slots = new Map<number, Slot>();
  const scenarios = createScenarioQueue();
  let preferScenario = true;
  let completed = options.initial ?? emptyTotals(), seed = 1, nextSlot = 0, nextOrder = 0, runId = 0;
  let recentTrials = options.initial?.trials ?? [];
  let learning: BulkSimulationOptions['learning'];
  let pipeline: ReturnType<typeof createPolicyPipeline> | undefined;
  let contextual: ReturnType<typeof createContextualTrainingSession> | undefined;
  let continuous = false, benchmark = false, nextFight = 0;
  let benchmarkInput: ReturnType<NonNullable<typeof contextual>['input']> | undefined;
  const buffered = new Map<string, BulkProgress>();
  const order = new Map<string, number>();
  const stopping = new Map<number, ReturnType<typeof setTimeout>>();
  function mergeMoves(rows: BulkTotals[]) {
    const map = new Map<string, BulkTotals['moves'][number]>();
    let droppedMoveSummaries = rows.some(row => row.droppedMoveSummaries === undefined) ? undefined : rows.reduce((sum, row) => sum + (row.droppedMoveSummaries ?? 0), 0);
    for (const row of rows) for (const move of row.moves) {
      let value = map.get(move.moveId);if (!value) { if (map.size >= 64) { if (droppedMoveSummaries !== undefined) droppedMoveSummaries++;continue; }value = { moveId: move.moveId, hits: 0, damage: 0, whiffs: 0, blocked: 0, parried: 0 };map.set(move.moveId, value); }
      for (const key of ['hits','damage','whiffs','blocked','parried'] as const) value[key] += move[key];
    }
    return { moves: [...map.values()], droppedMoveSummaries };
  }
  const notify = () => {
    const pending = [...buffered].sort(([left], [right]) => order.get(left)! - order.get(right)!).map(([, row]) => row);
    const rows = [completed, ...pending, ...[...slots.values()].map(slot => slot.totals)];
    const totals = emptyTotals();
    for (const row of rows) for (const key of ['fights','p1Wins','p2Wins','draws','capped','ticks'] as const) totals[key] += row[key];
    totals.insights = [...new Set(rows.flatMap(row => row.insights))].slice(-12);
    Object.assign(totals, mergeMoves(rows));
    totals.experiments = pipeline?.report ?? completed.experiments;
    totals.learning = totals.experiments?.pending[0]?.learning ?? totals.experiments?.recent.at(-1) ?? rows.find(row => row.learning)?.learning;
    totals.pendingTrialResults = totals.experiments?.pending[0]?.pendingTrialResults ?? completed.pendingTrialResults;
    totals.trials = recentTrials;
    totals.contextual = contextual?.snapshot() ?? completed.contextual;
    const lanes = [...slots].map(([id, slot]) => slot.current ? `Worker ${id + 1}: ${slot.current.phase.replaceAll('-', ' ')} · ${slot.current.p1Rounds}–${slot.current.p2Rounds} rounds · ${slot.current.ticks.toLocaleString()} ticks` : `Worker ${id + 1}: preparing city`);
    for (const [index, slot] of [...slots.values()].entries()) if (slot.scenario) lanes[index] = `Worker ${index + 1}: testing response ${slot.scenario.repetition + 1} of 8`;
    const busyWorkers = status.state === 'running' ? [...slots].filter(([id, slot]) => slot.ready && (!pipeline || slot.job || slot.scenario) && !stopping.has(id)).length : 0;
    const investigationQueue = scenarios.status;
    status = { ...status, ...totals, workers: slots.size, busyWorkers, lanes, investigationQueue, investigating: investigationQueue.active + investigationQueue.queued > 0 };options.changed({ ...status, insights: [...status.insights] });
  };
  function remove(id: number) {
    const slot = slots.get(id);if (!slot) return;
    slot.worker.terminate();slots.delete(id);
    if (slot.scenario) scenarios.release(slot.scenario);
    clearTimeout(stopping.get(id));stopping.delete(id);
    if (pipeline) { completed.ticks += slot.totals.ticks;if (slot.job) pipeline.release(slot.job); }
    else accumulate(slot.totals);
  }
  function accumulate(row: BulkTotals) {
    for (const key of ['fights','p1Wins','p2Wins','draws','capped','ticks'] as const) completed[key] += row[key];
    completed.insights = [...completed.insights, ...row.insights].slice(-12);
    Object.assign(completed, mergeMoves([completed, row]));
  }
  function remember(slot: Slot, progress: BulkProgress) {
    const count = progress.fights + progress.capped - slot.totals.fights - slot.totals.capped;
    if (count > 0) recentTrials = [...recentTrials, ...(progress.trials ?? []).slice(-count)].slice(-8);
  }
  function learn(slot: Slot, progress: BulkProgress, complete: boolean) {
    if (benchmark || !contextual || !slot.job || !progress.contextualResult || slot.contextualConsumed || slot.job.trial.seed !== progress.seed) return;
    contextual.record({ job: policyJobKey(slot.job), seed: slot.job.trial.seed, complete, result: progress.contextualResult });
    slot.contextualConsumed = true;delete progress.contextualResult;options.onContextual?.(contextual.rows());
  }
  function nextContinuousJob() {
    const sequence = nextFight++, candidateSeat = sequence % 2 === 0 ? 0 : 1;
    const trial: PolicyTrial = { id: `fight-${sequence}`, seed: (seed + (benchmark ? Math.floor(sequence / 2) : sequence)) >>> 0,
      phase: 'training', candidateSeat, policies: [undefined, undefined], candidateId: 'learned', opponentId: 'default', opponentGroup: 'frozen', control: false };
    return { sequence, trial };
  }
  function dispatch() {
    if (status.state !== 'running' || !pipeline && !continuous) return;
    const available = [...slots].filter(([id]) => !stopping.has(id));
    let fightsInFlight = available.filter(([, slot]) => slot.job).length;
    for (const [id, slot] of slots) {
      if (status.state !== 'running') break;
      if (!slot.ready || slot.job || slot.scenario || stopping.has(id)) continue;
      // Keep a fight running when response windows take longer than ordinary sets.
      const reserveFight = available.length > 1 && fightsInFlight === 0;
      const scenario = preferScenario && !reserveFight ? scenarios.take() : undefined;
      if (scenario) { assignScenario(slot, scenario);preferScenario = false;continue; }
      const job = continuous ? nextContinuousJob() : pipeline?.take({ capacity: slots.size });if (!job) { const waiting = scenarios.take();if (waiting) assignScenario(slot, waiting);continue; }
      preferScenario = true;
      const key = policyJobKey(job);if (pipeline && !order.has(key)) order.set(key, nextOrder++);
      slot.job = job;slot.contextualConsumed = false;
      fightsInFlight++;
      if (!contextual) slot.worker.postMessage({ type: 'trial', trial: job.trial });
      else void (benchmarkInput ?? contextual.input(job.trial)).then(source => {
        if (slots.get(id) !== slot || slot.job !== job || stopping.has(id) || !['running', 'paused'].includes(status.state)) return;
        const input = structuredClone(source);
        if (benchmark) { input.carry = false;input.frozen = true;input.models[1 - job.trial.candidateSeat] = undefined; }
        else if (continuous) input.exploration = .08;
        slot.worker.postMessage({ type: 'trial', trial: job.trial, contextual: input });
      }).catch(error => fail(error instanceof Error ? error.message : String(error)));
    }
  }
  function assignScenario(slot: Slot, job: ScenarioQueueJob) {
    slot.scenario = job;
    const situation = job.situation, budget = bulkBudget(status.effort, options.threads ?? navigator.hardwareConcurrency);
    slot.worker.postMessage({ type: 'scenario-init', requestId: job.requestId, effort: budget.duty, options: {
      project: options.project, assets: options.assets, seed: situation.seed, frame: situation.frame, seat: situation.seat, context: situation.context,
      actions: situation.actions, input: situation.input, exhaustive: true, repetitions: 1, repetitionOffset: job.repetition, windowTicks: 240 } });
  }
  function cancelScenarioJobs(jobs: ScenarioQueueJob[]) {
    const ids = new Set(jobs.map(job => job.requestId));
    for (const slot of slots.values()) if (slot.scenario && ids.has(slot.scenario.requestId)) { slot.worker.postMessage({ type: 'scenario-stop' });slot.scenario = undefined; }
  }
  function retire(id: number) { if (stopping.has(id)) return;stopping.set(id, setTimeout(() => { remove(id);if (status.state === 'running') resize();else notify(); }, 2000));slots.get(id)?.worker.postMessage({ type: 'stop' }); }
  function resize() {
    const budget = bulkBudget(status.effort, options.threads ?? navigator.hardwareConcurrency);
    for (const id of [...slots.keys()].slice(budget.workers)) retire(id);
    try {
      while (slots.size < budget.workers) {
        const id = nextSlot++;
        const worker: BulkWorker = (options.factory ?? createBulkWorker)();
        const slot: Slot = { worker, totals: emptyTotals(), ready: false };slots.set(id, slot);
        worker.onmessage = event => {
          if (slots.get(id) !== slot) return;
          const message: BulkWorkerResponse = event.data;
          if (message.type === 'scenario-progress' || message.type === 'scenario-error') {
            const job = slot.scenario;if (!job || message.requestId !== job.requestId || stopping.has(id)) return;
            // Clear ownership before calling UI callbacks, which can cancel, pause or stop.
            if (message.type === 'scenario-error' || message.progress.status === 'complete') slot.scenario = undefined;
            try {
              if (message.type === 'scenario-error') cancelScenarioJobs(scenarios.fail(job, message.message));
              else scenarios.record(job, message.progress);
            } catch (error) { cancelScenarioJobs(scenarios.fail(job, error instanceof Error ? error.message : String(error))); }
            dispatch();notify();return;
          }
          if (message.type === 'ready') { slot.ready = true;dispatch(); }
          if (message.type === 'progress') {
            if (pipeline && !slot.job) return;
            try {
              learn(slot, message.progress, false);
              remember(slot, message.progress);slot.totals = message.progress;slot.current = message.progress.current;
              notify();
            } catch (error) { fail(diagnostic(slot, error instanceof Error ? error.message : String(error))); }
          }
          if (message.type === 'trial-result' && continuous && slot.job) {
            try {
              const { result, progress } = message;
              if (slot.job.trial.id !== result.id || slot.job.trial.seed !== progress.seed) throw Error('Worker returned an unassigned training fight.');
              if (!['completed', 'capped'].includes(result.status) || !Number.isSafeInteger(result.ticks) || result.ticks < 1
                || result.status === 'completed' && !['player', 'opponent', 'draw'].includes(result.winner ?? '')
                || result.status === 'capped' && result.winner !== undefined
                || progress.ticks !== result.ticks || progress.fights !== Number(result.status === 'completed') || progress.capped !== Number(result.status === 'capped')
                || progress.p1Wins !== Number(result.winner === 'player') || progress.p2Wins !== Number(result.winner === 'opponent') || progress.draws !== Number(result.winner === 'draw')) throw Error('Worker returned inconsistent training outcomes.');
              learn(slot, progress, true);remember(slot, progress);accumulate(progress);
              if (benchmark && status.benchmark) {
                const report = status.benchmark;
                if (result.status === 'completed') { report.sets++;report.points += result.winner === 'draw' ? .5 : result.winner === (slot.job.trial.candidateSeat === 0 ? 'player' : 'opponent') ? 1 : 0; }
                else report.capped++;
              }
              slot.job = undefined;slot.totals = emptyTotals();slot.current = undefined;dispatch();notify();
            } catch (error) { fail(diagnostic(slot, error instanceof Error ? error.message : String(error))); }
            return;
          }
          if (message.type === 'trial-result' && pipeline) {
            if (!['running', 'paused'].includes(status.state) || stopping.has(id)) {
              if (slot.job?.trial.id === message.result.id) { learn(slot, message.progress, true);slot.totals.ticks = Math.max(slot.totals.ticks, message.progress.ticks);notify(); }
              return;
            }
            try {
              if (slot.job?.trial.id !== message.result.id) throw Error('Worker returned an unassigned policy trial.');
              const key = policyJobKey(slot.job), committed = pipeline.record(slot.job, message.result);
              learn(slot, message.progress, true);
              delete message.progress.contextualResult;
              remember(slot, message.progress);buffered.set(key, message.progress);slot.job = undefined;slot.totals = emptyTotals();slot.current = undefined;
              for (const trialId of committed) { accumulate(buffered.get(trialId)!);buffered.delete(trialId);order.delete(trialId); }
              dispatch();
              notify();
            } catch (error) { fail(error instanceof Error ? error.message : String(error)); }
          }
          if (message.type === 'stopped') { remove(id);if (status.state === 'running') resize();else notify(); }
          if (message.type === 'error') fail(diagnostic(slot, message.message));
        };
        worker.onerror = event => { event.preventDefault();if (slots.get(id) === slot) fail(diagnostic(slot, event.message || 'Worker could not start.')); };
        worker.postMessage({ type: 'init', project: options.project, assets: options.assets, seed: (seed + id) >>> 0, seedStride: 65536, effort: budget.duty, ...(learning || continuous ? { externalTrials: true } : {}) });
      }
      for (const { worker } of slots.values()) worker.postMessage({ type: 'effort', effort: budget.duty });
      dispatch();
    } catch (error) { fail(error instanceof Error ? error.message : String(error)); }
    notify();
  }
  function diagnostic(slot: Slot, message: string) {
    const seed = slot.current?.seed ?? slot.job?.trial.seed;
    return `${message}${seed === undefined ? '' : ` · seed ${seed} · tick ${slot.current?.ticks ?? slot.totals.ticks}`}${slot.job ? ` · experiment ${slot.job.sequence + 1} · ${slot.job.trial.id}` : ''}`;
  }
  function resumeWorkers() {
    for (const [id, { worker }] of slots) {
      // changed() can synchronously accept Pause/Stop.
      if (status.state !== 'running') break;
      if (!stopping.has(id)) worker.postMessage({ type: 'resume' });
    }
  }
  function fail(error: string) { pipeline?.close();scenarios.clear();for (const id of [...slots.keys()]) remove(id);status = { ...status, state: 'error', investigating: false, error };notify(); }
  return {
    get status() { return status; },
    enqueueScenario(request: ScenarioQueueRequest) {
      if ((!pipeline && !continuous) || benchmark || !['running', 'paused'].includes(status.state)) throw Error('Start training before queueing an investigation.');
      const owned = scenarios.enqueue(request);dispatch();notify();
      return () => { cancelScenarioJobs(owned.cancel());dispatch();notify(); };
    },
    recordScenario(progress: Parameters<NonNullable<typeof contextual>['recordScenario']>[0], input: Parameters<NonNullable<typeof contextual>['recordScenario']>[1]) {
      if (!contextual) throw Error('Start contextual training before applying investigation lessons.');
      const update = contextual.recordScenario(progress, input);options.onContextual?.(contextual.rows());notify();return update;
    },
    start(request: { learning?: BulkSimulationOptions['learning']; contextualRows?: ContextualTrainingRow[]; benchmark?: boolean; seed?: number } = {}) {
      if (status.state === 'running') return;
      if (request.seed !== undefined && (!Number.isSafeInteger(request.seed) || request.seed < 0 || request.seed > 0xffffffff)) throw Error('Training seed must be an unsigned 32-bit integer.');
      pipeline?.close();for (const id of [...slots.keys()]) remove(id);
      scenarios.clear();preferScenario = true;
      learning = request.learning;completed = emptyTotals();recentTrials = [];buffered.clear();order.clear();nextSlot = 0;nextOrder = 0;seed = request.seed ?? crypto.getRandomValues(new Uint32Array(1))[0]!;
      continuous = !learning && request.contextualRows !== undefined;benchmark = continuous && request.benchmark === true;nextFight = 0;
      contextual = request.contextualRows ? createContextualTrainingSession({ rows: request.contextualRows, general: continuous }) : undefined;
      benchmarkInput = benchmark ? contextual?.input() : undefined;
      pipeline = learning ? createPolicyPipeline({ seed, learning, finish: options.onExperiment,
        changed(reset) {
          if (reset) {
            for (const row of buffered.values()) accumulate(row);buffered.clear();order.clear();
            for (const id of [...slots.keys()]) remove(id);
          }
          if (status.state === 'running') resize();else notify();
        }, failed: error => fail(error instanceof Error ? error.message : String(error)) }) : undefined;
      status = { ...emptyTotals(), state: 'running', investigating: false, effort: status.effort, workers: 0, runSeed: seed, runId: ++runId,
        ...(benchmark ? { benchmark: { sets: 0, points: 0, capped: 0 } } : {}) };resize();
    },
    effort(value: number) { status.effort = bulkBudget(value, 2).percent;if (status.state === 'running') resize();else notify(); },
    pause() { if (status.state !== 'running') return;status.state = 'paused';for (const { worker } of slots.values()) worker.postMessage({ type: 'pause' });notify(); },
    resume() { if (status.state !== 'paused') return;status.state = 'running';resize();resumeWorkers();notify(); },
    stop() { pipeline?.close();status.state = 'stopped';scenarios.clear();status.investigating = false;for (const id of [...slots.keys()]) retire(id);notify(); },
    dispose() { pipeline?.close();status.state = 'stopped';scenarios.clear();status.investigating = false;for (const id of [...slots.keys()]) remove(id); },
  };
}
