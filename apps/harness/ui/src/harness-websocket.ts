import {
createRequestId,getUtf8ByteLength,parseServerEventFrame,SERVER_EVENT_FRAME_MAX_BYTES,
type ClientCommand,type PreferencesState,type ServerEvent
} from "@hyperfocus/ai-core/protocol";
import { readValueFrame } from "@hyperfocus/serialization";
import { isObject as isTelemetryRecord } from "@hyperfocus/utilities/records";
import { createControlCommandQueue,restoreQueuedControlCommandOwnership } from "./control-command-queue";
import {
canSelectProviderBrand,
getBrowserUiSessionRestoreCommands,
harnessStore,
persistMergedLocalPreferences,
readBrowserUiSession,
readLocalPreferences,
type LocalPreferencesState,
type ViewWorkspaceState
} from "./harness-store";
import { consumeIdeLaunchRequest } from "./ide/ide-launch";
import { ideStore } from "./ide/ide-store";
import { recordUiTelemetry } from "./lib/ui-telemetry";
import {
openAgentRunSource,openAssistantSource,openBackgroundRunInJobsPane,openPreferencesSectionSource,
openProjectThreadSource
} from "./source-navigation";
import {
beginRunDetailRetry,clearRunDetailRecovery,createRunDetailRequests,
setRunDetailRecovery
} from "./store/run-detail-state";
import { terminalStore } from "./terminal/terminal-store";
import { acceptCliAttachRequest,acceptTerminalAttachRequest,closeAllTerminalSockets,openTerminalSocket,ownCliAttachRequest,ownCliStartingRequest,ownsSessionSocket,ownTerminalAttachRequest,ownTerminalCreatingAttachRequest,rejectCliAttachRequest,rejectTerminalAttachRequest,requestCliAttach,resetCliAttachRequests,resetTerminalAttachRequests,revokeCliAttachRequest,revokeTerminalAttachRequest } from "./terminal/terminal-transport";
import { pushToast,reportUiError } from "./toast-store";
import { authorizeHarnessUrl,readHarnessSessionToken } from "./transport/harness-session";

type HarnessSocket = {
  sendCommand: (command: ClientCommand) => void;
  retry: () => void;
  dispose: () => void;
};

type PreferencesSaveCommand = Extract<ClientCommand, { type: "preferences.save" }>;

const ptySockets = new Map<string, WebSocket>();
const notifiedBackgroundRunStatuses = new Map<string, string>();

export function authorizeTerminalEvent(event: ServerEvent) {
  if (event.type === "cli-session.started") return true;
  if (event.type !== "terminal.session.attach-ready" && event.type !== "cli-session.attach-ready") return true;
  if (event.payload.sessionId !== event.payload.attachToken.sessionId) return false;
  return event.type === "cli-session.attach-ready"
    ? acceptCliAttachRequest({ sessionId: event.payload.sessionId, requestId: event.requestId!,
      projectId: event.payload.projectId, threadId: event.payload.threadId })
    : acceptTerminalAttachRequest(event.payload.sessionId, event.requestId!);
}
const CONTROL_HEARTBEAT_INTERVAL_MS = 15_000;
const CLI_UPDATE_CHECK_INTERVAL_MS = 21600000;
const CONTROL_MISSED_PONG_LIMIT = 2;
const PTY_HEARTBEAT = 0x00;
const MAX_PENDING_CONTROL_COMMANDS = 100;
const CONTROL_RECONNECT_DELAY_MS = 1_000;
const CONTROL_RESYNC_RECONNECT_LIMIT = 5;
const CONTROL_RESYNC_RECONNECT_MAX_DELAY_MS = 30_000;
const CONTROL_READY_TIMEOUT_MS = 15_000;
const SERVER_EVENT_FRAME_TOO_LARGE_ERROR_NAME = "ServerEventFrameTooLargeError";
let retryActiveHarnessConnection: (() => void) | undefined;

export function retryHarnessConnection() {
  retryActiveHarnessConnection?.();
}

export function getRuntimeResyncReconnectDelay(attempt: number) {
  return Math.min(CONTROL_RECONNECT_DELAY_MS * 2 ** Math.max(0, attempt - 1), CONTROL_RESYNC_RECONNECT_MAX_DELAY_MS);
}

export function parseServerEventData(data: unknown) {
  const size = typeof data === "string" ? getUtf8ByteLength(data)
    : data instanceof ArrayBuffer || ArrayBuffer.isView(data) ? data.byteLength : 0;
  if (size > SERVER_EVENT_FRAME_MAX_BYTES) {
    const error = new Error(`Server event frame exceeds ${SERVER_EVENT_FRAME_MAX_BYTES} bytes`);
    error.name = SERVER_EVENT_FRAME_TOO_LARGE_ERROR_NAME;
    throw error;
  }
  return parseServerEventFrame(typeof data === "string" ? JSON.parse(data) : readValueFrame(data, { maxBytes: SERVER_EVENT_FRAME_MAX_BYTES }));
}

function persistedUiPreferenceSnapshot() {
  return {
    providerBrand: harnessStore.state.providerBrand,
    debugEnabled: harnessStore.state.debugEnabled,
    tracePanelDefaultOpen: harnessStore.state.tracePanelDefaultOpen,
    subagentWorktreeStrategyDefault: harnessStore.state.subagentWorktreeStrategyDefault,
    blockChatOnDirtyGitDefault: harnessStore.state.blockChatOnDirtyGitDefault,
    dirtyGitChangeLimitDefault: harnessStore.state.dirtyGitChangeLimitDefault,
    autoCompactContextThresholdPercentDefault: harnessStore.state.autoCompactContextThresholdPercentDefault,
    planExecutionModeDefault: harnessStore.state.planExecutionModeDefault,
    planExecutionDelaySecondsDefault: harnessStore.state.planExecutionDelaySecondsDefault,
    singleAgentModelPreferenceDefault: harnessStore.state.singleAgentModelPreferenceDefault,
    subagentModelPreferenceDefault: harnessStore.state.subagentModelPreferenceDefault,
    correctnessIterationModeDefault: harnessStore.state.correctnessIterationModeDefault,
    backgroundJobApprovalPolicyDefault: harnessStore.state.backgroundJobApprovalPolicyDefault,
    assistantAutoApproveNonBlockingQuestionsDefault:
      harnessStore.state.assistantAutoApproveNonBlockingQuestionsDefault,
    assistantCongestionControlEnabledDefault: harnessStore.state.assistantCongestionControlEnabledDefault,
    assistantMaxCongestionDefault: harnessStore.state.assistantMaxCongestionDefault,
    maxBackgroundJobsDefault: harnessStore.state.maxBackgroundJobsDefault,
    autoArchiveCompletedThreadsDefault: harnessStore.state.autoArchiveCompletedThreadsDefault,
    memoryBankEnabledDefault: harnessStore.state.memoryBankEnabledDefault,
    memoryBankRecordRunsDefault: harnessStore.state.memoryBankRecordRunsDefault,
    checkCliUpdatesDefault: harnessStore.state.checkCliUpdatesDefault,
    backgroundJobNotificationsEnabled: harnessStore.state.backgroundJobNotificationsEnabled
  };
}

function handleConnectionReady(options: {
  event: Extract<ServerEvent, { type: "connection.ready" }>;
  browserUiSession: ReturnType<typeof readBrowserUiSession>;
  firstReady: boolean;
  onFirstReady: () => void;
  markServerReady: () => void;
  sendControlCommand: (command: ClientCommand) => void;
  flushPendingCommands: () => void;
  startCliUpdateChecks: () => void;
}) {
  if (options.firstReady) options.onFirstReady();
  options.markServerReady();
  consumeIdeLaunchRequest({
    url: window.location.href,
    activeProjectId: harnessStore.state.workspace.activeProjectId,
    sendCommand: options.sendControlCommand,
    openIde: () => harnessStore.setActiveSurface("ide"),
    openFile: (filePath) => ideStore.openFile(filePath),
    replaceUrl: (url) => window.history.replaceState(window.history.state, "", url)
  });
  const localPreferences = readLocalPreferences();
  const providerKeyDrafts = {
    openAiApiKey: harnessStore.state.openAiApiKeyDraft.trim() || undefined,
    googleApiKey: harnessStore.state.googleApiKeyDraft.trim() || undefined,
    anthropicApiKey: harnessStore.state.anthropicApiKeyDraft.trim() || undefined
  };
  const serverPreferences = options.event.payload.preferences;
  const needsProviderSync =
    (providerKeyDrafts.openAiApiKey && !serverPreferences.hasStoredOpenAiApiKey) ||
    (providerKeyDrafts.googleApiKey && !serverPreferences.hasStoredGoogleApiKey) ||
    (providerKeyDrafts.anthropicApiKey && !serverPreferences.hasStoredAnthropicApiKey);
  const needsPreferenceSync = hasLocalServerPreferenceOverride(localPreferences, serverPreferences);
  const restoreCommands = getBrowserUiSessionRestoreCommands(harnessStore.state, options.browserUiSession);
  let providerFallbackApplied = false;
  if (!needsProviderSync && !canSelectProviderBrand(harnessStore.state, harnessStore.state.providerBrand)) {
    const fallbackProviderBrand = canSelectProviderBrand(harnessStore.state, "gpt")
      ? "gpt"
      : canSelectProviderBrand(harnessStore.state, "gemini")
        ? "gemini"
        : "claude";
    harnessStore.setProviderBrand(fallbackProviderBrand);
    persistMergedLocalPreferences({
      ...persistedUiPreferenceSnapshot(),
      ...providerKeyDrafts,
      providerBrand: fallbackProviderBrand
    });
    providerFallbackApplied = true;
  }
  if (needsProviderSync || needsPreferenceSync || providerFallbackApplied) {
    options.sendControlCommand(
      createPreferencesSaveCommand(
        createRequestId(),
        needsProviderSync ? { ...localPreferences, ...providerKeyDrafts } : localPreferences,
        Boolean(needsProviderSync)
      )
    );
  }
  for (const restoreCommand of restoreCommands) options.sendControlCommand(restoreCommand);
  options.flushPendingCommands();
  options.startCliUpdateChecks();
}

function handleControlEventSideEffects(options: {
  event: ServerEvent;
  endpoint: string;
  wasExecutionPaused: boolean;
  previousRunStatus?: string;
  rejectRunDetail: (requestId: string) => void;
  requestCliUpdateCheck: () => void;
  sendControlCommand: (command: ClientCommand) => void;
}) {
  const event = options.event;
  if (event.type === "preferences.saved" || event.type === "preferences.apiKeyCleared") {
    persistMergedLocalPreferences(persistedUiPreferenceSnapshot());
    if (event.type === "preferences.saved") options.requestCliUpdateCheck();
  }
  if (event.type === "chat.error") {
    const { projectId, threadId } = event.payload;
    reportUiError(event.payload.detail ?? event.payload.message, event.payload.message, {
      projectId,
      onClick: projectId && threadId
        ? () => openProjectThreadSource(harnessStore.state, projectId, threadId, "chat")
        : undefined
    });
  }
  if (event.type === "run.preflight") {
    pushToast("Git dirty warning", event.payload.preflight.message, "info", () =>
      openProjectThreadSource(harnessStore.state, event.payload.projectId, event.payload.threadId, "chat")
    );
  }
  if (event.type === "cli-updates.installed") {
    pushToast(`${event.payload.label} updated`, event.payload.output || "Update complete.", "info", () =>
      openPreferencesSectionSource("developer-advanced")
    );
  }
  if (event.type === "thread.inputRejected") {
    pushToast("Message not sent", event.payload.reason, "info");
  }
  if (event.type === "command.rejected") {
    if (event.requestId) {
      options.rejectRunDetail(event.requestId);
      rejectTerminalAttachRequest(event.requestId);
      const cliSessionId = rejectCliAttachRequest(event.requestId);
      if (cliSessionId) harnessStore.setCliTerminalConnected(cliSessionId, false);
    }
    reportUiError(event.payload.detail ?? event.payload.message, event.payload.message, { rethrow: "dev-only" });
  }
  if (event.type === "cli-session.started") harnessStore.resetCliTerminalOutput(event.payload.session.id);
  if (event.type === "cli-session.attach-ready") {
    openCliSessionSocket(
      options.endpoint,
      event.payload.sessionId,
      event.payload.attachToken.clientId,
      event.payload.attachToken.token
    );
  }
  if (event.type === "terminal.session.attach-ready") {
    openTerminalSocket(
      options.endpoint,
      event.payload.sessionId,
      event.payload.attachToken.clientId,
      event.payload.attachToken.token,
      () => {
        const session = terminalStore.state.sessions.find((entry) => entry.id === event.payload.sessionId);
        if (!session) return;
        try {
          const requestId = createRequestId();
          options.sendControlCommand({
            type: "terminal.session.attach",
            requestId,
            payload: { projectId: session.projectId, sessionId: session.id }
          });
          ownTerminalAttachRequest(session.id, requestId);
        } catch {
          terminalStore.setTransportStatus(session.id, "replay-exhausted");
        }
      }
    );
  }
  if (event.type === "cli-session.exited") closeCliSessionSocket(event.payload.session.id);
  if (event.type === "background-job-run.updated") notifyBackgroundRun(event.payload.run.id);
  if (
    event.type === "assistant.question.updated" &&
    event.payload.question.status === "pending" &&
    !harnessStore.state.executionControl.isPaused
  ) {
    const assistant = harnessStore.state.assistants.assistants.find(
      (entry) => entry.id === event.payload.question.assistantId
    );
    pushToast("Assistant needs input", `${assistant?.name ?? "Assistant"} | ${event.payload.question.prompt}`, "info", () =>
      openAssistantSource(harnessStore.state, event.payload.question.assistantId, "questions")
    );
  }
  if (event.type === "assistant.log.appended" && event.payload.entry.level === "critical") {
    const assistant = harnessStore.state.assistants.assistants.find(
      (entry) => entry.id === event.payload.entry.assistantId
    );
    pushToast(
      "Assistant paused",
      `${assistant?.name ?? "Assistant"} | ${event.payload.entry.detail ?? event.payload.entry.summary}`,
      "error",
      () => {
        openAssistantSource(harnessStore.state, event.payload.entry.assistantId, "log");
        harnessStore.setAssistantLogDetailsId(event.payload.entry.id);
      }
    );
  }
  if (event.type === "assistant.created-card") {
    pushToast("Assistant ready", `${event.payload.assistant.name} opened in assistants surface.`, "info", () =>
      openAssistantSource(harnessStore.state, event.payload.assistant.id, "chat")
    );
  }
  if (event.type === "execution-control.updated" && options.wasExecutionPaused !== event.payload.executionControl.isPaused) {
    pushToast(
      event.payload.executionControl.isPaused ? "Executions paused" : "Executions resumed",
      event.payload.executionControl.isPaused
        ? "Running work continues. New follow-up prompts wait for resume."
        : "Queued prompts and approvals are available again.",
      "info",
      () => openPreferencesSectionSource("safety-guardrails")
    );
  }
  if (event.type === "run.updated" && options.previousRunStatus !== event.payload.run.status) {
    const nextProject = harnessStore.state.workspace.projects.find((project) => project.id === event.payload.projectId);
    const hasPendingPlanningQuestion = nextProject?.activeRun?.questions.some((question) => question.status === "pending");
    if (event.payload.run.status === "awaiting-user-input" && hasPendingPlanningQuestion && !harnessStore.state.executionControl.isPaused) {
      pushToast("Planner needs input", "Answer the planning question in the chat composer.", "info", () =>
        openAgentRunSource(harnessStore.state, event.payload.projectId, event.payload.run, "chat")
      );
    }
    if (event.payload.run.status === "partial-complete") {
      pushToast("Partial result ready", "Some subagents failed. Review output, then resume failed agents.", "error", () =>
        openAgentRunSource(harnessStore.state, event.payload.projectId, event.payload.run, "run")
      );
    }
    if (event.payload.run.status === "failed" && event.payload.run.resumable) {
      pushToast("Run failed", "Completed work was saved. Resume failed agents when ready.", "error", () =>
        openAgentRunSource(harnessStore.state, event.payload.projectId, event.payload.run, "run")
      );
    }
  }
}

function handleControlSocketMessage(options: {
  event: MessageEvent;
  controlSocket: WebSocket;
  endpoint: string;
  isCurrentSocket: () => boolean;
  isReady: () => boolean;
  onPong: () => void;
  stopReadyTimer: () => void;
  onFirstReady: () => void;
  markServerReady: () => void;
  sendControlCommand: (command: ClientCommand) => void;
  flushPendingCommands: () => void;
  startCliUpdateChecks: () => void;
  requestCliUpdateCheck: () => void;
  runDetails: ReturnType<typeof createRunDetailRequests>;
  reconcileRunDetails: () => void;
}) {
  if (!options.isCurrentSocket()) return;
  try {
    for (const parsed of parseServerEventData(options.event.data)) {
      if (!authorizeTerminalEvent(parsed)) continue;
      const browserUiSession = readBrowserUiSession();
      recordUiTelemetry("websocket.event", {
        type: parsed.type,
        requestId: readTelemetryField(parsed, "requestId"),
        projectId: readTelemetryPayloadField(parsed, "projectId"),
        threadId: readTelemetryPayloadField(parsed, "threadId")
      });
      if (parsed.type === "connection.pong" && acceptsControlPong(options.isReady())) options.onPong();
      const wasExecutionPaused = harnessStore.state.executionControl.isPaused;
      const previousRun =
        parsed.type === "run.updated" ||
        parsed.type === "chat.error" ||
        parsed.type === "chat.message-appended" ||
        parsed.type === "thread.message-appended"
          ? harnessStore.state.workspace.projects.find((project) => project.id === parsed.payload.projectId)?.activeRun
          : undefined;
      harnessStore.applyServerEvent(parsed);
      terminalStore.applyServerEvent(parsed);
      ideStore.applyServerEvent(parsed);
      if (parsed.type === "run.detail.loaded") options.runDetails.apply(parsed);
      if (replacesRunProjections(parsed)) options.reconcileRunDetails();
      if (parsed.type === "connection.ready") {
        options.stopReadyTimer();
        handleConnectionReady({
          event: parsed,
          browserUiSession,
          firstReady: !options.isReady(),
          onFirstReady: options.onFirstReady,
          markServerReady: options.markServerReady,
          sendControlCommand: options.sendControlCommand,
          flushPendingCommands: options.flushPendingCommands,
          startCliUpdateChecks: options.startCliUpdateChecks
        });
      }
      handleControlEventSideEffects({
        event: parsed,
        endpoint: options.endpoint,
        wasExecutionPaused,
        previousRunStatus: previousRun?.status,
        rejectRunDetail: options.runDetails.reject,
        requestCliUpdateCheck: options.requestCliUpdateCheck,
        sendControlCommand: options.sendControlCommand
      });
    }
  } catch (error) {
    harnessStore.setConnectionState("error", error instanceof Error ? error.message : "Invalid server event");
    reportUiError(error, "Invalid server event", { rethrow: "never" });
    if (error instanceof Error && error.name === SERVER_EVENT_FRAME_TOO_LARGE_ERROR_NAME) {
      options.controlSocket.close(1009, "Server event frame too large");
    }
  }
}

function createHarnessRunDetails() {
  const getRunProjection = ({ projectId, threadId, runId }: { projectId: string; threadId: string; runId: string }) => {
    const project = harnessStore.state.workspace.projects.find(({ id }) => id === projectId);
    return [project?.activeRun, project?.lastRun].find((run) => run?.id === runId && run.threadId === threadId);
  };
  const runDetails = createRunDetailRequests({
    send: (command) => harnessStore.actions.sendCommand(command),
    getProjection: getRunProjection,
    onLoaded: (projectId, threadId, run) => {
      clearRunDetailRecovery(run.id);
      harnessStore.applyServerEvent({
        type: "run.updated",
        requestId: createRequestId(),
        payload: { projectId, threadId, run }
      });
    },
    onUnavailable: (projectId, threadId, runId, retry) => {
      const project = harnessStore.state.workspace.projects.find(({ id }) => id === projectId);
      const run = [project?.activeRun, project?.lastRun].find((entry) => entry?.id === runId);
      if (run) {
        harnessStore.applyServerEvent({
          type: "run.updated",
          requestId: createRequestId(),
          payload: { projectId, threadId, run: { ...run, detailState: "unavailable" } }
        });
      }
      const startRetry = () => beginRunDetailRetry(runId, retry);
      setRunDetailRecovery({ projectId, threadId, runId, status: "retryable", retry: startRetry });
      pushToast("Run details unavailable", "Full run details could not be loaded. Select to retry.", "error", startRetry);
    }
  });
  return {
    runDetails,
    reconcileRunDetails: () => runDetails.reconcile(getDemandedRunDetailScopes(harnessStore.state.workspace))
  };
}

function createControlCommandTransport(options: {
  ControlWebSocket: typeof WebSocket;
  getSocket: () => WebSocket | undefined;
  isDisposed: () => boolean;
  scheduleReconnect: () => void;
}) {
  const commandQueue = createControlCommandQueue(MAX_PENDING_CONTROL_COMMANDS);
  const sendRaw = (command: ClientCommand) => {
    const socket = options.getSocket();
    if (!socket || socket.readyState !== options.ControlWebSocket.OPEN) return false;
    socket.send(JSON.stringify(command));
    return true;
  };
  const flushPendingCommands = () => {
    commandQueue.flush(sendRaw, (command) =>
      restoreQueuedControlCommandOwnership(command, harnessStore.actions, {
        ownSession: ownTerminalAttachRequest,
        ownCreating: ownTerminalCreatingAttachRequest,
        ownCliSession: ownCliAttachRequest,
        ownCliStart: ownCliStartingRequest
      })
    );
  };
  const queueCommand = (command: ClientCommand) => {
    if (!commandQueue.enqueue(command, (superseded) => {
      revokeTerminalAttachRequest(superseded.requestId);
      revokeCliAttachRequest(superseded.requestId);
    })) {
      throw new Error("Reconnect command queue is full; command was not accepted");
    }
    if (command.type === "assistant.detail.get") {
      harnessStore.actions.markAssistantDetailRequestQueued(command.payload.assistantId, command.requestId);
    }
    const socket = options.getSocket();
    if (!socket || socket.readyState === options.ControlWebSocket.CLOSED || socket.readyState === options.ControlWebSocket.CLOSING) {
      options.scheduleReconnect();
    }
  };
  const sendControlCommand = (command: ClientCommand) => {
    const socket = options.getSocket();
    if (!commandQueue.canSend() || !socket || socket.readyState !== options.ControlWebSocket.OPEN) {
      if (!options.isDisposed()) return queueCommand(command);
      const error = new Error("Websocket is not connected");
      reportUiError(error, "Command send failed", { rethrow: "dev-only" });
      throw error;
    }
    if (!sendRaw(command)) queueCommand(command);
  };
  return { commandQueue, flushPendingCommands, sendControlCommand };
}

function createControlHeartbeat(options: {
  ControlWebSocket: typeof WebSocket;
  getSocket: () => WebSocket | undefined;
  getGeneration: () => number;
  getMissedPongs: () => number;
  setMissedPongs: (value: number) => void;
  sendControlCommand: (command: ClientCommand) => void;
}) {
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let cliUpdateTimer: ReturnType<typeof setInterval> | undefined;
  const stopHeartbeat = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  };
  const startHeartbeat = (ownerSocket: WebSocket, ownerGeneration: number) => {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (
        !ownsControlHeartbeat(options.getSocket(), ownerSocket, options.getGeneration(), ownerGeneration) ||
        ownerSocket.readyState !== options.ControlWebSocket.OPEN
      ) return;
      const missedPongs = options.getMissedPongs();
      if (missedPongs === 1) harnessStore.setConnectionState("stale", "Waiting for server heartbeat");
      if (missedPongs >= CONTROL_MISSED_PONG_LIMIT) {
        ownerSocket.close();
        return;
      }
      ownerSocket.send(JSON.stringify({
        type: "connection.ping",
        requestId: createRequestId(),
        payload: { timestamp: Date.now() }
      }));
      options.setMissedPongs(missedPongs + 1);
    }, CONTROL_HEARTBEAT_INTERVAL_MS);
  };
  const stopCliUpdateChecks = () => {
    if (cliUpdateTimer) clearInterval(cliUpdateTimer);
    cliUpdateTimer = undefined;
  };
  const requestCliUpdateCheck = () => {
    const socket = options.getSocket();
    if (!harnessStore.state.checkCliUpdatesDefault || !socket || socket.readyState !== options.ControlWebSocket.OPEN) return;
    options.sendControlCommand({ type: "cli-updates.check", requestId: createRequestId() });
  };
  const startCliUpdateChecks = () => {
    stopCliUpdateChecks();
    requestCliUpdateCheck();
    cliUpdateTimer = setInterval(requestCliUpdateCheck, CLI_UPDATE_CHECK_INTERVAL_MS);
  };
  return { stopHeartbeat, startHeartbeat, stopCliUpdateChecks, requestCliUpdateCheck, startCliUpdateChecks };
}

export function connectHarnessWebSocket(
  endpoint: string = getDefaultEndpoint(),
  sessionToken: string = readHarnessSessionToken()
): HarnessSocket {
  const ControlWebSocket = globalThis.WebSocket;
  const authorizedEndpoint = authorizeHarnessUrl(endpoint, sessionToken).toString();
  harnessStore.setConnectionState("connecting");
  let socket: WebSocket | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  let missedPongs = 0;
  let runtimeResyncAttempts = 0;
  let controlSocketGeneration = 0;
  let disposed = false;

  const stopReconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
  };
  const stopReadyTimer = () => {
    if (readyTimer) clearTimeout(readyTimer);
    readyTimer = undefined;
  };

  const scheduleReconnect = (message = "Reconnecting to workspace", delay = CONTROL_RECONNECT_DELAY_MS) => {
    if (disposed || reconnectTimer) {
      return;
    }
    harnessStore.setConnectionState("connecting", message);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      openControlSocket();
    }, delay);
  };

  const { commandQueue, flushPendingCommands, sendControlCommand } = createControlCommandTransport({
    ControlWebSocket,
    getSocket: () => socket,
    isDisposed: () => disposed,
    scheduleReconnect
  });
  const { stopHeartbeat, startHeartbeat, stopCliUpdateChecks, requestCliUpdateCheck, startCliUpdateChecks } =
    createControlHeartbeat({
      ControlWebSocket,
      getSocket: () => socket,
      getGeneration: () => controlSocketGeneration,
      getMissedPongs: () => missedPongs,
      setMissedPongs: (value) => {
        missedPongs = value;
      },
      sendControlCommand
    });
  const { runDetails, reconcileRunDetails } = createHarnessRunDetails();

  const openControlSocket = () => {
    stopHeartbeat();
    stopCliUpdateChecks();
    stopReconnect();
    if (disposed) {
      return;
    }
    harnessStore.setConnectionState("connecting", runtimeResyncAttempts > 0
      ? harnessStore.state.connectionError : undefined);
    commandQueue.markDisconnected();
    const controlSocket = new ControlWebSocket(authorizedEndpoint);
    controlSocket.binaryType = "arraybuffer";
    const generation = ++controlSocketGeneration;
    let readyReceived = false;
    socket = controlSocket;

    controlSocket.addEventListener("open", () => {
      if (socket !== controlSocket) return;
      stopReconnect();
      missedPongs = 0;
      stopReadyTimer();
      readyTimer = setTimeout(() => {
        if (socket !== controlSocket || controlSocket.readyState !== ControlWebSocket.OPEN) return;
        harnessStore.setConnectionState("error", "Workspace ready handshake timed out; retrying");
        controlSocket.close(4000, "Workspace ready handshake timed out");
      }, CONTROL_READY_TIMEOUT_MS);
    });

    controlSocket.addEventListener("message", (event) => {
      handleControlSocketMessage({
        event,
        controlSocket,
        endpoint: authorizedEndpoint,
        isCurrentSocket: () => socket === controlSocket,
        isReady: () => readyReceived,
        onPong: () => {
          missedPongs = 0;
          harnessStore.setConnectionState("connected");
        },
        stopReadyTimer,
        onFirstReady: () => {
          readyReceived = true;
          runtimeResyncAttempts = 0;
          missedPongs = 0;
          harnessStore.setConnectionState("connected");
          startHeartbeat(controlSocket, generation);
        },
        markServerReady: commandQueue.markServerReady,
        sendControlCommand,
        flushPendingCommands,
        startCliUpdateChecks,
        requestCliUpdateCheck,
        runDetails,
        reconcileRunDetails
      });
    });

    controlSocket.addEventListener("close", (event) => {
      if (socket !== controlSocket) return;
      stopReadyTimer();
      commandQueue.markDisconnected();
      runDetails.reset();
      resetTerminalAttachRequests();
      for (const sessionId of resetCliAttachRequests()) {
        const session = harnessStore.state.workspace.projects.flatMap((project) => [
          ...(project.cliSessions ?? []), ...(project.activeCliSession ? [project.activeCliSession] : [])
        ])
          .find((entry) => entry.id === sessionId);
        if (session) requestCliAttach(sendControlCommand, { requestId: createRequestId(), projectId: session.projectId,
          threadId: session.threadId, sessionId });
      }
      stopHeartbeat();
      stopCliUpdateChecks();
      if (disposed) {
        harnessStore.setConnectionState("disconnected");
        return;
      }
      if (event.code === 1013) {
        runtimeResyncAttempts += 1;
        const message = event.reason || "Active project runtime resync unavailable; retry connection";
        if (runtimeResyncAttempts >= CONTROL_RESYNC_RECONNECT_LIMIT) {
          harnessStore.setConnectionState("error", message);
          return;
        }
        scheduleReconnect(message, getRuntimeResyncReconnectDelay(runtimeResyncAttempts));
        return;
      }
      if (event.code === 4000 || runtimeResyncAttempts > 0) {
        runtimeResyncAttempts += 1;
        const message = runtimeResyncAttempts > 1 && harnessStore.state.connectionError?.toLowerCase().includes("runtime resync")
          ? harnessStore.state.connectionError : event.reason || "Workspace connection recovery unavailable";
        if (runtimeResyncAttempts >= CONTROL_RESYNC_RECONNECT_LIMIT) {
          harnessStore.setConnectionState("error", message); return;
        }
        scheduleReconnect(message, getRuntimeResyncReconnectDelay(runtimeResyncAttempts)); return;
      }
      scheduleReconnect();
    });

    controlSocket.addEventListener("error", () => {
      if (socket !== controlSocket) return;
      if (runtimeResyncAttempts > 0) return;
      harnessStore.setConnectionState("error", "Websocket connection failed");
      reportUiError("Websocket connection failed", "Connection error");
    });
  };

  const retryConnection = () => {
    runtimeResyncAttempts = 0;
    stopReconnect();
    socket?.close();
    openControlSocket();
    harnessStore.setConnectionState("connecting", "Retrying connection");
  };
  retryActiveHarnessConnection = retryConnection;

  openControlSocket();

  return {
    sendCommand: sendControlCommand,
    retry: retryConnection,
    dispose() {
      disposed = true;
      if (retryActiveHarnessConnection === retryConnection) retryActiveHarnessConnection = undefined;
      stopHeartbeat();
      stopCliUpdateChecks();
      stopReconnect();
      stopReadyTimer();
      commandQueue.clear();
      socket?.close();
      for (const ptySocket of ptySockets.values()) {
        ptySocket.close();
      }
      ptySockets.clear();
      closeAllTerminalSockets();
      resetTerminalAttachRequests();
      resetCliAttachRequests();
    }
  };
}

export function acceptsControlPong(readyReceived: boolean) { return readyReceived; }

export function ownsControlHeartbeat(current: unknown, owner: unknown,
  currentGeneration: number, ownerGeneration: number) {
  return current === owner && currentGeneration === ownerGeneration;
}

export function getDemandedRunDetailScopes(workspace: ViewWorkspaceState) {
  const project = workspace.projects.find(({ id }) => id === workspace.activeProjectId);
  if (!project) return [];
  const seen = new Set<string>();
  return [project.activeRun, project.lastRun].flatMap((run) => {
    if (!run || seen.has(run.id)) return [];
    seen.add(run.id); return [{ projectId: project.id, threadId: run.threadId, run }];
  });
}

function replacesRunProjections(event: ServerEvent) {
  return event.type === "connection.ready" || event.type === "workspace.updated" || event.type === "project.updated" ||
    event.type === "thread.created" || event.type === "thread.activated" || event.type === "thread.cleanupArchived" ||
    event.type === "workspace.projects.listed" || event.type === "run.updated" || event.type === "project.opened" ||
    event.type === "project.removed" || event.type === "project.activated" || event.type === "session.reset";
}

function readTelemetryField(input: unknown, key: string) {
  return isTelemetryRecord(input) && typeof input[key] === "string" ? input[key] : undefined;
}

function readTelemetryPayloadField(input: unknown, key: string) {
  if (!isTelemetryRecord(input) || !isTelemetryRecord(input.payload)) {
    return undefined;
  }
  return typeof input.payload[key] === "string" ? input.payload[key] : undefined;
}


export function sendCliSessionInput(sessionId: string, input: string | Uint8Array) {
  const socket = ptySockets.get(sessionId);
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return false;
  }

  socket.send(toWebSocketBuffer(input));
  return true;
}

function toWebSocketBuffer(input: string | Uint8Array): ArrayBuffer {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return new Uint8Array(bytes).buffer;
}

export function closeCliSessionSocket(sessionId: string) {
  const socket = ptySockets.get(sessionId);
  if (!socket) {
    return;
  }

  socket.close();
  ptySockets.delete(sessionId);
  harnessStore.setCliTerminalConnected(sessionId, false);
}

export function notifyBackgroundRun(runId: string) {
  const state = harnessStore.state;
  const run = state.backgroundJobs.runs.find((entry) => entry.id === runId);
  if (!run) {
    return;
  }

  if (run.status !== "succeeded" && run.status !== "partial-complete" && run.status !== "failed" && run.status !== "awaiting-approval") {
    notifiedBackgroundRunStatuses.delete(run.id);
    return;
  }

  const previousNotifiedStatus = notifiedBackgroundRunStatuses.get(run.id);
  if (previousNotifiedStatus === run.status) {
    return;
  }
  notifiedBackgroundRunStatuses.set(run.id, run.status);

  const jobName = state.backgroundJobs.jobs.find((job) => job.id === run.jobId)?.name ?? run.jobId;
  const title =
    run.status === "succeeded"
      ? "Background task done"
      : run.status === "partial-complete"
      ? "Background task partially done"
      : run.status === "failed"
      ? "Background task failed"
      : "Background task needs approval";
  const body = run.summary ?? run.failureMessage ?? jobName;
  const openRun = () => openBackgroundRunInJobsPane(harnessStore.state, run.id, run.jobId);

  pushToast(
    title,
    `${jobName} | ${body}`,
    run.status === "failed" ? "error" : run.status === "partial-complete" ? "warning" : "info",
    openRun
  );
  if (!state.backgroundJobNotificationsEnabled || typeof Notification === "undefined" || Notification.permission !== "granted") {
    return;
  }

  const notification = new Notification(title, {
    body: `${jobName} | ${body}`
  });
  notification.onclick = () => {
    window.focus();
    openRun();
    notification.close();
  };
}

export function hasLocalServerPreferenceOverride(
  localPreferences: LocalPreferencesState,
  serverPreferences: PreferencesState
) {
  return [
    differs(localPreferences.providerBrand, serverPreferences.providerBrand),
    differs(localPreferences.debugEnabled, serverPreferences.debugEnabledDefault),
    differs(localPreferences.tracePanelDefaultOpen, serverPreferences.tracePanelDefaultOpen),
    differs(localPreferences.subagentWorktreeStrategyDefault, serverPreferences.subagentWorktreeStrategyDefault),
    differs(localPreferences.blockChatOnDirtyGitDefault, serverPreferences.blockChatOnDirtyGitDefault),
    differs(localPreferences.dirtyGitChangeLimitDefault, serverPreferences.dirtyGitChangeLimitDefault),
    differs(localPreferences.autoCompactContextThresholdPercentDefault, serverPreferences.autoCompactContextThresholdPercentDefault),
    differs(localPreferences.planExecutionModeDefault, serverPreferences.planExecutionModeDefault),
    differs(localPreferences.planExecutionDelaySecondsDefault, serverPreferences.planExecutionDelaySecondsDefault),
    differs(localPreferences.singleAgentModelPreferenceDefault, serverPreferences.singleAgentModelPreferenceDefault),
    differs(localPreferences.subagentModelPreferenceDefault, serverPreferences.subagentModelPreferenceDefault),
    differs(localPreferences.correctnessIterationModeDefault, serverPreferences.correctnessIterationModeDefault),
    differs(localPreferences.backgroundJobApprovalPolicyDefault, serverPreferences.backgroundJobApprovalPolicyDefault),
    differs(
      localPreferences.assistantAutoApproveNonBlockingQuestionsDefault,
      serverPreferences.assistantAutoApproveNonBlockingQuestionsDefault
    ),
    differs(localPreferences.assistantCongestionControlEnabledDefault, serverPreferences.assistantCongestionControlEnabledDefault),
    differs(localPreferences.assistantMaxCongestionDefault, serverPreferences.assistantMaxCongestionDefault),
    differs(localPreferences.maxBackgroundJobsDefault, serverPreferences.maxBackgroundJobsDefault),
    differs(localPreferences.autoArchiveCompletedThreadsDefault, serverPreferences.autoArchiveCompletedThreadsDefault),
    differs(localPreferences.memoryBankEnabledDefault, serverPreferences.memoryBankEnabledDefault),
    differs(localPreferences.memoryBankRecordRunsDefault, serverPreferences.memoryBankRecordRunsDefault),
    differs(localPreferences.checkCliUpdatesDefault, serverPreferences.checkCliUpdatesDefault)
  ].some(Boolean);
}

function differs<T>(localValue: T | undefined, serverValue: T | undefined) {
  return localValue !== undefined && localValue !== serverValue;
}

function createPreferencesSaveCommand(
  requestId: string,
  localPreferences: LocalPreferencesState,
  includeApiKeys: boolean
): PreferencesSaveCommand {
  return {
    type: "preferences.save",
    requestId,
    payload: {
      openAiApiKey: includeApiKeys ? localPreferences.openAiApiKey : undefined,
      googleApiKey: includeApiKeys ? localPreferences.googleApiKey : undefined,
      anthropicApiKey: includeApiKeys ? localPreferences.anthropicApiKey : undefined,
      providerBrand: harnessStore.state.providerBrand,
      debugEnabled: harnessStore.state.debugEnabled,
      tracePanelDefaultOpen: harnessStore.state.tracePanelDefaultOpen,
      subagentWorktreeStrategyDefault: harnessStore.state.subagentWorktreeStrategyDefault,
      blockChatOnDirtyGitDefault: harnessStore.state.blockChatOnDirtyGitDefault,
      dirtyGitChangeLimitDefault: harnessStore.state.dirtyGitChangeLimitDefault,
      autoCompactContextThresholdPercentDefault: harnessStore.state.autoCompactContextThresholdPercentDefault,
      planExecutionModeDefault: harnessStore.state.planExecutionModeDefault,
      planExecutionDelaySecondsDefault: harnessStore.state.planExecutionDelaySecondsDefault,
      singleAgentModelPreferenceDefault: harnessStore.state.singleAgentModelPreferenceDefault,
      subagentModelPreferenceDefault: harnessStore.state.subagentModelPreferenceDefault,
      correctnessIterationModeDefault: harnessStore.state.correctnessIterationModeDefault,
      backgroundJobApprovalPolicyDefault: harnessStore.state.backgroundJobApprovalPolicyDefault,
      assistantAutoApproveNonBlockingQuestionsDefault:
        harnessStore.state.assistantAutoApproveNonBlockingQuestionsDefault,
      assistantCongestionControlEnabledDefault: harnessStore.state.assistantCongestionControlEnabledDefault,
      assistantMaxCongestionDefault: harnessStore.state.assistantMaxCongestionDefault,
      maxBackgroundJobsDefault: harnessStore.state.maxBackgroundJobsDefault,
      autoArchiveCompletedThreadsDefault: harnessStore.state.autoArchiveCompletedThreadsDefault,
      memoryBankEnabledDefault: harnessStore.state.memoryBankEnabledDefault,
      memoryBankRecordRunsDefault: harnessStore.state.memoryBankRecordRunsDefault,
      checkCliUpdatesDefault: harnessStore.state.checkCliUpdatesDefault
    }
  };
}

function getDefaultEndpoint() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/ws`;
}

function openCliSessionSocket(controlEndpoint: string, sessionId: string, clientId: string, token: string) {
  closeCliSessionSocket(sessionId);
  const url = new URL(controlEndpoint);
  url.pathname = "/ws/pty";
  url.searchParams.set("clientId", clientId);
  url.searchParams.set("token", token);

  const socket = new globalThis.WebSocket(url);
  socket.binaryType = "arraybuffer";
  socket.addEventListener("open", () => {
    if (ownsSessionSocket(ptySockets, sessionId, socket)) harnessStore.setCliTerminalConnected(sessionId, true);
  });
  socket.addEventListener("message", (event) => {
    if (!ownsSessionSocket(ptySockets, sessionId, socket)) return;
    if (!(event.data instanceof ArrayBuffer)) {
      return;
    }

    const frame = new Uint8Array(event.data);
    const streamId = frame[0];
    if (streamId === PTY_HEARTBEAT) {
      socket.send(new Uint8Array([PTY_HEARTBEAT]));
      return;
    }
    const text = new TextDecoder().decode(frame.slice(1));
    harnessStore.appendCliTerminalOutput(sessionId, streamId === 0x02 ? "stderr" : "stdout", text);
  });
  socket.addEventListener("close", () => {
    if (!ownsSessionSocket(ptySockets, sessionId, socket)) return;
    ptySockets.delete(sessionId);
    harnessStore.setCliTerminalConnected(sessionId, false);
  });
  ptySockets.set(sessionId, socket);
}
