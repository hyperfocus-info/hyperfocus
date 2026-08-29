import { afterEach, expect, it } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { resetBridgeStateForTests } from "../../bridge";
import { getDevHostRuntime } from "../../dev-host/runtime";
import { AnalyzerModule } from "./analyzer-module";
import { PadPilot } from "../../padpilot";
import { resetAnalyzerForTests } from "../../padpilot/analyzer";
import { ModuleSurface, PadPilotProvider } from "../../padpilot/provider";

function renderAnalyzerModule() {
  getDevHostRuntime().sendIntent({ type: "selectModule", moduleId: "analyzer" });

  return render(() => (
    <PadPilotProvider>
      <ModuleSurface scopeId="analyzer">
        <AnalyzerModule />
      </ModuleSurface>
    </PadPilotProvider>
  ));
}

function getDetectedKeyText(container: HTMLElement) {
  return container.querySelector("strong")?.textContent ?? "";
}

createUiTest("AnalyzerModule", () => {
  afterEach(() => {
    const runtime = getDevHostRuntime();
    runtime.updateSettings({ continuousHostSync: false, running: false });
    runtime.reset();
    resetAnalyzerForTests();
    resetBridgeStateForTests();
    window.__JUCE__ = undefined;
  });

  it("renders compact controls with disabled reasons while auto-capturing", async () => {
    renderAnalyzerModule();

    const recordButton = await screen.findByRole("button", { name: "Stop recording" });
    const appendToggle = screen.getByRole("button", { name: "Capture mode: overwrite" });
    const dragButton = screen.getByRole("button", { name: "Drag MIDI" });
    const saveButton = screen.getByRole("button", { name: "Save MIDI" });

    expect(recordButton.getAttribute("title")).toBeNull();
    expect(appendToggle.hasAttribute("disabled")).toBe(true);
    expect(appendToggle.getAttribute("title")).toBeNull();
    expect(dragButton.getAttribute("title")).toBeNull();
    expect(saveButton.getAttribute("title")).toBeNull();
    expect(screen.getAllByRole("slider").length).toBe(2);
  });

  it("clamps the tuning slider to 465 Hz using horizontal drag", async () => {
    renderAnalyzerModule();

    expect(await screen.findByRole("button", { name: "Stop recording" })).not.toBeNull();

    const sliders = screen.getAllByRole("slider");
    const tuningSlider = sliders[0]!;
    Object.defineProperty(tuningSlider, "getBoundingClientRect", {
      value: () => ({ bottom: 28, height: 28, left: 0, right: 260, top: 0, width: 260, x: 0, y: 0, toJSON: () => ({}) }),
    });

    fireEvent.pointerDown(tuningSlider, { clientX: 1000, clientY: 14, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    await waitFor(() => {
      expect(screen.getAllByText("465 Hz").length).toBeGreaterThan(0);
    });
  });

  it("enables append and export after stopping, and sensitivity updates without reopening a modal", async () => {
    renderAnalyzerModule();

    const stopButton = await screen.findByRole("button", { name: "Stop recording" });
    fireEvent.click(stopButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Capture mode: overwrite" }).hasAttribute("disabled")).toBe(false);
      expect(screen.getByRole("button", { name: "Drag MIDI" }).hasAttribute("disabled")).toBe(false);
      expect(screen.getByRole("button", { name: "Save MIDI" }).hasAttribute("disabled")).toBe(false);
    });

    const sliders = screen.getAllByRole("slider");
    const sensitivitySlider = sliders[1]!;
    Object.defineProperty(sensitivitySlider, "getBoundingClientRect", {
      value: () => ({ bottom: 28, height: 28, left: 0, right: 260, top: 0, width: 260, x: 0, y: 0, toJSON: () => ({}) }),
    });
    fireEvent.pointerDown(sensitivitySlider, { clientX: 260, clientY: 14, pointerId: 2 });
    fireEvent.pointerUp(window, { pointerId: 2 });

    await waitFor(() => {
      expect(screen.getAllByText("100%").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Capture mode: overwrite" }));
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Stop recording" })).not.toBeNull();
      expect(screen.queryByRole("dialog", { name: "Resume analyzer capture" })).toBeNull();
    });
  });

  it("debounces sensitivity commits and resets detected key while reanalyzing", async () => {
    const originalSetDetectionSensitivity = PadPilot.analyzer.setDetectionSensitivity;
    const committedSensitivityValues: number[] = [];
    PadPilot.analyzer.setDetectionSensitivity = (value: number) => {
      committedSensitivityValues.push(value);
    };

    try {
      const view = renderAnalyzerModule();

      fireEvent.click(await screen.findByRole("button", { name: "Stop recording" }));

      await waitFor(() => {
        expect(getDetectedKeyText(view.container)).not.toBe("No key detected");
      });

      const sensitivitySlider = screen.getAllByRole("slider")[1]!;
      Object.defineProperty(sensitivitySlider, "getBoundingClientRect", {
        value: () => ({ bottom: 28, height: 28, left: 0, right: 260, top: 0, width: 260, x: 0, y: 0, toJSON: () => ({}) }),
      });

      fireEvent.pointerDown(sensitivitySlider, { clientX: 260, clientY: 14, pointerId: 3 });

      expect(committedSensitivityValues).toHaveLength(0);
      expect(screen.getAllByText("Analyzing...").length).toBeGreaterThan(0);
      expect(view.container.querySelector("strong")?.textContent).toBe("Reanalyzing...");

      await new Promise((resolve) => window.setTimeout(resolve, 220));

      expect(committedSensitivityValues).toEqual([1]);
    } finally {
      PadPilot.analyzer.setDetectionSensitivity = originalSetDetectionSensitivity;
    }
  });

  it("clears reanalyzing state after the debounced sensitivity update lands", async () => {
    const view = renderAnalyzerModule();

    fireEvent.click(await screen.findByRole("button", { name: "Stop recording" }));

    await waitFor(() => {
      expect(getDetectedKeyText(view.container)).not.toBe("No key detected");
    });

    const sensitivitySlider = screen.getAllByRole("slider")[1]!;
    Object.defineProperty(sensitivitySlider, "getBoundingClientRect", {
      value: () => ({ bottom: 28, height: 28, left: 0, right: 260, top: 0, width: 260, x: 0, y: 0, toJSON: () => ({}) }),
    });

    fireEvent.pointerDown(sensitivitySlider, { clientX: 260, clientY: 14, pointerId: 4 });

    await waitFor(() => {
      expect(view.container.querySelector("strong")?.textContent).toBe("Reanalyzing...");
    });

    await waitFor(() => {
      expect(getDetectedKeyText(view.container)).not.toBe("Reanalyzing...");
      expect(screen.queryByText("Reanalyzing...")).toBeNull();
    });
  });

  it("shows append as a singular pressed toggle after a take exists", async () => {
    renderAnalyzerModule();

    fireEvent.click(await screen.findByRole("button", { name: "Stop recording" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Capture mode: overwrite" }).hasAttribute("disabled")).toBe(false);
    });

    const appendToggle = screen.getByRole("button", { name: "Capture mode: overwrite" });
    fireEvent.click(appendToggle);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Capture mode: append" }).getAttribute("aria-pressed")).toBe("true");
    });
  });

  it("shows confidence and corrects a detected note by stable event identity", async () => {
    const originalCorrectNote = PadPilot.analyzer.correctNote;
    const corrections: Array<{ eventId: string | bigint; midiNote: number }> = [];
    PadPilot.analyzer.correctNote = (eventId, midiNote) => {
      corrections.push({ eventId, midiNote });
    };

    try {
      renderAnalyzerModule();
      fireEvent.click(await screen.findByRole("button", { name: "Stop recording" }));

      expect(await screen.findByText("Review notes")).not.toBeNull();
      expect(screen.getAllByText(/% confidence/).length).toBeGreaterThan(0);
      const reviewedEvent = [...(PadPilot.analyzer.getCachedFrame()?.noteEvents ?? [])]
        .sort((left, right) => left.confidence - right.confidence || left.startFrame - right.startFrame)[0];
      fireEvent.click(screen.getAllByRole("button", { name: /^Raise .* one semitone$/ })[0]!);

      expect(corrections).toHaveLength(1);
      expect(String(corrections[0]?.eventId)).not.toBe("0");
      expect(corrections[0]?.eventId).toBe(reviewedEvent?.eventId);
      expect(corrections[0]?.midiNote).toBe((reviewedEvent?.midiNote ?? 0) + 1);
    } finally {
      PadPilot.analyzer.correctNote = originalCorrectNote;
    }
  });
});
