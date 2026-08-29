/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createProjectThreadSummary } from "@hyperfocus/ai-core/protocol";
import { createHarnessStateFixture, createViewProjectFixture } from "../utils/tests/test-fixtures";
import { clearBrowserStateForTests } from "../utils/tests/store-test-utils";
import { createUiTest, requireButton } from "../utils/tests/test-harness";
import { ThreadCleanupDialog } from "./thread-cleanup-dialog";

createUiTest("ThreadCleanupDialog", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("previews matching threads and submits selected projects", async () => {
    const project = createViewProjectFixture({
      id: "project-cleanup",
      activeThreadId: "thread-active",
      threads: [
        createProjectThreadSummary({
          id: "thread-active",
          title: "Active thread",
          titleSource: "generated",
          updatedAt: "2026-04-25T00:00:00.000Z",
          lastUserMessageAt: "2026-04-25T00:00:00.000Z"
        }),
        createProjectThreadSummary({
          id: "thread-old",
          title: "Old thread",
          titleSource: "generated",
          updatedAt: "2026-01-01T00:00:00.000Z",
          lastUserMessageAt: "2026-01-01T00:00:00.000Z"
        })
      ]
    });
    const state = createHarnessStateFixture({
      workspace: {
        activeProjectId: project.id,
        projects: [project]
      }
    });
    const submissions: Array<{ projectIds?: string[]; olderThanMs: number }> = [];

    render(() => (
      <ThreadCleanupDialog
        open
        projects={state.workspace.projects}
        activeProjectId={project.id}
        onClose={() => undefined}
        onSubmit={(input) => submissions.push(input)}
      />
    ));

    expect(document.querySelector("[data-test-thread-cleanup-dialog]")).not.toBeNull();
    await Promise.resolve();
    expect(screen.getByText("1 threads match")).not.toBeNull();
    const submitButton = requireButton(screen.getByRole("button", { name: "Archive old threads" }));
    expect(submitButton.disabled).toBe(false);
    fireEvent.click(submitButton);

    expect(submissions).toEqual([
      {
        projectIds: ["project-cleanup"],
        olderThanMs: 30 * 24 * 60 * 60 * 1000
      }
    ]);
  });
});
