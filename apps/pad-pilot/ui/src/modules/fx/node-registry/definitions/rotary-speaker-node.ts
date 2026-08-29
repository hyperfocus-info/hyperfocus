import { create } from "@bufbuild/protobuf";
import { FxNodeType, RotarySpeakerNodeConfigSchema } from "../../../../proto/generated/fx-chain-pb";
import { createLegacyParamState, createNodeDefinition, createNumberControl, createToggleControl } from "../types";

export const RotarySpeakerNodeDefinition = createNodeDefinition({
  type: FxNodeType.ROTARY_SPEAKER,
  defaultName: "Rotary Speaker",
  configCase: "rotarySpeakerConfig",
  configSchema: RotarySpeakerNodeConfigSchema,
  createDefaultConfig: () => create(RotarySpeakerNodeConfigSchema, { fast: false, drive: 0.2, hornDrumBalance: 0.5, micDistance: 0.35, acceleration: 0.5 }),
  createLegacyParams: (config) => [
    createLegacyParamState(1, "Speed", config.fast ? 1 : 0, 0, 1),
    createLegacyParamState(2, "Drive", config.drive, 0, 1),
    createLegacyParamState(3, "Balance", config.hornDrumBalance, 0, 1),
  ],
  rackControls: [
    createToggleControl("fast", "Fast", (config) => config.fast, (config, value) => (config.fast = value)),
    createNumberControl("drive", "Drive", (config) => config.drive, (config, value) => (config.drive = value), { min: 0, max: 1 }),
  ],
  focusControls: [
    createNumberControl("hornDrumBalance", "Horn / Drum", (config) => config.hornDrumBalance, (config, value) => (config.hornDrumBalance = value), { min: 0, max: 1 }),
    createNumberControl("micDistance", "Mic Distance", (config) => config.micDistance, (config, value) => (config.micDistance = value), { min: 0, max: 1 }),
    createNumberControl("acceleration", "Acceleration", (config) => config.acceleration, (config, value) => (config.acceleration = value), { min: 0, max: 1 }),
  ],
  selectPayload: (frame) => (frame.payload.case === "rotarySpeaker" ? frame.payload.value : null),
});
