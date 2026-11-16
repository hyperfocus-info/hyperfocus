import { roundDecimal } from "@hyperfocus/utilities/math";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createFixedGridSpatialIndex, type FixedGridSpatialItem } from "../src/math/fixed-grid.ts";
import { readBenchmarkEnvironment } from "@hyperfocus/performance";

type Target = FixedGridSpatialItem & { id: number };

const worldSize = 512;
const cellSize = 8;
const frames = 8;
const rounds = 4;
const repositoryRoot = path.resolve(import.meta.dir, "../../..");
const outputPath = path.join(repositoryRoot, ".local", "engine-perf", "projectile-spatial-matrix.json");
const scenarios = [];

for (const targetCount of [100, 1_000, 10_000]) {
  for (const projectileQueries of [1, 16, 256]) {
    scenarios.push(runScenario(targetCount, projectileQueries));
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  environment: readBenchmarkEnvironment({ name: "bun", version: Bun.version }),
  evidence: {
    timingRole: "diagnostic-only",
    structuralDecision: "compare full target distance checks with grid rebuild writes, visited cells, and bucket candidate checks",
    configurationRule: "a grid is not free: prefer a linear scan when queries per rebuild are too few to repay indexing work"
  },
  config: { worldSize, cellSize, frames, rounds },
  scenarios
};
await mkdir(path.dirname(outputPath), { recursive: true });
await Bun.write(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

function runScenario(targetCount: number, projectileQueries: number) {
  const targets = createTargets(targetCount);
  const queries = Array.from({ length: projectileQueries }, (_, index) => ({
    x: wrap(index * 83 + 0.25),
    y: wrap(index * 47 + 0.5),
    radius: 1
  }));
  const index = createFixedGridSpatialIndex<Target>({ cellSize, worldSize });
  const output: Target[] = [];
  const control = () => {
    let hits = 0;
    for (let frame = 0; frame < frames; frame += 1) {
      for (const query of queries) {
        for (const target of targets) {
          const radius = query.radius + (target.radius ?? 0);
          const dx = wrappedDelta(query.x, target.x);
          const dy = wrappedDelta(query.y, target.y);
          if (dx * dx + dy * dy <= radius * radius) hits += 1;
        }
      }
    }
    return hits;
  };
  const candidate = () => {
    let hits = 0;
    for (let frame = 0; frame < frames; frame += 1) {
      index.rebuild(targets);
      for (const query of queries) hits += index.queryCircle(query, output).length;
    }
    return hits;
  };
  if (control() !== candidate()) throw new Error(`Projectile spatial parity failed for ${targetCount}/${projectileQueries}.`);
  for (let warmup = 0; warmup < 2; warmup += 1) {
    control();
    candidate();
  }
  const controlSamplesMs: number[] = [];
  const candidateSamplesMs: number[] = [];
  for (let round = 0; round < rounds; round += 1) {
    controlSamplesMs.push(measure(control));
    candidateSamplesMs.push(measure(candidate), measure(candidate));
    controlSamplesMs.push(measure(control));
  }
  const structure = structuralWork(targets, queries);
  const diagnostics = index.diagnostics();
  return {
    targetCount,
    projectileQueries,
    structuralWork: {
      controlDistanceChecks: targetCount * projectileQueries * frames,
      candidateRebuildWrites: targetCount * frames,
      candidateCellVisits: structure.cellVisits * frames,
      candidateDistanceChecks: structure.candidateChecks * frames,
      candidateBucketArrayAllocationsAfterWarmup: diagnostics.bucketArrayAllocations,
      candidateRetainedBuckets: diagnostics.retainedBuckets,
      candidateToControlDominantWorkRatio: round(
        (targetCount + structure.cellVisits + structure.candidateChecks)
          / Math.max(1, targetCount * projectileQueries)
      )
    },
    control: summarize(controlSamplesMs),
    candidate: summarize(candidateSamplesMs)
  };
}

function createTargets(count: number): Target[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    x: wrap(id * 97 + (id % 7) * 0.31),
    y: wrap(id * 53 + (id % 11) * 0.19),
    radius: 0.8
  }));
}

function structuralWork(targets: readonly Target[], queries: readonly { x: number; y: number; radius: number }[]) {
  const cellsPerAxis = worldSize / cellSize;
  const buckets = new Map<number, number>();
  for (const target of targets) {
    const x = Math.floor((target.x + worldSize / 2) / cellSize);
    const y = Math.floor((target.y + worldSize / 2) / cellSize);
    const key = x * cellsPerAxis + y;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  let candidateChecks = 0;
  let cellVisits = 0;
  const range = Math.ceil((1.8) / cellSize);
  for (const query of queries) {
    const centerX = Math.floor((query.x + worldSize / 2) / cellSize);
    const centerY = Math.floor((query.y + worldSize / 2) / cellSize);
    for (let y = centerY - range; y <= centerY + range; y += 1) {
      for (let x = centerX - range; x <= centerX + range; x += 1) {
        const wrappedX = (x + cellsPerAxis) % cellsPerAxis;
        const wrappedY = (y + cellsPerAxis) % cellsPerAxis;
        cellVisits += 1;
        candidateChecks += buckets.get(wrappedX * cellsPerAxis + wrappedY) ?? 0;
      }
    }
  }
  return { candidateChecks, cellVisits };
}

function measure(run: () => number) {
  const startedAt = performance.now();
  const checksum = run();
  if (!Number.isFinite(checksum)) throw new Error("Projectile workload returned a non-finite checksum.");
  return performance.now() - startedAt;
}

function summarize(samplesMs: number[]) {
  const sorted = [...samplesMs].sort((left, right) => left - right);
  return { samplesMs, p50Ms: percentile(sorted, 0.5), p95Ms: percentile(sorted, 0.95) };
}

function percentile(sorted: readonly number[], fraction: number) {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function wrap(value: number) {
  return ((value + worldSize / 2) % worldSize + worldSize) % worldSize - worldSize / 2;
}

function wrappedDelta(from: number, to: number) {
  let delta = to - from;
  if (delta > worldSize / 2) delta -= worldSize;
  else if (delta < -worldSize / 2) delta += worldSize;
  return delta;
}

function round(value: number) { return roundDecimal(value, 3); }
