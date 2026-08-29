import { recordBrowserToolEnd, recordBrowserToolStart, recordBrowserToolUpdate, requestBrowserApproval as requestBrowserApprovalState } from "../../browser-session-state";
import type { PiAgentExecutionEvent } from "../../pi-agent-adapter";
import { emitNotificationsUpdatedToAll } from "../automation/background-events";
import type { HarnessConnection, PendingBrowserApproval } from "../core/contracts";
import { emitExecutionControlUpdatedToAll } from "../transport/events";
import { createBrowserApprovalNotification } from "../automation/notifications";
import { emitRunUpdatedById } from "../workspace/project-events";
import { createBrowserApprovalKey } from "./run-context";
import { formatExecutionOwner } from "./run-phase-format";
import { logToolFailure, writeToolDebugArtifactIfEnabled } from "./tool-artifacts";
import { acceptsToolActivityEvent, isSubagentBlockedVerificationCommand, recordToolEnd, recordToolStart,
  recordToolUpdate } from "../../tool-activity-state";
import type { WorkspaceRepository } from "../../workspace-repository";
import type { WorkspaceRuntimeStore } from "../../workspace-runtime-store";
import type { ProjectId } from "@hyperfocus/ai-core/protocol";
import { registerBrowserApprovalWaiter } from "./browser-approval-waiters";
import { acquireHarnessBrowserCapacity, releaseHarnessBrowserCapacity } from "../../execution-runtime";

type ExecutionActivityCallbacksInput = {
  ws: Bun.ServerWebSocket<HarnessConnection>;
  requestId: string;
  runtime: WorkspaceRuntimeStore;
  repository: WorkspaceRepository;
  projectId: ProjectId;
  threadId: string;
  runId: string;
  pendingBrowserApprovals: Map<string, PendingBrowserApproval>;
  abortSignal?: AbortSignal;
  connections?: Set<Bun.ServerWebSocket<HarnessConnection>>;
  recordRunMilestone: (line: string) => void;
};

type ExecutionEventInput = { owner: "main" | "subagent" | "aggregator"; subagentId?: string; event: PiAgentExecutionEvent };
type BrowserApprovalInput = { owner: "main" | "subagent" | "aggregator"; subagentId?: string; toolCallId: string; toolName: string; args: unknown };

export function createExecutionActivityCallbacks(input: ExecutionActivityCallbacksInput) {
  return {
    onExecutionEvent: (event: ExecutionEventInput) => recordExecutionActivity(input, event),
    requestBrowserApproval: (approval: BrowserApprovalInput) => requestExecutionBrowserApproval(input, approval)
  };
}

function recordExecutionActivity(input: ExecutionActivityCallbacksInput, eventInput: ExecutionEventInput) {
  const { ws, requestId, runtime, repository, projectId, runId, connections, recordRunMilestone } = input;
  if (eventInput.event.type === "tool-end") {
    releaseHarnessBrowserCapacity(
      browserCapacityKey(runId, eventInput.owner, eventInput.subagentId, eventInput.event.toolCallId)
    );
  }
  const persistedRun = repository.getRun(projectId, runId);
  if (!persistedRun || eventInput.event.type === "session-created" || eventInput.event.type === "activity") {
    return;
  }

  let nextToolActivities = structuredClone(persistedRun.toolActivities ?? []);
  let nextSessions = structuredClone(persistedRun.browserSessions ?? []);
  if (!acceptsToolActivityEvent(nextToolActivities, {
    runId, owner: eventInput.owner, subagentId: eventInput.subagentId, event: eventInput.event
  })) return;
  let latestToolCallId: string | undefined;
  switch (eventInput.event.type) {
    case "tool-start":
      latestToolCallId = eventInput.event.toolCallId;
      nextToolActivities = recordToolStart(nextToolActivities, {
        runId,
        owner: eventInput.owner,
        subagentId: eventInput.subagentId,
        event: eventInput.event,
        rawArgsDebugArtifactPath: writeToolDebugArtifactIfEnabled(
          repository,
          { projectId, runId, owner: eventInput.owner, subagentId: eventInput.subagentId,
            toolCallId: eventInput.event.toolCallId, kind: "args" },
          eventInput.event.args
        )
      });
      nextSessions = recordBrowserToolStart(nextSessions, {
        runId,
        owner: eventInput.owner,
        subagentId: eventInput.subagentId,
        toolCallId: eventInput.event.toolCallId,
        toolName: eventInput.event.toolName,
        args: eventInput.event.args
      });
      break;
    case "tool-update":
      latestToolCallId = eventInput.event.toolCallId;
      nextToolActivities = recordToolUpdate(nextToolActivities, {
        runId,
        owner: eventInput.owner,
        subagentId: eventInput.subagentId,
        event: eventInput.event,
        rawArgsDebugArtifactPath: writeToolDebugArtifactIfEnabled(
          repository,
          { projectId, runId, owner: eventInput.owner, subagentId: eventInput.subagentId,
            toolCallId: eventInput.event.toolCallId, kind: "args-update" },
          eventInput.event.args
        ),
        rawResultDebugArtifactPath: writeToolDebugArtifactIfEnabled(
          repository,
          { projectId, runId, owner: eventInput.owner, subagentId: eventInput.subagentId,
            toolCallId: eventInput.event.toolCallId, kind: "result-partial" },
          eventInput.event.partialResult
        )
      });
      nextSessions = recordBrowserToolUpdate(nextSessions, {
        runId,
        owner: eventInput.owner,
        subagentId: eventInput.subagentId,
        toolCallId: eventInput.event.toolCallId,
        toolName: eventInput.event.toolName,
        args: eventInput.event.args,
        partialResult: eventInput.event.partialResult
      });
      break;
    case "tool-end": {
      const event = eventInput.event;
      latestToolCallId = event.toolCallId;
      nextToolActivities = recordToolEnd(nextToolActivities, {
        runId,
        owner: eventInput.owner,
        subagentId: eventInput.subagentId,
        event,
        rawResultDebugArtifactPath: writeToolDebugArtifactIfEnabled(
          repository,
          { projectId, runId, owner: eventInput.owner, subagentId: eventInput.subagentId,
            toolCallId: event.toolCallId, kind: "result-final" },
          event.result
        )
      });
      nextSessions = recordBrowserToolEnd(nextSessions, {
        runId,
        owner: eventInput.owner,
        subagentId: eventInput.subagentId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        result: event.result,
        isError: event.isError
      });
      if (event.isError) {
        logToolFailure(runId, eventInput.owner, eventInput.subagentId, event);
      }
      break;
    }
    default:
      return;
  }

  const latestActivity = latestToolCallId
    ? nextToolActivities.find((entry) => entry.toolCallId === latestToolCallId)
    : undefined;
  if (latestActivity && isSubagentBlockedVerificationCommand(latestActivity)) {
    recordRunMilestone(
      `${formatExecutionOwner(eventInput.owner, eventInput.subagentId, persistedRun)}: visible verification command detected.`
    );
  }

  const sessionsChanged = JSON.stringify(persistedRun.browserSessions ?? []) !== JSON.stringify(nextSessions);
  const activitiesChanged = JSON.stringify(persistedRun.toolActivities ?? []) !== JSON.stringify(nextToolActivities);
  if (!sessionsChanged && !activitiesChanged) {
    return;
  }

  let nextProject = sessionsChanged
    ? repository.setAgentRunBrowserSessions(projectId, runId, nextSessions)
    : runtime.getProject(projectId);
  if (activitiesChanged) {
    nextProject = repository.setAgentRunToolActivities(projectId, runId, nextToolActivities);
  }
  runtime.upsertPersistedProject(nextProject);
  emitRunUpdatedById(ws, requestId, repository, projectId, runId, connections);
}

async function requestExecutionBrowserApproval(input: ExecutionActivityCallbacksInput, approvalInput: BrowserApprovalInput) {
  const { ws, requestId, runtime, repository, projectId, threadId, runId, pendingBrowserApprovals, abortSignal, connections } = input;
  const project = runtime.getProject(projectId);
  const run =
    [project.activeRun, project.lastRun].find((entry) => entry?.id === runId) ??
    repository.getRun(projectId, runId);
  if (!run) {
    return { approved: false };
  }

  const nextSessions = requestBrowserApprovalState(structuredClone(run.browserSessions ?? []), {
    runId,
    owner: approvalInput.owner,
    subagentId: approvalInput.subagentId,
    toolCallId: approvalInput.toolCallId,
    toolName: approvalInput.toolName,
    args: approvalInput.args
  });
  const session = nextSessions.find(
    (entry) =>
      entry.runId === runId &&
      entry.owner === approvalInput.owner &&
      (entry.subagentId ?? undefined) === approvalInput.subagentId
  );
  const pendingActivity = session?.activities.find((entry) => entry.toolCallId === approvalInput.toolCallId);
  if (!session || !pendingActivity) {
    await acquireHarnessBrowserCapacity(
      browserCapacityKey(runId, approvalInput.owner, approvalInput.subagentId, approvalInput.toolCallId),
      abortSignal
    );
    return { approved: true };
  }

  const approvalKey = createBrowserApprovalKey(projectId, runId, session.id, approvalInput.toolCallId);
  if (pendingBrowserApprovals.has(approvalKey)) {
    throw new Error("Browser approval is already pending");
  }

  const effectiveSessions: typeof nextSessions = repository.getGlobalExecutionPaused()
    ? nextSessions.map((sessionEntry) => {
      if (sessionEntry.id !== session.id) return sessionEntry;
      return {
        ...sessionEntry,
        activities: sessionEntry.activities.map((activity) =>
          activity.approval?.status === "pending"
            ? { ...activity, approval: { ...activity.approval, status: "deferred" as const } }
            : activity
        ),
        pendingApproval: undefined,
        status: "running" as const
      };
    })
    : nextSessions;
  const nextProject = repository.setAgentRunBrowserSessions(projectId, runId, effectiveSessions);
  runtime.upsertPersistedProject(nextProject);
  emitRunUpdatedById(ws, requestId, repository, projectId, runId, connections);
  const refreshedRun = repository.getRun(projectId, runId);
  const refreshedSession = refreshedRun?.browserSessions?.find((entry) => entry.id === session.id);
  const approval = refreshedSession?.activities.find(
    (entry) => entry.toolCallId === approvalInput.toolCallId
  )?.approval;
  if (approval) {
    repository.saveNotification(
      createBrowserApprovalNotification(
        projectId,
        refreshedRun?.threadId ?? threadId,
        runId,
        refreshedSession!.id,
        approvalInput.toolCallId,
        approval.label,
        approval.inputSummary
      )
    );
  }
  if (repository.getGlobalExecutionPaused() && connections) {
    emitExecutionControlUpdatedToAll(connections, requestId, repository.getExecutionControlState());
  }
  if (connections) {
    emitNotificationsUpdatedToAll(connections, requestId, repository.loadNotificationInboxState());
  }

  const decision = await registerBrowserApprovalWaiter(pendingBrowserApprovals, approvalKey, abortSignal);
  if (decision.approved) {
    await acquireHarnessBrowserCapacity(
      browserCapacityKey(runId, approvalInput.owner, approvalInput.subagentId, approvalInput.toolCallId),
      abortSignal
    );
  }
  return decision;
}

function browserCapacityKey(runId: string, owner: string, subagentId: string | undefined, toolCallId: string) {
  return [runId, owner, subagentId ?? "run", toolCallId].join(":");
}
