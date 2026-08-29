import { afterEach, describe, expect, it } from "bun:test";
import { resetBridgeStateForTests } from "../../bridge";
import { bindController } from "./gamepad";
import { bindInputDevices } from "./input-device";

function installNativeBridgeStub() {
  window.__JUCE__ = {
    backend: {
      addEventListener: () => 0,
    },
    initializationData: {
      __juce__functions: [],
    },
  };
}

describe("host input bindings", () => {
  afterEach(() => {
    delete window.__JUCE__;
    resetBridgeStateForTests();
  });

  it("publishes live host devices through public IO bindings and isolates callbacks", () => {
    installNativeBridgeStub();
    const deviceFrames: number[] = [];
    const gamepadFrames: number[] = [];
    const throwingUnsubscribe = bindInputDevices(() => {
      throw new Error("broken module callback");
    });
    const unsubscribeDevices = bindInputDevices((devices) => {
      deviceFrames.push(devices[0]?.frameIndex ?? -1);
    });
    const unsubscribeController = bindController((gamepad) => {
      gamepadFrames.push(gamepad.buttons[0] ?? -1);
    });

    window.padpilotHostReceive?.({
      inputDevices: [{
        activeLayoutKind: "xbox",
        axes: [0.25],
        buttons: [0.8],
        connected: true,
        detectedLayoutKind: "xbox",
        deviceId: "device-1",
        deviceKind: "gamepad",
        displayName: "Controller",
        frameIndex: 42,
        hardwareId: "hardware-1",
        rawAxes: [0.5],
        rawButtons: [1],
        runtimeDeviceId: "runtime-1",
      }],
    });

    expect(deviceFrames).toEqual([-1, 42]);
    expect(gamepadFrames).toEqual([-1, 0.8]);

    throwingUnsubscribe();
    unsubscribeDevices();
    unsubscribeController();
  });

  it("normalizes legacy controller frames once for provider and public IO consumers", () => {
    installNativeBridgeStub();
    const frames: Array<{ deviceId?: string; rawButton?: number }> = [];
    const unsubscribe = bindInputDevices((devices) => {
      frames.push({
        deviceId: devices[0]?.deviceId,
        rawButton: devices[0]?.rawButtons[0],
      });
    });

    window.padpilotHostReceive?.({
      controller: {
        axes: [-0.5],
        buttons: [1],
        connected: true,
        frameIndex: 7,
      },
    });

    expect(frames.at(-1)).toEqual({ deviceId: "native-controller", rawButton: 1 });
    unsubscribe();
  });
});
