/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import {  fireEvent, render, screen } from "@solidjs/testing-library";
import {   type BackgroundJob } from "@hyperfocus/ai-core/protocol";
import {  harnessStore } from "../../harness-store";
import { createUiTest } from "../../utils/tests/test-harness";
import {  clearBrowserStateForTests, seedHarnessStoreForTests } from "../../utils/tests/store-test-utils";
import { createHarnessStateFixture, createViewProjectFixture } from "../../utils/tests/test-fixtures";
import { BackgroundJobsPanel } from "../background-jobs-panel";

createUiTest("BackgroundJobsPanel filters", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("uses shared left pane shell and empty-state hooks for jobs", () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "jobs",
        activeSurface: "background-jobs",
        backgroundJobs: {
          jobs: [],
          runs: [],
          templates: []
        }
      })
    );

    render(() => <BackgroundJobsPanel variant="left" segment="jobs" />);

    expect(document.querySelector("[data-test-left-pane-shell][data-left-pane-kind='jobs']")).not.toBeNull();
    expect(screen.getByText("No scheduled jobs yet. Create a routine to run work on a schedule.").closest("[data-test-jobs-empty]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Create scheduled AI routine" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Job options" }));
    expect(screen.getByRole("menuitem", { name: "Create shell task" })).not.toBeNull();
  });

  it("uses shared empty-state hooks for run details", () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "runs",
        activeSurface: "background-jobs",
        backgroundJobs: {
          jobs: [],
          runs: [],
          templates: []
        }
      })
    );

    render(() => <BackgroundJobsPanel segment="runs" />);

    expect(document.querySelector("[data-test-left-pane-shell][data-left-pane-kind='runs']")).not.toBeNull();
    expect(screen.getByText(/Run history appears after first task/i).closest("[data-test-left-pane-empty-state]")).not.toBeNull();
    expect(screen.getByText("Select background run or job to inspect details.").closest("[data-test-detail-empty-state]")).not.toBeNull();
  });

  it("shows enabled filter count on jobs search menu", () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "jobs",
        activeSurface: "background-jobs",
        jobsPanePreferences: {
          ...harnessStore.state.jobsPanePreferences,
          kind: "shell",
          risk: "unsafe"
        }
      })
    );

    render(() => <BackgroundJobsPanel variant="left" segment="jobs" />);

    expect(screen.getByRole("button", { name: "Filter and sort jobs" }).textContent).toContain("2");
  });

  it("filters scheduled jobs by job state", () => {
    const project = createViewProjectFixture({ id: "project-job-state-filter" });
    const now = "2026-05-01T12:00:00.000Z";
    const baseJob = {
      projectId: project.id,
      automationThreadId: "thread-automation",
      kind: "ai-routine" as const,
      status: "enabled" as const,
      riskLevel: "safe" as const,
      definition: {
        kind: "ai-routine" as const,
        prompt: "Review project."
      },
      schedule: {
        type: "interval" as const,
        intervalSeconds: 3600,
        nextRunAt: now,
        sourceText: "1h"
      },
      scheduleInput: "1h",
      createdAt: now,
      updatedAt: now
    };
    const blockedJob: BackgroundJob = {
      ...baseJob,
      id: "job-state-blocked",
      name: "Blocked review",
      schedulerStatus: "blocked"
    };
    const dueJob: BackgroundJob = {
      ...baseJob,
      id: "job-state-due",
      name: "Due review",
      schedulerStatus: "due"
    };
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "jobs",
        activeSurface: "background-jobs",
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        },
        backgroundJobs: {
          jobs: [blockedJob, dueJob],
          runs: [],
          templates: []
        },
        jobsPanePreferences: {
          ...harnessStore.state.jobsPanePreferences,
          segment: "jobs",
          jobState: "blocked"
        }
      })
    );

    render(() => <BackgroundJobsPanel variant="left" segment="jobs" />);

    expect(screen.getByRole("button", { name: "Filter and sort jobs" }).textContent).toContain("1");
    expect(screen.getByText("Blocked review")).toBeTruthy();
    expect(screen.queryByText("Due review")).toBeNull();
  });

});
