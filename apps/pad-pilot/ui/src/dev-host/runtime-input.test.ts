import { afterEach, describe, expect, it } from "bun:test";
import { waitFor } from "@solidjs/testing-library";
import type { HostState } from "../bridge";
import { getDevHostRuntime } from "./runtime";
import {
  createDefaultControllerConfig,
  createTemplateCustomLayout,
  encodeControllerConfigRequestBase64,
} from "../padpilot/controller-config";
import { bytesToBase64 } from "../proto/base64";

const originalGetGamepads = navigator.getGamepads?.bind(navigator);
const originalRequestAnimationFrame = window.requestAnimationFrame.bind(window);
const originalCancelAnimationFrame = window.cancelAnimationFrame.bind(window);

function mockBrowserGamepads(getGamepads: () => Array<Gamepad | null>) {
  Object.defineProperty(window.navigator, "getGamepads", {
    configurable: true,
    value: getGamepads,
  });
}

function installAnimationFrameHarness() {
  let nextHandle = 1;
  const callbacks = new Map<number, FrameRequestCallback>();

  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    const handle = nextHandle;
    nextHandle += 1;
    callbacks.set(handle, callback);
    return handle;
  }) as typeof window.requestAnimationFrame;

  window.cancelAnimationFrame = ((handle: number) => {
    callbacks.delete(handle);
  }) as typeof window.cancelAnimationFrame;

  return {
    flushFrame(timestamp = performance.now()) {
      const pending = [...callbacks.values()];
      callbacks.clear();
      for (const callback of pending) {
        callback(timestamp);
      }
    },
    pendingCount() {
      return callbacks.size;
    },
  };
}

function isolateRuntimeSubscribers() {
  const runtime = getDevHostRuntime();
  const internals = runtime as unknown as {
    debugListeners: Set<unknown>;
    hostListeners: Set<unknown>;
  };
  internals.hostListeners.clear();
  internals.debugListeners.clear();
  runtime.reset();
  return runtime;
}

function createBrowserGamepad(
  index: number,
  overrides: Omit<Partial<Gamepad>, "axes" | "buttons" | "connected" | "id"> & {
    axes?: readonly number[];
    buttons?: readonly number[];
    connected?: boolean;
    id?: string;
  } = {},
) {
  return {
    axes: overrides.axes ?? [],
    buttons: (overrides.buttons ?? []).map((value) => ({
      pressed: value >= 0.5,
      touched: value > 0,
      value,
    })),
    connected: overrides.connected ?? true,
    id: overrides.id ?? `Browser Pad ${index}`,
    index,
    mapping: overrides.mapping ?? "standard",
    timestamp: overrides.timestamp ?? 0,
    vibrationActuator: overrides.vibrationActuator ?? null,
  } as unknown as Gamepad;
}

describe("dev host controller and producer input", () => {
  afterEach(() => {
    if (originalGetGamepads) {
      mockBrowserGamepads(originalGetGamepads);
    } else {
      Reflect.deleteProperty(window.navigator, "getGamepads");
    }
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    const runtime = getDevHostRuntime();
    runtime.updateSettings({ continuousHostSync: false, running: false });
    runtime.reset();
  });

  it("routes the primary compatibility controller from the configured row instead of the first device", async () => {
    const runtime = getDevHostRuntime();
    runtime.reset();
    runtime.updateSettings({ continuousHostSync: false, running: false });

    let latestController: { connected: boolean; frameIndex: number; axes: number[]; buttons: number[] } | null = null;
    const unsubscribe = runtime.subscribe((state) => {
      if (!state.controller) {
        return;
      }
      latestController = {
        connected: state.controller.connected,
        frameIndex: state.controller.frameIndex,
        axes: [...state.controller.axes],
        buttons: [...state.controller.buttons],
      };
    });

    runtime.setInputDevices([
      {
        axes: [0.1],
        buttons: [0.2],
        connected: true,
        deviceId: "pad-a",
        deviceKind: "gamepad",
        displayName: "Pad A",
        frameIndex: 1,
      },
      {
        axes: [0.9],
        buttons: [1],
        connected: true,
        deviceId: "pad-b",
        deviceKind: "gamepad",
        displayName: "Pad B",
        frameIndex: 2,
      },
    ]);

    const config = createDefaultControllerConfig();
    config.rows[0] = {
      ...config.rows[0]!,
      hardwareId: "pad-b",
      layoutKind: "playstation",
      customLayoutId: "",
      isPrimary: true,
    };
    runtime.sendIntent({
      type: "setControllerConfig",
      payloadBase64: encodeControllerConfigRequestBase64(config),
    });

    await waitFor(() => {
      expect(latestController?.connected).toBe(true);
      expect(latestController?.frameIndex).toBe(2);
      expect(latestController?.axes[0]).toBe(0.9);
      expect(latestController?.buttons[0]).toBe(1);
    });

    unsubscribe();
  });

  it("starts browser controller polling even when running is false", async () => {
    const harness = installAnimationFrameHarness();
    let pollCount = 0;
    mockBrowserGamepads(() => {
      pollCount += 1;
      return [createBrowserGamepad(0, { buttons: [1], axes: [0.25] })];
    });

    const runtime = isolateRuntimeSubscribers();
    runtime.updateSettings({ continuousHostSync: false, running: false });

    const unsubscribe = runtime.subscribe(() => {
      return;
    });

    await waitFor(() => {
      expect(runtime.getDebugState().connectedControllerCount).toBe(1);
      expect(pollCount).toBeGreaterThan(0);
      expect(harness.pendingCount()).toBeGreaterThan(0);
    });

    unsubscribe();
  });

  it("stops browser controller polling when the last subscriber unsubscribes", async () => {
    const harness = installAnimationFrameHarness();
    let currentPads = [createBrowserGamepad(0, { buttons: [1] })];
    let pollCount = 0;
    mockBrowserGamepads(() => {
      pollCount += 1;
      return currentPads;
    });

    const runtime = isolateRuntimeSubscribers();
    runtime.updateSettings({ continuousHostSync: false, running: false });

    const unsubscribe = runtime.subscribe(() => {
      return;
    });

    expect(harness.pendingCount()).toBeGreaterThan(0);
    harness.flushFrame();
    expect(pollCount).toBeGreaterThan(0);
    expect(harness.pendingCount()).toBeGreaterThan(0);

    unsubscribe();
    const pollCountAfterUnsubscribe = pollCount;
    currentPads = [];
    harness.flushFrame();
    if (harness.pendingCount() > 0) {
      harness.flushFrame();
    }

    expect(pollCount).toBeLessThanOrEqual(pollCountAfterUnsubscribe + 1);
    expect(harness.pendingCount()).toBe(0);

    const stabilizedPollCount = pollCount;
    harness.flushFrame();
    expect(pollCount).toBe(stabilizedPollCount);
  });

  it("remaps browser controller snapshots through controller config and custom layouts", async () => {
    const harness = installAnimationFrameHarness();
    mockBrowserGamepads(() => [
      createBrowserGamepad(0, {
        id: "Custom Browser Pad",
        buttons: [0, 0, 0, 0, 0, 1],
        axes: [0.4, -0.2, 0.1, -0.1, 0.75],
      }),
    ]);

    const runtime = isolateRuntimeSubscribers();
    runtime.updateSettings({ continuousHostSync: false, running: false });

    const customLayout = createTemplateCustomLayout("Browser Custom");
    customLayout.buttonBindings[0] = { bindingKind: "button", sourceIndex: 5, threshold: 0.5 };
    customLayout.buttonBindings[6] = { bindingKind: "axis-positive", sourceIndex: 4, threshold: 0.15 };
    customLayout.axisBindings[0] = { sourceIndex: 1, inverted: true };

    const config = createDefaultControllerConfig();
    config.rows[0] = {
      ...config.rows[0]!,
      hardwareId: "Custom Browser Pad",
      layoutKind: "custom",
      customLayoutId: customLayout.id,
      isPrimary: true,
    };
    config.customLayouts = [customLayout];
    runtime.sendIntent({
      type: "setControllerConfig",
      payloadBase64: encodeControllerConfigRequestBase64(config),
    });

    let latestController: HostState["controller"] | null = null;
    const unsubscribe = runtime.subscribe((state) => {
      latestController = state.controller ?? null;
    });

    harness.flushFrame();

    await waitFor(() => {
      expect(latestController?.connected).toBe(true);
      expect(latestController?.buttons[0]).toBe(1);
      expect(latestController?.buttons[6]).toBe(0.75);
      expect(latestController?.axes[0]).toBe(0.2);
    });

    unsubscribe();
  });

  it("uses configured primary row for browser-polled controllers", async () => {
    const harness = installAnimationFrameHarness();
    mockBrowserGamepads(() => [
      createBrowserGamepad(0, { id: "Pad A", buttons: [0.2], axes: [0.1] }),
      createBrowserGamepad(1, { id: "Pad B", buttons: [1], axes: [0.9] }),
    ]);

    const runtime = isolateRuntimeSubscribers();
    runtime.updateSettings({ continuousHostSync: false, running: false });

    const config = createDefaultControllerConfig();
    config.rows[0] = {
      ...config.rows[0]!,
      hardwareId: "Pad B",
      layoutKind: "playstation",
      customLayoutId: "",
      isPrimary: true,
    };
    runtime.sendIntent({
      type: "setControllerConfig",
      payloadBase64: encodeControllerConfigRequestBase64(config),
    });

    let latestController: HostState["controller"] | null = null;
    const unsubscribe = runtime.subscribe((state) => {
      latestController = state.controller ?? null;
    });

    harness.flushFrame();

    await waitFor(() => {
      expect(latestController?.connected).toBe(true);
      expect(latestController?.axes[0]).toBe(0.9);
      expect(latestController?.buttons[0]).toBe(1);
    });

    unsubscribe();
  });

  it("removes disconnected browser gamepads and reports debug controller status", async () => {
    const harness = installAnimationFrameHarness();
    let connected = true;
    mockBrowserGamepads(() => connected ? [createBrowserGamepad(0, { id: "Xbox Wireless Controller", buttons: [1] })] : []);

    const runtime = isolateRuntimeSubscribers();
    runtime.updateSettings({ continuousHostSync: false, running: false });

    let latestController: HostState["controller"] | null = null;
    const unsubscribe = runtime.subscribe((state) => {
      latestController = state.controller ?? null;
    });

    harness.flushFrame();

    await waitFor(() => {
      expect(runtime.getDebugState().browserGamepadSupported).toBe(true);
      expect(runtime.getDebugState().connectedControllerCount).toBe(1);
      expect(latestController?.connected).toBe(true);
    });

    connected = false;
    harness.flushFrame();

    await waitFor(() => {
      expect(runtime.getDebugState().connectedControllerCount).toBe(0);
      expect(latestController?.connected).toBe(false);
    });

    unsubscribe();
  });

  it("releases held producer actions when their Module loses ownership", () => {
    const runtime = isolateRuntimeSubscribers();
    runtime.sendIntent({ type: "selectModule", moduleId: "performance" });
    runtime.sendIntent({
      type: "sendCapabilityIntent",
      capability: "midi-output",
      handle: "performance::midi-output::producer-actions",
      action: "note-on",
      payloadBase64: bytesToBase64(new TextEncoder().encode(JSON.stringify({ channel: 1, note: 64, velocity: 100 }))),
    });
    runtime.sendIntent({
      type: "sendCapabilityIntent",
      capability: "automation",
      handle: "performance::automation::producer-actions",
      action: "begin-touch",
      payloadBase64: bytesToBase64(new TextEncoder().encode("macro_1")),
    });

    runtime.sendIntent({ type: "selectModule", moduleId: "editor" });

    expect(runtime.getProducerActionLog().map(({ capability, action }) => `${capability}:${action}`)).toEqual([
      "midi-output:note-on",
      "automation:begin-touch",
      "midi-output:note-off",
      "automation:end-touch",
    ]);
  });
});
