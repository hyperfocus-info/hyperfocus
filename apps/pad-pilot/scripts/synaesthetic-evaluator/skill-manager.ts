import { watch, type FSWatcher } from "node:fs";
import { lstat, mkdir, opendir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hashBoundedFile, readBoundedFileBytes } from "@hyperfocus/pad-pilot/bounded-file";
import { normalizeMetric, type EvaluationState, type LoadedSkill, type PerformanceMetric } from "./base-analyzer";
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
const MAX_SKILL_SOURCE_BYTES = 262144;
const MAX_RUNTIME_SOURCE_BYTES = 1048576;
const MAX_SKILL_FILES = 256;
const MAX_CACHED_SKILL_SNAPSHOTS = 2048;
export type SkillManager = ReturnType<typeof createSkillManager>;
export function createSkillManager(options: SkillManagerOptions = {}) {
    let skillsDir: string;
    let evaluatorRoot: string;
    let cacheDir: string;
    let watchDebounceMs: number;
    let skillTimeoutMs: number;
    let watcher: FSWatcher | null = null;
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    let loadedSkills = new Map<string, LoadedSkill>();
    let reloadPromise: Promise<void> = Promise.resolve();
    const root = options.evaluatorRoot ? resolve(options.evaluatorRoot) : dirname(fileURLToPath(import.meta.url));
    evaluatorRoot = root;
    skillsDir = resolve(options.skillsDir ?? join(evaluatorRoot, "skills"));
    cacheDir = resolve(options.cacheDir ?? join(evaluatorRoot, "..", "..", "build", "synaesthetic-evaluator", "skill-cache"));
    watchDebounceMs = options.watchDebounceMs ?? 80;
    skillTimeoutMs = normalizeSkillTimeout(options.skillTimeoutMs);
    function getSkills() {
        return [...loadedSkills.values()];
    }
    function resolveSkillPath(name: string) {
        const normalized = name.toLowerCase();
        const match = getSkills().find((skill) => skill.analyzer.name.toLowerCase() === normalized);
        return match?.sourcePath ?? null;
    }
    async function loadAll() {
        const next = new Map<string, LoadedSkill>();
        for await (const sourcePath of scanSkillFiles()) {
            const loaded = await loadSkill(sourcePath);
            next.set(sourcePath, loaded);
        }
        loadedSkills = next;
    }
    async function evaluate(midi: Uint8Array, state: EvaluationState = {}) {
        await reloadPromise;
        if (loadedSkills.size === 0) {
            await loadAll();
        }
        const midiSummary = freezeMidiSummary(state.midiSummary ?? summarizeMidi(midi));
        const results = await Promise.all(getSkills().map(async (skill) => {
            try {
                const skillState = Object.freeze({ ...state, midiSummary });
                const metric = normalizeMetric(await withSkillDeadline(skill.analyzer.evaluate(midi, skillState), skillTimeoutMs, skill.analyzer.name));
                return {
                    ok: true as const,
                    value: {
                        name: skill.analyzer.name,
                        weight: normalizeSkillWeight(skill.analyzer.weight),
                        sourcePath: skill.sourcePath,
                        hash: skill.hash,
                        metric,
                    },
                };
            }
            catch (error) {
                return {
                    ok: false as const,
                    value: {
                        name: skill.analyzer.name,
                        sourcePath: skill.sourcePath,
                        hash: skill.hash,
                        error: error instanceof Error ? error.message : String(error),
                    },
                };
            }
        }));
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
            kind: "midi" as const,
            schemaVersion: 2 as const,
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
        };
    }
    function startWatching() {
        if (watcher) {
            return;
        }
        watcher = watch(skillsDir, { persistent: true }, (_eventType, fileName) => {
            if (!fileName || !fileName.toString().endsWith(".ts")) {
                return;
            }
            scheduleReload();
        });
    }
    function stopWatching() {
        watcher?.close();
        watcher = null;
        if (reloadTimer) {
            clearTimeout(reloadTimer);
            reloadTimer = null;
        }
    }
    function scheduleReload() {
        if (reloadTimer) {
            clearTimeout(reloadTimer);
        }
        reloadTimer = setTimeout(() => {
            reloadPromise = loadAll().catch((error) => {
                console.error(error);
            });
        }, watchDebounceMs);
    }
    async function loadSkill(sourcePath: string) {
        const beforeSourceHash = await hashFile(sourcePath, MAX_SKILL_SOURCE_BYTES);
        const snapshotHash = await hashSkillSnapshot(sourcePath, beforeSourceHash);
        await copyRuntimeSnapshot(snapshotHash, sourcePath);
        const afterHash = await hashFile(sourcePath, MAX_SKILL_SOURCE_BYTES);
        if (beforeSourceHash !== afterHash) {
            throw new Error(`Integrity check failed while loading ${sourcePath}; file changed during snapshot.`);
        }
        const cachedPath = join(cacheDir, snapshotHash, "skills", basename(sourcePath));
        const module = await import(pathToFileURL(cachedPath).href);
        const analyzer = resolveAnalyzerExport(module);
        return {
            analyzer,
            sourcePath,
            hash: snapshotHash,
            loadedAt: Date.now(),
        };
    }
    async function hashSkillSnapshot(sourcePath: string, sourceHash: string) {
        const hasher = new Bun.CryptoHasher("sha256");
        hasher.update(SNAPSHOT_VERSION);
        hasher.update(sourceHash);
        for (const fileName of RUNTIME_SNAPSHOT_FILES) {
            hasher.update(fileName);
            hasher.update(await readBoundedFileBytes(join(evaluatorRoot, fileName), MAX_RUNTIME_SOURCE_BYTES, "Skill runtime snapshot"));
        }
        hasher.update(basename(sourcePath));
        return hasher.digest("hex");
    }
    async function copyRuntimeSnapshot(hash: string, sourcePath: string) {
        const cacheRoot = join(cacheDir, hash);
        await ensureCacheCapacity(cacheRoot);
        await mkdir(join(cacheRoot, "skills"), { recursive: true });
        for (const fileName of RUNTIME_SNAPSHOT_FILES) {
            const source = join(evaluatorRoot, fileName);
            await writeFile(join(cacheRoot, fileName), await readBoundedFileBytes(source, MAX_RUNTIME_SOURCE_BYTES, "Skill runtime source"));
        }
        await writeFile(join(cacheRoot, "skills", basename(sourcePath)), await readBoundedFileBytes(sourcePath, MAX_SKILL_SOURCE_BYTES, "Skill source"));
    }
    async function ensureCacheCapacity(cacheRoot: string) {
        try {
            const existing = await lstat(cacheRoot);
            if (!existing.isDirectory() || existing.isSymbolicLink()) {
                throw new Error(`Skill cache target is not a safe directory: ${cacheRoot}`);
            }
            return;
        }
        catch (error) {
            if (!isMissingFileError(error)) {
                throw error;
            }
        }
        try {
            const cacheDirectory = await lstat(cacheDir);
            if (!cacheDirectory.isDirectory() || cacheDirectory.isSymbolicLink()) {
                throw new Error(`Skill cache root is not a safe directory: ${cacheDir}`);
            }
        }
        catch (error) {
            if (isMissingFileError(error)) {
                return;
            }
            throw error;
        }
        const cacheEntries = await opendir(cacheDir);
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
    async function* scanSkillFiles() {
        const glob = new Bun.Glob("*.ts");
        let skillCount = 0;
        for await (const fileName of glob.scan({ cwd: skillsDir })) {
            const normalized = fileName.replaceAll("\\", "/");
            if (IGNORED_SKILL_FILES.has(normalized) || normalized.endsWith(".test.ts")) {
                continue;
            }
            skillCount += 1;
            if (skillCount > MAX_SKILL_FILES) {
                throw new Error(`Skill directory exceeded its ${MAX_SKILL_FILES} file limit.`);
            }
            yield join(skillsDir, normalized);
        }
    }
    return { get skills() { return getSkills(); }, resolveSkillPath, loadAll, evaluate, startWatching, stopWatching };
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
            }
            catch {
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
    };
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
