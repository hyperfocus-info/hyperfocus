/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { createSignal } from "solid-js";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../../../utils/tests/test-harness";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "../../../utils/tests/store-test-utils";
import { createHarnessStateFixture, createViewProjectFixture } from "../../../utils/tests/test-fixtures";
import { terminalStore } from "../../../terminal/terminal-store";
import { TerminalHistoryDialog } from "../../../terminal/terminal-history-dialog";
import { ThreadCleanupDialog } from "../../thread-cleanup-dialog";
import { ChatPanel } from "../../chat-panel";
import { HelpTutorialDialog } from "../../help-tutorial-dialog";

createUiTest("Batch three task recovery", () => {
  beforeEach(() => clearBrowserStateForTests());

  it("dismisses history when selecting a terminal so its destination is exposed", () => {
    terminalStore.resetForTests({ open: false, history: { sessions: [{ id: "terminal-1", projectId: "project-1", name: "Verification terminal", shellId: "pwsh", cwd: "C:/fixture", status: "running", rows: 24, cols: 80, startedAt: "2026-09-21", updatedAt: "2026-09-21" }] } });
    const [open, setOpen] = createSignal(true);
    render(() => <TerminalHistoryDialog open={open()} title="History" scope={undefined} onClose={() => setOpen(false)} />);
    fireEvent.click(screen.getByRole("button", { name: "Focus Verification terminal" }));
    expect(terminalStore.state.open).toBe(true);
    expect(terminalStore.state.focusedSessionId).toBe("terminal-1");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("associates correctable duration feedback and distinguishes an empty project selection", () => {
    const project = createViewProjectFixture();
    render(() => <ThreadCleanupDialog open projects={[project]} activeProjectId={project.id} onClose={() => undefined} onSubmit={() => undefined} />);
    const age = screen.getByRole("textbox", { name: "Older than" });
    fireEvent.input(age, { target: { value: "invalid" } });
    expect(age.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(age.getAttribute("aria-describedby") ?? "")?.textContent).toContain("Use a duration");
    fireEvent.input(age, { target: { value: "30d" } });
    expect(age.getAttribute("aria-invalid")).toBe("false");
    fireEvent.click(screen.getByRole("checkbox", { name: project.name }));
    expect(screen.getByRole("status").textContent).toBe("Select at least one project.");
  });

  it("exposes complete project and thread identity from the compact header", () => {
    const project = createViewProjectFixture({ name: "Customer workspace recovery", rootPath: "C:/customer-workspace" });
    seedHarnessStoreForTests(createHarnessStateFixture({ workspace: { activeProjectId: project.id, projects: [project] } }));
    render(() => <ChatPanel />);
    fireEvent.click(screen.getByRole("button", { name: "View current project and thread" }));
    expect(screen.getByRole("dialog").textContent).toContain("Customer workspace recovery");
    expect(screen.getByRole("dialog").textContent).toContain("C:/customer-workspace");
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("names completed walkthrough actions as restart while retaining the same tutorial", () => {
    const selected: string[] = [];
    render(() => <HelpTutorialDialog open setup={{ launchMode: "source", updatedAt: "2026-09-21", readyRequiredCount: 1, totalRequiredCount: 1, checks: [] }} completedTutorialIds={["open-project"]} dismissedTutorialIds={[]} satisfiedTutorialIds={[]} onClose={() => undefined} onStartTutorial={id => selected.push(id)} />);
    fireEvent.click(screen.getByRole("button", { name: "Restart Open a project" }));
    expect(selected).toEqual(["open-project"]);
  });
});
