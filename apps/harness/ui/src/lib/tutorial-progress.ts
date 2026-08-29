import type { SetupState, WorkspaceState } from "@hyperfocus/ai-core/protocol";

export type TutorialProgressState = {
  setup: SetupState;
  workspace: WorkspaceState;
};

const EXECUTION_STARTED_STATUSES = new Set([
  "running-main",
  "running-subagents",
  "aggregating",
  "partial-complete",
  "completed",
  "stopped",
  "failed"
]);

/**
 * Tutorials are completion records, not pages in a carousel. Keep the mapping
 * tied to durable workspace/setup state so clicking through the overlay cannot
 * manufacture progress that did not happen.
 */
export function isTutorialGoalSatisfied(tutorialId: string, state: TutorialProgressState) {
  const activeProject = state.workspace.projects.find((project) => project.id === state.workspace.activeProjectId);

  switch (tutorialId) {
    case "open-project":
      return Boolean(activeProject) && isSetupCheckReady(state.setup, "project-selected");
    case "connect-provider-runtime":
      return isSetupCheckReady(state.setup, "agent-available");
    case "send-first-task":
      return Boolean(activeProject?.session.messages.some((message) => message.role === "user"));
    case "plan-review": {
      const latestRun = activeProject?.activeRun ?? activeProject?.lastRun;
      return Boolean(latestRun && EXECUTION_STARTED_STATUSES.has(latestRun.status));
    }
    default:
      return false;
  }
}

function isSetupCheckReady(setup: SetupState, checkId: string) {
  return setup.checks.some((check) => check.id === checkId && check.status === "ready");
}
