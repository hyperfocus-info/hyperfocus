import { createHash } from "node:crypto";
import type { UsageSource } from "@hyperfocus/ai-core/protocol";
import type { HarnessConnection } from "../core/contracts";
import { addTokenUsageTotals, createEmptyTokenUsageTotals, normalizeTokenCount } from "../../usage/token-usage";
export { addTokenUsageTotals, createEmptyTokenUsageTotals, normalizeTokenCount } from "../../usage/token-usage";
import { createWebsocketEventBatcher } from "../../websocket-event-batcher";
import type { GuardedWebSocket } from "../../websocket-send-guard";
import type { WorkspaceRepository } from "../../workspace-repository";
import { SERVER_EVENT_EMIT_MAX_BYTES, type CliAttachToken, type CliSession, type PreferencesState, type ProjectContextUsage, type ProjectId, type ServerEvent, type SetupState, type TerminalAttachToken, type TerminalHistoryScope, type TerminalPaneLayout, type TerminalPreferences, type TerminalSession, type TerminalShell, type TokenUsageTotals } from "@hyperfocus/ai-core/protocol";

export const CONTROL_WEBSOCKET_MAX_QUEUED_BYTES = 67108864;

export const controlEventBatcher = createWebsocketEventBatcher({
  maxQueuedBytes: CONTROL_WEBSOCKET_MAX_QUEUED_BYTES,
  maxEventBytes: SERVER_EVENT_EMIT_MAX_BYTES,
  slowCloseReason: "Control websocket client is too slow"
});

export type ControlEventSocket = GuardedWebSocket & { data: HarnessConnection };
export type ControlEventConnections = ReadonlySet<ControlEventSocket>;

export function sendEvent(ws: ControlEventSocket, event: ServerEvent) {
  controlEventBatcher.send(ws, event, ws.data.encoding);
}

export function emitControlEvent(
  connections: ControlEventConnections | undefined,
  event: ServerEvent
) {
  if (!connections || connections.size === 0) {
    return;
  }

  for (const connection of connections) {
    if (connection.data.kind !== "control") {
      continue;
    }

    sendEvent(connection, event);
  }
}

function emitControlEventToClient(
  connections: ControlEventConnections | undefined,
  connectionId: string,
  event: ServerEvent
) {
  if (!connections) return;
  for (const connection of connections) {
    if (connection.data.kind === "control" && (connection.data.connectionId ?? connection.data.clientId) === connectionId) sendEvent(connection, event);
  }
}

export function emitAgentRuntimeUpdatedToAll(
  connections: import("./events").ControlEventConnections,
  requestId: string,
  agentRuntimes: PreferencesState["agentRuntimes"]
) {
  emitControlEvent(connections, { type: "agent.runtime.updated", requestId, payload: { agentRuntimes } });
}

export function emitSetupUpdatedToAll(
  connections: import("./events").ControlEventConnections,
  requestId: string,
  setup: SetupState
) {
  emitControlEvent(connections, { type: "setup.updated", requestId, payload: { setup } });
}

export function emitUsageUpdatedToAll(
  connections: import("./events").ControlEventConnections,
  requestId: string,
  tokenUsage: ReturnType<WorkspaceRepository["getTokenUsageState"]>
) {
  emitControlEvent(connections, { type: "usage.updated", requestId, payload: { tokenUsage } });
}

export function recordServerTokenUsage(
  repository: WorkspaceRepository,
  tokenUsageSession: TokenUsageTotals,
  contextUsage: ProjectContextUsage,
  attribution: { projectId?: string; threadId?: string; runId?: string; runtime?: string } = {}
) {
  let delta = createTokenUsageDelta(contextUsage);
  if (delta.totalTokensIncludingCached <= 0) {
    return repository.getTokenUsageState(tokenUsageSession);
  }

  const source: Omit<UsageSource, "totals"> = { projectId: attribution.projectId, threadId: attribution.threadId,
    runtime: attribution.runtime, sourceKind: contextUsage.sourceKind, sourceLabel: contextUsage.sourceLabel, modelId: contextUsage.modelId };
  const observationId = createHash("sha256").update(JSON.stringify([attribution.runId, source, contextUsage])).digest("hex");
  delta = repository.recordTokenUsage(delta, source, observationId);
  Object.assign(tokenUsageSession, addTokenUsageTotals(tokenUsageSession, delta));
  return repository.getTokenUsageState(tokenUsageSession);
}

export function createTokenUsageDelta(usage: ProjectContextUsage): TokenUsageTotals {
  const inputTokens = normalizeTokenCount(usage.inputTokens);
  const totalProcessedTokens = Math.max(inputTokens, normalizeTokenCount(usage.totalProcessedTokens ?? inputTokens));
  const cachedInputTokens = Math.min(inputTokens, normalizeTokenCount(usage.cachedInputTokens));
  return createEmptyTokenUsageTotals({
    inputTokens,
    outputTokens: Math.max(0, totalProcessedTokens - inputTokens),
    cachedInputTokens,
    totalProcessedTokens,
    totalTokensIncludingCached: totalProcessedTokens,
    events: 1,
    updatedAt: usage.updatedAt
  });
}

export function emitTerminalShellsUpdatedToAll(
  connections: import("./events").ControlEventConnections,
  input: { requestId: string; shells: TerminalShell[] }
) {
  emitControlEvent(connections, {
    type: "terminal.shells.updated",
    requestId: input.requestId,
    payload: {
      shells: input.shells
    }
  });
}

export function emitTerminalSessionsUpdatedToAll(
  connections: import("./events").ControlEventConnections,
  input: { requestId: string; sessions: TerminalSession[]; preferences: TerminalPreferences; layout?: TerminalPaneLayout }
) {
  emitControlEvent(connections, {
    type: "terminal.sessions.updated",
    requestId: input.requestId,
    payload: {
      sessions: input.sessions,
      preferences: input.preferences,
      layout: input.layout
    }
  });
}

export function emitTerminalHistoryListedToAll(
  connections: import("./events").ControlEventConnections,
  input: { requestId: string; scope: TerminalHistoryScope; sessions: TerminalSession[] }
) {
  emitControlEvent(connections, {
    type: "terminal.history.listed",
    requestId: input.requestId,
    payload: {
      scope: input.scope,
      sessions: input.sessions
    }
  });
}

export function emitTerminalSessionCreatedToAll(
  connections: import("./events").ControlEventConnections,
  input: { requestId: string; session: TerminalSession }
) {
  emitControlEvent(connections, {
    type: "terminal.session.created",
    requestId: input.requestId,
    payload: {
      session: input.session
    }
  });
}

export function emitTerminalSessionUpdatedToAll(
  connections: import("./events").ControlEventConnections,
  input: { requestId: string; session: TerminalSession }
) {
  emitControlEvent(connections, {
    type: "terminal.session.updated",
    requestId: input.requestId,
    payload: {
      session: input.session
    }
  });
}

export function emitTerminalSessionExitedToAll(
  connections: import("./events").ControlEventConnections,
  input: { requestId: string; session: TerminalSession }
) {
  emitControlEvent(connections, {
    type: "terminal.session.exited",
    requestId: input.requestId,
    payload: {
      session: input.session
    }
  });
}

export function emitTerminalAttachReadyToClient(
  connections: ControlEventConnections,
  input: { requestId: string; connectionId: string; sessionId: string; attachToken: TerminalAttachToken; snapshot: string }
) {
  emitControlEventToClient(connections, input.connectionId, {
    type: "terminal.session.attach-ready",
    requestId: input.requestId,
    payload: {
      sessionId: input.sessionId,
      attachToken: input.attachToken,
      snapshot: input.snapshot
    }
  });
}

export function emitTerminalPreferencesSavedToAll(
  connections: import("./events").ControlEventConnections,
  input: { requestId: string; preferences: TerminalPreferences; layout?: TerminalPaneLayout }
) {
  emitControlEvent(connections, {
    type: "terminal.preferences.saved",
    requestId: input.requestId,
    payload: {
      preferences: input.preferences,
      layout: input.layout
    }
  });
}

export function emitCliSessionStartedToAll(
  connections: import("./events").ControlEventConnections,
  input: { requestId: string; projectId: ProjectId; threadId: string; session: CliSession }
) {
  emitControlEvent(connections, { type: "cli-session.started", requestId: input.requestId,
    payload: { projectId: input.projectId, threadId: input.threadId, session: input.session } });
}

export function emitCliSessionUpdatedToAll(
  connections: import("./events").ControlEventConnections,
  input: { requestId: string; projectId: ProjectId; threadId: string; session: CliSession }
) {
  emitControlEvent(connections, { type: "cli-session.updated", requestId: input.requestId,
    payload: { projectId: input.projectId, threadId: input.threadId, session: input.session } });
}

export function emitCliSessionAttachReadyToClient(
  connections: ControlEventConnections,
  input: {
    requestId: string;
    projectId: ProjectId;
    threadId: string;
    sessionId: string;
    attachToken: CliAttachToken;
    connectionId: string;
  }
) {
  emitControlEventToClient(connections, input.connectionId, { type: "cli-session.attach-ready", requestId: input.requestId,
    payload: { projectId: input.projectId, threadId: input.threadId, sessionId: input.sessionId,
      attachToken: input.attachToken } });
}

export function emitCliSessionExitedToAll(
  connections: import("./events").ControlEventConnections,
  input: { requestId: string; projectId: ProjectId; threadId: string; session: CliSession }
) {
  emitControlEvent(connections, { type: "cli-session.exited", requestId: input.requestId,
    payload: { projectId: input.projectId, threadId: input.threadId, session: input.session } });
}

export function emitExecutionControlUpdatedToAll(
  connections: import("./events").ControlEventConnections,
  requestId: string,
  executionControl: ReturnType<WorkspaceRepository["getExecutionControlState"]>
) {
  emitControlEvent(connections, { type: "execution-control.updated", requestId, payload: { executionControl } });
}
