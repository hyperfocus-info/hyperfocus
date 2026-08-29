import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  getAgentDir,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type SessionStats,
  type AgentSessionEvent
} from "@mariozechner/pi-coding-agent";
import { streamSimple, Type, type ImageContent, type SimpleStreamOptions } from "@mariozechner/pi-ai";
import type { ComposerReasoningStrength } from "@hyperfocus/ai-core/protocol";
import { transformAnthropicCachePayload } from "./anthropic-cache-payload";
import { isBrowserToolName } from "./browser-session-state";
import { debugLog } from "./logging";
import type { CacheableUserBlock } from "./prompt-cache-assembly";
import { buildPromptCacheKey, extractCachedInputTokens, type PromptCacheIdentity } from "./prompt-cache";
import { supportsGeminiExplicitCaching } from "./gemini-cached-contents";

export type PiAgentPromptKind = "planner" | "executor" | "subagent" | "aggregator" | "merge-resolver";

export type PiAgentMemorySearchInput = {
  queryText: string;
  tags?: string[];
  maxEntries?: number;
};

export type PiAgentMemorySearchResult = {
  text: string;
  count: number;
};

export type PiAgentPromptRequest = {
  kind: PiAgentPromptKind;
  cwd: string;
  modelId: string;
  prompt: string;
  images?: ImageContent[];
  cacheableUserBlocks?: CacheableUserBlock[];
  promptCacheIdentity?: PromptCacheIdentity;
  geminiCachedContentName?: string;
  abortSignal?: AbortSignal;
  readOnly?: boolean;
  reasoningStrength?: ComposerReasoningStrength;
  fastMode?: boolean;
  onTextDelta?: (delta: string) => void;
  onExecutionEvent?: (event: PiAgentExecutionEvent) => void;
  memorySearch?: (input: PiAgentMemorySearchInput) => Promise<PiAgentMemorySearchResult>;
  requestBrowserApproval?: (input: { toolCallId: string; toolName: string; args: unknown }) => Promise<{ approved: boolean }>;
};

export type PiAgentPromptResult = {
  text: string;
  contextUsage?: {
    tokens?: number;
    contextWindow: number;
    usagePercent?: number;
    sessionStats: SessionStats;
    cachedInputTokens?: number;
  };
};

export type PiAgentExecutionEvent =
  | { type: "session-created" }
  | { type: "activity" }
  | { type: "tool-start"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool-update"; toolCallId: string; toolName: string; args: unknown; partialResult: unknown }
  | { type: "tool-end"; toolCallId: string; toolName: string; result: unknown; isError: boolean };

export interface PiAgentExecutionController {
  readonly result: Promise<PiAgentPromptResult>;
  continueWithPrompt(prompt?: string): Promise<PiAgentPromptResult>;
  abort(): Promise<void>;
  dispose(): void;
}

export interface PiAgentAdapter {
  runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult>;
  startExecution(request: PiAgentPromptRequest): Promise<PiAgentExecutionController>;
  setApiKey(provider: PiApiKeyProvider, apiKey: string | undefined): void;
  hasApiKey(provider: PiApiKeyProvider): boolean;
}

export type SerializablePiAgentPromptRequest = Omit<
  PiAgentPromptRequest,
  "abortSignal" | "onTextDelta" | "onExecutionEvent" | "memorySearch" | "requestBrowserApproval"
>;

export type PiSdkPromptWorkerRequest = {
  id: string;
  request: SerializablePiAgentPromptRequest;
  apiKeys: Partial<Record<PiApiKeyProvider, string>>;
  autoCompactContextThresholdPercent: number;
};

export type PiSdkPromptWorkerResponse =
  | { id: string; ok: true; result: PiAgentPromptResult }
  | { id: string; ok: false; error: { message: string; stack?: string } };

export type PiPromptWorker = {
  onmessage: ((event: MessageEvent<PiSdkPromptWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => unknown) | null;
  onmessageerror: ((event: MessageEvent) => unknown) | null;
  postMessage(payload: PiSdkPromptWorkerRequest): void;
  terminate(): void;
};

export function toSerializablePromptRequest(request: PiAgentPromptRequest): SerializablePiAgentPromptRequest {
  const {
    abortSignal: _abortSignal,
    onTextDelta: _onTextDelta,
    onExecutionEvent: _onExecutionEvent,
    memorySearch: _memorySearch,
    requestBrowserApproval: _requestBrowserApproval,
    ...serializable
  } = request;
  return serializable;
}

function createAbortError() {
  const error = new Error("Execution aborted");
  error.name = "AbortError";
  return error;
}

const DEFAULT_AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT = 40;
const MIN_AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT = 10;
const MAX_AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT = 95;
const MIN_AUTO_COMPACTION_RESERVE_TOKENS = 8192;
const MIN_AUTO_COMPACTION_KEEP_RECENT_TOKENS = 4000;
const DEFAULT_AUTO_COMPACTION_KEEP_RECENT_TOKENS = 20000;
const FAST_OPENAI_PROVIDER = "openai";
const FAST_OPENAI_SERVICE_TIER = "priority";
const ANTHROPIC_PROVIDER = "anthropic";
const GOOGLE_PROVIDER = "google";

export type PiApiKeyProvider = "openai" | "google" | "anthropic";

type PiSdkAgentAdapterOptions = {
  offloadRunPrompt?: boolean;
  createPromptWorker?: () => PiPromptWorker;
};

export function clampAutoCompactContextThresholdPercent(value: number) {
  return Math.max(
    MIN_AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT,
    Math.min(MAX_AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT, Math.round(value))
  );
}

export function buildPiAutoCompactionSettings(contextWindow: number, thresholdPercent: number) {
  const normalizedThresholdPercent = clampAutoCompactContextThresholdPercent(thresholdPercent);
  const reserveTokens = Math.max(
    MIN_AUTO_COMPACTION_RESERVE_TOKENS,
    Math.round(contextWindow * (1 - normalizedThresholdPercent / 100))
  );
  const keepRecentTokens = Math.max(
    MIN_AUTO_COMPACTION_KEEP_RECENT_TOKENS,
    Math.min(DEFAULT_AUTO_COMPACTION_KEEP_RECENT_TOKENS, Math.floor(contextWindow * 0.1))
  );

  return {
    enabled: true,
    reserveTokens,
    keepRecentTokens
  };
}

export function mapReasoningStrengthToThinkingLevel(
  reasoningStrength: ComposerReasoningStrength | undefined
): "low" | "medium" | "high" | "xhigh" {
  switch (reasoningStrength) {
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "extra-high":
      return "xhigh";
    case "high":
    default:
      return "high";
  }
}

function createPiWorkerPromptRunner(
  options: PiSdkAgentAdapterOptions,
  runtimeApiKeys: Partial<Record<PiApiKeyProvider, string>>,
  getAutoCompactContextThresholdPercent: () => number
) {
  function runPromptInWorker(request: PiAgentPromptRequest) {
    const worker = createPromptWorker();
    const id = crypto.randomUUID();
    const payload: PiSdkPromptWorkerRequest = {
      id,
      request: toSerializablePromptRequest(request),
      apiKeys: { ...runtimeApiKeys },
      autoCompactContextThresholdPercent: getAutoCompactContextThresholdPercent()
    };

    debugLog("agent.prompt.worker.start", {
      id,
      kind: request.kind,
      modelId: request.modelId
    });

    return new Promise<PiAgentPromptResult>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        request.abortSignal?.removeEventListener("abort", abortHandler);
        worker.onmessage = null;
        worker.onerror = null;
        worker.onmessageerror = null;
      };
      const settle = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        worker.terminate();
        callback();
      };
      const abortHandler = () => {
        debugLog("agent.prompt.worker.abort", {
          id,
          kind: request.kind,
          modelId: request.modelId
        });
        settle(() => reject(createAbortError()));
      };

      worker.onmessage = (event: MessageEvent<PiSdkPromptWorkerResponse>) => {
        const response = event.data;
        if (!response || response.id !== id) {
          return;
        }

        if (response.ok) {
          debugLog("agent.prompt.worker.complete", {
            id,
            kind: request.kind,
            modelId: request.modelId
          });
          settle(() => resolve(response.result));
          return;
        }

        debugLog("agent.prompt.worker.failed", {
          id,
          kind: request.kind,
          modelId: request.modelId,
          error: response.error.message
        });
        settle(() => reject(Object.assign(new Error(response.error.message), { stack: response.error.stack })));
      };
      worker.onerror = (event) => {
        const message = event.message || "Pi prompt worker failed";
        debugLog("agent.prompt.worker.error", {
          id,
          kind: request.kind,
          modelId: request.modelId,
          error: message
        });
        settle(() => reject(new Error(message)));
      };
      worker.onmessageerror = () => {
        debugLog("agent.prompt.worker.message-error", {
          id,
          kind: request.kind,
          modelId: request.modelId
        });
        settle(() => reject(new Error("Pi prompt worker message failed")));
      };

      request.abortSignal?.addEventListener("abort", abortHandler, { once: true });
      if (request.abortSignal?.aborted) {
        abortHandler();
        return;
      }

      worker.postMessage(payload);
    });
  }

  function createPromptWorker() {
    return (
      options.createPromptWorker?.() ??
      new Worker(new URL("./pi-sdk-prompt-worker.ts", import.meta.url), {
        type: "module"
      })
    );
  }

  return runPromptInWorker;
}

function createPiModelRegistryTools(authStorage: AuthStorage, modelRegistry: ModelRegistry) {
  function resolveModel(modelRegistry: ModelRegistry, modelId: string) {
    const [provider, providerModelId] = modelId.split("/", 2);

    if (provider !== "openai" && provider !== "google" && provider !== "anthropic") {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    const model = modelRegistry.find(provider, providerModelId);
    if (!model) {
      throw new Error(`Unknown provider model: ${modelId}`);
    }

    return model;
  }

  function createExecutionModelRegistry(request: PiAgentPromptRequest) {
    const shouldWrapOpenAi = Boolean(
      request.modelId.startsWith(`${FAST_OPENAI_PROVIDER}/`) && (request.fastMode || request.promptCacheIdentity)
    );
    const shouldWrapAnthropic = request.modelId.startsWith(`${ANTHROPIC_PROVIDER}/`);
    const shouldWrapGoogle = Boolean(
      request.geminiCachedContentName &&
        request.modelId.startsWith(`${GOOGLE_PROVIDER}/`) &&
        supportsGeminiExplicitCaching(request.modelId)
    );
    if (!shouldWrapOpenAi && !shouldWrapAnthropic && !shouldWrapGoogle) {
      return modelRegistry;
    }

    const executionRegistry = ModelRegistry.inMemory(authStorage);
    if (shouldWrapOpenAi) {
      registerOpenAiProvider(executionRegistry, request);
    }
    if (shouldWrapAnthropic) {
      registerAnthropicCacheProvider(executionRegistry, request);
    }
    if (shouldWrapGoogle) {
      registerGoogleCachedContentProvider(executionRegistry, request);
    }

    return executionRegistry;
  }

  function registerOpenAiProvider(modelRegistry: ModelRegistry, request: PiAgentPromptRequest) {
    const openAiModels = modelRegistry.getAll().filter((model) => model.provider === FAST_OPENAI_PROVIDER);
    const baseModel = openAiModels[0];
    if (!baseModel || !baseModel.baseUrl) {
      return;
    }
    modelRegistry.registerProvider(FAST_OPENAI_PROVIDER, {
      api: baseModel.api,
      baseUrl: baseModel.baseUrl,
      apiKey: "OPENAI_API_KEY",
      streamSimple(model, context, options) {
        const streamOptions: SimpleStreamOptions & { serviceTier?: string } = {
          ...options,
          ...(request.promptCacheIdentity
            ? { sessionId: buildPromptCacheKey(request.promptCacheIdentity), cacheRetention: "long" }
            : {}),
          ...(request.fastMode ? { serviceTier: FAST_OPENAI_SERVICE_TIER } : {})
        };
        return streamSimple(model, context, streamOptions);
      },
      models: openAiModels.map((model) => ({
        id: model.id,
        name: model.name,
        api: model.api,
        reasoning: model.reasoning,
        input: [...model.input],
        cost: { ...model.cost },
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        headers: model.headers,
        compat: model.compat
      }))
    });
  }

  function registerGoogleCachedContentProvider(modelRegistry: ModelRegistry, request: PiAgentPromptRequest) {
    const googleModels = modelRegistry.getAll().filter((model) => model.provider === GOOGLE_PROVIDER);
    const baseModel = googleModels[0];
    if (!baseModel || !baseModel.baseUrl) {
      return;
    }

    modelRegistry.registerProvider(GOOGLE_PROVIDER, {
      api: baseModel.api,
      baseUrl: baseModel.baseUrl,
      apiKey: "GEMINI_API_KEY",
      streamSimple(model, context, options) {
        return streamSimple(model, context, {
          ...options,
          async onPayload(payload, payloadModel) {
            const nextPayload = injectGeminiCachedContent(payload, payloadModel, request.geminiCachedContentName);
            return (await options?.onPayload?.(nextPayload, payloadModel)) ?? nextPayload;
          }
        });
      },
      models: googleModels.map((model) => ({
        id: model.id,
        name: model.name,
        api: model.api,
        reasoning: model.reasoning,
        input: [...model.input],
        cost: { ...model.cost },
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        headers: model.headers,
        compat: model.compat
      }))
    });
  }

  function registerAnthropicCacheProvider(modelRegistry: ModelRegistry, request: PiAgentPromptRequest) {
    const anthropicModels = modelRegistry.getAll().filter((model) => model.provider === ANTHROPIC_PROVIDER);
    const baseModel = anthropicModels[0];
    if (!baseModel || !baseModel.baseUrl) {
      return;
    }

    modelRegistry.registerProvider(ANTHROPIC_PROVIDER, {
      api: baseModel.api,
      baseUrl: baseModel.baseUrl,
      apiKey: "ANTHROPIC_API_KEY",
      streamSimple(model, context, options) {
        return streamSimple(model, context, {
          ...options,
          cacheRetention: "long",
          async onPayload(payload, payloadModel) {
            const transformed = transformAnthropicCachePayload({
              payload,
              model: payloadModel,
              cacheableUserBlocks: request.cacheableUserBlocks
            });
            const nextPayload = transformed ?? payload;
            return (await options?.onPayload?.(nextPayload, payloadModel)) ?? nextPayload;
          }
        });
      },
      models: anthropicModels.map((model) => ({
        id: model.id,
        name: model.name,
        api: model.api,
        reasoning: model.reasoning,
        input: [...model.input],
        cost: { ...model.cost },
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        headers: model.headers,
        compat: model.compat
      }))
    });
  }

  return { resolveModel, createExecutionModelRegistry };
}
export function createPiSdkAgentAdapter(
    options: PiSdkAgentAdapterOptions = {}
  ) {
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  const runtimeApiKeys: Partial<Record<PiApiKeyProvider, string>> = {};
  let autoCompactContextThresholdPercent = DEFAULT_AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT;
  const runPromptInWorker = createPiWorkerPromptRunner(
    options,
    runtimeApiKeys,
    () => autoCompactContextThresholdPercent
  );
  const { resolveModel, createExecutionModelRegistry } = createPiModelRegistryTools(authStorage, modelRegistry);

  function setApiKey(provider: PiApiKeyProvider, apiKey: string | undefined) {
    const normalizedKey = apiKey?.trim() || undefined;
    if (normalizedKey) {
      runtimeApiKeys[provider] = normalizedKey;
      authStorage.setRuntimeApiKey(provider, normalizedKey);
      return;
    }

    delete runtimeApiKeys[provider];
    authStorage.removeRuntimeApiKey(provider);
  }

  function hasApiKey(provider: PiApiKeyProvider) {
    return authStorage.hasAuth(provider);
  }

  function setAutoCompactContextThresholdPercent(thresholdPercent: number) {
    autoCompactContextThresholdPercent = clampAutoCompactContextThresholdPercent(thresholdPercent);
  }

  async function runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
    if (shouldOffloadRunPrompt(request)) {
      return runPromptInWorker(request);
    }

    const controller = await startExecution(request);
    try {
      return await controller.result;
    } finally {
      controller.dispose();
    }
  }

  function shouldOffloadRunPrompt(request: PiAgentPromptRequest) {
    return Boolean(
      options.offloadRunPrompt !== false &&
        !request.onTextDelta &&
        !request.onExecutionEvent &&
        !request.memorySearch &&
        !request.requestBrowserApproval
    );
  }


  async function startExecution(request: PiAgentPromptRequest): Promise<PiAgentExecutionController> {
    const modelRegistry = createExecutionModelRegistry(request);
    const model = resolveModel(modelRegistry, request.modelId);
    const toolNames = request.readOnly ? ["read", "grep", "find", "ls"] : ["read", "bash", "edit", "write"];
    const settingsManager = SettingsManager.inMemory({
      compaction: buildPiAutoCompactionSettings(model.contextWindow, autoCompactContextThresholdPercent),
      retry: { enabled: true, maxRetries: 1 }
    });
    const resourceLoader = request.requestBrowserApproval || request.memorySearch
      ? await createResourceLoader(request, settingsManager) : undefined;
    const { session } = await createAgentSession({
      cwd: request.cwd,
      authStorage: authStorage,
      modelRegistry,
      model,
      thinkingLevel: mapReasoningStrengthToThinkingLevel(request.reasoningStrength),
      tools: toolNames,
      resourceLoader,
      sessionManager: SessionManager.inMemory(request.cwd),
      settingsManager
    });

    return createPiSdkExecutionController(session, request, model.contextWindow, (event) => handleEvent(event, request));
  }


  function handleEvent(event: AgentSessionEvent, request: PiAgentPromptRequest) {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      request.onExecutionEvent?.({ type: "activity" });
      request.onTextDelta?.(event.assistantMessageEvent.delta);
      return;
    }

    if (event.type === "tool_execution_start") {
      request.onExecutionEvent?.({ type: "activity" });
      request.onExecutionEvent?.({
        type: "tool-start",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args
      });
      debugLog("agent.tool.start", {
        kind: request.kind,
        modelId: request.modelId,
        tool: event.toolName
      });
      return;
    }

    if (event.type === "tool_execution_update") {
      request.onExecutionEvent?.({ type: "activity" });
      request.onExecutionEvent?.({
        type: "tool-update",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
        partialResult: event.partialResult
      });
      return;
    }

    if (event.type === "tool_execution_end") {
      request.onExecutionEvent?.({ type: "activity" });
      request.onExecutionEvent?.({
        type: "tool-end",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        result: event.result,
        isError: event.isError
      });
      debugLog("agent.tool.end", {
        kind: request.kind,
        modelId: request.modelId,
        tool: event.toolName,
        isError: event.isError
      });
    }
  }

  async function createResourceLoader(request: PiAgentPromptRequest, settingsManager: SettingsManager) {
    return createPiResourceLoader(request, settingsManager);
  }

  return { setApiKey, hasApiKey, setAutoCompactContextThresholdPercent, runPrompt, startExecution };
}

export type PiSdkAgentAdapter = ReturnType<typeof createPiSdkAgentAdapter>;

async function createPiResourceLoader(request: PiAgentPromptRequest, settingsManager: SettingsManager) {
  const loader = new DefaultResourceLoader({
    cwd: request.cwd,
    agentDir: getAgentDir(),
    settingsManager,
    extensionFactories: [
      (pi) => {
        const memorySearch = request.memorySearch;
        if (memorySearch) {
          pi.registerTool(defineTool({
            name: "memory_search",
            label: "Search project notes",
            description: "Pull a small set of explicitly saved project notes only when prior project context is needed. Search by concrete terms and optional semantic tags such as feature:frontend-refactor. Results are not loaded unless this tool is called.",
            parameters: Type.Object({
              query: Type.String({ minLength: 1, maxLength: 2000, description: "Concrete terms describing the prior context needed" }),
              tags: Type.Optional(Type.Array(Type.String({
                minLength: 3,
                maxLength: 97,
                pattern: "^[a-z][a-z0-9-]{0,31}:[a-z0-9][a-z0-9-]{0,63}$"
              }), { maxItems: 6 })),
              limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 4 }))
            }),
            async execute(_toolCallId, params) {
              const result = await memorySearch({
                queryText: params.query,
                tags: params.tags,
                maxEntries: params.limit
              });
              return {
                content: [{ type: "text", text: result.text }],
                details: { count: result.count }
              };
            }
          }));
        }

        pi.on("tool_call", async (event) => {
          if (!request.requestBrowserApproval || !isBrowserToolName(event.toolName)) {
            return;
          }

          const decision = await request.requestBrowserApproval({
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: event.input
          });
          if (decision.approved) {
            return;
          }

          return {
            block: true,
            reason: "Browser action rejected in harness approval gate"
          };
        });
      }
    ]
  });
  await loader.reload();
  return loader;
}

function createPiSdkExecutionController(
    session: Awaited<ReturnType<typeof createAgentSession>>["session"],
    request: PiAgentPromptRequest,
    contextWindow: number,
    onSessionEvent: (event: AgentSessionEvent) => void
  ) {
    let disposed = false;
    let lastSessionEventSummary = "session-created";
    let running = false;
    const unsubscribe = session.subscribe((event) => {
      lastSessionEventSummary = summarizeSessionEvent(event);
      onSessionEvent(event);
    });
    request.onExecutionEvent?.({ type: "session-created" });

    const abortHandler = request.abortSignal
      ? async () => {
          await abort();
        }
      : undefined;

    if (abortHandler) {
      request.abortSignal?.addEventListener("abort", abortHandler, { once: true });
    }

  function continueWithPrompt(prompt: string = "continue") {
    return run(prompt);
  }

  async function abort() {
    debugLog("agent.abort", {
      kind: request.kind,
      modelId: request.modelId
    });
    await session.abort();
  }

  function dispose() {
    if (disposed) {
      return;
    }

    disposed = true;
    if (abortHandler) {
      request.abortSignal?.removeEventListener("abort", abortHandler);
    }
    unsubscribe();
    session.dispose();
  }

  function run(prompt: string) {
    if (disposed) {
      return Promise.reject(new Error("Execution controller is disposed"));
    }

    if (running) {
      return Promise.reject(new Error("Execution already running"));
    }

    running = true;
    const currentResult = (async () => {
      await promptSession(session, prompt, request.images, request.abortSignal, lastSessionEventSummary);
      let text = session.getLastAssistantText()?.trim();

      if (!text && prompt.trim().toLowerCase() !== "continue") {
        await promptSession(session, "continue", request.images, request.abortSignal, lastSessionEventSummary);
        text = session.getLastAssistantText()?.trim();
      }

      if (!text) {
        const sessionStats = session.getSessionStats();
        throw createPiExecutionError(
          "empty-response",
          "Pi agent returned an empty response",
          lastSessionEventSummary,
          sessionStats
        );
      }

      const sessionStats = session.getSessionStats();
      if (request.modelId.startsWith("anthropic/") && sessionStats.tokens.cacheWrite > 0) {
        debugLog("agent.cache.creation", {
          providerBrand: "claude",
          modelId: request.modelId,
          cacheCreationInputTokens: sessionStats.tokens.cacheWrite
        });
      }
      const tokens = sessionStats.contextUsage?.tokens ?? undefined;
      const cachedInputTokens = extractCachedInputTokens(sessionStats);
      return {
        text,
        contextUsage: {
          tokens,
          contextWindow: contextWindow,
          usagePercent: tokens === undefined ? undefined : Math.min(100, (tokens / contextWindow) * 100),
          sessionStats,
          cachedInputTokens
        }
      };
    })().finally(() => {
      running = false;
    });

    return currentResult;
  }

  const result = run(request.prompt);
  return { result, continueWithPrompt, abort, dispose };
}

function summarizeSessionEvent(event: AgentSessionEvent) {
  switch (event.type) {
    case "message_update":
      return `message_update:${event.assistantMessageEvent.type}`;
    case "tool_execution_start":
      return `tool_execution_start:${event.toolName}`;
    case "tool_execution_update":
      return `tool_execution_update:${event.toolName}`;
    case "tool_execution_end":
      return `tool_execution_end:${event.toolName}:${event.isError ? "error" : "ok"}`;
    default:
      return event.type;
  }
}

function createPiExecutionError(
  category: "empty-response" | "stream-disconnect" | "invalid-json" | "unknown",
  message: string,
  lastEvent: string,
  sessionStats: SessionStats
) {
  const stats = sessionStats.contextUsage?.tokens;
  return new Error(
    `${message} [category=${category}] [last-event=${lastEvent}]${stats === undefined ? "" : ` [tokens=${stats}]`}`
  );
}

async function promptSession(
  session: Awaited<ReturnType<typeof createAgentSession>>["session"],
  prompt: string,
  images: PiAgentPromptRequest["images"],
  abortSignal: AbortSignal | undefined,
  lastEvent: string
) {
  try {
    await session.prompt(prompt, { images });
  } catch (error) {
    if (abortSignal?.aborted || isAbortLikeError(error)) {
      throw error;
    }
    throw createPiExecutionError("stream-disconnect", "Pi agent stream transport failed", lastEvent, session.getSessionStats());
  }
}

function isAbortLikeError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  const normalized = error.message.toLowerCase();
  return error.name === "AbortError" || normalized.includes("abort") || normalized.includes("cancel");
}

function injectGeminiCachedContent(payload: unknown, model: { provider: string; api: string }, cachedContentName: string | undefined) {
  if (
    !cachedContentName ||
    model.provider !== GOOGLE_PROVIDER ||
    model.api !== "google-generative-ai" ||
    !isRecord(payload)
  ) {
    return payload;
  }

  return {
    ...payload,
    config: {
      ...(isRecord(payload.config) ? payload.config : {}),
      cachedContent: cachedContentName
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export const testExports = {
  createPiResourceLoader
};
