import { describe, expect, it } from "bun:test";
import { browserGamepadsSupported, readBrowserGamepadDevices } from "./browser-gamepad-source";

function createGamepad(
  overrides: Omit<Partial<Gamepad>, "axes" | "buttons"> & { buttons?: readonly number[]; axes?: readonly number[] } = {},
) {
  return {
    axes: overrides.axes ?? [],
    buttons: (overrides.buttons ?? []).map((value) => ({ pressed: value > 0.5, touched: value > 0, value } as unknown as GamepadButton)),
    connected: overrides.connected ?? true,
    id: overrides.id ?? "Controller",
    index: overrides.index ?? 0,
    mapping: overrides.mapping ?? "standard",
    timestamp: overrides.timestamp ?? 0,
    vibrationActuator: null,
  } as unknown as Gamepad;
}

describe("browser-gamepad-source", () => {
  it("returns empty devices when the gamepad api is unavailable", () => {
    const result = readBrowserGamepadDevices(1, {});

    expect(browserGamepadsSupported({})).toBe(false);
    expect(result.browserGamepadSupported).toBe(false);
    expect(result.devices).toEqual([]);
  });

  it("filters null and disconnected entries", () => {
    const result = readBrowserGamepadDevices(2, {
      getGamepads: () => [
        null,
        createGamepad({ connected: false, id: "Disconnected", index: 1 }),
        createGamepad({ connected: true, id: "Connected Pad", index: 2 }),
      ],
    });

    expect(result.devices).toHaveLength(1);
    expect(result.devices[0]?.displayName).toBe("Connected Pad");
  });

  it("derives hardware, runtime, and device ids from browser gamepads", () => {
    const result = readBrowserGamepadDevices(3, {
      getGamepads: () => [createGamepad({ id: " Xbox Wireless Controller ", index: 4 })],
    });

    expect(result.devices[0]?.hardwareId).toBe("Xbox Wireless Controller");
    expect(result.devices[0]?.deviceId).toBe("browser-gamepad-4");
    expect(result.devices[0]?.runtimeDeviceId).toBe("Xbox Wireless Controller#4");
    expect(result.devices[0]?.frameIndex).toBe(3);
  });

  it("captures raw axes and raw button values from the browser gamepad object", () => {
    const result = readBrowserGamepadDevices(4, {
      getGamepads: () => [createGamepad({ axes: [0.25, -0.5], buttons: [1, 0.4] })],
    });

    expect(result.devices[0]?.rawAxes).toEqual([0.25, -0.5]);
    expect(result.devices[0]?.rawButtons).toEqual([1, 0.4]);
    expect(result.devices[0]?.axes).toEqual([0.25, -0.5]);
    expect(result.devices[0]?.buttons).toEqual([1, 0.4]);
  });
});
