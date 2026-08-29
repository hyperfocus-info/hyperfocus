import { create } from "@bufbuild/protobuf";
import { FxNodeType, PhaserNodeConfigSchema, TempoSyncStateSchema } from "../../../../proto/generated/fx-chain-pb";
import { createLegacyParamState, createNodeDefinition, createNumberControl } from "../types";

export const PhaserNodeDefinition = createNodeDefinition({
  type: FxNodeType.PHASER,
  defaultName: "Phaser",
  configCase: "phaserConfig",
  configSchema: PhaserNodeConfigSchema,
  createDefaultConfig: () =>
    create(PhaserNodeConfigSchema, {
      speedHz: 0.7,
      centerFrequencyHz: 1200,
      stages: 4,
      resonance: 0.4,
      stereoPhaseOffset: 0.25,
      speedSync: create(TempoSyncStateSchema, { enabled: false, divisionIndex: 6 }),
    }),
  createLegacyParams: (config) => [
    createLegacyParamState(1, "Speed", config.speedHz, 0.05, 10, "Hz"),
    createLegacyParamState(2, "Center Freq", config.centerFrequencyHz, 80, 8000, "Hz"),
    createLegacyParamState(3, "Resonance", config.resonance, 0, 0.95),
    createLegacyParamState(4, "Speed Sync", config.speedSync?.enabled ? 1 : 0, 0, 1),
    createLegacyParamState(5, "Speed Division", config.speedSync?.divisionIndex ?? 6, 0, 19),
  ],
  rackControls: [
    createNumberControl("speedHz", "Speed", (config) => config.speedHz, (config, value) => (config.speedHz = value), {
      min: 0.05,
      max: 10,
      unit: "Hz",
      timingSync: {
        valueMode: "period-hz",
        freeParamId: 1,
        syncEnabledParamId: 4,
        syncDivisionParamId: 5,
        getSyncEnabled: (config) => config.speedSync?.enabled ?? false,
        setSyncEnabled: (config, enabled) => {
          config.speedSync ??= create(TempoSyncStateSchema, { enabled: false, divisionIndex: 6 });
          config.speedSync.enabled = enabled;
        },
        getDivisionIndex: (config) => config.speedSync?.divisionIndex ?? 6,
        setDivisionIndex: (config, divisionIndex) => {
          config.speedSync ??= create(TempoSyncStateSchema, { enabled: false, divisionIndex: 6 });
          config.speedSync.divisionIndex = divisionIndex;
        },
      },
    }),
    createNumberControl("centerFrequencyHz", "Center Freq", (config) => config.centerFrequencyHz, (config, value) => (config.centerFrequencyHz = value), { min: 80, max: 8000, unit: "Hz" }),
  ],
  focusControls: [
    createNumberControl("stages", "Stages", (config) => config.stages, (config, value) => (config.stages = Math.round(value)), { min: 2, max: 12, step: 1 }),
    createNumberControl("resonance", "Resonance", (config) => config.resonance, (config, value) => (config.resonance = value), { min: 0, max: 0.95 }),
    createNumberControl("stereoPhaseOffset", "Stereo Phase", (config) => config.stereoPhaseOffset, (config, value) => (config.stereoPhaseOffset = value), { min: 0, max: 1 }),
  ],
  selectPayload: (frame) => (frame.payload.case === "phaser" ? frame.payload.value : null),
});
