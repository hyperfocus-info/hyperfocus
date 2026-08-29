import { createMemo, createSignal, For, Show } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { createRequestId, isTerminalAgentRunStatus, type AgentRunState, type BackgroundJob, type BackgroundJobRun, type ExecutionToolActivity } from "@hyperfocus/ai-core/protocol";
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

import {
  AssistantJobStatusIcon,
  TRACE_BROWSER_ACTIVITY_LIMIT,
  TRACE_BROWSER_SESSION_LIMIT,
  TRACE_EVENT_LIMIT,
  TRACE_SUBTASK_LIMIT,
  TRACE_TOOL_ACTIVITY_LIMIT,
  TaskStatusIcon,
  ToolActivityStatusIcon,
  ToolSnippetBlock,
  TraceContextSummary,
  formatVerificationSummary,
  getAssistantJobStatusText,
  getAssistantJobStatusView,
} from "./trace-panel/trace-panel-support";

export { TracePeekRail } from "./trace-panel/trace-panel-support";

function createTracePanelState() {
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
  const executionLogEntries = createMemo(() => getTracePanelExecutionLogEntries(state, traceEntity()));
  const runningCounts = createMemo(() => getTracePanelRunningCounts(state, traceEntity()));
  const activeProject = () => threadSnapshot()?.project ?? getActiveProject(state);
  const threadProject = () => threadSnapshot()?.project;
  const fileLinkProject = createMemo(() => {
    const project = threadProject();
    if (project) return project;
    const projectId = assistantSnapshot()?.assistant.projectId ?? jobSnapshot()?.job.projectId;
    return projectId ? state.workspace.projects.find((entry) => entry.id === projectId) : undefined;
  });
  const handleOpenTraceFile = (target: ChatFileTarget) => {
    const project = fileLinkProject();
    if (!project) return;
    openIdeWindow({ projectId: project.id, threadId: project.activeThreadId });
    harnessStore.openIdeFile(target.path, target.line, target.column);
  };
  const traceFileLinks = (): FileLinkConfig | undefined => {
    const project = fileLinkProject();
    return project ? {
      rootPath: project.rootPath,
      filePaths: project.filePaths ?? [],
      onOpenFile: handleOpenTraceFile,
    } : undefined;
  };
  const runToShow = () => threadSnapshot()?.runToShow;
  const executionPaused = () => state.executionControl.isPaused;
  const visibleTraces = () => threadSnapshot()?.visibleTraces ?? getVisibleProjectTraces(activeProject()?.traces ?? []);
  const refreshState = () => {
    const project = activeProject();
    return project
      ? getRunRefreshState(project, runToShow())
      : { disabled: true, disabledReason: "No run available", refreshing: false };
  };
  const [expandedToolActivityId, setExpandedToolActivityId] = createSignal<string>();
  const [terminalHistoryOpen, setTerminalHistoryOpen] = createSignal(false);
  return {
    state, traceTitle, threadSnapshot, assistantSnapshot, jobSnapshot, executionLogEntries,
    runningCounts, activeProject, threadProject, traceFileLinks, runToShow, executionPaused,
    executionPauseReason: "Global execution pause is active", refreshState,
    deferredBrowserApprovalCount: () => state.executionControl.deferredBrowserApprovalCount,
    canRetryRun: () => Boolean(activeProject()?.lastRun?.retryable),
    hasPlanDetails: () => Boolean(activeProject()?.latestPlan?.executionPlan),
    visibleSubtasks: createMemo(() => runToShow()?.subtasks ?? []),
    visibleToolActivities: createMemo(() => runToShow()?.toolActivities ?? []),
    visibleBrowserSessions: createMemo(() => runToShow()?.browserSessions ?? []),
    visibleTraceRows: createMemo(() => visibleTraces()),
    expandedToolActivityId, setExpandedToolActivityId, terminalHistoryOpen, setTerminalHistoryOpen,
  };
}

type TracePanelState = ReturnType<typeof createTracePanelState>;

function createTracePanelActions(model: TracePanelState) {
  const sendRunCommand = (type: "run.retry" | "run.refresh", subagentId?: string) => {
    const project = model.activeProject();
    const run = type === "run.retry" ? project?.lastRun : project?.activeRun;
    if (!project || !run) return;
    harnessStore.actions.sendCommand({
      type,
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        runId: run.id,
        ...(subagentId ? { subagentId } : {}),
      },
    });
  };
  const resolveBrowserApproval = (sessionId: string, toolCallId: string, approved: boolean) => {
    const project = model.activeProject();
    const run = project?.activeRun ?? project?.lastRun;
    if (!project || !run || isTerminalAgentRunStatus(run.status)) return;
    harnessStore.actions.sendCommand({
      type: "browser.approval.resolve",
      requestId: createRequestId(),
      payload: { projectId: project.id, threadId: project.activeThreadId, runId: run.id, sessionId, toolCallId, approved },
    });
  };
  const openAssistantJob = (jobId: string) => {
    harnessStore.setActiveLeftTab("jobs");
    harnessStore.setJobsPanePreferences({
      segment: "jobs",
      selectedJobId: jobId,
      selectedRunId: undefined,
      selectedNotificationId: undefined,
      jobSearch: "",
      kind: undefined,
      status: undefined,
      risk: undefined,
    });
  };
  const openRunTerminalHistory = () => {
    const project = model.activeProject();
    const run = model.runToShow();
    if (!project || !run) return;
    harnessStore.actions.sendCommand({
      type: "terminal.history.list",
      requestId: createRequestId(),
      payload: { projectId: project.id, threadId: project.activeThreadId, runId: run.id },
    });
    model.setTerminalHistoryOpen(true);
  };
  return {
    retryRun: () => sendRunCommand("run.retry"),
    retrySubagent: (subagentId: string) => sendRunCommand("run.retry", subagentId),
    refreshRun: () => sendRunCommand("run.refresh"),
    refreshSubagent: (subagentId: string) => sendRunCommand("run.refresh", subagentId),
    resolveBrowserApproval,
    openAssistantJob,
    openRunTerminalHistory,
    handleAssistantJobKeyDown: (event: KeyboardEvent, jobId: string) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openAssistantJob(jobId);
    },
  };
}

type TracePanelActions = ReturnType<typeof createTracePanelActions>;

type TraceProject = NonNullable<ReturnType<TracePanelState["activeProject"]>>;
type TracePanelViewProps = { model: TracePanelState; actions: TracePanelActions };

function TraceNonProjectContent(props: TracePanelViewProps) {
  const { model, actions } = props;
  return (
    <>
      <Show when={model.assistantSnapshot()}>
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
                      const jobClass = () => {
                        const base = [styles.assistantJob, utilities.cursorPointer, utilities.rounded2xl, utilities.border, utilities.bgWhite70, utilities.p3, utilities.text0675];
                        if (statusView().state === "running") return stylex.attrs(...base, styles.assistantJobRunning).class;
                        if (statusView().state === "successful") return stylex.attrs(...base, styles.assistantJobSuccessful).class;
                        if (statusView().state === "error") return stylex.attrs(...base, styles.assistantJobError).class;
                        return stylex.attrs(...base, styles.assistantJobIdle).class;
                      };
                      const headingClass = () => {
                        const base = [utilities.flex, utilities.minW0, utilities.itemsCenter, utilities.gap2, utilities.fontSemibold];
                        if (statusView().state === "running") return stylex.attrs(...base, styles.assistantJobTextRunning).class;
                        if (statusView().state === "successful") return stylex.attrs(...base, styles.assistantJobTextSuccessful).class;
                        if (statusView().state === "error") return stylex.attrs(...base, styles.assistantJobTextError).class;
                        return stylex.attrs(...base, styles.assistantJobTextIdle).class;
                      };
                      return (
                        <div
                          data-test-trace-assistant-job=""
                          data-state={statusView().state}
                          class={jobClass()}
                          role="button"
                          tabIndex={0}
                          onClick={() => actions.openAssistantJob(job.id)}
                          onKeyDown={(event) => actions.handleAssistantJobKeyDown(event, job.id)}
                        >
                          <div data-test-trace-assistant-job-heading="" data-state={statusView().state} class={headingClass()}>
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
            <TraceExecutionLog model={model} fill />
          </div>
        )}
      </Show>
      <Show when={model.jobSnapshot()}>
        <div class={stylex.attrs(utilities.flex, utilities.minH0, utilities.flex1, utilities.flexCol, utilities.gap4).class}>
          <TraceExecutionLog model={model} fill />
        </div>
      </Show>
      <Show when={!model.assistantSnapshot() && !model.jobSnapshot()}>
        <div class={stylex.attrs(utilities.flex).class}>
          <div class={stylex.attrs(utilities.wFull, utilities.rounded3xl, utilities.border, utilities.borderDashed, utilities.borderDefault, utilities.bgWhite40, utilities.p5, utilities.text0675, utilities.leading5, utilities.textMuted).class}>
            Open project root, assistant, or job to inspect execution.
          </div>
        </div>
      </Show>
    </>
  );
}

function TraceExecutionLog(props: { model: TracePanelState; fill?: boolean }) {
  return (
    <section class={stylex.attrs(
      utilities.flex,
      utilities.minH85,
      props.fill ? utilities.flex1 : utilities.maxH72,
      utilities.flexCol,
      utilities.rounded3xl,
      utilities.border,
      utilities.borderDefault,
      utilities.bgWhite55,
      utilities.p3,
    ).class}>
      <div class={stylex.attrs(utilities.mb3, utilities.text0585, utilities.fontSemibold, utilities.uppercase, utilities.tracking018, utilities.textMuted).class}>Execution log</div>
      <ExecutionLog entries={props.model.executionLogEntries()} emptyMessage="No execution log yet." fileLinks={props.model.traceFileLinks()} />
    </section>
  );
}

function TracePlanCard(props: { model: TracePanelState; project: TraceProject }) {
  return (
    <Show when={props.project.latestPlan}>
      <div class={stylex.attrs(utilities.rounded3xl, utilities.border, utilities.borderDefault, utilities.bgWhite55, utilities.p3).class}>
        <div class={stylex.attrs(utilities.mb3, utilities.flex, utilities.itemsCenter, utilities.justifyBetween, utilities.gap2, utilities.text0585, utilities.fontSemibold, utilities.uppercase, utilities.tracking02, utilities.textMuted).class}>
          <span>Latest plan</span>
          <Show when={props.model.hasPlanDetails()}>
            <ActionButton
              tooltip="Open the full execution plan"
              icon={<ClipboardList class={stylex.attrs(utilities.h35, utilities.w35).class} />}
              size="sm"
              variant="secondary"
              onClick={() => {
                const executionPlan = props.project.latestPlan?.executionPlan;
                if (executionPlan) harnessStore.openExecutionPlanDialog(executionPlan);
              }}
            >
              Open plan
            </ActionButton>
          </Show>
        </div>
        <div class={stylex.attrs(utilities.grid, utilities.gridCols2, utilities.gap2, utilities.text0675, utilities.textMuted).class}>
          <div>Difficulty: {props.project.latestPlan?.difficultyScore}%</div>
          <div>Route: {props.project.latestPlan?.executionPlan?.route ?? (props.project.latestPlan?.usesSubagents ? "subagents" : "main")}</div>
          <div>Planner: {props.project.latestPlan?.planningModelId}</div>
          <div>Executor: {props.project.latestPlan?.executionModelId}</div>
          <div>Subtasks: {props.project.latestPlan?.subtaskCount}</div>
          <div>Agent: {props.project.latestPlan?.agentId}</div>
        </div>
      </div>
    </Show>
  );
}

function TraceSubtasks(props: TracePanelViewProps & { project: TraceProject }) {
  const { model, actions, project } = props;
  return (
    <Show when={model.runToShow()?.subtasks.length}>
      <div class={stylex.attrs(utilities.mt4, utilities.spaceY2).class}>
        <div class={stylex.attrs(utilities.text0585, utilities.fontSemibold, utilities.uppercase, utilities.tracking02, utilities.textMuted).class}>Subtasks</div>
        <VirtualList
          class={stylex.attrs(utilities.maxH80, utilities.minW0, utilities.overflowXHidden, utilities.pr2).class}
          contentClass={stylex.attrs(utilities.wFull, utilities.minW0).class}
          itemClass={stylex.attrs(utilities.minW0, utilities.pb2).class}
          items={model.visibleSubtasks()}
          getKey={(task) => task.id}
          estimateSize={132}
          pagination={{ kind: "forward", initialCount: TRACE_SUBTASK_LIMIT, batchSize: TRACE_SUBTASK_LIMIT }}
        >
          {(task) => {
            const taskRefresh = () => getRunRefreshState(project, project.activeRun, task.id);
            return (
              <div class={stylex.attrs(utilities.rounded2xl, utilities.border, utilities.borderDefault, utilities.bgWhite70, utilities.p3, utilities.text0675).class}>
                <div class={stylex.attrs(utilities.flex, utilities.minW0, utilities.itemsCenter, utilities.justifyBetween, utilities.gap3, utilities.textForeground).class}>
                  <span class={stylex.attrs(utilities.flex, utilities.minW0, utilities.flex1, utilities.itemsCenter, utilities.gap2, utilities.fontSemibold).class}>
                    <TaskStatusIcon status={task.status} />
                    <Tooltip content={task.title} triggerClass={stylex.attrs(utilities.minW0, utilities.flex1).class}>
                      <FileLinkedText class={stylex.attrs(utilities.block, utilities.truncate).class} text={task.title} fileLinks={model.traceFileLinks()} />
                    </Tooltip>
                  </span>
                  <span class={stylex.attrs(utilities.shrink0, utilities.uppercase, utilities.tracking014, utilities.textAccentStrong).class}>{task.status}</span>
                </div>
                <div class={stylex.attrs(utilities.mt1, utilities.textMuted).class}>Attempts: {task.attemptCount}</div>
                <div class={stylex.attrs(utilities.mt1, utilities.textMuted).class}>
                  <FileLinkedText text={() => `Latest status: ${getLatestTaskStatusText(project, task)}`} fileLinks={model.traceFileLinks()} />
                </div>
                <Show when={task.startedAt}><div class={stylex.attrs(utilities.mt1, utilities.textMuted).class}>Started: {formatShortTimestamp(task.startedAt)}</div></Show>
                <Show when={task.completedAt}><div class={stylex.attrs(utilities.mt1, utilities.textMuted).class}>Completed: {formatShortTimestamp(task.completedAt)}</div></Show>
                <div class={stylex.attrs(utilities.mt2, utilities.flex, utilities.flexWrap, utilities.gap2).class}>
                  <ActionButton
                    tooltip="Refresh this active subagent"
                    disabledReason={model.executionPaused() ? model.executionPauseReason : taskRefresh().disabledReason}
                    disabled={model.executionPaused() || taskRefresh().disabled}
                    icon={<RefreshCcw class={stylex.attrs(utilities.h35, utilities.w35).class} />}
                    size="sm"
                    variant="secondary"
                    onClick={() => actions.refreshSubagent(task.id)}
                  >
                    {taskRefresh().refreshing ? "Refreshing" : "Refresh"}
                  </ActionButton>
                  <Show when={project.lastRun?.retryable}>
                    <ActionButton
                      tooltip="Retry this subagent"
                      disabledReason={model.executionPaused() ? model.executionPauseReason : "Project is streaming"}
                      disabled={model.executionPaused() || project.session.isStreaming}
                      icon={<RefreshCcw class={stylex.attrs(utilities.h35, utilities.w35).class} />}
                      size="sm"
                      variant="secondary"
                      onClick={() => actions.retrySubagent(task.id)}
                    >Retry</ActionButton>
                  </Show>
                </div>
                <Show when={task.errorMessage}>
                  <MarkdownContent content={() => task.errorMessage ?? ""} class={stylex.attrs(utilities.mt1).class} size="compact" tone="danger" fileLinks={model.traceFileLinks()} />
                </Show>
              </div>
            );
          }}
        </VirtualList>
      </div>
    </Show>
  );
}

function TraceRunCard(props: TracePanelViewProps & { project: TraceProject }) {
  const { model, actions, project } = props;
  return (
    <Show when={model.runToShow()}>
      {(run) => (
        <div data-test-trace-run-card="" class={stylex.attrs(utilities.wFull, utilities.minW0, utilities.rounded3xl, utilities.border, utilities.borderDefault, utilities.bgWhite55, utilities.p3).class}>
          <div class={stylex.attrs(utilities.mb3, utilities.flex, utilities.minW0, utilities.flexWrap, utilities.itemsCenter, utilities.justifyBetween, utilities.gap3, utilities.text0585, utilities.fontSemibold, utilities.uppercase, utilities.tracking02, utilities.textMuted).class}>
            <div class={stylex.attrs(utilities.flex, utilities.minW0, utilities.flexWrap, utilities.itemsCenter, utilities.gap2).class}>
              <Show when={isRunWorking(run().status)}><LoaderCircle class={stylex.attrs(utilities.h35, utilities.w35, utilities.animateSpin).class} /></Show>
              Run
            </div>
            <div data-test-trace-run-actions="" class={stylex.attrs(utilities.flex, utilities.wFull, utilities.minW0, utilities.flexWrap, utilities.itemsCenter, utilities.justifyEnd, utilities.gap2).class}>
              <ActionButton
                tooltip="Refresh the active run"
                disabledReason={model.executionPaused() ? model.executionPauseReason : model.refreshState().disabledReason}
                disabled={model.executionPaused() || model.refreshState().disabled}
                icon={<RefreshCcw class={stylex.attrs(utilities.h35, utilities.w35).class} />}
                size="sm"
                variant="secondary"
                onClick={actions.refreshRun}
              >{model.refreshState().refreshing ? "Refreshing" : "Refresh"}</ActionButton>
              <Show when={model.canRetryRun()}>
                <ActionButton
                  tooltip="Retry last run"
                  disabledReason={model.executionPaused() ? model.executionPauseReason : "Project is streaming"}
                  disabled={model.executionPaused() || project.session.isStreaming}
                  icon={<RefreshCcw class={stylex.attrs(utilities.h35, utilities.w35).class} />}
                  size="sm"
                  variant="secondary"
                  onClick={actions.retryRun}
                >Retry</ActionButton>
              </Show>
              <ActionButton
                tooltip="Open terminal history for this run"
                ariaLabel="Open run terminal history"
                icon={<Terminal class={stylex.attrs(utilities.h35, utilities.w35).class} />}
                size="sm"
                variant="secondary"
                onClick={actions.openRunTerminalHistory}
              >Terminals</ActionButton>
            </div>
          </div>
          <div class={stylex.attrs(utilities.minW0, utilities.spaceY2, utilities.text0675, utilities.textMuted).class}>
            <div>Status: {run().status}</div>
            <div>Retryable: {run().retryable ? "yes" : "no"}</div>
            <div>Resumable: {run().resumable ? "yes" : "no"}</div>
            <Tooltip content={run().latestUserPrompt} triggerClass={stylex.attrs(utilities.block, utilities.minW0).class}>
              <div class={stylex.attrs(utilities.truncate).class}>
                <FileLinkedText text={() => `Prompt: ${run().latestUserPrompt ?? ""}`} fileLinks={model.traceFileLinks()} />
              </div>
            </Tooltip>
            <Show when={run().failureMessage}>
              {(failure) => <div class={stylex.attrs(utilities.wrapAnywhere).class}><FileLinkedText text={`Failure: ${failure()}`} fileLinks={model.traceFileLinks()} /></div>}
            </Show>
          </div>
          <TraceSubtasks model={model} actions={actions} project={project} />
        </div>
      )}
    </Show>
  );
}

function TraceToolActivitySection(props: { model: TracePanelState }) {
  const { model } = props;
  return (
    <Show when={model.runToShow()?.toolActivities?.length}>
      <div class={stylex.attrs(utilities.rounded3xl, utilities.border, utilities.borderDefault, utilities.bgWhite55, utilities.p3).class}>
        <div class={stylex.attrs(utilities.mb3, utilities.flex, utilities.itemsCenter, utilities.gap2, utilities.text0585, utilities.fontSemibold, utilities.uppercase, utilities.tracking02, utilities.textMuted).class}>
          <Terminal class={stylex.attrs(utilities.h35, utilities.w35).class} />
          Tool activity
        </div>
        <VirtualList
          class={stylex.attrs(utilities.maxH96, utilities.minW0, utilities.overflowXHidden, utilities.pr2).class}
          contentClass={stylex.attrs(utilities.wFull, utilities.minW0).class}
          itemClass={stylex.attrs(utilities.minW0, utilities.pb2).class}
          items={model.visibleToolActivities()}
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
              <div class={stylex.attrs(utilities.mt2, utilities.text064, utilities.leading5, utilities.textMuted).class}>{formatToolInvocationDescription(activity)}</div>
              <Show when={formatToolActivitySnippet(activity, 260)}>
                {(snippet) => <div class={stylex.attrs(styles.toolSnippet, utilities.mt2, utilities.fontMono).class}><FileLinkedText text={snippet()} fileLinks={model.traceFileLinks()} /></div>}
              </Show>
              <Show when={activity.outputPreview && activity.outputPreview !== activity.command ? activity.outputPreview : undefined}>
                {(preview) => <div class={stylex.attrs(styles.toolSnippet, utilities.mt2).class}><FileLinkedText text={normalizeToolSnippet(preview(), 260)} fileLinks={model.traceFileLinks()} /></div>}
              </Show>
              <Show when={model.expandedToolActivityId() === activity.id}>
                <div class={stylex.attrs(utilities.mt2, utilities.spaceY2, utilities.roundedXl, utilities.border, utilities.borderDefault, utilities.bgWhite80, utilities.p2).class}>
                  <Show when={activity.argsSummary}>{(summary) => <ToolSnippetBlock title="Args" value={summary()} fileLinks={model.traceFileLinks()} />}</Show>
                  <Show when={activity.stdoutPreview}>{(stdout) => <ToolSnippetBlock title="Stdout" value={stdout()} fileLinks={model.traceFileLinks()} />}</Show>
                  <Show when={activity.stderrPreview}>{(stderr) => <ToolSnippetBlock title="Stderr" value={stderr()} tone="danger" fileLinks={model.traceFileLinks()} />}</Show>
                </div>
              </Show>
              <div class={stylex.attrs(utilities.mt2, utilities.flex, utilities.flexWrap, utilities.justifyEnd, utilities.gap2).class}>
                <ActionButton
                  tooltip="Toggle tool details"
                  icon={model.expandedToolActivityId() === activity.id
                    ? <ChevronDown class={stylex.attrs(utilities.h35, utilities.w35).class} />
                    : <ChevronRight class={stylex.attrs(utilities.h35, utilities.w35).class} />}
                  size="sm"
                  variant="ghost"
                  onClick={() => model.setExpandedToolActivityId(model.expandedToolActivityId() === activity.id ? undefined : activity.id)}
                >Details</ActionButton>
                <CopyTextButton
                  value={formatToolActivityCopyText(activity)}
                  tooltip="Copy tool output"
                  copiedTitle="Tool output copied"
                  copiedDescription="Tool output copied to clipboard."
                  size="sm"
                  variant="ghost"
                  ariaLabel="Copy tool output"
                >Copy</CopyTextButton>
              </div>
            </article>
          )}
        </VirtualList>
      </div>
    </Show>
  );
}

function TraceBrowserSessionCard(props: TracePanelViewProps & {
  session: TracePanelState["visibleBrowserSessions"] extends () => Array<infer T> ? T : never;
}) {
  const { model, actions, session } = props;
  const pendingApproval = () => {
    const run = model.runToShow();
    return run && !isTerminalAgentRunStatus(run.status) ? session.pendingApproval : undefined;
  };
  return (
    <article class={stylex.attrs(utilities.rounded2xl, utilities.border, utilities.borderDefault, utilities.bgWhite70, utilities.p3, utilities.text0675).class}>
      <div class={stylex.attrs(utilities.flex, utilities.itemsCenter, utilities.justifyBetween, utilities.gap3, utilities.textForeground).class}>
        <div class={stylex.attrs(utilities.fontSemibold).class}>{session.owner === "subagent" ? `Subagent ${session.subagentId}` : session.owner}</div>
        <div class={stylex.attrs(utilities.uppercase, utilities.tracking014, utilities.textAccentStrong).class}>{session.status}</div>
      </div>
      <Show when={pendingApproval()}>
        {(approval) => (
          <div class={stylex.attrs(utilities.mt3, utilities.roundedXl, utilities.border, utilities.borderAmber300_70, utilities.bgAmber50_80, utilities.p3).class}>
            <div class={stylex.attrs(utilities.fontSemibold, utilities.textAmber900).class}>Approval needed</div>
            <div class={stylex.attrs(utilities.mt1, utilities.textAmber900_80).class}><FileLinkedText text={approval().label} fileLinks={model.traceFileLinks()} /></div>
            <Show when={approval().inputSummary}>
              {(summary) => <div class={stylex.attrs(utilities.mt1, utilities.whitespacePreWrap, utilities.textAmber900_70).class}><FileLinkedText text={summary()} fileLinks={model.traceFileLinks()} /></div>}
            </Show>
            <div class={stylex.attrs(utilities.mt3, utilities.flex, utilities.flexWrap, utilities.gap2).class}>
              <ActionButton
                tooltip="Approve this browser step"
                disabled={model.executionPaused()}
                disabledReason={model.executionPauseReason}
                icon={<ShieldCheck class={stylex.attrs(utilities.h35, utilities.w35).class} />}
                size="sm"
                variant="secondary"
                onClick={() => actions.resolveBrowserApproval(session.id, approval().toolCallId, true)}
              >Approve</ActionButton>
              <ActionButton
                tooltip="Reject this browser step"
                icon={<ShieldX class={stylex.attrs(utilities.h35, utilities.w35).class} />}
                size="sm"
                variant="secondary"
                onClick={() => actions.resolveBrowserApproval(session.id, approval().toolCallId, false)}
              >Reject</ActionButton>
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
                  <span class={stylex.attrs(utilities.fontSemibold).class}><FileLinkedText text={activity.label} fileLinks={model.traceFileLinks()} /></span>
                  <span class={stylex.attrs(utilities.uppercase, utilities.tracking014, utilities.textMuted).class}>{activity.status}</span>
                </div>
                <div class={stylex.attrs(utilities.mt1, utilities.textMuted).class}>{activity.toolName} | {activity.kind}</div>
                <Show when={activity.outputSummary}>
                  <MarkdownContent content={() => activity.outputSummary ?? ""} class={stylex.attrs(utilities.mt2).class} size="compact" fileLinks={model.traceFileLinks()} />
                </Show>
                <Show when={activity.replay.length > 0}>
                  <div class={stylex.attrs(utilities.mt2, utilities.spaceY1, utilities.textMuted).class}>
                    <For each={activity.replay.slice(-3)}>{(entry) => <div><FileLinkedText text={entry.summary} fileLinks={model.traceFileLinks()} /></div>}</For>
                  </div>
                </Show>
                <Show when={activity.verification.length > 0}>
                  <div class={stylex.attrs(utilities.mt2, utilities.textEmerald800_80).class}>{formatVerificationSummary(activity.verification)}</div>
                </Show>
              </div>
            </Show>
          )}
        </For>
      </div>
    </article>
  );
}

function TraceBrowserSessionsSection(props: TracePanelViewProps) {
  const { model } = props;
  return (
    <Show when={model.runToShow()?.browserSessions?.length}>
      <div class={stylex.attrs(utilities.rounded3xl, utilities.border, utilities.borderDefault, utilities.bgWhite55, utilities.p3).class}>
        <div class={stylex.attrs(utilities.mb3, utilities.text0585, utilities.fontSemibold, utilities.uppercase, utilities.tracking02, utilities.textMuted).class}>Browser sessions</div>
        <Show when={model.executionPaused() && model.deferredBrowserApprovalCount() > 0}>
          <div class={stylex.attrs(utilities.mb3, utilities.roundedXl, utilities.border, utilities.borderAmber300_70, utilities.bgAmber50_80, utilities.p3, utilities.text0675, utilities.textAmber900).class}>
            {model.deferredBrowserApprovalCount()} browser approvals queued until resume.
          </div>
        </Show>
        <VirtualList
          class={stylex.attrs(utilities.maxH96, utilities.minW0, utilities.overflowXHidden, utilities.pr2).class}
          contentClass={stylex.attrs(utilities.wFull, utilities.minW0).class}
          itemClass={stylex.attrs(utilities.minW0, utilities.pb3).class}
          items={model.visibleBrowserSessions()}
          getKey={(session) => session.id}
          estimateSize={240}
          pagination={{ kind: "forward", initialCount: TRACE_BROWSER_SESSION_LIMIT, batchSize: TRACE_BROWSER_SESSION_LIMIT }}
        >
          {(session) => <TraceBrowserSessionCard model={model} actions={props.actions} session={session} />}
        </VirtualList>
      </div>
    </Show>
  );
}

function TraceEventHistory(props: { model: TracePanelState }) {
  return (
    <VirtualList
      class={stylex.attrs(utilities.flex1, utilities.minH0, utilities.minW0, utilities.overflowXHidden, utilities.pr2).class}
      contentClass={stylex.attrs(utilities.wFull, utilities.minW0).class}
      itemClass={stylex.attrs(utilities.minW0, utilities.pb3).class}
      items={props.model.visibleTraceRows()}
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
              <div class={stylex.attrs(utilities.mt1, utilities.text053, utilities.fontMedium, utilities.normalCase, utilities.trackingNormal, utilities.textMuted).class}>{formatShortTimestamp(trace.createdAt)}</div>
            </div>
            <span>{trace.modelId ?? "n/a"}</span>
          </div>
          <MarkdownContent content={() => trace.message} size="compact" fileLinks={props.model.traceFileLinks()} />
          <Show when={trace.detail}>
            <MarkdownContent content={() => trace.detail ?? ""} class={stylex.attrs(utilities.mt2).class} size="compact" tone="muted" fileLinks={props.model.traceFileLinks()} />
          </Show>
        </article>
      )}
    </VirtualList>
  );
}

function TraceProjectContent(props: TracePanelViewProps & { project: TraceProject }) {
  return (
    <>
      <TracePlanCard model={props.model} project={props.project} />
      <TraceRunCard model={props.model} actions={props.actions} project={props.project} />
      <TraceToolActivitySection model={props.model} />
      <TraceBrowserSessionsSection model={props.model} actions={props.actions} />
      <TraceExecutionLog model={props.model} />
      <TraceEventHistory model={props.model} />
    </>
  );
}

function TraceTerminalHistory(props: { model: TracePanelState }) {
  const scope = () => {
    const project = props.model.activeProject();
    const run = props.model.runToShow();
    return project && run
      ? { projectId: project.id, threadId: project.activeThreadId, runId: run.id }
      : undefined;
  };
  return (
    <TerminalHistoryDialog
      open={props.model.terminalHistoryOpen()}
      title="Run Terminal History"
      scope={scope()}
      onClose={() => props.model.setTerminalHistoryOpen(false)}
    />
  );
}

export function TracePanel() {
  const model = createTracePanelState();
  const actions = createTracePanelActions(model);
  return (
    <>
      <aside
        data-test-trace-panel=""
        class={stylex.attrs(
          styles.panelShell,
          utilities.flex,
          utilities.hFull,
          utilities.minH0,
          utilities.minW0,
          utilities.flexCol,
          utilities.gap4,
          utilities.overflowXHidden,
          utilities.rounded2xl,
          utilities.p08,
        ).class}
      >
        <div class={stylex.attrs(utilities.flex, utilities.itemsCenter, utilities.gap2, utilities.text0585, utilities.fontSemibold, utilities.tracking02, utilities.textMuted).class}>
          <span>Developer trace</span>
          <Tooltip content="Selected thread, assistant, or job traces stay here, separate from user-visible chat history.">
            <span class={stylex.attrs(utilities.inlineFlex).class}>
              <CircleHelp class={stylex.attrs(utilities.h35, utilities.w35, utilities.textMuted).class} aria-label="Projects trace help" />
            </span>
          </Tooltip>
        </div>
        <TraceContextSummary
          title={model.traceTitle()}
          runningCounts={model.runningCounts()}
          run={model.runToShow()}
          assistant={model.assistantSnapshot()?.assistant}
          assistantJobsCount={model.assistantSnapshot()?.jobs.length}
          assistantRunsCount={model.assistantSnapshot()?.runs.length}
          job={model.jobSnapshot()?.job}
          jobRun={model.jobSnapshot()?.run}
          jobRunCount={model.jobSnapshot()?.runs.length}
          fileLinks={model.traceFileLinks()}
        />
        <Show when={model.threadProject()} fallback={<TraceNonProjectContent model={model} actions={actions} />}>
          {(project) => <TraceProjectContent model={model} actions={actions} project={project()} />}
        </Show>
        <div data-test-trace-running-counts="" class={stylex.attrs(utilities.shrink0, utilities.rounded2xl, utilities.border, utilities.borderDefault, utilities.bgWhite75, utilities.px3, utilities.py2, utilities.text0625, utilities.fontSemibold, utilities.textForeground).class}>
          Running agents:{" "}
          <span class={rightAlignedNumbersEnabled() ? stylex.attrs(styles.numericFlagged).class : undefined}>{model.runningCounts().current}</span>
          {" "}current /{" "}
          <span class={rightAlignedNumbersEnabled() ? stylex.attrs(styles.numericFlagged).class : undefined}>{model.runningCounts().total}</span>
          {" "}total
        </div>
      </aside>
      <TraceTerminalHistory model={model} />
    </>
  );
}
