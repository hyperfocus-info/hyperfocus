import { GENERATOR_MIDI_BEATS_PER_BAR, GENERATOR_MIDI_TICKS_PER_QUARTER } from "./midi-encoder";
import { buildGeneratorIntentPromptLines, buildGeneratorSelectorPromptLines } from "./generator-selector-options";
import { type GeneratorLengthBars } from "./generator-option-catalog";
import { GENERATOR_MODEL_ENVELOPE_JSON_SCHEMA, GENERATOR_MODEL_SCHEMA_VERSION, GENERATOR_TRACKER_GRAMMAR_VERSION, type GeneratorIntentPlan, type GeneratorMusicianPlan, type GeneratorPromptInput } from "./generator-contracts";
import { arrangementPlanMetadataLine, buildGeneratorIntentPlanFromSelection, cleanField, dashboardFieldsFromPrompt, percentField } from "./generator-intent";
import { buildMusicianPlan, selectedLengthBars, selectedScaleInfo, selectedScaleMode } from "./generator-style-dna";


export const SYSTEM_DIRECTIVE = `You are a compact MIDI tracker for PadPilot.
Return only Delta-Tick String Tracker Format v2:
!BPM:120!
!SCHEMA:generator-model-envelope-v1;GRAMMAR=delta-tracker-v2!
!PLAN:STYLE=style;GRID=straight;BASS=root;FORM=starter-turnaround;PHRASE=statement-answer;MOTIF=hook;ROLES=drum-groove,chord-comp,root-bass,lead-motif;CONFIDENCE=0.75!
!TAGS:THEME=tag-a,tag-b;GROOVE=tag-c,tag-d!
#TRK:Example Keys,CH:0,PG:4
[0,60,90,480][480,64,85,480]
Hard format:
- Use SMF-ready ticks.
- The example above shows syntax only; do not copy its short length.
- Compose exactly one complete 4/4 loop at 480 PPQ using the requested Length Bars.
- Bar length is 1920 ticks. Loop end tick is Length Bars multiplied by 1920.
- CH is zero-indexed MIDI channel.
- Drums/rhythm use CH:9.
- PG is zero-indexed General MIDI program.
- Each note block is [deltaTicks,note,velocity,durationTicks].
- Never write note starts beyond the requested loop end tick; shorten overhanging notes to the loop end.
Intent contract:
- Track names and PG values must reflect normalized intent tags from Genre, Mood/Vibe, Era, Complexity, Scale/Mode, and Extra Description Notes. Genre is one tag source, not a privileged mode.
- Treat Selector Tags as weighted lane constraints: FRONT-FACING dominates, STRONG must be audible, SUPPORTING stays below main lanes, HINT only colors.
- If a selector value is typed and unrecognized, infer its closest style tags once inside this turn before composing.
- Output one !SCHEMA line, one !PLAN line, and one !TAGS line after BPM; use lowercase kebab-case values.
- Disambiguate broad genres with normalized theme and groove tags before composing, e.g. boom-bap can be soulful/jazzy or industrial/syncopated.
- Track headers may include ROLE, LANE, FUNCTION, BASS_ROLE, PHRASE, and MOTIF_ID metadata after PG when those clarify the arrangement plan.
Musical contract:
- Treat Scale/Mode as a concrete root plus mode label; keep pitched notes inside that scale unless Extra Description asks otherwise.
- Treat the Musician Plan in the user prompt as binding where it names layer budget, density budget, bass roles, form, and quality gates.
- Avoid default Piano, Synth Bass, Lead, Drums lineup unless directly requested.
- Sparse/minimal/ambient space is valid quality: do not fill lanes or duplicate bass roles beyond the plan.
- Chords must use genre-aware rhythm, including offbeats, rests on beat 1, ties/anticipations, 3+3+2, triplets, or swing when appropriate.
- Strum or roll chord notes with small tick offsets when Humanize, guitar, keys, house stabs, funk, soul, or acoustic language suggests groove.
- Bass lanes must follow the plan's bass role budget; split offbeat/live/808 lanes only when the plan asks for multiple bass roles.
- When the Musician Plan requires phrase fills, drum lines in 8+ bar loops should use fills or crashes at phrase boundaries, with the final phrase fill strongest. Sparse/ambient plans may omit drums and fills entirely.
- Use guide tones, inversions, rootless voicings, and 7/9/11/13 extensions when the Musician Plan asks for advanced harmony.
- Write motif, variation, riff, and countermelody lanes as real instrumental parts, not random note spray.
- Keep groove in the moderate-complexity pocket: strong pulse plus enough offbeat/rest/tie behavior to move.
- Put final notes so the musical phrase resolves in the final bar unless the plan's space budget asks for intentional dropout rests.
- Keep output compact, but never omit late-loop musical material from all primary lanes.`;

export const MAX_TRACKER_TICK = 32 * GENERATOR_MIDI_BEATS_PER_BAR * GENERATOR_MIDI_TICKS_PER_QUARTER;
export const MAX_DELTA_TRACKER_UTF8_BYTES = 2097152;
export const MAX_DELTA_TRACKER_HEADER_BYTES = 1_024;
export const MAX_DELTA_TRACKER_METADATA_VALUE_BYTES = 128;
export const MAX_DELTA_TRACKER_METADATA_LINE_BYTES = 2_048;
export const MAX_DELTA_TRACKER_METADATA_LINES = 8;
export const TRACK_LENGTH_TOLERANCE_TICKS = GENERATOR_MIDI_TICKS_PER_QUARTER;


export {
  stringArray,
  normalizedTag,
  tagSetHas,
  intentPlanTagList,
  intentPlanTagSet,
  cleanField,
  percentField,
  dashboardFieldsFromPrompt,
  splitIntentTagValue,
  splitRawIntentWords,
  explicitConstraintTags,
  extractGeneratorAiIntentTags,
  planHeaderField,
  extractGeneratorArrangementPlan,
  optionalString,
  optionalNumber,
  objectHasSchemaFields,
  objectHasOnlySchemaFields,
  normalizeArrangementPlan,
  normalizeLanePlanItem,
  normalizeLanePlan,
  arrangementPlanWithLaneRoles,
  normalizeGroovePlan,
  normalizeChordPlanItem,
  normalizeChordPlan,
  promptIntentTags,
  planIntentTags,
  rawIntentTagEntries,
  selectorIntentTags,
  uniqueWeightedSelectorTags,
  buildGeneratorIntentPlanFromSelection,
  resolveGeneratorIntentTags,
  intentTagText,
  trackSourceText,
  intentTagLogLine,
  intentTagMetadataLine,
  schemaMetadataLine,
  arrangementPlanMetadataLine,
  explicitOutsideScaleRequested,
  blueNotesRequested,
  normalizeHarmonicToleranceMode,
  normalizeHarmonicTolerancePolicy,
  derivedHarmonicTolerancePolicy,
  explicitNoDrumsRequested,
  explicitNo808Requested,
  uniqueStrings,
  chordLanguageRanks,
} from "./generator-intent";

export { clamp01Or as clamp01 } from "../../../utils/math";
export {
  type DnaScores,
  type DnaScorePatch,
  type DnaKeywordRule,
  dnaRecord,
  createDnaScores,
  addScore,
  bestScore,
  addScaleScores,
  dnaKeywordRules,
  inferStyleDna,
  preferredDnaScale,
  selectedScaleMode,
  selectedLengthBars,
  promptSeed,
  selectedScaleInfo,
  strongerChordLanguage,
  weakerChordLanguage,
  chordLanguageFromDensity,
  ceilingFromDensity,
  changesFromRhythm,
  progressionStyleFromDna,
  harmonyProfileFromDna,
  primaryBassLayer,
  bassRoleLayers,
  buildMusicianPlan,
} from "./generator-style-dna";

export function buildGeneratorIntentPlan(
  input: GeneratorPromptInput,
  selectedMode = selectedScaleMode(input),
  selectedScale = selectedScaleInfo(input).selectedScale,
  lengthBars = selectedLengthBars(input),
  plan: GeneratorMusicianPlan = buildMusicianPlan(input, selectedMode),
) {
  return buildGeneratorIntentPlanFromSelection(input, selectedMode, selectedScale, lengthBars, plan);
}

export function musicianPlanPromptLines(plan: GeneratorMusicianPlan) {
  return [
    "Musician Plan:",
    `- Style DNA: ${plan.style.styleLabel}; harmonic-density ${plan.style.harmonicDensity}; harmonic-rhythm ${plan.style.harmonicRhythm}; voicing ${plan.style.voicingWidth}; bass role ${plan.style.bassRole}; groove grid ${plan.style.grooveGrid}; density budget ${plan.style.densityBudget}; melodic role ${plan.style.melodicRole}.`,
    `- Style Dialect: ${plan.style.instrumentDialect.join("; ")}.`,
    `- Avoid: ${plan.style.avoid.join("; ")}.`,
    `- Form Arc: ${plan.form.arc}; ${plan.form.sections.join(" / ")}; ${plan.form.turnaroundStrategy}.`,
    `- Groove: ${plan.groove.syncopation} syncopation; anchors ${plan.groove.anchors.join("/")}; ${plan.groove.restStrategy}; ${plan.groove.velocityCurve}; ${plan.groove.microtiming}.`,
    `- Harmony Dialect: ${plan.harmony.genreDialect}.`,
    `- Harmony: ${plan.harmony.chordLanguage}; ${plan.harmony.voicing}; extensions ${plan.harmony.extensions.join("/") || "none"}; ${plan.harmony.inversionStrategy}; ${plan.harmony.voicingRange} voicing range; ${plan.harmony.changesPerFourBars} changes per 4 bars; ${plan.harmony.progressionStyle}.`,
    `- Layers: required ${plan.layers.required.join(", ")}; optional ${plan.layers.optional.join(", ")}; minimum tracks ${plan.layers.minTracks}; bass role target ${plan.quality.minBassRoles}.`,
    `- Melody: ${plan.melody.motifStrategy}; counterline ${plan.melody.counterline ? "required" : "optional"} with ${plan.melody.counterMotion} motion; riff layers ${plan.melody.riffLayers}.`,
    `- Event Modulation: ${plan.performance.eventModulation ? "required" : "optional"}; ${plan.performance.modulationStrategy}.`,
    `- Quality Gate: style-correct first; tracks ${plan.layers.minTracks}+ unless sparse budget says fewer; bass roles ${plan.quality.minBassRoles}+; chord clusters ${plan.quality.minChordClusterSize}-${plan.quality.maxChordClusterSize}; max non-drum notes ${plan.quality.maxNonDrumNotesPerBar}/bar; offbeat ratio target ${Math.round(plan.quality.minOffbeatRatio * 100)}%+; phrase variations ${plan.quality.minPhraseVariations}+; short support tracks allowed ${plan.quality.maxShortTracks}; phrase-end drum fill ${plan.quality.phraseFillRequired ? "required" : "optional"}.`,
    "- Existing knob meaning: Creativity = metric displacement, harmonic tension within genre ceiling, and sound-design/phrase surprise; Density = active layer budget; Humanize = performance feel; Temperature = phrase variation risk.",
  ];
}

export function generatorPromptEnvelopeLines(intentPlan: GeneratorIntentPlan) {
  const tags = intentPlan.tags.all.length > 0 ? intentPlan.tags.all.join(", ") : "none";
  const themes = intentPlan.tags.theme.length > 0 ? intentPlan.tags.theme.join(", ") : "none";
  const grooves = intentPlan.tags.groove.length > 0 ? intentPlan.tags.groove.join(", ") : "none";
  const weighted = intentPlan.tags.weighted.length > 0
    ? intentPlan.tags.weighted.slice(0, 24).map((tag) => `${tag.tag}@${tag.weight}:${tag.provenance}${tag.locked ? ":locked" : ""}`).join(", ")
    : "none";
  const avoid = intentPlan.tags.avoid.length > 0 ? intentPlan.tags.avoid.join("; ") : "none";
  return [
    "Generator Intent Plan:",
    `- Grammar: ${GENERATOR_TRACKER_GRAMMAR_VERSION}; schema ${GENERATOR_MODEL_SCHEMA_VERSION}; return strict schema-constrained JSON with tracker text in the tracker field.`,
    `- Normalized Tags: ${tags}.`,
    `- Weighted Selector Tags: ${weighted}.`,
    `- Theme Tags: ${themes}.`,
    `- Groove Tags: ${grooves}.`,
    `- Avoid Rules: ${avoid}.`,
    `- Validation: loop-end tick ${intentPlan.validation.loopEndTick}; min tracks ${intentPlan.validation.minTracks}; min bass roles ${intentPlan.validation.minBassRoles}; max chord cluster ${intentPlan.validation.maxChordClusterSize}; max melodic layers ${intentPlan.validation.maxMelodicLayers}; max non-drum notes ${intentPlan.validation.maxNonDrumNotesPerBar}/bar.`,
    "- Plan-before-events: choose arrangementPlan, lanePlan, groovePlan, chordPlan, and harmonicTolerancePolicy before writing tracker events; tracker lanes must match that plan.",
    "- JSON schema mode: include required arrangementPlan/lanePlan/groovePlan/chordPlan/harmonicTolerancePolicy fields beside tracker/confidence/validationNotes/repairAvoided.",
    "- Tracker mode: encode lane intent in track headers when useful, e.g. #TRK:Rhodes Comp,CH:0,PG:4,ROLE:chords,LANE:required,FUNCTION:harmony.",
    "- Harmonic policy: classify non-scale notes as strict/color/tension/avant; preserve earned resolving tension, repair absolute-wrong notes.",
    "- Contract: treat all selector fields and notes as tag sources; genre is not a special branch. Fallback and repair logic will use the same tags.",
  ];
}

export function buildPrompt(input: GeneratorPromptInput, selectedMode: string, selectedScale: string, lengthBars: GeneratorLengthBars, plan = buildMusicianPlan(input, selectedMode), intentPlan = buildGeneratorIntentPlan(input, selectedMode, selectedScale, lengthBars, plan)) {
  return [
    `Genre: ${cleanField(input.genre)}`,
    `Mood/Vibe: ${cleanField(input.mood)}`,
    `Era: ${cleanField(input.era)}`,
    `Complexity: ${cleanField(input.complexity)}`,
    `Scale/Mode: ${selectedScale}`,
    `Mode Only: ${selectedMode}`,
    `Creativity: ${percentField(input.creativity, 0.65)}`,
    `Temperature: ${percentField(input.temperature, 0.7)}`,
    `Length Bars: ${lengthBars}`,
    `Density: ${percentField(input.density, 0.55)}`,
    `Humanize: ${percentField(input.humanize, 0.35)}`,
    `Extra Description Notes: ${cleanField(input.notes)}`,
    ...generatorPromptEnvelopeLines(intentPlan),
    ...buildGeneratorSelectorPromptLines(dashboardFieldsFromPrompt(input)),
    ...buildGeneratorIntentPromptLines(dashboardFieldsFromPrompt(input)),
    ...musicianPlanPromptLines(plan),
    `Build one complete ${lengthBars}-bar 4/4 loop at 480 PPQ; loop end is tick ${lengthBars * GENERATOR_MIDI_BEATS_PER_BAR * GENERATOR_MIDI_TICKS_PER_QUARTER}.`,
    `Write this schema header after BPM: !SCHEMA:${GENERATOR_MODEL_SCHEMA_VERSION};GRAMMAR=${GENERATOR_TRACKER_GRAMMAR_VERSION}!`,
    `Write this plan header after BPM: ${arrangementPlanMetadataLine(plan)}`,
    `Layer budget: use required lanes (${plan.layers.required.join(", ")}) before optional lanes; do not duplicate bass roles beyond target ${plan.quality.minBassRoles}.`,
    `Include chord rhythm variety: offbeats, rests on beat 1, anticipations, 3+3+2, triplets, swing, and strummed/rolled chord notes when style or complexity calls for it.`,
    plan.quality.phraseFillRequired
      ? `Drum identity is required; add tasteful fills or crashes at 4/8/16-bar phrase ends, with the final phrase fill strongest.`
      : plan.layers.required.includes("drum groove")
        ? `Drum identity is required, but phrase fills are optional; preserve the required lane budget.`
        : `Negative space is binding: do not invent drums or phrase fills when they are absent from required lanes.`,
    `Primary lanes should resolve near tick ${(lengthBars * GENERATOR_MIDI_BEATS_PER_BAR * GENERATOR_MIDI_TICKS_PER_QUARTER) - GENERATOR_MIDI_TICKS_PER_QUARTER}; sparse/support lanes may rest intentionally when the density budget is space.`,
    `Pick instrument track names and GM programs that fit the style; do not reuse Piano/Synth Bass/Lead/Drums as a generic default.`,
  ].join("\n");
}

export function buildGeneratorPromptEnvelope(input: GeneratorPromptInput, selectedMode = selectedScaleInfo(input).selectedMode, selectedScale = selectedScaleInfo(input).selectedScale, lengthBars = selectedLengthBars(input)) {
  const plan = buildMusicianPlan(input, selectedMode);
  const intentPlan = buildGeneratorIntentPlan(input, selectedMode, selectedScale, lengthBars, plan);
  return {
    grammarVersion: GENERATOR_TRACKER_GRAMMAR_VERSION,
    intentPlan,
    jsonSchema: GENERATOR_MODEL_ENVELOPE_JSON_SCHEMA,
    schemaVersion: GENERATOR_MODEL_SCHEMA_VERSION,
    system: SYSTEM_DIRECTIVE,
    user: buildPrompt(input, selectedMode, selectedScale, lengthBars, plan, intentPlan),
  };
}
