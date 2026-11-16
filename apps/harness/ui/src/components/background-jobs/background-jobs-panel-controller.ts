import { createEffect, onCleanup } from "solid-js";
import {
  createRequestId,
  type BackgroundJob,
  type RunDiagnosticsWindowDays,
} from "@hyperfocus/ai-core/protocol";
import {
  harnessStore,
  persistMergedLocalPreferences,
  type BackgroundJobEditorDraft,
} from "../../harness-store";
import { registerCurrentTabItemSelector } from "../../lib/current-tab-item-hotkeys";
import { resolveBrowserTimezone } from "../../lib/time-format";
import { openBackgroundJobInJobsPane, openProjectThreadSource } from "../../source-navigation";
import { pushToast } from "../../toast-store";
import type { BackgroundJobsPanelModel, RunListItem } from "../background-jobs-panel";
import {
  createBackgroundJobBulkActions,
  createBackgroundJobSelectionActions,
} from "./background-jobs-panel-actions";

function createBackgroundJobNavigationActions(model: BackgroundJobsPanelModel) {
  const { state } = model;

  function openJobDetails(job: BackgroundJob) {
    harnessStore.closeBackgroundJobDetailsDialog();
    harnessStore.setJobsPanePreferences({ segment: "jobs", selectedJobId: job.id, selectedRunId: undefined, selectedNotificationId: undefined });
    model.onNavigate?.();
  }

  function openRunDetails(run: typeof state.backgroundJobs.runs[number]) {
    harnessStore.closeBackgroundJobDetailsDialog();
    harnessStore.setJobsPanePreferences({ segment: "inbox", selectedRunId: run.id, selectedJobId: run.jobId, selectedNotificationId: undefined });
    model.onNavigate?.();
  }

  function openAssistantDetails(assistantId: string) {
    const assistant = state.assistants.assistants.find((entry) => entry.id === assistantId);
    if (assistant) {
      harnessStore.setAssistantScopeFilter(assistant.scope === "global" ? "global" : "project");
    }
    harnessStore.setSelectedAssistantId(assistantId);
    harnessStore.setActiveSurface("assistants");
  }

  function openProjectChatRun(runId: string) {
    harnessStore.closeBackgroundJobDetailsDialog();
    harnessStore.setJobsPanePreferences({ segment: "inbox", selectedRunId: runId, selectedJobId: undefined, selectedNotificationId: undefined });
    model.onNavigate?.();
  }

  function openRunSource(item: RunListItem) {
    if (item.kind === "background") {
      openBackgroundJobInJobsPane(item.run.jobId);
      return;
    }
    openProjectThreadSource(state, item.entry.project.id, item.entry.run.threadId, "run");
  }

  return { openJobDetails, openRunDetails, openAssistantDetails, openProjectChatRun, openRunSource };
}

function createBackgroundJobEditorActions(model: BackgroundJobsPanelModel) {
  const { state } = model;

  function handleCreateJob(kind: BackgroundJob["kind"]) {
    const template = kind === "ai-routine"
      ? state.backgroundJobs.templates.find((entry) => entry.id === "scheduled-task")
      : undefined;
    const draft: BackgroundJobEditorDraft = {
      source: "create",
      projectId: state.workspace.activeProjectId ?? state.workspace.projects[0]?.id,
      templateId: template?.id,
      kind,
      name: "",
      description: "",
      scheduleInput: "",
      timezone: resolveBrowserTimezone(),
      aiPrompt: template?.definition.kind === "ai-routine" ? template.definition.prompt : "",
      aiModeId: template?.definition.kind === "ai-routine" ? template.definition.modeId : undefined,
      aiExecutionModelId: template?.definition.kind === "ai-routine" ? template.definition.executionModelId : undefined,
      aiReasoningStrength: template?.definition.kind === "ai-routine" ? template.definition.reasoningStrength : undefined,
      aiFastMode: template?.definition.kind === "ai-routine" ? template.definition.fastMode : undefined,
      aiPlanExecutionMode: template?.definition.kind === "ai-routine"
        ? template.definition.planExecutionMode ?? state.planExecutionModeDefault
        : state.planExecutionModeDefault,
      aiSubagentWorktreeStrategy: template?.definition.kind === "ai-routine"
        ? template.definition.subagentWorktreeStrategy ?? state.subagentWorktreeStrategyDefault
        : state.subagentWorktreeStrategyDefault,
      lane: "exclusive",
      shellExecutable: "",
      shellArgsText: "",
      shellCwd: "",
      shellEnvRefsText: "",
      shellTimeoutSeconds: 600,
      shellNetworkAccess: false,
    };
    harnessStore.openBackgroundJobEditor(draft);
  }

  function handleEditJob(job: BackgroundJob) {
    const draft: BackgroundJobEditorDraft = {
      source: "edit",
      jobId: job.id,
      projectId: job.projectId,
      assistantId: job.assistantId,
      automationThreadId: job.automationThreadId,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      lastRunAt: job.lastRunAt,
      lastEnqueuedAt: job.lastEnqueuedAt,
      createdFromRunId: job.createdFromRunId,
      templateId: job.templateId,
      status: job.status,
      lane: job.lane ?? "exclusive",
      kind: job.kind,
      name: job.name,
      description: job.description ?? "",
      scheduleInput: job.scheduleInput,
      timezone: job.timezone ?? resolveBrowserTimezone(),
      aiPrompt: job.definition.kind === "ai-routine" ? job.definition.prompt : "",
      aiModeId: job.definition.kind === "ai-routine" ? job.definition.modeId : undefined,
      aiExecutionModelId: job.definition.kind === "ai-routine" ? job.definition.executionModelId : undefined,
      aiReasoningStrength: job.definition.kind === "ai-routine" ? job.definition.reasoningStrength : undefined,
      aiFastMode: job.definition.kind === "ai-routine" ? job.definition.fastMode : undefined,
      aiPlanExecutionMode: job.definition.kind === "ai-routine"
        ? job.definition.planExecutionMode ?? state.planExecutionModeDefault
        : undefined,
      aiSubagentWorktreeStrategy: job.definition.kind === "ai-routine"
        ? job.definition.subagentWorktreeStrategy ?? state.subagentWorktreeStrategyDefault
        : undefined,
      shellExecutable: job.definition.kind === "shell" ? job.definition.executable : "",
      shellArgsText: job.definition.kind === "shell" ? job.definition.args.join("\n") : "",
      shellArgs: job.definition.kind === "shell" ? job.definition.args : undefined,
      shellCwd: job.definition.kind === "shell" ? job.definition.cwd ?? "" : "",
      shellEnvRefsText: job.definition.kind === "shell" ? (job.definition.envRefs ?? []).join("\n") : "",
      shellTimeoutSeconds: job.definition.kind === "shell" ? job.definition.timeoutSeconds : 600,
      shellNetworkAccess: job.definition.kind === "shell" ? Boolean(job.definition.networkAccess) : false,
    };
    harnessStore.openBackgroundJobEditor(draft);
  }

  return { handleCreateJob, handleEditJob };
}

function createBackgroundJobDiagnosticsActions(model: BackgroundJobsPanelModel) {
  const { runtime, sendCommand, healthWindowDays, healthRefreshThrottleMs } = model;

  function scrollRunDetailToBottom() {
    if (runtime.runDetailViewport) {
      runtime.runDetailViewport.scrollTop = runtime.runDetailViewport.scrollHeight;
    }
  }

  function requestDiagnostics(windowDays: RunDiagnosticsWindowDays = healthWindowDays()) {
    harnessStore.actions.startRunDiagnosticsRequest(windowDays);
    sendCommand({ type: "run-diagnostics.inspect", requestId: createRequestId(), payload: { windowDays } });
    runtime.lastHealthRefreshAt = Date.now();
  }

  function scheduleHealthRefresh() {
    if (runtime.pendingHealthRefreshTimer) return;
    const elapsedMs = Date.now() - runtime.lastHealthRefreshAt;
    const delayMs = Math.max(0, healthRefreshThrottleMs() - elapsedMs);
    runtime.pendingHealthRefreshTimer = setTimeout(() => {
      runtime.pendingHealthRefreshTimer = undefined;
      requestDiagnostics();
    }, delayMs);
  }

  function retryScheduler() {
    sendCommand({ type: "background-job.scheduler.retry", requestId: createRequestId() });
  }

  return { scrollRunDetailToBottom, requestDiagnostics, scheduleHealthRefresh, retryScheduler };
}

function persistNotificationPreference(model: BackgroundJobsPanelModel, enabled: boolean) {
  const { state } = model;
  persistMergedLocalPreferences({
    openAiApiKey: state.openAiApiKeyDraft.trim() || undefined,
    googleApiKey: state.googleApiKeyDraft.trim() || undefined,
    providerBrand: state.providerBrand,
    debugEnabled: state.debugEnabled,
    tracePanelDefaultOpen: state.tracePanelDefaultOpen,
    subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
    blockChatOnDirtyGitDefault: state.blockChatOnDirtyGitDefault,
    dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
    autoCompactContextThresholdPercentDefault: state.autoCompactContextThresholdPercentDefault,
    planExecutionModeDefault: state.planExecutionModeDefault,
    planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
    correctnessIterationModeDefault: state.correctnessIterationModeDefault,
    backgroundJobApprovalPolicyDefault: state.backgroundJobApprovalPolicyDefault,
    assistantAutoApproveNonBlockingQuestionsDefault: state.assistantAutoApproveNonBlockingQuestionsDefault,
    assistantCongestionControlEnabledDefault: state.assistantCongestionControlEnabledDefault,
    assistantMaxCongestionDefault: state.assistantMaxCongestionDefault,
    maxBackgroundJobsDefault: state.maxBackgroundJobsDefault,
    backgroundJobNotificationsEnabled: enabled,
  });
}

function createBackgroundJobNotificationActions(model: BackgroundJobsPanelModel) {
  async function handleToggleNotifications() {
    if (typeof Notification === "undefined") {
      pushToast("Notifications unavailable", "Browser does not support desktop notifications.", "error");
      return;
    }
    if (model.state.backgroundJobNotificationsEnabled) {
      harnessStore.setBackgroundJobNotificationsEnabled(false);
      persistNotificationPreference(model, false);
      return;
    }
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") {
      pushToast("Notifications blocked", "Browser denied notification permission. Falling back to in-app toasts.", "error");
      harnessStore.setBackgroundJobNotificationsEnabled(false);
      persistNotificationPreference(model, false);
      return;
    }
    harnessStore.setBackgroundJobNotificationsEnabled(true);
    persistNotificationPreference(model, true);
  }

  return { handleToggleNotifications };
}

function runListItemId(item: RunListItem) {
  return item.kind === "project-chat" ? item.entry.run.id : item.run.id;
}

function registerSelectionEffects(model: BackgroundJobsPanelModel, clearPendingSelectionTimer: () => void) {
  const {
    jobs, runListItems, setSelectedJobIds, setSelectedRunIds, jobSelectionAnchorId,
    setJobSelectionAnchorId, runSelectionAnchorId, setRunSelectionAnchorId,
  } = model;
  createEffect(() => {
    const visibleIds = new Set(jobs().map((job) => job.id));
    setSelectedJobIds((ids) => ids.filter((id) => visibleIds.has(id)));
    const anchorId = jobSelectionAnchorId();
    if (anchorId && !visibleIds.has(anchorId)) setJobSelectionAnchorId(undefined);
  });
  createEffect(() => {
    const visibleIds = new Set(runListItems().filter((item) => item.kind === "background").map(runListItemId));
    setSelectedRunIds((ids) => ids.filter((id) => visibleIds.has(id)));
    const anchorId = runSelectionAnchorId();
    if (anchorId && !visibleIds.has(anchorId)) setRunSelectionAnchorId(undefined);
  });
  onCleanup(clearPendingSelectionTimer);
}

function registerNavigationEffects(
  model: BackgroundJobsPanelModel,
  navigation: ReturnType<typeof createBackgroundJobNavigationActions>,
) {
  const { showLeft, activeSegment, jobs, runListItems } = model;
  createEffect(() => {
    if (!showLeft()) return;
    if (activeSegment() === "jobs") {
      const unregister = registerCurrentTabItemSelector("jobs", (index) => {
        const job = jobs()[index];
        if (!job) return false;
        navigation.openJobDetails(job);
        return true;
      });
      onCleanup(unregister);
      return;
    }
    if (activeSegment() === "inbox") {
      const unregister = registerCurrentTabItemSelector("runs", (index) => {
        const item = runListItems()[index];
        if (!item) return false;
        if (item.kind === "project-chat") navigation.openProjectChatRun(item.entry.run.id);
        else navigation.openRunDetails(item.run);
        return true;
      });
      onCleanup(unregister);
    }
  });
}

function registerDiagnosticsEffects(
  model: BackgroundJobsPanelModel,
  diagnostics: ReturnType<typeof createBackgroundJobDiagnosticsActions>,
) {
  const { runtime, state, activeSegment, healthWindowDays, diagnosticsRefreshVersion, selectedRunScrollKey } = model;
  createEffect(() => {
    selectedRunScrollKey();
    if (activeSegment() === "jobs" || activeSegment() === "health" || !runtime.runDetailViewport) return;
    queueMicrotask(diagnostics.scrollRunDetailToBottom);
    requestAnimationFrame(diagnostics.scrollRunDetailToBottom);
  });
  createEffect(() => {
    const segment = activeSegment();
    const windowDays = healthWindowDays();
    if (segment === "health" && !state.runDiagnostics.loading && state.runDiagnostics.report?.windowDays !== windowDays) {
      diagnostics.requestDiagnostics(windowDays);
    }
  });
  createEffect(() => {
    const refreshVersion = diagnosticsRefreshVersion();
    const previousRefreshVersion = runtime.lastObservedDiagnosticsRefreshVersion;
    runtime.lastObservedDiagnosticsRefreshVersion = refreshVersion;
    if (previousRefreshVersion === undefined || refreshVersion === previousRefreshVersion || activeSegment() !== "health" || state.runDiagnostics.loading || !state.runDiagnostics.report) return;
    diagnostics.scheduleHealthRefresh();
  });
  createEffect(() => {
    if (activeSegment() === "health" || !runtime.pendingHealthRefreshTimer) return;
    clearTimeout(runtime.pendingHealthRefreshTimer);
    runtime.pendingHealthRefreshTimer = undefined;
  });
  onCleanup(() => {
    if (runtime.pendingHealthRefreshTimer) clearTimeout(runtime.pendingHealthRefreshTimer);
  });
}

function registerSelectedRunEffect(model: BackgroundJobsPanelModel) {
  const { activeSegment, selectedRun, selectedRunId, selectedRunItem } = model;
  createEffect(() => {
    const currentRun = selectedRun();
    if (model.state.jobsPanePreferences.segment === "jobs" || model.state.jobsPanePreferences.segment === "health") return;
    if (activeSegment() === "jobs" || activeSegment() === "health") return;
    if (!currentRun) {
      harnessStore.setJobsPanePreferences({ selectedRunId: undefined, selectedNotificationId: undefined });
      return;
    }
    if (selectedRunId() !== currentRun.id) {
      const item = selectedRunItem();
      harnessStore.setJobsPanePreferences({
        selectedRunId: currentRun.id,
        selectedJobId: item?.kind === "background" ? item.run.jobId : undefined,
      });
    }
  });
}

function registerSelectedJobEffect(model: BackgroundJobsPanelModel) {
  createEffect(() => {
    const state = model.state;
    if (state.activeSurface !== "background-jobs" || state.activeLeftTab !== "jobs" ||
      state.jobsPanePreferences.segment !== "jobs" || model.activeSegment() !== "jobs") return;
    const jobId = model.selectedJob()?.id;
    if (model.selectedJobId() === jobId && !model.selectedRunId()) return;
    harnessStore.setJobsPanePreferences({ selectedJobId: jobId, selectedRunId: undefined, selectedNotificationId: undefined });
  });
}

export function createBackgroundJobsPanelController(model: BackgroundJobsPanelModel) {
  const navigation = createBackgroundJobNavigationActions(model);
  const selection = createBackgroundJobSelectionActions(model, navigation.openJobDetails);
  const bulk = createBackgroundJobBulkActions(model);
  const editor = createBackgroundJobEditorActions(model);
  const diagnostics = createBackgroundJobDiagnosticsActions(model);
  const notifications = createBackgroundJobNotificationActions(model);
  registerNavigationEffects(model, navigation);
  registerSelectionEffects(model, selection.clearPendingSelectionTimer);
  registerSelectedRunEffect(model);
  registerSelectedJobEffect(model);
  registerDiagnosticsEffects(model, diagnostics);
  return { ...navigation, ...selection, ...bulk, ...editor, ...diagnostics, ...notifications };
}
