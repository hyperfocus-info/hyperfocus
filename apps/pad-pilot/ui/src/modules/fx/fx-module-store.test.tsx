import { afterEach, expect, it } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { getDevHostRuntime } from "../../dev-host/runtime";
import { FxNodeType, createDefaultFxChainState, encodeFxChainStateBase64 } from "./fx-chain-state";
import { FxModuleStoreProvider, useFxModuleActions, useFxModuleState } from "./fx-module-store";
import { buildTimingSyncControlKey } from "./timing-sync";
import { ModuleSurface, PadPilotProvider } from "../../padpilot/provider";

createUiTest("FxModuleStoreProvider", () => {
  afterEach(() => {
    const runtime = getDevHostRuntime();
    runtime.updateSettings({ continuousHostSync: false, running: false });
    runtime.reset();
  });

  it("adds chains, exposes undo and redo, and caps the graph with a toast", () => {
    const Consumer = () => {
      const state = useFxModuleState();
      const actions = useFxModuleActions();

      return (
        <>
          <span data-testid="chain-count">{state.session.working.chains.length}</span>
          <span data-testid="active-chain">{state.ui.activeChainId}</span>
          <span data-testid="can-undo">{actions.history.canUndo() ? "true" : "false"}</span>
          <span data-testid="can-redo">{actions.history.canRedo() ? "true" : "false"}</span>
          <span data-testid="toast-message">{state.ui.toastQueue[0]?.message ?? ""}</span>
          <button type="button" onClick={actions.chains.add}>Add chain</button>
          <button type="button" onClick={actions.history.undo}>Undo</button>
          <button type="button" onClick={actions.history.redo}>Redo</button>
          <button
            type="button"
            onClick={() => {
              for (let index = 0; index < 8; index += 1) {
                actions.chains.add();
              }
            }}
          >
            Fill chains
          </button>
        </>
      );
    };

    render(() => (
      <PadPilotProvider>
        <ModuleSurface scopeId="fx">
          <FxModuleStoreProvider>
            <Consumer />
          </FxModuleStoreProvider>
        </ModuleSurface>
      </PadPilotProvider>
    ));

    expect(screen.getByTestId("chain-count").textContent).toBe("1");
    expect(screen.getByTestId("can-undo").textContent).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Add chain" }));
    expect(screen.getByTestId("chain-count").textContent).toBe("2");
    expect(screen.getByTestId("active-chain").textContent).toBe("2");
    expect(screen.getByTestId("can-undo").textContent).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByTestId("chain-count").textContent).toBe("1");
    expect(screen.getByTestId("can-redo").textContent).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(screen.getByTestId("chain-count").textContent).toBe("2");

    fireEvent.click(screen.getByRole("button", { name: "Fill chains" }));
    expect(screen.getByTestId("chain-count").textContent).toBe("8");
    expect(screen.getByTestId("toast-message").textContent).toBe("You can only have 8 FX chains.");
  });

  it("clamps delay-bearing sync state and its automation range in the store", () => {
    const Consumer = () => {
      const state = useFxModuleState();
      const actions = useFxModuleActions();
      const reverbNode = () => state.session.working.chains[0]?.nodes.find((node) => node.type === FxNodeType.REVERB);
      const division = () => {
        const node = reverbNode();
        return node?.config.case === "reverbConfig" ? node.config.value.preDelaySync?.divisionIndex : undefined;
      };
      const divisionParameter = () => reverbNode()?.legacyParams.find((parameter) => parameter.parameterId === 6);

      return (
        <>
          <span data-testid="pre-delay-division">{division()}</span>
          <span data-testid="pre-delay-automation-max">{divisionParameter()?.maxValue}</span>
          <span data-testid="pre-delay-automation-value">{divisionParameter()?.value}</span>
          <button
            type="button"
            onClick={() => {
              const node = reverbNode();
              if (!node) {
                return;
              }
              actions.nodes.setControl(1, node.id, buildTimingSyncControlKey("preDelayMs", "enabled"), true, true);
              actions.nodes.setControl(1, node.id, buildTimingSyncControlKey("preDelayMs", "division"), 19, true);
            }}
          >
            Set oversized pre-delay
          </button>
        </>
      );
    };

    render(() => (
      <PadPilotProvider>
        <ModuleSurface scopeId="fx">
          <FxModuleStoreProvider>
            <Consumer />
          </FxModuleStoreProvider>
        </ModuleSurface>
      </PadPilotProvider>
    ));

    fireEvent.click(screen.getByRole("button", { name: "Set oversized pre-delay" }));
    expect(screen.getByTestId("pre-delay-division").textContent).toBe("10");
    expect(screen.getByTestId("pre-delay-automation-max").textContent).toBe("10");
    expect(screen.getByTestId("pre-delay-automation-value").textContent).toBe("10");
  });

  it("does not hold host sync for an unknown node control", async () => {
    const Consumer = () => {
      const state = useFxModuleState();
      const actions = useFxModuleActions();
      return (
        <>
          <span data-testid="invalid-control-wet-dry">{state.session.working.master?.wetDry}</span>
          <button
            type="button"
            onClick={() => {
              const node = state.session.working.chains[0]?.nodes[0];
              if (node) {
                actions.nodes.setControl(1, node.id, "unknown-control", 0.5, false);
              }
            }}
          >
            Set unknown control
          </button>
        </>
      );
    };

    render(() => (
      <PadPilotProvider>
        <ModuleSurface scopeId="fx">
          <FxModuleStoreProvider>
            <Consumer />
          </FxModuleStoreProvider>
        </ModuleSurface>
      </PadPilotProvider>
    ));

    fireEvent.click(screen.getByRole("button", { name: "Set unknown control" }));
    const hostState = createDefaultFxChainState();
    hostState.revision = 10n;
    hostState.master!.wetDry = 0.23;
    getDevHostRuntime().sendIntent({
      moduleId: "fx",
      payloadBase64: encodeFxChainStateBase64(hostState),
      revision: "10",
      type: "setModuleStateProto",
    });

    await waitFor(() => {
      expect(Number(screen.getByTestId("invalid-control-wet-dry").textContent)).toBeCloseTo(0.23, 5);
    });
  });

  it("ends an active automation gesture when the store unmounts", async () => {
    const runtime = getDevHostRuntime();
    runtime.reset();
    runtime.updateSettings({ continuousHostSync: false, running: false });
    const Consumer = () => {
      const actions = useFxModuleActions();
      return (
        <button type="button" onClick={() => actions.chains.setMix(1, 0.42, false)}>
          Start chain gesture
        </button>
      );
    };
    const result = render(() => (
      <PadPilotProvider>
        <ModuleSurface scopeId="fx">
          <FxModuleStoreProvider>
            <Consumer />
          </FxModuleStoreProvider>
        </ModuleSurface>
      </PadPilotProvider>
    ));

    fireEvent.click(screen.getByRole("button", { name: "Start chain gesture" }));
    await waitFor(() => {
      expect(runtime.getProducerActionLog().some((entry) => entry.action === "begin-touch")).toBe(true);
    });
    result.unmount();
    await waitFor(() => {
      expect(runtime.getProducerActionLog().some((entry) => entry.action === "end-touch")).toBe(true);
    });
  });
});
