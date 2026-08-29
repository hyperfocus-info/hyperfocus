import { extname } from "node:path";

import { AudioSkillManager, type AudioEvaluationReport, type AudioEvaluationState } from "./audio-skill-manager";
import { decodeAudioBytes, type AudioSummary } from "./audio-utils";
import { readBoundedStream } from "./bounded-fetch";

export type { AudioEvaluationReport, AudioEvaluationState } from "./audio-skill-manager";

export type AudioSynaestheticEvaluatorOptions = {
  readonly manager?: AudioSkillManager;
  readonly state?: AudioEvaluationState;
};

const MAX_AUDIO_INPUT_BYTES = 64 * 1024 * 1024;

export class AudioSynaestheticEvaluator {
  private readonly manager: AudioSkillManager;
  private readonly state: AudioEvaluationState;

  constructor(options: AudioSynaestheticEvaluatorOptions = {}) {
    this.manager = options.manager ?? new AudioSkillManager();
    this.state = options.state ?? {};
  }

  async evaluateBytes(bytes: Uint8Array, state: AudioEvaluationState = {}) {
    const audioSummary = await decodeAudioBytes(bytes);
    return this.evaluateSummary(audioSummary, state);
  }

  async evaluateSummary(audioSummary: AudioSummary, state: AudioEvaluationState = {}) {
    return this.manager.evaluate(audioSummary, { ...this.state, ...state, audioSummary });
  }
}

export async function evaluateAudioFile(filePath: string, state: AudioEvaluationState = {}) {
  if (!isAudioPath(filePath)) {
    throw new Error(`AudioSynaestheticEvaluator consumes audio files. Unsupported path: ${filePath}`);
  }
  const bytes = await readBoundedStream(Bun.file(filePath).stream(), MAX_AUDIO_INPUT_BYTES, "Audio input");
  const evaluator = new AudioSynaestheticEvaluator({ state });
  return evaluator.evaluateBytes(bytes);
}

export async function scoreAudioFile(filePath: string, state: AudioEvaluationState = {}) {
  const report = await evaluateAudioFile(filePath, state);
  return scoreAudioReport(report);
}

export function scoreAudioReport(report: AudioEvaluationReport) {
  return {
    overallScore: report.overall,
    durationSeconds: report.audioSummary.durationSeconds,
    features: report.audioSummary,
    metrics: report.metrics.map((entry) => ({
      name: entry.name,
      score: entry.metric.score,
    })),
  };
}

export function summarizeAudioReport(report: AudioEvaluationReport) {
  return {
    kind: report.kind,
    successScore: Number(report.successScore.toFixed(4)),
    overall: Number(report.overall.toFixed(4)),
    confidence: Number(report.confidence.toFixed(4)),
    dimensions: report.dimensions,
    safety: report.safety,
    durationSeconds: Number(report.audioSummary.durationSeconds.toFixed(2)),
    features: {
      spectralCentroid: Math.round(report.audioSummary.spectralCentroid),
      spectralCentroidStdDev: Math.round(report.audioSummary.spectralCentroidStdDev),
      spectralFlatness: Number(report.audioSummary.spectralFlatness.toFixed(4)),
      spectralFlux: Number(report.audioSummary.spectralFlux.toFixed(4)),
      spectralEntropy: Number(report.audioSummary.spectralEntropy.toFixed(4)),
      onsetRate: Number(report.audioSummary.onsetRate.toFixed(3)),
      onsetRegularity: Number(report.audioSummary.onsetRegularity.toFixed(4)),
      pulseClarity: Number(report.audioSummary.pulseClarity.toFixed(4)),
      chromaFlux: Number(report.audioSummary.chromaFlux.toFixed(4)),
      sectionContrast: Number(report.audioSummary.sectionContrast.toFixed(4)),
      scaleCompliance: Number(report.audioSummary.scaleCompliance.toFixed(4)),
      clippingRate: Number(report.audioSummary.clippingRate.toFixed(4)),
    },
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

export function isAudioPath(filePath: string) {
  const extension = extname(filePath).toLowerCase();
  return extension === ".mp3"
    || extension === ".wav"
    || extension === ".wave"
    || extension === ".flac"
    || extension === ".ogg"
    || extension === ".oga"
    || extension === ".m4a"
    || extension === ".aac";
}
