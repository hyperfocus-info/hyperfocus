import decode from "audio-decode";

import {
  amplitudeToDb,
  buildSectionScoreValues,
  buildTimeline,
  HOP_SIZE,
  maxIndex,
  normalizeRange,
  percentile,
  powerToDb,
  rms,
  zeroCrossingRate,
} from "./audio/audio-analysis-math";
import { bestScaleCompliance, clamp01, FIFTHS_ORDER, normalizedEntropy, standardDeviation } from "./skill-math";
import { mean } from "./statistics";
import type { EvaluationDimensionId, MediumMetricId, MetricEvidence } from "./evaluation-schema";

function audioMetricDefinition<
  const Name extends string,
  const Id extends MediumMetricId,
  const Dimension extends EvaluationDimensionId,
>(
  name: Name,
  id: Id,
  dimension: Dimension,
  weight: number,
  biologicalImpact: "arousal" | "valence" | "tension" | "homeostasis",
  description: string,
) {
  return { name, id, dimension, weight, biologicalImpact, description } as const;
}

export const AUDIO_METRIC_DEFINITIONS = [
  audioMetricDefinition("TonalIntent", "audio.musical.tonal-intent", "musicality", 1, "homeostasis", "confidence-aware tonal intent"),
  audioMetricDefinition("PulseCoherence", "audio.rhythm.pulse-coherence", "groove", 1, "arousal", "pulse clarity and onset coherence"),
  audioMetricDefinition("SectionDevelopment", "audio.structure.section-development", "structure", 1, "valence", "recurring form with audible section contrast"),
  audioMetricDefinition("TranslationReadiness", "audio.mix.translation-readiness", "soundQuality", 1, "tension", "demonstrated harshness, buildup, and overload risk"),
  audioMetricDefinition("EmbodiedImpact", "audio.emotion.embodied-impact", "emotionalImpact", 1, "arousal", "low-frequency body support and macro-dynamic motion"),
] as const;

export type AudioMetricName = typeof AUDIO_METRIC_DEFINITIONS[number]["name"];
export type AudioSummary = {
  readonly durationSeconds: number;
  readonly sourceSampleRate: number;
  readonly sourceChannelCount: number;
  readonly sampleRate: number;
  readonly rmsMean: number;
  readonly rmsStdDev: number;
  readonly crestFactor: number;
  readonly clippingRate: number;
  readonly flatTopRate: number;
  readonly samplePeakDbfs: number;
  readonly truePeakDbtp: number;
  readonly integratedLufs: number;
  readonly loudnessRange: number;
  readonly dcOffset: number;
  readonly silenceRatio: number;
  readonly invalidSampleCount: number;
  readonly spectralCentroid: number;
  readonly spectralCentroidStdDev: number;
  readonly spectralFlatness: number;
  readonly spectralFlux: number;
  readonly spectralEntropy: number;
  readonly rolloffHz: number;
  readonly zcr: number;
  readonly lowEnergy: number;
  readonly bassEnergy: number;
  readonly lowMidEnergy: number;
  readonly midEnergy: number;
  readonly highEnergy: number;
  readonly stereoWidth: number;
  readonly onsetRate: number;
  readonly onsetRegularity: number;
  readonly pulseClarity: number;
  readonly transientSpikeRate: number;
  readonly chroma: readonly number[];
  readonly chromaFlux: number;
  readonly chromaEntropy: number;
  readonly sectionContrast: number;
  readonly selfSimilarity: readonly (readonly number[])[];
  readonly sections: readonly AudioSectionSummary[];
  readonly scaleCompliance: number;
  readonly fifthsStability: number;
  readonly cymaticSymmetry: number;
  readonly harmonicity: number;
  readonly perceptualBands: readonly PerceptualBandSummary[];
  readonly timeline: AudioTimeline;
};

export type PerceptualBandSummary = {
  readonly lowHz: number;
  readonly highHz: number;
  readonly energyDb: number;
  readonly share: number;
};

export type AudioTimelinePoint = {
  readonly timeSeconds: number;
  readonly value: number;
};

export type AudioTimeline = {
  readonly loudness: readonly AudioTimelinePoint[];
  readonly centroid: readonly AudioTimelinePoint[];
  readonly flux: readonly AudioTimelinePoint[];
  readonly tension: readonly AudioTimelinePoint[];
  readonly dynamics: readonly AudioTimelinePoint[];
  readonly groovePulse: readonly AudioTimelinePoint[];
  readonly sectionScore: readonly AudioTimelinePoint[];
};

export type AudioSectionSummary = {
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly label: string;
  readonly score: number;
};

export type AudioMetricScore = {
  readonly name: AudioMetricName;
  readonly id: MediumMetricId;
  readonly dimension: EvaluationDimensionId;
  readonly facet: string;
  readonly score: number | null;
  readonly confidence: number;
  readonly valid: boolean;
  readonly status: "valid" | "not-applicable" | "unreliable" | "failed";
  readonly summary: string;
  readonly evidence: MetricEvidence;
};

const FFT_SIZE = 2048;
const MIN_ANALYSIS_RATE = 32_000;
const MAX_ANALYSIS_RATE = 48_000;
const PERCEPTUAL_BAND_COUNT = 32;

export async function decodeAudioBytes(bytes: Uint8Array) {
  const decoded = await decode(bytes);
  return analyzeAudioChannels(decoded.channelData, decoded.sampleRate);
}

export function assessAudioSafety(features: AudioSummary) {
  const reasons: string[] = [];
  let cap = 1;
  if (features.invalidSampleCount > 0) {
    reasons.push("non-finite samples");
    cap = 0;
  }
  if (features.integratedLufs <= -70 || features.silenceRatio >= 0.995) {
    reasons.push("digital silence");
    cap = 0;
  }
  if (features.flatTopRate >= 0.0005 || features.clippingRate >= 0.05) {
    reasons.push("severe sustained clipping");
    cap = Math.min(cap, 0.4);
  }
  if (Math.abs(features.dcOffset) > 0.02) {
    reasons.push("dc offset");
    cap = Math.min(cap, 0.65);
  }
  if (features.spectralFlatness > 0.5 && features.sectionContrast < 0.03 && features.pulseClarity < 0.15) {
    reasons.push("stationary noise");
    cap = Math.min(cap, 0.2);
  }
  return Object.freeze({
    cap,
    valid: cap > 0,
    reasons: Object.freeze(reasons),
  });
}

export function scoreAudioFeatures(features: AudioSummary) {
  const durationConfidence = clamp01(features.durationSeconds / 20);
  // These estimators are engineering priors, not listener-validated probabilities.
  // Keep that uncertainty visible until held-out human reviews validate each curve.
  const provisionalConfidenceCeiling = 0.92;
  const evidenceConfidence = provisionalConfidenceCeiling * durationConfidence * clamp01(1 - features.silenceRatio);
  const bodyEnergy = clamp01(features.lowEnergy + features.bassEnergy);
  const dynamicRatio = features.rmsStdDev / Math.max(0.001, features.rmsMean);
  const rateEvidence = smoothstep(0.5, 2.5, features.onsetRate);
  const grooveEvidence = clamp01(
    features.pulseClarity * 0.55
      + clamp01(features.onsetRegularity / 0.82) * 0.35
      + rateEvidence * 0.1,
  );
  const grooveScore = smoothstep(0.18, 0.82, grooveEvidence);
  const grooveConfidence = evidenceConfidence * smoothstep(0.08, 0.55, Math.max(features.pulseClarity, features.onsetRegularity));
  const tonalEvidence = clamp01(features.harmonicity * 0.5 + (1 - features.chromaEntropy) * 0.2 + features.fifthsStability * 0.3);
  const tonalConfidence = evidenceConfidence * smoothstep(0.16, 0.58, tonalEvidence);
  const tonalRaw = clamp01(features.fifthsStability * 0.42 + features.scaleCompliance * 0.34 + features.harmonicity * 0.24);
  const tonalValid = tonalConfidence > 0.08;
  const structureEvidence = summarizeStructure(features.selfSimilarity);
  const contrastSupport = clamp01(features.sectionContrast / (features.sectionContrast + 0.2));
  const recurrenceSupport = clamp01(
    structureEvidence.distantRecurrence * (0.45 + 0.55 * (1 - structureEvidence.adjacentSimilarity)),
  );
  const structuralBalance = Math.sqrt(contrastSupport * recurrenceSupport);
  // A provisional structure model must leave headroom: recurrence plus contrast is
  // useful evidence, but it cannot prove excellent song form by itself.
  const structureRaw = clamp01(0.15 * contrastSupport + 0.25 * recurrenceSupport + 0.6 * structuralBalance);
  const structureScore = 0.08 + structureRaw * 0.84;
  const structureConfidence = evidenceConfidence * smoothstep(1, 6, features.sections.length);
  const structureValid = features.sections.length >= 2 && structureConfidence > 0.05;
  const highFrequencyRisk = smoothstep(0.06, 0.18, features.highEnergy);
  const noiseRisk = smoothstep(0.003, 0.02, features.spectralFlatness);
  const transientDensityRisk = smoothstep(0.48, 0.85, features.transientSpikeRate);
  const zeroCrossingRisk = smoothstep(0.3, 0.65, features.zcr);
  const harshnessRisk = clamp01(highFrequencyRisk * 0.42 + noiseRisk * 0.28 + transientDensityRisk * 0.18 + zeroCrossingRisk * 0.12);
  const lowMidRisk = smoothstep(0.24, 0.52, features.lowMidEnergy);
  const overloadRisk = Math.max(
    smoothstep(0.005, 0.05, features.clippingRate),
    smoothstep(0.0001, 0.0005, features.flatTopRate),
  );
  const translationScore = clamp01(1 - harshnessRisk * 0.42 - lowMidRisk * 0.28 - overloadRisk * 0.3);
  const bodySupport = smoothstep(0.12, 0.72, bodyEnergy);
  const dynamicArc = smoothstep(0.12, 0.7, dynamicRatio);
  const impactRaw = clamp01(bodySupport * 0.68 + dynamicArc * 0.32);
  const impactScore = smoothstep(0.15, 0.9, impactRaw);

  return [
    audioMetric("TonalIntent", tonalValid ? smoothstep(0.52, 0.92, tonalRaw) : null, {
      facet: "musical-intent",
      confidence: tonalConfidence,
      valid: tonalValid,
      status: tonalValid ? "valid" : "unreliable",
      summary: tonalValid
        ? "Tonal center, scale fit, and harmonic organization agree."
        : "Conventional tonal intent is too ambiguous to score reliably.",
      evidence: { tonalEvidence, tonalRaw, scaleCompliance: features.scaleCompliance, fifthsStability: features.fifthsStability },
    }),
    audioMetric("PulseCoherence", grooveScore, {
      facet: "groove",
      confidence: grooveConfidence,
      valid: grooveConfidence > 0.05,
      status: grooveConfidence > 0.05 ? "valid" : "unreliable",
      summary: "Pulse clarity, onset consistency, and event support form one groove vote.",
      evidence: { grooveEvidence, pulseClarity: features.pulseClarity, onsetRegularity: features.onsetRegularity, onsetRate: features.onsetRate },
    }),
    audioMetric("SectionDevelopment", structureValid ? structureScore : null, {
      facet: "form",
      confidence: structureConfidence,
      valid: structureValid,
      status: structureValid ? "valid" : "not-applicable",
      summary: structureValid
        ? "Section contrast and recurrence support an evolving form."
        : "Track is too short or has too few sections for reliable form scoring.",
      evidence: {
        adjacentSimilarity: structureEvidence.adjacentSimilarity,
        contrastSupport,
        distantRecurrence: structureEvidence.distantRecurrence,
        recurrenceSupport,
        sectionContrast: features.sectionContrast,
        structuralBalance,
        sectionCount: features.sections.length,
      },
    }),
    audioMetric("TranslationReadiness", translationScore, {
      facet: "translation",
      confidence: evidenceConfidence,
      summary: "Only demonstrated harshness, low-mid buildup, and overload risks affect mix translation.",
      evidence: { harshnessRisk, highFrequencyRisk, lowMidRisk, overloadRisk, clippingRate: features.clippingRate, flatTopRate: features.flatTopRate },
    }),
    audioMetric("EmbodiedImpact", impactScore, {
      facet: "impact",
      confidence: evidenceConfidence,
      summary: "Low-frequency body support and macro-dynamic motion form one physical-impact vote.",
      evidence: { bodyEnergy, bodySupport, dynamicRatio, dynamicArc },
    }),
  ];
}
export function analyzeAudioChannels(channelData: readonly Float32Array[], sourceSampleRate: number) {
  const analysisRate = Math.max(MIN_ANALYSIS_RATE, Math.min(MAX_ANALYSIS_RATE, sourceSampleRate));
  const mono = downmixAndResample(channelData, sourceSampleRate, analysisRate);
  const window = hannWindow(FFT_SIZE);
  const fft = createFftPlan(FFT_SIZE);
  const rmsValues: number[] = [];
  const centroids: number[] = [];
  const flatnessValues: number[] = [];
  const fluxValues: number[] = [];
  const zcrValues: number[] = [];
  const rolloffValues: number[] = [];
  const tensionValues: number[] = [];
  const dynamicCrestValues: number[] = [];
  const bandEnergy = Array.from({ length: 5 }, () => 0);
  const perceptualBandEnergy = Array.from({ length: PERCEPTUAL_BAND_COUNT }, () => 0);
  const chroma = Array.from({ length: 12 }, () => 0);
  const onsetEnvelope: number[] = [];
  const frameBandProfiles: number[][] = [];
  const frameChromas: number[][] = [];
  let previousSpectrum = new Float64Array(FFT_SIZE / 2);
  let previousChroma = Array.from({ length: 12 }, () => 0);
  let peak = 0;
  let clipped = 0;
  let flatTop = 0;
  let chromaFluxSum = 0;
  let chromaFluxCount = 0;

  let sourceSampleCount = 0;
  let invalidSampleCount = 0;
  let silentSampleCount = 0;
  let sourceSum = 0;
  let sourceSquareSum = 0;
  for (const channel of channelData) {
    let previousSample: number | undefined;
    for (const sample of channel) {
      sourceSampleCount += 1;
      if (!Number.isFinite(sample)) {
        invalidSampleCount += 1;
        continue;
      }
      const abs = Math.abs(sample);
      peak = Math.max(peak, abs);
      sourceSum += sample;
      sourceSquareSum += sample * sample;
      if (abs < 1e-5) {
        silentSampleCount += 1;
      }
      if (abs >= 0.9999) {
        clipped += 1;
      }
      if (previousSample !== undefined
        && abs >= 0.9
        && Math.abs(previousSample) >= 0.9
        && Math.sign(sample) === Math.sign(previousSample)
        && Math.abs(sample - previousSample) <= 1e-6) {
        flatTop += 1;
      }
      previousSample = sample;
    }
  }

  for (let offset = 0; offset + FFT_SIZE <= mono.length; offset += HOP_SIZE) {
    const frame = mono.subarray(offset, offset + FFT_SIZE);
    const frameRms = rms(frame);
    const framePeak = frame.reduce((peakValue, sample) => Math.max(peakValue, Math.abs(sample)), 0);
    rmsValues.push(frameRms);
    zcrValues.push(zeroCrossingRate(frame));

    const spectrum = magnitudeSpectrum(frame, window, fft);
    const spectral = summarizeSpectrum(spectrum, analysisRate, previousSpectrum);
    centroids.push(spectral.centroid);
    flatnessValues.push(spectral.flatness);
    fluxValues.push(spectral.flux);
    rolloffValues.push(spectral.rolloff);
    onsetEnvelope.push(spectral.flux * 0.72 + Math.max(0, frameRms - (rmsValues.at(-2) ?? frameRms)) * 28);
    const frameBandTotal = spectral.bands.reduce((sum, value) => sum + value, 0);
    const highShare = frameBandTotal > 0 ? spectral.bands[4]! / frameBandTotal : 0;
    const lowMidShare = frameBandTotal > 0 ? spectral.bands[2]! / frameBandTotal : 0;
    tensionValues.push(clamp01(highShare * 1.25 + lowMidShare * 0.3 + spectral.flatness * 0.4 + zcrValues.at(-1)! * 0.2));
    dynamicCrestValues.push(frameRms > 0 ? framePeak / frameRms : 0);
    previousSpectrum = spectral.normalizedSpectrum;
    const bandProfile = normalizeVector(spectral.bands);
    const frameChroma = normalizeVector(spectral.chroma);
    frameBandProfiles.push(bandProfile);
    frameChromas.push(frameChroma);
    if (frameChromas.length > 1) {
      chromaFluxSum += vectorDistance(frameChroma, previousChroma);
      chromaFluxCount += 1;
    }
    previousChroma = frameChroma;

    for (let index = 0; index < bandEnergy.length; index += 1) {
      bandEnergy[index] += spectral.bands[index] ?? 0;
    }
    for (let index = 0; index < perceptualBandEnergy.length; index += 1) {
      perceptualBandEnergy[index] += spectral.perceptualBands[index] ?? 0;
    }
    for (let index = 0; index < chroma.length; index += 1) {
      chroma[index] += spectral.chroma[index] ?? 0;
    }
  }

  const bandTotal = bandEnergy.reduce((sum, value) => sum + value, 0);
  const normalizedChroma = normalizeVector(chroma);
  const scaleCompliance = bestScaleCompliance(normalizedChroma).score;
  const fifthsStability = computeFifthsStability(normalizedChroma);
  const stereoWidth = computeStereoWidth(channelData);
  const onsetStats = summarizeOnsets(onsetEnvelope, analysisRate);
  const rmsMean = mean(rmsValues);
  const spectralFlatness = mean(flatnessValues);
  const spectralEntropy = normalizedEntropy([...bandEnergy, ...normalizedChroma]);
  const chromaFlux = chromaFluxCount > 0 ? chromaFluxSum / chromaFluxCount : 0;
  const structure = summarizeAudioStructure(rmsValues, centroids, frameBandProfiles, frameChromas, analysisRate);
  const sectionContrast = structure.contrast;
  const harmonicity = clamp01((scaleCompliance * 0.42 + fifthsStability * 0.24 + (1 - spectralFlatness) * 0.34));
  const sourceMeanSquare = sourceSquareSum / Math.max(1, sourceSampleCount - invalidSampleCount);
  const frameLoudness = rmsValues.map((value) => amplitudeToDb(value));
  const groovePulseValues = normalizeRange(onsetEnvelope);
  const sectionScoreValues = buildSectionScoreValues(rmsValues, fluxValues, tensionValues, groovePulseValues, analysisRate);

  return {
    durationSeconds: mono.length / analysisRate,
    sourceSampleRate,
    sourceChannelCount: channelData.length,
    sampleRate: analysisRate,
    rmsMean,
    rmsStdDev: standardDeviation(rmsValues),
    crestFactor: rmsMean > 0 ? peak / rmsMean : 0,
    clippingRate: clipped / Math.max(1, sourceSampleCount - invalidSampleCount),
    flatTopRate: flatTop / Math.max(1, sourceSampleCount - invalidSampleCount),
    samplePeakDbfs: amplitudeToDb(peak),
    truePeakDbtp: amplitudeToDb(peak),
    integratedLufs: Math.max(-120, -0.691 + powerToDb(sourceMeanSquare)),
    loudnessRange: percentile(frameLoudness, 0.95) - percentile(frameLoudness, 0.1),
    dcOffset: sourceSum / Math.max(1, sourceSampleCount - invalidSampleCount),
    silenceRatio: silentSampleCount / Math.max(1, sourceSampleCount - invalidSampleCount),
    invalidSampleCount,
    spectralCentroid: mean(centroids),
    spectralCentroidStdDev: standardDeviation(centroids),
    spectralFlatness,
    spectralFlux: mean(fluxValues),
    spectralEntropy,
    rolloffHz: mean(rolloffValues),
    zcr: mean(zcrValues),
    lowEnergy: bandTotal > 0 ? bandEnergy[0]! / bandTotal : 0,
    bassEnergy: bandTotal > 0 ? bandEnergy[1]! / bandTotal : 0,
    lowMidEnergy: bandTotal > 0 ? bandEnergy[2]! / bandTotal : 0,
    midEnergy: bandTotal > 0 ? bandEnergy[3]! / bandTotal : 0,
    highEnergy: bandTotal > 0 ? bandEnergy[4]! / bandTotal : 0,
    stereoWidth,
    onsetRate: onsetStats.rate,
    onsetRegularity: onsetStats.regularity,
    pulseClarity: onsetStats.pulseClarity,
    transientSpikeRate: onsetStats.spikeRate,
    chroma: normalizedChroma,
    chromaFlux,
    chromaEntropy: normalizedEntropy(normalizedChroma),
    sectionContrast,
    selfSimilarity: structure.selfSimilarity,
    sections: structure.sections,
    scaleCompliance,
    fifthsStability,
    cymaticSymmetry: computeCymaticSymmetry(normalizedChroma),
    harmonicity,
    perceptualBands: summarizePerceptualBands(perceptualBandEnergy, analysisRate),
    timeline: {
      loudness: buildTimeline(frameLoudness, analysisRate),
      centroid: buildTimeline(centroids, analysisRate),
      flux: buildTimeline(fluxValues, analysisRate),
      tension: buildTimeline(tensionValues, analysisRate),
      dynamics: buildTimeline(dynamicCrestValues, analysisRate),
      groovePulse: buildTimeline(groovePulseValues, analysisRate),
      sectionScore: buildTimeline(sectionScoreValues, analysisRate),
    },
  };
}

function audioMetric(
  name: AudioMetricName,
  score: number | null,
  options: {
    readonly facet: string;
    readonly confidence: number;
    readonly valid?: boolean;
    readonly status?: AudioMetricScore["status"];
    readonly summary: string;
    readonly evidence: MetricEvidence;
  },
) {
  const definition = AUDIO_METRIC_DEFINITIONS.find((candidate) => candidate.name === name)!;
  const normalizedScore = score === null ? null : clamp01(score);
  const valid = options.valid ?? (normalizedScore !== null && options.confidence > 0);
  return {
    name,
    id: definition.id,
    dimension: definition.dimension,
    facet: options.facet,
    score: normalizedScore,
    confidence: clamp01(options.confidence),
    valid,
    status: options.status ?? (valid ? "valid" : "unreliable"),
    summary: options.summary,
    evidence: Object.freeze(options.evidence),
  };
}

function smoothstep(minimum: number, maximum: number, value: number) {
  const normalized = clamp01((value - minimum) / Math.max(Number.EPSILON, maximum - minimum));
  return normalized * normalized * (3 - 2 * normalized);
}

function summarizeStructure(matrix: readonly (readonly number[])[]) {
  if (matrix.length < 2) return { adjacentSimilarity: 0, distantRecurrence: 0 };
  const adjacent: number[] = [];
  const distant: number[] = [];
  for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] ?? [];
    const adjacentValue = row[rowIndex - 1];
    if (Number.isFinite(adjacentValue)) adjacent.push(clamp01(adjacentValue!));
    const distantValues = row
      .slice(0, Math.max(0, rowIndex - 1))
      .filter(Number.isFinite)
      .map(clamp01);
    if (distantValues.length > 0) distant.push(Math.max(...distantValues));
  }
  return {
    adjacentSimilarity: adjacent.length > 0 ? mean(adjacent) : 0,
    distantRecurrence: distant.length > 0 ? mean(distant) : 0,
  };
}

function downmixAndResample(channelData: readonly Float32Array[], sourceSampleRate: number, targetSampleRate: number) {
  const sourceLength = channelData[0]?.length ?? 0;
  const source = new Float32Array(sourceLength);
  for (let index = 0; index < sourceLength; index += 1) {
    let sum = 0;
    for (const channel of channelData) {
      sum += Number.isFinite(channel[index]) ? channel[index]! : 0;
    }
    source[index] = channelData.length > 0 ? sum / channelData.length : 0;
  }
  if (sourceSampleRate === targetSampleRate || sourceLength === 0) {
    return source;
  }

  const ratio = sourceSampleRate / targetSampleRate;
  const targetLength = Math.max(0, Math.floor(sourceLength / ratio));
  const mono = new Float32Array(targetLength);
  if (targetSampleRate > sourceSampleRate) {
    for (let index = 0; index < targetLength; index += 1) {
      const position = index * ratio;
      const left = Math.min(sourceLength - 1, Math.floor(position));
      const right = Math.min(sourceLength - 1, left + 1);
      const mix = position - left;
      mono[index] = source[left]! * (1 - mix) + source[right]! * mix;
    }
    return mono;
  }

  const radius = 10;
  const cutoff = (targetSampleRate / sourceSampleRate) * 0.92;
  for (let index = 0; index < targetLength; index += 1) {
    const position = index * ratio;
    const center = Math.floor(position);
    let weighted = 0;
    let kernelSum = 0;
    for (let tap = center - radius + 1; tap <= center + radius; tap += 1) {
      if (tap < 0 || tap >= sourceLength) {
        continue;
      }
      const distance = position - tap;
      const normalizedDistance = Math.abs(distance) / radius;
      const window = normalizedDistance <= 1
        ? 0.42 + 0.5 * Math.cos(Math.PI * normalizedDistance) + 0.08 * Math.cos(2 * Math.PI * normalizedDistance)
        : 0;
      const x = Math.PI * cutoff * distance;
      const kernel = cutoff * (Math.abs(x) < 1e-9 ? 1 : Math.sin(x) / x) * window;
      weighted += source[tap]! * kernel;
      kernelSum += kernel;
    }
    mono[index] = kernelSum !== 0 ? weighted / kernelSum : 0;
  }
  return mono;
}

function hannWindow(size: number) {
  return Float64Array.from({ length: size }, (_, index) => 0.5 - 0.5 * Math.cos((Math.PI * 2 * index) / (size - 1)));
}

function createFftPlan(size: number) {
  const levels = Math.log2(size);
  const reverse = new Uint32Array(size);
  for (let index = 0; index < size; index += 1) {
    let value = index;
    let reversed = 0;
    for (let bit = 0; bit < levels; bit += 1) {
      reversed = (reversed << 1) | (value & 1);
      value >>= 1;
    }
    reverse[index] = reversed;
  }
  return { size, reverse };
}

function magnitudeSpectrum(frame: Float32Array, window: Float64Array, plan: ReturnType<typeof createFftPlan>) {
  const real = new Float64Array(plan.size);
  const imaginary = new Float64Array(plan.size);

  for (let index = 0; index < plan.size; index += 1) {
    real[plan.reverse[index]!] = (frame[index] ?? 0) * window[index]!;
  }

  for (let size = 2; size <= plan.size; size <<= 1) {
    const half = size >> 1;
    const phaseStep = (-2 * Math.PI) / size;
    for (let start = 0; start < plan.size; start += size) {
      for (let offset = 0; offset < half; offset += 1) {
        const angle = phaseStep * offset;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const evenIndex = start + offset;
        const oddIndex = evenIndex + half;
        const oddReal = real[oddIndex]! * cos - imaginary[oddIndex]! * sin;
        const oddImaginary = real[oddIndex]! * sin + imaginary[oddIndex]! * cos;
        real[oddIndex] = real[evenIndex]! - oddReal;
        imaginary[oddIndex] = imaginary[evenIndex]! - oddImaginary;
        real[evenIndex] += oddReal;
        imaginary[evenIndex] += oddImaginary;
      }
    }
  }

  const spectrum = new Float64Array(plan.size / 2);
  for (let index = 0; index < spectrum.length; index += 1) {
    spectrum[index] = Math.hypot(real[index]!, imaginary[index]!);
  }
  return spectrum;
}

function summarizeSpectrum(spectrum: Float64Array, sampleRate: number, previousSpectrum: Float64Array) {
  let energy = 0;
  let weightedFrequency = 0;
  let logEnergy = 0;
  let flux = 0;
  const bands = Array.from({ length: 5 }, () => 0);
  const perceptualBands = Array.from({ length: PERCEPTUAL_BAND_COUNT }, () => 0);
  const chroma = Array.from({ length: 12 }, () => 0);
  const magnitudeTotal = spectrum.reduce((sum, magnitude, index) => index > 0 ? sum + magnitude : sum, 0);
  const normalizedSpectrum = Float64Array.from(spectrum, (magnitude, index) => (
    index > 0 && magnitudeTotal > 0 ? magnitude / magnitudeTotal : 0
  ));

  for (let index = 1; index < spectrum.length; index += 1) {
    const magnitude = spectrum[index]!;
    const power = magnitude * magnitude;
    const frequency = (index * sampleRate) / (spectrum.length * 2);
    energy += power;
    weightedFrequency += frequency * power;
    logEnergy += Math.log(power + 1e-12);
    flux += Math.max(0, normalizedSpectrum[index]! - (previousSpectrum[index] ?? 0));

    const bandIndex = frequency < 80 ? 0 : frequency < 250 ? 1 : frequency < 700 ? 2 : frequency < 3_500 ? 3 : 4;
    bands[bandIndex] += power;
    if (frequency >= 20 && frequency <= Math.min(16_000, sampleRate / 2)) {
      perceptualBands[perceptualBandIndex(frequency, sampleRate)]! += power;
    }
    if (frequency >= 32 && frequency <= 5_000) {
      const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
      chroma[((midi % 12) + 12) % 12] += power;
    }
  }

  let cumulative = 0;
  let rolloff = 0;
  for (let index = 1; index < spectrum.length; index += 1) {
    cumulative += spectrum[index]! * spectrum[index]!;
    if (rolloff === 0 && cumulative >= energy * 0.85) {
      rolloff = (index * sampleRate) / (spectrum.length * 2);
    }
  }

  const binCount = Math.max(1, spectrum.length - 1);
  const arithmeticMean = energy / binCount;
  const geometricMean = Math.exp(logEnergy / binCount);
  return {
    centroid: energy > 0 ? weightedFrequency / energy : 0,
    flatness: arithmeticMean > 0 ? clamp01(geometricMean / arithmeticMean) : 0,
    flux,
    rolloff,
    bands,
    perceptualBands,
    chroma,
    normalizedSpectrum,
  };
}

function computeFifthsStability(chroma: readonly number[]) {
  const dominant = maxIndex(chroma);
  const rootIndex = FIFTHS_ORDER.indexOf(dominant);
  let weightedDistance = 0;
  let total = 0;
  for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
    const index = FIFTHS_ORDER.indexOf(pitchClass);
    const raw = Math.abs(index - rootIndex);
    const distance = Math.min(raw, 12 - raw);
    const weight = chroma[pitchClass] ?? 0;
    weightedDistance += distance * weight;
    total += weight;
  }
  return total > 0 ? clamp01(1 - weightedDistance / (total * 6)) : 0;
}

function computeCymaticSymmetry(chroma: readonly number[]) {
  const center = maxIndex(chroma);
  let mirrorError = 0;
  let total = 0;
  let vectorX = 0;
  let vectorY = 0;

  for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
    const weight = chroma[pitchClass] ?? 0;
    const mirrored = ((2 * center - pitchClass) % 12 + 12) % 12;
    mirrorError += Math.abs(weight - (chroma[mirrored] ?? 0));
    total += weight;
    const angle = (pitchClass / 12) * Math.PI * 2;
    vectorX += Math.cos(angle) * weight;
    vectorY += Math.sin(angle) * weight;
  }

  const mirror = total > 0 ? 1 - mirrorError / (total * 2) : 0;
  const radial = total > 0 ? Math.hypot(vectorX, vectorY) / total : 0;
  return clamp01(mirror * 0.62 + radial * 0.38);
}

function computeStereoWidth(channelData: readonly Float32Array[]) {
  if (channelData.length < 2) {
    return 0;
  }

  const left = channelData[0]!;
  const right = channelData[1]!;
  const step = Math.max(1, Math.floor(Math.min(left.length, right.length) / 120_000));
  const mid: number[] = [];
  const side: number[] = [];
  for (let index = 0; index < Math.min(left.length, right.length); index += step) {
    mid.push(((left[index] ?? 0) + (right[index] ?? 0)) * 0.5);
    side.push(((left[index] ?? 0) - (right[index] ?? 0)) * 0.5);
  }

  const midEnergy = Math.sqrt(mean(mid.map((sample) => sample * sample)));
  const sideEnergy = Math.sqrt(mean(side.map((sample) => sample * sample)));
  return midEnergy > 0 ? clamp01(sideEnergy / midEnergy) : 0;
}

function summarizeOnsets(envelope: readonly number[], sampleRate: number) {
  if (envelope.length < 4) {
    return { rate: 0, regularity: 0, pulseClarity: 0, spikeRate: 0 };
  }

  const average = mean(envelope);
  const deviation = standardDeviation(envelope);
  const threshold = average + deviation * 0.78;
  const onsets: number[] = [];
  let spikes = 0;
  let lastOnset = -Infinity;
  const minSpacing = 2;

  for (let index = 1; index + 1 < envelope.length; index += 1) {
    const value = envelope[index] ?? 0;
    if (value > threshold && value > (envelope[index - 1] ?? 0) && value >= (envelope[index + 1] ?? 0) && index - lastOnset >= minSpacing) {
      onsets.push(index);
      lastOnset = index;
      if (value > average + deviation * 2.6) {
        spikes += 1;
      }
    }
  }

  const seconds = (envelope.length * HOP_SIZE) / sampleRate;
  const deltas: number[] = [];
  for (let index = 1; index < onsets.length; index += 1) {
    deltas.push(onsets[index]! - onsets[index - 1]!);
  }
  const deltaRegularity = deltas.length > 2 ? clamp01(1 - standardDeviation(deltas) / Math.max(1, mean(deltas))) : 0;
  const activityGate = clamp01(onsets.length / Math.max(4, seconds * 0.45));
  const pulseClarity = estimatePulseClarity(envelope, sampleRate) * activityGate;
  const regularity = Math.max(deltaRegularity, pulseClarity * 0.82);

  return {
    rate: onsets.length / Math.max(1, seconds),
    regularity,
    pulseClarity,
    spikeRate: spikes / Math.max(1, onsets.length),
  };
}

function estimatePulseClarity(envelope: readonly number[], sampleRate: number) {
  const average = mean(envelope);
  const deviation = standardDeviation(envelope);
  const contrast = average > 0 ? clamp01((deviation / average - 0.18) / 0.82) : 0;
  if (contrast <= 0) {
    return 0;
  }

  let energy = 0;
  for (const value of envelope) {
    const centered = Math.max(0, value - average);
    energy += centered * centered;
  }
  if (energy <= 0) {
    return 0;
  }

  const minLag = Math.max(2, Math.floor((sampleRate * 60) / (HOP_SIZE * 240)));
  const maxLag = Math.min(Math.ceil((sampleRate * 60) / (HOP_SIZE * 40)), Math.floor(envelope.length / 2));
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let index = lag; index < envelope.length; index += 1) {
      const left = Math.max(0, (envelope[index] ?? 0) - average);
      const right = Math.max(0, (envelope[index - lag] ?? 0) - average);
      correlation += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }
    const normalized = leftEnergy > 0 && rightEnergy > 0 ? correlation / Math.sqrt(leftEnergy * rightEnergy) : 0;
    best = Math.max(best, normalized);
  }

  return clamp01((best - 0.12) / 0.42) * contrast;
}

function normalizeVector(values: readonly number[]) {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  return total > 0 ? values.map((value) => Math.max(0, value) / total) : Array.from({ length: values.length }, () => 0);
}

function vectorDistance(left: readonly number[], right: readonly number[]) {
  const length = Math.max(left.length, right.length);
  if (length === 0) {
    return 0;
  }

  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    sum += ((left[index] ?? 0) - (right[index] ?? 0)) ** 2;
  }
  return Math.sqrt(sum / length);
}

function summarizeAudioStructure(
  rmsValues: readonly number[],
  centroids: readonly number[],
  frameBandProfiles: readonly (readonly number[])[],
  frameChromas: readonly (readonly number[])[],
  sampleRate: number,
) {
  const frameCount = Math.min(rmsValues.length, centroids.length, frameBandProfiles.length, frameChromas.length);
  const framesPerSection = Math.max(4, Math.round((8 * sampleRate) / HOP_SIZE));
  if (frameCount < framesPerSection * 2) {
    return { contrast: 0, selfSimilarity: [], sections: [] };
  }

  const sections: {
    readonly rms: number;
    readonly centroid: number;
    readonly bands: readonly number[];
    readonly chroma: readonly number[];
  }[] = [];

  for (let start = 0; start + framesPerSection <= frameCount; start += framesPerSection) {
    const end = start + framesPerSection;
    sections.push({
      rms: mean(rmsValues.slice(start, end)),
      centroid: mean(centroids.slice(start, end)),
      bands: meanVectors(frameBandProfiles.slice(start, end)),
      chroma: meanVectors(frameChromas.slice(start, end)),
    });
  }

  if (sections.length < 2) {
    return { contrast: 0, selfSimilarity: [], sections: [] };
  }

  const rmsMean = mean(sections.map((section) => section.rms));
  const rmsRange = (Math.max(...sections.map((section) => section.rms)) - Math.min(...sections.map((section) => section.rms))) / Math.max(0.001, rmsMean);
  const centroidRange = (Math.max(...sections.map((section) => section.centroid)) - Math.min(...sections.map((section) => section.centroid))) / 1_600;
  let bandMotion = 0;
  let chromaMotion = 0;
  for (let index = 1; index < sections.length; index += 1) {
    bandMotion += vectorDistance(sections[index]!.bands, sections[index - 1]!.bands);
    chromaMotion += vectorDistance(sections[index]!.chroma, sections[index - 1]!.chroma);
  }

  const sectionDeltas = Math.max(1, sections.length - 1);
  const contrast = clamp01(
    clamp01(rmsRange / 1.2) * 0.28
      + clamp01(centroidRange) * 0.24
      + clamp01((bandMotion / sectionDeltas) / 0.18) * 0.24
      + clamp01((chromaMotion / sectionDeltas) / 0.16) * 0.24,
  );
  const vectors = sections.map((section) => [
    section.rms / Math.max(0.001, rmsMean),
    section.centroid / Math.max(1, sampleRate / 2),
    ...section.bands,
    ...section.chroma,
  ]);
  const selfSimilarity = vectors.map((left) => vectors.map((right) => cosineSimilarity(left, right)));
  const labels: string[] = [];
  let labelCount = 0;
  for (let index = 0; index < sections.length; index += 1) {
    const recurringIndex = selfSimilarity[index]!.findIndex((similarity, candidate) => candidate < index && similarity >= 0.94);
    if (recurringIndex >= 0) {
      labels.push(labels[recurringIndex]!);
    } else {
      labels.push(String.fromCharCode(65 + Math.min(25, labelCount)));
      labelCount += 1;
    }
  }
  return {
    contrast,
    selfSimilarity,
    sections: sections.map((_, index) => {
      const previousSimilarity = index > 0 ? selfSimilarity[index]![index - 1]! : 1 - contrast;
      return {
        startSeconds: index * 8,
        endSeconds: Math.min(frameCount * HOP_SIZE / sampleRate, (index + 1) * 8),
        label: labels[index]!,
        score: clamp01(0.72 + (1 - previousSimilarity) * 0.28),
      };
    }),
  };
}

function cosineSimilarity(left: readonly number[], right: readonly number[]) {
  let dot = 0;
  let leftPower = 0;
  let rightPower = 0;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftPower += leftValue * leftValue;
    rightPower += rightValue * rightValue;
  }
  return leftPower > 0 && rightPower > 0 ? clamp01(dot / Math.sqrt(leftPower * rightPower)) : 0;
}

function meanVectors(vectors: readonly (readonly number[])[]) {
  const length = vectors.reduce((max, vector) => Math.max(max, vector.length), 0);
  if (length === 0 || vectors.length === 0) {
    return [];
  }

  const sums = Array.from({ length }, () => 0);
  for (const vector of vectors) {
    for (let index = 0; index < length; index += 1) {
      sums[index] += vector[index] ?? 0;
    }
  }
  return sums.map((value) => value / vectors.length);
}

function summarizePerceptualBands(energies: readonly number[], sampleRate: number) {
  const maximumHz = Math.min(16_000, sampleRate / 2);
  const total = energies.reduce((sum, value) => sum + Math.max(0, value), 0);
  return Object.freeze(energies.map((energy, index) => {
    const lowHz = perceptualBandEdge(index, maximumHz);
    const highHz = perceptualBandEdge(index + 1, maximumHz);
    return Object.freeze({
      lowHz: Math.round(lowHz),
      highHz: Math.round(highHz),
      energyDb: powerToDb(energy),
      share: total > 0 ? energy / total : 0,
    });
  }));
}

function perceptualBandIndex(frequency: number, sampleRate: number) {
  const maximumHz = Math.min(16_000, sampleRate / 2);
  const minimumErb = erbRate(20);
  const maximumErb = erbRate(maximumHz);
  const normalized = (erbRate(frequency) - minimumErb) / Math.max(0.001, maximumErb - minimumErb);
  return Math.max(0, Math.min(PERCEPTUAL_BAND_COUNT - 1, Math.floor(normalized * PERCEPTUAL_BAND_COUNT)));
}

function perceptualBandEdge(index: number, maximumHz: number) {
  const minimumErb = erbRate(20);
  const maximumErb = erbRate(maximumHz);
  return inverseErbRate(minimumErb + (maximumErb - minimumErb) * index / PERCEPTUAL_BAND_COUNT);
}

function erbRate(frequency: number) {
  return 21.4 * Math.log10(1 + 0.00437 * Math.max(0, frequency));
}

function inverseErbRate(rate: number) {
  return (10 ** (rate / 21.4) - 1) / 0.00437;
}
