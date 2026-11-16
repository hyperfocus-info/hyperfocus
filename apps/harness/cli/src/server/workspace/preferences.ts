import { defaultProviderCapabilities } from "@hyperfocus/ai-core/capabilities";
import { modeUsesReadOnlyExecution,resolveModeById } from "@hyperfocus/ai-core/modes";
import type { AgentRunState,Assistant,BackgroundJob,BackgroundJobSchedule,PreferencesState,WorkspaceProjectState } from "@hyperfocus/ai-core/protocol";
import { createSharedAiPreferencesStore,type SharedAiPreferencesStore } from "@hyperfocus/ai-runtime/preferences";
import { isRecord } from "@hyperfocus/utilities/records";
import type { AgentRuntime } from "../../agent-runtimes/agent-runtime";
import type { AgentRuntimeRegistry } from "../../agent-runtimes/runtime-registry";
import type { PiAgentAdapter } from "../../pi-agent-adapter";
import type { WorkspaceRepository } from "../../workspace-repository";
import type { WorkspaceRuntimeStore } from "../../workspace-runtime-store";

export function resolveProjectAgentRuntime(runtimeRegistry: AgentRuntimeRegistry, project: WorkspaceProjectState, run: AgentRunState | undefined = project.activeRun ?? project.lastRun) {
  return runtimeRegistry.get(run?.launchProfile?.agentId ?? project.session.selectedAgentId ?? "pi");
}

export function assertRuntimeAvailable(runtime: AgentRuntime, capability = runtime.getCapability()) {
  if (!capability) {
    return;
  }

  if (!capability.installed) {
    throw new Error(capability.healthMessage ?? `${runtime.label} is not installed`);
  }

  if (runtime.id !== "pi" && !capability.authenticated) {
    throw new Error(capability.healthMessage ?? `${runtime.label} is not authenticated`);
  }
}

export function getPreferencesState(
  repository: WorkspaceRepository,
  adapter: PiAgentAdapter,
  runtimeRegistry: AgentRuntimeRegistry,
  options: { sharedAiPreferencesStore?: SharedAiPreferencesStore } = {}
): PreferencesState {
  const hasUsableOpenAiApiKey = adapter.hasApiKey("openai");
  const hasStoredOpenAiApiKey = Boolean(repository.getStoredOpenAiApiKey());
  const hasUsableGoogleApiKey = adapter.hasApiKey("google");
  const hasStoredGoogleApiKey = Boolean(repository.getStoredGoogleApiKey());
  const hasUsableAnthropicApiKey = adapter.hasApiKey("anthropic");
  const hasStoredAnthropicApiKey = Boolean(repository.getStoredAnthropicApiKey());

  return {
    sharedAiPreferences: (options.sharedAiPreferencesStore ?? createSharedAiPreferencesStore()).read(),
    hasUsableApiKey: hasUsableOpenAiApiKey || hasUsableGoogleApiKey || hasUsableAnthropicApiKey,
    hasStoredApiKey: hasStoredOpenAiApiKey || hasStoredGoogleApiKey || hasStoredAnthropicApiKey,
    hasUsableOpenAiApiKey,
    hasStoredOpenAiApiKey,
    hasUsableGoogleApiKey,
    hasStoredGoogleApiKey,
    hasUsableAnthropicApiKey,
    hasStoredAnthropicApiKey,
    providerBrand: repository.getProviderBrand(),
    debugEnabledDefault: repository.getDebugEnabledDefault(),
    tracePanelDefaultOpen: repository.getTracePanelDefaultOpen(),
    subagentWorktreeStrategyDefault: repository.getSubagentWorktreeStrategyDefault(),
    blockChatOnDirtyGitDefault: repository.getBlockChatOnDirtyGitDefault(),
    dirtyGitChangeLimitDefault: repository.getDirtyGitChangeLimitDefault(),
    autoCompactContextThresholdPercentDefault: repository.getAutoCompactContextThresholdPercentDefault(),
    planExecutionModeDefault: repository.getPlanExecutionModeDefault(),
    planExecutionDelaySecondsDefault: repository.getPlanExecutionDelaySecondsDefault(),
    singleAgentModelPreferenceDefault: repository.getSingleAgentModelPreferenceDefault(),
    subagentModelPreferenceDefault: repository.getSubagentModelPreferenceDefault(),
    correctnessIterationModeDefault: repository.getCorrectnessIterationModeDefault(),
    backgroundJobApprovalPolicyDefault: repository.getBackgroundJobApprovalPolicyDefault(),
    assistantAutoApproveNonBlockingQuestionsDefault: repository.getAssistantAutoApproveNonBlockingQuestionsDefault(),
    assistantCongestionControlEnabledDefault: repository.getAssistantCongestionControlEnabledDefault(),
    assistantMaxCongestionDefault: repository.getAssistantMaxCongestionDefault(),
    maxBackgroundJobsDefault: repository.getMaxBackgroundJobsDefault(),
    autoArchiveCompletedThreadsDefault: getRepositoryAutoArchiveCompletedThreadsDefault(repository),
    memoryBankEnabledDefault: repository.getMemoryBankEnabledDefault(),
    memoryBankRecordRunsDefault: repository.getMemoryBankRecordRunsDefault(),
    checkCliUpdatesDefault: repository.getCheckCliUpdatesDefault(),
    attachmentsEnabled: Boolean(Bun.env.UPLOADTHING_TOKEN?.trim()),
    capabilities: defaultProviderCapabilities,
    agentRuntimes: runtimeRegistry.listCapabilities()
  };
}

export type ProviderConnectionProvider = "openai" | "google" | "anthropic";

export async function testProviderConnection(input: {
  provider: ProviderConnectionProvider;
  apiKey?: string;
  repository: WorkspaceRepository;
}): Promise<{
  provider: ProviderConnectionProvider;
  status: "ready" | "failed";
  message: string;
  modelCount?: number;
}> {
  const apiKey = (input.apiKey ?? getStoredProviderApiKey(input.repository, input.provider))?.trim();
  if (!apiKey) {
    return {
      provider: input.provider,
      status: "failed",
      message: "No API key available."
    };
  }

  try {
    const modelCount = await fetchProviderModelCount(input.provider, apiKey);
    return {
      provider: input.provider,
      status: "ready",
      message: modelCount === 1 ? "Connection ready. 1 model visible." : `Connection ready. ${modelCount} models visible.`,
      modelCount
    };
  } catch (error) {
    return {
      provider: input.provider,
      status: "failed",
      message: sanitizeProviderConnectionError(error, apiKey)
    };
  }
}

export function getStoredProviderApiKey(repository: WorkspaceRepository, provider: ProviderConnectionProvider) {
  switch (provider) {
    case "google":
      return repository.getStoredGoogleApiKey();
    case "anthropic":
      return repository.getStoredAnthropicApiKey();
    case "openai":
      return repository.getStoredOpenAiApiKey();
  }
}

export async function fetchProviderModelCount(provider: ProviderConnectionProvider, apiKey: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetchProviderModels(provider, apiKey, controller.signal);
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) {
      throw new Error(extractProviderErrorMessage(payload) ?? `Provider returned HTTP ${response.status}.`);
    }

    return countProviderModels(provider, payload);
  } finally {
    clearTimeout(timeout);
  }
}

export function fetchProviderModels(provider: ProviderConnectionProvider, apiKey: string, signal: AbortSignal) {
  switch (provider) {
    case "openai":
      return fetch("https://api.openai.com/v1/models", {
        signal,
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      });
    case "anthropic":
      return fetch("https://api.anthropic.com/v1/models", {
        signal,
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        }
      });
    case "google":
      return fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`, { signal });
  }
}

export function countProviderModels(provider: ProviderConnectionProvider, payload: unknown) {
  if (!isRecord(payload)) return 0;
  const list = provider === "google" ? payload.models : payload.data;
  return Array.isArray(list) ? list.length : 0;
}

export function extractProviderErrorMessage(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.error)) return undefined;
  return typeof payload.error.message === "string" ? payload.error.message : undefined;
}


export function sanitizeProviderConnectionError(error: unknown, apiKey: string) {
  const rawMessage = error instanceof Error ? error.message : "Provider connection failed.";
  const withoutKey = rawMessage.split(apiKey).join("[redacted]");
  if (withoutKey.toLowerCase().includes("abort")) {
    return "Provider connection timed out.";
  }

  return withoutKey || "Provider connection failed.";
}

export function getRepositoryAutoArchiveCompletedThreadsDefault(repository: WorkspaceRepository) {
  if (
    "getAutoArchiveCompletedThreadsDefault" in repository &&
    typeof repository.getAutoArchiveCompletedThreadsDefault === "function"
  ) {
    return repository.getAutoArchiveCompletedThreadsDefault();
  }

  return false;
}

export function setRepositoryAutoArchiveCompletedThreadsDefault(repository: WorkspaceRepository, value: boolean) {
  if (
    "setAutoArchiveCompletedThreadsDefault" in repository &&
    typeof repository.setAutoArchiveCompletedThreadsDefault === "function"
  ) {
    repository.setAutoArchiveCompletedThreadsDefault(value);
  }
}

export function applyAdapterAutoCompactionThreshold(adapter: PiAgentAdapter, thresholdPercent: number) {
  if ("setAutoCompactContextThresholdPercent" in adapter && typeof adapter.setAutoCompactContextThresholdPercent === "function") {
    adapter.setAutoCompactContextThresholdPercent(thresholdPercent);
  }
}

export function resolveBackgroundJobNextRunAt(schedule: BackgroundJobSchedule) {
  switch (schedule.type) {
    case "one-off":
      return schedule.runAt;
    case "interval":
    case "cron":
      return schedule.nextRunAt;
  }
}

export function computeBackgroundJobRiskLevel(
  job: BackgroundJob,
  project: WorkspaceProjectState,
  runtime: WorkspaceRuntimeStore
): BackgroundJob["riskLevel"] {
  if (job.kind === "shell") {
    if (job.definition.kind !== "shell") {
      throw new Error(`Expected shell definition for ${job.id}`);
    }

    return job.definition.networkAccess || (job.definition.envRefs?.length ?? 0) > 0 ? "unsafe" : "slightly-unsafe";
  }

  if (job.definition.kind !== "ai-routine") {
    throw new Error(`Expected ai-routine definition for ${job.id}`);
  }

  const mode = resolveModeById(job.definition.modeId ?? project.selectedModeId, runtime.getWorkspace().workspaceModes, project.projectModes);
  const worktreeStrategy = job.definition.subagentWorktreeStrategy ?? repositoryLikeWorktreeStrategy(project, runtime);
  if (modeUsesReadOnlyExecution(mode) && worktreeStrategy !== "same-worktree") {
    return "safe";
  }

  return worktreeStrategy === "same-worktree" ? "unsafe" : "slightly-unsafe";
}

export function repositoryLikeWorktreeStrategy(project: WorkspaceProjectState, runtime: WorkspaceRuntimeStore) {
  return resolveModeById(project.selectedModeId, runtime.getWorkspace().workspaceModes, project.projectModes)
    ?.subagentWorktreeStrategyDefault ?? "same-worktree";
}

export type AssistantCreationResult = {
  assistant: Assistant;
  created: boolean;
};
