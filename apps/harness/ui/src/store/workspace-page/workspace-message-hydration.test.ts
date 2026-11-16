import { expect, test } from "bun:test";
import { type ClientCommand } from "@hyperfocus/ai-core/protocol";
import { createViewProjectFixture } from "../../utils/tests/test-fixtures";
import { createWorkspacePageRequests } from "../workspace-page-state";

test("activating a persisted shell loads its first message page without draining older history", () => {
  const project = { ...createViewProjectFixture({ id: "saved" }), messagesNextCursor: "__start__" };
  project.session.messages = [];
  const commands: ClientCommand[] = [];
  const pages = createWorkspacePageRequests({ getWorkspace: () => ({ activeProjectId: project.id, projects: [project] }),
    sendCommand(command) { commands.push(command); return true; } });
  pages.handle({ type: "project.activated", requestId: "activate", payload: { projectId: project.id } });
  expect(pages.getChildRequest(project.id)?.payload.messages).toEqual({ threadId: project.activeThreadId, cursor: "__start__", limit: 256 });
  pages.reset(); project.messagesNextCursor = "older-page";
  pages.ready();
  expect(pages.getChildRequest(project.id)).toBeUndefined();
  expect(commands).toHaveLength(1);
});
