import { expect, it } from "bun:test";
import { create, toBinary } from "@bufbuild/protobuf";
import { bytesToBase64 } from "../../proto/base64";
import { FxChainStateSchema, PresetFileSchema } from "../../proto/generated/fx-chain-pb";
import { createDefaultFxChainState } from "./fx-chain-state";
import {
  COMPACT_FX_PRESET_PREFIX,
  decodeCompactFxPresetCode,
  encodeCompactFxPresetCode,
} from "./fx-compact-preset";

it("round-trips a paste-safe protobuf FX preset code", () => {
  const state = createDefaultFxChainState();
  state.master!.wetDry = 0.37;

  const code = encodeCompactFxPresetCode("FL control state", state, "fl-controls");
  const decoded = decodeCompactFxPresetCode(code);

  expect(code.startsWith(COMPACT_FX_PRESET_PREFIX)).toBe(true);
  expect(decoded.name).toBe("FL control state");
  expect(decoded.presetId).toBe("fl-controls");
  expect(decoded.state.master!.wetDry).toBeCloseTo(0.37, 5);
});

it("rejects malformed, foreign-module, future-schema, and non-finite preset codes", () => {
  expect(() => decodeCompactFxPresetCode("not-a-preset")).toThrow("prefix");
  expect(() => decodeCompactFxPresetCode(`${COMPACT_FX_PRESET_PREFIX}%%%%`)).toThrow("Base64");

  const state = createDefaultFxChainState();
  const foreign = create(PresetFileSchema, {
    moduleId: "recut",
    name: "Wrong module",
    schemaVersion: state.schemaVersion,
    state: toBinary(FxChainStateSchema, state),
  });
  expect(() => decodeCompactFxPresetCode(`${COMPACT_FX_PRESET_PREFIX}${bytesToBase64(toBinary(PresetFileSchema, foreign))}`)).toThrow("FX Module");

  const future = create(PresetFileSchema, {
    moduleId: "fx",
    name: "Future",
    schemaVersion: state.schemaVersion + 1,
    state: toBinary(FxChainStateSchema, state),
  });
  expect(() => decodeCompactFxPresetCode(`${COMPACT_FX_PRESET_PREFIX}${bytesToBase64(toBinary(PresetFileSchema, future))}`)).toThrow("newer");

  state.master!.wetDry = Number.NaN;
  const nonFinite = create(PresetFileSchema, {
    moduleId: "fx",
    name: "Not finite",
    schemaVersion: state.schemaVersion,
    state: toBinary(FxChainStateSchema, state),
  });
  expect(() => decodeCompactFxPresetCode(`${COMPACT_FX_PRESET_PREFIX}${bytesToBase64(toBinary(PresetFileSchema, nonFinite))}`)).toThrow("finite");
});
