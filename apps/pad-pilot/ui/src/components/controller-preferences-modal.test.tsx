import { afterEach, expect, it } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { createUiTest } from "../../../utils/tests/test-harness";
import { ControllerPreferencesModal } from "./controller-preferences-modal";
import { PadPilotProvider } from "../padpilot/provider";
import { getDevHostRuntime } from "../dev-host/runtime";

createUiTest("ControllerPreferencesModal", () => {
  const renderModal = () =>
    render(() => (
      <PadPilotProvider>
        <ControllerPreferencesModal open onClose={() => undefined} />
      </PadPilotProvider>
    ));

  const getDeleteButtons = () =>
    screen
      .getAllByRole("button")
      .filter((button) => button.textContent?.includes("Delete"));

  const getPreviewScope = () => screen.getByRole("combobox", { name: "Preview Scope" }) as HTMLSelectElement;

  afterEach(() => {
    getDevHostRuntime().reset();
    window.__JUCE__ = undefined;
  });

  it("adds and deletes mapping rows while keeping sequential device labels", async () => {
    renderModal();

    expect(screen.getByText("Device 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add Device" }));

    await waitFor(() => {
      expect(screen.getByText("Device 2")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add Device" }));

    let secondDeleteButton: HTMLButtonElement | undefined;
    await waitFor(() => {
      expect(screen.getByText("Device 3")).toBeTruthy();
      const deleteButtons = getDeleteButtons() as HTMLButtonElement[];
      expect(deleteButtons).toHaveLength(3);
      secondDeleteButton = deleteButtons[1];
    });

    fireEvent.click(secondDeleteButton!);

    await waitFor(() => {
      expect(screen.getByText("Device 2")).toBeTruthy();
      expect(screen.queryByText("Device 3")).toBeNull();
    });
  });

  it("recreates a blank first row after deleting the final mapping", async () => {
    renderModal();

    fireEvent.click(getDeleteButtons()[0]!);

    await waitFor(() => {
      expect(screen.getByText("Device 1")).toBeTruthy();
      expect(screen.getAllByText("No hardware assigned").length).toBeGreaterThan(0);
    });
  });

  it("renders the live input preview section below device mappings", () => {
    renderModal();

    const mappingHeading = screen.getByText("Device Mappings");
    const previewHeading = screen.getByText("Live Input Preview");

    expect(mappingHeading.compareDocumentPosition(previewHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("img", { name: "Live controller input preview" })).toBeTruthy();
  });

  it("shows all connected devices plus connected controller options in the preview selector", async () => {
    renderModal();

    getDevHostRuntime().setInputDevices([
      {
        axes: [],
        buttons: [],
        connected: true,
        deviceId: "deck-a",
        deviceKind: "gamepad",
        displayName: "Deck A",
        frameIndex: 1,
        runtimeDeviceId: "runtime-a",
      },
      {
        axes: [],
        buttons: [],
        connected: true,
        deviceId: "deck-b",
        deviceKind: "gamepad",
        displayName: "Deck B",
        frameIndex: 2,
        runtimeDeviceId: "runtime-b",
      },
      {
        axes: [],
        buttons: [],
        connected: true,
        deviceId: "midi-a",
        deviceKind: "unknown",
        displayName: "MIDI Surface",
        frameIndex: 3,
      },
    ]);

    await waitFor(() => {
      const options = within(getPreviewScope()).getAllByRole("option").map((option) => option.textContent);
      expect(options).toEqual([
        "All Connected Devices",
        "Deck A (runtime-a)",
        "Deck B (runtime-b)",
      ]);
    });
  });

  it("shows the empty-state message when no controllers are connected", () => {
    renderModal();

    expect(screen.getByText("Connect a controller to preview live input.")).toBeTruthy();
    expect(screen.getByText("Idle")).toBeTruthy();
  });

  it("updates the status summary when button input changes", async () => {
    renderModal();

    getDevHostRuntime().setInputDevices([{
      axes: [],
      buttons: [1, 0, 0, 0, 0, 1],
      connected: true,
      deviceId: "deck-a",
      deviceKind: "gamepad",
      displayName: "Deck A",
      frameIndex: 1,
    }]);

    await waitFor(() => {
      expect(screen.getByText("1 device active: A / South, RB")).toBeTruthy();
      expect(screen.getByText("1 connected controller")).toBeTruthy();
    });
  });

  it("updates the status summary when stick and trigger input changes", async () => {
    renderModal();

    getDevHostRuntime().setInputDevices([{
      axes: [0.25, -0.5, 0.81, 0],
      buttons: [0, 0, 0, 0, 0, 0, 0.62],
      connected: true,
      deviceId: "deck-a",
      deviceKind: "gamepad",
      displayName: "Deck A",
      frameIndex: 1,
      runtimeDeviceId: "runtime-a",
    }]);

    fireEvent.input(getPreviewScope(), { currentTarget: { value: "runtime-a" }, target: { value: "runtime-a" } });

    await waitFor(() => {
      expect(screen.getByText("Active: LT 62%, Left Stick (0.25, -0.50), Right Stick (0.81, 0.00)")).toBeTruthy();
      expect(screen.getByText("Monitoring Deck A (runtime-a)")).toBeTruthy();
    });
  });

  it("renders overflow raw input when a device exposes extra controls", async () => {
    renderModal();

    getDevHostRuntime().setInputDevices([{
      axes: [0.2, 0, 0, 0],
      buttons: [1],
      connected: true,
      deviceId: "deck-a",
      deviceKind: "gamepad",
      displayName: "Deck A",
      frameIndex: 1,
      rawAxes: [0.2, 0, 0, 0, -0.75],
      rawButtons: Array.from({ length: 18 }, (_, index) => index === 16 ? 1 : 0),
      runtimeDeviceId: "runtime-a",
    }]);

    await waitFor(() => {
      expect(screen.getByText("Overflow Raw Input")).toBeTruthy();
      expect(screen.getAllByText("Deck A (runtime-a)").length).toBeGreaterThan(0);
      expect(screen.getByText("B16")).toBeTruthy();
      expect(screen.getByText("A4")).toBeTruthy();
    });
  });

  it("resets the selected scope to all connected devices when the selected runtime device disappears", async () => {
    renderModal();

    getDevHostRuntime().setInputDevices([
      {
        axes: [],
        buttons: [1],
        connected: true,
        deviceId: "deck-a",
        deviceKind: "gamepad",
        displayName: "Deck A",
        frameIndex: 1,
        runtimeDeviceId: "runtime-a",
      },
      {
        axes: [],
        buttons: [],
        connected: true,
        deviceId: "deck-b",
        deviceKind: "gamepad",
        displayName: "Deck B",
        frameIndex: 2,
        runtimeDeviceId: "runtime-b",
      },
    ]);

    await waitFor(() => {
      expect(within(getPreviewScope()).getByRole("option", { name: "Deck A (runtime-a)" })).toBeTruthy();
    });

    fireEvent.input(getPreviewScope(), { currentTarget: { value: "runtime-a" }, target: { value: "runtime-a" } });

    await waitFor(() => {
      expect(screen.getAllByText("Deck A (runtime-a)").length).toBeGreaterThan(0);
    });

    getDevHostRuntime().setInputDevices([{
      axes: [],
      buttons: [],
      connected: true,
      deviceId: "deck-b",
      deviceKind: "gamepad",
      displayName: "Deck B",
      frameIndex: 3,
      runtimeDeviceId: "runtime-b",
    }]);

    await waitFor(() => {
      expect(getPreviewScope().value).toBe("__all__");
      expect(screen.getAllByText("All Connected Devices").length).toBeGreaterThan(0);
    });
  });
});
