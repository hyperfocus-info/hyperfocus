import { create } from "@bufbuild/protobuf";
import { FxNodeType, ReverseNodeConfigSchema } from "../../../../proto/generated/fx-chain-pb";
import { createLegacyParamState, createNodeDefinition, createNumberControl } from "../types";

export const ReverseNodeDefinition = createNodeDefinition({
  type: FxNodeType.REVERSE,
  defaultName: "Reverse",
  configCase: "reverseConfig",
  configSchema: ReverseNodeConfigSchema,
  createDefaultConfig: () => create(ReverseNodeConfigSchema, { windowMs: 500, pitchSemitones: 0, forwardMix: 0, crossfadeMs: 12 }),
  createLegacyParams: (config) => [
    createLegacyParamState(1, "Window", config.windowMs, 50, 2000, "ms"),
    createLegacyParamState(2, "Pitch", config.pitchSemitones, -12, 12, "st"),
    createLegacyParamState(3, "Forward", config.forwardMix, 0, 1),
    createLegacyParamState(4, "Crossfade", config.crossfadeMs, 0, 50, "ms"),
  ],
  rackControls: [
    createNumberControl("windowMs", "Window", (config) => config.windowMs, (config, value) => (config.windowMs = value), { min: 50, max: 2000, unit: "ms" }),
    createNumberControl("pitchSemitones", "Pitch", (config) => config.pitchSemitones, (config, value) => (config.pitchSemitones = value), { min: -12, max: 12, unit: "st" }),
    createNumberControl("forwardMix", "Forward", (config) => config.forwardMix, (config, value) => (config.forwardMix = value), { min: 0, max: 1 }),
  ],
  focusControls: [
    createNumberControl("crossfadeMs", "Crossfade", (config) => config.crossfadeMs, (config, value) => (config.crossfadeMs = value), { min: 0, max: 50, unit: "ms" }),
  ],
  selectPayload: () => null,
});
