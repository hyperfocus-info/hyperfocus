import type { AgentRuntimeCapability, ProviderBrand } from "@hyperfocus/ai-core/protocol";
import type { PiAgentAdapter } from "../pi-agent-adapter";
import { buildCliCapability, probeCliVersion, probeCodexAuth, probeInteractivePipeCompatibility, shouldSkipExpensiveCliProbes } from "./cli-health";
import { createCliProcessManager, type CliProcessManager } from "./cli-process-manager";
import { getBundledCodexInstallation, type CodexInstallation } from "./codex-installation";
import { resolveCodexSandboxMode } from "./codex-sandbox-policy";
import { createCodexSdkAdapter } from "./codex-sdk-adapter";
import { resolveSubagentModelId } from "../subagent-defaults";

const DEFAULT_MODEL_ID = "openai/gpt-5.6-sol";
const FALLBACK_CODEX_SUPPORTED_MODEL_IDS = [
  DEFAULT_MODEL_ID,
  "openai/gpt-5.6-terra",
  "openai/gpt-5.6-luna",
  "openai/gpt-5.5",
  "openai/gpt-5.4",
  "openai/gpt-5.4-mini",
  "openai/gpt-5.3-codex",
  "openai/gpt-5.3-codex-spark",
  "openai/gpt-5.2"
] as const;
const MODEL_DISCOVERY_TOTAL_TIMEOUT_MS = 10_000;
const MODEL_DISCOVERY_IDLE_TIMEOUT_MS = 5_000;

type CodexCliRuntimeOptions = {
  processManager?: CliProcessManager;
  getInstallation?: () => CodexInstallation;
  createAdapter?: (executablePath: string) => PiAgentAdapter;
  platform?: NodeJS.Platform;
};

export type CodexCliRuntime = ReturnType<typeof createCodexCliRuntime>;

export function createCodexCliRuntime(options: CodexCliRuntimeOptions = {}) {
  const id: "codex-cli" = "codex-cli";
  const label = "Codex CLI";
  const processManager = options.processManager ?? createCliProcessManager();
  const getInstallation = options.getInstallation ?? getBundledCodexInstallation;
  const createAdapter = options.createAdapter ?? ((executablePath: string) => createCodexSdkAdapter({ executablePath }));
  const platform = options.platform ?? process.platform;
  let adapter: PiAgentAdapter | undefined;
  let capability: AgentRuntimeCapability | undefined;

  function getAdapter() {
    if (!adapter) {
      const installation = getInstallation();
      if (!installation.installed || !installation.executablePath) {
        throw new Error(installation.healthMessage);
      }
      adapter = createAdapter(installation.executablePath);
    }

    return adapter;
  }

  function getCapability() {
    return capability;
  }

  async function refreshCapability() {
    const installation = getInstallation();
    if (!installation.installed || !installation.executablePath) {
      capability = buildCliCapability({
        agentId: id,
        label,
        installed: false,
        authenticated: false,
        supportsInteractive: false,
        interactivePipeCompatible: false,
        supportsPlanning: true,
        supportsReview: true,
        supportsReasoningStrengthControl: true,
        supportsFastModeControl: true,
        healthMessage: installation.healthMessage,
        installCommand: installation.installCommand,
        authCommand: installation.authCommand,
        docsUrl: installation.docsUrl
      });
      return capability;
    }

    const version = await probeCliVersion(processManager, installation.executablePath);
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
        supportsReasoningStrengthControl: true,
        supportsFastModeControl: true,
        healthMessage: installation.healthMessage,
        installCommand: installation.installCommand,
        authCommand: installation.authCommand,
        docsUrl: installation.docsUrl
      });
      return capability;
    }

    const skipExpensiveProbes = shouldSkipExpensiveCliProbes();
    const [authenticated, interactivePipeCompatible] = await Promise.all([
      skipExpensiveProbes ? Promise.resolve(true) : probeCodexAuth(processManager, installation.executablePath),
      probeInteractivePipeCompatibility(processManager, {
        executable: installation.executablePath,
        helpArgs: ["--help"]
      })
    ]);
    const modelDiscovery = await discoverCodexModels(processManager, installation.executablePath);

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
      supportsReasoningStrengthControl: true,
      supportsFastModeControl: true,
      discoveredModels: modelDiscovery.discoveredModels,
      activeModel: DEFAULT_MODEL_ID,
      modelDiscoveryConfidence: modelDiscovery.modelDiscoveryConfidence,
      healthMessage: authenticated ? undefined : "Run `bunx codex login` before using this runtime.",
      installCommand: installation.installCommand,
      authCommand: installation.authCommand,
      docsUrl: installation.docsUrl
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
    const installation = getInstallation();
    if (!installation.installed || !installation.executablePath) {
      throw new Error(installation.healthMessage);
    }

    return {
      cmd: [
        installation.executablePath,
        "--no-alt-screen",
        "-C",
        input.cwd,
        "-s",
        resolveCodexSandboxMode({
          platform
        }),
        "-a",
        "on-request",
        ...(input.prompt ? [input.prompt] : [])
      ],
      env: {}
    };
  }

  return { id, label, getAdapter, getCapability, refreshCapability, getDefaultPlanningModelId, getDefaultExecutionModelId, getDefaultSubagentModelId, buildInteractiveLaunch };
}

export function getCodexSupportedModelIds() {
  return [...FALLBACK_CODEX_SUPPORTED_MODEL_IDS];
}

export function isCodexSupportedModelId(modelId: string | undefined) {
  return Boolean(modelId && FALLBACK_CODEX_SUPPORTED_MODEL_IDS.some((candidate) => candidate === modelId));
}

export function resolveCodexModelId(modelId: string | undefined) {
  return isCodexSupportedModelId(modelId) ? modelId : DEFAULT_MODEL_ID;
}

async function discoverCodexModels(processManager: CliProcessManager, executablePath: string) {
  try {
    const result = await processManager.runNonInteractive({
      cmd: [executablePath, "debug", "models"],
      cwd: process.cwd(),
      cols: 120,
      rows: 40,
      idleTimeoutMs: MODEL_DISCOVERY_IDLE_TIMEOUT_MS,
      totalTimeoutMs: MODEL_DISCOVERY_TOTAL_TIMEOUT_MS
    });

    if (result.hangDetected || result.timedOut || result.exitCode !== 0) {
      return {
        discoveredModels: getCodexSupportedModelIds(),
        modelDiscoveryConfidence: "partial" as const
      };
    }

    const discoveredModels = parseCodexModelCatalog(result.stdout);
    if (discoveredModels.length === 0) {
      return {
        discoveredModels: getCodexSupportedModelIds(),
        modelDiscoveryConfidence: "partial" as const
      };
    }

    return {
      discoveredModels,
      modelDiscoveryConfidence: "exact" as const
    };
  } catch {
    return {
      discoveredModels: getCodexSupportedModelIds(),
      modelDiscoveryConfidence: "partial" as const
    };
  }
}

function parseCodexModelCatalog(input: string) {
  try {
    const parsed: unknown = JSON.parse(input);
    if (parsed === null || typeof parsed !== "object") return [];
    const models = Reflect.get(parsed, "models");
    if (!Array.isArray(models)) return [];
    const slugs = models.flatMap((model) => {
      if (model === null || typeof model !== "object" || Reflect.get(model, "visibility") !== "list") return [];
      const slug = Reflect.get(model, "slug");
      return typeof slug === "string" && slug.trim() ? [slug.trim()] : [];
    });
    return [...new Set(slugs.map((slug) => (slug.includes("/") ? slug : `openai/${slug}`)))];
  } catch {
    return [];
  }
}

export const testExports = {
  getCodexSupportedModelIds,
  isCodexSupportedModelId,
  resolveCodexModelId,
  discoverCodexModels,
  parseCodexModelCatalog
};
