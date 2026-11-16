import { z } from "zod";
import { afterEach, expect, it } from "bun:test";
import { render, waitFor } from "@solidjs/testing-library";
import { create, toBinary } from "@bufbuild/protobuf";
import { createUiTest } from "../../../utils/tests/test-harness";
import { resetBridgeStateForTests } from "../bridge";
import { PadPilot } from "./index";
import { resetAnalyzerForTests } from "./analyzer";
import { AnalyzerScaleMatchSchema, AnalyzerTakeSummarySchema } from "../proto/generated/analyzer-pb";
import { CapabilityFrameEnvelopeSchema } from "../proto/generated/capability-pb";
import { base64ToBytes, bytesToBase64 } from "../proto/base64";
import {
  createAnalyzerNoteEvent,
  createDefaultAnalyzerModuleState,
  createEmptyAnalyzerFrame,
  encodeAnalyzerFrameBase64,
  encodeAnalyzerModuleStateBase64,
} from "../modules/analyzer/analyzer-state";

function installNativeBridgeRecorder() {
  const intents: Array<Record<string, unknown>> = [];
  window.__JUCE__ = {
    backend: {
      addEventListener: () => 0,
      emitEvent: (_eventId, payload) => {
        const bridgePayload = z.object({params:z.array(z.unknown()).optional()}).passthrough().parse(payload);
        const serializedIntent = String(bridgePayload.params?.[0] ?? "{}");
        intents.push(z.record(z.unknown()).parse(JSON.parse(serializedIntent)));
      },
    },
    initializationData: {
      __juce__functions: ["padpilotBridge"],
    },
  };
  return intents;
}

function publishAnalyzerHostState(
  moduleId = "custom-module",
  capabilities = ["analyzer-feed", "analyzer-session", "midi-export"],
) {
  const moduleState = createDefaultAnalyzerModuleState();
  moduleState.noteEvents = [
    createAnalyzerNoteEvent({ midiNote: 60, startFrame: 0, endFrame: 16, intensity: 0.8, velocity: 96, meanFrequencyHz: 261.63 }),
  ];
  moduleState.takeSummary = create(AnalyzerTakeSummarySchema, {
    capturedBpm: 120,
    durationSeconds: 1.5,
    frameCount: 16,
    maxMidiNote: 60,
    minMidiNote: 60,
    topMatches: [create(AnalyzerScaleMatchSchema, { confidence: 0.92, rootPitchClass: 0, scaleId: "major" })],
  });

  const frame = createEmptyAnalyzerFrame();
  frame.recording = false;
  frame.currentLevel = 0.42;
  frame.frameCount = 16;
  frame.durationSeconds = 1.5;
  frame.detectionSensitivity = 0.64;
  frame.minMidiNote = 60;
  frame.maxMidiNote = 60;
  frame.primaryMatch = moduleState.takeSummary.topMatches[0];
  frame.laneEnergies = Array.from({ length: 128 }, (_, midiNote) => (midiNote === 60 ? 0.88 : 0));

  window.padpilotHostReceive?.({
    acceptedRevision: moduleState.revision,
    activeModuleId: moduleId,
    activeModuleStateBase64: encodeAnalyzerModuleStateBase64(moduleState),
    modules: [{
      capabilities,
      id: moduleId,
      loadStatus: "ready",
      name: "Analyzer",
      version: "1.0.0",
    }],
    selectedModuleId: moduleId,
  });
  const envelope = create(CapabilityFrameEnvelopeSchema, {
    capability: "analyzer-feed",
    handle: `${moduleId}::analyzer-feed::primary`,
    payload: base64ToBytes(encodeAnalyzerFrameBase64(frame)),
    payloadType: "AnalyzerFrame",
    sequence: 1n,
  });
  queueMicrotask(() => {
    window.padpilotHostReceiveProto?.(
      "CapabilityFrameEnvelope",
      bytesToBase64(toBinary(CapabilityFrameEnvelopeSchema, envelope)),
    );
  });
}

createUiTest("PadPilot analyzer capability", () => {
  afterEach(() => {
    delete window.__JUCE__;
    resetAnalyzerForTests();
    resetBridgeStateForTests();
    window.padpilotHostReceive?.({
      selectedModuleId: "fx",
    });
  });

  it("deduplicates analyzer feed capability opens and closes on the last subscription", async () => {
    const intents = installNativeBridgeRecorder();
    publishAnalyzerHostState();

    const receivedLevels: number[] = [];
    const firstSubscription = PadPilot.analyzer.subscribe({
      onFrame(frame) {
        receivedLevels.push(frame.currentLevel);
      },
    });
    const secondSubscription = PadPilot.analyzer.subscribe({
      onFrame(frame) {
        receivedLevels.push(frame.currentLevel);
      },
    });

    await waitFor(() => {
      expect(intents.filter((intent) => intent.type === "openCapabilityStream" && intent.capability === "analyzer-feed")).toHaveLength(1);
      expect(receivedLevels.some((level) => level > 0.4 && level < 0.43)).toBe(true);
    });

    firstSubscription.close();
    expect(intents.filter((intent) => intent.type === "closeCapabilityStream" && intent.capability === "analyzer-feed")).toHaveLength(0);

    secondSubscription.close();

    await waitFor(() => {
      expect(intents.filter((intent) => intent.type === "closeCapabilityStream" && intent.capability === "analyzer-feed")).toHaveLength(1);
    });
  });

  it("returns the mapped cached frame for module consumers", async () => {
    installNativeBridgeRecorder();
    publishAnalyzerHostState("analyzer");

    const subscription = PadPilot.analyzer.subscribe({
      onFrame() {
        return;
      },
    });

    await waitFor(() => {
      expect(PadPilot.analyzer.getCachedFrame()?.primaryKeyMatch?.label).toBe("C Major");
      expect(PadPilot.analyzer.getCachedFrame()?.hasTake).toBe(true);
      expect(PadPilot.analyzer.getCachedFrame()?.detectionSensitivity).toBeCloseTo(0.64, 2);
      expect(PadPilot.analyzer.getCachedFrame()?.noteEvents[0]?.midiNote).toBe(60);
    });

    subscription.close();
  });

  it("drops malformed cached payloads and isolates an immediately throwing subscriber", async () => {
    installNativeBridgeRecorder();
    window.padpilotHostReceive?.({
      activeModuleId: "analyzer",
      activeModuleStateBase64: "!!!!",
      modules: [{
        capabilities: ["analyzer-feed", "analyzer-session", "midi-export"],
        id: "analyzer",
        loadStatus: "ready",
        name: "Analyzer",
      }],
      selectedModuleId: "analyzer",
    });

    expect(() => PadPilot.analyzer.getCachedFrame()).not.toThrow();
    expect(PadPilot.analyzer.getCachedFrame()).toBeNull();

    publishAnalyzerHostState("analyzer");
    await waitFor(() => expect(PadPilot.analyzer.getCachedFrame()).not.toBeNull());
    const subscription = PadPilot.analyzer.subscribe({
      onFrame() {
        throw new Error("broken module subscriber");
      },
    });
    expect(subscription.isClosed()).toBe(false);
    subscription.close();
  });

  it("does not replay analyzer telemetry after selection leaves analyzer capability", async () => {
    installNativeBridgeRecorder();
    publishAnalyzerHostState("analyzer");
    let firstFrames = 0;
    const first = PadPilot.analyzer.subscribe({
      onFrame() {
        firstFrames += 1;
      },
    });
    await waitFor(() => expect(firstFrames).toBeGreaterThan(0));
    first.close();

    window.padpilotHostReceive?.({
      activeModuleId: "recut",
      modules: [{
        capabilities: ["sample-source"],
        id: "recut",
        loadStatus: "ready",
        name: "Recut",
        version: "1.0.0",
      }],
      selectedModuleId: "recut",
    });
    let staleFrames = 0;
    const second = PadPilot.analyzer.subscribe({
      onFrame() {
        staleFrames += 1;
      },
    });

    expect(staleFrames).toBe(0);
    expect(PadPilot.analyzer.getCachedFrame()).toBeNull();
    second.close();
  });

  it("auto-closes the analyzer feed when the Solid helper unmounts", async () => {
    const intents = installNativeBridgeRecorder();
    publishAnalyzerHostState("analyzer");

    const result = render(() => {
      PadPilot.hooks.useAnalyzerFeed({
        onFrame() {
          return;
        },
      });
      return <div>analyzer hook</div>;
    });

    await waitFor(() => {
      expect(intents.filter((intent) => intent.type === "openCapabilityStream" && intent.capability === "analyzer-feed")).toHaveLength(1);
    });

    result.unmount();

    await waitFor(() => {
      expect(intents.filter((intent) => intent.type === "closeCapabilityStream" && intent.capability === "analyzer-feed")).toHaveLength(1);
    });
  });

  it("sends analyzer sensitivity updates through the public capability", async () => {
    const intents = installNativeBridgeRecorder();
    publishAnalyzerHostState("analyzer");

    PadPilot.analyzer.setDetectionSensitivity(0.91);

    await waitFor(() => {
      expect(intents.some((intent) =>
        intent.type === "sendCapabilityIntent"
        && intent.capability === "analyzer-session"
        && intent.action === "set-detection-sensitivity")).toBe(true);
    });
  });

  it("requires the exact analyzer capability for each operation", async () => {
    const intents = installNativeBridgeRecorder();
    publishAnalyzerHostState("analyzer", ["analyzer-feed"]);

    PadPilot.analyzer.setDetectionSensitivity(0.75);
    PadPilot.analyzer.saveMidi();
    const subscription = PadPilot.analyzer.subscribe({ onFrame() {} });

    await waitFor(() => {
      expect(intents.some((intent) =>
        intent.type === "openCapabilityStream" && intent.capability === "analyzer-feed"
      )).toBe(true);
    });
    expect(intents.some((intent) => intent.type === "sendCapabilityIntent")).toBe(false);
    subscription.close();
  });

  it("sends a bounded stable-event pitch correction through the public capability", async () => {
    const intents = installNativeBridgeRecorder();
    publishAnalyzerHostState("analyzer");

    const eventId = PadPilot.analyzer.getCachedFrame()?.noteEvents[0]?.eventId;
    expect(eventId).toBeDefined();
    PadPilot.analyzer.correctNote(eventId!, 62);

    await waitFor(() => {
      const intent = intents.find((candidate) =>
        candidate.type === "sendCapabilityIntent"
        && candidate.capability === "analyzer-session"
        && candidate.action === "correct-note");
      expect(intent).toBeDefined();
      expect(new TextDecoder().decode(base64ToBytes(String(intent?.payloadBase64)))).toBe(`${eventId}:62`);
    });

    PadPilot.analyzer.correctNote("0", 62);
    PadPilot.analyzer.correctNote("18446744073709551616", 62);
    PadPilot.analyzer.correctNote(eventId!, 128);
    expect(intents.filter((intent) => intent.action === "correct-note")).toHaveLength(1);
  });
});
