import {
deriveBrowserSessionStatus,
type BrowserActivity,
type BrowserActivityKind,
type BrowserSession
} from "@hyperfocus/ai-core/protocol";
import { isObject as isRecord } from "@hyperfocus/utilities/records";

type BrowserSessionOwner = BrowserSession["owner"];

type SessionLocator = {
  runId: string;
  owner: BrowserSessionOwner;
  subagentId?: string;
};

type ApprovalRequestInput = SessionLocator & {
  toolCallId: string;
  toolName: string;
  args: unknown;
  requestedAt?: string;
};

type ApprovalResolutionInput = SessionLocator & {
  sessionId: string;
  toolCallId: string;
  approved: boolean;
  resolvedAt?: string;
  reason?: string;
};

type ToolLifecycleInput = SessionLocator & {
  toolCallId: string;
  toolName: string;
  args?: unknown;
  partialResult?: unknown;
  result?: unknown;
  isError?: boolean;
  occurredAt?: string;
};

const BROWSER_TOOL_PATTERN = /(browser|playwright|puppeteer|chromium|chrome|webdriver)/i;

export function isBrowserToolName(toolName: string) {
  return BROWSER_TOOL_PATTERN.test(toolName);
}

export function requestBrowserApproval(sessions: BrowserSession[], input: ApprovalRequestInput) {
  if (!isBrowserToolName(input.toolName)) {
    return sessions;
  }

  const occurredAt = input.requestedAt ?? new Date().toISOString();
  const kind = inferBrowserActivityKind(input.toolName, input.args);
  const inputSummary = summarizeValue(input.args);
  const label = describeBrowserActivity(kind, input.toolName, input.args);
  const session = ensureBrowserSession(sessions, {
    runId: input.runId,
    owner: input.owner,
    subagentId: input.subagentId,
    occurredAt
  });
  const activity = ensureBrowserActivity(session, {
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    kind,
    label,
    inputSummary,
    occurredAt
  });

  const queueBehindPending = session.activities.some((entry) => entry.id !== activity.id &&
    (entry.approval?.status === "pending" || entry.approval?.status === "deferred"));
  activity.status = "pending-approval";
  activity.updatedAt = occurredAt;
  activity.approval = {
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    kind,
    label,
    inputSummary,
    status: queueBehindPending ? "deferred" : "pending",
    requestedAt: occurredAt
  };
  activity.replay = appendReplayEntry(activity.replay, {
    status: "pending-approval",
    summary: `Awaiting approval: ${label}`,
    createdAt: occurredAt
  });

  session.status = queueBehindPending ? deriveBrowserSessionStatus(session.activities) : "awaiting-approval";
  if (!queueBehindPending) session.pendingApproval = activity.approval;
  session.lastActivityLabel = label;
  session.updatedAt = occurredAt;
  session.completedAt = undefined;
  return normalizeBrowserSessions(sessions);
}

export function resolveBrowserApproval(sessions: BrowserSession[], input: ApprovalResolutionInput) {
  const session = sessions.find((entry) => entry.id === input.sessionId && entry.runId === input.runId);
  if (!session) {
    return sessions;
  }

  const activity = session.activities.find((entry) => entry.toolCallId === input.toolCallId);
  if (!activity?.approval || activity.approval.status !== "pending") {
    return sessions;
  }

  const occurredAt = input.resolvedAt ?? new Date().toISOString();
  activity.approval = {
    ...activity.approval,
    status: input.approved ? "approved" : "rejected",
    resolvedAt: occurredAt,
    resolutionReason: input.reason
  };
  activity.updatedAt = occurredAt;
  activity.status = input.approved ? "running" : "blocked";
  activity.errorMessage = input.approved ? undefined : input.reason ?? "Browser action rejected";
  activity.completedAt = input.approved ? undefined : occurredAt;
  activity.replay = appendReplayEntry(activity.replay, {
    status: input.approved ? "running" : "blocked",
    summary: input.approved ? `Approved: ${activity.label}` : `Rejected: ${activity.label}`,
    createdAt: occurredAt
  });

  session.pendingApproval = undefined;
  session.status = input.approved ? "running" : "blocked";
  session.lastActivityLabel = activity.label;
  session.updatedAt = occurredAt;
  session.completedAt = input.approved ? undefined : occurredAt;
  promoteNextDeferredBrowserApproval(session);
  return normalizeBrowserSessions(sessions);
}

export function promoteNextDeferredBrowserApproval(session: BrowserSession) {
  if (session.pendingApproval?.status === "pending") return false;
  const next = session.activities.find((activity) => activity.status === "pending-approval" && activity.approval?.status === "deferred");
  if (!next?.approval) { session.status = deriveBrowserSessionStatus(session.activities); return false; }
  next.approval = { ...next.approval, status: "pending" }; session.pendingApproval = next.approval;
  session.status = deriveBrowserSessionStatus(session.activities);
  session.updatedAt = session.updatedAt > next.updatedAt ? session.updatedAt : next.updatedAt;
  session.completedAt = undefined; session.lastActivityLabel = next.label; return true;
}

export function cancelBrowserApprovals(sessions: BrowserSession[], reason: string, occurredAt = new Date().toISOString()) {
  for (const session of sessions) {
    let cancelled = false;
    for (const activity of session.activities) {
      if (activity.approval?.status !== "pending" && activity.approval?.status !== "deferred") continue;
      activity.approval = { ...activity.approval, status: "rejected", resolvedAt: occurredAt, resolutionReason: reason };
      activity.status = "blocked"; activity.errorMessage = reason; activity.completedAt = occurredAt;
      activity.updatedAt = occurredAt; cancelled = true;
    }
    if (!cancelled) continue;
    session.pendingApproval = undefined; session.status = "blocked"; session.completedAt = occurredAt;
    session.updatedAt = occurredAt;
  }
  return normalizeBrowserSessions(sessions);
}

export function recordBrowserToolStart(sessions: BrowserSession[], input: ToolLifecycleInput) {
  return withBrowserActivity(sessions, input, (session, activity, occurredAt) => {
    activity.status = "running";
    activity.updatedAt = occurredAt;
    activity.completedAt = undefined;
    activity.inputSummary = activity.inputSummary ?? summarizeValue(input.args);
    activity.replay = appendReplayEntry(activity.replay, {
      status: "running",
      summary: `Started: ${activity.label}`,
      createdAt: occurredAt
    });

    session.status = "running";
    session.pendingApproval = undefined;
    session.lastActivityLabel = activity.label;
    session.updatedAt = occurredAt;
    session.completedAt = undefined;
  });
}

export function recordBrowserToolUpdate(sessions: BrowserSession[], input: ToolLifecycleInput) {
  return withBrowserActivity(sessions, input, (session, activity, occurredAt) => {
    const partialSummary = summarizeValue(input.partialResult);
    activity.status = activity.status === "pending-approval" ? "pending-approval" : "running";
    activity.updatedAt = occurredAt;
    activity.replay = partialSummary
      ? appendReplayEntry(activity.replay, {
          status: activity.status === "pending-approval" ? "pending-approval" : "running",
          summary: partialSummary,
          createdAt: occurredAt
        })
      : activity.replay;

    session.status = activity.status === "pending-approval" ? "awaiting-approval" : "running";
    session.lastActivityLabel = activity.label;
    session.updatedAt = occurredAt;
  });
}

export function recordBrowserToolEnd(sessions: BrowserSession[], input: ToolLifecycleInput) {
  return withBrowserActivity(sessions, input, (session, activity, occurredAt) => {
    const failed = input.isError === true;
    activity.status = failed ? "failed" : "completed";
    activity.updatedAt = occurredAt;
    activity.completedAt = occurredAt;
    activity.outputSummary = summarizeValue(input.result);
    activity.errorMessage = failed ? summarizeValue(input.result) ?? "Browser tool failed" : undefined;
    activity.replay = appendReplayEntry(activity.replay, {
      status: activity.status,
      summary: activity.outputSummary ?? (failed ? `Failed: ${activity.label}` : `Completed: ${activity.label}`),
      createdAt: occurredAt
    });

    if (activity.kind === "verify") {
      activity.verification = [
        ...activity.verification,
        {
          id: crypto.randomUUID(),
          label: activity.label,
          status: failed ? "failed" : "passed",
          detail: activity.outputSummary,
          createdAt: occurredAt
        }
      ];
    }

    session.pendingApproval = undefined;
    session.lastActivityLabel = activity.label;
    session.updatedAt = occurredAt;
    session.status = deriveBrowserSessionStatus(session.activities);
    session.completedAt = session.status === "running" || session.status === "awaiting-approval" ? undefined : occurredAt;
  });
}

export function findPendingBrowserApproval(
  sessions: BrowserSession[],
  input: Pick<ApprovalResolutionInput, "runId" | "sessionId" | "toolCallId">
) {
  return sessions
    .find((session) => session.id === input.sessionId && session.runId === input.runId)
    ?.activities.find((activity) => activity.toolCallId === input.toolCallId && activity.approval?.status === "pending");
}

function withBrowserActivity(
  sessions: BrowserSession[],
  input: ToolLifecycleInput,
  updater: (session: BrowserSession, activity: BrowserActivity, occurredAt: string) => void
) {
  if (!isBrowserToolName(input.toolName)) {
    return sessions;
  }

  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const kind = inferBrowserActivityKind(input.toolName, input.args);
  const label = describeBrowserActivity(kind, input.toolName, input.args);
  const session = ensureBrowserSession(sessions, {
    runId: input.runId,
    owner: input.owner,
    subagentId: input.subagentId,
    occurredAt
  });
  const activity = ensureBrowserActivity(session, {
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    kind,
    label,
    inputSummary: summarizeValue(input.args),
    occurredAt
  });
  updater(session, activity, occurredAt);
  return normalizeBrowserSessions(sessions);
}

function ensureBrowserSession(
  sessions: BrowserSession[],
  input: SessionLocator & { occurredAt: string }
) {
  const existing = sessions.find(
    (session) =>
      session.runId === input.runId && session.owner === input.owner && (session.subagentId ?? undefined) === input.subagentId
  );
  if (existing) {
    return existing;
  }

  const created: BrowserSession = {
    id: crypto.randomUUID(),
    runId: input.runId,
    owner: input.owner,
    subagentId: input.subagentId,
    status: "idle",
    approvalMode: "per-tool",
    startedAt: input.occurredAt,
    updatedAt: input.occurredAt,
    activities: []
  };
  sessions.push(created);
  return created;
}

function ensureBrowserActivity(
  session: BrowserSession,
  input: {
    toolCallId: string;
    toolName: string;
    kind: BrowserActivityKind;
    label: string;
    inputSummary?: string;
    occurredAt: string;
  }
) {
  const existing = session.activities.find((activity) => activity.toolCallId === input.toolCallId);
  if (existing) {
    return existing;
  }

  const created: BrowserActivity = {
    id: crypto.randomUUID(),
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    kind: input.kind,
    label: input.label,
    inputSummary: input.inputSummary,
    status: "running",
    startedAt: input.occurredAt,
    updatedAt: input.occurredAt,
    replay: [],
    verification: []
  };
  session.activities.push(created);
  return created;
}

function normalizeBrowserSessions(sessions: BrowserSession[]) {
  return sessions
    .map((session) => ({
      ...session,
      activities: [...session.activities].sort((left, right) => left.startedAt.localeCompare(right.startedAt))
    }))
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
}

function inferBrowserActivityKind(toolName: string, args: unknown): BrowserActivityKind {
  const value = [toolName, summarizeValue(args) ?? ""].join(" ").toLowerCase();
  if (/(verify|assert|expect|check)/.test(value)) {
    return "verify";
  }
  if (/(screenshot|capture|snapshot|image)/.test(value)) {
    return "capture";
  }
  if (/(navigate|goto|visit|open|url)/.test(value)) {
    return "navigate";
  }
  if (/(click|press|tap|select)/.test(value)) {
    return "click";
  }
  if (/(fill|type|input|enter)/.test(value)) {
    return "input";
  }
  if (/(extract|scrape|read text|get text|content)/.test(value)) {
    return "extract";
  }
  return "tool";
}

function describeBrowserActivity(kind: BrowserActivityKind, toolName: string, args: unknown) {
  const input = asRecord(args);
  const selector = readString(input, ["selector", "target", "locator", "element"]);
  const url = readString(input, ["url", "href"]);
  const text = readString(input, ["text", "value"]);

  switch (kind) {
    case "navigate":
      return url ? `Open ${url}` : `Navigate with ${toolName}`;
    case "click":
      return selector ? `Click ${selector}` : `Click with ${toolName}`;
    case "input":
      return selector ? `Fill ${selector}` : text ? `Input ${truncate(text, 48)}` : `Input with ${toolName}`;
    case "capture":
      return selector ? `Capture ${selector}` : `Capture with ${toolName}`;
    case "extract":
      return selector ? `Extract ${selector}` : `Extract with ${toolName}`;
    case "verify":
      return selector ? `Verify ${selector}` : url ? `Verify ${url}` : `Verify with ${toolName}`;
    default:
      return `Run ${toolName}`;
  }
}

function appendReplayEntry(replay: BrowserActivity["replay"], input: { status: BrowserActivity["status"]; summary: string; createdAt: string }) {
  return [...replay, { id: crypto.randomUUID(), ...input }].slice(-64);
}

function summarizeValue(value: unknown) {
  if (typeof value === "string") {
    return truncate(value, 4000);
  }
  if (value === undefined) {
    return undefined;
  }
  try {
    return truncate(JSON.stringify(value), 4000);
  } catch {
    return truncate(String(value), 4000);
  }
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function asRecord(value: unknown) {
  return isRecord(value) ? value : undefined;
}


function readString(record: Record<string, unknown> | undefined, keys: string[]) {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}
