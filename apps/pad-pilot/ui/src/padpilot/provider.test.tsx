import { afterEach, expect, it } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createUiTest } from "../../../utils/tests/test-harness";
import { encodeFxChainStateBase64, createDefaultFxChainState } from "../modules/fx/fx-chain-state";
import { getDevHostRuntime } from "../dev-host/runtime";
import { resetBridgeStateForTests } from "../bridge";
import { createDefaultControllerConfig, encodeControllerConfigRequestBase64 } from "./controller-config";
import { ModuleSurface, PadPilotProvider, useControllerConfig, useEditorViewState, useGamepad, useInputDevices, useModuleInteraction, useModuleState } from "./provider";
import { bytesToBase64 } from "../proto/base64";

createUiTest("PadPilotProvider", () => {
  afterEach(() => {
    const runtime = getDevHostRuntime();
    runtime.updateSettings({ continuousHostSync: false, running: false });
    runtime.reset();
    resetBridgeStateForTests();
    window.__JUCE__ = undefined;
  });

  it("hydrates authoritative module state from the host runtime", async () => {
    const nextState = createDefaultFxChainState();
    nextState.revision = 2n;
    nextState.master!.wetDry = 0.35;

    const Consumer = () => {
      const [state] = useModuleState("fx", createDefaultFxChainState());
      return <span data-testid="wet-dry">{state().master?.wetDry}</span>;
    };

    render(() => (
      <PadPilotProvider>
        <ModuleSurface scopeId="fx">
          <Consumer />
        </ModuleSurface>
      </PadPilotProvider>
    ));

    getDevHostRuntime().sendIntent({
      type: "setModuleStateProto",
      moduleId: "fx",
      payloadBase64: encodeFxChainStateBase64(nextState),
      revision: "2",
    });

    await waitFor(() => {
      expect(Number(screen.getByTestId("wet-dry").textContent)).toBeCloseTo(0.35, 5);
    });
  });

  it("decodes UTF-8 generic module state from the host", async () => {
    const Consumer = () => {
      const [state] = useModuleState("editor", { notes: "fallback" });
      return <span data-testid="unicode-module-state">{state().notes}</span>;
    };

    render(() => (
      <PadPilotProvider>
        <ModuleSurface scopeId="editor">
          <Consumer />
        </ModuleSurface>
      </PadPilotProvider>
    ));

    const notes = "Café 🎛️ 東京";
    window.padpilotHostReceive?.({
      activeModuleId: "editor",
      activeModuleStateBase64: bytesToBase64(new TextEncoder().encode(JSON.stringify({ notes }))),
      selectedModuleId: "editor",
      type: "hostSyncProto",
    });

    await waitFor(() => {
      expect(screen.getByTestId("unicode-module-state").textContent).toBe(notes);
    });
  });

  it("clears cached module state when the host publishes an empty canonical payload", async () => {
    const Consumer = () => {
      const [state] = useModuleState("editor", { notes: "fallback" });
      return <span data-testid="empty-module-state">{state().notes}</span>;
    };
    render(() => (
      <PadPilotProvider>
        <Consumer />
      </PadPilotProvider>
    ));

    window.padpilotHostReceive?.({
      activeModuleId: "editor",
      activeModuleStateBase64: bytesToBase64(new TextEncoder().encode(JSON.stringify({ notes: "persisted" }))),
      selectedModuleId: "editor",
      type: "hostSyncProto",
    });
    await waitFor(() => expect(screen.getByTestId("empty-module-state").textContent).toBe("persisted"));

    window.padpilotHostReceive?.({
      activeModuleId: "editor",
      activeModuleStateBase64: "",
      selectedModuleId: "editor",
      type: "hostSyncProto",
    });
    await waitFor(() => expect(screen.getByTestId("empty-module-state").textContent).toBe("fallback"));
  });

  it("does not mutate local module or editor state when persistence serialization fails", async () => {
    const Consumer = () => {
      const [moduleState, setModuleState] = useModuleState<{ notes: string; value?: unknown }>("editor", { notes: "fallback" });
      const [viewState, setViewState] = useEditorViewState<{ panel: string; value?: unknown }>("editor-panel", { panel: "host" });
      return (
        <>
          <span data-testid="serialization-module-state">{moduleState().notes}</span>
          <span data-testid="serialization-view-state">{viewState().panel}</span>
          <button
            type="button"
            onClick={() => {
              setModuleState({ notes: "unpersistable", value: 1n });
              setViewState({ panel: "unpersistable", value: 1n });
            }}
          >
            Save unpersistable state
          </button>
        </>
      );
    };

    render(() => (
      <PadPilotProvider>
        <ModuleSurface scopeId="editor">
          <Consumer />
        </ModuleSurface>
      </PadPilotProvider>
    ));
    window.padpilotHostReceive?.({
      moduleStates: {
        editor: { notes: "host" },
      },
    });
    await waitFor(() => {
      expect(screen.getByTestId("serialization-module-state").textContent).toBe("host");
    });

    fireEvent.click(screen.getByRole("button", { name: "Save unpersistable state" }));

    expect(screen.getByTestId("serialization-module-state").textContent).toBe("host");
    expect(screen.getByTestId("serialization-view-state").textContent).toBe("host");
  });

  it("does not write fallback module state before authoritative host sync", async () => {
    const nativeInvocations: Array<{ eventId: string; payload: Record<string, unknown> }> = [];
    window.__JUCE__ = {
      backend: {
        addEventListener: () => 0,
        emitEvent: (eventId, payload) => {
          nativeInvocations.push({ eventId, payload: payload as Record<string, unknown> });
        },
      },
      initializationData: {
        __juce__functions: ["padpilotBridge"],
      },
    };

    const Consumer = () => {
      const [state] = useModuleState("fx", createDefaultFxChainState());
      return <span data-testid="default-wet-dry">{state().master?.wetDry}</span>;
    };

    render(() => (
      <PadPilotProvider>
        <ModuleSurface scopeId="fx">
          <Consumer />
        </ModuleSurface>
      </PadPilotProvider>
    ));

    expect(screen.getByTestId("default-wet-dry").textContent).toBe("1");
    await new Promise((resolve) => window.setTimeout(resolve, 25));

    const intentTypes = nativeInvocations.map((invocation) => {
      const params = invocation.payload.params as unknown[] | undefined;
      return JSON.parse(String(params?.[0] ?? "{}")).type as string | undefined;
    });
    expect(intentTypes.includes("setModuleStateProto")).toBe(false);
    expect(intentTypes.includes("setModuleState")).toBe(false);
  });

  it("queues user changes made before hydration and merges them onto host state", async () => {
    const nativeInvocations: Array<{ eventId: string; payload: Record<string, unknown> }> = [];
    window.__JUCE__ = {
      backend: {
        addEventListener: () => 0,
        emitEvent: (eventId, payload) => {
          nativeInvocations.push({ eventId, payload: payload as Record<string, unknown> });
        },
      },
      initializationData: {
        __juce__functions: ["padpilotBridge"],
      },
    };

    const Consumer = () => {
      const [state, setState] = useModuleState("editor", { notes: "fallback", theme: "default" });
      return (
        <>
          <span data-testid="queued-module-state">{state().notes}:{state().theme}</span>
          <button type="button" onClick={() => setState({ notes: "local" })}>Edit before hydration</button>
        </>
      );
    };
    render(() => (
      <PadPilotProvider>
        <Consumer />
      </PadPilotProvider>
    ));

    fireEvent.click(screen.getByRole("button", { name: "Edit before hydration" }));
    expect(screen.getByTestId("queued-module-state").textContent).toBe("local:default");
    await new Promise((resolve) => window.setTimeout(resolve, 25));
    const intentsBeforeHydration = nativeInvocations.map((invocation) => {
      const params = invocation.payload.params as unknown[] | undefined;
      return JSON.parse(String(params?.[0] ?? "{}")) as { type?: string };
    });
    expect(intentsBeforeHydration.some((intent) => intent.type === "setModuleState")).toBe(false);

    window.padpilotHostReceive?.({
      moduleStates: {
        editor: { notes: "host", theme: "host-theme" },
      },
    });
    await waitFor(() => {
      expect(screen.getByTestId("queued-module-state").textContent).toBe("local:host-theme");
    });
    await new Promise((resolve) => window.setTimeout(resolve, 25));

    const stateIntents = nativeInvocations.flatMap((invocation) => {
      const params = invocation.payload.params as unknown[] | undefined;
      const intent = JSON.parse(String(params?.[0] ?? "{}")) as { moduleId?: string; payload?: string; type?: string };
      return intent.type === "setModuleState" && intent.moduleId === "editor" ? [intent] : [];
    });
    expect(stateIntents).toHaveLength(1);
    expect(JSON.parse(stateIntents[0]?.payload ?? "{}")).toEqual({ notes: "local", theme: "host-theme" });
  });

  it("queues the latest host state during interaction and replays it after unlock without revision regression", async () => {
    window.__JUCE__ = {
      backend: {
        addEventListener: () => 0,
      },
      initializationData: {
        __juce__functions: [],
      },
    };

    const firstHostState = createDefaultFxChainState();
    firstHostState.master!.wetDry = 0.8;
    firstHostState.revision = 4n;
    const latestHostState = createDefaultFxChainState();
    latestHostState.master!.wetDry = 0.6;
    latestHostState.revision = 5n;
    const staleHostState = createDefaultFxChainState();
    staleHostState.master!.wetDry = 0.2;
    staleHostState.revision = 3n;

    const Consumer = () => {
      const [state] = useModuleState("fx", createDefaultFxChainState());
      const interaction = useModuleInteraction("fx");
      return (
        <>
          <span data-testid="locked-wet-dry">{state().master?.wetDry}</span>
          <button type="button" onClick={interaction.begin}>Lock</button>
          <button type="button" onClick={interaction.end}>Unlock</button>
        </>
      );
    };

    render(() => (
      <PadPilotProvider>
        <ModuleSurface scopeId="fx">
          <Consumer />
        </ModuleSurface>
      </PadPilotProvider>
    ));

    fireEvent.click(screen.getByRole("button", { name: "Lock" }));
    window.padpilotHostReceive?.({
      activeModuleStateBase64: encodeFxChainStateBase64(firstHostState),
      selectedModuleId: "fx",
    });
    window.padpilotHostReceive?.({
      activeModuleStateBase64: encodeFxChainStateBase64(latestHostState),
      selectedModuleId: "fx",
    });

    expect(Number(screen.getByTestId("locked-wet-dry").textContent)).not.toBeCloseTo(0.6, 5);

    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await waitFor(() => {
      expect(Number(screen.getByTestId("locked-wet-dry").textContent)).toBeCloseTo(0.6, 5);
    });

    window.padpilotHostReceive?.({
      activeModuleStateBase64: encodeFxChainStateBase64(staleHostState),
      selectedModuleId: "fx",
    });
    await new Promise((resolve) => window.setTimeout(resolve, 10));
    expect(Number(screen.getByTestId("locked-wet-dry").textContent)).toBeCloseTo(0.6, 5);
  });

  it("publishes input devices and derives the primary gamepad compatibility hook", async () => {
    const Consumer = () => {
      const inputDevices = useInputDevices();
      const gamepad = useGamepad();

      return (
        <>
          <span data-testid="device-count">{inputDevices().length}</span>
          <span data-testid="primary-gamepad">{gamepad().id}</span>
        </>
      );
    };

    render(() => (
      <PadPilotProvider>
        <ModuleSurface scopeId="fx">
          <Consumer />
        </ModuleSurface>
      </PadPilotProvider>
    ));

    getDevHostRuntime().setInputDevices([
      {
        axes: [0.25],
        buttons: [1],
        connected: true,
        deviceId: "deck-a",
        deviceKind: "gamepad",
        displayName: "Deck A",
        frameIndex: 1,
      },
      {
        axes: [],
        buttons: [],
        connected: true,
        deviceId: "deck-b",
        deviceKind: "gamepad",
        displayName: "Deck B",
        frameIndex: 2,
      },
    ]);

    await waitFor(() => {
      expect(screen.getByTestId("device-count").textContent).toBe("2");
      expect(screen.getByTestId("primary-gamepad").textContent).toBe("deck-a");
    });
  });

  it("hydrates controller config from the host runtime", async () => {
    const Consumer = () => {
      const controller = useControllerConfig();
      return <span data-testid="controller-row-count">{controller.config().rows.length}</span>;
    };

    render(() => (
      <PadPilotProvider>
        <Consumer />
      </PadPilotProvider>
    ));

    const config = createDefaultControllerConfig();
    config.rows.push({
      stableId: "row-2",
      hardwareId: "pad-b",
      layoutKind: "playstation",
      customLayoutId: "",
      isPrimary: false,
    });
    getDevHostRuntime().sendIntent({
      type: "setControllerConfig",
      payloadBase64: encodeControllerConfigRequestBase64(config),
    });
    getDevHostRuntime().setInputDevices([{
      axes: [],
      buttons: [],
      connected: true,
      deviceId: "pad-b",
      deviceKind: "gamepad",
      displayName: "Pad B",
      frameIndex: 1,
    }]);

    await waitFor(() => {
      expect(screen.getByTestId("controller-row-count").textContent).toBe("2");
    });
  });

  it("ignores stale host controller config until the matching local save echoes back", async () => {
    const nativeInvocations: Array<{ eventId: string; payload: Record<string, unknown> }> = [];
    window.__JUCE__ = {
      backend: {
        addEventListener: () => 0,
        emitEvent: (eventId, payload) => {
          nativeInvocations.push({ eventId, payload: payload as Record<string, unknown> });
        },
      },
      initializationData: {
        __juce__functions: ["padpilotBridge"],
      },
    };

    const defaultConfig = createDefaultControllerConfig();
    const nextConfig = createDefaultControllerConfig();
    nextConfig.rows.push({
      stableId: "row-2",
      hardwareId: "pad-b",
      layoutKind: "switch",
      customLayoutId: "",
      isPrimary: false,
    });

    const Consumer = () => {
      const controller = useControllerConfig();
      return (
        <>
          <span data-testid="controller-row-count">{controller.config().rows.length}</span>
          <button type="button" onClick={() => controller.setConfig(nextConfig)}>Save Config</button>
        </>
      );
    };

    render(() => (
      <PadPilotProvider>
        <Consumer />
      </PadPilotProvider>
    ));

    window.padpilotHostReceive?.({ controllerConfig: defaultConfig });
    await waitFor(() => {
      expect(screen.getByTestId("controller-row-count").textContent).toBe("1");
    });

    fireEvent.click(screen.getByRole("button", { name: "Save Config" }));

    await waitFor(() => {
      expect(screen.getByTestId("controller-row-count").textContent).toBe("2");
      expect(nativeInvocations.some((entry) => {
        const params = entry.payload.params as unknown[] | undefined;
        return JSON.parse(String(params?.[0] ?? "{}")).type === "setControllerConfig";
      })).toBe(true);
    });

    window.padpilotHostReceive?.({ controllerConfig: defaultConfig });
    expect(screen.getByTestId("controller-row-count").textContent).toBe("2");

    window.padpilotHostReceive?.({ controllerConfig: nextConfig });
    await waitFor(() => {
      expect(screen.getByTestId("controller-row-count").textContent).toBe("2");
    });
  });

  it("restores authoritative controller config when a local save is rejected", async () => {
    window.__JUCE__ = {
      backend: {
        addEventListener: () => 0,
        emitEvent: () => undefined,
      },
      initializationData: {
        __juce__functions: ["padpilotBridge"],
      },
    };

    const defaultConfig = createDefaultControllerConfig();
    const rejectedConfig = createDefaultControllerConfig();
    rejectedConfig.rows.push({
      stableId: "row-2",
      hardwareId: "pad-b",
      layoutKind: "switch",
      customLayoutId: "",
      isPrimary: false,
    });

    const Consumer = () => {
      const controller = useControllerConfig();
      return (
        <>
          <span data-testid="controller-row-count">{controller.config().rows.length}</span>
          <button type="button" onClick={() => controller.setConfig(rejectedConfig)}>Save Config</button>
        </>
      );
    };

    render(() => (
      <PadPilotProvider>
        <Consumer />
      </PadPilotProvider>
    ));

    window.padpilotHostReceive?.({ controllerConfig: defaultConfig });
    await waitFor(() => {
      expect(screen.getByTestId("controller-row-count").textContent).toBe("1");
    });

    fireEvent.click(screen.getByRole("button", { name: "Save Config" }));
    window.padpilotHostReceive?.({ controllerConfig: defaultConfig });
    expect(screen.getByTestId("controller-row-count").textContent).toBe("2");

    await new Promise((resolve) => window.setTimeout(resolve, 2_100));
    expect(screen.getByTestId("controller-row-count").textContent).toBe("1");
  });

  it("keeps fresh module and input state when a stale controller config echo arrives", async () => {
    const nativeInvocations: Array<{ eventId: string; payload: Record<string, unknown> }> = [];
    window.__JUCE__ = {
      backend: {
        addEventListener: () => 0,
        emitEvent: (eventId, payload) => {
          nativeInvocations.push({ eventId, payload: payload as Record<string, unknown> });
        },
      },
      initializationData: {
        __juce__functions: ["padpilotBridge"],
      },
    };

    const defaultConfig = createDefaultControllerConfig();
    const nextConfig = createDefaultControllerConfig();
    nextConfig.rows.push({
      stableId: "row-2",
      hardwareId: "pad-b",
      layoutKind: "switch",
      customLayoutId: "",
      isPrimary: false,
    });
    const freshState = createDefaultFxChainState();
    freshState.master!.wetDry = 0.33;
    freshState.revision = 9n;

    const Consumer = () => {
      const controller = useControllerConfig();
      const [state] = useModuleState("fx", createDefaultFxChainState());
      const inputDevices = useInputDevices();
      return (
        <>
          <span data-testid="controller-row-count">{controller.config().rows.length}</span>
          <span data-testid="wet-dry">{state().master?.wetDry}</span>
          <span data-testid="device-count">{inputDevices().length}</span>
          <button type="button" onClick={() => controller.setConfig(nextConfig)}>Save Config</button>
        </>
      );
    };

    render(() => (
      <PadPilotProvider>
        <ModuleSurface scopeId="fx">
          <Consumer />
        </ModuleSurface>
      </PadPilotProvider>
    ));

    window.padpilotHostReceive?.({ controllerConfig: defaultConfig });
    await waitFor(() => {
      expect(screen.getByTestId("controller-row-count").textContent).toBe("1");
    });

    fireEvent.click(screen.getByRole("button", { name: "Save Config" }));
    await waitFor(() => {
      expect(screen.getByTestId("controller-row-count").textContent).toBe("2");
      expect(nativeInvocations.some((entry) => {
        const params = entry.payload.params as unknown[] | undefined;
        return JSON.parse(String(params?.[0] ?? "{}")).type === "setControllerConfig";
      })).toBe(true);
    });

    window.padpilotHostReceive?.({
      activeModuleStateBase64: encodeFxChainStateBase64(freshState),
      controllerConfig: defaultConfig,
      inputDevices: [{
        activeLayoutKind: "xbox",
        axes: [0.5],
        buttons: [1],
        connected: true,
        detectedLayoutKind: "xbox",
        deviceId: "pad-b",
        deviceKind: "gamepad",
        displayName: "Pad B",
        frameIndex: 3,
        hardwareId: "pad-b",
        rawAxes: [0.5],
        rawButtons: [1],
        runtimeDeviceId: "pad-b#3",
      }],
      selectedModuleId: "fx",
    });

    await waitFor(() => {
      expect(screen.getByTestId("controller-row-count").textContent).toBe("2");
      expect(Number(screen.getByTestId("wet-dry").textContent)).toBeCloseTo(0.33, 5);
      expect(screen.getByTestId("device-count").textContent).toBe("1");
    });
  });

  it("clears the pending controller config gate after the matching echo and accepts later host updates", async () => {
    const nativeInvocations: Array<{ eventId: string; payload: Record<string, unknown> }> = [];
    window.__JUCE__ = {
      backend: {
        addEventListener: () => 0,
        emitEvent: (eventId, payload) => {
          nativeInvocations.push({ eventId, payload: payload as Record<string, unknown> });
        },
      },
      initializationData: {
        __juce__functions: ["padpilotBridge"],
      },
    };

    const defaultConfig = createDefaultControllerConfig();
    const nextConfig = createDefaultControllerConfig();
    nextConfig.rows.push({
      stableId: "row-2",
      hardwareId: "pad-b",
      layoutKind: "switch",
      customLayoutId: "",
      isPrimary: false,
    });
    const thirdConfig = createDefaultControllerConfig();
    thirdConfig.rows.push({
      stableId: "row-2",
      hardwareId: "pad-b",
      layoutKind: "switch",
      customLayoutId: "",
      isPrimary: false,
    });
    thirdConfig.rows.push({
      stableId: "row-3",
      hardwareId: "pad-c",
      layoutKind: "playstation",
      customLayoutId: "",
      isPrimary: false,
    });

    const Consumer = () => {
      const controller = useControllerConfig();
      return (
        <>
          <span data-testid="controller-row-count">{controller.config().rows.length}</span>
          <button type="button" onClick={() => controller.setConfig(nextConfig)}>Save Config</button>
        </>
      );
    };

    render(() => (
      <PadPilotProvider>
        <Consumer />
      </PadPilotProvider>
    ));

    window.padpilotHostReceive?.({ controllerConfig: defaultConfig });
    await waitFor(() => {
      expect(screen.getByTestId("controller-row-count").textContent).toBe("1");
    });

    fireEvent.click(screen.getByRole("button", { name: "Save Config" }));
    await waitFor(() => {
      expect(screen.getByTestId("controller-row-count").textContent).toBe("2");
      expect(nativeInvocations.some((entry) => {
        const params = entry.payload.params as unknown[] | undefined;
        return JSON.parse(String(params?.[0] ?? "{}")).type === "setControllerConfig";
      })).toBe(true);
    });

    window.padpilotHostReceive?.({ controllerConfig: nextConfig });
    await waitFor(() => {
      expect(screen.getByTestId("controller-row-count").textContent).toBe("2");
    });

    window.padpilotHostReceive?.({ controllerConfig: thirdConfig });
    await waitFor(() => {
      expect(screen.getByTestId("controller-row-count").textContent).toBe("3");
    });
  });
});
