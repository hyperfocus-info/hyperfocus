import { create } from "@bufbuild/protobuf";
import { EqBandConfigSchema, EqNodeConfigSchema, FxNodeType } from "../../../../proto/generated/fx-chain-pb";
import { createLegacyParamState, createNodeDefinition, createNumberControl, createSelectControl } from "../types";

function ensureBand(config: ReturnType<typeof createEqDefaults>, index = 0) {
  while (config.bands.length <= index) {
    config.bands.push(create(EqBandConfigSchema, { frequencyHz: 1200, q: 1.1, gainDb: 0, type: "Bell", enabled: true }));
  }
  return config.bands[index]!;
}

function createEqDefaults() {
  return create(EqNodeConfigSchema, {
    lowShelfGainDb: 0,
    highShelfGainDb: 0,
    lowShelfFrequencyHz: 120,
    highShelfFrequencyHz: 8000,
    masterGainDb: 0,
    bands: [create(EqBandConfigSchema, { frequencyHz: 1200, q: 1.1, gainDb: 0, type: "Bell", enabled: true })],
  });
}

export const EqNodeDefinition = createNodeDefinition({
  type: FxNodeType.EQ,
  defaultName: "EQ",
  configCase: "eqConfig",
  configSchema: EqNodeConfigSchema,
  createDefaultConfig: createEqDefaults,
  createLegacyParams: (config) => {
    const band = ensureBand(config);
    return [
      createLegacyParamState(1, "Freq", band.frequencyHz, 20, 20000, "Hz"),
      createLegacyParamState(2, "Gain", band.gainDb, -18, 18, "dB"),
      createLegacyParamState(3, "Q", band.q, 0.1, 12, "Q"),
      createLegacyParamState(4, "Low Freq", config.lowShelfFrequencyHz, 20, 2000, "Hz"),
      createLegacyParamState(5, "Low Shelf", config.lowShelfGainDb, -18, 18, "dB"),
      createLegacyParamState(6, "High Freq", config.highShelfFrequencyHz, 2000, 20000, "Hz"),
      createLegacyParamState(7, "High Shelf", config.highShelfGainDb, -18, 18, "dB"),
      createLegacyParamState(8, "Master", config.masterGainDb, -18, 18, "dB"),
    ];
  },
  rackControls: [
    createNumberControl("lowShelfFrequencyHz", "Low Freq", (config) => config.lowShelfFrequencyHz, (config, value) => (config.lowShelfFrequencyHz = value), { min: 20, max: 2000, unit: "Hz" }),
    createNumberControl("lowShelfGainDb", "Low Shelf", (config) => config.lowShelfGainDb, (config, value) => (config.lowShelfGainDb = value), { min: -18, max: 18, unit: "dB" }),
    createNumberControl("highShelfFrequencyHz", "High Freq", (config) => config.highShelfFrequencyHz, (config, value) => (config.highShelfFrequencyHz = value), { min: 2000, max: 20000, unit: "Hz" }),
    createNumberControl("highShelfGainDb", "High Shelf", (config) => config.highShelfGainDb, (config, value) => (config.highShelfGainDb = value), { min: -18, max: 18, unit: "dB" }),
    createNumberControl("masterGainDb", "Master", (config) => config.masterGainDb, (config, value) => (config.masterGainDb = value), { min: -18, max: 18, unit: "dB" }),
  ],
  focusControls: [
    createNumberControl("band0FrequencyHz", "Band Freq", (config) => ensureBand(config).frequencyHz, (config, value) => (ensureBand(config).frequencyHz = value), { min: 20, max: 20000, unit: "Hz" }),
    createNumberControl("band0Q", "Band Q", (config) => ensureBand(config).q, (config, value) => (ensureBand(config).q = value), { min: 0.1, max: 12, unit: "Q" }),
    createNumberControl("band0GainDb", "Band Gain", (config) => ensureBand(config).gainDb, (config, value) => (ensureBand(config).gainDb = value), { min: -18, max: 18, unit: "dB" }),
    createSelectControl(
      "band0Type",
      "Band Type",
      [
        { label: "Bell", value: "Bell" },
        { label: "Notch", value: "Notch" },
        { label: "Shelf", value: "Shelf" },
        { label: "Pass", value: "Pass" },
      ],
      (config) => ensureBand(config).type,
      (config, value) => (ensureBand(config).type = value),
    ),
  ],
  selectPayload: (frame) => (frame.payload.case === "eq" ? frame.payload.value : null),
});
