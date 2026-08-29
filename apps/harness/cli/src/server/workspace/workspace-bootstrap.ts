import type { AgentRunSummary, ChatMessage, ProjectId, ThreadId, WorkspaceProjectState, WorkspaceState } from "@hyperfocus/ai-core/protocol";
type CursorPage<Item> = { items: Item[]; nextCursor?: string };
export interface WorkspaceBootstrapPager {
  listWorkspaceThreadMessages(projectId: ProjectId, threadId: ThreadId, input: { limit: number }): CursorPage<ChatMessage>;
  listWorkspaceThreadRunSummaries(projectId: ProjectId, threadId: ThreadId, input: { limit: number }): CursorPage<AgentRunSummary>;
}

export const WORKSPACE_PROJECT_PAGE_SIZE = 128;
export const WORKSPACE_THREAD_PAGE_SIZE = 256;
export const WORKSPACE_MESSAGE_PAGE_SIZE = 16;
export const WORKSPACE_RUN_PAGE_SIZE = 128;
export const WORKSPACE_FILE_PAGE_SIZE = 512;

function valuePage(items: string[], cursor: string | undefined, limit: number) {
  const cursorIndex = cursor && cursor !== "__start__" ? items.indexOf(cursor) : -1;
  if (cursor && cursor !== "__start__" && cursorIndex < 0) throw invalidWorkspaceCursor(); const start = cursorIndex + 1;
  const pageItems = items.slice(start, start + limit);
  return { items: pageItems, nextCursor: start + pageItems.length < items.length ? pageItems.at(-1) : undefined, totalApprox: items.length };
}
function invalidWorkspaceCursor() { return Object.assign(new Error("Invalid or stale workspace page cursor"), { code: "invalid-cursor" as const }); }

export function shrinkWorkspaceBootstrap(workspace: WorkspaceState, repository: WorkspaceBootstrapPager) {
  const active = workspace.projects.find((project) => project.id === workspace.activeProjectId);
  if (!active) return false;
  if (active.session.messages.length > 0) {
    const limit = Math.floor(active.session.messages.length / 2);
    if (limit > 0) { const page = repository.listWorkspaceThreadMessages(active.id, active.activeThreadId, { limit });
      active.session.messages = page.items; active.messagesNextCursor = page.nextCursor; }
    else { active.session.messages = []; active.messagesNextCursor = "__start__"; }
    return true;
  }
  if ((active.filePaths?.length ?? 0) > 0) { active.filePaths = active.filePaths!.slice(0, Math.floor(active.filePaths!.length / 2));
    active.filePathsNextCursor = active.filePaths.at(-1) ?? "__start__"; return true; }
  if (active.runSummaries.length > 0) { const limit = Math.floor(active.runSummaries.length / 2);
    if (limit > 0) { const page = repository.listWorkspaceThreadRunSummaries(active.id, active.activeThreadId, { limit });
      active.runSummaries = page.items; active.runSummariesNextCursor = page.nextCursor; }
    else { active.runSummaries = []; active.runSummariesNextCursor = "__start__"; }
    return true;
  }
  if (active.threads.length > 1) { active.threads = active.threads.filter((thread) => thread.id === active.activeThreadId);
    active.threadsNextCursor = "__start__"; return true; }
  if (workspace.projects.length > 1) { workspace.projects = [active]; workspace.projectsNextCursor = "__start__"; return true; }
  return false;
}

export function listWorkspaceProjectFilePaths(project: WorkspaceProjectState, input: { cursor?: string; limit?: number }) {
  return valuePage(project.filePaths ?? [], input.cursor, Math.min(input.limit ?? WORKSPACE_FILE_PAGE_SIZE, WORKSPACE_FILE_PAGE_SIZE));
}
