import { expect, it } from "bun:test";
import { render, screen, waitFor } from "@solidjs/testing-library";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { PerformanceModule } from "./performance-module";
import { ModuleSurface, PadPilotProvider } from "../../padpilot/provider";
import { moduleSdk } from "../../module-sdk";
import { getDevHostRuntime } from "../../dev-host/runtime";

createUiTest("PerformanceModule", () => {
  it("renders note selection, transport, and status readouts", () => {
    render(() => (
      <PadPilotProvider>
        <ModuleSurface scopeId="performance">
          <PerformanceModule />
        </ModuleSurface>
      </PadPilotProvider>
    ));

    expect(screen.getByText("Performance Module")).not.toBeNull();
    expect(screen.getByRole("combobox", { name: "Root Note" })).not.toBeNull();
    expect(screen.getByRole("combobox", { name: "Scale" })).not.toBeNull();
    expect(screen.getByText("Last MIDI Note: --")).not.toBeNull();
  });

  it("sends note-off when the performance stick returns to rest", async () => {
    const runtime = getDevHostRuntime();
    runtime.reset();
    runtime.sendIntent({ type: "selectModule", moduleId: "performance" });
    const original = moduleSdk.sendCapabilityIntent;
    const midiActions: string[] = [];
    moduleSdk.sendCapabilityIntent = ((capability, handle, action, payloadBase64) => {
      if (capability === "midi-output") midiActions.push(action);
      return original(capability, handle, action, payloadBase64);
    }) as typeof moduleSdk.sendCapabilityIntent;

    try {
      render(() => (
        <PadPilotProvider>
          <ModuleSurface scopeId="performance">
            <PerformanceModule />
          </ModuleSurface>
        </PadPilotProvider>
      ));
      runtime.setInputDevices([{
        axes: [0, 0, 1, 0],
        buttons: Array.from({ length: 16 }, () => 0),
        connected: true,
        deviceId: "performance-test",
        deviceKind: "gamepad",
        displayName: "Performance Test Controller",
        frameIndex: 1,
      }]);
      await waitFor(() => expect(midiActions).toContain("note-on"));

      runtime.setInputDevices([{
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 16 }, () => 0),
        connected: true,
        deviceId: "performance-test",
        deviceKind: "gamepad",
        displayName: "Performance Test Controller",
        frameIndex: 2,
      }]);
      await waitFor(() => expect(midiActions).toEqual(["note-on", "note-off"]));
    } finally {
      moduleSdk.sendCapabilityIntent = original;
      runtime.reset();
    }
  });
});
