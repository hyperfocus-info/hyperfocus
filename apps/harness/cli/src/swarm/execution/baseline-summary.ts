import { z } from "zod";
import { sampleDistribution } from "@hyperfocus/performance/swarm";
import { parseBenchmarkTrial } from "./benchmark-receipt";

const maximumMessageLength = 7900;
const metadataSchema = z.object({
  scenario: z.string().min(1).max(256), workloadHash: z.string().min(1).max(256),
  runtimeVersion: z.string().min(1).max(128), cpuModel: z.string().min(1).max(256),
  platform: z.string().min(1).max(64), architecture: z.string().min(1).max(64),
  warmupFrames: z.number().int().positive().optional(),
  limitations: z.array(z.string().max(250)).max(12).default([]),
  memory: z.object({ scope: z.string().max(300).optional() }),
  stages: z.record(z.string().min(1).max(64), z.array(z.number().finite().positive()).min(10).max(1000000)).optional(),
});

/** Raw receipts remain immutable artifacts; reasoning receives every stage without frame arrays. */
export function summarizeSwarmBaseline(options: {
  value: unknown; artifactId: string; sourceRevision: string; requireCpuEvidence?: boolean;
}) {
  const trial = parseBenchmarkTrial(options), metadata = metadataSchema.parse(trial);
  const stages = Object.entries(metadata.stages ?? {});
  if (stages.length > 32) throw Error("Baseline diagnostic has too many CPU stages.");
  function distribution(values: number[]) {
    if (values.length !== trial.samples.length) throw Error("Every baseline stage must describe the same measured frames.");
    const summary = sampleDistribution(values);
    return { sampleCount: summary.sampleCount, medianMs: summary.median, p95Ms: summary.p95, p99Ms: summary.p99 };
  }
  const summary = {
    kind: "single-baseline-diagnostic", sourceRevision: z.string().regex(/^[a-f0-9]{40,64}$/).parse(options.sourceRevision),
    rawArtifactId: z.string().min(1).max(160).parse(options.artifactId),
    scenario: metadata.scenario, workloadHash: metadata.workloadHash,
    primary: distribution(trial.samples), stages: Object.fromEntries(stages.map(([name, values]) => [name, distribution(values)])),
    warmup: { frames: metadata.warmupFrames ?? null, elapsedMs: trial.warmupMs }, durationMs: trial.durationMs,
    environment: { runtime: metadata.runtimeVersion, cpu: metadata.cpuModel, platform: metadata.platform, architecture: metadata.architecture },
    memory: { rssBytes: trial.memory.rssBytes, heapBytes: trial.memory.heapBytes, allocatedBytes: trial.memory.allocatedBytes ?? null,
      scope: metadata.memory.scope ?? "Process observations; heap delta is not an allocation rate." },
    gc: { count: trial.gc?.count ?? null, durationMs: trial.gc?.durationMs ?? null },
    finalStateHash: trial.structural?.finalStateHash ?? null, limitations: metadata.limitations,
    interpretation: "One baseline diagnostic trial; no performance improvement or winner is established. Paired repeated trials and correctness are required. Missing browser, GPU, freshness or allocation evidence remains missing.",
  };
  const text = `Current immutable baseline diagnostic:\n${JSON.stringify(summary)}`;
  if (text.length > maximumMessageLength) throw Error("Baseline diagnostic summary exceeds the bounded reasoning context.");
  return text;
}
