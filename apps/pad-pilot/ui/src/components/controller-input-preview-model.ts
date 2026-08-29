import type { DropdownOption } from "./elements/dropdown";
import type { PadPilotInputDeviceState } from "../padpilot/io/input-device";

export const ALL_CONTROLLER_PREVIEW_SCOPE = "__all__";
export const CANONICAL_PREVIEW_BUTTON_COUNT = 16;
export const CANONICAL_PREVIEW_AXIS_COUNT = 4;

export type ControllerPreviewScope = typeof ALL_CONTROLLER_PREVIEW_SCOPE | string;

export const PREVIEW_BUTTON_LABELS = [
  "A / South",
  "B / East",
  "X / West",
  "Y / North",
  "LB",
  "RB",
  "LT",
  "RT",
  "Select",
  "Start",
  "L3",
  "R3",
  "D-Pad Up",
  "D-Pad Down",
  "D-Pad Left",
  "D-Pad Right",
] as const;

export const PREVIEW_STICK_LABELS = ["Left Stick", "Right Stick"] as const;

const BUTTON_ACTIVE_EPSILON = 0.05;
const AXIS_ACTIVE_EPSILON = 0.08;

function roundDisplay(value: number) {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function truncateLabel(value: string) {
  return value.trim() || "Controller";
}

function pluralize(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getConnectedGamepads(devices: readonly PadPilotInputDeviceState[]) {
  return devices.filter((device) => device.connected && device.deviceKind === "gamepad");
}

export function normalizePreviewButtons(buttons: readonly number[]) {
  return Array.from({ length: CANONICAL_PREVIEW_BUTTON_COUNT }, (_, index) => clamp01(buttons[index] ?? 0));
}

export function normalizePreviewAxes(axes: readonly number[]) {
  return Array.from({ length: CANONICAL_PREVIEW_AXIS_COUNT }, (_, index) => axes[index] ?? 0);
}

function extractOverflow(device: PadPilotInputDeviceState) {
  const buttons = device.rawButtons
    .slice(CANONICAL_PREVIEW_BUTTON_COUNT)
    .map((value, index) => ({
      index: index + CANONICAL_PREVIEW_BUTTON_COUNT,
      value: clamp01(value ?? 0),
    }));
  const axes = device.rawAxes
    .slice(CANONICAL_PREVIEW_AXIS_COUNT)
    .map((value, index) => ({
      index: index + CANONICAL_PREVIEW_AXIS_COUNT,
      value: value ?? 0,
    }));

  return {
    buttons,
    axes,
    hasOverflow: buttons.length > 0 || axes.length > 0,
    hasActivity:
      buttons.some((entry) => entry.value > BUTTON_ACTIVE_EPSILON) ||
      axes.some((entry) => Math.abs(entry.value) > AXIS_ACTIVE_EPSILON),
  };
}

function strongestAxisValue(values: readonly number[]) {
  return values.reduce((strongest, current) => Math.abs(current) > Math.abs(strongest) ? current : strongest, 0);
}

function isDeviceActive(device: PadPilotInputDeviceState) {
  return (
    normalizePreviewButtons(device.buttons).some((value) => value > BUTTON_ACTIVE_EPSILON) ||
    normalizePreviewAxes(device.axes).some((value) => Math.abs(value) > AXIS_ACTIVE_EPSILON) ||
    extractOverflow(device).hasActivity
  );
}

function summarizeControls(buttons: readonly number[], axes: readonly number[]) {
  const activeParts = PREVIEW_BUTTON_LABELS.flatMap((label, index) => {
    const value = buttons[index] ?? 0;
    if (value <= BUTTON_ACTIVE_EPSILON) {
      return [];
    }
    if (index === 6 || index === 7) {
      return [`${label} ${Math.round(value * 100)}%`];
    }
    return [label];
  });

  const leftMagnitude = Math.max(Math.abs(axes[0] ?? 0), Math.abs(axes[1] ?? 0));
  if (leftMagnitude > AXIS_ACTIVE_EPSILON) {
    activeParts.push(`${PREVIEW_STICK_LABELS[0]} (${roundDisplay(axes[0] ?? 0)}, ${roundDisplay(axes[1] ?? 0)})`);
  }

  const rightMagnitude = Math.max(Math.abs(axes[2] ?? 0), Math.abs(axes[3] ?? 0));
  if (rightMagnitude > AXIS_ACTIVE_EPSILON) {
    activeParts.push(`${PREVIEW_STICK_LABELS[1]} (${roundDisplay(axes[2] ?? 0)}, ${roundDisplay(axes[3] ?? 0)})`);
  }

  return activeParts;
}

function summarizeOverflowGroups(
  groups: ReadonlyArray<{
    buttons: ReadonlyArray<{ index: number; value: number }>;
    axes: ReadonlyArray<{ index: number; value: number }>;
  }>,
) {
  return groups.flatMap((group) => [
    ...group.buttons
      .filter((entry) => entry.value > BUTTON_ACTIVE_EPSILON)
      .map((entry) => `Raw B${entry.index} ${Math.round(entry.value * 100)}%`),
    ...group.axes
      .filter((entry) => Math.abs(entry.value) > AXIS_ACTIVE_EPSILON)
      .map((entry) => `Raw A${entry.index} ${roundDisplay(entry.value)}`),
  ]);
}

function summarizeScopeLabel(scope: ControllerPreviewScope, devices: readonly PadPilotInputDeviceState[]) {
  if (scope === ALL_CONTROLLER_PREVIEW_SCOPE) {
    return "All Connected Devices";
  }

  const match = devices.find((device) => device.runtimeDeviceId === scope);
  if (!match) {
    return "All Connected Devices";
  }

  return `${truncateLabel(match.displayName)} (${match.runtimeDeviceId})`;
}

function selectedDevice(devices: readonly PadPilotInputDeviceState[], scope: ControllerPreviewScope) {
  if (scope === ALL_CONTROLLER_PREVIEW_SCOPE) {
    return null;
  }
  return devices.find((device) => device.runtimeDeviceId === scope) ?? null;
}

export function buildControllerPreviewScopeOptions(devices: readonly PadPilotInputDeviceState[]) {
  return [
    { value: ALL_CONTROLLER_PREVIEW_SCOPE, label: "All Connected Devices" },
    ...getConnectedGamepads(devices).map((device) => ({
      value: device.runtimeDeviceId,
      label: `${truncateLabel(device.displayName)} (${device.runtimeDeviceId})`,
    })),
  ] satisfies DropdownOption[];
}

export function resolveControllerPreviewScope(devices: readonly PadPilotInputDeviceState[], scope: ControllerPreviewScope) {
  if (scope === ALL_CONTROLLER_PREVIEW_SCOPE) {
    return scope;
  }

  return getConnectedGamepads(devices).some((device) => device.runtimeDeviceId === scope)
    ? scope
    : ALL_CONTROLLER_PREVIEW_SCOPE;
}

export function buildControllerPreviewModel(devices: readonly PadPilotInputDeviceState[], scope: ControllerPreviewScope) {
  const connectedDevices = getConnectedGamepads(devices);
  const resolvedScope = resolveControllerPreviewScope(connectedDevices, scope);
  const selected = selectedDevice(connectedDevices, resolvedScope);
  const scopedDevices = selected ? [selected] : connectedDevices;

  const buttons = Array.from({ length: CANONICAL_PREVIEW_BUTTON_COUNT }, (_, index) =>
    clamp01(Math.max(...scopedDevices.map((device) => device.buttons[index] ?? 0), 0)));
  const axes = Array.from({ length: CANONICAL_PREVIEW_AXIS_COUNT }, (_, index) =>
    strongestAxisValue(scopedDevices.map((device) => device.axes[index] ?? 0)));
  const activeLabels = summarizeControls(buttons, axes);
  const activeDeviceCount = connectedDevices.filter(isDeviceActive).length;
  const overflowGroups = (resolvedScope === ALL_CONTROLLER_PREVIEW_SCOPE ? connectedDevices : scopedDevices)
    .map((device) => {
      const overflow = extractOverflow(device);
      return {
        axes: overflow.axes,
        buttons: overflow.buttons,
        deviceLabel: `${truncateLabel(device.displayName)} (${device.runtimeDeviceId})`,
        hasActivity: overflow.hasActivity,
        hasOverflow: overflow.hasOverflow,
        runtimeDeviceId: device.runtimeDeviceId,
      };
    })
    .filter((group) => group.hasOverflow);
  const overflowSummaryLabels = summarizeOverflowGroups(overflowGroups);
  const summaryLabels = activeLabels.length > 0 ? activeLabels : overflowSummaryLabels;

  const activeSummary = summaryLabels.length === 0
    ? "Idle"
    : resolvedScope === ALL_CONTROLLER_PREVIEW_SCOPE
      ? `${pluralize(activeDeviceCount, "device", "devices")} active: ${summaryLabels.join(", ")}`
      : `Active: ${summaryLabels.join(", ")}`;

  const connectionSummary = connectedDevices.length === 0
    ? "No connected controllers"
    : resolvedScope === ALL_CONTROLLER_PREVIEW_SCOPE
      ? `${pluralize(connectedDevices.length, "connected controller", "connected controllers")}`
      : `Monitoring ${summarizeScopeLabel(resolvedScope, connectedDevices)}`;

  return {
    activeDeviceCount,
    activeSummary,
    axes,
    buttons,
    connectedDeviceCount: connectedDevices.length,
    connectionSummary,
    empty: connectedDevices.length === 0,
    overflowGroups,
    resolvedScope,
    scopeLabel: summarizeScopeLabel(resolvedScope, connectedDevices),
    selectedDeviceLabel: selected ? `${truncateLabel(selected.displayName)} (${selected.runtimeDeviceId})` : null,
  };
}

export function createPreviewDevice(overrides: Partial<PadPilotInputDeviceState> = {}) {
  return {
    activeLayoutKind: overrides.activeLayoutKind ?? "auto",
    axes: overrides.axes ?? [],
    buttons: overrides.buttons ?? [],
    connected: overrides.connected ?? true,
    detectedLayoutKind: overrides.detectedLayoutKind ?? "auto",
    deviceId: overrides.deviceId ?? "device-a",
    deviceKind: overrides.deviceKind ?? "gamepad",
    displayName: overrides.displayName ?? "Controller",
    frameIndex: overrides.frameIndex ?? 1,
    hardwareId: overrides.hardwareId ?? overrides.deviceId ?? "device-a",
    rawAxes: overrides.rawAxes ?? overrides.axes ?? [],
    rawButtons: overrides.rawButtons ?? overrides.buttons ?? [],
    runtimeDeviceId: overrides.runtimeDeviceId ?? overrides.deviceId ?? "device-a",
  } satisfies PadPilotInputDeviceState;
}

import { clamp01 } from "../utils/math";
