import { BACKGROUND_JOB_REPOSITORY_CONTRACT_METHODS } from "../core/constants";
import type { BackgroundRunControl, HarnessServerState } from "../core/contracts";
import type { WorkspaceRepository } from "../../workspace-repository";

export function getBackgroundJobRepositoryRuntimeContractMismatch(repository: unknown) {
  if (!repository || typeof repository !== "object") {
    return "repository missing";
  }
  const missingMethod = BACKGROUND_JOB_REPOSITORY_CONTRACT_METHODS.find(
    (methodName) => typeof Reflect.get(repository, methodName) !== "function"
  );
  return missingMethod ? `${missingMethod} is not available` : undefined;
}
export function failLiveBackgroundRunsOnShutdown(
  repository: WorkspaceRepository,
  backgroundRunControllers: Map<string, BackgroundRunControl>
) {
  for (const [runId, control] of backgroundRunControllers.entries()) {
    const run = repository.getBackgroundJobRun(runId);
    if (run?.status === "running") {
      repository.setBackgroundJobRunStatus(run.id, "failed", {
        failureMessage: "Local harness process shut down before completion",
        failureCategory: "shutdown-interrupt"
      });
      repository.appendBackgroundJobRunEvent(
        run.id,
        "failed",
        "Background run interrupted by shutdown",
        "The local harness process shut down before completion."
      );
    }
    abortBackgroundRunControl(control);
  }
  backgroundRunControllers.clear();
}

export function stopLiveProjectRunsOnShutdown(state: HarnessServerState) {
  const stopped = state.repository.stopInterruptedActiveRuns({
    reason: "Local harness process shut down before completion",
    failureCategory: "shutdown-interrupt"
  });
  if (stopped.stoppedRuns.length === 0) {
    return;
  }

  for (const run of stopped.stoppedRuns) {
    if (!state.runtime.hasProject(run.projectId)) {
      continue;
    }

    state.runtime.abortRun(run.projectId, run.runId);
    state.runtime.clearProjectTransients(run.projectId, run.threadId);
  }
  for (const project of state.repository.loadWorkspace().projects) {
    state.runtime.upsertPersistedProject(project);
  }
}

export function disposeBackgroundRunControl(control: BackgroundRunControl | undefined) {
  if (!control) {
    return;
  }
  if (control.renewTimer) {
    clearInterval(control.renewTimer);
    control.renewTimer = undefined;
  }
}

export function abortBackgroundRunControl(control: BackgroundRunControl | undefined) {
  if (!control) {
    return;
  }
  disposeBackgroundRunControl(control);
  control.abortController.abort();
}

export async function abortAndAwaitBackgroundRunControls(
  backgroundRunControllers: Map<string, BackgroundRunControl>,
  controls: Array<[string, BackgroundRunControl]>
) {
  for (const [, control] of controls) abortBackgroundRunControl(control);
  try {
    await Promise.all(controls.map(([, control]) => control.settled));
  } finally {
    for (const [runId, control] of controls) {
      if (backgroundRunControllers.get(runId) === control) backgroundRunControllers.delete(runId);
    }
  }
}
