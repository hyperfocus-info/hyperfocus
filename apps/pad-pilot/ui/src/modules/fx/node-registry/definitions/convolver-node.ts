import { create } from "@bufbuild/protobuf";
import { ConvolverNodeConfigSchema, FxNodeType, type ConvolverNodeConfig } from "../../../../proto/generated/fx-chain-pb";
import { createLegacyParamState, createNodeDefinition, createNumberControl } from "../types";

const blendControl = createNumberControl(
  "blend", "Blend", (config: ConvolverNodeConfig) => config.blend,
  (config, value) => { config.blend = value; },
  { min: 0, max: 1, step: 0.01 },
);

const impulseMetadataControls = [
  {
    key: "irId", label: "IR content ID", getValue: (config: ConvolverNodeConfig) => config.irId,
    setValue: (config: ConvolverNodeConfig, value: string | number | boolean) => { config.irId = String(value); },
  },
  {
    key: "irSourcePath", label: "IR managed path", getValue: (config: ConvolverNodeConfig) => config.irSourcePath,
    setValue: (config: ConvolverNodeConfig, value: string | number | boolean) => { config.irSourcePath = String(value); },
  },
  {
    key: "irSourceName", label: "IR source name", getValue: (config: ConvolverNodeConfig) => config.irSourceName,
    setValue: (config: ConvolverNodeConfig, value: string | number | boolean) => { config.irSourceName = String(value); },
  },
] as const;

export const ConvolverNodeDefinition = createNodeDefinition({
  type: FxNodeType.CONVOLVER,
  defaultName: "Convolver",
  configCase: "convolverConfig",
  configSchema: ConvolverNodeConfigSchema,
  createDefaultConfig: () =>
    create(ConvolverNodeConfigSchema, {
      irId: "",
      blend: 0.8,
      irStretch: 1,
      reverse: false,
      startTrim: 0,
      endTrim: 1,
      highPassHz: 40,
      lowPassHz: 18000,
      irSourcePath: "",
      irSourceName: "",
    }),
  createLegacyParams: (config) => [createLegacyParamState(2, "Blend", config.blend, 0, 1)],
  rackControls: [blendControl],
  focusControls: [blendControl, ...impulseMetadataControls],
  selectPayload: (frame) => (frame.payload.case === "convolver" ? frame.payload.value : null),
});
