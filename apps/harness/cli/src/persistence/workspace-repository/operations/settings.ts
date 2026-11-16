import { codexLimitsSchema, usageSourceSchema, type CodexLimits, type UsageSource } from "@hyperfocus/ai-core/protocol";
import { z } from "zod";
import type { BackgroundJobApprovalPolicy, CorrectnessIterationMode, ExecutionControlState, ModeDefinition, PlanExecutionMode, ProjectId, ProviderBrand, RunModelPreference, SubagentWorktreeStrategy, TokenUsageState, TokenUsageTotals, WorkspaceProjectState, WorkspaceState } from "@hyperfocus/ai-core/protocol";
import type { GeminiCachedContentRow, PersistedTerminalState, WorkspaceRepositoryContext } from "../contracts";
import type { WorkspaceMigrationSupportOperationsSet } from "./migration-support";
import type { WorkspaceProjectReadsOperations2Set, WorkspaceProjectReadsOperations3Set, WorkspaceProjectReadsOperationsSet } from "./project-reads";
import type { WorkspaceProjectsOperations4Set } from "./projects";
import type { WorkspaceRepositoryReadsOperationsSet } from "./repository-reads";
import { ASSISTANT_AUTO_APPROVE_NON_BLOCKING_QUESTIONS_DEFAULT_KEY, AUTO_ARCHIVE_COMPLETED_THREADS_DEFAULT_KEY, AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT_DEFAULT_KEY, BACKGROUND_JOB_APPROVAL_POLICY_DEFAULT_KEY, BLOCK_CHAT_ON_DIRTY_GIT_DEFAULT_KEY, CHECK_CLI_UPDATES_DEFAULT_KEY, CORRECTNESS_ITERATION_MODE_DEFAULT_KEY, DEBUG_ENABLED_KEY, DIRTY_GIT_CHANGE_LIMIT_DEFAULT_KEY, GLOBAL_EXECUTION_PAUSED_KEY, MEMORY_BANK_ENABLED_DEFAULT_KEY, MEMORY_BANK_RECORD_RUNS_DEFAULT_KEY, PLAN_EXECUTION_DELAY_SECONDS_DEFAULT_KEY, PLAN_EXECUTION_MODE_DEFAULT_KEY, PROVIDER_BRAND_KEY, SINGLE_AGENT_MODEL_PREFERENCE_DEFAULT_KEY, SUBAGENT_MODEL_PREFERENCE_DEFAULT_KEY, SUBAGENT_WORKTREE_STRATEGY_DEFAULT_KEY, TERMINAL_STATE_KEY, TOKEN_USAGE_LIFETIME_KEY, TOKEN_USAGE_RESET_AT_KEY, TRACE_PANEL_DEFAULT_OPEN_KEY, WORKSPACE_MEMORY_CONTENT_KEY, WORKSPACE_MEMORY_UPDATED_AT_KEY, WORKSPACE_RULES_CONTENT_KEY, WORKSPACE_RULES_UPDATED_AT_KEY } from "../contracts";
import { addTokenUsageTotals, createEmptyTokenUsageTotals, mapGeminiCachedContentRow, normalizeTokenUsageTotals, parseBrowserSessions } from "../models";
import { isRecord } from "../persisted-values";
import { terminalPaneLayoutSchema, terminalPreferencesSchema, terminalSessionSchema } from "@hyperfocus/ai-core/protocol";

export function createWorkspaceSettingsOperations(context: WorkspaceRepositoryContext) {
  const { providerCredentialStore, db } = context;
  function getStoredOpenAiApiKey() {
      return providerCredentialStore.get("openai");
    }
  function getStoredGoogleApiKey() {
      return providerCredentialStore.get("google");
    }
  function getStoredAnthropicApiKey() {
      return providerCredentialStore.get("anthropic");
    }
  function setStoredOpenAiApiKey(apiKey: string) {
      const normalizedKey = apiKey.trim();
      if (!normalizedKey) {
        throw new Error("OpenAI API key is required");
      }
  
      providerCredentialStore.set("openai", normalizedKey);
    }
  function clearStoredOpenAiApiKey() {
      providerCredentialStore.delete("openai");
    }
  function setStoredGoogleApiKey(apiKey: string) {
      const normalizedKey = apiKey.trim();
      if (!normalizedKey) {
        throw new Error("Google API key is required");
      }
  
      providerCredentialStore.set("google", normalizedKey);
    }
  function clearStoredGoogleApiKey() {
      providerCredentialStore.delete("google");
    }
  function setStoredAnthropicApiKey(apiKey: string) {
      const normalizedKey = apiKey.trim();
      if (!normalizedKey) {
        throw new Error("Anthropic API key is required");
      }
  
      providerCredentialStore.set("anthropic", normalizedKey);
    }
  function clearStoredAnthropicApiKey() {
      providerCredentialStore.delete("anthropic");
    }
  function getGeminiCachedContent(input: { projectId: ProjectId; modelId: string; attachmentSetHash: string }) {
      const row = db
        .query<GeminiCachedContentRow, [string, string, string]>(
          `SELECT project_id, model_id, attachment_set_hash, cached_content_name, expires_at, created_at, updated_at
           FROM gemini_cached_contents
           WHERE project_id = ?1 AND model_id = ?2 AND attachment_set_hash = ?3`
        )
        .get(input.projectId, input.modelId, input.attachmentSetHash);
      return row ? mapGeminiCachedContentRow(row) : undefined;
    }
  function saveGeminiCachedContent(input: {
      projectId: ProjectId;
      modelId: string;
      attachmentSetHash: string;
      cachedContentName: string;
      expiresAt: string;
      now: string;
    }) {
      db
        .query(
          `INSERT INTO gemini_cached_contents (
             project_id, model_id, attachment_set_hash, cached_content_name, expires_at, created_at, updated_at
           ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
           ON CONFLICT(project_id, model_id, attachment_set_hash) DO UPDATE SET
             cached_content_name = excluded.cached_content_name,
             expires_at = excluded.expires_at,
             updated_at = excluded.updated_at`
        )
        .run(input.projectId, input.modelId, input.attachmentSetHash, input.cachedContentName, input.expiresAt, input.now);
      return getGeminiCachedContent(input)!;
    }
  return {
    operations: {
      getStoredOpenAiApiKey,
      getStoredGoogleApiKey,
      getStoredAnthropicApiKey,
      setStoredOpenAiApiKey,
      clearStoredOpenAiApiKey,
      setStoredGoogleApiKey,
      clearStoredGoogleApiKey,
      setStoredAnthropicApiKey,
      clearStoredAnthropicApiKey,
      getGeminiCachedContent,
      saveGeminiCachedContent,
    },
    publicApi: {
      getStoredOpenAiApiKey,
      getStoredGoogleApiKey,
      getStoredAnthropicApiKey,
      setStoredOpenAiApiKey,
      clearStoredOpenAiApiKey,
      setStoredGoogleApiKey,
      clearStoredGoogleApiKey,
      setStoredAnthropicApiKey,
      clearStoredAnthropicApiKey,
      getGeminiCachedContent,
      saveGeminiCachedContent,
    },
  };
}

export type WorkspaceSettingsOperationsSet = ReturnType<typeof createWorkspaceSettingsOperations>["operations"];

export function createWorkspaceSettingsOperations2(context: WorkspaceRepositoryContext, operations: WorkspaceMigrationSupportOperationsSet) {
  let codexLimits: CodexLimits = { status: "unavailable", windows: [], reason: "Refresh to read Codex account usage." };
  function setCodexLimits(value: CodexLimits) { codexLimits = codexLimitsSchema.parse(value); }
  const observedKey = "token_usage_observations_v1";
  function readObserved(): { sources: UsageSource[]; observations: Record<string, true> } {
    const raw = operations.getWorkspaceMetaValue(observedKey);
    if (!raw) return { sources: [], observations: {} };
    return z.object({ sources: z.array(usageSourceSchema), observations: z.record(z.string(), z.literal(true)) }).parse(JSON.parse(raw));
  }
  function recordTokenUsage(delta: TokenUsageTotals, source: Omit<UsageSource, "totals">, observationId: string): TokenUsageTotals {
    return context.db.transaction(() => {
      const observed = readObserved();
      if (Object.hasOwn(observed.observations, observationId)) return createEmptyTokenUsageTotals();
      const identity = (value: Omit<UsageSource, "totals">) => JSON.stringify([value.projectId, value.threadId, value.sourceKind, value.sourceLabel, value.modelId, value.runtime]);
      const existing = observed.sources.find(value => identity(value) === identity(source));
      if (existing) existing.totals = addTokenUsageTotals(existing.totals, delta);
      else observed.sources.push(usageSourceSchema.parse({ ...source, totals: delta }));
      observed.observations[observationId] = true;
      addTokenUsageLifetime(delta);
      operations.setWorkspaceMetaValue(observedKey, JSON.stringify(observed));
      return delta;
    })();
  }
  function getTokenUsageLifetime(): TokenUsageTotals {
      const raw = operations.getWorkspaceMetaValue(TOKEN_USAGE_LIFETIME_KEY);
      if (!raw) {
        return createEmptyTokenUsageTotals();
      }
  
      try {
        return normalizeTokenUsageTotals(JSON.parse(raw));
      } catch {
        return createEmptyTokenUsageTotals();
      }
    }
  function getTokenUsageState(session: TokenUsageTotals): TokenUsageState {
      return {
        codexLimits,
        sources: readObserved().sources,
        session: normalizeTokenUsageTotals(session),
        lifetime: getTokenUsageLifetime(),
        resetAt: operations.getWorkspaceMetaValue(TOKEN_USAGE_RESET_AT_KEY)
      };
    }
  function addTokenUsageLifetime(delta: TokenUsageTotals): TokenUsageTotals {
      const next = addTokenUsageTotals(getTokenUsageLifetime(), delta);
      operations.setWorkspaceMetaValue(TOKEN_USAGE_LIFETIME_KEY, JSON.stringify(next));
      return next;
    }
  function resetTokenUsageLifetime(resetAt: string): TokenUsageTotals {
      return context.db.transaction(() => {
      const next = createEmptyTokenUsageTotals();
      const observed = readObserved();
      // Retain observation receipts so replay after reset cannot re-add old calls.
      operations.setWorkspaceMetaValue(observedKey, JSON.stringify({ ...observed, sources: [] }));
      operations.setWorkspaceMetaValue(TOKEN_USAGE_LIFETIME_KEY, JSON.stringify(next));
      operations.setWorkspaceMetaValue(TOKEN_USAGE_RESET_AT_KEY, resetAt);
      return next;
      })();
    }
  function getProviderBrand() {
      const value = operations.getWorkspaceMetaValue(PROVIDER_BRAND_KEY);
      if (value === "gemini" || value === "claude") {
        return value;
      }
      return "gpt";
    }
  function setProviderBrand(providerBrand: ProviderBrand) {
      operations.setWorkspaceMetaValue(PROVIDER_BRAND_KEY, providerBrand);
    }
  function getDebugEnabledDefault() {
      return operations.getWorkspaceMetaValue(DEBUG_ENABLED_KEY) === "true";
    }
  function setDebugEnabledDefault(debugEnabled: boolean) {
      operations.setWorkspaceMetaValue(DEBUG_ENABLED_KEY, String(debugEnabled));
    }
  function getTracePanelDefaultOpen() {
      const value = operations.getWorkspaceMetaValue(TRACE_PANEL_DEFAULT_OPEN_KEY);
      return value === undefined ? true : value === "true";
    }
  function setTracePanelDefaultOpen(tracePanelDefaultOpen: boolean) {
      operations.setWorkspaceMetaValue(TRACE_PANEL_DEFAULT_OPEN_KEY, String(tracePanelDefaultOpen));
    }
  function getSubagentWorktreeStrategyDefault(): SubagentWorktreeStrategy {
      return operations.getWorkspaceMetaValue(SUBAGENT_WORKTREE_STRATEGY_DEFAULT_KEY) === "separate-worktrees"
        ? "separate-worktrees"
        : "same-worktree";
    }
  function setSubagentWorktreeStrategyDefault(value: SubagentWorktreeStrategy) {
      operations.setWorkspaceMetaValue(SUBAGENT_WORKTREE_STRATEGY_DEFAULT_KEY, value);
    }
  function getBlockChatOnDirtyGitDefault() {
      const value = operations.getWorkspaceMetaValue(BLOCK_CHAT_ON_DIRTY_GIT_DEFAULT_KEY);
      return value === undefined ? true : value === "true";
    }
  function setBlockChatOnDirtyGitDefault(value: boolean) {
      operations.setWorkspaceMetaValue(BLOCK_CHAT_ON_DIRTY_GIT_DEFAULT_KEY, String(value));
    }
  function getDirtyGitChangeLimitDefault() {
      const value = Number(operations.getWorkspaceMetaValue(DIRTY_GIT_CHANGE_LIMIT_DEFAULT_KEY));
      return Number.isFinite(value) && value >= 0 ? Math.min(10000, Math.round(value)) : 20;
    }
  function setDirtyGitChangeLimitDefault(value: number) {
      operations.setWorkspaceMetaValue(DIRTY_GIT_CHANGE_LIMIT_DEFAULT_KEY, String(Math.max(0, Math.min(10000, Math.round(value)))));
    }
  function getAutoCompactContextThresholdPercentDefault() {
      const value = Number(operations.getWorkspaceMetaValue(AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT_DEFAULT_KEY));
      return Number.isFinite(value) ? Math.max(10, Math.min(95, Math.round(value))) : 40;
    }
  function setAutoCompactContextThresholdPercentDefault(value: number) {
      operations.setWorkspaceMetaValue(
        AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT_DEFAULT_KEY,
        String(Math.max(10, Math.min(95, Math.round(value))))
      );
    }
  function getPlanExecutionModeDefault(): PlanExecutionMode {
      const value = operations.getWorkspaceMetaValue(PLAN_EXECUTION_MODE_DEFAULT_KEY);
      return value === "approve" || value === "immediate" ? value : "countdown";
    }
  function getConfiguredPlanExecutionModeDefault(): PlanExecutionMode | undefined {
      const value = operations.getWorkspaceMetaValue(PLAN_EXECUTION_MODE_DEFAULT_KEY);
      return value === "countdown" || value === "approve" || value === "immediate" ? value : undefined;
    }
  function setPlanExecutionModeDefault(value: PlanExecutionMode) {
      operations.setWorkspaceMetaValue(PLAN_EXECUTION_MODE_DEFAULT_KEY, value);
    }
  function getPlanExecutionDelaySecondsDefault() {
      const value = Number(operations.getWorkspaceMetaValue(PLAN_EXECUTION_DELAY_SECONDS_DEFAULT_KEY));
      return Number.isFinite(value) && value >= 0 ? Math.min(300, Math.round(value)) : 10;
    }
  function setPlanExecutionDelaySecondsDefault(value: number) {
      operations.setWorkspaceMetaValue(PLAN_EXECUTION_DELAY_SECONDS_DEFAULT_KEY, String(Math.max(0, Math.min(300, Math.round(value)))));
    }
  function getSingleAgentModelPreferenceDefault(): RunModelPreference {
      return operations.getWorkspaceMetaValue(SINGLE_AGENT_MODEL_PREFERENCE_DEFAULT_KEY) === "inference"
        ? "inference"
        : "intelligence";
    }
  function setSingleAgentModelPreferenceDefault(value: RunModelPreference) {
      operations.setWorkspaceMetaValue(SINGLE_AGENT_MODEL_PREFERENCE_DEFAULT_KEY, value);
    }
  function getSubagentModelPreferenceDefault(): RunModelPreference {
      return operations.getWorkspaceMetaValue(SUBAGENT_MODEL_PREFERENCE_DEFAULT_KEY) === "intelligence"
        ? "intelligence"
        : "inference";
    }
  function setSubagentModelPreferenceDefault(value: RunModelPreference) {
      operations.setWorkspaceMetaValue(SUBAGENT_MODEL_PREFERENCE_DEFAULT_KEY, value);
    }
  return {
    operations: {
      setCodexLimits,
      recordTokenUsage,
      getTokenUsageLifetime,
      getTokenUsageState,
      addTokenUsageLifetime,
      resetTokenUsageLifetime,
      getProviderBrand,
      setProviderBrand,
      getDebugEnabledDefault,
      setDebugEnabledDefault,
      getTracePanelDefaultOpen,
      setTracePanelDefaultOpen,
      getSubagentWorktreeStrategyDefault,
      setSubagentWorktreeStrategyDefault,
      getBlockChatOnDirtyGitDefault,
      setBlockChatOnDirtyGitDefault,
      getDirtyGitChangeLimitDefault,
      setDirtyGitChangeLimitDefault,
      getAutoCompactContextThresholdPercentDefault,
      setAutoCompactContextThresholdPercentDefault,
      getPlanExecutionModeDefault,
      getConfiguredPlanExecutionModeDefault,
      setPlanExecutionModeDefault,
      getPlanExecutionDelaySecondsDefault,
      setPlanExecutionDelaySecondsDefault,
      getSingleAgentModelPreferenceDefault,
      setSingleAgentModelPreferenceDefault,
      getSubagentModelPreferenceDefault,
      setSubagentModelPreferenceDefault,
    },
    publicApi: {
      setCodexLimits,
      recordTokenUsage,
      getTokenUsageLifetime,
      getTokenUsageState,
      addTokenUsageLifetime,
      resetTokenUsageLifetime,
      getProviderBrand,
      setProviderBrand,
      getDebugEnabledDefault,
      setDebugEnabledDefault,
      getTracePanelDefaultOpen,
      setTracePanelDefaultOpen,
      getSubagentWorktreeStrategyDefault,
      setSubagentWorktreeStrategyDefault,
      getBlockChatOnDirtyGitDefault,
      setBlockChatOnDirtyGitDefault,
      getDirtyGitChangeLimitDefault,
      setDirtyGitChangeLimitDefault,
      getAutoCompactContextThresholdPercentDefault,
      setAutoCompactContextThresholdPercentDefault,
      getPlanExecutionModeDefault,
      getConfiguredPlanExecutionModeDefault,
      setPlanExecutionModeDefault,
      getPlanExecutionDelaySecondsDefault,
      setPlanExecutionDelaySecondsDefault,
      getSingleAgentModelPreferenceDefault,
      setSingleAgentModelPreferenceDefault,
      getSubagentModelPreferenceDefault,
      setSubagentModelPreferenceDefault,
    },
  };
}

export type WorkspaceSettingsOperations2Set = ReturnType<typeof createWorkspaceSettingsOperations2>["operations"];

export function createWorkspaceSettingsOperations3(context: WorkspaceRepositoryContext, operations: WorkspaceMigrationSupportOperationsSet) {
  function getCorrectnessIterationModeDefault(): CorrectnessIterationMode {
      const value = operations.getWorkspaceMetaValue(CORRECTNESS_ITERATION_MODE_DEFAULT_KEY);
      if (value === "auto-once" || value === "auto-until-clean") {
        return value;
      }
  
      return "ask-before-iterate";
    }
  function setCorrectnessIterationModeDefault(value: CorrectnessIterationMode) {
      operations.setWorkspaceMetaValue(CORRECTNESS_ITERATION_MODE_DEFAULT_KEY, value);
    }
  function getBackgroundJobApprovalPolicyDefault(): BackgroundJobApprovalPolicy {
      const value = operations.getWorkspaceMetaValue(BACKGROUND_JOB_APPROVAL_POLICY_DEFAULT_KEY);
      if (value === "allow-all" || value === "allow-safe" || value === "ask-risky" || value === "always-ask") {
        return value;
      }
  
      return "ask-risky";
    }
  function setBackgroundJobApprovalPolicyDefault(value: BackgroundJobApprovalPolicy) {
      operations.setWorkspaceMetaValue(BACKGROUND_JOB_APPROVAL_POLICY_DEFAULT_KEY, value);
    }
  function getAssistantAutoApproveNonBlockingQuestionsDefault() {
      return operations.getWorkspaceMetaValue(ASSISTANT_AUTO_APPROVE_NON_BLOCKING_QUESTIONS_DEFAULT_KEY) !== "false";
    }
  function setAssistantAutoApproveNonBlockingQuestionsDefault(value: boolean) {
      operations.setWorkspaceMetaValue(ASSISTANT_AUTO_APPROVE_NON_BLOCKING_QUESTIONS_DEFAULT_KEY, String(value));
    }
  function getAutoArchiveCompletedThreadsDefault() {
      return operations.getWorkspaceMetaValue(AUTO_ARCHIVE_COMPLETED_THREADS_DEFAULT_KEY) === "true";
    }
  function setAutoArchiveCompletedThreadsDefault(value: boolean) {
      operations.setWorkspaceMetaValue(AUTO_ARCHIVE_COMPLETED_THREADS_DEFAULT_KEY, String(value));
    }
  function getMemoryBankEnabledDefault() {
      const value = operations.getWorkspaceMetaValue(MEMORY_BANK_ENABLED_DEFAULT_KEY);
      return value === undefined ? true : value === "true";
    }
  function setMemoryBankEnabledDefault(value: boolean) {
      operations.setWorkspaceMetaValue(MEMORY_BANK_ENABLED_DEFAULT_KEY, String(value));
    }
  function getMemoryBankRecordRunsDefault() {
      const value = operations.getWorkspaceMetaValue(MEMORY_BANK_RECORD_RUNS_DEFAULT_KEY);
      return value === "true";
    }
  function setMemoryBankRecordRunsDefault(value: boolean) {
      operations.setWorkspaceMetaValue(MEMORY_BANK_RECORD_RUNS_DEFAULT_KEY, String(value));
    }
  function getCheckCliUpdatesDefault() {
      const value = operations.getWorkspaceMetaValue(CHECK_CLI_UPDATES_DEFAULT_KEY);
      return value === undefined ? true : value === "true";
    }
  function setCheckCliUpdatesDefault(value: boolean) {
      operations.setWorkspaceMetaValue(CHECK_CLI_UPDATES_DEFAULT_KEY, String(value));
    }
  function getTerminalState(): PersistedTerminalState {
      const defaults: PersistedTerminalState = {
        sessions: [],
        scrollbackBySessionId: {},
        preferences: terminalPreferencesSchema.parse({})
      };
      const raw = operations.getWorkspaceMetaValue(TERMINAL_STATE_KEY);
      if (!raw) {
        return defaults;
      }
  
      try {
        const parsed: unknown = JSON.parse(raw); if (!isRecord(parsed)) return defaults;
        const layoutResult = parsed.layout ? terminalPaneLayoutSchema.safeParse(parsed.layout) : undefined;
        return {
          sessions: Array.isArray(parsed.sessions)
            ? parsed.sessions
                .map((session) => terminalSessionSchema.safeParse(session))
                .filter((result) => result.success)
                .map((result) => ({
                  ...result.data,
                  status: result.data.status === "running" || result.data.status === "starting" ? "stopped" : result.data.status,
                  serverRestarted: result.data.status === "running" || result.data.status === "starting" ? true : result.data.serverRestarted
                }))
                .slice(0, 64)
            : [],
          scrollbackBySessionId: isRecord(parsed.scrollbackBySessionId)
            ? Object.fromEntries(
                Object.entries(parsed.scrollbackBySessionId).filter(
                  (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string"
                )
              )
            : {},
          preferences: terminalPreferencesSchema.catch(defaults.preferences).parse(parsed.preferences),
          layout: layoutResult?.success ? layoutResult.data : undefined
        };
      } catch {
        return defaults;
      }
    }
  function setTerminalState(state: PersistedTerminalState) {
      const safeState: PersistedTerminalState = {
        sessions: state.sessions.map((session) => terminalSessionSchema.parse(session)).slice(0, 64),
        scrollbackBySessionId: state.scrollbackBySessionId,
        preferences: terminalPreferencesSchema.parse(state.preferences),
        layout: state.layout ? terminalPaneLayoutSchema.parse(state.layout) : undefined
      };
      operations.setWorkspaceMetaValue(TERMINAL_STATE_KEY, JSON.stringify(safeState));
    }
  function getGlobalExecutionPaused() {
      return operations.getWorkspaceMetaValue(GLOBAL_EXECUTION_PAUSED_KEY) === "true";
    }
  function setGlobalExecutionPaused(isPaused: boolean) {
      operations.setWorkspaceMetaValue(GLOBAL_EXECUTION_PAUSED_KEY, String(isPaused));
    }
  return {
    operations: {
      getCorrectnessIterationModeDefault,
      setCorrectnessIterationModeDefault,
      getBackgroundJobApprovalPolicyDefault,
      setBackgroundJobApprovalPolicyDefault,
      getAssistantAutoApproveNonBlockingQuestionsDefault,
      setAssistantAutoApproveNonBlockingQuestionsDefault,
      getAutoArchiveCompletedThreadsDefault,
      setAutoArchiveCompletedThreadsDefault,
      getMemoryBankEnabledDefault,
      setMemoryBankEnabledDefault,
      getMemoryBankRecordRunsDefault,
      setMemoryBankRecordRunsDefault,
      getCheckCliUpdatesDefault,
      setCheckCliUpdatesDefault,
      getTerminalState,
      setTerminalState,
      getGlobalExecutionPaused,
      setGlobalExecutionPaused,
    },
    publicApi: {
      getCorrectnessIterationModeDefault,
      setCorrectnessIterationModeDefault,
      getBackgroundJobApprovalPolicyDefault,
      setBackgroundJobApprovalPolicyDefault,
      getAssistantAutoApproveNonBlockingQuestionsDefault,
      setAssistantAutoApproveNonBlockingQuestionsDefault,
      getAutoArchiveCompletedThreadsDefault,
      setAutoArchiveCompletedThreadsDefault,
      getMemoryBankEnabledDefault,
      setMemoryBankEnabledDefault,
      getMemoryBankRecordRunsDefault,
      setMemoryBankRecordRunsDefault,
      getCheckCliUpdatesDefault,
      setCheckCliUpdatesDefault,
      getTerminalState,
      setTerminalState,
      getGlobalExecutionPaused,
      setGlobalExecutionPaused,
    },
  };
}

export type WorkspaceSettingsOperations3Set = ReturnType<typeof createWorkspaceSettingsOperations3>["operations"];

export function createWorkspaceSettingsOperations4(context: WorkspaceRepositoryContext, operations: WorkspaceSettingsOperations3Set) {
  const { db } = context;
  function getExecutionControlState(): ExecutionControlState {
      const deferredPlanningQuestionCount =
        db
          .query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM agent_run_questions WHERE status = 'deferred'`)
          .get()?.count ?? 0;
      const deferredAssistantQuestionCount =
        db
          .query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM assistant_questions WHERE status = 'deferred'`)
          .get()?.count ?? 0;
      const deferredBrowserApprovalCount =
        db
          .query<{ browser_sessions_json: string | null }, []>(
            `SELECT browser_sessions_json
             FROM agent_runs
             WHERE browser_sessions_json IS NOT NULL`
          )
          .all()
          .reduce(
            (count, row) =>
              count +
              (parseBrowserSessions(row.browser_sessions_json) ?? [])
                .flatMap((session) => session.activities)
                .filter((activity) => activity.approval?.status === "deferred").length,
            0
          );
  
      return {
        isPaused: operations.getGlobalExecutionPaused(),
        deferredPlanningQuestionCount,
        deferredAssistantQuestionCount,
        deferredBrowserApprovalCount
      };
    }
  return {
    operations: {
      getExecutionControlState,
    },
    publicApi: {
      getExecutionControlState,
    },
  };
}

export type WorkspaceSettingsOperations4Set = ReturnType<typeof createWorkspaceSettingsOperations4>["operations"];

export function createWorkspaceSettingsOperations5(context: WorkspaceRepositoryContext, operations: WorkspaceProjectReadsOperations2Set) {
  function getWorkspaceRuleSource() {
      return operations.readWorkspaceRuleSource();
    }
  return {
    operations: {
      getWorkspaceRuleSource,
    },
    publicApi: {
      getWorkspaceRuleSource,
    },
  };
}

export type WorkspaceSettingsOperations5Set = ReturnType<typeof createWorkspaceSettingsOperations5>["operations"];

export function createWorkspaceSettingsOperations6(context: WorkspaceRepositoryContext, operations: WorkspaceProjectReadsOperationsSet & WorkspaceRepositoryReadsOperationsSet & WorkspaceMigrationSupportOperationsSet & WorkspaceProjectReadsOperations3Set & WorkspaceProjectsOperations4Set) {
  const { db } = context;
  function saveWorkspaceContext(input: { rulesContent?: string; memorySummaryContent?: string }) {
      const now = new Date().toISOString();
      if (input.rulesContent?.trim()) {
        operations.setWorkspaceMetaValue(WORKSPACE_RULES_CONTENT_KEY, input.rulesContent.trim());
        operations.setWorkspaceMetaValue(WORKSPACE_RULES_UPDATED_AT_KEY, now);
      } else {
        operations.deleteWorkspaceMetaValue(WORKSPACE_RULES_CONTENT_KEY);
        operations.deleteWorkspaceMetaValue(WORKSPACE_RULES_UPDATED_AT_KEY);
      }
  
      if (input.memorySummaryContent?.trim()) {
        operations.setWorkspaceMetaValue(WORKSPACE_MEMORY_CONTENT_KEY, input.memorySummaryContent.trim());
        operations.setWorkspaceMetaValue(WORKSPACE_MEMORY_UPDATED_AT_KEY, now);
      } else {
        operations.deleteWorkspaceMetaValue(WORKSPACE_MEMORY_CONTENT_KEY);
        operations.deleteWorkspaceMetaValue(WORKSPACE_MEMORY_UPDATED_AT_KEY);
      }
  
      return operations.loadWorkspace();
    }
  function saveProjectContext(projectId: ProjectId, input: { rulesContent?: string; threadMemorySummaryContent?: string }) {
      operations.assertProjectExists(projectId);
      const threadId = operations.readActiveThreadRow(projectId).id;
      const now = new Date().toISOString();
      const tx = db.transaction(() => {
        db
          .query(`UPDATE projects SET rules_content = ?2, rules_updated_at = ?3 WHERE id = ?1`)
          .run(projectId, input.rulesContent?.trim() || null, input.rulesContent?.trim() ? now : null);
        db
          .query(`UPDATE project_threads SET memory_summary_content = ?3, memory_summary_updated_at = ?4 WHERE project_id = ?1 AND id = ?2`)
          .run(projectId, threadId, input.threadMemorySummaryContent?.trim() || null, input.threadMemorySummaryContent?.trim() ? now : null);
        operations.touchProject(projectId, now);
      });
      tx();
  
      return operations.readProjectSnapshot(projectId);
    }
  function setProjectSelectedMode(projectId: ProjectId, modeId: string) {
      operations.assertProjectExists(projectId);
      const now = new Date().toISOString();
      db.query(`UPDATE projects SET selected_mode_id = ?2, updated_at = ?3 WHERE id = ?1`).run(projectId, modeId, now);
      return operations.readProjectSnapshot(projectId);
    }
  function saveMode(scope: "workspace", mode: Omit<ModeDefinition, "scope"> & { scope: "workspace" | "project" }): WorkspaceState;
  function saveMode(scope: "project", mode: Omit<ModeDefinition, "scope"> & { scope: "workspace" | "project" }, projectId: ProjectId): WorkspaceProjectState;
  function saveMode(scope: "workspace" | "project", mode: Omit<ModeDefinition, "scope"> & { scope: "workspace" | "project" }, projectId?: ProjectId) {
      const now = new Date().toISOString();
      if (scope === "workspace") {
        db
          .query(
            `INSERT INTO workspace_modes (
              id, label, description, planner_prompt, execution_prompt, tool_policy, execution_access,
              plan_execution_mode_default, subagent_worktree_strategy_default, correctness_iteration_mode_default, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            ON CONFLICT(id) DO UPDATE SET
              label = excluded.label,
              description = excluded.description,
              planner_prompt = excluded.planner_prompt,
              execution_prompt = excluded.execution_prompt,
              tool_policy = excluded.tool_policy,
              execution_access = excluded.execution_access,
              plan_execution_mode_default = excluded.plan_execution_mode_default,
              subagent_worktree_strategy_default = excluded.subagent_worktree_strategy_default,
              correctness_iteration_mode_default = excluded.correctness_iteration_mode_default,
              updated_at = excluded.updated_at`
          )
          .run(
            mode.id,
            mode.label,
            mode.description,
            mode.plannerPrompt,
            mode.executionPrompt,
            mode.toolPolicy,
            mode.executionAccess,
            mode.planExecutionModeDefault ?? null,
            mode.subagentWorktreeStrategyDefault ?? null,
            mode.correctnessIterationModeDefault ?? null,
            now
          );
        return operations.loadWorkspace();
      }
  
      if (!projectId) {
        throw new Error("projectId is required for project mode save");
      }
  
      operations.assertProjectExists(projectId);
      db
        .query(
          `INSERT INTO project_modes (
            project_id, id, label, description, planner_prompt, execution_prompt, tool_policy, execution_access,
            plan_execution_mode_default, subagent_worktree_strategy_default, correctness_iteration_mode_default, updated_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
          ON CONFLICT(project_id, id) DO UPDATE SET
            label = excluded.label,
            description = excluded.description,
            planner_prompt = excluded.planner_prompt,
            execution_prompt = excluded.execution_prompt,
            tool_policy = excluded.tool_policy,
            execution_access = excluded.execution_access,
            plan_execution_mode_default = excluded.plan_execution_mode_default,
            subagent_worktree_strategy_default = excluded.subagent_worktree_strategy_default,
            correctness_iteration_mode_default = excluded.correctness_iteration_mode_default,
            updated_at = excluded.updated_at`
        )
        .run(
          projectId,
          mode.id,
          mode.label,
          mode.description,
          mode.plannerPrompt,
          mode.executionPrompt,
          mode.toolPolicy,
          mode.executionAccess,
          mode.planExecutionModeDefault ?? null,
          mode.subagentWorktreeStrategyDefault ?? null,
          mode.correctnessIterationModeDefault ?? null,
          now
        );
      operations.touchProject(projectId, now);
      return operations.readProjectSnapshot(projectId);
    }
  function deleteMode(scope: "workspace", modeId: string): WorkspaceState;
  function deleteMode(scope: "project", modeId: string, projectId: ProjectId): WorkspaceProjectState;
  function deleteMode(scope: "workspace" | "project", modeId: string, projectId?: ProjectId) {
      if (scope === "workspace") {
        db.query(`DELETE FROM workspace_modes WHERE id = ?1`).run(modeId);
        return operations.loadWorkspace();
      }
  
      if (!projectId) {
        throw new Error("projectId is required for project mode delete");
      }
  
      operations.assertProjectExists(projectId);
      db.query(`DELETE FROM project_modes WHERE project_id = ?1 AND id = ?2`).run(projectId, modeId);
      const now = new Date().toISOString();
      db.query(`UPDATE projects SET selected_mode_id = CASE WHEN selected_mode_id = ?2 THEN 'implement' ELSE selected_mode_id END, updated_at = ?3 WHERE id = ?1`).run(projectId, modeId, now);
      operations.touchProject(projectId, now);
      return operations.readProjectSnapshot(projectId);
    }
  return {
    operations: {
      saveWorkspaceContext,
      saveProjectContext,
      setProjectSelectedMode,
      saveMode,
      deleteMode,
    },
    publicApi: {
      saveWorkspaceContext,
      saveProjectContext,
      setProjectSelectedMode,
      saveMode,
      deleteMode,
    },
  };
}

export type WorkspaceSettingsOperations6Set = ReturnType<typeof createWorkspaceSettingsOperations6>["operations"];
