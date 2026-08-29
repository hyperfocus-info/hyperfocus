import type { ProviderBrand } from "@hyperfocus/ai-core/protocol";
import type { AgentRuntime } from "../agent-runtimes/agent-runtime";
import { buildCliCapability } from "../agent-runtimes/cli-health";
import type { PiAgentAdapter } from "../pi-agent-adapter";

export function createFakeCodexRuntime(adapter: PiAgentAdapter): AgentRuntime {
  let capability: ReturnType<typeof buildCliCapability> | undefined;

  return {
    id: "codex-cli",
    label: "Codex CLI",
    getAdapter() {
      return adapter;
    },
    getCapability() {
      return capability;
    },
    async refreshCapability() {
      capability = buildCliCapability({
        agentId: "codex-cli",
        label: "Codex CLI",
        installed: true,
        authenticated: true,
        supportsInteractive: true,
        interactivePipeCompatible: true,
        supportsPlanning: true,
        supportsReview: true,
        supportsReasoningStrengthControl: true,
        supportsFastModeControl: true,
        discoveredModels: ["openai/gpt-5.4", "openai/gpt-5.4-mini"],
        activeModel: "openai/gpt-5.4",
        modelDiscoveryConfidence: "exact"
      });
      return capability;
    },
    getDefaultPlanningModelId() {
      return "openai/gpt-5.4";
    },
    getDefaultExecutionModelId() {
      return "openai/gpt-5.4";
    },
    getDefaultSubagentModelId(_providerBrand?: ProviderBrand, executionModelId?: string) {
      return executionModelId === "openai/gpt-5.4" ? "openai/gpt-5.4-mini" : "openai/gpt-5.4";
    }
  };
}
