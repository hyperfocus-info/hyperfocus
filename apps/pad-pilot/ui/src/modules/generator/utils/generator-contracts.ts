import { type GeneratorMidiComposition, type GeneratorMidiTrack } from "./midi-encoder";
import { type GeneratorAiProvider, type GeneratorFieldKey, type GeneratorFieldLocks, type GeneratorLengthBars, type GeneratorSelectorState, type GeneratorWeightedSelectorTag } from "./generator-option-catalog";


export interface GeneratorPromptInput {
  magicProvenance?: {
    chaos: number;
    reroll: number;
    suggestedFields: Partial<Record<GeneratorFieldKey, boolean>>;
  };
  genre?: string;
  creativity?: number;
  density?: number;
  humanize?: number;
  lengthBars?: number;
  mood?: string;
  era?: string;
  complexity?: string;
  scaleKey?: string;
  notes?: string;
  temperature?: number;
  locks?: GeneratorFieldLocks;
}

export interface CodexClientOptions {
  endpoint?: string;
  model?: string;
  provider?: GeneratorAiProvider;
  signal?: AbortSignal;
  onLog?: (line: string) => void;
}

export interface GeneratedMidiTemplate {
  audit?: {
    magicProvenance?: GeneratorPromptInput["magicProvenance"];
    modelFailure?: {
      reason: string;
    };
    modelEnvelope?: GeneratorModelEnvelope;
    modelValidationReport?: GeneratorValidationReport;
    repairPatch?: GeneratorRepairPatch;
    validationReport?: GeneratorValidationReport;
  };
  bpm: number;
  combinedMidi: Uint8Array;
  filename: string;
  lengthBars: GeneratorLengthBars;
  originalModel?: {
    filename: string;
    label: string;
    midiData: Uint8Array;
    rawTracker: string;
    tracks: readonly GeneratorMidiTrack[];
  };
  rawTracker: string;
  selectedKey: string;
  selectedMode: string;
  selectedScale: string;
  source: "codex-cli" | "fallback" | "local-model";
  trackFiles: Array<{
    filename: string;
    label: string;
    midiData: Uint8Array;
    track: GeneratorMidiTrack;
  }>;
  tracks: readonly GeneratorMidiTrack[];
}

export const GENERATOR_TRACKER_GRAMMAR_VERSION = "delta-tracker-v2";
export const GENERATOR_MODEL_SCHEMA_VERSION = "generator-model-envelope-v1";

export const GENERATOR_MODEL_ENVELOPE_JSON_SCHEMA = {
  additionalProperties: false,
  properties: {
    arrangementPlan: {
      additionalProperties: false,
      properties: {
        bass: { type: "string" },
        confidence: { maximum: 1, minimum: 0, type: "number" },
        form: { type: "string" },
        grid: { type: "string" },
        motif: { type: "string" },
        phraseFunction: { type: "string" },
        roles: { items: { type: "string" }, type: "array" },
        style: { type: "string" },
      },
      required: ["bass", "confidence", "form", "grid", "motif", "phraseFunction", "roles", "style"],
      type: "object",
    },
    chordPlan: {
      items: {
        additionalProperties: false,
        properties: {
          bar: { type: "number" },
          bassRelation: { type: "string" },
          function: { type: "string" },
          inversion: { type: "string" },
          quality: { type: "string" },
          resolutionTarget: { type: "string" },
          roman: { type: "string" },
          root: { type: "string" },
          tensionClass: { type: "string" },
          topNoteIntent: { type: "string" },
          voicingRange: { type: "string" },
        },
        required: ["bar", "bassRelation", "function", "inversion", "quality", "resolutionTarget", "roman", "root", "tensionClass", "topNoteIntent", "voicingRange"],
        type: "object",
      },
      type: "array",
    },
    confidence: { maximum: 1, minimum: 0, type: "number" },
    groovePlan: {
      additionalProperties: false,
      properties: {
        anchors: { items: { type: "string" }, type: "array" },
        grid: { type: "string" },
        microtiming: { type: "string" },
        rhythmCell: { type: "string" },
        swing: { type: "string" },
      },
      required: ["anchors", "grid", "microtiming", "rhythmCell", "swing"],
      type: "object",
    },
    grammarVersion: { const: GENERATOR_TRACKER_GRAMMAR_VERSION, type: "string" },
    harmonicTolerancePolicy: {
      additionalProperties: false,
      properties: {
        absoluteWrong: { items: { type: "string" }, type: "array" },
        allowedTensions: { items: { type: "string" }, type: "array" },
        avantAllowed: { items: { type: "string" }, type: "array" },
        fixingFactor: { maximum: 1, minimum: 0, type: "number" },
        mode: { enum: ["strict", "color", "tension", "avant"], type: "string" },
        source: { type: "string" },
      },
      required: ["absoluteWrong", "allowedTensions", "avantAllowed", "fixingFactor", "mode", "source"],
      type: "object",
    },
    lanePlan: {
      items: {
        additionalProperties: false,
        properties: {
          bassRole: { type: "string" },
          function: { type: "string" },
          lane: { type: "string" },
          name: { type: "string" },
          role: { type: "string" },
        },
        required: ["bassRole", "function", "lane", "name", "role"],
        type: "object",
      },
      type: "array",
    },
    repairAvoided: { items: { type: "string" }, type: "array" },
    schemaVersion: { const: GENERATOR_MODEL_SCHEMA_VERSION, type: "string" },
    tracker: { type: "string" },
    validationNotes: { items: { type: "string" }, type: "array" },
  },
  required: ["arrangementPlan", "chordPlan", "confidence", "groovePlan", "grammarVersion", "harmonicTolerancePolicy", "lanePlan", "repairAvoided", "schemaVersion", "tracker", "validationNotes"],
  type: "object",
} as const;

export const harmonicToleranceModes = ["strict", "color", "tension", "avant"] as const;

export type GeneratorHarmonicToleranceMode = (typeof harmonicToleranceModes)[number];

export type GeneratorLanePlanItem = {
  bassRole?: string;
  function?: string;
  lane?: string;
  name?: string;
  role: string;
};

export type GeneratorGroovePlan = {
  anchors?: readonly string[];
  grid?: string;
  microtiming?: string;
  rhythmCell?: string;
  swing?: number | string;
};

export type GeneratorChordPlanItem = {
  bar?: number;
  bassRelation?: string;
  function?: string;
  inversion?: string;
  quality?: string;
  resolutionTarget?: string;
  roman?: string;
  root?: string;
  tensionClass?: string;
  topNoteIntent?: string;
  voicingRange?: string;
};

export type GeneratorHarmonicTolerancePolicy = {
  absoluteWrong: readonly string[];
  allowedTensions: readonly string[];
  avantAllowed: readonly string[];
  fixingFactor: number;
  mode: GeneratorHarmonicToleranceMode;
  source: string;
};

export type GeneratorModelEnvelope = {
  arrangementPlan: GeneratorArrangementPlanHeader;
  chordPlan: readonly GeneratorChordPlanItem[];
  confidence: number;
  groovePlan: GeneratorGroovePlan;
  grammarVersion: typeof GENERATOR_TRACKER_GRAMMAR_VERSION;
  harmonicTolerancePolicy: GeneratorHarmonicTolerancePolicy;
  lanePlan: readonly GeneratorLanePlanItem[];
  repairAvoided: readonly string[];
  schemaVersion: typeof GENERATOR_MODEL_SCHEMA_VERSION;
  tracker: string;
  validationNotes: readonly string[];
};

export type OriginalModelArtifact = {
  composition: GeneratorMidiComposition;
  rawTracker: string;
  source: "codex-cli" | "local-model";
};

export type GeneratorValidationReport = {
  arrangementPlan?: GeneratorArrangementPlanHeader;
  grammarVersion: typeof GENERATOR_TRACKER_GRAMMAR_VERSION;
  harmonicTolerancePolicy?: GeneratorHarmonicTolerancePolicy;
  loopEndTick: number;
  metrics: GeneratorCompositionMetrics;
  passed: boolean;
  reasons: readonly string[];
  schemaVersion: typeof GENERATOR_MODEL_SCHEMA_VERSION;
  score: number;
};

export type GeneratorCompositionMetrics = {
  bassRoles: number;
  declaredRoleMisses: string[];
  maxChordCluster: number;
  melodicLayers: number;
  melodyPhraseScore: number;
  motifScore: number;
  nonDrumNotesPerBar: number;
  offbeatRatio: number;
  phraseFill: boolean;
  phraseVariations: number;
  shortTracks: number;
  style: {
    bassTracks: number;
    deductions: number;
    drumNotesPerBar: number;
    drumTracks: number;
    requirements: readonly string[];
  };
  tracks: number;
};

export type StyleDnaFilterStats = {
  chordDependentFillNotes: number;
  earwormLeadPatched: boolean;
  eventModulatedNotes: number;
  massageDecisionLines: string[];
  massagedTrackCount: number;
  normalizedIntentTagLine: string;
  oneShotEvents: number;
  patchedTrackRoles: string[];
  pitchCorrectedNotes: number;
  quantizedNotes: number;
  regeneratedTracks: string[];
  simplifiedChordClusters: number;
  skippedAdditiveRepairs: string[];
  strippedChordNotes: number;
  supportBalancedNotes: number;
  supportThinnedNotes: number;
  syncopationClampedNotes: number;
  upperColorNotes: number;
};

export type GeneratorRepairPatch = {
  afterScore: number;
  beforeScore: number;
  creativeRewrite: boolean;
  deltaScore: number;
  keepMassaged: boolean;
  patchLines: readonly string[];
  schemaVersion: typeof GENERATOR_MODEL_SCHEMA_VERSION;
  structuralRepair: boolean;
};

export type FallbackNoteEvent = {
  durationTicks: number;
  note: number;
  tick: number;
  velocity: number;
};

export type FallbackInstrument = {
  name: string;
  program: number;
};

export type FallbackInstrumentPalette = {
  bass: readonly FallbackInstrument[];
  bpm: number;
  chord: readonly FallbackInstrument[];
  drums: readonly FallbackInstrument[];
  label: string;
  lead: readonly FallbackInstrument[];
  tags: readonly string[];
  texture: readonly FallbackInstrument[];
};

export type AbsoluteGeneratorNote = GeneratorMidiTrack["notes"][number] & {
  tick: number;
};

export type GeneratorTrackMetadata = {
  bassRole?: string;
  function?: string;
  lane?: string;
  motifId?: string;
  phrase?: string;
  role?: string;
};

export type GeneratorMidiTrackWithMetadata = GeneratorMidiTrack & {
  metadata?: GeneratorTrackMetadata;
};

export const dnaHarmonicDensityValues = ["sparse", "simple", "color", "dense", "altered"] as const;
export const dnaHarmonicRhythmValues = ["static", "slow", "loop", "active", "passing"] as const;
export const dnaVoicingWidthValues = ["narrow", "medium", "wide"] as const;
export const dnaBassRoleValues = ["root", "pedal", "808-lead", "offbeat-pump", "walking"] as const;
export const dnaGrooveGridValues = ["straight", "swing", "triplet", "half-time", "double-time", "three-three-two", "clave"] as const;
export const dnaSyncopationValues = ["low", "medium", "high"] as const;
export const dnaMelodicRoleValues = ["hook", "riff", "counterline", "call-response", "texture"] as const;
export const dnaDensityBudgetValues = ["space", "balanced", "dense"] as const;
export const dnaFormArcValues = ["static-loop", "starter-turnaround", "build-drop", "cinematic-arc"] as const;

export type DnaHarmonicDensity = (typeof dnaHarmonicDensityValues)[number];
export type DnaHarmonicRhythm = (typeof dnaHarmonicRhythmValues)[number];
export type DnaVoicingWidth = (typeof dnaVoicingWidthValues)[number];
export type DnaBassRole = (typeof dnaBassRoleValues)[number];
export type DnaGrooveGrid = (typeof dnaGrooveGridValues)[number];
export type DnaSyncopation = (typeof dnaSyncopationValues)[number];
export type DnaMelodicRole = (typeof dnaMelodicRoleValues)[number];
export type DnaDensityBudget = (typeof dnaDensityBudgetValues)[number];
export type DnaFormArc = (typeof dnaFormArcValues)[number];

export type GeneratorStyleDna = {
  bassRole: DnaBassRole;
  densityBudget: DnaDensityBudget;
  formArc: DnaFormArc;
  grooveGrid: DnaGrooveGrid;
  harmonicDensity: DnaHarmonicDensity;
  harmonicRhythm: DnaHarmonicRhythm;
  instrumentDialect: readonly string[];
  melodicRole: DnaMelodicRole;
  avoid: readonly string[];
  scaleBias: readonly string[];
  styleLabel: string;
  syncopation: DnaSyncopation;
  voicingWidth: DnaVoicingWidth;
};

export type GeneratorMusicianPlan = {
  style: GeneratorStyleDna;
  form: {
    arc: DnaFormArc;
    sections: readonly string[];
    turnaroundStrategy: string;
  };
  groove: {
    anchors: readonly string[];
    microtiming: string;
    restStrategy: string;
    syncopation: "low" | "medium" | "high";
    velocityCurve: string;
  };
  harmony: {
    chordLanguage: "triads" | "sevenths" | "extended" | "altered";
    changesPerFourBars: number;
    extensions: readonly string[];
    genreDialect: string;
    inversionStrategy: string;
    progressionStyle: string;
    rootless: boolean;
    voicingRange: "narrow" | "medium" | "wide";
    voicing: string;
  };
  layers: {
    minTracks: number;
    optional: readonly string[];
    required: readonly string[];
  };
  melody: {
    counterMotion: "oblique" | "contrary" | "mixed";
    counterline: boolean;
    motifStrategy: string;
    riffLayers: number;
  };
  performance: {
    eventModulation: boolean;
    modulationStrategy: string;
  };
  quality: {
    maxChordClusterSize: number;
    maxMelodicLayers: number;
    maxNonDrumNotesPerBar: number;
    maxShortTracks: number;
    minBassRoles: number;
    minPhraseVariations: number;
    minChordClusterSize: number;
    minOffbeatRatio: number;
    minScore: number;
    phraseFillRequired: boolean;
  };
};

export type GeneratorIntentPlan = {
  advanced: {
    creativity: number;
    density: number;
    humanize: number;
    temperature: number;
  };
  fields: {
    complexity: string;
    era: string;
    genre: string;
    mood: string;
    notes: string;
    scaleKey: string;
  };
  selected: {
    lengthBars: GeneratorLengthBars;
    mode: string;
    scale: string;
  };
  selectorState: GeneratorSelectorState;
  style: GeneratorStyleDna;
  tags: {
    all: readonly string[];
    avoid: readonly string[];
    groove: readonly string[];
    raw: readonly string[];
    selector: readonly string[];
    theme: readonly string[];
    weighted: readonly GeneratorWeightedSelectorTag[];
  };
  validation: {
    loopEndTick: number;
    maxChordClusterSize: number;
    maxMelodicLayers: number;
    maxNonDrumNotesPerBar: number;
    minBassRoles: number;
    minChordClusterSize: number;
    minOffbeatRatio: number;
    minPhraseVariations: number;
    minTracks: number;
  };
};

export type GeneratorArrangementPlanHeader = {
  bass: string;
  confidence: number;
  form: string;
  grid: string;
  motif: string;
  phraseFunction: string;
  roles: readonly string[];
  style: string;
};

export type GeneratorPromptEnvelope = {
  grammarVersion: typeof GENERATOR_TRACKER_GRAMMAR_VERSION;
  intentPlan: GeneratorIntentPlan;
  jsonSchema: typeof GENERATOR_MODEL_ENVELOPE_JSON_SCHEMA;
  schemaVersion: typeof GENERATOR_MODEL_SCHEMA_VERSION;
  system: string;
  user: string;
};
