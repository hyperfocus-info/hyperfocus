import { FxNodeType } from "./fx-chain-state";
import { type FxIdeaRecipe } from "./fx-idea-generator";

export type FxUtilityPresetIntensity = "light" | "medium";

export type FxUtilityPresetRecipe = FxIdeaRecipe & {
  intensity: FxUtilityPresetIntensity;
  jobs: readonly string[];
  sources: readonly string[];
};

export const FX_UTILITY_PRESET_RECIPES = [
  {
    name: "Mix · Mud Control · Light",
    intensity: "light",
    jobs: ["reduce rumble", "clear low-mid mud"],
    sources: ["full mix", "instrument bus"],
    tags: ["utility", "mix", "clean", "mud", "low-mid"],
    nodes: [
      { name: "Low Cleanup", type: FxNodeType.EQ, values: { lowShelfFrequencyHz: 85, lowShelfGainDb: -2.2, band0FrequencyHz: 310, band0Q: 1.05, band0GainDb: -2.4, highShelfFrequencyHz: 9000, highShelfGainDb: 0, masterGainDb: 0.3 }, mix: 1 },
    ],
  },
  {
    name: "Mix · Harsh Edge Softener · Light",
    intensity: "light",
    jobs: ["soften harshness", "smooth brittle top end"],
    sources: ["full mix", "instrument bus", "vocal"],
    tags: ["utility", "mix", "smooth", "harsh", "bright"],
    nodes: [
      { name: "Edge Control", type: FxNodeType.EQ, values: { lowShelfFrequencyHz: 120, lowShelfGainDb: 0, band0FrequencyHz: 3900, band0Q: 1.35, band0GainDb: -2.2, highShelfFrequencyHz: 10500, highShelfGainDb: -1.2, masterGainDb: 0.3 }, mix: 1 },
      { name: "Soft Tape", type: FxNodeType.TAPE_SATURATION, values: { drive: 0.12, warmth: 0.58, tapeSpeedIps: "30", wowFlutter: 0.01, hysteresis: 0.12, bias: 0.04 }, mix: 0.42 },
    ],
  },
  {
    name: "Recorded Audio · Noise Gate Clean · Medium",
    intensity: "medium",
    jobs: ["reduce room noise", "clean pauses"],
    sources: ["vocal", "guitar", "recorded audio"],
    tags: ["utility", "recording", "gate", "noise", "clean"],
    nodes: [
      { name: "Gentle Gate", type: FxNodeType.NOISE_GATE, values: { thresholdDb: -45, rangeDb: -18, attackMs: 3, holdMs: 45, releaseMs: 140 }, mix: 1 },
      { name: "Level Control", type: FxNodeType.COMPRESSOR, values: { thresholdDb: -14, ratio: 2, makeupDb: 0.8, attackMs: 24, releaseMs: 140 }, mix: 0.66 },
    ],
  },
  {
    name: "Bus · Peak Tamer · Medium",
    intensity: "medium",
    jobs: ["reduce sharp peaks", "preserve body"],
    sources: ["drum bus", "instrument bus", "full mix"],
    tags: ["utility", "bus", "peaks", "transient", "control"],
    nodes: [
      { name: "Peak Rounder", type: FxNodeType.TRANSIENT_SHAPER, values: { attack: -0.18, sustain: 0.02, softClip: true, gainDb: -0.6, sensitivity: 0.68 }, mix: 0.9 },
      { name: "Fast Catch", type: FxNodeType.COMPRESSOR, values: { thresholdDb: -9, ratio: 4, makeupDb: 0.4, attackMs: 1.2, releaseMs: 58 }, mix: 0.82 },
    ],
  },
  {
    name: "Mix Bus · Gentle Glue · Light",
    intensity: "light",
    jobs: ["add bus cohesion", "preserve transients"],
    sources: ["mix bus", "instrument bus"],
    tags: ["utility", "mix-bus", "glue", "subtle", "compression"],
    nodes: [
      { name: "Slow Glue", type: FxNodeType.COMPRESSOR, values: { thresholdDb: -10, ratio: 1.7, makeupDb: 0.5, attackMs: 30, releaseMs: 180 }, mix: 0.84 },
      { name: "Barely Tape", type: FxNodeType.TAPE_SATURATION, values: { drive: 0.12, warmth: 0.52, tapeSpeedIps: "30", wowFlutter: 0.01, hysteresis: 0.1, bias: 0.03 }, mix: 0.36 },
    ],
  },
  {
    name: "Drums · Punch · Medium",
    intensity: "medium",
    jobs: ["increase attack", "tighten drum body"],
    sources: ["drum bus", "drum loop", "percussion"],
    tags: ["utility", "drums", "punch", "attack", "tight"],
    nodes: [
      { name: "Attack Lift", type: FxNodeType.TRANSIENT_SHAPER, values: { attack: 0.38, sustain: -0.08, softClip: true, gainDb: -0.8, sensitivity: 0.68 }, mix: 0.9 },
      { name: "Punch Control", type: FxNodeType.COMPRESSOR, values: { thresholdDb: -14, ratio: 3, makeupDb: 1.2, attackMs: 24, releaseMs: 82 }, mix: 0.78 },
    ],
  },
  {
    name: "Drums · Sustain Lift · Medium",
    intensity: "medium",
    jobs: ["increase drum sustain", "add room body"],
    sources: ["drum bus", "drum loop", "percussion"],
    tags: ["utility", "drums", "sustain", "body", "room"],
    nodes: [
      { name: "Body Lift", type: FxNodeType.TRANSIENT_SHAPER, values: { attack: 0.06, sustain: 0.38, softClip: false, gainDb: -0.7, sensitivity: 0.62 }, mix: 0.88 },
      { name: "Sustain Leveler", type: FxNodeType.COMPRESSOR, values: { thresholdDb: -16, ratio: 2.2, makeupDb: 1.4, attackMs: 22, releaseMs: 165 }, mix: 0.72 },
    ],
  },
  {
    name: "Bus · Parallel Density · Medium",
    intensity: "medium",
    jobs: ["add parallel density", "retain dry attack"],
    sources: ["drum bus", "instrument bus", "vocal bus"],
    tags: ["utility", "bus", "parallel", "density", "compression"],
    nodes: [
      { name: "Parallel Crush", type: FxNodeType.COMPRESSOR, values: { thresholdDb: -24, ratio: 6, makeupDb: 4, attackMs: 8, releaseMs: 92 }, mix: 0.46 },
      { name: "Density Color", type: FxNodeType.SATURATION, values: { character: "Tube", drive: 0.24, tone: 0.5, bias: 0.05, outputGainDb: -1 }, mix: 0.44 },
    ],
  },
  {
    name: "Bass · Mono Safe · Light",
    intensity: "light",
    jobs: ["center low frequencies", "improve mono translation"],
    sources: ["bass", "808 bass", "bass bus"],
    tags: ["utility", "bass", "mono", "translation", "low-end"],
    nodes: [
      { name: "Bass Balance", type: FxNodeType.EQ, values: { lowShelfFrequencyHz: 72, lowShelfGainDb: 0.8, band0FrequencyHz: 285, band0Q: 1.05, band0GainDb: -1.3, highShelfFrequencyHz: 7000, highShelfGainDb: 0, masterGainDb: -0.2 }, mix: 1 },
      { name: "Mono Foundation", type: FxNodeType.STEREO_IMAGER, values: { widthPercent: 100, bassMonoCrossoverHz: 180, stereoBalance: 0.5, pan: 0 }, mix: 1 },
    ],
  },
  {
    name: "Mix · Wide Highs Only · Light",
    intensity: "light",
    jobs: ["increase stereo width", "protect low-end center"],
    sources: ["full mix", "synth bus", "instrument bus"],
    tags: ["utility", "mix", "wide", "mono-bass", "stereo"],
    nodes: [
      { name: "High Band Lift", type: FxNodeType.EQ, values: { lowShelfFrequencyHz: 120, lowShelfGainDb: 0, band0FrequencyHz: 1800, band0Q: 0.8, band0GainDb: 0, highShelfFrequencyHz: 8500, highShelfGainDb: 0.5, masterGainDb: -0.2 }, mix: 1 },
      { name: "Bass-Safe Width", type: FxNodeType.STEREO_IMAGER, values: { widthPercent: 124, bassMonoCrossoverHz: 240, stereoBalance: 0.5, pan: 0 }, mix: 1 },
    ],
  },
  {
    name: "Mix · Center Focus · Light",
    intensity: "light",
    jobs: ["strengthen center image", "reduce diffuse width"],
    sources: ["full mix", "instrument bus"],
    tags: ["utility", "mix", "center", "focus", "stereo"],
    nodes: [
      { name: "Focused Field", type: FxNodeType.STEREO_IMAGER, values: { widthPercent: 82, bassMonoCrossoverHz: 180, stereoBalance: 0.5, pan: 0 }, mix: 1 },
      { name: "Center Glue", type: FxNodeType.COMPRESSOR, values: { thresholdDb: -9, ratio: 1.6, makeupDb: 0.3, attackMs: 32, releaseMs: 170 }, mix: 0.58 },
    ],
  },
  {
    name: "Mix · Narrow and Stable · Medium",
    intensity: "medium",
    jobs: ["reduce excessive width", "stabilize stereo image"],
    sources: ["full mix", "sample bus", "synth bus"],
    tags: ["utility", "mix", "narrow", "stable", "mono"],
    nodes: [
      { name: "Stable Width", type: FxNodeType.STEREO_IMAGER, values: { widthPercent: 65, bassMonoCrossoverHz: 240, stereoBalance: 0.5, pan: 0 }, mix: 1 },
      { name: "Image Control", type: FxNodeType.COMPRESSOR, values: { thresholdDb: -11, ratio: 1.8, makeupDb: 0.4, attackMs: 28, releaseMs: 145 }, mix: 0.62 },
    ],
  },
  {
    name: "Vocal · Clean Start · Light",
    intensity: "light",
    jobs: ["clarify vocal", "control vocal dynamics"],
    sources: ["lead vocal", "backing vocal"],
    tags: ["utility", "vocal", "clean", "presence", "control"],
    nodes: [
      { name: "Vocal Cleanup", type: FxNodeType.EQ, values: { lowShelfFrequencyHz: 150, lowShelfGainDb: -1.5, band0FrequencyHz: 2500, band0Q: 0.9, band0GainDb: 1.2, highShelfFrequencyHz: 10000, highShelfGainDb: 1, masterGainDb: -0.4 }, mix: 1 },
      { name: "Vocal Control", type: FxNodeType.COMPRESSOR, values: { thresholdDb: -16, ratio: 2.5, makeupDb: 1.2, attackMs: 18, releaseMs: 120 }, mix: 0.8 },
      { name: "Pause Cleanup", type: FxNodeType.NOISE_GATE, values: { thresholdDb: -55, rangeDb: -10, attackMs: 4, holdMs: 45, releaseMs: 155 }, mix: 1 },
    ],
  },
  {
    name: "808 · Translation · Medium",
    intensity: "medium",
    jobs: ["add audible bass harmonics", "protect mono sub"],
    sources: ["808 bass", "bass", "bass bus"],
    tags: ["utility", "808", "bass", "translation", "harmonics"],
    nodes: [
      { name: "Translation Curve", type: FxNodeType.EQ, values: { lowShelfFrequencyHz: 60, lowShelfGainDb: 1, band0FrequencyHz: 900, band0Q: 0.9, band0GainDb: 2, highShelfFrequencyHz: 8000, highShelfGainDb: -2, masterGainDb: -1 }, mix: 1 },
      { name: "Audible Harmonics", type: FxNodeType.SATURATION, values: { character: "Tube", drive: 0.34, tone: 0.45, bias: 0.06, outputGainDb: -1.8 }, mix: 0.76 },
      { name: "Bass Control", type: FxNodeType.COMPRESSOR, values: { thresholdDb: -12, ratio: 2.5, makeupDb: 0.8, attackMs: 20, releaseMs: 105 }, mix: 0.72 },
      { name: "Sub Center", type: FxNodeType.STEREO_IMAGER, values: { widthPercent: 90, bassMonoCrossoverHz: 220, stereoBalance: 0.5, pan: 0 }, mix: 1 },
    ],
  },
  {
    name: "Drum Loop · Tightener · Medium",
    intensity: "medium",
    jobs: ["shorten drum tails", "tighten groove"],
    sources: ["drum loop", "drum bus", "percussion"],
    tags: ["utility", "drums", "tight", "gate", "transient"],
    nodes: [
      { name: "Tail Gate", type: FxNodeType.NOISE_GATE, values: { thresholdDb: -48, rangeDb: -10, attackMs: 1, holdMs: 35, releaseMs: 76 }, mix: 1 },
      { name: "Tight Shape", type: FxNodeType.TRANSIENT_SHAPER, values: { attack: 0.25, sustain: -0.22, softClip: true, gainDb: -0.6, sensitivity: 0.7 }, mix: 0.9 },
      { name: "Groove Clamp", type: FxNodeType.COMPRESSOR, values: { thresholdDb: -13, ratio: 3, makeupDb: 1, attackMs: 18, releaseMs: 80 }, mix: 0.76 },
    ],
  },
  {
    name: "Synth · Polish · Light",
    intensity: "light",
    jobs: ["smooth synth tone", "add restrained width"],
    sources: ["synth", "synth lead", "synth pad"],
    tags: ["utility", "synth", "polish", "smooth", "wide"],
    nodes: [
      { name: "Synth Balance", type: FxNodeType.EQ, values: { lowShelfFrequencyHz: 120, lowShelfGainDb: -1, band0FrequencyHz: 450, band0Q: 0.9, band0GainDb: -0.8, highShelfFrequencyHz: 9000, highShelfGainDb: 1.2, masterGainDb: -0.4 }, mix: 1 },
      { name: "Subtle Ensemble", type: FxNodeType.CHORUS, values: { rateHz: 0.24, depth: 0.22, width: 0.8, voiceDelayMs: 14, feedback: 0.05 }, mix: 0.32 },
      { name: "Soft Finish", type: FxNodeType.SATURATION, values: { character: "Soft Clip", drive: 0.12, tone: 0.58, bias: 0.02, outputGainDb: -0.4 }, mix: 0.36 },
    ],
  },
  {
    name: "Guitar · Double · Medium",
    intensity: "medium",
    jobs: ["create double-track width", "retain center definition"],
    sources: ["electric guitar", "clean guitar", "acoustic guitar"],
    tags: ["utility", "guitar", "double", "wide", "short-delay"],
    nodes: [
      { name: "Double Voice", type: FxNodeType.CHORUS, values: { rateHz: 0.18, depth: 0.2, width: 0.9, voiceDelayMs: 18, feedback: 0.04 }, mix: 0.46 },
      { name: "Short Double", type: FxNodeType.DELAY, values: { time: 0.09, feedback: 0.06, focusMix: 0.12, lowCutHz: 120, highCutHz: 9000, width: 0.85, saturation: 0.03, character: "Digital" }, mix: 0.32 },
      { name: "Guitar Space", type: FxNodeType.EQ, values: { lowShelfFrequencyHz: 120, lowShelfGainDb: -1.5, band0FrequencyHz: 1800, band0Q: 0.85, band0GainDb: 0.8, highShelfFrequencyHz: 8500, highShelfGainDb: -0.5, masterGainDb: -0.2 }, mix: 1 },
    ],
  },
  {
    name: "Sample · Resuscitator · Medium",
    intensity: "medium",
    jobs: ["revive dull samples", "add body and movement"],
    sources: ["sample", "sample bus", "drum loop"],
    tags: ["utility", "sample", "revive", "body", "texture"],
    nodes: [
      { name: "Sample Body", type: FxNodeType.TAPE_SATURATION, values: { drive: 0.3, warmth: 0.65, tapeSpeedIps: "15", wowFlutter: 0.06, hysteresis: 0.22, bias: 0.08 }, mix: 0.64 },
      { name: "Sample Presence", type: FxNodeType.EQ, values: { lowShelfFrequencyHz: 105, lowShelfGainDb: 0.5, band0FrequencyHz: 1600, band0Q: 0.85, band0GainDb: 1.5, highShelfFrequencyHz: 8500, highShelfGainDb: 0.8, masterGainDb: -0.8 }, mix: 1 },
      { name: "Life Shape", type: FxNodeType.TRANSIENT_SHAPER, values: { attack: 0.18, sustain: 0.15, softClip: true, gainDb: -0.5, sensitivity: 0.58 }, mix: 0.72 },
      { name: "Sample Field", type: FxNodeType.STEREO_IMAGER, values: { widthPercent: 112, bassMonoCrossoverHz: 140, stereoBalance: 0.5, pan: 0 }, mix: 1 },
    ],
  },
] as const satisfies readonly FxUtilityPresetRecipe[];
