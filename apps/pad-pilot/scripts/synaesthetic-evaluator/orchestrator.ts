import { extname } from "node:path";

import { type EvaluationState } from "./base-analyzer";
import { evaluateAudioFile, isAudioPath, summarizeAudioReport, type AudioEvaluationState } from "./audio-orchestrator";
import { BehaviorSynthesizer } from "./behavior-synthesizer";
import { readBoundedStream } from "./bounded-fetch";
import { SkillManager, type EvaluationReport } from "./skill-manager";

const MAX_MIDI_INPUT_BYTES = 4 * 1024 * 1024;

export type SynaestheticEvaluatorOptions = {
  readonly manager?: SkillManager;
  readonly state?: EvaluationState;
  readonly bufferCapacity?: number;
};

export class SynaestheticEvaluator {
  private readonly manager: SkillManager;
  private readonly buffer: Uint8Array;
  private readonly state: EvaluationState;
  private length = 0;

  constructor(options: SynaestheticEvaluatorOptions = {}) {
    this.manager = options.manager ?? new SkillManager();
    this.buffer = new Uint8Array(options.bufferCapacity ?? 64 * 1024);
    this.state = options.state ?? {};
  }

  async start() {
    await this.manager.loadAll();
    this.manager.startWatching();
  }

  stop() {
    this.manager.stopWatching();
  }

  async evaluateBytes(midi: Uint8Array, state: EvaluationState = {}) {
    return this.manager.evaluate(midi, { ...this.state, ...state });
  }

  async pushMidiBytes(chunk: Uint8Array, state: EvaluationState = {}) {
    if (chunk.length >= this.buffer.length) {
      this.buffer.set(chunk.subarray(chunk.length - this.buffer.length));
      this.length = this.buffer.length;
    } else {
      const overflow = Math.max(0, this.length + chunk.length - this.buffer.length);
      if (overflow > 0) {
        this.buffer.copyWithin(0, overflow, this.length);
        this.length -= overflow;
      }
      this.buffer.set(chunk, this.length);
      this.length += chunk.length;
    }

    return this.evaluateBytes(this.buffer.slice(0, this.length), state);
  }
}

export async function evaluateMidiFile(filePath: string, state: EvaluationState = {}) {
  if (!isMidiPath(filePath)) {
    throw new Error(`SynaestheticEvaluator consumes MIDI files. Use evaluateMediaFile or evaluateAudioFile for audio: ${filePath}`);
  }
  const bytes = await readBoundedStream(Bun.file(filePath).stream(), MAX_MIDI_INPUT_BYTES, "MIDI input");
  const evaluator = new SynaestheticEvaluator({ state });
  await evaluator.start();
  try {
    return await evaluator.evaluateBytes(bytes);
  } finally {
    evaluator.stop();
  }
}

export async function evaluateMediaFile(filePath: string, state: EvaluationState & AudioEvaluationState = {}) {
  if (isMidiPath(filePath)) {
    return {
      kind: "midi",
      report: await evaluateMidiFile(filePath, state),
    } as const;
  }

  if (isAudioPath(filePath)) {
    return {
      kind: "audio",
      report: await evaluateAudioFile(filePath, state),
    } as const;
  }

  throw new Error(`Unsupported media file type: ${filePath}`);
}

export function createBehaviorSynthesizer(manager: SkillManager) {
  return new BehaviorSynthesizer({ manager });
}

export function summarizeReport(report: EvaluationReport) {
  const midiV2 = "schemaVersion" in report ? report : null;
  return {
    kind: "midi" as const,
    schemaVersion: midiV2?.schemaVersion ?? 1,
    overall: Number((midiV2?.overall ?? report.successScore).toFixed(4)),
    confidence: midiV2 === null ? null : Number(midiV2.confidence.toFixed(4)),
    dimensions: (midiV2?.dimensions ?? []).map((dimension) => ({
      id: dimension.id,
      score: dimension.score === null ? null : Number(dimension.score.toFixed(4)),
      confidence: Number(dimension.confidence.toFixed(4)),
      coverage: Number(dimension.coverage.toFixed(4)),
    })),
    midiMetrics: (midiV2?.midiMetrics ?? []).map((metric) => ({
      id: metric.id,
      score: metric.score === null ? null : Number(metric.score.toFixed(4)),
      confidence: Number(metric.confidence.toFixed(4)),
      valid: metric.valid,
      status: metric.status,
      evidence: metric.evidence,
      summary: metric.summary,
    })),
    successScore: Number(report.successScore.toFixed(4)),
    metrics: report.metrics
      .map((metric) => ({
        name: metric.name,
        score: Number(metric.metric.score.toFixed(4)),
        impact: metric.metric.biologicalImpact,
        justification: metric.metric.justification,
      }))
      .sort((left, right) => left.score - right.score),
    failures: report.failures,
  };
}

function isMidiPath(filePath: string) {
  const extension = extname(filePath).toLowerCase();
  return extension === ".mid" || extension === ".midi";
}

if (import.meta.main) {
  const filePath = Bun.argv[2];
  if (!filePath) {
    console.error("Usage: bun run scripts/synaesthetic-evaluator/orchestrator.ts <file.mid|file.mp3|file.wav>");
    process.exit(1);
  }

  evaluateMediaFile(filePath)
    .then((result) => {
      const summary = result.kind === "audio" ? summarizeAudioReport(result.report) : summarizeReport(result.report);
      console.log(JSON.stringify(summary, null, 2));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
