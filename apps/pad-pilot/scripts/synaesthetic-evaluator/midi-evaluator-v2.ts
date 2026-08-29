import { summarizeMidi, type MidiSummary } from "./midi-utils";
import {
  buildScaleMask,
  clamp01,
  MAJOR_SCALE,
  NATURAL_MINOR_SCALE,
  PENTATONIC_SCALE,
  weightedMaskCompliance,
} from "./skill-math";
import { mean, standardDeviation } from "./statistics";

export type MidiMetricStatus = "valid" | "not-applicable" | "unreliable" | "failed";
export type MidiDimensionId = "musicality" | "groove" | "structure" | "emotional-impact";

export type MidiMetricEvidence = {
  readonly id: string;
  readonly value: number | string | boolean | readonly number[];
  readonly unit?: string;
  readonly target?: string;
};

export type MidiMetricResult = {
  readonly id: `midi.${string}`;
  readonly dimension: MidiDimensionId;
  readonly facet: string;
  readonly score: number | null;
  readonly confidence: number;
  readonly valid: boolean;
  readonly status: MidiMetricStatus;
  readonly evidence: readonly MidiMetricEvidence[];
  readonly summary: string;
};

export type MidiFacetResult = {
  readonly id: string;
  readonly score: number | null;
  readonly confidence: number;
  readonly coverage: number;
  readonly metricIds: readonly `midi.${string}`[];
};

export type MidiDimensionResult = {
  readonly id: MidiDimensionId;
  readonly score: number | null;
  readonly confidence: number;
  readonly coverage: number;
  readonly facets: readonly MidiFacetResult[];
};

export type MidiContributor = {
  readonly id: string;
  readonly dimension: MidiDimensionId;
  readonly contribution: number;
  readonly summary: string;
};

export type MidiV2Report = {
  readonly schemaVersion: 2;
  readonly mediaKind: "midi";
  readonly overall: number;
  readonly confidence: number;
  readonly dimensions: readonly MidiDimensionResult[];
  readonly metrics: readonly MidiMetricResult[];
  readonly strengths: readonly MidiContributor[];
  readonly weaknesses: readonly MidiContributor[];
  readonly diagnostics: ReturnType<typeof buildMidiDiagnostics>;
};

export type MidiV2EvaluationContext = {
  readonly bpm?: number;
  readonly tonicPitchClass?: number;
  readonly scalePitchClasses?: readonly number[];
};

const DIMENSION_WEIGHTS = {
  musicality: 0.34,
  groove: 0.26,
  structure: 0.24,
  "emotional-impact": 0.16,
} satisfies Record<MidiDimensionId, number>;

export function evaluateMidiV2(midi: Uint8Array, context: MidiV2EvaluationContext = {}) {
  const summary = summarizeMidi(midi);
  return evaluateMidiSummaryV2(summary, context);
}

export function evaluateMidiSummaryV2(summary: MidiSummary, context: MidiV2EvaluationContext = {}) {
  const diagnostics = buildMidiDiagnostics(summary, context);
  const metrics = buildMetrics(summary, diagnostics, context);
  const dimensions = aggregateDimensions(metrics);
  const available = dimensions.filter((dimension) => dimension.score !== null);
  const totalWeight = available.reduce((sum, dimension) => sum + DIMENSION_WEIGHTS[dimension.id], 0);
  const overall = summary.noteCount === 0 || totalWeight === 0
    ? 0
    : clamp01(available.reduce((sum, dimension) => sum + dimension.score! * DIMENSION_WEIGHTS[dimension.id], 0) / totalWeight);
  const coverage = Object.values(DIMENSION_WEIGHTS).reduce((sum, value) => sum + value, 0);
  const confidence = summary.noteCount === 0
    ? 1
    : clamp01(available.reduce((sum, dimension) => sum + dimension.confidence * DIMENSION_WEIGHTS[dimension.id], 0) / coverage);
  const contributors = dimensions.flatMap((dimension) => dimension.facets
    .filter((facet) => facet.score !== null)
    .map((facet) => ({
      id: facet.id,
      dimension: dimension.id,
      contribution: DIMENSION_WEIGHTS[dimension.id] * facet.confidence * (facet.score! - 0.5),
      summary: `${facet.id} scored ${facet.score!.toFixed(3)} with ${facet.confidence.toFixed(3)} confidence.`,
    } satisfies MidiContributor)));

  return {
    schemaVersion: 2,
    mediaKind: "midi",
    overall,
    confidence,
    dimensions,
    metrics,
    strengths: contributors.filter((entry) => entry.contribution > 0).sort((left, right) => right.contribution - left.contribution),
    weaknesses: contributors.filter((entry) => entry.contribution < 0).sort((left, right) => left.contribution - right.contribution),
    diagnostics,
  } satisfies MidiV2Report;
}

function buildMetrics(summary: MidiSummary, diagnostics: ReturnType<typeof buildMidiDiagnostics>, context: MidiV2EvaluationContext) {
  const tonalEvidence = diagnostics.harmony.keyConfidence >= 0.16 && summary.noteCount >= 4;
  const scaleScore = context.scalePitchClasses
    ? weightedMaskCompliance(summary.pitchClassHistogram, buildScaleMask(0, context.scalePitchClasses))
    : diagnostics.harmony.scaleFit;
  const tonalMetric = tonalEvidence
    ? validMetric({
      id: "midi.harmony.tonal-center",
      dimension: "musicality",
      facet: "harmony",
      score: scaleScore,
      confidence: diagnostics.harmony.keyConfidence,
      evidence: [
        { id: "key-root", value: diagnostics.harmony.keyRoot, unit: "pitch-class" },
        { id: "key-confidence", value: diagnostics.harmony.keyConfidence },
        { id: "scale-fit", value: scaleScore },
      ],
      summary: `Tonal center pc ${diagnostics.harmony.keyRoot} has ${percent(diagnostics.harmony.keyConfidence)} confidence.`,
    })
    : unavailableMetric({
      id: "midi.harmony.tonal-center",
      dimension: "musicality",
      facet: "harmony",
      status: summary.noteCount < 4 ? "not-applicable" : "unreliable",
      confidence: diagnostics.harmony.keyConfidence,
      evidence: [{ id: "key-confidence", value: diagnostics.harmony.keyConfidence }],
      summary: "Pitch evidence is intentionally left unscored because no reliable conventional key was found.",
    });

  return [
    tonalMetric,
    metricFromDiagnostic("midi.harmony.chord-progression", "musicality", "harmony", diagnostics.harmony.progressionScore, diagnostics.harmony.chordConfidence, [
      { id: "chord-roots", value: diagnostics.harmony.chordRoots, unit: "pitch-class" },
      { id: "root-progression-recurrence", value: diagnostics.harmony.progressionRecurrence },
      { id: "harmonic-rhythm", value: diagnostics.harmony.harmonicRhythm, unit: "changes-per-beat" },
    ], "Chord-root movement and harmonic-rhythm recurrence."),
    metricFromDiagnostic("midi.harmony.cadence-strength", "musicality", "harmony", diagnostics.harmony.cadenceStrength, diagnostics.harmony.cadenceConfidence, [
      { id: "cadence-strength", value: diagnostics.harmony.cadenceStrength ?? 0 },
      { id: "key-confidence", value: diagnostics.harmony.keyConfidence },
    ], "Phrase-ending arrival relative to the inferred tonal center."),
    metricFromDiagnostic("midi.harmony.voice-leading", "musicality", "harmony", diagnostics.harmony.voiceLeadingScore, diagnostics.harmony.chordConfidence, [
      { id: "mean-voice-leading-distance", value: diagnostics.harmony.meanVoiceLeadingDistance, unit: "semitones" },
    ], "Distance between adjacent chord voices."),
    metricFromDiagnostic("midi.melody.phrase-shape", "musicality", "melody", diagnostics.melody.score, diagnostics.melody.confidence, [
      { id: "range", value: diagnostics.melody.range, unit: "semitones" },
      { id: "motif-recurrence", value: diagnostics.melody.motifRecurrence },
      { id: "leap-resolution", value: diagnostics.melody.leapResolution },
      { id: "rest-placement", value: diagnostics.melody.restPlacement },
      { id: "climax-location", value: diagnostics.melody.climaxLocation },
      { id: "interval-distribution", value: diagnostics.melody.intervalDistribution },
    ], "Melodic contour, motif recurrence, and leap resolution."),
    metricFromDiagnostic("midi.rhythm.pulse-coherence", "groove", "pulse", diagnostics.rhythm.score, diagnostics.rhythm.confidence, [
      { id: "grid-alignment", value: diagnostics.rhythm.gridAlignment },
      { id: "syncopation", value: diagnostics.rhythm.syncopation },
      { id: "tempo-stability", value: diagnostics.rhythm.tempoStability },
      { id: "downbeat-consistency", value: diagnostics.rhythm.downbeatConsistency },
      { id: "swing-ratio", value: diagnostics.rhythm.swingRatio },
      { id: "inter-onset-distribution", value: diagnostics.rhythm.interOnsetDistribution },
    ], "PPQ-aware beat/bar placement, syncopation, swing, and tempo stability."),
    metricFromDiagnostic("midi.structure.section-development", "structure", "form", diagnostics.structure.score, diagnostics.structure.confidence, [
      { id: "section-repetition", value: diagnostics.structure.repetition },
      { id: "section-contrast", value: diagnostics.structure.contrast },
      { id: "phrase-boundary-strength", value: diagnostics.structure.phraseBoundaryStrength },
      { id: "self-similarity", value: diagnostics.structure.selfSimilarity },
    ], "Section repetition, contrast, and phrase-boundary evidence."),
    metricFromDiagnostic("midi.expression.dynamic-arc", "emotional-impact", "expression", diagnostics.expression.score, diagnostics.expression.confidence, [
      { id: "velocity-variation", value: diagnostics.expression.velocityVariation },
      { id: "climax-location", value: diagnostics.melody.climaxLocation },
      { id: "tension-release", value: diagnostics.expression.tensionRelease },
    ], "Velocity motion, climax placement, and interval tension-release behavior."),
  ];
}

function metricFromDiagnostic(
  id: `midi.${string}`,
  dimension: MidiDimensionId,
  facet: string,
  score: number | null,
  confidence: number,
  evidence: readonly MidiMetricEvidence[],
  summary: string,
) {
  if (score === null) {
    return unavailableMetric({ id, dimension, facet, status: "not-applicable", confidence, evidence, summary });
  }
  return validMetric({ id, dimension, facet, score, confidence, evidence, summary });
}

function validMetric(value: Omit<MidiMetricResult, "valid" | "status">) {
  return {
    ...value,
    score: clamp01(value.score ?? 0),
    confidence: clamp01(value.confidence),
    valid: true,
    status: "valid",
  } satisfies MidiMetricResult;
}

function unavailableMetric(value: Omit<MidiMetricResult, "score" | "valid">) {
  return {
    ...value,
    score: null,
    confidence: clamp01(value.confidence),
    valid: false,
  } satisfies MidiMetricResult;
}

function aggregateDimensions(metrics: readonly MidiMetricResult[]) {
  return (Object.keys(DIMENSION_WEIGHTS) as MidiDimensionId[]).map((dimensionId) => {
    const dimensionMetrics = metrics.filter((metric) => metric.dimension === dimensionId);
    const facetIds = [...new Set(dimensionMetrics.map((metric) => metric.facet))];
    const facets = facetIds.map((facetId) => aggregateFacet(facetId, dimensionMetrics.filter((metric) => metric.facet === facetId)));
    const validFacets = facets.filter((facet) => facet.score !== null);
    const confidenceWeight = validFacets.reduce((sum, facet) => sum + facet.confidence, 0);
    return {
      id: dimensionId,
      score: confidenceWeight > 0
        ? validFacets.reduce((sum, facet) => sum + facet.score! * facet.confidence, 0) / confidenceWeight
        : null,
      confidence: facets.length > 0 ? validFacets.reduce((sum, facet) => sum + facet.confidence, 0) / facets.length : 0,
      coverage: facets.length > 0 ? validFacets.length / facets.length : 0,
      facets,
    } satisfies MidiDimensionResult;
  });
}

function aggregateFacet(id: string, metrics: readonly MidiMetricResult[]) {
  const validMetrics = metrics.filter((metric) => metric.valid && metric.score !== null);
  const confidenceWeight = validMetrics.reduce((sum, metric) => sum + metric.confidence, 0);
  const score = confidenceWeight > 0
    ? validMetrics.reduce((sum, metric) => sum + metric.score! * metric.confidence, 0) / confidenceWeight
    : null;
  const agreement = score === null || validMetrics.length < 2
    ? 1
    : clamp01(1 - mean(validMetrics.map((metric) => Math.abs(metric.score! - score))) * 2);
  return {
    id,
    score,
    confidence: confidenceWeight > 0 ? clamp01(confidenceWeight / validMetrics.length) * agreement : 0,
    coverage: metrics.length > 0 ? validMetrics.length / metrics.length : 0,
    metricIds: metrics.map((metric) => metric.id),
  } satisfies MidiFacetResult;
}

function buildMidiDiagnostics(summary: MidiSummary, context: MidiV2EvaluationContext) {
  const notesByOnset = groupNotesByOnset(summary);
  const chordGroups = notesByOnset.filter((group) => group.notes.length >= 2);
  const chordRoots = chordGroups.map((group) => group.notes[0]!.pitchClass);
  const rootMotion = chordRoots.slice(1).map((root, index) => ((root - chordRoots[index]! + 18) % 12) - 6);
  const progressionRecurrence = motifRecurrence(rootMotion, 2);
  const harmonicChanges = chordRoots.slice(1).filter((root, index) => root !== chordRoots[index]).length;
  const totalBeats = summary.totalTicks / Math.max(1, summary.ticksPerBeat);
  const harmonicRhythm = harmonicChanges / Math.max(1, totalBeats);
  const meanVoiceLeadingDistance = computeVoiceLeadingDistance(chordGroups);
  const chordConfidence = clamp01((chordGroups.length - 1) / 8);
  const voiceLeadingScore = chordConfidence > 0 ? clamp01(1 - meanVoiceLeadingDistance / 10) : null;
  const progressionScore = chordConfidence > 0
    ? clamp01(progressionRecurrence * 0.5 + fitHarmonicRhythm(harmonicRhythm) * 0.28 + (voiceLeadingScore ?? 0) * 0.22)
    : null;
  const melodyNotes = notesByOnset.map((group) => group.notes.at(-1)!).filter(Boolean);
  const melodyIntervals = melodyNotes.slice(1).map((note, index) => note.note - melodyNotes[index]!.note);
  const key = estimateKey(summary.pitchClassHistogram);
  const sixteenth = Math.max(1, summary.ticksPerBeat / 4);
  const barTicks = summary.ticksPerBeat * summary.timeSignatureNumerator * (4 / summary.timeSignatureDenominator);
  const onsetGridTicks = notesByOnset.map((group) => group.tick);
  const gridDistances = onsetGridTicks.map((tick) => {
    const remainder = ((tick % sixteenth) + sixteenth) % sixteenth;
    return Math.min(remainder, sixteenth - remainder) / sixteenth;
  });
  const gridAlignment = gridDistances.length > 0 ? clamp01(1 - mean(gridDistances) * 2) : 0;
  const syncopation = onsetGridTicks.length > 0
    ? onsetGridTicks.filter((tick) => Math.abs((tick / sixteenth) % 2 - 1) < 0.2).length / onsetGridTicks.length
    : 0;
  const deltaMean = mean(summary.onsetDeltas);
  const declaredTempos = summary.tempoChanges.map((change) => change.bpm);
  const declaredTempoMean = mean(declaredTempos);
  const tempoStability = declaredTempos.length > 0 && declaredTempoMean > 0
    ? clamp01(1 - standardDeviation(declaredTempos) / declaredTempoMean)
    : summary.onsetDeltas.length > 2 && deltaMean > 0
      ? clamp01(1 - standardDeviation(summary.onsetDeltas) / deltaMean)
      : 0;
  const downbeatConsistency = computeDownbeatConsistency(notesByOnset, barTicks, sixteenth);
  const swingRatio = computeSwingRatio(summary.onsetDeltas);
  const rhythmicMotifRecurrence = motifRecurrence(summary.onsetDeltas.map((delta) => Math.round(delta / sixteenth)), 3);
  const rhythmConfidence = clamp01((onsetGridTicks.length - 2) / 12);
  const rhythmScore = rhythmConfidence > 0
    ? clamp01(gridAlignment * 0.38 + tempoStability * 0.24 + rhythmicMotifRecurrence * 0.22 + fitUsefulSyncopation(syncopation) * 0.16)
    : null;
  const melodicMotifRecurrence = motifRecurrence(melodyIntervals.map(contourToken), 3);
  const leapResolution = computeLeapResolution(melodyIntervals);
  const melodicRange = melodyNotes.length > 0
    ? Math.max(...melodyNotes.map((note) => note.note)) - Math.min(...melodyNotes.map((note) => note.note))
    : 0;
  const climaxIndex = melodyNotes.length > 0
    ? melodyNotes.findIndex((note) => note.note === Math.max(...melodyNotes.map((entry) => entry.note)))
    : -1;
  const climaxLocation = climaxIndex >= 0 && melodyNotes.length > 1 ? climaxIndex / (melodyNotes.length - 1) : 0;
  const restPlacement = computeRestPlacement(summary.onsetDeltas, summary.ticksPerBeat);
  const melodyConfidence = clamp01((melodyNotes.length - 2) / 12);
  const melodyScore = melodyConfidence > 0
    ? clamp01(fitRange(melodicRange) * 0.2 + melodicMotifRecurrence * 0.28 + leapResolution * 0.22 + restPlacement * 0.14 + fitClimax(climaxLocation) * 0.16)
    : null;
  const structure = computeStructure(summary, notesByOnset);
  const tensionRelease = computeTensionRelease(melodyIntervals);
  const velocityVariation = summary.meanVelocity > 0 ? clamp01(summary.velocityStdDev / 18) : 0;
  const expressionConfidence = clamp01((summary.noteCount - 2) / 16);
  const expressionScore = expressionConfidence > 0
    ? clamp01(velocityVariation * 0.42 + tensionRelease * 0.34 + fitClimax(climaxLocation) * 0.24)
    : null;

  const keyRoot = context.tonicPitchClass ?? key.root;
  const cadenceConfidence = clamp01(key.confidence * chordConfidence);
  const cadenceStrength = cadenceConfidence >= 0.12 ? computeCadenceStrength(chordRoots, keyRoot) : null;

  return {
    harmony: {
      keyRoot,
      keyMode: key.mode,
      keyConfidence: context.tonicPitchClass === undefined ? key.confidence : 1,
      scaleFit: context.scalePitchClasses
        ? weightedMaskCompliance(summary.pitchClassHistogram, buildScaleMask(0, context.scalePitchClasses))
        : key.score,
      chordRoots,
      chordConfidence,
      progressionScore,
      progressionRecurrence,
      harmonicRhythm,
      cadenceStrength,
      cadenceConfidence,
      voiceLeadingScore,
      meanVoiceLeadingDistance,
    },
    rhythm: {
      score: rhythmScore,
      confidence: rhythmConfidence,
      gridAlignment,
      syncopation,
      tempoStability,
      rhythmicMotifRecurrence,
      ticksPerBeat: summary.ticksPerBeat,
      tempoBpm: context.bpm ?? summary.tempoBpm,
      tempoSource: context.bpm !== undefined ? "context" : summary.hasExplicitTempo ? "midi-meta" : "default",
      timeSignature: `${summary.timeSignatureNumerator}/${summary.timeSignatureDenominator}`,
      timeSignatureSource: summary.hasExplicitTimeSignature ? "midi-meta" : "default",
      barTicks,
      downbeatConsistency,
      swingRatio,
      interOnsetDistribution: histogram(summary.onsetDeltas.map((delta) => Math.min(7, Math.round(delta / sixteenth))), 8),
    },
    melody: {
      score: melodyScore,
      confidence: melodyConfidence,
      range: melodicRange,
      intervalDistribution: histogram(melodyIntervals.map((interval) => Math.min(12, Math.abs(interval))), 13),
      motifRecurrence: melodicMotifRecurrence,
      leapResolution,
      restPlacement,
      climaxLocation,
      contour: melodyIntervals.map(contourToken),
    },
    structure,
    expression: {
      score: expressionScore,
      confidence: expressionConfidence,
      velocityVariation,
      tensionRelease,
    },
  };
}

function estimateKey(histogramValues: readonly number[]) {
  const candidates = [
    { mode: "major", scale: MAJOR_SCALE },
    { mode: "minor", scale: NATURAL_MINOR_SCALE },
    { mode: "pentatonic", scale: PENTATONIC_SCALE },
  ].flatMap(({ mode, scale }) => Array.from({ length: 12 }, (_, root) => ({
    root,
    mode,
    score: weightedMaskCompliance(histogramValues, buildScaleMask(root, scale)),
  })));
  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0] ?? { root: 0, mode: "unknown", score: 0 };
  const runnerUp = candidates.find((candidate) => candidate.root !== best.root)?.score ?? 0;
  const occupied = histogramValues.filter((value) => value > 0).length;
  const evidenceGate = clamp01((occupied - 1) / 6);
  const margin = clamp01((best.score - runnerUp) / 0.18);
  return { ...best, confidence: clamp01(margin * (0.45 + evidenceGate * 0.55)) };
}

function groupNotesByOnset(summary: MidiSummary) {
  const groups = new Map<number, MidiSummary["notes"][number][]>();
  for (const note of summary.notes) {
    const notes = groups.get(note.startTick) ?? [];
    notes.push(note);
    groups.set(note.startTick, notes);
  }
  return [...groups.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([tick, notes]) => ({ tick, notes: notes.sort((left, right) => left.note - right.note) }));
}

function computeStructure(summary: MidiSummary, onsets: ReturnType<typeof groupNotesByOnset>) {
  if (onsets.length < 6) {
    return { score: null, confidence: clamp01(onsets.length / 6), repetition: 0, contrast: 0, phraseBoundaryStrength: 0, selfSimilarity: [] as readonly number[] };
  }
  const third = Math.max(1, Math.floor(onsets.length / 3));
  const sections = [onsets.slice(0, third), onsets.slice(third, third * 2), onsets.slice(third * 2)];
  const vectors = sections.map(sectionVector);
  const ab = cosine(vectors[0]!, vectors[1]!);
  const ac = cosine(vectors[0]!, vectors[2]!);
  const bc = cosine(vectors[1]!, vectors[2]!);
  const repetition = Math.max(ac, ab, bc);
  const contrast = clamp01(1 - Math.min(ab, ac, bc));
  const gapThreshold = summary.ticksPerBeat * 0.75;
  const phraseBoundaryStrength = summary.onsetDeltas.length > 0
    ? clamp01(summary.onsetDeltas.filter((delta) => delta >= gapThreshold).length / Math.max(1, summary.onsetDeltas.length * 0.2))
    : 0;
  const confidence = clamp01(onsets.length / 18);
  return {
    score: clamp01(repetition * 0.38 + contrast * 0.36 + phraseBoundaryStrength * 0.14 + motifRecurrence(summary.onsetDeltas.map((delta) => Math.round(delta / Math.max(1, summary.ticksPerBeat / 4))), 3) * 0.12),
    confidence,
    repetition,
    contrast,
    phraseBoundaryStrength,
    selfSimilarity: [1, ab, ac, ab, 1, bc, ac, bc, 1],
  };
}

function sectionVector(section: ReturnType<typeof groupNotesByOnset>) {
  const pitch = Array.from({ length: 12 }, () => 0);
  const rhythm = Array.from({ length: 4 }, () => 0);
  if (section.length === 0) {
    return [...pitch, ...rhythm];
  }
  const start = section[0]!.tick;
  const span = Math.max(1, (section.at(-1)?.tick ?? start) - start + 1);
  for (const group of section) {
    for (const note of group.notes) {
      pitch[note.pitchClass] += note.velocity / 127;
    }
    rhythm[Math.min(3, Math.floor(((group.tick - start) / span) * 4))] += 1;
  }
  return normalize([...pitch, ...rhythm]);
}

function motifRecurrence<T>(tokens: readonly T[], width: number) {
  if (tokens.length < width * 2) {
    return 0;
  }
  const motifs = new Map<string, number>();
  for (let index = 0; index + width <= tokens.length; index += 1) {
    const key = tokens.slice(index, index + width).join("|");
    motifs.set(key, (motifs.get(key) ?? 0) + 1);
  }
  const repeated = [...motifs.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0);
  return clamp01(repeated / Math.max(1, tokens.length - width + 1));
}

function computeLeapResolution(intervals: readonly number[]) {
  let leaps = 0;
  let resolutions = 0;
  for (let index = 0; index + 1 < intervals.length; index += 1) {
    const leap = intervals[index]!;
    if (Math.abs(leap) < 5) {
      continue;
    }
    leaps += 1;
    const next = intervals[index + 1]!;
    if (Math.sign(next) === -Math.sign(leap) && Math.abs(next) <= 4) {
      resolutions += 1;
    }
  }
  return leaps > 0 ? resolutions / leaps : 0.65;
}

function computeRestPlacement(deltas: readonly number[], ticksPerBeat: number) {
  if (deltas.length === 0) {
    return 0;
  }
  const rests = deltas.filter((delta) => delta >= ticksPerBeat * 0.75).length / deltas.length;
  return clamp01(1 - Math.abs(rests - 0.18) / 0.35);
}

function computeDownbeatConsistency(onsets: ReturnType<typeof groupNotesByOnset>, barTicks: number, tolerance: number) {
  if (onsets.length < 4 || barTicks <= 0) {
    return 0;
  }
  const allAccents = onsets.map((group) => mean(group.notes.map((note) => note.velocity)));
  const downbeatAccents = onsets
    .filter((group) => {
      const remainder = ((group.tick % barTicks) + barTicks) % barTicks;
      return Math.min(remainder, barTicks - remainder) <= tolerance * 0.2;
    })
    .map((group) => mean(group.notes.map((note) => note.velocity)));
  if (downbeatAccents.length === 0) {
    return 0;
  }
  const accentRatio = mean(downbeatAccents) / Math.max(1, mean(allAccents));
  return clamp01(0.5 + (accentRatio - 1) * 1.5);
}

function computeSwingRatio(deltas: readonly number[]) {
  const ratios: number[] = [];
  for (let index = 0; index + 1 < deltas.length; index += 2) {
    const left = deltas[index]!;
    const right = deltas[index + 1]!;
    if (left > 0 && right > 0) {
      ratios.push(Math.max(left, right) / Math.min(left, right));
    }
  }
  return ratios.length > 0 ? mean(ratios) : 1;
}

function computeTensionRelease(intervals: readonly number[]) {
  let opportunities = 0;
  let resolved = 0;
  for (let index = 0; index + 1 < intervals.length; index += 1) {
    const current = Math.abs(intervals[index]!) % 12;
    const next = Math.abs(intervals[index + 1]!) % 12;
    if (![1, 6, 11].includes(current)) {
      continue;
    }
    opportunities += 1;
    if ([0, 3, 4, 5, 7, 8, 9].includes(next)) {
      resolved += 1;
    }
  }
  return opportunities > 0 ? resolved / opportunities : 0.5;
}

function computeVoiceLeadingDistance(chords: ReturnType<typeof groupNotesByOnset>) {
  if (chords.length < 2) {
    return 12;
  }
  const distances: number[] = [];
  for (let index = 1; index < chords.length; index += 1) {
    const previous = chords[index - 1]!.notes;
    const current = chords[index]!.notes;
    for (const note of current) {
      distances.push(Math.min(...previous.map((candidate) => Math.abs(candidate.note - note.note))));
    }
  }
  return mean(distances);
}

function computeCadenceStrength(roots: readonly number[], tonic: number) {
  if (roots.length === 0) {
    return 0;
  }
  const final = roots.at(-1)!;
  const previous = roots.at(-2);
  const tonicArrival = final === tonic ? 0.68 : 0;
  const dominantArrival = previous === (tonic + 7) % 12 && final === tonic ? 0.32 : 0;
  return clamp01(tonicArrival + dominantArrival);
}

function histogram(values: readonly number[], size: number) {
  const result = Array.from({ length: size }, () => 0);
  for (const value of values) {
    result[Math.max(0, Math.min(size - 1, Math.round(value)))] += 1;
  }
  return normalize(result);
}

function normalize(values: readonly number[]) {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  return total > 0 ? values.map((value) => Math.max(0, value) / total) : values.map(() => 0);
}

function cosine(left: readonly number[], right: readonly number[]) {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  return leftMagnitude > 0 && rightMagnitude > 0 ? clamp01(dot / Math.sqrt(leftMagnitude * rightMagnitude)) : 0;
}

function contourToken(interval: number) {
  if (interval === 0) {
    return "hold";
  }
  const direction = interval > 0 ? "up" : "down";
  return `${direction}-${Math.abs(interval) <= 2 ? "step" : Math.abs(interval) <= 5 ? "skip" : "leap"}`;
}

function fitRange(range: number) {
  return clamp01(1 - Math.abs(range - 14) / 22);
}

function fitClimax(location: number) {
  return clamp01(1 - Math.abs(location - 0.68) / 0.68);
}

function fitUsefulSyncopation(value: number) {
  return clamp01(1 - Math.abs(value - 0.25) / 0.5);
}

function fitHarmonicRhythm(value: number) {
  return clamp01(1 - Math.abs(value - 0.5) / 0.8);
}

function percent(value: number) {
  return `${Math.round(clamp01(value) * 100)}%`;
}
