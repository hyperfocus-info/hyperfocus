import { buildMagicSuggestion, normalizeGeneratorLengthBars, normalizeGeneratorScaleMode } from "./generator-options";
import { type DnaBassRole, dnaBassRoleValues, type DnaDensityBudget, dnaDensityBudgetValues, type DnaFormArc, dnaFormArcValues, type DnaGrooveGrid, dnaGrooveGridValues, type DnaHarmonicDensity, dnaHarmonicDensityValues, type DnaHarmonicRhythm, dnaHarmonicRhythmValues, type DnaMelodicRole, dnaMelodicRoleValues, type DnaSyncopation, dnaSyncopationValues, type DnaVoicingWidth, dnaVoicingWidthValues, type GeneratorMusicianPlan, type GeneratorPromptInput, type GeneratorStyleDna } from "./generator-contracts";
import { scaleRootName } from "./generator-selection";
import { chordLanguageRanks, cleanField, dashboardFieldsFromPrompt, explicitNo808Requested, explicitNoDrumsRequested, promptIntentTags, selectorIntentTags, tagSetHas, uniqueStrings } from "./generator-intent";
import { clamp01Or } from "../../../utils/math";

export type DnaScores = {
  bassRole: Record<DnaBassRole, number>;
  densityBudget: Record<DnaDensityBudget, number>;
  formArc: Record<DnaFormArc, number>;
  grooveGrid: Record<DnaGrooveGrid, number>;
  harmonicDensity: Record<DnaHarmonicDensity, number>;
  harmonicRhythm: Record<DnaHarmonicRhythm, number>;
  melodicRole: Record<DnaMelodicRole, number>;
  syncopation: Record<DnaSyncopation, number>;
  voicingWidth: Record<DnaVoicingWidth, number>;
};

export type DnaScorePatch = {
  bassRole?: Partial<Record<DnaBassRole, number>>;
  densityBudget?: Partial<Record<DnaDensityBudget, number>>;
  formArc?: Partial<Record<DnaFormArc, number>>;
  grooveGrid?: Partial<Record<DnaGrooveGrid, number>>;
  harmonicDensity?: Partial<Record<DnaHarmonicDensity, number>>;
  harmonicRhythm?: Partial<Record<DnaHarmonicRhythm, number>>;
  melodicRole?: Partial<Record<DnaMelodicRole, number>>;
  syncopation?: Partial<Record<DnaSyncopation, number>>;
  voicingWidth?: Partial<Record<DnaVoicingWidth, number>>;
};

export type DnaKeywordRule = {
  avoid?: readonly string[];
  dialect?: readonly string[];
  label: string;
  match: RegExp;
  scales?: Record<string, number>;
  scores: DnaScorePatch;
};

export function dnaRecord<T extends string>(values: readonly T[], fallback: T) {
  return values.reduce((record, value) => {
    record[value] = value === fallback ? 1 : 0;
    return record;
  }, {} as Record<T, number>);
}

export function createDnaScores() {
  return {
    bassRole: dnaRecord(dnaBassRoleValues, "root"),
    densityBudget: dnaRecord(dnaDensityBudgetValues, "balanced"),
    formArc: dnaRecord(dnaFormArcValues, "starter-turnaround"),
    grooveGrid: dnaRecord(dnaGrooveGridValues, "straight"),
    harmonicDensity: dnaRecord(dnaHarmonicDensityValues, "simple"),
    harmonicRhythm: dnaRecord(dnaHarmonicRhythmValues, "loop"),
    melodicRole: dnaRecord(dnaMelodicRoleValues, "hook"),
    syncopation: dnaRecord(dnaSyncopationValues, "medium"),
    voicingWidth: dnaRecord(dnaVoicingWidthValues, "medium"),
  } satisfies DnaScores;
}

export function addScore<T extends string>(bucket: Record<T, number>, patch: Partial<Record<T, number>> | undefined) {
  if (!patch) {
    return;
  }
  for (const [key, value] of Object.entries(patch) as Array<[T, number]>) {
    bucket[key] = (bucket[key] ?? 0) + value;
  }
}

export function bestScore<T extends string>(bucket: Record<T, number>, fallback: T) {
  return (Object.keys(bucket) as T[]).reduce((best, value) => bucket[value] > bucket[best] ? value : best, fallback);
}

export function addScaleScores(scaleScores: Record<string, number>, patch: Record<string, number> | undefined) {
  if (!patch) {
    return;
  }
  for (const [scale, value] of Object.entries(patch)) {
    const normalized = normalizeGeneratorScaleMode(scale);
    scaleScores[normalized] = (scaleScores[normalized] ?? 0) + value;
  }
}

export const dnaKeywordRules: readonly DnaKeywordRule[] = [
  {
    label: "UK/drill",
    match: /\buk drill\b|\bdrill\b|brooklyn drill|chicago drill/i,
    scores: {
      bassRole: { "808-lead": 9 },
      densityBudget: { space: 8 },
      grooveGrid: { "half-time": 6, triplet: 2 },
      harmonicDensity: { sparse: 10 },
      harmonicRhythm: { slow: 7, static: 3 },
      melodicRole: { riff: 5, hook: 3 },
      syncopation: { medium: 4 },
      voicingWidth: { narrow: 8 },
    },
    scales: { "Natural Minor": 8, Phrygian: 5, "Minor Pentatonic": 4, "Dorian b2": 2 },
    dialect: ["dark 1-2 chord loop", "narrow inversions", "808 slide/fill carries tension", "silence and pauses are valid groove events"],
    avoid: ["dense gospel/jazz extensions", "busy countermelodies over vocal space", "major-key cheer unless explicitly requested"],
  },
  {
    label: "trap",
    match: /\btrap\b|atlanta|cloud rap|rage beat|pluggnb|plugg/i,
    scores: {
      bassRole: { "808-lead": 8 },
      densityBudget: { space: 5, balanced: 2 },
      grooveGrid: { triplet: 5, "half-time": 4 },
      harmonicDensity: { sparse: 5, color: 2 },
      harmonicRhythm: { slow: 4, loop: 3 },
      melodicRole: { hook: 6, riff: 3 },
      syncopation: { medium: 5 },
      voicingWidth: { narrow: 6 },
    },
    scales: { "Natural Minor": 7, "Minor Pentatonic": 5, Phrygian: 3, Dorian: 2 },
    dialect: ["2-4 chord loop", "808 answer fills", "m9/m11 only for melodic or atmospheric trap"],
    avoid: ["dominant jazz cadence unless sample-based", "too many harmonic changes"],
  },
  {
    label: "melodic trap/cloud",
    match: /melodic trap|cloud rap|pluggnb|atmospheric|dreamy|moody/i,
    scores: {
      harmonicDensity: { color: 6 },
      melodicRole: { hook: 5, riff: 3 },
      voicingWidth: { narrow: 4 },
    },
    scales: { "Natural Minor": 5, Dorian: 4, "Minor Pentatonic": 3 },
    dialect: ["m9/m11 color is allowed as atmosphere while keeping tight voice leading"],
    avoid: ["wide jazz voicings over the 808 unless explicitly requested"],
  },
  {
    label: "lofi/chill",
    match: /lofi|lo-fi|chill|chillhop|downtempo|trip hop|vapor|serene|nostalgic/i,
    scores: {
      bassRole: { root: 4 },
      densityBudget: { space: 4, balanced: 3 },
      grooveGrid: { swing: 4, straight: 2 },
      harmonicDensity: { simple: 4, color: 2 },
      harmonicRhythm: { loop: 4 },
      melodicRole: { hook: 3, texture: 3 },
      syncopation: { medium: 4 },
      voicingWidth: { medium: 4 },
    },
    scales: { "Major Pentatonic": 7, "Minor Pentatonic": 5, Dorian: 4, "Japanese Insen": 3 },
    dialect: ["dusty swung pocket", "simple loop with soft color tones", "leave room for sample texture"],
    avoid: ["over-composed lead lines"],
  },
  {
    label: "gospel/soul/jazz",
    match: /gospel|neo soul|r&b|soul|acid jazz|jazz|quiet storm|new jack/i,
    scores: {
      bassRole: { walking: 5, root: 2 },
      densityBudget: { dense: 18, balanced: 3 },
      grooveGrid: { swing: 4, straight: 2 },
      harmonicDensity: { dense: 18, altered: 5 },
      harmonicRhythm: { passing: 18, active: 4 },
      melodicRole: { "call-response": 5, counterline: 4 },
      syncopation: { medium: 6 },
      voicingWidth: { wide: 15 },
    },
    scales: { "Major Pentatonic": 7, Mixolydian: 6, Major: 5, Blues: 4, Dorian: 3 },
    dialect: ["guide-tone voice leading", "rootless upper structures", "diminished and dominant passing chords", "organ/EP/clav response parts"],
    avoid: ["pentatonic stacks pretending to be gospel harmony", "flat 4-bar tiling across long loops"],
  },
  {
    label: "pop/happy",
    match: /pop|happy|joyful|playful|uplifting|radiant|anthem/i,
    scores: {
      bassRole: { root: 5 },
      densityBudget: { balanced: 5 },
      grooveGrid: { straight: 6 },
      harmonicDensity: { simple: 6 },
      harmonicRhythm: { loop: 5 },
      melodicRole: { hook: 7 },
      syncopation: { low: 3, medium: 3 },
      voicingWidth: { medium: 4 },
    },
    scales: { Major: 7, "Major Pentatonic": 6, Mixolydian: 3 },
    dialect: ["clear four-chord hook loop", "add9/sus color before dense extensions", "catchy top-line contour"],
    avoid: ["reharmonizing away the hook", "overly dark default mode"],
  },
  {
    label: "folk/acoustic",
    match: /folk|americana|acoustic|singer songwriter|country|bluegrass|indie folk/i,
    scores: {
      bassRole: { root: 5, pedal: 2 },
      densityBudget: { space: 3, balanced: 4 },
      grooveGrid: { straight: 5, swing: 2 },
      harmonicDensity: { simple: 6, color: 2 },
      harmonicRhythm: { loop: 5 },
      melodicRole: { hook: 4, texture: 3 },
      syncopation: { low: 4 },
      voicingWidth: { medium: 4 },
    },
    scales: { Major: 5, Mixolydian: 5, "Major Pentatonic": 4, Dorian: 3 },
    dialect: ["open-string/sus color", "storytelling space", "bass motion only when fingerstyle implied"],
    avoid: ["dense chromatic reharmony"],
  },
  {
    label: "house/techno",
    match: /house|techno|minimal techno|minimal tech|dub techno|club|warehouse|detroit|chicago|acid house/i,
    scores: {
      bassRole: { "offbeat-pump": 8, pedal: 2 },
      densityBudget: { balanced: 5, space: 3 },
      grooveGrid: { straight: 6, "three-three-two": 3 },
      harmonicDensity: { color: 5, sparse: 2 },
      harmonicRhythm: { slow: 5, static: 2 },
      melodicRole: { riff: 4, texture: 4 },
      syncopation: { medium: 5 },
      voicingWidth: { medium: 5 },
    },
    scales: { Dorian: 6, "Minor Pentatonic": 4, Mixolydian: 4, "Lydian Dominant": 2 },
    dialect: ["repetitive chord stab", "offbeat bass pump", "filter-ready MIDI space"],
    avoid: ["too many chord changes"],
  },
  {
    label: "minimal",
    match: /minimal|sparse|draft|negative space|ambient techno/i,
    scores: {
      bassRole: { pedal: 5 },
      densityBudget: { space: 8 },
      grooveGrid: { straight: 4 },
      harmonicDensity: { sparse: 7 },
      harmonicRhythm: { static: 5, slow: 3 },
      melodicRole: { texture: 5, riff: 2 },
      syncopation: { low: 4, medium: 2 },
      voicingWidth: { narrow: 4 },
    },
    scales: { Dorian: 4, "Minor Pentatonic": 3, "Japanese Insen": 3 },
    dialect: ["space is quality", "small changes become the hook", "pedal tones and timbre-ready parts"],
    avoid: ["filling every lane just because density knob is high"],
  },
  {
    label: "cinematic/ambient",
    match: /cinematic|orchestral|trailer|ambient|post rock|drone|soundtrack|score/i,
    scores: {
      bassRole: { pedal: 5, root: 3 },
      densityBudget: { balanced: 4, dense: 2 },
      grooveGrid: { straight: 4 },
      harmonicDensity: { color: 5, simple: 2 },
      harmonicRhythm: { slow: 6, static: 2 },
      melodicRole: { texture: 6, counterline: 2 },
      syncopation: { low: 4 },
      voicingWidth: { wide: 5 },
    },
    scales: { "Harmonic Minor": 4, Lydian: 4, Dorian: 3, "Minor Pentatonic": 2 },
    dialect: ["pedal tones", "broad voicings", "slow contour", "orchestration carries the arc"],
    avoid: ["club-stab harmonic rhythm unless requested"],
  },
  {
    label: "breakbeat/bass",
    match: /drum.?and.?bass|dnb|jungle|breakbeat|breaks|uk garage|future garage|garage|2-step|footwork|juke/i,
    scores: {
      bassRole: { "808-lead": 3, "offbeat-pump": 3, pedal: 2 },
      densityBudget: { dense: 5, balanced: 3 },
      grooveGrid: { "double-time": 7, swing: 3 },
      harmonicDensity: { color: 3, simple: 3 },
      harmonicRhythm: { loop: 4, slow: 3 },
      melodicRole: { riff: 5, hook: 3 },
      syncopation: { high: 6 },
      voicingWidth: { medium: 4 },
    },
    scales: { Dorian: 5, "Natural Minor": 4, "Minor Pentatonic": 4, Blues: 2 },
    dialect: ["break edits define the groove", "bass answers drums", "short motifs beat long melodies"],
    avoid: ["straight quarter-note drum logic"],
  },
  {
    label: "amapiano/log-drum",
    match: /amapiano|log drum|durban/i,
    scores: {
      bassRole: { pedal: 9, root: 3 },
      densityBudget: { balanced: 6, space: 3 },
      grooveGrid: { "three-three-two": 8, straight: 2 },
      harmonicDensity: { sparse: 5, simple: 3 },
      harmonicRhythm: { static: 4, loop: 3 },
      melodicRole: { "call-response": 5, riff: 3 },
      syncopation: { high: 7 },
      voicingWidth: { medium: 4 },
    },
    scales: { Mixolydian: 5, Dorian: 5, "Major Pentatonic": 3, "Minor Pentatonic": 3 },
    dialect: ["log-drum bass pocket", "shaker/percussion interlock", "minimal chord vamp", "call-response stabs"],
    avoid: ["jungle break edits", "generic straight afrobeat drums", "dense 808 trap bass lanes"],
  },
  {
    label: "dembow/dancehall",
    match: /reggaeton|dancehall|dembow|moombahton/i,
    scores: {
      bassRole: { root: 7, "offbeat-pump": 2 },
      densityBudget: { balanced: 6 },
      grooveGrid: { "three-three-two": 7, "half-time": 3 },
      harmonicDensity: { simple: 5, color: 2 },
      harmonicRhythm: { loop: 5 },
      melodicRole: { "call-response": 5, hook: 3 },
      syncopation: { high: 7 },
      voicingWidth: { medium: 4 },
    },
    scales: { "Phrygian Dominant": 4, "Minor Pentatonic": 4, Mixolydian: 4, Dorian: 2 },
    dialect: ["dembow kick/snare cell", "offbeat chord stabs", "short vocal-like hook answers"],
    avoid: ["clave-only latin fallback", "generic afro percussion", "jungle/breakbeat hats"],
  },
  {
    label: "baile-funk/tamborzao",
    match: /baile|funk carioca|tamborzao|tamborzão|rio/i,
    scores: {
      bassRole: { root: 5, "808-lead": 3 },
      densityBudget: { balanced: 5, dense: 3 },
      grooveGrid: { "three-three-two": 6, "half-time": 2 },
      harmonicDensity: { sparse: 4, simple: 3 },
      harmonicRhythm: { static: 4, loop: 3 },
      melodicRole: { riff: 5, "call-response": 3 },
      syncopation: { high: 8 },
      voicingWidth: { narrow: 4 },
    },
    scales: { "Minor Pentatonic": 5, "Spanish Phrygian": 3, Dorian: 3, Blues: 2 },
    dialect: ["tamborzao percussion cell", "raw chant-like hook", "bass answers the drum cell"],
    avoid: ["smooth acoustic world kit", "bossa clave", "polished four-on-floor house default"],
  },
  {
    label: "latin-acoustic/clave",
    match: /bossa|salsa|samba|cumbia|clave/i,
    scores: {
      bassRole: { root: 6, walking: 3 },
      densityBudget: { balanced: 5 },
      grooveGrid: { clave: 10, "three-three-two": 4 },
      harmonicDensity: { color: 5, simple: 3 },
      harmonicRhythm: { loop: 4, active: 3 },
      melodicRole: { "call-response": 5, hook: 2 },
      syncopation: { high: 6 },
      voicingWidth: { medium: 5 },
    },
    scales: { Mixolydian: 5, "Major Pentatonic": 4, Dorian: 3, "Spanish Gypsy": 2 },
    dialect: ["clave-aware attacks", "nylon/keys comping", "bass anticipations", "percussion interlock"],
    avoid: ["straight club hats", "dembow cell unless requested", "808 trap bass default"],
  },
  {
    label: "latin/global",
    match: /afrobeat|amapiano|reggaeton|dancehall|latin|salsa|bossa|samba|clave|organic house|afro/i,
    scores: {
      bassRole: { root: 4, "offbeat-pump": 3 },
      densityBudget: { dense: 5, balanced: 3 },
      grooveGrid: { clave: 7, "three-three-two": 5 },
      harmonicDensity: { simple: 4, color: 3 },
      harmonicRhythm: { loop: 4, active: 2 },
      melodicRole: { "call-response": 4, riff: 3 },
      syncopation: { high: 5, medium: 3 },
      voicingWidth: { medium: 4 },
    },
    scales: { Mixolydian: 5, "Major Pentatonic": 4, "Minor Pentatonic": 3, "Phrygian Dominant": 2 },
    dialect: ["interlocking percussion", "call-response hooks", "3+3+2/clave-aware attacks"],
    avoid: ["flattening percussion into straight hats only"],
  },
  {
    label: "electronic/retro",
    match: /synthwave|retro future|80s|analog|darkwave|vaporwave|chillwave|synth pop|electro|cyberpunk|new wave/i,
    scores: {
      bassRole: { pedal: 3, root: 3 },
      densityBudget: { balanced: 5 },
      grooveGrid: { straight: 5 },
      harmonicDensity: { simple: 4, color: 3 },
      harmonicRhythm: { loop: 5 },
      melodicRole: { hook: 5, riff: 4 },
      syncopation: { medium: 4 },
      voicingWidth: { medium: 5 },
    },
    scales: { Dorian: 5, Lydian: 4, "Minor Pentatonic": 3, Mixolydian: 3 },
    dialect: ["arps and hook motifs", "Juno/analog pad colors", "clean 4-bar identity with turnaround lifts"],
    avoid: ["acoustic band defaults"],
  },
  {
    label: "experimental",
    match: /idm|glitch|hyperpop|industrial|deconstructed|noise|experimental|broken|odd meter|polyrhythmic/i,
    scores: {
      bassRole: { pedal: 3, "808-lead": 2 },
      densityBudget: { dense: 4, balanced: 3 },
      formArc: { "build-drop": 4 },
      grooveGrid: { "three-three-two": 4, "double-time": 3 },
      harmonicDensity: { altered: 5, color: 3 },
      harmonicRhythm: { active: 4 },
      melodicRole: { texture: 5, riff: 3 },
      syncopation: { high: 5 },
      voicingWidth: { wide: 3, medium: 2 },
    },
    scales: { Chromatic: 5, "Whole Tone": 4, Altered: 4, Enigmatic: 3 },
    dialect: ["controlled rule-breaking", "textural surprise", "irregular phrase mutation"],
    avoid: ["random note spray without motif recurrence"],
  },
  {
    label: "jersey/phonk",
    match: /jersey|phonk|memphis|dirty south|hyphy|g-funk|rage|pluggnb|trap soul/i,
    scores: {
      bassRole: { "808-lead": 6, root: 2 },
      densityBudget: { balanced: 4, space: 3 },
      grooveGrid: { "half-time": 3, triplet: 3, "double-time": 2 },
      harmonicDensity: { sparse: 4, color: 3 },
      harmonicRhythm: { loop: 4, slow: 2 },
      melodicRole: { hook: 4, riff: 3 },
      syncopation: { high: 4, medium: 3 },
      voicingWidth: { narrow: 4 },
    },
    scales: { "Natural Minor": 5, "Minor Pentatonic": 5, Blues: 4, Phrygian: 2 },
    dialect: ["club-kick or cowbell identity", "808/sub carries phrase answers", "short hook cells with empty space"],
    avoid: ["busy chord-comping over the drum identity"],
  },
  {
    label: "bass music",
    match: /dubstep|brostep|riddim|trapstep|future bass|hardwave|(?<!new\s)wave|neurofunk|psytrance/i,
    scores: {
      bassRole: { "808-lead": 4, pedal: 3 },
      densityBudget: { dense: 5, balanced: 3 },
      formArc: { "build-drop": 5 },
      grooveGrid: { "double-time": 4, "three-three-two": 3 },
      harmonicDensity: { color: 4, altered: 2 },
      harmonicRhythm: { loop: 3, active: 2 },
      melodicRole: { riff: 5, hook: 3 },
      syncopation: { high: 5 },
      voicingWidth: { medium: 4 },
    },
    scales: { Dorian: 4, "Minor Pentatonic": 4, Lydian: 3, "Natural Minor": 3 },
    dialect: ["bass/riff call-response", "drop-ready one-shots", "velocity modulation and phrase stutters"],
    avoid: ["plain static pads without bass movement"],
  },
  {
    label: "shoegaze/math rock",
    match: /shoegaze|math rock|midwest emo|garage rock|indie dance|dance punk|post punk|new wave/i,
    scores: {
      bassRole: { root: 4, pedal: 2 },
      densityBudget: { balanced: 4, dense: 2 },
      grooveGrid: { straight: 4, "three-three-two": 2 },
      harmonicDensity: { color: 4, simple: 3 },
      harmonicRhythm: { active: 3, loop: 2 },
      melodicRole: { riff: 4, counterline: 3 },
      syncopation: { medium: 4 },
      voicingWidth: { wide: 3, medium: 2 },
    },
    scales: { Mixolydian: 4, Dorian: 4, "Major Pentatonic": 3, Lydian: 2 },
    dialect: ["guitar-like open voicings", "riff callbacks", "upper extension shimmer", "odd-group accents when requested"],
    avoid: ["generic EDM drum grid"],
  },
  {
    label: "worship/sacred",
    match: /worship|devotional|sacred|transcendent|modern worship/i,
    scores: {
      bassRole: { root: 4, pedal: 3 },
      densityBudget: { balanced: 4, dense: 2 },
      formArc: { "cinematic-arc": 3, "starter-turnaround": 2 },
      grooveGrid: { straight: 4 },
      harmonicDensity: { color: 5, simple: 2 },
      harmonicRhythm: { slow: 3, loop: 2 },
      melodicRole: { hook: 5, texture: 2 },
      syncopation: { low: 4, medium: 2 },
      voicingWidth: { wide: 4 },
    },
    scales: { Major: 5, Lydian: 4, "Major Pentatonic": 4, Mixolydian: 3 },
    dialect: ["anthemic top line", "wide pad doubles", "clear lift cadence", "supporting shimmer"],
    avoid: ["overly busy chromatic reharmony"],
  },
  {
    label: "riff/hook complexity",
    match: /riff|hook focused|ostinato|arpeggiated|motif variation|bassline first/i,
    scores: {
      melodicRole: { riff: 14, hook: 4 },
      formArc: { "starter-turnaround": 3 },
      harmonicRhythm: { loop: 3 },
    },
    dialect: ["one memorable cell must recur and mutate at turnarounds"],
    avoid: ["many unrelated lead fragments"],
  },
  {
    label: "counter/harmony complexity",
    match: /counter|call and response|three voice|two voice|dense harmony|harmony forward|complex polyphonic|walking bass/i,
    scores: {
      bassRole: { walking: 4 },
      densityBudget: { dense: 4 },
      harmonicDensity: { dense: 5 },
      harmonicRhythm: { active: 4 },
      melodicRole: { counterline: 5, "call-response": 4 },
      voicingWidth: { wide: 3 },
    },
    scales: { Mixolydian: 2, Dorian: 2, Blues: 2 },
    dialect: ["voice leading and counterline independence matter more than note count"],
  },
  {
    label: "form cues",
    match: /drop|build|tension|release|bridge|intro|turnaround|tag|cadence/i,
    scores: {
      formArc: { "build-drop": 5, "starter-turnaround": 3 },
      harmonicRhythm: { active: 2 },
    },
    dialect: ["section boundaries need audible contrast"],
    avoid: ["copy-pasting one bar across the full loop"],
  },
] as const;

export function inferStyleDna(input: GeneratorPromptInput) {
  const source = `${input.genre ?? ""} ${input.mood ?? ""} ${input.era ?? ""} ${input.complexity ?? ""} ${input.notes ?? ""}`.toLowerCase();
  const scores: DnaScores = createDnaScores();
  const scaleScores: Record<string, number> = {};
  const dialect: string[] = [];
  const avoid: string[] = [];
  const matchedLabels: string[] = [];
  for (const rule of dnaKeywordRules) {
    if (!rule.match.test(source)) {
      continue;
    }
    matchedLabels.push(rule.label);
    addScore(scores.bassRole, rule.scores.bassRole);
    addScore(scores.densityBudget, rule.scores.densityBudget);
    addScore(scores.formArc, rule.scores.formArc);
    addScore(scores.grooveGrid, rule.scores.grooveGrid);
    addScore(scores.harmonicDensity, rule.scores.harmonicDensity);
    addScore(scores.harmonicRhythm, rule.scores.harmonicRhythm);
    addScore(scores.melodicRole, rule.scores.melodicRole);
    addScore(scores.syncopation, rule.scores.syncopation);
    addScore(scores.voicingWidth, rule.scores.voicingWidth);
    addScaleScores(scaleScores, rule.scales);
    dialect.push(...(rule.dialect ?? []));
    avoid.push(...(rule.avoid ?? []));
  }

  const density = clamp01Or(input.density, 0.55);
  const creativity = clamp01Or(input.creativity, 0.65);
  if (density > 0.78 && scores.densityBudget.space < 6) {
    scores.densityBudget.dense += 2;
  }
  if (creativity > 0.86 && scores.harmonicDensity.sparse < 6) {
    scores.formArc["build-drop"] += 1;
    scores.syncopation.high += 1;
  }
  if (selectedLengthBars(input) >= 8) {
    scores.formArc["starter-turnaround"] += 4;
  }

  const scaleBias = Object.entries(scaleScores)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([scale]) => scale);
  const fallbackScaleBias = scaleBias.length > 0 ? scaleBias : ["Dorian", "Major Pentatonic", "Natural Minor"];
  const dna: GeneratorStyleDna = {
    bassRole: bestScore(scores.bassRole, "root"),
    densityBudget: bestScore(scores.densityBudget, "balanced"),
    formArc: bestScore(scores.formArc, "starter-turnaround"),
    grooveGrid: bestScore(scores.grooveGrid, "straight"),
    harmonicDensity: bestScore(scores.harmonicDensity, "simple"),
    harmonicRhythm: bestScore(scores.harmonicRhythm, "loop"),
    instrumentDialect: uniqueStrings(dialect.length > 0 ? dialect : ["genre-balanced arrangement", "clear motif identity", "style-correct space"]),
    melodicRole: bestScore(scores.melodicRole, "hook"),
    avoid: uniqueStrings(avoid.length > 0 ? avoid : ["generic piano/bass/lead/drums defaults", "flat loop tiling across long forms"]),
    scaleBias: fallbackScaleBias,
    styleLabel: cleanField(input.genre) === "Any" ? matchedLabels[0] ?? "general" : cleanField(input.genre),
    syncopation: bestScore(scores.syncopation, "medium"),
    voicingWidth: bestScore(scores.voicingWidth, "medium"),
  };
  return dna;
}

export function preferredDnaScale(input: GeneratorPromptInput) {
  const dna = inferStyleDna(input);
  return normalizeGeneratorScaleMode(dna.scaleBias[0]);
}

export function selectedScaleMode(input: GeneratorPromptInput) {
  const direct = normalizeGeneratorScaleMode(input.scaleKey);
  if (direct) {
    return direct;
  }
  const dnaScale = preferredDnaScale(input);
  if (dnaScale) {
    return dnaScale;
  }
  const suggestion = buildMagicSuggestion(dashboardFieldsFromPrompt(input), {}, { chaos: 0.18 });
  return normalizeGeneratorScaleMode(suggestion.scaleKey) || "Dorian";
}

export function selectedLengthBars(input: GeneratorPromptInput) {
  return normalizeGeneratorLengthBars(input.lengthBars);
}

export function promptSeed(input: GeneratorPromptInput) {
  return JSON.stringify({
    complexity: input.complexity ?? "",
    creativity: input.creativity ?? "",
    density: input.density ?? "",
    era: input.era ?? "",
    genre: input.genre ?? "",
    humanize: input.humanize ?? "",
    lengthBars: selectedLengthBars(input),
    mood: input.mood ?? "",
    notes: input.notes ?? "",
    scaleKey: input.scaleKey ?? "",
    temperature: input.temperature ?? "",
  });
}

export function selectedScaleInfo(input: GeneratorPromptInput) {
  const selectedMode = selectedScaleMode(input);
  const seed = promptSeed(input);
  const selectedKey = scaleRootName(input.scaleKey || selectedMode, seed);
  return {
    selectedKey,
    selectedMode,
    selectedScale: `${selectedKey} ${selectedMode}`,
  };
}

export function strongerChordLanguage(left: GeneratorMusicianPlan["harmony"]["chordLanguage"], right: GeneratorMusicianPlan["harmony"]["chordLanguage"]) {
  return chordLanguageRanks[left] >= chordLanguageRanks[right] ? left : right;
}

export function weakerChordLanguage(left: GeneratorMusicianPlan["harmony"]["chordLanguage"], right: GeneratorMusicianPlan["harmony"]["chordLanguage"]) {
  return chordLanguageRanks[left] <= chordLanguageRanks[right] ? left : right;
}

export function chordLanguageFromDensity(density: DnaHarmonicDensity) {
  if (density === "altered") return "altered";
  if (density === "dense") return "extended";
  if (density === "color") return "sevenths";
  return "triads";
}

export function ceilingFromDensity(density: DnaHarmonicDensity) {
  if (density === "altered") return "altered";
  if (density === "dense") return "altered";
  if (density === "color") return "extended";
  return "sevenths";
}

export function changesFromRhythm(rhythm: DnaHarmonicRhythm) {
  if (rhythm === "static") return 1;
  if (rhythm === "slow") return 2;
  if (rhythm === "active") return 6;
  if (rhythm === "passing") return 8;
  return 4;
}

export function progressionStyleFromDna(dna: GeneratorStyleDna) {
  if (dna.harmonicRhythm === "passing") return "beat-level passing chords into phrase targets";
  if (dna.harmonicRhythm === "active") return "two-beat harmonic motion with phrase-end approaches";
  if (dna.harmonicRhythm === "slow") return "one- or two-chord loop with turnaround contrast";
  if (dna.harmonicRhythm === "static") return "pedal/ostinato harmony where texture and bass motion carry interest";
  return "four-bar starter loop with bar-4 turnaround variation";
}

export function harmonyProfileFromDna(dna: GeneratorStyleDna) {
  return {
    base: chordLanguageFromDensity(dna.harmonicDensity),
    changesPerFourBars: changesFromRhythm(dna.harmonicRhythm),
    ceiling: ceilingFromDensity(dna.harmonicDensity),
    dialect: `${dna.styleLabel}: ${dna.instrumentDialect.join("; ")}`,
    progressionStyle: progressionStyleFromDna(dna),
    rootless: dna.harmonicDensity === "dense" || dna.harmonicDensity === "altered",
    voicingRange: dna.voicingWidth,
  } as const;
}

export function primaryBassLayer(style: GeneratorStyleDna) {
  if (style.bassRole === "808-lead") return "808/sub bass";
  if (style.bassRole === "offbeat-pump") return "house-strobe bass";
  return "live-passing bass";
}

export function bassRoleLayers(style: GeneratorStyleDna, density: number) {
  if (style.densityBudget === "space") {
    return [primaryBassLayer(style)];
  }
  if (style.bassRole === "offbeat-pump" || style.harmonicDensity === "dense") {
    return [primaryBassLayer(style)];
  }
  if (density > 0.7) {
    return ["house-strobe bass", "live-passing bass", "808/sub bass"];
  }
  if (style.bassRole === "808-lead") {
    return ["808/sub bass", "live-passing bass"];
  }
  return [primaryBassLayer(style)];
}

export function buildMusicianPlan(input: GeneratorPromptInput, selectedMode = selectedScaleMode(input)) {
  const joined = `${input.genre ?? ""} ${input.mood ?? ""} ${input.era ?? ""} ${input.complexity ?? ""} ${input.notes ?? ""}`.toLowerCase();
  const creativity = clamp01Or(input.creativity, 0.65);
  const density = clamp01Or(input.density, 0.55);
  const humanize = clamp01Or(input.humanize, 0.35);
  const temperature = clamp01Or(input.temperature, 0.7);
  const lengthBars = selectedLengthBars(input);
  const style = inferStyleDna(input);
  const intentTags = promptIntentTags(input);
  const selectedTags = new Set([...selectorIntentTags(input), ...intentTags.grooveTags, ...intentTags.themeTags]);
  const harmonyProfile = harmonyProfileFromDna(style);
  const complexHarmony = style.harmonicDensity === "dense" || style.harmonicDensity === "altered" || /dense harmony|harmony forward|complex|polyphonic|counter|full arrangement|chord/i.test(joined);
  const alteredColor = /altered|chromatic|whole tone|enigmatic|phrygian|dominant|hijaz|byzantine|persian|diminished/i.test(selectedMode);
  const sparseHarmony = style.harmonicDensity === "sparse";
  const drillLike = sparseHarmony || tagSetHas(selectedTags, ["drill", "uk-drill", "brooklyn-drill", "808-slide-pocket", "half-time"]);
  const trapLike = style.bassRole === "808-lead" || tagSetHas(selectedTags, ["trap", "cloud-rap", "808-slide-pocket"]);
  const melodicTrapColor = trapLike && tagSetHas(selectedTags, ["melodic", "cloud", "atmospheric", "dreamy", "moody", "rnb", "soulful", "jazzy-chords"]);
  const simpleSongLike = style.harmonicDensity === "simple" && !complexHarmony;
  let chordLanguage: GeneratorMusicianPlan["harmony"]["chordLanguage"] = harmonyProfile.base;
  if (complexHarmony) {
    chordLanguage = strongerChordLanguage(chordLanguage, harmonyProfile.voicingRange === "wide" ? "extended" : "sevenths");
  }
  if (alteredColor && harmonyProfile.ceiling === "altered") {
    chordLanguage = "altered";
  } else if (creativity > 0.82) {
    if (harmonyProfile.voicingRange === "wide") {
      chordLanguage = strongerChordLanguage(chordLanguage, creativity > 0.92 ? "altered" : "extended");
    } else if (melodicTrapColor) {
      chordLanguage = strongerChordLanguage(chordLanguage, "extended");
    } else if (!drillLike && !trapLike && !simpleSongLike) {
      chordLanguage = strongerChordLanguage(chordLanguage, "sevenths");
    }
  } else if (creativity > 0.54 && !drillLike && !trapLike && !simpleSongLike) {
    chordLanguage = strongerChordLanguage(chordLanguage, "sevenths");
  }
  chordLanguage = weakerChordLanguage(chordLanguage, harmonyProfile.ceiling);
  const syncopationBase = style.syncopation === "high" ? 0.68 : style.syncopation === "low" ? 0.28 : 0.48;
  const syncopationScore = clamp01Or(
    syncopationBase
      + humanize * 0.28
      + density * 0.18
      + (/syncopated|funk|garage|house|afro|latin|jungle|breakbeat|swing|triplet/i.test(joined) ? 0.18 : 0)
      + (/minimal|ambient|drone|sparse/i.test(joined) ? -0.12 : 0),
    0.52,
  );
  const syncopation = syncopationScore > 0.72 && temperature > 0.74 ? "high" : syncopationScore < 0.42 ? "low" : "medium";
  const explicitRiff = style.melodicRole === "riff" || /riff|ostinato|arpeggiated|motif/.test(joined);
  const riffLayers = explicitRiff ? style.densityBudget === "space" ? 1 : density > 0.7 ? 2 : 1 : style.densityBudget !== "space" && (density > 0.78 || /polyphonic|maximal|full arrangement/i.test(joined)) ? 2 : style.densityBudget !== "space" && density > 0.56 ? 1 : 0;
  const counterline = style.melodicRole === "counterline" || style.melodicRole === "call-response" || /counter|polyphonic|call and response|melody forward|full arrangement/i.test(joined) || (style.densityBudget !== "space" && density > 0.68);
  const rootless = chordLanguage !== "triads" && (harmonyProfile.rootless || (density > 0.64 && /jazz|soul|gospel|r&b|chord/i.test(joined)));
  const eventModulation = creativity > 0.74 || /idm|glitch|hyperpop|industrial|cyberpunk|experimental|deconstructed|hardwave|wave|riddim|brostep|psytrance/i.test(joined);
  const extensions = chordLanguage === "altered"
    ? ["7", "9", "#11", "b13"]
    : chordLanguage === "extended"
      ? ["7", "9", "11", "13"]
      : chordLanguage === "sevenths"
        ? ["7", "9"]
        : [];
  const rawBassLayers = bassRoleLayers(style, density);
  const bassLayers = explicitNo808Requested(input)
    ? rawBassLayers.filter((layer) => layer !== "808/sub bass")
    : rawBassLayers;
  const resolvedBassLayers = bassLayers.length > 0 ? bassLayers : ["live-passing bass"];
  const ambientSpace = tagSetHas(selectedTags, ["ambient", "drone", "wide-space"]);
  const drumsRequired = !explicitNoDrumsRequested(input) && !ambientSpace && (
    style.densityBudget !== "space"
    || tagSetHas(selectedTags, ["drumline-first", "percussion-forward", "house", "techno", "club", "jungle", "dnb", "drum-and-bass", "four-on-floor", "drill", "uk-drill", "brooklyn-drill", "808-slide-pocket"])
  );
  const required = [
    ...(drumsRequired ? ["drum groove"] : []),
    "chord comp",
    ...resolvedBassLayers,
    "lead motif",
    ...(counterline ? ["countermelody"] : []),
    ...(riffLayers > 0 ? ["riff layer"] : []),
    ...(style.densityBudget !== "space" && (harmonyProfile.rootless || density > 0.7 || chordLanguage === "altered") ? ["guide-tone harmonic layer"] : []),
  ] as const;
  const minTracks = style.densityBudget === "space"
    ? Math.max(drumsRequired ? 4 : 3, required.length)
    : style.densityBudget === "dense"
      ? Math.max(6, required.length)
      : Math.max(4, required.length);
  const minPhraseVariations = style.densityBudget === "space"
    ? lengthBars >= 16 ? 2 : 1
    : lengthBars >= 16 ? 3 : lengthBars >= 8 ? 2 : 1;
  const sections = lengthBars >= 16
    ? ["1-4 statement", "5-8 variation", "9-12 pullback or lift", "13-16 turnaround/tag"]
    : lengthBars >= 8
      ? ["1-4 statement", "5-8 turnaround variation"]
      : ["1-4 starter loop with bar-4 turnaround"];
  const maxChordClusterSize = style.harmonicDensity === "sparse" ? 3 : style.harmonicDensity === "simple" ? 4 : style.harmonicDensity === "color" ? 5 : 8;
  const maxMelodicLayers = style.densityBudget === "space" ? 2 : style.densityBudget === "dense" ? 5 : 3;
  const maxNonDrumNotesPerBar = style.densityBudget === "space"
    ? Math.round(42 + density * 24)
    : style.densityBudget === "dense"
      ? Math.round(120 + density * 80)
      : Math.round(82 + density * 50);

  return {
    style,
    form: {
      arc: style.formArc,
      sections,
      turnaroundStrategy: style.formArc === "starter-turnaround"
        ? "keep bars 1-3 stable, make bar 4 answer or turn around; repeat with stronger contrast at final 4 bars"
        : style.formArc === "build-drop"
          ? "use section-level contrast and one drop/pullback without completing the whole arrangement"
          : style.formArc === "cinematic-arc"
            ? "shape long-register swell and cadence while staying loopable"
            : "static loop is allowed only when small texture changes create motion",
    },
    groove: {
      anchors: syncopation === "low" ? ["1", "2", "3", "4"] : syncopation === "high" ? ["1", "and-of-2", "4"] : ["1", "2", "4"],
      microtiming: humanize > 0.68 ? "laid-back pocket with lane-specific push/pull" : humanize > 0.34 ? "subtle human push/pull" : "tight quantized pocket",
      restStrategy: syncopation === "low" ? "keep downbeat anchors clear" : "use rests/ties on selected downbeats without hiding the pulse",
      syncopation,
      velocityCurve: density > 0.72 ? "dense ghost-note dynamics with phrase swells" : "clear accents with lighter passing notes",
    },
    harmony: {
      chordLanguage,
      changesPerFourBars: harmonyProfile.changesPerFourBars,
      extensions,
      genreDialect: harmonyProfile.dialect,
      inversionStrategy: rootless
        ? "rootless upper structures above bass; keep guide tones smooth"
        : harmonyProfile.voicingRange === "narrow"
          ? "tight inversions in a narrow range around the loop"
          : "close inversions with common tones",
      progressionStyle: harmonyProfile.progressionStyle,
      rootless,
      voicingRange: harmonyProfile.voicingRange,
      voicing: chordLanguage === "altered" ? "guide tones plus altered top colors" : chordLanguage === "extended" ? "3/7 guide tones plus 9/11/13 color" : chordLanguage === "sevenths" ? "seventh shells plus 9/add color" : "clean triads",
    },
    layers: {
      minTracks,
      optional: style.densityBudget === "space" ? ["texture rest", "quiet turnaround detail"] : density > 0.68 ? ["percussion ghosts", "pad doubles", "call-response stab"] : ["pad doubles"],
      required,
    },
    melody: {
      counterMotion: counterline ? "mixed" : syncopation === "low" ? "oblique" : "contrary",
      counterline,
      motifStrategy: temperature > 0.76 ? "motif repeats with answer, inversion, and phrase-end mutation" : "motif repeats with small rhythmic and interval variation",
      riffLayers,
    },
    performance: {
      eventModulation,
      modulationStrategy: eventModulation
        ? "deterministic velocity, duration, and accent modulation per event; keep motif identity intact"
        : "stable dynamics; use only normal phrase accents",
    },
    quality: {
      maxChordClusterSize,
      maxMelodicLayers,
      maxNonDrumNotesPerBar,
      maxShortTracks: style.densityBudget === "space" ? Math.max(1, Math.floor(minTracks / 2)) : 0,
      minBassRoles: resolvedBassLayers.length,
      minPhraseVariations,
      minChordClusterSize: style.harmonicDensity === "sparse" ? 1 : Math.min(maxChordClusterSize, chordLanguage === "triads" ? 3 : harmonyProfile.voicingRange === "wide" && chordLanguage !== "sevenths" ? 5 : 4),
      minOffbeatRatio: syncopation === "low" ? 0.18 : syncopation === "high" ? 0.36 : 0.26,
      minScore: 72,
      phraseFillRequired: lengthBars >= 8 && drumsRequired && style.densityBudget !== "space",
    },
  } satisfies GeneratorMusicianPlan;
}
