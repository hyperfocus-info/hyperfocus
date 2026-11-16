import { create } from "@bufbuild/protobuf";
import { DelayNodeConfigSchema, FxNodeType, TempoSyncStateSchema } from "../../../../proto/generated/fx-chain-pb";
import { createLegacyParamState, createNodeDefinition, createNumberControl, createSelectControl } from "../types";

const DELAY_CHARACTERS = ["Clean", "Tape", "BBD", "Digital"] as const;

export const DelayNodeDefinition = createNodeDefinition({
  type: FxNodeType.DELAY,
  defaultName: "Delay",
  configCase: "delayConfig",
  configSchema: DelayNodeConfigSchema,
  createDefaultConfig: () =>
    create(DelayNodeConfigSchema, {
      time: 0.35,
      feedback: 0.42,
      focusMix: 0.4,
      grainMode: false,
      grainSize: 0.2,
      grainDensity: 0.5,
      grainSpray: 0.2,
      grainPitchShift: 0,
      timeSync: create(TempoSyncStateSchema, { enabled: false, divisionIndex: 8 }),
      lowCutHz: 20,
      highCutHz: 20000,
      width: 1,
      saturation: 0,
      character: "Clean",
    }),
  createLegacyParams: (config) => [
    createLegacyParamState(1, "Time", config.time, 0.05, 1.5, "s"),
    createLegacyParamState(2, "Feedback", config.feedback, 0, 0.95, "%"),
    createLegacyParamState(3, "Mix", config.focusMix, 0, 1, "%"),
    createLegacyParamState(4, "Time Sync", config.timeSync?.enabled ? 1 : 0, 0, 1),
    createLegacyParamState(5, "Time Division", config.timeSync?.divisionIndex ?? 8, 0, 10),
    createLegacyParamState(6, "Low Cut", config.lowCutHz, 20, 2400, "Hz"),
    createLegacyParamState(7, "High Cut", config.highCutHz, 1200, 20000, "Hz"),
    createLegacyParamState(8, "Width", config.width, 0, 1),
    createLegacyParamState(9, "Saturation", config.saturation, 0, 1),
    createLegacyParamState(10, "Character", Math.max(0, DELAY_CHARACTERS.findIndex((value) => value === config.character)), 0, DELAY_CHARACTERS.length - 1),
  ],
  rackControls: [
    createNumberControl("time", "Time", (config) => config.time, (config, value) => (config.time = value), {
      min: 0.05,
      max: 1.5,
      unit: "s",
      timingSync: {
        valueMode: "period-seconds",
        maximumDivisionIndex: 10,
        freeParamId: 1,
        syncEnabledParamId: 4,
        syncDivisionParamId: 5,
        getSyncEnabled: (config) => config.timeSync?.enabled ?? false,
        setSyncEnabled: (config, enabled) => {
          config.timeSync ??= create(TempoSyncStateSchema, { enabled: false, divisionIndex: 8 });
          config.timeSync.enabled = enabled;
        },
        getDivisionIndex: (config) => config.timeSync?.divisionIndex ?? 8,
        setDivisionIndex: (config, divisionIndex) => {
          config.timeSync ??= create(TempoSyncStateSchema, { enabled: false, divisionIndex: 8 });
          config.timeSync.divisionIndex = divisionIndex;
        },
      },
    }),
    createNumberControl("feedback", "Feedback", (config) => config.feedback, (config, value) => (config.feedback = value), { min: 0, max: 0.95 }),
    createNumberControl("focusMix", "Mix", (config) => config.focusMix, (config, value) => (config.focusMix = value), { min: 0, max: 1, unit: "%" }),
  ],
  focusControls: [
    createNumberControl("lowCutHz", "Low Cut", (config) => config.lowCutHz, (config, value) => (config.lowCutHz = value), { min: 20, max: 2400, unit: "Hz" }),
    createNumberControl("highCutHz", "High Cut", (config) => config.highCutHz, (config, value) => (config.highCutHz = value), { min: 1200, max: 20000, unit: "Hz" }),
    createNumberControl("width", "Width", (config) => config.width, (config, value) => (config.width = value), { min: 0, max: 1 }),
    createNumberControl("saturation", "Saturation", (config) => config.saturation, (config, value) => (config.saturation = value), { min: 0, max: 1 }),
    createSelectControl("character", "Character", DELAY_CHARACTERS.map((value) => ({ label: value, value })), (config) => config.character, (config, value) => (config.character = value)),
  ],
  selectPayload: (frame) => (frame.payload.case === "delay" ? frame.payload.value : null),
});
