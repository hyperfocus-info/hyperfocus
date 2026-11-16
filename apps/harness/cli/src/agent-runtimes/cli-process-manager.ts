import { spawnBackgroundProcess, terminateProcessTree as terminateOwnedProcessTree, type OwnedProcess } from "@hyperfocus/desktop-runtime/process";
import { createBoundedOutputBuffer, formatOutputCapExceeded } from "../bounded-output-buffer";
import { buildToolchainPath } from "./toolchain";

export type CliProcessEnvInput = {
  cols: number;
  rows: number;
  extraEnv?: Record<string, string | undefined>;
};

export type CliProcessExecutionResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  hangDetected: boolean;
  timedOut: boolean;
  outputLimitExceeded?: boolean;
  outputLimitMessage?: string;
};

export type InteractiveCliProcess = {
  readonly proc: OwnedProcess;
  readonly stdoutText: () => string;
  readonly stderrText: () => string;
  readonly settled: Promise<{ exitCode: number }>;
  write(data: Uint8Array): Promise<void>;
  stop(): Promise<void>;
};

type NonInteractiveOptions = {
  cmd: string[];
  cwd: string;
  cols: number;
  rows: number;
  env?: Record<string, string | undefined>;
  idleTimeoutMs: number;
  totalTimeoutMs: number;
  abortSignal?: AbortSignal;
  onStdout?: (chunk: Uint8Array) => void;
  onStderr?: (chunk: Uint8Array) => void;
};

type InteractiveOptions = {
  cmd: string[];
  cwd: string;
  cols: number;
  rows: number;
  env?: Record<string, string | undefined>;
  onStdout?: (chunk: Uint8Array) => void;
  onStderr?: (chunk: Uint8Array) => void;
  onExit?: (exitCode: number) => void;
};

const WATCHDOG_POLL_MS = 250;
export const CLI_PROCESS_OUTPUT_CAP_BYTES = 2097152;

export function buildCliProcessEnv(input: CliProcessEnvInput) {
  const pathValue = buildToolchainPath({ basePath: Bun.env.PATH }) ?? Bun.env.PATH ?? "";
  return {
    ...Bun.env,
    PATH: pathValue,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    FORCE_COLOR: "1",
    LINES: String(input.rows),
    COLUMNS: String(input.cols),
    CI: "true",
    PYTHONUNBUFFERED: "1",
    EDITOR: "cat",
    PAGER: "cat",
    ...input.extraEnv
  };
}

export type CliProcessManager = {
  runNonInteractive(options: NonInteractiveOptions): Promise<CliProcessExecutionResult>;
  startInteractive(options: InteractiveOptions): InteractiveCliProcess;
};

export function createCliProcessManager(): CliProcessManager {
  async function runNonInteractive(options: NonInteractiveOptions): Promise<CliProcessExecutionResult> {
    options.abortSignal?.throwIfAborted();
    const proc = spawnBackgroundProcess({
      cmd: options.cmd,
      cwd: options.cwd,
      env: buildCliProcessEnv({
        cols: options.cols,
        rows: options.rows,
        extraEnv: options.env
      }),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe"
    });

    const stdout = createBoundedOutputBuffer(CLI_PROCESS_OUTPUT_CAP_BYTES);
    const stderr = createBoundedOutputBuffer(CLI_PROCESS_OUTPUT_CAP_BYTES);
    const startedAt = Date.now();
    let lastOutputAt = Date.now();
    let hangDetected = false;
    let timedOut = false;
    let outputLimitExceeded = false;
    let outputLimitMessage: string | undefined;
    let settled = false;

    const stdoutReader = consumeStream(proc.stdout, {
      onChunk: (chunk) => {
        const snapshot = stdout.append(chunk);
        lastOutputAt = Date.now();
        options.onStdout?.(chunk);
        if (snapshot.exceeded && !outputLimitExceeded) {
          outputLimitExceeded = true;
          outputLimitMessage = formatOutputCapExceeded("stdout", snapshot);
          void terminateProcessTree(proc);
        }
      }
    });
    const stderrReader = consumeStream(proc.stderr, {
      onChunk: (chunk) => {
        const snapshot = stderr.append(chunk);
        lastOutputAt = Date.now();
        options.onStderr?.(chunk);
        if (snapshot.exceeded && !outputLimitExceeded) {
          outputLimitExceeded = true;
          outputLimitMessage = formatOutputCapExceeded("stderr", snapshot);
          void terminateProcessTree(proc);
        }
      }
    });

    const watchdog = setInterval(async () => {
      if (settled) {
        return;
      }

      const now = Date.now();
      if (options.totalTimeoutMs > 0 && now - startedAt >= options.totalTimeoutMs) {
        timedOut = true;
        hangDetected = true;
        await terminateProcessTree(proc);
        return;
      }

      if (options.idleTimeoutMs > 0 && now - lastOutputAt >= options.idleTimeoutMs) {
        hangDetected = true;
        await terminateProcessTree(proc);
      }
    }, WATCHDOG_POLL_MS);

    const abortHandler = async () => {
      await terminateProcessTree(proc);
    };
    options.abortSignal?.addEventListener("abort", abortHandler, { once: true });

    try {
      const [exitCode] = await Promise.all([proc.exited, stdoutReader, stderrReader]);
      settled = true;
      clearInterval(watchdog);
      options.abortSignal?.removeEventListener("abort", abortHandler);
      return {
        stdout: stdout.text(),
        stderr: stderr.text(),
        exitCode,
        hangDetected,
        timedOut,
        outputLimitExceeded,
        outputLimitMessage
      };
    } finally {
      settled = true;
      clearInterval(watchdog);
      options.abortSignal?.removeEventListener("abort", abortHandler);
      if (proc.exitCode === null) await terminateProcessTree(proc);
    }
  }

  function startInteractive(options: InteractiveOptions): InteractiveCliProcess {
    const proc = spawnBackgroundProcess({
      cmd: options.cmd,
      cwd: options.cwd,
      env: buildCliProcessEnv({
        cols: options.cols,
        rows: options.rows,
        extraEnv: options.env
      }),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe"
    });

    const stdout = createBoundedOutputBuffer(CLI_PROCESS_OUTPUT_CAP_BYTES);
    const stderr = createBoundedOutputBuffer(CLI_PROCESS_OUTPUT_CAP_BYTES);

    const stdoutReader = consumeStream(proc.stdout, {
      onChunk: (chunk) => {
        stdout.append(chunk);
        options.onStdout?.(chunk);
      }
    });
    const stderrReader = consumeStream(proc.stderr, {
      onChunk: (chunk) => {
        stderr.append(chunk);
        options.onStderr?.(chunk);
      }
    });

    const settled = (async () => {
      const exitCode = await proc.exited;
      await Promise.all([stdoutReader, stderrReader]);
      options.onExit?.(exitCode);
      return { exitCode };
    })();

    return {
      proc,
      stdoutText: () => stdout.text(),
      stderrText: () => stderr.text(),
      settled,
      async write(data: Uint8Array) {
        await proc.stdin.write(data);
      },
      async stop() {
        await terminateProcessTree(proc);
      }
    };
  }

  return { runNonInteractive, startInteractive };
}

async function consumeStream(
  stream: ReadableStream<Uint8Array>,
  options: {
    onChunk: (chunk: Uint8Array) => void;
  }
) {
  const reader = stream.getReader();
  try {
    while (true) {
      const next = await readStreamChunk(reader);
      if (next.done) {
        return;
      }

      options.onChunk(next.value);
    }
  } finally {
    releaseStreamReaderLock(reader);
  }
}

async function readStreamChunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<{ done: true } | { done: false; value: Uint8Array }> {
  try {
    const result = await reader.read();
    return result.done ? { done: true } : { done: false, value: result.value };
  } catch (error) {
    if (isStreamReaderCancelledError(error)) {
      return { done: true };
    }
    throw error;
  }
}

function releaseStreamReaderLock(reader: ReadableStreamDefaultReader<Uint8Array>) {
  try {
    reader.releaseLock();
  } catch (error) {
    if (!isStreamReaderCancelledError(error)) {
      throw error;
    }
  }
}

function isStreamReaderCancelledError(error: unknown) {
  return error instanceof Error && error.name === "AbortError" && error.message.includes("releaseLock");
}

export function terminateProcessTree(proc: OwnedProcess) {
  return terminateOwnedProcessTree({ process: proc });
}
