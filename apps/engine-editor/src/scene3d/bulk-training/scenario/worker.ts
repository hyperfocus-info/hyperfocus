import { createScenarioSimulation, type ScenarioProgress } from './simulation.ts';
import { bulkRestDelay, bulkWorkSlice, createWorkerPacer } from '../worker-pacing.ts';

export type ScenarioRequest = { type: 'scenario-init'; requestId?: string; effort?: number; options: Parameters<typeof createScenarioSimulation>[0] }
  | { type: 'scenario-stop'; requestId?: string };
export type ScenarioResponse = { type: 'scenario-progress'; requestId?: string; progress: ScenarioProgress }
  | { type: 'scenario-error'; requestId?: string; message: string };

/** Runs a scenario task on an ordinary pool worker, using the same CPU effort budget. */
export function createScenarioWorker(options: {
  send(message: ScenarioResponse): void;
  createSimulation?: typeof createScenarioSimulation;
  createPacer?: typeof createWorkerPacer;
  now?: () => number;
}) {
  let simulation: Awaited<ReturnType<typeof createScenarioSimulation>> | undefined, generation = 0, lastReport = -Infinity;
  let requestId: string | undefined, active = false, paused = false, effort = 50;
  const now = options.now ?? (() => performance.now()), pacer = (options.createPacer ?? createWorkerPacer)({ run });
  function dispose() { generation++;active = false;pacer.dispose();simulation?.dispose();simulation = undefined;requestId = undefined; }
  function run() {
    const owned = simulation, current = generation, identity = requestId;
    if (paused || !owned) return;
    try {
      const started = now(), slice = bulkWorkSlice(effort);
      do { owned.advanceTicks({ ticks: 1 }); } while (!owned.finished && now() - started < slice);
      if (owned.finished) {
        const progress = owned.progress();dispose();
        options.send({ type: 'scenario-progress', requestId: identity, progress });return;
      }
      if (now() - lastReport >= 250) {
        lastReport = now();options.send({ type: 'scenario-progress', requestId: identity, progress: owned.progress() });
      }
      if (current === generation && !paused && simulation === owned) pacer.schedule({ delay: bulkRestDelay(effort, now() - started) });
    } catch (error) {
      if (current !== generation) return;
      dispose();options.send({ type: 'scenario-error', requestId: identity, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return {
    get active() { return active; },
    async handle(message: ScenarioRequest) {
      if (message.type === 'scenario-stop') { if (message.requestId === undefined || message.requestId === requestId) dispose();return; }
      dispose();active = true;paused = false;requestId = message.requestId;
      effort = Number.isFinite(message.effort) ? Math.max(1, Math.min(100, message.effort!)) : effort;
      const current = generation, identity = requestId;
      try {
        const created = await (options.createSimulation ?? createScenarioSimulation)(message.options);
        if (current !== generation) { created.dispose();return; }
        simulation = created;lastReport = -Infinity;run();
      } catch (error) {
        if (current !== generation) return;
        dispose();options.send({ type: 'scenario-error', requestId: identity, message: error instanceof Error ? error.message : String(error) });
      }
    },
    effort(value: number) { effort = Number.isFinite(value) ? Math.max(1, Math.min(100, value)) : 50;pacer.cancel();run(); },
    pause() { paused = true;pacer.cancel(); },
    resume() { paused = false;pacer.cancel();run(); },
    dispose,
  };
}
