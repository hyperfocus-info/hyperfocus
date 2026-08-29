import { afterEach, beforeEach, expect, it, setDefaultTimeout } from "bun:test";
import { create, fromBinary } from "@bufbuild/protobuf";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { getCachedCapabilityStreamPayload, getLatestHostState, type HostImportedFile } from "../../bridge";
import { getDevHostRuntime } from "../../dev-host/runtime";
import { RecutModule } from "./recut-module";
import { RecutAnalysisMode, encodeRecutModuleStateBase64, decodeRecutModuleStateBase64, getRecutPadLabel } from "./recut-state";
import { ModuleSurface, PadPilotProvider } from "../../padpilot/provider";
import { createSampleCapabilityHandles, decodeSampleEditorFrame, sampleCapabilities } from "../../padpilot/sample-capabilities";
import { base64ToBytes } from "../../proto/base64";
import { SampleAnalysisMode, SampleAnalysisRequestSchema, SlicePlaybackTriggerSchema } from "../../proto/generated/capability-pb";
import { PadAssignmentSchema, SliceMarkerSchema } from "../../proto/generated/recut-pb";
import { PadPilot } from "../../padpilot/index";

const RECUT_HANDLES = createSampleCapabilityHandles("recut");

setDefaultTimeout(15_000);

function getRecutDropTarget() {
  return screen.queryByRole("button", { name: "Upload audio file" }) ?? screen.getByRole("group", { name: "Recut waveform editor" });
}

function renderRecutModule() {
  getDevHostRuntime().sendIntent({ type: "selectModule", moduleId: "recut" });

  return render(() => (
    <PadPilotProvider>
      <ModuleSurface scopeId="recut">
        <RecutModule />
      </ModuleSurface>
    </PadPilotProvider>
  ));
}

async function renderRecutModuleWithTwoSlices(name: string, ratio: number) {
  const view = renderRecutModule();
  await dropRecutFile(name);
  await seedSecondSliceState(ratio);
  view.unmount();
  renderRecutModule();
  await waitFor(() => {
    expect(screen.getByText(name)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Y start" })).toBeTruthy();
  });
}

async function dropRecutFile(name: string) {
  const dropzone = getRecutDropTarget();
  const file = new File([Uint8Array.from({ length: 4096 }, (_, index) => (index * 13) % 255)], name, { type: "audio/wav" });

  fireEvent.drop(dropzone, {
    dataTransfer: {
      files: [file],
      getData() {
        return "";
      },
    },
  });

  await waitFor(() => {
    expect(screen.getAllByText(name).length).toBeGreaterThan(0);
  });
  await waitFor(() => {
    const frame = getCachedSampleEditorFrame();
    const state = getActiveRecutState();
    expect(frame.loaded).toBe(true);
    expect(frame.analysisProgress).toBe(1);
    expect(frame.sliceMarkers.length).toBeGreaterThan(0);
    expect(frame.waveformPeaks.length).toBeGreaterThan(0);
    expect(state.loaded).toBe(true);
    expect(state.sourceName).toBe(name);
  }, { timeout: 10_000 });
}

function getCachedSampleEditorFrame() {
  const frame = getCachedCapabilityStreamPayload("sample-analysis", RECUT_HANDLES.sampleAnalysis);
  if (!frame?.payloadBase64) {
    throw new Error("Expected cached Recut sample-editor frame.");
  }
  return decodeSampleEditorFrame(frame.payloadBase64);
}

function getActiveRecutState() {
  return decodeRecutModuleStateBase64(getLatestHostState().activeModuleStateBase64 ?? "");
}

function setRect(element: Element, width = 1000, height = 250) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      bottom: height,
      height,
      left: 0,
      right: width,
      top: 0,
      width,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      },
    }),
  });
}

async function seedSecondSliceState(ratio: number) {
  const customState = getActiveRecutState();
  const totalFrames = Math.max(2, Number(customState.lengthFrames) || 4096);
  const secondStartFrame = Math.max(1, Math.min(totalFrames - 2, Math.round(totalFrames * ratio)));
  customState.analysisMode = RecutAnalysisMode.CUSTOM;
  customState.manualEditRevision += 1n;
  customState.sliceMarkers = [
    create(SliceMarkerSchema, {
      chokeGroupId: 0,
      confidence: 1,
      endFrame: secondStartFrame,
      fadeMs: 8,
      padIndex: 0,
      snapExact: true,
      startFrame: 0,
      transientFrame: 0,
    }),
    create(SliceMarkerSchema, {
      chokeGroupId: 0,
      confidence: 1,
      endFrame: totalFrames - 1,
      fadeMs: 8,
      padIndex: 1,
      snapExact: true,
      startFrame: secondStartFrame,
      transientFrame: secondStartFrame,
    }),
  ];
  customState.padAssignments = customState.padAssignments.map((assignment, index) =>
    create(PadAssignmentSchema, {
      ...assignment,
      sliceIndex: index % 2,
    }),
  );
  getDevHostRuntime().sendIntent({
    moduleId: "recut",
    payloadBase64: encodeRecutModuleStateBase64(customState),
    revision: String(customState.revision),
    type: "setModuleStateProto",
  });
  sampleCapabilities.applySlicePlaybackState(RECUT_HANDLES.slicePlayback, {
    analysisMode: customState.analysisMode,
    bpmConfidence: customState.bpmConfidence,
    bpmSource: customState.bpmSource,
    bpmSuggestedConfidence: customState.bpmSuggestedConfidence,
    bpmSuggestedValue: customState.bpmSuggestedValue,
    bpmValue: customState.bpmValue,
    density: customState.density,
    gainDb: customState.gainDb,
    grainDensity: customState.grainDensity,
    grainSizeMs: customState.grainSizeMs,
    granularEnabled: customState.granularEnabled,
    manualEditRevision: customState.manualEditRevision,
    padAssignments: customState.padAssignments.map((assignment) => ({
      bank: assignment.bank,
      chokeGroupId: assignment.chokeGroupId,
      faceButton: assignment.faceButton,
      padIndex: assignment.padIndex,
      sliceIndex: assignment.sliceIndex,
    })),
    pitchSemitones: customState.pitchSemitones,
    projectBpm: 120,
    sampleHandle: RECUT_HANDLES.sampleSource,
    sliceMarkers: customState.sliceMarkers.map((marker) => ({
      chokeGroupId: marker.chokeGroupId,
      confidence: marker.confidence,
      endFrame: marker.endFrame,
      fadeMs: marker.fadeMs,
      padIndex: marker.padIndex,
      snapExact: marker.snapExact,
      startFrame: marker.startFrame,
      transientFrame: marker.transientFrame,
    })),
    stretchEnabled: customState.stretchEnabled,
  });
  await waitFor(() => {
    expect(getActiveRecutState().analysisMode).toBe(RecutAnalysisMode.CUSTOM);
    expect(getActiveRecutState().sliceMarkers.length).toBe(2);
    expect(getCachedSampleEditorFrame().analysisMode).toBe(SampleAnalysisMode.CUSTOM);
    expect(getCachedSampleEditorFrame().sliceMarkers.length).toBe(2);
    expect(screen.getByRole("button", { name: "Y start" })).toBeTruthy();
  });
}

function setAnalysisMode(mode: RecutAnalysisMode) {
  const select = screen.getByRole("combobox", { name: "Analysis" }) as HTMLSelectElement;
  const nextValue = String(mode);
  const optionIndex = Array.from(select.options).findIndex((option) => option.value === nextValue);
  select.value = nextValue;
  if (optionIndex >= 0) {
    select.selectedIndex = optionIndex;
  }
  fireEvent.input(select, { target: { value: nextValue } });
  fireEvent.change(select, { target: { value: nextValue } });
}

function moveDensitySlider(ratio: number) {
  const slider = screen.getAllByRole("slider", { name: /Density/i })[0];
  setRect(slider, 220, 32);
  fireEvent.pointerDown(slider, { clientX: Math.round(220 * ratio), clientY: 16, pointerId: 1 });
  fireEvent.pointerUp(window, { pointerId: 1 });
}

function dragDensitySlider(ratios: number[]) {
  const slider = screen.getAllByRole("slider", { name: /Density/i })[0];
  setRect(slider, 220, 32);
  const [startRatio = 0] = ratios;
  fireEvent.pointerDown(slider, { clientX: Math.round(220 * startRatio), clientY: 16, pointerId: 1 });
  for (const ratio of ratios.slice(1)) {
    fireEvent.pointerMove(window, { clientX: Math.round(220 * ratio), clientY: 16, pointerId: 1 });
  }
  fireEvent.pointerUp(window, { pointerId: 1 });
}

createUiTest("RecutModule", () => {
  beforeEach(() => {
    getDevHostRuntime().reset();
    window.__JUCE__ = undefined;
  });

  afterEach(() => {
    getDevHostRuntime().reset();
    window.__JUCE__ = undefined;
  });

  it("loads a dropped File without a native path into the recut waveform surface", async () => {
    const { container } = renderRecutModule();

    expect(screen.getByText("Waiting for sample")).toBeTruthy();

    await dropRecutFile("amen-break.wav");

    const waveformLine = container.querySelector("polyline");
    expect(waveformLine?.getAttribute("points")?.length ?? 0).toBeGreaterThan(0);
  });

  it("renders 16 controller pads once a sample is loaded", async () => {
    renderRecutModule();
    await dropRecutFile("pad-banks.wav");

    const assignments = getCachedSampleEditorFrame().padAssignments;
    expect(assignments).toHaveLength(16);
    assignments.forEach((assignment) => {
      const status = assignment.isEmpty ? "Empty" : `Slice ${assignment.sliceIndex + 1}`;
      expect(screen.getByRole("button", { name: `${getRecutPadLabel(assignment.padIndex)} ${status}` })).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "X Slice 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "LB+X Empty" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "RB+B Empty" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "LB+RB+B Empty" })).toBeTruthy();
  });

  it("does not reopen the file picker on waveform click after load", async () => {
    const { container } = renderRecutModule();
    await dropRecutFile("replace-guard.wav");

    const originalClick = HTMLInputElement.prototype.click;
    let clickCount = 0;
    HTMLInputElement.prototype.click = function () {
      clickCount += 1;
    };

    try {
      fireEvent.click(screen.getByRole("group", { name: "Recut waveform editor" }));
      expect(clickCount).toBe(0);
      expect(container.querySelectorAll('input[type="file"]').length).toBeGreaterThan(0);
    } finally {
      HTMLInputElement.prototype.click = originalClick;
    }
  });

  it("replaces loaded sample on waveform drop", async () => {
    renderRecutModule();
    await dropRecutFile("first-loop.wav");

    const waveform = screen.getByRole("group", { name: "Recut waveform editor" });
    const replacement = new File(["audio"], "second-loop.wav", { type: "audio/wav" });
    fireEvent.drop(waveform, {
      dataTransfer: {
        files: [replacement],
        getData() {
          return "";
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByText("second-loop.wav")).toBeTruthy();
    });
  });

  it("keeps the newest sample when overlapping imports complete out of order", async () => {
    const view = renderRecutModule();
    const originalImportFile = PadPilot.IO.importFile;
    const pending = new Map<string, (value: HostImportedFile) => void>();
    PadPilot.IO.importFile = (input) => new Promise((resolve) => {
      pending.set(input instanceof File ? input.name : input, resolve);
    });
    const dropzone = getRecutDropTarget();

    try {
      for (const name of ["older.wav", "newest.wav"]) {
        fireEvent.drop(dropzone, {
          dataTransfer: {
            files: [new File([name], name, { type: "audio/wav" })],
            getData() {
              return "";
            },
          },
        });
      }
      pending.get("newest.wav")?.({
        contentId: "newest",
        mimeType: "audio/wav",
        name: "newest.wav",
        path: "padpilot://managed/sample/newest.wav",
        byteSize: 10,
      });
      await waitFor(() => expect(screen.getByText("newest.wav")).toBeTruthy());
      pending.get("older.wav")?.({
        contentId: "older",
        mimeType: "audio/wav",
        name: "older.wav",
        path: "padpilot://managed/sample/older.wav",
        byteSize: 10,
      });
      await Promise.resolve();
      expect(screen.queryByText("older.wav")).toBeNull();

      fireEvent.drop(dropzone, {
        dataTransfer: {
          files: [new File(["late"], "late.wav", { type: "audio/wav" })],
          getData() {
            return "";
          },
        },
      });
      view.unmount();
      pending.get("late.wav")?.({
        contentId: "late",
        mimeType: "audio/wav",
        name: "late.wav",
        path: "padpilot://managed/sample/late.wav",
        byteSize: 10,
      });
      await Promise.resolve();
    } finally {
      PadPilot.IO.importFile = originalImportFile;
      view.unmount();
    }
  });

  it("switches from custom back to auto and unlocks density changes", async () => {
    await renderRecutModuleWithTwoSlices("analysis-auto.wav", 0.72);

    setAnalysisMode(RecutAnalysisMode.AUTO);
    await waitFor(() => {
      expect((screen.getByRole("combobox", { name: "Analysis" }) as HTMLSelectElement).value).toBe(String(RecutAnalysisMode.AUTO));
      expect(getCachedSampleEditorFrame().analysisMode).toBe(SampleAnalysisMode.AUTO);
    });

    moveDensitySlider(0.86);

    await waitFor(() => {
      expect(getCachedSampleEditorFrame().analysisMode).toBe(SampleAnalysisMode.AUTO);
      expect(getCachedSampleEditorFrame().density).toBeGreaterThan(0.7);
    });
  });

  it("switches from custom to BPM, shows BPM controls, and unlocks density changes", async () => {
    await renderRecutModuleWithTwoSlices("analysis-bpm.wav", 0.68);

    setAnalysisMode(RecutAnalysisMode.BPM);
    await waitFor(() => {
      expect((screen.getByRole("combobox", { name: "Analysis" }) as HTMLSelectElement).value).toBe(String(RecutAnalysisMode.BPM));
      expect(getCachedSampleEditorFrame().analysisMode).toBe(SampleAnalysisMode.BPM);
      expect(getCachedSampleEditorFrame().bpmValue).toBeGreaterThan(0);
    });

    moveDensitySlider(0.92);

    await waitFor(() => {
      expect(getCachedSampleEditorFrame().analysisMode).toBe(SampleAnalysisMode.BPM);
      expect(getCachedSampleEditorFrame().density).toBeGreaterThan(0.8);
    });
  });

  it("coalesces BPM density drag analysis requests in dev host", async () => {
    const runtime = getDevHostRuntime();
    const originalSendIntent = runtime.sendIntent.bind(runtime);
    const densityRequests: number[] = [];
    runtime.sendIntent = ((intent) => {
      if (intent.type === "sendCapabilityIntent" && intent.capability === "sample-analysis" && intent.action === "request-analysis") {
        const payload = fromBinary(SampleAnalysisRequestSchema, base64ToBytes(intent.payloadBase64));
        densityRequests.push(payload.density);
      }
      return originalSendIntent(intent);
    }) as typeof runtime.sendIntent;

    try {
      await renderRecutModuleWithTwoSlices("analysis-bpm-drag.wav", 0.68);

      setAnalysisMode(RecutAnalysisMode.BPM);
      await waitFor(() => {
        expect((screen.getByRole("combobox", { name: "Analysis" }) as HTMLSelectElement).value).toBe(String(RecutAnalysisMode.BPM));
        expect(getCachedSampleEditorFrame().analysisMode).toBe(SampleAnalysisMode.BPM);
      });

      densityRequests.length = 0;
      dragDensitySlider([0.25, 0.41, 0.63, 0.89]);

      await waitFor(() => {
        expect(getCachedSampleEditorFrame().density).toBeGreaterThan(0.8);
      });
      expect(densityRequests.length).toBe(1);
      expect(densityRequests[0] ?? 0).toBeGreaterThan(0.8);
    } finally {
      runtime.sendIntent = originalSendIntent;
    }
  });

  it("labels waveform regions with pad keys instead of chop numbers", async () => {
    await renderRecutModuleWithTwoSlices("labels.wav", 0.7);

    expect(screen.getByRole("button", { name: "Preview X" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Preview Y" })).toBeTruthy();
    expect(screen.queryByText(/Chop\s+\d+/i)).toBeNull();
  });

  it("does not trigger playback from empty pads", async () => {
    const runtime = getDevHostRuntime();
    const originalSendIntent = runtime.sendIntent.bind(runtime);
    const triggerPayloads: { padIndex: number; pressed: boolean }[] = [];
    runtime.sendIntent = ((intent) => {
      if (intent.type === "sendCapabilityIntent" && intent.capability === "slice-playback" && intent.action === "trigger-pad") {
        const payload = fromBinary(SlicePlaybackTriggerSchema, base64ToBytes(intent.payloadBase64));
        triggerPayloads.push({ padIndex: payload.padIndex, pressed: payload.pressed });
      }
      return originalSendIntent(intent);
    }) as typeof runtime.sendIntent;

    try {
      renderRecutModule();
      await dropRecutFile("empty-pad.wav");
      const playablePad = screen.getByRole("button", { name: "X Slice 1" });
      expect((playablePad as HTMLButtonElement).disabled).toBe(false);
      fireEvent.pointerDown(playablePad, { button: 0, buttons: 1, pointerId: 1 });
      fireEvent.pointerUp(playablePad, { button: 0, buttons: 0, pointerId: 1 });
      await waitFor(() => {
        expect(triggerPayloads).toEqual([
          { padIndex: 0, pressed: true },
          { padIndex: 0, pressed: false },
        ]);
      });

      const emptyPad = screen.getByRole("button", { name: "Y Empty" });
      expect((emptyPad as HTMLButtonElement).disabled).toBe(true);
      fireEvent.pointerDown(emptyPad);
      fireEvent.pointerUp(emptyPad);
      await new Promise((resolve) => window.setTimeout(resolve, 20));
      expect(triggerPayloads).toHaveLength(2);
    } finally {
      runtime.sendIntent = originalSendIntent;
    }
  });

  it("shows a waveform busy overlay while analysis is pending", async () => {
    const runtime = getDevHostRuntime();
    const originalSendIntent = runtime.sendIntent.bind(runtime);
    runtime.sendIntent = ((intent) => {
      if (intent.type === "sendCapabilityIntent" && intent.capability === "sample-analysis" && intent.action === "request-analysis") {
        return;
      }
      return originalSendIntent(intent);
    }) as typeof runtime.sendIntent;

    try {
      renderRecutModule();
      await dropRecutFile("busy-overlay.wav");
      setAnalysisMode(RecutAnalysisMode.BPM);
      expect(screen.getByText(/Rebuilding chops/i)).toBeTruthy();
    } finally {
      runtime.sendIntent = originalSendIntent;
    }
  });

  it("clicking a waveform region selects and previews the mapped chop", async () => {
    const runtime = getDevHostRuntime();
    const originalSendIntent = runtime.sendIntent.bind(runtime);
    const triggerPayloads: { padIndex: number; pressed: boolean }[] = [];
    runtime.sendIntent = ((intent) => {
      if (intent.type === "sendCapabilityIntent" && intent.capability === "slice-playback" && intent.action === "trigger-pad") {
        const payload = fromBinary(SlicePlaybackTriggerSchema, base64ToBytes(intent.payloadBase64));
        triggerPayloads.push({ padIndex: payload.padIndex, pressed: payload.pressed });
      }
      return originalSendIntent(intent);
    }) as typeof runtime.sendIntent;

    try {
      await renderRecutModuleWithTwoSlices("preview.wav", 0.9);

      fireEvent.click(screen.getByRole("button", { name: "Preview Y" }));

      await waitFor(() => {
        expect(triggerPayloads.some((payload) => payload.pressed && payload.padIndex === 1)).toBe(true);
      });
      await waitFor(() => {
        expect(triggerPayloads.some((payload) => !payload.pressed && payload.padIndex === 1)).toBe(true);
      });
      expect(getActiveRecutState().sliceMarkers.length).toBeGreaterThan(1);
    } finally {
      runtime.sendIntent = originalSendIntent;
    }
  });

  it("double-clicking the waveform inserts a chop without triggering preview", async () => {
    const runtime = getDevHostRuntime();
    const originalSendIntent = runtime.sendIntent.bind(runtime);
    let triggerIntentCount = 0;
    runtime.sendIntent = ((intent) => {
      if (intent.type === "sendCapabilityIntent" && intent.capability === "slice-playback" && intent.action === "trigger-pad") {
        triggerIntentCount += 1;
      }
      return originalSendIntent(intent);
    }) as typeof runtime.sendIntent;

    try {
      await renderRecutModuleWithTwoSlices("double-click.wav", 0.52);
      const beforeCount = getCachedSampleEditorFrame().sliceMarkers.length;
      const waveform = screen.getByRole("button", { name: "Preview X" });
      setRect(waveform);
      fireEvent.dblClick(waveform, { clientX: 760 });

      await waitFor(() => {
        expect(getCachedSampleEditorFrame().sliceMarkers.length).toBe(beforeCount + 1);
      });
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      expect(triggerIntentCount).toBe(0);
    } finally {
      runtime.sendIntent = originalSendIntent;
    }
  });

  it("cancels a pending marker drag when the waveform unmounts", async () => {
    const view = renderRecutModule();
    await dropRecutFile("unmount-drag.wav");
    const waveform = screen.getByRole("group", { name: "Recut waveform editor" });
    setRect(waveform);

    const runtime = getDevHostRuntime();
    const originalSendIntent = runtime.sendIntent.bind(runtime);
    let markerMutationCount = 0;
    runtime.sendIntent = ((intent) => {
      if (intent.type === "sendCapabilityIntent" && intent.capability === "slice-playback" && intent.action === "apply-state") {
        markerMutationCount += 1;
      }
      return originalSendIntent(intent);
    }) as typeof runtime.sendIntent;

    try {
      fireEvent.pointerDown(screen.getByRole("button", { name: "X start" }), {
        clientX: 0,
        pointerId: 1,
      });
      view.unmount();
      await new Promise((resolve) => window.setTimeout(resolve, 280));
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 900 }));
      expect(markerMutationCount).toBe(0);
    } finally {
      runtime.sendIntent = originalSendIntent;
    }
  });
});


