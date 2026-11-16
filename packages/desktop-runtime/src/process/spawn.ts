import spawn from "cross-spawn";
import type { Readable, Writable } from "node:stream";
import { ownBackgroundProcess } from "./ownership";
import { terminateProcessTree } from "./terminate";

type OutputMode = "pipe" | "ignore" | "inherit" | number;
type InputMode = OutputMode | Uint8Array;
type ProcessOptions = {
  cmd: readonly string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  stdin?: InputMode;
  stdout?: OutputMode;
  stderr?: OutputMode;
  detached?: boolean;
  timeout?: number;
  maxBuffer?: number;
  killSignal?: NodeJS.Signals | number;
  signal?: AbortSignal;
  /** Only durable, supervised services may outlive the invoking process. */
  keepAliveAfterParentExit?: boolean;
};
type OutputStream<Mode> = Mode extends "pipe" | undefined ? ReadableStream<Uint8Array> : null;
type InputSink<Mode> = Mode extends "pipe" ? ReturnType<typeof createInputSink> : null;

// The overload preserves stream mode inference at the Node stdio boundary;
// default outputs are pipes, while byte input is owned and closed by the adapter.
export function spawnBackgroundProcess<
  const Input extends InputMode = "ignore",
  const Output extends OutputMode = "pipe",
  const ErrorOutput extends OutputMode = "pipe",
>(options: Omit<ProcessOptions, "stdin" | "stdout" | "stderr"> & {
  stdin?: Input; stdout?: Output; stderr?: ErrorOutput;
}): Omit<ReturnType<typeof startBackgroundProcess>, "stdin" | "stdout" | "stderr"> & {
  stdin: InputSink<Input>; stdout: OutputStream<Output>; stderr: OutputStream<ErrorOutput>;
};
export function spawnBackgroundProcess(options: ProcessOptions) {
  return startBackgroundProcess(options);
}

function startBackgroundProcess(options: ProcessOptions) {
  options.signal?.throwIfAborted();
  if (options.maxBuffer !== undefined && (!Number.isSafeInteger(options.maxBuffer) || options.maxBuffer < 0)) {
    throw new RangeError("maxBuffer must be a non-negative safe integer byte limit per output stream.");
  }
  const [command, ...args] = options.cmd;
  if (!command) throw new Error("A background process requires a command.");
  const input = options.stdin ?? "ignore";
  const detached = options.detached ?? process.platform !== "win32";
  // Bun.spawn does not implement windowsHide. Hiding the parent does not hide
  // Bun-created descendants, even when their stdio is piped or inherited.
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    detached,
    windowsHide: true,
    stdio: [input instanceof Uint8Array ? "pipe" : input, options.stdout ?? "pipe", options.stderr ?? "pipe"],
  });
  const exited = new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    // Process lifetime is independent of pipe lifetime. A bounded consumer can
    // stop reading before close; awaiting close here would deadlock cleanup.
    child.once("exit", (code) => resolve(code ?? 1));
  });
  // Callers can start draining output before awaiting exited without creating an
  // unhandled rejection if process creation fails in the meantime.
  void exited.catch(() => undefined);
  const inputSink = child.stdin ? createInputSink(child.stdin) : null;
  const stdin = input === "pipe" ? inputSink : null;
  const stdout = child.stdout ? toWebStream(child.stdout, options.maxBuffer, () => stop()) : null;
  const stderr = child.stderr ? toWebStream(child.stderr, options.maxBuffer, () => stop()) : null;
  const result = {
    get pid() { return child.pid ?? 0; },
    get exitCode() { return child.exitCode ?? (child.signalCode ? 1 : null); },
    exited,
    stdin,
    stdout,
    stderr,
    processGroup: detached && process.platform !== "win32",
    kill(signal?: NodeJS.Signals | number) { child.kill(signal); },
    unref() { child.unref(); },
    ref() { child.ref(); },
  };
  if (!options.keepAliveAfterParentExit) ownBackgroundProcess(result);
  const stop = () => {
    void terminateProcessTree({ process: result }).catch((error) => {
      // Timer and AbortSignal callbacks cannot return a promise to their caller.
      // Preserve failed cleanup as an explicit diagnostic without rejecting an
      // unobserved promise after the command has already settled.
      process.emitWarning(error instanceof Error ? error : new Error(String(error)), { code: "BACKGROUND_PROCESS_CLEANUP_FAILED" });
    });
  };
  const timeout = options.timeout ? setTimeout(stop, options.timeout) : undefined;
  options.signal?.addEventListener("abort", stop, { once: true });
  const clear = () => { clearTimeout(timeout); options.signal?.removeEventListener("abort", stop); };
  void exited.then(clear, clear);
  if (input instanceof Uint8Array) child.stdin?.end(input);
  return result;
}

export function spawnBackgroundProcessSync(options: ProcessOptions) {
  const [command, ...args] = options.cmd;
  if (!command) throw new Error("A background process requires a command.");
  const input = options.stdin ?? "ignore";
  const result = spawn.sync(command, args, {
    cwd: options.cwd,
    env: options.env,
    windowsHide: true,
    timeout: options.timeout,
    killSignal: options.killSignal,
    maxBuffer: options.maxBuffer ?? 67108864,
    stdio: [input instanceof Uint8Array ? "pipe" : input, options.stdout ?? "pipe", options.stderr ?? "pipe"],
    input: input instanceof Uint8Array ? input : undefined,
  });
  return { exitCode: result.status ?? 1, stdout: result.stdout ?? Buffer.alloc(0), stderr: result.stderr ?? Buffer.from(result.error?.message ?? ""), pid: result.pid, error: result.error, signalCode: result.signal };
}

function createInputSink(stream: Writable) {
  stream.on("error", () => undefined);
  return {
    write(data: string | Uint8Array) {
      return new Promise<number>((resolve, reject) => {
        stream.write(data, (error) => error ? reject(error) : resolve(Buffer.byteLength(data)));
      });
    },
    end() { stream.end(); },
    flush() { return Promise.resolve(0); },
  };
}

function toWebStream(stream: Readable, maxBuffer: number | undefined, overflow: () => void): ReadableStream<Uint8Array> {
  const iterator = stream[Symbol.asyncIterator]();
  let bytes = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) controller.close();
      else if (next.value instanceof Uint8Array) {
        bytes += next.value.byteLength;
        if (maxBuffer !== undefined && bytes > maxBuffer) {
          overflow();
          controller.error(new RangeError(`Background process output exceeded maxBuffer (${maxBuffer} bytes).`));
          await iterator.return?.();
        } else controller.enqueue(next.value);
      }
      else controller.error(new Error("Background process emitted a non-byte output chunk."));
    },
    async cancel() { await iterator.return?.(); },
  });
}
