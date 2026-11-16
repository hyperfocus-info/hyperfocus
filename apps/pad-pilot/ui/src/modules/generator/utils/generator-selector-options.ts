import { asRecord } from "@hyperfocus/utilities/records";
import { GeneratorFieldKey, GeneratorLockKey, GeneratorFieldLocks, GENERATOR_FIELD_KEYS, GENERATOR_LENGTH_OPTIONS, DEFAULT_GENERATOR_ADVANCED_SETTINGS, DEFAULT_GENERATOR_AI_SETTINGS, GENERATOR_OPTION_GROUPS, GeneratorSelectorPromptStrength, GeneratorSelectorPromptTag, GeneratorIntentTags } from "./generator-option-catalog";
import { clamp01Or } from "../../../utils/math";

export const GENERATOR_INTENT_TAG_LIMIT = 32;

export const selectorFieldStrength: Record<GeneratorFieldKey | "notes", number> = {
  complexity: 0.8,
  era: 0.62,
  genre: 0.86,
  mood: 0.54,
  notes: 0.72,
  scaleKey: 0.48,
} as const;

export const selectorFallbackTags: Record<GeneratorFieldKey | "notes", ReadonlyArray<string>> = {
  complexity: ["arrangement grammar", "lane density", "phrase behavior", "performance articulation"],
  era: ["production period", "instrument palette", "tempo culture", "mix dialect"],
  genre: ["primary style lane", "tempo bias", "drum dialect", "instrument family"],
  mood: ["emotional color", "velocity curve", "register color", "space budget"],
  notes: ["user detail", "reference language", "specific instruction", "priority override"],
  scaleKey: ["pitch policy", "melodic color", "chord extension ceiling", "mode approximation caveat"],
} as const;

export const selectorTagRules: ReadonlyArray<{ match: RegExp; tags: ReadonlyArray<string> }> = [
  { match: /melodic|topline|earworm|hook|chorus|motif/i, tags: ["singable motif", "repeated contour", "phrase answer", "small novelty leap", "memorable hook cell"] },
  { match: /afro house/i, tags: ["afro-house percussion braid", "three-three-two club pulse", "call-response synth hook", "minimal bass handoff", "warm modal vamp"] },
  { match: /afro tech/i, tags: ["afro-tech straight drive", "metallic percussion braid", "pedal bass tension", "minimal chord flashes", "warehouse pressure arc"] },
  { match: /organic house/i, tags: ["organic percussion drift", "live bass movement", "broken warm chords", "wide pad bed", "humanized melodic fragments"] },
  { match: /\bdeep house\b/i, tags: ["swung house pocket", "warm seventh voicings", "subtle bass walk", "soft offbeat stabs", "late-night chord loop"] },
  { match: /\b(?:techno|dub techno|hard techno|minimal tech|ambient techno)\b/i, tags: ["machine straight grid", "pedal bass discipline", "minimal chord motion", "locked drum repetition", "hypnotic filter arc"] },
  { match: /\bhouse\b/i, tags: ["classic four-on-floor", "offbeat bass pump", "piano or organ stabs", "sidechain-ready chord space", "eight-bar club phrase"] },
  { match: /\b(?:house|techno|warehouse)\b|four.?on|sidechain/i, tags: ["four-on-floor pulse", "offbeat bass", "chord stabs", "sidechain-ready space", "club loop discipline"] },
  { match: /boom.?bap|golden era|sample.?based/i, tags: ["breakbeat backbeat", "sample-chop swing", "dusty bass loop", "jazz shell voicings", "turntable fill space"] },
  { match: /modern trap|trap|drill|phonk|memphis|\brage\b|pluggnb|cloud/i, tags: ["808 slide lead", "half-time hat grid", "sub-led hook tension", "sparse two-chord loop", "phrase-end 808 fill"] },
  { match: /808|trap|drill|phonk|memphis|\brage\b|pluggnb|cloud|sub[-\s]?bass|\bsub\b/i, tags: ["808 slides", "sub-led tension", "half-time pocket", "sparse harmony", "phrase-end bass fills"] },
  { match: /jungle|drum.?and.?bass|dnb|break|amen|neuro|footwork|juke/i, tags: ["break edits", "double-time grid", "syncopated kick/snare answers", "reese/sub movement", "short riff cells"] },
  { match: /ukg|uk garage|\btwo[-\s]?step\b|2[-\s]?step/i, tags: ["two-step kick gaps", "swing garage hats", "syncopated sub answers", "organ stab chops", "pirate-radio bass bounce"] },
  { match: /future garage/i, tags: ["hazy two-step grid", "reese sub undertow", "skipping snare ghosts", "minor broken chords", "wide pad fragments"] },
  { match: /two[-\s]?step|2[-\s]?step|ukg|uk garage|future garage/i, tags: ["two-step skip", "broken garage grid", "syncopated kick snare skips", "sub bass answers", "swinging shuffle hats"] },
  { match: /gospel|soul|r&b|jazz|quiet storm|blue note|motown|stax/i, tags: ["guide tones", "rootless voicings", "passing diminished chords", "call-response fills", "warm humanized velocity"] },
  { match: /amapiano|log drum|durban/i, tags: ["log drum pocket", "shaker percussion interlock", "three three two bass answers", "minimal chord vamp", "call-response stabs"] },
  { match: /reggaeton|dembow|moombahton/i, tags: ["dembow kick-snare cell", "reggaeton bass pulse", "offbeat chord skank", "short vocal answer hook", "dry percussion fill"] },
  { match: /dancehall/i, tags: ["dancehall bass answer", "one-drop skank space", "sound-system chord stab", "syncopated snare reply", "loose vocal-call pocket"] },
  { match: /baile|funk carioca|tamborzao|tamborz[aã]o|rio/i, tags: ["tamborzao percussion", "baile chant hits", "syncopated kick grid", "one-shot accents", "sub answer fills"] },
  { match: /bossa|salsa|samba|cumbia|clave/i, tags: ["son clave accents", "bossa samba comping", "nylon montuno color", "clave-aware attacks", "humanized percussion"] },
  { match: /latin|afrobeat|afro house|afro tech|afro|organic house/i, tags: ["interlocking percussion", "3+3+2 accents", "call-response hook", "earthy syncopation", "live percussion layers"] },
  { match: /cinematic|orchestral|trailer|score|drone|ambient|post rock/i, tags: ["wide voicings", "pedal tones", "section arc", "impact one-shots", "slow register motion"] },
  { match: /synth|retro|vapor|city pop|italo|eurodance|trance|electro/i, tags: ["arpeggiated pulse", "analog pad color", "bright lift", "clean motif loop", "filter-ready MIDI"] },
  { match: /idm|glitch|hyper|industrial|deconstructed|stutter|broken|odd|polyrhythm/i, tags: ["controlled rule-breaking", "event modulation", "irregular fills", "textural surprise", "motif recurrence"] },
  { match: /minimal|sparse|space|draft|hollow|weightless/i, tags: ["negative space", "few strong lanes", "low support density", "pedal motion", "quiet turnaround detail"] },
  { match: /dense|maximal|polyphonic|counter|harmony|three voice|walking/i, tags: ["independent support motion", "voice leading", "denser chord clusters", "counterline lane", "controlled note budget"] },
  { match: /one.?shot|accent|hit|impact|fill|turnaround|crash|drop/i, tags: ["manual one-shot emphasis", "phrase-boundary fill", "bar-end answer", "velocity accent", "transition marker"] },
  { match: /swing|shuffle|loose|human|live|swung/i, tags: ["swing grid", "lane-specific push/pull", "ghost notes", "laid-back pocket", "humanized velocity"] },
  { match: /locked|quantized|tight|straight|club/i, tags: ["tight grid", "clear pulse", "downbeat anchors", "repeatable groove", "low timing drift"] },
  { match: /major|ionian|lydian|optimistic|sunlit|radiant|uplifting/i, tags: ["bright mode", "major-safe chord tones", "lifted top line", "open voicing", "resolved cadence"] },
  { match: /minor|aeolian|phrygian|dark|grim|menacing|shadow|brooding/i, tags: ["minor color", "dark modal gravity", "low-register tension", "narrow voicing option", "heavier cadence"] },
  { match: /blues|pentatonic|folk|pastoral|earthy|garage rock|shoegaze|math rock/i, tags: ["pentatonic safety", "riff identity", "guitar-friendly motion", "call-and-answer", "organic velocity"] },
  { match: /chromatic|altered|whole tone|enigmatic|messiaen|tritone|diminished/i, tags: ["altered color", "chromatic approach", "strict resolution target", "high creativity lane", "avoid random spray"] },
];

export const intentTagAliases: Record<string, string> = {
  "3-3-2": "three-three-two",
  "3+3+2": "three-three-two",
  "808 slides": "808-slide-pocket",
  "808": "808-slide-pocket",
  "back beat": "backbeat",
  "boombap": "boom-bap",
  "boom bap": "boom-bap",
  "four on floor": "four-on-floor",
  "four to floor": "four-on-floor",
  "half time": "half-time",
  "jazz chords": "jazzy-chords",
  "jazzy chords": "jazzy-chords",
  "off beat": "offbeat",
  "r and b": "rnb",
  "r&b": "rnb",
  "syncopation": "syncopated",
} as const;

export const intentTagRules: ReadonlyArray<{ grooveTags?: readonly string[]; match: RegExp; themeTags?: readonly string[] }> = [
  { match: /boom.?bap|golden era|sample.?based/i, grooveTags: ["boom-bap", "backbeat", "swing-pocket"], themeTags: ["sample-based", "dusty-chops"] },
  { match: /hip.?hop/i, grooveTags: ["backbeat", "swing-pocket"], themeTags: ["sample-based"] },
  { match: /soul|r&b|rnb|neo.?soul|motown|stax|quiet storm/i, grooveTags: ["laid-back-pocket"], themeTags: ["soulful", "warm-chords"] },
  { match: /jazz|blue note|bebop|modal|lofi/i, grooveTags: ["swing-pocket"], themeTags: ["jazzy-chords", "extended-harmony"] },
  { match: /industrial|noise|metallic|mechanical|distort/i, grooveTags: ["broken-grid", "syncopated"], themeTags: ["industrial", "metallic"] },
  { match: /\bdeep house\b/i, grooveTags: ["four-on-floor", "swing-pocket", "offbeat-pump"], themeTags: ["deep-house", "warm-chords"] },
  { match: /\b(?:techno|dub techno|hard techno|minimal tech|ambient techno)\b/i, grooveTags: ["four-on-floor", "tight-grid", "pedal-bass"], themeTags: ["techno", "minimal-chord-motion"] },
  { match: /\bhouse\b/i, grooveTags: ["four-on-floor", "offbeat-pump"], themeTags: ["house", "club"] },
  { match: /\b(?:house|techno|warehouse)\b|four.?on|sidechain/i, grooveTags: ["four-on-floor", "offbeat-pump"], themeTags: ["club"] },
  { match: /modern trap|trap|drill|phonk|memphis|\brage\b|808|sub[-\s]?bass|\bsub\b/i, grooveTags: ["half-time", "808-slide-pocket"], themeTags: ["dark", "sparse-harmony"] },
  { match: /jungle|drum.?and.?bass|dnb|break|amen|neuro|footwork|juke/i, grooveTags: ["double-time-breaks", "breakbeat"], themeTags: ["kinetic"] },
  { match: /ukg|uk garage|\btwo[-\s]?step\b|2[-\s]?step/i, grooveTags: ["two-step", "broken-garage", "garage-swing", "sub-answer"], themeTags: ["garage", "pirate-radio"] },
  { match: /future garage/i, grooveTags: ["two-step", "broken-garage", "reese-undertow", "ghost-snares"], themeTags: ["future-garage", "wide-space"] },
  { match: /two[-\s]?step|2[-\s]?step|ukg|uk garage|future garage/i, grooveTags: ["two-step", "broken-garage", "syncopated-skip"], themeTags: ["garage"] },
  { match: /swing|shuffle|swung/i, grooveTags: ["swing", "laid-back-pocket"] },
  { match: /syncopated|syncopation|offbeat|push.?pull/i, grooveTags: ["syncopated", "offbeat"] },
  { match: /amapiano|log drum|durban/i, grooveTags: ["log-drum", "three-three-two", "shaker-interlock"], themeTags: ["amapiano", "minimal-chord-vamp"] },
  { match: /reggaeton|dembow|moombahton/i, grooveTags: ["dembow", "reggaeton-bass-pulse", "offbeat-skank"], themeTags: ["reggaeton", "vocal-hook"] },
  { match: /dancehall/i, grooveTags: ["dancehall-bass-answer", "one-drop-skank", "syncopated"], themeTags: ["dancehall", "sound-system"] },
  { match: /baile|funk carioca|tamborzao|tamborz[aã]o|rio/i, grooveTags: ["tamborzao", "syncopated"], themeTags: ["baile-funk", "percussion-forward"] },
  { match: /bossa|salsa|samba|cumbia|clave/i, grooveTags: ["son-clave", "clave", "bossa-samba"], themeTags: ["latin-acoustic"] },
  { match: /afro house/i, grooveTags: ["three-three-two", "interlocking-percussion", "minimal-bass"], themeTags: ["afro-house", "warm-vamp"] },
  { match: /afro tech/i, grooveTags: ["three-three-two", "tight-grid", "pedal-bass"], themeTags: ["afro-tech", "warehouse"] },
  { match: /organic house/i, grooveTags: ["three-three-two", "live-pocket"], themeTags: ["organic-house", "warm-chords"] },
  { match: /latin|afrobeat|afro house|afro tech|afro|organic house/i, grooveTags: ["three-three-two", "interlocking-percussion"], themeTags: ["earthy"] },
  { match: /idm|glitch|deconstructed|stutter|odd|polyrhythm/i, grooveTags: ["broken-grid", "irregular-fills"], themeTags: ["experimental"] },
  { match: /straight|tight|locked|quantized/i, grooveTags: ["straight", "tight-grid"] },
  { match: /live|human|loose|organic/i, grooveTags: ["live-pocket"], themeTags: ["organic"] },
  { match: /dark|grim|menacing|shadow|brooding|minor/i, themeTags: ["dark"] },
  { match: /euphoric|uplifting|radiant|sunlit|bright|major/i, themeTags: ["euphoric", "bright"] },
  { match: /cinematic|orchestral|trailer|score|ambient|drone/i, grooveTags: ["slow-arc"], themeTags: ["cinematic", "wide-space"] },
  { match: /melodic|topline|earworm|hook|chorus|motif/i, themeTags: ["melodic", "hook-forward"] },
  { match: /minimal|sparse|space|hollow|weightless/i, grooveTags: ["minimal-pocket"], themeTags: ["minimal"] },
  { match: /folk|acoustic|americana|pastoral|earthy/i, grooveTags: ["strummed-pocket"], themeTags: ["organic", "earthy"] },
  { match: /synth|retro|vapor|cyber|trance|electro/i, grooveTags: ["sequenced-pulse"], themeTags: ["synthetic", "neon"] },
];

export const selectorSignalRules: ReadonlyArray<{ delta: number; match: RegExp }> = [
  { delta: -0.38, match: /\bhint\b|\btouch\b|\bslight\b|\bsubtle\b|\bsprinkle\b|\bbackground\b|\bunderstated\b/i },
  { delta: -0.16, match: /\bsupport\b|\bsupporting\b|\bbehind\b|\bunder\b|\blow[-\s]?key\b/i },
  { delta: 0.18, match: /\bfast\b|\bhard\b|\bbold\b|\bfront\b|\bforward\b|\bmain\b|\bprimary\b|\blead\b/i },
  { delta: 0.3, match: /\bstrong\b|\bfront[-\s]?facing\b|\bcrazy\b|\bhuge\b|\bdominant\b|\baggressive\b|\bslam\b|\bwild\b/i },
];

export const selectorFieldLabels: Record<GeneratorFieldKey | "notes", string> = {
  complexity: "Complexity",
  era: "Era",
  genre: "Genre",
  mood: "Mood/Vibe",
  notes: "User Detail",
  scaleKey: "Scale/Mode",
} as const;

export function uniquePromptTags(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function normalizeGeneratorIntentTag(value: string) {
  const cleaned = value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b3\s*\+\s*3\s*\+\s*2\b/g, "3+3+2")
    .replace(/[^a-z0-9#+\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const aliased = intentTagAliases[cleaned] ?? cleaned;
  return aliased
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function normalizeGeneratorIntentTags(values: readonly string[], limit = GENERATOR_INTENT_TAG_LIMIT) {
  return Array.from(new Set(values.map(normalizeGeneratorIntentTag).filter(Boolean))).slice(0, limit);
}

export function intentTagsForText(value: string) {
  return {
    grooveTags: normalizeGeneratorIntentTags(intentTagRules.flatMap((rule) => rule.match.test(value) ? rule.grooveTags ?? [] : [])),
    themeTags: normalizeGeneratorIntentTags(intentTagRules.flatMap((rule) => rule.match.test(value) ? rule.themeTags ?? [] : [])),
  };
}

export function mergeGeneratorIntentTags(values: readonly GeneratorIntentTags[]) {
  return {
    grooveTags: normalizeGeneratorIntentTags(values.flatMap((value) => value.grooveTags)),
    themeTags: normalizeGeneratorIntentTags(values.flatMap((value) => value.themeTags)),
  };
}

export function labelWordTags(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9#+\s-]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2)
    .slice(0, 5);
}

export function selectorTagsForText(key: GeneratorFieldKey | "notes", value: string) {
  const ruleTags = selectorTagRules.flatMap((rule) => rule.match.test(value) ? rule.tags : []);
  return uniquePromptTags([
    value,
    ...labelWordTags(value),
    ...ruleTags,
    ...selectorFallbackTags[key],
  ]).slice(0, 16);
}

export function selectorSignalScore(key: GeneratorFieldKey | "notes", value: string) {
  let score = selectorFieldStrength[key];
  for (const rule of selectorSignalRules) {
    if (rule.match.test(value)) {
      score += rule.delta;
    }
  }
  if (/[A-Z]{4,}/.test(value)) {
    score += 0.12;
  }
  return clamp01Or(score, selectorFieldStrength[key]);
}

export function selectorTagWeight(key: GeneratorFieldKey | "notes", strength: GeneratorSelectorPromptStrength, locked: boolean) {
  const strengthWeight = strength === "front-facing" ? 10 : strength === "strong" ? 8 : strength === "supporting" ? 4 : 2;
  const keyWeight = key === "notes" ? 4 : key === "genre" ? 3 : key === "complexity" ? 2 : 1;
  return strengthWeight + keyWeight + (locked ? 4 : 0);
}

export function selectorStrengthFromScore(score: number) {
  if (score >= 0.92) return "front-facing";
  if (score >= 0.72) return "strong";
  if (score >= 0.42) return "supporting";
  return "hint";
}

export function selectorInstruction(strength: GeneratorSelectorPromptStrength) {
  if (strength === "front-facing") return "make this audible and central; build groove, lanes, and instrumentation around it";
  if (strength === "strong") return "honor this strongly while staying compatible with higher-priority selectors";
  if (strength === "hint") return "treat this as background color; never override stronger selector lanes";
  return "use this as support detail below genre and explicit user-detail signals";
}

export function selectorValueForPrompt(key: GeneratorFieldKey, input: Partial<Record<GeneratorFieldKey, string>>) {
  const value = input[key]?.trim() ?? "";
  return key === "scaleKey" ? normalizeGeneratorScaleMode(value) : value;
}

export function selectorOptionRecognized(key: GeneratorFieldKey, value: string) {
  return GENERATOR_OPTION_GROUPS[key].some((item) => item.label.toLowerCase() === value.toLowerCase());
}

export function buildGeneratorSelectorPromptTags(input: Partial<Record<GeneratorFieldKey, string>> & { notes?: string }) {
  const tags: GeneratorSelectorPromptTag[] = [];
  for (const key of GENERATOR_FIELD_KEYS) {
    const label = selectorValueForPrompt(key, input);
    if (!label) {
      continue;
    }
    const ruleRecognized = selectorTagRules.some((rule) => rule.match.test(label));
    const intentTags = intentTagsForText(label);
    tags.push({
      grooveTags: intentTags.grooveTags,
      key,
      label,
      recognized: selectorOptionRecognized(key, label) || ruleRecognized,
      strength: selectorStrengthFromScore(selectorSignalScore(key, label)),
      tags: selectorTagsForText(key, label),
      themeTags: intentTags.themeTags,
    });
  }
  const notes = input.notes?.trim() ?? "";
  if (notes) {
    const intentTags = intentTagsForText(notes);
    tags.push({
      grooveTags: intentTags.grooveTags,
      key: "notes",
      label: notes,
      recognized: selectorTagRules.some((rule) => rule.match.test(notes)),
      strength: selectorStrengthFromScore(selectorSignalScore("notes", notes)),
      tags: selectorTagsForText("notes", notes),
      themeTags: intentTags.themeTags,
    });
  }
  return tags;
}

export function buildGeneratorSelectorState(input: Partial<Record<GeneratorFieldKey, string>> & { notes?: string }, locks: GeneratorFieldLocks = {}) {
  const promptTags = buildGeneratorSelectorPromptTags(input);
  const weightedTags = promptTags.flatMap((promptTag) => {
    const locked = promptTag.key === "notes" ? false : locks[promptTag.key] ?? false;
    const weight = selectorTagWeight(promptTag.key, promptTag.strength, locked);
    return normalizeGeneratorIntentTags([
      promptTag.label,
      ...promptTag.tags,
      ...promptTag.themeTags,
      ...promptTag.grooveTags,
    ]).map((tag) => ({
      locked,
      provenance: promptTag.key,
      tag,
      weight,
    }));
  });
  const fields: Partial<Record<GeneratorFieldKey | "notes", string>> = Object.fromEntries(
    promptTags.map((tag) => [tag.key, tag.label]),
  );
  const avoidRules = uniquePromptTags(promptTags.flatMap((promptTag) => {
    const source = `${promptTag.label} ${promptTag.tags.join(" ")}`;
    const rules = [
      /minimal|sparse|ambient|negative space/i.test(source) ? "avoid filling sparse space with extra bass or drum lanes" : "",
      /drill|trap|808|half.?time/i.test(source) ? "avoid busy chord comping over 808 phrase logic" : "",
      /amapiano|log drum/i.test(source) ? "avoid replacing log-drum pocket with jungle breaks or generic afro percussion" : "",
      /reggaeton|dancehall|dembow/i.test(source) ? "avoid collapsing dembow into generic latin clave" : "",
      /baile/i.test(source) ? "avoid smoothing baile tamborzao percussion into acoustic world drums" : "",
      /bossa|salsa|samba|cumbia|clave/i.test(source) ? "avoid straight club hats without clave-aware accents" : "",
      /chromatic|altered|diminished|tritone/i.test(source) ? "avoid random chromatic spray without resolution targets" : "",
      /no drums?|drumless/i.test(source) ? "avoid adding drums unless explicitly overridden later" : "",
      /no 808|without 808/i.test(source) ? "avoid 808 bass lanes unless explicitly overridden later" : "",
    ];
    return rules.filter(Boolean);
  }));
  return {
    avoidRules,
    fields,
    locks,
    weightedTags,
  };
}

export function buildGeneratorIntentPromptLines(input: Partial<Record<GeneratorFieldKey, string>> & { notes?: string }) {
  const intentTags = mergeGeneratorIntentTags(buildGeneratorSelectorPromptTags(input));
  const themes = intentTags.themeTags.length > 0 ? intentTags.themeTags.join(", ") : "none";
  const grooves = intentTags.grooveTags.length > 0 ? intentTags.grooveTags.join(", ") : "none";
  return [
    "Intent Tags:",
    `- Themes normalized: ${themes}.`,
    `- Grooves normalized: ${grooves}.`,
    "- After BPM, output one metadata line exactly like !TAGS:THEME=soulful,jazzy-chords;GROOVE=boom-bap,syncopated! using lowercase kebab-case theme and groove tags; infer missing tags from typed values when needed.",
  ];
}

export function buildGeneratorSelectorPromptLines(input: Partial<Record<GeneratorFieldKey, string>> & { notes?: string }) {
  const tags = buildGeneratorSelectorPromptTags(input);
  if (tags.length === 0) {
    return ["Selector Tags: none."];
  }
  return [
    "Selector Tags:",
    ...tags.map((tag) => {
      const unresolved = tag.recognized ? "" : " Unrecognized typed value: infer closest style tags in this AI turn before composing if deterministic tags are insufficient.";
      return `- ${tag.strength.toUpperCase()} ${selectorFieldLabels[tag.key]} "${tag.label}": ${selectorInstruction(tag.strength)}; keywords ${tag.tags.join(", ")}.${unresolved}`;
    }),
  ];
}

export function normalizeGeneratorScaleMode(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  const legacyMode = /^[A-G](?:#|b)?\s+(.+)$/i.exec(trimmed)?.[1]?.trim() ?? trimmed;
  const option = GENERATOR_OPTION_GROUPS.scaleKey.find((item) => item.label.toLowerCase() === legacyMode.toLowerCase());
  return option?.label ?? legacyMode;
}

export function normalizeGeneratorLengthBars(value: number | undefined) {
  const rounded = Math.round(value ?? DEFAULT_GENERATOR_ADVANCED_SETTINGS.lengthBars);
  return GENERATOR_LENGTH_OPTIONS.find((option) => option.value === rounded)?.value ?? DEFAULT_GENERATOR_ADVANCED_SETTINGS.lengthBars;
}

export function createEmptyGeneratorFields() {
  return {
    ...DEFAULT_GENERATOR_ADVANCED_SETTINGS,
    complexity: "" as const,
    era: "" as const,
    genre: "" as const,
    mood: "" as const,
    notes: "" as const,
    scaleKey: "" as const,
  };
}

export function createUnlockedGeneratorFields() {
  const locks: Record<GeneratorLockKey, boolean> = {
    complexity: false,
    creativity: false,
    density: false,
    era: false,
    genre: false,
    humanize: false,
    lengthBars: false,
    mood: false,
    scaleKey: false,
    temperature: false,
  };
  return locks;
}

export function normalizeGeneratorAiSettings(input?: unknown) {
  const candidate = asRecord(input);
  return {
    model: (typeof candidate.model === "string" ? candidate.model.trim() : "") || DEFAULT_GENERATOR_AI_SETTINGS.model,
    provider: candidate.provider === "cursor" ? "cursor" : DEFAULT_GENERATOR_AI_SETTINGS.provider,
  };
}

export function percent(value: number) {
  return `${value.toFixed(1)}%`;
}

export function percentValue(value: number) {
  return `${Math.round(value * 100)}%`;
}
