import { afterEach, expect, it } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { createUiTest } from "../../../utils/tests/test-harness";
import { resetBridgeStateForTests } from "../bridge";
import { getDevHostRuntime } from "../dev-host/runtime";
import { ModuleSurface, PadPilotProvider } from "./provider";
import {
  HotkeysProvider,
  createHotkey,
  getHotkeyManager,
} from "./hotkeys";
import { base64ToBytes } from "../proto/base64";

createUiTest("PadPilotHotkeys", () => {
  afterEach(() => {
    getHotkeyManager().destroy();
    const runtime = getDevHostRuntime();
    runtime.updateSettings({ continuousHostSync: false, running: false });
    runtime.reset();
    window.__JUCE__ = undefined;
    resetBridgeStateForTests();
  });

  it("keeps keyboard hotkeys working through the PadPilot wrapper", async () => {
    const Consumer = () => {
      const [count, setCount] = createSignal(0);

      createHotkey("Mod+K", (event) => {
        event.preventDefault();
        setCount((current) => current + 1);
      });

      return <span data-testid="keyboard-count">{count()}</span>;
    };

    render(() => (
      <PadPilotProvider>
        <HotkeysProvider>
          <ModuleSurface scopeId="fx">
            <Consumer />
          </ModuleSurface>
        </HotkeysProvider>
      </PadPilotProvider>
    ));

    fireEvent.keyDown(document, { ctrlKey: true, key: "k" });

    await waitFor(() => {
      expect(screen.getByTestId("keyboard-count").textContent).toBe("1");
    });
  });

  it("supports combined keyboard and controller bindings with one callback", async () => {
    const Consumer = () => {
      const [lastSource, setLastSource] = createSignal("none");

      createHotkey(
        {
          controller: {
            conditions: [{ index: 0, kind: "button" }],
            scope: { mode: "all-devices" },
          },
          keyboard: "Mod+J",
        },
        (_event, context) => {
          setLastSource(context.source);
        },
      );

      return <span data-testid="last-source">{lastSource()}</span>;
    };

    render(() => (
      <PadPilotProvider>
        <HotkeysProvider>
          <ModuleSurface scopeId="fx">
            <Consumer />
          </ModuleSurface>
        </HotkeysProvider>
      </PadPilotProvider>
    ));

    fireEvent.keyDown(document, { ctrlKey: true, key: "j" });
    await waitFor(() => {
      expect(screen.getByTestId("last-source").textContent).toBe("keyboard");
    });

    getDevHostRuntime().setInputDevices([
      {
        axes: [],
        buttons: [1],
        connected: true,
        deviceId: "deck-a",
        deviceKind: "gamepad",
        displayName: "Deck A",
        frameIndex: 1,
      },
    ]);

    await waitFor(() => {
      expect(screen.getByTestId("last-source").textContent).toBe("controller");
    });
  });

  it("distinguishes all-devices and specific-device controller scopes", async () => {
    const Consumer = () => {
      const [allCount, setAllCount] = createSignal(0);
      const [specificCount, setSpecificCount] = createSignal(0);

      createHotkey(
        {
          controller: {
            conditions: [{ index: 0, kind: "button" }],
            scope: { mode: "all-devices" },
          },
        },
        () => setAllCount((current) => current + 1),
      );

      createHotkey(
        {
          controller: {
            conditions: [{ index: 0, kind: "button" }],
            scope: {
              deviceId: "deck-a",
              deviceKind: "gamepad",
              displayName: "Deck A",
              mode: "specific-device",
            },
          },
        },
        () => setSpecificCount((current) => current + 1),
      );

      return (
        <>
          <span data-testid="all-count">{allCount()}</span>
          <span data-testid="specific-count">{specificCount()}</span>
        </>
      );
    };

    render(() => (
      <PadPilotProvider>
        <HotkeysProvider>
          <ModuleSurface scopeId="fx">
            <Consumer />
          </ModuleSurface>
        </HotkeysProvider>
      </PadPilotProvider>
    ));

    getDevHostRuntime().setInputDevices([
      {
        axes: [],
        buttons: [1],
        connected: true,
        deviceId: "deck-b",
        deviceKind: "gamepad",
        displayName: "Deck B",
        frameIndex: 1,
      },
    ]);

    await waitFor(() => {
      expect(screen.getByTestId("all-count").textContent).toBe("1");
      expect(screen.getByTestId("specific-count").textContent).toBe("0");
    });

    getDevHostRuntime().setInputDevices([
      {
        axes: [],
        buttons: [0],
        connected: true,
        deviceId: "deck-b",
        deviceKind: "gamepad",
        displayName: "Deck B",
        frameIndex: 2,
      },
    ]);

    getDevHostRuntime().setInputDevices([
      {
        axes: [],
        buttons: [1],
        connected: true,
        deviceId: "deck-a",
        deviceKind: "gamepad",
        displayName: "Deck A",
        frameIndex: 3,
      },
    ]);

    await waitFor(() => {
      expect(screen.getByTestId("all-count").textContent).toBe("2");
      expect(screen.getByTestId("specific-count").textContent).toBe("1");
    });
  });

  it("supports edge and continuous controller trigger modes", async () => {
    const Consumer = () => {
      const [edgeCount, setEdgeCount] = createSignal(0);
      const [continuousCount, setContinuousCount] = createSignal(0);

      createHotkey(
        {
          controller: {
            conditions: [{ index: 0, kind: "button" }],
            scope: { mode: "all-devices" },
            triggerMode: "edge",
          },
        },
        () => setEdgeCount((current) => current + 1),
      );

      createHotkey(
        {
          controller: {
            conditions: [{ index: 0, kind: "button" }],
            scope: { mode: "all-devices" },
            triggerMode: "continuous",
          },
        },
        () => setContinuousCount((current) => current + 1),
      );

      return (
        <>
          <span data-testid="edge-count">{edgeCount()}</span>
          <span data-testid="continuous-count">{continuousCount()}</span>
        </>
      );
    };

    render(() => (
      <PadPilotProvider>
        <HotkeysProvider>
          <ModuleSurface scopeId="fx">
            <Consumer />
          </ModuleSurface>
        </HotkeysProvider>
      </PadPilotProvider>
    ));

    const pressedDevice = {
      axes: [],
      buttons: [1],
      connected: true,
      deviceId: "deck-a",
      deviceKind: "gamepad" as const,
      displayName: "Deck A",
      frameIndex: 1,
    };

    getDevHostRuntime().setInputDevices([pressedDevice]);
    await waitFor(() => {
      expect(screen.getByTestId("edge-count").textContent).toBe("1");
      expect(Number(screen.getByTestId("continuous-count").textContent)).toBeGreaterThanOrEqual(1);
    });

    getDevHostRuntime().setInputDevices([{ ...pressedDevice, frameIndex: 2 }]);
    await waitFor(() => {
      expect(screen.getByTestId("edge-count").textContent).toBe("1");
      expect(
        Number(screen.getByTestId("continuous-count").textContent),
      ).toBeGreaterThan(1);
    });
  });

  it("requires a declared keyboard-output capability before native key synthesis", async () => {
    const nativeIntents: Array<Record<string, unknown>> = [];
    window.__JUCE__ = {
      backend: {
        addEventListener: () => 0,
        emitEvent: (eventId, payload) => {
          if (eventId !== "__juce__invoke") {
            return;
          }
          const invocation = payload as { name?: string; params?: unknown[] };
          if (invocation.name === "padpilotBridge") {
            nativeIntents.push(JSON.parse(String(invocation.params?.[0] ?? "{}")) as Record<string, unknown>);
          }
        },
      },
      initializationData: {
        __juce__functions: ["padpilotBridge"],
      },
    };

    const Consumer = () => {
      createHotkey(
        {
          controller: {
            conditions: [{ index: 0, kind: "button" }],
            keyboardOutput: ["Ctrl+K"],
            scope: { mode: "all-devices" },
          },
        },
        () => undefined,
      );
      return <span>keyboard output</span>;
    };

    render(() => (
      <PadPilotProvider>
        <HotkeysProvider>
          <ModuleSurface scopeId="custom-module">
            <Consumer />
          </ModuleSurface>
        </HotkeysProvider>
      </PadPilotProvider>
    ));

    const publish = (capabilities: string[], pressed: boolean, frameIndex: number) => {
      window.padpilotHostReceive?.({
        inputDevices: [{
          activeLayoutKind: "auto",
          axes: [],
          buttons: [pressed ? 1 : 0],
          connected: true,
          detectedLayoutKind: "auto",
          deviceId: "deck-a",
          deviceKind: "gamepad",
          displayName: "Deck A",
          frameIndex,
          hardwareId: "deck-a",
          rawAxes: [],
          rawButtons: [pressed ? 1 : 0],
          runtimeDeviceId: "deck-a",
        }],
        modules: [{
          capabilities,
          id: "custom-module",
          loadStatus: "ready",
          name: "Custom Module",
        }],
        selectedModuleId: "custom-module",
      });
    };

    publish([], true, 1);
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(nativeIntents.some((intent) => intent.capability === "keyboard-output")).toBe(false);

    publish(["keyboard-output"], false, 2);
    publish(["keyboard-output"], true, 3);
    await waitFor(() => {
      const intent = nativeIntents.find((candidate) => candidate.capability === "keyboard-output");
      expect(intent).toEqual(expect.objectContaining({
        action: "execute",
        handle: "custom-module::keyboard-output::primary",
        type: "sendCapabilityIntent",
      }));
      const shortcuts = JSON.parse(
        new TextDecoder().decode(base64ToBytes(String(intent?.payloadBase64 ?? ""))),
      );
      expect(shortcuts).toEqual(["Ctrl+K"]);
    });
  });
});
