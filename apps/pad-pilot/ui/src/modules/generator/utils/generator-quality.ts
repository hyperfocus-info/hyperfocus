import { type GeneratorMidiComposition } from "./midi-encoder";
import { type GeneratorLengthBars } from "./generator-option-catalog";
import { type CodexClientOptions, GENERATOR_MODEL_SCHEMA_VERSION, GENERATOR_TRACKER_GRAMMAR_VERSION, type GeneratorArrangementPlanHeader, type GeneratorHarmonicTolerancePolicy, type GeneratorMusicianPlan, type GeneratorPromptInput, type GeneratorRepairPatch, type GeneratorValidationReport, type StyleDnaFilterStats } from "./generator-contracts";
import { buildFallbackTracker } from "./generator-fallback";
import { createStyleDnaFilterStats } from "./generator-massage-scoring";
import { repairCompositionForPlan } from "./generator-massage-length";
import { enforceCompositionScale } from "./generator-music";
import { buildGeneratorIntentPlan, clamp01, resolveGeneratorIntentTags, selectedScaleInfo, selectedScaleMode } from "./generator-prompt";
import { loopTicks, parseDeltaTickTracker, scoreGeneratorComposition, trackerFromComposition } from "./generator-tracker";


export function qualityLogLine(prefix: string, quality: ReturnType<typeof scoreGeneratorComposition>) {
  const score = Math.round(quality.score);
  return quality.reasons.length > 0 ? `${prefix} quality ${score}: ${quality.reasons.join("; ")}` : `${prefix} quality ${score}`;
}

export function repairableModelQuality(quality: ReturnType<typeof scoreGeneratorComposition>) {
  return quality.score >= 85 && quality.reasons.every((reason) => /missing phrase fill|short tracks|phrase variations|offbeat|chord cluster over style|melodic layers over style|note density|bass roles/.test(reason));
}

export function hasStructuralStyleRepair(stats: StyleDnaFilterStats) {
  return stats.pitchCorrectedNotes > 0
    || stats.quantizedNotes > 0
    || stats.syncopationClampedNotes > 0
    || stats.simplifiedChordClusters > 0;
}

export function hasCreativeStyleRewrite(stats: StyleDnaFilterStats) {
  return stats.regeneratedTracks.length > 0
    || stats.patchedTrackRoles.length > 0
    || stats.earwormLeadPatched
    || stats.oneShotEvents > 0
    || stats.chordDependentFillNotes > 0
    || stats.upperColorNotes > 0
    || stats.eventModulatedNotes > 0;
}

export function shouldKeepMassagedModel(before: ReturnType<typeof scoreGeneratorComposition>, after: ReturnType<typeof scoreGeneratorComposition>, stats: StyleDnaFilterStats) {
  const beforeDeclaredMisses = before.metrics.declaredRoleMisses.length;
  const afterDeclaredMisses = after.metrics.declaredRoleMisses.length;
  if (hasCreativeStyleRewrite(stats) && afterDeclaredMisses > beforeDeclaredMisses) {
    return false;
  }
  if (before.passed) {
    if (!after.passed) {
      return false;
    }
    if (after.score > before.score + 0.5) {
      return true;
    }
    if (hasStructuralStyleRepair(stats) && after.score >= before.score - 0.5) {
      return true;
    }
    return !hasCreativeStyleRewrite(stats) && after.score >= before.score;
  }
  if (after.passed) {
    return true;
  }
  if (after.score > before.score) {
    return true;
  }
  return !repairableModelQuality(before);
}

export function buildGeneratorValidationReport(
  quality: ReturnType<typeof scoreGeneratorComposition>,
  lengthBars: GeneratorLengthBars,
  arrangementPlan?: GeneratorArrangementPlanHeader,
  harmonicTolerancePolicy?: GeneratorHarmonicTolerancePolicy,
) : GeneratorValidationReport {
  return {
    ...(arrangementPlan ? { arrangementPlan } : {}),
    grammarVersion: GENERATOR_TRACKER_GRAMMAR_VERSION,
    ...(harmonicTolerancePolicy ? { harmonicTolerancePolicy } : {}),
    loopEndTick: loopTicks(lengthBars),
    metrics: quality.metrics,
    passed: quality.passed,
    reasons: quality.reasons,
    schemaVersion: GENERATOR_MODEL_SCHEMA_VERSION,
    score: quality.score,
  };
}

export function buildGeneratorRepairPatch(before: ReturnType<typeof scoreGeneratorComposition>, after: ReturnType<typeof scoreGeneratorComposition>, stats: StyleDnaFilterStats, keepMassaged: boolean) : GeneratorRepairPatch {
  const patchLines = [
    ...(stats.pitchCorrectedNotes > 0 ? [`scale-corrected ${stats.pitchCorrectedNotes} notes`] : []),
    ...(stats.quantizedNotes > 0 ? [`quantized ${stats.quantizedNotes} notes`] : []),
    ...(stats.syncopationClampedNotes > 0 ? [`clamped ${stats.syncopationClampedNotes} syncopated notes`] : []),
    ...(stats.regeneratedTracks.length > 0 ? [`regenerated lanes ${stats.regeneratedTracks.join(", ")}`] : []),
    ...(stats.patchedTrackRoles.length > 0 ? [`patched roles ${stats.patchedTrackRoles.join(", ")}`] : []),
    ...(stats.earwormLeadPatched ? ["patched earworm lead"] : []),
    ...(stats.oneShotEvents > 0 ? [`added ${stats.oneShotEvents} one-shots`] : []),
    ...(stats.chordDependentFillNotes > 0 ? [`added ${stats.chordDependentFillNotes} chord-dependent fills`] : []),
    ...(stats.upperColorNotes > 0 ? [`added ${stats.upperColorNotes} upper-color notes`] : []),
    ...(stats.eventModulatedNotes > 0 ? [`event-modulated ${stats.eventModulatedNotes} notes`] : []),
  ];
  return {
    afterScore: after.score,
    beforeScore: before.score,
    creativeRewrite: hasCreativeStyleRewrite(stats),
    deltaScore: after.score - before.score,
    keepMassaged,
    patchLines,
    schemaVersion: GENERATOR_MODEL_SCHEMA_VERSION,
    structuralRepair: hasStructuralStyleRepair(stats),
  };
}

export function repairPatchLogLine(patch: GeneratorRepairPatch) {
  const delta = patch.deltaScore >= 0 ? `+${Math.round(patch.deltaScore)}` : `${Math.round(patch.deltaScore)}`;
  const scope = patch.creativeRewrite ? "creative" : patch.structuralRepair ? "structural" : "none";
  const changes = patch.patchLines.length > 0 ? patch.patchLines.join("; ") : "no changes";
  return `repair patch ${Math.round(patch.beforeScore)}->${Math.round(patch.afterScore)} (${delta}); keep=${patch.keepMassaged}; scope=${scope}; ${changes}`;
}

export function buildQualityFallback(input: GeneratorPromptInput, plan: GeneratorMusicianPlan, lengthBars: GeneratorLengthBars, options: CodexClientOptions) {
  const intentPlan = buildGeneratorIntentPlan(input, selectedScaleMode(input), selectedScaleInfo(input).selectedScale, lengthBars, plan);
  const variants = [
    input,
    {
      ...input,
      creativity: Math.max(clamp01(input.creativity, 0.65), 0.74),
      density: Math.max(clamp01(input.density, 0.55), 0.72),
      humanize: Math.max(clamp01(input.humanize, 0.35), 0.56),
      notes: `${input.notes ?? ""} planner retry: prioritize guide-tone voicings, motif recurrence, and counterline.`.trim(),
    },
    {
      ...input,
      complexity: input.complexity || "Complex Polyphonic",
      creativity: Math.max(clamp01(input.creativity, 0.65), 0.82),
      density: Math.max(clamp01(input.density, 0.55), 0.78),
      temperature: Math.max(clamp01(input.temperature, 0.7), 0.76),
    },
  ];
  let best: {
    composition: GeneratorMidiComposition;
    quality: ReturnType<typeof scoreGeneratorComposition>;
    rawTracker: string;
    repairedCount: number;
  } | undefined;

  for (const [index, variant] of variants.entries()) {
    const rawTracker = buildFallbackTracker(variant);
    const parsedComposition = parseDeltaTickTracker(rawTracker);
    const repaired = repairCompositionForPlan(parsedComposition, plan, lengthBars, rawTracker);
    const stats = createStyleDnaFilterStats();
    const scaleChecked = enforceCompositionScale(repaired.composition, input, resolveGeneratorIntentTags(input, plan, rawTracker), stats, lengthBars, plan);
    const finalRawTracker = trackerFromComposition(scaleChecked, rawTracker);
    const quality = scoreGeneratorComposition(scaleChecked, plan, lengthBars, undefined, intentPlan);
    if (stats.pitchCorrectedNotes > 0) {
      options.onLog?.(`fallback scale-corrected ${stats.pitchCorrectedNotes} notes`);
    }
    if (!best || quality.score > best.quality.score) {
      best = {
        composition: scaleChecked,
        quality,
        rawTracker: finalRawTracker,
        repairedCount: repaired.repairedCount,
      };
    }
    if (quality.passed) {
      options.onLog?.(qualityLogLine(index === 0 ? "fallback" : `fallback retry ${index}`, quality));
      return {
        composition: scaleChecked,
        quality,
        rawTracker: finalRawTracker,
        repairedCount: repaired.repairedCount,
      };
    }
  }

  if (best) {
    options.onLog?.(qualityLogLine("fallback best", best.quality));
    throw new Error(`fallback quality gate rejected all candidates: ${best.quality.reasons.join("; ") || "score below threshold"}`);
  }

  throw new Error("No fallback candidates were generated.");
}
