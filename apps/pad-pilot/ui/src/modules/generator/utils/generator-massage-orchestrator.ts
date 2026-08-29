import { type GeneratorMidiComposition } from "./midi-encoder";
import { type GeneratorLengthBars } from "./generator-options";
import { type CodexClientOptions, type GeneratorHarmonicTolerancePolicy, type GeneratorMusicianPlan, type GeneratorPromptInput, type StyleDnaFilterStats } from "./generator-contracts";
import { enforceCompositionScale } from "./generator-music";
import { intentTagLogLine, resolveGeneratorIntentTags } from "./generator-prompt";
import { formatBars, trackLengthDiagnostics } from "./generator-tracker";
import { repairCompositionForPlan } from "./generator-massage-length";
import { createStyleDnaFilterStats, buildTrackMassageDecisions, decisionForTrack, selectedMassageIssues, createStyleMassageBudget } from "./generator-massage-scoring";
import { sanitizeTrackToStyleGrid, simplifyTrackHarmonicCeiling, patchMissingBassRoles, regenerateSeverelyWrongTracks } from "./generator-massage-repair";
import { patchUpperColorSingleVoice, patchOneShotEmphasis, patchChordDependentTurnaroundFill, patchEarwormLead, balanceSupportingElements, applyCreativeEventModulation } from "./generator-massage-patches";

export function applyStyleDnaFilter(
  composition: GeneratorMidiComposition,
  fallback: GeneratorMidiComposition,
  plan: GeneratorMusicianPlan,
  input: GeneratorPromptInput,
  lengthBars: GeneratorLengthBars,
  seed: string,
  modelPolicy?: GeneratorHarmonicTolerancePolicy,
) {
  const stats = createStyleDnaFilterStats();
  const intentTags = resolveGeneratorIntentTags(input, plan, seed);
  stats.normalizedIntentTagLine = intentTagLogLine(intentTags);
  const decisions = buildTrackMassageDecisions(composition, plan, input, intentTags, lengthBars);
  const budget = createStyleMassageBudget(decisions);
  stats.massagedTrackCount = decisions.filter((decision) => selectedMassageIssues(decision).length > 0).length;
  stats.massageDecisionLines = [...decisions]
    .sort((left, right) =>
      right.massageFactor - left.massageFactor
        || right.incorrectness - left.incorrectness
        || selectedMassageIssues(right).length - selectedMassageIssues(left).length,
    )
    .map((decision) => {
      const selected = selectedMassageIssues(decision);
      const issueText = decision.issues.length > 0
        ? decision.issues.map((issue) => `${issue.tag} ${Math.round(issue.score * 100)}%`).join(", ")
        : "clean";
      const fixText = selected.length > 0 ? selected.map((issue) => issue.tag).join(", ") : "none";
      return `massage ${decision.name} ${Math.round(decision.massageFactor * 100)}% factor ${Math.round(decision.incorrectness * 100)}% wrong ${Math.round(decision.likelihood * 100)}% likelihood; fix: ${fixText}; tags: ${issueText}`;
    });
  const regenerated = regenerateSeverelyWrongTracks(composition, fallback, decisions, stats, budget);
  const sanitized = {
    ...regenerated,
    tracks: regenerated.tracks.map((track) => sanitizeTrackToStyleGrid(track, plan, lengthBars, stats, decisionForTrack(decisions, track))),
  } satisfies GeneratorMidiComposition;
  const patched = patchMissingBassRoles(sanitized, fallback, plan, stats);
  const ceilingChecked = {
    ...patched,
    tracks: patched.tracks.map((track) => simplifyTrackHarmonicCeiling(track, plan, stats, decisionForTrack(decisions, track))),
  } satisfies GeneratorMidiComposition;
  const earworm = patchEarwormLead(ceilingChecked, fallback, stats, decisions, budget);
  const oneShots = patchOneShotEmphasis(earworm, lengthBars, stats, decisions, budget);
  const chordFill = patchChordDependentTurnaroundFill(oneShots, lengthBars, stats, decisions, budget);
  const upperColor = patchUpperColorSingleVoice(chordFill, plan, lengthBars, stats, decisions, budget);
  const balanced = balanceSupportingElements(upperColor, plan, lengthBars, stats, decisions);
  const modulated = applyCreativeEventModulation(balanced, plan, lengthBars, seed, stats, decisions);
  const repaired = repairCompositionForPlan(modulated, plan, lengthBars, seed);
  const scaleChecked = enforceCompositionScale(repaired.composition, input, intentTags, stats, lengthBars, plan, modelPolicy);
  return {
    ...repaired,
    composition: scaleChecked,
    diagnostics: trackLengthDiagnostics(scaleChecked, lengthBars),
    stats,
  };
}

export function logStyleDnaFilterDiagnostics(options: CodexClientOptions, stats: StyleDnaFilterStats) {
  const parts = [
    ...(stats.normalizedIntentTagLine ? [stats.normalizedIntentTagLine] : []),
    ...(stats.massageDecisionLines.length > 0 ? [`massage gradient ${stats.massagedTrackCount}/${stats.massageDecisionLines.length} tracks`] : []),
    ...(stats.pitchCorrectedNotes > 0 ? [`scale-corrected ${stats.pitchCorrectedNotes} notes`] : []),
    ...(stats.quantizedNotes > 0 ? [`quantized ${stats.quantizedNotes} notes`] : []),
    ...(stats.syncopationClampedNotes > 0 ? [`clamped ${stats.syncopationClampedNotes} syncopated notes`] : []),
    ...(stats.simplifiedChordClusters > 0 ? [`stripped ${stats.strippedChordNotes} extension notes across ${stats.simplifiedChordClusters} clusters`] : []),
    ...(stats.regeneratedTracks.length > 0 ? [`regenerated lanes: ${stats.regeneratedTracks.join(", ")}`] : []),
    ...(stats.patchedTrackRoles.length > 0 ? [`patched missing bass roles: ${stats.patchedTrackRoles.join(", ")}`] : []),
    ...(stats.upperColorNotes > 0 ? [`added ${stats.upperColorNotes} upper-color single notes`] : []),
    ...(stats.earwormLeadPatched ? ["patched earworm lead motif"] : []),
    ...(stats.chordDependentFillNotes > 0 ? [`added ${stats.chordDependentFillNotes} chord-dependent fill notes`] : []),
    ...(stats.oneShotEvents > 0 ? [`added ${stats.oneShotEvents} one-shot accents`] : []),
    ...(stats.supportBalancedNotes > 0 || stats.supportThinnedNotes > 0 ? [`balanced support lanes (${stats.supportBalancedNotes} velocities, ${stats.supportThinnedNotes} thinned)`] : []),
    ...(stats.eventModulatedNotes > 0 ? [`event-modulated ${stats.eventModulatedNotes} notes`] : []),
    ...(stats.skippedAdditiveRepairs.length > 0 ? [`budget skipped ${Array.from(new Set(stats.skippedAdditiveRepairs)).join(", ")}`] : []),
  ];
  options.onLog?.(parts.length > 0 ? `style filter ${parts.join("; ")}` : "style filter clean");
  for (const line of stats.massageDecisionLines.slice(0, 4)) {
    options.onLog?.(`style filter ${line}`);
  }
}

export function logRepairDiagnostics(options: CodexClientOptions, diagnostics: ReturnType<typeof trackLengthDiagnostics>, lengthBars: GeneratorLengthBars, repairedCount: number, phraseFillRepaired: boolean) {
  for (const diagnostic of diagnostics) {
    if (diagnostic.short) {
      options.onLog?.(`coverage ${diagnostic.name} ${formatBars(diagnostic.lastNoteEndTick)}/${lengthBars} bars`);
    }
  }
  if (repairedCount > 0) {
    options.onLog?.(`repaired ${repairedCount} short tracks to ${lengthBars} bars`);
  }
  if (phraseFillRepaired) {
    options.onLog?.("repaired missing phrase fill");
  }
}
