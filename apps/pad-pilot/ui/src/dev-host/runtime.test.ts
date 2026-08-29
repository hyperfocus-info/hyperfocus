import { fromBinary } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it } from "bun:test";
import { waitFor } from "@solidjs/testing-library";
import { decodeFxChainStateBase64 } from "../modules/fx/fx-chain-state";
import { getDevHostRuntime } from "./runtime";
import { DEV_HOST_STORAGE_KEY, loadSettings } from "./runtime-helpers";
import {
  encodeSampleSourceLoadRequest,
  encodeSlicePlaybackState,
} from "../padpilot/sample-capabilities";
import { base64ToBytes, bytesToBase64 } from "../proto/base64";
import {
  CapabilityFrameEnvelopeSchema,
  SampleAnalysisMode,
  SampleEditorFrameSchema,
} from "../proto/generated/capability-pb";
import {
  encodeSampleAnalysisRequest,
  encodeSlicePlaybackTrigger,
} from "../padpilot/sample-capabilities";


describe("dev host runtime", () => {
  afterEach(() => {
    const runtime = getDevHostRuntime();
    runtime.updateSettings({ continuousHostSync: false, running: false });
    runtime.reset();
  });

  it("publishes active module deltas after parameter updates without resending navigation metadata", async () => {
    const runtime = getDevHostRuntime();
    runtime.reset();
    runtime.updateSettings({ continuousHostSync: false, running: false });

    let latestState = runtime.getDebugState();
    const unsubscribeDebug = runtime.subscribe(() => {
      latestState = runtime.getDebugState();
    });

    let emittedState: ReturnType<typeof decodeFxChainStateBase64> | null = null;
    let lastEmission: Record<string, unknown> = {};
    const unsubscribe = runtime.subscribe((state) => {
      lastEmission = state as Record<string, unknown>;
      if (state.activeModuleId !== "fx" || !state.activeModuleStateBase64) {
        return;
      }
      emittedState = decodeFxChainStateBase64(state.activeModuleStateBase64);
    });

    runtime.sendIntent({
      type: "sendCapabilityIntent",
      capability: "fx-graph",
      handle: "fx::fx-graph::primary",
      action: "set-master-wet-dry",
      payloadBase64: bytesToBase64(new TextEncoder().encode("0.25")),
    });

    await waitFor(() => {
      expect(emittedState?.master?.wetDry).toBe(0.25);
    });

    unsubscribe();
    unsubscribeDebug();

    expect(lastEmission.modules).toBeUndefined();
    expect(lastEmission.selectedModuleId).toBeUndefined();
    expect(latestState.continuousHostSync).toBe(false);
  });

  it("isolates throwing host and diagnostics listeners", () => {
    const runtime = getDevHostRuntime();
    runtime.reset();
    runtime.updateSettings({ continuousHostSync: false, running: false });
    let hostFrames = 0;
    let debugFrames = 0;
    const unsubscribeThrowingHost = runtime.subscribe(() => {
      throw new Error("broken host listener");
    });
    const unsubscribeThrowingDebug = runtime.subscribeDebug(() => {
      throw new Error("broken diagnostics listener");
    });
    const unsubscribeHost = runtime.subscribe(() => {
      hostFrames += 1;
    });
    const unsubscribeDebug = runtime.subscribeDebug(() => {
      debugFrames += 1;
    });

    runtime.sendIntent({ type: "ready" });
    runtime.updateSettings({ intensity: 0.4 });

    expect(hostFrames).toBeGreaterThan(1);
    expect(debugFrames).toBeGreaterThan(1);
    unsubscribeThrowingHost();
    unsubscribeThrowingDebug();
    unsubscribeHost();
    unsubscribeDebug();
  });

  it("normalizes malformed persisted simulator settings", () => {
    window.localStorage.setItem(DEV_HOST_STORAGE_KEY, JSON.stringify({
      continuousHostSync: "false",
      intensity: "not-a-number",
      profile: "unknown-profile",
      running: 0,
      stereoWidth: null,
      tempo: "infinite",
    }));

    expect(loadSettings()).toEqual({
      continuousHostSync: false,
      intensity: 0.72,
      profile: "pulsed-groove",
      running: true,
      stereoWidth: 0.58,
      tempo: 116,
    });
  });

  it("simulates installed-module load outcomes for browser parity tests", () => {
    const runtime = getDevHostRuntime();
    runtime.reset();

    const installed = runtime.installModuleBundle("fixtures/custom-module.zip");
    expect(installed.id).toBe("dev-installed");
    expect(installed.loadStatus).toBe("ready");
    expect(installed.uiEntryPath).toContain("builtin://starter/");

    const incompatible = runtime.installModuleBundle("fixtures/incompatible-module.zip");
    expect(incompatible.id).toBe("dev-incompatible");
    expect(incompatible.loadStatus).toBe("incompatible-host");
    expect(incompatible.loadErrorMessage).toContain("Current host is 0.1.0-dev");

    expect(() => runtime.installModuleBundle("fixtures/missing-script-module.zip")).toThrow(
      "Bundle is missing the script entry declared in padpilot-module.json.",
    );
  });

  it("republishes recut capability frames when analysis is requested again", async () => {
    const runtime = getDevHostRuntime();
    runtime.reset();
    runtime.updateSettings({ continuousHostSync: false, running: false });

    const capabilityPayloads: string[] = [];
    const unsubscribe = runtime.subscribe((state) => {
      if (state.type === "capabilityFrameEnvelopeProto" && state.capabilityFrameEnvelopeBase64) {
        capabilityPayloads.push(state.capabilityFrameEnvelopeBase64);
      }
    });

    runtime.sendIntent({ type: "selectModule", moduleId: "recut" });
    runtime.sendIntent({
      type: "openCapabilityStream",
      capability: "sample-analysis",
      handle: "recut::sample-analysis::primary",
    });

    await waitFor(() => {
      expect(capabilityPayloads.length).toBeGreaterThan(0);
    });

    const firstPayload = capabilityPayloads.at(-1);
    runtime.sendIntent({ type: "sendCapabilityIntent", capability: "sample-analysis", handle: "recut::sample-analysis::primary", action: "request-analysis", payloadBase64: "" });
    await waitFor(() => {
      expect(capabilityPayloads.length).toBeGreaterThan(1);
      expect(capabilityPayloads.at(-1)).not.toBe(firstPayload);
    });

    unsubscribe();
  });

  it("publishes custom recut markers and 16 pad assignments after manual playback-state edits", async () => {
    const runtime = getDevHostRuntime();
    runtime.reset();
    runtime.updateSettings({ continuousHostSync: false, running: false });

    let latestFrame = null as ReturnType<typeof fromBinary<typeof SampleEditorFrameSchema>> | null;
    const unsubscribe = runtime.subscribe((state) => {
      if (state.type !== "capabilityFrameEnvelopeProto" || !state.capabilityFrameEnvelopeBase64) {
        return;
      }
      const envelope = fromBinary(CapabilityFrameEnvelopeSchema, base64ToBytes(state.capabilityFrameEnvelopeBase64));
      if (envelope.capability !== "sample-analysis") {
        return;
      }
      latestFrame = fromBinary(SampleEditorFrameSchema, envelope.payload);
    });

    runtime.sendIntent({ type: "selectModule", moduleId: "recut" });
    runtime.sendIntent({
      type: "openCapabilityStream",
      capability: "sample-analysis",
      handle: "recut::sample-analysis::primary",
    });
    runtime.sendIntent({
      type: "sendCapabilityIntent",
      capability: "sample-source",
      handle: "recut::sample-source::primary",
      action: "load-file",
      payloadBase64: encodeSampleSourceLoadRequest({
        sourceContentId: "missing-loop",
        sourceName: "manual-loop.wav",
        sourcePath: "C:\\samples\\manual-loop.wav",
      }),
    });

    await waitFor(() => {
      expect(latestFrame?.loaded).toBe(true);
    });

    runtime.sendIntent({
      type: "sendCapabilityIntent",
      capability: "slice-playback",
      handle: "recut::slice-playback::primary",
      action: "apply-state",
      payloadBase64: encodeSlicePlaybackState({
        analysisMode: SampleAnalysisMode.CUSTOM,
        density: 0.5,
        manualEditRevision: 2n,
        padAssignments: Array.from({ length: 16 }, (_, index) => ({
          bank: Math.floor(index / 4),
          chokeGroupId: 0,
          faceButton: ["X", "Y", "A", "B"][index % 4],
          padIndex: index,
          sliceIndex: index % 2,
        })),
        projectBpm: 120,
        sampleHandle: "recut::sample-source::primary",
        sliceMarkers: [
          { chokeGroupId: 0, confidence: 1, endFrame: 24000, fadeMs: 8, padIndex: 0, snapExact: true, startFrame: 0, transientFrame: 0 },
          { chokeGroupId: 0, confidence: 1, endFrame: 47999, fadeMs: 8, padIndex: 1, snapExact: true, startFrame: 24000, transientFrame: 24000 },
        ],
      }),
    });

    await waitFor(() => {
      expect(latestFrame?.analysisMode).toBe(SampleAnalysisMode.CUSTOM);
      expect(latestFrame?.analysisRevision).toBe(2n);
      expect(latestFrame?.sliceMarkers.length).toBe(2);
      expect(latestFrame?.padAssignments.length).toBe(16);
    });

    unsubscribe();
  });

  it("publishes waveform peaks in the first loaded recut sample-editor frame", async () => {
    const runtime = getDevHostRuntime();
    runtime.reset();
    runtime.updateSettings({ continuousHostSync: false, running: false });

    let latestFrame = null as ReturnType<typeof fromBinary<typeof SampleEditorFrameSchema>> | null;
    const unsubscribe = runtime.subscribe((state) => {
      if (state.type !== "capabilityFrameEnvelopeProto" || !state.capabilityFrameEnvelopeBase64) {
        return;
      }
      const envelope = fromBinary(CapabilityFrameEnvelopeSchema, base64ToBytes(state.capabilityFrameEnvelopeBase64));
      if (envelope.capability !== "sample-analysis") {
        return;
      }
      latestFrame = fromBinary(SampleEditorFrameSchema, envelope.payload);
    });

    runtime.sendIntent({ type: "selectModule", moduleId: "recut" });
    runtime.sendIntent({
      type: "openCapabilityStream",
      capability: "sample-analysis",
      handle: "recut::sample-analysis::primary",
    });
    runtime.sendIntent({
      type: "sendCapabilityIntent",
      capability: "sample-source",
      handle: "recut::sample-source::primary",
      action: "load-file",
      payloadBase64: encodeSampleSourceLoadRequest({
        sourceContentId: "missing-peaks-loop",
        sourceName: "peaks-loop.wav",
        sourcePath: "C:\\samples\\peaks-loop.wav",
      }),
    });

    await waitFor(() => {
      expect(latestFrame?.loaded).toBe(true);
      expect(latestFrame?.waveformPeaks.length).toBeGreaterThan(0);
    });

    unsubscribe();
  });

  it("switches recut back out of custom mode on analysis requests", async () => {
    const runtime = getDevHostRuntime();
    runtime.reset();
    runtime.updateSettings({ continuousHostSync: false, running: false, tempo: 128 });

    let latestFrame = null as ReturnType<typeof fromBinary<typeof SampleEditorFrameSchema>> | null;
    const unsubscribe = runtime.subscribe((state) => {
      if (state.type !== "capabilityFrameEnvelopeProto" || !state.capabilityFrameEnvelopeBase64) {
        return;
      }
      const envelope = fromBinary(CapabilityFrameEnvelopeSchema, base64ToBytes(state.capabilityFrameEnvelopeBase64));
      if (envelope.capability !== "sample-analysis") {
        return;
      }
      latestFrame = fromBinary(SampleEditorFrameSchema, envelope.payload);
    });

    runtime.sendIntent({ type: "selectModule", moduleId: "recut" });
    runtime.sendIntent({
      type: "openCapabilityStream",
      capability: "sample-analysis",
      handle: "recut::sample-analysis::primary",
    });
    runtime.sendIntent({
      type: "sendCapabilityIntent",
      capability: "sample-source",
      handle: "recut::sample-source::primary",
      action: "load-file",
      payloadBase64: encodeSampleSourceLoadRequest({
        sourceContentId: "missing-mode-loop",
        sourceName: "mode-loop.wav",
        sourcePath: "C:\\samples\\mode-loop.wav",
      }),
    });

    await waitFor(() => {
      expect(latestFrame?.loaded).toBe(true);
    });

    runtime.sendIntent({
      type: "sendCapabilityIntent",
      capability: "slice-playback",
      handle: "recut::slice-playback::primary",
      action: "apply-state",
      payloadBase64: encodeSlicePlaybackState({
        analysisMode: SampleAnalysisMode.CUSTOM,
        density: 0.5,
        manualEditRevision: 3n,
        padAssignments: Array.from({ length: 16 }, (_, index) => ({
          bank: Math.floor(index / 4),
          chokeGroupId: 0,
          faceButton: ["X", "Y", "A", "B"][index % 4],
          padIndex: index,
          sliceIndex: index % 2,
        })),
        projectBpm: 128,
        sampleHandle: "recut::sample-source::primary",
        sliceMarkers: [
          { chokeGroupId: 0, confidence: 1, endFrame: 24000, fadeMs: 8, padIndex: 0, snapExact: true, startFrame: 0, transientFrame: 0 },
          { chokeGroupId: 0, confidence: 1, endFrame: 47999, fadeMs: 8, padIndex: 1, snapExact: true, startFrame: 24000, transientFrame: 24000 },
        ],
      }),
    });

    await waitFor(() => {
      expect(latestFrame?.analysisMode).toBe(SampleAnalysisMode.CUSTOM);
    });

    runtime.sendIntent({
      type: "sendCapabilityIntent",
      capability: "sample-analysis",
      handle: "recut::sample-analysis::primary",
      action: "request-analysis",
      payloadBase64: encodeSampleAnalysisRequest({
        analysisMode: SampleAnalysisMode.AUTO,
        density: 0.8,
        projectBpm: 128,
      }),
    });

    await waitFor(() => {
      expect(latestFrame?.analysisMode).toBe(SampleAnalysisMode.AUTO);
      expect(latestFrame?.density ?? 0).toBeCloseTo(0.8, 4);
    });

    runtime.sendIntent({
      type: "sendCapabilityIntent",
      capability: "sample-analysis",
      handle: "recut::sample-analysis::primary",
      action: "request-analysis",
      payloadBase64: encodeSampleAnalysisRequest({
        analysisMode: SampleAnalysisMode.BPM,
        density: 0.25,
        projectBpm: 128,
      }),
    });

    await waitFor(() => {
      expect(latestFrame?.analysisMode).toBe(SampleAnalysisMode.BPM);
    });

    unsubscribe();
  });

  it("caps BPM density requests within the 4, 8, and 16 marker tiers", async () => {
    const runtime = getDevHostRuntime();
    runtime.reset();
    runtime.updateSettings({ continuousHostSync: false, running: false, tempo: 132 });

    let latestFrame = null as ReturnType<typeof fromBinary<typeof SampleEditorFrameSchema>> | null;
    const unsubscribe = runtime.subscribe((state) => {
      if (state.type !== "capabilityFrameEnvelopeProto" || !state.capabilityFrameEnvelopeBase64) {
        return;
      }
      const envelope = fromBinary(CapabilityFrameEnvelopeSchema, base64ToBytes(state.capabilityFrameEnvelopeBase64));
      if (envelope.capability !== "sample-analysis") {
        return;
      }
      latestFrame = fromBinary(SampleEditorFrameSchema, envelope.payload);
    });

    runtime.sendIntent({ type: "selectModule", moduleId: "recut" });
    runtime.sendIntent({
      type: "openCapabilityStream",
      capability: "sample-analysis",
      handle: "recut::sample-analysis::primary",
    });
    runtime.sendIntent({
      type: "sendCapabilityIntent",
      capability: "sample-source",
      handle: "recut::sample-source::primary",
      action: "load-file",
      payloadBase64: encodeSampleSourceLoadRequest({
        sourceContentId: "missing-bpm-loop",
        sourceName: "bpm-loop.wav",
        sourcePath: "C:\\samples\\bpm-loop.wav",
      }),
    });

    await waitFor(() => {
      expect(latestFrame?.loaded).toBe(true);
      expect(latestFrame?.projectBpm).toBe(132);
    });

    for (const [density, expectedCount] of [
      [0, 4],
      [0.5, 8],
      [1, 16],
    ] as const) {
      runtime.sendIntent({
        type: "sendCapabilityIntent",
        capability: "sample-analysis",
        handle: "recut::sample-analysis::primary",
        action: "request-analysis",
        payloadBase64: encodeSampleAnalysisRequest({
          analysisMode: SampleAnalysisMode.BPM,
          density,
          projectBpm: 132,
        }),
      });

      await waitFor(() => {
        expect(latestFrame?.analysisMode).toBe(SampleAnalysisMode.BPM);
        expect((latestFrame?.sliceMarkers.length ?? 0) > 0).toBe(true);
        expect(latestFrame?.sliceMarkers.length ?? 0).toBeLessThanOrEqual(expectedCount);
      });
    }

    unsubscribe();
  });

  it("tracks overlapping held pads and releases each pad independently", async () => {
    const runtime = getDevHostRuntime();
    runtime.reset();
    runtime.updateSettings({ continuousHostSync: false, running: false });

    let latestFrame = null as ReturnType<typeof fromBinary<typeof SampleEditorFrameSchema>> | null;
    const unsubscribe = runtime.subscribe((state) => {
      if (state.type !== "capabilityFrameEnvelopeProto" || !state.capabilityFrameEnvelopeBase64) {
        return;
      }
      const envelope = fromBinary(CapabilityFrameEnvelopeSchema, base64ToBytes(state.capabilityFrameEnvelopeBase64));
      if (envelope.capability !== "sample-analysis") {
        return;
      }
      latestFrame = fromBinary(SampleEditorFrameSchema, envelope.payload);
    });

    runtime.sendIntent({ type: "selectModule", moduleId: "recut" });
    runtime.sendIntent({
      type: "openCapabilityStream",
      capability: "sample-analysis",
      handle: "recut::sample-analysis::primary",
    });
    runtime.sendIntent({
      type: "sendCapabilityIntent",
      capability: "sample-source",
      handle: "recut::sample-source::primary",
      action: "load-file",
      payloadBase64: encodeSampleSourceLoadRequest({
        sourceContentId: "missing-poly-loop",
        sourceName: "poly-loop.wav",
        sourcePath: "C:\\samples\\poly-loop.wav",
      }),
    });

    await waitFor(() => {
      expect(latestFrame?.loaded).toBe(true);
    });

    const trigger = (padIndex: number, pressed: boolean) =>
      runtime.sendIntent({
        type: "sendCapabilityIntent",
        capability: "slice-playback",
        handle: "recut::slice-playback::primary",
        action: "trigger-pad",
        payloadBase64: encodeSlicePlaybackTrigger({ padIndex, velocity: 1, pressed }),
      });

    trigger(0, true);
    await waitFor(() => {
      expect(latestFrame?.heldPadIndices).toEqual([0]);
      expect(latestFrame?.playingPadIndices).toEqual([0]);
    });

    trigger(1, true);
    await waitFor(() => {
      expect(latestFrame?.heldPadIndices).toEqual([0, 1]);
      expect(latestFrame?.playingPadIndices).toEqual([0, 1]);
    });

    trigger(0, false);
    await waitFor(() => {
      expect(latestFrame?.heldPadIndices).toEqual([1]);
      expect(latestFrame?.playingPadIndices).toEqual([1]);
    });

    trigger(1, false);
    await waitFor(() => {
      expect(latestFrame?.heldPadIndices).toEqual([]);
      expect(latestFrame?.playingPadIndices).toEqual([]);
    });

    unsubscribe();
  });

  it("uses mapped slice offsets instead of the first slice when starting recut playback", async () => {
    const runtime = getDevHostRuntime();
    runtime.reset();
    runtime.updateSettings({ continuousHostSync: false, running: false });

    const startCalls: { duration?: number; offset: number }[] = [];
    const fakeBuffer = {
      duration: 2,
      length: 96000,
      numberOfChannels: 1,
      sampleRate: 48000,
      getChannelData() {
        return new Float32Array(96000);
      },
    };
    const originalAudioContext = window.AudioContext;
    const originalImportedFiles = window.__PADPILOT_DEV_IMPORTED_FILES__;
    class FakeAudioContext {
      currentTime = 0;
      destination = {} as AudioNode;

      createBufferSource() {
        return {
          buffer: null as AudioBuffer | null,
          connect() {},
          onended: null as (() => void) | null,
          start: (_when: number, offset: number, duration?: number) => {
            startCalls.push({ duration, offset });
          },
          stop: () => {
            return;
          },
        } as unknown as AudioBufferSourceNode;
      }

      createGain() {
        return {
          connect() {},
          gain: {
            cancelScheduledValues() {},
            linearRampToValueAtTime() {},
            setValueAtTime() {},
            value: 1,
          },
        } as unknown as GainNode;
      }

      decodeAudioData() {
        return Promise.resolve(fakeBuffer as unknown as AudioBuffer);
      }

      close() {
        return Promise.resolve();
      }
    }

    window.AudioContext = FakeAudioContext as unknown as typeof AudioContext;
    window.__PADPILOT_DEV_IMPORTED_FILES__ = {
      ...(originalImportedFiles ?? {}),
      "preview-offset-loop": {
        bytesBase64: btoa(String.fromCharCode(...Uint8Array.from({ length: 128 }, (_, index) => index % 255))),
        name: "preview-offset.wav",
        mimeType: "audio/wav",
      },
    };

    try {
      runtime.sendIntent({ type: "selectModule", moduleId: "recut" });
      runtime.sendIntent({
        type: "sendCapabilityIntent",
        capability: "sample-source",
        handle: "recut::sample-source::primary",
        action: "load-file",
        payloadBase64: encodeSampleSourceLoadRequest({
          sourceContentId: "preview-offset-loop",
          sourceName: "preview-offset.wav",
          sourcePath: "C:\\samples\\preview-offset.wav",
        }),
      });

      await waitFor(() => {
        expect(startCalls.length).toBe(0);
      });

      runtime.sendIntent({
        type: "sendCapabilityIntent",
        capability: "slice-playback",
        handle: "recut::slice-playback::primary",
        action: "apply-state",
        payloadBase64: encodeSlicePlaybackState({
          analysisMode: SampleAnalysisMode.CUSTOM,
          density: 0.5,
          manualEditRevision: 1n,
          padAssignments: Array.from({ length: 16 }, (_, index) => ({
            bank: Math.floor(index / 4),
            chokeGroupId: 0,
            faceButton: ["X", "Y", "A", "B"][index % 4],
            padIndex: index,
            sliceIndex: index % 2,
          })),
          projectBpm: 120,
          sampleHandle: "recut::sample-source::primary",
          sliceMarkers: [
            { chokeGroupId: 0, confidence: 1, endFrame: 24000, fadeMs: 8, padIndex: 0, snapExact: true, startFrame: 0, transientFrame: 0 },
            { chokeGroupId: 0, confidence: 1, endFrame: 48000, fadeMs: 8, padIndex: 1, snapExact: true, startFrame: 24000, transientFrame: 24000 },
          ],
        }),
      });
      runtime.sendIntent({
        type: "sendCapabilityIntent",
        capability: "slice-playback",
        handle: "recut::slice-playback::primary",
        action: "trigger-pad",
        payloadBase64: encodeSlicePlaybackTrigger({ padIndex: 1, velocity: 1, pressed: true }),
      });

      await waitFor(() => {
        expect(startCalls.at(-1)?.offset).toBe(0.5);
        expect(startCalls.at(-1)?.duration).toBe(0.5);
      });
    } finally {
      window.AudioContext = originalAudioContext;
      window.__PADPILOT_DEV_IMPORTED_FILES__ = originalImportedFiles;
    }
  });

  it("ignores a Recut decode that finishes after a newer sample load", async () => {
    const runtime = getDevHostRuntime();
    runtime.reset();
    runtime.updateSettings({ continuousHostSync: false, running: false });

    const decodeRequests: Array<{
      resolve: (buffer: AudioBuffer) => void;
    }> = [];
    const originalAudioContext = window.AudioContext;
    const originalImportedFiles = window.__PADPILOT_DEV_IMPORTED_FILES__;
    class FakeAudioContext {
      decodeAudioData() {
        return new Promise<AudioBuffer>((resolve) => {
          decodeRequests.push({ resolve });
        });
      }

      close() {
        return Promise.resolve();
      }
    }
    const createBuffer = (sampleRate: number) => ({
      duration: 4 / sampleRate,
      length: 4,
      numberOfChannels: 1,
      sampleRate,
      getChannelData() {
        return new Float32Array(4);
      },
    }) as unknown as AudioBuffer;

    window.AudioContext = FakeAudioContext as unknown as typeof AudioContext;
    window.__PADPILOT_DEV_IMPORTED_FILES__ = {
      "decode-first": {
        byteSize: 4,
        bytesBase64: bytesToBase64(Uint8Array.of(1, 2, 3, 4)),
        name: "first.wav",
        mimeType: "audio/wav",
      },
      "decode-second": {
        byteSize: 4,
        bytesBase64: bytesToBase64(Uint8Array.of(5, 6, 7, 8)),
        name: "second.wav",
        mimeType: "audio/wav",
      },
    };

    try {
      runtime.sendIntent({ type: "selectModule", moduleId: "recut" });
      const load = (contentId: string, sourceName: string) => runtime.sendIntent({
        type: "sendCapabilityIntent",
        capability: "sample-source",
        handle: "recut::sample-source::primary",
        action: "load-file",
        payloadBase64: encodeSampleSourceLoadRequest({
          sourceContentId: contentId,
          sourceName,
          sourcePath: `C:\\samples\\${sourceName}`,
        }),
      });
      load("decode-first", "first.wav");
      load("decode-second", "second.wav");
      expect(decodeRequests.length).toBe(2);

      decodeRequests[1]!.resolve(createBuffer(96000));
      const internals = runtime as unknown as {
        recutState: { loaded: boolean; sampleRate: number; sourceName: string };
      };
      await waitFor(() => {
        expect(internals.recutState.loaded).toBe(true);
        expect(internals.recutState.sampleRate).toBe(96000);
        expect(internals.recutState.sourceName).toBe("second.wav");
      });

      decodeRequests[0]!.resolve(createBuffer(11025));
      await Promise.resolve();
      await Promise.resolve();
      expect(internals.recutState.sampleRate).toBe(96000);
      expect(internals.recutState.sourceName).toBe("second.wav");
    } finally {
      runtime.reset();
      window.AudioContext = originalAudioContext;
      window.__PADPILOT_DEV_IMPORTED_FILES__ = originalImportedFiles;
    }
  });

  it("clears recut held and playing state after preview-style release timing", async () => {
    const runtime = getDevHostRuntime();
    runtime.reset();
    runtime.updateSettings({ continuousHostSync: false, running: false });

    let latestFrame = null as ReturnType<typeof fromBinary<typeof SampleEditorFrameSchema>> | null;
    const unsubscribe = runtime.subscribe((state) => {
      if (state.type !== "capabilityFrameEnvelopeProto" || !state.capabilityFrameEnvelopeBase64) {
        return;
      }
      const envelope = fromBinary(CapabilityFrameEnvelopeSchema, base64ToBytes(state.capabilityFrameEnvelopeBase64));
      if (envelope.capability !== "sample-analysis") {
        return;
      }
      latestFrame = fromBinary(SampleEditorFrameSchema, envelope.payload);
    });

    runtime.sendIntent({ type: "selectModule", moduleId: "recut" });
    runtime.sendIntent({
      type: "openCapabilityStream",
      capability: "sample-analysis",
      handle: "recut::sample-analysis::primary",
    });
    runtime.sendIntent({
      type: "sendCapabilityIntent",
      capability: "sample-source",
      handle: "recut::sample-source::primary",
      action: "load-file",
      payloadBase64: encodeSampleSourceLoadRequest({
        sourceContentId: "missing-preview-loop",
        sourceName: "preview-loop.wav",
        sourcePath: "C:\\samples\\preview-loop.wav",
      }),
    });

    await waitFor(() => {
      expect(latestFrame?.loaded).toBe(true);
    });

    runtime.sendIntent({
      type: "sendCapabilityIntent",
      capability: "slice-playback",
      handle: "recut::slice-playback::primary",
      action: "trigger-pad",
      payloadBase64: encodeSlicePlaybackTrigger({ padIndex: 0, velocity: 1, pressed: true }),
    });

    await waitFor(() => {
      expect(latestFrame?.heldPadIndices).toEqual([0]);
    });

    runtime.sendIntent({
      type: "sendCapabilityIntent",
      capability: "slice-playback",
      handle: "recut::slice-playback::primary",
      action: "trigger-pad",
      payloadBase64: encodeSlicePlaybackTrigger({ padIndex: 0, velocity: 1, pressed: false }),
    });

    await waitFor(() => {
      expect(latestFrame?.heldPadIndices).toEqual([]);
      expect(latestFrame?.playingPadIndices).toEqual([]);
    });

    unsubscribe();
  });

});
