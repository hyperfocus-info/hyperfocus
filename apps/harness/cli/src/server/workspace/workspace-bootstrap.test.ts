import { expect, test } from "bun:test";
import { CHAT_MESSAGE_CONTENT_MAX_CHARS, createChatMessage, createEmptySession, createProjectId, createSessionId, createWorkspaceProjectState } from "@hyperfocus/ai-core/protocol";
import { listWorkspaceProjectFilePaths, shrinkWorkspaceBootstrap } from "./workspace-bootstrap";
import { createWorkspaceRepository } from "../../workspace-repository";
import { loadBoundedProjectState } from "./project-events";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { resolveHarnessTestTempRoot } from "../../test-support/test-temp-root";

const pager = { listWorkspaceThreadMessages: () => ({ items: [], nextCursor: "opaque-message", totalApprox: 1 }),
  listWorkspaceThreadRunSummaries: () => ({ items: [], nextCursor: "opaque-run", totalApprox: 1 }) };

test("forced ready shrinking preserves message continuation", () => {
  const project = createWorkspaceProjectState({ id: createProjectId(), name: "Shrunk", rootPath: "C:/shrunk" });
  project.session = { ...createEmptySession(createSessionId()), messages: Array.from({ length: 16 }, (_, index) =>
    createChatMessage("user", `message ${index}`)) };
  const workspace = { projects: [project], activeProjectId: project.id };
  shrinkWorkspaceBootstrap(workspace, pager);
  expect(project.session.messages).toEqual([]); expect(project.messagesNextCursor).toBe("opaque-message");
});

test("forced ready shrinking evicts one oversized message with restart continuation", () => {
  const project = createWorkspaceProjectState({ id: createProjectId(), name: "Huge", rootPath: "C:/huge" });
  project.session = { ...createEmptySession(createSessionId()), messages: [createChatMessage("user", "x".repeat(1024))] };
  expect(shrinkWorkspaceBootstrap({ projects: [project], activeProjectId: project.id }, pager)).toBe(true);
  expect(project.session.messages).toEqual([]); expect(project.messagesNextCursor).toBe("__start__");
});

test("file shrinking preserves exact continuation for many and single prefixes", () => {
  for (const count of [5, 1]) {
    const project = createWorkspaceProjectState({ id: createProjectId(), name: "Files", rootPath: "C:/files" });
    project.filePaths = Array.from({ length: count }, (_, index) => `src/${index}.ts`);
    const original = [...project.filePaths]; const workspace = { projects: [project], activeProjectId: project.id };
    expect(shrinkWorkspaceBootstrap(workspace, pager)).toBe(true);
    const rest = listWorkspaceProjectFilePaths({ ...project, filePaths: original }, { cursor: project.filePathsNextCursor });
    expect([...project.filePaths!, ...rest.items]).toEqual(original);
  }
});

test("production shrink cursors continue through the repository without gaps", () => {
  const root = path.join(resolveHarnessTestTempRoot(), `bootstrap-${crypto.randomUUID()}`); mkdirSync(root, { recursive: true });
  const repository = createWorkspaceRepository(":memory:", root, { durability: "test-fast" }); const project = repository.addProject(root);
  for (let index = 0; index < 24; index += 1) repository.appendMessage(project.id, "user", `message ${index}`);
  const bounded = loadBoundedProjectState(repository, repository.getWorkspaceProjectCatalogEntry(project.id)!);
  shrinkWorkspaceBootstrap({ projects: [bounded], activeProjectId: bounded.id }, repository);
  const firstIds = bounded.session.messages.map(({ id }) => id); const older = repository.listWorkspaceThreadMessages(
    bounded.id, bounded.activeThreadId, { cursor: bounded.messagesNextCursor, limit: 16 });
  expect(new Set([...firstIds, ...older.items.map(({ id }) => id)]).size).toBe(24);
});

test("oversized message replacement rejects before changing durable content", () => {
  const root = path.join(resolveHarnessTestTempRoot(), `message-limit-${crypto.randomUUID()}`); mkdirSync(root, { recursive: true });
  const repository = createWorkspaceRepository(":memory:", root, { durability: "test-fast" }); const project = repository.addProject(root);
  const updated = repository.appendMessage(project.id, "assistant", "safe"); const message = updated.session.messages.at(-1)!;
  expect(() => repository.updateThreadMessage(project.id, project.activeThreadId, message.id,
    { content: "x".repeat(CHAT_MESSAGE_CONTENT_MAX_CHARS + 1) })).toThrow("persisted content limit");
  expect(repository.getProject(project.id).session.messages.at(-1)?.content).toBe("safe");
});
