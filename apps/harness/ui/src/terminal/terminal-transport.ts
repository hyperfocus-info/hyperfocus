import { terminalStore } from "./terminal-store";
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";
import { HARNESS_SESSION_TOKEN_QUERY, readHarnessSessionToken } from "../transport/harness-session";

const sockets = new Map<string, WebSocket>();
const TERMINAL_HEARTBEAT = 0x00;
const TERMINAL_DATA = 0x01;
const TERMINAL_ATTACH_READY = 0x02;
const replayRetries = new Map<string, number>();
const attachRequests = new Map<string, string>();
const creatingAttachRequests = new Set<string>();
type CliAttachOwner = { requestId: string; projectId: string; threadId: string };
const cliAttachRequests = new Map<string, CliAttachOwner>();
const cliStartingRequests = new Map<string, Omit<CliAttachOwner, "requestId">>();
const MAX_REPLAY_RETRIES = 2;

export function ownsSessionSocket<T>(owners: Map<string, T>, sessionId: string, socket: T) {
  return owners.get(sessionId) === socket;
}

export function claimTerminalReplayRetry(sessionId: string) {
  const attempts = replayRetries.get(sessionId) ?? 0;
  if (attempts >= MAX_REPLAY_RETRIES) return false;
  replayRetries.set(sessionId, attempts + 1);
  return true;
}

export function resetTerminalReplayRetry(sessionId: string) { replayRetries.delete(sessionId); }

export function ownTerminalAttachRequest(sessionId: string, requestId: string) { attachRequests.set(sessionId, requestId); }
export function requestTerminalAttach(send: (command: ClientCommand) => boolean, input: {
  requestId: string; projectId: string; sessionId: string;
}) {
  if (!send({ type: "terminal.session.attach", requestId: input.requestId,
    payload: { projectId: input.projectId, sessionId: input.sessionId } })) return false;
  ownTerminalAttachRequest(input.sessionId, input.requestId); return true;
}
export function requestCliAttach(send: (command: ClientCommand) => boolean | void, input: {
  requestId: string; projectId: string; threadId: string; sessionId: string;
}) {
  if (send({ type: "cli-session.attach", requestId: input.requestId, payload: {
    projectId: input.projectId, threadId: input.threadId, sessionId: input.sessionId
  } }) === false) return false;
  ownCliAttachRequest(input.sessionId, input.requestId, input.projectId, input.threadId); return true;
}
export function ownCliStartingRequest(requestId: string, projectId: string, threadId: string) {
  cliStartingRequests.set(requestId, { projectId, threadId });
}
export function ownCliAttachRequest(sessionId: string, requestId: string, projectId: string, threadId: string) {
  cliAttachRequests.set(sessionId, { requestId, projectId, threadId });
}
export function revokeCliAttachRequest(requestId: string) {
  cliStartingRequests.delete(requestId);
  for (const [sessionId, current] of cliAttachRequests) if (current.requestId === requestId) cliAttachRequests.delete(sessionId);
}
export function acceptCliAttachRequest(input: { sessionId: string; requestId: string; projectId: string; threadId: string }) {
  const owner = cliAttachRequests.get(input.sessionId);
  if (owner?.requestId === input.requestId && owner.projectId === input.projectId && owner.threadId === input.threadId) {
    cliAttachRequests.delete(input.sessionId); return true;
  }
  const startingOwner = cliStartingRequests.get(input.requestId);
  if (!startingOwner || startingOwner.projectId !== input.projectId || startingOwner.threadId !== input.threadId) return false;
  cliStartingRequests.delete(input.requestId); return true;
}
export function rejectCliAttachRequest(requestId: string) {
  if (cliStartingRequests.delete(requestId)) return undefined;
  for (const [sessionId, current] of cliAttachRequests) if (current.requestId === requestId) {
    cliAttachRequests.delete(sessionId); return sessionId;
  }
  return undefined;
}
export function resetCliAttachRequests() {
  const sessionIds = [...cliAttachRequests.keys()]; cliAttachRequests.clear(); cliStartingRequests.clear();
  return sessionIds;
}
export function ownTerminalCreatingAttachRequest(requestId: string) { creatingAttachRequests.add(requestId); }
export function revokeTerminalAttachRequest(requestId: string) {
  creatingAttachRequests.delete(requestId);
  for (const [sessionId, current] of attachRequests) if (current === requestId) attachRequests.delete(sessionId);
}
export function acceptTerminalAttachRequest(sessionId: string, requestId: string) {
  const current = attachRequests.get(sessionId);
  if (current === requestId) { attachRequests.delete(sessionId); return true; }
  return !current && creatingAttachRequests.delete(requestId);
}
export function rejectTerminalAttachRequest(requestId: string) {
  if (creatingAttachRequests.delete(requestId)) return true;
  for (const [sessionId, current] of attachRequests) if (current === requestId) {
    attachRequests.delete(sessionId); terminalStore.setTransportStatus(sessionId, "replay-exhausted"); return true;
  }
  return false;
}

export function resetTerminalAttachRequests() {
  for (const sessionId of attachRequests.keys()) terminalStore.setTransportStatus(sessionId, "disconnected");
  attachRequests.clear(); creatingAttachRequests.clear();
}

export function prepareManualTerminalReconnect(sessionId: string) {
  resetTerminalReplayRetry(sessionId);
  terminalStore.setTransportStatus(sessionId, "connecting");
}

export function openTerminalSocket(controlEndpoint: string, sessionId: string, clientId: string, token: string,
  onReplayExpired?: () => void) {
  closeTerminalSocket(sessionId);
  const url = new URL(controlEndpoint);
  url.pathname = "/ws/terminal";
  url.searchParams.set("clientId", clientId);
  url.searchParams.set("token", token);
  url.searchParams.set(HARNESS_SESSION_TOKEN_QUERY, readHarnessSessionToken());

  const socket = new WebSocket(url);
  terminalStore.setTransportStatus(sessionId, "connecting");
  socket.binaryType = "arraybuffer";
  socket.addEventListener("open", () => undefined);
  socket.addEventListener("message", (event) => {
    if (!ownsSessionSocket(sockets, sessionId, socket)) return;
    if (!(event.data instanceof ArrayBuffer)) {
      return;
    }
    const frame = new Uint8Array(event.data);
    if (frame[0] === TERMINAL_HEARTBEAT) {
      socket.send(new Uint8Array([TERMINAL_HEARTBEAT]));
      return;
    }
    if (frame[0] === TERMINAL_ATTACH_READY) {
      resetTerminalReplayRetry(sessionId);
      terminalStore.setTransportStatus(sessionId, "connected");
      return;
    }
    if (frame[0] === TERMINAL_DATA) {
      terminalStore.appendOutput(sessionId, new TextDecoder().decode(frame.slice(1)));
    }
  });
  socket.addEventListener("close", (event) => {
    if (!ownsSessionSocket(sockets, sessionId, socket)) return;
    sockets.delete(sessionId);
    if (event.code === 4001 && claimTerminalReplayRetry(sessionId)) {
      terminalStore.setTransportStatus(sessionId, "replay-retrying"); onReplayExpired?.();
    } else terminalStore.setTransportStatus(sessionId, event.code === 4001 ? "replay-exhausted" : "disconnected");
  });
  sockets.set(sessionId, socket);
}

export function sendTerminalInput(sessionId: string, input: string | Uint8Array) {
  const socket = sockets.get(sessionId);
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

export function closeTerminalSocket(sessionId: string) {
  const socket = sockets.get(sessionId);
  if (!socket) {
    return;
  }
  socket.close();
  if (ownsSessionSocket(sockets, sessionId, socket)) {
    sockets.delete(sessionId);
    terminalStore.setTransportStatus(sessionId, "disconnected");
  }
}

export function closeAllTerminalSockets() {
  for (const sessionId of sockets.keys()) {
    closeTerminalSocket(sessionId);
  }
}
