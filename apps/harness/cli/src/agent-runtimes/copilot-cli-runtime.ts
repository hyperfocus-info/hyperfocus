import type { AgentRuntimeCapability, ProviderBrand } from "@hyperfocus/ai-core/protocol";
import type { PiAgentPromptRequest } from "../pi-agent-adapter";
import type { AgentRuntime } from "./agent-runtime";
import { createCliAgentAdapter } from "./cli-agent-adapter";
import {
  buildCliCapability,
  discoverCopilotModels,
  probeCliVersion,
  probeCopilotAuth,
  probeInteractivePipeCompatibility,
  shouldSkipExpensiveCliProbes
} from "./cli-health";
import { createCliProcessManager } from "./cli-process-manager";
import { resolveSubagentModelId } from "../subagent-defaults";

const DEFAULT_MODEL_ID = "openai/gpt-5.4";

export function createCopilotCliRuntime(): AgentRuntime {
  const id: "copilot-cli" = "copilot-cli";
  const label = "GitHub Copilot CLI";
  const processManager = createCliProcessManager();
  const adapter = createCliAgentAdapter({
    label,
    buildCommand: ({ request, prompt }) => buildCopilotProgrammaticCommand(request, prompt)
  });
  let capability: AgentRuntimeCapability | undefined;

  function getAdapter() {
    return adapter;
  }

  function getCapability() {
    return capability;
  }

  async function refreshCapability() {
    const version = await probeCliVersion(processManager, "copilot");
    if (!version) {
      capability = buildCliCapability({
        agentId: id,
        label,
        installed: false,
        authenticated: false,
        supportsInteractive: false,
        interactivePipeCompatible: false,
        supportsPlanning: true,
        supportsReview: true,
        supportsReasoningStrengthControl: false,
        supportsFastModeControl: false,
        healthMessage: "Install standalone `copilot` CLI to enable this runtime.",
        installCommand: "winget install GitHub.cli && gh extension install github/gh-copilot",
        docsUrl: "https://docs.github.com/en/copilot/github-copilot-in-the-cli"
      });
      return capability;
    }

    const skipExpensiveProbes = shouldSkipExpensiveCliProbes();
    const [authenticated, interactivePipeCompatible, discovery] = await Promise.all([
      skipExpensiveProbes ? Promise.resolve(false) : probeCopilotAuth(processManager),
      probeInteractivePipeCompatibility(processManager, {
        executable: "copilot",
        helpArgs: ["help"]
      }),
      discoverCopilotModels(processManager)
    ]);

    capability = buildCliCapability({
      agentId: id,
      label,
      installed: true,
      authenticated,
      version,
      supportsInteractive: interactivePipeCompatible,
      interactivePipeCompatible,
      supportsPlanning: true,
      supportsReview: true,
      supportsReasoningStrengthControl: false,
      supportsFastModeControl: false,
      healthMessage: authenticated ? undefined : "Authenticate Copilot CLI before using this runtime.",
      installCommand: "winget install GitHub.cli && gh extension install github/gh-copilot",
      authCommand: "gh auth login",
      docsUrl: "https://docs.github.com/en/copilot/github-copilot-in-the-cli",
      discoveredModels: discovery.discoveredModels,
      activeModel: discovery.activeModel,
      modelDiscoveryConfidence: discovery.modelDiscoveryConfidence
    });

    return capability;
  }

  function getDefaultPlanningModelId(_providerBrand: ProviderBrand) {
    return DEFAULT_MODEL_ID;
  }

  function getDefaultExecutionModelId(_providerBrand: ProviderBrand) {
    return DEFAULT_MODEL_ID;
  }

  function getDefaultSubagentModelId(providerBrand: ProviderBrand, executionModelId?: string) {
    return resolveSubagentModelId({
      agentId: id,
      providerBrand,
      executionModelId
    });
  }

  function buildInteractiveLaunch(input: { cwd: string; cols: number; rows: number; prompt?: string }) {
    return {
      cmd: ["copilot", ...(input.prompt ? ["-i", input.prompt] : [])],
      env: {}
    };
  }

  return { id, label, getAdapter, getCapability, refreshCapability, getDefaultPlanningModelId, getDefaultExecutionModelId, getDefaultSubagentModelId, buildInteractiveLaunch };
}

function buildCopilotProgrammaticCommand(request: PiAgentPromptRequest, prompt: string) {
  const cmd = ["copilot", "-p", prompt, "-s", "--no-ask-user"];
  const modelName = toCliModelName(request.modelId);
  if (modelName) {
    cmd.push("--model", modelName);
  }
  if (request.kind === "planner") {
    cmd.push("--plan");
  }

  return {
    cmd,
    cwd: request.cwd,
    parser: {
      onStdoutChunk(chunkText: string, emitDelta: (delta: string) => void) {
        emitDelta(chunkText);
      },
      getText(stdout: string) {
        return stdout.trim();
      }
    }
  };
}

function toCliModelName(modelId: string | undefined) {
  if (!modelId) {
    return undefined;
  }

  return modelId.includes("/") ? modelId.split("/", 2)[1] : modelId;
}
