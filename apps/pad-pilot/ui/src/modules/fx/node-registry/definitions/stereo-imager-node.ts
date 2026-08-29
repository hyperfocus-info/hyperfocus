import { create } from "@bufbuild/protobuf";
import { FxNodeType, StereoImagerNodeConfigSchema } from "../../../../proto/generated/fx-chain-pb";
import { createLegacyParamState, createNodeDefinition, createNumberControl } from "../types";

export const StereoImagerNodeDefinition = createNodeDefinition({
  type: FxNodeType.STEREO_IMAGER,
  defaultName: "Stereo Imager",
  configCase: "stereoImagerConfig",
  configSchema: StereoImagerNodeConfigSchema,
  createDefaultConfig: () => create(StereoImagerNodeConfigSchema, { widthPercent: 100, bassMonoCrossoverHz: 140, stereoBalance: 0.5, pan: 0 }),
  createLegacyParams: (config) => [
    createLegacyParamState(1, "Width", config.widthPercent, 0, 200, "%"),
    createLegacyParamState(2, "Balance", config.stereoBalance, 0, 1),
    createLegacyParamState(3, "Pan", config.pan, -1, 1),
  ],
  rackControls: [
    createNumberControl("widthPercent", "Width", (config) => config.widthPercent, (config, value) => (config.widthPercent = value), { min: 0, max: 200, unit: "%" }),
  ],
  focusControls: [
    createNumberControl("bassMonoCrossoverHz", "Bass Mono", (config) => config.bassMonoCrossoverHz, (config, value) => (config.bassMonoCrossoverHz = value), { min: 40, max: 400, unit: "Hz" }),
    createNumberControl("stereoBalance", "Balance", (config) => config.stereoBalance, (config, value) => (config.stereoBalance = value), { min: 0, max: 1 }),
    createNumberControl("pan", "Pan", (config) => config.pan, (config, value) => (config.pan = value), { min: -1, max: 1 }),
  ],
  selectPayload: (frame) => (frame.payload.case === "stereoImager" ? frame.payload.value : null),
});
