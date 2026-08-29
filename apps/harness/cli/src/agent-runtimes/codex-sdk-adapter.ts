import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Codex, type CodexOptions } from "@openai/codex-sdk";
import { buildCliProcessEnv } from "./cli-process-manager";
import { resolveCodexSandboxMode } from "./codex-sandbox-policy";
import { buildGitRepositoryPromptContext } from "../git-context";
import type {
  PiAgentAdapter,
  PiAgentExecutionController,
  PiAgentPromptRequest,
  PiAgentPromptResult,
  PiApiKeyProvider
} from "../pi-agent-adapter";

const CODEX_TOOL_GUIDANCE = [
  "Use native Codex tools first for general work: shell and apply_patch for local repository changes, and live web search for external or current facts.",
  "Use repository skills when the user's task matches a listed skill; skill instructions override general tool preference for that workflow.",
  "Before relying on git commands, follow the Git repository state block in this prompt."
].join("\n");

type CodexSdkTextInput = {
  type: "text";
  text: string;
};

type CodexSdkImageInput = {
  type: "local_image";
  path: string;
};

type CodexSdkInput = string | Array<CodexSdkTextInput | CodexSdkImageInput>;

type CodexSdkRunStreamedResult = {
  events: AsyncGenerator<unknown>;
};

type CodexSdkTurnOptions = {
  signal?: AbortSignal;
};

type CodexSdkThreadOptions = {
  model?: string;
  sandboxMode?: "read-only" | "workspace-write" | "danger-full-access";
  workingDirectory?: string;
  skipGitRepoCheck?: boolean;
  approvalPolicy?: "never";
  modelReasoningEffort?: "low" | "medium" | "high" | "xhigh";
  networkAccessEnabled?: boolean;
  webSearchMode?: "disabled" | "cached" | "live";
};

type CodexSdkThreadLike = {
  runStreamed(input: CodexSdkInput, turnOptions?: CodexSdkTurnOptions): Promise<CodexSdkRunStreamedResult>;
};

type CodexSdkClientLike = {
  startThread(options?: CodexSdkThreadOptions): CodexSdkThreadLike;
};

type CodexSdkAdapterOptions = {
  executablePath: string;
  createClient?: (options: CodexOptions) => CodexSdkClientLike;
};

type CodexSdkCommandEvent = {
  id: string;
  type: "command_execution";
  command: string;
  aggregated_output: string;
  exit_code?: number;
  status: "in_progress" | "completed" | "failed";
};

type CodexSdkMcpEvent = {
  id: string;
  type: "mcp_tool_call";
  server: string;
  tool: string;
  arguments: unknown;
  result?: unknown;
  error?: { message: string };
  status: "in_progress" | "completed" | "failed";
};

type CodexSdkWebSearchEvent = {
  id: string;
  type: "web_search";
  query: string;
};

type CodexSdkAgentMessageEvent = {
  id: string;
  type: "agent_message";
  text: string;
};

function createDefaultClient(options: CodexOptions) {
  return new Codex(options);
}

export function createCodexSdkAdapter(options: CodexSdkAdapterOptions): PiAgentAdapter {
  function setApiKey(_provider: PiApiKeyProvider, _apiKey: string | undefined) {}
  function hasApiKey(_provider: PiApiKeyProvider) {
    return false;
  }

  async function runPrompt(request: PiAgentPromptRequest) {
    const controller = await startExecution(request);
    try {
      return await controller.result;
    } finally {
      controller.dispose();
    }
  }

  async function startExecution(request: PiAgentPromptRequest): Promise<PiAgentExecutionController> {
    const client = (options.createClient ?? createDefaultClient)({
      codexPathOverride: options.executablePath,
      env: buildCliProcessEnv({
        cols: 120,
        rows: 40
      })
    });
    const thread = client.startThread(buildThreadOptions(request));
    return createCodexSdkExecutionController(thread, request);
  }

  return { setApiKey, hasApiKey, runPrompt, startExecution };
}

function createCodexSdkExecutionController(thread: CodexSdkThreadLike, request: PiAgentPromptRequest): PiAgentExecutionController {
  let disposed = false;
  let currentAbortController: AbortController | undefined;
  let running = false;

  function continueWithPrompt(prompt: string = "continue") {
    return execute({
      ...request,
      prompt
    });
  }

  async function abort() {
    currentAbortController?.abort();
  }

  function dispose() {
    disposed = true;
    if (running) {
      currentAbortController?.abort();
    }
  }

  async function execute(nextRequest: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
    if (disposed) {
      throw new Error("Execution controller is disposed");
    }

    if (running) {
      throw new Error("Execution already running");
    }

    running = true;
    const abortController = new AbortController();
    currentAbortController = abortController;
    nextRequest.onExecutionEvent?.({ type: "session-created" });
    const imageInput = await materializeSdkInput(nextRequest, {
      promptText: buildCodexPromptWithPrelude(nextRequest)
    });
    const messageState = new Map<string, string>();
    let finalText = "";
    const usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };

    try {
      const signal = mergeAbortSignals(nextRequest.abortSignal, abortController.signal);
      const streamed = await runThreadWithCodexControls(thread, nextRequest, imageInput.input, signal);
      for await (const rawEvent of streamed.events) {
        nextRequest.onExecutionEvent?.({ type: "activity" });
        accumulateCodexUsage(rawEvent, usage);
        finalText = handleCodexSdkEvent(rawEvent, nextRequest, messageState, finalText);
      }

      if (!finalText.trim()) {
        throw new Error("Codex CLI returned an empty response");
      }

      return {
        text: finalText.trim(),
        contextUsage: createCodexContextUsage(nextRequest.modelId, usage)
      };
    } finally {
      running = false;
      currentAbortController = undefined;
      await imageInput.cleanup();
    }
  }

  const result = execute(request);
  return { result, continueWithPrompt, abort, dispose };
}

function buildThreadOptions(
  request: PiAgentPromptRequest,
  options: {
    platform?: NodeJS.Platform;
  } = {}
): CodexSdkThreadOptions {
  return {
    model: toCliModelName(request.modelId),
    sandboxMode: resolveCodexSandboxMode({
      readOnly: request.readOnly,
      platform: options.platform
    }),
    workingDirectory: request.cwd,
    skipGitRepoCheck: true,
    approvalPolicy: "never",
    modelReasoningEffort: mapReasoningStrengthToCodexEffort(request.reasoningStrength),
    networkAccessEnabled: !request.readOnly,
    webSearchMode: "live"
  };
}

async function materializeSdkInput(
  request: PiAgentPromptRequest,
  inputOverrides: { promptText?: string } = {}
): Promise<{ input: CodexSdkInput; cleanup: () => Promise<void> }> {
  const promptText = inputOverrides.promptText ?? request.prompt;
  if (!request.images?.length) {
    return {
      input: promptText,
      cleanup: async () => {}
    };
  }

  const tempRoot = await mkdtemp(path.join(tmpdir(), "harness-codex-images-"));
  const input: Array<CodexSdkTextInput | CodexSdkImageInput> = [{ type: "text", text: promptText }];
  for (const [index, image] of request.images.entries()) {
    const extension = getImageExtension(image.mimeType);
    const filePath = path.join(tempRoot, `image-${index + 1}${extension}`);
    await Bun.write(filePath, Buffer.from(image.data, "base64"));
    input.push({
      type: "local_image",
      path: filePath
    });
  }

  return {
    input,
    cleanup: async () => {
      await rm(tempRoot, {
        recursive: true,
        force: true
      });
    }
  };
}

function getImageExtension(mimeType: string) {
  switch (mimeType.toLowerCase()) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return ".bin";
  }
}

function handleCodexSdkEvent(
  rawEvent: unknown,
  request: PiAgentPromptRequest,
  messageState: Map<string, string>,
  priorFinalText: string
) {
  if (rawEvent === null || typeof rawEvent !== "object") return priorFinalText;
  const eventType = Reflect.get(rawEvent, "type");
  if (eventType === "turn.failed") {
    const error = Reflect.get(rawEvent, "error");
    const errorMessage = error !== null && typeof error === "object" ? Reflect.get(error, "message") : undefined;
    throw new Error(typeof errorMessage === "string" ? errorMessage : "Codex turn failed");
  }

  if (eventType === "error") {
    const message = Reflect.get(rawEvent, "message");
    throw new Error(typeof message === "string" ? message : "Codex stream failed");
  }

  const item = parseCodexSdkItem(Reflect.get(rawEvent, "item"));
  if (item?.type === "agent_message") {
    const nextText = item.text;
    const previousText = messageState.get(item.id) ?? "";
    if (nextText.startsWith(previousText)) {
      const delta = nextText.slice(previousText.length);
      if (delta) {
        request.onTextDelta?.(delta);
      }
    }
    messageState.set(item.id, nextText);
    if (eventType === "item.completed") {
      return nextText || priorFinalText;
    }
    return priorFinalText;
  }

  if (item?.type === "command_execution") {
    emitCommandExecutionEvent(request, typeof eventType === "string" ? eventType : undefined, item);
    return priorFinalText;
  }

  if (item?.type === "mcp_tool_call") {
    emitMcpToolEvent(request, typeof eventType === "string" ? eventType : undefined, item);
    return priorFinalText;
  }

  if (item?.type === "web_search") {
    emitWebSearchEvent(request, typeof eventType === "string" ? eventType : undefined, item);
    return priorFinalText;
  }

  return priorFinalText;
}

function accumulateCodexUsage(rawEvent: unknown, usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number }) {
  if (rawEvent === null || typeof rawEvent !== "object" || Reflect.get(rawEvent, "type") !== "turn.completed") return;
  const rawUsage = Reflect.get(rawEvent, "usage");
  if (rawUsage === null || typeof rawUsage !== "object") return;
  usage.inputTokens += readFiniteNumber(rawUsage, "input_tokens");
  usage.cachedInputTokens += readFiniteNumber(rawUsage, "cached_input_tokens");
  usage.outputTokens += readFiniteNumber(rawUsage, "output_tokens");
}

function parseCodexSdkItem(value: unknown): CodexSdkCommandEvent | CodexSdkMcpEvent | CodexSdkWebSearchEvent | CodexSdkAgentMessageEvent | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const id = Reflect.get(value, "id");
  const type = Reflect.get(value, "type");
  if (typeof id !== "string" || typeof type !== "string") return undefined;
  if (type === "agent_message") {
    const text = Reflect.get(value, "text");
    return typeof text === "string" ? { id, type, text } : undefined;
  }
  if (type === "web_search") {
    const query = Reflect.get(value, "query");
    return typeof query === "string" ? { id, type, query } : undefined;
  }
  const status = parseCodexItemStatus(Reflect.get(value, "status"));
  if (!status) return undefined;
  if (type === "command_execution") {
    const command = Reflect.get(value, "command");
    const aggregatedOutput = Reflect.get(value, "aggregated_output");
    const exitCode = Reflect.get(value, "exit_code");
    if (typeof command !== "string" || typeof aggregatedOutput !== "string" || (exitCode !== undefined && typeof exitCode !== "number")) return undefined;
    return { id, type, command, aggregated_output: aggregatedOutput, status, ...(typeof exitCode === "number" ? { exit_code: exitCode } : {}) };
  }
  if (type === "mcp_tool_call") {
    const server = Reflect.get(value, "server");
    const tool = Reflect.get(value, "tool");
    if (typeof server !== "string" || typeof tool !== "string") return undefined;
    const error = Reflect.get(value, "error");
    const errorMessage = error !== null && typeof error === "object" ? Reflect.get(error, "message") : undefined;
    return {
      id, type, server, tool, arguments: Reflect.get(value, "arguments"), result: Reflect.get(value, "result"), status,
      ...(typeof errorMessage === "string" ? { error: { message: errorMessage } } : {}),
    };
  }
  return undefined;
}

function parseCodexItemStatus(value: unknown): CodexSdkCommandEvent["status"] | undefined {
  return value === "in_progress" || value === "completed" || value === "failed" ? value : undefined;
}

function readFiniteNumber(record: object, field: string) {
  const value = Reflect.get(record, field);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function createCodexContextUsage(
  modelId: string,
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number }
): NonNullable<PiAgentPromptResult["contextUsage"]> | undefined {
  const totalProcessedTokens = usage.inputTokens + usage.outputTokens;
  if (totalProcessedTokens <= 0 && usage.cachedInputTokens <= 0) {
    return undefined;
  }

  const contextWindow = getCodexContextWindow(modelId);
  const sessionStats = {
    sessionFile: undefined,
    sessionId: "codex-sdk",
    userMessages: 1,
    assistantMessages: 1,
    toolCalls: 0,
    toolResults: 0,
    totalMessages: 2,
    contextUsage: {
      tokens: usage.inputTokens,
      contextWindow,
      percent: contextWindow > 0 ? Math.min(100, (usage.inputTokens / contextWindow) * 100) : 0
    },
    tokens: {
      input: usage.inputTokens,
      output: usage.outputTokens,
      cacheRead: usage.cachedInputTokens,
      cacheWrite: 0,
      total: totalProcessedTokens
    },
    cost: 0
  };

  return {
    tokens: usage.inputTokens,
    contextWindow,
    usagePercent: contextWindow > 0 ? Math.min(100, (usage.inputTokens / contextWindow) * 100) : undefined,
    sessionStats,
    cachedInputTokens: usage.cachedInputTokens
  };
}

async function runThreadWithCodexControls(
  thread: CodexSdkThreadLike,
  request: PiAgentPromptRequest,
  input: CodexSdkInput,
  signal: AbortSignal
) {
  const turnOptions = buildTurnOptions(request, signal);
  return thread.runStreamed(input, turnOptions);
}

function buildTurnOptions(_request: PiAgentPromptRequest, signal: AbortSignal): CodexSdkTurnOptions {
  return { signal };
}

function isCodexControlConfigurationError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("unknown") ||
    message.includes("unexpected") ||
    message.includes("unsupported") ||
    message.includes("invalid") ||
    message.includes("service tier") ||
    message.includes("effort")
  );
}

function mapReasoningStrengthToCodexEffort(reasoningStrength: PiAgentPromptRequest["reasoningStrength"]) {
  switch (reasoningStrength) {
    case "low":
      return "low" as const;
    case "medium":
      return "medium" as const;
    case "extra-high":
      return "xhigh" as const;
    case "high":
      return "high" as const;
    default:
      return undefined;
  }
}

function buildCodexPromptWithPrelude(request: PiAgentPromptRequest) {
  const prelude = buildCodexCommandPrelude(request);
  return [CODEX_TOOL_GUIDANCE, prelude, request.prompt].filter(Boolean).join("\n\n");
}

function buildCodexCommandPrelude(request: PiAgentPromptRequest) {
  const commands: string[] = [];
  if (request.fastMode) {
    commands.push("/fast");
  }
  return [buildGitRepositoryPromptContext(request.cwd), commands.join("\n")].filter(Boolean).join("\n");
}

function emitCommandExecutionEvent(
  request: PiAgentPromptRequest,
  eventType: string | undefined,
  item: CodexSdkCommandEvent
) {
  if (eventType === "item.started") {
    request.onExecutionEvent?.({
      type: "tool-start",
      toolCallId: item.id,
      toolName: "shell",
      args: {
        command: item.command
      }
    });
    return;
  }

  if (eventType === "item.updated") {
    request.onExecutionEvent?.({
      type: "tool-update",
      toolCallId: item.id,
      toolName: "shell",
      args: {
        command: item.command
      },
      partialResult: {
        output: item.aggregated_output,
        exitCode: item.exit_code,
        status: item.status
      }
    });
    return;
  }

  if (eventType === "item.completed") {
    request.onExecutionEvent?.({
      type: "tool-end",
      toolCallId: item.id,
      toolName: "shell",
      result: {
        command: item.command,
        output: item.aggregated_output,
        exitCode: item.exit_code,
        status: item.status
      },
      isError: item.status === "failed" || (item.exit_code ?? 0) !== 0
    });
  }
}

function emitMcpToolEvent(
  request: PiAgentPromptRequest,
  eventType: string | undefined,
  item: CodexSdkMcpEvent
) {
  const toolName = `${item.server}.${item.tool}`;
  if (eventType === "item.started") {
    request.onExecutionEvent?.({
      type: "tool-start",
      toolCallId: item.id,
      toolName,
      args: item.arguments
    });
    return;
  }

  if (eventType === "item.updated") {
    request.onExecutionEvent?.({
      type: "tool-update",
      toolCallId: item.id,
      toolName,
      args: item.arguments,
      partialResult: item.result ?? item.error
    });
    return;
  }

  if (eventType === "item.completed") {
    request.onExecutionEvent?.({
      type: "tool-end",
      toolCallId: item.id,
      toolName,
      result: item.result ?? item.error ?? null,
      isError: item.status === "failed"
    });
  }
}

function emitWebSearchEvent(
  request: PiAgentPromptRequest,
  eventType: string | undefined,
  item: CodexSdkWebSearchEvent
) {
  if (eventType === "item.started") {
    request.onExecutionEvent?.({
      type: "tool-start",
      toolCallId: item.id,
      toolName: "web_search",
      args: {
        query: item.query
      }
    });
    return;
  }

  if (eventType === "item.completed") {
    request.onExecutionEvent?.({
      type: "tool-end",
      toolCallId: item.id,
      toolName: "web_search",
      result: {
        query: item.query
      },
      isError: false
    });
  }
}

function mergeAbortSignals(left: AbortSignal | undefined, right: AbortSignal) {
  if (!left) {
    return right;
  }

  const controller = new AbortController();
  if (left.aborted || right.aborted) {
    controller.abort();
    return controller.signal;
  }

  const abort = () => controller.abort();
  left.addEventListener("abort", abort, { once: true });
  right.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

function toCliModelName(modelId: string | undefined) {
  if (!modelId) {
    return undefined;
  }

  return modelId.includes("/") ? modelId.split("/", 2)[1] : modelId;
}

function getCodexContextWindow(modelId: string) {
  const normalized = toCliModelName(modelId) ?? "";
  if (normalized.includes("mini")) {
    return 400000;
  }
  return 400000;
}

export const testExports = {
  buildThreadOptions,
  materializeSdkInput,
  getImageExtension,
  handleCodexSdkEvent,
  buildTurnOptions,
  buildCodexCommandPrelude,
  buildCodexPromptWithPrelude,
  isCodexControlConfigurationError,
  accumulateCodexUsage,
  createCodexContextUsage,
  CODEX_TOOL_GUIDANCE
};
