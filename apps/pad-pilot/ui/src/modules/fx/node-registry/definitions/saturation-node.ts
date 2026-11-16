import { create } from "@bufbuild/protobuf";
import { FxNodeType, SaturationNodeConfigSchema } from "../../../../proto/generated/fx-chain-pb";
import { createLegacyParamState, createNodeDefinition, createNumberControl, createSelectControl } from "../types";

const CHARACTERS = ["Soft Clip", "Tube", "Transistor", "Fold"] as const;

export const SaturationNodeDefinition = createNodeDefinition({
  type: FxNodeType.SATURATION,
  defaultName: "Saturation",
  configCase: "saturationConfig",
  configSchema: SaturationNodeConfigSchema,
  createDefaultConfig: () => create(SaturationNodeConfigSchema, { drive: 0.35, tone: 0.55, bias: 0, character: "Soft Clip", outputGainDb: 0 }),
  createLegacyParams: (config) => [
    createLegacyParamState(1, "Drive", config.drive, 0, 1),
    createLegacyParamState(2, "Tone", config.tone, 0, 1),
    createLegacyParamState(3, "Bias", config.bias, -1, 1),
    createLegacyParamState(4, "Character", Math.max(0, CHARACTERS.findIndex((value) => value === config.character)), 0, CHARACTERS.length - 1),
    createLegacyParamState(5, "Output", config.outputGainDb, -18, 12, "dB"),
  ],
  rackControls: [
    createNumberControl("drive", "Drive", (config) => config.drive, (config, value) => (config.drive = value), { min: 0, max: 1 }),
    createNumberControl("tone", "Tone", (config) => config.tone, (config, value) => (config.tone = value), { min: 0, max: 1 }),
    createNumberControl("outputGainDb", "Output", (config) => config.outputGainDb, (config, value) => (config.outputGainDb = value), { min: -18, max: 12, unit: "dB" }),
  ],
  focusControls: [
    createSelectControl("character", "Character", CHARACTERS.map((value) => ({ label: value, value })), (config) => config.character, (config, value) => (config.character = value)),
    createNumberControl("bias", "Bias", (config) => config.bias, (config, value) => (config.bias = value), { min: -1, max: 1 }),
  ],
  selectPayload: () => null,
});
