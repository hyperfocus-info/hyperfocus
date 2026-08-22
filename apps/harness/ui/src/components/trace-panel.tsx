import { createMemo, createSignal, For, Show } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { createRequestId, type AgentRunState, type BackgroundJob, type BackgroundJobRun, type ExecutionToolActivity } from "../../../shared/protocol";
import { getActiveProject, harnessStore } from "../harness-store";
import type { ChatFileTarget } from "../lib/chat-file-links";
import { openIdeWindow } from "../lib/ide-window";
import { getLatestTaskStatusText, getRunRefreshState, getVisibleProjectTraces, isRunWorking } from "../lib/run-status";
import { formatShortTimestamp } from "../lib/time-format";
import {
  formatToolActivityCopyText,
  formatToolActivityOwner,
  formatToolActivitySnippet,
  formatToolInvocationDescription,
  normalizeToolSnippet
} from "../lib/tool-activity-format";
import { rightAlignedNumbersEnabled } from "../lib/visual-flags";
import {
  getAssistantTracePanelSnapshot,
  getJobTracePanelSnapshot,
  getThreadTracePanelSnapshot,
  getTracePanelExecutionLogEntries,
  getTracePanelRunningCounts,
  getTracePanelTitle,
  resolveTracePanelEntity
} from "../lib/trace-panel-model";
import { ActionButton } from "./action-button";
import { FileLinkedText, type FileLinkConfig } from "./file-linked-text";
import { CopyTextButton } from "./primitives/copy-text-button";
import { ExecutionLog } from "./primitives/execution-log";
import { MarkdownContent } from "./markdown-content";
import { Tooltip } from "./primitives/tooltip";
import { VirtualList } from "./primitives/virtual-list";
import { TerminalHistoryDialog } from "../terminal/terminal-history-dialog";
import { tracePanelStyles as styles, traceUtilityStyles as utilities } from "./trace-panel.styles";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleHelp,
  ClipboardList,
  Eye,
  LoaderCircle,
  PanelRightOpen,
  RefreshCcw,
  ShieldCheck,
  ShieldX,
  Terminal,
  X
} from "lucide-solid";

export function TracePanel() {
  const state = harnessStore.state;
  const sendCommand = harnessStore.actions.sendCommand;
  const traceEntity = createMemo(() => resolveTracePanelEntity(state));
  const traceTitle = createMemo(() => getTracePanelTitle(state, traceEntity()));
  const threadSnapshot = createMemo(() => {
    const entity = traceEntity();
    return entity?.type === "thread" ? getThreadTracePanelSnapshot(state, entity) : undefined;
  });
  const assistantSnapshot = createMemo(() => {
    const entity = traceEntity();
    return entity?.type === "assistant" ? getAssistantTracePanelSnapshot(state, entity) : undefined;
  });
  const jobSnapshot = createMemo(() => {
    const entity = traceEntity();
    return entity?.type === "job" ? getJobTracePanelSnapshot(state, entity) : undefined;
  });
  const executionLogEntries = createMemo(() => getTracePanelExecutionLogEntries(state, traceEntity()));
  const runningCounts = createMemo(() => getTracePanelRunningCounts(state, traceEntity()));
  const activeProject = () => threadSnapshot()?.project ?? getActiveProject(state);
  const threadProject = () => threadSnapshot()?.project;
  const fileLinkProject = createMemo(() => {
    const project = threadProject();
    if (project) {
      return project;
    }
    const projectId = assistantSnapshot()?.assistant.projectId ?? jobSnapshot()?.job.projectId;
    return projectId ? state.workspace.projects.find((entry) => entry.id === projectId) : undefined;
  });
  const traceFileLinks = (): FileLinkConfig | undefined => {
    const project = fileLinkProject();
    return project
      ? {
          rootPath: project.rootPath,
          filePaths: project.filePaths ?? [],
          onOpenFile: handleOpenTraceFile
        }
      : undefined;
  };
  const executionPaused = () => state.executionControl.isPaused;
  const executionPauseReason = "Global execution pause is active";
  const runToShow = () => threadSnapshot()?.runToShow;
  const deferredBrowserApprovalCount = () => state.executionControl.deferredBrowserApprovalCount;
  const canRetryRun = () => Boolean(activeProject()?.lastRun?.retryable);
  const visibleTraces = () => threadSnapshot()?.visibleTraces ?? getVisibleProjectTraces(activeProject()?.traces ?? []);
  const refreshState = () => {
    const project = activeProject();
    return project ? getRunRefreshState(project, runToShow()) : { disabled: true, disabledReason: "No run available", refreshing: false };
  };
  const [expandedToolActivityId, setExpandedToolActivityId] = createSignal<string>();
  const [terminalHistoryOpen, setTerminalHistoryOpen] = createSignal(false);
  const planRun = () => runToShow();
  const hasPlanDetails = () => Boolean(activeProject()?.latestPlan?.executionPlan);
  const visibleSubtasks = createMemo(() => runToShow()?.subtasks ?? []);
  const visibleToolActivities = createMemo(() => runToShow()?.toolActivities ?? []);
  const visibleBrowserSessions = createMemo(() => runToShow()?.browserSessions ?? []);
  const visibleTraceRows = createMemo(() => visibleTraces());

  function handleRetryRun() {
    const project = activeProject();
    if (!project) {
      return;
    }
    const run = project.lastRun;
    if (!run) {
      return;
    }

    sendCommand({
      type: "run.retry",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId: run.id
      }
    });
  }

  function handleRetrySubagent(subagentId: string) {
    const project = activeProject();
    if (!project) {
      return;
    }
    const run = project.lastRun;
    if (!run) {
      return;
    }

    sendCommand({
      type: "run.retry",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId: run.id,
        subagentId
      }
    });
  }

  function handleRefreshRun() {
    const project = activeProject();
    const run = project?.activeRun;
    if (!project || !run) {
      return;
    }

    sendCommand({
      type: "run.refresh",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId: run.id
      }
    });
  }

  function handleRefreshSubagent(subagentId: string) {
    const project = activeProject();
    const run = project?.activeRun;
    if (!project || !run) {
      return;
    }

    sendCommand({
      type: "run.refresh",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId: run.id,
        subagentId
      }
    });
  }

  function handleResolveBrowserApproval(sessionId: string, toolCallId: string, approved: boolean) {
    const project = activeProject();
    const run = project?.activeRun ?? project?.lastRun;
    if (!project || !run) {
      return;
    }

    sendCommand({
      type: "browser.approval.resolve",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId: run.id,
        sessionId,
        toolCallId,
        approved
      }
    });
  }

  function openAssistantJob(jobId: string) {
    harnessStore.setActiveLeftTab("jobs");
    harnessStore.setJobsPanePreferences({
      segment: "jobs",
      selectedJobId: jobId,
      selectedRunId: undefined,
      selectedNotificationId: undefined,
      jobSearch: "",
      kind: undefined,
      status: undefined,
      risk: undefined
    });
  }

  function handleOpenRunTerminalHistory() {
    const project = activeProject();
    const run = runToShow();
    if (!project || !run) {
      return;
    }
    sendCommand({
      type: "terminal.history.list",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId: run.id
      }
    });
    setTerminalHistoryOpen(true);
  }

  function handleOpenTraceFile(target: ChatFileTarget) {
    const project = fileLinkProject();
    if (!project) {
      return;
    }
    openIdeWindow({ projectId: project.id, threadId: project.activeThreadId });
    harnessStore.openIdeFile(target.path, target.line, target.column);
  }

  function handleAssistantJobKeyDown(event: KeyboardEvent, jobId: string) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    openAssistantJob(jobId);
  }

  return (
    <>
    <aside data-test-trace-panel="" class={stylex.attrs(styles.panelShell, utilities.flex, utilities.hFull, utilities.minH0, utilities.minW0, utilities.flexCol, utilities.gap4, utilities.overflowXHidden, utilities.rounded2xl, utilities.borderTop0, utilities.p08).class}>
      <div>
        <div class={stylex.attrs(utilities.flex, utilities.itemsCenter, utilities.gap2, utilities.text0585, utilities.fontSemibold, utilities.tracking02, utilities.textMuted).class}>
          <span>Developer trace</span>
          <Tooltip content="Selected thread, assistant, or job traces stay here, separate from user-visible chat history.">
            <span class={stylex.attrs(utilities.inlineFlex).class}>
              <CircleHelp class={stylex.attrs(utilities.h35, utilities.w35, utilities.textMuted).class} aria-label="Projects trace help" />
            </span>
          </Tooltip>
        </div>
      </div>

      <TraceContextSummary
        title={traceTitle()}
        runningCounts={runningCounts()}
        run={runToShow()}
        assistant={assistantSnapshot()?.assistant}
        assistantJobsCount={assistantSnapshot()?.jobs.length}
        assistantRunsCount={assistantSnapshot()?.runs.length}
        job={jobSnapshot()?.job}
        jobRun={jobSnapshot()?.run}
        jobRunCount={jobSnapshot()?.runs.length}
        fileLinks={traceFileLinks()}
      />

      <Show
        when={threadProject()}
        fallback={
          <>
            <Show when={assistantSnapshot()}>
              {(snapshot) => (
                <div class={stylex.attrs(utilities.flex, utilities.minH0, utilities.flex1, utilities.flexCol, utilities.gap4).class}>
                  <div class={stylex.attrs(utilities.rounded3xl, utilities.border, utilities.borderDefault, utilities.bgWhite55, utilities.p3).class}>
                    <div class={stylex.attrs(utilities.mb3, utilities.text0585, utilities.fontSemibold, utilities.uppercase, utilities.tracking018, utilities.textMuted).class}>Assistant jobs</div>
                    <Show
                      when={snapshot().jobs.length > 0}
                      fallback={<div class={stylex.attrs(utilities.rounded2xl, utilities.border, utilities.borderDashed, utilities.borderDefault, utilities.bgWhite45, utilities.p3, utilities.text0675, utilities.textMuted).class}>No assistant-owned jobs.</div>}
                    >
                      <div class={stylex.attrs(utilities.spaceY2).class}>
                        <For each={snapshot().jobs.slice(0, 6)}>
                          {(job) => {
                            const statusView = () => getAssistantJobStatusView(job.id, snapshot().runs);
                            return (
                            <div
                              data-test-trace-assistant-job=""
                              data-state={statusView().state}
                              class={statusView().state === "running"
                                ? stylex.attrs(styles.assistantJob, utilities.cursorPointer, utilities.rounded2xl, utilities.border, utilities.bgWhite70, utilities.p3, utilities.text0675, styles.assistantJobRunning).class
                                : statusView().state === "successful"
                                  ? stylex.attrs(styles.assistantJob, utilities.cursorPointer, utilities.rounded2xl, utilities.border, utilities.bgWhite70, utilities.p3, utilities.text0675, styles.assistantJobSuccessful).class
                                  : statusView().state === "error"
                                    ? stylex.attrs(styles.assistantJob, utilities.cursorPointer, utilities.rounded2xl, utilities.border, utilities.bgWhite70, utilities.p3, utilities.text0675, styles.assistantJobError).class
                                    : stylex.attrs(styles.assistantJob, utilities.cursorPointer, utilities.rounded2xl, utilities.border, utilities.bgWhite70, utilities.p3, utilities.text0675, styles.assistantJobIdle).class}
                              role="button"
                              tabIndex={0}
                              onClick={() => openAssistantJob(job.id)}
                              onKeyDown={(event) => handleAssistantJobKeyDown(event, job.id)}
                            >
                              <div
                                data-test-trace-assistant-job-heading=""
                                data-state={statusView().state}
                                class={statusView().state === "running"
                                  ? stylex.attrs(utilities.flex, utilities.minW0, utilities.itemsCenter, utilities.gap2, utilities.fontSemibold, styles.assistantJobTextRunning).class
                                  : statusView().state === "successful"
                                    ? stylex.attrs(utilities.flex, utilities.minW0, utilities.itemsCenter, utilities.gap2, utilities.fontSemibold, styles.assistantJobTextSuccessful).class
                                    : statusView().state === "error"
                                      ? stylex.attrs(utilities.flex, utilities.minW0, utilities.itemsCenter, utilities.gap2, utilities.fontSemibold, styles.assistantJobTextError).class
                                      : stylex.attrs(utilities.flex, utilities.minW0, utilities.itemsCenter, utilities.gap2, utilities.fontSemibold, styles.assistantJobTextIdle).class}
                              >
                                <AssistantJobStatusIcon state={statusView().state} />
                                <span class={stylex.attrs(utilities.truncate).class}>{job.name}</span>
                              </div>
                              <div class={stylex.attrs(utilities.mt1, utilities.textMuted).class}>{getAssistantJobStatusText(job, statusView().state)}</div>
                            </div>
                            );
                          }}
                        </For>
                      </div>
                    </Show>
                  </div>
                  <section class={stylex.attrs(utilities.flex, utilities.minH85, utilities.flex1, utilities.flexCol, utilities.rounded3xl, utilities.border, utilities.borderDefault, utilities.bgWhite55, utilities.p3).class}>
                    <div class={stylex.attrs(utilities.mb3, utilities.text0585, utilities.fontSemibold, utilities.uppercase, utilities.tracking018, utilities.textMuted).class}>Execution log</div>
                    <ExecutionLog entries={executionLogEntries()} emptyMessage="No execution log yet." fileLinks={traceFileLinks()} />
                  </section>
                </div>
              )}
            </Show>
            <Show when={jobSnapshot()}>
              {(snapshot) => (
                <div class={stylex.attrs(utilities.flex, utilities.minH0, utilities.flex1, utilities.flexCol, utilities.gap4).class}>
                  <section class={stylex.attrs(utilities.flex, utilities.minH85, utilities.flex1, utilities.flexCol, utilities.rounded3xl, utilities.border, utilities.borderDefault, utilities.bgWhite55, utilities.p3).class}>
                    <div class={stylex.attrs(utilities.mb3, utilities.text0585, utilities.fontSemibold, utilities.uppercase, utilities.tracking018, utilities.textMuted).class}>Execution log</div>
                    <ExecutionLog entries={executionLogEntries()} emptyMessage="No execution log yet." fileLinks={traceFileLinks()} />
                  </section>
                </div>
              )}
            </Show>
            <Show when={!assistantSnapshot() && !jobSnapshot()}>
              <div class={stylex.attrs(utilities.flex).class}>
                <div class={stylex.attrs(utilities.wFull, utilities.rounded3xl, utilities.border, utilities.borderDashed, utilities.borderDefault, utilities.bgWhite40, utilities.p5, utilities.text0675, utilities.leading5, utilities.textMuted).class}>
                  Open project root, assistant, or job to inspect execution.
                </div>
              </div>
            </Show>
          </>
        }
      >
        {(project) => (
          <>
            <Show when={project().latestPlan}>
              <div class={stylex.attrs(utilities.rounded3xl, utilities.border, utilities.borderDefault, utilities.bgWhite55, utilities.p3).class}>
                <div class={stylex.attrs(utilities.mb3, utilities.flex, utilities.itemsCenter, utilities.justifyBetween, utilities.gap2, utilities.text0585, utilities.fontSemibold, utilities.uppercase, utilities.tracking02, utilities.textMuted).class}>
                  <span>Latest plan</span>
                  <Show when={hasPlanDetails()}>
                    <ActionButton
                      tooltip="Open the full execution plan"
                      icon={<ClipboardList class={stylex.attrs(utilities.h35, utilities.w35).class} />}
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const executionPlan = project().latestPlan?.executionPlan;
                        if (executionPlan) {
                          harnessStore.openExecutionPlanDialog(executionPlan);
                        }
                      }}
                    >
                      Open plan
                    </ActionButton>
                  </Show>
                </div>
                <div class={stylex.attrs(utilities.grid, utilities.gridCols2, utilities.gap2, utilities.text0675, utilities.textMuted).class}>
                  <div>Difficulty: {project().latestPlan?.difficultyScore}%</div>
                  <div>Route: {project().latestPlan?.executionPlan?.route ?? (project().latestPlan?.usesSubagents ? "subagents" : "main")}</div>
                  <div>Planner: {project().latestPlan?.planningModelId}</div>
                  <div>Executor: {project().latestPlan?.executionModelId}</div>
                  <div>Subtasks: {project().latestPlan?.subtaskCount}</div>
                  <div>Agent: {project().latestPlan?.agentId}</div>
                </div>
              </div>
            </Show>

            <Show when={runToShow()}>
              <div data-test-trace-run-card="" class={stylex.attrs(utilities.wFull, utilities.minW0, utilities.rounded3xl, utilities.border, utilities.borderDefault, utilities.bgWhite55, utilities.p3).class}>
                <div class={stylex.attrs(utilities.mb3, utilities.flex, utilities.minW0, utilities.flexWrap, utilities.itemsCenter, utilities.justifyBetween, utilities.gap3, utilities.text0585, utilities.fontSemibold, utilities.uppercase, utilities.tracking02, utilities.textMuted).class}>
                  <div class={stylex.attrs(utilities.flex, utilities.minW0, utilities.flexWrap, utilities.itemsCenter, utilities.gap2).class}>
                    <Show when={runToShow() && isRunWorking(runToShow()!.status)}>
                      <LoaderCircle class={stylex.attrs(utilities.h35, utilities.w35, utilities.animateSpin).class} />
                    </Show>
                    Run
                  </div>
                  <div data-test-trace-run-actions="" class={stylex.attrs(utilities.flex, utilities.wFull, utilities.minW0, utilities.flexWrap, utilities.itemsCenter, utilities.justifyEnd, utilities.gap2).class}>
                    <ActionButton
                      tooltip="Refresh the active run"
                      disabledReason={executionPaused() ? executionPauseReason : refreshState().disabledReason}
                      disabled={executionPaused() || refreshState().disabled}
                      icon={<RefreshCcw class={stylex.attrs(utilities.h35, utilities.w35).class} />}
                      size="sm"
                      variant="secondary"
                      onClick={handleRefreshRun}
                    >
                      {refreshState().refreshing ? "Refreshing" : "Refresh"}
                    </ActionButton>
                    <Show when={canRetryRun()}>
                      <ActionButton
                        tooltip="Retry last run"
                        disabledReason={executionPaused() ? executionPauseReason : "Project is streaming"}
                        disabled={executionPaused() || project().session.isStreaming}
                        icon={<RefreshCcw class={stylex.attrs(utilities.h35, utilities.w35).class} />}
                        size="sm"
                        variant="secondary"
                        onClick={handleRetryRun}
                      >
                        Retry
                      </ActionButton>
                    </Show>
                    <ActionButton
                      tooltip="Open terminal history for this run"
                      ariaLabel="Open run terminal history"
                      icon={<Terminal class={stylex.attrs(utilities.h35, utilities.w35).class} />}
                      size="sm"
                      variant="secondary"
                      onClick={handleOpenRunTerminalHistory}
                    >
                      Terminals
                    </ActionButton>
                  </div>
                </div>
                <div class={stylex.attrs(utilities.minW0, utilities.spaceY2, utilities.text0675, utilities.textMuted).class}>
                  <div>Status: {runToShow()?.status}</div>
                  <div>Retryable: {runToShow()?.retryable ? "yes" : "no"}</div>
                  <div>Resumable: {runToShow()?.resumable ? "yes" : "no"}</div>
                  <Tooltip content={runToShow()?.latestUserPrompt} triggerClass={stylex.attrs(utilities.block, utilities.minW0).class}>
                    <div class={stylex.attrs(utilities.truncate).class}>
                      <FileLinkedText text={() => `Prompt: ${runToShow()?.latestUserPrompt ?? ""}`} fileLinks={traceFileLinks()} />
                    </div>
                  </Tooltip>
                  <Show when={runToShow()?.failureMessage}>
                    {(failure) => (
                      <div class={stylex.attrs(utilities.wrapAnywhere).class}>
                        <FileLinkedText text={`Failure: ${failure()}`} fileLinks={traceFileLinks()} />
                      </div>
                    )}
                  </Show>
                </div>

                <Show when={runToShow()?.subtasks.length}>
                  <div class={stylex.attrs(utilities.mt4, utilities.spaceY2).class}>
                    <div class={stylex.attrs(utilities.flex, utilities.itemsCenter, utilities.justifyBetween, utilities.gap3).class}>
                      <div class={stylex.attrs(utilities.text0585, utilities.fontSemibold, utilities.uppercase, utilities.tracking02, utilities.textMuted).class}>
                        Subtasks
                      </div>
                    </div>
                    <VirtualList
                      class={stylex.attrs(utilities.maxH80, utilities.minW0, utilities.overflowXHidden, utilities.pr2).class}
                      contentClass={stylex.attrs(utilities.wFull, utilities.minW0).class}
                      itemClass={stylex.attrs(utilities.minW0, utilities.pb2).class}
                      items={visibleSubtasks()}
                      getKey={(task) => task.id}
                      estimateSize={132}
                      pagination={{ kind: "forward", initialCount: TRACE_SUBTASK_LIMIT, batchSize: TRACE_SUBTASK_LIMIT }}
                    >
                      {(task) => (
                          <div class={stylex.attrs(utilities.rounded2xl, utilities.border, utilities.borderDefault, utilities.bgWhite70, utilities.p3, utilities.text0675).class}>
                            <div class={stylex.attrs(utilities.flex, utilities.minW0, utilities.itemsCenter, utilities.justifyBetween, utilities.gap3, utilities.textForeground).class}>
                              <span class={stylex.attrs(utilities.flex, utilities.minW0, utilities.flex1, utilities.itemsCenter, utilities.gap2, utilities.fontSemibold).class}>
                                <TaskStatusIcon status={task.status} />
                                <Tooltip content={task.title} triggerClass={stylex.attrs(utilities.minW0, utilities.flex1).class}>
                                  <FileLinkedText class={stylex.attrs(utilities.block, utilities.truncate).class} text={task.title} fileLinks={traceFileLinks()} />
                                </Tooltip>
                              </span>
                              <span class={stylex.attrs(utilities.shrink0, utilities.uppercase, utilities.tracking014, utilities.textAccentStrong).class}>{task.status}</span>
                            </div>
                            <div class={stylex.attrs(utilities.mt1, utilities.textMuted).class}>Attempts: {task.attemptCount}</div>
                            <div class={stylex.attrs(utilities.mt1, utilities.textMuted).class}>
                              <FileLinkedText text={() => `Latest status: ${getLatestTaskStatusText(project(), task)}`} fileLinks={traceFileLinks()} />
                            </div>
                            <Show when={task.startedAt}>
                              <div class={stylex.attrs(utilities.mt1, utilities.textMuted).class}>Started: {formatShortTimestamp(task.startedAt)}</div>
                            </Show>
                            <Show when={task.completedAt}>
                              <div class={stylex.attrs(utilities.mt1, utilities.textMuted).class}>Completed: {formatShortTimestamp(task.completedAt)}</div>
                            </Show>
                            <div class={stylex.attrs(utilities.mt2, utilities.flex, utilities.flexWrap, utilities.gap2).class}>
                              <ActionButton
                                tooltip="Refresh this active subagent"
                                disabledReason={
                                  executionPaused()
                                    ? executionPauseReason
                                    : getRunRefreshState(project(), project().activeRun, task.id).disabledReason
                                }
                                disabled={executionPaused() || getRunRefreshState(project(), project().activeRun, task.id).disabled}
                                icon={<RefreshCcw class={stylex.attrs(utilities.h35, utilities.w35).class} />}
                                size="sm"
                                variant="secondary"
                                onClick={() => handleRefreshSubagent(task.id)}
                              >
                                {getRunRefreshState(project(), project().activeRun, task.id).refreshing ? "Refreshing" : "Refresh"}
                              </ActionButton>
                              <Show when={project().lastRun?.retryable}>
                                <ActionButton
                                  tooltip="Retry this subagent"
                                  disabledReason={executionPaused() ? executionPauseReason : "Project is streaming"}
                                  disabled={executionPaused() || project().session.isStreaming}
                                  icon={<RefreshCcw class={stylex.attrs(utilities.h35, utilities.w35).class} />}
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleRetrySubagent(task.id)}
                                >
                                  Retry
                                </ActionButton>
                              </Show>
                            </div>
                            <Show when={task.errorMessage}>
                              <MarkdownContent content={() => task.errorMessage ?? ""} class={stylex.attrs(utilities.mt1).class} size="compact" tone="danger" fileLinks={traceFileLinks()} />
                            </Show>
                          </div>
                      )}
                    </VirtualList>
                  </div>
                </Show>
              </div>
            </Show>

            <Show when={runToShow()?.toolActivities?.length}>
              <div class={stylex.attrs(utilities.rounded3xl, utilities.border, utilities.borderDefault, utilities.bgWhite55, utilities.p3).class}>
                <div class={stylex.attrs(utilities.mb3, utilities.flex, utilities.itemsCenter, utilities.justifyBetween, utilities.gap3).class}>
                  <div class={stylex.attrs(utilities.flex, utilities.itemsCenter, utilities.gap2, utilities.text0585, utilities.fontSemibold, utilities.uppercase, utilities.tracking02, utilities.textMuted).class}>
                    <Terminal class={stylex.attrs(utilities.h35, utilities.w35).class} />
                    Tool activity
                  </div>
                </div>
                <VirtualList
                  class={stylex.attrs(utilities.maxH96, utilities.minW0, utilities.overflowXHidden, utilities.pr2).class}
                  contentClass={stylex.attrs(utilities.wFull, utilities.minW0).class}
                  itemClass={stylex.attrs(utilities.minW0, utilities.pb2).class}
                  items={visibleToolActivities()}
                  getKey={(activity) => activity.id}
                  estimateSize={150}
                  pagination={{ kind: "forward", initialCount: TRACE_TOOL_ACTIVITY_LIMIT, batchSize: TRACE_TOOL_ACTIVITY_LIMIT }}
                >
                  {(activity) => (
                      <article class={stylex.attrs(utilities.wFull, utilities.minW0, utilities.rounded2xl, utilities.border, utilities.borderDefault, utilities.bgWhite70, utilities.p3, utilities.text0675).class}>
                        <div class={stylex.attrs(utilities.flex, utilities.minW0, utilities.itemsCenter, utilities.justifyBetween, utilities.gap3, utilities.textForeground).class}>
                          <div class={stylex.attrs(utilities.flex, utilities.minW0, utilities.flex1, utilities.flexWrap, utilities.itemsCenter, utilities.gap2, utilities.fontSemibold).class}>
                            <ToolActivityStatusIcon status={activity.status} />
                            <span class={stylex.attrs(utilities.truncate).class}>{formatToolActivityOwner(activity)}</span>
                            <span class={stylex.attrs(utilities.shrink0, utilities.textMuted).class}>|</span>
                            <span class={stylex.attrs(utilities.minW0, utilities.wrapAnywhere).class}>{activity.toolName}</span>
                          </div>
                          <span class={stylex.attrs(utilities.shrink0, utilities.uppercase, utilities.tracking014, utilities.textAccentStrong).class}>
                            {activity.exitCode === undefined ? activity.status : `${activity.status} ${activity.exitCode}`}
                          </span>
                        </div>
                        <div class={stylex.attrs(utilities.mt2, utilities.text064, utilities.leading5, utilities.textMuted).class}>
                          {formatToolInvocationDescription(activity)}
                        </div>
                        <Show when={formatToolActivitySnippet(activity, 260)}>
                          {(snippet) => (
                            <div class={stylex.attrs(styles.toolSnippet, utilities.mt2, utilities.fontMono).class}>
                              <FileLinkedText text={snippet()} fileLinks={traceFileLinks()} />
                            </div>
                          )}
                        </Show>
                        <Show when={activity.outputPreview && activity.outputPreview !== activity.command ? activity.outputPreview : undefined}>
                          {(preview) => (
                            <div class={stylex.attrs(styles.toolSnippet, utilities.mt2).class}>
                              <FileLinkedText text={normalizeToolSnippet(preview(), 260)} fileLinks={traceFileLinks()} />
                            </div>
                          )}
                        </Show>
                        <Show when={expandedToolActivityId() === activity.id}>
                          <div class={stylex.attrs(utilities.mt2, utilities.spaceY2, utilities.roundedXl, utilities.border, utilities.borderDefault, utilities.bgWhite80, utilities.p2).class}>
                            <Show when={activity.argsSummary}>
                              {(summary) => <ToolSnippetBlock title="Args" value={summary()} fileLinks={traceFileLinks()} />}
                            </Show>
                            <Show when={activity.stdoutPreview}>
                              {(stdout) => <ToolSnippetBlock title="Stdout" value={stdout()} fileLinks={traceFileLinks()} />}
                            </Show>
                            <Show when={activity.stderrPreview}>
                              {(stderr) => <ToolSnippetBlock title="Stderr" value={stderr()} tone="danger" fileLinks={traceFileLinks()} />}
                            </Show>
                          </div>
                        </Show>
                        <div class={stylex.attrs(utilities.mt2, utilities.flex, utilities.flexWrap, utilities.justifyEnd, utilities.gap2).class}>
                          <ActionButton
                            tooltip="Toggle tool details"
                            icon={expandedToolActivityId() === activity.id ? <ChevronDown class={stylex.attrs(utilities.h35, utilities.w35).class} /> : <ChevronRight class={stylex.attrs(utilities.h35, utilities.w35).class} />}
                            size="sm"
                            variant="ghost"
                            onClick={() => setExpandedToolActivityId(expandedToolActivityId() === activity.id ? undefined : activity.id)}
                          >
                            Details
                          </ActionButton>
                          <CopyTextButton
                            value={formatToolActivityCopyText(activity)}
                            tooltip="Copy tool output"
                            copiedTitle="Tool output copied"
                            copiedDescription="Tool output copied to clipboard."
                            size="sm"
                            variant="ghost"
                            ariaLabel="Copy tool output"
                          >
                            Copy
                          </CopyTextButton>
                        </div>
                      </article>
                  )}
                </VirtualList>
              </div>
            </Show>

            <Show when={runToShow()?.browserSessions?.length}>
              <div class={stylex.attrs(utilities.rounded3xl, utilities.border, utilities.borderDefault, utilities.bgWhite55, utilities.p3).class}>
                <div class={stylex.attrs(utilities.mb3, utilities.text0585, utilities.fontSemibold, utilities.uppercase, utilities.tracking02, utilities.textMuted).class}>
                  Browser sessions
                </div>
                <Show when={executionPaused() && deferredBrowserApprovalCount() > 0}>
                  <div class={stylex.attrs(utilities.mb3, utilities.roundedXl, utilities.border, utilities.borderAmber300_70, utilities.bgAmber50_80, utilities.p3, utilities.text0675, utilities.textAmber900).class}>
                    {deferredBrowserApprovalCount()} browser approvals queued until resume.
                  </div>
                </Show>
                <VirtualList
                  class={stylex.attrs(utilities.maxH96, utilities.minW0, utilities.overflowXHidden, utilities.pr2).class}
                  contentClass={stylex.attrs(utilities.wFull, utilities.minW0).class}
                  itemClass={stylex.attrs(utilities.minW0, utilities.pb3).class}
                  items={visibleBrowserSessions()}
                  getKey={(session) => session.id}
                  estimateSize={240}
                  pagination={{ kind: "forward", initialCount: TRACE_BROWSER_SESSION_LIMIT, batchSize: TRACE_BROWSER_SESSION_LIMIT }}
                >
                  {(session) => (
                      <article class={stylex.attrs(utilities.rounded2xl, utilities.border, utilities.borderDefault, utilities.bgWhite70, utilities.p3, utilities.text0675).class}>
                        <div class={stylex.attrs(utilities.flex, utilities.itemsCenter, utilities.justifyBetween, utilities.gap3, utilities.textForeground).class}>
                          <div class={stylex.attrs(utilities.fontSemibold).class}>
                            {session.owner === "subagent" ? `Subagent ${session.subagentId}` : session.owner}
                          </div>
                          <div class={stylex.attrs(utilities.uppercase, utilities.tracking014, utilities.textAccentStrong).class}>{session.status}</div>
                        </div>
                        <Show when={session.pendingApproval}>
                          {(approval) => (
                            <div class={stylex.attrs(utilities.mt3, utilities.roundedXl, utilities.border, utilities.borderAmber300_70, utilities.bgAmber50_80, utilities.p3).class}>
                              <div class={stylex.attrs(utilities.fontSemibold, utilities.textAmber900).class}>Approval needed</div>
                              <div class={stylex.attrs(utilities.mt1, utilities.textAmber900_80).class}>
                                <FileLinkedText text={approval().label} fileLinks={traceFileLinks()} />
                              </div>
                              <Show when={approval().inputSummary}>
                                {(summary) => (
                                  <div class={stylex.attrs(utilities.mt1, utilities.whitespacePreWrap, utilities.textAmber900_70).class}>
                                    <FileLinkedText text={summary()} fileLinks={traceFileLinks()} />
                                  </div>
                                )}
                              </Show>
                              <div class={stylex.attrs(utilities.mt3, utilities.flex, utilities.flexWrap, utilities.gap2).class}>
                                <ActionButton
                                  tooltip="Approve this browser step"
                                  disabled={executionPaused()}
                                  disabledReason={executionPauseReason}
                                  icon={<ShieldCheck class={stylex.attrs(utilities.h35, utilities.w35).class} />}
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleResolveBrowserApproval(session.id, approval().toolCallId, true)}
                                >
                                  Approve
                                </ActionButton>
                                <ActionButton
                                  tooltip="Reject this browser step"
                                  icon={<ShieldX class={stylex.attrs(utilities.h35, utilities.w35).class} />}
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleResolveBrowserApproval(session.id, approval().toolCallId, false)}
                                >
                                  Reject
                                </ActionButton>
                              </div>
                            </div>
                          )}
                        </Show>

                        <div class={stylex.attrs(utilities.mt3, utilities.spaceY2).class}>
                          <For each={session.activities.slice(-TRACE_BROWSER_ACTIVITY_LIMIT)}>
                            {(activity) => (
                              <Show when={activity.approval?.status !== "deferred"}>
                                <div class={stylex.attrs(utilities.roundedXl, utilities.border, utilities.borderDefault, utilities.bgWhite80, utilities.p3).class}>
                                  <div class={stylex.attrs(utilities.flex, utilities.itemsCenter, utilities.justifyBetween, utilities.gap3, utilities.textForeground).class}>
                                    <span class={stylex.attrs(utilities.fontSemibold).class}>
                                      <FileLinkedText text={activity.label} fileLinks={traceFileLinks()} />
                                    </span>
                                    <span class={stylex.attrs(utilities.uppercase, utilities.tracking014, utilities.textMuted).class}>{activity.status}</span>
                                  </div>
                                  <div class={stylex.attrs(utilities.mt1, utilities.textMuted).class}>
                                    {activity.toolName} | {activity.kind}
                                  </div>
                                  <Show when={activity.outputSummary}>
                                    <MarkdownContent content={() => activity.outputSummary ?? ""} class={stylex.attrs(utilities.mt2).class} size="compact" fileLinks={traceFileLinks()} />
                                  </Show>
                                  <Show when={activity.replay.length > 0}>
                                    <div class={stylex.attrs(utilities.mt2, utilities.spaceY1, utilities.textMuted).class}>
                                      <For each={activity.replay.slice(-3)}>
                                        {(entry) => (
                                          <div>
                                            <FileLinkedText text={entry.summary} fileLinks={traceFileLinks()} />
                                          </div>
                                        )}
                                      </For>
                                    </div>
                                  </Show>
                                  <Show when={activity.verification.length > 0}>
                                    <div class={stylex.attrs(utilities.mt2, utilities.textEmerald800_80).class}>
                                      {formatVerificationSummary(activity.verification)}
                                    </div>
                                  </Show>
                                </div>
                              </Show>
                            )}
                          </For>
                        </div>
                      </article>
                  )}
                </VirtualList>
              </div>
            </Show>

            <section class={stylex.attrs(utilities.flex, utilities.minH85, utilities.maxH72, utilities.flexCol, utilities.rounded3xl, utilities.border, utilities.borderDefault, utilities.bgWhite55, utilities.p3).class}>
              <div class={stylex.attrs(utilities.mb3, utilities.text0585, utilities.fontSemibold, utilities.uppercase, utilities.tracking018, utilities.textMuted).class}>Execution log</div>
              <ExecutionLog entries={executionLogEntries()} emptyMessage="No execution log yet." fileLinks={traceFileLinks()} />
            </section>

            <VirtualList
              class={stylex.attrs(utilities.flex1, utilities.minH0, utilities.minW0, utilities.overflowXHidden, utilities.pr2).class}
              contentClass={stylex.attrs(utilities.wFull, utilities.minW0).class}
              itemClass={stylex.attrs(utilities.minW0, utilities.pb3).class}
              items={visibleTraceRows()}
              getKey={(trace, index) => `${trace.stage}-${index}`}
              estimateSize={140}
              pagination={{ kind: "reverse", initialCount: TRACE_EVENT_LIMIT, batchSize: TRACE_EVENT_LIMIT }}
              empty={<div class={stylex.attrs(utilities.rounded3xl, utilities.border, utilities.borderDashed, utilities.borderDefault, utilities.bgWhite40, utilities.p5, utilities.text0675, utilities.textMuted).class}>No trace events yet.</div>}
            >
              {(trace) => (
                <article class={stylex.attrs(utilities.rounded3xl, utilities.border, utilities.borderDefault, utilities.bgWhite55, utilities.p3).class}>
                  <div class={stylex.attrs(utilities.mb2, utilities.flex, utilities.itemsCenter, utilities.justifyBetween, utilities.gap3, utilities.text0585, utilities.fontSemibold, utilities.uppercase, utilities.tracking016, utilities.textAccentStrong).class}>
                    <div class={stylex.attrs(utilities.minW0).class}>
                      <div class={stylex.attrs(utilities.truncate).class}>{trace.stage}</div>
                      <div class={stylex.attrs(utilities.mt1, utilities.text053, utilities.fontMedium, utilities.normalCase, utilities.trackingNormal, utilities.textMuted).class}>
                        {formatShortTimestamp(trace.createdAt)}
                      </div>
                    </div>
                    <span>{trace.modelId ?? "n/a"}</span>
                  </div>
                  <MarkdownContent content={() => trace.message} size="compact" fileLinks={traceFileLinks()} />
                  <Show when={trace.detail}>
                    <MarkdownContent content={() => trace.detail ?? ""} class={stylex.attrs(utilities.mt2).class} size="compact" tone="muted" fileLinks={traceFileLinks()} />
                  </Show>
                </article>
              )}
            </VirtualList>
          </>
        )}
      </Show>

      <div data-test-trace-running-counts="" class={stylex.attrs(utilities.shrink0, utilities.rounded2xl, utilities.border, utilities.borderDefault, utilities.bgWhite75, utilities.px3, utilities.py2, utilities.text0625, utilities.fontSemibold, utilities.textForeground).class}>
        Running agents: <span class={rightAlignedNumbersEnabled() ? stylex.attrs(styles.numericFlagged).class : undefined}>{runningCounts().current}</span> current /{" "}
        <span class={rightAlignedNumbersEnabled() ? stylex.attrs(styles.numericFlagged).class : undefined}>{runningCounts().total}</span> total
      </div>
    </aside>
    <TerminalHistoryDialog
      open={terminalHistoryOpen()}
      title="Run Terminal History"
      scope={
        activeProject() && runToShow()
          ? { projectId: activeProject()!.id, threadId: activeProject()!.activeThreadId, runId: runToShow()!.id }
          : undefined
      }
      onClose={() => setTerminalHistoryOpen(false)}
    />
    </>
  );
}

function TraceContextSummary(props: {
  title: { eyebrow: string; title: string; source: string };
  runningCounts: { current: number; total: number };
  run?: AgentRunState;
  assistant?: { runState: string; bootstrapState: string };
  assistantJobsCount?: number;
  assistantRunsCount?: number;
  job?: BackgroundJob;
  jobRun?: BackgroundJobRun;
  jobRunCount?: number;
  fileLinks?: FileLinkConfig;
}) {
  return (
    <section data-test-trace-context-summary="" class={stylex.attrs(styles.contextSummary).class}>
      <div class={stylex.attrs(styles.contextSummaryHeader).class}>
        <div class={stylex.attrs(utilities.minW0).class}>
          <div class={stylex.attrs(styles.contextEyebrow).class}>{props.title.eyebrow}</div>
          <div class={stylex.attrs(styles.contextTitle).class}>{props.title.title}</div>
          <div class={stylex.attrs(styles.contextSource).class}>
            <FileLinkedText text={`Source: ${props.title.source}`} fileLinks={props.fileLinks} />
          </div>
        </div>
        <div class={props.runningCounts.current > 0 ? stylex.attrs(styles.agentPill, styles.agentPillActive).class : stylex.attrs(styles.agentPill).class}>
          <span class={props.runningCounts.current > 0 ? stylex.attrs(styles.agentPillDot, styles.agentPillDotActive).class : stylex.attrs(styles.agentPillDot).class} />
          <span class={rightAlignedNumbersEnabled() ? stylex.attrs(styles.numericFlagged).class : undefined}>{props.runningCounts.current}</span>
          <span class={rightAlignedNumbersEnabled() ? stylex.attrs(utilities.textMuted, styles.numericFlagged).class : stylex.attrs(utilities.textMuted).class}>/ {props.runningCounts.total}</span>
        </div>
      </div>

      <div class={stylex.attrs(styles.contextMetrics).class}>
        <Show when={props.assistant}>
          {(assistant) => (
            <>
              <TraceContextMetric label="State" value={assistant().runState} tone={toneForStatus(assistant().runState)} />
              <TraceContextMetric label="Bootstrap" value={assistant().bootstrapState} tone={toneForStatus(assistant().bootstrapState)} />
              <TraceContextMetric label="Jobs" value={String(props.assistantJobsCount ?? 0)} tone="info" numeric />
              <TraceContextMetric label="Runs" value={String(props.assistantRunsCount ?? 0)} tone="neutral" numeric />
            </>
          )}
        </Show>
        <Show when={props.job}>
          {(job) => (
            <>
              <TraceContextMetric label="Kind" value={job().kind} tone="info" />
              <TraceContextMetric label="Status" value={job().status} tone={toneForStatus(job().status)} />
              <TraceContextMetric label="Risk" value={job().riskLevel} tone={toneForRisk(job().riskLevel)} />
              <TraceContextMetric label="Runs" value={String(props.jobRunCount ?? 0)} tone="neutral" numeric />
            </>
          )}
        </Show>
        <Show when={!props.assistant && !props.job && props.run}>
          {(run) => (
            <>
              <TraceContextMetric label="Run" value={run().status} tone={toneForStatus(run().status)} />
              <TraceContextMetric label="Retry" value={run().retryable ? "yes" : "no"} tone={run().retryable ? "info" : "neutral"} />
              <TraceContextMetric label="Resume" value={run().resumable ? "yes" : "no"} tone={run().resumable ? "info" : "neutral"} />
            </>
          )}
        </Show>
      </div>

      <Show when={props.job}>
        <TraceJobRunSummary run={props.jobRun} fileLinks={props.fileLinks} />
      </Show>

      <Show when={!props.job && props.run}>
        {(run) => (
          <div class={stylex.attrs(styles.contextRunLine).class}>
            <Tooltip content={run().latestUserPrompt} triggerClass={stylex.attrs(utilities.block, utilities.minW0).class}>
              <div class={stylex.attrs(utilities.truncate).class}>
                <FileLinkedText text={`Prompt: ${run().latestUserPrompt}`} fileLinks={props.fileLinks} />
              </div>
            </Tooltip>
            <Show when={run().failureMessage}>
              {(failure) => (
                <div class={stylex.attrs(utilities.wrapAnywhere, utilities.textRose800).class}>
                  <FileLinkedText text={`Failure: ${failure()}`} fileLinks={props.fileLinks} />
                </div>
              )}
            </Show>
          </div>
        )}
      </Show>
    </section>
  );
}

function TraceContextMetric(props: { label: string; value: string; tone: "neutral" | "success" | "warning" | "danger" | "info"; numeric?: boolean }) {
  return (
    <div class={props.tone === "success"
      ? stylex.attrs(styles.contextMetric, styles.contextMetricSuccess).class
      : props.tone === "warning"
        ? stylex.attrs(styles.contextMetric, styles.contextMetricWarning).class
        : props.tone === "danger"
          ? stylex.attrs(styles.contextMetric, styles.contextMetricDanger).class
          : props.tone === "info"
            ? stylex.attrs(styles.contextMetric, styles.contextMetricInfo).class
            : stylex.attrs(styles.contextMetric).class}>
      <div class={stylex.attrs(styles.contextMetricLabel).class}>{props.label}</div>
      <div class={Boolean(props.numeric) && rightAlignedNumbersEnabled() ? stylex.attrs(styles.contextMetricValue, styles.numericFlagged).class : stylex.attrs(styles.contextMetricValue).class}>{props.value}</div>
    </div>
  );
}

function TraceJobRunSummary(props: { run?: BackgroundJobRun; fileLinks?: FileLinkConfig }) {
  return (
    <Show
      when={props.run}
      fallback={<div class={stylex.attrs(styles.contextRunLine, styles.contextRunEmpty).class}>No run yet.</div>}
    >
      {(run) => {
        const tone = toneForStatus(run().status);
        return (
        <div class={tone === "danger"
          ? stylex.attrs(styles.contextRunLine, styles.contextRunSummary, styles.contextRunDanger).class
          : tone === "warning"
            ? stylex.attrs(styles.contextRunLine, styles.contextRunSummary, styles.contextRunWarning).class
            : tone === "success"
              ? stylex.attrs(styles.contextRunLine, styles.contextRunSummary, styles.contextRunSuccess).class
              : stylex.attrs(styles.contextRunLine, styles.contextRunSummary).class}>
          <div class={stylex.attrs(styles.contextRunStatus).class}>
            <span class={stylex.attrs(styles.contextRunDot).class} />
            <span>{run().status}</span>
          </div>
          <div class={stylex.attrs(styles.contextRunFacts).class}>
            <span>Trigger: {run().triggerSource}</span>
            <span>Approval: {run().approvalStatus}</span>
          </div>
          <div class={stylex.attrs(styles.contextRunCopy).class}>
            <FileLinkedText text={`Summary: ${run().summary ?? "n/a"}`} fileLinks={props.fileLinks} />
          </div>
          <Show when={run().failureMessage}>
            {(failure) => (
              <div class={stylex.attrs(styles.contextRunCopy, utilities.textRose900).class}>
                <FileLinkedText text={`Failure: ${failure()}`} fileLinks={props.fileLinks} />
              </div>
            )}
          </Show>
        </div>
        );
      }}
    </Show>
  );
}

function toneForRisk(risk: string): "neutral" | "success" | "warning" | "danger" | "info" {
  if (risk === "unsafe") {
    return "danger";
  }
  if (risk === "slightly-unsafe") {
    return "warning";
  }
  return "success";
}

function toneForStatus(status: string): "neutral" | "success" | "warning" | "danger" | "info" {
  if (status.includes("failed") || status.includes("cancelled") || status.includes("error") || status.includes("open")) {
    return "danger";
  }
  if (status.includes("partial-complete")) {
    return "warning";
  }
  if (status.includes("running") || status.includes("queued") || status.includes("awaiting") || status.includes("pending") || status.includes("due")) {
    return "warning";
  }
  if (status.includes("succeeded") || status.includes("completed") || status.includes("enabled") || status.includes("active") || status.includes("closed")) {
    return "success";
  }
  if (status.includes("paused") || status.includes("idle")) {
    return "info";
  }
  return "neutral";
}

export function TracePeekRail() {
  const state = harnessStore.state;
  const traceEntity = createMemo(() => resolveTracePanelEntity(state));
  const traceTitle = createMemo(() => getTracePanelTitle(state, traceEntity()));
  const threadSnapshot = createMemo(() => {
    const entity = traceEntity();
    return entity?.type === "thread" ? getThreadTracePanelSnapshot(state, entity) : undefined;
  });
  const assistantSnapshot = createMemo(() => {
    const entity = traceEntity();
    return entity?.type === "assistant" ? getAssistantTracePanelSnapshot(state, entity) : undefined;
  });
  const jobSnapshot = createMemo(() => {
    const entity = traceEntity();
    return entity?.type === "job" ? getJobTracePanelSnapshot(state, entity) : undefined;
  });
  const runningCounts = createMemo(() => getTracePanelRunningCounts(state, traceEntity()));
  const runStatus = createMemo(() => threadSnapshot()?.runToShow?.status ?? jobSnapshot()?.run?.status);
  const failureText = createMemo(() => threadSnapshot()?.runToShow?.failureMessage ?? jobSnapshot()?.run?.failureMessage);
  const fileLinkProject = createMemo(() => {
    const threadProject = threadSnapshot()?.project;
    if (threadProject) {
      return threadProject;
    }
    const projectId = assistantSnapshot()?.assistant.projectId ?? jobSnapshot()?.job.projectId;
    return projectId ? state.workspace.projects.find((project) => project.id === projectId) : undefined;
  });
  const traceFileLinks = (): FileLinkConfig | undefined => {
    const project = fileLinkProject();
    return project
      ? {
          rootPath: project.rootPath,
          filePaths: project.filePaths ?? [],
          onOpenFile: handleOpenTracePeekFile
        }
      : undefined;
  };
  const assistantState = createMemo(() => {
    const assistant = assistantSnapshot()?.assistant;
    return assistant ? `${assistant.runState} / ${assistant.bootstrapState}` : undefined;
  });

  function handleOpenTracePeekFile(target: ChatFileTarget) {
    const project = fileLinkProject();
    if (!project) {
      return;
    }
    openIdeWindow({ projectId: project.id, threadId: project.activeThreadId });
    harnessStore.openIdeFile(target.path, target.line, target.column);
  }

  return (
    <aside data-test-trace-peek-rail="" class={stylex.attrs(styles.peekRail, styles.panelShell, utilities.flex, utilities.hFull, utilities.minH0, utilities.flexCol, utilities.gap3, utilities.roundedXl, utilities.borderTop0, utilities.p3).class}>
      <div class={stylex.attrs(utilities.flex, utilities.itemsCenter, utilities.justifyBetween, utilities.gap2).class}>
        <div class={stylex.attrs(utilities.flex, utilities.minW0, utilities.itemsCenter, utilities.gap2, utilities.text0585, utilities.fontSemibold, utilities.uppercase, utilities.tracking016, utilities.textMuted).class}>
          <Eye class={stylex.attrs(utilities.h35, utilities.w35).class} />
          <span class={stylex.attrs(utilities.truncate).class}>Trace peek</span>
        </div>
        <div class={stylex.attrs(utilities.flex, utilities.gap1).class}>
          <ActionButton
            tooltip="Open full trace inspector"
            ariaLabel="Open full trace inspector"
            icon={<PanelRightOpen class={stylex.attrs(utilities.h35, utilities.w35).class} />}
            size="icon"
            variant="ghost"
            onClick={() => harnessStore.setTracePanelMode("open")}
          />
          <ActionButton
            tooltip="Close trace panel"
            ariaLabel="Close trace panel"
            icon={<X class={stylex.attrs(utilities.h35, utilities.w35).class} />}
            size="icon"
            variant="ghost"
            onClick={() => harnessStore.setTracePanelMode("closed")}
          />
        </div>
      </div>

      <div class={stylex.attrs(styles.summaryCard).class}>
        <div class={stylex.attrs(styles.summaryEyebrow).class}>{traceTitle().eyebrow}</div>
        <div class={stylex.attrs(utilities.truncate, utilities.text076, utilities.fontSemibold, utilities.textForeground).class}>{traceTitle().title}</div>
        <div class={stylex.attrs(utilities.mt1, utilities.truncate, utilities.text062, utilities.textMuted).class}>
          <FileLinkedText text={traceTitle().source} fileLinks={traceFileLinks()} />
        </div>
      </div>

      <div class={stylex.attrs(utilities.grid, utilities.gap2).class}>
        <TracePeekMetric label="Agents" value={`${runningCounts().current}/${runningCounts().total}`} tone={runningCounts().current > 0 ? "info" : "neutral"} />
        <Show when={runStatus()}>
          {(status) => <TracePeekMetric label="Run" value={status()} tone={isAttentionStatus(status()) ? "warning" : "success"} />}
        </Show>
        <Show when={assistantState()}>
          {(status) => <TracePeekMetric label="Assistant" value={status()} tone="info" />}
        </Show>
      </div>

      <Show
        when={failureText()}
        fallback={<div class={stylex.attrs(styles.summaryCard, utilities.text065, utilities.leading5, utilities.textMuted).class}>No active failure surfaced for this context.</div>}
      >
        {(failure) => (
          <div class={stylex.attrs(styles.summaryCard, utilities.borderRose300, utilities.bgRose50_85, utilities.text065, utilities.leading5, utilities.textRose950).class}>
            <div class={stylex.attrs(utilities.mb1, utilities.fontSemibold).class}>Failure digest</div>
            <div class={stylex.attrs(styles.lineClamp6, utilities.wrapAnywhere).class}>
              <FileLinkedText text={failure()} fileLinks={traceFileLinks()} />
            </div>
          </div>
        )}
      </Show>
    </aside>
  );
}

function TracePeekMetric(props: { label: string; value: string; tone: "neutral" | "success" | "warning" | "info" }) {
  return (
    <div class={props.tone === "success"
      ? stylex.attrs(styles.peekMetric, styles.peekMetricSuccess).class
      : props.tone === "warning"
        ? stylex.attrs(styles.peekMetric, styles.peekMetricWarning).class
        : props.tone === "info"
          ? stylex.attrs(styles.peekMetric, styles.peekMetricInfo).class
          : stylex.attrs(styles.peekMetric).class}>
      <div class={stylex.attrs(utilities.text055, utilities.fontSemibold, utilities.uppercase, utilities.tracking014, utilities.opacity75).class}>{props.label}</div>
      <div class={stylex.attrs(utilities.mt1, utilities.truncate, utilities.text072, utilities.fontSemibold).class}>{props.value}</div>
    </div>
  );
}

function isAttentionStatus(status: string) {
  return status.includes("failed") || status.includes("cancelled") || status.includes("approval") || status.includes("running") || status.includes("queued");
}

function ToolSnippetBlock(props: { title: string; value: string; tone?: "danger"; fileLinks?: FileLinkConfig }) {
  return (
    <div class={stylex.attrs(utilities.roundedLg, utilities.border, utilities.borderDefault, utilities.bgWhite70, utilities.p2).class}>
      <div class={stylex.attrs(utilities.mb1, utilities.text055, utilities.fontSemibold, utilities.uppercase, utilities.tracking014, utilities.textMuted).class}>{props.title}</div>
      <div class={props.tone === "danger" ? stylex.attrs(styles.toolSnippet, utilities.textRose800).class : stylex.attrs(styles.toolSnippet).class}>
        <FileLinkedText text={normalizeToolSnippet(props.value, 360)} fileLinks={props.fileLinks} />
      </div>
    </div>
  );
}

const TRACE_SUBTASK_LIMIT = 24;
const TRACE_TOOL_ACTIVITY_LIMIT = 50;
const TRACE_BROWSER_SESSION_LIMIT = 10;
const TRACE_BROWSER_ACTIVITY_LIMIT = 25;
const TRACE_EVENT_LIMIT = 80;

type AssistantJobStatusState = "running" | "successful" | "error" | "idle";

function getAssistantJobStatusView(jobId: string, runs: { jobId: string; status: string; updatedAt: string }[]) {
  const run = runs.filter((entry) => entry.jobId === jobId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  return { state: getAssistantJobStatusState(run?.status) };
}

function getAssistantJobStatusState(status: string | undefined): AssistantJobStatusState {
  if (status === "queued" || status === "awaiting-approval" || status === "awaiting-user-input" || status === "running") {
    return "running";
  }
  if (status === "succeeded") {
    return "successful";
  }
  if (status === "failed" || status === "cancelled") {
    return "error";
  }
  return "idle";
}

function getAssistantJobStatusText(job: { kind: string; status: string; riskLevel: string; nextRunAt?: string }, statusState: AssistantJobStatusState) {
  return [job.kind, job.status, job.riskLevel, job.nextRunAt && statusState !== "running" ? `next ${formatShortTimestamp(job.nextRunAt)}` : undefined]
    .filter(Boolean)
    .join(" | ");
}

function AssistantJobStatusIcon(props: { state: AssistantJobStatusState }) {
  switch (props.state) {
    case "running":
      return <LoaderCircle class={stylex.attrs(utilities.h35, utilities.w35, utilities.shrink0, utilities.animateSpin).class} aria-label="Assistant job running" />;
    case "successful":
      return <CheckCircle2 class={stylex.attrs(utilities.h35, utilities.w35, utilities.shrink0).class} aria-label="Assistant job successful" />;
    case "error":
      return <CircleAlert class={stylex.attrs(utilities.h35, utilities.w35, utilities.shrink0).class} aria-label="Assistant job error" />;
    default:
      return <Circle class={stylex.attrs(utilities.h35, utilities.w35, utilities.shrink0).class} aria-label="Assistant job idle" />;
  }
}

function TaskStatusIcon(props: { status: "pending" | "running" | "completed" | "failed" }) {
  switch (props.status) {
    case "running":
      return <LoaderCircle class={stylex.attrs(utilities.h35, utilities.w35, utilities.animateSpin).class} aria-label="Subtask running" />;
    case "completed":
      return <CheckCircle2 class={stylex.attrs(utilities.h35, utilities.w35, utilities.textEmerald600).class} aria-label="Subtask completed" />;
    case "failed":
      return <CircleAlert class={stylex.attrs(utilities.h35, utilities.w35, utilities.textRose600).class} aria-label="Subtask failed" />;
    default:
      return <Circle class={stylex.attrs(utilities.h35, utilities.w35, utilities.textMuted).class} aria-label="Subtask pending" />;
  }
}

function ToolActivityStatusIcon(props: { status: ExecutionToolActivity["status"] }) {
  switch (props.status) {
    case "running":
      return <LoaderCircle class={stylex.attrs(utilities.h35, utilities.w35, utilities.animateSpin).class} aria-label="Tool running" />;
    case "completed":
      return <CheckCircle2 class={stylex.attrs(utilities.h35, utilities.w35, utilities.textEmerald600).class} aria-label="Tool completed" />;
    case "failed":
    case "timed-out":
      return <CircleAlert class={stylex.attrs(utilities.h35, utilities.w35, utilities.textRose600).class} aria-label="Tool failed" />;
  }
}

function formatVerificationSummary(verification: Array<{ status: "passed" | "failed" | "unknown" }>) {
  const passed = verification.filter((entry) => entry.status === "passed").length;
  const failed = verification.filter((entry) => entry.status === "failed").length;
  const unknown = verification.filter((entry) => entry.status === "unknown").length;
  return `Verification: ${passed} pass, ${failed} fail, ${unknown} unknown`;
}

