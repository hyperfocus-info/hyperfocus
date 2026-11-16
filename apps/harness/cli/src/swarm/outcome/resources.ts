import type { SwarmRun, SwarmTask } from "@hyperfocus/ai-core/swarm";

export function swarmTaskDuration(run: SwarmRun, task: SwarmTask) {
  const experiment = task.kind === "experiment" ? run.outcome?.hypotheses.find(hypothesis => hypothesis.candidateId === task.candidateId)?.experiment : undefined;
  return Math.min(run.request.budget.maxTaskDurationMs, experiment?.timeoutMs ?? Infinity);
}

/** Full 2 vCPU / 2 GB lifetime estimate; the bridge separately reserves its provider cleanup margin. */
export function swarmTaskComputeReservation(run: SwarmRun, task: SwarmTask) {
  const duration = task.kind === "baseline" ? run.request.budget.maxDurationMs : swarmTaskDuration(run, task);
  return duration / 1_000 * 200 / 2_592_000;
}
