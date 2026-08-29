import { afterEach, expect, it } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { encodeCompactFxPresetCode } from "./fx-compact-preset";
import { createDefaultFxChainState, decodeFxChainStateBase64 } from "./fx-chain-state";
import { getDevHostRuntime } from "../../dev-host/runtime";
import { FxModule } from "./fx-module";
import { ModuleSurface, PadPilotProvider } from "../../padpilot/provider";
import { bytesToBase64 } from "../../proto/base64";

createUiTest("FxModule", () => {
  afterEach(() => {
    const runtime = getDevHostRuntime();
    runtime.updateSettings({ continuousHostSync: false, running: false });
    runtime.reset();
  });

  it("renders the FX console shell with preset rail, active chain rack, and master I/O controls", () => {
    render(() => (
      <PadPilotProvider>
        <ModuleSurface scopeId="fx">
          <FxModule />
        </ModuleSurface>
      </PadPilotProvider>
    ));

    expect(screen.getByTestId("fx-console-shell")).not.toBeNull();
    expect(screen.getByTestId("fx-preset-rail")).not.toBeNull();
    expect(screen.getByTestId("fx-active-chain-rack")).not.toBeNull();
    expect(screen.getByTestId("fx-master-io-rack")).not.toBeNull();
    expect(screen.getByTestId("fx-creative-tools")).not.toBeNull();
    expect(screen.getByTestId("fx-lfo-1")).not.toBeNull();
    expect(screen.getByTestId("fx-lfo-2")).not.toBeNull();
    expect(screen.getByRole("combobox", { name: "Search presets" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Utility" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Creative" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Eras" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Favorites" })).not.toBeNull();
    expect(screen.getByRole("combobox", { name: "Add FX" })).not.toBeNull();
    expect(screen.getByTestId("master-mix-knob")).not.toBeNull();
    expect(screen.getByTestId("fx-dry-compare")).not.toBeNull();
    expect(screen.getByTestId("fx-peak-match")).not.toBeNull();
    expect(screen.getByTestId("node-bypass-button-1-1")).not.toBeNull();
    expect(screen.getByTestId("node-bypass-button-1-1").getAttribute("title")).toBeNull();
    expect(screen.getByTestId("add-chain-tab").getAttribute("title")).toBeNull();
  });

  it("keeps dry comparison transient and exposes its pressed state", () => {
    render(() => (
      <PadPilotProvider>
        <ModuleSurface scopeId="fx">
          <FxModule />
        </ModuleSurface>
      </PadPilotProvider>
    ));

    const compare = screen.getByTestId("fx-dry-compare");
    expect(compare.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(compare);
    expect(compare.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(compare);
    expect(compare.getAttribute("aria-pressed")).toBe("false");
  });

  it("does not overwrite host fx state with defaults on mount", async () => {
    const runtime = getDevHostRuntime();
    runtime.sendIntent({
      type: "sendCapabilityIntent",
      capability: "fx-graph",
      handle: "fx::fx-graph::primary",
      action: "set-master-wet-dry",
      payloadBase64: bytesToBase64(new TextEncoder().encode("0.33")),
    });

    render(() => (
      <PadPilotProvider>
        <ModuleSurface scopeId="fx">
          <FxModule />
        </ModuleSurface>
      </PadPilotProvider>
    ));

    let latestWetDry = 0;
    const unsubscribe = runtime.subscribe((hostState) => {
      if (hostState.activeModuleStateBase64) {
        latestWetDry = decodeFxChainStateBase64(hostState.activeModuleStateBase64).master?.wetDry ?? 0;
      }
    });

    await waitFor(() => {
      expect(latestWetDry).toBeCloseTo(0.33, 5);
    });

    unsubscribe();
  });

  it("adds chains through the compact tab action without relying on title", () => {
    render(() => (
      <PadPilotProvider>
        <ModuleSurface scopeId="fx">
          <FxModule />
        </ModuleSurface>
      </PadPilotProvider>
    ));

    const addChainButton = screen.getByTestId("add-chain-tab");
    fireEvent.click(addChainButton);

    expect(addChainButton.getAttribute("title")).toBeNull();
    expect(screen.getByTestId("chain-tab-2")).not.toBeNull();
  });

  it("opens preset management from the preset rail save action", () => {
    render(() => (
      <PadPilotProvider>
        <ModuleSurface scopeId="fx">
          <FxModule />
        </ModuleSurface>
      </PadPilotProvider>
    ));

    fireEvent.click(screen.getByTestId("chain-preset-save-as"));

    expect(screen.getByRole("dialog", { name: "Manage Module Presets" })).not.toBeNull();
  });

  it("applies a compressed protobuf preset code to canonical FX state", async () => {
    render(() => (
      <PadPilotProvider>
        <ModuleSurface scopeId="fx">
          <FxModule />
        </ModuleSurface>
      </PadPilotProvider>
    ));

    const state = createDefaultFxChainState();
    state.master!.wetDry = 0.23;
    const code = encodeCompactFxPresetCode("Host validation", state, "host-validation");
    let canonicalWetDry = 1;
    let canonicalRevision = 0n;
    const unsubscribe = getDevHostRuntime().subscribe((hostState) => {
      if (!hostState.activeModuleStateBase64) {
        return;
      }
      const canonical = decodeFxChainStateBase64(hostState.activeModuleStateBase64);
      canonicalWetDry = canonical.master!.wetDry;
      canonicalRevision = canonical.revision;
    });

    try {
      fireEvent.click(screen.getByTestId("fx-set-state-code"));
      expect(screen.getByRole("dialog", { name: "Set FX State" })).not.toBeNull();
      fireEvent.input(screen.getByRole("textbox", { name: /Compressed preset code/ }), { target: { value: code } });
      fireEvent.click(screen.getByRole("button", { name: "Apply State" }));

      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: "Set FX State" })).toBeNull();
        expect(Number(screen.getByTestId("master-mix-knob").getAttribute("aria-valuenow"))).toBeCloseTo(0.23, 5);
        expect(canonicalWetDry).toBeCloseTo(0.23, 5);
        expect(canonicalRevision).toBeGreaterThan(state.revision);
      });
    } finally {
      unsubscribe();
    }
  });

  it("keeps the compressed-state modal open and explains invalid input", () => {
    render(() => (
      <PadPilotProvider>
        <ModuleSurface scopeId="fx">
          <FxModule />
        </ModuleSurface>
      </PadPilotProvider>
    ));

    fireEvent.click(screen.getByTestId("fx-set-state-code"));
    fireEvent.input(screen.getByRole("textbox", { name: /Compressed preset code/ }), { target: { value: "broken" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply State" }));

    expect(screen.getByRole("alert").textContent).toContain("ppfx1:");
    expect(screen.getByRole("dialog", { name: "Set FX State" })).not.toBeNull();
  });

  it("generates a tagged chain through the curated idea workflow", async () => {
    render(() => (
      <PadPilotProvider>
        <ModuleSurface scopeId="fx">
          <FxModule />
        </ModuleSurface>
      </PadPilotProvider>
    ));

    fireEvent.click(screen.getByRole("button", { name: "reverse" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => {
      expect(screen.getByText("Generated Reverse Bloom.")).not.toBeNull();
    });
  });

  it("creates a public LFO route from the modulation matrix", () => {
    render(() => (
      <PadPilotProvider>
        <ModuleSurface scopeId="fx">
          <FxModule />
        </ModuleSurface>
      </PadPilotProvider>
    ));

    fireEvent.click(screen.getByRole("button", { name: "Route" }));

    expect(screen.getByRole("slider", { name: "Route 1 depth" })).not.toBeNull();
  });
});
