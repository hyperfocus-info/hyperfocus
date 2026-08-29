import type { ClientCommand } from "@hyperfocus/ai-core/protocol";
import type { PendingBackgroundJobSource } from "./background-job-source-state";

type QueueOwnershipActions = {
  startAssistantWorkloadRequest: (assistantId: string, collection: "jobs" | "runs",
    request: { id: string; cursor?: string }) => void;
  startBackgroundJobSourceRequest: (request: PendingBackgroundJobSource) => void;
  restoreQueuedAssistantDetailRequest: (assistantId: string, requestId: string) => void;
  restoreQueuedPreflightOwnership: (command: ClientCommand) => void;
};

export function createControlCommandQueue(limit: number) {
  const commands: ClientCommand[] = [];
  let serverReady = false;
  return {
    markDisconnected() { serverReady = false; },
    markServerReady() { serverReady = true; },
    enqueue(command: ClientCommand, onSuperseded?: (command: ClientCommand) => void) {
      const supersededIndex = commands.findIndex((queued) => isSameTerminalOwner(queued, command));
      if (supersededIndex >= 0) {
        onSuperseded?.(commands[supersededIndex]!); commands.splice(supersededIndex, 1); commands.push(command); return true;
      }
      if (commands.length >= limit) return false;
      commands.push(command);
      return true;
    },
    flush(send: (command: ClientCommand) => boolean, onSent: (command: ClientCommand) => void) {
      while (serverReady && commands.length > 0) {
        const command = commands[0];
        if (!command || !send(command)) return;
        commands.shift();
        onSent(command);
      }
    },
    canSend() { return serverReady; },
    clear() { commands.length = 0; }
  };
}

function isSameTerminalOwner(left: ClientCommand, right: ClientCommand) {
  if (left.type === "terminal.session.attach" && right.type === left.type) return left.payload.sessionId === right.payload.sessionId;
  if (left.type === "terminal.session.restart" && right.type === left.type) return left.payload.sessionId === right.payload.sessionId;
  if (left.type === "cli-session.attach" && right.type === left.type) return left.payload.sessionId === right.payload.sessionId;
  return false;
}

export function restoreQueuedControlCommandOwnership(command: ClientCommand, actions: QueueOwnershipActions,
  terminal?: { ownSession: (sessionId: string, requestId: string) => void; ownCreating: (requestId: string) => void;
    ownCliSession?: (sessionId: string, requestId: string, projectId: string, threadId: string) => void;
    ownCliStart?: (requestId: string, projectId: string, threadId: string) => void }) {
  actions.restoreQueuedPreflightOwnership(command);
  if (command.type === "assistant.detail.get") actions.restoreQueuedAssistantDetailRequest(
    command.payload.assistantId, command.requestId);
  else if (command.type === "assistant.workloads.list") for (const collection of ["jobs", "runs"] as const) {
    const request = command.payload[collection];
    if (request) actions.startAssistantWorkloadRequest(command.payload.assistantId, collection,
      { id: command.requestId, cursor: request.cursor });
  }
  else if (command.type === "background-job.source.open") actions.startBackgroundJobSourceRequest(
    { ...command.payload, requestId: command.requestId });
  else if (command.type === "terminal.session.attach") terminal?.ownSession(command.payload.sessionId, command.requestId);
  else if (command.type === "terminal.session.create" || command.type === "terminal.session.restart") {
    terminal?.ownCreating(command.requestId);
  }
  else if (command.type === "cli-session.attach") terminal?.ownCliSession?.(
    command.payload.sessionId, command.requestId, command.payload.projectId, command.payload.threadId);
  else if (command.type === "cli-session.start") terminal?.ownCliStart?.(
    command.requestId, command.payload.projectId, command.payload.threadId);
}
