import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  createDefaultProject,
  createProjectHistory,
  type EditorEntityData,
  type EditorProject,
} from "@hyperfocus/engine/project";
import { createPerformanceEvidenceReport, readBenchmarkEnvironment } from "@hyperfocus/performance";

type SnapshotStrategy = "clone" | "reference";
type Sample = { elapsedMs: number; checksum: number };

const options = parseOptions(process.argv.slice(2));
const fixture = createLargeProject(options.entities);
const control = createWorkload(fixture, "clone", options.editsPerSample);
const candidate = createWorkload(fixture, "reference", options.editsPerSample);
const delta = createDeltaWorkload(fixture, options.editsPerSample, options.deltaCheckpointInterval);

for (let index = 0; index < options.warmup; index += 1) {
  control.run();
  candidate.run();
  delta.run();
}

const controlSamples: Sample[] = [];
const candidateSamples: Sample[] = [];
const deltaSamples: Sample[] = [];
for (let round = 0; round < options.rounds; round += 1) {
  Bun.gc(true);
  controlSamples.push(measure(control.run));
  candidateSamples.push(measure(candidate.run), measure(candidate.run));
  deltaSamples.push(measure(delta.run), measure(delta.run));
  controlSamples.push(measure(control.run));
}
const controlChecksum = controlSamples.at(-1)?.checksum;
const candidateChecksum = candidateSamples.at(-1)?.checksum;
const deltaChecksum = deltaSamples.at(-1)?.checksum;
if (controlChecksum !== candidateChecksum || controlChecksum !== deltaChecksum) {
  throw new Error(`Project history benchmark parity failed: clone ${controlChecksum}, reference ${candidateChecksum}, delta ${deltaChecksum}.`);
}

const controlSummary = summarize(controlSamples);
const candidateSummary = summarize(candidateSamples);
const deltaSummary = summarize(deltaSamples);
const report = createPerformanceEvidenceReport({
  benchmark: "editor-project-history",
  environment: readBenchmarkEnvironment({ name: "bun", version: Bun.version }),
  config: options,
  structuralEvidence: {
    complexity: "Snapshot edits validate, clone, and serialize O(project). Inverse-delta edits retain only changed values, validate the affected scene section, and defer stable serialization to save/export.",
    controlFullProjectClonesPerEdit: 2,
    candidateFullProjectClonesPerEdit: 1,
    candidateStableSerializationsPerEdit: 1,
    deltaCheckpointCloneCadence: options.deltaCheckpointInterval === 0 ? "disabled" : `1/${options.deltaCheckpointInterval}`,
    deltaFullProjectSerializationsPerEdit: 0,
    deltaCheckpointCompositionCadence: options.deltaCheckpointInterval === 0 ? "disabled" : `1/${options.deltaCheckpointInterval}`,
    deltaInverseValuesPerEdit: 1,
    deltaValidationScope: "scenes plus portable save/story invariants",
    historyEntriesBound: 80
  },
  measurements: {
    control: { strategy: "clone", ...controlSummary },
    candidate: { strategy: "reference", ...candidateSummary },
    delta: { strategy: "inverse-delta", ...deltaSummary },
    p50DeltaPercent: percentDelta(candidateSummary.p50Ms, controlSummary.p50Ms),
    p95DeltaPercent: percentDelta(candidateSummary.p95Ms, controlSummary.p95Ms),
    deltaP95VsControlPercent: percentDelta(deltaSummary.p95Ms, controlSummary.p95Ms)
  }
});
await mkdir(dirname(options.out), { recursive: true });
await Bun.write(options.out, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Editor history p95: ${controlSummary.p95Ms}ms -> ${candidateSummary.p95Ms}ms (${report.evidence.calibration.measurements.p95DeltaPercent}%)`);
console.log(`Editor delta p95: ${deltaSummary.p95Ms}ms (${report.evidence.calibration.measurements.deltaP95VsControlPercent}% vs clone; timing diagnostic only)`);
console.log(`report: ${options.out}`);

function createLargeProject(entityCount: number) {
  const project = createDefaultProject("Large history fixture");
  const template = project.scenes[0].entities[0];
  project.scenes[0].entities = Array.from({ length: entityCount }, (_, index) => cloneEntity(template, index));
  return project;
}

function cloneEntity(template: EditorEntityData, index: number): EditorEntityData {
  return {
    ...structuredClone(template),
    id: `entity-${index}`,
    label: `Entity ${index}`,
    x: index % 1000,
    y: Math.floor(index / 1000) * 16,
    components: template.components.map((component, componentIndex) => ({
      ...structuredClone(component),
      id: `entity-${index}-component-${componentIndex}`,
    })),
  };
}

function createWorkload(project: EditorProject, snapshotStrategy: SnapshotStrategy, editsPerSample: number) {
  const history = createProjectHistory(project, { limit: 80, snapshotStrategy });
  let edit = 0;
  return {
    run() {
      for (let index = 0; index < editsPerSample; index += 1) {
        const entityIndex = edit % project.scenes[0].entities.length;
        history.transact(`Move ${entityIndex}`, (draft) => {
          draft.scenes[0].entities[entityIndex].x += 1;
        });
        edit += 1;
      }
      return history.project.scenes[0].entities[0].x + history.version + history.changes.length;
    },
  };
}

function createDeltaWorkload(project: EditorProject, editsPerSample: number, deltaCheckpointInterval: number) {
  const history = createProjectHistory(project, { deltaCheckpointInterval, limit: 80, snapshotStrategy: "reference" });
  let edit = 0;
  return {
    run() {
      for (let index = 0; index < editsPerSample; index += 1) {
        const entityIndex = edit % project.scenes[0].entities.length;
        const before = history.project.scenes[0].entities[entityIndex].x;
        history.transactDelta(`Move ${entityIndex}`, {
          dirtySections: ["scenes"],
          apply(draft) { draft.scenes[0].entities[entityIndex].x = before + 1; },
          revert(draft) { draft.scenes[0].entities[entityIndex].x = before; }
        });
        edit += 1;
      }
      return history.project.scenes[0].entities[0].x + history.version + history.changes.length;
    }
  };
}

function measure(run: () => number): Sample {
  const startedAt = performance.now();
  const checksum = run();
  return { elapsedMs: performance.now() - startedAt, checksum };
}

function summarize(samples: readonly Sample[]) {
  const times = samples.map((sample) => round(sample.elapsedMs));
  return { samplesMs: times, p50Ms: percentile(times, 0.5), p95Ms: percentile(times, 0.95) };
}

function percentile(values: readonly number[], ratio: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
}

function percentDelta(value: number, baseline: number) {
  return round((value - baseline) / Math.max(0.001, baseline) * 100);
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function parseOptions(argv: readonly string[]) {
  return {
    entities: positiveInteger("entities", argument(argv, "entities", "5000")),
    editsPerSample: positiveInteger("edits", argument(argv, "edits", "8")),
    deltaCheckpointInterval: nonNegativeInteger("checkpoint-interval", argument(argv, "checkpoint-interval", "32")),
    warmup: nonNegativeInteger("warmup", argument(argv, "warmup", "2")),
    rounds: positiveInteger("rounds", argument(argv, "rounds", "4")),
    out: resolve(argument(argv, "out", ".local/editor-performance/project-history.json")),
  };
}

function argument(argv: readonly string[], name: string, fallback: string) {
  const prefix = `--${name}=`;
  return argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function positiveInteger(name: string, value: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new RangeError(`--${name} must be a positive safe integer.`);
  return parsed;
}

function nonNegativeInteger(name: string, value: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new RangeError(`--${name} must be a non-negative safe integer.`);
  return parsed;
}
