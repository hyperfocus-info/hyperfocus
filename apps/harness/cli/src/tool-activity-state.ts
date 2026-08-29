import type { ExecutionToolActivity } from "@hyperfocus/ai-core/protocol";
import type { PiAgentExecutionEvent } from "./pi-agent-adapter";

type ToolOwner = ExecutionToolActivity["owner"];

export type ToolFailureKind =
  | "missing-path"
  | "missing-tool"
  | "bad-shell-quoting"
  | "search-no-match"
  | "command-failed";

type ToolActivityInput = {
  runId: string;
  owner: ToolOwner;
  subagentId?: string;
  event: Extract<PiAgentExecutionEvent, { type: "tool-start" | "tool-update" | "tool-end" }>;
  occurredAt?: string;
  rawArgsDebugArtifactPath?: string;
  rawResultDebugArtifactPath?: string;
};

const MAX_TOOL_ACTIVITIES = 512;
const PREVIEW_LENGTH = 4000;
const RAW_JSON_LENGTH = 65_536;
const RAW_JSON_RUN_BUDGET = 1_048_576;

export function recordToolStart(activities: ExecutionToolActivity[], input: ToolActivityInput) {
  const event = input.event;
  if (event.type !== "tool-start") {
    return activities;
  }

  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const existing = activities.find((activity) => activity.toolCallId === event.toolCallId);
  if (existing || !acceptsToolActivityEvent(activities, input)) {
    return activities;
  }

  return boundActivities([
    ...activities,
    {
      id: crypto.randomUUID(),
      runId: input.runId,
      owner: input.owner,
      subagentId: input.subagentId,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      category: classifyToolCategory(event.toolName),
      command: extractCommand(event.args),
      argsSummary: summarizeToolArgs(event.args),
      ...serializeRawJson(event.args, {
        activities,
        toolCallId: event.toolCallId,
        kind: "args"
      }),
      rawArgsDebugArtifactPath: input.rawArgsDebugArtifactPath,
      status: "running",
      startedAt: occurredAt,
      updatedAt: occurredAt
    }
  ]);
}

export function recordToolUpdate(activities: ExecutionToolActivity[], input: ToolActivityInput) {
  const event = input.event;
  if (event.type !== "tool-update") {
    return activities;
  }

  return updateActivity(activities, input, (activity, occurredAt) => ({
    ...activity,
    command: activity.command ?? extractCommand(event.args),
    argsSummary: activity.argsSummary ?? summarizeToolArgs(event.args),
    rawArgsDebugArtifactPath: input.rawArgsDebugArtifactPath ?? activity.rawArgsDebugArtifactPath,
    outputPreview: summarizeToolResult(event.partialResult) ?? activity.outputPreview,
    stdoutPreview: summarizeNamedOutput(event.partialResult, "stdout") ?? activity.stdoutPreview,
    stderrPreview: summarizeNamedOutput(event.partialResult, "stderr") ?? activity.stderrPreview,
      ...serializeRawJson(event.partialResult, {
        activities,
        toolCallId: event.toolCallId,
        kind: "result"
    }),
    rawResultDebugArtifactPath: input.rawResultDebugArtifactPath ?? activity.rawResultDebugArtifactPath,
    rawResultStatus: "partial",
    exitCode: extractExitCode(event.partialResult) ?? activity.exitCode,
    status: inferTimedOut(event.partialResult) ? "timed-out" : activity.status,
    updatedAt: occurredAt
  }));
}

export function recordToolEnd(activities: ExecutionToolActivity[], input: ToolActivityInput) {
  const event = input.event;
  if (event.type !== "tool-end") {
    return activities;
  }

  return updateActivity(activities, input, (activity, occurredAt) => ({
    ...activity,
    command: activity.command ?? extractCommand(event.result),
    outputPreview: summarizeToolResult(event.result) ?? activity.outputPreview,
    stdoutPreview: summarizeNamedOutput(event.result, "stdout") ?? activity.stdoutPreview,
    stderrPreview: summarizeNamedOutput(event.result, "stderr") ?? activity.stderrPreview,
    ...serializeRawJson(event.result, {
      activities,
      toolCallId: event.toolCallId,
      kind: "result"
    }),
    rawResultDebugArtifactPath: input.rawResultDebugArtifactPath ?? activity.rawResultDebugArtifactPath,
    rawResultStatus: "final",
    exitCode: extractExitCode(event.result) ?? activity.exitCode,
    status: inferTimedOut(event.result) ? "timed-out" : event.isError ? "failed" : "completed",
    completedAt: occurredAt,
    updatedAt: occurredAt
  }));
}

export function summarizeToolArgs(value: unknown) {
  if (!value || typeof value !== "object") {
    return summarizeValue(value);
  }

  return summarizeValue(Reflect.get(value, "command") ?? value);
}

export function summarizeToolResult(value: unknown) {
  if (!value || typeof value !== "object") {
    return summarizeValue(value);
  }

  return summarizeValue(
    Reflect.get(value, "output") ??
      Reflect.get(value, "aggregated_output") ??
      Reflect.get(value, "stdout") ??
      Reflect.get(value, "stderr") ??
      Reflect.get(value, "error") ??
      Reflect.get(value, "message") ??
      value
  );
}

export function classifyToolCategory(toolName: string): ExecutionToolActivity["category"] {
  if (toolName === "shell" || /shell|command|terminal|powershell|cmd/i.test(toolName)) {
    return "shell";
  }
  if (/browser|playwright|puppeteer|chromium|chrome|webdriver/i.test(toolName)) {
    return "browser";
  }
  if (/web_search|search|fetch|open_url/i.test(toolName)) {
    return "web";
  }
  if (toolName.includes(".")) {
    return "mcp";
  }
  return "other";
}

export function formatToolFailureMilestone(activity: ExecutionToolActivity, ownerLabel: string) {
  const failureKind = classifyToolFailure(activity);
  const exit = activity.exitCode === undefined ? "" : ` (exit ${activity.exitCode})`;
  const cause = firstUsefulSentence(activity.outputPreview ?? activity.stderrPreview ?? activity.stdoutPreview);
  if (failureKind === "missing-path") {
    return `${ownerLabel}: ${activity.toolName} failed: missing path${cause ? `: ${cause}` : ""}.`;
  }
  if (failureKind === "missing-tool") {
    return `${ownerLabel}: ${activity.toolName} failed: missing tool${cause ? `: ${cause}` : ""}.`;
  }
  if (failureKind === "bad-shell-quoting") {
    return `${ownerLabel}: ${activity.toolName} failed: bad shell quoting${cause ? `: ${cause}` : ""}.`;
  }
  if (failureKind === "search-no-match") {
    return `${ownerLabel}: ${activity.toolName} found no matches.`;
  }
  return `${ownerLabel}: ${activity.toolName} failed${exit}${cause ? `: ${cause}` : ""}.`;
}

export function classifyToolFailure(input: {
  toolName?: string;
  command?: string;
  outputPreview?: string;
  stdoutPreview?: string;
  stderrPreview?: string;
  exitCode?: number;
}) {
  const command = input.command ?? "";
  const output = [input.outputPreview, input.stderrPreview, input.stdoutPreview].filter(Boolean).join("\n");
  if (/\\?"'\$\\?"/.test(command) || /"'\$/.test(command) || command.includes("-g '\"!") || command.includes("'\"'!")) {
    return "bad-shell-quoting" as const;
  }
  if (/Cannot find path/i.test(output) || /rg:\s+.*IO error.*os error 2/i.test(output)) {
    return "missing-path" as const;
  }
  if (/not recognized as the name of a cmdlet/i.test(output)) {
    return "missing-tool" as const;
  }
  if ((input.toolName === "shell" || /rg(?:\.exe)?\b/i.test(command)) && input.exitCode === 1 && !output.trim()) {
    return "search-no-match" as const;
  }
  return "command-failed" as const;
}

export function isSubagentBlockedVerificationCommand(activity: ExecutionToolActivity) {
  if (activity.owner !== "subagent" || activity.category !== "shell") {
    return false;
  }

  const command = activity.command?.toLowerCase() ?? "";
  return /\bstart-process\b|\bpython(?:\.exe)?\s+-m\s+http\.server\b|\bplaywright\b|\bchromium\b|\bchrome\b|\bmsedge\b|\bvite\b.*\s--host\b/.test(
    command
  );
}

function updateActivity(
  activities: ExecutionToolActivity[],
  input: ToolActivityInput,
  updater: (activity: ExecutionToolActivity, occurredAt: string) => ExecutionToolActivity
) {
  const event = input.event;
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const existing = activities.find((activity) => activity.toolCallId === event.toolCallId);
  if (existing && !acceptsToolActivityEvent(activities, input)) {
    return activities;
  }
  const nextActivities = activities.length
    ? activities.map((activity) => (activity.toolCallId === event.toolCallId ? updater(activity, occurredAt) : activity))
    : activities;
  if (nextActivities.some((activity) => activity.toolCallId === event.toolCallId)) {
    return boundActivities(nextActivities);
  }

  return boundActivities(
    recordToolStart(activities, {
      ...input,
      event: {
        type: "tool-start",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: "args" in event ? event.args : undefined
      },
      occurredAt
    }).map((activity) => (activity.toolCallId === event.toolCallId ? updater(activity, occurredAt) : activity))
  );
}

export function acceptsToolActivityEvent(activities: ExecutionToolActivity[], input: ToolActivityInput) {
  const existing = activities.find((activity) => activity.toolCallId === input.event.toolCallId);
  if (!existing) return true;
  if (!matchesToolActivityIdentity(existing, input) || input.event.type === "tool-start") return false;
  return existing.status === "running";
}

function matchesToolActivityIdentity(activity: ExecutionToolActivity, input: ToolActivityInput) {
  return activity.runId === input.runId && activity.owner === input.owner && activity.subagentId === input.subagentId &&
    activity.toolName === input.event.toolName;
}

function extractCommand(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const command = Reflect.get(value, "command");
  return typeof command === "string" ? limit(command) : undefined;
}

function extractExitCode(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const exitCode = Reflect.get(value, "exitCode");
  const snakeCaseExitCode = Reflect.get(value, "exit_code");
  return typeof exitCode === "number"
    ? exitCode
    : typeof snakeCaseExitCode === "number"
      ? snakeCaseExitCode
      : undefined;
}

function inferTimedOut(value: unknown) {
  if (!value || typeof value !== "object") {
    return typeof value === "string" && /timeout|timed out/i.test(value);
  }

  return Reflect.get(value, "timedOut") === true || Reflect.get(value, "status") === "timed-out" || /timeout|timed out/i.test(summarizeValue(value) ?? "");
}

function summarizeNamedOutput(value: unknown, key: "stdout" | "stderr") {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const raw = Reflect.get(value, key);
  return typeof raw === "string" ? limit(raw.replace(/\s+/g, " ").trim()) : undefined;
}

function summarizeValue(value: unknown) {
  if (typeof value === "string") {
    return limit(value.replace(/\s+/g, " ").trim()) || undefined;
  }
  if (value === undefined || value === null) {
    return undefined;
  }
  return limit(JSON.stringify(value).replace(/\s+/g, " ").trim()) || undefined;
}

type RawJsonSerializeOptions = {
  activities: ExecutionToolActivity[];
  toolCallId: string;
  kind: "args" | "result";
};

type RawJsonFields = Partial<Pick<ExecutionToolActivity,
  "rawArgsJson" | "rawArgsTruncated" | "rawArgsRedacted" | "rawArgsOmittedReason" |
  "rawResultJson" | "rawResultTruncated" | "rawResultRedacted" | "rawResultOmittedReason"
>>;

function serializeRawJson(value: unknown, options: RawJsonSerializeOptions): RawJsonFields {
  const sanitized = sanitizeRawToolPayload(value);
  const serialized = stableStringify(sanitized.value);
  if (!serialized) {
    return rawJsonOmission(options.kind, "unserializable");
  }

  const truncated = serialized.length > RAW_JSON_LENGTH;
  const nextValue = truncated ? serialized.slice(0, RAW_JSON_LENGTH) : serialized;
  const currentRawBytes = getCurrentRawJsonBytes(options.activities, options.toolCallId);
  if (currentRawBytes + nextValue.length > RAW_JSON_RUN_BUDGET) {
    return rawJsonOmission(options.kind, "run-budget-exceeded", sanitized.redacted);
  }

  return options.kind === "args"
    ? { rawArgsJson: nextValue, rawArgsTruncated: truncated, rawArgsRedacted: sanitized.redacted }
    : { rawResultJson: nextValue, rawResultTruncated: truncated, rawResultRedacted: sanitized.redacted };
}

function rawJsonOmission(kind: "args" | "result", reason: "unserializable" | "run-budget-exceeded", redacted?: boolean): RawJsonFields {
  if (reason === "unserializable") {
    return kind === "args" ? { rawArgsOmittedReason: reason } : { rawResultOmittedReason: reason };
  }
  return kind === "args"
    ? { rawArgsOmittedReason: reason, rawArgsRedacted: redacted ?? false }
    : { rawResultOmittedReason: reason, rawResultRedacted: redacted ?? false };
}

function getCurrentRawJsonBytes(activities: ExecutionToolActivity[], replacingToolCallId: string) {
  return activities.reduce((total, activity) => {
    if (activity.toolCallId === replacingToolCallId) {
      return total;
    }
    return total + (activity.rawArgsJson?.length ?? 0) + (activity.rawResultJson?.length ?? 0);
  }, 0);
}

function sanitizeRawToolPayload(value: unknown): { value: unknown; redacted: boolean } {
  const seen = new WeakSet<object>();
  let redacted = false;

  const sanitize = (entry: unknown): unknown => {
    if (typeof entry === "string") {
      const next = redactSensitiveString(entry);
      if (next !== entry) {
        redacted = true;
      }
      return next;
    }
    if (Array.isArray(entry)) {
      return entry.map(sanitize);
    }
    if (!entry || typeof entry !== "object") {
      return entry;
    }
    if (seen.has(entry)) {
      redacted = true;
      return "[redacted:circular]";
    }
    seen.add(entry);

    return Object.fromEntries(
      Object.entries(entry).map(([key, child]) => {
        if (isSensitiveKey(key)) {
          redacted = true;
          return [key, "[redacted]"];
        }
        return [key, sanitize(child)];
      })
    );
  };

  return { value: sanitize(value), redacted };
}

function isSensitiveKey(key: string) {
  return /^(?:authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|token|secret|password|passwd|private[-_]?key|client[-_]?secret)$/i.test(key);
}

function redactSensitiveString(value: string) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/g, "Bearer [redacted]")
    .replace(/\b(?:sk|rk|pk|ghp|github_pat|glpat|xox[baprs])_[A-Za-z0-9_=-]{12,}\b/g, "[redacted-token]")
    .replace(/\b[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, "[redacted-jwt]");
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(sortJsonValue(value)) ?? String(value);
  } catch {
    return String(value);
  }
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortJsonValue(entry)])
  );
}

function firstUsefulSentence(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const compact = value.replace(/\s+/g, " ").trim();
  const sentence = compact.split(/(?<=[.!?])\s+/, 1)[0] ?? compact;
  return sentence.replace(/[.]+$/, "").slice(0, 220);
}

function limit(value: string) {
  return value.slice(0, PREVIEW_LENGTH);
}

function boundActivities(activities: ExecutionToolActivity[]) {
  return activities.slice(-MAX_TOOL_ACTIVITIES);
}
