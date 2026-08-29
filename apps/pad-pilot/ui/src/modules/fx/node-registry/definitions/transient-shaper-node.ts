import { create } from "@bufbuild/protobuf";
import { FxNodeType, TransientShaperNodeConfigSchema } from "../../../../proto/generated/fx-chain-pb";
import { createLegacyParamState, createNodeDefinition, createNumberControl, createToggleControl } from "../types";

export const TransientShaperNodeDefinition = createNodeDefinition({
  type: FxNodeType.TRANSIENT_SHAPER,
  defaultName: "Transient Shaper",
  configCase: "transientShaperConfig",
  configSchema: TransientShaperNodeConfigSchema,
  createDefaultConfig: () => create(TransientShaperNodeConfigSchema, { attack: 0.2, sustain: 0.2, softClip: false, gainDb: 0, sensitivity: 0.5 }),
  createLegacyParams: (config) => [
    createLegacyParamState(1, "Attack", config.attack, -1, 1),
    createLegacyParamState(2, "Sustain", config.sustain, -1, 1),
    createLegacyParamState(3, "Gain", config.gainDb, -18, 18, "dB"),
  ],
  rackControls: [
    createNumberControl("attack", "Attack", (config) => config.attack, (config, value) => (config.attack = value), { min: -1, max: 1 }),
    createNumberControl("sustain", "Sustain", (config) => config.sustain, (config, value) => (config.sustain = value), { min: -1, max: 1 }),
  ],
  focusControls: [
    createToggleControl("softClip", "Soft Clip", (config) => config.softClip, (config, value) => (config.softClip = value)),
    createNumberControl("gainDb", "Gain", (config) => config.gainDb, (config, value) => (config.gainDb = value), { min: -18, max: 18, unit: "dB" }),
    createNumberControl("sensitivity", "Sensitivity", (config) => config.sensitivity, (config, value) => (config.sensitivity = value), { min: 0, max: 1 }),
  ],
  selectPayload: (frame) => (frame.payload.case === "transientShaper" ? frame.payload.value : null),
});
