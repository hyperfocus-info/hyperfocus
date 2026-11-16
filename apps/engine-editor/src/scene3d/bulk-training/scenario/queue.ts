import { compareScenarioResults, type ScenarioProgress } from './simulation.ts';
import type { ReplaySituation } from './selection.ts';

export type ScenarioQueueRequest = { situation: ReplaySituation; changed(progress: ScenarioProgress): void; failed(message: string): void };
export type ScenarioQueueJob = { requestId: string; repetition: number; situation: ReplaySituation };
type Entry = { request: ScenarioQueueRequest; jobs: ScenarioQueueJob[]; progress: Map<number, ScenarioProgress>; active: Set<number>; finished: Set<number> };

/** Each response seed tests the whole legal pool; ordinary fights share the same worker budget. */
export function createScenarioQueue() {
  const entries = new Map<string, Entry>();
  let sequence = 0;
  function aggregate(entry: Entry): ScenarioProgress {
    const rows = [...entry.progress].sort(([a], [b]) => a - b).map(([, row]) => row), first = rows[0]!;
    const results = rows.flatMap(row => row.results), total = entry.request.situation.actions.length * 8;
    const complete = entry.finished.size === 8;
    return { ...structuredClone(first), status: complete ? 'complete' : rows.some(row => row.status !== 'reconstructing') ? 'testing' : 'reconstructing',
      repetitionOffset: 0, repetitions: 8, total, completed: results.length,
      ticks: rows.reduce((sum, row) => sum + row.ticks, 0), reconstructionTicks: rows.reduce((sum, row) => sum + row.reconstructionTicks, 0),
      testedOptionCount: new Set(results.filter(row => row.executed).map(row => row.action)).size,
      rolloutTicks: rows.reduce((sum, row) => sum + (row.rolloutTicks ?? 0), 0),
      windowCoverage: { complete: results.filter(row => row.rollout?.complete).length, total, requestedTicks: total * first.windowTicks,
        observedTicks: rows.reduce((sum, row) => sum + (row.windowCoverage?.observedTicks ?? 0), 0) },
      stateDigest: rows.find(row => row.stateDigest)?.stateDigest, decisionProbe: structuredClone(rows.find(row => row.decisionProbe)?.decisionProbe),
      observedLegalOptions: [...(rows.find(row => row.observedLegalOptions.length)?.observedLegalOptions ?? [])],
      legalOptionCount: Math.max(...rows.map(row => row.legalOptionCount)), exhaustive: rows.some(row => row.exhaustive),
      current: complete ? undefined : [...rows].reverse().find(row => row.status !== 'complete')?.current, results,
      comparisons: compareScenarioResults({ results, actions: first.actions, tolerance: first.comparisonTolerance }) };
  }
  function locate(job: ScenarioQueueJob) { return entries.get(job.requestId.slice(0, job.requestId.lastIndexOf(':'))); }
  return {
    enqueue(request: ScenarioQueueRequest) {
      const key = `scenario-${sequence++}`, situation = structuredClone(request.situation);
      const jobs = Array.from({ length: 8 }, (_, repetition) => ({ requestId: `${key}:${repetition}`, repetition, situation }));
      entries.set(key, { request: { ...request, situation }, jobs, progress: new Map(), active: new Set(), finished: new Set() });
      return { cancel() { const entry = entries.get(key);entries.delete(key);return entry ? entry.jobs.filter(job => entry.active.has(job.repetition)) : []; } };
    },
    take(): ScenarioQueueJob | undefined {
      // Finish older checkpoints before new arrivals; spare workers can start later ones.
      for (const entry of entries.values()) {
        const job = entry.jobs.find(row => !entry.active.has(row.repetition) && !entry.finished.has(row.repetition));
        if (!job) continue;
        entry.active.add(job.repetition);return job;
      }
      return undefined;
    },
    release(job: ScenarioQueueJob) { const entry = locate(job);entry?.active.delete(job.repetition);entry?.progress.delete(job.repetition); },
    record(job: ScenarioQueueJob, progress: ScenarioProgress) {
      const entry = locate(job);if (!entry || !entry.active.has(job.repetition)) return false;
      const situation = job.situation;
      if (progress.seed !== situation.seed || progress.frame !== situation.frame || progress.seat !== situation.seat || progress.context !== situation.context
        || JSON.stringify(progress.actions) !== JSON.stringify(situation.actions) || progress.repetitions !== 1 || progress.repetitionOffset !== job.repetition
        || progress.results.some(row => row.repetition !== job.repetition)) throw Error('Investigation worker returned a different assigned checkpoint or response seed.');
      for (const previous of entry.progress.values()) {
        if (previous.stateDigest && progress.stateDigest && previous.stateDigest !== progress.stateDigest
          || previous.decisionProbe && progress.decisionProbe && JSON.stringify(previous.decisionProbe) !== JSON.stringify(progress.decisionProbe)
          || previous.observedLegalOptions.length && progress.observedLegalOptions.length && JSON.stringify(previous.observedLegalOptions) !== JSON.stringify(progress.observedLegalOptions)) {
          throw Error('Parallel investigation workers reconstructed different checkpoints.');
        }
      }
      if (progress.status === 'complete' && (progress.results.length !== situation.actions.length || !progress.exhaustive || progress.legalOptionCount !== situation.actions.length
        || new Set(progress.results.map(row => row.action)).size !== situation.actions.length)) throw Error('Investigation worker did not test the full legal pool.');
      entry.progress.set(job.repetition, structuredClone(progress));
      if (progress.status === 'complete') { entry.active.delete(job.repetition);entry.finished.add(job.repetition); }
      const combined = aggregate(entry);
      if (combined.status === 'complete') entries.delete(job.requestId.slice(0, job.requestId.lastIndexOf(':')));
      entry.request.changed(combined);return true;
    },
    fail(job: ScenarioQueueJob, message: string) {
      const key = job.requestId.slice(0, job.requestId.lastIndexOf(':')), entry = entries.get(key);if (!entry) return [];
      entries.delete(key);const active = entry.jobs.filter(row => entry.active.has(row.repetition));entry.request.failed(message);return active;
    },
    clear() { entries.clear(); },
    get status() { let queued = 0, active = 0;for (const entry of entries.values()) { active += entry.active.size;queued += 8 - entry.active.size - entry.finished.size; }return { queued, active }; },
  };
}
