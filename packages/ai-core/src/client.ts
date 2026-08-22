import {
  createRequestId,
  parseClientCommand,
  parseServerEventFrame,
  type AgentOption,
  type ClientCommand,
  type ServerEvent,
  type WorkspaceState
} from "./harness/protocol";

export type HarnessConnectionState = "idle" | "connecting" | "connected" | "disconnected" | "error";

export type HarnessClientSnapshot = {
  state: HarnessConnectionState;
  workspace?: WorkspaceState;
  agents: readonly AgentOption[];
  error?: string;
};

export type HarnessClientOptions = {
  endpoint: string;
  WebSocket?: typeof globalThis.WebSocket;
};

export type SendChatInput = {
  content: string;
  projectId?: string;
  threadId?: string;
  agentId?: "pi" | "copilot-cli" | "codex-cli";
  modeId?: string;
  executionModelId?: string;
  reasoningStrength?: "low" | "medium" | "high" | "extra-high";
};

/** Converts an HTTP origin or websocket URL to the harness control endpoint. */
export function normalizeHarnessEndpoint(input: string) {
  const value = input.trim();
  if (!value) throw new Error("Harness endpoint is required");
  const withProtocol = /^[a-z]+:\/\//i.test(value) ? value : `http://${value}`;
  const url = new URL(withProtocol);
  if (url.protocol === "http:") url.protocol = "ws:";
  else if (url.protocol === "https:") url.protocol = "wss:";
  else if (url.protocol !== "ws:" && url.protocol !== "wss:") throw new Error("Harness endpoint must use HTTP(S) or WS(S)");
  url.pathname = "/ws";
  url.search = "";
  url.hash = "";
  return url.toString();
}

/** Creates a small transport client without Solid, persistence, or UI coupling. */
export function createHarnessClient(options: HarnessClientOptions) {
  const WebSocketImplementation = options.WebSocket ?? globalThis.WebSocket;
  if (!WebSocketImplementation) throw new Error("WebSocket is not available in this environment");

  let snapshot: HarnessClientSnapshot = { state: "idle", agents: [] };
  let socket: WebSocket | undefined;
  const snapshotListeners = new Set<(next: HarnessClientSnapshot) => void>();
  const eventListeners = new Set<(event: ServerEvent) => void>();

  const publish = (next: HarnessClientSnapshot) => {
    snapshot = next;
    for (const listener of snapshotListeners) listener(snapshot);
  };

  const acceptEvent = (event: ServerEvent) => {
    if (event.type === "connection.ready") {
      publish({ state: "connected", workspace: event.payload.workspace, agents: event.payload.agents });
    } else if (event.type === "workspace.updated") {
      publish({ ...snapshot, workspace: event.payload.workspace });
    }
    for (const listener of eventListeners) listener(event);
  };

  return {
    connect() {
      if (socket && (socket.readyState === WebSocketImplementation.OPEN || socket.readyState === WebSocketImplementation.CONNECTING)) return;
      publish({ ...snapshot, state: "connecting", error: undefined });
      socket = new WebSocketImplementation(normalizeHarnessEndpoint(options.endpoint));
      socket.addEventListener("message", (message) => {
        try {
          const frame = typeof message.data === "string" ? JSON.parse(message.data) : message.data;
          for (const event of parseServerEventFrame(frame)) acceptEvent(event);
        } catch (error) {
          publish({ ...snapshot, state: "error", error: error instanceof Error ? error.message : "Invalid harness event" });
        }
      });
      socket.addEventListener("close", () => publish({ ...snapshot, state: "disconnected" }));
      socket.addEventListener("error", () => publish({ ...snapshot, state: "error", error: "Could not connect to the local harness" }));
    },
    disconnect() {
      socket?.close();
      socket = undefined;
      publish({ ...snapshot, state: "disconnected" });
    },
    send(command: ClientCommand) {
      const parsed = parseClientCommand(command);
      if (!socket || socket.readyState !== WebSocketImplementation.OPEN) throw new Error("Harness is not connected");
      socket.send(JSON.stringify(parsed));
    },
    sendChat(input: SendChatInput) {
      const projectId = input.projectId ?? snapshot.workspace?.activeProjectId;
      const project = snapshot.workspace?.projects.find((candidate) => candidate.id === projectId);
      const threadId = input.threadId ?? project?.activeThreadId;
      if (!projectId || !threadId) throw new Error("Open a project and thread in the harness before sending editor chat");
      this.send({
        type: "chat.send",
        requestId: createRequestId(),
        payload: {
          projectId,
          threadId,
          agentId: input.agentId ?? "codex-cli",
          content: input.content,
          modeId: input.modeId,
          executionModelId: input.executionModelId,
          reasoningStrength: input.reasoningStrength
        }
      });
    },
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener: (next: HarnessClientSnapshot) => void) {
      snapshotListeners.add(listener);
      listener(snapshot);
      return () => snapshotListeners.delete(listener);
    },
    onEvent(listener: (event: ServerEvent) => void) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    }
  };
}

