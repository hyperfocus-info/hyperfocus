import { createRequestId, createSessionId, type CliAttachToken, type CliSession, type ProjectId, type ThreadId } from "@hyperfocus/ai-core/protocol";
import type { WorkspaceRuntimeStore } from "../workspace-runtime-store";
import type { AgentRuntime } from "./agent-runtime";
import { createSecureToken } from "./cli-health";
import { createAttachTokenStore } from "../server/transport/attach-ownership";
import { createCliProcessManager, type CliProcessManager, type InteractiveCliProcess } from "./cli-process-manager";
import { cancelStreamPumps, createStreamPump, DEFAULT_STREAM_MAX_QUEUED_BYTES, drainStreamPumps, type StreamPump } from "../stream-pump";
import { guardedWebsocketSend } from "../websocket-send-guard";

export const STREAM_HEARTBEAT = 0x00;
const STREAM_STDOUT = 0x01;
const STREAM_STDERR = 0x02;
const ATTACH_TOKEN_TTL_MS = 30_000;
const DEFAULT_INTERACTIVE_IDLE_TIMEOUT_MS = 1800000;
const PTY_HEARTBEAT_INTERVAL_MS = 15_000;
const PTY_STALE_TIMEOUT_MS = 30_000;
const PTY_STREAM_FLUSH_MS = 50;
const PTY_STREAM_MAX_BUFFERED_BYTES = 8192;
const PTY_SEND_QUEUE_CAP_BYTES = 262144;
const CLI_SESSION_METADATA_THROTTLE_MS = 500;

type SessionRecord = {
  runtime: AgentRuntime;
  process: InteractiveCliProcess;
  session: CliSession;
  attachedClientId?: string;
  attachedSocket?: Bun.ServerWebSocket<{ clientId: string; kind: "control" | "pty" | "terminal"; sessionId?: string }>;
  ptyHeartbeatTimer?: ReturnType<typeof setInterval>;
  lastPtyPongAt?: number;
  metadataUpdateTimer?: ReturnType<typeof setTimeout>;
  metadataUpdatePending?: boolean;
  terminalPumps?: Partial<Record<"stdout" | "stderr", StreamPump>>;
  stderrTail: string;
  visibleBuffer?: string;
};

type AttachTokenRecord = CliAttachToken & {
  projectId: ProjectId;
  threadId: ThreadId;
};

type CliSessionManagerOptions = {
  runtimeStore: WorkspaceRuntimeStore;
  onSessionStarted: (input: { requestId: string; projectId: ProjectId; threadId: ThreadId; session: CliSession }) => void;
  onSessionUpdated: (input: { requestId: string; projectId: ProjectId; threadId: ThreadId; session: CliSession }) => void;
  onSessionExited: (input: { requestId: string; projectId: ProjectId; threadId: ThreadId; session: CliSession }) => void;
  onAttachReady: (input: {
    requestId: string;
    projectId: ProjectId;
    threadId: ThreadId;
    sessionId: string;
    attachToken: CliAttachToken;
    connectionId: string;
  }) => void;
  onWriteFailed?: (input: { requestId: string; projectId: ProjectId; threadId: ThreadId; session: CliSession; error: unknown }) => void;
};

export function createCliSessionManager(options: CliSessionManagerOptions) {
  const processManager = createCliProcessManager();
  const sessions = new Map<string, SessionRecord>();
  const attachTokens = createAttachTokenStore<AttachTokenRecord>();
  const sessionKeyToId = new Map<string, string>();
  const {
    handleChunk,
    handleExit,
    markWriteFailed,
    requireSession,
    getOwnedSession,
    requireOwnedSession,
    cancelPendingSessionUpdate,
  } = createCliSessionManagerInternals(options, sessions, sessionKeyToId);

  const startSession = createCliSessionStarter({
    options, processManager, sessions, sessionKeyToId,
    handleChunk, handleExit, issueAttachToken: (input) => issueCliAttachToken(attachTokens, input), stopSession
  });
  async function stopSession(input: { projectId: ProjectId; threadId: ThreadId; sessionId: string }) {
    const record = getOwnedSession(input);
    if (!record) {
      return;
    }

    cancelPendingSessionUpdate(record);
    record.session = {
      ...record.session,
      status: "stopped",
      updatedAt: new Date().toISOString()
    };
    options.runtimeStore.setProjectCliSession(input.projectId, record.session);
    options.onSessionUpdated({
      requestId: createRequestId(),
      projectId: input.projectId,
      threadId: input.threadId,
      session: record.session
    });
    await record.process.stop();
  }

  function resizeSession(input: { requestId: string; projectId: ProjectId; threadId: ThreadId; sessionId: string; cols: number; rows: number }) {
    requireOwnedSession(input);
    throw new Error("CLI session resize is not supported by the current transport");
  }

  function attachSession(input: { requestId: string; projectId: ProjectId; threadId: ThreadId; sessionId: string; clientId: string; connectionId?: string }) {
    requireOwnedSession(input);
    const attachToken = issueCliAttachToken(attachTokens, {
      sessionId: input.sessionId,
      projectId: input.projectId,
      threadId: input.threadId,
      clientId: input.clientId
    });
    options.onAttachReady({
      requestId: input.requestId, projectId: input.projectId, threadId: input.threadId,
      sessionId: input.sessionId, attachToken,
      connectionId: input.connectionId ?? input.clientId
    });
  }

  function captureVisibleBuffer(input: { projectId: ProjectId; threadId: ThreadId; sessionId: string; visibleBuffer: string; stderrTail?: string }) {
    const record = requireOwnedSession(input);
    record.visibleBuffer = input.visibleBuffer;
    if (input.stderrTail) {
      record.stderrTail = input.stderrTail.slice(-32_000);
    }
    options.runtimeStore.setThreadCapturedCliContext(record.session.projectId, record.session.threadId, {
      sessionId: record.session.id,
      capturedAt: new Date().toISOString(),
      visibleBuffer: input.visibleBuffer,
      stderrTail: input.stderrTail
    });
  }

  function consumeAttachToken(token: string, clientId: string) {
    return attachTokens.consume(token, clientId);
  }

  function invalidateClientAttachTokens(clientId: string) {
    attachTokens.invalidateClient(clientId);
  }

  function attachSocket(input: {
    sessionId: string;
    clientId: string;
    socket: Bun.ServerWebSocket<{ clientId: string; kind: "control" | "pty" | "terminal"; sessionId?: string }>;
  }) {
    const record = requireSession(input.sessionId);
    cancelPendingSessionUpdate(record);
    cancelPtyTransport(record);
    record.attachedClientId = input.clientId;
    record.attachedSocket = input.socket;
    record.lastPtyPongAt = Date.now();
    record.session = {
      ...record.session,
      attachState: "attached",
      updatedAt: new Date().toISOString()
    };
    options.runtimeStore.setProjectCliSession(record.session.projectId, record.session);
    options.onSessionUpdated({
      requestId: createRequestId(),
      projectId: record.session.projectId,
      threadId: record.session.threadId,
      session: record.session
    });
    startCliPtyHeartbeat(record, detachSocket);
  }

  function detachSocket(sessionId: string) {
    const record = sessions.get(sessionId);
    if (!record) {
      return;
    }

    cancelPendingSessionUpdate(record);
    cancelPtyTransport(record);
    record.session = {
      ...record.session,
      attachState: "detached",
      updatedAt: new Date().toISOString()
    };
    options.runtimeStore.setProjectCliSession(record.session.projectId, record.session);
    options.onSessionUpdated({
      requestId: createRequestId(),
      projectId: record.session.projectId,
      threadId: record.session.threadId,
      session: record.session
    });
  }

  function detachClient(clientId: string) {
    invalidateClientAttachTokens(clientId);
    for (const record of sessions.values()) {
      if (record.attachedClientId === clientId) {
        detachSocket(record.session.id);
      }
    }
  }

  function recordPtyPong(sessionId: string, clientId: string) {
    const record = sessions.get(sessionId);
    if (!record || record.attachedClientId !== clientId) {
      return false;
    }
    record.lastPtyPongAt = Date.now();
    return true;
  }

  async function writeToSession(sessionId: string, data: Uint8Array) {
    const record = requireSession(sessionId);
    try {
      await record.process.write(data);
    } catch (error) {
      markWriteFailed(record, error);
      throw error;
    }
  }

  function getSession(sessionId: string) {
    return sessions.get(sessionId)?.session;
  }

  function getCapturedContext(sessionId: string) {
    const record = sessions.get(sessionId);
    if (!record?.visibleBuffer) {
      return undefined;
    }

    return {
      sessionId,
      visibleBuffer: record.visibleBuffer,
      stderrTail: record.stderrTail
    };
  }

  return {
    startSession,
    stopSession,
    resizeSession,
    attachSession,
    captureVisibleBuffer,
    consumeAttachToken,
    invalidateClientAttachTokens,
    attachSocket,
    detachSocket,
    detachClient,
    recordPtyPong,
    writeToSession,
    getSession,
    getCapturedContext
  };
}

export type CliSessionManager = ReturnType<typeof createCliSessionManager>;

function createCliSessionStarter(input: {
  options: CliSessionManagerOptions;
  processManager: CliProcessManager;
  sessions: Map<string, SessionRecord>;
  sessionKeyToId: Map<string, string>;
  handleChunk: (sessionId: string, stream: "stdout" | "stderr", chunk: Uint8Array) => void;
  handleExit: (sessionId: string, exitCode: number) => Promise<void>;
  issueAttachToken: (input: { sessionId: string; projectId: ProjectId; threadId: ThreadId; clientId: string }) => AttachTokenRecord;
  stopSession: (input: { projectId: ProjectId; threadId: ThreadId; sessionId: string }) => Promise<void>;
}) {
  const { options, processManager, sessions, sessionKeyToId, handleChunk, handleExit, issueAttachToken, stopSession } = input;
  async function startSession(input: {
    requestId: string;
    projectId: ProjectId;
    threadId: ThreadId;
    agentRuntime: AgentRuntime;
    cwd: string;
    cols: number;
    rows: number;
    prompt?: string;
    runId?: string;
    clientId: string;
    connectionId?: string;
  }) {
    const existingSessionId = sessionKeyToId.get(getSessionKey(input.projectId, input.threadId, input.agentRuntime.id));
    if (existingSessionId) {
      await stopSession({
        projectId: input.projectId,
        threadId: input.threadId,
        sessionId: existingSessionId
      });
    }

    const launch = input.agentRuntime.buildInteractiveLaunch?.({
      cwd: input.cwd,
      cols: input.cols,
      rows: input.rows,
      prompt: input.prompt
    });
    if (!launch) {
      throw new Error(`${input.agentRuntime.label} does not support interactive sessions`);
    }

    const sessionId = createSessionId();
    const now = new Date().toISOString();
    const session: CliSession = {
      id: sessionId,
      projectId: input.projectId,
      threadId: input.threadId,
      runId: input.runId,
      agentId: input.agentRuntime.id,
      cwd: input.cwd,
      status: "starting",
      cols: input.cols,
      rows: input.rows,
      attachState: "detached",
      idleTimeoutMs: DEFAULT_INTERACTIVE_IDLE_TIMEOUT_MS,
      startedAt: now,
      updatedAt: now
    };

    const process = processManager.startInteractive({
      cmd: launch.cmd,
      cwd: input.cwd,
      cols: input.cols,
      rows: input.rows,
      env: launch.env,
      onStdout: (chunk) => handleChunk(sessionId, "stdout", chunk),
      onStderr: (chunk) => handleChunk(sessionId, "stderr", chunk),
      onExit: (exitCode) => {
        void handleExit(sessionId, exitCode);
      }
    });

    const record: SessionRecord = {
      runtime: input.agentRuntime,
      process,
      session: {
        ...session,
        status: "running"
      },
      stderrTail: ""
    };

    sessions.set(sessionId, record);
    sessionKeyToId.set(getSessionKey(input.projectId, input.threadId, input.agentRuntime.id), sessionId);
    options.runtimeStore.setProjectCliSession(input.projectId, record.session);
    options.onSessionStarted({
      requestId: input.requestId,
      projectId: input.projectId,
      threadId: input.threadId,
      session: record.session
    });

    const attachToken = issueAttachToken({
      sessionId,
      projectId: input.projectId,
      threadId: input.threadId,
      clientId: input.clientId
    });
    options.onAttachReady({
      requestId: input.requestId, projectId: input.projectId, threadId: input.threadId,
      sessionId, attachToken,
      connectionId: input.connectionId ?? input.clientId
    });

    return record.session;
  }

  return startSession;
}
function createCliSessionManagerInternals(
  options: CliSessionManagerOptions,
  sessions: Map<string, SessionRecord>,
  sessionKeyToId: Map<string, string>
) {
  function handleChunk(sessionId: string, stream: "stdout" | "stderr", chunk: Uint8Array) {
    const record = sessions.get(sessionId);
    if (!record) {
      return;
    }

    const now = new Date().toISOString();
    record.session = {
      ...record.session,
      updatedAt: now,
      lastStdoutAt: stream === "stdout" ? now : record.session.lastStdoutAt,
      lastStderrAt: stream === "stderr" ? now : record.session.lastStderrAt
    };
    if (stream === "stderr") {
      record.stderrTail = `${record.stderrTail}${new TextDecoder().decode(chunk)}`.slice(-32_000);
    }
    scheduleSessionUpdate(record);

    const socket = record.attachedSocket;
    if (!socket) {
      return;
    }

    const pump = getTerminalPump(record, stream);
    pump.push(new TextDecoder().decode(normalizeTerminalChunk(chunk)));
  }

  async function handleExit(sessionId: string, exitCode: number) {
    const record = sessions.get(sessionId);
    if (!record) {
      return;
    }

    flushPendingSessionUpdate(record);
    const drainErrors = await drainPtyTransport(record);
    const now = new Date().toISOString();
    record.session = {
      ...record.session,
      status: exitCode === 0 && drainErrors.length === 0 ? "exited" : "failed",
      attachState: "detached",
      exitCode,
      exitedAt: now,
      updatedAt: now
    };
    options.runtimeStore.setProjectCliSession(record.session.projectId, record.session);
    options.onSessionExited({
      requestId: createRequestId(),
      projectId: record.session.projectId,
      threadId: record.session.threadId,
      session: record.session
    });
    sessionKeyToId.delete(getSessionKey(record.session.projectId, record.session.threadId, record.session.agentId));
    sessions.delete(sessionId);
  }

  function markWriteFailed(record: SessionRecord, error: unknown) {
    const now = new Date().toISOString();
    cancelPendingSessionUpdate(record);
    cancelPtyTransport(record);
    record.session = {
      ...record.session,
      status: "failed",
      attachState: "detached",
      exitedAt: now,
      updatedAt: now
    };
    options.runtimeStore.setProjectCliSession(record.session.projectId, record.session);
    const event = {
      requestId: createRequestId(),
      projectId: record.session.projectId,
      threadId: record.session.threadId,
      session: record.session
    };
    options.onSessionUpdated(event);
    options.onWriteFailed?.({
      ...event,
      error
    });
  }

  function requireSession(sessionId: string) {
    const record = sessions.get(sessionId);
    if (!record) {
      throw new Error(`Unknown CLI session: ${sessionId}`);
    }

    return record;
  }

  function getOwnedSession(input: { projectId: ProjectId; threadId: ThreadId; sessionId: string }) {
    const record = sessions.get(input.sessionId);
    if (!record) {
      return undefined;
    }

    if (record.session.projectId !== input.projectId || record.session.threadId !== input.threadId) {
      throw new Error(`CLI session ${input.sessionId} belongs to another thread`);
    }

    return record;
  }

  function requireOwnedSession(input: { projectId: ProjectId; threadId: ThreadId; sessionId: string }) {
    const record = getOwnedSession(input);
    if (!record) {
      throw new Error(`Unknown CLI session: ${input.sessionId}`);
    }

    return record;
  }

  function getTerminalPump(record: SessionRecord, stream: "stdout" | "stderr") {
    record.terminalPumps ??= {};
    const socket = record.attachedSocket;
    record.terminalPumps[stream] ??= createStreamPump({
      flushIntervalMs: PTY_STREAM_FLUSH_MS,
      maxBufferedBytes: PTY_STREAM_MAX_BUFFERED_BYTES, maxQueuedBytes: DEFAULT_STREAM_MAX_QUEUED_BYTES,
      onFlush: (text) => sendTerminalFrame(socket, stream, text), onError: () => { void record.process.stop().catch(() => undefined); }
    });
    return record.terminalPumps[stream];
  }

  function scheduleSessionUpdate(record: SessionRecord) {
    record.metadataUpdatePending = true;
    if (record.metadataUpdateTimer) {
      return;
    }
    record.metadataUpdateTimer = setTimeout(() => {
      record.metadataUpdateTimer = undefined;
      if (!record.metadataUpdatePending) {
        return;
      }
      record.metadataUpdatePending = false;
      emitSessionUpdated(record);
    }, CLI_SESSION_METADATA_THROTTLE_MS);
  }

  function cancelPendingSessionUpdate(record: SessionRecord) {
    if (record.metadataUpdateTimer) {
      clearTimeout(record.metadataUpdateTimer);
      record.metadataUpdateTimer = undefined;
    }
    record.metadataUpdatePending = false;
  }

  function flushPendingSessionUpdate(record: SessionRecord) {
    if (!record.metadataUpdatePending) {
      cancelPendingSessionUpdate(record);
      return;
    }

    cancelPendingSessionUpdate(record);
    emitSessionUpdated(record);
  }

  function emitSessionUpdated(record: SessionRecord) {
    options.runtimeStore.setProjectCliSession(record.session.projectId, record.session);
    options.onSessionUpdated({
      requestId: createRequestId(),
      projectId: record.session.projectId,
      threadId: record.session.threadId,
      session: record.session
    });
  }

  return {
    handleChunk,
    handleExit,
    markWriteFailed,
    requireSession,
    getOwnedSession,
    requireOwnedSession,
    getTerminalPump,
    scheduleSessionUpdate,
    cancelPendingSessionUpdate,
    flushPendingSessionUpdate
  };
}

function issueCliAttachToken(
  attachTokens: ReturnType<typeof createAttachTokenStore<AttachTokenRecord>>,
  input: { sessionId: string; projectId: ProjectId; threadId: ThreadId; clientId: string }
) {
  const token: AttachTokenRecord = {
    token: createSecureToken(),
    sessionId: input.sessionId,
    projectId: input.projectId,
    threadId: input.threadId,
    clientId: input.clientId,
    expiresAt: new Date(Date.now() + ATTACH_TOKEN_TTL_MS).toISOString()
  };
  attachTokens.issue(token);
  return token;
}

function startCliPtyHeartbeat(record: SessionRecord, detachSocket: (sessionId: string) => void) {
  if (record.ptyHeartbeatTimer) clearInterval(record.ptyHeartbeatTimer);
  record.ptyHeartbeatTimer = setInterval(() => {
    const socket = record.attachedSocket;
    if (!socket || !record.attachedClientId) return;
    if (Date.now() - (record.lastPtyPongAt ?? 0) > PTY_STALE_TIMEOUT_MS) {
      socket.close(4000, "PTY heartbeat missed");
      detachSocket(record.session.id);
      return;
    }
    guardedWebsocketSend(socket, new Uint8Array([STREAM_HEARTBEAT]), { maxQueuedBytes: PTY_SEND_QUEUE_CAP_BYTES });
  }, PTY_HEARTBEAT_INTERVAL_MS);
}

function cancelPtyTransport(record: SessionRecord) {
  cancelStreamPumps(takePtyTransport(record));
}

async function drainPtyTransport(record: SessionRecord) {
  return drainStreamPumps(takePtyTransport(record));
}

function takePtyTransport(record: SessionRecord) {
  clearPtyHeartbeat(record);
  const pumps = Object.values(record.terminalPumps ?? {});
  clearPtyTransportReferences(record);
  return pumps;
}

function clearPtyHeartbeat(record: SessionRecord) {
  if (record.ptyHeartbeatTimer) clearInterval(record.ptyHeartbeatTimer);
  record.ptyHeartbeatTimer = undefined;
}

function clearPtyTransportReferences(record: SessionRecord) {
  record.terminalPumps = undefined; record.attachedSocket = undefined;
  record.attachedClientId = undefined; record.lastPtyPongAt = undefined;
}

function sendTerminalFrame(socket: SessionRecord["attachedSocket"], stream: "stdout" | "stderr", text: string) {
  if (!socket) return;
  const payload = new TextEncoder().encode(text), frame = new Uint8Array(payload.length + 1);
  frame[0] = stream === "stdout" ? STREAM_STDOUT : STREAM_STDERR; frame.set(payload, 1);
  guardedWebsocketSend(socket, frame, { maxQueuedBytes: PTY_SEND_QUEUE_CAP_BYTES });
}

function getSessionKey(projectId: ProjectId, threadId: ThreadId, agentId: string) {
  return [projectId, threadId, agentId].join(":");
}

function normalizeTerminalChunk(chunk: Uint8Array) {
  const normalized = new TextDecoder().decode(chunk).replace(/(?<!\r)\n/g, "\r\n");
  return new TextEncoder().encode(normalized);
}
