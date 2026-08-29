import { For, Show, createMemo, createSignal, type JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { createRequestId, type AgentRunState, type BackgroundJob, type BackgroundJobRun, type BulkOperationAction, type BulkOperationTarget, type RunDiagnosticsWindowDays } from "@hyperfocus/ai-core/protocol";
import { formatForDisplay } from "@tanstack/solid-hotkeys";
import { harnessStore, type JobsJobStateFilter,
  type JobsPaneJobSort, type JobsPaneRunSort, type RunDiagnosticsViewState } from "../harness-store";
import type { JobsRunFilter } from "../store/background-jobs-pane-state";
import { formatShortTimestamp } from "../lib/time-format";
import { normalizeAppHotkeyPreferences } from "../lib/app-hotkeys";
import type { ChatFileTarget } from "../lib/chat-file-links";
import { openIdeWindow } from "../lib/ide-window";
import { toProperCase } from "../lib/utils";
import { ActionButton } from "./action-button";
import { FileLinkedText, type FileLinkConfig } from "./file-linked-text";
import { CopyTextButton } from "./primitives/copy-text-button";
import { ContextMenu, type ContextMenuAction } from "./primitives/context-menu";
import { ExecutionLog } from "./primitives/execution-log";
import { Dialog } from "./primitives/dialog";
import {
  DetailEmptyState,
  LeftPaneEmptyState,
  LeftPaneFilterBlock,
  LeftPaneHeader,
  LeftPaneListSection,
  LeftPaneSearchInput,
  LeftPaneSearchMenu,
  LeftPaneShell,
  type LeftPaneSearchMenuItem
} from "./primitives/left-pane";
import { ScrollArea } from "./primitives/scroll-area";
import { StatusChip, type StatusChipTone } from "./primitives/status-chip";
import { Tooltip } from "./primitives/tooltip";
import { VirtualList } from "./primitives/virtual-list";
import { backgroundJobsStyles as styles } from "./background-jobs.styles";
import { BackgroundRunActions } from "./background-jobs/background-run-actions";
import { createBackgroundJobsPanelController } from "./background-jobs/background-jobs-panel-controller";
import { jobsPaneSegmentItems } from "./background-jobs/jobs-pane-menu";
import { rightAlignedNumbersEnabled } from "../lib/visual-flags";
import {
  Bell,
  BellOff,
  Bot,
  BriefcaseBusiness,
  Calendar,
  CheckCircle2,
  CheckSquare2,
  Clock3,
  CircleX,
  ListFilter,
  LoaderCircle,
  MessageSquareText,
  Pause,
  Play,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Square,
  Terminal,
  Trash2
} from "lucide-solid";

type BackgroundJobsPanelProps = {
  variant?: "full" | "left" | "detail";
  segment?: "jobs" | "runs" | "health";
  healthRefreshThrottleMs?: number;
};

type ProjectChatRunEntry = {
  project: typeof harnessStore.state.workspace.projects[number];
  thread: typeof harnessStore.state.workspace.projects[number]["threads"][number] | undefined;
  run: AgentRunState;
};

export type RunListItem =
  | {
      kind: "background";
      run: BackgroundJobRun;
    }
  | {
      kind: "project-chat";
      entry: ProjectChatRunEntry;
    };

function formatHotkeyHint(hotkey: string) {
  return formatForDisplay(hotkey)
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" + ");
}

function tooltipWithPrimaryHotkey(label: string, hotkey: string | undefined) {
  return hotkey ? `${label} (${formatHotkeyHint(hotkey)})` : label;
}

function toggleId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id];
}

function isInteractiveSelectionTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("button,a,input,textarea,select,[role='menuitem'],[data-selection-ignore]"));
}

function mergeRangeSelection(ids: string[], visibleIds: string[], anchorId: string, targetId: string) {
  const anchorIndex = visibleIds.indexOf(anchorId);
  const targetIndex = visibleIds.indexOf(targetId);
  if (anchorIndex === -1 || targetIndex === -1) {
    return ids.includes(targetId) ? ids : [...ids, targetId];
  }
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return [...new Set([...ids, ...visibleIds.slice(start, end + 1)])];
}

function formatBulkActionLabel(action: BulkOperationAction) {
  switch (action) {
    case "run-now":
      return "run now";
    case "bootstrap-retry":
      return "bootstrap retry";
    default:
      return action;
  }
}

function createBackgroundJobsPanelModel(props: BackgroundJobsPanelProps) {
  const runtime: {
    runDetailViewport?: HTMLDivElement;
    pendingHealthRefreshTimer?: ReturnType<typeof setTimeout>;
    lastHealthRefreshAt: number;
    lastObservedDiagnosticsRefreshVersion?: number;
    pendingSelectionTimer?: ReturnType<typeof setTimeout>;
    pendingSelectionKind?: "job" | "run";
    pendingSelectionId?: string;
    consumedDelayedSelection: boolean;
  } = { lastHealthRefreshAt: 0, consumedDelayedSelection: false };
  const state = harnessStore.state;
  const sendCommand = harnessStore.actions.sendCommand;
  const executionPaused = () => state.executionControl.isPaused;
  const executionPauseReason = "Global execution pause is active";
  const runFilter = () => state.jobsRunFilter;
  const variant = () => props.variant ?? "full";
  const healthRefreshThrottleMs = () => props.healthRefreshThrottleMs ?? 5000;
  const showLeft = () => variant() !== "detail";
  const showDetail = () => variant() !== "left";
  const jobsPane = () => state.jobsPanePreferences;
  const activeSegment = () =>
    props.segment === "jobs" ? "jobs" : props.segment === "runs" ? "inbox" : props.segment === "health" ? "health" : jobsPane().segment;
  const activeSearch = () => (activeSegment() === "jobs" ? jobsPane().jobSearch ?? "" : jobsPane().runSearch ?? "");
  const [healthWindowDays, setHealthWindowDays] = createSignal<RunDiagnosticsWindowDays>(state.runDiagnostics.windowDays);
  const headerTitle = () => (activeSegment() === "jobs" ? "Scheduled jobs" : activeSegment() === "health" ? "Health" : "Runs");
  const headerHelp = () =>
    activeSegment() === "jobs"
      ? "Durable scheduler. Jobs catch up on startup, run in hidden automation threads, summarize here."
      : activeSegment() === "health"
        ? "Read-only reliability diagnostics for recent runs, backoff, failure classes, and prompt compaction pressure."
      : "Background run history. Approvals, active runs, failures, and completed milestones stay out of project chat.";
  const selectedRunId = () => jobsPane().selectedRunId;
  const selectedJobId = () => jobsPane().selectedJobId;
  const detailsRunId = () => state.backgroundJobDetailsRunId;
  const diagnostics = () => state.runDiagnostics;
  const diagnosticsRefreshVersion = () => state.diagnosticsRefreshVersion;

  const jobs = createMemo(() =>
    [...state.backgroundJobs.jobs]
      .filter((job) => matchesJobFilters(job, state))
      .filter((job) => fuzzyMatches(jobSearchHaystack(job, state), jobsPane().jobSearch ?? ""))
      .sort((left, right) => compareJobs(left, right, jobsPane().jobSort))
  );
  const filteredRuns = createMemo(() =>
    [...state.backgroundJobs.runs]
      .filter((run) => matchesRunFilter(run, runFilter()))
      .filter((run) => fuzzyMatches(runSearchHaystack(run, state), jobsPane().runSearch ?? ""))
      .sort((left, right) => compareRuns(left, right, jobsPane().runSort ?? "urgency"))
  );
  const activeProjectChatRuns = createMemo(() =>
    state.workspace.projects
      .flatMap((project) => {
        const activeRuns = collectActiveProjectRuns(project);
        return activeRuns.map((run) => ({
          project,
          thread: project.threads.find((entry) => entry.id === run.threadId),
          run
        }));
      })
      .filter((entry) => matchesProjectChatRunFilter(entry.run, runFilter()))
      .filter((entry) => fuzzyMatches(projectChatRunSearchHaystack(entry), jobsPane().runSearch ?? ""))
  );
  const runListItems = createMemo<RunListItem[]>(() =>
    [
      ...activeProjectChatRuns().map((entry) => ({ kind: "project-chat" as const, entry })),
      ...filteredRuns().map((run) => ({ kind: "background" as const, run }))
    ].sort((left, right) => compareRunListItems(left, right, jobsPane().runSort ?? "urgency"))
  );
  const [selectedJobIds, setSelectedJobIds] = createSignal<string[]>([]);
  const [selectedRunIds, setSelectedRunIds] = createSignal<string[]>([]);
  const [jobSelectionAnchorId, setJobSelectionAnchorId] = createSignal<string>();
  const [runSelectionAnchorId, setRunSelectionAnchorId] = createSignal<string>();
  const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number; label: string; actions: ContextMenuAction[] }>();
  const selectedJobIdSet = createMemo(() => new Set(selectedJobIds()));
  const selectedRunIdSet = createMemo(() => new Set(selectedRunIds()));
  const selectedJobs = createMemo(() => jobs().filter((job) => selectedJobIdSet().has(job.id)));
  const selectedBackgroundRuns = createMemo(() =>
    runListItems()
      .filter((item): item is Extract<RunListItem, { kind: "background" }> => item.kind === "background")
      .map((item) => item.run)
      .filter((run) => selectedRunIdSet().has(run.id))
  );
  const selectedRunItem = createMemo(() => {
    const explicitRunId = selectedRunId();
    if (explicitRunId) {
      const backgroundRun = state.backgroundJobs.runs.find((run) => run.id === explicitRunId);
      return runListItems().find((item) => runListItemRun(item).id === explicitRunId) ?? (backgroundRun ? { kind: "background" as const, run: backgroundRun } : undefined);
    }
    return activeSegment() === "inbox" ? runListItems()[0] : undefined;
  });
  const selectedRun = createMemo(() => optionalRunListItemRun(selectedRunItem()));
  const selectedBackgroundRun = createMemo(() => {
    const item = selectedRunItem();
    return item?.kind === "background" ? item.run : undefined;
  });
  const selectedRunTitle = () => formatOptionalRunListItemTitle(selectedRunItem(), selectedJob()?.name);
  const selectedRunScrollKey = createMemo(() => {
    const item = selectedRunItem();
    const events = item?.kind === "background" ? item.run.events : [];
    const lastEventId = events.at(-1)?.id ?? "";
    return `${item ? runListItemRun(item).id : ""}:${events.length}:${lastEventId}`;
  });
  const selectedJob = createMemo(() => {
    const item = selectedRunItem();
    return state.backgroundJobs.jobs.find((job) => item?.kind === "background" && job.id === item.run.jobId) ?? jobs().find((job) => job.id === selectedJobId()) ?? jobs()[0];
  });
  const selectedJobRuns = createMemo(() => {
    const jobId = selectedJob()?.id;
    if (!jobId) {
      return [];
    }
    return [...state.backgroundJobs.runs].filter((run) => run.jobId === jobId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  });
  const detailsRun = createMemo(() => {
    const runId = detailsRunId();
    return runId ? state.backgroundJobs.runs.find((run) => run.id === runId) : undefined;
  });
  const detailsJob = createMemo(() => {
    const run = detailsRun();
    return run ? state.backgroundJobs.jobs.find((job) => job.id === run.jobId) : undefined;
  });
  const detailsLogEntries = createMemo(() =>
    (detailsRun()?.events ?? []).map((event) => ({
      id: event.id,
      message: event.message,
      level: event.stage,
      createdAt: event.createdAt,
      detail: event.detail
    }))
  );
  const handleOpenBackgroundFile = (
    project: typeof state.workspace.projects[number],
    target: ChatFileTarget,
  ) => {
    openIdeWindow({ projectId: project.id, threadId: project.activeThreadId });
    harnessStore.openIdeFile(target.path, target.line, target.column);
  };
  const getProjectFileLinks = (
    project: typeof state.workspace.projects[number] | undefined,
  ): FileLinkConfig | undefined => project ? {
    rootPath: project.rootPath,
    filePaths: project.filePaths ?? [],
    onOpenFile: (target) => handleOpenBackgroundFile(project, target),
  } : undefined;
  const getBackgroundRunFileLinks = (projectId: string | undefined) => getProjectFileLinks(
    projectId ? state.workspace.projects.find((project) => project.id === projectId) : undefined,
  );
  const selectedRunFileLinks = () => {
    const item = selectedRunItem();
    return item?.kind === "background" ? getBackgroundRunFileLinks(item.run.projectId) : undefined;
  };
  const selectedRunItemFileLinks = () => {
    const item = selectedRunItem();
    return item ? runListItemFileLinks(item) : selectedRunFileLinks();
  };
  const detailsRunFileLinks = () => getBackgroundRunFileLinks(detailsRun()?.projectId);
  const selectedJobFileLinks = () => getBackgroundRunFileLinks(selectedJob()?.projectId);
  const runListItemFileLinks = (item: RunListItem) =>
    item.kind === "project-chat" ? getProjectFileLinks(item.entry.project) : getBackgroundRunFileLinks(item.run.projectId);


  return {
    runtime, state, sendCommand, executionPaused, executionPauseReason, runFilter, variant,
    healthRefreshThrottleMs, showLeft, showDetail, jobsPane, activeSegment, activeSearch,
    healthWindowDays, setHealthWindowDays, headerTitle, headerHelp, selectedRunId,
    selectedJobId, detailsRunId, diagnostics, diagnosticsRefreshVersion, jobs, filteredRuns,
    activeProjectChatRuns, runListItems, selectedJobIds, setSelectedJobIds, selectedRunIds,
    setSelectedRunIds, jobSelectionAnchorId, setJobSelectionAnchorId, runSelectionAnchorId,
    setRunSelectionAnchorId, contextMenu, setContextMenu, selectedJobIdSet, selectedRunIdSet,
    selectedJobs, selectedBackgroundRuns, selectedRunItem, selectedRun, selectedBackgroundRun,
    selectedRunTitle, selectedRunScrollKey, selectedJob, selectedJobRuns, detailsRun,
    detailsJob, detailsLogEntries, selectedRunFileLinks, selectedRunItemFileLinks,
    detailsRunFileLinks, selectedJobFileLinks, runListItemFileLinks, getBackgroundRunFileLinks,
  };
}

export type BackgroundJobsPanelModel = ReturnType<typeof createBackgroundJobsPanelModel>;

type BackgroundJobsPanelController = ReturnType<typeof createBackgroundJobsPanelController>;

type BackgroundJobsPanelViewProps = {
  model: BackgroundJobsPanelModel;
  controller: BackgroundJobsPanelController;
  allowSegmentSwitch: boolean;
};

export function BackgroundJobsPanel(props: BackgroundJobsPanelProps) {
  const model = createBackgroundJobsPanelModel(props);
  const controller = createBackgroundJobsPanelController(model);
  return <BackgroundJobsPanelView model={model} controller={controller} allowSegmentSwitch={!props.segment} />;
}

function BackgroundJobsPanelView(props: BackgroundJobsPanelViewProps) {
  const { activeSegment, showLeft, showDetail } = props.model;
  return (
    <LeftPaneShell data-test-background-jobs-panel="" kind={activeSegment() === "jobs" ? "jobs" : activeSegment() === "inbox" ? "runs" : "health"} padding="comfortable">
      <BackgroundJobsPanelHeader {...props} />
      <div
        class={[
          stylex.attrs(styles.panelLayout).class,
          showLeft() && showDetail() && activeSegment() !== "health" ? stylex.attrs(styles.panelLayoutSplit).class : ""
        ].filter(Boolean).join(" ")}
      >
        <BackgroundJobsListPane {...props} />
        <BackgroundJobsDetailPane {...props} />
      </div>
      <BackgroundJobsPanelOverlays {...props} />
    </LeftPaneShell>
  );
}

function BackgroundJobsPanelHeader(props: BackgroundJobsPanelViewProps) {
  const { state, showLeft, activeSegment, activeSearch, headerTitle, headerHelp } = props.model;
  const { handleCreateJob, handleToggleNotifications, retryScheduler } = props.controller;
  return (
    <>
      <Show when={showLeft()}>
        <>
          <LeftPaneHeader
            title={headerTitle()}
            help={headerHelp()}
            actions={
              <Show when={activeSegment() === "jobs"}>
                <>
                <ActionButton
                  tooltip={tooltipWithPrimaryHotkey(
                    "Create scheduled AI routine",
                    normalizeAppHotkeyPreferences(state.appHotkeyPreferences).createBackgroundJob[0]
                  )}
                  icon={<Bot class={stylex.attrs(styles.iconMd).class} />}
                  size="icon"
                  variant="ghost"
                  ariaLabel="Create scheduled AI routine"
                  onClick={() => handleCreateJob("ai-routine")}
                />
                <ActionButton
                  tooltip="Create scheduled shell task"
                  icon={<Terminal class={stylex.attrs(styles.iconMd).class} />}
                  size="icon"
                  variant="ghost"
                  ariaLabel="Create scheduled shell task"
                  onClick={() => handleCreateJob("shell")}
                />
                <ActionButton
                  tooltip={state.backgroundJobNotificationsEnabled ? "Disable desktop notifications" : "Enable desktop notifications"}
                  icon={state.backgroundJobNotificationsEnabled ? <Bell class={stylex.attrs(styles.iconMd).class} /> : <BellOff class={stylex.attrs(styles.iconMd).class} />}
                  size="icon"
                  variant="ghost"
                  ariaLabel={state.backgroundJobNotificationsEnabled ? "Disable desktop notifications" : "Enable desktop notifications"}
                  onClick={handleToggleNotifications}
                />
                </>
              </Show>
            }
          />
          <Show when={formatSchedulerHeartbeatWarning(state.backgroundJobs.schedulerHeartbeatAt)}>
            {(warning) => (
              <div class={stylex.attrs(styles.warningBanner).class}>
                <SchedulerWarningContent text={warning()} onRetryScheduler={retryScheduler} />
              </div>
            )}
          </Show>
        </>
      </Show>

      <Show when={showLeft()}>
        <Show when={activeSegment() !== "health"}>
          <LeftPaneFilterBlock>
            <LeftPaneSearchInput
              value={activeSearch()}
              aria-label={activeSegment() === "jobs" ? "Search jobs" : "Search runs"}
              placeholder={activeSegment() === "jobs" ? "Search jobs..." : "Search runs..."}
              menu={
                <LeftPaneSearchMenu
                  ariaLabel={activeSegment() === "jobs" ? "Filter and sort jobs" : "Filter and sort runs"}
                  tooltip={activeSegment() === "jobs" ? "Filter and sort jobs" : "Filter and sort runs"}
                  activeFilterCount={activeJobsPaneFilterCount(state, activeSegment())}
                  items={jobsPaneMenuItems(state, activeSegment(), props.allowSegmentSwitch)}
                />
              }
              onInput={(event) =>
                harnessStore.setJobsPanePreferences(
                  activeSegment() === "jobs"
                    ? { jobSearch: event.currentTarget.value }
                    : { runSearch: event.currentTarget.value }
                )
              }
            />
          </LeftPaneFilterBlock>
        </Show>
      </Show>
    </>
  );
}

function BackgroundJobsListPane(props: BackgroundJobsPanelViewProps) {
  const { showLeft, activeSegment, diagnostics, healthWindowDays, setHealthWindowDays } = props.model;
  const { requestDiagnostics } = props.controller;
  return (
    <Show when={showLeft()}>
      <div class={stylex.attrs(styles.paneGrid).class}>
        <Show when={activeSegment() === "health"}>
          <HealthView
            diagnostics={diagnostics}
            healthWindowDays={healthWindowDays()}
            onSelectWindow={(windowDays) => {
              setHealthWindowDays(windowDays);
              requestDiagnostics(windowDays);
            }}
            onRefresh={() => requestDiagnostics()}
          />
        </Show>
        <BackgroundJobsJobsList {...props} />
        <BackgroundJobsRunsList {...props} />
      </div>
    </Show>
  );
}

function BackgroundJobsJobsList(props: BackgroundJobsPanelViewProps) {
  const {
    state, sendCommand, activeSegment, jobs, selectedJobs, executionPaused, executionPauseReason,
    setSelectedJobIds, setSelectedRunIds, selectedJob, selectedJobIdSet,
    setJobSelectionAnchorId, getBackgroundRunFileLinks,
  } = props.model;
  const {
    sendBulkOperation, jobBulkTarget, handleCreateJob, scheduleDelayedSelection,
    clearPendingSelectionTimer, handleJobCardClick, openJobBulkContextMenu,
    openAssistantDetails, handleEditJob, retryScheduler,
  } = props.controller;
  return (
            <Show when={activeSegment() === "jobs"}>
              <LeftPaneListSection title="Jobs" count={`${jobs().length} total`} class={stylex.attrs(styles.listSection).class}>
                <CapacityBar jobs={jobs()} />
                <Show when={selectedJobs().length > 0}>
                  <div class={stylex.attrs(styles.selectionToolbar).class}>
                    <span class={stylex.attrs(styles.selectionCount).class}>{selectedJobs().length} selected</span>
                    <ActionButton tooltip="Run selected jobs now" disabled={executionPaused()} disabledReason={executionPauseReason} size="sm" icon={<Play class={stylex.attrs(styles.iconSm).class} />} onClick={() => sendBulkOperation("run-now", selectedJobs().map(jobBulkTarget))}>
                      Run now
                    </ActionButton>
                    <ActionButton tooltip="Pause selected jobs" size="sm" variant="secondary" icon={<Pause class={stylex.attrs(styles.iconSm).class} />} onClick={() => sendBulkOperation("pause", selectedJobs().map(jobBulkTarget))}>
                      Pause
                    </ActionButton>
                    <ActionButton tooltip="Resume selected jobs" size="sm" variant="secondary" icon={<Play class={stylex.attrs(styles.iconSm).class} />} onClick={() => sendBulkOperation("resume", selectedJobs().map(jobBulkTarget))}>
                      Resume
                    </ActionButton>
                    <ActionButton tooltip="Delete selected jobs" size="sm" variant="secondary" icon={<Trash2 class={stylex.attrs(styles.iconSm).class} />} onClick={() => sendBulkOperation("delete", selectedJobs().map(jobBulkTarget))}>
                      Delete
                    </ActionButton>
                    <ActionButton tooltip="Clear selection" size="sm" variant="ghost" icon={<CircleX class={stylex.attrs(styles.iconSm).class} />} onClick={() => setSelectedJobIds([])}>
                      Clear
                    </ActionButton>
                  </div>
                </Show>
                <VirtualList
                  class={stylex.attrs(styles.virtualViewport).class}
                  contentClass={stylex.attrs(styles.virtualContent).class}
                  itemClass={stylex.attrs(styles.virtualItem).class}
                  items={jobs()}
                  getKey={(job) => job.id}
                  estimateSize={210}
                  pagination={{ kind: "forward", initialCount: 60, batchSize: 60 }}
                      empty={
                    <EmptyFilteredState
                      message="No scheduled tasks match current search or filters."
                      onClear={() => harnessStore.setJobsPanePreferences({ jobSearch: "", kind: undefined, status: undefined, jobState: "all", risk: undefined })}
                      actions={
                        <>
                          <ActionButton
                            tooltip={tooltipWithPrimaryHotkey(
                              "Schedule AI job",
                              normalizeAppHotkeyPreferences(state.appHotkeyPreferences).createBackgroundJob[0]
                            )}
                            ariaLabel="Schedule job"
                            size="sm"
                            icon={<Bot class={stylex.attrs(styles.iconSm).class} />}
                            onClick={() => handleCreateJob("ai-routine")}
                          >
                            Schedule job
                          </ActionButton>
                          <ActionButton tooltip="Run shell job" size="sm" variant="secondary" icon={<Terminal class={stylex.attrs(styles.iconSm).class} />} onClick={() => handleCreateJob("shell")}>
                            Run shell job
                          </ActionButton>
                        </>
                      }
                    />
                  }
                >
                  {(job) => (
                    <article
                      class={stylex.attrs(
                        styles.denseCard,
                        styles.selectableCard,
                        selectedJob()?.id === job.id || selectedJobIdSet().has(job.id)
                          ? styles.selectedCard
                          : job.status === "enabled"
                            ? styles.borderSuccess
                            : styles.borderNeutral
                      ).class}
                      onPointerDown={(event) => scheduleDelayedSelection("job", job.id, event)}
                      onPointerUp={clearPendingSelectionTimer}
                      onPointerCancel={clearPendingSelectionTimer}
                      onPointerLeave={clearPendingSelectionTimer}
                      onClick={(event) => handleJobCardClick(job, event)}
                      onContextMenu={(event) => openJobBulkContextMenu(job, event)}
                    >
                      <div class={stylex.attrs(styles.cardHeader).class}>
                        <button type="button" class={stylex.attrs(styles.cardTitleButton).class} aria-label={`Select ${job.name}`} onClick={(event) => { event.stopPropagation(); handleJobCardClick(job, event); }}>
                          <span class={stylex.attrs(styles.cardTitle).class}>{job.name}</span>
                        </button>
                        <StatusChip tone={jobStatusTone(job.status)} class={stylex.attrs(styles.statusChip).class}>
                          {job.status}
                        </StatusChip>
                      </div>
                      <div class={stylex.attrs(styles.cardActions).class}>
                        <ActionButton
                          tooltip={selectedJobIdSet().has(job.id) ? "Remove from bulk selection" : "Add to bulk selection"}
                          icon={selectedJobIdSet().has(job.id) ? <CheckSquare2 class={stylex.attrs(styles.iconXs).class} /> : <Square class={stylex.attrs(styles.iconXs).class} />}
                          size="icon"
                          variant="ghost"
                          ariaLabel={selectedJobIdSet().has(job.id) ? `Remove ${job.name} from bulk selection` : `Add ${job.name} to bulk selection`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedRunIds([]);
                            setSelectedJobIds((ids) => toggleId(ids, job.id));
                            setJobSelectionAnchorId(job.id);
                          }}
                        />
                        <Show when={job.assistantId}>
                          {(assistantId) => (
                            <ActionButton
                              tooltip="Open owning assistant"
                              icon={<Bot class={stylex.attrs(styles.iconXs).class} />}
                              size="icon"
                              variant="ghost"
                              ariaLabel={`Open assistant for ${job.name}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                openAssistantDetails(assistantId());
                              }}
                            />
                          )}
                        </Show>
                        <ActionButton tooltip="Run task now" disabled={executionPaused()} disabledReason={executionPauseReason} icon={<Play class={stylex.attrs(styles.iconXs).class} />} size="icon" variant="ghost" ariaLabel={`Run ${job.name} now`} onClick={(event) => { event.stopPropagation(); sendCommand({ type: "background-job.run-now", requestId: createRequestId(), payload: { projectId: job.projectId, jobId: job.id } }); }} />
                        <ActionButton tooltip={job.status === "enabled" ? "Pause task" : "Resume task"} icon={job.status === "enabled" ? <Pause class={stylex.attrs(styles.iconXs).class} /> : <Play class={stylex.attrs(styles.iconXs).class} />} size="icon" variant="ghost" ariaLabel={job.status === "enabled" ? `Pause ${job.name}` : `Resume ${job.name}`} onClick={(event) => { event.stopPropagation(); sendCommand({ type: job.status === "enabled" ? "background-job.pause" : "background-job.resume", requestId: createRequestId(), payload: { projectId: job.projectId, jobId: job.id } }); }} />
                        <ActionButton tooltip="Edit task" icon={<RefreshCcw class={stylex.attrs(styles.iconXs).class} />} size="icon" variant="ghost" ariaLabel={`Edit ${job.name}`} onClick={(event) => { event.stopPropagation(); handleEditJob(job); }} />
                        <ActionButton tooltip="Delete task" icon={<Trash2 class={stylex.attrs(styles.iconXs).class} />} size="icon" variant="ghost" ariaLabel={`Delete ${job.name}`} onClick={(event) => { event.stopPropagation(); sendCommand({ type: "background-job.delete", requestId: createRequestId(), payload: { projectId: job.projectId, jobId: job.id } }); }} />
                      </div>
                      <div class={stylex.attrs(styles.cardBody).class}>
                        <div class={stylex.attrs(styles.chipRow).class}>
                          <StatusChip tone={jobKindTone(job.kind)}>{job.kind}</StatusChip>
                          <StatusChip tone={riskTone(job.riskLevel)}>{job.riskLevel}</StatusChip>
                          <StatusChip tone="neutral">{job.lane ?? "exclusive"}</StatusChip>
                        </div>
                        <div>
                          <FileLinkedText text={job.description ?? job.scheduleInput} fileLinks={getBackgroundRunFileLinks(job.projectId)} />
                        </div>
                        <div class={stylex.attrs(styles.marginTopXs).class}>
                          Next: <NextRunContent text={formatJobNextRun(job, state.backgroundJobs.runs, state.backgroundJobs.schedulerHeartbeatAt)} onRetryScheduler={retryScheduler} />
                        </div>
                        <Show when={formatFailureTrackingLine(job)}>{(line) => <div><FileLinkedText text={line()} fileLinks={getBackgroundRunFileLinks(job.projectId)} /></div>}</Show>
                        <For each={formatJobSchedulerLines(job, state.backgroundJobs.runs, state.backgroundJobs.schedulerHeartbeatAt)}>
                          {(line) => (
                            <div>
                              <SchedulerWarningContent text={line} fileLinks={getBackgroundRunFileLinks(job.projectId)} onRetryScheduler={retryScheduler} />
                            </div>
                          )}
                        </For>
                        <div>Project: {state.workspace.projects.find((project) => project.id === job.projectId)?.name ?? job.projectId}</div>
                        <div>Owner: {formatJobOwner(job, state)}</div>
                      </div>
                    </article>
                  )}
                </VirtualList>
              </LeftPaneListSection>
            </Show>
  );
}

function BackgroundJobsRunsList(props: BackgroundJobsPanelViewProps) {
  const {
    activeSegment, runListItems, selectedBackgroundRuns, executionPaused,
    executionPauseReason, setSelectedRunIds, selectedRun, selectedRunIdSet,
    runListItemFileLinks, setSelectedJobIds, setRunSelectionAnchorId,
  } = props.model;
  const {
    sendBulkOperation, runBulkTarget, openRunDetails, openProjectChatRun,
    openRunSource, handleRunListClick, scheduleDelayedSelection,
    clearPendingSelectionTimer, openRunBulkContextMenu,
  } = props.controller;
  return (
            <Show when={activeSegment() === "inbox"}>
              <LeftPaneListSection title="Runs" count={`${runListItems().length} total`} class={stylex.attrs(styles.listSection).class}>
                <Show when={selectedBackgroundRuns().length > 0}>
                  <div class={stylex.attrs(styles.selectionToolbar).class}>
                    <span class={stylex.attrs(styles.selectionCount).class}>{selectedBackgroundRuns().length} selected</span>
                    <ActionButton tooltip="Stop selected runs" size="sm" icon={<CircleX class={stylex.attrs(styles.iconSm).class} />} onClick={() => sendBulkOperation("stop", selectedBackgroundRuns().map(runBulkTarget))}>
                      Stop
                    </ActionButton>
                    <ActionButton tooltip="Retry selected runs" disabled={executionPaused()} disabledReason={executionPauseReason} size="sm" variant="secondary" icon={<RefreshCcw class={stylex.attrs(styles.iconSm).class} />} onClick={() => sendBulkOperation("retry", selectedBackgroundRuns().map(runBulkTarget))}>
                      Retry
                    </ActionButton>
                    <ActionButton tooltip="Approve selected runs" disabled={executionPaused()} disabledReason={executionPauseReason} size="sm" variant="secondary" icon={<CheckCircle2 class={stylex.attrs(styles.iconSm).class} />} onClick={() => sendBulkOperation("approve", selectedBackgroundRuns().map(runBulkTarget))}>
                      Approve
                    </ActionButton>
                    <ActionButton tooltip="Reject selected runs" size="sm" variant="secondary" icon={<Trash2 class={stylex.attrs(styles.iconSm).class} />} onClick={() => sendBulkOperation("reject", selectedBackgroundRuns().map(runBulkTarget))}>
                      Reject
                    </ActionButton>
                    <ActionButton tooltip="Clear selection" size="sm" variant="ghost" icon={<CircleX class={stylex.attrs(styles.iconSm).class} />} onClick={() => setSelectedRunIds([])}>
                      Clear
                    </ActionButton>
                  </div>
                </Show>
                <VirtualList
                  class={stylex.attrs(styles.virtualViewport).class}
                  contentClass={stylex.attrs(styles.virtualContent).class}
                  itemClass={stylex.attrs(styles.virtualItem).class}
                  items={runListItems()}
                  getKey={(item) => (item.kind === "project-chat" ? `project-chat:${item.entry.project.id}:${item.entry.run.id}` : `background:${item.run.id}`)}
                  estimateSize={135}
                  pagination={{ kind: "forward", initialCount: 60, batchSize: 60 }}
                  empty={<EmptyFilteredState message="Run history appears after first task. No runs match current search or filter." onClear={() => { harnessStore.setJobsPanePreferences({ runSearch: "" }); harnessStore.setJobsRunFilter("all"); }} />}
                >
                  {(item) => (
                    <RunListButton
                      item={item}
                      selectedRunId={selectedRun()?.id}
                      selectedForBulk={item.kind === "background" && selectedRunIdSet().has(item.run.id)}
                      fileLinks={runListItemFileLinks(item)}
                      onOpenRun={openRunDetails}
                      onOpenProjectChatRun={openProjectChatRun}
                      onOpenRunSource={openRunSource}
                      onClickItem={handleRunListClick}
                      onPointerDownItem={(entry, event) => {
                        if (entry.kind === "background") {
                          scheduleDelayedSelection("run", entry.run.id, event);
                        }
                      }}
                      onClearPendingSelection={clearPendingSelectionTimer}
                      onContextMenuItem={openRunBulkContextMenu}
                      onToggleBulkSelection={(run) => {
                        setSelectedJobIds([]);
                        setSelectedRunIds((ids) => toggleId(ids, run.id));
                        setRunSelectionAnchorId(run.id);
                      }}
                    />
                  )}
                </VirtualList>
              </LeftPaneListSection>
            </Show>
  );
}

function BackgroundJobsDetailPane(props: BackgroundJobsPanelViewProps) {
  const {
    runtime, state, sendCommand, showDetail, activeSegment, selectedRun,
    selectedJob, selectedJobRuns, selectedJobFileLinks, executionPaused,
    executionPauseReason, selectedRunTitle, selectedBackgroundRun,
    selectedRunItem, selectedRunItemFileLinks,
  } = props.model;
  const {
    handleEditJob, openAssistantDetails, retryScheduler, scrollRunDetailToBottom,
  } = props.controller;
  return (
        <Show when={showDetail() && activeSegment() !== "health"}>
          <section class={stylex.attrs(styles.detailPane).class}>
            <Show when={activeSegment() === "jobs" && !selectedRun()}>
              <JobDetail
                job={selectedJob()}
                runs={selectedJobRuns()}
                fileLinks={selectedJobFileLinks()}
                executionPaused={executionPaused()}
                executionPauseReason={executionPauseReason}
                onRunNow={(job) => sendCommand({ type: "background-job.run-now", requestId: createRequestId(), payload: { projectId: job.projectId, jobId: job.id } })}
                onStopRun={(run) => sendCommand({ type: "background-job.stop-run", requestId: createRequestId(), payload: { projectId: run.projectId, runId: run.id } })}
                onEdit={handleEditJob}
                onOpenAssistant={openAssistantDetails}
                onRetryScheduler={retryScheduler}
                schedulerHeartbeatAt={state.backgroundJobs.schedulerHeartbeatAt}
              />
            </Show>
            <Show when={activeSegment() !== "jobs" || selectedRun()} fallback={null}>
              <Show when={selectedRun()} fallback={<DetailEmptyState>Select background run or job to inspect details.</DetailEmptyState>}>
                {(run) => (
                  <div class={stylex.attrs(styles.detailContent).class}>
                    <div class={stylex.attrs(styles.detailHeader).class}>
                      <div class={stylex.attrs(styles.minWidthZero).class}>
                        <div class={stylex.attrs(styles.inlineChips).class}>
                          <div class={stylex.attrs(styles.eyebrow).class}>Run detail</div>
                          <StatusChip tone={runStatusTone(run().status)}>
                            {run().status}
                          </StatusChip>
                        </div>
                        <h2 class={stylex.attrs(styles.detailTitle).class}>{selectedRunTitle()}</h2>
                        <div class={stylex.attrs(styles.factGrid).class}>
                          <RunFact label="Run">
                            <span class={stylex.attrs(styles.breakAll).class}>{run().id}</span>
                            <CopyTextButton
                              value={run().id}
                              tooltip="Copy run id"
                              copiedDescription="Run id copied to clipboard."
                              ariaLabel="Copy run id"
                              size="sm"
                              variant="ghost"
                            />
                          </RunFact>
                          <RunFact label="Trigger">{selectedBackgroundRun()?.triggerSource ?? "project chat"}</RunFact>
                          <RunFact label="Approval">{selectedBackgroundRun()?.approvalStatus ?? "approved"}</RunFact>
                          <Show when={formatRunListItemProgress(selectedRunItem())}>
                            {(progress) => <RunFact label="Progress">{progress()}</RunFact>}
                          </Show>
                          <RunFact label="Summary">
                            <FileLinkedText text={run().summary ?? "n/a"} fileLinks={selectedRunItemFileLinks()} />
                          </RunFact>
                          <Show when={run().failureCategory}>
                            {(category) => <RunFact label="Failure category">{formatFailureCategory(category())}</RunFact>}
                          </Show>
                          <Show when={formatPromptStats(run().promptStats)}>
                            {(stats) => <RunFact label="Prompt">{stats()}</RunFact>}
                          </Show>
                          <Show when={run().failureMessage}>
                            {(failure) => (
                              <RunFact label="Failure">
                                <FileLinkedText text={failure()} fileLinks={selectedRunItemFileLinks()} />
                              </RunFact>
                            )}
                          </Show>
                        </div>
                      </div>

                      <div class={stylex.attrs(styles.actionRow).class}>
                        <Show when={selectedJob()?.assistantId}>
                          {(assistantId) => (
                            <ActionButton tooltip="Open owning assistant" variant="secondary" icon={<Bot class={stylex.attrs(styles.iconMd).class} />} onClick={() => openAssistantDetails(assistantId())}>
                              Assistant
                            </ActionButton>
                          )}
                        </Show>
                        <BackgroundRunActions run={selectedBackgroundRun()} executionPaused={executionPaused()} executionPauseReason={executionPauseReason} />
                      </div>
                    </div>
                    <VirtualList
                      viewportRef={(element) => {
                        runtime.runDetailViewport = element;
                        scrollRunDetailToBottom();
                      }}
                      class={stylex.attrs(styles.detailViewport).class}
                      contentClass={stylex.attrs(styles.virtualContent).class}
                      itemClass={stylex.attrs(styles.virtualItem).class}
                      items={selectedBackgroundRun()?.events ?? []}
                      getKey={(event) => event.id}
                      estimateSize={135}
                      pagination={{ kind: "reverse", initialCount: 80, batchSize: 80 }}
                      stickToEnd
                    >
                      {(event) => (
                        <article class={[stylex.attrs(styles.eventRow).class, runEventStageBorderClass(event.stage)].join(" ")}>
                          <div class={stylex.attrs(styles.eventMeta).class}>
                            <span>{event.stage}</span>
                            <span>{formatShortTimestamp(event.createdAt)}</span>
                          </div>
                          <div class={stylex.attrs(styles.eventTitle).class}>
                            <FileLinkedText text={event.message} fileLinks={selectedRunItemFileLinks()} />
                          </div>
                          <Show when={event.detail}>
                            {(detail) => (
                              <div class={stylex.attrs(styles.eventDetail).class}>
                                <FileLinkedText text={detail()} fileLinks={selectedRunItemFileLinks()} />
                              </div>
                            )}
                          </Show>
                        </article>
                      )}
                    </VirtualList>
                  </div>
                )}
              </Show>
            </Show>
          </section>
        </Show>
  );
}

function BackgroundJobsPanelOverlays(props: BackgroundJobsPanelViewProps) {
  const {
    detailsRunId, detailsRun, detailsJob, detailsRunFileLinks,
    detailsLogEntries, contextMenu, setContextMenu,
  } = props.model;
  return (
    <>
      <Show when={detailsRunId() && detailsRun()}>
          <Dialog
            open
            title={detailsJob()?.name ?? detailsRun()?.jobId ?? "Background run"}
            eyebrow="Execution details"
            description={formatDetailsRunDescription(detailsRun())}
            class={stylex.attrs(styles.dialogWide).class}
            contentClass={stylex.attrs(styles.dialogBody).class}
            onClose={() => harnessStore.closeBackgroundJobDetailsDialog()}
          >
            <div class={stylex.attrs(styles.dialogStack).class}>
              <div class={stylex.attrs(styles.metadataStack).class}>
                <div class={stylex.attrs(styles.inlineChips).class}>
                  <span>Run: {detailsRun()?.id}</span>
                  <Show when={detailsRun()?.id}>
                    {(runId) => (
                      <CopyTextButton
                        value={runId()}
                        tooltip="Copy run id"
                        copiedDescription="Run id copied to clipboard."
                        ariaLabel="Copy run id"
                        size="sm"
                        variant="ghost"
                      />
                    )}
                  </Show>
                </div>
                <div>Trigger: {detailsRun()?.triggerSource}</div>
                <div>Approval: {detailsRun()?.approvalStatus}</div>
                <Show when={detailsRun()?.summary}>
                  {(summary) => (
                    <div>
                      <FileLinkedText text={`Summary: ${summary()}`} fileLinks={detailsRunFileLinks()} />
                    </div>
                  )}
                </Show>
                <Show when={detailsRun()?.failureCategory}>
                  {(category) => <div>Failure category: {formatFailureCategory(category())}</div>}
                </Show>
                <Show when={formatPromptStats(detailsRun()?.promptStats)}>
                  {(stats) => <div>Prompt: {stats()}</div>}
                </Show>
                <Show when={detailsRun()?.failureMessage}>
                  {(failure) => (
                    <div>
                      <FileLinkedText text={`Failure: ${failure()}`} fileLinks={detailsRunFileLinks()} />
                    </div>
                  )}
                </Show>
              </div>
              <ExecutionLog entries={detailsLogEntries()} emptyMessage="No execution log yet." fileLinks={detailsRunFileLinks()} />
            </div>
          </Dialog>
      </Show>
      <Show when={contextMenu()}>
        {(menu) => (
          <ContextMenu
            open={true}
            x={menu().x}
            y={menu().y}
            ariaLabel={menu().label}
            actions={menu().actions}
            onClose={() => setContextMenu(undefined)}
          />
        )}
      </Show>
    </>
  );
}

function RunFact(props: { label: string; children: JSX.Element }) {
  return (
    <div class={stylex.attrs(styles.runFact).class}>
      <span class={stylex.attrs(styles.runFactLabel).class}>{props.label}: </span>
      <span>{props.children}</span>
    </div>
  );
}

const SCHEDULER_HEARTBEAT_WARNING_PREFIX = "Stale: scheduler has not checked since";

function NextRunContent(props: { text: string; onRetryScheduler: () => void }) {
  return (
    <Show when={props.text.startsWith(SCHEDULER_HEARTBEAT_WARNING_PREFIX)} fallback={props.text}>
      <SchedulerWarningContent text={props.text} onRetryScheduler={props.onRetryScheduler} />
    </Show>
  );
}

function SchedulerWarningContent(props: { text: string; fileLinks?: FileLinkConfig; onRetryScheduler: () => void }) {
  return (
    <span class={stylex.attrs(styles.schedulerContent).class}>
      <FileLinkedText text={props.text} fileLinks={props.fileLinks} class={stylex.attrs(styles.runFact).class} />
      <Show when={props.text.startsWith(SCHEDULER_HEARTBEAT_WARNING_PREFIX)}>
        <ActionButton
          tooltip="Ask scheduler to check for due background jobs now"
          ariaLabel="Retry scheduler"
          size="sm"
          variant="secondary"
          icon={<RefreshCcw class={stylex.attrs(styles.iconSm).class} />}
          onClick={(event) => {
            event.stopPropagation();
            props.onRetryScheduler();
          }}
        >
          Retry scheduler
        </ActionButton>
      </Show>
    </span>
  );
}

function RunListButton(props: {
  item: RunListItem;
  selectedRunId?: string;
  selectedForBulk?: boolean;
  fileLinks?: FileLinkConfig;
  onOpenRun: (run: BackgroundJobRun) => void;
  onOpenProjectChatRun: (runId: string) => void;
  onOpenRunSource: (item: RunListItem) => void;
  onClickItem?: (item: RunListItem, event: MouseEvent, openRunItem: () => void) => void;
  onPointerDownItem?: (item: RunListItem, event: PointerEvent) => void;
  onClearPendingSelection?: () => void;
  onContextMenuItem?: (item: RunListItem, event: MouseEvent) => void;
  onToggleBulkSelection?: (run: BackgroundJobRun, event: MouseEvent) => void;
}) {
  const selected = createMemo(() => props.selectedRunId === runListItemRun(props.item).id);
  const progress = () => props.item.kind === "background" ? formatRunProgress(props.item.run) : undefined;
  const openRunItem = () =>
    props.item.kind === "project-chat"
      ? props.onOpenProjectChatRun(props.item.entry.run.id)
      : props.onOpenRun(props.item.run);
  const openFromEvent = (event: MouseEvent) => {
    if (props.onClickItem) props.onClickItem(props.item, event, openRunItem);
    else openRunItem();
  };
  return (
    <article
      class={[
        stylex.attrs(styles.denseCard, styles.runCard).class,
        selected() || props.selectedForBulk
          ? stylex.attrs(styles.selectedCard).class
          : runListItemBorderClass(props.item)
      ].join(" ")}
      aria-label={`Run ${formatRunListItemTitle(props.item)}`}
      onPointerDown={(event) => props.onPointerDownItem?.(props.item, event)}
      onPointerUp={props.onClearPendingSelection}
      onPointerCancel={props.onClearPendingSelection}
      onPointerLeave={props.onClearPendingSelection}
      onClick={(event) => { if (!isInteractiveSelectionTarget(event.target)) openFromEvent(event); }}
      onContextMenu={(event) => props.onContextMenuItem?.(props.item, event)}
    >
      <div class={stylex.attrs(styles.runCardHeader).class}>
        <div class={stylex.attrs(styles.runCardHeading).class}>
          <ActionButton
            tooltip="Open run details"
            icon={<MessageSquareText class={stylex.attrs(styles.iconXs).class} />}
            size="icon"
            variant="ghost"
            ariaLabel={`Open run details for ${formatRunListItemTitle(props.item)}`}
            onClick={openFromEvent}
          />
          <Show when={props.item.kind === "background"}>
            <ActionButton
              tooltip={props.selectedForBulk ? "Remove from bulk selection" : "Add to bulk selection"}
              icon={props.selectedForBulk ? <CheckSquare2 class={stylex.attrs(styles.iconXs).class} /> : <Square class={stylex.attrs(styles.iconXs).class} />}
              size="icon"
              variant="ghost"
              ariaLabel={props.selectedForBulk ? `Remove ${formatRunListItemTitle(props.item)} from bulk selection` : `Add ${formatRunListItemTitle(props.item)} to bulk selection`}
              onClick={(event) => {
                event.stopPropagation();
                if (props.item.kind === "background") {
                  props.onToggleBulkSelection?.(props.item.run, event);
                }
              }}
            />
          </Show>
          <button
            type="button"
            class={stylex.attrs(styles.runSourceButton).class}
            aria-label={`Open source for ${formatRunListItemTitle(props.item)}`}
            onClick={(event) => {
              event.stopPropagation();
              props.onOpenRunSource(props.item);
            }}
          >
            {formatRunListItemTitle(props.item)}
          </button>
        </div>
        <StatusChip tone={runListItemTone(props.item)} class={stylex.attrs(styles.statusChip).class}>
          {runListItemStatus(props.item)}
        </StatusChip>
      </div>
      <div class={stylex.attrs(styles.runSummary).class}>
        <div class={stylex.attrs(styles.lineClampThree).class}>
          <FileLinkedText text={() => formatRunListItemSummary(props.item) ?? ""} fileLinks={props.fileLinks} />
        </div>
        <Show when={progress()}>
          {(value) => <div class={stylex.attrs(styles.truncate).class}>{value()}</div>}
        </Show>
        <div class={stylex.attrs(styles.timeLine).class}>{formatRunListItemTime(props.item)}</div>
      </div>
    </article>
  );
}

function HealthView(props: {
  diagnostics: () => RunDiagnosticsViewState;
  healthWindowDays: RunDiagnosticsWindowDays;
  onSelectWindow: (windowDays: RunDiagnosticsWindowDays) => void;
  onRefresh: () => void;
}) {
  const assistantLabel = (assistantId?: string) => {
    if (!assistantId) {
      return "Unowned";
    }
    return harnessStore.state.assistants.assistants.find((assistant) => assistant.id === assistantId)?.name ?? assistantId;
  };

  return (
    <section class={stylex.attrs(styles.healthPanel).class}>
      <div class={stylex.attrs(styles.healthHeader).class}>
        <div class={stylex.attrs(styles.inlineChips).class}>
          <For each={[1, 7, 30] as const}>
            {(windowDays) => (
              <Tooltip content={`Inspect the last ${windowDays === 1 ? "24 hours" : `${windowDays} days`}`}>
                <button
                  type="button"
                  class={stylex.attrs(
                    styles.healthWindowButton,
                    props.healthWindowDays === windowDays ? styles.healthWindowSelected : styles.healthWindowIdle
                  ).class}
                  onClick={() => props.onSelectWindow(windowDays)}
                >
                  {windowDays === 1 ? "24h" : `${windowDays}d`}
                </button>
              </Tooltip>
            )}
          </For>
        </div>
        <ActionButton
          tooltip={props.diagnostics().loading ? "Refreshing diagnostics" : "Refresh diagnostics"}
          disabled={props.diagnostics().loading}
          disabledReason={props.diagnostics().loading ? "Diagnostics request already in flight" : undefined}
          icon={<RefreshCcw class={stylex.attrs(styles.iconMd).class} />}
          variant="secondary"
          onClick={props.onRefresh}
        >
          Refresh
        </ActionButton>
      </div>

      <Show
        when={props.diagnostics().report}
        fallback={
          <div class={stylex.attrs(styles.emptyHealth).class}>
            {props.diagnostics().loading ? "Loading diagnostics..." : "Open Health to inspect recent reliability."}
          </div>
        }
      >
        {(report) => (
          <ScrollArea class={stylex.attrs(styles.virtualViewport).class}>
            <div class={stylex.attrs(styles.healthSections).class}>
              <div class={stylex.attrs(styles.summaryGrid).class}>
                <For each={buildHealthSummaryRows(report())}>
                  {(row) => (
                    <div class={stylex.attrs(styles.denseCard, styles.summaryCard).class}>
                      <div class={stylex.attrs(styles.summaryLabel).class}>{row.label}</div>
                      <div class={stylex.attrs(styles.summaryValue, rightAlignedNumbersEnabled() && styles.numeric).class}>{row.value}</div>
                    </div>
                  )}
                </For>
              </div>

              <HealthTable
                title="Backoff"
                emptyMessage="No enabled jobs are currently backoff-blocked."
                headers={["Job", "Assistant", "Streak", "Backoff until", "Last failure"]}
                rows={report().activeBackoffJobRows.map((row) => [
                  row.jobName,
                  assistantLabel(row.assistantId),
                  String(row.consecutiveFailureCount),
                  formatShortTimestamp(row.backoffUntil),
                  row.lastFailureCategory ? formatFailureCategory(row.lastFailureCategory) : "n/a"
                ])}
              />

              <HealthTable
                title="Failure Breakdown"
                emptyMessage="No classified failures in this window."
                headers={["Source", "Category", "Count", "Share", "Owner"]}
                rows={report().failureBreakdown.map((row) => [
                  row.sourceType,
                  formatFailureCategory(row.failureCategory),
                  String(row.count),
                  formatShare(row.share),
                  row.jobId ?? row.assistantId ?? "n/a"
                ])}
              />

              <div class={stylex.attrs(styles.healthPairGrid).class}>
                <HealthTable
                  title="Repeated Prompt Hashes"
                  emptyMessage="No repeated prompt hashes in this window."
                  headers={["Source", "Hash", "Runs", "Avg chars", "Owner", "Latest"]}
                  rows={report().topPromptHashes.map((row) => [
                    row.sourceType,
                    row.promptHash,
                    String(row.runCount),
                    String(row.averagePromptChars),
                    row.jobId ?? row.assistantId ?? "n/a",
                    formatShortTimestamp(row.latestSeenAt)
                  ])}
                />
                <HealthTable
                  title="Prompt Size By Owner"
                  emptyMessage="No prompt-size owner rows in this window."
                  headers={["Owner", "Runs", "Avg chars", "Latest"]}
                  rows={report().promptSizeByOwner.map((row) => [
                    row.jobId ?? row.assistantId ?? "n/a",
                    String(row.runCount),
                    String(row.averagePromptChars),
                    formatShortTimestamp(row.latestSeenAt)
                  ])}
                />
              </div>

              <HealthTable
                title="Daily Failure Series"
                emptyMessage="No daily failure rows in this window."
                headers={["Day", "Source", "Category", "Count", "Job"]}
                rows={report().dailyFailureSeries.map((row) => [
                  row.day,
                  row.sourceType,
                  formatFailureCategory(row.failureCategory),
                  String(row.count),
                  row.jobId ?? "n/a"
                ])}
              />
            </div>
          </ScrollArea>
        )}
      </Show>
    </section>
  );
}

function HealthTable(props: {
  title: string;
  headers: string[];
  rows: string[][];
  emptyMessage: string;
}) {
  return (
    <section>
      <div class={stylex.attrs(styles.healthTableTitle).class}>{props.title}</div>
      <Show
        when={props.rows.length > 0}
        fallback={<div class={stylex.attrs(styles.healthTableEmpty).class}>{props.emptyMessage}</div>}
      >
        <div class={stylex.attrs(styles.healthTable).class}>
          <div class={[stylex.attrs(styles.healthTableHeader).class, healthTableColumnClass(props.headers.length)].join(" ")}>
            <For each={props.headers}>{(header) => <div class={stylex.attrs(rightAlignedNumbersEnabled() && isRightAlignedHealthHeader(header) && styles.numeric).class}>{header}</div>}</For>
          </div>
          <div class={stylex.attrs(styles.healthTableBody).class}>
            <For each={props.rows}>
              {(row) => (
                <div class={[stylex.attrs(styles.healthTableRow).class, healthTableColumnClass(row.length)].join(" ")}>
                  <For each={row}>{(cell, index) => <div class={stylex.attrs(styles.truncate, rightAlignedNumbersEnabled() && isRightAlignedHealthHeader(props.headers[index()]) && styles.numeric).class}>{cell}</div>}</For>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </section>
  );
}

function jobsPaneMenuItems(
  state: typeof harnessStore.state,
  segment: "jobs" | "inbox" | "health",
  allowSegmentSwitch: boolean
): LeftPaneSearchMenuItem[] {
  const preferences = state.jobsPanePreferences;
  const setPreferences = harnessStore.setJobsPanePreferences;
  type MenuOption = Extract<LeftPaneSearchMenuItem, { kind: "option" }>;
  const jobSortOption = (label: string, value: JobsPaneJobSort, icon: JSX.Element): MenuOption => ({
    kind: "option",
    label,
    icon,
    selected: preferences.jobSort === value,
    onSelect: () => setPreferences({ jobSort: value })
  });
  const runSortOption = (label: string, value: JobsPaneRunSort, icon: JSX.Element): MenuOption => ({
    kind: "option",
    label,
    icon,
    selected: (preferences.runSort ?? "urgency") === value,
    onSelect: () => setPreferences({ runSort: value })
  });
  const segmentItems = jobsPaneSegmentItems(segment, allowSegmentSwitch);

  if (segment === "jobs") {
    return [
      ...segmentItems,
      {
        kind: "submenu",
        label: "Sort jobs",
        value: formatJobSortLabel(preferences.jobSort),
        icon: <Clock3 class={stylex.attrs(styles.iconSm).class} />,
        items: [
          jobSortOption("Next run", "next-run", <Clock3 class={stylex.attrs(styles.iconSm).class} />),
          jobSortOption("Updated", "updated", <Calendar class={stylex.attrs(styles.iconSm).class} />),
          jobSortOption("Created", "created", <Calendar class={stylex.attrs(styles.iconSm).class} />),
          jobSortOption("Status", "status", <ListFilter class={stylex.attrs(styles.iconSm).class} />),
          jobSortOption("Risk", "risk", <ShieldCheck class={stylex.attrs(styles.iconSm).class} />)
        ]
      },
      {
        kind: "submenu",
        label: "Kind",
        value: preferences.kind === "ai-routine" ? "AI" : preferences.kind === "shell" ? "Shell" : "All",
        icon: <ListFilter class={stylex.attrs(styles.iconSm).class} />,
        active: Boolean(preferences.kind),
        items: [
          {
            kind: "option",
            label: "All kinds",
            icon: <ListFilter class={stylex.attrs(styles.iconSm).class} />,
            selected: !preferences.kind,
            onSelect: () => setPreferences({ kind: undefined })
          },
          {
            kind: "option",
            label: "AI routine",
            icon: <Bot class={stylex.attrs(styles.iconSm).class} />,
            selected: preferences.kind === "ai-routine",
            active: preferences.kind === "ai-routine",
            onSelect: () => setPreferences({ kind: "ai-routine" })
          },
          {
            kind: "option",
            label: "Shell",
            icon: <Terminal class={stylex.attrs(styles.iconSm).class} />,
            selected: preferences.kind === "shell",
            active: preferences.kind === "shell",
            onSelect: () => setPreferences({ kind: "shell" })
          }
        ]
      },
      {
        kind: "submenu",
        label: "Status",
        value: preferences.status ? toProperCase(preferences.status) : "All",
        icon: <Pause class={stylex.attrs(styles.iconSm).class} />,
        active: Boolean(preferences.status),
        items: [
          {
            kind: "option",
            label: "All statuses",
            icon: <ListFilter class={stylex.attrs(styles.iconSm).class} />,
            selected: !preferences.status,
            onSelect: () => setPreferences({ status: undefined })
          },
          ...(["enabled", "paused", "disabled"] as const).map((status) => ({
            kind: "option" as const,
            label: toProperCase(status),
            icon: <Pause class={stylex.attrs(styles.iconSm).class} />,
            selected: preferences.status === status,
            active: preferences.status === status,
            onSelect: () => setPreferences({ status })
          }))
        ]
      },
      {
        kind: "submenu",
        label: "Job state",
        value: jobStateFilterLabel(preferences.jobState ?? "all"),
        icon: <ShieldCheck class={stylex.attrs(styles.iconSm).class} />,
        active: (preferences.jobState ?? "all") !== "all",
        items: (["all", "idle", "due", "queued", "blocked", "running", "stale", "backoff"] as const).map((jobState) => ({
          kind: "option" as const,
          label: jobStateFilterLabel(jobState),
          icon: jobStateFilterIcon(jobState),
          selected: (preferences.jobState ?? "all") === jobState,
          active: jobState !== "all" && (preferences.jobState ?? "all") === jobState,
          onSelect: () => setPreferences({ jobState })
        }))
      },
      {
        kind: "submenu",
        label: "Risk",
        value: preferences.risk ? toProperCase(preferences.risk) : "All",
        icon: <ShieldCheck class={stylex.attrs(styles.iconSm).class} />,
        active: Boolean(preferences.risk),
        items: [
          {
            kind: "option",
            label: "All risk",
            icon: <ListFilter class={stylex.attrs(styles.iconSm).class} />,
            selected: !preferences.risk,
            onSelect: () => setPreferences({ risk: undefined })
          },
          ...(["safe", "slightly-unsafe", "unsafe"] as const).map((risk) => ({
            kind: "option" as const,
            label: toProperCase(risk),
            icon: <ShieldCheck class={stylex.attrs(styles.iconSm).class} />,
            selected: preferences.risk === risk,
            active: preferences.risk === risk,
            onSelect: () => setPreferences({ risk })
          }))
        ]
      },
      { kind: "separator" },
      {
        kind: "option",
        label: "Clear search and filters",
        icon: <Trash2 class={stylex.attrs(styles.iconSm).class} />,
        onSelect: () => setPreferences({ jobSearch: "", kind: undefined, status: undefined, jobState: "all", risk: undefined })
      }
    ];
  }

  return [
    ...segmentItems,
    {
      kind: "submenu",
      label: "Sort runs",
      value: formatRunSortLabel(preferences.runSort ?? "urgency"),
      icon: <Clock3 class={stylex.attrs(styles.iconSm).class} />,
      items: [
        runSortOption("Urgency", "urgency", <ShieldCheck class={stylex.attrs(styles.iconSm).class} />),
        runSortOption("Updated", "updated", <Calendar class={stylex.attrs(styles.iconSm).class} />),
        runSortOption("Queued", "queued", <Clock3 class={stylex.attrs(styles.iconSm).class} />),
        runSortOption("Status", "status", <ListFilter class={stylex.attrs(styles.iconSm).class} />)
      ]
    },
    {
      kind: "submenu",
      label: "Run state",
      value: runFilterLabel(state.jobsRunFilter),
      icon: <ShieldCheck class={stylex.attrs(styles.iconSm).class} />,
      active: state.jobsRunFilter !== "all",
      items: (["all", "approval", "input", "queued", "running", "failed", "done"] as const).map((filter) => ({
        kind: "option" as const,
        label: runFilterLabel(filter),
        icon: runFilterIcon(filter),
        selected: state.jobsRunFilter === filter,
        active: filter !== "all" && state.jobsRunFilter === filter,
        onSelect: () => harnessStore.setJobsRunFilter(filter)
      }))
    },
    { kind: "separator" },
    {
      kind: "option",
      label: "Clear search and filters",
      icon: <Trash2 class={stylex.attrs(styles.iconSm).class} />,
      onSelect: () => {
        setPreferences({ runSearch: "" });
        harnessStore.setJobsRunFilter("all");
      }
    }
  ];
}

function activeJobsPaneFilterCount(state: typeof harnessStore.state, segment: "jobs" | "inbox" | "health") {
  if (segment === "jobs") {
    return [
      state.jobsPanePreferences.kind,
      state.jobsPanePreferences.status,
      state.jobsPanePreferences.jobState && state.jobsPanePreferences.jobState !== "all" ? state.jobsPanePreferences.jobState : undefined,
      state.jobsPanePreferences.risk
    ].filter(Boolean).length;
  }
  if (segment === "inbox") {
    return state.jobsRunFilter === "all" ? 0 : 1;
  }
  return 0;
}

function formatJobSortLabel(sort: JobsPaneJobSort) {
  if (sort === "next-run") {
    return "Next run";
  }
  if (sort === "created") {
    return "Created";
  }
  if (sort === "status") {
    return "Status";
  }
  if (sort === "risk") {
    return "Risk";
  }
  return "Updated";
}

function formatRunSortLabel(sort: JobsPaneRunSort) {
  if (sort === "queued") {
    return "Queued";
  }
  if (sort === "updated") {
    return "Updated";
  }
  if (sort === "status") {
    return "Status";
  }
  return "Urgency";
}

function EmptyFilteredState(props: { message: string; onClear: () => void; actions?: JSX.Element }) {
  return (
    <LeftPaneEmptyState>
      <div>{props.message}</div>
      <Show when={props.actions}>
        <div class={stylex.attrs(styles.emptyActions).class}>{props.actions}</div>
      </Show>
      <div class={stylex.attrs(styles.emptyClear).class}>
        <ActionButton tooltip="Clear search and filters" size="sm" variant="ghost" onClick={props.onClear}>
          Clear
        </ActionButton>
      </div>
    </LeftPaneEmptyState>
  );
}

function buildHealthSummaryRows(report: NonNullable<RunDiagnosticsViewState["report"]>) {
  return [
    { label: "Active backoff jobs", value: String(report.summary.activeBackoffJobs) },
    { label: "Background failures", value: String(report.summary.backgroundFailureCount) },
    { label: "Lifecycle-failure share", value: formatShare(report.summary.lifecycleFailureShare) },
    { label: "Agent empty responses", value: String(report.summary.agentEmptyResponseCount) },
    { label: "Question conflicts", value: String(report.summary.questionPersistConflictCount) },
    {
      label: "Dominant background failure",
      value: report.summary.dominantBackgroundFailureCategory ? formatFailureCategory(report.summary.dominantBackgroundFailureCategory) : "n/a"
    }
  ];
}

function healthTableColumnClass(columnCount: number) {
  switch (columnCount) {
    case 3:
      return stylex.attrs(styles.columnsThree).class;
    case 4:
      return stylex.attrs(styles.columnsFour).class;
    case 5:
      return stylex.attrs(styles.columnsFive).class;
    case 6:
      return stylex.attrs(styles.columnsSix).class;
    default:
      return stylex.attrs(styles.columnsThree).class;
  }
}

function isRightAlignedHealthHeader(header: string) {
  return ["Count", "Share", "Runs", "Avg chars", "Streak"].includes(header);
}

function formatShare(value: number) {
  return `${Math.round(value * 100)}%`;
}

function matchesRunFilter(run: BackgroundJobRun, filter: JobsRunFilter) {
  switch (filter) {
    case "all":
      return true;
    case "approval":
      return run.status === "awaiting-approval" || run.approvalStatus === "pending";
    case "input":
      return run.status === "awaiting-user-input";
    case "queued":
      return run.status === "queued";
    case "running":
      return run.status === "running";
    case "failed":
      return run.status === "failed" || run.status === "cancelled";
    case "done":
      return run.status === "succeeded" || run.status === "partial-complete" || run.status === "skipped";
  }
}

function matchesProjectChatRunFilter(run: AgentRunState, filter: JobsRunFilter) {
  switch (filter) {
    case "all":
      return true;
    case "approval":
      return false;
    case "input":
      return run.status === "awaiting-user-input";
    case "queued":
      return run.status === "planning" || run.status === "ready";
    case "running":
      return isRunningProjectChatRunStatus(run.status);
    case "failed":
      return run.status === "failed" || run.status === "stopped";
    case "done":
      return run.status === "completed" || run.status === "partial-complete";
  }
}

function matchesJobFilters(job: BackgroundJob, state: typeof harnessStore.state) {
  const preferences = state.jobsPanePreferences;
  if (preferences.kind && job.kind !== preferences.kind) {
    return false;
  }
  if (preferences.status && job.status !== preferences.status) {
    return false;
  }
  if (preferences.jobState && preferences.jobState !== "all" && !matchesJobStateFilter(job, preferences.jobState)) {
    return false;
  }
  if (preferences.risk && job.riskLevel !== preferences.risk) {
    return false;
  }
  return true;
}

function matchesJobStateFilter(job: BackgroundJob, filter: Exclude<JobsJobStateFilter, "all">) {
  if (filter === "backoff") {
    return Boolean(job.backoffUntil);
  }
  return job.schedulerStatus === filter;
}

function compareJobs(left: BackgroundJob, right: BackgroundJob, sort: JobsPaneJobSort) {
  if (sort === "updated") {
    return right.updatedAt.localeCompare(left.updatedAt);
  }
  if (sort === "created") {
    return right.createdAt.localeCompare(left.createdAt);
  }
  if (sort === "status") {
    return left.status.localeCompare(right.status) || right.updatedAt.localeCompare(left.updatedAt);
  }
  if (sort === "risk") {
    return riskRank(right.riskLevel) - riskRank(left.riskLevel) || right.updatedAt.localeCompare(left.updatedAt);
  }
  return compareOptionalIsoAsc(resolveJobNextRunAt(left), resolveJobNextRunAt(right)) || right.updatedAt.localeCompare(left.updatedAt);
}

function compareRuns(left: BackgroundJobRun, right: BackgroundJobRun, sort: JobsPaneRunSort) {
  if (sort === "updated") {
    return right.updatedAt.localeCompare(left.updatedAt);
  }
  if (sort === "queued") {
    return right.queuedAt.localeCompare(left.queuedAt);
  }
  if (sort === "status") {
    return left.status.localeCompare(right.status) || right.updatedAt.localeCompare(left.updatedAt);
  }
  return compareRunsByUrgency(left, right);
}

function compareRunListItems(left: RunListItem, right: RunListItem, sort: JobsPaneRunSort) {
  if (sort === "updated") {
    return runListItemUpdatedAt(right).localeCompare(runListItemUpdatedAt(left));
  }
  if (sort === "queued") {
    return runListItemQueuedAt(right).localeCompare(runListItemQueuedAt(left));
  }
  if (sort === "status") {
    return runListItemStatus(left).localeCompare(runListItemStatus(right)) || runListItemUpdatedAt(right).localeCompare(runListItemUpdatedAt(left));
  }
  return compareRunListItemsByUrgency(left, right);
}

function compareRunsByUrgency(left: BackgroundJobRun, right: BackgroundJobRun) {
  return runUrgencyRank(left) - runUrgencyRank(right) || right.updatedAt.localeCompare(left.updatedAt);
}

function compareRunListItemsByUrgency(left: RunListItem, right: RunListItem) {
  return runListItemUrgencyRank(left) - runListItemUrgencyRank(right) || runListItemUpdatedAt(right).localeCompare(runListItemUpdatedAt(left));
}

function runUrgencyRank(run: BackgroundJobRun) {
  if (run.status === "awaiting-user-input" || run.status === "awaiting-approval" || run.approvalStatus === "pending") {
    return 0;
  }
  if (run.status === "running") {
    return 1;
  }
  if (run.status === "failed" || run.status === "cancelled") {
    return 2;
  }
  if (run.status === "partial-complete") {
    return 3;
  }
  if (run.status === "queued") {
    return 4;
  }
  return 5;
}

function runListItemUrgencyRank(item: RunListItem) {
  if (item.kind === "background") {
    return runUrgencyRank(item.run);
  }
  if (item.entry.run.status === "awaiting-user-input") {
    return 0;
  }
  if (isRunningProjectChatRunStatus(item.entry.run.status)) {
    return 1;
  }
  if (item.entry.run.status === "failed" || item.entry.run.status === "stopped" || item.entry.run.status === "partial-complete") {
    return 2;
  }
  if (item.entry.run.status === "planning" || item.entry.run.status === "ready") {
    return 3;
  }
  return 4;
}

function isRunningProjectChatRunStatus(status: AgentRunState["status"]) {
  return status === "running-main" || status === "running-subagents" || status === "aggregating";
}

function runListItemStatus(item: RunListItem) {
  return item.kind === "project-chat" ? item.entry.run.status : item.run.status;
}

function runListItemUpdatedAt(item: RunListItem) {
  return item.kind === "project-chat" ? item.entry.run.updatedAt : item.run.updatedAt;
}

function runListItemQueuedAt(item: RunListItem) {
  return item.kind === "project-chat" ? item.entry.run.createdAt : item.run.queuedAt;
}

function riskRank(risk: BackgroundJob["riskLevel"]) {
  switch (risk) {
    case "unsafe":
      return 3;
    case "slightly-unsafe":
      return 2;
    case "safe":
      return 1;
  }
}

function compareOptionalIsoAsc(left?: string, right?: string) {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }
  return left.localeCompare(right);
}

function resolveJobNextRunAt(job: BackgroundJob) {
  if (job.nextRunAt) {
    return job.nextRunAt;
  }
  if (job.schedule.type === "interval" || job.schedule.type === "cron") {
    return job.schedule.nextRunAt;
  }
  return job.schedule.consumedAt ? undefined : job.schedule.runAt;
}

function CapacityBar(props: { jobs: BackgroundJob[] }) {
  const ratio = createMemo(() => Math.max(0, ...props.jobs.map((job) => job.schedulerCongestionRatio ?? 0)));
  const percent = createMemo(() => Math.round(ratio() * 100));
  const status = createMemo(() => {
    if (ratio() > 1) {
      return `Congested (${percent()}%) - Skipping runs`;
    }
    if (ratio() >= 0.8) {
      return `Tight (${percent()}%)`;
    }
    return `Healthy (${percent()}%)`;
  });
  const barClass = createMemo(() => {
    if (ratio() > 1) {
      return stylex.attrs(styles.capacityCongested).class;
    }
    if (ratio() >= 0.8) {
      return stylex.attrs(styles.capacityTight).class;
    }
    return stylex.attrs(styles.capacityHealthy).class;
  });
  return (
    <Tooltip content="Recurring tasks are taking longer than their frequency. Some runs will be skipped to prevent state corruption.">
      <div class={stylex.attrs(styles.capacity).class}>
        <div class={stylex.attrs(styles.capacityHeader).class}>
          <span>Capacity</span>
          <span>{status()}</span>
        </div>
        <div class={stylex.attrs(styles.capacityTrack).class}>
          <div class={[stylex.attrs(styles.capacityBar).class, barClass()].join(" ")} style={{ width: `${Math.min(100, percent())}%` }} />
        </div>
      </div>
    </Tooltip>
  );
}

function formatJobNextRun(job: BackgroundJob, runs: BackgroundJobRun[], schedulerHeartbeatAt?: string) {
  const activeRun = findActiveJobRun(job, runs);
  if (activeRun) {
    return `Blocked by active run: ${activeRun.status}`;
  }
  if (job.backoffUntil) {
    return `Backoff until ${formatShortTimestamp(job.backoffUntil)}`;
  }
  if (job.schedulerStatus === "blocked") {
    const queue = job.schedulerQueuePosition ? `Queue #${job.schedulerQueuePosition}: ` : "";
    return `${queue}Blocked: ${job.blockedReason ?? job.schedulerDetail ?? "scheduler is waiting"}`;
  }
  if (job.schedulerStatus === "due") {
    return "Due now";
  }
  if (job.schedulerStatus === "stale" || isJobStale(job, schedulerHeartbeatAt)) {
    const lastCheck = job.lastSchedulerCheckAt ? formatShortTimestamp(job.lastSchedulerCheckAt) : "unknown";
    return `Stale: scheduler has not checked since ${lastCheck}`;
  }
  if (job.schedulerStatus === "queued") {
    return job.schedulerDetail ?? "Queued";
  }
  if (job.schedulerStatus === "running") {
    return job.schedulerDetail ?? "Running";
  }
  return formatShortTimestamp(resolveJobNextRunAt(job));
}

function formatJobSchedulerLines(job: BackgroundJob, runs: BackgroundJobRun[], schedulerHeartbeatAt?: string) {
  const lines: string[] = [];
  const congested = job.schedulerCongested ?? job.schedulerOverloaded;
  if (congested) {
    lines.push(`Congested (${Math.round((job.schedulerCongestionRatio ?? 0) * 100)}%): scheduled work overlaps recent exclusive-lane runtime`);
  }
  if (job.schedulerQueueReason) {
    lines.push(job.schedulerQueueReason);
  }
  if (job.schedulerActiveRunId) {
    const run = runs.find((entry) => entry.id === job.schedulerActiveRunId);
    const startedAt = job.schedulerActiveRunStartedAt ?? run?.startedAt;
    const lastProgressAt = job.schedulerLastProgressAt ?? run?.lastHeartbeatAt ?? run?.updatedAt;
    lines.push(`Active run: ${job.schedulerActiveRunId}`);
    if (startedAt) {
      lines.push(`Active since: ${formatShortTimestamp(startedAt)}`);
    }
    if (lastProgressAt) {
      lines.push(`Last progress: ${formatShortTimestamp(lastProgressAt)}`);
    }
  } else if (job.schedulerLastProgressAt) {
    lines.push(`Last progress: ${formatShortTimestamp(job.schedulerLastProgressAt)}`);
  }
  if (job.schedulerStatus === "stale" || isJobStale(job, schedulerHeartbeatAt)) {
    const lastCheck = job.lastSchedulerCheckAt ? formatShortTimestamp(job.lastSchedulerCheckAt) : "unknown";
    lines.push(`Stale: scheduler has not checked since ${lastCheck}`);
  }
  if (job.schedulerBlockedSinceAt) {
    lines.push(`Blocked since: ${formatShortTimestamp(job.schedulerBlockedSinceAt)}`);
  }
  return lines;
}

function formatSchedulerHeartbeatWarning(schedulerHeartbeatAt?: string) {
  if (!isSchedulerHeartbeatStale(schedulerHeartbeatAt)) {
    return undefined;
  }
  return `Stale: scheduler has not checked since ${schedulerHeartbeatAt ? formatShortTimestamp(schedulerHeartbeatAt) : "unknown"}`;
}

function isJobStale(job: BackgroundJob, schedulerHeartbeatAt?: string) {
  return isSchedulerHeartbeatStale(schedulerHeartbeatAt) && Boolean(job.lastSchedulerCheckAt) && isJobDueByClock(job);
}

function isSchedulerHeartbeatStale(schedulerHeartbeatAt?: string) {
  if (!schedulerHeartbeatAt) {
    return false;
  }
  const timestamp = Date.parse(schedulerHeartbeatAt);
  return Number.isFinite(timestamp) && Date.now() - timestamp > 60_000;
}

function isJobDueByClock(job: BackgroundJob) {
  const nextRunAt = resolveJobNextRunAt(job);
  if (!nextRunAt || job.status !== "enabled") {
    return false;
  }
  const timestamp = Date.parse(nextRunAt);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function findActiveJobRun(job: BackgroundJob, runs: BackgroundJobRun[]) {
  return runs.find((run) => run.jobId === job.id && isActiveBackgroundRunStatus(run.status));
}

function isActiveBackgroundRunStatus(status: BackgroundJobRun["status"]) {
  return status === "queued" || status === "awaiting-approval" || status === "awaiting-user-input" || status === "running";
}

function collectActiveProjectRuns(project: typeof harnessStore.state.workspace.projects[number]) {
  const runsById = new Map<string, AgentRunState>();
  for (const run of [project.activeRun, ...Object.values(project.threadLiveTranscriptById).map((entry) => entry.activeRun)]) {
    if (run && isActiveProjectRunStatus(run.status)) {
      runsById.set(run.id, run);
    }
  }
  return [...runsById.values()];
}

function isActiveProjectRunStatus(status: AgentRunState["status"]) {
  return status !== "completed";
}

function fuzzyMatches(haystack: string, query: string) {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return true;
  }
  const normalized = haystack.toLowerCase();
  return tokens.every((token) => normalized.includes(token) || fuzzyTokenMatch(normalized, token));
}

function fuzzyTokenMatch(haystack: string, token: string) {
  let cursor = 0;
  for (const char of token) {
    cursor = haystack.indexOf(char, cursor);
    if (cursor < 0) {
      return false;
    }
    cursor += 1;
  }
  return true;
}

function jobSearchHaystack(job: BackgroundJob, state: typeof harnessStore.state) {
  const project = state.workspace.projects.find((entry) => entry.id === job.projectId);
  const assistant = state.assistants.assistants.find((entry) => entry.id === job.assistantId);
  const prompt = job.definition.kind === "ai-routine" ? job.definition.prompt : [job.definition.executable, ...job.definition.args].join(" ");
  return [
    job.name,
    job.description,
    job.scheduleInput,
    job.status,
    job.kind,
    job.riskLevel,
    prompt,
    project?.name,
    project?.rootPath,
    assistant?.name
  ]
    .filter(Boolean)
    .join(" ");
}

function formatJobOwner(job: BackgroundJob, state: typeof harnessStore.state) {
  if (!job.assistantId) {
    return "Unowned";
  }
  return state.assistants.assistants.find((assistant) => assistant.id === job.assistantId)?.name ?? job.assistantId;
}

function runSearchHaystack(run: BackgroundJobRun, state: typeof harnessStore.state) {
  const job = state.backgroundJobs.jobs.find((entry) => entry.id === run.jobId);
  return [
    job?.name,
    run.status,
    run.failureCategory,
    run.approvalStatus,
    run.triggerSource,
    run.summary,
    run.failureMessage,
    ...run.events.flatMap((event) => [event.stage, event.message, event.detail])
  ]
    .filter(Boolean)
    .join(" ");
}

function projectChatRunSearchHaystack(entry: {
  project: typeof harnessStore.state.workspace.projects[number];
  thread: typeof harnessStore.state.workspace.projects[number]["threads"][number] | undefined;
  run: AgentRunState;
}) {
  return [entry.project.name, entry.project.rootPath, entry.thread?.title, entry.run.status, entry.run.latestUserPrompt, entry.run.summary]
    .filter(Boolean)
    .join(" ");
}

function formatRunListItemTitle(item: RunListItem) {
  if (item.kind === "project-chat") {
    return `${item.entry.project.name} / ${item.entry.thread?.title ?? item.entry.run.threadId}`;
  }
  return harnessStore.state.backgroundJobs.jobs.find((job) => job.id === item.run.jobId)?.name ?? item.run.jobId;
}

function formatRunListItemSummary(item: RunListItem) {
  if (item.kind === "project-chat") {
    return item.entry.run.failureMessage ?? item.entry.run.latestUserPrompt ?? item.entry.run.summary;
  }
  return formatRunSummary(item.run);
}

function formatRunListItemTime(item: RunListItem) {
  if (item.kind === "project-chat") {
    return `Updated: ${formatShortTimestamp(item.entry.run.updatedAt)}`;
  }
  return `Queued: ${formatShortTimestamp(item.run.queuedAt)}`;
}

function runListItemRun(item: RunListItem) {
  return item.kind === "project-chat" ? item.entry.run : item.run;
}
function optionalRunListItemRun(item: RunListItem | undefined) { return item ? runListItemRun(item) : undefined; }
function formatOptionalRunListItemTitle(item: RunListItem | undefined, fallback: string | undefined) { return item ? formatRunListItemTitle(item) : fallback; }

function formatRunListItemProgress(item: RunListItem | undefined) {
  if (!item) {
    return undefined;
  }
  if (item.kind === "project-chat") {
    return `Last progress: ${formatShortTimestamp(item.entry.run.updatedAt)}`;
  }
  return formatRunProgress(item.run);
}

function formatDetailsRunDescription(run: BackgroundJobRun | undefined) { return run ? `${run.status} | ${formatShortTimestamp(run.updatedAt)}` : undefined; }
function formatJobStatusText(status: string, schedulerDetail: string | undefined) { return `${status}${schedulerDetail ? ` - ${formatSchedulerDetail(schedulerDetail)}` : ""}`; }

function formatRunSummary(run: BackgroundJobRun) {
  return run.failureMessage ?? run.summary ?? latestRunEventDetail(run) ?? `${run.triggerSource} run`;
}

function formatRunProgress(run: BackgroundJobRun) {
  if (run.timedOutAt) {
    return `Timed out: ${formatShortTimestamp(run.timedOutAt)}`;
  }
  if (run.lastHeartbeatAt) {
    return `Last progress: ${formatShortTimestamp(run.lastHeartbeatAt)}${run.heartbeatStage ? ` (${run.heartbeatStage})` : ""}`;
  }
  return undefined;
}

function formatFailureCategory(value: string) {
  return value.replace(/-/g, " ");
}

function jobStatusTone(status: BackgroundJob["status"]): StatusChipTone {
  return status === "enabled" ? "success" : "neutral";
}

function runStatusTone(status: BackgroundJobRun["status"] | AgentRunState["status"]): StatusChipTone {
  switch (status) {
    case "completed":
    case "succeeded":
      return "success";
    case "partial-complete":
      return "warning";
    case "failed":
    case "stopped":
    case "cancelled":
      return "danger";
    case "awaiting-approval":
    case "awaiting-user-input":
    case "planning":
    case "aggregating":
      return "warning";
    case "running-main":
    case "running-subagents":
    case "running":
      return "info";
    case "ready":
    case "queued":
      return "neutral";
    case "skipped":
      return "neutral";
  }
}

function runListItemTone(item: RunListItem): StatusChipTone {
  return item.kind === "background" ? runStatusTone(item.run.status) : runStatusTone(item.entry.run.status);
}

function jobKindTone(kind: BackgroundJob["kind"]): StatusChipTone {
  return kind === "shell" ? "info" : "accent";
}

function riskTone(risk: BackgroundJob["riskLevel"]): StatusChipTone {
  if (risk === "unsafe") {
    return "danger";
  }
  if (risk === "slightly-unsafe") {
    return "warning";
  }
  return "success";
}

function runStatusBorderClass(status: BackgroundJobRun["status"]) {
  switch (status) {
    case "succeeded":
      return stylex.attrs(styles.borderSuccess).class;
    case "partial-complete":
      return stylex.attrs(styles.borderWarning).class;
    case "failed":
    case "cancelled":
      return stylex.attrs(styles.borderDanger).class;
    case "awaiting-approval":
    case "awaiting-user-input":
      return stylex.attrs(styles.borderWarning).class;
    case "running":
      return stylex.attrs(styles.borderInfo).class;
    case "queued":
      return stylex.attrs(styles.borderNeutral).class;
    case "skipped":
      return stylex.attrs(styles.borderStone).class;
  }
}

function runListItemBorderClass(item: RunListItem) {
  if (item.kind === "background") {
    return runStatusBorderClass(item.run.status);
  }
  switch (item.entry.run.status) {
    case "completed":
      return stylex.attrs(styles.borderSuccess).class;
    case "partial-complete":
      return stylex.attrs(styles.borderWarning).class;
    case "failed":
    case "stopped":
      return stylex.attrs(styles.borderDanger).class;
    case "awaiting-user-input":
      return stylex.attrs(styles.borderWarning).class;
    case "running-main":
    case "running-subagents":
    case "aggregating":
      return stylex.attrs(styles.borderInfo).class;
    case "planning":
    case "ready":
      return stylex.attrs(styles.borderNeutral).class;
  }
}

function runEventStageBorderClass(stage: string) {
  const normalized = stage.toLowerCase();
  if (normalized.includes("fail") || normalized.includes("error") || normalized.includes("cancel")) {
    return stylex.attrs(styles.borderDanger).class;
  }
  if (normalized.includes("approval") || normalized.includes("input") || normalized.includes("warn")) {
    return stylex.attrs(styles.borderWarning).class;
  }
  if (normalized.includes("done") || normalized.includes("complete") || normalized.includes("success")) {
    return stylex.attrs(styles.borderSuccess).class;
  }
  if (normalized.includes("exec") || normalized.includes("run")) {
    return stylex.attrs(styles.borderInfo).class;
  }
  return stylex.attrs(styles.borderDefault).class;
}

function formatPromptStats(promptStats: BackgroundJobRun["promptStats"] | undefined) {
  if (!promptStats) {
    return undefined;
  }
  const transcript = promptStats.transcriptChars ? `, transcript ${promptStats.transcriptChars}c` : "";
  const latestTask = promptStats.latestTaskChars ? `, latest task ${promptStats.latestTaskChars}c` : "";
  return `${promptStats.promptChars} chars, hash ${promptStats.promptHash}${transcript}${latestTask}`;
}

function formatFailureTrackingLine(job: BackgroundJob) {
  const streak = job.consecutiveFailureCount ?? 0;
  const lastCategory = job.lastFailureCategory ? formatFailureCategory(job.lastFailureCategory) : undefined;
  const backoffUntil = job.backoffUntil ? formatShortTimestamp(job.backoffUntil) : undefined;
  if (streak <= 0 && !lastCategory && !backoffUntil) {
    return undefined;
  }
  return [
    streak > 0 ? `Failure streak ${streak}` : undefined,
    lastCategory ? `last ${lastCategory}` : undefined,
    backoffUntil ? `backoff until ${backoffUntil}` : undefined
  ]
    .filter(Boolean)
    .join(" | ");
}

function latestRunEventDetail(run: BackgroundJobRun) {
  return [...run.events].reverse().find((event) => event.detail || event.message)?.detail ?? [...run.events].reverse().find((event) => event.message)?.message;
}

function JobDetail(props: {
  job?: BackgroundJob;
  runs: BackgroundJobRun[];
  fileLinks?: FileLinkConfig;
  executionPaused: boolean;
  executionPauseReason: string;
  onRunNow: (job: BackgroundJob) => void;
  onStopRun: (run: BackgroundJobRun) => void;
  onEdit: (job: BackgroundJob) => void;
  onOpenAssistant: (assistantId: string) => void;
  onRetryScheduler: () => void;
  schedulerHeartbeatAt?: string;
}) {
  const latestRun = createMemo(() => props.runs[0]);
  const activeRun = createMemo(() => (props.job ? findActiveJobRun(props.job, props.runs) : undefined));
  const latestRunEvents = createMemo(() =>
    (latestRun()?.events ?? []).map((event) => ({
      id: event.id,
      message: event.message,
      level: event.stage,
      createdAt: event.createdAt,
      detail: event.detail
    }))
  );

  return (
    <Show
      when={props.job}
      fallback={
        <div class={stylex.attrs(styles.detailEmpty).class}>
          Select background job to inspect schedule and actions.
        </div>
      }
    >
      {(job) => (
        <div class={stylex.attrs(styles.jobDetail).class}>
          <div class={stylex.attrs(styles.jobDetailHeader).class}>
            <div class={stylex.attrs(styles.jobDetailTop).class}>
              <div>
                <div class={stylex.attrs(styles.inlineChips).class}>
                  <div class={stylex.attrs(styles.eyebrow).class}>Job detail</div>
                  <StatusChip tone={jobStatusTone(job().status)}>
                    {job().status}
                  </StatusChip>
                </div>
                <h2 class={stylex.attrs(styles.detailTitle).class}>{job().name}</h2>
                <div class={stylex.attrs(styles.factGrid).class}>
                  <RunFact label="Kind">{job().kind === "ai-routine" ? "AI routine" : "Shell command"}</RunFact>
                  <RunFact label="Risk">{job().riskLevel === "safe" ? "Safe: no elevated approval expected" : "Needs safety review"}</RunFact>
                  <RunFact label="Lane">{job().lane === "concurrent" ? "Can overlap" : "One at a time"}</RunFact>
                  <RunFact label="Owner">{formatJobOwner(job(), harnessStore.state)}</RunFact>
                  <RunFact label="Schedule">{job().scheduleInput}</RunFact>
                  <RunFact label="Next">
                    <NextRunContent text={formatJobNextRun(job(), props.runs, props.schedulerHeartbeatAt)} onRetryScheduler={props.onRetryScheduler} />
                  </RunFact>
                  <Show when={job().schedulerStatus}>
                    {(status) => (
                      <RunFact label="Scheduler">
                        <FileLinkedText text={formatJobStatusText(status(), job().schedulerDetail)} fileLinks={props.fileLinks} />
                      </RunFact>
                    )}
                  </Show>
                  <Show when={formatFailureTrackingLine(job())}>
                    {(line) => (
                      <RunFact label="Failure">
                        <FileLinkedText text={line()} fileLinks={props.fileLinks} />
                      </RunFact>
                    )}
                  </Show>
                  <For each={formatJobSchedulerLines(job(), props.runs, props.schedulerHeartbeatAt)}>
                    {(line) => (
                      <RunFact label="Scheduler">
                        <SchedulerWarningContent text={line} fileLinks={props.fileLinks} onRetryScheduler={props.onRetryScheduler} />
                      </RunFact>
                    )}
                  </For>
                  <Show when={activeRun()}>
                    {(run) => <div class={stylex.attrs(styles.runFact).class}>Blocked by: {run().status} run {run().id}</div>}
                  </Show>
                  <Show when={job().description}>
                    {(description) => (
                      <RunFact label="Description">
                        <FileLinkedText text={description()} fileLinks={props.fileLinks} />
                      </RunFact>
                    )}
                  </Show>
                </div>
              </div>
              <div class={stylex.attrs(styles.actionRow).class}>
                <Show when={job().assistantId}>
                  {(assistantId) => (
                    <ActionButton tooltip="Open owning assistant" variant="secondary" icon={<Bot class={stylex.attrs(styles.iconMd).class} />} onClick={() => props.onOpenAssistant(assistantId())}>
                      Assistant
                    </ActionButton>
                  )}
                </Show>
                <ActionButton
                  tooltip="Run task now"
                  disabled={props.executionPaused || Boolean(activeRun())}
                  disabledReason={props.executionPaused ? props.executionPauseReason : activeRun() ? "Stop the active run before starting another" : undefined}
                  icon={<Play class={stylex.attrs(styles.iconMd).class} />}
                  onClick={() => props.onRunNow(job())}
                >
                  Run now
                </ActionButton>
                <Show when={activeRun()}>
                  {(run) => (
                    <ActionButton tooltip="Stop active background run" variant="secondary" icon={<Pause class={stylex.attrs(styles.iconMd).class} />} onClick={() => props.onStopRun(run())}>
                      Stop run
                    </ActionButton>
                  )}
                </Show>
                <ActionButton tooltip="Edit task" variant="secondary" icon={<RefreshCcw class={stylex.attrs(styles.iconMd).class} />} onClick={() => props.onEdit(job())}>
                  Edit
                </ActionButton>
              </div>
            </div>
          </div>
          <section class={stylex.attrs(styles.executionSection).class}>
            <div class={stylex.attrs(styles.executionHeader).class}>
              <div class={stylex.attrs(styles.eyebrow).class}>Execution log</div>
              <Show when={latestRun()}>
                {(run) => <div class={stylex.attrs(styles.executionStatus).class}>{run().status}</div>}
              </Show>
            </div>
            <Show
              when={latestRun()?.events.length}
              fallback={<div class={stylex.attrs(styles.executionEmpty).class}>No execution log yet.</div>}
            >
              <ExecutionLog entries={latestRunEvents()} emptyMessage="No execution log yet." rowVariant="flat" fileLinks={props.fileLinks} />
            </Show>
          </section>
        </div>
      )}
    </Show>
  );
}

/** Localize ISO timestamps embedded in scheduler diagnostic text. */
function formatSchedulerDetail(detail: string) {
  return detail.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, (timestamp) => formatShortTimestamp(timestamp));
}

function runFilterLabel(filter: JobsRunFilter) {
  switch (filter) {
    case "all":
      return "All";
    case "approval":
      return "Approval";
    case "input":
      return "Input";
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "failed":
      return "Failed";
    case "done":
      return "Done";
  }
}

function jobStateFilterLabel(filter: JobsJobStateFilter) {
  switch (filter) {
    case "all":
      return "All";
    case "backoff":
      return "Backoff";
    default:
      return toProperCase(filter);
  }
}

function jobStateFilterIcon(filter: JobsJobStateFilter) {
  switch (filter) {
    case "all":
      return <ListFilter class={stylex.attrs(styles.iconSm).class} />;
    case "due":
    case "queued":
      return <Clock3 class={stylex.attrs(styles.iconSm).class} />;
    case "blocked":
    case "backoff":
      return <CircleX class={stylex.attrs(styles.iconSm).class} />;
    case "running":
      return <LoaderCircle class={stylex.attrs(styles.iconSm).class} />;
    case "stale":
      return <RefreshCcw class={stylex.attrs(styles.iconSm).class} />;
    case "idle":
      return <CheckCircle2 class={stylex.attrs(styles.iconSm).class} />;
  }
}

function runFilterIcon(filter: JobsRunFilter) {
  switch (filter) {
    case "all":
      return <ListFilter class={stylex.attrs(styles.iconSm).class} />;
    case "approval":
      return <ShieldCheck class={stylex.attrs(styles.iconSm).class} />;
    case "input":
      return <MessageSquareText class={stylex.attrs(styles.iconSm).class} />;
    case "queued":
      return <Plus class={stylex.attrs(styles.iconSm).class} />;
    case "running":
      return <LoaderCircle class={stylex.attrs(styles.iconSm).class} />;
    case "failed":
      return <CircleX class={stylex.attrs(styles.iconSm).class} />;
    case "done":
      return <CheckCircle2 class={stylex.attrs(styles.iconSm).class} />;
  }
}
