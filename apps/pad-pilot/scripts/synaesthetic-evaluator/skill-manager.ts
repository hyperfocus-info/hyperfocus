import { watch, type FSWatcher } from "node:fs";
import { lstat, opendir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hashBoundedFile, readBoundedFileBytes } from "../bounded-file";

import { normalizeMetric, type EvaluationState, type LoadedSkill, type MIDIAnalyzer, type PerformanceMetric } from "./base-analyzer";
import { evaluateMidiSummaryV2, type MidiDimensionResult, type MidiMetricResult } from "./midi-evaluator-v2";
import { summarizeMidi, type MidiSummary } from "./midi-utils";
import { normalizeSkillTimeout, normalizeSkillWeight, withSkillDeadline } from "./skill-runtime-limits";

export type SkillEvaluation = {
  readonly name: string;
  readonly weight: number;
  readonly sourcePath: string;
  readonly hash: string;
  readonly metric: PerformanceMetric;
};

export type SkillFailure = {
  readonly name: string;
  readonly sourcePath: string;
  readonly hash: string;
  readonly error: string;
};

export type LegacyEvaluationReport = {
  readonly successScore: number;
  readonly metrics: readonly SkillEvaluation[];
  readonly failures: readonly SkillFailure[];
  readonly evaluatedAt: number;
};

export type MidiEvaluationReportV2 = LegacyEvaluationReport & {
  readonly kind: "midi";
  readonly schemaVersion: 2;
  readonly overall: number;
  readonly confidence: number;
  readonly dimensions: readonly MidiDimensionResult[];
  readonly midiMetrics: readonly MidiMetricResult[];
  readonly strengths: ReturnType<typeof evaluateMidiSummaryV2>["strengths"];
  readonly weaknesses: ReturnType<typeof evaluateMidiSummaryV2>["weaknesses"];
  readonly diagnostics: ReturnType<typeof evaluateMidiSummaryV2>["diagnostics"];
};

export type EvaluationReport = LegacyEvaluationReport | MidiEvaluationReportV2;

type SkillRunResult =
  | { readonly ok: true; readonly value: SkillEvaluation }
  | { readonly ok: false; readonly value: SkillFailure };

export type SkillManagerOptions = {
  readonly skillsDir?: string;
  readonly evaluatorRoot?: string;
  readonly cacheDir?: string;
  readonly watchDebounceMs?: number;
  readonly skillTimeoutMs?: number;
};

const RUNTIME_SNAPSHOT_FILES = ["base-analyzer.ts", "midi-utils.ts", "skill-math.ts", "statistics.ts"] as const;
const IGNORED_SKILL_FILES = new Set(["index.ts"]);
const SNAPSHOT_VERSION = "synaesthetic-evaluator-skill-snapshot-v3";
const MAX_SKILL_SOURCE_BYTES = 256 * 1024;
const MAX_RUNTIME_SOURCE_BYTES = 1024 * 1024;
const MAX_SKILL_FILES = 256;
const MAX_CACHED_SKILL_SNAPSHOTS = 2_048;

export class SkillManager {
  private readonly skillsDir: string;
  private readonly evaluatorRoot: string;
  private readonly cacheDir: string;
  private readonly watchDebounceMs: number;
  private readonly skillTimeoutMs: number;
  private watcher: FSWatcher | null = null;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;
  private loadedSkills = new Map<string, LoadedSkill>();
  private reloadPromise: Promise<void> = Promise.resolve();

  constructor(options: SkillManagerOptions = {}) {
    const root = options.evaluatorRoot ? resolve(options.evaluatorRoot) : dirname(fileURLToPath(import.meta.url));
    this.evaluatorRoot = root;
    this.skillsDir = resolve(options.skillsDir ?? join(this.evaluatorRoot, "skills"));
    this.cacheDir = resolve(options.cacheDir ?? join(this.evaluatorRoot, "..", "..", "build", "synaesthetic-evaluator", "skill-cache"));
    this.watchDebounceMs = options.watchDebounceMs ?? 80;
    this.skillTimeoutMs = normalizeSkillTimeout(options.skillTimeoutMs);
  }

  get skills() {
    return [...this.loadedSkills.values()];
  }

  resolveSkillPath(name: string) {
    const normalized = name.toLowerCase();
    const match = this.skills.find((skill) => skill.analyzer.name.toLowerCase() === normalized);
    return match?.sourcePath ?? null;
  }

  async loadAll() {
    const next = new Map<string, LoadedSkill>();
    for await (const sourcePath of this.scanSkillFiles()) {
      const loaded = await this.loadSkill(sourcePath);
      next.set(sourcePath, loaded);
    }
    this.loadedSkills = next;
  }

  async evaluate(midi: Uint8Array, state: EvaluationState = {}) {
    await this.reloadPromise;
    if (this.loadedSkills.size === 0) {
      await this.loadAll();
    }

    const midiSummary = freezeMidiSummary(state.midiSummary ?? summarizeMidi(midi));
    const results = await Promise.all(
      this.skills.map(async (skill) => {
        try {
          const skillState = Object.freeze({ ...state, midiSummary });
          const metric = normalizeMetric(await withSkillDeadline(
            skill.analyzer.evaluate(midi, skillState),
            this.skillTimeoutMs,
            skill.analyzer.name,
          ));
          return {
            ok: true,
            value: {
              name: skill.analyzer.name,
              weight: normalizeSkillWeight(skill.analyzer.weight),
              sourcePath: skill.sourcePath,
              hash: skill.hash,
              metric,
            },
          } satisfies SkillRunResult;
        } catch (error) {
          return {
            ok: false,
            value: {
              name: skill.analyzer.name,
              sourcePath: skill.sourcePath,
              hash: skill.hash,
              error: error instanceof Error ? error.message : String(error),
            },
          } satisfies SkillRunResult;
        }
      }),
    );

    const metrics = results.flatMap((result) => (result.ok ? [result.value] : []));
    const failures = results.flatMap((result) => (result.ok ? [] : [result.value]));
    const totalWeight = metrics.reduce((sum, result) => sum + result.weight, 0);
    const successScore = totalWeight > 0
      ? metrics.reduce((sum, result) => sum + result.metric.score * result.weight, 0) / totalWeight
      : 0;
    const midiV2 = evaluateMidiSummaryV2(midiSummary, {
      bpm: typeof state.bpm === "number" ? state.bpm : undefined,
      tonicPitchClass: typeof state.tonicPitchClass === "number" ? state.tonicPitchClass : undefined,
      scalePitchClasses: Array.isArray(state.scalePitchClasses) ? state.scalePitchClasses : undefined,
    });

    return {
      kind: "midi",
      schemaVersion: 2,
      overall: midiV2.overall,
      confidence: midiV2.confidence,
      dimensions: midiV2.dimensions,
      midiMetrics: midiV2.metrics,
      strengths: midiV2.strengths,
      weaknesses: midiV2.weaknesses,
      diagnostics: midiV2.diagnostics,
      successScore,
      metrics,
      failures,
      evaluatedAt: Date.now(),
    } satisfies EvaluationReport;
  }

  startWatching() {
    if (this.watcher) {
      return;
    }

    this.watcher = watch(this.skillsDir, { persistent: true }, (_eventType, fileName) => {
      if (!fileName || !fileName.toString().endsWith(".ts")) {
        return;
      }
      this.scheduleReload();
    });
  }

  stopWatching() {
    this.watcher?.close();
    this.watcher = null;
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
  }

  private scheduleReload() {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }

    this.reloadTimer = setTimeout(() => {
      this.reloadPromise = this.loadAll().catch((error) => {
        console.error(error);
      });
    }, this.watchDebounceMs);
  }

  private async loadSkill(sourcePath: string) {
    const beforeSourceHash = await hashFile(sourcePath, MAX_SKILL_SOURCE_BYTES);
    const snapshotHash = await this.hashSkillSnapshot(sourcePath, beforeSourceHash);
    await this.copyRuntimeSnapshot(snapshotHash, sourcePath);
    const afterHash = await hashFile(sourcePath, MAX_SKILL_SOURCE_BYTES);
    if (beforeSourceHash !== afterHash) {
      throw new Error(`Integrity check failed while loading ${sourcePath}; file changed during snapshot.`);
    }

    const cachedPath = join(this.cacheDir, snapshotHash, "skills", basename(sourcePath));
    const module = await import(pathToFileURL(cachedPath).href);
    const analyzer = resolveAnalyzerExport(module);
    return {
      analyzer,
      sourcePath,
      hash: snapshotHash,
      loadedAt: Date.now(),
    } satisfies LoadedSkill;
  }

  private async hashSkillSnapshot(sourcePath: string, sourceHash: string) {
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(SNAPSHOT_VERSION);
    hasher.update(sourceHash);
    for (const fileName of RUNTIME_SNAPSHOT_FILES) {
      hasher.update(fileName);
      hasher.update(await readBoundedFileBytes(
        join(this.evaluatorRoot, fileName),
        MAX_RUNTIME_SOURCE_BYTES,
        "Skill runtime snapshot",
      ));
    }
    hasher.update(basename(sourcePath));
    return hasher.digest("hex");
  }

  private async copyRuntimeSnapshot(hash: string, sourcePath: string) {
    const cacheRoot = join(this.cacheDir, hash);
    await this.ensureCacheCapacity(cacheRoot);
    for (const fileName of RUNTIME_SNAPSHOT_FILES) {
      const source = join(this.evaluatorRoot, fileName);
      await Bun.write(
        join(cacheRoot, fileName),
        await readBoundedFileBytes(source, MAX_RUNTIME_SOURCE_BYTES, "Skill runtime source"),
      );
    }
    await Bun.write(
      join(cacheRoot, "skills", basename(sourcePath)),
      await readBoundedFileBytes(sourcePath, MAX_SKILL_SOURCE_BYTES, "Skill source"),
    );
  }

  private async ensureCacheCapacity(cacheRoot: string) {
    try {
      const existing = await lstat(cacheRoot);
      if (!existing.isDirectory() || existing.isSymbolicLink()) {
        throw new Error(`Skill cache target is not a safe directory: ${cacheRoot}`);
      }
      return;
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }
    }

    try {
      const cacheDirectory = await lstat(this.cacheDir);
      if (!cacheDirectory.isDirectory() || cacheDirectory.isSymbolicLink()) {
        throw new Error(`Skill cache root is not a safe directory: ${this.cacheDir}`);
      }
    } catch (error) {
      if (isMissingFileError(error)) {
        return;
      }
      throw error;
    }
    const cacheEntries = await opendir(this.cacheDir);
    let snapshotCount = 0;
    for await (const entry of cacheEntries) {
      if (entry.isDirectory() && /^[a-f0-9]{64}$/.test(entry.name)) {
        snapshotCount += 1;
        if (snapshotCount >= MAX_CACHED_SKILL_SNAPSHOTS) {
          throw new Error(`Skill cache reached its ${MAX_CACHED_SKILL_SNAPSHOTS} snapshot limit.`);
        }
      }
    }
  }

  private async *scanSkillFiles() {
    const glob = new Bun.Glob("*.ts");
    let skillCount = 0;
    for await (const fileName of glob.scan({ cwd: this.skillsDir })) {
      const normalized = fileName.replaceAll("\\", "/");
      if (IGNORED_SKILL_FILES.has(normalized) || normalized.endsWith(".test.ts")) {
        continue;
      }
      skillCount += 1;
      if (skillCount > MAX_SKILL_FILES) {
        throw new Error(`Skill directory exceeded its ${MAX_SKILL_FILES} file limit.`);
      }
      yield join(this.skillsDir, normalized);
    }
  }
}

export async function hashFile(filePath: string, maximumBytes = MAX_SKILL_SOURCE_BYTES) {
  return (await hashBoundedFile(filePath, maximumBytes, "Skill source")).sha256;
}

function resolveAnalyzerExport(module: Record<string, unknown>) {
  const candidates = [module.default, module.analyzer, module.Analyzer];
  for (const candidate of candidates) {
    const analyzer = normalizeAnalyzer(candidate);
    if (analyzer) {
      return analyzer;
    }
    if (typeof candidate === "function") {
      try {
        const instance = Reflect.construct(candidate, []);
        const constructed = normalizeAnalyzer(instance);
        if (constructed) {
          return constructed;
        }
      } catch {
        continue;
      }
    }
  }
  throw new Error("Skill module must export a MIDIAnalyzer instance or class.");
}

function normalizeAnalyzer(candidate: unknown) {
  if (typeof candidate !== "object" || candidate === null) {
    return null;
  }

  const name = Reflect.get(candidate, "name");
  const weight = Reflect.get(candidate, "weight");
  const evaluate = Reflect.get(candidate, "evaluate");
  if (typeof name !== "string" || name.length === 0 || name.length > 128 ||
      typeof weight !== "number" || typeof evaluate !== "function") {
    return null;
  }

  return {
    name,
    weight: normalizeSkillWeight(weight),
    evaluate(midi: Uint8Array, state: EvaluationState) {
      return Promise.resolve(evaluate.call(candidate, midi, state));
    },
  } satisfies MIDIAnalyzer;
}

function isMissingFileError(error: unknown) {
  return typeof error === "object" && error !== null && Reflect.get(error, "code") === "ENOENT";
}

function freezeMidiSummary(summary: MidiSummary) {
  for (const value of Object.values(summary)) {
    if (Array.isArray(value)) {
      Object.freeze(value);
    }
  }
  return Object.freeze(summary);
}
