import {
  createRequestId,
  type ClientCommand,
  type ServerEvent,
  type WorkspaceProjectState
} from "@hyperfocus/ai-core/protocol";

export type WorkspaceCollection = "projects" | "filePaths" | "threads" | "messages" | "runSummaries";
export type WorkspaceChildCommand = Extract<ClientCommand, { type: "workspace.projectChildren.list" }>;
export type WorkspaceChildPageEvent = Extract<ServerEvent, { type: "workspace.projectChildren.listed" }>;
type RequestStatus = { error?: string };

export type WorkspacePagingStatus = {
  catalog: { status: "idle" | "loading" | "error"; error?: string };
  childrenByProjectId: Record<string, { status: "idle" | "loading" | "error"; error?: string }>;
};

export function createWorkspacePageReconciliation(options: {
  onReconciled?: (collection: WorkspaceCollection, retainedIds: string[], projectId?: string) => void;
}) {
  const retainedIds = new Map<string, Set<string>>();
  const key = (collection: WorkspaceCollection, projectId?: string) => `${projectId ?? "global"}:${collection}`;
  const begin = (collection: WorkspaceCollection, projectId?: string, cursor?: string) => {
    retainedIds.set(key(collection, projectId), new Set());
    if (!cursor) {
      options.onReconciled?.(collection, [], projectId);
      retainedIds.delete(key(collection, projectId));
    }
  };
  const collect = (collection: WorkspaceCollection, ids: string[], projectId?: string) => {
    const retained = retainedIds.get(key(collection, projectId));
    for (const id of ids) retained?.add(id);
  };
  const finish = (collection: WorkspaceCollection, cursor?: string, projectId?: string) => {
    const retained = retainedIds.get(key(collection, projectId));
    if (!retained || cursor) return;
    options.onReconciled?.(collection, [...retained], projectId);
    retainedIds.delete(key(collection, projectId));
  };
  const beginChildren = (project: WorkspaceProjectState, options: { includeMessages?: boolean } = {}) => {
    begin("filePaths", project.id, project.filePathsNextCursor);
    begin("threads", project.id, project.threadsNextCursor);
    if (options.includeMessages !== false) begin("messages", project.id, project.messagesNextCursor);
    begin("runSummaries", project.id, project.runSummariesNextCursor);
  };
  return { begin, collect, finish, beginChildren, clear: () => retainedIds.clear() };
}

export function createWorkspacePagingStatus(
  projectsRequest: RequestStatus | undefined,
  childRequests: ReadonlyMap<string, RequestStatus>
): WorkspacePagingStatus {
  return {
    catalog: projectsRequest?.error
      ? { status: "error", error: projectsRequest.error }
      : projectsRequest
        ? { status: "loading" }
        : { status: "idle" },
    childrenByProjectId: Object.fromEntries([...childRequests].map(([projectId, request]) => [
      projectId,
      request.error ? { status: "error", error: request.error } : { status: "loading" }
    ]))
  };
}

export function createWorkspaceChildPageCommand(
  project: WorkspaceProjectState,
  options: { includeMessages?: boolean } = {}
): WorkspaceChildCommand | undefined {
  const payload: WorkspaceChildCommand["payload"] = {
    projectId: project.id,
    ...(project.filePathsNextCursor ? { filePaths: { cursor: project.filePathsNextCursor, limit: 512 } } : {}),
    ...(project.threadsNextCursor ? { threads: { cursor: project.threadsNextCursor, limit: 256 } } : {}),
    ...(options.includeMessages !== false && project.messagesNextCursor
      ? { messages: { threadId: project.activeThreadId, cursor: project.messagesNextCursor, limit: 256 } }
      : {}),
    ...(project.runSummariesNextCursor
      ? { runSummaries: { threadId: project.activeThreadId, cursor: project.runSummariesNextCursor, limit: 128 } }
      : {})
  };
  if (!(payload.filePaths || payload.threads || payload.messages || payload.runSummaries)) return undefined;
  return { type: "workspace.projectChildren.list", requestId: createRequestId(), payload };
}

export function createWorkspaceMessagePageCommand(project: WorkspaceProjectState): WorkspaceChildCommand | undefined {
  if (!project.messagesNextCursor) return undefined;
  return {
    type: "workspace.projectChildren.list",
    requestId: createRequestId(),
    payload: {
      projectId: project.id,
      messages: { threadId: project.activeThreadId, cursor: project.messagesNextCursor, limit: 256 }
    }
  };
}

export function workspaceChildPageMatchesRequest(
  command: WorkspaceChildCommand,
  event: WorkspaceChildPageEvent
) {
  const expected = (["filePaths", "threads", "messages", "runSummaries"] as const)
    .filter((collection) => command.payload[collection])
    .sort()
    .join(",");
  const threadsMatch = !command.payload.messages || command.payload.messages.threadId === event.payload.messages?.threadId;
  const runsMatch = !command.payload.runSummaries ||
    command.payload.runSummaries.threadId === event.payload.runSummaries?.threadId;
  return [...event.payload.collections].sort().join(",") === expected && threadsMatch && runsMatch;
}

export function workspaceChildPages(event: WorkspaceChildPageEvent) {
  return [
    ["filePaths", event.payload.filePaths],
    ["threads", event.payload.threads],
    ["messages", event.payload.messages?.page],
    ["runSummaries", event.payload.runSummaries?.page]
  ] as const;
}

export function createUnavailableWorkspaceChildCommand(
  project: WorkspaceProjectState,
  collections: ReadonlySet<WorkspaceCollection>
): WorkspaceChildCommand {
  return {
    type: "workspace.projectChildren.list",
    requestId: createRequestId(),
    payload: {
      projectId: project.id,
      filePaths: collections.has("filePaths") ? {} : undefined,
      threads: collections.has("threads") ? {} : undefined,
      messages: collections.has("messages") ? { threadId: project.activeThreadId } : undefined,
      runSummaries: collections.has("runSummaries") ? { threadId: project.activeThreadId } : undefined
    }
  };
}
