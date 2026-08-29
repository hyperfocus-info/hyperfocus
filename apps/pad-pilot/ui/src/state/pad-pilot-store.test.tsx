import { afterEach, expect, it } from "bun:test";
import { For } from "solid-js";
import { render, screen, waitFor } from "@solidjs/testing-library";
import { resetBridgeStateForTests } from "../bridge";
import { usePadPilotStore, PadPilotStoreProvider, reconcileModuleItems } from "./pad-pilot-store";
import { createUiTest } from "../../../utils/tests/test-harness";

createUiTest("PadPilotStoreProvider", () => {
  afterEach(() => {
    delete window.__JUCE__;
    resetBridgeStateForTests();
    window.padpilotHostReceive?.({});
  });

  it("reuses module items when the host resends an unchanged module list", () => {
    const currentModules = [
      { id: "fx", name: "FX" },
      { id: "performance", name: "Performance" },
    ];

    const nextModules = reconcileModuleItems(currentModules, [
      { id: "fx", name: "FX" },
      { id: "performance", name: "Performance" },
    ]);

    expect(nextModules).toBe(currentModules);
    expect(nextModules[0]).toBe(currentModules[0]);
    expect(nextModules[1]).toBe(currentModules[1]);
  });

  it("keeps module button DOM nodes stable across identical host syncs", async () => {
    window.__JUCE__ = {
      backend: {
        addEventListener: () => 0,
      },
      initializationData: {
        __juce__functions: [],
      },
    };

    const Consumer = () => {
      const { state } = usePadPilotStore();

      return (
        <div>
          <For each={state.modules}>
            {(moduleItem) => (
              <button type="button" data-testid={`module-button-${moduleItem.id}`}>
                {moduleItem.name}
              </button>
            )}
          </For>
        </div>
      );
    };

    render(() => (
      <PadPilotStoreProvider>
        <Consumer />
      </PadPilotStoreProvider>
    ));

    window.padpilotHostReceive?.({
      modules: [
        { id: "fx", name: "FX" },
        { id: "performance", name: "Performance" },
        { id: "sampler", name: "Sampler" },
      ],
      selectedModuleId: "sampler",
    });

    await waitFor(() => {
      expect(screen.getByTestId("module-button-sampler").textContent).toBe("Sampler");
    });

    const samplerButton = screen.getByTestId("module-button-sampler");

    window.padpilotHostReceive?.({
      modules: [
        { id: "fx", name: "FX" },
        { id: "performance", name: "Performance" },
        { id: "sampler", name: "Sampler" },
      ],
      selectedModuleId: "sampler",
    });

    await waitFor(() => {
      expect(screen.getByTestId("module-button-sampler")).toBe(samplerButton);
    });
  });

  it("queues install result toasts from the public module install event", async () => {
    const Consumer = () => {
      const { state } = usePadPilotStore();
      return <div data-testid="toast-count">{state.toastQueue.length}</div>;
    };

    render(() => (
      <PadPilotStoreProvider>
        <Consumer />
      </PadPilotStoreProvider>
    ));

    window.dispatchEvent(new CustomEvent("padpilot-module-install-result", {
      detail: {
        module: { id: "custom", name: "Custom Module", version: "1.2.3" },
        success: true,
      },
    }));

    await waitFor(() => {
      expect(screen.getByTestId("toast-count").textContent).toBe("1");
    });
  });
});
