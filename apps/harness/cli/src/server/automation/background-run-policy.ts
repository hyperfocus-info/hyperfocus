import type { AgentRuntime } from "../../agent-runtimes/agent-runtime";
import type { AgentRuntimeRegistry } from "../../agent-runtimes/runtime-registry";
import { resolveProjectAgentRuntime } from "../workspace/preferences";
import type { WorkspaceRepository } from "../../workspace-repository";
import type { WorkspaceRuntimeStore } from "../../workspace-runtime-store";
import type { Assistant, BackgroundJob, BackgroundJobRun, ProviderBrand, WorkspaceProjectState } from "@hyperfocus/ai-core/protocol";

export function resolveBackgroundRunLaunchProfile(input: {
  repository: WorkspaceRepository;
  runtimeRegistry: AgentRuntimeRegistry;
  runtime: WorkspaceRuntimeStore;
  job: BackgroundJob;
  assistant?: Assistant;
  project: WorkspaceProjectState;
}) {
  const snapshot = input.job.definition.kind === "ai-routine" ? input.job.definition.launchProfile : undefined;
  const fallbacks: string[] = [];
  const projectRuntime = resolveProjectAgentRuntime(input.runtimeRegistry, input.project);
  let agentRuntime: AgentRuntime = projectRuntime;
  const requestedAgentId = snapshot?.agentId ?? input.assistant?.agentId;
  if (requestedAgentId) {
    try { agentRuntime = input.runtimeRegistry.get(requestedAgentId); }
    catch { fallbacks.push(`${requestedAgentId} unavailable; using ${projectRuntime.id}.`); }
  }
  const providerBrand = snapshot?.providerBrand ?? input.assistant?.providerBrand ?? input.repository.getProviderBrand();
  return { runtime: agentRuntime, providerBrand, planningModelId: snapshot?.planningModelId,
    executionModelId: snapshot?.executionModelId ?? (input.job.definition.kind === "ai-routine"
      ? input.job.definition.executionModelId : undefined) ?? input.assistant?.executionModelId,
    reasoningStrength: snapshot?.reasoningStrength ?? (input.job.definition.kind === "ai-routine"
      ? input.job.definition.reasoningStrength : undefined) ?? input.assistant?.reasoningStrength,
    fastMode: snapshot?.fastMode ?? (input.job.definition.kind === "ai-routine"
      ? input.job.definition.fastMode : undefined) ?? input.assistant?.fastMode,
    modeId: snapshot?.modeId ?? (input.job.definition.kind === "ai-routine"
      ? input.job.definition.modeId : undefined) ?? input.assistant?.modeId, fallbacks };
}

export function formatBackgroundLaunchProfileDetail(run: BackgroundJobRun) {
  return [`agent=${run.agentId ?? "default"}`, `provider=${run.providerBrand ?? "default"}`,
    `planning=${run.planningModelId ?? "default"}`, `execution=${run.executionModelId ?? "default"}`,
    `reasoning=${run.reasoningStrength ?? "default"}`,
    `fastMode=${run.fastMode === undefined ? "default" : String(run.fastMode)}`].join(" ");
}

export function tryMarkAssistantQuestionRunWaiting(repository: WorkspaceRepository, backgroundRunId: string, message: string) {
  const prompt = extractAssistantQuestionPrompt(message);
  if (!prompt) return undefined;
  repository.appendBackgroundJobRunEvent(backgroundRunId, "awaiting-user-input", "Waiting for user input", prompt);
  return repository.setBackgroundJobRunStatus(backgroundRunId, "awaiting-user-input", { summary: prompt });
}

export function extractAssistantQuestionPrompt(message: string) {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > 1200 || !normalized.includes("?")) return undefined;
  return normalized.match(/\b(?:what|which|who|when|where|why|how|should|could|would|can|do|does|did|is|are|was|were)\b[^?]*\?/i)?.[0]?.trim();
}

export function isExecutionModelIdAvailableForRuntime(agentId: "pi" | "copilot-cli" | "codex-cli",
  capability: { discoveredModels: string[]; activeModel?: string } | undefined, modelId: string | undefined,
  providerBrand: ProviderBrand) {
  if (!modelId) return false;
  if (agentId === "copilot-cli" || agentId === "codex-cli") {
    return capability?.activeModel === modelId || capability?.discoveredModels.includes(modelId) || false;
  }
  return (agentId === "pi" ? providerBrand : "gpt") === "gemini"
    ? modelId.startsWith("google/") : modelId.startsWith("openai/");
}

export function resolveExecutionModelIdForRuntime(input: {
  runtime: AgentRuntime;
  capability?: { discoveredModels: string[]; activeModel?: string };
  providerBrand: ProviderBrand;
  requestedModelId?: string;
  persistedModelId?: string;
}) {
  const capability = input.capability ?? input.runtime.getCapability();
  const requestedModelId = isExecutionModelIdAvailableForRuntime(input.runtime.id, capability,
    input.requestedModelId, input.providerBrand) ? input.requestedModelId : undefined;
  const persistedModelId = isExecutionModelIdAvailableForRuntime(input.runtime.id, capability,
    input.persistedModelId, input.providerBrand) ? input.persistedModelId : undefined;
  return { modelId: requestedModelId ?? persistedModelId ?? input.runtime.getDefaultExecutionModelId(input.providerBrand),
    requestedModelRejected: input.requestedModelId && requestedModelId !== input.requestedModelId
      ? input.requestedModelId : undefined };
}
