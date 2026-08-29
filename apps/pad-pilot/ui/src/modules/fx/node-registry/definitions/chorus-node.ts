import { create } from "@bufbuild/protobuf";
import { ChorusNodeConfigSchema, FxNodeType, TempoSyncStateSchema } from "../../../../proto/generated/fx-chain-pb";
import { createLegacyParamState, createNodeDefinition, createNumberControl } from "../types";

export const ChorusNodeDefinition = createNodeDefinition({
  type: FxNodeType.CHORUS,
  defaultName: "Chorus",
  configCase: "chorusConfig",
  configSchema: ChorusNodeConfigSchema,
  createDefaultConfig: () =>
    create(ChorusNodeConfigSchema, {
      rateHz: 0.65,
      depth: 0.35,
      voices: 4,
      width: 0.6,
      voiceDelayMs: 14,
      feedback: 0.1,
      rateSync: create(TempoSyncStateSchema, { enabled: false, divisionIndex: 6 }),
      voiceDelaySync: create(TempoSyncStateSchema, { enabled: false, divisionIndex: 1 }),
    }),
  createLegacyParams: (config) => [
    createLegacyParamState(1, "Rate", config.rateHz, 0.05, 10, "Hz"),
    createLegacyParamState(2, "Depth", config.depth, 0, 1),
    createLegacyParamState(3, "Feedback", config.feedback, 0, 0.95),
    createLegacyParamState(4, "Rate Sync", config.rateSync?.enabled ? 1 : 0, 0, 1),
    createLegacyParamState(5, "Rate Division", config.rateSync?.divisionIndex ?? 6, 0, 19),
    createLegacyParamState(6, "Voice Delay", config.voiceDelayMs, 1, 40, "ms"),
    createLegacyParamState(7, "Voice Delay Sync", config.voiceDelaySync?.enabled ? 1 : 0, 0, 1),
    createLegacyParamState(8, "Voice Delay Division", config.voiceDelaySync?.divisionIndex ?? 1, 0, 10),
  ],
  rackControls: [
    createNumberControl("rateHz", "Rate", (config) => config.rateHz, (config, value) => (config.rateHz = value), {
      min: 0.05,
      max: 10,
      unit: "Hz",
      timingSync: {
        valueMode: "period-hz",
        freeParamId: 1,
        syncEnabledParamId: 4,
        syncDivisionParamId: 5,
        getSyncEnabled: (config) => config.rateSync?.enabled ?? false,
        setSyncEnabled: (config, enabled) => {
          config.rateSync ??= create(TempoSyncStateSchema, { enabled: false, divisionIndex: 6 });
          config.rateSync.enabled = enabled;
        },
        getDivisionIndex: (config) => config.rateSync?.divisionIndex ?? 6,
        setDivisionIndex: (config, divisionIndex) => {
          config.rateSync ??= create(TempoSyncStateSchema, { enabled: false, divisionIndex: 6 });
          config.rateSync.divisionIndex = divisionIndex;
        },
      },
    }),
    createNumberControl("depth", "Depth", (config) => config.depth, (config, value) => (config.depth = value), { min: 0, max: 1 }),
  ],
  focusControls: [
    createNumberControl("width", "Width", (config) => config.width, (config, value) => (config.width = value), { min: 0, max: 1 }),
    createNumberControl("voiceDelayMs", "Voice Delay", (config) => config.voiceDelayMs, (config, value) => (config.voiceDelayMs = value), {
      min: 1,
      max: 40,
      unit: "ms",
      timingSync: {
        valueMode: "period-ms",
        maximumDivisionIndex: 10,
        freeParamId: 6,
        syncEnabledParamId: 7,
        syncDivisionParamId: 8,
        getSyncEnabled: (config) => config.voiceDelaySync?.enabled ?? false,
        setSyncEnabled: (config, enabled) => {
          config.voiceDelaySync ??= create(TempoSyncStateSchema, { enabled: false, divisionIndex: 1 });
          config.voiceDelaySync.enabled = enabled;
        },
        getDivisionIndex: (config) => config.voiceDelaySync?.divisionIndex ?? 1,
        setDivisionIndex: (config, divisionIndex) => {
          config.voiceDelaySync ??= create(TempoSyncStateSchema, { enabled: false, divisionIndex: 1 });
          config.voiceDelaySync.divisionIndex = divisionIndex;
        },
      },
    }),
    createNumberControl("feedback", "Feedback", (config) => config.feedback, (config, value) => (config.feedback = value), { min: 0, max: 0.95 }),
  ],
  selectPayload: (frame) => (frame.payload.case === "chorus" ? frame.payload.value : null),
});
