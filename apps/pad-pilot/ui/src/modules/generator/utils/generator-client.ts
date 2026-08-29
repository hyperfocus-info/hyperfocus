import { textToBase64 } from "../../../proto/base64";
import { encodeMidiFile, encodeMidiTrackFile, type GeneratorMidiComposition } from "./midi-encoder";
import { isPadPilotDevtoolsEnabled } from "../../../runtime-flags";
import { type GeneratorLengthBars } from "./generator-options";
import { askAgent } from "../../../padpilot/agent";
import { type CodexClientOptions, type GeneratedMidiTemplate, GENERATOR_MODEL_SCHEMA_VERSION, GENERATOR_TRACKER_GRAMMAR_VERSION, type GeneratorModelEnvelope, type GeneratorPromptInput, type GeneratorValidationReport, type OriginalModelArtifact } from "./generator-contracts";
import { buildFallbackTracker } from "./generator-fallback";
import { applyStyleDnaFilter, createStyleDnaFilterStats, logRepairDiagnostics, logStyleDnaFilterDiagnostics, repairCompositionForPlan } from "./generator-massage";
import { enforceCompositionScale, logDevCompareMetrics } from "./generator-music";
import { arrangementPlanWithLaneRoles, buildGeneratorIntentPlan, buildGeneratorPromptEnvelope, buildMusicianPlan, derivedHarmonicTolerancePolicy, extractGeneratorArrangementPlan, normalizeArrangementPlan, normalizeChordPlan, normalizeGroovePlan, normalizeHarmonicTolerancePolicy, normalizeLanePlan, objectHasOnlySchemaFields, resolveGeneratorIntentTags, selectedLengthBars, selectedScaleInfo, stringArray } from "./generator-prompt";
import { buildGeneratorRepairPatch, buildGeneratorValidationReport, buildQualityFallback, qualityLogLine, repairPatchLogLine, shouldKeepMassagedModel } from "./generator-quality";
import { hashString } from "./generator-selection";
import { parseDeltaTickTracker, scaleSlug, scoreGeneratorComposition, slug, trackerFromComposition, trackLengthDiagnostics } from "./generator-tracker";


export async function requestLocalTracker(input: GeneratorPromptInput, options: CodexClientOptions, selectedMode: string, selectedScale: string, lengthBars: GeneratorLengthBars) {
  const startedAt = Date.now();
  const envelope = buildGeneratorPromptEnvelope(input, selectedMode, selectedScale, lengthBars);
  options.onLog?.("connect agent");
  const response = await askAgent({
    endpoint: options.endpoint,
    model: options.model,
    prompt: envelope.user,
    provider: options.provider,
    responseSchema: envelope.jsonSchema,
    responseSchemaName: envelope.schemaVersion,
    signal: options.signal,
    system: envelope.system,
  });
  options.onLog?.(`received ${response.provider} ${response.model} ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  const extracted = extractTrackerText(response.text);
  return {
    ...(extracted.envelope ? { envelope: extracted.envelope } : {}),
    source: response.source === "dev-agent" ? "codex-cli" : "local-model",
    text: extracted.text,
  } satisfies { envelope?: GeneratorModelEnvelope; source: "codex-cli" | "local-model"; text: string };
}

export function extractTrackerText(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) {
    return { text };
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const envelope = parseGeneratorModelEnvelope(parsed);
    return {
      envelope,
      text: envelope.tracker,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown parse error";
    throw new Error(`Structured generator envelope was invalid: ${message}`);
  }
}

export function parseGeneratorModelEnvelope(value: unknown) {
  if (!value || typeof value !== "object") {
    throw new Error("Structured generator envelope was not an object.");
  }
  const envelope = value as Record<string, unknown>;
  const schemaFields = ["arrangementPlan", "chordPlan", "confidence", "grammarVersion", "groovePlan", "harmonicTolerancePolicy", "lanePlan", "repairAvoided", "schemaVersion", "tracker", "validationNotes"];
  if (!objectHasOnlySchemaFields(envelope, schemaFields)) {
    throw new Error("Structured generator envelope had additional fields.");
  }
  const validationNotes = stringArray(envelope.validationNotes);
  const repairAvoided = stringArray(envelope.repairAvoided);
  if (envelope.schemaVersion !== GENERATOR_MODEL_SCHEMA_VERSION) {
    throw new Error("Structured generator envelope schemaVersion mismatch.");
  }
  if (envelope.grammarVersion !== GENERATOR_TRACKER_GRAMMAR_VERSION) {
    throw new Error("Structured generator envelope grammarVersion mismatch.");
  }
  if (typeof envelope.confidence !== "number" || envelope.confidence < 0 || envelope.confidence > 1) {
    throw new Error("Structured generator envelope confidence invalid.");
  }
  if (typeof envelope.tracker !== "string" || !envelope.tracker.trim()) {
    throw new Error("Structured generator envelope tracker missing.");
  }
  if (!validationNotes || !repairAvoided) {
    throw new Error("Structured generator envelope diagnostics invalid.");
  }
  const arrangementPlan = normalizeArrangementPlan(envelope.arrangementPlan);
  const chordPlan = normalizeChordPlan(envelope.chordPlan);
  const groovePlan = normalizeGroovePlan(envelope.groovePlan);
  const harmonicTolerancePolicy = normalizeHarmonicTolerancePolicy(envelope.harmonicTolerancePolicy);
  const lanePlan = normalizeLanePlan(envelope.lanePlan);
  if (!arrangementPlan) {
    throw new Error("Structured generator envelope arrangementPlan missing.");
  }
  if (!chordPlan) {
    throw new Error("Structured generator envelope chordPlan missing.");
  }
  if (!groovePlan) {
    throw new Error("Structured generator envelope groovePlan missing.");
  }
  if (!harmonicTolerancePolicy) {
    throw new Error("Structured generator envelope harmonicTolerancePolicy missing.");
  }
  if (!lanePlan) {
    throw new Error("Structured generator envelope lanePlan missing.");
  }
  return {
    arrangementPlan,
    chordPlan,
    confidence: envelope.confidence,
    groovePlan,
    grammarVersion: GENERATOR_TRACKER_GRAMMAR_VERSION,
    harmonicTolerancePolicy,
    lanePlan,
    repairAvoided,
    schemaVersion: GENERATOR_MODEL_SCHEMA_VERSION,
    tracker: envelope.tracker,
    validationNotes,
  } satisfies GeneratorModelEnvelope;
}

export function buildTemplate(
  composition: GeneratorMidiComposition,
  rawTracker: string,
  source: GeneratedMidiTemplate["source"],
  selectedKey: string,
  selectedMode: string,
  selectedScale: string,
  lengthBars: GeneratorLengthBars,
  originalModel?: OriginalModelArtifact,
  audit?: GeneratedMidiTemplate["audit"],
) {
  const loopedComposition = {
    ...composition,
    loopBars: lengthBars,
  } satisfies GeneratorMidiComposition;
  const combinedMidi = encodeMidiFile(loopedComposition);
  const contentId = hashString(`${selectedScale}\n${rawTracker}`).toString(36).padStart(6, "0").slice(0, 6);
  const baseName = `generator-${composition.bpm}-${scaleSlug(selectedScale)}-${contentId}`;
  const devOriginal = originalModel && isPadPilotDevtoolsEnabled() ? originalModel : undefined;
  const originalLoopedComposition = devOriginal
    ? {
        ...devOriginal.composition,
        loopBars: lengthBars,
      } satisfies GeneratorMidiComposition
    : undefined;
  const originalModelOutput = devOriginal && originalLoopedComposition
    ? {
        filename: `${baseName}-original-model.mid`,
        label: `Dev Original ${devOriginal.source === "codex-cli" ? "Codex CLI" : "Local Model"} MIDI`,
        midiData: encodeMidiFile(originalLoopedComposition),
        rawTracker: devOriginal.rawTracker,
        tracks: originalLoopedComposition.tracks,
      }
    : undefined;
  return {
    ...(audit ? { audit } : {}),
    bpm: composition.bpm,
    combinedMidi,
    filename: `${baseName}-combined.mid`,
    lengthBars,
    ...(originalModelOutput ? { originalModel: originalModelOutput } : {}),
    rawTracker,
    selectedKey,
    selectedMode,
    selectedScale,
    source,
    trackFiles: composition.tracks.map((track, index) => ({
      filename: `${baseName}-${String(index + 1).padStart(2, "0")}-${slug(track.name)}.mid`,
      label: `Drag ${track.name} (CH ${track.channel + 1})`,
      midiData: encodeMidiTrackFile(loopedComposition, track),
      track,
    })),
    tracks: composition.tracks,
  } satisfies GeneratedMidiTemplate;
}

export async function generateMidiTemplate(input: GeneratorPromptInput, options: CodexClientOptions = {}) {
  const { selectedKey, selectedMode, selectedScale } = selectedScaleInfo(input);
  const lengthBars = selectedLengthBars(input);
  const plan = buildMusicianPlan(input, selectedMode);
  const intentPlan = buildGeneratorIntentPlan(input, selectedMode, selectedScale, lengthBars, plan);
  let modelEnvelope: GeneratorModelEnvelope | undefined;
  let modelValidationReport: GeneratorValidationReport | undefined;
  let originalModel: OriginalModelArtifact | undefined;
  options.onLog?.(`style dna ${plan.style.styleLabel}: ${plan.style.harmonicDensity}/${plan.style.harmonicRhythm}, ${plan.style.bassRole}, ${plan.style.grooveGrid}, ${plan.form.arc}`);
  try {
    const result = await requestLocalTracker(input, options, selectedMode, selectedScale, lengthBars);
    const rawTracker = result.text;
    modelEnvelope = result.envelope;
    const arrangementPlan = arrangementPlanWithLaneRoles(result.envelope?.arrangementPlan ?? extractGeneratorArrangementPlan(rawTracker), result.envelope?.lanePlan);
    const intentTags = resolveGeneratorIntentTags(input, plan, rawTracker);
    const harmonicPolicy = derivedHarmonicTolerancePolicy(input, intentTags, plan, result.envelope?.harmonicTolerancePolicy);
    const parsedComposition = parseDeltaTickTracker(rawTracker);
    originalModel = {
      composition: parsedComposition,
      rawTracker,
      source: result.source,
    };
    if (isPadPilotDevtoolsEnabled()) {
      options.onLog?.("dev compare captured original model MIDI before massage");
    }
    const baselineRepair = repairCompositionForPlan(parsedComposition, plan, lengthBars, rawTracker);
    const baselineStats = createStyleDnaFilterStats();
    const baselineComposition = enforceCompositionScale(baselineRepair.composition, input, intentTags, baselineStats, lengthBars, plan, harmonicPolicy);
    const baselineQuality = scoreGeneratorComposition(baselineComposition, plan, lengthBars, arrangementPlan, intentPlan);
    const missingStyleIdentity = baselineQuality.reasons.filter((reason) => /^missing (?:required drum groove|log-drum bass|interlocking percussion) identity$/.test(reason));
    if (missingStyleIdentity.length > 0) {
      modelValidationReport = buildGeneratorValidationReport(baselineQuality, lengthBars, arrangementPlan, harmonicPolicy);
      throw new Error(`quality gate rejected model output: ${missingStyleIdentity.join("; ")}`);
    }
    const fallbackComposition = parseDeltaTickTracker(buildFallbackTracker(input));
    const filtered = applyStyleDnaFilter(parsedComposition, fallbackComposition, plan, input, lengthBars, rawTracker, harmonicPolicy);
    logStyleDnaFilterDiagnostics(options, filtered.stats);
    const filteredQuality = scoreGeneratorComposition(filtered.composition, plan, lengthBars, arrangementPlan, intentPlan);
    const keepMassaged = shouldKeepMassagedModel(baselineQuality, filteredQuality, filtered.stats);
    const repairPatch = buildGeneratorRepairPatch(baselineQuality, filteredQuality, filtered.stats, keepMassaged);
    const finalComposition = keepMassaged ? filtered.composition : baselineComposition;
    const quality = keepMassaged ? filteredQuality : baselineQuality;
    const validationReport = buildGeneratorValidationReport(quality, lengthBars, arrangementPlan, harmonicPolicy);
    modelValidationReport = validationReport;
    const repairedCount = keepMassaged ? filtered.repairedCount : baselineRepair.repairedCount;
    const phraseFillRepaired = keepMassaged ? filtered.phraseFillRepaired : baselineRepair.phraseFillRepaired;
    const delta = filteredQuality.score - baselineQuality.score;
    options.onLog?.(`massage quality delta ${Math.round(baselineQuality.score)}->${Math.round(filteredQuality.score)} (${delta >= 0 ? "+" : ""}${Math.round(delta)})${keepMassaged ? "" : "; kept structural model"}`);
    options.onLog?.(repairPatchLogLine(repairPatch));
    logDevCompareMetrics(options, parsedComposition, finalComposition, selectedKey, selectedMode);
    logRepairDiagnostics(options, trackLengthDiagnostics(finalComposition, lengthBars), lengthBars, repairedCount, phraseFillRepaired);
    if (!keepMassaged && baselineStats.pitchCorrectedNotes > 0) {
      options.onLog?.(`structural model scale-corrected ${baselineStats.pitchCorrectedNotes} notes`);
    }
    options.onLog?.(`parsed ${finalComposition.tracks.length} tracks`);
    options.onLog?.(qualityLogLine("model", quality));
    if (!quality.passed) {
      throw new Error(`quality gate rejected model output: ${quality.reasons.join("; ") || "score below threshold"}`);
    }
    return buildTemplate(finalComposition, trackerFromComposition(finalComposition, rawTracker), result.source, selectedKey, selectedMode, selectedScale, lengthBars, originalModel, {
      ...(input.magicProvenance ? { magicProvenance: input.magicProvenance } : {}),
      ...(result.envelope ? { modelEnvelope: result.envelope } : {}),
      repairPatch,
      validationReport,
    });
  } catch (error) {
    if (options.signal?.aborted) {
      throw options.signal.reason instanceof Error
        ? options.signal.reason
        : new DOMException("Generator request aborted.", "AbortError");
    }
    const message = error instanceof Error ? error.message : "Local model failed.";
    options.onLog?.(`fallback ${message}`);
    const fallback = buildQualityFallback(input, plan, lengthBars, options);
    logRepairDiagnostics(options, trackLengthDiagnostics(fallback.composition, lengthBars), lengthBars, fallback.repairedCount, false);
    return buildTemplate(fallback.composition, fallback.rawTracker, "fallback", selectedKey, selectedMode, selectedScale, lengthBars, originalModel, {
      ...(input.magicProvenance ? { magicProvenance: input.magicProvenance } : {}),
      modelFailure: { reason: message },
      ...(modelEnvelope ? { modelEnvelope } : {}),
      ...(modelValidationReport ? { modelValidationReport } : {}),
      validationReport: buildGeneratorValidationReport(fallback.quality, lengthBars),
    });
  }
}

export function encodeTrackerPreviewBase64(rawTracker: string) {
  return textToBase64(rawTracker);
}
