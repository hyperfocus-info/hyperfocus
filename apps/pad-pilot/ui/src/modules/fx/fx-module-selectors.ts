import { createMasterState, type ChainState, type FxChainState, type VisualizerFrame } from "./fx-chain-state";
import { type ChainPresetSummary, type PresetSummary, type TapView } from "./fx-types";
import { createMeterVisual, meterDbFromMix } from "./fx-visuals";
import { clamp } from "../../utils/math";

const FALLBACK_PRESETS: PresetSummary[] = [
  { id: "factory-cinematic", name: "Cinematic Impact" },
  { id: "factory-impact", name: "Monster Roar" },
  { id: "factory-atmosphere", name: "Atmosphere" },
];

export type FxPresetCatalogFilter = "all" | "creative" | "era" | "user" | "utility";

export function buildFxPresetItems(presets: readonly PresetSummary[], favoritePresetIds: readonly string[]) {
  const source = presets.length > 0 ? presets : FALLBACK_PRESETS;
  return source.map((preset) => {
    const favorite = favoritePresetIds.includes(preset.id);
    const kind = preset.id.startsWith("factory-") || preset.id.startsWith("pad_pilot_") || preset.id.startsWith("curated-") || preset.id.startsWith("utility-") ? "factory" : "user";
    const category = preset.category
      ?? (preset.id === "pad_pilot_empty"
        ? "system"
        : preset.id.startsWith("utility-")
          ? "utility"
          : /^curated-\d{4}s-/.test(preset.id)
            ? "era"
            : kind === "factory"
              ? "creative"
              : undefined);
    return {
      category,
      favorite,
      id: preset.id,
      kind,
      label: preset.name,
      description: preset.description ?? (kind === "factory" ? "Factory" : "User"),
      keywords: [...(preset.tags ?? []), ...(preset.sources ?? []), ...(preset.jobs ?? []), preset.intensity ?? ""],
    };
  });
}

export function filterFxPresetCatalogItems<T extends { category?: string; favorite: boolean; kind: string }>(
  items: readonly T[],
  filter: FxPresetCatalogFilter,
  favoritesOnly: boolean,
) {
  return items.filter((preset) => {
    if (favoritesOnly && !preset.favorite) {
      return false;
    }
    if (filter === "all") {
      return true;
    }
    if (filter === "user") {
      return preset.kind === "user";
    }
    return preset.category === filter;
  });
}

export function buildFxTapMap(visualizer: VisualizerFrame) {
  const taps = new Map<string, TapView>();
  for (const tap of visualizer.taps) {
    taps.set(`${tap.chainId}:${tap.nodeId}`, {
      inputPeakDb: tap.inputPeakDb,
      inputPeakDbLeft: tap.inputPeakDbLeft,
      inputPeakDbRight: tap.inputPeakDbRight,
      outputPeakDb: tap.outputPeakDb,
      outputPeakDbLeft: tap.outputPeakDbLeft,
      outputPeakDbRight: tap.outputPeakDbRight,
    });
  }
  return taps;
}

export function getActiveFxChain(chains: readonly ChainState[], activeChainId: number) {
  return chains.find((chain) => chain.id === activeChainId) ?? chains[0] ?? null;
}

export function getFxChainPresetItems(entries: readonly ChainPresetSummary[]) {
  return entries.map((preset) => ({
    favorite: preset.favorite,
    id: preset.id,
    kind: "session",
    label: preset.name,
    description: "Session",
  }));
}

export function getFxMasterState(working: FxChainState) {
  return working.master ?? createMasterState();
}

export function getFxMasterMeters(
  visualizer: VisualizerFrame,
  working: FxChainState,
  displayStereoMeters: boolean,
) {
  const masterState = getFxMasterState(working);
  return {
    input: createMeterVisual(
      visualizer.masterInputPeakDb <= 0 ? visualizer.masterInputPeakDb : meterDbFromMix(masterState.inputGainDb / 18 + 0.5),
      displayStereoMeters,
      visualizer.masterInputPeakDbLeft,
      visualizer.masterInputPeakDbRight,
    ),
    output: createMeterVisual(
      visualizer.masterOutputPeakDb <= 0 ? visualizer.masterOutputPeakDb : meterDbFromMix(masterState.outputGainDb / 18 + 0.5),
      displayStereoMeters,
      visualizer.masterOutputPeakDbLeft,
      visualizer.masterOutputPeakDbRight,
    ),
    reduction: visualizer.gainReductionDb,
  };
}

export function calculateFxPeakMatchedOutputGain(inputPeakDb: number, outputPeakDb: number, currentOutputGainDb: number) {
  if (!Number.isFinite(inputPeakDb) || !Number.isFinite(outputPeakDb) || inputPeakDb <= -96 || outputPeakDb <= -96) {
    return null;
  }
  return clamp(currentOutputGainDb + inputPeakDb - outputPeakDb, -18, 18);
}
