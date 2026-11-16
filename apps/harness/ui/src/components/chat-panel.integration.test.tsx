/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";
import { createUiTest, requireButton } from "../utils/tests/test-harness";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { ChatPanel } from "./chat-panel";
import { harnessStore } from "../harness-store";
import { beginRunDetailRetry, clearRunDetailRecovery, setRunDetailRecovery } from "../store/run-detail-state";
import { captureDispatchedCommands, clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import {
  createAgentPlanFixture,
  createExecutionPlanFixture,
  createHarnessStateFixture,
  createPlanSummaryMessage,
  createRunFixture,
  createViewProjectFixture
} from "../utils/tests/test-fixtures";

createUiTest("ChatPanel followup integration", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("updates composer effort label and sends reasoning plus fast mode", () => {
    const commands: ClientCommand[] = [];
    const project = createViewProjectFixture({
      id: "project-effort-send",
      draft: "ship it"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        hasUsableApiKey: true,
        hasUsableOpenAiApiKey: true,
        selectedReasoningStrength: "medium",
        hasGlobalSelectedReasoningStrength: true,
        selectedFastMode: true,
        hasGlobalSelectedFastMode: true,
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    captureDispatchedCommands(commands);
    render(() => <ChatPanel />);

    const effortTrigger = document.querySelector<HTMLButtonElement>("[data-test-effort-trigger]");
    if (!effortTrigger) {
      throw new Error("Expected effort trigger");
    }
    expect(effortTrigger.textContent).toContain("Medium");
    expect(effortTrigger.textContent).toContain("Fast");

    fireEvent.click(effortTrigger);
    const high = screen.getByRole("button", { name: /^High/ });
    expect(requireButton(high).disabled).toBe(false);
    high.focus();
    fireEvent.click(high);
    expect(harnessStore.state.selectedReasoningStrength).toBe("high");
    expect(document.activeElement).toBe(high);
    expect(high.getAttribute("aria-pressed")).toBe("true");
    const standard = screen.getByRole("button", { name: /^Off/ });
    fireEvent.click(standard);
    expect(standard.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(effortTrigger);

    fireEvent.click(screen.getByRole("button", { name: "Send task to Pi" }));

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      type: "chat.send",
      payload: {
        reasoningStrength: "high",
        fastMode: false
      }
    });
  });

  it("keeps exhausted run-detail recovery visible beyond its toast", () => {
    let retries = 0;
    const run = createRunFixture({ id: "run-detail-unavailable", detailState: "unavailable" });
    const project = createViewProjectFixture({ id: "project-detail-unavailable", activeRun: run, lastRun: run });
    seedHarnessStoreForTests(createHarnessStateFixture({ chatPaneTab: "run",
      workspace: { activeProjectId: project.id, projects: [project] } }));
    setRunDetailRecovery({ projectId: project.id, threadId: run.threadId, runId: run.id, status: "retryable",
      retry: () => { if (beginRunDetailRetry(run.id)) retries += 1; } });
    render(() => <ChatPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Retry loading full run details" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry loading full run details" }));
    expect(screen.getByText(/Run actions remain disabled/)).not.toBeNull(); expect(retries).toBe(1);
    clearRunDetailRecovery(run.id);
  });

  it("accepts immediate plan refinement after planner-ready message stops streaming", () => {
    const commands: unknown[] = [];
    const plan = createExecutionPlanFixture({
      runId: "run-followup",
      gating: {
        mode: "approve",
        delaySeconds: 0
      }
    });
    const project = createViewProjectFixture({
      id: "project-followup-flow",
      draft: "make it runnable",
      session: {
        ...createViewProjectFixture().session,
        isStreaming: true,
        messages: []
      }
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    captureDispatchedCommands(commands);
    render(() => <ChatPanel />);

    harnessStore.applyServerEvent({
      type: "run.updated",
      requestId: "req-ready",
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        run: createRunFixture({
          id: "run-followup",
          threadId: project.activeThreadId,
          status: "ready",
          plan
        })
      }
    });
    harnessStore.applyServerEvent({
      type: "agent.plan",
      requestId: "req-plan",
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        plan: createAgentPlanFixture({
          executionPlan: plan,
          difficultyScore: 20,
          usesSubagents: false,
          subtaskCount: 0
        })
      }
    });
    harnessStore.applyServerEvent({
      type: "chat.message-appended",
      requestId: "req-plan-msg",
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        sessionId: project.session.sessionId,
        message: createPlanSummaryMessage("run-followup", plan),
        state: {
          ...project.session,
          messages: [...project.session.messages, createPlanSummaryMessage("run-followup", plan)],
          isStreaming: false
        }
      }
    });

    expect(screen.queryByText("assistant (streaming)")).toBeNull();
    cleanup();
    captureDispatchedCommands(commands);
    render(() => <ChatPanel />);
    expect(screen.getAllByText(plan.summary).length).toBeGreaterThan(0);
    expect(harnessStore.state.workspace.projects[0]?.session.isStreaming).toBe(false);
    expect(requireButton(screen.getByRole("button", { name: "Refine plan before execution" })).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Refine plan before execution" }));

    expect(commands[0]?.type).toBe("planning.refine");
  });
});
