import type { BulkWorkerRequest, BulkWorkerResponse } from './protocol.ts';
import { createBulkSimulation } from './simulation.ts';
import { bulkRestDelay, bulkWorkSlice, createWorkerPacer } from './worker-pacing.ts';
import { createScenarioWorker } from './scenario/worker.ts';

export function installBulkWorker(scope: {
  postMessage(message: BulkWorkerResponse): void;
  onmessage: ((event: MessageEvent<BulkWorkerRequest>) => void) | null;
}) {
let simulation: Awaited<ReturnType<typeof createBulkSimulation>> | undefined;
const pacer = createWorkerPacer({ run });
let effort = 50, paused = true, generation = 0, lastReport = 0;
let dirty = false;
const send = (message: BulkWorkerResponse) => scope.postMessage(message);
const scenarios = createScenarioWorker({ send });
function flush() { if (dirty && simulation) send({ type: 'progress', progress: simulation.progress() }); }
function cancel() { pacer.cancel(); }
function run() {
  if (paused || scenarios.active || !simulation || simulation.idle) return;
  const started = performance.now(), slice = bulkWorkSlice(effort);
  try {
    simulation.advanceTicks({ ticks: 1 });
    while (!simulation.idle && !simulation.finished && performance.now() - started < slice) simulation.advanceTicks({ ticks: 1 });
    dirty = true;
    if (simulation.completedTrial) {
      send({ type: 'trial-result', result: simulation.completedTrial, progress: simulation.progress() });dirty = false;return;
    }
    if (simulation.finished) {
      paused = true;flush();pacer.dispose();simulation?.dispose();simulation = undefined;send({ type: 'stopped' });return;
    }
    if (performance.now() - lastReport >= 250) { flush();lastReport = performance.now(); }
    const elapsed = performance.now() - started;
    pacer.schedule({ delay: bulkRestDelay(effort, elapsed) });
  } catch (error) {
    paused = true;pacer.dispose();simulation?.dispose();simulation = undefined;
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
}
scope.onmessage = async (event: MessageEvent<BulkWorkerRequest>) => {
  const message = event.data;
  if (message.type === 'scenario-init' || message.type === 'scenario-stop') {
    if (message.type === 'scenario-init' && simulation && !simulation.idle) { send({ type: 'scenario-error', requestId: message.requestId, message: 'A scenario requires an idle fight worker.' });return; }
    cancel();
    const pending = scenarios.handle(message.type === 'scenario-init' ? { ...message, effort: message.effort ?? effort } : message);
    if (paused) scenarios.pause();await pending;return;
  }
  if (message.type === 'init') {
    const current = ++generation;cancel();scenarios.dispose();paused = false;simulation?.dispose();simulation = undefined;dirty = false;
    effort = Number.isFinite(message.effort) ? Math.max(1, Math.min(100, message.effort)) : 50;
    try {
      const created = await createBulkSimulation(message);
      if (current !== generation) { created.dispose();return; }
      simulation = created;lastReport = 0;send({ type: 'ready' });run();
    } catch (error) { if (current === generation) send({ type: 'error', message: error instanceof Error ? error.message : String(error) }); }
  } else if (message.type === 'trial') {
    try {
      if (scenarios.active) throw Error('A fight trial requires a completed scenario task.');
      simulation?.startTrial({ trial: message.trial, contextual: message.contextual });dirty = false;cancel();run();
    }
    catch (error) { paused = true;simulation?.dispose();simulation = undefined;send({ type: 'error', message: error instanceof Error ? error.message : String(error) }); }
  } else if (message.type === 'effort') {
    effort = Number.isFinite(message.effort) ? Math.max(1, Math.min(100, message.effort)) : 50;
    cancel();scenarios.effort(effort);if (!paused) run();
  } else if (message.type === 'pause') { paused = true;cancel();scenarios.pause();flush(); }
  else if (message.type === 'resume') { paused = false;cancel();scenarios.resume();run(); }
  else if (message.type === 'stop') { generation++;paused = true;pacer.dispose();scenarios.dispose();simulation?.finishContextual();flush();simulation?.dispose();simulation = undefined;send({ type: 'stopped' }); }
};
return () => { generation++;paused = true;pacer.dispose();scenarios.dispose();simulation?.dispose();simulation = undefined;scope.onmessage = null; };
}
