import type { HarnessConnection, ProjectLike } from "../core/contracts";
import { emitControlEvent, sendEvent } from "../transport/events";
import type { ControlEventConnections, ControlEventSocket } from "../transport/events";
import { discoverRepoSkillPaths, resolveRepoRoot } from "../../subagent-environment";
import { withTraceTimestamp } from "../../trace-timestamps";
import type { WorkspaceRepository } from "../../workspace-repository";
import { WORKSPACE_FILE_PAGE_SIZE, WORKSPACE_MESSAGE_PAGE_SIZE, WORKSPACE_PROJECT_PAGE_SIZE,
  WORKSPACE_RUN_PAGE_SIZE, WORKSPACE_THREAD_PAGE_SIZE, shrinkWorkspaceBootstrap } from "./workspace-bootstrap";
import { SERVER_EVENT_EMIT_MAX_BYTES } from "@hyperfocus/ai-core/protocol";
import type { WorkspaceRuntimeStore } from "../../workspace-runtime-store";
import { createEmptySession } from "@hyperfocus/ai-core/protocol";
import type { AgentTrace, ChatMessage, ProjectId, ServerEvent, WorkspaceProjectState } from "@hyperfocus/ai-core/protocol";
import { readdirSync } from "node:fs";
import type { Dirent } from "node:fs";
import path from "node:path";

export function emitProjectTrace(
  ws: import("../transport/events").ControlEventSocket,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  projectId: ProjectId,
  threadId: string,
  trace: AgentTrace
) {
  const stampedTrace = withTraceTimestamp(trace);
  runtime.appendTrace(projectId, stampedTrace, threadId);
  sendEvent(ws, {
    type: "agent.trace",
    requestId,
    payload: {
      projectId,
      threadId,
      trace: stampedTrace
    }
  });
}

export function emitMessageAppended(
  ws: import("../transport/events").ControlEventSocket,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  threadId?: string
) {
  const project = runtime.getProject(projectId);
  const resolvedThreadId = threadId ?? project.activeThreadId;
  const state = getThreadSessionState(runtime, repository, projectId, resolvedThreadId);
  const message = state.messages.at(-1);
  if (!message) {
    throw new Error("Expected appended message");
  }
  const thread = repository.getProject(projectId).threads.find((entry) => entry.id === resolvedThreadId);
  if (!thread) {
    throw new Error(`Unknown thread: ${resolvedThreadId}`);
  }

  sendEvent(ws, {
    type: "chat.message-appended",
    requestId,
    payload: {
      projectId: project.id,
      threadId: resolvedThreadId,
      sessionId: state.sessionId,
      message,
      thread,
      state
    }
  });
}

export function getThreadSessionState(
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  threadId: string
) {
  const project = runtime.getProject(projectId);
  if (project.activeThreadId === threadId) {
    return project.session;
  }

  const threadRuntime = runtime.getThreadRuntime(projectId, threadId);
  return {
    ...createEmptySession(threadId),
    sessionId: threadRuntime?.sessionId ?? threadId,
    isStreaming: threadRuntime?.isStreaming ?? false,
    lastError: threadRuntime?.lastError,
    messages: repository.getThreadMessages(projectId, threadId)
  };
}

export function emitThreadMessageAppended(
  ws: import("../transport/events").ControlEventSocket,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  threadId: string
) {
  sendEvent(ws, createThreadMessageAppendedEvent(requestId, runtime, repository, projectId, threadId));
}

export function emitThreadMessageAppendedToAll(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  threadId: string
) {
  emitControlEvent(connections, createThreadMessageAppendedEvent(requestId, runtime, repository, projectId, threadId));
}

function createThreadMessageAppendedEvent(requestId: string, runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository, projectId: ProjectId, threadId: string) {
  const state = getThreadSessionState(runtime, repository, projectId, threadId);
  const message = state.messages.at(-1);
  if (!message) {
    throw new Error("Expected appended message");
  }
  const thread = repository.getProject(projectId).threads.find((entry) => entry.id === threadId);
  if (!thread) {
    throw new Error(`Unknown thread: ${threadId}`);
  }

  const event: ServerEvent = { type: "thread.message-appended", requestId,
    payload: { projectId, threadId, sessionId: state.sessionId, message, thread, state } };
  return event;
}

export function findLatestAssistantMessage(project: ProjectLike) {
  return findLatestNonMilestoneAssistantMessage(project.session.messages);
}

export function findLatestNonMilestoneAssistantMessage(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant" && message.kind !== "run-milestones") {
      return message;
    }
  }

  return undefined;
}

export function emitRunUpdated(ws: import("../transport/events").ControlEventSocket, requestId: string, project: ProjectLike) {
  const run = project.activeRun ?? project.lastRun;
  if (!run) {
    return;
  }

  sendEvent(ws, {
    type: "run.updated",
    requestId,
    payload: {
      projectId: project.id,
      threadId: run.threadId,
      run: createRunBootstrapProjection(run)!
    }
  });
}

export function emitRunUpdatedToAll(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  requestId: string,
  project: ProjectLike
) {
  const run = project.activeRun ?? project.lastRun;
  if (!run) return;
  emitControlEvent(connections, { type: "run.updated", requestId,
    payload: { projectId: project.id, threadId: run.threadId, run: createRunBootstrapProjection(run)! } });
}

export function emitRunUpdatedById(
  ws: ControlEventSocket,
  requestId: string,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  runId: string,
  connections?: ControlEventConnections
) {
  const event = createRunUpdatedByIdEvent(requestId, repository, projectId, runId);
  if (!event) return;

  if (connections) {
    emitControlEvent(connections, event);
    return;
  }

  sendEvent(ws, event);
}

export function emitRunUpdatedByIdToAll(connections: Set<Bun.ServerWebSocket<HarnessConnection>>, requestId: string,
  repository: WorkspaceRepository, projectId: ProjectId, runId: string) {
  const event = createRunUpdatedByIdEvent(requestId, repository, projectId, runId);
  if (event) emitControlEvent(connections, event);
}

function createRunUpdatedByIdEvent(requestId: string, repository: WorkspaceRepository, projectId: ProjectId,
  runId: string): Extract<ServerEvent, { type: "run.updated" }> | undefined {
  const run = repository.getRun(projectId, runId);
  return run ? { type: "run.updated", requestId, payload: { projectId, threadId: run.threadId, run: createRunBootstrapProjection(run)! } } : undefined;
}

export function loadBoundedWorkspaceState(repository: WorkspaceRepository, runtime: WorkspaceRuntimeStore) {
  const metadata = runtime.getWorkspaceMetadata();
  const catalog = repository.listWorkspaceProjects({ limit: WORKSPACE_PROJECT_PAGE_SIZE });
  const activeId = metadata.activeProjectId;
  const activeShell = activeId ? repository.getWorkspaceProjectCatalogEntry(activeId) : undefined;
  const projects = [...catalog.items];
  if (activeShell && !projects.some(({ id }) => id === activeShell.id)) projects.push(activeShell);
  const items = projects.map((project) => {
    if (project.id !== activeId) return project;
    const bounded = loadBoundedProjectState(repository, project);
    const threadRuntime = runtime.getThreadRuntime(project.id, project.activeThreadId);
    return { ...bounded, session: { ...bounded.session, sessionId: threadRuntime?.sessionId ?? bounded.session.sessionId,
      isStreaming: threadRuntime?.isStreaming ?? false, lastError: threadRuntime?.lastError } };
  });
  return { ...metadata, projects: items, projectsNextCursor: catalog.nextCursor };
}

export function loadBoundedProjectState(repository: WorkspaceRepository, shell: WorkspaceProjectState) {
  const threads = repository.listWorkspaceProjectThreads(shell.id, { limit: WORKSPACE_THREAD_PAGE_SIZE - 1 });
  if (!threads.items.some(({ id }) => id === shell.activeThreadId)) threads.items.push(shell.threads[0]!);
  const messages = repository.listWorkspaceThreadMessages(shell.id, shell.activeThreadId, { limit: WORKSPACE_MESSAGE_PAGE_SIZE });
  const runs = repository.listWorkspaceThreadRunSummaries(shell.id, shell.activeThreadId, { limit: WORKSPACE_RUN_PAGE_SIZE });
  const runState = repository.getThreadRunState(shell.id, shell.activeThreadId);
  const filePaths = discoverComposerFilePaths(shell.rootPath);
  return { ...shell, activeRun: createRunBootstrapProjection(runState.activeRun), lastRun: createRunBootstrapProjection(runState.lastRun),
    threads: threads.items, threadsNextCursor: threads.nextCursor,
    session: { ...shell.session, messages: messages.items }, messagesNextCursor: messages.nextCursor,
    runSummaries: runs.items, runSummariesNextCursor: runs.nextCursor,
    filePaths: filePaths.slice(0, WORKSPACE_FILE_PAGE_SIZE),
    filePathsNextCursor: filePaths.length > WORKSPACE_FILE_PAGE_SIZE ? filePaths[WORKSPACE_FILE_PAGE_SIZE - 1] : undefined };
}

export function createRunBootstrapProjection(run: WorkspaceProjectState["activeRun"]) {
  if (!run) return undefined;
  return { ...run, latestUserPrompt: run.latestUserPrompt.slice(0, 1_000),
    summary: run.summary?.slice(0, 2_000), finalExecutionBrief: run.finalExecutionBrief?.slice(0, 2_000),
    failureMessage: run.failureMessage?.slice(0, 2_000), plan: undefined, correctnessReview: undefined,
    questions: [], subtasks: [], browserSessions: undefined, toolActivities: undefined, experiment: undefined,
    memoryRetrievals: undefined, detailState: "summary" as const };
}

export function emitWorkspaceUpdated(ws: import("../transport/events").ControlEventSocket, requestId: string,
  runtime: WorkspaceRuntimeStore, repository: WorkspaceRepository) {
  const event: Extract<ServerEvent, { type: "workspace.updated" }> = {
    type: "workspace.updated",
    requestId,
    payload: {
      workspace: loadBoundedWorkspaceState(repository, runtime)
    }
  };
  while (eventBytes(event) > SERVER_EVENT_EMIT_MAX_BYTES && shrinkWorkspaceBootstrap(event.payload.workspace, repository)) { /* fit */ }
  sendEvent(ws, event);
}

export function emitProjectUpdated(
  ws: import("../transport/events").ControlEventSocket,
  requestId: string,
  projectId: ProjectId,
  project: WorkspaceProjectState,
  repository: WorkspaceRepository
) {
  const event: Extract<ServerEvent, { type: "project.updated" }> = {
    type: "project.updated",
    requestId,
    payload: {
      projectId,
      project: loadBoundedProjectState(repository, repository.getWorkspaceProjectCatalogEntry(project.id) ?? project)
    }
  };
  const workspace = { projects: [event.payload.project], activeProjectId: event.payload.project.id };
  while (eventBytes(event) > SERVER_EVENT_EMIT_MAX_BYTES && shrinkWorkspaceBootstrap(workspace, repository)) { /* fit */ }
  sendEvent(ws, event);
}

function eventBytes(event: ServerEvent) { return new TextEncoder().encode(JSON.stringify(event)).byteLength; }

export function enrichWorkspaceForComposer(workspace: ReturnType<WorkspaceRuntimeStore["getWorkspace"]>) {
  return {
    ...workspace,
    projects: workspace.projects.map((project) => enrichProjectForComposer(project))
  };
}

export function enrichProjectForComposer(project: WorkspaceProjectState): WorkspaceProjectState {
  return {
    ...project,
    filePaths: discoverComposerFilePaths(project.rootPath)
  };
}

export function discoverSkillPathsForActiveProject(runtime: WorkspaceRuntimeStore, repository: WorkspaceRepository) {
  const activeProjectId = runtime.getWorkspaceMetadata().activeProjectId;
  const activeProject = activeProjectId ? repository.getWorkspaceProjectCatalogEntry(activeProjectId) : undefined;
  return discoverSkillPathsForProjectRoot(activeProject?.rootPath);
}

export function discoverSkillPathsForProjectRoot(rootPath?: string) {
  return discoverRepoSkillPaths(resolveRepoRoot(rootPath ?? process.cwd()));
}

export const composerFileSkipDirs = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vite",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target"
]);

export function discoverComposerFilePaths(rootPath: string) {
  const results: string[] = [];
  const stack = [rootPath];
  while (stack.length > 0 && results.length < 5000) {
    const current = stack.pop()!;
    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (results.length >= 5000) {
        break;
      }
      if (entry.name.startsWith(".") && entry.name !== ".agents") {
        continue;
      }
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!composerFileSkipDirs.has(entry.name)) {
          stack.push(absolutePath);
        }
        continue;
      }
      if (entry.isFile()) {
        results.push(path.relative(rootPath, absolutePath).replace(/\\/g, "/"));
      }
    }
  }
  return results.sort((left, right) => left.localeCompare(right));
}
