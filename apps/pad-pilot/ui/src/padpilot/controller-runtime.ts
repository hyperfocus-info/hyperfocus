import {
  createDefaultAxisBindings,
  createDefaultButtonBindings,
  normalizeControllerConfig,
  type PadPilotControllerAxisBinding,
  type PadPilotControllerButtonBinding,
  type PadPilotControllerConfigState,
  type PadPilotControllerConfigRow,
} from "./controller-config";
import type { PadPilotInputDeviceState } from "./io/input-device";
import { clamp01 } from "../utils/math";

function lowerCopy(value: string) {
  return value.toLowerCase();
}

function normalizeTrigger(value: number) {
  return clamp01(value);
}

function applyButtonThreshold(value: number, threshold: number) {
  const normalizedValue = Number.isFinite(value) ? normalizeTrigger(value) : 0;
  const normalizedThreshold = Number.isFinite(threshold) ? normalizeTrigger(threshold) : 0.5;
  return normalizedValue >= normalizedThreshold ? normalizedValue : 0;
}

function detectLayoutHaystack(displayName: string, hardwareId: string) {
  return lowerCopy(`${displayName} ${hardwareId}`.trim());
}

function findControllerConfigRow(config: PadPilotControllerConfigState, hardwareId: string) {
  if (!hardwareId) {
    return null;
  }
  return config.rows.find((row) => row.hardwareId === hardwareId) ?? null;
}

function resolveCustomLayoutBindings(config: PadPilotControllerConfigState, row: PadPilotControllerConfigRow | null) {
  if (!row || row.layoutKind !== "custom" || !row.customLayoutId) {
    return null;
  }
  return config.customLayouts.find((layout) => layout.id === row.customLayoutId) ?? null;
}

function resolveButtonValue(device: PadPilotInputDeviceState, binding: PadPilotControllerButtonBinding) {
  switch (binding.bindingKind) {
    case "button":
      return applyButtonThreshold(device.rawButtons[binding.sourceIndex] ?? 0, binding.threshold);
    case "axis-positive":
      return applyButtonThreshold(device.rawAxes[binding.sourceIndex] ?? 0, binding.threshold);
    case "axis-negative":
      return applyButtonThreshold(-(device.rawAxes[binding.sourceIndex] ?? 0), binding.threshold);
    case "none":
    default:
      return 0;
  }
}

function resolveAxisValue(device: PadPilotInputDeviceState, binding: PadPilotControllerAxisBinding) {
  const value = device.rawAxes[binding.sourceIndex] ?? 0;
  return binding.inverted ? -value : value;
}

function cloneDevice(device: PadPilotInputDeviceState) {
  return {
    activeLayoutKind: device.activeLayoutKind,
    axes: [...device.axes],
    buttons: [...device.buttons],
    connected: device.connected,
    detectedLayoutKind: device.detectedLayoutKind,
    deviceId: device.deviceId,
    deviceKind: device.deviceKind,
    displayName: device.displayName,
    frameIndex: device.frameIndex,
    hardwareId: device.hardwareId,
    rawAxes: [...device.rawAxes],
    rawButtons: [...device.rawButtons],
    runtimeDeviceId: device.runtimeDeviceId,
  } satisfies PadPilotInputDeviceState;
}

export function detectControllerLayoutKind(displayName: string, hardwareId: string) {
  const haystack = detectLayoutHaystack(displayName, hardwareId);
  if (
    haystack.includes("xbox") ||
    haystack.includes("xinput") ||
    haystack.includes("microsoft")
  ) {
    return "xbox";
  }
  if (
    haystack.includes("dualshock") ||
    haystack.includes("dualsense") ||
    haystack.includes("playstation") ||
    haystack.includes("sony") ||
    haystack.includes("wireless controller")
  ) {
    return "playstation";
  }
  if (
    haystack.includes("switch") ||
    haystack.includes("joy-con") ||
    haystack.includes("pro controller") ||
    haystack.includes("nintendo")
  ) {
    return "switch";
  }
  return "generic";
}

export function remapInputDevice(
  device: PadPilotInputDeviceState,
  controllerConfig: PadPilotControllerConfigState,
) {
  const normalizedConfig = normalizeControllerConfig(controllerConfig);
  const nextDevice = cloneDevice(device);
  const row = findControllerConfigRow(normalizedConfig, nextDevice.hardwareId);
  const detectedLayoutKind = detectControllerLayoutKind(nextDevice.displayName, nextDevice.hardwareId);
  const activeLayoutKind = row?.layoutKind && row.layoutKind !== "auto"
    ? row.layoutKind
    : detectedLayoutKind || "generic";
  const customLayout = resolveCustomLayoutBindings(normalizedConfig, row);
  const buttonBindings = customLayout?.buttonBindings ?? createDefaultButtonBindings();
  const axisBindings = customLayout?.axisBindings ?? createDefaultAxisBindings();

  nextDevice.detectedLayoutKind = detectedLayoutKind;
  nextDevice.activeLayoutKind = activeLayoutKind;
  nextDevice.axes = axisBindings.map((binding) => resolveAxisValue(nextDevice, binding));
  nextDevice.buttons = buttonBindings.map((binding) => resolveButtonValue(nextDevice, binding));
  return nextDevice;
}

export function remapInputDevices(
  devices: readonly PadPilotInputDeviceState[],
  controllerConfig: PadPilotControllerConfigState,
) {
  return devices.map((device) => remapInputDevice(device, controllerConfig));
}

export function getPrimaryConfiguredInputDevice(
  devices: readonly PadPilotInputDeviceState[],
  controllerConfig: PadPilotControllerConfigState,
) {
  const normalizedConfig = normalizeControllerConfig(controllerConfig);
  const primaryRow = normalizedConfig.rows.find((row) => row.isPrimary && row.hardwareId.length > 0);
  if (primaryRow) {
    const match = devices.find((device) =>
      device.connected && device.deviceKind === "gamepad" && device.hardwareId === primaryRow.hardwareId);
    if (match) {
      return match;
    }
  }

  return devices.find((device) => device.connected && device.deviceKind === "gamepad") ?? null;
}
