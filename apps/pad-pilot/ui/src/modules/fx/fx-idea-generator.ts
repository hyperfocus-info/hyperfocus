import { FxNodeType, cloneFxChainState, normalizeFxChainState, type FxChainState } from "./fx-chain-state";
import { createDefaultNodeState, findNodeControlDefinition, resolveNodeConfig, syncNodeLegacyParams } from "./node-registry/registry";

export type FxIdeaNode = {
  name: string;
  type: FxNodeType;
  values?: Record<string, string | number | boolean>;
  mix?: number;
};

export type FxIdeaRecipe = {
  name: string;
  tags: readonly string[];
  nodes: readonly FxIdeaNode[];
};

export const FX_IDEA_RECIPES: readonly FxIdeaRecipe[] = [
  { name: "Wide Dream", tags: ["dreamy", "wide", "smooth"], nodes: [
    { name: "Slow Chorus", type: FxNodeType.CHORUS, values: { rateHz: 0.22, depth: 0.7, width: 0.9 }, mix: 0.55 },
    { name: "Dream Hall", type: FxNodeType.REVERB, values: { decay: 5.4, damping: 6200, focusMix: 0.42 }, mix: 0.45 },
    { name: "Open Width", type: FxNodeType.STEREO_IMAGER, values: { widthPercent: 135 }, mix: 1 },
  ] },
  { name: "Reverse Bloom", tags: ["reverse", "dreamy", "experimental"], nodes: [
    { name: "Reverse Grain", type: FxNodeType.REVERSE, values: { windowMs: 720, pitchSemitones: 0, forwardMix: 0.08 }, mix: 0.82 },
    { name: "Bloom", type: FxNodeType.REVERB, values: { decay: 6.8, focusMix: 0.5, modulationDepth: 0.7 }, mix: 0.5 },
    { name: "Drift", type: FxNodeType.PITCH_DRIFT, values: { depth: 0.22, rateHz: 0.11 }, mix: 0.7 },
  ] },
  { name: "Pulse Circuit", tags: ["rhythmic", "digital", "motion"], nodes: [
    { name: "Tempo Pulse", type: FxNodeType.TREMOLO, values: { depth: 0.72, lfoShape: "Square", stereoPhaseOffset: 0.25 }, mix: 1 },
    { name: "Digital Echo", type: FxNodeType.DELAY, values: { character: "Digital", feedback: 0.48, focusMix: 0.36, width: 1 }, mix: 0.7 },
    { name: "Edge", type: FxNodeType.SATURATION, values: { character: "Transistor", drive: 0.28, tone: 0.68 }, mix: 0.5 },
  ] },
  { name: "Warm Glue", tags: ["warm", "glue", "smooth"], nodes: [
    { name: "Tube Color", type: FxNodeType.SATURATION, values: { character: "Tube", drive: 0.3, tone: 0.42 }, mix: 0.7 },
    { name: "Body EQ", type: FxNodeType.EQ, values: { lowShelfFrequencyHz: 140, lowShelfGainDb: 1.8, highShelfGainDb: -1 }, mix: 1 },
    { name: "Glue", type: FxNodeType.COMPRESSOR, values: { thresholdDb: -15, ratio: 2.2, attackMs: 18, releaseMs: 140 }, mix: 1 },
  ] },
  { name: "Cassette Haze", tags: ["lofi", "warm", "vintage"], nodes: [
    { name: "Cassette", type: FxNodeType.TAPE_SATURATION, values: { drive: 0.52, warmth: 0.8, wowFlutter: 0.28 }, mix: 0.75 },
    { name: "Worn Pitch", type: FxNodeType.PITCH_DRIFT, values: { depth: 0.3, rateHz: 0.18, rangeCents: 16 }, mix: 0.8 },
    { name: "Soft Top", type: FxNodeType.EQ, values: { highShelfFrequencyHz: 6200, highShelfGainDb: -4 }, mix: 1 },
  ] },
  { name: "Glass Air", tags: ["bright", "wide", "clean"], nodes: [
    { name: "Air", type: FxNodeType.EXCITER, values: { harmonicDrive: 0.3, mix: 0.25 }, mix: 0.7 },
    { name: "Glass Plate", type: FxNodeType.REVERB, values: { mode: "Plate", decay: 2.7, focusMix: 0.3 }, mix: 0.42 },
    { name: "Stereo Air", type: FxNodeType.STEREO_IMAGER, values: { widthPercent: 125 }, mix: 1 },
  ] },
  { name: "Crushed Radio", tags: ["lofi", "dirty", "digital"], nodes: [
    { name: "Radio EQ", type: FxNodeType.EQ, values: { lowShelfGainDb: -8, highShelfGainDb: -8, band0FrequencyHz: 1600, band0Q: 1.8, band0GainDb: 3 }, mix: 1 },
    { name: "Crusher", type: FxNodeType.BITCRUSHER, values: { bits: 8, downsample: 5, wetDry: 0.72 }, mix: 0.8 },
    { name: "Fold", type: FxNodeType.SATURATION, values: { character: "Fold", drive: 0.42, tone: 0.58 }, mix: 0.5 },
  ] },
  { name: "Rotary Soul", tags: ["vintage", "motion", "warm"], nodes: [
    { name: "Tube Pre", type: FxNodeType.SATURATION, values: { character: "Tube", drive: 0.34, tone: 0.48 }, mix: 0.65 },
    { name: "Rotary", type: FxNodeType.ROTARY_SPEAKER, values: { drive: 0.25, hornDrumBalance: 0.58 }, mix: 0.9 },
    { name: "Cab EQ", type: FxNodeType.EQ, values: { lowShelfFrequencyHz: 110, lowShelfGainDb: 1.2, highShelfFrequencyHz: 7200, highShelfGainDb: -2.5 }, mix: 1 },
  ] },
  { name: "Gate Snap", tags: ["punchy", "clean", "rhythmic"], nodes: [
    { name: "Tight Gate", type: FxNodeType.NOISE_GATE, values: { thresholdDb: -42, releaseMs: 70 }, mix: 1 },
    { name: "Snap", type: FxNodeType.TRANSIENT_SHAPER, values: { attack: 0.55, sustain: -0.18 }, mix: 1 },
    { name: "Control", type: FxNodeType.COMPRESSOR, values: { thresholdDb: -10, ratio: 2, attackMs: 24 }, mix: 1 },
  ] },
  { name: "Underwater", tags: ["dark", "space", "smooth"], nodes: [
    { name: "Submerged EQ", type: FxNodeType.EQ, values: { highShelfFrequencyHz: 3600, highShelfGainDb: -10, lowShelfGainDb: 2 }, mix: 1 },
    { name: "BBD Drift", type: FxNodeType.DELAY, values: { character: "BBD", highCutHz: 4200, feedback: 0.55, focusMix: 0.4, saturation: 0.3 }, mix: 0.68 },
    { name: "Slow Chorus", type: FxNodeType.CHORUS, values: { rateHz: 0.15, depth: 0.58 }, mix: 0.48 },
  ] },
  { name: "Doppler Orbit", tags: ["motion", "experimental", "wide"], nodes: [
    { name: "Orbit", type: FxNodeType.AUTO_PAN, values: { rateHz: 0.3, amount: 0.88, smoothing: 0.3 }, mix: 1 },
    { name: "Doppler", type: FxNodeType.PITCH_DRIFT, values: { depth: 0.45, rateHz: 0.3, rangeCents: 34 }, mix: 0.75 },
    { name: "Trail", type: FxNodeType.DELAY, values: { feedback: 0.36, focusMix: 0.26, width: 1 }, mix: 0.55 },
  ] },
  { name: "Phase Mist", tags: ["dreamy", "motion", "space"], nodes: [
    { name: "Phase Sweep", type: FxNodeType.PHASER, values: { speedHz: 0.18, resonance: 0.62, stereoPhaseOffset: 0.4 }, mix: 0.78 },
    { name: "Mist", type: FxNodeType.REVERB, values: { decay: 4.6, focusMix: 0.38 }, mix: 0.45 },
    { name: "Width", type: FxNodeType.STEREO_IMAGER, values: { widthPercent: 132 }, mix: 1 },
  ] },
] as const;

export const FX_IDEA_TAGS = [...new Set(FX_IDEA_RECIPES.flatMap((recipe) => recipe.tags))].sort();

export function selectFxIdeaRecipe(tags: readonly string[], random = Math.random) {
  const selected = new Set(tags);
  const scores = FX_IDEA_RECIPES.map((recipe) => recipe.tags.reduce((score, tag) => score + Number(selected.has(tag)), 0));
  const bestScore = Math.max(...scores);
  const candidates = FX_IDEA_RECIPES.filter((_, index) => scores[index] === bestScore);
  return candidates[Math.min(candidates.length - 1, Math.floor(Math.max(0, random()) * candidates.length))]!;
}

export function generateFxIdea(state: FxChainState, chainId: number, tags: readonly string[], random = Math.random) {
  return generateFxRecipe(state, chainId, selectFxIdeaRecipe(tags, random));
}

export function generateFxRecipe(state: FxChainState, chainId: number, recipe: FxIdeaRecipe) {
  const next = cloneFxChainState(state);
  const chain = next.chains.find((entry) => entry.id === chainId) ?? next.chains[0];
  if (!chain) return { name: "", state: normalizeFxChainState(next) };
  chain.name = recipe.name;
  chain.nodes = recipe.nodes.map((blueprint, order) => {
    const node = createDefaultNodeState(blueprint.type, order + 1, order, blueprint.name);
    node.mix = blueprint.mix ?? 1;
    const config = resolveNodeConfig(node);
    for (const [key, value] of Object.entries(blueprint.values ?? {})) {
      findNodeControlDefinition(node.type, key)?.setValue(config, value as never);
    }
    return syncNodeLegacyParams(node);
  });
  next.selectedPresetId = "";
  return { name: recipe.name, state: normalizeFxChainState(next) };
}
