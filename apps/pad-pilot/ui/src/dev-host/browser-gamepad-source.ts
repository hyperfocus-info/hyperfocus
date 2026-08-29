import type { PadPilotInputDeviceState } from "../padpilot/io/input-device";

type NavigatorWithGamepads = {
  getGamepads?: () => ArrayLike<Gamepad | null> | null;
} | null | undefined;

function trimOrFallback(value: string, fallback: string) {
  const trimmed = value.trim();
  return trimmed || fallback;
}

export function browserGamepadsSupported(navigatorLike: NavigatorWithGamepads = globalThis.navigator) {
  return typeof navigatorLike?.getGamepads === "function";
}

export function readBrowserGamepadDevices(
  frameIndex: number,
  navigatorLike: NavigatorWithGamepads = globalThis.navigator,
) {
  if (!browserGamepadsSupported(navigatorLike)) {
    return {
      browserGamepadSupported: false,
      devices: [] as PadPilotInputDeviceState[],
    };
  }

  const gamepads = navigatorLike?.getGamepads?.();
  const devices: PadPilotInputDeviceState[] = [];

  for (const entry of Array.from(gamepads ?? [])) {
    if (!entry || entry.connected === false) {
      continue;
    }

    const hardwareId = trimOrFallback(entry.id, `browser-gamepad-${entry.index}`);
    const deviceId = `browser-gamepad-${entry.index}`;
    const displayName = trimOrFallback(entry.id, `Browser Gamepad ${entry.index}`);
    const rawAxes = [...entry.axes];
    const rawButtons = entry.buttons.map((button) => button.value);

    devices.push({
      activeLayoutKind: "auto",
      axes: [...rawAxes],
      buttons: [...rawButtons],
      connected: true,
      detectedLayoutKind: "auto",
      deviceId,
      deviceKind: "gamepad",
      displayName,
      frameIndex,
      hardwareId,
      rawAxes,
      rawButtons,
      runtimeDeviceId: `${hardwareId}#${entry.index}`,
    });
  }

  return {
    browserGamepadSupported: true,
    devices,
  };
}
