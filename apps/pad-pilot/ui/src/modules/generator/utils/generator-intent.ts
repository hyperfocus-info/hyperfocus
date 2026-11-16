import { asRecord } from "@hyperfocus/utilities/records";
import { GENERATOR_MIDI_BEATS_PER_BAR, GENERATOR_MIDI_TICKS_PER_QUARTER } from "./midi-encoder";
import { clamp01Or } from "../../../utils/math";
import { buildGeneratorSelectorState, buildGeneratorSelectorPromptTags, createEmptyGeneratorFields, mergeGeneratorIntentTags, normalizeGeneratorIntentTags, normalizeGeneratorLengthBars, normalizeGeneratorScaleMode } from "./generator-selector-options";
import { type GeneratorIntentTags, type GeneratorLengthBars, type GeneratorWeightedSelectorTag } from "./generator-option-catalog";
import { GENERATOR_MODEL_SCHEMA_VERSION, GENERATOR_TRACKER_GRAMMAR_VERSION, type GeneratorArrangementPlanHeader, type GeneratorHarmonicToleranceMode, type GeneratorHarmonicTolerancePolicy, type GeneratorIntentPlan, type GeneratorLanePlanItem, type GeneratorMusicianPlan, type GeneratorPromptInput, harmonicToleranceModes } from "./generator-contracts";

export function uniqueStrings(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export const chordLanguageRanks = {
  altered: 3,
  extended: 2,
  sevenths: 1,
  triads: 0,
} as const;

export function stringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value.map((item) => String(item))
    : undefined;
}

export function normalizedTag(value: string) {
  return normalizeGeneratorIntentTags([value])[0] ?? "";
}

export function tagSetHas(tags: Set<string>, values: readonly string[]) {
  return values.some((value) => tags.has(normalizedTag(value)));
}

export function intentPlanTagList(intentPlan: GeneratorIntentPlan) {
  return uniqueStrings([
    ...intentPlan.tags.all,
    ...intentPlan.tags.groove,
    ...intentPlan.tags.raw,
    ...intentPlan.tags.selector,
    ...intentPlan.tags.theme,
  ]);
}

export function intentPlanTagSet(intentPlan: GeneratorIntentPlan) {
  return new Set(intentPlanTagList(intentPlan));
}

export function cleanField(value: string | undefined) {
  return value?.trim() || "Any";
}

export function percentField(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value)) {
    return `${Math.round(fallback * 100)}%`;
  }
  return `${Math.round(clamp01Or(value, fallback) * 100)}%`;
}

export function dashboardFieldsFromPrompt(input: GeneratorPromptInput) {
  return {
    ...createEmptyGeneratorFields(),
    complexity: input.complexity?.trim() ?? "",
    era: input.era?.trim() ?? "",
    genre: input.genre?.trim() ?? "",
    creativity: input.creativity ?? 0.65,
    density: input.density ?? 0.55,
    mood: input.mood?.trim() ?? "",
    humanize: input.humanize ?? 0.35,
    lengthBars: normalizeGeneratorLengthBars(input.lengthBars),
    notes: input.notes?.trim() ?? "",
    scaleKey: normalizeGeneratorScaleMode(input.scaleKey),
    temperature: input.temperature ?? 0.7,
  };
}

export function splitIntentTagValue(value: string | undefined) {
  return (value ?? "")
    .split(/[,/|]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function splitRawIntentWords(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return [];
  }
  const chunks = trimmed
    .split(/[,/|;\n]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  const words = trimmed
    .split(/[^a-zA-Z0-9+#&]+/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 2);
  return uniqueStrings([trimmed, ...chunks, ...words]);
}

export function explicitConstraintTags(value: string | undefined) {
  const text = value?.trim() ?? "";
  return [
    /\bno\s+drums?\b|\bdrumless\b/i.test(text) ? "no-drums" : "",
    /\bno\s+808\b|\bwithout\s+808\b/i.test(text) ? "no-808" : "",
    /\buse\s+harp\b|\bharp\b/i.test(text) ? "harp" : "",
  ].filter(Boolean);
}

export function extractGeneratorAiIntentTags(rawTracker: string) {
  const tagsLine = /!TAGS:\s*([^!]*)!/i.exec(rawTracker)?.[1] ?? "";
  const themeValue = /(?:^|;)\s*THEMES?\s*=\s*([^;]+)/i.exec(tagsLine)?.[1];
  const grooveValue = /(?:^|;)\s*GROOVES?\s*=\s*([^;]+)/i.exec(tagsLine)?.[1];
  return {
    grooveTags: normalizeGeneratorIntentTags(splitIntentTagValue(grooveValue)),
    themeTags: normalizeGeneratorIntentTags(splitIntentTagValue(themeValue)),
  };
}

export function planHeaderField(planLine: string, key: string) {
  return new RegExp(`(?:^|;)\\s*${key}\\s*=\\s*([^;]+)`, "i").exec(planLine)?.[1]?.trim() ?? "";
}

export function extractGeneratorArrangementPlan(rawTracker: string) {
  const planLine = /!PLAN:\s*([^!]*)!/i.exec(rawTracker)?.[1] ?? "";
  const confidence = Number(planHeaderField(planLine, "CONFIDENCE"));
  return {
    bass: normalizeGeneratorIntentTags([planHeaderField(planLine, "BASS")])[0] ?? "",
    confidence: clamp01Or(confidence, 0),
    form: normalizeGeneratorIntentTags([planHeaderField(planLine, "FORM")])[0] ?? "",
    grid: normalizeGeneratorIntentTags([planHeaderField(planLine, "GRID")])[0] ?? "",
    motif: normalizeGeneratorIntentTags([planHeaderField(planLine, "MOTIF")])[0] ?? "",
    phraseFunction: normalizeGeneratorIntentTags([planHeaderField(planLine, "PHRASE")])[0] ?? "",
    roles: normalizeGeneratorIntentTags(splitIntentTagValue(planHeaderField(planLine, "ROLES"))),
    style: normalizeGeneratorIntentTags([planHeaderField(planLine, "STYLE")])[0] ?? "",
  };
}

export function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function objectHasSchemaFields(value: Record<string, unknown>, fields: readonly string[]) {
  return fields.every((field) => Object.hasOwn(value, field));
}

export function objectHasOnlySchemaFields(value: Record<string, unknown>, fields: readonly string[]) {
  const allowed = new Set(fields);
  return Object.keys(value).every((field) => allowed.has(field));
}

export function normalizeArrangementPlan(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const plan = asRecord(value);
  const confidence = optionalNumber(plan.confidence);
  const fields = ["bass", "confidence", "form", "grid", "motif", "phraseFunction", "roles", "style"];
  if (!objectHasSchemaFields(plan, fields) || !objectHasOnlySchemaFields(plan, fields)) {
    return undefined;
  }
  const bass = optionalString(plan.bass);
  const form = optionalString(plan.form);
  const grid = optionalString(plan.grid);
  const motif = optionalString(plan.motif);
  const phraseFunction = optionalString(plan.phraseFunction);
  const roles = stringArray(plan.roles);
  const style = optionalString(plan.style);
  if (confidence === undefined || !bass || !form || !grid || !motif || !phraseFunction || !roles || !style) {
    return undefined;
  }
  return {
    bass: normalizeGeneratorIntentTags([bass])[0] ?? bass,
    confidence: confidence === undefined ? 0 : clamp01Or(confidence, 0),
    form: normalizeGeneratorIntentTags([form])[0] ?? form,
    grid: normalizeGeneratorIntentTags([grid])[0] ?? grid,
    motif: normalizeGeneratorIntentTags([motif])[0] ?? motif,
    phraseFunction: normalizeGeneratorIntentTags([phraseFunction])[0] ?? phraseFunction,
    roles: normalizeGeneratorIntentTags(roles),
    style: normalizeGeneratorIntentTags([style])[0] ?? style,
  };
}

export function normalizeLanePlanItem(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const item = asRecord(value);
  const fields = ["bassRole", "function", "lane", "name", "role"];
  if (!objectHasSchemaFields(item, fields) || !objectHasOnlySchemaFields(item, fields)) {
    return undefined;
  }
  if (
    typeof item.bassRole !== "string"
    || typeof item.function !== "string"
    || typeof item.lane !== "string"
    || typeof item.name !== "string"
    || typeof item.role !== "string"
  ) {
    return undefined;
  }
  const role = normalizeGeneratorIntentTags([optionalString(item.role) ?? ""])[0];
  if (!role) {
    return undefined;
  }
  return {
    ...(optionalString(item.bassRole) ? { bassRole: normalizeGeneratorIntentTags([optionalString(item.bassRole)!])[0] ?? optionalString(item.bassRole)! } : {}),
    ...(optionalString(item.function) ? { function: normalizeGeneratorIntentTags([optionalString(item.function)!])[0] ?? optionalString(item.function)! } : {}),
    ...(optionalString(item.lane) ? { lane: normalizeGeneratorIntentTags([optionalString(item.lane)!])[0] ?? optionalString(item.lane)! } : {}),
    ...(optionalString(item.name) ? { name: optionalString(item.name)! } : {}),
    role,
  };
}

export function normalizeLanePlan(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.map(normalizeLanePlanItem);
  return items.every(Boolean)
    ? items.flatMap((item) => item ? [item] : [])
    : undefined;
}

export function arrangementPlanWithLaneRoles(arrangementPlan: GeneratorArrangementPlanHeader, lanePlan: readonly GeneratorLanePlanItem[] | undefined) {
  if (!lanePlan || lanePlan.length === 0) {
    return arrangementPlan;
  }
  return {
    ...arrangementPlan,
    roles: normalizeGeneratorIntentTags([
      ...arrangementPlan.roles,
      ...lanePlan.map((lane) => lane.role),
      ...lanePlan.map((lane) => lane.function ?? ""),
      ...lanePlan.map((lane) => lane.bassRole ?? ""),
    ], 48),
  };
}

export function normalizeGroovePlan(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const plan = asRecord(value);
  const fields = ["anchors", "grid", "microtiming", "rhythmCell", "swing"];
  if (!objectHasSchemaFields(plan, fields) || !objectHasOnlySchemaFields(plan, fields)) {
    return undefined;
  }
  const anchors = stringArray(plan.anchors);
  const grid = optionalString(plan.grid);
  const microtiming = optionalString(plan.microtiming);
  const rhythmCell = optionalString(plan.rhythmCell);
  if (!anchors || !grid || !microtiming || !rhythmCell || !(typeof plan.swing === "number" || typeof plan.swing === "string")) {
    return undefined;
  }
  return {
    anchors,
    grid: normalizeGeneratorIntentTags([grid])[0] ?? grid,
    microtiming,
    rhythmCell: normalizeGeneratorIntentTags([rhythmCell])[0] ?? rhythmCell,
    swing: plan.swing,
  };
}

export function normalizeChordPlanItem(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const item = asRecord(value);
  const fields = ["bar", "bassRelation", "function", "inversion", "quality", "resolutionTarget", "roman", "root", "tensionClass", "topNoteIntent", "voicingRange"];
  if (!objectHasSchemaFields(item, fields) || !objectHasOnlySchemaFields(item, fields)) {
    return undefined;
  }
  return {
    ...(optionalNumber(item.bar) !== undefined ? { bar: optionalNumber(item.bar) } : {}),
    ...(optionalString(item.bassRelation) ? { bassRelation: optionalString(item.bassRelation)! } : {}),
    ...(optionalString(item.function) ? { function: optionalString(item.function)! } : {}),
    ...(optionalString(item.inversion) ? { inversion: optionalString(item.inversion)! } : {}),
    ...(optionalString(item.quality) ? { quality: optionalString(item.quality)! } : {}),
    ...(optionalString(item.resolutionTarget) ? { resolutionTarget: optionalString(item.resolutionTarget)! } : {}),
    ...(optionalString(item.roman) ? { roman: optionalString(item.roman)! } : {}),
    ...(optionalString(item.root) ? { root: optionalString(item.root)! } : {}),
    ...(optionalString(item.tensionClass) ? { tensionClass: normalizeGeneratorIntentTags([optionalString(item.tensionClass)!])[0] ?? optionalString(item.tensionClass)! } : {}),
    ...(optionalString(item.topNoteIntent) ? { topNoteIntent: optionalString(item.topNoteIntent)! } : {}),
    ...(optionalString(item.voicingRange) ? { voicingRange: normalizeGeneratorIntentTags([optionalString(item.voicingRange)!])[0] ?? optionalString(item.voicingRange)! } : {}),
  };
}

export function normalizeChordPlan(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.map(normalizeChordPlanItem);
  return items.every(Boolean)
    ? items.flatMap((item) => item ? [item] : [])
    : undefined;
}

export function promptIntentTags(input: GeneratorPromptInput) {
  return mergeGeneratorIntentTags(buildGeneratorSelectorPromptTags(dashboardFieldsFromPrompt(input)));
}

export function planIntentTags(plan: GeneratorMusicianPlan) {
  return {
    grooveTags: normalizeGeneratorIntentTags([
      `grid-${plan.style.grooveGrid}`,
      `syncopation-${plan.groove.syncopation}`,
    ]),
    themeTags: normalizeGeneratorIntentTags([
      plan.style.harmonicDensity,
      plan.style.bassRole,
      plan.style.melodicRole,
    ]),
  };
}

export function rawIntentTagEntries(input: GeneratorPromptInput) {
  const sources = [
    { provenance: "notes" as const, tags: [...explicitConstraintTags(input.notes), ...splitRawIntentWords(input.notes)], weight: 16 },
    { provenance: "genre" as const, tags: splitRawIntentWords(input.genre), weight: 14 },
    { provenance: "complexity" as const, tags: splitRawIntentWords(input.complexity), weight: 10 },
    { provenance: "era" as const, tags: splitRawIntentWords(input.era), weight: 9 },
    { provenance: "scaleKey" as const, tags: splitRawIntentWords(input.scaleKey), weight: 7 },
    { provenance: "mood" as const, tags: splitRawIntentWords(input.mood), weight: 4 },
  ];
  return uniqueWeightedSelectorTags(sources.flatMap((source) =>
    normalizeGeneratorIntentTags(source.tags, 64).map((tag) => ({
      locked: false,
      provenance: source.provenance,
      tag,
      weight: tag.startsWith("no-") ? Math.max(18, source.weight + 4) : source.weight,
    }))));
}

export function selectorIntentTags(input: GeneratorPromptInput) {
  return normalizeGeneratorIntentTags(
    [...buildGeneratorSelectorState(dashboardFieldsFromPrompt(input), input.locks ?? {})
      .weightedTags]
      .sort((left, right) => right.weight - left.weight || left.tag.localeCompare(right.tag))
      .map((tag) => tag.tag),
    64,
  );
}

export function uniqueWeightedSelectorTags(values: readonly GeneratorWeightedSelectorTag[]) {
  const byTag = new Map<string, GeneratorWeightedSelectorTag>();
  for (const value of values) {
    const existing = byTag.get(value.tag);
    if (!existing || value.weight > existing.weight) {
      byTag.set(value.tag, value);
    }
  }
  return Array.from(byTag.values()).sort((left, right) =>
    right.weight - left.weight
      || (left.locked === right.locked ? 0 : left.locked ? -1 : 1)
      || left.provenance.localeCompare(right.provenance)
      || left.tag.localeCompare(right.tag),
  );
}

export function buildGeneratorIntentPlanFromSelection(input: GeneratorPromptInput, selectedMode: string, selectedScale: string, lengthBars: GeneratorLengthBars, plan: GeneratorMusicianPlan) {
  const promptTags = promptIntentTags(input);
  const styleTags = planIntentTags(plan);
  const rawWeighted = rawIntentTagEntries(input);
  const raw = rawWeighted.map((tag) => tag.tag);
  const selectorState = buildGeneratorSelectorState(dashboardFieldsFromPrompt(input), input.locks ?? {});
  const weighted = uniqueWeightedSelectorTags([
    ...selectorState.weightedTags,
    ...rawWeighted,
  ]);
  const selector = weighted.map((tag) => tag.tag);
  const merged = mergeGeneratorIntentTags([promptTags, styleTags]);
  const all = normalizeGeneratorIntentTags([
    ...raw,
    ...selector,
    ...merged.themeTags,
    ...merged.grooveTags,
    ...plan.style.instrumentDialect,
    ...plan.style.avoid,
    ...selectorState.avoidRules,
  ], 96);
  return {
    advanced: {
      creativity: clamp01Or(input.creativity, 0.65),
      density: clamp01Or(input.density, 0.55),
      humanize: clamp01Or(input.humanize, 0.35),
      temperature: clamp01Or(input.temperature, 0.7),
    },
    fields: {
      complexity: input.complexity?.trim() ?? "",
      era: input.era?.trim() ?? "",
      genre: input.genre?.trim() ?? "",
      mood: input.mood?.trim() ?? "",
      notes: input.notes?.trim() ?? "",
      scaleKey: input.scaleKey?.trim() ?? "",
    },
    selected: {
      lengthBars,
      mode: selectedMode,
      scale: selectedScale,
    },
    selectorState,
    style: plan.style,
    tags: {
      all,
      avoid: uniqueStrings([...plan.style.avoid, ...selectorState.avoidRules]),
      groove: merged.grooveTags,
      raw,
      selector,
      theme: merged.themeTags,
      weighted,
    },
    validation: {
      loopEndTick: lengthBars * GENERATOR_MIDI_BEATS_PER_BAR * GENERATOR_MIDI_TICKS_PER_QUARTER,
      maxChordClusterSize: plan.quality.maxChordClusterSize,
      maxMelodicLayers: plan.quality.maxMelodicLayers,
      maxNonDrumNotesPerBar: plan.quality.maxNonDrumNotesPerBar,
      minBassRoles: plan.quality.minBassRoles,
      minChordClusterSize: plan.quality.minChordClusterSize,
      minOffbeatRatio: plan.quality.minOffbeatRatio,
      minPhraseVariations: plan.quality.minPhraseVariations,
      minTracks: plan.layers.minTracks,
    },
  };
}

export function resolveGeneratorIntentTags(input: GeneratorPromptInput, plan: GeneratorMusicianPlan, rawTracker: string) {
  return mergeGeneratorIntentTags([
    promptIntentTags(input),
    planIntentTags(plan),
    extractGeneratorAiIntentTags(rawTracker),
  ]);
}

export function intentTagText(intentTags: GeneratorIntentTags) {
  return [...intentTags.themeTags, ...intentTags.grooveTags].join(" ");
}

export function trackSourceText(input: GeneratorPromptInput, plan: GeneratorMusicianPlan, intentTags: GeneratorIntentTags) {
  return `${input.genre ?? ""} ${input.mood ?? ""} ${input.era ?? ""} ${input.complexity ?? ""} ${input.notes ?? ""} ${plan.style.styleLabel} ${plan.style.instrumentDialect.join(" ")} ${intentTagText(intentTags)}`.toLowerCase();
}

export function intentTagLogLine(intentTags: GeneratorIntentTags) {
  const themes = intentTags.themeTags.length > 0 ? intentTags.themeTags.join(", ") : "none";
  const grooves = intentTags.grooveTags.length > 0 ? intentTags.grooveTags.join(", ") : "none";
  return `intent tags theme ${themes}; groove ${grooves}`;
}

export function intentTagMetadataLine(intentTags: GeneratorIntentTags) {
  return `!TAGS:THEME=${intentTags.themeTags.join(",")};GROOVE=${intentTags.grooveTags.join(",")}!`;
}

export function schemaMetadataLine() {
  return `!SCHEMA:${GENERATOR_MODEL_SCHEMA_VERSION};GRAMMAR=${GENERATOR_TRACKER_GRAMMAR_VERSION}!`;
}

export function arrangementPlanMetadataLine(plan: GeneratorMusicianPlan) {
  const roles = normalizeGeneratorIntentTags(plan.layers.required).join(",");
  return [
    "!PLAN:",
    `STYLE=${normalizeGeneratorIntentTags([plan.style.styleLabel])[0] ?? "general"}`,
    `;GRID=${plan.style.grooveGrid}`,
    `;BASS=${plan.style.bassRole}`,
    `;FORM=${plan.form.arc}`,
    `;PHRASE=${normalizeGeneratorIntentTags([plan.form.sections[0] ?? plan.form.arc])[0] ?? "starter"}`,
    `;MOTIF=${plan.style.melodicRole}`,
    `;ROLES=${roles}`,
    ";CONFIDENCE=0.74!",
  ].join("");
}

export function explicitOutsideScaleRequested(input: GeneratorPromptInput, intentTags: GeneratorIntentTags) {
  const source = `${input.notes ?? ""} ${intentTagText(intentTags)}`.toLowerCase();
  return /\b(outside|chromatic|altered|atonal|whole[-\s]?tone|tritone|borrowed|secondary dominant|diminished passing)\b/i.test(source);
}

export function blueNotesRequested(input: GeneratorPromptInput, intentTags: GeneratorIntentTags) {
  const source = `${input.genre ?? ""} ${input.notes ?? ""} ${intentTagText(intentTags)}`.toLowerCase();
  return /\bblue[-\s]?notes?\b|\bblues\b/.test(source);
}

export function normalizeHarmonicToleranceMode(value: unknown) {
  return harmonicToleranceModes.find((mode) => mode === value) ?? "strict";
}

export function normalizeHarmonicTolerancePolicy(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const policy = asRecord(value);
  const fields = ["absoluteWrong", "allowedTensions", "avantAllowed", "fixingFactor", "mode", "source"];
  if (!objectHasSchemaFields(policy, fields) || !objectHasOnlySchemaFields(policy, fields)) {
    return undefined;
  }
  const absoluteWrong = stringArray(policy.absoluteWrong);
  const allowedTensions = stringArray(policy.allowedTensions);
  const avantAllowed = stringArray(policy.avantAllowed);
  const fixingFactor = optionalNumber(policy.fixingFactor);
  const source = optionalString(policy.source);
  if (!absoluteWrong || !allowedTensions || !avantAllowed || fixingFactor === undefined || !source) {
    return undefined;
  }
  return {
    absoluteWrong,
    allowedTensions,
    avantAllowed,
    fixingFactor: clamp01Or(fixingFactor, 0.5),
    mode: normalizeHarmonicToleranceMode(policy.mode),
    source,
  };
}

export function derivedHarmonicTolerancePolicy(input: GeneratorPromptInput, intentTags: GeneratorIntentTags, plan: GeneratorMusicianPlan, modelPolicy?: GeneratorHarmonicTolerancePolicy) {
  const creativity = clamp01Or(input.creativity, 0.65);
  const temperature = clamp01Or(input.temperature, 0.7);
  const risk = clamp01Or(creativity * 0.65 + temperature * 0.35, 0);
  const fixingFactor = clamp01Or(1 - risk, 0);
  const source = trackSourceText(input, plan, intentTags);
  const explicitOutside = explicitOutsideScaleRequested(input, intentTags);
  const blue = blueNotesRequested(input, intentTags);
  const highTensionStyle = plan.harmony.chordLanguage === "altered"
    || plan.harmony.changesPerFourBars >= 8
    || /gospel|jazz|soul|blues|drill|trap|chromatic|altered|diminished|secondary-dominant|borrowed/.test(source);
  const localMode: GeneratorHarmonicToleranceMode = explicitOutside && risk > 0.82
    ? "avant"
    : explicitOutside || highTensionStyle || risk > 0.78
      ? "tension"
      : blue
        ? "color"
        : "strict";
  const mode = modelPolicy && chordLanguageRanks[modelPolicy.mode === "avant" ? "altered" : modelPolicy.mode === "tension" ? "extended" : modelPolicy.mode === "color" ? "sevenths" : "triads"] >= chordLanguageRanks[localMode === "avant" ? "altered" : localMode === "tension" ? "extended" : localMode === "color" ? "sevenths" : "triads"]
    ? modelPolicy.mode
    : localMode;
  return {
    absoluteWrong: [
      "unresolved-final-melody-outside-scale",
      "strong-beat-bass-outside-scale",
      "dense-drill-reharm-over-808",
      ...(modelPolicy?.absoluteWrong ?? []),
    ],
    allowedTensions: [
      ...(blue ? ["blue-note"] : []),
      ...(mode === "tension" || mode === "avant" ? ["chromatic-approach", "borrowed-chord", "secondary-dominant", "diminished-passing", "drill-semitone-lift"] : []),
      ...(modelPolicy?.allowedTensions ?? []),
    ],
    avantAllowed: [
      ...(mode === "avant" ? ["atonal-color", "chromatic-planing"] : []),
      ...(modelPolicy?.avantAllowed ?? []),
    ],
    fixingFactor,
    mode,
    source: modelPolicy ? "model+local" : "local",
  };
}

export function explicitNoDrumsRequested(input: GeneratorPromptInput) {
  return /\bno\s+drums?\b|\bdrumless\b/i.test(input.notes ?? "");
}

export function explicitNo808Requested(input: GeneratorPromptInput) {
  return /\bno\s+808\b|\bwithout\s+808\b/i.test(input.notes ?? "");
}
