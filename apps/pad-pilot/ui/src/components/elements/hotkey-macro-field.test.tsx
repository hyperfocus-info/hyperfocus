import { afterEach, expect, it } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { getDevHostRuntime } from "../../dev-host/runtime";
import { HotkeyMacroField } from "./hotkey-macro-field";
import { HotkeysProvider, getHotkeyManager, type PadPilotTriggerDefinition } from "../../padpilot/hotkeys";
import { ModuleSurface, PadPilotProvider } from "../../padpilot/provider";

createUiTest("HotkeyMacroField", () => {
  afterEach(() => {
    getHotkeyManager().destroy();
    const runtime = getDevHostRuntime();
    runtime.updateSettings({ continuousHostSync: false, running: false });
    runtime.reset();
    window.__JUCE__ = undefined;
  });

  it("records keyboard bindings and displays the formatted result", async () => {
    const Consumer = () => {
      const [value, setValue] = createSignal<PadPilotTriggerDefinition | null>(
        null,
      );

      return (
        <>
          <HotkeyMacroField
            label="Binding"
            onChange={setValue}
            value={value()}
          />
          <span data-testid="binding-json">{JSON.stringify(value())}</span>
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

    fireEvent.click(screen.getByRole("button", { name: "Record Binding" }));
    fireEvent.keyDown(document, { ctrlKey: true, key: "k" });

    await waitFor(() => {
      expect(screen.getByText("Control+K")).toBeTruthy();
      expect(screen.getByTestId("binding-json").textContent).toContain(
        "\"keyboard\":\"Control+K\"",
      );
    });
  });

  it("records controller bindings, surfaces missing devices, and allows threshold edits", async () => {
    const Consumer = () => {
      const [value, setValue] = createSignal<PadPilotTriggerDefinition | null>(
        {
          controller: {
            conditions: [
              {
                direction: "positive",
                index: 1,
                kind: "axis",
                threshold: 0.5,
              },
            ],
            scope: {
              deviceId: "deck-a",
              deviceKind: "gamepad",
              displayName: "Deck A",
              mode: "specific-device",
            },
            triggerMode: "edge",
          },
        },
      );

      return (
        <>
          <HotkeyMacroField
            label="Binding"
            mode="controller"
            onChange={setValue}
            value={value()}
          />
          <span data-testid="binding-json">{JSON.stringify(value())}</span>
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

    expect(
      screen.getByText("Waiting for the recorded device to reconnect."),
    ).toBeTruthy();

    getDevHostRuntime().setInputDevices([
      {
        axes: [0, 0.8],
        buttons: [],
        connected: true,
        deviceId: "deck-a",
        deviceKind: "gamepad",
        displayName: "Deck A",
        frameIndex: 1,
      },
    ]);

    await waitFor(() => {
      expect(
        screen.queryByText("Waiting for the recorded device to reconnect."),
      ).toBeNull();
    });

    fireEvent.input(screen.getByLabelText("Axis Threshold"), {
      currentTarget: { value: "0.8" },
      target: { value: "0.8" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("binding-json").textContent).toContain(
        "\"threshold\":0.8",
      );
    });
  });
});
