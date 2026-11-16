import { createAssistantStreamChunker } from "../../assistant-stream-chunker";
import { qualityTraceSchema, type QualityTrace } from "@hyperfocus/ai-core/quality";
import { createProjectNoteSearch } from "./project-note-search";
import type { AssistantStreamChunk } from "../../assistant-stream-chunker";
import type { ManagedExecutionState } from "../../execution-runtime";
import type { SubagentResult } from "../../pi-subagents";
import { createRunTranscriptDraft } from "../../run-milestone-windows";
import type { RunMilestonePhase } from "../../run-milestone-windows";
import { formatRunProgressHeartbeat, shouldDelayDerivedProgressHeartbeat } from "../../run-progress-heartbeats";
import { DERIVED_PROGRESS_HEARTBEAT_MS, STREAM_DELTA_FLUSH_MS, STREAM_DELTA_MAX_BUFFERED_BYTES, STREAM_PERSIST_INTERVAL_MS } from "../core/constants";
import type { HarnessConnection, PendingBrowserApproval } from "../core/contracts";
import { createEmptyTokenUsageTotals, emitControlEvent, recordServerTokenUsage } from "../transport/events";
import { createExecutionActivityCallbacks } from "./activity";
import { emitRunUpdatedById, emitProjectUpdated } from "../workspace/project-events";
import { formatSubagentDoneStatus, formatSubagentFailedStatus, inferMilestonePhase, inferRunPhase, inferTracePhase, statusMessageFromTrace } from "./run-phase-format";
import { createStreamPump, DEFAULT_STREAM_MAX_QUEUED_BYTES } from "../../stream-pump";
import { withTraceTimestamp } from "../../trace-timestamps";
import { shouldPersistStreamingCheckpoint } from "./streaming-checkpoint";
import type { WorkspaceRepository } from "../../workspace-repository";
import type { WorkspaceRuntimeStore } from "../../workspace-runtime-store";
import { CHAT_MESSAGE_CONTENT_MAX_CHARS, type AgentTrace, type PlannerReadyTurn, type ProjectContextUsage, type ProjectId,
  type ThreadId, type TokenUsageTotals, type WorkspaceProjectState } from "@hyperfocus/ai-core/protocol";

type ExecutionTranscriptControllerInput = {
  requestId: string;
  runtime: WorkspaceRuntimeStore;
  repository: WorkspaceRepository;
  projectId: ProjectId;
  threadId: ThreadId;
  sessionId: string;
  runId: string;
  connections?: Set<Bun.ServerWebSocket<HarnessConnection>>;
  derivedProgressHeartbeatMs: number;
};

type StreamingAssistantPersistenceInput = Pick<ExecutionTranscriptControllerInput, "runtime" | "repository" | "projectId" | "threadId"> & {
  assistantChunker: ReturnType<typeof createAssistantStreamChunker>;
};

function createStreamingAssistantPersistence(input: StreamingAssistantPersistenceInput) {
  const { assistantChunker, runtime, repository, projectId, threadId } = input;
  const persistedChunks = new Map<number, { id: string; content: string }>();
  let lastPersistAt = 0;
  const remember = (chunk: AssistantStreamChunk, messageId: string) => {
    persistedChunks.set(chunk.index, { id: messageId, content: chunk.content });
  };
  const findLatestAssistantMessageId = () => repository.getThreadMessages(projectId, threadId)
    .filter((message) => message.role === "assistant" && message.kind !== "run-milestones")
    .at(-1)?.id;
  return (force = false) => {
    const chunks = assistantChunker.getChunks().filter((chunk) => chunk.content.trim());
    const nowMs = Date.now();
    if (chunks.length === 0) return;
    const hasChanges = chunks.some((chunk) => persistedChunks.get(chunk.index)?.content !== chunk.content);
    if (!shouldPersistStreamingCheckpoint({
      force,
      hasChanges,
      elapsedMs: nowMs - lastPersistAt,
      intervalMs: STREAM_PERSIST_INTERVAL_MS
    })) return;

    let nextProject: WorkspaceProjectState | undefined;
    for (const chunk of chunks) {
      const persisted = persistedChunks.get(chunk.index);
      if (persisted?.content === chunk.content) continue;
      if (persisted) {
        nextProject = repository.updateThreadMessage(projectId, threadId, persisted.id, {
          content: chunk.content,
          createdAt: chunk.updatedAt
        });
        remember(chunk, persisted.id);
        continue;
      }
      nextProject = repository.appendMessage(projectId, "assistant", chunk.content, threadId);
      const messageId = findLatestAssistantMessageId();
      if (!messageId) throw new Error("Expected persisted streaming assistant chunk");
      remember(chunk, messageId);
    }
    if (nextProject) {
      runtime.upsertPersistedProject(nextProject);
      lastPersistAt = nowMs;
    }
  };
}

function createExecutionTranscriptController(input: ExecutionTranscriptControllerInput) {
  const { requestId, runtime, repository, projectId, threadId, sessionId, runId, connections, derivedProgressHeartbeatMs } = input;
  const transcriptDraft = createRunTranscriptDraft({ runId });
  let currentPhase: RunMilestonePhase = "planning";
  let tailFlushTimer: ReturnType<typeof setTimeout> | undefined;
  let finalized = false;
  let lastDerivedDigest = "";
  let staleBeatCount = 0;
  const assistantChunker = createAssistantStreamChunker();
  const persistStreamingAssistantChunks = createStreamingAssistantPersistence({
    assistantChunker, runtime, repository, projectId, threadId
  });
  const assistantDeltaPump = createStreamPump({
    flushIntervalMs: STREAM_DELTA_FLUSH_MS,
    maxBufferedBytes: STREAM_DELTA_MAX_BUFFERED_BYTES,
    maxTotalChars: CHAT_MESSAGE_CONTENT_MAX_CHARS,
    maxQueuedBytes: DEFAULT_STREAM_MAX_QUEUED_BYTES,
    onFlush(delta) {
      runtime.appendStreamingDelta(projectId, delta, threadId);
      transcriptDraft.appendAssistantDelta(delta);
      assistantChunker.append(delta);
      persistStreamingAssistantChunks();
      scheduleTailFlush();
      emitControlEvent(connections, {
        type: "chat.delta",
        requestId,
        payload: {
          projectId,
          threadId,
          sessionId,
          delta
        }
      });
    }
  });

  const emitStreamingTail = () => {
    tailFlushTimer = undefined;
    if (!runtime.hasProject(projectId)) {
      return;
    }
    const segments = transcriptDraft.getSegments();
    persistStreamingAssistantChunks();
    runtime.setStreamingTail(projectId, segments, threadId);
    emitControlEvent(connections, {
      type: "chat.streaming-tail-updated",
      requestId,
      payload: {
        projectId,
        threadId,
        sessionId,
        runId,
        segments
      }
    });
  };
  const scheduleTailFlush = () => {
    if (tailFlushTimer) {
      return;
    }
    tailFlushTimer = setTimeout(emitStreamingTail, 100);
  };
  const recordRunMilestone = (line: string, phase = inferMilestonePhase(line, currentPhase)) => {
    currentPhase = phase;
    if (transcriptDraft.recordMilestone(line, phase)) {
      staleBeatCount = 0;
      scheduleTailFlush();
    }
  };
  const derivedHeartbeat = setInterval(() => {
    let run: ReturnType<WorkspaceRepository["getRun"]>;
    try {
      run = repository.getRun(projectId, runId);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Unknown agent run:")) {
        return;
      }
      throw error;
    }
    if (!run || Date.now() - transcriptDraft.getLastAcceptedAt() < derivedProgressHeartbeatMs) {
      return;
    }

    staleBeatCount += 1;
    if (shouldDelayDerivedProgressHeartbeat(run.status) && staleBeatCount < 2) {
      return;
    }

    const digest = formatRunProgressHeartbeat(run, staleBeatCount);
    if (digest && digest !== lastDerivedDigest) {
      lastDerivedDigest = digest;
      if (transcriptDraft.recordDerivedMilestone(digest, inferRunPhase(run.status))) {
        scheduleTailFlush();
      }
      return;
    }

    if (transcriptDraft.emitHeldFallback(currentPhase)) {
      scheduleTailFlush();
    }
  }, derivedProgressHeartbeatMs);

  const finalizeRunMilestones = async () => {
    if (finalized) {
      return;
    }
    finalized = true;
    try {
      await assistantDeltaPump.end();
    } finally {
      clearInterval(derivedHeartbeat);
      if (tailFlushTimer) {
        clearTimeout(tailFlushTimer);
        tailFlushTimer = undefined;
      }
    }

    for (const message of transcriptDraft.finalizeMilestoneMessages()) {
      const nextProject = repository.appendMessage(projectId, "assistant", message.content, {
        threadId,
        kind: "run-milestones",
        metadata: message.metadata
      });
      runtime.upsertPersistedProject(nextProject);
    }
  };

  const persistFinalAssistantMessage = async (content: string) => {
    await assistantDeltaPump.end();
    assistantChunker.seed(content);
    assistantChunker.flush();
    persistStreamingAssistantChunks(true);
    return runtime.getProject(projectId);
  };

  return {
    assistantDeltaPump,
    finalizeRunMilestones,
    persistFinalAssistantMessage,
    recordRunMilestone,
    getCurrentPhase: () => currentPhase,
    setCurrentPhase: (phase: RunMilestonePhase) => { currentPhase = phase; }
  };
}

export function createExecutionCallbacks(
  ws: import("../transport/events").ControlEventSocket,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  threadId: ThreadId,
  sessionId: string,
  runId: string,
  pendingBrowserApprovals: Map<string, PendingBrowserApproval>,
  abortSignal?: AbortSignal,
  connections?: Set<Bun.ServerWebSocket<HarnessConnection>>,
  derivedProgressHeartbeatMs: number = DERIVED_PROGRESS_HEARTBEAT_MS,
  tokenUsageSession: TokenUsageTotals = createEmptyTokenUsageTotals()
) {
  const transcript = createExecutionTranscriptController({
    requestId, runtime, repository, projectId, threadId, sessionId, runId, connections,
    derivedProgressHeartbeatMs
  });
  const { assistantDeltaPump, finalizeRunMilestones, persistFinalAssistantMessage, recordRunMilestone } = transcript;

  return {
    searchMemory: createProjectNoteSearch(repository, { projectId, threadId, runId }),
    threadTools(subagentId?: string) {
      const sourceThreadId = subagentId ? repository.getSubagentThread({ runId, subagentId }) : threadId;
      if (!sourceThreadId) throw new Error("Subagent thread has not started");
      return {
        list(input: { cursor?: string }) {
          return { currentThreadId: sourceThreadId, ...repository.listWorkspaceProjectThreads(projectId, { cursor: input.cursor, limit: 40 }) };
        },
        read(input: { threadId: string; cursor?: string }) {
          if (!repository.getProject(projectId).threads.some(thread => thread.id === input.threadId)) throw new Error("Unknown project thread");
          const page = repository.listWorkspaceThreadMessages(projectId, input.threadId, { cursor: input.cursor, limit: 20 });
          return { ...page, items: page.items.map(message => ({ ...message, content: message.content.slice(0, 8000), truncated: message.content.length > 8000 })) };
        },
        send(input: { threadId: string; message: string; deliveryId: string }) {
          const result = repository.sendThreadMessage({ projectId, sourceThreadId, targetThreadId: input.threadId, message: input.message, deliveryId: input.deliveryId });
          runtime.upsertPersistedProject(repository.getProject(projectId));
          emitProjectUpdated(ws, requestId, projectId, repository.getProject(projectId), repository);
          return result;
        }
      };
    },
    onTrace(trace: AgentTrace) {
      const stampedTrace = withTraceTimestamp(trace);
      runtime.appendTrace(projectId, stampedTrace, threadId);
      emitControlEvent(connections, {
        type: "agent.trace",
        requestId,
        payload: {
          projectId,
          threadId,
          trace: stampedTrace
        }
      });
      const statusMessage = statusMessageFromTrace(stampedTrace);
      if (statusMessage) {
        recordRunMilestone(statusMessage, inferTracePhase(stampedTrace, transcript.getCurrentPhase()));
      }
    },
    onQuality(trace: QualityTrace) {
      const quality = qualityTraceSchema.parse(trace);
      if (!quality.rules.some(rule => rule.eligible !== "no")) return;
      const run = repository.getRun(projectId, runId);
      if (!run?.plan) return;
      const project = repository.setAgentRunExecutionPlan(projectId, runId, { ...run.plan, quality });
      runtime.upsertPersistedProject(project);
      emitRunUpdatedById(ws, requestId, repository, projectId, runId, connections);
    },
    onRunMilestone(line: string) {
      recordRunMilestone(line);
    },
    async closeRunMilestones() {
      await finalizeRunMilestones();
    },
    async persistFinalAssistantMessage(content: string) {
      return persistFinalAssistantMessage(content);
    },
    onDelta(delta: string) {
      assistantDeltaPump.push(delta);
    },
    onContextUsage(contextUsage: ProjectContextUsage) {
      const input = contextUsage.inputTokens ?? contextUsage.tokens;
      if (input !== undefined && contextUsage.totalProcessedTokens !== undefined) {
        recordRunMilestone(`Usage ${contextUsage.sourceLabel} (${contextUsage.modelId}): input ${input}, output ${Math.max(0,
          contextUsage.totalProcessedTokens - input)}, cached input ${contextUsage.cachedInputTokens ?? 0} (included).`);
      }
      runtime.setProjectContextUsage(projectId, contextUsage, threadId);
      const tokenUsage = recordServerTokenUsage(repository, tokenUsageSession, contextUsage, { projectId,
        threadId: contextUsage.sourceKind === "subagent" ? repository.getSubagentThread({ runId, subagentId: contextUsage.sourceLabel }) : threadId,
        runId, runtime: repository.getRun(projectId, runId)?.launchProfile?.agentId });
      emitControlEvent(connections, {
        type: "project.context",
        requestId,
        payload: {
          projectId,
          threadId,
          contextUsage,
          tokenUsage
        }
      });
    },
    onSubagentStart(task: PlannerReadyTurn["subtasks"][number], attempt: number = 1) {
      transcript.setCurrentPhase("subagents");
      repository.ensureSubagentThread({ projectId, parentThreadId: threadId, runId, subagentId: task.id, title: task.title, instruction: task.instruction });
      const nextProject = repository.markSubtaskStarted(projectId, runId, task.id, attempt);
      runtime.upsertPersistedProject(nextProject);
      emitProjectUpdated(ws, requestId, projectId, nextProject, repository);
      emitRunUpdatedById(ws, requestId, repository, projectId, runId, connections);
      if (attempt === 1) {
        recordRunMilestone(`Subagent ${task.title}: started.`);
      }
    },
    onSubagentRetry(task: PlannerReadyTurn["subtasks"][number], attempt: number, _error: Error) {
      recordRunMilestone(`Subagent ${task.title}: retrying attempt ${attempt}.`);
    },
    onSubagentResult(result: SubagentResult) {
      repository.finishSubagentThread({ runId, subagentId: result.id, status: result.status === "completed" ? "completed" : "failed", output: result.output ?? result.errorMessage ?? "" });
      const nextProject =
        result.status === "completed"
          ? repository.markSubtaskCompleted(
            projectId,
            runId,
            result.id,
            result.output ?? "",
            result.attemptCount,
            result.commitSha,
            result.worktreePath,
            result.mountPath
          )
          : repository.markSubtaskFailed(
            projectId,
            runId,
            result.id,
            result.errorMessage ?? "Unknown subagent failure",
            result.attemptCount,
            result.worktreePath,
            result.mountPath
          );
      runtime.upsertPersistedProject(nextProject);
      emitRunUpdatedById(ws, requestId, repository, projectId, runId, connections);
      const nextRun = repository.getRun(projectId, runId);
      emitProjectUpdated(ws, requestId, projectId, nextProject, repository);
      if (nextRun) {
        recordRunMilestone(
          result.status === "completed"
            ? formatSubagentDoneStatus(result.title, nextRun)
            : formatSubagentFailedStatus(result.title, result.errorMessage, nextRun)
        );
      }
    },
    onAggregationStart() {
      transcript.setCurrentPhase("aggregation");
      const nextProject = repository.setAgentRunStatus(projectId, runId, "aggregating");
      runtime.upsertPersistedProject(nextProject);
      emitRunUpdatedById(ws, requestId, repository, projectId, runId, connections);
    },
    setExecutionState(state: ManagedExecutionState) {
      runtime.setExecutionState(projectId, {
        ...state,
        threadId
      });
    },
    getExecutionState(input: Pick<ManagedExecutionState, "runId" | "kind" | "subagentId">) {
      return runtime.getExecutionState(projectId, input);
    },
    clearExecutionState(input: Pick<ManagedExecutionState, "runId" | "kind" | "subagentId">) {
      runtime.clearExecutionState(projectId, input);
    },
    ...createExecutionActivityCallbacks({
      ws,
      requestId,
      runtime,
      repository,
      projectId,
      threadId,
      runId,
      pendingBrowserApprovals,
      abortSignal,
      connections,
      recordRunMilestone
    })
  };
}
