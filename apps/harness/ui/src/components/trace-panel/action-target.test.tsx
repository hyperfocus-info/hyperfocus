/** @jsxImportSource solid-js */
import { createProjectThreadSummary, type ClientCommand, type TerminalSession } from "@hyperfocus/ai-core/protocol";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { beforeEach, expect, it } from "bun:test";
import { createDefaultJobsPanePreferences, harnessStore } from "../../harness-store";
import { captureDispatchedCommands, clearBrowserStateForTests, seedHarnessStoreForTests } from "../../utils/tests/store-test-utils";
import { createBrowserSessionFixture, createHarnessStateFixture, createRunFixture, createSubtaskFixture, createViewProjectFixture } from "../../utils/tests/test-fixtures";
import { createUiTest, requireButton } from "../../utils/tests/test-harness";
import { terminalStore } from "../../terminal/terminal-store";
import { TracePanel } from "../trace-panel";

createUiTest("TracePanel selected thread target", () => {
  beforeEach(() => { clearBrowserStateForTests(); terminalStore.resetForTests(); });

  function mountSelectedRun(run = createRunFixture({ id: "run-b", status: "failed", retryable: true })) {
    const activeRun = run.status === "failed" ? undefined : createRunFixture({ id: "run-a", status: "running-main", retryable: true });
    const active = createViewProjectFixture({ id: "project-ab", activeThreadId: "thread-a",
      activeRun, lastRun: activeRun ?? createRunFixture({ id: "run-a", status: "failed", retryable: true }) });
    const transcript = active.threadLiveTranscriptById["thread-a"];
    if (!transcript) throw new Error("Expected active thread fixture");
    const project = createViewProjectFixture({ ...active,
      threads: [...active.threads, createProjectThreadSummary({ id: "thread-b", title: "Selected B", titleSource: "generated", updatedAt: run.updatedAt })],
      threadLiveTranscriptById: { ...active.threadLiveTranscriptById, "thread-b": {
        ...transcript, activeRun: run.status === "failed" ? undefined : run, lastRun: run,
      } } });
    seedHarnessStoreForTests(createHarnessStateFixture({ activeLeftTab: "runs",
      jobsPanePreferences: { ...createDefaultJobsPanePreferences(), selectedRunId: run.id },
      workspace: { activeProjectId: project.id, projects: [project] } }));
    const commands: ClientCommand[] = [];
    captureDispatchedCommands(commands);
    render(() => <TracePanel />);
    expect(screen.getByText("Selected B")).not.toBeNull();
    return commands;
  }

  it("disables run and subagent retry for selected inactive B instead of retrying active A", () => {
    const commands = mountSelectedRun(createRunFixture({ id: "run-b", status: "failed", retryable: true,
      subtasks: [createSubtaskFixture({ id: "task-b", status: "failed" })] }));
    for (const button of screen.getAllByRole("button", { name: /Retry/ })) {
      expect(requireButton(button).disabled).toBe(true);
      expect(button.getAttribute("aria-description")).toBe("Open this thread before retrying its run");
      fireEvent.click(button);
    }
    expect(commands).toEqual([]);
    expect(harnessStore.state.workspace.projects[0]?.activeThreadId).toBe("thread-a");
  });

  it("keeps terminal history scoped to B and rejects a late A or other-run response", () => {
    mountSelectedRun();
    const session: TerminalSession = { id: "terminal-b", projectId: "project-ab", name: "B terminal", shellId: "powershell",
      cwd: "C:\\fixture-b", status: "exited", cols: 80, rows: 24, startedAt: "2026-10-26T12:00:00Z", updatedAt: "2026-10-26T12:00:00Z" };
    const scope = { projectId: "project-ab", threadId: "thread-b", runId: "run-b" };
    terminalStore.applyServerEvent({ type: "terminal.history.listed", requestId: "history-b", payload: { scope, sessions: [session] } });
    fireEvent.click(screen.getByRole("button", { name: "Open run terminal history" }));
    expect(screen.getByText("B terminal")).not.toBeNull();
    for (const wrongScope of [{ ...scope, threadId: "thread-a" }, { ...scope, runId: "older-run-b" }, { ...scope, projectId: "other-project" }]) {
      terminalStore.applyServerEvent({ type: "terminal.history.listed", requestId: "late-history", payload: { scope: wrongScope, sessions: [session] } });
      expect(screen.queryByText("B terminal")).toBeNull();
    }
  });

  it("preserves global pause for selected B while allowing its approval rejection and history", () => {
    const commands = mountSelectedRun(createRunFixture({ id: "run-b", status: "running-main", retryable: true,
      browserSessions: [createBrowserSessionFixture({ id: "browser-b", runId: "run-b", status: "awaiting-approval",
        pendingApproval: { toolCallId: "call-b", toolName: "browser", kind: "navigate", label: "B step", status: "pending", requestedAt: "2026-10-26T12:00:00Z" } })] }));
    harnessStore.replaceStateForTests({ ...harnessStore.state, executionControl: { ...harnessStore.state.executionControl, isPaused: true } });
    captureDispatchedCommands(commands);
    for (const name of ["Refresh the active run", "Retry last run", "Approve this browser step"]) {
      const button = requireButton(screen.getByRole("button", { name }));
      expect(button.disabled).toBe(true);
      expect(button.getAttribute("aria-description")).toBe("Global execution pause is active");
      fireEvent.click(button);
    }
    expect(commands).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Reject this browser step" }));
    expect(commands[0]).toMatchObject({ type: "browser.approval.resolve", payload: {
      projectId: "project-ab", threadId: "thread-b", runId: "run-b", sessionId: "browser-b", toolCallId: "call-b", approved: false } });
    expect(harnessStore.state.executionControl.isPaused).toBe(true);
  });

  it("uses B for refresh, subagent refresh, approval and terminal history, then follows selection to A", () => {
    const commands = mountSelectedRun(createRunFixture({ id: "run-b", status: "running-subagents", retryable: false,
      subtasks: [createSubtaskFixture({ id: "task-b", status: "running" })],
      browserSessions: [createBrowserSessionFixture({ id: "browser-b", runId: "run-b", status: "awaiting-approval",
        pendingApproval: { toolCallId: "call-b", toolName: "browser", kind: "navigate", label: "B step", status: "pending", requestedAt: "2026-10-26T12:00:00Z" } })] }));
    expect(screen.queryAllByRole("button", { name: /Retry/ })).toHaveLength(0);
    const refresh = requireButton(screen.getByRole("button", { name: "Refresh the active run" }));
    const subagentRefresh = requireButton(screen.getByRole("button", { name: "Refresh this active subagent" }));
    expect(refresh.disabled).toBe(false);
    expect(subagentRefresh.disabled).toBe(false);
    fireEvent.click(refresh);
    fireEvent.click(subagentRefresh);
    fireEvent.click(screen.getByRole("button", { name: "Reject this browser step" }));
    fireEvent.click(screen.getByRole("button", { name: "Open run terminal history" }));
    const target = { projectId: "project-ab", threadId: "thread-b", runId: "run-b" };
    expect(commands).toEqual([
      expect.objectContaining({ type: "run.refresh", payload: target }),
      expect.objectContaining({ type: "run.refresh", payload: { ...target, subagentId: "task-b" } }),
      expect.objectContaining({ type: "browser.approval.resolve", payload: { ...target, sessionId: "browser-b", toolCallId: "call-b", approved: false } }),
      expect.objectContaining({ type: "terminal.history.list", payload: target }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    harnessStore.setJobsPanePreferences({ selectedRunId: "run-a" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh the active run" }));
    expect(commands.at(-1)).toMatchObject({ type: "run.refresh", payload: { projectId: "project-ab", threadId: "thread-a", runId: "run-a" } });
  });
});
