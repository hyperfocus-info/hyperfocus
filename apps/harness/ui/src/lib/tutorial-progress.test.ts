import { describe, expect, test } from "bun:test";
import {
  createChatMessage,
  createProjectId,
  createRunId,
  createThreadId,
  createWorkspaceProjectState,
  type SetupState,
  type WorkspaceState
} from "@hyperfocus/ai-core/protocol";
import { isTutorialGoalSatisfied } from "./tutorial-progress";
import { createRunFixture } from "../utils/tests/test-fixtures";

const updatedAt = "2026-08-22T12:00:00.000Z";

function setup(checks: SetupState["checks"] = []): SetupState {
  return {
    launchMode: "source",
    updatedAt,
    readyRequiredCount: checks.filter((check) => check.requiredForFirstTask && check.status === "ready").length,
    totalRequiredCount: checks.filter((check) => check.requiredForFirstTask).length,
    checks
  };
}

function readyCheck(id: string): SetupState["checks"][number] {
  return {
    id,
    title: id,
    summary: `${id} ready`,
    status: "ready",
    requiredForFirstTask: true,
    updatedAt
  };
}

function workspace(overrides: Partial<ReturnType<typeof createWorkspaceProjectState>> = {}): WorkspaceState {
  const project = createWorkspaceProjectState({
    id: createProjectId(),
    name: "repo",
    rootPath: "C:\\repo"
  });
  Object.assign(project, overrides);
  return { projects: [project], activeProjectId: project.id };
}

describe("tutorial progress", () => {
  test("requires both an active project and settled project setup health", () => {
    const projectWorkspace = workspace();
    expect(isTutorialGoalSatisfied("open-project", { setup: setup(), workspace: projectWorkspace })).toBe(false);
    expect(
      isTutorialGoalSatisfied("open-project", {
        setup: setup([readyCheck("project-selected")]),
        workspace: projectWorkspace
      })
    ).toBe(true);
  });

  test("uses agent health rather than visiting preferences as connection progress", () => {
    expect(
      isTutorialGoalSatisfied("connect-provider-runtime", {
        setup: setup([readyCheck("agent-available")]),
        workspace: { projects: [], activeProjectId: undefined }
      })
    ).toBe(true);
  });

  test("requires a sent user message for the first-task tutorial", () => {
    const emptyWorkspace = workspace();
    expect(isTutorialGoalSatisfied("send-first-task", { setup: setup(), workspace: emptyWorkspace })).toBe(false);

    const withMessage = workspace({
      session: {
        ...firstProject(emptyWorkspace).session,
        messages: [createChatMessage("user", "Ship the fix")]
      }
    });
    expect(isTutorialGoalSatisfied("send-first-task", { setup: setup(), workspace: withMessage })).toBe(true);
  });

  test("does not count a merely ready plan as reviewed and executed", () => {
    const readyWorkspace = workspace({
      activeRun: createRunFixture({
        id: createRunId(),
        threadId: createThreadId(),
        status: "ready"
      })
    });
    expect(isTutorialGoalSatisfied("plan-review", { setup: setup(), workspace: readyWorkspace })).toBe(false);

    const activeRun = firstProject(readyWorkspace).activeRun;
    if (!activeRun) throw new Error("Expected tutorial run");
    activeRun.status = "running-main";
    expect(isTutorialGoalSatisfied("plan-review", { setup: setup(), workspace: readyWorkspace })).toBe(true);
  });
});

function firstProject(workspaceState: WorkspaceState) {
  const project = workspaceState.projects[0];
  if (!project) throw new Error("Expected tutorial project");
  return project;
}
