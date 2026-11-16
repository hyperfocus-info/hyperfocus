import type { HostState } from "./bridge";
import { isValidCapabilityId, isValidModuleId } from "@hyperfocus/pad-pilot/module-identity";
import { isRecord } from '@hyperfocus/utilities/records';

export const MAX_HOST_JSON_INGRESS_CHARS = 8388608;
// Mirrors the native host-sync envelope. Individual fields retain their tighter
// native limits, while one legal aggregate frame can contain several of them.
export const MAX_HOST_PROTO_INGRESS_BYTES = 16777216;

const MAX_HOST_PROTO_INGRESS_BASE64_CHARS = Math.ceil(MAX_HOST_PROTO_INGRESS_BYTES / 3) * 4;
const MAX_HOST_JSON_INGRESS_NODES = 65_536;
const MAX_HOST_JSON_COLLECTION_ITEMS = 4096;

type UnknownRecord = Record<string, unknown>;



function hasOptionalString(record: UnknownRecord, key: string) {
  return record[key] === undefined || typeof record[key] === "string";
}

function hasStrings(record: UnknownRecord, keys: string[]) {
  return keys.every((key) => typeof record[key] === "string");
}

function isFiniteNumberArray(value: unknown) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

export function hasValidHostStateShape(value: unknown): value is HostState {
  if (!isRecord(value)) {
    return false;
  }
  for (const key of [
    "activeModuleStateBase64",
    "capabilityFrameEnvelopeBase64",
    "contentId",
    "name",
    "path",
    "selectedPresetId",
    "type",
    "visualizerFrameBase64",
  ]) {
    if (!hasOptionalString(value, key)) {
      return false;
    }
  }
  for (const key of ["activeModuleId", "selectedModuleId"]) {
    const moduleId = value[key];
    if (moduleId !== undefined && (typeof moduleId !== "string" || moduleId.length > 0 && !isValidModuleId(moduleId))) {
      return false;
    }
  }
  if (value.acceptedRevision !== undefined && typeof value.acceptedRevision !== "bigint") {
    return false;
  }
  for (const key of ["pathSelectionSequence", "projectBpm"]) {
    if (value[key] !== undefined && (typeof value[key] !== "number" || !Number.isFinite(value[key]))) {
      return false;
    }
  }
  if (value.controller !== undefined) {
    const controller = value.controller;
    if (
      !isRecord(controller) ||
      typeof controller.connected !== "boolean" ||
      typeof controller.frameIndex !== "number" ||
      !Number.isFinite(controller.frameIndex) ||
      !isFiniteNumberArray(controller.axes) ||
      !isFiniteNumberArray(controller.buttons)
    ) {
      return false;
    }
  }
  if (value.controllerConfig !== undefined) {
    const config = value.controllerConfig;
    if (
      !isRecord(config) ||
      config.rows !== undefined && !Array.isArray(config.rows) ||
      config.customLayouts !== undefined && !Array.isArray(config.customLayouts)
    ) {
      return false;
    }
    if (Array.isArray(config.rows) && !config.rows.every((row) =>
      isRecord(row) &&
      hasStrings(row, ["stableId", "hardwareId", "layoutKind", "customLayoutId"]) &&
      typeof row.isPrimary === "boolean"
    )) {
      return false;
    }
    if (Array.isArray(config.customLayouts) && !config.customLayouts.every((layout) =>
      isRecord(layout) &&
      hasStrings(layout, ["id", "name"]) &&
      Array.isArray(layout.buttonBindings) &&
      layout.buttonBindings.every((binding) =>
        isRecord(binding) &&
        typeof binding.bindingKind === "string" &&
        typeof binding.sourceIndex === "number" && Number.isFinite(binding.sourceIndex) &&
        typeof binding.threshold === "number" && Number.isFinite(binding.threshold)
      ) &&
      Array.isArray(layout.axisBindings) &&
      layout.axisBindings.every((binding) =>
        isRecord(binding) &&
        typeof binding.sourceIndex === "number" && Number.isFinite(binding.sourceIndex) &&
        typeof binding.inverted === "boolean"
      )
    )) {
      return false;
    }
  }
  if (value.inputDevices !== undefined) {
    if (!Array.isArray(value.inputDevices) || !value.inputDevices.every((device) =>
      isRecord(device) &&
      typeof device.connected === "boolean" &&
      hasStrings(device, [
        "activeLayoutKind",
        "detectedLayoutKind",
        "deviceId",
        "deviceKind",
        "displayName",
        "hardwareId",
        "runtimeDeviceId",
      ]) &&
      typeof device.frameIndex === "number" &&
      Number.isFinite(device.frameIndex) &&
      isFiniteNumberArray(device.axes) &&
      isFiniteNumberArray(device.buttons) &&
      isFiniteNumberArray(device.rawAxes) &&
      isFiniteNumberArray(device.rawButtons)
    )) {
      return false;
    }
  }
  if (value.modules !== undefined) {
    if (!Array.isArray(value.modules) || !value.modules.every((moduleItem) =>
      isRecord(moduleItem) &&
      typeof moduleItem.id === "string" && isValidModuleId(moduleItem.id) &&
      typeof moduleItem.name === "string" &&
      [
        "expectedModuleVersion",
        "loadErrorMessage",
        "loadStatus",
        "resolvedModuleVersion",
        "scriptEntryPath",
        "uiEntryPath",
        "version",
      ].every((key) => hasOptionalString(moduleItem, key)) &&
      (moduleItem.capabilities === undefined ||
        Array.isArray(moduleItem.capabilities) &&
        moduleItem.capabilities.every((capability) => typeof capability === "string" && isValidCapabilityId(capability)) &&
        new Set(moduleItem.capabilities).size === moduleItem.capabilities.length)
    )) {
      return false;
    }
  }
  if (value.presets !== undefined) {
    if (!Array.isArray(value.presets) || !value.presets.every((preset) =>
      isRecord(preset) && typeof preset.id === "string" && typeof preset.name === "string"
    )) {
      return false;
    }
  }
  for (const key of ["editorViewStates", "moduleStates", "runtimeDiagnostics"]) {
    if (value[key] !== undefined && !isRecord(value[key])) {
      return false;
    }
  }
  if (isRecord(value.runtimeDiagnostics) &&
      value.runtimeDiagnostics.chains !== undefined &&
      !Array.isArray(value.runtimeDiagnostics.chains)) {
    return false;
  }
  return true;
}

function base64DecodedByteSize(value: string) {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

export function isBoundedHostProtoPayload(payloadBase64: string) {
  if (
    payloadBase64.length > MAX_HOST_PROTO_INGRESS_BASE64_CHARS ||
    payloadBase64.length % 4 !== 0
  ) {
    return false;
  }

  let padding = 0;
  if (payloadBase64.endsWith("==")) {
    padding = 2;
  } else if (payloadBase64.endsWith("=")) {
    padding = 1;
  }
  const dataLength = payloadBase64.length - padding;
  for (let index = 0; index < payloadBase64.length; index += 1) {
    const code = payloadBase64.charCodeAt(index);
    const isDataCharacter =
      code >= 65 && code <= 90 ||
      code >= 97 && code <= 122 ||
      code >= 48 && code <= 57 ||
      code === 43 ||
      code === 47;
    if (index < dataLength ? !isDataCharacter : code !== 61) {
      return false;
    }
  }
  return base64DecodedByteSize(payloadBase64) <= MAX_HOST_PROTO_INGRESS_BYTES;
}

function inspectBoundedHostStateObject(root: unknown) {
  if (typeof root !== "object" || root === null || Array.isArray(root)) {
    return false;
  }

  const stack: Array<{ depth: number; value: unknown }> = [{ depth: 0, value: root }];
  const visited = new WeakSet<object>();
  let nodeCount = 0;
  let characterCount = 0;
  while (stack.length > 0) {
    const entry = stack.pop();
    if (!entry) {
      break;
    }
    nodeCount += 1;
    if (nodeCount > MAX_HOST_JSON_INGRESS_NODES) {
      return false;
    }
    const value = entry.value;
    if (typeof value === "string") {
      characterCount += value.length;
      if (characterCount > MAX_HOST_JSON_INGRESS_CHARS) {
        return false;
      }
      continue;
    }
    if (
      value === null ||
      value === undefined ||
      typeof value === "boolean" ||
      typeof value === "number" ||
      typeof value === "bigint"
    ) {
      continue;
    }
    if (typeof value !== "object" || entry.depth >= 32 || visited.has(value)) {
      return false;
    }
    visited.add(value);
    if (Array.isArray(value) && value.length > MAX_HOST_JSON_COLLECTION_ITEMS) {
      return false;
    }

    const properties = Object.keys(value);
    let propertyCount = 0;
    for (const property of properties) {
      propertyCount += 1;
      characterCount += property.length;
      if (
        propertyCount > MAX_HOST_JSON_COLLECTION_ITEMS ||
        characterCount > MAX_HOST_JSON_INGRESS_CHARS
      ) {
        return false;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, property);
      if (!descriptor || !("value" in descriptor)) {
        return false;
      }
      stack.push({ depth: entry.depth + 1, value: descriptor.value });
    }
  }
  return true;
}

export function isBoundedHostStateObject(root: unknown) {
  try {
    return inspectBoundedHostStateObject(root);
  } catch {
    return false;
  }
}
