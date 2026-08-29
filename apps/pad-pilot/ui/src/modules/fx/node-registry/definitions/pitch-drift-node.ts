import { create } from "@bufbuild/protobuf";
import { FxNodeType, PitchDriftNodeConfigSchema, TempoSyncStateSchema } from "../../../../proto/generated/fx-chain-pb";
import { createLegacyParamState, createNodeDefinition, createNumberControl, createSelectControl } from "../types";

export const PitchDriftNodeDefinition = createNodeDefinition({
  type: FxNodeType.PITCH_DRIFT,
  defaultName: "Pitch Drift",
  configCase: "pitchDriftConfig",
  configSchema: PitchDriftNodeConfigSchema,
  createDefaultConfig: () =>
    create(PitchDriftNodeConfigSchema, {
      depth: 0.15,
      rateHz: 0.4,
      driftShape: "Analog",
      stereoOffset: 0.25,
      rangeCents: 24,
      rateSync: create(TempoSyncStateSchema, { enabled: false, divisionIndex: 8 }),
    }),
  createLegacyParams: (config) => [
    createLegacyParamState(1, "Depth", config.depth, 0, 1),
    createLegacyParamState(2, "Rate", config.rateHz, 0.05, 10, "Hz"),
    createLegacyParamState(3, "Range", config.rangeCents, 0, 100, "ct"),
    createLegacyParamState(4, "Rate Sync", config.rateSync?.enabled ? 1 : 0, 0, 1),
    createLegacyParamState(5, "Rate Division", config.rateSync?.divisionIndex ?? 8, 0, 19),
  ],
  rackControls: [
    createNumberControl("depth", "Depth", (config) => config.depth, (config, value) => (config.depth = value), { min: 0, max: 1 }),
    createNumberControl("rateHz", "Rate", (config) => config.rateHz, (config, value) => (config.rateHz = value), {
      min: 0.05,
      max: 10,
      unit: "Hz",
      timingSync: {
        valueMode: "period-hz",
        freeParamId: 2,
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
  ],
  focusControls: [
    createSelectControl("driftShape", "Shape", [{ label: "Analog", value: "Analog" }, { label: "Sine", value: "Sine" }, { label: "Triangle", value: "Triangle" }, { label: "Random", value: "Random" }], (config) => config.driftShape, (config, value) => (config.driftShape = value)),
    createNumberControl("stereoOffset", "Stereo Offset", (config) => config.stereoOffset, (config, value) => (config.stereoOffset = value), { min: 0, max: 1 }),
    createNumberControl("rangeCents", "Range", (config) => config.rangeCents, (config, value) => (config.rangeCents = value), { min: 0, max: 100, unit: "ct" }),
  ],
  selectPayload: (frame) => (frame.payload.case === "pitchDrift" ? frame.payload.value : null),
});
