import { spawnBackgroundProcess, terminateProcessTree } from "@hyperfocus/desktop-runtime/process";
import type { AiRunRequest, AiRunResult } from "@hyperfocus/ai-core/runtime";

const MAX_INPUT_BYTES = 8388608;
const MAX_OUTPUT_BYTES = 2097152;
const MAX_ERROR_BYTES = 131072;
const CLI_TIMEOUT_MS = 600000;

export async function runAiCliProcess({ request, command, input, signal, env, cwd, timeoutMs = CLI_TIMEOUT_MS }: {
  request: AiRunRequest;
  command: string[];
  input: string;
  signal?: AbortSignal;
  env?: Record<string, string | undefined>;
  cwd?: string;
  timeoutMs?: number;
}): Promise<AiRunResult> {
  signal?.throwIfAborted();
  if (Buffer.byteLength(input, "utf8") > MAX_INPUT_BYTES) throw new Error("AI agent CLI input exceeds 8 MiB. Reduce the conversation or project context.");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("AI agent CLI timeout must be positive.");
  const process = spawnBackgroundProcess({ cmd: command, ...{
    cwd: cwd ?? processCwd(),
    env,
    stdin: new TextEncoder().encode(input),
    stdout: "pipe",
    stderr: "pipe"
  } });
  let timedOut = false;
  let termination: Promise<void> | undefined;
  const terminate = () => {
    termination ??= terminateProcessTree({ process });
    void termination.catch(() => undefined); // Awaited by finally, including deadline callbacks.
  };
  const timeout = setTimeout(() => {
    timedOut = true;
    terminate();
  }, timeoutMs);
  signal?.addEventListener("abort", terminate, { once: true });
  if (signal?.aborted) terminate();
  try {
    const [text, errorText, exitCode] = await Promise.all([
      readBounded(process.stdout, MAX_OUTPUT_BYTES, terminate),
      readBounded(process.stderr, MAX_ERROR_BYTES, terminate),
      process.exited
    ]);
    signal?.throwIfAborted();
    if (timedOut) throw new Error("AI agent CLI timed out.");
    if (exitCode !== 0) {
      throw new Error(`AI agent CLI exited with ${exitCode}${errorText.trim() ? `: ${errorText.trim().slice(0, 4_000)}` : "."}`);
    }
    return {
      requestId: request.requestId,
      profile: request.profile,
      text: stripFence(text),
      stopReason: "stop"
    };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", terminate);
    if (process.exitCode === null) terminate();
    await termination;
    await process.exited;
  }
}

async function readBounded(
  stream: ReadableStream<Uint8Array> | null,
  maximum: number,
  onOverflow: () => void
): Promise<string> {
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maximum) {
        onOverflow();
        throw new Error(`AI agent CLI output exceeded ${maximum} bytes.`);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function stripFence(value: string) {
  const trimmed = value.trim();
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function processCwd() {
  const temp = process.env.TEMP?.trim() || process.env.TMP?.trim();
  return temp || process.cwd();
}
