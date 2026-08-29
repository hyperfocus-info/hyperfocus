import { create } from "@bufbuild/protobuf";
import { CompressorNodeConfigSchema, FxNodeType } from "../../../../proto/generated/fx-chain-pb";
import { createLegacyParamState, createNodeDefinition, createNumberControl } from "../types";

export const CompressorNodeDefinition = createNodeDefinition({
  type: FxNodeType.COMPRESSOR,
  defaultName: "Compressor",
  configCase: "compressorConfig",
  configSchema: CompressorNodeConfigSchema,
  createDefaultConfig: () =>
    create(CompressorNodeConfigSchema, {
      thresholdDb: -18,
      ratio: 4,
      makeupDb: 3,
      attackMs: 15,
      releaseMs: 120,
      kneeDb: 6,
      sidechainHpfHz: 120,
      lookaheadMs: 3,
      multibandEnabled: false,
      lowBand: { thresholdDb: -20, ratio: 3 },
      midBand: { thresholdDb: -18, ratio: 4 },
      highBand: { thresholdDb: -16, ratio: 5 },
    }),
  createLegacyParams: (config) => [
    createLegacyParamState(1, "Threshold", config.thresholdDb, -60, 0, "dB"),
    createLegacyParamState(2, "Ratio", config.ratio, 0.5, 20, ":1"),
    createLegacyParamState(3, "Makeup", config.makeupDb, 0, 24, "dB"),
    createLegacyParamState(4, "Attack", config.attackMs, 0.1, 200, "ms"),
    createLegacyParamState(5, "Release", config.releaseMs, 10, 1000, "ms"),
  ],
  rackControls: [
    createNumberControl("thresholdDb", "Threshold", (config) => config.thresholdDb, (config, value) => (config.thresholdDb = value), { min: -60, max: 0, unit: "dB" }),
    createNumberControl("ratio", "Ratio", (config) => config.ratio, (config, value) => (config.ratio = value), { min: 0.5, max: 20, unit: ":1" }),
    createNumberControl("makeupDb", "Makeup", (config) => config.makeupDb, (config, value) => (config.makeupDb = value), { min: 0, max: 24, unit: "dB" }),
  ],
  focusControls: [
    createNumberControl("attackMs", "Attack", (config) => config.attackMs, (config, value) => (config.attackMs = value), { min: 0.1, max: 200, unit: "ms" }),
    createNumberControl("releaseMs", "Release", (config) => config.releaseMs, (config, value) => (config.releaseMs = value), { min: 10, max: 1000, unit: "ms" }),
  ],
  selectPayload: (frame) => (frame.payload.case === "compressor" ? frame.payload.value : null),
});
