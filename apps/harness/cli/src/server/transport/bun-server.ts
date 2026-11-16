import { STREAM_HEARTBEAT } from "../../agent-runtimes/cli-session-manager";
import { encodeValue, readValueFrame } from "@hyperfocus/serialization";
import { LOG_COMMAND_ERRORS, handleCommand } from "../commands/router";
import { DEV_UI_LIVE_RELOAD_ENDPOINT } from "../core/constants";
import type { HarnessConnection, HarnessHandlerRefs, HarnessServerState, HarnessWebSocketOptions } from "../core/contracts";
import { controlEventBatcher, emitSetupUpdatedToAll, sendEvent } from "./events";
import { getPreferencesState } from "../workspace/preferences";
import { discoverSkillPathsForActiveProject, loadBoundedWorkspaceState } from "../workspace/project-events";
import { shrinkWorkspaceBootstrap } from "../workspace/workspace-bootstrap";
import { failLiveBackgroundRunsOnShutdown, stopLiveProjectRunsOnShutdown } from "../runtime/background-run-lifecycle";
import { refreshHarnessSetupState } from "../runtime/server-startup";
import { createUiAssetResponse } from "../runtime/ui-serving";
import { isPreflightDecisionRequiredError } from "../execution/preflight";
import { drainBrowserApprovalRuntimeRecovery } from "../execution/browser-approval-waiters";
import { getCommandRejectionCode, sendCommandRejected } from "./command-rejection";
import { TERMINAL_STREAM_HEARTBEAT } from "../../terminal/terminal-session-manager";
import { withWebsocketCompression } from "../../websocket-send-guard";
import { defaultAgentCatalog } from "@hyperfocus/ai-core/agent-catalog";
import { HARNESS_APP_VERSION } from "@hyperfocus/ai-core/app-version";
import { getClientCommandRejectionMetadata, parseClientCommand, SERVER_EVENT_EMIT_MAX_BYTES, SERVER_EVENT_FRAME_MAX_BYTES, type ServerEvent } from "@hyperfocus/ai-core/protocol";
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";
import { createClientLeaseController, resolveDesktopTarget } from "@hyperfocus/desktop-runtime";
import { stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { authorizePrivilegedRequest } from "./request-admission";
import { createSwarmProxyHandler } from "@hyperfocus/ai-runtime/swarm/client";
import { saveSwarmRunMemory } from "../../memory-bank";

const inFlightCommandsByState = new WeakMap<HarnessServerState, Set<Promise<void>>>();

export const desktopOpenRequestSchema = z.object({
  target: z.string().trim().min(1).max(32_768)
});

/** An explicitly configured coordinator alias still requires an opened local
 * project at that exact root. Live and archived monitors use the same mapping;
 * neither an arbitrary remote ID nor an unopened filesystem path grants access. */
export function resolveSwarmProxyProject<T extends { id: string; rootPath: string }>(
  projects: readonly T[], projectId: string, environment: Readonly<Record<string, string | undefined>> = process.env
): T | undefined {
  const configuredId = environment.HYPERFOCUS_SWARM_PROJECT_ID;
  const configuredRoot = environment.HYPERFOCUS_SWARM_PROJECT_ROOT;
  if (configuredId && configuredRoot) {
    const normalize = (value: string) => process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value);
    const project = projects.find(value => normalize(value.rootPath) === normalize(configuredRoot) && (value.id === projectId || configuredId === projectId));
    return project ? { ...project, id: configuredId } : undefined;
  }
  return projects.find(project => project.id === projectId);
}

export function createHarnessHandlerRefs(
  state: HarnessServerState,
  options: { derivedProgressHeartbeatMs: number }
): HarnessHandlerRefs {
  const getPreferences = () => getPreferencesState(state.repository, state.adapter, state.runtimeRegistry);
  return {
    routes: undefined,
    fetch: createHarnessFetchHandler(state),
    websocket: createHarnessWebSocketHandlers(state, options, getPreferences)
  };
}

function createHarnessFetchHandler(state: HarnessServerState): HarnessHandlerRefs["fetch"] {
  const handleSwarm = createSwarmProxyHandler({
    resolveProject: async (projectId) => resolveSwarmProxyProject(state.runtime.getWorkspace().projects, projectId),
    onDisposition: (run) => { saveSwarmRunMemory(state.repository, run); },
  });
  return async (request, serverInstance) => {
const url = new URL(request.url);

if (url.pathname.startsWith("/api/swarm/v1/")) {
  const admission = authorizePrivilegedRequest({ request, sessionToken: state.sessionToken, tokenSource: "header" });
  if (!admission.allowed) return admission.response;
  return await handleSwarm(request) ?? new Response("Swarm route not found", { status: 404 });
}

if (url.pathname === "/api/desktop/v1/status" && isLoopbackRequest(serverInstance, request)) {
  if (request.headers.get("origin")) {
    return new Response("Desktop status requires a local native request", { status: 403 });
  }
  return Response.json(
    { app: "hyperfocus-harness", version: HARNESS_APP_VERSION, sessionToken: state.sessionToken },
    { headers: { "cache-control": "no-store" } }
  );
}

if (url.pathname === "/api/desktop/v1/open" && isLoopbackRequest(serverInstance, request)) {
  const admission = authorizePrivilegedRequest({
    request,
    sessionToken: state.sessionToken,
    tokenSource: "header"
  });
  if (!admission.allowed) return admission.response;
  if (request.method !== "POST" || admission.clientKind !== "native") {
    return new Response("Desktop IDE open requires a local native POST", { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return new Response("Desktop IDE open requires JSON", { status: 415 });
  }
  try {
    const command = desktopOpenRequestSchema.parse(await request.json());
    const resolved = await resolveDesktopTarget({
      target: command.target,
      projectRoots: state.runtime.getWorkspace().projects.map((project) => project.rootPath),
      fileSystem: { stat }
    });
    const existingProject = state.runtime
      .getWorkspace()
      .projects.find((project) => path.resolve(project.rootPath) === path.resolve(resolved.projectRoot));
    let projectId: string;
    if (existingProject) {
      state.repository.activateProject(existingProject.id);
      state.runtime.setActiveProject(existingProject.id);
      projectId = existingProject.id;
    } else {
      const opened = state.repository.openProject(resolved.projectRoot);
      state.runtime.upsertPersistedProject(opened.project);
      state.runtime.setActiveProject(opened.project.id);
      projectId = opened.project.id;
    }
    state.currentSetupState = await refreshHarnessSetupState({
      adapter: state.adapter,
      repository: state.repository,
      runtimeRegistry: state.runtimeRegistry,
      runtime: state.runtime,
      launchMode: state.launchMode
    });
    const launchUrl = new URL("/", url.origin);
    launchUrl.searchParams.set("ideProject", projectId);
    if (resolved.filePath) {
      launchUrl.searchParams.set("ideFile", resolved.filePath);
    }
    return Response.json({
      url: launchUrl.href,
      projectId,
      kind: resolved.kind
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Unable to open IDE target", { status: 400 });
  }
}

if (url.pathname === "/api/uploadthing") {
  const admission = authorizePrivilegedRequest({
    request,
    sessionToken: state.sessionToken,
    tokenSource: "header"
  });
  if (!admission.allowed) return admission.response;
  return state.uploadthingHandler(request);
}

if (url.pathname === "/ws" && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
  const admission = authorizePrivilegedRequest({
    request,
    sessionToken: state.sessionToken,
    tokenSource: "query"
  });
  if (!admission.allowed) return admission.response;
  const upgraded = serverInstance.upgrade(request, {
    data: {
      clientId: crypto.randomUUID(),
      connectionId: crypto.randomUUID(),
      clientKind: admission.clientKind,
      kind: "control" as const,
      encoding: url.searchParams.get("encoding") === "protobuf" ? "protobuf" as const : "json" as const
    }
  });

  if (!upgraded) {
    return new Response("Websocket upgrade failed", { status: 400 });
  }

  return undefined;
}

if (url.pathname === "/ws/pty" && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
  const admission = authorizePrivilegedRequest({
    request,
    sessionToken: state.sessionToken,
    tokenSource: "query"
  });
  if (!admission.allowed) return admission.response;
  const clientId = url.searchParams.get("clientId");
  const token = url.searchParams.get("token");
  if (!clientId || !token) {
    return new Response("Missing PTY attach parameters", { status: 400 });
  }

  const attachRecord = state.cliSessionManager.consumeAttachToken(token, clientId);
  if (!attachRecord) {
    return new Response("Invalid or expired PTY token", { status: 401 });
  }

  const upgraded = serverInstance.upgrade(request, {
    data: {
      clientId,
      clientKind: admission.clientKind,
      kind: "pty" as const,
      sessionId: attachRecord.sessionId
    }
  });
  if (!upgraded) {
    return new Response("PTY websocket upgrade failed", { status: 400 });
  }

  return undefined;
}

if (url.pathname === "/ws/terminal" && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
  const admission = authorizePrivilegedRequest({
    request,
    sessionToken: state.sessionToken,
    tokenSource: "query"
  });
  if (!admission.allowed) return admission.response;
  const clientId = url.searchParams.get("clientId");
  const token = url.searchParams.get("token");
  if (!clientId || !token) {
    return new Response("Missing terminal attach parameters", { status: 400 });
  }

  const attachRecord = state.terminalSessionManager.consumeAttachToken(token, clientId);
  if (!attachRecord) {
    return new Response("Invalid or expired terminal token", { status: 401 });
  }

  const upgraded = serverInstance.upgrade(request, {
    data: {
      clientId,
      clientKind: admission.clientKind,
      kind: "terminal" as const,
      sessionId: attachRecord.sessionId,
      attachOwnerId: attachRecord.token
    }
  });
  if (!upgraded) {
    state.terminalSessionManager.revokeAttachReplay(attachRecord.token);
    return new Response("Terminal websocket upgrade failed", { status: 400 });
  }

  return undefined;
}

if (state.serverOnly) {
  return new Response("Harness CLI websocket endpoint", { status: 200 });
}

if (state.ui.mode === "static-dist") {
  if (state.ui.liveReload === "debounced-poll" && url.pathname === DEV_UI_LIVE_RELOAD_ENDPOINT) {
    return new Response(JSON.stringify(state.ui.uiAssets.getLiveReloadState()), {
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8"
      }
    });
  }

  const assetPath = state.ui.uiAssets.resolveAsset(url.pathname);
  if (assetPath) {
    return createUiAssetResponse(assetPath, state.ui.liveReload, state.sessionToken, url.pathname === "/swarm");
  }
}

return new Response("Not Found", { status: 404 });
  };
}

function createHarnessWebSocketHandlers(
  state: HarnessServerState,
  options: { derivedProgressHeartbeatMs: number },
  getCurrentPreferencesState: () => ReturnType<typeof getPreferencesState>
): HarnessHandlerRefs["websocket"] {
  return {
  open(ws) {
    state.connections.add(ws);
    if (ws.data.kind === "control") {
      state.desktopClientLease?.connected();
    }
    if (ws.data.kind === "pty" && ws.data.sessionId) {
      state.cliSessionManager.attachSocket({
        sessionId: ws.data.sessionId,
        clientId: ws.data.clientId,
        socket: ws
      });
      return;
    }
    if (ws.data.kind === "terminal" && ws.data.sessionId) {
      if (!ws.data.attachOwnerId) { ws.close(4001, "Missing terminal attach owner"); return; }
      state.terminalSessionManager.attachSocket({
        sessionId: ws.data.sessionId,
        clientId: ws.data.clientId,
        attachOwnerId: ws.data.attachOwnerId,
        socket: ws
      });
      return;
    }

    try {
      const activeProjectId = state.runtime.getWorkspaceMetadata().activeProjectId;
      if (activeProjectId) drainBrowserApprovalRuntimeRecovery(state.runtime, activeProjectId);
    } catch { ws.close(1013, "Active project runtime resync unavailable; retry connection"); return; }
    const readyEvent: Extract<ServerEvent, { type: "connection.ready" }> = {
      type: "connection.ready",
      payload: {
        agents: [...defaultAgentCatalog],
        availableSkillPaths: discoverSkillPathsForActiveProject(state.runtime, state.repository),
        workspace: loadBoundedWorkspaceState(state.repository, state.runtime),
        executionControl: state.repository.getExecutionControlState(),
        preferences: getCurrentPreferencesState(),
        tokenUsage: state.repository.getTokenUsageState(state.tokenUsageSession),
        setup: state.currentSetupState,
        backgroundJobs: state.repository.loadBackgroundJobsState(),
        assistants: state.repository.loadAssistantSummaryState(),
        notifications: state.repository.loadNotificationInboxState()
      }
    };
    const encodedSize = () => {
      if (ws.data.encoding !== "protobuf") return new TextEncoder().encode(JSON.stringify(readyEvent)).byteLength;
      try { return encodeValue(readyEvent, { maxBytes: SERVER_EVENT_FRAME_MAX_BYTES }).byteLength; }
      catch (error) { if (error instanceof RangeError) return Infinity; throw error; }
    };
    while (encodedSize() > SERVER_EVENT_EMIT_MAX_BYTES && shrinkWorkspaceBootstrap(readyEvent.payload.workspace, state.repository)) { /* bounded */ }
    let assistantLimit = readyEvent.payload.assistants.assistants.length;
    let jobLimit = readyEvent.payload.backgroundJobs.jobs.length; let runLimit = readyEvent.payload.backgroundJobs.runs.length;
    let notificationLimit = readyEvent.payload.notifications.items.length;
    while (encodedSize() > SERVER_EVENT_EMIT_MAX_BYTES && (assistantLimit || jobLimit || runLimit || notificationLimit)) {
      if (notificationLimit) notificationLimit = Math.floor(notificationLimit / 2);
      else if (runLimit) runLimit = Math.floor(runLimit / 2);
      else if (jobLimit) jobLimit = Math.floor(jobLimit / 2);
      else assistantLimit = Math.floor(assistantLimit / 2);
      readyEvent.payload.assistants = state.repository.loadAssistantSummaryState(Math.max(1, assistantLimit));
      readyEvent.payload.backgroundJobs = state.repository.loadBackgroundJobsState(Math.max(1, jobLimit), Math.max(1, runLimit));
      readyEvent.payload.notifications = state.repository.loadNotificationInboxState(Math.max(1, notificationLimit));
      if (!assistantLimit) Object.assign(readyEvent.payload.assistants, { assistants: [], assistantsNextCursor: "__start__" });
      if (!jobLimit) Object.assign(readyEvent.payload.backgroundJobs, { jobs: [], jobsNextCursor: "__start__" });
      if (!runLimit) Object.assign(readyEvent.payload.backgroundJobs, { runs: [], runsNextCursor: "__start__" });
      if (!notificationLimit) Object.assign(readyEvent.payload.notifications, { items: [], itemsNextCursor: "__start__" });
    }
    if (encodedSize() > SERVER_EVENT_EMIT_MAX_BYTES) {
      sendCommandRejected(ws, "Connection bootstrap is too large", "Reduce persisted setup or preference content and reconnect");
      ws.close(1011, "Connection bootstrap exceeds transport budget"); return;
    }
    sendEvent(ws, readyEvent);
  },
  close(ws) {
    controlEventBatcher.clear(ws);
    state.connections.delete(ws);
    if (ws.data.kind === "control") {
      state.desktopClientLease?.disconnected();
    }
    const searchController = state.projectSearchControllers.get(ws.data.clientId);
    searchController?.abortController.abort();
    state.projectSearchControllers.delete(ws.data.clientId);
    const ideSearchController = state.ideSearchControllers.get(ws.data.clientId);
    ideSearchController?.abortController.abort();
    state.ideSearchControllers.delete(ws.data.clientId);
    if (ws.data.kind === "pty" && ws.data.sessionId) {
      state.cliSessionManager.detachSocket(ws.data.sessionId);
    } else if (ws.data.kind === "terminal" && ws.data.sessionId) {
      state.terminalSessionManager.detachSocket(ws.data.sessionId);
    } else {
      state.cliSessionManager.detachClient(ws.data.clientId);
      state.terminalSessionManager.detachClient(ws.data.clientId);
    }
  },
  message(ws, message) {
    if (ws.data.kind === "pty") {
      if (typeof message === "string" || !ws.data.sessionId) {
        return;
      }

      const bytes = message instanceof Uint8Array ? message : new Uint8Array(message);
      if (bytes[0] === STREAM_HEARTBEAT) {
        state.cliSessionManager.recordPtyPong(ws.data.sessionId, ws.data.clientId);
        return;
      }

      void state.cliSessionManager.writeToSession(ws.data.sessionId, bytes).catch(() => {
        // CliSessionManager owns durable session state for failed writes.
      });
      return;
    }
    if (ws.data.kind === "terminal") {
      if (typeof message === "string" || !ws.data.sessionId) {
        return;
      }

      const bytes = message instanceof Uint8Array ? message : new Uint8Array(message);
      if (bytes[0] === TERMINAL_STREAM_HEARTBEAT) {
        state.terminalSessionManager.recordPong(ws.data.sessionId, ws.data.clientId);
        return;
      }

      void state.terminalSessionManager.writeToSession(ws.data.sessionId, bytes).catch(() => undefined);
      return;
    }

    let command: ClientCommand;
    let decodedCommand: unknown;
    try {
      if (typeof message === "string" && new TextEncoder().encode(message).byteLength > SERVER_EVENT_EMIT_MAX_BYTES) {
        throw new RangeError("Control command exceeds its byte limit");
      }
      decodedCommand = typeof message === "string" ? JSON.parse(message) : readValueFrame(message, { maxBytes: SERVER_EVENT_EMIT_MAX_BYTES });
      command = parseClientCommand(decodedCommand);
    } catch (error) {
      const rejection = getClientCommandRejectionMetadata(decodedCommand, error);
      sendCommandRejected(
        ws,
        "Invalid websocket command",
        error instanceof Error ? error.message : "Unknown parse error",
        rejection.requestId,
        rejection.code
      );
      return;
    }

    const commandTask = handleCommand(command, {
      launchMode: state.launchMode,
      ws,
      runtime: state.runtime,
      repository: state.repository,
      adapter: state.adapter,
      runtimeRegistry: state.runtimeRegistry,
      assistantManager: state.assistantManager,
      cliSessionManager: state.cliSessionManager,
      terminalSessionManager: state.terminalSessionManager,
      pickFolder: state.pickFolder,
      getCurrentPreferencesState,
      emitSetupRefresh: async (requestId) => {
        state.currentSetupState = await refreshHarnessSetupState({
          adapter: state.adapter,
          repository: state.repository,
          runtimeRegistry: state.runtimeRegistry,
          runtime: state.runtime,
          launchMode: state.launchMode
        });
        emitSetupUpdatedToAll(state.connections, requestId, state.currentSetupState);
        return state.currentSetupState;
      },
      pendingBrowserApprovals: state.pendingBrowserApprovals,
      connections: state.connections,
      backgroundRunControllers: state.backgroundRunControllers,
      projectSearchControllers: state.projectSearchControllers,
      ideSearchControllers: state.ideSearchControllers,
      scheduler: state.scheduler,
      osAdapters: state.osAdapters,
      derivedProgressHeartbeatMs: options.derivedProgressHeartbeatMs,
      tokenUsageSession: state.tokenUsageSession
    }).catch((error) => {
      if (isPreflightDecisionRequiredError(error)) {
        return;
      }
      if (LOG_COMMAND_ERRORS) {
        console.error(error);
      }
      sendCommandRejected(
        ws,
        "Harness command failed",
        error instanceof Error ? error.message : "Unknown command error",
        command.requestId,
        getCommandRejectionCode(error)
      );
    });
    trackInFlightCommand(state, commandTask);
  }
};
}

function trackInFlightCommand(state: HarnessServerState, command: Promise<void>) {
  let commands = inFlightCommandsByState.get(state);
  if (!commands) {
    commands = new Set();
    inFlightCommandsByState.set(state, commands);
  }
  commands.add(command);
  void command.finally(() => {
    commands.delete(command);
    if (commands.size === 0) inFlightCommandsByState.delete(state);
  });
}

async function awaitInFlightCommands(state: HarnessServerState) {
  const commands = inFlightCommandsByState.get(state);
  if (commands?.size) await Promise.allSettled([...commands]);
}

export function createHarnessBunServer(input: {
  port: number;
  hostname?: string;
  handlerRefs: HarnessHandlerRefs;
  websocket?: HarnessWebSocketOptions;
}) {
  return Bun.serve<HarnessConnection>({
    port: input.port,
    hostname: input.hostname,
    routes: input.handlerRefs.routes,
    fetch: input.handlerRefs.fetch,
    websocket: withWebsocketCompression(input.websocket ?? input.handlerRefs.websocket)
  });
}

export function isLoopbackRequest(
  server: Awaited<ReturnType<typeof Bun.serve<HarnessConnection>>>,
  request: Request
) {
  const address = server.requestIP(request)?.address;
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

export function attachDesktopClientLifecycle(
  server: Awaited<ReturnType<typeof Bun.serve<HarnessConnection>>>,
  state: HarnessServerState,
  enabled: boolean,
  idleGraceMs: number
) {
  if (!enabled) return;
  state.desktopClientLease?.dispose();
  state.desktopClientLease = createClientLeaseController({
    idleGraceMs,
    initialGraceMs: 30_000,
    onIdle: () => server.stop(true)
  });
  state.desktopClientLease.arm();
}

export function decorateHarnessServerStop(
  server: Awaited<ReturnType<typeof Bun.serve<HarnessConnection>>>,
  getState: () => HarnessServerState,
  onStopped?: () => void
) {
  const stop = server.stop.bind(server);
  const decoratedStop: typeof server.stop = async (closeActiveConnections?: boolean) => {
    const state = getState();
    state.desktopClientLease?.dispose();
    const stopped = stop(closeActiveConnections);
    state.assistantManager.beginShutdown();
    stopLiveProjectRunsOnShutdown(state);
    const threadMessagesStopped = import("../execution/thread-message-dispatcher").then(module => module.stopThreadMessageDispatcher(state));
    failLiveBackgroundRunsOnShutdown(state.repository, state.backgroundRunControllers);
    if (state.ui.mode === "static-dist") {
      state.ui.uiAssets.dispose();
    }
    state.scheduler.stop();
    onStopped?.();
    await Promise.resolve(stopped);
    await awaitInFlightCommands(state);
    await threadMessagesStopped;
    await state.assistantManager.settleShutdown();
  };
  server.stop = decoratedStop;
}
