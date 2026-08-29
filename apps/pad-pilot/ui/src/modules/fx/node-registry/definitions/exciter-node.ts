import { create } from "@bufbuild/protobuf";
import { ExciterNodeConfigSchema, FxNodeType } from "../../../../proto/generated/fx-chain-pb";
import { createLegacyParamState, createNodeDefinition, createNumberControl, createSelectControl } from "../types";

export const ExciterNodeDefinition = createNodeDefinition({
  type: FxNodeType.EXCITER,
  defaultName: "Exciter",
  configCase: "exciterConfig",
  configSchema: ExciterNodeConfigSchema,
  createDefaultConfig: () => create(ExciterNodeConfigSchema, { harmonicDrive: 0.4, mix: 0.35, frequencyBandSolo: "High", oddEvenBalance: 0.5 }),
  createLegacyParams: (config) => [
    createLegacyParamState(1, "Drive", config.harmonicDrive, 0, 1),
    createLegacyParamState(2, "Mix", config.mix, 0, 1),
    createLegacyParamState(3, "Odd/Even", config.oddEvenBalance, 0, 1),
  ],
  rackControls: [
    createNumberControl("harmonicDrive", "Drive", (config) => config.harmonicDrive, (config, value) => (config.harmonicDrive = value), { min: 0, max: 1 }),
    createNumberControl("mix", "Mix", (config) => config.mix, (config, value) => (config.mix = value), { min: 0, max: 1 }),
  ],
  focusControls: [
    createSelectControl("frequencyBandSolo", "Target Band", [{ label: "Low", value: "Low" }, { label: "Mid", value: "Mid" }, { label: "High", value: "High" }], (config) => config.frequencyBandSolo, (config, value) => (config.frequencyBandSolo = value)),
    createNumberControl("oddEvenBalance", "Odd/Even", (config) => config.oddEvenBalance, (config, value) => (config.oddEvenBalance = value), { min: 0, max: 1 }),
  ],
  selectPayload: (frame) => (frame.payload.case === "exciter" ? frame.payload.value : null),
});
