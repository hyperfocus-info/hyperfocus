import type { PadPilotControllerLayoutKind } from "../controller-config";
import {
  getLatestHostState,
  subscribeHostState,
  type HostState,
} from "../../bridge";

export type PadPilotInputDeviceKind = "unknown" | "gamepad";

export type PadPilotInputDeviceState = {
  connected: boolean;
  deviceId: string;
  runtimeDeviceId: string;
  hardwareId: string;
  deviceKind: PadPilotInputDeviceKind;
  displayName: string;
  frameIndex: number;
  axes: number[];
  buttons: number[];
  rawAxes: number[];
  rawButtons: number[];
  detectedLayoutKind: PadPilotControllerLayoutKind;
  activeLayoutKind: PadPilotControllerLayoutKind;
};

export const EMPTY_INPUT_DEVICE: PadPilotInputDeviceState = {
  connected: false,
  deviceId: "",
  runtimeDeviceId: "",
  hardwareId: "",
  deviceKind: "unknown",
  displayName: "",
  frameIndex: 0,
  axes: [],
  buttons: [],
  rawAxes: [],
  rawButtons: [],
  detectedLayoutKind: "auto",
  activeLayoutKind: "auto",
};

function cloneInputDevice(device: PadPilotInputDeviceState) {
  return {
    ...device,
    axes: [...device.axes],
    buttons: [...device.buttons],
    rawAxes: [...device.rawAxes],
    rawButtons: [...device.rawButtons],
  } satisfies PadPilotInputDeviceState;
}

export function inputDevicesFromHostState(hostState: HostState) {
  if (hostState.inputDevices) {
    return hostState.inputDevices.map(cloneInputDevice);
  }
  if (!hostState.controller) {
    return null;
  }
  return [{
    activeLayoutKind: "auto",
    axes: [...hostState.controller.axes],
    buttons: [...hostState.controller.buttons],
    connected: hostState.controller.connected,
    detectedLayoutKind: "auto",
    deviceId: "native-controller",
    deviceKind: "gamepad",
    displayName: "Primary Controller",
    frameIndex: hostState.controller.frameIndex,
    hardwareId: "native-controller",
    rawAxes: [...hostState.controller.axes],
    rawButtons: [...hostState.controller.buttons],
    runtimeDeviceId: "native-controller",
  }] satisfies PadPilotInputDeviceState[];
}

export function bindInputDevices(callback: (devices: PadPilotInputDeviceState[]) => void) {
  const publish = (hostState: HostState) => {
    const devices = inputDevicesFromHostState(hostState);
    if (devices) {
      callback(devices);
    }
  };
  const latest = getLatestHostState();
  const unsubscribe = subscribeHostState(publish);
  if (!inputDevicesFromHostState(latest)) {
    try {
      callback([]);
    } catch {
      // Public Module callbacks cannot break bridge subscription setup.
    }
  }
  return unsubscribe;
}
