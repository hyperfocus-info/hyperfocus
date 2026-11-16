import {
  aiRunRequestSchema,
  assertAiRuntimeCatalogConsistent,
  assertProfileAvailable,
  type AiAgentDescriptor,
  type AiExecutionProfile,
  type AiRunRequest,
  type AiRunResult,
  type AiRuntimeCatalog
} from "@hyperfocus/ai-core/runtime";
import {
  completeSimple,
  getEnvApiKey,
  getModels,
  getProviders,
  type KnownProvider,
  type Model,
  type UserMessage
} from "@mariozechner/pi-ai";
import {
  createSharedProviderCredentialStore,
  type ProviderCredentialStore
} from "./credential-store";
import { createDefaultCliAdapters } from "./cli-adapters";
import { filterAiCatalog, type CatalogQuery } from "./catalog";
import { createAiRunScope } from "./run-lifecycle";
import { createQualitySession, qualityHash } from "./quality/session";

export interface AiRuntimeAdapter {
  readonly descriptor: AiAgentDescriptor;
  listCatalog(credentialStore: ProviderCredentialStore, options?: { signal?: AbortSignal }):
    | Pick<AiRuntimeCatalog, "providers" | "models">
    | Promise<Pick<AiRuntimeCatalog, "providers" | "models">>;
  /** Settle only after owned work stops; never detach work when signal aborts. */
  run(request: AiRunRequest, credentialStore: ProviderCredentialStore, options: { signal: AbortSignal; onContextDelivery?: (boundary: "sdk-prompt" | "cli-stdin") => void }): Promise<AiRunResult>;
}

export interface LocalAiRuntime {
  catalog(query?: CatalogQuery, options?: { signal?: AbortSignal }): Promise<AiRuntimeCatalog>;
  run(input: unknown, options?: { signal?: AbortSignal; qualityProject?: string }): Promise<AiRunResult>;
  setCredential(providerId: string, apiKey: string): Promise<void>;
  deleteCredential(providerId: string): Promise<void>;
  credentialPersistence(): ProviderCredentialStore["persistence"];
}

export const BUILT_IN_AI_ADAPTER_CAPABILITIES = {
  direct: {
    reasoningEfforts: ["minimal", "low", "medium", "high", "xhigh"],
    supportsWebSearch: false,
    usageReporting: "reported",
  },
  "codex-cli": {
    reasoningEfforts: ["low", "medium", "high", "xhigh"],
    supportsWebSearch: false,
    usageReporting: "unavailable",
  },
  "copilot-cli": {
    reasoningEfforts: ["minimal"],
    supportsWebSearch: false,
    usageReporting: "unavailable",
  },
} as const;

function normalizedDescriptor(descriptor: AiAgentDescriptor): AiAgentDescriptor {
  const builtIn = Object.entries(BUILT_IN_AI_ADAPTER_CAPABILITIES)
    .find(([id]) => id === descriptor.id)?.[1];
  return {
    ...descriptor,
    reasoningEfforts: [...(builtIn?.reasoningEfforts
      ?? descriptor.reasoningEfforts
      ?? (descriptor.supportsReasoning
        ? BUILT_IN_AI_ADAPTER_CAPABILITIES.direct.reasoningEfforts
        : BUILT_IN_AI_ADAPTER_CAPABILITIES["copilot-cli"].reasoningEfforts))],
    supportsWebSearch: builtIn?.supportsWebSearch ?? descriptor.supportsWebSearch ?? false,
    usageReporting: builtIn?.usageReporting ?? descriptor.usageReporting ?? "unavailable",
  };
}

export function createLocalAiRuntime(options: {
  credentialStore?: ProviderCredentialStore;
  adapters?: AiRuntimeAdapter[];
} = {}): LocalAiRuntime {
  const credentialStore = options.credentialStore ?? createSharedProviderCredentialStore();
  const adapters = options.adapters?.length
    ? [...options.adapters]
    : [createDirectProviderAdapter(), ...createDefaultCliAdapters()];

  async function catalog(query?: CatalogQuery, options: { signal?: AbortSignal } = {}) {
    const scope = createAiRunScope(options);
    try {
      scope.signal.throwIfAborted();
      // Wait for every discovery owner to finish cleanup before returning failure.
      const settled = await Promise.allSettled(adapters.map(async adapter => adapter.listCatalog(credentialStore, { signal: scope.signal })));
      scope.signal.throwIfAborted();
      const parts = settled.map(part => {
        if (part.status === "rejected") throw part.reason;
        return part.value;
      });
      const result = {
        agents: adapters.map((adapter) => normalizedDescriptor(adapter.descriptor)),
        providers: uniqueBy(parts.flatMap((part) => part.providers), (provider) => provider.id),
        models: uniqueBy(
          parts.flatMap((part) => part.models),
          (model) => `${model.providerId}\u0000${model.id}`
        )
      };
      assertAiRuntimeCatalogConsistent(result);
      return query ? filterAiCatalog(result, query) : result;
    } finally {
      scope.dispose();
    }
  }

  return {
    catalog,
    async run(input, options = {}) {
      const request = aiRunRequestSchema.parse(input);
      const scope = createAiRunScope({ signal: options.signal, deadlineAt: request.deadlineAt });
      try {
        scope.signal.throwIfAborted();
        assertProfileAvailable(await catalog(undefined, { signal: scope.signal }), request.profile);
        scope.signal.throwIfAborted();
        const adapter = adapters.find((candidate) => candidate.descriptor.id === request.profile.agentId);
        if (!adapter) throw new Error(`AI agent '${request.profile.agentId}' is unavailable.`);
        const quality = createQualitySession({ runId: request.requestId,
          task: { intent: request.qualityIntent ?? request.messages.filter(message => message.role === "user").at(-1)?.content ?? "", project: options.qualityProject } });
        quality.select();
        const context = quality.context("main");
        const prepared = { ...request, systemPrompt: [request.systemPrompt, context].filter(Boolean).join("\n\n") };
        quality.delivery("main", "unsupported", true, prepared.systemPrompt);
        const result = await adapter.run(prepared, credentialStore, { signal: scope.signal,
          onContextDelivery: boundary => quality.delivery("main", boundary, true, prepared.systemPrompt) });
        scope.signal.throwIfAborted();
        quality.implementation(qualityHash(result.text), result.stopReason === "stop");
        for (const verifierId of new Set(quality.trace.rules.filter(rule => rule.eligible === "yes").flatMap(rule => rule.verifierIds))) {
          quality.verify({ verifierId, candidateSha256: qualityHash(result.text), outcome: "unknown",
            reason: "This runtime produced a proposal. Applied-project and rendered UX verification require the host workflow.", evidenceRefs: [] });
        }
        quality.finish();
        return { ...result, quality: quality.trace, usageStatus: result.usage ? "reported" : "unavailable" };
      } finally {
        scope.dispose();
      }
    },
    async setCredential(providerId, apiKey) {
      credentialStore.set(providerId, apiKey);
    },
    async deleteCredential(providerId) {
      credentialStore.delete(providerId);
    },
    credentialPersistence: () => credentialStore.persistence
  };
}

export function createDirectProviderAdapter(options: { defaultModelIds?: Readonly<Record<string, string>> } = {}): AiRuntimeAdapter {
  const providers = getProviders();
  return {
    descriptor: {
      id: "direct",
      label: "Direct provider",
      description: "Call any supported provider directly without a separate Harness process.",
      providerIds: [...providers],
      supportsReasoning: true,
      supportsStructuredOutput: true,
      reasoningEfforts: [...BUILT_IN_AI_ADAPTER_CAPABILITIES.direct.reasoningEfforts],
      supportsWebSearch: BUILT_IN_AI_ADAPTER_CAPABILITIES.direct.supportsWebSearch,
      usageReporting: BUILT_IN_AI_ADAPTER_CAPABILITIES.direct.usageReporting,
      available: true
    },
    listCatalog(credentialStore) {
      const models = providers.flatMap((providerId) =>
        getModels(providerId).map((model) => ({
          id: model.id,
          providerId,
          label: model.name,
          contextWindow: model.contextWindow,
          maxOutputTokens: model.maxTokens,
          reasoning: model.reasoning,
          input: model.input
        }))
      );
      return {
        providers: providers.map((providerId) => {
          const credential = resolveCredential(providerId, credentialStore);
          return {
            id: providerId,
            label: labelProvider(providerId),
            authenticated: Boolean(credential.value),
            credentialSource: credential.source,
            defaultModelId: models.find(model => model.providerId === providerId && model.id ===
              (options.defaultModelIds?.[providerId] ?? directPlanningDefaults[providerId]))?.id,
            modelIds: models
              .filter((model) => model.providerId === providerId)
              .map((model) => model.id)
          };
        }),
        models
      };
    },
    async run(request, credentialStore, options) {
      if (!isKnownProvider(request.profile.providerId)) {
        throw new Error(`Unknown provider '${request.profile.providerId}'.`);
      }
      const model = getModels(request.profile.providerId).find(
        (candidate) => candidate.id === request.profile.modelId
      );
      if (!model) {
        throw new Error(
          `Unknown model '${request.profile.modelId}' for provider '${request.profile.providerId}'.`
        );
      }
      const credential = resolveCredential(request.profile.providerId, credentialStore).value;
      if (!credential) {
        throw new Error(`Provider '${request.profile.providerId}' needs a credential.`);
      }
      return runDirectProvider(request, model, credential, options.signal, options.onContextDelivery);
    }
  };
}

// Host-owned general-purpose choices, checked against the installed catalog.
// Additional adapters/providers can declare their own default without UI heuristics.
const directPlanningDefaults: Readonly<Record<string, string>> = {
  openai: "gpt-5.4",
  anthropic: "claude-sonnet-4-6",
  google: "gemini-2.5-pro"
};

async function runDirectProvider(
  request: AiRunRequest,
  model: Model<any>,
  apiKey: string,
  signal: AbortSignal,
  onContextDelivery?: (boundary: "sdk-prompt") => void
): Promise<AiRunResult> {
  const now = Date.now();
  const messages = request.messages.map((message, index): UserMessage | AiRunResultMessage => {
    if (message.role === "user") {
      return { role: "user", content: message.content, timestamp: now + index };
    }
    return {
      role: "assistant",
      content: [{ type: "text", text: message.content }],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: emptyUsage(),
      stopReason: "stop",
      timestamp: now + index
    };
  });
  const pending = completeSimple(
    model,
    { systemPrompt: request.systemPrompt, messages },
    {
      apiKey,
      signal,
      maxTokens: request.maxOutputTokens,
      temperature: request.temperature,
      reasoning: normalizeReasoning(request.profile)
    }
  );
  onContextDelivery?.("sdk-prompt");
  const response = await pending;
  return {
    requestId: request.requestId,
    profile: request.profile,
    text: response.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("\n"),
    stopReason: response.stopReason,
    ...(response.errorMessage ? { errorMessage: response.errorMessage } : {}),
    usage: { inputTokens: response.usage.input, outputTokens: response.usage.output, costUsd: response.usage.cost.total, costSource: "estimated" }
  };
}

type AiRunResultMessage = Extract<Parameters<typeof completeSimple>[1]["messages"][number], { role: "assistant" }>;

function emptyUsage(): AiRunResultMessage["usage"] {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
  };
}

function normalizeReasoning(
  profile: AiExecutionProfile
): "minimal" | "low" | "medium" | "high" | "xhigh" | undefined {
  if (!profile.reasoning) return undefined;
  return profile.reasoning;
}

function isKnownProvider(providerId: string): providerId is KnownProvider {
  return getProviders().some((candidate) => candidate === providerId);
}

function resolveCredential(providerId: string, store: ProviderCredentialStore): {
  value: string | undefined;
  source: "stored" | "environment" | "ambient" | "missing";
} {
  const stored = store.get(providerId);
  if (stored) return { value: stored, source: "stored" };
  const environment = getEnvApiKey(providerId);
  if (environment) return { value: environment, source: "environment" };
  if (providerId === "amazon-bedrock" || providerId === "google-vertex") {
    return { value: "<authenticated>", source: "ambient" };
  }
  return { value: undefined, source: "missing" };
}

function labelProvider(providerId: string): string {
  return providerId
    .split(/[-_]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  return [...new Map(values.map((value) => [key(value), value])).values()];
}
