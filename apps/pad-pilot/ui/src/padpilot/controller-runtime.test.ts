import { describe, expect, it } from "bun:test";
import {
  createDefaultControllerConfig,
  createTemplateCustomLayout,
} from "./controller-config";
import {
  detectControllerLayoutKind,
  getPrimaryConfiguredInputDevice,
  remapInputDevice,
  remapInputDevices,
} from "./controller-runtime";
import type { PadPilotInputDeviceState } from "./io/input-device";

function createRawDevice(overrides: Partial<PadPilotInputDeviceState> = {}) {
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
    runtimeDeviceId: overrides.runtimeDeviceId ?? overrides.deviceId ?? "device-a#0",
  } satisfies PadPilotInputDeviceState;
}

describe("controller-runtime", () => {
  it("detects layout kinds from controller identity strings", () => {
    expect(detectControllerLayoutKind("Xbox Wireless Controller", "xinput-pad")).toBe("xbox");
    expect(detectControllerLayoutKind("DualSense Wireless Controller", "sony-pad")).toBe("playstation");
    expect(detectControllerLayoutKind("Nintendo Switch Pro Controller", "switch-pad")).toBe("switch");
    expect(detectControllerLayoutKind("Arcade Board", "generic-pad")).toBe("generic");
  });

  it("resolves auto rows to the detected layout kind", () => {
    const config = createDefaultControllerConfig();
    config.rows[0] = {
      ...config.rows[0]!,
      hardwareId: "sony-pad",
      layoutKind: "auto",
    };

    const remapped = remapInputDevice(createRawDevice({
      displayName: "DualSense Wireless Controller",
      hardwareId: "sony-pad",
      rawButtons: [1],
    }), config);

    expect(remapped.detectedLayoutKind).toBe("playstation");
    expect(remapped.activeLayoutKind).toBe("playstation");
  });

  it("resolves explicit layout rows over detected layout", () => {
    const config = createDefaultControllerConfig();
    config.rows[0] = {
      ...config.rows[0]!,
      hardwareId: "sony-pad",
      layoutKind: "xbox",
    };

    const remapped = remapInputDevice(createRawDevice({
      displayName: "DualSense Wireless Controller",
      hardwareId: "sony-pad",
      rawButtons: [1],
    }), config);

    expect(remapped.detectedLayoutKind).toBe("playstation");
    expect(remapped.activeLayoutKind).toBe("xbox");
  });

  it("resolves custom layouts and remaps canonical buttons from raw buttons", () => {
    const config = createDefaultControllerConfig();
    const customLayout = createTemplateCustomLayout("Studio Pad");
    customLayout.buttonBindings[0] = { bindingKind: "button", sourceIndex: 9, threshold: 0.5 };
    config.customLayouts = [customLayout];
    config.rows[0] = {
      ...config.rows[0]!,
      customLayoutId: customLayout.id,
      hardwareId: "studio-pad",
      layoutKind: "custom",
    };

    const remapped = remapInputDevice(createRawDevice({
      hardwareId: "studio-pad",
      rawButtons: Array.from({ length: 10 }, (_, index) => index === 9 ? 1 : 0),
    }), config);

    expect(remapped.activeLayoutKind).toBe("custom");
    expect(remapped.buttons[0]).toBe(1);
    expect(remapped.buttons[1]).toBe(0);
  });

  it("remaps canonical trigger buttons from raw axes with clamped values", () => {
    const remapped = remapInputDevice(createRawDevice({
      hardwareId: "xbox-pad",
      rawAxes: [-0.5, 0, 0, 0, 0.72, -0.3],
    }), createDefaultControllerConfig());

    expect(remapped.buttons[6]).toBeCloseTo(0.72, 4);
    expect(remapped.buttons[7]).toBe(0);
  });

  it("gates positive and negative axis button bindings at their configured thresholds", () => {
    const config = createDefaultControllerConfig();
    const customLayout = createTemplateCustomLayout("Thresholds");
    customLayout.buttonBindings[0] = { bindingKind: "axis-positive", sourceIndex: 0, threshold: 0.5 };
    customLayout.buttonBindings[1] = { bindingKind: "axis-negative", sourceIndex: 1, threshold: 0.5 };
    config.customLayouts = [customLayout];
    config.rows[0] = {
      ...config.rows[0]!,
      customLayoutId: customLayout.id,
      hardwareId: "threshold-pad",
      layoutKind: "custom",
    };

    const below = remapInputDevice(createRawDevice({
      hardwareId: "threshold-pad",
      rawAxes: [0.49, -0.49],
    }), config);
    const at = remapInputDevice(createRawDevice({
      hardwareId: "threshold-pad",
      rawAxes: [0.5, -0.5],
    }), config);
    const above = remapInputDevice(createRawDevice({
      hardwareId: "threshold-pad",
      rawAxes: [0.8, -0.8],
    }), config);

    expect(below.buttons.slice(0, 2)).toEqual([0, 0]);
    expect(at.buttons.slice(0, 2)).toEqual([0.5, 0.5]);
    expect(above.buttons.slice(0, 2)).toEqual([0.8, 0.8]);
  });

  it("remaps inverted axis bindings correctly", () => {
    const config = createDefaultControllerConfig();
    const customLayout = createTemplateCustomLayout("Inverted");
    customLayout.axisBindings[1] = { sourceIndex: 1, inverted: true };
    config.customLayouts = [customLayout];
    config.rows[0] = {
      ...config.rows[0]!,
      customLayoutId: customLayout.id,
      hardwareId: "invert-pad",
      layoutKind: "custom",
    };

    const remapped = remapInputDevice(createRawDevice({
      hardwareId: "invert-pad",
      rawAxes: [0.25, -0.65, 0, 0],
    }), config);

    expect(remapped.axes[0]).toBe(0.25);
    expect(remapped.axes[1]).toBe(0.65);
  });

  it("routes the primary controller from the configured row", () => {
    const config = createDefaultControllerConfig();
    config.rows[0] = {
      ...config.rows[0]!,
      hardwareId: "pad-b",
      isPrimary: true,
    };

    const devices = remapInputDevices([
      createRawDevice({ hardwareId: "pad-a", rawButtons: [0.2] }),
      createRawDevice({ hardwareId: "pad-b", rawButtons: [1] }),
    ], config);

    expect(getPrimaryConfiguredInputDevice(devices, config)?.hardwareId).toBe("pad-b");
  });

  it("falls back to the first connected gamepad when no primary row matches", () => {
    const devices = remapInputDevices([
      createRawDevice({ hardwareId: "pad-a" }),
      createRawDevice({ hardwareId: "pad-b" }),
    ], createDefaultControllerConfig());

    expect(getPrimaryConfiguredInputDevice(devices, createDefaultControllerConfig())?.hardwareId).toBe("pad-a");
  });
});
