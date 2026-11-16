import type { ProviderBrand, AgentId, ModelCapability, ComposerReasoningStrength } from "@hyperfocus/ai-core/protocol";
import { COMPOSER_REASONING_STRENGTHS, DEFAULT_COMPOSER_REASONING_STRENGTH, type HarnessViewState } from "../../harness-store";
export function getModelCapability(state: HarnessViewState, modelId: string | undefined): ModelCapability | undefined {
  if (!modelId) {
    return undefined;
  }

  return state.capabilities.flatMap((provider) => provider.models).find((model) => model.modelId === modelId);
}

export function getAvailableReasoningStrengthsForSelection(
  state: HarnessViewState,
  agentId: AgentId,
  modelId: string | undefined
): ComposerReasoningStrength[] {
  const runtime = state.agentRuntimes.find((entry) => entry.agentId === agentId);
  if (runtime?.supportsReasoningStrengthControl === false) {
    return [DEFAULT_COMPOSER_REASONING_STRENGTH];
  }

  const modelStrengths = getModelCapability(state, modelId)?.supportedReasoningStrengths ?? COMPOSER_REASONING_STRENGTHS;
  return COMPOSER_REASONING_STRENGTHS.filter((strength) => modelStrengths.includes(strength));
}

export function getSupportsFastModeForSelection(
  state: HarnessViewState,
  agentId: AgentId,
  modelId: string | undefined
) {
  const runtime = state.agentRuntimes.find((entry) => entry.agentId === agentId);
  if (runtime?.supportsFastModeControl === false) {
    return false;
  }

  return Boolean(getModelCapability(state, modelId)?.supportsFastMode);
}

export function getCapabilityTags(state: HarnessViewState, modelId: string | undefined) {
  return getModelCapability(state, modelId)?.tags ?? [];
}


export function isModelIdForProvider(modelId: string | undefined, providerBrand: ProviderBrand) {
  if (!modelId) {
    return false;
  }

  if (providerBrand === "gemini") {
    return modelId.startsWith("google/");
  }
  if (providerBrand === "claude") {
    return modelId.startsWith("anthropic/");
  }
  return modelId.startsWith("openai/");
}
