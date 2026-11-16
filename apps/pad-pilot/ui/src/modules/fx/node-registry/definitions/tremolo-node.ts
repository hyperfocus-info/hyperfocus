import { create } from "@bufbuild/protobuf";
import { FxNodeType, TempoSyncStateSchema, TremoloNodeConfigSchema } from "../../../../proto/generated/fx-chain-pb";
import { createLegacyParamState, createNodeDefinition, createNumberControl, createSelectControl } from "../types";

const LFO_SHAPES = ["Sine", "Tri", "Square", "Random"] as const;

export const TremoloNodeDefinition = createNodeDefinition({
  type: FxNodeType.TREMOLO,
  defaultName: "Tremolo",
  configCase: "tremoloConfig",
  configSchema: TremoloNodeConfigSchema,
  createDefaultConfig: () => create(TremoloNodeConfigSchema, {
    rateHz: 4,
    depth: 0.6,
    lfoShape: "Sine",
    stereoPhaseOffset: 0,
    smoothing: 0.15,
    rateSync: create(TempoSyncStateSchema, { enabled: false, divisionIndex: 8 }),
  }),
  createLegacyParams: (config) => [
    createLegacyParamState(1, "Rate", config.rateHz, 0.05, 20, "Hz"),
    createLegacyParamState(2, "Depth", config.depth, 0, 1),
    createLegacyParamState(3, "Stereo Phase", config.stereoPhaseOffset, 0, 1),
    createLegacyParamState(4, "Rate Sync", config.rateSync?.enabled ? 1 : 0, 0, 1),
    createLegacyParamState(5, "Rate Division", config.rateSync?.divisionIndex ?? 8, 0, 19),
    createLegacyParamState(6, "Smoothing", config.smoothing, 0, 1),
    createLegacyParamState(7, "Shape", Math.max(0, LFO_SHAPES.findIndex((value) => value === config.lfoShape)), 0, LFO_SHAPES.length - 1),
  ],
  rackControls: [
    createNumberControl("rateHz", "Rate", (config) => config.rateHz, (config, value) => (config.rateHz = value), {
      min: 0.05,
      max: 20,
      unit: "Hz",
      timingSync: {
        valueMode: "period-hz",
        freeParamId: 1,
        syncEnabledParamId: 4,
        syncDivisionParamId: 5,
        getSyncEnabled: (config) => config.rateSync?.enabled ?? false,
        setSyncEnabled: (config, enabled) => {
          config.rateSync ??= create(TempoSyncStateSchema, { enabled: false, divisionIndex: 8 });
          config.rateSync.enabled = enabled;
        },
        getDivisionIndex: (config) => config.rateSync?.divisionIndex ?? 8,
        setDivisionIndex: (config, divisionIndex) => {
          config.rateSync ??= create(TempoSyncStateSchema, { enabled: false, divisionIndex: 8 });
          config.rateSync.divisionIndex = divisionIndex;
        },
      },
    }),
    createNumberControl("depth", "Depth", (config) => config.depth, (config, value) => (config.depth = value), { min: 0, max: 1 }),
    createNumberControl("stereoPhaseOffset", "Stereo Phase", (config) => config.stereoPhaseOffset, (config, value) => (config.stereoPhaseOffset = value), { min: 0, max: 1 }),
  ],
  focusControls: [
    createSelectControl("lfoShape", "Shape", LFO_SHAPES.map((value) => ({ label: value, value })), (config) => config.lfoShape, (config, value) => (config.lfoShape = value)),
    createNumberControl("smoothing", "Smoothing", (config) => config.smoothing, (config, value) => (config.smoothing = value), { min: 0, max: 1 }),
  ],
  selectPayload: () => null,
});
