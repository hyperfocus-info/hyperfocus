import { create } from "@bufbuild/protobuf";
import { FxNodeType, TapeSaturationNodeConfigSchema } from "../../../../proto/generated/fx-chain-pb";
import { createLegacyParamState, createNodeDefinition, createNumberControl, createSelectControl } from "../types";

export const TapeSaturationNodeDefinition = createNodeDefinition({
  type: FxNodeType.TAPE_SATURATION,
  defaultName: "Tape Saturation",
  configCase: "tapeSaturationConfig",
  configSchema: TapeSaturationNodeConfigSchema,
  createDefaultConfig: () => create(TapeSaturationNodeConfigSchema, { drive: 0.35, warmth: 0.55, tapeSpeedIps: 15, wowFlutter: 0.1, hysteresis: 0.2, bias: 0.1 }),
  createLegacyParams: (config) => [
    createLegacyParamState(1, "Drive", config.drive, 0, 1),
    createLegacyParamState(2, "Warmth", config.warmth, 0, 1),
    createLegacyParamState(3, "Bias", config.bias, 0, 1),
  ],
  rackControls: [
    createNumberControl("drive", "Drive", (config) => config.drive, (config, value) => (config.drive = value), { min: 0, max: 1 }),
    createNumberControl("warmth", "Warmth", (config) => config.warmth, (config, value) => (config.warmth = value), { min: 0, max: 1 }),
  ],
  focusControls: [
    createSelectControl("tapeSpeedIps", "Tape Speed", [{ label: "7.5 ips", value: "7.5" }, { label: "15 ips", value: "15" }, { label: "30 ips", value: "30" }], (config) => String(config.tapeSpeedIps), (config, value) => (config.tapeSpeedIps = Number(value))),
    createNumberControl("wowFlutter", "Wow+Flutter", (config) => config.wowFlutter, (config, value) => (config.wowFlutter = value), { min: 0, max: 1 }),
    createNumberControl("hysteresis", "Hysteresis", (config) => config.hysteresis, (config, value) => (config.hysteresis = value), { min: 0, max: 1 }),
    createNumberControl("bias", "Bias", (config) => config.bias, (config, value) => (config.bias = value), { min: 0, max: 1 }),
  ],
  selectPayload: (frame) => (frame.payload.case === "tapeSaturation" ? frame.payload.value : null),
});
