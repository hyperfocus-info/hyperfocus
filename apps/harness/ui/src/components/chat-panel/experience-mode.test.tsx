/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createChatMessage, createEmptySession } from "@hyperfocus/ai-core/protocol";
import { createUiTest } from "../../utils/tests/test-harness";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "../../utils/tests/store-test-utils";
import { createHarnessStateFixture, createRunFixture, createViewProjectFixture } from "../../utils/tests/test-fixtures";
import { harnessStore } from "../../harness-store";
import { ChatPanel } from "../chat-panel";

createUiTest("ChatPanel experience modes", () => {
  beforeEach(clearBrowserStateForTests);

  it("keeps simple mode focused while preserving run details on demand", async () => {
    const now = new Date().toISOString();
    const project = createViewProjectFixture({
      id: "project-simple-mode",
      session: {
        ...createEmptySession("thread-1"),
        isStreaming: true,
        messages: [createChatMessage("assistant", "Technical orchestration milestone", {
          kind: "run-milestones",
          metadata: {
            type: "run-milestones", runId: "run-simple", windowId: "window-simple", status: "open",
            startedAt: now, updatedAt: now, lineCount: 1,
          },
        })],
      },
      streamingHeartbeatMessages: [{
        id: "run-simple:heartbeat:1", content: "Spawning three subagents and invoking shell tools.",
        heartbeatCount: 1, locked: false, updatedAt: now,
      }],
      activeRun: createRunFixture({
        id: "run-simple",
        status: "running-main",
        toolActivities: [{
          id: "tool-simple", runId: "run-simple", owner: "main", toolCallId: "call-simple", toolName: "shell",
          category: "shell", command: "echo hidden-plumbing", status: "running", startedAt: now, updatedAt: now,
        }],
      }),
    });
    seedHarnessStoreForTests(createHarnessStateFixture({
      experienceMode: "simple",
      workspace: { activeProjectId: project.id, projects: [project] },
    }));

    render(() => <ChatPanel />);

    expect(screen.queryByRole("tablist", { name: "Project panes" })).toBeNull();
    expect(screen.getByRole("button", { name: "Run" })).not.toBeNull();
    expect(screen.queryByRole("tab", { name: "Plan" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Memory" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Model events" })).toBeNull();
    expect(screen.queryByText("Technical orchestration milestone")).toBeNull();
    expect(screen.queryByText("Spawning three subagents and invoking shell tools.")).toBeNull();
    expect(document.querySelector("[data-test-streamed-tool-block]")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Working");
    expect(screen.getByRole("button", { name: "More task settings" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Open task settings" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(harnessStore.state.chatPaneTab).toBe("run");
    cleanup();
    render(() => <ChatPanel />);
    expect(screen.getByRole("button", { name: "Chat" })).not.toBeNull();
    expect(screen.getByText("Run summary")).not.toBeNull();
    expect(screen.getByText("Status: running-main")).not.toBeNull();
    expect(document.body.textContent).not.toContain("hidden-plumbing");
  });

  it("keeps the current technical transcript in advanced mode", () => {
    const now = new Date().toISOString();
    const project = createViewProjectFixture({
      id: "project-advanced-mode",
      activeRun: createRunFixture({
        id: "run-advanced",
        status: "running-main",
        toolActivities: [{
          id: "tool-advanced", runId: "run-advanced", owner: "main", toolCallId: "call-advanced",
          toolName: "shell", category: "shell", command: "echo visible-in-advanced", status: "running",
          startedAt: now, updatedAt: now,
        }],
      }),
    });
    seedHarnessStoreForTests(createHarnessStateFixture({
      experienceMode: "advanced",
      workspace: { activeProjectId: project.id, projects: [project] },
    }));

    render(() => <ChatPanel />);

    expect(screen.getByRole("tab", { name: "Model events" })).not.toBeNull();
    expect(document.querySelector("[data-test-streamed-tool-block]")).not.toBeNull();
  });
});
