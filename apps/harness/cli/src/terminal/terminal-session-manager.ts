import path from "node:path";
import {
  createRequestId,
  createSessionId,
  terminalPaneLayoutSchema,
  terminalPreferencesSchema,
  type ProjectId,
  type TerminalAttachToken,
  type TerminalEnvVar,
  type TerminalHistoryScope,
  type TerminalPaneLayout,
  type TerminalPreferences,
  type TerminalSession,
  type TerminalSessionSource,
  type TerminalTransportMode,
  type TerminalShell
} from "@hyperfocus/ai-core/protocol";
import { buildCliProcessEnv } from "../agent-runtimes/cli-process-manager";
import { createSecureToken } from "../agent-runtimes/cli-health";
import { cancelStreamPumps, createStreamPump, DEFAULT_STREAM_MAX_QUEUED_BYTES, drainStreamPumps, type StreamPump } from "../stream-pump";
import { guardedWebsocketSend, type GuardedWebSocket } from "../websocket-send-guard";
import type {  WorkspaceRepository } from "../workspace-repository";
import { createAttachTokenStore, createTerminalAttachReplay, type TerminalAttachReplay } from "../server/transport/attach-ownership";

export const TERMINAL_STREAM_HEARTBEAT = 0x00;
const TERMINAL_STREAM_DATA = 0x01;
const TERMINAL_ATTACH_READY = 0x02;
const ATTACH_TOKEN_TTL_MS = 30_000;
const TERMINAL_HEARTBEAT_INTERVAL_MS = 15_000;
const TERMINAL_STALE_TIMEOUT_MS = 30_000;
const TERMINAL_STREAM_FLUSH_MS = 16;
const TERMINAL_STREAM_MAX_BUFFERED_BYTES = 16 * 1024;
const TERMINAL_SEND_QUEUE_CAP_BYTES = 512 * 1024;
const TERMINAL_REPLAY_FRAME_BYTES = 64 * 1024;
const TERMINAL_STATE_PERSIST_THROTTLE_MS = 500;
const MAX_SCROLLBACK_CHARS = 2_000_000;
const TERMINAL_UTF8_DECODER = new TextDecoder();
const TERMINAL_UTF16LE_DECODER = new TextDecoder("utf-16le");

type TerminalProcess = {
  pid?: number;
  transportMode: TerminalTransportMode;
  write(data: string | Uint8Array): void | Promise<void>;
  resize(cols: number, rows: number): void;
  stop(): Promise<void>;
};

type SessionRecord = {
  session: TerminalSession;
  process?: TerminalProcess;
  socket?: Bun.ServerWebSocket<{ clientId: string; kind: "control" | "pty" | "terminal"; sessionId?: string }>;
  attachedClientId?: string;
  heartbeatTimer?: ReturnType<typeof setInterval>;
  lastPongAt?: number;
  pump?: StreamPump;
};

type AttachTokenRecord = TerminalAttachToken & {
  projectId: ProjectId;
};

type TerminalSessionManagerOptions = {
  repository: WorkspaceRepository;
  onSessionsUpdated: (input: { requestId: string; sessions: TerminalSession[]; preferences: TerminalPreferences; layout?: TerminalPaneLayout }) => void;
  onShellsUpdated: (input: { requestId: string; shells: TerminalShell[] }) => void;
  onHistoryListed: (input: { requestId: string; scope: TerminalHistoryScope; sessions: TerminalSession[] }) => void;
  onSessionCreated: (input: { requestId: string; session: TerminalSession }) => void;
  onSessionUpdated: (input: { requestId: string; session: TerminalSession }) => void;
  onSessionExited: (input: { requestId: string; session: TerminalSession }) => void;
  onAttachReady: (input: { requestId: string; connectionId: string; sessionId: string; attachToken: TerminalAttachToken; snapshot: string }) => void;
  onPreferencesSaved: (input: { requestId: string; preferences: TerminalPreferences; layout?: TerminalPaneLayout }) => void;
  discoverShells?: () => Promise<TerminalShell[]>;
  startProcess?: typeof startTerminalProcess;
};

type TerminalSessionManagerState = {
  sessions: Map<string, SessionRecord>;
  attachReplay: TerminalAttachReplay;
  attachTokens: ReturnType<typeof createAttachTokenStore<AttachTokenRecord>>;
  shells: TerminalShell[];
  preferences: TerminalPreferences;
  layout: TerminalPaneLayout | undefined;
  scrollbackBySessionId: Record<string, string>;
  persistTimer: ReturnType<typeof setTimeout> | undefined;
  persistPending: boolean;
};

type TerminalSessionCreatorTools = {
  discoverShells: () => Promise<TerminalShell[]>;
  resolveShell: (shellId: string | undefined) => TerminalShell;
  persistNow: () => void;
  startProcess: (input: Parameters<typeof startTerminalProcess>[0]) => ReturnType<typeof startTerminalProcess>;
  handleChunk: (sessionId: string, chunk: Uint8Array) => void;
  handleExit: (sessionId: string, exitCode: number) => Promise<void>;
  attachSession: (input: { requestId: string; projectId: ProjectId; sessionId: string; clientId: string; connectionId?: string }) => void;
};

function createTerminalSessionCreator(
  options: TerminalSessionManagerOptions,
  state: TerminalSessionManagerState,
  tools: TerminalSessionCreatorTools
) {
  const { discoverShells, resolveShell, persistNow, startProcess, handleChunk, handleExit, attachSession } = tools;
  async function createSession(input: {
    requestId: string;
    projectId: ProjectId;
    projectRoot: string;
    clientId: string;
    connectionId?: string;
    source?: TerminalSessionSource;
    name?: string;
    shellId?: string;
    cwd?: string;
    cols: number;
    rows: number;
    env?: TerminalEnvVar[];
  }) {
    if (state.shells.length === 0) {
      state.shells = await discoverShells();
    }
    const shell = resolveShell(input.shellId);
    const cwd = resolveTerminalCwd(input.projectRoot, input.cwd);
    const env = normalizeTerminalEnv(input.env);
    const transportInfo = getTerminalTransportInfo();
    const now = new Date().toISOString();
    const source = input.source ?? { kind: "user" as const };
    const inputMode = source.kind === "agent" ? "read-only" : "interactive";
    const session: TerminalSession = {
      id: createSessionId(),
      projectId: input.projectId,
      source,
      name: input.name?.trim() || shell.label,
      shellId: shell.id,
      cwd,
      status: "starting",
      inputMode,
      inputOverride: false,
      inputLockReason: inputMode === "read-only" ? "Agent-spawned terminal is read-only while its run is in progress." : undefined,
      cols: input.cols,
      rows: input.rows,
      transportMode: transportInfo.mode,
      transportWarning: transportInfo.warning,
      startedAt: now,
      updatedAt: now
    };

    const record: SessionRecord = { session };
    state.sessions.set(session.id, record);
    persistNow();
    options.onSessionCreated({ requestId: input.requestId, session });

    try {
      record.process = await startProcess({
        cmd: resolveShellCommand(shell),
        cwd,
        cols: input.cols,
        rows: input.rows,
        env,
        onData: (chunk) => handleChunk(session.id, chunk),
        onExit: (exitCode) => {
          void handleExit(session.id, exitCode);
        }
      });
    } catch (error) {
      const failedAt = new Date().toISOString();
      record.session = {
        ...record.session,
        status: "failed",
        exitCode: -1,
        exitedAt: failedAt,
        updatedAt: failedAt
      };
      persistNow();
      options.onSessionUpdated({ requestId: input.requestId, session: record.session });
      throw error;
    }
    record.session = {
      ...record.session,
      pid: record.process.pid,
      transportMode: record.process.transportMode,
      status: "running",
      updatedAt: new Date().toISOString()
    };
    persistNow();
    options.onSessionUpdated({ requestId: input.requestId, session: record.session });
    attachSession({ requestId: input.requestId, projectId: input.projectId, sessionId: session.id, clientId: input.clientId, connectionId: input.connectionId });
  }

  return createSession;
}

function createTerminalSessionInternals(
  options: TerminalSessionManagerOptions,
  state: TerminalSessionManagerState,
  schedulePersist: () => void,
  persistNow: () => void
) {
  function handleChunk(sessionId: string, chunk: Uint8Array) {
    const record = state.sessions.get(sessionId);
    if (!record) {
      return;
    }
    const text = decodeTerminalOutputChunk(chunk);
    state.attachReplay.appended(sessionId, text);
    state.scrollbackBySessionId[sessionId] = trimScrollback(`${state.scrollbackBySessionId[sessionId] ?? ""}${text}`, state.preferences.scrollbackLimit);
    record.session = { ...record.session, updatedAt: new Date().toISOString() };
    schedulePersist();
    const socket = record.socket;
    record.pump ??= createStreamPump({
      flushIntervalMs: TERMINAL_STREAM_FLUSH_MS,
      maxBufferedBytes: TERMINAL_STREAM_MAX_BUFFERED_BYTES, maxQueuedBytes: DEFAULT_STREAM_MAX_QUEUED_BYTES,
      onFlush: (payload) => { sendTerminalDataFrame(socket, payload); }, onError: () => { void record.process?.stop().catch(() => undefined); }
    });
    record.pump.push(text);
  }

  async function handleExit(sessionId: string, exitCode: number) {
    const record = state.sessions.get(sessionId);
    if (!record) {
      return;
    }
    persistNow();
    const drainErrors = await drainTerminalTransport(record);
    const now = new Date().toISOString();
    record.process = undefined;
    record.session = {
      ...record.session,
      status: exitCode === 0 && drainErrors.length === 0 ? "exited" : "failed",
      exitCode,
      exitedAt: now,
      closedAt: getTerminalSessionSource(record.session).kind === "agent" ? now : record.session.closedAt,
      updatedAt: now
    };
    persistNow();
    options.onSessionExited({ requestId: createRequestId(), session: record.session });
    emitSessionsUpdated(createRequestId());
  }

  function issueAttachToken(input: { projectId: ProjectId; sessionId: string; clientId: string }) {
    const token: AttachTokenRecord = {
      token: createSecureToken(),
      sessionId: input.sessionId,
      projectId: input.projectId,
      clientId: input.clientId,
      expiresAt: new Date(Date.now() + ATTACH_TOKEN_TTL_MS).toISOString()
    };
    state.attachReplay.register(token.token, token.sessionId, token.expiresAt);
    state.attachTokens.issue(token);
    return { token: token.token, sessionId: token.sessionId, clientId: token.clientId, expiresAt: token.expiresAt };
  }

  function startHeartbeat(record: SessionRecord) {
    record.heartbeatTimer = setInterval(() => {
      if (!record.socket || !record.attachedClientId) {
        return;
      }
      if (Date.now() - (record.lastPongAt ?? 0) > TERMINAL_STALE_TIMEOUT_MS) {
        record.socket.close(4000, "Terminal heartbeat missed");
        cancelTerminalTransport(record);
        return;
      }
      guardedWebsocketSend(record.socket, new Uint8Array([TERMINAL_STREAM_HEARTBEAT]), {
        maxQueuedBytes: TERMINAL_SEND_QUEUE_CAP_BYTES
      });
    }, TERMINAL_HEARTBEAT_INTERVAL_MS);
  }

  function resolveShell(shellId: string | undefined) {
    const defaultShellId = shellId ?? state.preferences.defaultShellId;
    const shell = state.shells.find((entry) => entry.id === defaultShellId && entry.available) ?? state.shells.find((entry) => entry.default && entry.available) ?? state.shells.find((entry) => entry.available);
    if (!shell) {
      throw new Error("No terminal shell is available");
    }
    return shell;
  }

  function requireSession(sessionId: string) {
    const record = state.sessions.get(sessionId);
    if (!record) {
      throw new Error(`Unknown terminal session: ${sessionId}`);
    }
    return record;
  }

  function requireOwnedSession(projectId: ProjectId, sessionId: string) {
    const record = requireSession(sessionId);
    if (record.session.projectId !== projectId) {
      throw new Error(`Terminal session ${sessionId} belongs to another project`);
    }
    return record;
  }

  function pruneLayoutSession(sessionId: string) {
    const prune = (layout: TerminalPaneLayout | undefined): TerminalPaneLayout | undefined => {
      if (!layout) {
        return undefined;
      }
      if (layout.type === "leaf") {
        return layout.sessionId === sessionId ? { ...layout, sessionId: undefined } : layout;
      }
      return { ...layout, children: layout.children.map(prune).filter((child): child is TerminalPaneLayout => child !== undefined) };
    };
    state.layout = prune(state.layout);
  }

  function trimAllScrollback() {
    state.scrollbackBySessionId = Object.fromEntries(
      Object.entries(state.scrollbackBySessionId).map(([sessionId, scrollback]) => [
        sessionId,
        trimScrollback(scrollback, state.preferences.scrollbackLimit)
      ])
    );
  }

  function emitSessionsUpdated(requestId: string, projectId?: ProjectId) {
    const listedSessions = [...state.sessions.values()]
      .map((record) => record.session)
      .filter((session) => !session.closedAt && (!projectId || session.projectId === projectId));
    options.onSessionsUpdated({
      requestId,
      sessions: listedSessions,
      preferences: state.preferences,
      layout: state.layout
    });
  }

  function getHistorySessions(scope: TerminalHistoryScope) {
    return [...state.sessions.values()]
      .map((record) => record.session)
      .filter((session) => {
        if (session.projectId !== scope.projectId) {
          return false;
        }
        const source = getTerminalSessionSource(session);
        if (scope.threadId && (source.kind !== "agent" || source.threadId !== scope.threadId)) {
          return false;
        }
        if (scope.runId && (source.kind !== "agent" || source.runId !== scope.runId)) {
          return false;
        }
        return true;
      })
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, 256);
  }

  return { handleChunk, handleExit, issueAttachToken, startHeartbeat, resolveShell, requireSession, requireOwnedSession,
    pruneLayoutSession, trimAllScrollback, emitSessionsUpdated, getHistorySessions };
}

function createTerminalPersistence(options: TerminalSessionManagerOptions, state: TerminalSessionManagerState) {
  function schedulePersist() {
    state.persistPending = true;
    if (state.persistTimer) {
      return;
    }
    state.persistTimer = setTimeout(() => {
      state.persistTimer = undefined;
      if (!state.persistPending) {
        return;
      }
      state.persistPending = false;
      persist();
    }, TERMINAL_STATE_PERSIST_THROTTLE_MS);
  }

  function persistNow() {
    if (state.persistTimer) {
      clearTimeout(state.persistTimer);
      state.persistTimer = undefined;
    }
    state.persistPending = false;
    persist();
  }

  function persist() {
    options.repository.setTerminalState({
      sessions: [...state.sessions.values()].map((record) => record.session),
      scrollbackBySessionId: state.scrollbackBySessionId,
      preferences: state.preferences,
      layout: state.layout
    });
  }

  function discoverShells() {
    return options.discoverShells?.() ?? discoverTerminalShells();
  }

  function startProcess(input: Parameters<typeof startTerminalProcess>[0]) {
    return options.startProcess?.(input) ?? startTerminalProcess(input);
  }

  return { schedulePersist, persistNow, discoverShells, startProcess };
}

function createTerminalListingApi(
  options: TerminalSessionManagerOptions,
  state: TerminalSessionManagerState,
  discoverShells: () => Promise<TerminalShell[]>,
  emitSessionsUpdated: (requestId: string, projectId?: ProjectId) => void,
  getHistorySessions: (scope: TerminalHistoryScope) => TerminalSession[]
) {
  async function refreshShells(requestId: string) {
    state.shells = await discoverShells();
    options.onShellsUpdated({ requestId, shells: state.shells });
    emitSessionsUpdated(requestId);
  }
  function listSessions(input: { requestId: string; projectId?: ProjectId }) {
    emitSessionsUpdated(input.requestId, input.projectId);
  }
  function listHistory(input: { requestId: string; scope: TerminalHistoryScope }) {
    options.onHistoryListed({ requestId: input.requestId, scope: input.scope, sessions: getHistorySessions(input.scope) });
  }
  return { refreshShells, listSessions, listHistory };
}

export function createTerminalSessionManager(options: TerminalSessionManagerOptions) {
  const attachReplay: TerminalAttachReplay = createTerminalAttachReplay();
  const persisted = options.repository.getTerminalState();
  const state: TerminalSessionManagerState = {
    sessions: new Map(),
    attachReplay,
    attachTokens: createAttachTokenStore<AttachTokenRecord>((record) => attachReplay.revoke(record.token)),
    shells: [],
    preferences: persisted.preferences,
    layout: persisted.layout,
    scrollbackBySessionId: persisted.scrollbackBySessionId,
    persistTimer: undefined,
    persistPending: false
  };
    for (const session of persisted.sessions) {
      state.sessions.set(session.id, { session });
    }
  const { schedulePersist, persistNow, discoverShells, startProcess } = createTerminalPersistence(options, state);
  const internals = createTerminalSessionInternals(options, state, schedulePersist, persistNow);
  const { handleChunk, handleExit, issueAttachToken, startHeartbeat, resolveShell, requireSession, requireOwnedSession,
    pruneLayoutSession, trimAllScrollback, emitSessionsUpdated, getHistorySessions } = internals;
  const createSession = createTerminalSessionCreator(options, state, {
    discoverShells, resolveShell, persistNow, startProcess, handleChunk, handleExit, attachSession
  });
  const { refreshShells, listSessions, listHistory } = createTerminalListingApi(
    options, state, discoverShells, emitSessionsUpdated, getHistorySessions
  );

  function setInputOverride(input: { requestId: string; projectId: ProjectId; sessionId: string; allowInput: boolean }) {
    const record = requireOwnedSession(input.projectId, input.sessionId);
    if (getTerminalSessionSource(record.session).kind !== "agent") {
      record.session = {
        ...record.session,
        inputMode: "interactive",
        inputOverride: false,
        inputLockReason: undefined,
        updatedAt: new Date().toISOString()
      };
    } else {
      record.session = {
        ...record.session,
        inputMode: "read-only",
        inputOverride: input.allowInput,
        inputLockReason: input.allowInput ? undefined : "Agent-spawned terminal is read-only while its run is in progress.",
        updatedAt: new Date().toISOString()
      };
    }
    persistNow();
    options.onSessionUpdated({ requestId: input.requestId, session: record.session });
  }

  function renameSession(input: { requestId: string; projectId: ProjectId; sessionId: string; name: string }) {
    const record = requireOwnedSession(input.projectId, input.sessionId);
    record.session = { ...record.session, name: input.name.trim(), updatedAt: new Date().toISOString() };
    persistNow();
    options.onSessionUpdated({ requestId: input.requestId, session: record.session });
  }

  async function stopSession(input: { requestId: string; projectId: ProjectId; sessionId: string }) {
    const record = requireOwnedSession(input.projectId, input.sessionId);
    await record.process?.stop();
    if (!record.process) {
      record.session = { ...record.session, status: "stopped", updatedAt: new Date().toISOString() };
      persistNow();
      options.onSessionUpdated({ requestId: input.requestId, session: record.session });
    }
  }

  async function closeSession(input: { requestId: string; projectId: ProjectId; sessionId: string }) {
    const record = requireOwnedSession(input.projectId, input.sessionId);
    await record.process?.stop();
    const drainErrors = await drainTerminalTransport(record);
    const closedAt = new Date().toISOString();
    record.process = undefined;
    record.session = {
      ...record.session,
      status: drainErrors.length > 0 ? "failed"
        : record.session.status === "running" || record.session.status === "starting" ? "stopped" : record.session.status,
      closedAt,
      updatedAt: closedAt
    };
    pruneLayoutSession(input.sessionId);
    persistNow();
    options.onSessionUpdated({ requestId: input.requestId, session: record.session });
    emitSessionsUpdated(input.requestId);
  }

  async function restartSession(input: { requestId: string; projectId: ProjectId; projectRoot: string; sessionId: string; clientId: string; connectionId?: string; cols: number; rows: number }) {
    const previous = requireOwnedSession(input.projectId, input.sessionId).session;
    await closeSession(input);
    await createSession({
      requestId: input.requestId,
      projectId: input.projectId,
      projectRoot: input.projectRoot,
      clientId: input.clientId,
      connectionId: input.connectionId,
      name: previous.name,
      shellId: previous.shellId,
      cwd: previous.cwd,
      cols: input.cols,
      rows: input.rows
    });
  }

  function resizeSession(input: { requestId: string; projectId: ProjectId; sessionId: string; cols: number; rows: number }) {
    const record = requireOwnedSession(input.projectId, input.sessionId);
    record.process?.resize(input.cols, input.rows);
    record.session = { ...record.session, cols: input.cols, rows: input.rows, updatedAt: new Date().toISOString() };
    persistNow();
    options.onSessionUpdated({ requestId: input.requestId, session: record.session });
  }

  function attachSession(input: { requestId: string; projectId: ProjectId; sessionId: string; clientId: string; connectionId?: string }) {
    requireOwnedSession(input.projectId, input.sessionId);
    const attachToken = issueAttachToken(input);
    options.onAttachReady({
      requestId: input.requestId, connectionId: input.connectionId ?? input.clientId, sessionId: input.sessionId, attachToken,
      snapshot: state.scrollbackBySessionId[input.sessionId] ?? ""
    });
  }

  function savePreferences(input: { requestId: string; preferences: TerminalPreferences; layout?: TerminalPaneLayout }) {
    state.preferences = terminalPreferencesSchema.parse(input.preferences);
    state.layout = input.layout ? terminalPaneLayoutSchema.parse(input.layout) : state.layout;
    trimAllScrollback();
    persistNow();
    options.onPreferencesSaved({ requestId: input.requestId, preferences: state.preferences, layout: state.layout });
  }

  function consumeAttachToken(token: string, clientId: string) {
    return state.attachTokens.consume(token, clientId);
  }

  function revokeAttachReplay(ownerId: string) { state.attachReplay.revoke(ownerId); }

  function attachSocket(input: {
    sessionId: string;
    clientId: string;
    attachOwnerId: string;
    socket: Bun.ServerWebSocket<{ clientId: string; kind: "control" | "pty" | "terminal"; sessionId?: string }>;
  }) {
    const record = requireSession(input.sessionId);
    cancelTerminalTransport(record);
    record.socket = input.socket;
    record.attachedClientId = input.clientId;
    record.lastPongAt = Date.now();
    const gap = state.attachReplay.take(input.attachOwnerId);
    if (gap === undefined || !sendTerminalReplay(record.socket, gap)) return expireTerminalAttach(input.socket, record);
    startHeartbeat(record);
  }

  function detachSocket(sessionId: string) {
    const record = state.sessions.get(sessionId);
    if (record) {
      cancelTerminalTransport(record);
    }
  }

  function detachClient(clientId: string) {
    state.attachTokens.invalidateClient(clientId);
    for (const record of state.sessions.values()) {
      if (record.attachedClientId === clientId) {
        cancelTerminalTransport(record);
      }
    }
  }

  function recordPong(sessionId: string, clientId: string) {
    const record = state.sessions.get(sessionId);
    if (!record || record.attachedClientId !== clientId) {
      return false;
    }
    record.lastPongAt = Date.now();
    return true;
  }

  async function writeToSession(sessionId: string, data: Uint8Array) {
    const record = requireSession(sessionId);
    if (isTerminalInputLocked(record.session)) {
      return false;
    }
    await record.process?.write(data);
    return true;
  }



  return {
    refreshShells, listSessions, listHistory, createSession, setInputOverride, renameSession,
    stopSession, closeSession, restartSession, resizeSession, attachSession, savePreferences,
    consumeAttachToken, revokeAttachReplay, attachSocket, detachSocket, detachClient, recordPong,
    writeToSession
  };
}

export type TerminalSessionManager = ReturnType<typeof createTerminalSessionManager>;

function cancelTerminalTransport(record: SessionRecord) {
  cancelStreamPumps(takeTerminalTransport(record));
}

function expireTerminalAttach(socket: NonNullable<SessionRecord["socket"]>, record: SessionRecord) {
  socket.close(4001, "Terminal attach snapshot expired"); cancelTerminalTransport(record);
}

async function drainTerminalTransport(record: SessionRecord) {
  return drainStreamPumps(takeTerminalTransport(record));
}

function takeTerminalTransport(record: SessionRecord) {
  clearTerminalHeartbeat(record);
  const pumps = record.pump ? [record.pump] : [];
  clearTerminalTransportReferences(record);
  return pumps;
}

function clearTerminalHeartbeat(record: SessionRecord) {
  if (record.heartbeatTimer) clearInterval(record.heartbeatTimer);
  record.heartbeatTimer = undefined;
}

function clearTerminalTransportReferences(record: SessionRecord) {
  record.pump = undefined; record.socket = undefined; record.attachedClientId = undefined; record.lastPongAt = undefined;
}

function sendTerminalDataFrame(socket: SessionRecord["socket"], text: string) {
  if (!socket) return false;
  const payload = new TextEncoder().encode(text), frame = new Uint8Array(payload.length + 1);
  frame[0] = TERMINAL_STREAM_DATA; frame.set(payload, 1);
  return guardedWebsocketSend(socket, frame, { maxQueuedBytes: TERMINAL_SEND_QUEUE_CAP_BYTES });
}

function sendTerminalReadyFrame(socket: GuardedWebSocket | undefined) {
  return !!socket && guardedWebsocketSend(socket, new Uint8Array([TERMINAL_ATTACH_READY]), { maxQueuedBytes: TERMINAL_SEND_QUEUE_CAP_BYTES });
}

function sendTerminalReplay(socket: GuardedWebSocket | undefined, text: string) {
  if (!socket) return false;
  for (const payload of splitUtf8(text, TERMINAL_REPLAY_FRAME_BYTES)) {
    const frame = new Uint8Array(payload.byteLength + 1);
    frame[0] = TERMINAL_STREAM_DATA; frame.set(payload, 1);
    if (!guardedWebsocketSend(socket, frame, { maxQueuedBytes: TERMINAL_SEND_QUEUE_CAP_BYTES })) return false;
  }
  return sendTerminalReadyFrame(socket);
}

function* splitUtf8(text: string, maxBytes: number) {
  const encoder = new TextEncoder(); let offset = 0;
  while (offset < text.length) {
    let low = offset + 1, high = Math.min(text.length, offset + maxBytes), end = low;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2), boundary = isLowSurrogate(text.charCodeAt(middle)) ? middle - 1 : middle;
      if (encoder.encode(text.slice(offset, boundary)).byteLength <= maxBytes) { end = boundary; low = middle + 1; } else high = middle - 1;
    }
    const payload = encoder.encode(text.slice(offset, end)); yield payload; offset = end;
  }
}

function isLowSurrogate(code: number) { return code >= 0xdc00 && code <= 0xdfff; }

function getTerminalSessionSource(session: TerminalSession): TerminalSessionSource {
  return session.source ?? { kind: "user" };
}

function isTerminalInputLocked(session: TerminalSession) {
  return session.inputMode === "read-only" && session.inputOverride !== true;
}

function getTerminalTransportInfo(): { mode: TerminalTransportMode; warning?: string } {
  if (process.platform === "win32") {
    return {
      mode: "pipe",
      warning: "Windows integrated terminal uses pipe transport; cursor-heavy full-screen CLIs and resize behavior may be degraded."
    };
  }
  return { mode: "pty" };
}

async function discoverTerminalShells(): Promise<TerminalShell[]> {
  const candidates =
    process.platform === "win32"
      ? [
          { id: "pwsh", label: "PowerShell 7", kind: "powershell" as const, commands: ["pwsh.exe", "pwsh"] },
          { id: "powershell", label: "Windows PowerShell", kind: "powershell" as const, commands: ["powershell.exe"] },
          { id: "cmd", label: "Command Prompt", kind: "cmd" as const, commands: ["cmd.exe"] },
          { id: "git-bash", label: "Git Bash", kind: "bash" as const, commands: ["bash.exe", "bash"] }
        ]
      : [
          { id: "zsh", label: "zsh", kind: "zsh" as const, commands: ["zsh"] },
          { id: "bash", label: "bash", kind: "bash" as const, commands: ["bash"] },
          { id: "sh", label: "sh", kind: "sh" as const, commands: ["sh"] }
        ];

  const shells: TerminalShell[] = [];
  for (const candidate of candidates) {
    const executable = await findFirstExecutable(candidate.commands);
    shells.push({
      id: candidate.id,
      label: candidate.label,
      executableLabel: executable ?? candidate.commands[0],
      kind: candidate.kind,
      available: Boolean(executable),
      default: false
    });
  }
  const defaultShell = shells.find((shell) => shell.available && (process.platform === "win32" ? shell.id === "pwsh" : shell.id === path.basename(process.env.SHELL ?? ""))) ?? shells.find((shell) => shell.available);
  return shells.map((shell) => ({ ...shell, default: shell.id === defaultShell?.id }));
}

async function findFirstExecutable(commands: string[]) {
  for (const command of commands) {
    const found = Bun.which(command);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function resolveShellCommand(shell: TerminalShell) {
  return [shell.executableLabel];
}

function resolveTerminalCwd(projectRoot: string, cwd: string | undefined) {
  const resolvedRoot = path.resolve(projectRoot);
  const resolvedCwd = path.resolve(cwd?.trim() || resolvedRoot);
  const relative = path.relative(resolvedRoot, resolvedCwd);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Terminal cwd must stay inside the project root");
  }
  return resolvedCwd;
}

function normalizeTerminalEnv(input: TerminalEnvVar[] | undefined) {
  const env: Record<string, string | undefined> = {};
  for (const entry of input ?? []) {
    if (entry.value !== undefined) {
      env[entry.name] = entry.value;
    }
  }
  return env;
}

async function startTerminalProcess(input: {
  cmd: string[];
  cwd: string;
  cols: number;
  rows: number;
  env: Record<string, string | undefined>;
  onData: (chunk: Uint8Array) => void;
  onExit: (exitCode: number) => void;
}): Promise<TerminalProcess> {
  const env = buildCliProcessEnv({ cols: input.cols, rows: input.rows, extraEnv: input.env });
  if (process.platform !== "win32") {
    const proc = Bun.spawn(input.cmd, {
      cwd: input.cwd,
      env,
      terminal: {
        cols: input.cols,
        rows: input.rows,
        data: (_terminal, data) => input.onData(data)
      }
    });
    void proc.exited.then(input.onExit);
    const terminal = proc.terminal;
    if (!terminal) {
      throw new Error("Terminal PTY was not created");
    }
    return {
      pid: proc.pid,
      transportMode: "pty",
      write: (data) => {
        terminal.write(data);
      },
      resize: (cols, rows) => terminal.resize(cols, rows),
      stop: async () => {
        terminal.close();
        proc.kill();
        await proc.exited.catch(() => undefined);
      }
    };
  }

  const proc = Bun.spawn({
    cmd: input.cmd,
    cwd: input.cwd,
    env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe"
  });
  void consumePipe(proc.stdout, input.onData);
  void consumePipe(proc.stderr, input.onData);
  void proc.exited.then(input.onExit);
  return {
    pid: proc.pid,
    transportMode: "pipe",
    write: async (data) => {
      await proc.stdin.write(data);
    },
    resize: () => undefined,
    stop: async () => {
      proc.kill();
      await proc.exited.catch(() => undefined);
    }
  };
}

async function consumePipe(stream: ReadableStream<Uint8Array>, onData: (chunk: Uint8Array) => void) {
  const reader = stream.getReader();
  try {
    while (true) {
      const chunk = await readStreamChunk(reader);
      if (chunk.done) {
        return;
      }
      onData(chunk.value);
    }
  } finally {
    releaseStreamReaderLock(reader);
  }
}

async function readStreamChunk(reader: ReadableStreamDefaultReader<Uint8Array>) {
  try {
    return await reader.read();
  } catch (error) {
    if (isStreamReaderCancelledError(error)) {
      const done: { done: true; value: undefined } = { done: true, value: undefined };
      return done;
    }
    throw error;
  }
}

function releaseStreamReaderLock(reader: ReadableStreamDefaultReader<Uint8Array>) {
  try {
    reader.releaseLock();
  } catch (error) {
    if (!isStreamReaderCancelledError(error)) {
      throw error;
    }
  }
}

function isStreamReaderCancelledError(error: unknown) {
  return error instanceof Error && error.name === "AbortError" && error.message.includes("releaseLock");
}

function decodeTerminalOutputChunk(chunk: Uint8Array) {
  const decoded = looksLikeUtf16Le(chunk) ? TERMINAL_UTF16LE_DECODER.decode(chunk) : TERMINAL_UTF8_DECODER.decode(chunk);
  return stripTerminalNullPadding(decoded);
}

function looksLikeUtf16Le(chunk: Uint8Array) {
  if (chunk.byteLength < 4 || chunk.byteLength % 2 !== 0) {
    return false;
  }
  let oddSlots = 0;
  let oddZeros = 0;
  let evenZeros = 0;
  for (let index = 0; index < chunk.byteLength; index += 1) {
    if (index % 2 === 1) {
      oddSlots += 1;
      if (chunk[index] === 0) {
        oddZeros += 1;
      }
      continue;
    }
    if (chunk[index] === 0) {
      evenZeros += 1;
    }
  }
  return oddSlots > 0 && oddZeros / oddSlots >= 0.35 && oddZeros > evenZeros * 2;
}

function stripTerminalNullPadding(text: string) {
  const nullCount = text.match(/\u0000/g)?.length ?? 0;
  return nullCount > 0 && nullCount / text.length >= 0.2 ? text.replace(/\u0000/g, "") : text;
}

function trimScrollback(input: string, lineLimit: number) {
  if (input.length > MAX_SCROLLBACK_CHARS) {
    input = input.slice(-MAX_SCROLLBACK_CHARS);
  }
  const lines = input.split(/\r?\n/);
  return lines.length > lineLimit ? lines.slice(-lineLimit).join("\n") : input;
}

export const testExports = {
  consumePipe,
  decodeTerminalOutputChunk,
  isStreamReaderCancelledError,
  sendTerminalReplay
};
