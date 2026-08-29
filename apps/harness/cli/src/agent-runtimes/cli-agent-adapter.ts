import type {
  PiAgentAdapter,
  PiAgentExecutionController,
  PiAgentPromptRequest,
  PiAgentPromptResult,
  PiApiKeyProvider
} from "../pi-agent-adapter";
import { debugLog } from "../logging";
import { createCliProcessManager, type CliProcessManager } from "./cli-process-manager";

export type CliCommandFactoryInput = {
  request: PiAgentPromptRequest;
  prompt: string;
};

export type CliCommandFactoryResult = {
  cmd: string[];
  cwd: string;
  env?: Record<string, string | undefined>;
  parser?: {
    onStdoutChunk?: (chunkText: string, emitDelta: (delta: string) => void) => void;
    getText: (stdout: string, stderr: string) => string;
  };
};

type CliAgentAdapterOptions = {
  label: string;
  buildCommand: (input: CliCommandFactoryInput) => CliCommandFactoryResult;
};

const DEFAULT_IDLE_TIMEOUT_MS = 60_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 15 * 60_000;

export function createCliAgentAdapter(options: CliAgentAdapterOptions): PiAgentAdapter {
  const processManager = createCliProcessManager();
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
    return createCliExecutionController(processManager, options, request);
  }

  return { setApiKey, hasApiKey, runPrompt, startExecution };
}

function createCliExecutionController(
  processManager: CliProcessManager,
  options: CliAgentAdapterOptions,
  request: PiAgentPromptRequest,
): PiAgentExecutionController {
  const abortController = new AbortController();
  let currentExecutionAbortController = abortController;
  let disposed = false;

  function continueWithPrompt(prompt: string = "continue") {
    return execute(prompt);
  }

  async function abort() {
    currentExecutionAbortController.abort();
  }

  function dispose() {
    disposed = true;
    abortController.abort();
  }

  async function execute(prompt: string): Promise<PiAgentPromptResult> {
    if (disposed) {
      throw new Error("Execution controller is disposed");
    }

    const executionAbortController = new AbortController();
    currentExecutionAbortController = executionAbortController;
    request.onExecutionEvent?.({ type: "session-created" });

    const command = options.buildCommand({
      request,
      prompt
    });
    debugLog("cli.exec.start", {
      label: options.label,
      kind: request.kind
    });

    let sawOutput = false;
    let result;
    try {
      result = await processManager.runNonInteractive({
        cmd: command.cmd,
        cwd: command.cwd,
        env: command.env,
        cols: 120,
        rows: 40,
        idleTimeoutMs: DEFAULT_IDLE_TIMEOUT_MS,
        totalTimeoutMs: DEFAULT_TOTAL_TIMEOUT_MS,
        abortSignal: mergeAbortSignals(request.abortSignal, executionAbortController.signal),
        onStdout: (chunk) => {
          sawOutput = true;
          request.onExecutionEvent?.({ type: "activity" });
          command.parser?.onStdoutChunk?.(decodeChunk(chunk), (delta) => request.onTextDelta?.(delta));
        },
        onStderr: () => {
          sawOutput = true;
          request.onExecutionEvent?.({ type: "activity" });
        }
      });
    } catch (error) {
      debugLog("cli.exec.error", {
        label: options.label,
        kind: request.kind
      });
      throw error;
    }

    if (result.hangDetected || result.timedOut) {
      throw new Error("Hanging/Interactive Prompt Detected");
    }

    const text = command.parser?.getText(result.stdout, result.stderr) ?? result.stdout.trim();
    debugLog("cli.exec.done", {
      label: options.label,
      kind: request.kind,
      exitCode: result.exitCode,
      hangDetected: result.hangDetected,
      timedOut: result.timedOut
    });
    if (result.exitCode !== 0) {
      throw new Error(text || result.stderr.trim() || `${options.label} exited with code ${result.exitCode}`);
    }

    if (!text.trim() && !sawOutput) {
      throw new Error(`${options.label} returned an empty response`);
    }

    return {
      text: text.trim()
    };
  }

  const result = execute(request.prompt);
  return { result, continueWithPrompt, abort, dispose };
}

function mergeAbortSignals(left: AbortSignal | undefined, right: AbortSignal) {
  if (!left) {
    return right;
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  left.addEventListener("abort", abort, { once: true });
  right.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

function decodeChunk(chunk: Uint8Array) {
  return new TextDecoder().decode(chunk);
}
