import type { BackgroundJobsState, ExecutionControlState, NotificationInboxState,
  RunDiagnosticsReport, RunDiagnosticsWindowDays, SetupState } from "@hyperfocus/ai-core/protocol";

export type RunDiagnosticsViewState = { loading: boolean; windowDays: RunDiagnosticsWindowDays;
  report?: RunDiagnosticsReport };
export type MainPanelSizes = { left: number; center: number; right: number; leftCollapsed?: boolean };

export function createEmptyBackgroundJobsState(): BackgroundJobsState {
  return { jobs: [], runs: [], templates: [] };
}

export function createInitialExecutionControlState(): ExecutionControlState {
  return { isPaused: false, deferredPlanningQuestionCount: 0,
    deferredAssistantQuestionCount: 0, deferredBrowserApprovalCount: 0 };
}

export function createEmptyNotificationInboxState(): NotificationInboxState {
  return { items: [], unreadCount: 0, interactiveUnreadCount: 0, passiveUnreadCount: 0 };
}

export function createInitialRunDiagnosticsState(): RunDiagnosticsViewState {
  return { loading: false, windowDays: 7, report: undefined };
}

export function createDefaultMainPanelSizes(): MainPanelSizes {
  return { left: 1.15, center: 3.6, right: 1.25 };
}

export function createInitialSetupState(): SetupState {
  return { launchMode: "source", updatedAt: new Date(0).toISOString(), readyRequiredCount: 0,
    totalRequiredCount: 0, checks: [] };
}
