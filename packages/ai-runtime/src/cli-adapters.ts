import { runAiCliProcess } from "./process/cli-process";
import type { AiRunRequest } from "@hyperfocus/ai-core/runtime";
import { BUILT_IN_AI_ADAPTER_CAPABILITIES, type AiRuntimeAdapter } from "./runtime";
import { discoverCodexModelIds } from "./process/codex-models";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { codexSubscriptionEnvironment, readCodexSubscription } from "./process/codex-account";
import { parseCodexSubscriptionResult, subscriptionCodexArguments } from "./process/codex-subscription";

export function createDefaultCliAdapters(): AiRuntimeAdapter[] {
  return [createCodexCliAdapter(), createCopilotCliAdapter()];
}

export function createCodexCliAdapter(options: { executable?: string; runProcess?: typeof runAiCliProcess; subscriptionOnly?: boolean; subscriptionModels?: string[]; codexHome?: string; readSubscription?: typeof readCodexSubscription } = {}): AiRuntimeAdapter {
  const executable = options.executable ?? Bun.which("codex");
  const runProcess = options.runProcess ?? runAiCliProcess;
  const { subscriptionOnly = false, codexHome } = options;
  const readSubscription = options.readSubscription ?? readCodexSubscription;
  const subscriptionModels = [...new Set(["default", ...(options.subscriptionModels ?? [])])];
  if (subscriptionModels.some(id => !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,159}$/.test(id))) throw Error("Invalid configured Codex subscription model identifier.");
  let discovered: string[] | undefined;
  let discoveredAt = 0;
  return {
    descriptor: {
      id: "codex-cli",
      label: "Codex CLI",
      description: "Use the locally authenticated Codex CLI in read-only planning mode.",
      providerIds: ["codex-account"],
      supportsReasoning: true,
      supportsStructuredOutput: true,
      ...BUILT_IN_AI_ADAPTER_CAPABILITIES["codex-cli"],
      reasoningEfforts: [...BUILT_IN_AI_ADAPTER_CAPABILITIES["codex-cli"].reasoningEfforts],
      available: Boolean(executable),
      ...(executable ? {} : { unavailableReason: "Codex CLI is not on PATH." })
    },
    async listCatalog(_store, options) {
      if (subscriptionOnly) {
        const status = executable ? await readSubscription({ executable, codexHome, signal: options?.signal }) : undefined;
        // Host configuration is an allowlist, not evidence of account access.
        // The host must probe each profile before admitting remote workloads.
        return cliCatalog("codex-account", "Codex subscription", subscriptionModels, status?.available === true);
      }
      if (executable && (!discovered || Date.now() - discoveredAt > 300_000)) {
        // Only completed discoveries are cached: one caller cannot cancel a
        // promise that another caller owns or poison the next catalog read.
        discovered = await discoverCodexModelIds(executable, options?.signal);
        discoveredAt = Date.now();
      }
      const modelIds = ["default", ...(discovered ?? [])];
      return cliCatalog("codex-account", "Codex account", modelIds, Boolean(executable));
    },
    run: async (request, _store, { signal }) => {
      if (!executable) throw new Error("Codex CLI is not on PATH.");
      if (subscriptionOnly) {
        const status = await readSubscription({ executable, codexHome, signal });
        if (!status.available) throw new Error(status.reason ?? "Codex subscription unavailable; paid API fallback is disabled.");
        const cwd = path.join(os.tmpdir(), "hyperfocus-codex-reasoning");
        await mkdir(cwd, { recursive: true });
        const result = await runProcess({ request, command: [executable, ...subscriptionCodexArguments(request)], input: cliPrompt(request), signal, cwd, env: codexSubscriptionEnvironment(codexHome) });
        return parseCodexSubscriptionResult(result);
      }
      const args = [
        "exec",
        "--ephemeral",
        "--skip-git-repo-check",
        "--ignore-rules",
        "--ignore-user-config",
        "--color",
        "never",
        "--sandbox",
        "read-only",
        "-c",
        `model_reasoning_effort="${request.profile.reasoning ?? "minimal"}"`,
        "-c",
        "model_verbosity=" + '"low"'
      ];
      if (request.profile.modelId !== "default") args.push("--model", request.profile.modelId);
      args.push("-");
      return runProcess({ request, command: [executable, ...args], input: cliPrompt(request), signal });
    }
  };
}

export function createCopilotCliAdapter(options: { executable?: string; runProcess?: typeof runAiCliProcess } = {}): AiRuntimeAdapter {
  const executable = options.executable ?? Bun.which("copilot");
  const runProcess = options.runProcess ?? runAiCliProcess;
  return {
    descriptor: {
      id: "copilot-cli",
      label: "GitHub Copilot CLI",
      description: "Use Copilot for planning with file, shell, URL and memory operations denied. CLI extensions remain user-managed.",
      providerIds: ["copilot-account"],
      supportsReasoning: false,
      supportsStructuredOutput: true,
      ...BUILT_IN_AI_ADAPTER_CAPABILITIES["copilot-cli"],
      reasoningEfforts: [...BUILT_IN_AI_ADAPTER_CAPABILITIES["copilot-cli"].reasoningEfforts],
      available: Boolean(executable),
      ...(executable ? {} : { unavailableReason: "GitHub Copilot CLI is not on PATH." })
    },
    listCatalog: () => cliCatalog("copilot-account", "GitHub Copilot account", ["default"], Boolean(executable)),
    run: async (request, _store, { signal }) => {
      if (!executable) throw new Error("GitHub Copilot CLI is not on PATH.");
      const args = ["-s", "--no-ask-user", "--disable-builtin-mcps", "--deny-tool=read,shell,write,url,memory"];
      if (request.profile.modelId !== "default") args.push("--model", request.profile.modelId);
      return runProcess({ request, command: [executable, ...args], input: cliPrompt(request), signal });
    }
  };
}

function cliCatalog(providerId: string, label: string, modelIds: string[], available: boolean) {
  return {
    providers: [{
      id: providerId,
      label,
      authenticated: available,
      credentialSource: available ? "ambient" as const : "missing" as const,
      modelIds,
      defaultModelId: "default"
    }],
    models: modelIds.map((id) => ({
      id,
      providerId,
      label: id === "default" ? "Agent default" : id,
      reasoning: providerId === "codex-account",
      input: ["text" as const]
    }))
  };
}

function cliPrompt(request: AiRunRequest): string {
  return [
    "You are a read-only planning agent embedded in a Hyperfocus application.",
    "Do not inspect or edit files, run shell commands, browse UI DOM, or call tools. Return only the requested response.",
    request.systemPrompt,
    ...request.messages.map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
  ].filter(Boolean).join("\n\n");
}
