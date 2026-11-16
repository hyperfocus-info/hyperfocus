import { metric, normalizeMetric, type PerformanceMetric } from "./base-analyzer";
import { AUDIO_METRIC_DEFINITIONS, assessAudioSafety, scoreAudioFeatures, type AudioMetricName, type AudioSummary } from "./audio-utils";
import { EVALUATION_DIMENSIONS, aggregateMetricAssessments, metricAssessment, type DimensionAssessment, type EvaluationDimensionId, type MediumMetricId, type MetricAssessment, type SafetyAssessment } from "./evaluation-schema";
import { normalizeSkillTimeout, normalizeSkillWeight, withSkillDeadline } from "./skill-runtime-limits";

export type AudioEvaluationState = {
  readonly audioSummary?: AudioSummary;
  readonly previousAudioSummary?: AudioSummary;
  readonly previousScore?: number;
  readonly localHour?: number;
  readonly audioMetricScores?: Readonly<Partial<Record<AudioMetricName, number>>>;
  readonly [key: string]: unknown;
};

export type AudioAnalyzer = {
  name: AudioMetricName | string;
  weight: number;
  evaluate: (audio: AudioSummary, state: AudioEvaluationState) => Promise<PerformanceMetric>;
};

export type AudioSkillEvaluation = {
  readonly name: string;
  readonly id: MediumMetricId;
  readonly weight: number;
  readonly metric: PerformanceMetric;
  readonly assessment: MetricAssessment;
};

export type AudioSkillFailure = {
  readonly name: string;
  readonly error: string;
};

export type AudioContributor = {
  readonly id: string;
  readonly dimension: EvaluationDimensionId;
  readonly contribution: number;
  readonly summary: string;
};

export type ProducerAction = {
  readonly id: string;
  readonly priority: number;
  readonly severity: "critical" | "high" | "medium";
  readonly title: string;
  readonly observation: string;
  readonly impact: string;
  readonly steps: readonly string[];
  readonly verify: string;
  readonly confidence: number;
  readonly focus?: {
    readonly endSeconds: number;
    readonly label: string;
    readonly startSeconds: number;
  };
};

export type AudioEvaluationReport = {
  readonly kind: "audio";
  readonly successScore: number;
  readonly overall: number;
  readonly uncappedOverall: number;
  readonly confidence: number;
  readonly dimensions: Readonly<Record<EvaluationDimensionId, DimensionAssessment>>;
  readonly safety: SafetyAssessment;
  readonly actions: readonly ProducerAction[];
  readonly strengths: readonly AudioContributor[];
  readonly weaknesses: readonly AudioContributor[];
  readonly audioSummary: AudioSummary;
  readonly metrics: readonly AudioSkillEvaluation[];
  readonly failures: readonly AudioSkillFailure[];
  readonly evaluatedAt: number;
};

export type AudioSkillManagerOptions = {
  readonly analyzers?: readonly AudioAnalyzer[];
  readonly skillTimeoutMs?: number;
};

function createBuiltInAudioAnalyzer(definition: typeof AUDIO_METRIC_DEFINITIONS[number]) {
  const name = definition.name;
  const weight = definition.weight;
  const biologicalImpact = definition.biologicalImpact;
  const description = definition.description;

  async function evaluate(audio: AudioSummary, state: AudioEvaluationState) {
    const structured = scoreAudioFeatures(audio).find((entry) => entry.name === name);
    const score = state.audioMetricScores?.[name] ?? structured?.score ?? 0;
    return metric({
      score,
      biologicalImpact: biologicalImpact,
      justification: structured?.summary ?? buildJustification(name, description, score),
    });
  }
  return { evaluate: evaluate, name: name, weight: weight };
}

export type AudioSkillManager = ReturnType<typeof createAudioSkillManager>;
export function createAudioSkillManager(options: AudioSkillManagerOptions = {}) {
  const analyzers = options.analyzers ?? AUDIO_METRIC_DEFINITIONS.map((definition) => createBuiltInAudioAnalyzer(definition));
  const skillTimeoutMs = normalizeSkillTimeout(options.skillTimeoutMs);

  async function evaluate(audio: AudioSummary, state: AudioEvaluationState = {}) {
    const audioSummary = freezeAudioSummary(state.audioSummary ?? audio);
    const scoredFeatures = scoreAudioFeatures(audioSummary);
    const audioMetricScores = freezeAudioMetricScores(scoredFeatures);
    const structuredScores = new Map<string, ReturnType<typeof scoreAudioFeatures>[number]>(scoredFeatures.map((score) => [score.name, score]));
    const skillState = Object.freeze({ ...state, audioSummary, audioMetricScores });
    const results = await Promise.all(
      analyzers.map(async (analyzer) => {
        try {
          return {
            ok: true as const,
            value: buildSkillEvaluation(
              analyzer.name,
              normalizeSkillWeight(analyzer.weight),
              normalizeMetric(await withSkillDeadline(
                analyzer.evaluate(audioSummary, skillState),
                skillTimeoutMs,
                analyzer.name,
              )),
              structuredScores.get(analyzer.name),
            ),
          };
        } catch (error) {
          return {
            ok: false as const,
            value: {
              name: analyzer.name,
              error: error instanceof Error ? error.message : String(error),
            },
          };
        }
      }),
    );

    const metrics = results.flatMap((result) => (result.ok ? [result.value] : []));
    const failures = results.flatMap((result) => (result.ok ? [] : [result.value]));
    const safety = assessAudioSafety(audioSummary);
    const evaluation = aggregateMetricAssessments(metrics.map((result) => result.assessment), safety);
    const contributors = buildContributors(metrics);

    return {
      kind: "audio" as const,
      successScore: evaluation.overall,
      overall: evaluation.overall,
      uncappedOverall: evaluation.uncappedOverall,
      confidence: evaluation.confidence,
      dimensions: evaluation.dimensions,
      safety: evaluation.safety,
      actions: buildProducerActions(metrics, audioSummary, safety),
      strengths: contributors.filter((entry) => entry.contribution > 0).sort((left, right) => right.contribution - left.contribution),
      weaknesses: contributors.filter((entry) => entry.contribution < 0).sort((left, right) => left.contribution - right.contribution),
      audioSummary,
      metrics,
      failures,
      evaluatedAt: Date.now(),
    };
  }
  return {
    evaluate: evaluate, get skills() {
      return [...analyzers];
    }
  };
}

function buildContributors(metrics: readonly AudioSkillEvaluation[]) {
  const groups = new Map<string, AudioSkillEvaluation[]>();
  for (const metric of metrics) {
    if (!metric.assessment.valid || metric.assessment.score === null || metric.assessment.confidence <= 0) continue;
    const key = `${metric.assessment.dimension}:${metric.assessment.facet}`;
    groups.set(key, [...(groups.get(key) ?? []), metric]);
  }
  return [...groups.entries()].map(([key, entries]) => {
    const denominator = entries.reduce((sum, entry) => sum + entry.assessment.weight * entry.assessment.confidence, 0);
    const score = denominator > 0
      ? entries.reduce((sum, entry) => sum + entry.assessment.score! * entry.assessment.weight * entry.assessment.confidence, 0) / denominator
      : 0.5;
    const confidence = entries.reduce((sum, entry) => sum + entry.assessment.confidence, 0) / entries.length;
    const facet = entries[0]!.assessment.facet;
    const dimension = entries[0]!.assessment.dimension;
    const contribution = (score - 0.5) * confidence / EVALUATION_DIMENSIONS.length;
    return {
      id: key,
      dimension,
      contribution,
      summary: `${humanize(facet)} scored ${percent(score)} in ${humanize(dimension)} with ${percent(confidence)} confidence.`,
    };
  });
}

function buildSkillEvaluation(
  name: string,
  weight: number,
  performance: PerformanceMetric,
  structured: ReturnType<typeof scoreAudioFeatures>[number] | undefined,
) {
  const id: MediumMetricId = structured?.id ?? `audio.custom.${metricIdSegment(name)}`;
  const dimension = structured?.dimension ?? dimensionForImpact(performance.biologicalImpact);
  const assessment = metricAssessment({
    id,
    dimension,
    facet: structured?.facet ?? id,
    score: structured ? structured.score : performance.score,
    confidence: structured?.confidence ?? 1,
    valid: structured?.valid ?? true,
    status: structured?.status,
    summary: structured?.summary ?? performance.justification,
    weight,
    evidence: structured?.evidence ?? Object.freeze({ justification: performance.justification }),
  });
  return { name, id, weight, metric: performance, assessment };
}

function dimensionForImpact(impact: PerformanceMetric["biologicalImpact"]) {
  if (impact === "arousal") {
    return "groove" as const;
  }
  if (impact === "tension") {
    return "soundQuality" as const;
  }
  if (impact === "homeostasis") {
    return "musicality" as const;
  }
  return "emotionalImpact" as const;
}

function metricIdSegment(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unnamed";
}

function humanize(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_.]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildProducerActions(
  metrics: readonly AudioSkillEvaluation[],
  audio: AudioSummary,
  safety: SafetyAssessment,
) {
  const actions: ProducerAction[] = [];
  const add = (action: ProducerAction) => {
    if (!actions.some((candidate) => candidate.id === action.id)) {
      const focus = action.focus ?? actionFocus(action.id, audio);
      actions.push(focus ? { ...action, focus } : action);
    }
  };

  if (safety.reasons.includes("non-finite samples")) {
    add({
      id: "safety.non-finite-samples",
      priority: 300,
      severity: "critical",
      title: "Repair invalid audio samples",
      observation: audio.invalidSampleCount + " decoded samples were not finite.",
      impact: "Invalid samples make downstream playback and measurement unsafe.",
      steps: ["Re-render from the source project.", "Check the export path for unstable plugins or corrupted processing."],
      verify: "Reanalyze and confirm invalid-sample count is zero.",
      confidence: 1,
    });
  }
  if (safety.reasons.includes("digital silence")) {
    add({
      id: "safety.digital-silence",
      priority: 280,
      severity: "critical",
      title: "Restore audible program material",
      observation: "Silence occupies " + percent(audio.silenceRatio) + " of decoded samples.",
      impact: "No musical evaluation is reliable without audible content.",
      steps: ["Check export range and master-bus routing.", "Confirm the render contains the intended playlist region."],
      verify: "Reanalyze and confirm the silence cap clears.",
      confidence: 1,
    });
  }
  if (safety.reasons.includes("severe sustained clipping")) {
    add({
      id: "safety.severe-clipping",
      priority: 260,
      severity: "critical",
      title: "Restore transient headroom",
      observation: "Decoded clipping is " + percent(audio.clippingRate) + " with " + percent(audio.flatTopRate) + " sustained flat tops.",
      impact: "Sustained clipping can flatten kick, snare, and vocal transient shape.",
      steps: ["Lower limiter or clipper input before reducing final output level.", "Check release timing against the loudest low-frequency transients."],
      verify: "Reanalyze and confirm the severe-clipping cap clears.",
      confidence: 1,
    });
  }
  if (safety.reasons.includes("dc offset")) {
    add({
      id: "safety.dc-offset",
      priority: 240,
      severity: "high",
      title: "Remove DC offset",
      observation: "Measured DC offset is " + audio.dcOffset.toFixed(4) + ".",
      impact: "Offset consumes asymmetric headroom and can stress later nonlinear processing.",
      steps: ["Find the source or nonlinear stage introducing offset.", "Apply a transparent DC blocker before final limiting."],
      verify: "Reanalyze and confirm absolute DC offset falls below 0.02.",
      confidence: 1,
    });
  }
  if (safety.reasons.includes("stationary noise")) {
    add({
      id: "safety.stationary-noise",
      priority: 220,
      severity: "critical",
      title: "Replace noise-only render",
      observation: "Stationary noise dominates without credible pulse or section development.",
      impact: "Musical scores are not meaningful for a noise-only render.",
      steps: ["Check export routing and missing media.", "Render the intended master output again."],
      verify: "Reanalyze and confirm the stationary-noise cap clears.",
      confidence: 0.98,
    });
  }

  for (const metric of metrics) {
    const assessment = metric.assessment;
    if (!assessment.valid || assessment.score === null || assessment.confidence < 0.2 || assessment.score >= 0.86) continue;
    const priority = (1 - assessment.score) * assessment.confidence * 100;
    const severity = assessment.score < 0.58 ? "high" as const : "medium" as const;
    if (assessment.id === "audio.musical.tonal-intent") {
      add({
        id: assessment.id,
        priority,
        severity,
        title: "Clarify tonal intent",
        observation: "Tonal-intent evidence scores " + percent(assessment.score) + " at " + percent(assessment.confidence) + " confidence.",
        impact: "Unclear pitch hierarchy can weaken melodic recall and section arrival.",
        steps: ["Reinforce recurring tonic or chord-tone arrivals at phrase endings.", "If ambiguity is intentional, confirm it against MIDI or stems before changing notes."],
        verify: "Reanalyze after one harmonic edit; tonal intent should rise without reducing section contrast.",
        confidence: assessment.confidence,
      });
    } else if (assessment.id === "audio.rhythm.pulse-coherence") {
      add({
        id: assessment.id,
        priority,
        severity,
        title: "Strengthen pulse anchors",
        observation: "Pulse coherence scores " + percent(assessment.score) + " at " + percent(assessment.confidence) + " confidence.",
        impact: "Weak anchor agreement can reduce forward motion even when individual drum sounds are strong.",
        steps: ["Inspect kick, snare, and bass onsets around the weakest pulse passages.", "Move only conflicting hits; preserve intended swing and syncopation."],
        verify: "Reanalyze and compare pulse coherence plus groove timeline at edited passages.",
        confidence: assessment.confidence,
      });
    } else if (assessment.id === "audio.structure.section-development") {
      add({
        id: assessment.id,
        priority,
        severity,
        title: "Increase section development",
        observation: "Section development scores " + percent(assessment.score) + " at " + percent(assessment.confidence) + " confidence.",
        impact: "Too little recurrence or contrast can make a song feel static or randomly assembled.",
        steps: ["Change one major element at the next section boundary: drum density, harmony, register, or silence.", "Add a transition cue before the boundary while retaining one recurring motif."],
        verify: "Reanalyze and confirm both section contrast and recurrence remain present.",
        confidence: assessment.confidence,
      });
    } else if (assessment.id === "audio.mix.translation-readiness") {
      const harshnessRisk = evidenceNumber(assessment, "harshnessRisk");
      const lowMidRisk = evidenceNumber(assessment, "lowMidRisk");
      const overloadRisk = evidenceNumber(assessment, "overloadRisk");
      const title = overloadRisk >= Math.max(harshnessRisk, lowMidRisk)
        ? "Recover mix headroom"
        : harshnessRisk >= lowMidRisk ? "Control sustained upper-band stress" : "Clear low-mid buildup";
      const steps = overloadRisk >= Math.max(harshnessRisk, lowMidRisk)
        ? ["Reduce gain into the final nonlinear stage.", "Level-match before judging the revised master."]
        : harshnessRisk >= lowMidRisk
          ? ["Locate sustained 6–12 kHz stress by muting source groups.", "Use narrow or dynamic reduction on the responsible source instead of dulling the full mix."]
          : ["Check 180–500 Hz occupancy across source groups.", "Subtract from the source sustaining the buildup; preserve sub-bass weight."];
      add({
        id: assessment.id,
        priority,
        severity,
        title,
        observation: "Translation readiness scores " + percent(assessment.score) + "; harshness " + percent(harshnessRisk) + ", low-mid risk " + percent(lowMidRisk) + ", overload " + percent(overloadRisk) + ".",
        impact: "The strongest measured risk may reduce clarity or playback consistency.",
        steps,
        verify: "Reanalyze, level-match, and confirm the targeted risk falls without weakening embodied impact.",
        confidence: assessment.confidence,
      });
    } else if (assessment.id === "audio.emotion.embodied-impact") {
      const bodySupport = evidenceNumber(assessment, "bodySupport");
      const dynamicArc = evidenceNumber(assessment, "dynamicArc");
      const bodyIsLower = bodySupport <= dynamicArc;
      add({
        id: assessment.id,
        priority,
        severity,
        title: bodyIsLower ? "Build low-frequency body" : "Shape a larger dynamic arc",
        observation: "Embodied impact scores " + percent(assessment.score) + "; body support " + percent(bodySupport) + ", dynamic arc " + percent(dynamicArc) + ".",
        impact: bodyIsLower ? "Physical weight may not fully support the track's energy." : "Sections may feel similarly intense despite good spectral weight.",
        steps: bodyIsLower
          ? ["Check clean 35–120 Hz support and mono translation.", "If sub level is already sufficient, add audible bass harmonics instead of more raw level."]
          : ["Create level or density contrast before the main arrival.", "Automate one focal element rather than compressing the whole mix harder."],
        verify: "Reanalyze and compare embodied impact while confirming translation readiness does not fall.",
        confidence: assessment.confidence,
      });
    }
  }

  return actions.sort((left, right) => right.priority - left.priority).slice(0, 3);
}

function actionFocus(actionId: string, audio: AudioSummary) {
  if (actionId === "audio.structure.section-development" && audio.sections.length > 0) {
    const section = [...audio.sections].sort((left, right) => left.score - right.score)[0]!;
    return { endSeconds: section.endSeconds, label: `weakest measured section (${section.label})`, startSeconds: section.startSeconds };
  }
  const series = actionId === "audio.rhythm.pulse-coherence"
    ? audio.timeline.groovePulse
    : actionId === "audio.emotion.embodied-impact"
      ? audio.timeline.dynamics
      : actionId === "audio.mix.translation-readiness" || actionId === "safety.severe-clipping"
        ? audio.timeline.loudness
        : [];
  if (series.length === 0) return undefined;
  const preferLowest = actionId === "audio.rhythm.pulse-coherence" || actionId === "audio.emotion.embodied-impact";
  const point = [...series].sort((left, right) => preferLowest ? left.value - right.value : right.value - left.value)[0]!;
  return {
    endSeconds: Math.min(audio.durationSeconds, point.timeSeconds + 4),
    label: preferLowest ? "weakest measured passage" : "strongest measured risk passage",
    startSeconds: Math.max(0, point.timeSeconds - 4),
  };
}

function evidenceNumber(assessment: MetricAssessment, key: string) {
  const value = assessment.evidence[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function freezeAudioSummary(summary: AudioSummary) {
  for (const value of Object.values(summary)) {
    if (Array.isArray(value)) {
      Object.freeze(value);
    }
  }
  return Object.freeze(summary);
}

function freezeAudioMetricScores(scores: ReturnType<typeof scoreAudioFeatures>) {
  const byName: Partial<Record<AudioMetricName, number>> = {};
  for (const score of scores) {
    if (score.score !== null) byName[score.name] = score.score;
  }
  return Object.freeze(byName);
}

function buildJustification(name: AudioMetricName, description: string, score: number) {
  return `${name} scores ${percent(score)} from ${description}.`;
}

function percent(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}
