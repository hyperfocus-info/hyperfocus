import { create } from "@bufbuild/protobuf";
import { BitcrusherNodeConfigSchema, FxNodeType } from "../../../../proto/generated/fx-chain-pb";
import { createLegacyParamState, createNodeDefinition, createNumberControl } from "../types";

export const BitcrusherNodeDefinition = createNodeDefinition({
  type: FxNodeType.BITCRUSHER,
  defaultName: "Bitcrusher",
  configCase: "bitcrusherConfig",
  configSchema: BitcrusherNodeConfigSchema,
  createDefaultConfig: () => create(BitcrusherNodeConfigSchema, { bits: 12, downsample: 2, jitter: 0.1, postFilter: 0.3, wetDry: 0.5 }),
  createLegacyParams: (config) => [
    createLegacyParamState(1, "Bits", config.bits, 1, 24),
    createLegacyParamState(2, "Downsample", config.downsample, 1, 32),
    createLegacyParamState(3, "Wet/Dry", config.wetDry, 0, 1),
  ],
  rackControls: [
    createNumberControl("bits", "Bits", (config) => config.bits, (config, value) => (config.bits = value), { min: 1, max: 24 }),
    createNumberControl("downsample", "Downsample", (config) => config.downsample, (config, value) => (config.downsample = value), { min: 1, max: 32 }),
  ],
  focusControls: [
    createNumberControl("jitter", "Jitter", (config) => config.jitter, (config, value) => (config.jitter = value), { min: 0, max: 1 }),
    createNumberControl("postFilter", "Post-Filter", (config) => config.postFilter, (config, value) => (config.postFilter = value), { min: 0, max: 1 }),
    createNumberControl("wetDry", "Wet/Dry", (config) => config.wetDry, (config, value) => (config.wetDry = value), { min: 0, max: 1 }),
  ],
  selectPayload: (frame) => (frame.payload.case === "bitcrusher" ? frame.payload.value : null),
});
