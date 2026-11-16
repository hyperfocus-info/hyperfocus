/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { harnessStore } from "../../harness-store";
import { resolveTracePanelEntity } from "../../lib/trace-panel-model";
import { createUiTest } from "../../utils/tests/test-harness";
import {
  createBackgroundJobFixture,
  createBackgroundJobRunFixture,
  createHarnessStateFixture,
  createViewProjectFixture,
} from "../../utils/tests/test-fixtures";
import {
  captureDispatchedCommands,
  clearBrowserStateForTests,
  seedHarnessStoreForTests,
} from "../../utils/tests/store-test-utils";
import { BackgroundJobsPanel } from "../background-jobs-panel";

function seedRoster(runStatus: "running" | "succeeded" = "succeeded") {
  const project = createViewProjectFixture({ id: "roster-project" });
  const first = createBackgroundJobFixture({
    id: "roster-alpha", projectId: project.id, name: "Alpha review",
    updatedAt: "2026-09-19T12:00:00.000Z",
  });
  const second = createBackgroundJobFixture({
    id: "roster-zebra", projectId: project.id, name: "Zebra cleanup", status: "paused",
    updatedAt: "2026-09-18T12:00:00.000Z",
  });
  const run = createBackgroundJobRunFixture({ id: "stale-zebra-run", jobId: second.id, projectId: project.id, status: runStatus });
  seedHarnessStoreForTests(createHarnessStateFixture({
    activeLeftTab: "jobs", activeSurface: "background-jobs",
    workspace: { activeProjectId: project.id, projects: [project] },
    backgroundJobs: { jobs: [first, second], runs: [run], templates: [] },
    jobsPanePreferences: {
      ...harnessStore.state.jobsPanePreferences,
      segment: "jobs", jobSearch: "", runSearch: "", jobSort: "updated",
      selectedJobId: first.id, selectedRunId: run.id,
    },
  }));
  return { first, second, run };
}

createUiTest("Jobs roster selection and actions", () => {
  beforeEach(clearBrowserStateForTests);

  it("ignores a stale run choice when Jobs owns the detail and trace", () => {
    const { first } = seedRoster();
    expect(resolveTracePanelEntity(harnessStore.state)).toEqual({ type: "job", jobId: first.id });
    render(() => <BackgroundJobsPanel segment="jobs" />);
    expect(screen.getByRole("heading", { name: first.name }).textContent).toBe(first.name);
    expect(screen.getByRole("button", { name: `Select ${first.name}` }).getAttribute("aria-current")).toBe("true");
  });

  it("keeps filtered roster, detail, and trace aligned and clears context for no matches", async () => {
    const { second } = seedRoster();
    render(() => <BackgroundJobsPanel segment="jobs" />);
    fireEvent.input(screen.getByLabelText("Search jobs"), { target: { value: "Zebra cleanup" } });
    await waitFor(() => expect(screen.getByRole("heading", { name: second.name }).textContent).toBe(second.name));
    expect(screen.queryByRole("button", { name: "Select Alpha review" })).toBeNull();
    expect(resolveTracePanelEntity(harnessStore.state)).toEqual({ type: "job", jobId: second.id });
    fireEvent.input(screen.getByLabelText("Search jobs"), { target: { value: "nonexistentxyz" } });
    await waitFor(() => expect(screen.queryByRole("heading", { name: second.name })).toBeNull());
    expect(resolveTracePanelEntity(harnessStore.state)).toBeUndefined();
  });

  it("keeps status filtering aligned with the trace selection", () => {
    const { second } = seedRoster();
    harnessStore.setJobsPanePreferences({ status: "paused" });
    render(() => <BackgroundJobsPanel segment="jobs" />);
    expect(resolveTracePanelEntity(harnessStore.state)).toEqual({ type: "job", jobId: second.id });
    expect(screen.getByRole("heading", { name: second.name }).textContent).toBe(second.name);
  });

  it("does not let a mounted Jobs roster overwrite later run navigation", () => {
    const { second, run } = seedRoster();
    render(() => <BackgroundJobsPanel variant="left" segment="jobs" />);
    harnessStore.setActiveLeftTab("runs");
    harnessStore.setJobsPanePreferences({ segment: "inbox", selectedRunId: run.id, selectedJobId: second.id });
    expect(harnessStore.state.jobsPanePreferences.selectedRunId).toBe(run.id);
    expect(harnessStore.state.jobsPanePreferences.selectedJobId).toBe(second.id);
    expect(resolveTracePanelEntity(harnessStore.state)).toEqual({ type: "job", jobId: second.id, runId: run.id });
  });

  it("distinguishes bulk membership from detail selection and targets only bulk members", () => {
    const { first, second } = seedRoster();
    const commands: unknown[] = [];
    captureDispatchedCommands(commands);
    render(() => <BackgroundJobsPanel segment="jobs" />);
    const firstTitle = screen.getByRole("button", { name: `Select ${first.name}` });
    const secondTitle = screen.getByRole("button", { name: `Select ${second.name}` });
    fireEvent.click(screen.getByRole("button", { name: `Add ${second.name} to bulk selection` }));
    expect(screen.getByRole("button", { name: `Remove ${second.name} from bulk selection` }).getAttribute("aria-pressed")).toBe("true");
    expect(firstTitle.getAttribute("aria-current")).toBe("true");
    expect(secondTitle.getAttribute("aria-current")).not.toBe("true");
    expect(screen.getByRole("heading", { name: first.name }).textContent).toBe(first.name);
    fireEvent.click(screen.getByRole("button", { name: "Run selected jobs now" }));
    expect(commands).toMatchObject([{ type: "bulk-operation.apply", payload: {
      action: "run-now", targets: [{ kind: "background-job", jobId: second.id, projectId: second.projectId }],
    } }]);
    fireEvent.click(screen.getByRole("button", { name: `Remove ${second.name} from bulk selection` }));
    expect(screen.getByRole("button", { name: `Add ${second.name} to bulk selection` }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByText("1 selected")).toBeNull();
  });

  it("retains run, pause, resume, edit, and delete actions inside the job disclosure", () => {
    const { first, second } = seedRoster();
    const commands: unknown[] = [];
    captureDispatchedCommands(commands);
    render(() => <BackgroundJobsPanel variant="left" segment="jobs" />);
    const firstMenu = screen.getByRole("button", { name: `Actions for ${first.name}` });
    expect(firstMenu.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menuitem", { name: "Delete" })).toBeNull();
    fireEvent.click(firstMenu);
    fireEvent.click(screen.getByRole("menuitem", { name: "Run now" }));
    fireEvent.click(firstMenu);
    fireEvent.click(screen.getByRole("menuitem", { name: "Pause" }));
    fireEvent.click(firstMenu);
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(harnessStore.state.backgroundJobEditorDraft?.jobId).toBe(first.id);
    fireEvent.click(firstMenu);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: `Actions for ${second.name}` }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Resume" }));
    expect(commands).toMatchObject([
      { type: "background-job.run-now", payload: { jobId: first.id, projectId: first.projectId } },
      { type: "background-job.pause", payload: { jobId: first.id, projectId: first.projectId } },
      { type: "background-job.delete", payload: { jobId: first.id, projectId: first.projectId } },
      { type: "background-job.resume", payload: { jobId: second.id, projectId: second.projectId } },
    ]);
    expect(harnessStore.state.jobsPanePreferences.selectedJobId).toBe(first.id);
  });

  it("disables starting another run from the roster while the job is already active", () => {
    const { first, second } = seedRoster("running");
    const commands: unknown[] = [];
    captureDispatchedCommands(commands);
    render(() => <BackgroundJobsPanel variant="left" segment="jobs" />);
    fireEvent.click(screen.getByRole("button", { name: `Actions for ${second.name}` }));
    const run = screen.getByRole("menuitem", { name: "Run now" });
    expect(run.hasAttribute("disabled")).toBe(true);
    expect(run.getAttribute("aria-description")).toContain("active run");
    fireEvent.click(run);
    expect(commands).toHaveLength(0);
    expect(harnessStore.state.jobsPanePreferences.selectedJobId).toBe(first.id);
  });
});
