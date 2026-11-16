import { z } from "zod";
import { afterEach, expect, it } from "bun:test";
import { create, toBinary } from "@bufbuild/protobuf";
import { waitFor } from "@solidjs/testing-library";
import { base64ToBytes, bytesToBase64 } from "../proto/base64";
import { resetBridgeStateForTests } from "../bridge";
import { fxGraph, fxVisualizer } from "./fx-capabilities";
import { CapabilityFrameEnvelopeSchema } from "../proto/generated/capability-pb";
import { VisualizerFrameSchema } from "../proto/generated/fx-chain-pb";

type NativeInvocation = {
  name?: string;
  params?: unknown[];
};

const nativeInvocations: NativeInvocation[] = [];

function installNativeBridge() {
  window.__JUCE__ = {
    backend: {
      addEventListener: () => 0,
      emitEvent: (eventId, payload) => {
        if (eventId === "__juce__invoke") {
          nativeInvocations.push(z.object({name:z.string().optional(),params:z.array(z.unknown()).optional()}).passthrough().parse(payload));
        }
      },
    },
    initializationData: {
      __juce__functions: ["padpilotBridge"],
    },
  };
}

function sentIntents() {
  return nativeInvocations
    .filter((invocation) => invocation.name === "padpilotBridge")
    .map((invocation) => z.record(z.string()).parse(JSON.parse(String(invocation.params?.[0] ?? "{}"))));
}

afterEach(() => {
  delete window.__JUCE__;
  nativeInvocations.length = 0;
  resetBridgeStateForTests();
});

it("routes master wet/dry through the selected module fx-graph capability", () => {
  installNativeBridge();
  window.padpilotHostReceive?.({
    modules: [{ id: "fx", name: "FX", loadStatus: "ready", capabilities: ["fx-graph"] }],
    selectedModuleId: "fx",
  });

  fxGraph.setMasterWetDry(0.25);

  const intent = sentIntents()[0];
  expect(intent).toMatchObject({
    action: "set-master-wet-dry",
    capability: "fx-graph",
    handle: "fx::fx-graph::primary",
    type: "sendCapabilityIntent",
  });
  expect(new TextDecoder().decode(base64ToBytes(intent?.payloadBase64 ?? ""))).toBe("0.25");
});

it("routes transient preview bypass without sending canonical state", () => {
  installNativeBridge();
  window.padpilotHostReceive?.({
    modules: [{ id: "fx", name: "FX", loadStatus: "ready", capabilities: ["fx-graph"] }],
    selectedModuleId: "fx",
  });

  fxGraph.setPreviewBypass(true);
  fxGraph.setPreviewBypass(false);

  const intents = sentIntents();
  expect(intents.map((intent) => intent.action)).toEqual(["set-preview-bypass", "set-preview-bypass"]);
  expect(intents.map((intent) => new TextDecoder().decode(base64ToBytes(intent.payloadBase64 ?? "")))).toEqual(["1", "0"]);
  expect(intents.some((intent) => intent.action === "apply-state")).toBe(false);
});

it("does not emit fx mutations for a module without fx-graph", () => {
  installNativeBridge();
  window.padpilotHostReceive?.({
    modules: [{ id: "recut", name: "Recut", loadStatus: "ready", capabilities: ["sample-source"] }],
    selectedModuleId: "recut",
  });

  fxGraph.setMasterWetDry(0.25);

  expect(sentIntents()).toHaveLength(0);
});

it("requires the exact FX capability for automation and visualizer operations", () => {
  installNativeBridge();
  window.padpilotHostReceive?.({
    modules: [{ id: "fx", name: "FX", loadStatus: "ready", capabilities: ["fx-graph"] }],
    selectedModuleId: "fx",
  });

  fxGraph.beginAutomationTouch("master-wet-dry");
  const unavailableVisualizer = fxVisualizer.subscribe({ onFrame() {} });
  expect(unavailableVisualizer.isClosed()).toBe(true);
  expect(sentIntents()).toHaveLength(0);

  window.padpilotHostReceive?.({
    modules: [{ id: "fx", name: "FX", loadStatus: "ready", capabilities: ["automation"] }],
    selectedModuleId: "fx",
  });
  fxGraph.beginAutomationTouch("master-wet-dry");
  fxGraph.setMasterWetDry(0.5);

  expect(sentIntents()).toHaveLength(1);
  expect(sentIntents()[0]).toMatchObject({
    action: "begin-touch",
    capability: "automation",
    handle: "fx::automation::primary",
  });
});

it("replays each cached visualizer frame once and scopes cache to selected module", async () => {
  installNativeBridge();
  window.padpilotHostReceive?.({
    modules: [{ id: "fx", name: "FX", loadStatus: "ready", capabilities: ["fx-graph", "fx-visualizer"] }],
    selectedModuleId: "fx",
  });
  const first = fxVisualizer.subscribe({ onFrame() {} });
  const envelope = create(CapabilityFrameEnvelopeSchema, {
    capability: "fx-visualizer",
    handle: "fx::fx-visualizer::primary",
    payload: toBinary(VisualizerFrameSchema, create(VisualizerFrameSchema, { sequence: 7n })),
    payloadType: "VisualizerFrame",
    sequence: 7n,
  });
  window.padpilotHostReceiveProto?.(
    "CapabilityFrameEnvelope",
    bytesToBase64(toBinary(CapabilityFrameEnvelopeSchema, envelope)),
  );
  await waitFor(() => expect(fxVisualizer.getCachedFrame()?.sequence).toBe(7n));

  let replayCount = 0;
  const second = fxVisualizer.subscribe({
    onFrame() {
      replayCount += 1;
    },
  });
  expect(replayCount).toBe(1);
  expect(fxVisualizer.getCachedFrame()?.sequence).toBe(7n);

  window.padpilotHostReceive?.({
    modules: [{ id: "recut", name: "Recut", loadStatus: "ready", capabilities: ["sample-source"] }],
    selectedModuleId: "recut",
  });
  expect(fxVisualizer.getCachedFrame()).toBeNull();
  second.close();
  first.close();
});
