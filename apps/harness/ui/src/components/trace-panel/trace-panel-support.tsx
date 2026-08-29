import { createMemo, createSignal, For, Show } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { createRequestId, isTerminalAgentRunStatus, type AgentRunState, type BackgroundJob, type BackgroundJobRun, type ExecutionToolActivity } from "@hyperfocus/ai-core/protocol";
import { getActiveProject, harnessStore } from "../../harness-store";
import type { ChatFileTarget } from "../../lib/chat-file-links";
import { openIdeWindow } from "../../lib/ide-window";
import { getLatestTaskStatusText, getRunRefreshState, getVisibleProjectTraces, isRunWorking } from "../../lib/run-status";
import { formatShortTimestamp } from "../../lib/time-format";
import {
  formatToolActivityCopyText,
  formatToolActivityOwner,
  formatToolActivitySnippet,
  formatToolInvocationDescription,
  normalizeToolSnippet
} from "../../lib/tool-activity-format";
import { rightAlignedNumbersEnabled } from "../../lib/visual-flags";
import {
  getAssistantTracePanelSnapshot,
  getJobTracePanelSnapshot,
  getThreadTracePanelSnapshot,
  getTracePanelExecutionLogEntries,
  getTracePanelRunningCounts,
  getTracePanelTitle,
  resolveTracePanelEntity
} from "../../lib/trace-panel-model";
import { ActionButton } from "../action-button";
import { FileLinkedText, type FileLinkConfig } from "../file-linked-text";
import { CopyTextButton } from "../primitives/copy-text-button";
import { ExecutionLog } from "../primitives/execution-log";
import { MarkdownContent } from "../markdown-content";
import { Tooltip } from "../primitives/tooltip";
import { VirtualList } from "../primitives/virtual-list";
import { TerminalHistoryDialog } from "../../terminal/terminal-history-dialog";
import { tracePanelStyles as styles, traceUtilityStyles as utilities } from "../trace-panel.styles";
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

export function TraceContextSummary(props: {
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
    <aside data-test-trace-peek-rail="" class={stylex.attrs(styles.peekRail, styles.panelShell, utilities.flex, utilities.hFull, utilities.minH0, utilities.flexCol, utilities.gap3, utilities.roundedXl, utilities.p3).class}>
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

export function ToolSnippetBlock(props: { title: string; value: string; tone?: "danger"; fileLinks?: FileLinkConfig }) {
  return (
    <div class={stylex.attrs(utilities.roundedLg, utilities.border, utilities.borderDefault, utilities.bgWhite70, utilities.p2).class}>
      <div class={stylex.attrs(utilities.mb1, utilities.text055, utilities.fontSemibold, utilities.uppercase, utilities.tracking014, utilities.textMuted).class}>{props.title}</div>
      <div class={props.tone === "danger" ? stylex.attrs(styles.toolSnippet, utilities.textRose800).class : stylex.attrs(styles.toolSnippet).class}>
        <FileLinkedText text={normalizeToolSnippet(props.value, 360)} fileLinks={props.fileLinks} />
      </div>
    </div>
  );
}

export const TRACE_SUBTASK_LIMIT = 24;
export const TRACE_TOOL_ACTIVITY_LIMIT = 50;
export const TRACE_BROWSER_SESSION_LIMIT = 10;
export const TRACE_BROWSER_ACTIVITY_LIMIT = 25;
export const TRACE_EVENT_LIMIT = 80;

type AssistantJobStatusState = "running" | "successful" | "error" | "idle";

export function getAssistantJobStatusView(jobId: string, runs: { jobId: string; status: string; updatedAt: string }[]) {
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

export function getAssistantJobStatusText(job: { kind: string; status: string; riskLevel: string; nextRunAt?: string }, statusState: AssistantJobStatusState) {
  return [job.kind, job.status, job.riskLevel, job.nextRunAt && statusState !== "running" ? `next ${formatShortTimestamp(job.nextRunAt)}` : undefined]
    .filter(Boolean)
    .join(" | ");
}

export function AssistantJobStatusIcon(props: { state: AssistantJobStatusState }) {
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

export function TaskStatusIcon(props: { status: "pending" | "running" | "completed" | "failed" }) {
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

export function ToolActivityStatusIcon(props: { status: ExecutionToolActivity["status"] }) {
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

export function formatVerificationSummary(verification: Array<{ status: "passed" | "failed" | "unknown" }>) {
  const passed = verification.filter((entry) => entry.status === "passed").length;
  const failed = verification.filter((entry) => entry.status === "failed").length;
  const unknown = verification.filter((entry) => entry.status === "unknown").length;
  return `Verification: ${passed} pass, ${failed} fail, ${unknown} unknown`;
}

