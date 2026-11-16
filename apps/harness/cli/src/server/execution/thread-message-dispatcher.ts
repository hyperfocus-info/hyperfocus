import { createRequestId, parseServerEventFrame } from "@hyperfocus/ai-core/protocol";
import type {  HarnessServerState } from "../core/contracts";
import { handleChatSendCommand } from "../commands/chat-send";
import { handleRunsCommand } from "../commands/runs";
import { emitControlEvent, type ControlEventSocket } from "../transport/events";
import { assertProjectCanStartRun } from "./state";
import { emitProjectUpdated } from "../workspace/project-events";
import { setTimeout as delay } from "node:timers/promises";
import { debugLog } from "../../logging";

const dispatchers = new WeakMap<HarnessServerState, ReturnType<typeof createDispatcher>>();

export function startThreadMessageDispatcher(state: HarnessServerState) {
  stopThreadMessageDispatcher(state);
  const dispatcher = createDispatcher(state);
  dispatchers.set(state, dispatcher);
  dispatcher.start();
}

export async function stopThreadMessageDispatcher(state: HarnessServerState) {
  const dispatcher = dispatchers.get(state);
  dispatchers.delete(state);
  await dispatcher?.stop();
}

function createDispatcher(state: HarnessServerState) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const shutdown = new AbortController();
  const working = new Set<string>();
  const pending = new Set<Promise<void>>();
  // Execution helpers use only the control socket's send/data surface. Broadcast
  // through the normal event encoder so disconnected and protobuf clients agree.
  const ws: ControlEventSocket = { data: { clientId: "thread-messages", clientKind: "native", kind: "control", encoding: "json" },
    send(data: string) { for (const event of parseServerEventFrame(JSON.parse(data))) emitControlEvent(state.connections, event); return data.length; }, close() {} };
  const context = { ...state, ws, derivedProgressHeartbeatMs: 10000, queuedThreadInput: true };
  for (const message of state.repository.listRunningThreadMessages()) {
    if (message.runId && state.runtime.getAbortController(message.projectId, message.runId)) continue;
    state.repository.updateQueuedThreadMessage({ id: message.id, status: "failed", error: "Execution was interrupted. Review the thread before resending." });
  }

  async function dispatch(message: ReturnType<typeof state.repository.listQueuedThreadMessages>[number]) {
    const { repository, runtime } = state;
    try {
      repository.updateQueuedThreadMessage({ id: message.id, status: "running" });
      const prior = repository.getLatestThreadRun(message.projectId, message.threadId);
      const project = runtime.getProject(message.projectId);
      const agentId = prior?.launchProfile?.agentId ?? project.session.selectedAgentId ?? "pi";
      await handleChatSendCommand({ type: "chat.send", requestId: createRequestId(), payload: {
        projectId: message.projectId, threadId: message.threadId, agentId,
        content: message.content, executionModelId: prior?.executionModelId,
        modeId: project.selectedModeId, modeLocked: true,
        reasoningStrength: prior?.launchProfile?.reasoningStrength, fastMode: prior?.launchProfile?.fastMode
      } }, context);
      const run = repository.getLatestThreadRun(message.projectId, message.threadId);
      repository.updateQueuedThreadMessage({ id: message.id, status: "running", runId: run?.id });
      if (run?.status === "ready" && run.plan?.gating.mode === "countdown") {
        await delay(run.plan.gating.delaySeconds * 1000, undefined, { signal: shutdown.signal });
      }
      if (run?.status === "ready" && run.plan?.gating.mode !== "approve"
        && !stopped && !repository.getGlobalExecutionPaused()
        && repository.getLatestThreadRun(message.projectId, message.threadId)?.status === "ready") {
        await handleRunsCommand({ type: "run.execute", requestId: createRequestId(), payload: {
          projectId: message.projectId, threadId: message.threadId, runId: run.id
        } }, context);
      }
      const final = repository.getLatestThreadRun(message.projectId, message.threadId);
      repository.updateQueuedThreadMessage({ id: message.id, status: final?.status === "failed" ? "failed" : "completed", runId: run?.id, error: final?.failureMessage });
    } catch (error) {
      if (stopped) return;
      const reason = error instanceof Error ? error.message : String(error);
      repository.updateQueuedThreadMessage({ id: message.id, status: "failed", error: reason });
      runtime.upsertPersistedProject(repository.appendMessage(message.projectId, "assistant", `Queued message could not run: ${reason}`, message.threadId));
    } finally {
      const project = repository.getProject(message.projectId);
      runtime.upsertPersistedProject(project);
      emitProjectUpdated(ws, createRequestId(), project.id, project, repository);
    }
  }
  function tick() {
    if (stopped) return;
    try {
      if (!state.repository.getGlobalExecutionPaused()) for (const message of state.repository.listQueuedThreadMessages()) {
        if (working.has(message.projectId)) continue;
        const recipient = state.repository.getProject(message.projectId).threads.find(thread => thread.id === message.threadId);
        if (recipient?.lineage?.status === "running" || state.runtime.hasAnyStreamingThread(message.projectId)) continue;
        const latest = state.repository.getLatestThreadRun(message.projectId, message.threadId);
        if (latest && ["planning", "awaiting-user-input", "ready", "running-main", "running-subagents", "aggregating", "partial-complete"].includes(latest.status)) continue;
        try { assertProjectCanStartRun(state.repository, state.runtime, message.projectId, message.threadId); }
        catch { continue; }
        working.add(message.projectId);
        const task = dispatch(message).catch(error => {
          debugLog("thread-message.dispatch-failed", { messageId: message.id, error: String(error) });
        }).finally(() => { working.delete(message.projectId); pending.delete(task); });
        pending.add(task);
      }
    } catch (error) {
      debugLog("thread-message.poll-failed", { error: String(error) });
    } finally {
      if (!stopped) timer = setTimeout(tick, 500);
    }
  }
  return { start: tick, async stop() { stopped = true; shutdown.abort(); clearTimeout(timer); await Promise.allSettled(pending); } };
}
