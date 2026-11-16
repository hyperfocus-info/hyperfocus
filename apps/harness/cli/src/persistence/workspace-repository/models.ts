import { resolveModeExecutionAccess } from "@hyperfocus/ai-core/modes";
import type { AgentRunState,AgentRunStatus,BackgroundJob,BackgroundJobRun,BackgroundJobRunStatus,BrowserSession,ChatAttachment,ChatMessage,ChatMessageMetadata,CorrectnessReview,ExecutionPlan,ExecutionToolActivity,MemoryEntry,MemorySummary,ModeDefinition,PlanningChoice,PlanningQuestion,ProjectId,RunPromptStats,ThreadBadgeState,ThreadId,TokenUsageTotals,WorkspaceRuleSource } from "@hyperfocus/ai-core/protocol";
import { browserSessionSchema,chatAttachmentSchema,chatMessageMetadataSchema,correctnessReviewSchema,executionPlanSchema,executionToolActivitySchema,intentContractSchema,memoryFreshnessSchema,planningChoiceSchema,planningQuestionIntentSchema,runFailureCategorySchema,tokenUsageTotalsSchema } from "@hyperfocus/ai-core/protocol";
import { isRecord as isPlainRecord } from "@hyperfocus/utilities/records";
import { createHash } from "node:crypto";
import { realpathSync,statSync } from "node:fs";
import path from "node:path";
import { createEmptyTokenUsageTotals } from "../../usage/token-usage";
import type { GeminiCachedContentRecord,GeminiCachedContentRow,MemoryEntryRow,ProjectModeRow,ProjectRow,ThreadRow,WorkspaceModeRow } from "./contracts";
import type { PersistedRecoveryContext } from "./persisted-values";
import { isRecord,normalizeComposerReasoningStrength,normalizeInteger,normalizeOptionalInteger,normalizeOptionalString,normalizeRequiredString,parseJsonArrayOrEmpty,parseJsonObjectOrUndefined,recordPersistenceRecovery,safeParsePersisted } from "./persisted-values";
export { addTokenUsageTotals,createEmptyTokenUsageTotals } from "../../usage/token-usage";

export function toModeDefinition(row: WorkspaceModeRow | ProjectModeRow, scope: "workspace" | "project"): ModeDefinition {
  return {
    id: row.id,
    scope,
    label: normalizeRequiredString(row.label, 64, "Recovered mode"),
    description: normalizeRequiredString(row.description, 256, "Recovered mode description"),
    plannerPrompt: normalizeRequiredString(row.planner_prompt, 4000, "Plan the task."),
    executionPrompt: normalizeRequiredString(row.execution_prompt, 4000, "Execute the task."),
    toolPolicy: row.tool_policy,
    executionAccess: resolveModeExecutionAccess({
      toolPolicy: row.tool_policy,
      executionAccess: row.execution_access ?? undefined
    }),
    planExecutionModeDefault: row.plan_execution_mode_default ?? undefined,
    subagentWorktreeStrategyDefault: row.subagent_worktree_strategy_default ?? undefined,
    correctnessIterationModeDefault: row.correctness_iteration_mode_default ?? undefined,
    updatedAt: normalizeRequiredString(row.updated_at, 256, new Date().toISOString())
  };
}

export function toProjectRuleSource(project: ProjectRow): WorkspaceRuleSource | undefined {
  if (!project.rules_content) {
    return undefined;
  }

  return {
    id: `${project.id}:rules`,
    scope: "project",
    label: normalizeRequiredString(`${project.name} rules`, 128, "Project rules"),
    content: normalizeRequiredString(project.rules_content, 32000, "Recovered rules"),
    updatedAt: normalizeRequiredString(project.rules_updated_at, 256, "unknown")
  };
}

export function toThreadMemorySummary(thread: ThreadRow): MemorySummary | undefined {
  if (!thread.memory_summary_content) {
    return undefined;
  }

  return {
    id: `${thread.id}:memory`,
    scope: "thread",
    label: "Thread memory",
    content: normalizeRequiredString(thread.memory_summary_content, 32000, "Recovered memory"),
    updatedAt: normalizeRequiredString(thread.memory_summary_updated_at, 256, "unknown"),
    source: "user"
  };
}

export function parsePlanningChoices(input: string | null): PlanningChoice[] {
  if (!input) {
    return createFallbackPlanningChoices("Provide answer");
  }

  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed) && parsed.length === 3) {
      const choices = parsed.map((choice, index) =>
        safeParsePersisted(
          planningChoiceSchema,
          choice,
          { table: "agent_run_questions", field: `choices_json[${index}]` },
          {
            fallbacks: {
              id: `choice-${index + 1}`,
              label: `Choice ${index + 1}`,
              description: "Recovered choice.",
              answerText: "Recovered answer."
            }
          }
        )
      );
      if (choices.every((choice): choice is PlanningChoice => choice !== undefined)) {
        const recommendedIndex = choices.findIndex((choice) => choice.recommended);
        return choices.map((choice, index) => ({ ...choice, recommended: recommendedIndex === -1 ? index === 0 : index === recommendedIndex }));
      }
    }
  } catch {
    return createFallbackPlanningChoices("Provide answer");
  }

  return createFallbackPlanningChoices("Provide answer");
}

export function parsePlanningQuestionIntent(input: string | null): PlanningQuestion["intent"] {
  if (!input) {
    return undefined;
  }

  try {
    return safeParsePersisted(planningQuestionIntentSchema, JSON.parse(input), {
      table: "agent_run_questions",
      field: "intent_json"
    });
  } catch {
    return undefined;
  }
}

export function parseChatMessageMetadata(input: string | null): ChatMessageMetadata | undefined {
  if (!input) {
    return undefined;
  }

  try {
    return safeParsePersisted(chatMessageMetadataSchema, JSON.parse(input), {
      table: "thread_messages",
      field: "metadata_json"
    });
  } catch {
    return undefined;
  }
}

export function parseChatAttachment(input: string | null, context: PersistedRecoveryContext): ChatAttachment | undefined {
  const parsed = parseJsonObjectOrUndefined(input);
  if (!parsed) {
    return undefined;
  }

  return safeParsePersisted(
    chatAttachmentSchema,
    {
      ...parsed,
      name: normalizeRequiredString(parsed.name, 256, "Recovered attachment"),
      mimeType: normalizeRequiredString(parsed.mimeType, 256, "application/octet-stream"),
      sizeBytes: normalizeInteger(parsed.sizeBytes, 1, 16777216, 1),
      key: normalizeRequiredString(parsed.key, 512, "recovered"),
      uploadedAt: normalizeRequiredString(parsed.uploadedAt, 256, new Date().toISOString())
    },
    context
  );
}

export function parseChatAttachments(input: string | null, context: PersistedRecoveryContext): ChatAttachment[] | undefined {
  if (!input) {
    return undefined;
  }

  const parsed = parseJsonArrayOrEmpty(input);
  const attachments = parsed
    .map((attachment, index) => {
      if (!isRecord(attachment)) {
        recordPersistenceRecovery(context, `invalid attachment at index ${index}`);
        return undefined;
      }
      const record = attachment;
      return safeParsePersisted(
        chatAttachmentSchema,
        {
          ...record,
          name: normalizeRequiredString(record.name, 256, "Recovered attachment"),
          mimeType: normalizeRequiredString(record.mimeType, 256, "application/octet-stream"),
          sizeBytes: normalizeInteger(record.sizeBytes, 1, 16777216, 1),
          key: normalizeRequiredString(record.key, 512, "recovered"),
          uploadedAt: normalizeRequiredString(record.uploadedAt, 256, new Date().toISOString())
        },
        { ...context, field: `${context.field ?? "attachments"}[${index}]` }
      );
    })
    .filter((attachment): attachment is ChatAttachment => attachment !== undefined)
    .slice(0, 8);

  if (attachments.length === 0) {
    return undefined;
  }
  return attachments;
}

export function parseAssistantTodoIds(input: string | null): string[] | undefined {
  if (!input) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").slice(0, 32) : [];
  } catch {
    return [];
  }
}

export function parseExecutionPlan(input: string | null): ExecutionPlan | undefined {
  if (!input) {
    return undefined;
  }

  try {
    return safeParsePersisted(executionPlanSchema, normalizePersistedExecutionPlan(JSON.parse(input)), {
      table: "agent_runs",
      field: "plan_json"
    });
  } catch {
    return undefined;
  }
}

export function parseCorrectnessReview(input: string | null): CorrectnessReview | undefined {
  if (!input) {
    return undefined;
  }

  try {
    return safeParsePersisted(correctnessReviewSchema, normalizePersistedCorrectnessReview(JSON.parse(input)), {
      table: "agent_runs",
      field: "correctness_review_json"
    });
  } catch {
    return undefined;
  }
}

export function normalizePersistedCorrectnessReview(input: unknown): unknown {
  if (!isPlainRecord(input)) {
    return input;
  }

  return {
    ...input,
    status: normalizeCorrectnessReviewStatus(input.status),
    gaps: Array.isArray(input.gaps) ? input.gaps.map(normalizePersistedCorrectnessGap) : input.gaps,
    recommendedPlan: normalizePersistedExecutionPlan(input.recommendedPlan)
  };
}

export function normalizePersistedCorrectnessGap(input: unknown): unknown {
  if (!isPlainRecord(input)) {
    return input;
  }

  return {
    ...input,
    category: normalizeCorrectnessGapCategory(input.category),
    severity: normalizeCorrectnessGapSeverity(input.severity)
  };
}

export function normalizePersistedExecutionPlan(input: unknown): unknown {
  if (!isPlainRecord(input)) {
    return input;
  }

  return {
    ...input,
    origin: normalizeExecutionPlanOrigin(input.origin),
    route: normalizeExecutionPlanRoute(input.route),
    subagentWorktreeStrategy: normalizeSubagentWorktreeStrategy(input.subagentWorktreeStrategy),
    gating: normalizeExecutionPlanGating(input.gating),
    prerequisites: Array.isArray(input.prerequisites) ? input.prerequisites.map(normalizePersistedPlanPrerequisite) : input.prerequisites,
    contracts: Array.isArray(input.contracts) ? input.contracts.map(normalizePersistedSubagentContract) : input.contracts,
    correctnessPolicy: normalizeCorrectnessIterationMode(input.correctnessPolicy)
  };
}

export function normalizePersistedPlanPrerequisite(input: unknown): unknown {
  if (!isPlainRecord(input)) {
    return input;
  }

  return {
    ...input,
    owner: normalizePersistedPrerequisiteOwner(input.owner),
    status: normalizePlanPrerequisiteStatus(input.status)
  };
}

export function normalizePersistedSubagentContract(input: unknown): unknown {
  if (!isPlainRecord(input)) {
    return input;
  }

  return {
    ...input,
    verificationScope: normalizePersistedVerificationScope(input.verificationScope)
  };
}

export function normalizeExecutionPlanGating(input: unknown): unknown {
  if (!isPlainRecord(input)) {
    return input;
  }

  return {
    ...input,
    mode: normalizePlanExecutionMode(input.mode)
  };
}


export function normalizeExecutionPlanOrigin(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (["initial", "quick-task", "correctness-followup"].includes(normalized)) {
    return normalized;
  }
  if (["followup", "correctness", "corrective", "correctness-follow-up"].includes(normalized)) {
    return "correctness-followup";
  }
  return value;
}

export function normalizeExecutionPlanRoute(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (normalized === "main" || ["single", "main-only", "executor"].includes(normalized)) {
    return "main";
  }
  if (normalized === "pi-subagents" || ["subagents", "pi-subagent", "parallel", "workers"].includes(normalized)) {
    return "pi-subagents";
  }
  return value;
}

export function normalizeSubagentWorktreeStrategy(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (normalized === "same-worktree" || ["same", "shared-worktree", "current-worktree"].includes(normalized)) {
    return "same-worktree";
  }
  if (normalized === "separate-worktrees" || ["separate", "isolated", "branchfs", "separate-worktree"].includes(normalized)) {
    return "separate-worktrees";
  }
  return value;
}

export function normalizePlanExecutionMode(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (normalized === "countdown" || normalized === "delay") {
    return "countdown";
  }
  if (normalized === "approve" || ["approval", "manual", "ask"].includes(normalized)) {
    return "approve";
  }
  if (normalized === "immediate" || ["auto", "run-now"].includes(normalized)) {
    return "immediate";
  }
  return value;
}

export function normalizeCorrectnessIterationMode(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (normalized === "ask-before-iterate" || ["manual", "ask", "ask-before"].includes(normalized)) {
    return "ask-before-iterate";
  }
  if (normalized === "auto-once" || ["auto", "once"].includes(normalized)) {
    return "auto-once";
  }
  if (normalized === "auto-until-clean" || ["until-clean", "auto-clean"].includes(normalized)) {
    return "auto-until-clean";
  }
  return value;
}

export function normalizePersistedPrerequisiteOwner(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (["main", "user", "human", "developer", "assistant", "executor", "agent"].includes(normalized)) {
    return "main";
  }
  if (["subagent", "sub-agent", "worker"].includes(normalized)) {
    return "subagent";
  }
  return value;
}

export function normalizePlanPrerequisiteStatus(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (normalized === "pending" || ["todo", "open", "waiting"].includes(normalized)) {
    return "pending";
  }
  if (normalized === "completed" || ["complete", "done", "finished"].includes(normalized)) {
    return "completed";
  }
  return value;
}

export function normalizePersistedVerificationScope(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (["full-app", "full", "full-worktree", "whole-app", "whole-project", "workspace", "project"].includes(normalized)) {
    return "worktree-full";
  }
  if (["owned", "owned-files", "files-only", "owned-files-only"].includes(normalized)) {
    return "owned-files-only";
  }
  return value;
}

export function normalizeCorrectnessReviewStatus(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (normalized === "pass" || ["passed", "ok", "clean"].includes(normalized)) {
    return "pass";
  }
  if (normalized === "needs-iteration" || ["fail", "failed", "needs-fix", "needs-work"].includes(normalized)) {
    return "needs-iteration";
  }
  return value;
}

export function normalizeCorrectnessGapCategory(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (normalized === "plan-gap" || ["planning", "plan"].includes(normalized)) {
    return "plan-gap";
  }
  if (normalized === "runnable-gap" || ["runtime", "runnable", "build", "smoke"].includes(normalized)) {
    return "runnable-gap";
  }
  if (normalized === "quality-gap" || ["quality", "product", "ux"].includes(normalized)) {
    return "quality-gap";
  }
  return value;
}

export function normalizeCorrectnessGapSeverity(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (["high", "critical", "blocker", "blocking"].includes(normalized)) {
    return "high";
  }
  if (["medium", "med", "moderate"].includes(normalized)) {
    return "medium";
  }
  if (["low", "minor"].includes(normalized)) {
    return "low";
  }
  return value;
}

export function buildRunRuntimeBudget(maxTurns: number, turnsUsed: number, reservedCurrentTurn: boolean) {
  const boundedMaxTurns = normalizeInteger(maxTurns, 1, 1000, 1);
  const boundedTurnsUsed = normalizeInteger(turnsUsed, 0, boundedMaxTurns, 0);
  const remainingTurns = Math.max(0, boundedMaxTurns - boundedTurnsUsed);
  const exhausted = remainingTurns === 0;
  return {
    maxTurns: boundedMaxTurns,
    turnsUsed: boundedTurnsUsed,
    currentTurn: reservedCurrentTurn ? boundedTurnsUsed : exhausted ? boundedTurnsUsed : boundedTurnsUsed + 1,
    remainingTurns,
    exhausted
  };
}

export function parseBrowserSessions(input: string | null): BrowserSession[] | undefined {
  if (!input) {
    return undefined;
  }

  const sessions = parseJsonArrayOrEmpty(input)
    .map((session, index) =>
      safeParsePersisted(browserSessionSchema, session, {
        table: "agent_runs",
        field: `browser_sessions_json[${index}]`
      })
    )
    .filter((session): session is BrowserSession => session !== undefined)
    .slice(0, 32);
  if (sessions.length === 0) {
    return undefined;
  }
  return sessions;
}

export function parseToolActivities(input: string | null): ExecutionToolActivity[] | undefined {
  if (!input) {
    return undefined;
  }

  const activities = parseJsonArrayOrEmpty(input)
    .map((activity, index) =>
      safeParsePersisted(executionToolActivitySchema, activity, {
        table: "agent_runs",
        field: `tool_activities_json[${index}]`
      })
    )
    .filter((activity): activity is ExecutionToolActivity => activity !== undefined)
    .slice(-512);
  if (activities.length === 0) {
    return undefined;
  }
  return activities;
}

export function normalizeTokenUsageTotals(input: unknown): TokenUsageTotals {
  const parsed = tokenUsageTotalsSchema.safeParse(input);
  return parsed.success ? { ...parsed.data, totalTokensIncludingCached: parsed.data.totalProcessedTokens } : createEmptyTokenUsageTotals();
}

export function parseIntentContract(input: string | null) {
  const parsed = parseJsonObjectOrUndefined(input);
  if (!parsed) {
    return undefined;
  }
  return safeParsePersisted(intentContractSchema, parsed, {
    table: "intent_contract",
    rowId: "inline"
  });
}

export function parseBackgroundJobDefinition(kind: BackgroundJob["kind"], input: string | null) {
  const parsed = parseJsonObjectOrUndefined(input);
  const fallback =
    kind === "shell"
      ? {
          kind: "shell",
          executable: "echo",
          args: ["Recovered background job definition"],
          timeoutSeconds: 60
        }
      : {
          kind: "ai-routine",
          prompt: "Recovered background job prompt."
        };
  const value: Record<string, unknown> = parsed ?? fallback;
  if (value.kind !== kind) {
    value.kind = kind;
  }
  if (kind === "shell") {
    value.executable = normalizeRequiredString(value.executable, 1024, "echo");
    // Arguments are literal process inputs: whitespace and empty strings carry meaning.
    value.args = Array.isArray(value.args) ? value.args.filter((arg): arg is string => typeof arg === "string").slice(0, 64).map(arg => arg.slice(0, 4096)) : [];
    value.cwd = normalizeOptionalString(value.cwd, 4096);
    value.envRefs = parseUnknownStringArray(value.envRefs, 32, 128);
    value.timeoutSeconds = normalizeInteger(value.timeoutSeconds, 1, 86400, 60);
  } else {
    value.prompt = normalizeRequiredString(value.prompt, 32000, "Recovered background job prompt.");
    value.modeId = normalizeOptionalString(value.modeId, 128);
    value.executionModelId = normalizeOptionalString(value.executionModelId, 256);
    value.reasoningStrength = normalizeComposerReasoningStrength(value.reasoningStrength);
  }
  return value;
}

export function parseBackgroundJobSchedule(input: string | null, fallbackDate: string) {
  const parsed = parseJsonObjectOrUndefined(input);
  const value = parsed ?? {
    type: "interval",
    intervalSeconds: 60,
    nextRunAt: fallbackDate,
    sourceText: "recovered"
  };
  if (value.type === "one-off") {
    value.runAt = normalizeRequiredString(value.runAt, 256, fallbackDate);
    value.consumedAt = normalizeOptionalString(value.consumedAt, 256);
    value.sourceText = normalizeRequiredString(value.sourceText, 512, "recovered");
    return value;
  }
  if (value.type === "cron") {
    value.expression = normalizeRequiredString(value.expression, 256, "* * * * *");
    value.timezone = normalizeRequiredString(value.timezone, 128, "UTC");
    value.nextRunAt = normalizeRequiredString(value.nextRunAt, 256, fallbackDate);
    value.sourceText = normalizeRequiredString(value.sourceText, 512, "recovered");
    return value;
  }
  value.type = "interval";
  value.intervalSeconds = normalizeInteger(value.intervalSeconds, 60, 31536000, 60);
  value.nextRunAt = normalizeRequiredString(value.nextRunAt, 256, fallbackDate);
  value.sourceText = normalizeRequiredString(value.sourceText, 512, "recovered");
  return value;
}

export function parseStringArray(input: string | null, maxItems: number = Number.MAX_SAFE_INTEGER, maxItemLength: number = Number.MAX_SAFE_INTEGER) {
  if (!input) {
    return [];
  }

  try {
    const parsed = JSON.parse(input);
    return parseUnknownStringArray(parsed, maxItems, maxItemLength);
  } catch {
    return [];
  }
}

export function parseUnknownStringArray(input: unknown, maxItems: number, maxItemLength: number) {
  return Array.isArray(input)
    ? input
        .filter((value): value is string => typeof value === "string")
        .map((value) => normalizeRequiredString(value, maxItemLength, "Recovered"))
        .slice(0, maxItems)
    : [];
}

export function deriveMemoryFreshness(row: Pick<MemoryEntryRow, "updated_at" | "last_hit_at">): MemoryEntry["freshness"] {
  const reference = row.last_hit_at ?? row.updated_at;
  const ageMs = Date.now() - new Date(reference).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 1209600000) {
    return memoryFreshnessSchema.parse("fresh");
  }
  if (ageMs < 5184000000) {
    return memoryFreshnessSchema.parse("aging");
  }
  return memoryFreshnessSchema.parse("stale");
}

export function createFallbackPlanningChoices(placeholder: string): PlanningChoice[] {
  return [
    { id: "choice-1", label: "Use example", description: "Send example answer.", answerText: placeholder, recommended: true },
    { id: "choice-2", label: "Confirm", description: "Send short confirmation.", answerText: placeholder, recommended: false },
    { id: "choice-3", label: "Custom", description: "Type custom answer.", answerText: placeholder, recommended: false }
  ];
}

export function getThreadBadgeState(run?: Pick<AgentRunState, "status">): ThreadBadgeState {
  if (!run) {
    return "idle";
  }
  if (run.status === "failed" || run.status === "partial-complete") {
    return "error";
  }
  if (run.status === "awaiting-user-input") {
    return "needs-input";
  }
  if (run.status === "planning" || run.status === "ready") {
    return "planning";
  }
  if (run.status === "running-main" || run.status === "running-subagents" || run.status === "aggregating") {
    return "executing";
  }
  if (run.status === "completed") {
    return "done";
  }
  return "idle";
}

export function summarizeMessagePreview(content: string) {
  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length <= 80 ? compact : `${compact.slice(0, 77)}...`;
}

export function normalizeThreadTitle(title: string) {
  const normalized = title.replace(/\s+/g, " ").trim();
  if (!normalized) {
    throw new Error("Thread title is required");
  }

  return normalized.slice(0, 256);
}

export function toGeneratedThreadTitle(content: string | undefined, fallback: string) {
  if (!content) {
    return fallback;
  }

  const firstLine = content
    .split(/\n?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine ? normalizeThreadTitle(firstLine.slice(0, 256)) : fallback;
}

export function toForkableTranscriptMessage(message: ChatMessage): ChatMessage[] {
  if ((message.kind ?? "plain") !== "plain") {
    return [];
  }

  return [
    {
      ...message,
      kind: "plain",
      metadata: undefined
    }
  ];
}

export function mapAgentRunStatusToBackgroundRunStatus(status: AgentRunStatus): BackgroundJobRunStatus | undefined {
  switch (status) {
    case "completed":
      return "succeeded";
    case "partial-complete":
      return "partial-complete";
    case "failed":
      return "failed";
    case "stopped":
      return "cancelled";
    default:
      return undefined;
  }
}

export function isTerminalBackgroundJobRunStatus(status: BackgroundJobRunStatus) {
  return status === "succeeded" || status === "partial-complete" || status === "failed" || status === "cancelled" || status === "skipped";
}

export function isTerminalBackgroundJobRunEventStage(stage: string) {
  return stage === "done" || stage === "partial-complete" || stage === "failed" || stage === "cancelled" || stage === "skipped";
}

export function hasBackgroundRunActiveLeaseGrace(run: BackgroundJobRun, now: Date, startupGraceMs: number) {
  const leaseExpiresAt = Date.parse(run.controllerLeaseExpiresAt ?? "");
  return Number.isFinite(leaseExpiresAt) && leaseExpiresAt + startupGraceMs > now.getTime();
}

export function getBackgroundRunAgeMs(run: BackgroundJobRun, now: Date) {
  const startedAt = Date.parse(run.startedAt ?? run.queuedAt);
  if (!Number.isFinite(startedAt)) {
    return 0;
  }
  return Math.max(0, now.getTime() - startedAt);
}

export function getBackgroundRunLastProgressAgeMs(run: BackgroundJobRun, now: Date) {
  const timestamp = Date.parse(run.lastHeartbeatAt ?? run.updatedAt ?? run.startedAt ?? run.queuedAt);
  if (!Number.isFinite(timestamp)) {
    return 0;
  }
  return Math.max(0, now.getTime() - timestamp);
}

export function formatBackgroundRunTimeoutDetail(run: BackgroundJobRun, now: Date, reason: string) {
  const ageMs = getBackgroundRunAgeMs(run, now);
  const progressAgeMs = getBackgroundRunLastProgressAgeMs(run, now);
  return `${reason}; active ${Math.floor(ageMs / 1000)}s; last progress ${Math.floor(progressAgeMs / 1000)}s ago.`;
}

export function hashPromptText(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);

}

export function failUnknownRun(runId: string): never { throw new Error(`Unknown run: ${runId}`); }

export function buildRunPromptStats(input: {
  promptChars: number | null | undefined;
  promptHash: string | null | undefined;
  transcriptChars?: number | null | undefined;
  latestTaskChars?: number | null | undefined;
}): RunPromptStats | undefined {
  if (!input.promptHash || !Number.isFinite(input.promptChars ?? Number.NaN)) {
    return undefined;
  }

  return {
    promptChars: normalizeInteger(input.promptChars ?? 0, 0, 2_000_000, 0),
    promptHash: normalizeRequiredString(input.promptHash, 64, "recovered-prompt"),
    transcriptChars: normalizeOptionalInteger(input.transcriptChars ?? null, 0, 2_000_000),
    latestTaskChars: normalizeOptionalInteger(input.latestTaskChars ?? null, 0, 2_000_000)
  };
}

export function normalizeRunFailureCategory(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  return safeParsePersisted(runFailureCategorySchema, value, {
    table: "runtime",
    rowId: "failure-category"
  });
}

export function mapGeminiCachedContentRow(row: GeminiCachedContentRow): GeminiCachedContentRecord {
  return {
    projectId: row.project_id,
    modelId: row.model_id,
    attachmentSetHash: row.attachment_set_hash,
    cachedContentName: row.cached_content_name,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function resolveBackgroundBackoffUntil(now: Date, consecutiveFailureCount: number) {
  if (consecutiveFailureCount < 3) {
    return null;
  }

  const backoffMinutes =
    consecutiveFailureCount === 3
      ? 5
      : consecutiveFailureCount === 4
        ? 15
        : consecutiveFailureCount === 5
          ? 60
          : 360;
  return new Date(now.getTime() + backoffMinutes * 60_000).toISOString();
}

export function normalizeProjectRootPath(rootPath: string) {
  const trimmedPath = normalizeWindowsEscapedPath(rootPath.trim());
  if (!trimmedPath) {
    throw new Error("Project path is required");
  }

  if (!path.isAbsolute(trimmedPath)) {
    throw new Error("Project path must be absolute");
  }

  return realpathSync(trimmedPath);
}

export function normalizeWindowsEscapedPath(value: string) {
  if (/^[a-zA-Z]:\\\\/.test(value)) {
    return value.replace(/\\\\/g, "\\");
  }

  return value;
}

export function ensureDirectoryExists(rootPath: string) {
  const stats = statSync(rootPath, { throwIfNoEntry: false });
  if (!stats || !stats.isDirectory()) {
    throw new Error(`Project path is not a directory: ${rootPath}`);
  }
}

export type ThreadLoadError = Error & { threadId: ThreadId; cause: unknown };

export function createThreadLoadError(projectId: ProjectId, threadId: ThreadId, cause: unknown): ThreadLoadError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return Object.assign(new Error(`Failed to load thread ${threadId} for project ${projectId}: ${detail}`),
    { name: "ThreadLoadError", threadId, cause });
}

export function isThreadLoadError(error: unknown): error is ThreadLoadError {
  return error instanceof Error && error.name === "ThreadLoadError" && "threadId" in error && "cause" in error;
}

export { isRecord as isPlainRecord } from "@hyperfocus/utilities/records";
