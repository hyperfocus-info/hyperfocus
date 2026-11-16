import { spawnBackgroundProcess } from '@hyperfocus/desktop-runtime/process';
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { boundedFetchBytes, decodeUtf8, readBoundedStream } from "./bounded-fetch";
import { SkillManager, type EvaluationReport, type SkillEvaluation } from "./skill-manager";
import { readBoundedFileBytes } from "@hyperfocus/pad-pilot/bounded-file";
import {
  spawnSyncWithDeadline,
  terminateAndReapProcess,
  waitForProcessWithDeadline,
} from "../process-runner";

export type RewriteRequest = {
  readonly sourcePath: string;
  readonly analyzerName: string;
  readonly previousSource: string;
  readonly report: EvaluationReport;
};

export type RewriteResult = {
  readonly status: "stable" | "no-target" | "no-rewriter" | "rejected" | "updated";
  readonly detail: string;
  readonly sourcePath?: string;
};

export type BehaviorSynthesizerOptions = {
  readonly manager: SkillManager;
  readonly allowUnsafeGeneratedCode?: boolean;
  readonly minimumDrop?: number;
  readonly rewriteSkill?: (request: RewriteRequest) => Promise<string | null>;
  readonly candidateDir?: string;
  readonly evaluatorRoot?: string;
  readonly testTimeoutMs?: number;
};

export type HttpRewriteSkillOptions = {
  readonly endpoint: string;
  readonly apiKey?: string;
  readonly model?: string;
  readonly headers?: Record<string, string>;
  readonly maxRedirects?: number;
  readonly maxResponseBytes?: number;
  readonly timeoutMs?: number;
};

const RUNTIME_SNAPSHOT_FILES = ["base-analyzer.ts", "midi-utils.ts", "skill-math.ts", "statistics.ts"] as const;
const MAX_CANDIDATE_OUTPUT_BYTES = 262144;
const MAX_GENERATED_SOURCE_BYTES = 524288;
const MAX_RUNTIME_SOURCE_BYTES = 1048576;
const MAX_REWRITE_REQUEST_BYTES = 524288;
const MAX_REWRITE_RESPONSE_BYTES = 4194304;
const MAX_REWRITE_TIMEOUT_MS = 120000;
const PROCESS_TREE_TERMINATION_TIMEOUT_MS = 1_000;
const CANDIDATE_RESULT_PREFIX = "PADPILOT_CANDIDATE_RESULT:";
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const UNSAFE_GENERATED_CODE_DISABLED = "Generated TypeScript execution is disabled. Pass allowUnsafeGeneratedCode: true only when the entire synthesizer runs inside a trusted OS sandbox.";

export type BehaviorSynthesizer = ReturnType<typeof createBehaviorSynthesizer>;
export function createBehaviorSynthesizer(options: BehaviorSynthesizerOptions) {
  let lastScore: number | null = null;

  const manager = options.manager;
  const allowUnsafeGeneratedCode = options.allowUnsafeGeneratedCode === true;
  const minimumDrop = options.minimumDrop ?? 0.035;
  const rewriteSkill = options.rewriteSkill;
  const candidateDir = options.candidateDir ?? join(PROJECT_ROOT, "build", "synaesthetic-evaluator", "candidates");
  const backupDir = join(PROJECT_ROOT, "build", "synaesthetic-evaluator", "skill-backups");
  const evaluatorRoot = options.evaluatorRoot ?? dirname(fileURLToPath(import.meta.url));
  const testTimeoutMs = boundedInteger(options.testTimeoutMs ?? 5_000, 100, 60_000, "testTimeoutMs");

  async function observe(report: EvaluationReport) {
    const previous = lastScore;
    lastScore = report.successScore;

    if (previous === null || previous - report.successScore < minimumDrop) {
      return { status: "stable" as const, detail: "No meaningful success-score drop detected." as const };
    }

    const target = selectWeakestSkill(report.metrics);
    if (!target) {
      return { status: "no-target" as const, detail: "No skill metric available for synthesis." as const };
    }

    if (!rewriteSkill) {
      return { status: "no-rewriter" as const, detail: `Would rewrite ${target.name}, but no LLM rewrite adapter is configured.`, sourcePath: target.sourcePath };
    }
    if (!allowUnsafeGeneratedCode) {
      return { status: "rejected" as const, detail: UNSAFE_GENERATED_CODE_DISABLED, sourcePath: target.sourcePath };
    }

    const previousSource = await readBoundedFileText(
      target.sourcePath,
      MAX_GENERATED_SOURCE_BYTES,
      "Skill source",
    );
    const rewritten = await rewriteSkill({ sourcePath: target.sourcePath, analyzerName: target.name, previousSource, report });
    if (!rewritten || rewritten.trim().length === 0) {
      return { status: "rejected" as const, detail: "LLM rewrite returned no source." as const, sourcePath: target.sourcePath };
    }
    if (new TextEncoder().encode(rewritten).byteLength > MAX_GENERATED_SOURCE_BYTES) {
      return { status: "rejected" as const, detail: `Generated TypeScript exceeded ${MAX_GENERATED_SOURCE_BYTES} bytes.`, sourcePath: target.sourcePath };
    }

    const candidateId = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}-${basename(target.sourcePath, ".ts").slice(0, 32)}`;
    const candidateRoot = join(candidateDir, candidateId);
    const candidatePath = join(candidateRoot, "skills", basename(target.sourcePath));
    await writeCandidateRuntime(candidateRoot, candidatePath, rewritten);
    const validation = await validateSkillFile(candidatePath);
    if (!validation.ok) {
      return { status: "rejected" as const, detail: validation.detail, sourcePath: target.sourcePath };
    }

    await Bun.write(join(backupDir, `${Date.now()}-${randomUUID()}-${basename(target.sourcePath)}`), previousSource);
    await atomicWriteText(target.sourcePath, rewritten);
    try {
      await manager.loadAll();
    } catch (error) {
      try {
        await atomicWriteText(target.sourcePath, previousSource);
        await manager.loadAll();
      } catch (restoreError) {
        throw new AggregateError([error, restoreError], `Failed to load rewritten ${target.name} and restore its previous source.`);
      }
      throw error;
    }
    return { status: "updated" as const, detail: `Updated ${target.name} after score drop ${previous.toFixed(3)} -> ${report.successScore.toFixed(3)}.`, sourcePath: target.sourcePath };
  }
  async function validateSkillFile(filePath: string) {
    if (!allowUnsafeGeneratedCode) {
      return { ok: false, detail: UNSAFE_GENERATED_CODE_DISABLED };
    }
    const candidateRoot = dirname(dirname(filePath));
    const validatorPath = join(dirname(fileURLToPath(import.meta.url)), "candidate-validator.ts");
    const proc = spawnBackgroundProcess({
      cmd: [process.execPath, "run", validatorPath, candidateRoot], ...({
        cwd: evaluatorRoot,
        stdout: "pipe",
        stderr: "pipe",
      })
    });

    let exitCode: number;
    let stdout: string;
    let stderr: string;
    const exitPromise = waitForProcessWithDeadline(
      proc,
      testTimeoutMs + 500,
      "Candidate validator",
    );
    try {
      const result = await Promise.all([
        exitPromise,
        readBoundedStream(proc.stdout, MAX_CANDIDATE_OUTPUT_BYTES, "Candidate stdout"),
        readBoundedStream(proc.stderr, MAX_CANDIDATE_OUTPUT_BYTES, "Candidate stderr"),
      ]);
      exitCode = result[0];
      stdout = decodeUtf8(result[1]);
      stderr = decodeUtf8(result[2]);
    } catch (error) {
      terminateProcessTree(proc.pid);
      try {
        await terminateAndReapProcess(
          proc,
          PROCESS_TREE_TERMINATION_TIMEOUT_MS,
          "Candidate validator cleanup",
        );
      } catch (cleanupError) {
        return {
          ok: false,
          detail: new AggregateError([error, cleanupError], "Candidate validator failed and could not be reaped.").message,
        };
      }
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }

    if (exitCode !== 0) {
      return {
        ok: false,
        detail: `${stderr.trim() || stdout.trim() || "Candidate failed."}`,
      };
    }
    const resultLine = stdout.trim().split(/\r?\n/).findLast((line) => line.startsWith(CANDIDATE_RESULT_PREFIX));
    if (!resultLine) {
      return { ok: false, detail: "Candidate validator returned no result marker." };
    }
    const result: unknown = JSON.parse(resultLine.slice(CANDIDATE_RESULT_PREFIX.length));
    if (!result || typeof result !== "object") {
      return { ok: false, detail: "Candidate validator returned a malformed result." };
    }
    const ok = Reflect.get(result, "ok");
    const detail = Reflect.get(result, "detail");
    if (typeof ok !== "boolean" || typeof detail !== "string") {
      return { ok: false, detail: "Candidate validator returned a malformed result." };
    }
    return { ok, detail };
  }
  async function writeCandidateRuntime(candidateRoot: string, candidatePath: string, rewritten: string) {
    await mkdir(dirname(candidatePath), { recursive: true });
    for (const fileName of RUNTIME_SNAPSHOT_FILES) {
      await writeFile(
        join(candidateRoot, fileName),
        await readBoundedFileText(
          join(evaluatorRoot, fileName),
          MAX_RUNTIME_SOURCE_BYTES,
          "Evaluator runtime source",
        ),
      );
    }
    await writeFile(candidatePath, rewritten);
  }
  return { observe: observe, validateSkillFile: validateSkillFile };
}

function selectWeakestSkill(metrics: readonly SkillEvaluation[]) {
  return [...metrics].sort((left, right) => left.metric.score * left.weight - right.metric.score * right.weight)[0] ?? null;
}

export function createHttpRewriteSkill(options: HttpRewriteSkillOptions) {
  const timeoutMs = boundedInteger(options.timeoutMs ?? 30_000, 1, MAX_REWRITE_TIMEOUT_MS, "timeoutMs");
  const maxResponseBytes = boundedInteger(options.maxResponseBytes ?? 1048576, 1, MAX_REWRITE_RESPONSE_BYTES, "maxResponseBytes");
  const maxRedirects = boundedInteger(options.maxRedirects ?? 0, 0, 3, "maxRedirects");
  return async (request: RewriteRequest) => {
    const requestBody = JSON.stringify({
      model: options.model,
      analyzerName: request.analyzerName,
      sourcePath: request.sourcePath,
      previousSource: request.previousSource,
      successScore: request.report.successScore,
      weakestMetrics: request.report.metrics.slice(0, 5).map((metric) => ({
        name: metric.name,
        score: metric.metric.score,
        justification: metric.metric.justification,
      })),
      instruction: "Return only the complete rewritten TypeScript skill source.",
    });
    if (new TextEncoder().encode(requestBody).byteLength > MAX_REWRITE_REQUEST_BYTES) {
      throw new Error(`LLM rewrite request exceeded ${MAX_REWRITE_REQUEST_BYTES} bytes.`);
    }
    const response = await boundedFetchBytes(options.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
        ...options.headers,
      },
      body: requestBody,
      maxBytes: maxResponseBytes,
      maxRedirects,
      timeoutMs,
    });

    if (!response.ok) {
      throw new Error(`LLM rewrite failed ${response.status}: ${decodeUtf8(response.bytes)}`);
    }

    const body: unknown = JSON.parse(decodeUtf8(response.bytes));
    return extractRewriteSource(body);
  };
}

function boundedInteger(value: number, minimum: number, maximum: number, label: string) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} through ${maximum}.`);
  }
  return value;
}

async function readBoundedFileText(filePath: string, maximumBytes: number, label: string) {
  return decodeUtf8(await readBoundedFileBytes(filePath, maximumBytes, label));
}

async function atomicWriteText(filePath: string, contents: string) {
  const temporary = join(dirname(filePath), `.${basename(filePath)}.${process.pid}-${randomUUID()}.tmp`);
  try {
    await Bun.write(temporary, contents);
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true });
  }
}

function extractRewriteSource(body: unknown) {
  if (typeof body === "string") {
    return stripCodeFence(body);
  }
  if (typeof body !== "object" || body === null) {
    return null;
  }

  for (const key of ["source", "content", "text", "typescript"]) {
    const value = Reflect.get(body, key);
    if (typeof value === "string") {
      return stripCodeFence(value);
    }
  }
  return null;
}

function stripCodeFence(value: string) {
  const trimmed = value.trim();
  const fenced = /^```(?:ts|typescript)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced?.[1]?.trim() ?? trimmed;
}

function terminateProcessTree(pid: number) {
  if (process.platform === "win32") {
    const result = spawnSyncWithDeadline(["taskkill.exe", "/PID", String(pid), "/T", "/F"], {
      cwd: PROJECT_ROOT,
      label: "Candidate validator process-tree termination",
      stderr: "ignore",
      stdout: "ignore",
      timeoutMs: PROCESS_TREE_TERMINATION_TIMEOUT_MS,
    });
    if (result.exitCode === 0) {
      return;
    }
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Process already exited.
    }
  } else {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Process already exited.
    }
  }
}
