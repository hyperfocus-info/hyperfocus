import { closeSync, fstatSync, mkdtempSync, openSync, readSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BoundedStreamLimitError,
  readBoundedStreamText,
} from "@hyperfocus/pad-pilot/bounded-stream";
import {
  terminateAndReapProcess,
  waitForProcessWithDeadline,
} from "@hyperfocus/pad-pilot/subprocess";

const DEFAULT_CODEX_TIMEOUT_MS = 5 * 60_000;
const MIN_CODEX_TIMEOUT_MS = 10_000;
const MAX_CODEX_TIMEOUT_MS = 30 * 60_000;
const MAX_CODEX_STDOUT_BYTES = 1024 * 1024;
const MAX_CODEX_STDERR_BYTES = 256 * 1024;
const MAX_CODEX_SCHEMA_BYTES = 256 * 1024;
const CODEX_TREE_KILL_GRACE_MS = 1_000;
const TREE_KILL_HELPER_TIMEOUT_MS = 5_000;

export type CodexGeneratorInput = {
  model?: string;
  prompt: string;
  provider?: string;
  responseSchema?: unknown;
  responseSchemaName?: string;
  system: string;
};

type CodexGeneratorCommand = {
  args: string[];
  executable: string;
  prompt: string;
};

export class CodexGeneratorTimeoutError extends Error {
  code = "codex_generator_timeout" as const;
}

export class CodexGeneratorOutputLimitError extends Error {
  code = "codex_generator_output_too_large" as const;
}

export function resolveCodexGeneratorTimeoutMs() {
  const configured = Number(process.env.PADPILOT_CODEX_TIMEOUT_MS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_CODEX_TIMEOUT_MS;
  }
  return Math.min(MAX_CODEX_TIMEOUT_MS, Math.max(MIN_CODEX_TIMEOUT_MS, Math.round(configured)));
}

function resolveCodexProfile(modelLabel: string | undefined) {
  const label = modelLabel?.trim().toLowerCase() ?? "";
  const model = label.includes("5.4-mini")
    ? "gpt-5.4-mini"
    : label.includes("5.4")
      ? "gpt-5.4"
      : "gpt-5.5";
  const effort = label.includes("xhigh")
    ? "xhigh"
    : label.includes("high")
      ? "high"
      : label.includes("medium")
        ? "medium"
        : "low";
  const fast = label.includes("fast");
  return { effort, fast, model };
}

function buildPrompt(input: CodexGeneratorInput) {
  const outputInstruction = input.responseSchema
    ? "Return only a JSON object matching the provided output schema. Put raw Delta-Tick String Tracker Format in the tracker field. No Markdown, no commentary."
    : "Return only raw Delta-Tick String Tracker Format. No JSON, no Markdown, no commentary.";
  const trackerContract = input.responseSchema
    ? input.system.replace(
        /return\s+only\s+delta-tick\s+string\s+tracker\s+format\s+v2\s*[:.]?/i,
        "The JSON tracker field must contain Delta-Tick String Tracker Format v2:",
      )
    : input.system;
  return [
    "Task: generate one compact PadPilot MIDI tracker response.",
    "Do not inspect the repository, edit files, run shell commands, or explain the result.",
    outputInstruction,
    "The tracker must start with !BPM:<tempo>! and include #TRK lines plus note blocks.",
    "Obey the requested bar length exactly. Primary lanes need material in each 4-bar section; support, texture, fill, pickup, and dropout lanes may rest when the plan asks for space.",
    "Do not place note starts beyond the requested loop end.",
    "Use style-specific track names and GM programs. Avoid generic Piano/Synth Bass/Lead/Drums unless directly requested.",
    "<tracker_contract>",
    trackerContract,
    "</tracker_contract>",
    "<user_controls>",
    input.prompt,
    "</user_controls>",
  ].join("\n\n");
}

export async function readBoundedTextStream(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  label: string,
  onOverflow: () => void,
) {
  try {
    return await readBoundedStreamText(stream, {
      label: `Codex CLI ${label}`,
      maxBytes,
    });
  } catch (error) {
    if (!(error instanceof BoundedStreamLimitError)) {
      throw error;
    }
    onOverflow();
    throw new CodexGeneratorOutputLimitError(error.message);
  }
}

function parseCodexOutput(stdout: string) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("Codex CLI returned no output.");
  }
  const tracker = trimmed
    .replace(/^```[^\r\n]*\r?\n?/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (!tracker) {
    throw new Error("Codex CLI output did not include tracker text.");
  }
  return tracker;
}

function trimDiagnostic(value: string, maxLength = 4_000) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength)}...`;
}

function commandPreview(command: CodexGeneratorCommand) {
  return [command.executable, ...command.args.slice(0, -1), "<prompt>"].join(" ");
}

function codexFailureMessage(command: CodexGeneratorCommand, exitCode: number | null, stderr: string, timeoutMs?: number) {
  return [
    exitCode === null ? `Codex CLI generation timed out after ${Math.round((timeoutMs ?? resolveCodexGeneratorTimeoutMs()) / 1000)}s.` : `Codex CLI exited with ${exitCode}.`,
    `Command: ${commandPreview(command)}`,
    stderr.trim() ? `stderr:\n${trimDiagnostic(stderr)}` : "stderr: <empty>",
    exitCode === null ? "Set PADPILOT_CODEX_TIMEOUT_MS to increase the dev generator timeout." : "",
  ].filter(Boolean).join("\n");
}

export function buildCodexGeneratorCommand(input: CodexGeneratorInput, outputPath?: string, outputSchemaPath?: string) {
  const profile = resolveCodexProfile(input.model);
  const executable = process.env.PADPILOT_CODEX_EXECUTABLE?.trim() || "codex";
  const args = [
    "exec",
    "--ephemeral",
    "--skip-git-repo-check",
    "--ignore-rules",
    "--color",
    "never",
    "--sandbox",
    "read-only",
    "--model",
    profile.model,
    "-c",
    `model_reasoning_effort="${profile.effort}"`,
    "-c",
    "model_verbosity=\"low\"",
  ];

  if (profile.fast) {
    args.push("-c", "features.fast_mode=true", "-c", "service_tier=\"fast\"");
  }

  if (outputPath) {
    args.push("--output-last-message", outputPath);
  }
  if (input.responseSchema && outputSchemaPath) {
    args.push("--output-schema", outputSchemaPath);
  }

  const prompt = buildPrompt(input);
  args.push(prompt);
  return { args, executable, prompt } satisfies CodexGeneratorCommand;
}

function spawnCodexCommand(command: CodexGeneratorCommand) {
  try {
    return Bun.spawn([command.executable, ...command.args], {
      cwd: process.env.PADPILOT_CODEX_CWD?.trim() || tmpdir(),
      stderr: "pipe",
      stdin: "ignore",
      stdout: "pipe",
    } as const);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown spawn failure.";
    throw new Error([
      "Codex CLI could not be started.",
      `Command: ${commandPreview(command)}`,
      `Start error: ${message}`,
      "Set PADPILOT_CODEX_EXECUTABLE if codex is not on PATH.",
    ].join("\n"));
  }
}

function readCodexFinalMessage(outputPath: string, stdout: string) {
  let descriptor: number | null = null;
  try {
    descriptor = openSync(outputPath, "r");
    const size = fstatSync(descriptor).size;
    if (size > MAX_CODEX_STDOUT_BYTES) {
      throw new CodexGeneratorOutputLimitError(
        `Codex CLI final message exceeded ${MAX_CODEX_STDOUT_BYTES} bytes.`,
      );
    }
    const bytes = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const bytesRead = readSync(descriptor, bytes, offset, size - offset, offset);
      if (bytesRead <= 0) {
        break;
      }
      offset += bytesRead;
    }
    return bytes.subarray(0, offset).toString("utf8").trim() || stdout;
  } catch (error) {
    if (error instanceof CodexGeneratorOutputLimitError) {
      throw error;
    }
    return stdout;
  } finally {
    if (descriptor !== null) {
      closeSync(descriptor);
    }
  }
}

function stopCodexProcessTree(proc: ReturnType<typeof spawnCodexCommand>) {
  if (process.platform === "win32" && Number.isInteger(proc.pid) && proc.pid > 0) {
    try {
      const kill = Bun.spawn(["taskkill", "/PID", String(proc.pid), "/T", "/F"], {
        stderr: "ignore",
        stdin: "ignore",
        stdout: "ignore",
      } as const);
      const fallback = setTimeout(() => {
        try {
          proc.kill();
        } catch {}
      }, CODEX_TREE_KILL_GRACE_MS);
      const helperDeadline = setTimeout(() => {
        try {
          kill.kill();
        } catch {}
        try {
          proc.kill();
        } catch {}
      }, TREE_KILL_HELPER_TIMEOUT_MS);
      kill.exited.then((exitCode) => {
        clearTimeout(fallback);
        clearTimeout(helperDeadline);
        if (exitCode !== 0) {
          try {
            proc.kill();
          } catch {}
        }
      }).catch(() => {
        clearTimeout(fallback);
        clearTimeout(helperDeadline);
        try {
          proc.kill();
        } catch {}
      });
      return;
    } catch {}
  }
  try {
    proc.kill();
  } catch {}
}

export async function runCodexGenerator(input: CodexGeneratorInput) {
  const outputDir = mkdtempSync(join(tmpdir(), "padpilot-codex-"));
  const outputPath = join(outputDir, "last-message.txt");
  const outputSchemaPath = input.responseSchema ? join(outputDir, "response-schema.json") : undefined;
  if (input.responseSchema && outputSchemaPath) {
    try {
      const serializedSchema = JSON.stringify(input.responseSchema);
      if (Buffer.byteLength(serializedSchema) > MAX_CODEX_SCHEMA_BYTES) {
        throw new CodexGeneratorOutputLimitError(
          `Codex output schema exceeded ${MAX_CODEX_SCHEMA_BYTES} bytes.`,
        );
      }
      writeFileSync(outputSchemaPath, serializedSchema);
    } catch (error) {
      rmSync(outputDir, { force: true, recursive: true });
      throw error;
    }
  }
  const setup = (() => {
    try {
      const command = buildCodexGeneratorCommand(input, outputPath, outputSchemaPath);
      return { command, proc: spawnCodexCommand(command) };
    } catch (error) {
      rmSync(outputDir, { force: true, recursive: true });
      throw error;
    }
  })();
  const { command, proc } = setup;
  const timeoutMs = resolveCodexGeneratorTimeoutMs();
  let timedOut = false;
  try {
    let stdout: string;
    let stderr: string;
    let exitCode: number;
    try {
      [stdout, stderr, exitCode] = await Promise.all([
        readBoundedTextStream(proc.stdout, MAX_CODEX_STDOUT_BYTES, "stdout", () => stopCodexProcessTree(proc)),
        readBoundedTextStream(proc.stderr, MAX_CODEX_STDERR_BYTES, "stderr", () => stopCodexProcessTree(proc)),
        waitForProcessWithDeadline(proc, timeoutMs, "Codex CLI", () => {
          timedOut = true;
          stopCodexProcessTree(proc);
        }),
      ]);
    } catch (error) {
      try {
        await terminateAndReapProcess(
          proc,
          TREE_KILL_HELPER_TIMEOUT_MS,
          "Codex CLI cleanup",
          () => stopCodexProcessTree(proc),
        );
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Codex CLI failed and could not be reaped.");
      }
      if (timedOut) {
        throw new CodexGeneratorTimeoutError(codexFailureMessage(command, null, "", timeoutMs));
      }
      throw error;
    }
    if (exitCode !== 0) {
      throw new Error(codexFailureMessage(command, exitCode, stderr));
    }
    return parseCodexOutput(readCodexFinalMessage(outputPath, stdout));
  } finally {
    rmSync(outputDir, { force: true, recursive: true });
  }
}
