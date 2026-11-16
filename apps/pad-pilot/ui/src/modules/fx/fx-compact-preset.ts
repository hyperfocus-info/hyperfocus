import { fromBinary, toBinary } from "@bufbuild/protobuf";
import { base64ToBytes, bytesToBase64 } from "../../proto/base64";
import { FxChainStateSchema, PresetFileSchema } from "../../proto/generated/fx-chain-pb";
import {
  FX_CHAIN_SCHEMA_VERSION,
  createPresetFile,
  normalizeFxChainState,
  type FxChainState,
} from "./fx-chain-state";

export const COMPACT_FX_PRESET_PREFIX = "ppfx1:";
export const MAX_COMPACT_FX_PRESET_BYTES = 524288;
export const MAX_COMPACT_FX_PRESET_CODE_CHARS = COMPACT_FX_PRESET_PREFIX.length + Math.ceil(MAX_COMPACT_FX_PRESET_BYTES / 3) * 4;

const MAX_PRESET_ID_BYTES = 128;
const MAX_PRESET_NAME_BYTES = 256;
const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function utf8Length(value: string) {
  return new TextEncoder().encode(value).length;
}

function containsNonFiniteNumber(value: unknown) {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        return true;
      }
      continue;
    }
    if (!current || typeof current !== "object" || current instanceof Uint8Array) {
      continue;
    }
    pending.push(...Object.values(current));
  }
  return false;
}

function requireSupportedSchemaVersion(version: number) {
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("Preset code has no supported FX schema version.");
  }
  if (version > FX_CHAIN_SCHEMA_VERSION) {
    throw new Error("Preset code was created by a newer FX schema.");
  }
}

function validatePresetIdentity(name: string, presetId: string) {
  if (!name || utf8Length(name) > MAX_PRESET_NAME_BYTES) {
    throw new Error("Preset name must contain 1 to 256 UTF-8 bytes.");
  }
  if (utf8Length(presetId) > MAX_PRESET_ID_BYTES) {
    throw new Error("Preset ID exceeds 128 UTF-8 bytes.");
  }
}

export function encodeCompactFxPresetCode(name: string, state: FxChainState, presetId = "") {
  const normalizedName = name.trim();
  validatePresetIdentity(normalizedName, presetId);
  if (containsNonFiniteNumber(state)) {
    throw new Error("FX preset values must be finite numbers.");
  }

  const bytes = toBinary(PresetFileSchema, createPresetFile(normalizedName, state, presetId));
  if (bytes.length > MAX_COMPACT_FX_PRESET_BYTES) {
    throw new Error("FX preset exceeds the compact-code size limit.");
  }
  return `${COMPACT_FX_PRESET_PREFIX}${bytesToBase64(bytes)}`;
}

export function decodeCompactFxPresetCode(input: string) {
  const code = input.trim();
  if (!code.startsWith(COMPACT_FX_PRESET_PREFIX)) {
    throw new Error(`Preset code must start with the ${COMPACT_FX_PRESET_PREFIX} prefix.`);
  }
  if (code.length > MAX_COMPACT_FX_PRESET_CODE_CHARS) {
    throw new Error("FX preset code exceeds the size limit.");
  }

  const encoded = code.slice(COMPACT_FX_PRESET_PREFIX.length);
  if (!encoded || encoded.length % 4 !== 0 || !CANONICAL_BASE64.test(encoded)) {
    throw new Error("Preset code contains invalid Base64 data.");
  }

  const bytes = base64ToBytes(encoded);
  if (bytes.length === 0 || bytes.length > MAX_COMPACT_FX_PRESET_BYTES || bytesToBase64(bytes) !== encoded) {
    throw new Error("Preset code contains invalid Base64 data.");
  }

  let preset;
  try {
    preset = fromBinary(PresetFileSchema, bytes);
  } catch {
    throw new Error("Preset code does not contain a valid protobuf preset.");
  }

  if (preset.moduleId !== "fx") {
    throw new Error("Preset code is not for the FX Module.");
  }
  validatePresetIdentity(preset.name.trim(), preset.id);
  requireSupportedSchemaVersion(preset.schemaVersion);
  if (preset.state.length === 0 || preset.state.length > MAX_COMPACT_FX_PRESET_BYTES) {
    throw new Error("Preset code contains no valid FX state.");
  }

  let decodedState;
  try {
    decodedState = fromBinary(FxChainStateSchema, preset.state);
  } catch {
    throw new Error("Preset code contains malformed FX state.");
  }
  requireSupportedSchemaVersion(decodedState.schemaVersion);
  if (decodedState.schemaVersion !== preset.schemaVersion) {
    throw new Error("Preset code schema versions do not match.");
  }
  if (containsNonFiniteNumber(decodedState)) {
    throw new Error("FX preset values must be finite numbers.");
  }

  return {
    name: preset.name.trim(),
    presetId: preset.id,
    state: normalizeFxChainState(decodedState),
  };
}
