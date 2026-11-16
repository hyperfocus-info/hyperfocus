import type { ManagedExecutionState, ManagedRefreshAction } from "../../execution-runtime";
import { debugLog } from "../../logging";
import { appendSystemStatus } from "./transcript-state";
import { isExecutionBusy } from "./preflight";
import { emitProjectTrace, getThreadSessionState } from "../workspace/project-events";
import type { WorkspaceRepository } from "../../workspace-repository";
import type { WorkspaceRuntimeStore } from "../../workspace-runtime-store";
import type { ProjectId } from "@hyperfocus/ai-core/protocol";

export async function requestExecutionRefresh(
  ws: import("../transport/events").ControlEventSocket,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  threadId: string,
  executionState: ManagedExecutionState
) {
  if (executionState.phase === "waiting-input") {
    throw new Error("Execution is waiting for user input");
  }

  const executionLabel = executionState.subagentId ? `subagent ${executionState.subagentId}` : executionState.kind;
  if (isExecutionBusy(executionState)) {
    runtime.updateExecutionState(projectId, executionState, (state) => ({
      ...state,
      refreshRequested: true,
      refreshDeferred: true,
      lastProgressAt: Date.now()
    }));
    appendSystemStatus(ws, requestId, runtime, repository, projectId, threadId, `Refreshing ${executionLabel} after current stream completes.`);
    emitProjectTrace(ws, requestId, runtime, projectId, threadId, {
      sessionId: getThreadSessionState(runtime, repository, projectId, threadId).sessionId,
      stage: "refresh-deferred",
      message: `Refreshing ${executionLabel} after current stream completes.`
    });
    return;
  }

  const refreshAction: ManagedRefreshAction = executionState.hasReceivedActivity ? "continue" : "restart";
  runtime.updateExecutionState(projectId, executionState, (state) => ({
    ...state,
    refreshRequested: true,
    refreshDeferred: false,
    pendingRefreshAction: refreshAction,
    lastProgressAt: Date.now()
  }));
  appendSystemStatus(
    ws,
    requestId,
    runtime,
    repository,
    projectId,
    threadId,
    refreshAction === "restart"
      ? `Refreshing ${executionLabel} by restarting original prompt.`
      : `Refreshing ${executionLabel} with continue.`
  );
  emitProjectTrace(ws, requestId, runtime, projectId, threadId, {
    sessionId: getThreadSessionState(runtime, repository, projectId, threadId).sessionId,
    stage: "refresh-requested",
    message:
      refreshAction === "restart"
        ? `Refreshing ${executionLabel} by restarting original prompt.`
        : `Refreshing ${executionLabel} with continue.`
  });

  const abortPromise = executionState.controller?.abort();
  if (abortPromise) {
    void abortPromise.catch((error) => {
      debugLog("run.refresh.abort-failed", {
        runId: executionState.runId,
        kind: executionState.kind,
        subagentId: executionState.subagentId,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }
}
