import { expect, test } from "bun:test";
import { createChatMessage, type ClientCommand, type ServerEvent } from "@hyperfocus/ai-core/protocol";
import { createViewProjectFixture } from "../utils/tests/test-fixtures";
import {
  applyWorkspacePageEvent,
  createWorkspacePageRequests,
  WORKSPACE_MESSAGE_CACHE_LIMIT
} from "./workspace-page-state";

test("workspace paging retries every collection and cancels obsolete ownership", () => {
  const first = { ...createViewProjectFixture({ id: "project-first" }), filePathsNextCursor: "files-next", threadsNextCursor: "threads-next",
    messagesNextCursor: "messages-next", runSummariesNextCursor: "runs-next" };
  const second = { ...createViewProjectFixture({ id: "project-second" }), threadsNextCursor: "second-threads" };
  const workspace = { activeProjectId: first.id, projects: [first, second], projectsNextCursor: "projects-next" };
  const commands: ClientCommand[] = [];
  const pages = createWorkspacePageRequests({ getWorkspace: () => workspace,
    sendCommand(command) { commands.push(command); return true; } });
  pages.ready();
  const reject = (requestId: string): Extract<ServerEvent, { type: "command.rejected" }> => ({
    type: "command.rejected", requestId, payload: { message: "Temporary failure" }
  });

  for (let attempt = 0; attempt < 4; attempt += 1) pages.rejected(reject(pages.getProjectsRequest()!.id));
  expect(pages.getProjectsError()).toBe("Temporary failure");
  expect(commands.filter((command) => command.type === "workspace.projects.list")).toHaveLength(4);

  const firstChild = pages.getChildRequest(first.id)!;
  pages.rejected(reject(firstChild.requestId));
  const retriedChild = pages.getChildRequest(first.id)!;
  expect(retriedChild.requestId).not.toBe(firstChild.requestId);
  expect(retriedChild.payload).toEqual(firstChild.payload);
  for (let attempt = 1; attempt < 4; attempt += 1) pages.rejected(reject(pages.getChildRequest(first.id)!.requestId));
  expect(pages.getChildError(first.id)).toBe("Temporary failure");

  pages.handle({ type: "project.activated", requestId: "activate", payload: { projectId: second.id } });
  expect(pages.getChildRequest(first.id)).toBeUndefined();
  expect(pages.getChildRequest(second.id)?.payload.threads?.cursor).toBe("second-threads");
  pages.ready();
  expect(pages.getProjectsError()).toBeUndefined();
  expect(pages.getProjectsRequest()?.cursor).toBe("projects-next");
});

test("invalid workspace cursors restart requested collections from their first page", () => {
  const project = { ...createViewProjectFixture({ id: "project" }), filePathsNextCursor: "files-next", threadsNextCursor: "threads-next",
    messagesNextCursor: "messages-next", runSummariesNextCursor: "runs-next" };
  const commands: ClientCommand[] = [];
  const pages = createWorkspacePageRequests({ getWorkspace: () => ({ activeProjectId: project.id, projects: [project],
      projectsNextCursor: "projects-next" }), sendCommand(command) { commands.push(command); return true; } });
  pages.ready();
  const rejected = (requestId: string): Extract<ServerEvent, { type: "command.rejected" }> => ({ type: "command.rejected",
    requestId, payload: { message: "Expired", code: "invalid-cursor" } });
  pages.rejected(rejected(pages.getProjectsRequest()!.id));
  pages.rejected(rejected(pages.getChildRequest(project.id)!.requestId));
  expect(commands.at(-2)).toMatchObject({ type: "workspace.projects.list", payload: { limit: 128 } });
  expect(commands.at(-1)).toMatchObject({ type: "workspace.projectChildren.list", payload: { projectId: project.id,
    filePaths: { limit: 512 }, threads: { limit: 256 },
    runSummaries: { threadId: project.activeThreadId, limit: 128 } } });
});

test("message history pages only on demand and stops at the bounded UI cache", () => {
  const latest = createChatMessage("assistant", "Latest", { id: "latest" });
  const project = { ...createViewProjectFixture({
    session: { ...createViewProjectFixture().session, messages: [latest] }
  }), messagesNextCursor: "messages-next" };
  let workspace = { activeProjectId: project.id, projects: [project] };
  const commands: ClientCommand[] = [];
  const pages = createWorkspacePageRequests({ getWorkspace: () => workspace,
    sendCommand(command) { commands.push(command); return true; } });
  pages.ready();
  expect(commands).toHaveLength(0);
  pages.requestMessages(project.id);
  expect(commands).toEqual([{ type: "workspace.projectChildren.list", requestId: expect.any(String), payload: {
    projectId: project.id,
    messages: { threadId: project.activeThreadId, cursor: "messages-next", limit: 256 }
  } }]);

  const older = Array.from({ length: WORKSPACE_MESSAGE_CACHE_LIMIT + 50 }, (_, index) =>
    createChatMessage("assistant", `Older ${index}`, { id: `older-${index}` }));
  const event: Extract<ServerEvent, { type: "workspace.projectChildren.listed" }> = {
    type: "workspace.projectChildren.listed",
    requestId: commands[0].requestId,
    payload: { projectId: project.id, collections: ["messages"], messages: {
      threadId: project.activeThreadId,
      page: { items: older, nextCursor: "still-older" }
    } }
  };
  workspace = applyWorkspacePageEvent(workspace, event, (next) => ({ ...project, ...next }));
  expect(workspace.projects[0].session.messages).toHaveLength(WORKSPACE_MESSAGE_CACHE_LIMIT);
  expect(workspace.projects[0].session.messages.at(-1)?.id).toBe("latest");
  expect(new Set(workspace.projects[0].session.messages.map(({ id }) => id)).size).toBe(WORKSPACE_MESSAGE_CACHE_LIMIT);
  expect(workspace.projects[0].messagesNextCursor).toBeUndefined();
});

test("activation deterministically retries page commands that could not be sent", () => {
  const project = { ...createViewProjectFixture({ id: "project-unsent" }), filePathsNextCursor: "files-next" };
  let canSend = false;
  const commands: ClientCommand[] = [];
  const pages = createWorkspacePageRequests({ getWorkspace: () => ({ activeProjectId: project.id, projects: [project],
      projectsNextCursor: "projects-next" }), sendCommand(command) { commands.push(command); return canSend; } });
  pages.ready();
  expect(pages.getProjectsError()).toBe("Workspace page request was not sent.");
  expect(pages.getChildError(project.id)).toBe("Workspace child-page request was not sent.");
  canSend = true;
  pages.handle({ type: "project.activated", requestId: "activate", payload: { projectId: project.id } });
  expect(pages.getProjectsError()).toBeUndefined();
  expect(pages.getChildError(project.id)).toBeUndefined();
  expect(commands.filter((command) => command.type === "workspace.projects.list")).toHaveLength(2);
  expect(commands.filter((command) => command.type === "workspace.projectChildren.list")).toHaveLength(2);
});

test("workspace retry actions from an older connection generation are inert", () => {
  const project = { ...createViewProjectFixture(), threadsNextCursor: "next" };
  let retry: (() => void) | undefined;
  const commands: ClientCommand[] = [];
  const pages = createWorkspacePageRequests({ getWorkspace: () => ({ activeProjectId: project.id, projects: [project] }),
    sendCommand(command) { commands.push(command); return false; },
    onTerminalError: (_message, action) => { retry ??= action; } });
  pages.ready();
  const priorCount = commands.length;
  pages.reset(); retry?.();
  expect(commands).toHaveLength(priorCount);
});

test("workspace pages report oversized identities and later clear recovered rows", () => {
  const project = { ...createViewProjectFixture(), threadsNextCursor: "next" };
  const unavailable: string[] = []; const available: string[] = [];
  const pages = createWorkspacePageRequests({ getWorkspace: () => ({ activeProjectId: project.id, projects: [project] }),
    sendCommand: () => true, onUnavailable: (_collection, ids) => unavailable.push(...ids),
    onAvailable: (_collection, ids) => available.push(...ids) });
  pages.requestChildren(project.id);
  const requestId = pages.getChildRequest(project.id)?.requestId ?? "missing";
  pages.applied({ type: "workspace.projectChildren.listed", requestId, payload: { projectId: project.id, collections: ["threads"],
    threads: { items: [], unavailableItems: [{ id: "oversized-thread", reason: "item-too-large" }] } } });
  expect(unavailable).toEqual(["oversized-thread"]);
  pages.requestChildren(project.id);
  pages.applied({ type: "workspace.projectChildren.listed", requestId: pages.getChildRequest(project.id)?.requestId ?? "missing",
    payload: { projectId: project.id, collections: ["threads"], threads: { items: [project.threads[0]!] } } });
  expect(available).toContain(project.threads[0]!.id);
});

test("workspace unavailable retry batches collections that share a project owner", () => {
  const project = createViewProjectFixture(); const commands: ClientCommand[] = [];
  const pages = createWorkspacePageRequests({ getWorkspace: () => ({ activeProjectId: project.id, projects: [project] }),
    sendCommand(command) { commands.push(command); return true; } });
  pages.retryUnavailable(new Set(["threads", "messages"]), project.id);
  expect(commands).toEqual([{ type: "workspace.projectChildren.list", requestId: expect.any(String), payload: {
    projectId: project.id, filePaths: undefined, threads: {}, messages: { threadId: project.activeThreadId },
    runSummaries: undefined } }]);
});

test("a complete project mutation reconciles an archived unavailable thread in its owned scope", () => {
  const project = createViewProjectFixture(); const reconciled: Array<{ collection: string; ids: string[]; projectId?: string }> = [];
  const pages = createWorkspacePageRequests({ getWorkspace: () => ({ activeProjectId: project.id, projects: [project] }),
    sendCommand: () => true, onReconciled: (collection, ids, projectId) => reconciled.push({ collection, ids, projectId }) });
  pages.handle({ type: "project.updated", requestId: "archive", payload: { projectId: project.id, project } });
  expect(reconciled).toContainEqual({ collection: "threads", ids: [], projectId: project.id });
});

test("invalid cursors discard unavailable evidence from abandoned catalog and child revisions", () => {
  const project = { ...createViewProjectFixture(), threadsNextCursor: "threads-2" };
  const workspace: { activeProjectId?: string; projects: typeof project[]; projectsNextCursor?: string } = {
    activeProjectId: project.id, projects: [project], projectsNextCursor: "projects-2" };
  const reconciled: string[] = [];
  const pages = createWorkspacePageRequests({ getWorkspace: () => workspace, sendCommand: () => true,
    onUnavailable: () => undefined, onReconciled: (collection, ids) => { if (ids.length === 0) reconciled.push(collection); } });
  pages.ready();
  pages.applied({ type: "workspace.projects.listed", requestId: pages.getProjectsRequest()!.id, payload: { projects: {
    items: [], nextCursor: "projects-3", unavailableItems: [{ id: "deleted-project", reason: "item-too-large" }] } } });
  workspace.projectsNextCursor = "projects-3";
  const childId = pages.getChildRequest(project.id)!.requestId; project.threadsNextCursor = "threads-3";
  pages.applied({ type: "workspace.projectChildren.listed", requestId: childId, payload: { projectId: project.id, collections: ["threads"],
    threads: { items: [], nextCursor: "threads-3", unavailableItems: [{ id: "archived-thread", reason: "item-too-large" }] } } });
  pages.rejected({ type: "command.rejected", requestId: pages.getProjectsRequest()!.id,
    payload: { code: "invalid-cursor", message: "expired" } });
  pages.rejected({ type: "command.rejected", requestId: pages.getChildRequest(project.id)!.requestId,
    payload: { code: "invalid-cursor", message: "expired" } });
  pages.applied({ type: "workspace.projects.listed", requestId: pages.getProjectsRequest()!.id,
    payload: { projects: { items: [] } } });
  pages.applied({ type: "workspace.projectChildren.listed", requestId: pages.getChildRequest(project.id)!.requestId,
    payload: { projectId: project.id, collections: ["threads"], threads: { items: [] } } });
  expect(reconciled).toEqual(expect.arrayContaining(["projects", "threads"]));
});

test("partial and wrong-thread child responses exhaust bounded recovery without consuming ownership", () => {
  const project = createViewProjectFixture(); const commands: ClientCommand[] = []; const recoveries: Array<() => void> = [];
  const pages = createWorkspacePageRequests({ getWorkspace: () => ({ activeProjectId: project.id, projects: [project] }),
    sendCommand(command) { commands.push(command); return true; }, onTerminalError: (_message, retry) => recoveries.push(retry) });
  pages.retryUnavailable(new Set(["threads", "messages"]), project.id);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const requestId = pages.getChildRequest(project.id)!.requestId;
    const event: Extract<ServerEvent, { type: "workspace.projectChildren.listed" }> = attempt % 2 === 0
      ? { type: "workspace.projectChildren.listed", requestId, payload: { projectId: project.id,
        collections: ["threads"], threads: { items: [] } } }
      : { type: "workspace.projectChildren.listed", requestId, payload: { projectId: project.id,
        collections: ["threads", "messages"], threads: { items: [] },
        messages: { threadId: "wrong-thread", page: { items: [] } } } };
    expect(pages.accepts(event)).toBe(false);
  }
  expect(recoveries).toHaveLength(1); expect(pages.getChildError(project.id)).toContain("did not match");
  const beforeRecovery = commands.length; recoveries[0]?.();
  expect(commands).toHaveLength(beforeRecovery + 1);
});

test("activation makes an exhausted mismatch recovery inert", () => {
  const first = createViewProjectFixture({ id: "project-first" });
  const second = { ...createViewProjectFixture({ id: "project-second" }), threadsNextCursor: "second-next" };
  const workspace = { activeProjectId: first.id, projects: [first, second] }; const commands: ClientCommand[] = [];
  let recovery: (() => void) | undefined;
  const pages = createWorkspacePageRequests({ getWorkspace: () => workspace,
    sendCommand(command) { commands.push(command); return true; }, onTerminalError: (_message, retry) => { recovery = retry; } });
  pages.retryUnavailable(new Set(["threads", "messages"]), first.id);
  for (let attempt = 0; attempt < 4; attempt += 1) expect(pages.accepts({ type: "workspace.projectChildren.listed",
    requestId: pages.getChildRequest(first.id)!.requestId, payload: { projectId: first.id,
      collections: ["threads"], threads: { items: [] } } })).toBe(false);
  workspace.activeProjectId = second.id;
  pages.handle({ type: "project.activated", requestId: "activate", payload: { projectId: second.id } });
  const count = commands.length; recovery?.();
  expect(commands).toHaveLength(count); expect(pages.getChildRequest(first.id)).toBeUndefined();
});

test("a newer project mutation makes an old command-rejection recovery inert", () => {
  const project = { ...createViewProjectFixture(), threadsNextCursor: "threads-next" }; const commands: ClientCommand[] = [];
  let recovery: (() => void) | undefined;
  const pages = createWorkspacePageRequests({ getWorkspace: () => ({ activeProjectId: project.id, projects: [project] }),
    sendCommand(command) { commands.push(command); return true; }, onTerminalError: (_message, retry) => { recovery = retry; } });
  pages.ready();
  for (let attempt = 0; attempt < 4; attempt += 1) pages.rejected({ type: "command.rejected",
    requestId: pages.getChildRequest(project.id)!.requestId, payload: { message: "temporary" } });
  pages.handle({ type: "project.updated", requestId: "newer", payload: { projectId: project.id, project } });
  const currentId = pages.getChildRequest(project.id)!.requestId; const count = commands.length; recovery?.();
  expect(commands).toHaveLength(count); expect(pages.getChildRequest(project.id)!.requestId).toBe(currentId);
});

test("catalog recovery actions cannot overwrite activation's newer owner", () => {
  for (const failure of ["unsent", "rejected"] as const) {
    const project = createViewProjectFixture(); const workspace = { activeProjectId: project.id, projects: [project],
      projectsNextCursor: "projects-next" }; const commands: ClientCommand[] = []; let recovery: (() => void) | undefined;
    let canSend = failure !== "unsent";
    const pages = createWorkspacePageRequests({ getWorkspace: () => workspace,
      sendCommand(command) { commands.push(command); return canSend; }, onTerminalError: (_message, retry) => { recovery = retry; } });
    pages.ready();
    if (failure === "rejected") for (let attempt = 0; attempt < 4; attempt += 1) pages.rejected({ type: "command.rejected",
      requestId: pages.getProjectsRequest()!.id, payload: { message: "temporary" } });
    canSend = true; pages.handle({ type: "project.activated", requestId: "activate", payload: { projectId: project.id } });
    const currentId = pages.getProjectsRequest()!.id; const count = commands.length; recovery?.();
    expect(commands).toHaveLength(count); expect(pages.getProjectsRequest()!.id).toBe(currentId);
  }
});

test("new child owners receive a fresh malformed-response budget", () => {
  for (const replacement of ["mutation", "retry-all", "invalid-cursor", "command-rejected"] as const) {
    const project = { ...createViewProjectFixture(), threadsNextCursor: "threads-next" }; const recoveries: Array<() => void> = [];
    const pages = createWorkspacePageRequests({ getWorkspace: () => ({ activeProjectId: project.id, projects: [project] }),
      sendCommand: () => true, onTerminalError: (_message, retry) => recoveries.push(retry) });
    pages.retryUnavailable(new Set(["threads"]), project.id);
    const mismatch = () => pages.accepts({ type: "workspace.projectChildren.listed",
      requestId: pages.getChildRequest(project.id)!.requestId, payload: { projectId: project.id,
        collections: ["filePaths"], filePaths: { items: [] } } });
    mismatch(); mismatch();
    if (replacement === "mutation") pages.handle({ type: "project.updated", requestId: "new", payload: { projectId: project.id, project } });
    else if (replacement === "retry-all") pages.retryUnavailable(new Set(["threads"]), project.id);
    else pages.rejected({ type: "command.rejected", requestId: pages.getChildRequest(project.id)!.requestId,
      payload: { message: "replace", code: replacement === "invalid-cursor" ? "invalid-cursor" : undefined } });
    mismatch(); mismatch(); mismatch();
    expect(recoveries).toEqual([]);
  }
});
