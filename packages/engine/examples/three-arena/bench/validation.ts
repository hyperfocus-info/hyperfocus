import { isRecord } from "@hyperfocus/utilities/records";
import type { BenchOptions, UnknownRecord } from "./types.ts";
import type { BenchRunResult } from "../bench.ts";



export function recordFrom(value: unknown): UnknownRecord {
  return isRecord(value) ? Object.fromEntries(Object.entries(value)) : {};
}

export function valueAt(root: unknown, pathParts: readonly string[]): unknown {
  let value = root;
  for (const part of pathParts) {
    if (!isRecord(value)) return undefined;
    value = value[part];
  }
  return value;
}

export function numberAt(root: unknown, pathParts: readonly string[]): number | undefined {
  const value = valueAt(root, pathParts);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function requiredNumberAt(root: unknown, pathParts: readonly string[]): number {
  const value = numberAt(root, pathParts);
  if (value === undefined) throw new Error(`Expected finite number at ${pathParts.join(".")}`);
  return value;
}

export function requiredBooleanAt(root: unknown, pathParts: readonly string[]): boolean {
  const value = valueAt(root, pathParts);
  if (typeof value !== "boolean") throw new Error(`Expected boolean at ${pathParts.join(".")}`);
  return value;
}

export function optionalRecordAt(root: unknown, pathParts: readonly string[]): UnknownRecord | undefined {
  const value = valueAt(root, pathParts);
  return isRecord(value) ? recordFrom(value) : undefined;
}

export function requiredRecordAt(root: unknown, pathParts: readonly string[]): UnknownRecord {
  const value = optionalRecordAt(root, pathParts);
  if (!value) throw new Error(`Expected object at ${pathParts.join(".")}`);
  return value;
}

export function snapshotDelta(start: UnknownRecord, end: UnknownRecord) {
  return {
    heapBytes: numberOrZero(end.heapBytes) - numberOrZero(start.heapBytes),
    created: {
      materials: numberOrZero(valueAt(end, ["created", "materials"])) - numberOrZero(valueAt(start, ["created", "materials"])),
      meshes: numberOrZero(valueAt(end, ["created", "meshes"])) - numberOrZero(valueAt(start, ["created", "meshes"])),
      effects: numberOrZero(valueAt(end, ["created", "effects"])) - numberOrZero(valueAt(start, ["created", "effects"])),
      particles: numberOrZero(valueAt(end, ["created", "particles"])) - numberOrZero(valueAt(start, ["created", "particles"]))
    }
  };
}

export function assertBenchResult(result: BenchRunResult, opts: BenchOptions) {
  const failures: string[] = [];
  if (result.pageErrors.length > 0) failures.push(`page errors: ${result.pageErrors.join("; ")}`);
  const realConsoleMessages = filterKnownBenignConsoleMessages(result.consoleMessages);
  if (!opts.allowConsole && realConsoleMessages.length > 0) failures.push(`console messages: ${realConsoleMessages.join("; ")}`);
  const samples = numberAt(result.end, ["samples"]) ?? 0;
  if ((opts.assertFrameP95Ms !== undefined || opts.assertUpdateP95Ms !== undefined || opts.assertRenderP95Ms !== undefined) && samples < 60) {
    failures.push(`telemetry samples ${samples} < 60`);
  }
  pushMax(failures, "frame p95", numberAt(result.end, ["frameMs", "p95"]), opts.assertFrameP95Ms, "ms");
  pushMax(failures, "update p95", numberAt(result.end, ["updateMs", "p95"]), opts.assertUpdateP95Ms, "ms");
  pushMax(failures, "render p95", numberAt(result.end, ["renderMs", "p95"]), opts.assertRenderP95Ms, "ms");
  pushMax(failures, "draw calls", numberAt(result.end, ["render", "calls"]), opts.assertDrawCallsMax, "");
  pushMax(failures, "triangles", numberAt(result.end, ["render", "triangles"]), opts.assertTrianglesMax, "");
  pushMax(failures, "programs", numberAt(result.end, ["render", "programs"]), opts.assertProgramsMax, "");
  pushMin(failures, "enemies", numberAt(result.end, ["counters", "enemies"]), opts.assertEnemies);
  pushMin(failures, "pickups", numberAt(result.end, ["counters", "pickups"]), opts.assertPickups);
  pushMin(failures, "particles", numberAt(result.end, ["counters", "particles"]), opts.assertParticles);
  pushMax(failures, "animated enemies", numberAt(result.end, ["counters", "animatedEnemies"]), opts.assertAnimatedEnemiesMax, "");
  pushMax(failures, "mesh delta", result.delta.created.meshes, opts.assertMeshDeltaMax, "");
  pushMax(failures, "material delta", result.delta.created.materials, opts.assertMaterialDeltaMax, "");
  if (opts.assertHeapDeltaMaxMb !== undefined) {
    pushMax(failures, "heap delta", result.delta.heapBytes, opts.assertHeapDeltaMaxMb * 1024 * 1024, "bytes");
  }
  if (failures.length > 0) throw new Error(`three-arena benchmark failed:\n${failures.join("\n")}`);
}

export function filterKnownBenignConsoleMessages(messages: string[] = []) {
  return messages.filter((message) => !String(message).includes("Multiple instances of Three.js"));
}

export function isRunAnimation(animation: unknown) {
  return ["run", "jog", "run8Dir", "walk", "formalWalk"].includes(String(animation));
}

export function isPlayableAnimationSource(source: unknown) {
  return ["engine-motion", "kenney", "universal", "procedural"].includes(String(source));
}

export function pushMax(failures: string[], label: string, actual: unknown, expected: number | undefined, unit: string) {
  if (expected === undefined) return;
  const value = Number(actual);
  if (!Number.isFinite(value) || value > expected) failures.push(`${label} ${formatActual(value)} > ${expected}${unit}`);
}

export function pushMin(failures: string[], label: string, actual: unknown, expected: number | undefined) {
  if (expected === undefined) return;
  const value = Number(actual);
  if (!Number.isFinite(value) || value < expected) failures.push(`${label} ${formatActual(value)} < ${expected}`);
}

export function numberOrZero(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function formatActual(value: number) {
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "n/a";
}

export function aggregatePhaseP95(runs: BenchRunResult[]) {
  const names = new Set<string>();
  for (const run of runs) {
    for (const name of Object.keys(recordFrom(run.end.phaseMs))) names.add(name);
  }
  return [...names]
    .map((name) => {
      const values = runs.map((run) => numberAt(run.end, ["phaseMs", name, "p95"]) ?? 0);
      return {
        name,
        p95MsMedian: median(values),
        p95MsWorst: Math.max(...values)
      };
    })
    .sort((left, right) => right.p95MsMedian - left.p95MsMedian)
    .slice(0, 12);
}

export function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

export { isRecord } from "@hyperfocus/utilities/records";
