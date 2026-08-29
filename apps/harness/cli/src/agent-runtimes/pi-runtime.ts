import type { AgentRuntimeCapability, ProviderBrand } from "@hyperfocus/ai-core/protocol";
import { getDefaultExecutionModelId, getDefaultPlanningModelId, getDefaultSubagentModelId } from "../pi-planner";
import type { PiAgentAdapter } from "../pi-agent-adapter";
import type { AgentRuntime } from "./agent-runtime";
import { buildCliCapability } from "./cli-health";

export function createPiRuntime(adapter: PiAgentAdapter): AgentRuntime {
  const id: "pi" = "pi";
  const label = "Pi";
  let capability: AgentRuntimeCapability | undefined;
  function getAdapter() {
    return adapter;
  }

  function getCapability() {
    return capability;
  }

  async function refreshCapability() {
    capability = buildCliCapability({
      agentId: "pi",
      label,
      installed: true,
      authenticated: adapter.hasApiKey("openai") || adapter.hasApiKey("google") || adapter.hasApiKey("anthropic"),
      supportsInteractive: false,
      interactivePipeCompatible: false,
      supportsPlanning: true,
      supportsReview: true,
      supportsReasoningStrengthControl: true,
      supportsFastModeControl: true,
      healthMessage:
        adapter.hasApiKey("openai") || adapter.hasApiKey("google") || adapter.hasApiKey("anthropic")
          ? undefined
          : "Add OpenAI, Google, or Anthropic API key to use Pi runtime.",
      docsUrl: "https://platform.openai.com/docs"
    });
    return capability;
  }

  function resolveDefaultPlanningModelId(providerBrand: ProviderBrand) {
    return getDefaultPlanningModelId(providerBrand);
  }

  function resolveDefaultExecutionModelId(providerBrand: ProviderBrand) {
    return getDefaultExecutionModelId(providerBrand);
  }

  function resolveDefaultSubagentModelId(providerBrand: ProviderBrand, executionModelId?: string) {
    return getDefaultSubagentModelId(providerBrand, executionModelId);
  }

  return {
    id,
    label,
    getAdapter,
    getCapability,
    refreshCapability,
    getDefaultPlanningModelId: resolveDefaultPlanningModelId,
    getDefaultExecutionModelId: resolveDefaultExecutionModelId,
    getDefaultSubagentModelId: resolveDefaultSubagentModelId,
  };
}
