import { create } from "@bufbuild/protobuf";
import { FxNodeType, NoiseGateNodeConfigSchema } from "../../../../proto/generated/fx-chain-pb";
import { createLegacyParamState, createNodeDefinition, createNumberControl } from "../types";

export const NoiseGateNodeDefinition = createNodeDefinition({
  type: FxNodeType.NOISE_GATE,
  defaultName: "Noise Gate",
  configCase: "noiseGateConfig",
  configSchema: NoiseGateNodeConfigSchema,
  createDefaultConfig: () => create(NoiseGateNodeConfigSchema, { thresholdDb: -36, rangeDb: -24, attackMs: 5, holdMs: 30, releaseMs: 120, sidechainListen: false }),
  createLegacyParams: (config) => [
    createLegacyParamState(1, "Threshold", config.thresholdDb, -80, 0, "dB"),
    createLegacyParamState(2, "Range", config.rangeDb, -80, 0, "dB"),
    createLegacyParamState(3, "Release", config.releaseMs, 1, 1000, "ms"),
  ],
  rackControls: [
    createNumberControl("thresholdDb", "Threshold", (config) => config.thresholdDb, (config, value) => (config.thresholdDb = value), { min: -80, max: 0, unit: "dB" }),
    createNumberControl("rangeDb", "Range", (config) => config.rangeDb, (config, value) => (config.rangeDb = value), { min: -80, max: 0, unit: "dB" }),
  ],
  focusControls: [
    createNumberControl("attackMs", "Attack", (config) => config.attackMs, (config, value) => (config.attackMs = value), { min: 0.1, max: 200, unit: "ms" }),
    createNumberControl("holdMs", "Hold", (config) => config.holdMs, (config, value) => (config.holdMs = value), { min: 0, max: 500, unit: "ms" }),
    createNumberControl("releaseMs", "Release", (config) => config.releaseMs, (config, value) => (config.releaseMs = value), { min: 1, max: 1000, unit: "ms" }),
  ],
  selectPayload: (frame) => (frame.payload.case === "noiseGate" ? frame.payload.value : null),
});
