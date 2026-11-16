import { createRequestId, type ClientCommand, type ServerEvent, type WorkspaceProjectState } from "@hyperfocus/ai-core/protocol";
import {
  createUnavailableWorkspaceChildCommand,
  createWorkspaceChildPageCommand,
  createWorkspaceMessagePageCommand,
  createWorkspacePageReconciliation,
  createWorkspacePagingStatus,
  workspaceChildPageMatchesRequest,
  workspaceChildPages,
  type WorkspaceChildCommand,
  type WorkspaceCollection,
  type WorkspacePagingStatus
} from "./workspace-page/support";

export type { WorkspacePagingStatus } from "./workspace-page/support";
export const WORKSPACE_MESSAGE_CACHE_LIMIT = 1_024;

export function retainWorkspaceMessageWindow<Project extends WorkspaceProjectState>(project: Project): Project {
  if (project.session.messages.length <= WORKSPACE_MESSAGE_CACHE_LIMIT) return project;
  return Object.assign({}, project, {
    session: { ...project.session, messages: project.session.messages.slice(-WORKSPACE_MESSAGE_CACHE_LIMIT) },
    messagesNextCursor: undefined
  });
}

type WorkspacePageEvent = Extract<ServerEvent,
  { type: "workspace.projects.listed" | "workspace.projectChildren.listed" }>;
type ChildCommand = WorkspaceChildCommand;
type PageRequest<Command> = { id: string; command: Command; attempt: number; error?: string };
type PageWorkspace<Project extends WorkspaceProjectState> = {
  activeProjectId?: string;
  projects: Project[];
  projectsNextCursor?: string;
};
export const emptyWorkspacePagingStatus = (): WorkspacePagingStatus => ({ catalog: { status: "idle" }, childrenByProjectId: {} });

export type WorkspacePageRequestOptions = {
  getWorkspace: () => PageWorkspace<WorkspaceProjectState>;
  sendCommand: (command: ClientCommand) => boolean;
  onStatusChange?: (status: WorkspacePagingStatus) => void;
  onTerminalError?: (message: string, retry: () => void) => void;
  onUnavailable?: (collection: WorkspaceCollection, ids: string[], projectId?: string) => void;
  onAvailable?: (collection: WorkspaceCollection, ids: string[], projectId?: string) => void;
  onReconciled?: (collection: WorkspaceCollection, retainedIds: string[], projectId?: string) => void;
};

export function applyWorkspacePageEvent<Project extends WorkspaceProjectState, Workspace extends PageWorkspace<Project>>(
  workspace: Workspace,
  event: WorkspacePageEvent,
  hydrateProject: (project: WorkspaceProjectState) => Project
): Workspace {
  if (event.type === "workspace.projects.listed") return { ...workspace,
    projects: mergeUniqueById(workspace.projects, event.payload.projects.items.map(hydrateProject)),
    projectsNextCursor: event.payload.projects.nextCursor };
  const project = workspace.projects.find((entry) => entry.id === event.payload.projectId);
  if (!project || (event.payload.messages && event.payload.messages.threadId !== project.activeThreadId) ||
    (event.payload.runSummaries && event.payload.runSummaries.threadId !== project.activeThreadId)) return workspace;
  const messages = event.payload.messages;
  const mergedMessages = messages ? mergeUniqueById(messages.page.items, project.session.messages) : project.session.messages;
  const retainedMessages = mergedMessages.slice(-WORKSPACE_MESSAGE_CACHE_LIMIT);
  const nextProject = { ...project,
    filePaths: event.payload.filePaths
      ? mergeUniqueValues(project.filePaths ?? [], event.payload.filePaths.items) : project.filePaths,
    filePathsNextCursor: event.payload.filePaths ? event.payload.filePaths.nextCursor : project.filePathsNextCursor,
    threads: event.payload.threads ? mergeUniqueById(project.threads, event.payload.threads.items) : project.threads,
    threadsNextCursor: event.payload.threads ? event.payload.threads.nextCursor : project.threadsNextCursor,
    session: messages ? { ...project.session, messages: retainedMessages } : project.session,
    messagesNextCursor: messages
      ? mergedMessages.length >= WORKSPACE_MESSAGE_CACHE_LIMIT ? undefined : messages.page.nextCursor
      : project.messagesNextCursor,
    runSummaries: event.payload.runSummaries
      ? mergeUniqueById(project.runSummaries, event.payload.runSummaries.page.items) : project.runSummaries,
    runSummariesNextCursor: event.payload.runSummaries
      ? event.payload.runSummaries.page.nextCursor : project.runSummariesNextCursor };
  return { ...workspace, projects: workspace.projects.map((entry) => entry.id === project.id ? nextProject : entry) };
}

export function prepareWorkspaceForPageEvent<Project extends WorkspaceProjectState, Workspace extends PageWorkspace<Project>>(
  workspace: Workspace,
  event: WorkspacePageEvent,
  projectsRestart: boolean,
  childRequest?: ChildCommand
): Workspace {
  if (event.type === "workspace.projects.listed" && projectsRestart) {
    const active = workspace.projects.find((project) => project.id === workspace.activeProjectId);
    return { ...workspace, projects: active ? [active] : [] };
  }
  if (event.type !== "workspace.projectChildren.listed") return workspace;
  return { ...workspace, projects: workspace.projects.map((project) => project.id !== event.payload.projectId ? project : {
    ...project,
    ...(event.payload.filePaths && childRequest?.payload.filePaths?.cursor === undefined ? { filePaths: [] } : {}),
    ...(event.payload.threads && childRequest?.payload.threads?.cursor === undefined ? { threads: [] } : {}),
    ...(event.payload.messages && childRequest?.payload.messages?.cursor === undefined
      ? { session: { ...project.session, messages: [] } } : {}),
    ...(event.payload.runSummaries && childRequest?.payload.runSummaries?.cursor === undefined ? { runSummaries: [] } : {})
  }) };
}

export function hydratePagedWorkspace<Project extends WorkspaceProjectState>(workspace: {
  activeProjectId?: string; projects: WorkspaceProjectState[]; projectsNextCursor?: string
}, hydrateProject: (project: WorkspaceProjectState) => Project) {
  return { ...workspace, projects: workspace.projects.map(hydrateProject) };
}

export function mergePagedWorkspace<Project extends WorkspaceProjectState, Workspace extends PageWorkspace<Project>>(
  existing: Workspace,
  incoming: Workspace,
  mergeProject: (existing: Project, incoming: Project) => Project
): Workspace {
  return { ...incoming, projects: incoming.projects.map((project) => {
    const prior = existing.projects.find((entry) => entry.id === project.id);
    return prior ? mergeProject(prior, project) : project;
  }) };
}

export function createWorkspacePageRequests(options: WorkspacePageRequestOptions) {
  const retryLimit = 3;
  let generation = 0;
  let projectsRequest: PageRequest<Extract<ClientCommand, { type: "workspace.projects.list" }>> | undefined;
  const childRequests = new Map<string, PageRequest<ChildCommand>>();
  const childMismatchAttempts = new Map<string, number>();
  const reconciliation = createWorkspacePageReconciliation(options);
  const publishStatus = () => options.onStatusChange?.(createWorkspacePagingStatus(projectsRequest, childRequests));
  const requestProjects = (cursor?: string) => {
    if (!cursor || projectsRequest) return;
    sendProjects({ type: "workspace.projects.list", requestId: createRequestId(), payload: { cursor, limit: 128 } }, 0);
  };
  const sendProjects = (command: Extract<ClientCommand, { type: "workspace.projects.list" }>, attempt: number,
    ownerGeneration = generation) => {
    if (ownerGeneration !== generation) return;
      projectsRequest = { id: command.requestId, command, attempt };
    if (!options.sendCommand(command)) {
      const error = "Workspace page request was not sent.";
      projectsRequest = { ...projectsRequest, error };
      options.onTerminalError?.(error, () => { if (ownerGeneration !== generation || projectsRequest?.id !== command.requestId) return;
        projectsRequest = undefined; sendProjects({ ...command, requestId: createRequestId() }, 0);
      });
    }
    publishStatus();
  };
  const requestChildren = (projectId: string) => {
    if (childRequests.has(projectId)) return;
    const project = options.getWorkspace().projects.find((entry) => entry.id === projectId);
    if (!project) return;
    // Hydrate a summary shell once; older transcript pages remain explicitly requested.
    const command = createWorkspaceChildPageCommand(project, {
      includeMessages: project.messagesNextCursor === "__start__" && project.session.messages.length === 0
    });
    if (command) sendChild(command, 0);
  };
  const requestMessages = (projectId: string) => {
    if (childRequests.has(projectId)) return;
    const project = options.getWorkspace().projects.find((entry) => entry.id === projectId);
    if (!project) return;
    const command = createWorkspaceMessagePageCommand(project);
    if (command) {
      reconciliation.begin("messages", projectId, project.messagesNextCursor);
      sendChild(command, 0);
    }
  };
  const sendChild = (command: ChildCommand, attempt: number, ownerGeneration = generation, preserveMismatch = false) => {
    if (ownerGeneration !== generation) return;
    if (!preserveMismatch) childMismatchAttempts.delete(command.payload.projectId);
    childRequests.set(command.payload.projectId, { id: command.requestId, command, attempt });
    if (!options.sendCommand(command)) {
      childRequests.set(command.payload.projectId,
        { id: command.requestId, command, attempt, error: "Workspace child-page request was not sent." });
      options.onTerminalError?.("Workspace child-page request was not sent.", () => { if (ownerGeneration !== generation) return;
        if (childRequests.get(command.payload.projectId)?.id !== command.requestId) return;
        childRequests.delete(command.payload.projectId); sendChild({ ...command, requestId: createRequestId() }, 0,
          ownerGeneration, preserveMismatch);
      });
    }
    publishStatus();
  };
  return {
    reset() { generation += 1; projectsRequest = undefined; childRequests.clear(); childMismatchAttempts.clear(); reconciliation.clear(); publishStatus(); },
    accepts(event: WorkspacePageEvent) {
      if (event.type === "workspace.projects.listed") return projectsRequest?.id === event.requestId;
      const request = childRequests.get(event.payload.projectId);
      if (request?.id !== event.requestId) return false;
      if (workspaceChildPageMatchesRequest(request.command, event)) {
        childMismatchAttempts.delete(event.payload.projectId); return true;
      }
      const attempts = childMismatchAttempts.get(event.payload.projectId) ?? 0;
      if (attempts < retryLimit) { childMismatchAttempts.set(event.payload.projectId, attempts + 1);
        sendChild({ ...request.command, requestId: createRequestId() }, request.attempt, generation, true); }
      else { const error = "Workspace child-page response did not match the requested collections.";
        childRequests.set(event.payload.projectId, { ...request, error }); publishStatus(); const ownerGeneration = generation;
        options.onTerminalError?.(error, () => { if (ownerGeneration !== generation) return;
          if (childRequests.get(event.payload.projectId)?.id !== request.id) return;
          childMismatchAttempts.delete(event.payload.projectId); childRequests.delete(event.payload.projectId);
          sendChild({ ...request.command, requestId: createRequestId() }, request.attempt); }); }
      return false;
    },
    getProjectsRequest: () => projectsRequest ? { id: projectsRequest.id, cursor: projectsRequest.command.payload?.cursor ?? "" } : undefined,
    getProjectsError: () => projectsRequest?.error,
    getChildRequest: (projectId: string) => childRequests.get(projectId)?.command,
    getChildError: (projectId: string) => childRequests.get(projectId)?.error,
    ready() {
      generation += 1;
      projectsRequest = undefined; childRequests.clear(); childMismatchAttempts.clear();
      publishStatus();
      const workspace = options.getWorkspace();
      reconciliation.begin("projects", undefined, workspace.projectsNextCursor);
      requestProjects(workspace.projectsNextCursor);
      if (workspace.activeProjectId) { const project = workspace.projects.find(({ id }) => id === workspace.activeProjectId);
        if (project) reconciliation.beginChildren(project, { includeMessages: false }); requestChildren(workspace.activeProjectId); }
    },
    applied(event: WorkspacePageEvent) {
      if (event.type === "workspace.projects.listed") {
        const unavailable = event.payload.projects.unavailableItems?.map(({ id }) => id) ?? [];
        if (unavailable.length) options.onUnavailable?.("projects", unavailable);
        reconciliation.collect("projects", unavailable);
        options.onAvailable?.("projects", event.payload.projects.items.map(({ id }) => id));
        reconciliation.finish("projects", event.payload.projects.nextCursor);
        projectsRequest = undefined; publishStatus(); requestProjects(event.payload.projects.nextCursor); return;
      }
      const pages = workspaceChildPages(event);
      for (const [collection, page] of pages) if (page) {
        const unavailable = getUnavailableIds(page);
        if (unavailable.length) options.onUnavailable?.(collection, unavailable, event.payload.projectId);
        reconciliation.collect(collection, unavailable, event.payload.projectId);
        options.onAvailable?.(collection, page.items.map((item) => typeof item === "string" ? item : item.id), event.payload.projectId);
        reconciliation.finish(collection, page.nextCursor, event.payload.projectId);
      }
      childRequests.delete(event.payload.projectId);
      childMismatchAttempts.delete(event.payload.projectId);
      publishStatus();
      if (event.payload.projectId === options.getWorkspace().activeProjectId) requestChildren(event.payload.projectId);
    },
    requestChildren,
    requestMessages,
    retryProjects() {
      const command = projectsRequest?.command;
      projectsRequest = undefined;
      if (command) sendProjects({ ...command, requestId: createRequestId() }, 0);
      else requestProjects(options.getWorkspace().projectsNextCursor);
    },
    retryChildren(projectId: string) {
      const command = childRequests.get(projectId)?.command;
      childRequests.delete(projectId);
      if (command) sendChild({ ...command, requestId: createRequestId() }, 0); else requestChildren(projectId);
    },
    retryUnavailable(collections: ReadonlySet<WorkspaceCollection>,
      projectId?: string) {
      if (collections.has("projects")) { projectsRequest = undefined; reconciliation.begin("projects", undefined, "pending");
        sendProjects({ type: "workspace.projects.list", requestId: createRequestId(), payload: { limit: 128 } }, 0); return; }
      if (!projectId) return;
      const project = options.getWorkspace().projects.find(({ id }) => id === projectId); if (!project) return;
      for (const collection of collections) reconciliation.begin(collection, projectId, "pending");
      childRequests.delete(projectId);
      sendChild(createUnavailableWorkspaceChildCommand(project, collections), 0);
    },
    handle(event: ServerEvent) {
      if (event.type === "connection.ready") this.ready();
      if (event.type === "workspace.updated") this.ready();
      if (event.type === "workspace.projects.listed" || event.type === "workspace.projectChildren.listed") this.applied(event);
      if (event.type === "project.activated") {
        if (projectsRequest?.error) {
          const command = projectsRequest.command; projectsRequest = undefined;
          sendProjects({ ...command, requestId: createRequestId() }, 0);
        }
        for (const projectId of childRequests.keys()) if (projectId !== event.payload.projectId) childRequests.delete(projectId);
        if (childRequests.get(event.payload.projectId)?.error) childRequests.delete(event.payload.projectId);
        requestChildren(event.payload.projectId);
      }
      if (event.type === "project.updated" || event.type === "thread.created" || event.type === "thread.activated" ||
        event.type === "project.opened") {
        const projectId = event.type === "project.opened" ? event.payload.project.id : event.payload.projectId;
        childRequests.delete(projectId);
        const project = options.getWorkspace().projects.find(({ id }) => id === projectId);
        if (project) reconciliation.beginChildren(project, { includeMessages: false });
        requestChildren(projectId);
      }
      if (event.type === "command.rejected") this.rejected(event);
    },
    rejected(event: Extract<ServerEvent, { type: "command.rejected" }>) {
      if (!event.requestId) return;
      if (projectsRequest?.id === event.requestId) {
        if (event.payload.code === "invalid-cursor") {
          reconciliation.begin("projects", undefined, "pending");
          sendProjects({ type: "workspace.projects.list", requestId: createRequestId(), payload: { limit: 128 } }, 0);
        } else if (projectsRequest.attempt < retryLimit) sendProjects({ ...projectsRequest.command,
          requestId: createRequestId() }, projectsRequest.attempt + 1);
        else {
          const error = event.payload.detail ?? event.payload.message;
          projectsRequest = { ...projectsRequest, error };
          publishStatus();
          const ownerGeneration = generation;
          const failedId = projectsRequest.id;
          options.onTerminalError?.(error, () => { if (ownerGeneration === generation && projectsRequest?.id === failedId)
            this.retryProjects(); });
        }
      }
      for (const [projectId, request] of childRequests) if (request.id === event.requestId) {
        if (event.payload.code === "invalid-cursor") {
          const payload = request.command.payload;
          if (payload.filePaths) reconciliation.begin("filePaths", projectId, "pending");
          if (payload.threads) reconciliation.begin("threads", projectId, "pending");
          if (payload.messages) reconciliation.begin("messages", projectId, "pending");
          if (payload.runSummaries) reconciliation.begin("runSummaries", projectId, "pending");
          sendChild({ type: "workspace.projectChildren.list", requestId: createRequestId(), payload: { projectId,
            ...(payload.filePaths ? { filePaths: { limit: payload.filePaths.limit } } : {}),
            ...(payload.threads ? { threads: { limit: payload.threads.limit } } : {}),
            ...(payload.messages ? { messages: { threadId: payload.messages.threadId, limit: payload.messages.limit } } : {}),
            ...(payload.runSummaries ? { runSummaries: { threadId: payload.runSummaries.threadId,
              limit: payload.runSummaries.limit } } : {}) } }, 0);
        } else if (request.attempt < retryLimit) sendChild({ ...request.command, requestId: createRequestId() }, request.attempt + 1);
        else {
          const failed = { ...request, error: event.payload.detail ?? event.payload.message };
          childRequests.set(projectId, failed); publishStatus();
          const ownerGeneration = generation;
          options.onTerminalError?.(failed.error, () => { if (ownerGeneration === generation &&
            childRequests.get(projectId)?.id === failed.id) this.retryChildren(projectId); });
        }
      }
    }
  };
}

function mergeUniqueById<Item extends { id: string }>(first: Item[], second: Item[]) {
  const seen = new Set<string>();
  return [...first, ...second].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function getUnavailableIds(page: object) {
  if (!("unavailableItems" in page) || !Array.isArray(page.unavailableItems)) return [];
  return page.unavailableItems.flatMap((item) => typeof item === "object" && item !== null && "id" in item &&
    typeof item.id === "string" ? [item.id] : []);
}

function mergeUniqueValues(first: string[], second: string[]) {
  return [...new Set([...first, ...second])];
}
