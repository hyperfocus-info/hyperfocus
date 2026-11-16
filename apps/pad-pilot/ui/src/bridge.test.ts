import { z } from "zod";
import { afterEach, describe, expect, it } from "bun:test";
import { create, toBinary } from "@bufbuild/protobuf";
import { waitFor } from "@solidjs/testing-library";
import { bytesToBase64, base64ToBytes } from "./proto/base64";
import { ActiveModuleStateFrameSchema, InputStateFrameSchema, NavigationFrameSchema } from "./proto/generated/bridge-pb";
import { CapabilityFrameEnvelopeSchema, SampleEditorFrameSchema } from "./proto/generated/capability-pb";
import { decodeFxChainStateBase64 } from "./modules/fx/fx-chain-state";
import { getCachedCapabilityStreamPayload, isBoundedHostProtoPayload, MAX_HOST_JSON_INGRESS_CHARS, MAX_HOST_PROTO_INGRESS_BYTES, resetBridgeStateForTests, sendIntent, subscribeCapabilityStream, subscribeHostState } from "./bridge";
import { encodeFxChainStateBase64, createDefaultFxChainState } from "./modules/fx/fx-chain-state";
import { createEmptyAnalyzerFrame, encodeAnalyzerFrameBase64 } from "./modules/analyzer/analyzer-state";
import { createCapabilityHandle, createEmptySampleEditorFrame } from "./padpilot/sample-capabilities";
import { createDefaultControllerConfig } from "./padpilot/controller-config";

describe("bridge host state", () => {
  afterEach(() => {
    delete window.__JUCE__;
    resetBridgeStateForTests();
    window.padpilotHostReceive?.({});
  });

  function useNativeBridgeStub() {
    window.__JUCE__ = {
      backend: {
        addEventListener: () => 0,
      },
      initializationData: {
        __juce__functions: [],
      },
    };
  }

  it("clears stale active module payload when selected module changes before fresh state arrives", async () => {
    window.__JUCE__ = {
      backend: {
        addEventListener: () => 0,
      },
      initializationData: {
        __juce__functions: [],
      },
    };

    const received: Array<ReturnType<typeof decodeFxChainStateBase64> | null> = [];
    let latest: Record<string, unknown> = {};
    const unsubscribe = subscribeHostState((state) => {
      latest = z.record(z.unknown()).parse(state);
      received.push(state.activeModuleStateBase64 ? decodeFxChainStateBase64(state.activeModuleStateBase64) : null);
    });

    const fxState = createDefaultFxChainState();
    fxState.master!.wetDry = 0.25;

    window.padpilotHostReceive?.({
      activeModuleStateBase64: encodeFxChainStateBase64(fxState),
      modules: [{ id: "fx", name: "FX" }],
    });
    window.padpilotHostReceive?.({
      selectedModuleId: "editor",
    });

    await waitFor(() => {
      expect(latest.selectedModuleId).toBe("editor");
      expect(latest.modules).not.toBeUndefined();
      expect(latest.activeModuleStateBase64).toBeUndefined();
      expect(received.some((state) => state?.master?.wetDry === 0.25)).toBe(true);
    });

    unsubscribe();
  });

  it("routes analyzer capability frames without dropping prior host sync state", async () => {
    useNativeBridgeStub();

    let latest: Record<string, unknown> = {};
    const unsubscribeHost = subscribeHostState((state) => {
      latest = z.record(z.unknown()).parse(state);
    });

    window.padpilotHostReceive?.({
      modules: [{ id: "analyzer", name: "Analyzer" }],
      selectedModuleId: "analyzer",
    });

    const frame = createEmptyAnalyzerFrame();
    frame.tuningHz = 432;
    frame.currentLevel = 0.42;
    frame.detectionSensitivity = 0.77;
    const handle = "analyzer::analyzer-feed::primary";
    let receivedPayload = "";
    const unsubscribeStream = subscribeCapabilityStream("analyzer-feed", handle, (next) => {
      receivedPayload = next.payloadBase64;
    });
    const envelope = create(CapabilityFrameEnvelopeSchema, {
      capability: "analyzer-feed",
      handle,
      payload: base64ToBytes(encodeAnalyzerFrameBase64(frame)),
      payloadType: "AnalyzerFrame",
      sequence: 1n,
    });

    window.padpilotHostReceiveProto?.(
      "CapabilityFrameEnvelope",
      bytesToBase64(toBinary(CapabilityFrameEnvelopeSchema, envelope)),
    );

    await waitFor(() => {
      expect((z.array(z.object({id:z.string()}).passthrough()).parse(latest.modules))[0]?.id).toBe("analyzer");
      expect(latest.selectedModuleId).toBe("analyzer");
      expect(receivedPayload).toBe(encodeAnalyzerFrameBase64(frame));
    });

    unsubscribeStream();
    unsubscribeHost();
  });

  it("routes generic capability envelopes into capability stream subscribers", async () => {
    useNativeBridgeStub();
    window.padpilotHostReceive?.({ selectedModuleId: "recut" });

    const handle = createCapabilityHandle("sample-analysis", "recut");
    const frame = createEmptySampleEditorFrame();
    frame.loaded = true;
    frame.analysisProgress = 1;
    frame.armedPadIndex = 3;

    let received = 0;
    const unsubscribe = subscribeCapabilityStream("sample-analysis", handle, (next) => {
      if (next.payloadType === "SampleEditorFrame") {
        received += 1;
      }
    });

    const envelope = create(CapabilityFrameEnvelopeSchema, {
      capability: "sample-analysis",
      handle,
      payload: toBinary(SampleEditorFrameSchema, frame),
      payloadType: "SampleEditorFrame",
      sequence: 9n,
    });
    window.padpilotHostReceiveProto?.("CapabilityFrameEnvelope", bytesToBase64(toBinary(CapabilityFrameEnvelopeSchema, envelope)));

    await waitFor(() => {
      expect(received).toBe(1);
    });

    unsubscribe();
  });

  it("drops late, cross-owner, and out-of-order capability frames", () => {
    useNativeBridgeStub();
    window.padpilotHostReceive?.({ selectedModuleId: "recut" });
    const handle = createCapabilityHandle("sample-analysis", "recut");
    const received: bigint[] = [];
    const publish = (sequence: bigint) => {
      const envelope = create(CapabilityFrameEnvelopeSchema, {
        capability: "sample-analysis",
        handle,
        payload: new Uint8Array([Number(sequence)]),
        payloadType: "SampleEditorFrame",
        sequence,
      });
      window.padpilotHostReceiveProto?.(
        "CapabilityFrameEnvelope",
        bytesToBase64(toBinary(CapabilityFrameEnvelopeSchema, envelope)),
      );
    };
    const unsubscribe = subscribeCapabilityStream("sample-analysis", handle, (frame) => {
      received.push(frame.sequence);
    });

    publish(9n);
    publish(8n);
    window.padpilotHostReceive?.({ selectedModuleId: "fx" });
    publish(10n);
    unsubscribe();
    publish(11n);

    expect(received).toEqual([9n]);
    expect(getCachedCapabilityStreamPayload("sample-analysis", handle)).toBeNull();
  });

  it("isolates throwing host and capability listeners", () => {
    useNativeBridgeStub();
    window.padpilotHostReceive?.({ selectedModuleId: "recut" });
    const hostStates: string[] = [];
    const unsubscribeThrowingHost = subscribeHostState(() => {
      throw new Error("host listener failure");
    });
    const unsubscribeHost = subscribeHostState((state) => {
      hostStates.push(state.selectedModuleId ?? "");
    });
    const handle = createCapabilityHandle("sample-analysis", "recut");
    const unsubscribeThrowingStream = subscribeCapabilityStream("sample-analysis", handle, () => {
      throw new Error("stream listener failure");
    });
    let received = 0;
    const unsubscribeStream = subscribeCapabilityStream("sample-analysis", handle, () => {
      received += 1;
    });
    const envelope = create(CapabilityFrameEnvelopeSchema, {
      capability: "sample-analysis",
      handle,
      payload: new Uint8Array([1]),
      payloadType: "SampleEditorFrame",
      sequence: 1n,
    });

    expect(() => window.padpilotHostReceiveProto?.(
      "CapabilityFrameEnvelope",
      bytesToBase64(toBinary(CapabilityFrameEnvelopeSchema, envelope)),
    )).not.toThrow();
    expect(() => window.padpilotHostReceive?.({ selectedModuleId: "recut" })).not.toThrow();
    expect(received).toBe(1);
    expect(hostStates.length).toBeGreaterThan(0);

    unsubscribeStream();
    unsubscribeThrowingStream();
    unsubscribeHost();
    unsubscribeThrowingHost();
  });

  it("drops unsolicited and malformed capability stream frames", () => {
    useNativeBridgeStub();
    const validHandle = "recut::sample-analysis::primary";
    const envelope = create(CapabilityFrameEnvelopeSchema, {
      capability: "sample-analysis",
      handle: validHandle,
      payload: new Uint8Array([1, 2, 3]),
      payloadType: "SampleEditorFrame",
      sequence: 1n,
    });
    window.padpilotHostReceiveProto?.(
      "CapabilityFrameEnvelope",
      bytesToBase64(toBinary(CapabilityFrameEnvelopeSchema, envelope)),
    );

    expect(getCachedCapabilityStreamPayload("sample-analysis", validHandle)).toBeNull();
    const unsubscribe = subscribeCapabilityStream(
      "sample-analysis",
      "recut::wrong-capability::primary",
      () => undefined,
    );
    unsubscribe();
    expect(getCachedCapabilityStreamPayload("sample-analysis", "recut::wrong-capability::primary")).toBeNull();
  });

  it("drops malformed and oversized legacy host JSON without poisoning later state", async () => {
    useNativeBridgeStub();
    const received: Array<Record<string, unknown>> = [];
    const unsubscribe = subscribeHostState((state) => received.push(z.record(z.unknown()).parse(state)));
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const accessorPayload = {};
    Object.defineProperty(accessorPayload, "selectedModuleId", {
      enumerable: true,
      get() {
        throw new Error("host getter must not run");
      },
    });

    expect(() => window.padpilotHostReceive?.("{not-json")).not.toThrow();
    expect(() => window.padpilotHostReceive?.(cyclic)).not.toThrow();
    expect(() => window.padpilotHostReceive?.(accessorPayload)).not.toThrow();
    expect(() => window.padpilotHostReceive?.(JSON.stringify({ selectedModuleId: 42 }))).not.toThrow();
    expect(() => window.padpilotHostReceive?.(JSON.stringify({ controller: { axes: "bad" } }))).not.toThrow();
    expect(() => window.padpilotHostReceive?.(JSON.stringify({
      controllerConfig: { customLayouts: [{ id: 42 }], rows: [] },
    }))).not.toThrow();
    expect(() => window.padpilotHostReceive?.(JSON.stringify({
      modules: [{ id: "bad", name: "Bad", uiEntryPath: 42 }],
    }))).not.toThrow();
    expect(() => window.padpilotHostReceive?.(JSON.stringify({
      modules: [{ id: "Bad_Module", name: "Bad", capabilities: ["midi_output"] }],
    }))).not.toThrow();
    const oversized = `{"selectedModuleId":"${"x".repeat(MAX_HOST_JSON_INGRESS_CHARS)}"}`;
    expect(oversized.length).toBeGreaterThan(MAX_HOST_JSON_INGRESS_CHARS);
    expect(() => window.padpilotHostReceive?.(oversized)).not.toThrow();
    window.padpilotHostReceive?.('{"selectedModuleId":"fx"}');

    await waitFor(() => {
      expect(received).toHaveLength(1);
      expect(received[0]?.selectedModuleId).toBe("fx");
    });
    unsubscribe();
  });

  it("contains malformed and oversized protobuf ingress before valid navigation frames", async () => {
    useNativeBridgeStub();
    expect(MAX_HOST_PROTO_INGRESS_BYTES).toBe(16777216);
    expect(isBoundedHostProtoPayload("A".repeat(12582912))).toBe(true);
    let selectedModuleId = "";
    const unsubscribe = subscribeHostState((state) => {
      selectedModuleId = state.selectedModuleId ?? selectedModuleId;
    });
    const oversizedPayload = "A".repeat(Math.ceil(MAX_HOST_PROTO_INGRESS_BYTES / 3) * 4 + 4);
    expect(isBoundedHostProtoPayload(oversizedPayload)).toBe(false);
    expect(() => window.padpilotHostReceiveProto?.("NavigationFrame", oversizedPayload)).not.toThrow();
    expect(() => window.padpilotHostReceiveProto?.("CapabilityFrameEnvelope", "not-base64")).not.toThrow();
    expect(() => window.padpilotHostReceiveProto?.("NavigationFrame", bytesToBase64(Uint8Array.of(0x0a, 0xff)))).not.toThrow();

    const navigationFrame = create(NavigationFrameSchema, {
      modules: [{ id: "fx", name: "FX" }],
      selectedModuleId: "fx",
    });
    window.padpilotHostReceiveProto?.(
      "NavigationFrame",
      bytesToBase64(toBinary(NavigationFrameSchema, navigationFrame)),
    );

    await waitFor(() => {
      expect(selectedModuleId).toBe("fx");
    });
    unsubscribe();
  });

  it("merges navigation and active-module proto updates without dropping prior bootstrap state", async () => {
    useNativeBridgeStub();

    let latest: Record<string, unknown> = {};
    const unsubscribe = subscribeHostState((state) => {
      latest = z.record(z.unknown()).parse(state);
    });

    window.padpilotHostReceive?.({
      editorViewStates: { sidebar: { collapsed: false } },
      modules: [{ id: "fx", name: "FX" }],
      selectedModuleId: "fx",
    });

    const navigationFrame = create(NavigationFrameSchema, {
      modules: [
        {
          id: "fx",
          name: "FX",
          expectedModuleVersion: "1.0.0",
          loadErrorMessage: "Installed bundle UI entry is missing.",
          loadStatus: "missing",
          resolvedModuleVersion: "2.0.0",
        },
        { id: "performance", name: "Performance" },
      ],
      presets: [{ id: "preset-1", name: "Init" }],
      selectedModuleId: "performance",
      selectedPresetId: "preset-1",
    });
    window.padpilotHostReceiveProto?.("NavigationFrame", bytesToBase64(toBinary(NavigationFrameSchema, navigationFrame)));

    const fxState = createDefaultFxChainState();
    fxState.master!.wetDry = 0.61;
    const activeStateFrame = create(ActiveModuleStateFrameSchema, {
      acceptedRevision: 7n,
      moduleId: "performance",
      payload: base64ToBytes(encodeFxChainStateBase64(fxState)),
    });
    window.padpilotHostReceiveProto?.("ActiveModuleStateFrame", bytesToBase64(toBinary(ActiveModuleStateFrameSchema, activeStateFrame)));

    await waitFor(() => {
      expect((z.record(z.unknown()).parse(latest.editorViewStates)).sidebar).toEqual({ collapsed: false });
      expect((z.array(z.object({id:z.string()}).passthrough()).parse(latest.modules)).map((moduleItem) => moduleItem.id)).toEqual(["fx", "performance"]);
      expect((z.array(z.record(z.unknown())).parse(latest.modules))[0]).toEqual(expect.objectContaining({
        expectedModuleVersion: "1.0.0",
        id: "fx",
        loadErrorMessage: "Installed bundle UI entry is missing.",
        loadStatus: "missing",
        name: "FX",
        resolvedModuleVersion: "2.0.0",
        version: "",
        capabilities: [],
        uiEntryPath: "",
        scriptEntryPath: "",
      }));
      expect(latest.selectedModuleId).toBe("performance");
      expect(latest.selectedPresetId).toBe("preset-1");
      expect(latest.activeModuleId).toBe("performance");
      expect(latest.acceptedRevision).toBe(7n);
    });

    unsubscribe();
  });

  it("drops only a stale active-module payload while preserving fresh fields from the same frame", async () => {
    useNativeBridgeStub();

    let latest: Record<string, unknown> = {};
    const unsubscribe = subscribeHostState((state) => {
      latest = z.record(z.unknown()).parse(state);
    });
    window.padpilotHostReceive?.({ selectedModuleId: "fx" });

    const freshState = createDefaultFxChainState();
    freshState.master!.wetDry = 0.7;
    freshState.revision = 8n;
    const staleState = createDefaultFxChainState();
    staleState.master!.wetDry = 0.1;
    staleState.revision = 7n;

    const freshFrame = create(ActiveModuleStateFrameSchema, {
      acceptedRevision: 8n,
      moduleId: "fx",
      payload: base64ToBytes(encodeFxChainStateBase64(freshState)),
      projectBpm: 120,
    });
    const staleFrame = create(ActiveModuleStateFrameSchema, {
      acceptedRevision: 7n,
      moduleId: "fx",
      payload: base64ToBytes(encodeFxChainStateBase64(staleState)),
      projectBpm: 142,
    });
    window.padpilotHostReceiveProto?.("ActiveModuleStateFrame", bytesToBase64(toBinary(ActiveModuleStateFrameSchema, freshFrame)));
    window.padpilotHostReceiveProto?.("ActiveModuleStateFrame", bytesToBase64(toBinary(ActiveModuleStateFrameSchema, staleFrame)));

    await waitFor(() => {
      expect(latest.acceptedRevision).toBe(8n);
      expect(latest.projectBpm).toBe(142);
      expect(decodeFxChainStateBase64(String(latest.activeModuleStateBase64)).master?.wetDry).toBeCloseTo(0.7, 5);
    });

    unsubscribe();
  });

  it("merges input-state proto updates without dropping module navigation state", async () => {
    useNativeBridgeStub();

    let latest: Record<string, unknown> = {};
    const unsubscribe = subscribeHostState((state) => {
      latest = z.record(z.unknown()).parse(state);
    });

    window.padpilotHostReceive?.({
      modules: [{ id: "performance", name: "Performance" }],
      selectedModuleId: "performance",
    });

    const controllerConfig = createDefaultControllerConfig();
    controllerConfig.rows[0] = {
      ...controllerConfig.rows[0]!,
      hardwareId: "pad-1",
      layoutKind: "playstation",
    };
    const inputFrame = create(InputStateFrameSchema, {
      controllerAxes: [0.25, -0.5],
      controllerButtons: [1, 0],
      controllerConnected: true,
      controllerFrameIndex: 12,
      inputDevices: [{
        axes: [0.25, -0.5],
        buttons: [1, 0],
        connected: true,
        deviceId: "pad-1",
        runtimeDeviceId: "pad-1#12",
        hardwareId: "pad-1",
        deviceKind: 1,
        displayName: "Gamepad",
        frameIndex: 12,
        rawAxes: [0.5, -1],
        rawButtons: [0.75, 0.1],
        detectedLayoutKind: 2,
        activeLayoutKind: 2,
      }],
      controllerConfig: {
        rows: [{
          stableId: controllerConfig.rows[0]!.stableId,
          hardwareId: "pad-1",
          layoutKind: 2,
          customLayoutId: "",
          isPrimary: true,
        }],
      },
    });
    window.padpilotHostReceiveProto?.("InputStateFrame", bytesToBase64(toBinary(InputStateFrameSchema, inputFrame)));

    await waitFor(() => {
      expect((z.array(z.object({id:z.string()}).passthrough()).parse(latest.modules))[0]?.id).toBe("performance");
      expect(latest.selectedModuleId).toBe("performance");
      expect(z.object({ connected: z.boolean(), frameIndex: z.number() }).parse(latest.controller).connected).toBe(true);
      expect(z.object({ connected: z.boolean(), frameIndex: z.number() }).parse(latest.controller).frameIndex).toBe(12);
      expect((z.array(z.object({deviceId:z.string()}).passthrough()).parse(latest.inputDevices))[0]?.deviceId).toBe("pad-1");
      expect((z.array(z.object({runtimeDeviceId:z.string()}).passthrough()).parse(latest.inputDevices))[0]?.runtimeDeviceId).toBe("pad-1#12");
      expect((z.array(z.object({hardwareId:z.string()}).passthrough()).parse(latest.inputDevices))[0]?.hardwareId).toBe("pad-1");
      expect((z.array(z.object({rawAxes:z.array(z.number())}).passthrough()).parse(latest.inputDevices))[0]?.rawAxes[0]).toBe(0.5);
      expect((z.array(z.object({detectedLayoutKind:z.string()}).passthrough()).parse(latest.inputDevices))[0]?.detectedLayoutKind).toBe("playstation");
      expect((z.object({rows:z.array(z.object({hardwareId:z.string(),layoutKind:z.string()}).passthrough())}).passthrough().parse(latest.controllerConfig)).rows[0]?.hardwareId).toBe("pad-1");
      expect((z.object({rows:z.array(z.object({hardwareId:z.string(),layoutKind:z.string()}).passthrough())}).passthrough().parse(latest.controllerConfig)).rows[0]?.layoutKind).toBe("playstation");
    });

    unsubscribe();
  });

  it("reopens requested capability streams when the selected module becomes active", async () => {
    const nativeInvocations: Array<{ eventId: string; payload: Record<string, unknown> }> = [];
    window.__JUCE__ = {
      backend: {
        addEventListener: () => 0,
        emitEvent: (eventId, payload) => {
          nativeInvocations.push({ eventId, payload: z.record(z.unknown()).parse(payload) });
        },
      },
      initializationData: {
        __juce__functions: ["padpilotBridge"],
      },
    };

    const handle = createCapabilityHandle("sample-analysis", "recut");
    const unsubscribe = subscribeCapabilityStream("sample-analysis", handle, () => {});

    await waitFor(() => {
      expect(nativeInvocations.length).toBe(1);
    });
    nativeInvocations.length = 0;

    window.padpilotHostReceive?.({ selectedModuleId: "recut" });

    await waitFor(() => {
      expect(nativeInvocations.length).toBe(1);
    });

    expect(nativeInvocations[0]?.eventId).toBe("__juce__invoke");
    expect(nativeInvocations[0]?.payload.name).toBe("padpilotBridge");
    const params = z.union([z.array(z.unknown()),z.undefined()]).parse(nativeInvocations[0]?.payload.params);
    const intent = z.object({type:z.string().optional(),capability:z.string().optional(),handle:z.string().optional()}).passthrough().parse(JSON.parse(String(params?.[0] ?? "{}")));
    expect(intent.type).toBe("openCapabilityStream");
    expect(intent.capability).toBe("sample-analysis");
    expect(intent.handle).toBe(handle);

    unsubscribe();
  });

  it("flushes queued module state before the host page tears down", async () => {
    const nativeInvocations: Array<{ eventId: string; payload: Record<string, unknown> }> = [];
    window.__JUCE__ = {
      backend: {
        addEventListener: () => 0,
        emitEvent: (eventId, payload) => {
          nativeInvocations.push({ eventId, payload: z.record(z.unknown()).parse(payload) });
        },
      },
      initializationData: {
        __juce__functions: ["padpilotBridge"],
      },
    };

    const fxState = createDefaultFxChainState();
    fxState.master!.wetDry = 0.42;
    fxState.revision = 7n;

    sendIntent({
      type: "setModuleStateProto",
      moduleId: "fx",
      payloadBase64: encodeFxChainStateBase64(fxState),
      revision: "7",
    });

    expect(nativeInvocations).toHaveLength(0);

    window.dispatchEvent(new Event("pagehide"));

    await waitFor(() => {
      expect(nativeInvocations).toHaveLength(1);
    });

    expect(nativeInvocations[0]?.eventId).toBe("__juce__invoke");
    expect(nativeInvocations[0]?.payload.name).toBe("padpilotBridge");
    const params = z.union([z.array(z.unknown()),z.undefined()]).parse(nativeInvocations[0]?.payload.params);
    const intent = z.object({type:z.string().optional(),moduleId:z.string().optional(),revision:z.string().optional()}).passthrough().parse(JSON.parse(String(params?.[0] ?? "{}")));
    expect(intent.type).toBe("setModuleStateProto");
    expect(intent.moduleId).toBe("fx");
    expect(intent.revision).toBe("7");
  });

  it("coalesces automation update-touch intents while preserving begin and end ordering", async () => {
    const nativeInvocations: Array<{ eventId: string; payload: Record<string, unknown> }> = [];
    window.__JUCE__ = {
      backend: {
        addEventListener: () => 0,
        emitEvent: (eventId, payload) => {
          nativeInvocations.push({ eventId, payload: z.record(z.unknown()).parse(payload) });
        },
      },
      initializationData: {
        __juce__functions: ["padpilotBridge"],
      },
    };

    const handle = "fx::automation::primary";
    sendIntent({
      type: "sendCapabilityIntent",
      capability: "automation",
      handle,
      action: "begin-touch",
      payloadBase64: "begin",
    });
    sendIntent({
      type: "sendCapabilityIntent",
      capability: "automation",
      handle,
      action: "update-touch",
      payloadBase64: "update-1",
    });
    sendIntent({
      type: "sendCapabilityIntent",
      capability: "automation",
      handle,
      action: "update-touch",
      payloadBase64: "update-2",
    });
    sendIntent({
      type: "sendCapabilityIntent",
      capability: "automation",
      handle,
      action: "end-touch",
      payloadBase64: "end",
    });

    await waitFor(() => {
      expect(nativeInvocations).toHaveLength(3);
    });

    const intents = nativeInvocations.map((entry) => {
      const params = z.union([z.array(z.unknown()),z.undefined()]).parse(entry.payload.params);
      return z.record(z.unknown()).parse(JSON.parse(String(params?.[0] ?? "{}")));
    });

    expect(intents).toEqual([
      expect.objectContaining({
        type: "sendCapabilityIntent",
        capability: "automation",
        handle,
        action: "begin-touch",
        payloadBase64: "begin",
      }),
      expect.objectContaining({
        type: "sendCapabilityIntent",
        capability: "automation",
        handle,
        action: "update-touch",
        payloadBase64: "update-2",
      }),
      expect.objectContaining({
        type: "sendCapabilityIntent",
        capability: "automation",
        handle,
        action: "end-touch",
        payloadBase64: "end",
      }),
    ]);
  });
});

