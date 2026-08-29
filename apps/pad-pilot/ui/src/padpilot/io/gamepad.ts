import {
  bindInputDevices,
  EMPTY_INPUT_DEVICE,
  type PadPilotInputDeviceState,
} from "./input-device";

export type PadPilotGamepadState = {
  connected: boolean;
  id: string;
  axes: number[];
  buttons: number[];
};

export type BindControllerCallback = (state: PadPilotGamepadState) => void;

export const EMPTY_GAMEPAD: PadPilotGamepadState = {
  connected: false,
  id: "",
  axes: [],
  buttons: [],
};

export function toGamepadState(device: PadPilotInputDeviceState | null | undefined) {
  if (!device || !device.connected || device.deviceKind !== "gamepad") {
    return EMPTY_GAMEPAD;
  }

  return {
    connected: true,
    id: device.deviceId,
    axes: [...device.axes],
    buttons: [...device.buttons],
  };
}

export function getPrimaryGamepad(devices: PadPilotInputDeviceState[]) {
  return toGamepadState(
    devices.find((device) => device.connected && device.deviceKind === "gamepad") ??
      EMPTY_INPUT_DEVICE,
  );
}

export function bindController(callback: BindControllerCallback) {
  return bindInputDevices((devices) => callback(getPrimaryGamepad(devices)));
}
