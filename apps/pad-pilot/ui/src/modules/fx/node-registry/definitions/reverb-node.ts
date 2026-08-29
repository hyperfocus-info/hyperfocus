import { create } from "@bufbuild/protobuf";
import { FxNodeType, ReverbNodeConfigSchema, TempoSyncStateSchema } from "../../../../proto/generated/fx-chain-pb";
import { createLegacyParamState, createNodeDefinition, createNumberControl, createSelectControl } from "../types";

export const ReverbNodeDefinition = createNodeDefinition({
  type: FxNodeType.REVERB,
  defaultName: "Reverb",
  configCase: "reverbConfig",
  configSchema: ReverbNodeConfigSchema,
  createDefaultConfig: () =>
    create(ReverbNodeConfigSchema, {
      mode: "Hall",
      decay: 1.2,
      size: 0.72,
      focusMix: 0.45,
      damping: 0.35,
      preDelayMs: 18,
      modulationSpeedHz: 0.35,
      modulationDepth: 0.2,
      shimmerFeedback: 0.15,
      preDelaySync: create(TempoSyncStateSchema, { enabled: false, divisionIndex: 4 }),
      modulationSpeedSync: create(TempoSyncStateSchema, { enabled: false, divisionIndex: 8 }),
    }),
  createLegacyParams: (config) => [
    createLegacyParamState(1, "Decay", config.decay, 0.2, 12, "s"),
    createLegacyParamState(2, "Size", config.size, 0, 1, "%"),
    createLegacyParamState(3, "Mix", config.focusMix, 0, 1, "%"),
    createLegacyParamState(4, "Pre-delay", config.preDelayMs, 0, 1000, "ms"),
    createLegacyParamState(5, "Pre-delay Sync", config.preDelaySync?.enabled ? 1 : 0, 0, 1),
    createLegacyParamState(6, "Pre-delay Division", config.preDelaySync?.divisionIndex ?? 4, 0, 10),
    createLegacyParamState(7, "Mod Speed", config.modulationSpeedHz, 0.02, 10, "Hz"),
    createLegacyParamState(8, "Mod Speed Sync", config.modulationSpeedSync?.enabled ? 1 : 0, 0, 1),
    createLegacyParamState(9, "Mod Speed Division", config.modulationSpeedSync?.divisionIndex ?? 8, 0, 19),
  ],
  rackControls: [
    createNumberControl("decay", "Decay", (config) => config.decay, (config, value) => (config.decay = value), { min: 0.2, max: 12, unit: "s" }),
    createNumberControl("size", "Size", (config) => config.size, (config, value) => (config.size = value), { min: 0, max: 1, unit: "%" }),
    createNumberControl("focusMix", "Mix", (config) => config.focusMix, (config, value) => (config.focusMix = value), { min: 0, max: 1, unit: "%" }),
  ],
  focusControls: [
    createSelectControl("mode", "Width character", [{ label: "Narrow", value: "Room" }, { label: "Balanced", value: "Hall" }, { label: "Wide", value: "Plate" }, { label: "Extra wide", value: "Shimmer" }], (config) => config.mode, (config, value) => (config.mode = value)),
    createNumberControl("damping", "Damping", (config) => config.damping, (config, value) => (config.damping = value), { min: 0, max: 1 }),
    createNumberControl("preDelayMs", "Pre-delay", (config) => config.preDelayMs, (config, value) => (config.preDelayMs = value), {
      min: 0,
      max: 1000,
      unit: "ms",
      timingSync: {
        valueMode: "period-ms",
        maximumDivisionIndex: 10,
        freeParamId: 4,
        syncEnabledParamId: 5,
        syncDivisionParamId: 6,
        getSyncEnabled: (config) => config.preDelaySync?.enabled ?? false,
        setSyncEnabled: (config, enabled) => {
          config.preDelaySync ??= create(TempoSyncStateSchema, { enabled: false, divisionIndex: 4 });
          config.preDelaySync.enabled = enabled;
        },
        getDivisionIndex: (config) => config.preDelaySync?.divisionIndex ?? 4,
        setDivisionIndex: (config, divisionIndex) => {
          config.preDelaySync ??= create(TempoSyncStateSchema, { enabled: false, divisionIndex: 4 });
          config.preDelaySync.divisionIndex = divisionIndex;
        },
      },
    }),
    createNumberControl("modulationSpeedHz", "Mod Speed", (config) => config.modulationSpeedHz, (config, value) => (config.modulationSpeedHz = value), {
      min: 0.02,
      max: 10,
      unit: "Hz",
      timingSync: {
        valueMode: "period-hz",
        freeParamId: 7,
        syncEnabledParamId: 8,
        syncDivisionParamId: 9,
        getSyncEnabled: (config) => config.modulationSpeedSync?.enabled ?? false,
        setSyncEnabled: (config, enabled) => {
          config.modulationSpeedSync ??= create(TempoSyncStateSchema, { enabled: false, divisionIndex: 8 });
          config.modulationSpeedSync.enabled = enabled;
        },
        getDivisionIndex: (config) => config.modulationSpeedSync?.divisionIndex ?? 8,
        setDivisionIndex: (config, divisionIndex) => {
          config.modulationSpeedSync ??= create(TempoSyncStateSchema, { enabled: false, divisionIndex: 8 });
          config.modulationSpeedSync.divisionIndex = divisionIndex;
        },
      },
    }),
    createNumberControl("modulationDepth", "Mod Depth", (config) => config.modulationDepth, (config, value) => (config.modulationDepth = value), { min: 0, max: 1 }),
  ],
  selectPayload: (frame) => (frame.payload.case === "reverb" ? frame.payload.value : null),
});
