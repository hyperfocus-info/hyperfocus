import { create } from "@bufbuild/protobuf";
import { AutoPanNodeConfigSchema, FxNodeType, TempoSyncStateSchema } from "../../../../proto/generated/fx-chain-pb";
import { createLegacyParamState, createNodeDefinition, createNumberControl, createSelectControl } from "../types";

export const AutoPanNodeDefinition = createNodeDefinition({
  type: FxNodeType.AUTO_PAN,
  defaultName: "Auto-Pan",
  configCase: "autoPanConfig",
  configSchema: AutoPanNodeConfigSchema,
  createDefaultConfig: () =>
    create(AutoPanNodeConfigSchema, {
      rateHz: 0.5,
      amount: 0.6,
      lfoShape: "Sine",
      phaseOffset: 0.25,
      smoothing: 0.2,
      rateSync: create(TempoSyncStateSchema, { enabled: false, divisionIndex: 9 }),
    }),
  createLegacyParams: (config) => [
    createLegacyParamState(1, "Rate", config.rateHz, 0.05, 10, "Hz"),
    createLegacyParamState(2, "Amount", config.amount, 0, 1),
    createLegacyParamState(3, "Phase", config.phaseOffset, 0, 1),
    createLegacyParamState(4, "Rate Sync", config.rateSync?.enabled ? 1 : 0, 0, 1),
    createLegacyParamState(5, "Rate Division", config.rateSync?.divisionIndex ?? 9, 0, 19),
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
          config.rateSync ??= create(TempoSyncStateSchema, { enabled: false, divisionIndex: 9 });
          config.rateSync.enabled = enabled;
        },
        getDivisionIndex: (config) => config.rateSync?.divisionIndex ?? 9,
        setDivisionIndex: (config, divisionIndex) => {
          config.rateSync ??= create(TempoSyncStateSchema, { enabled: false, divisionIndex: 9 });
          config.rateSync.divisionIndex = divisionIndex;
        },
      },
    }),
    createNumberControl("amount", "Amount", (config) => config.amount, (config, value) => (config.amount = value), { min: 0, max: 1 }),
  ],
  focusControls: [
    createSelectControl("lfoShape", "Shape", [{ label: "Sine", value: "Sine" }, { label: "Tri", value: "Tri" }, { label: "Square", value: "Square" }, { label: "Random", value: "Random" }], (config) => config.lfoShape, (config, value) => (config.lfoShape = value)),
    createNumberControl("phaseOffset", "Phase", (config) => config.phaseOffset, (config, value) => (config.phaseOffset = value), { min: 0, max: 1 }),
    createNumberControl("smoothing", "Smoothing", (config) => config.smoothing, (config, value) => (config.smoothing = value), { min: 0, max: 1 }),
  ],
  selectPayload: (frame) => (frame.payload.case === "autoPan" ? frame.payload.value : null),
});
