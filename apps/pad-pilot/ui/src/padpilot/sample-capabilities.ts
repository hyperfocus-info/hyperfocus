import { fromBinary, toBinary } from "@bufbuild/protobuf";
import { create } from "@bufbuild/protobuf";
import { subscribeCapabilityStream } from "../bridge";
import { moduleSdk } from "../module-sdk";
import { base64ToBytes, bytesToBase64 } from "../proto/base64";
import { createCapabilityHandle as createModuleCapabilityHandle } from "@hyperfocus/pad-pilot/module-identity";
import {
  HapticIntentSchema,
  SampleAnalysisRequestSchema,
  SampleEditorFrameSchema,
  SampleSourceLoadRequestSchema,
  SliceEditIntentSchema,
  SlicePlaybackStateSchema,
  SlicePlaybackTriggerSchema,
  type HapticIntent,
  type SampleAnalysisRequest,
  type SampleEditorFrame,
  type SampleSourceLoadRequest,
  type SliceEditIntent,
  type SlicePlaybackState,
  type SlicePlaybackTrigger,
} from "../proto/generated/capability-pb";

export type {
  HapticIntent,
  SampleAnalysisRequest,
  SampleEditorFrame,
  SampleSourceLoadRequest,
  SliceEditIntent,
  SlicePlaybackState,
  SlicePlaybackTrigger,
};

function encodePayload(schema: Parameters<typeof toBinary>[0], value: unknown) {
  return bytesToBase64(toBinary(schema as never, value as never));
}

function decodePayload(schema: Parameters<typeof fromBinary>[0], payloadBase64: string) {
  return fromBinary(schema as never, base64ToBytes(payloadBase64));
}

export function createCapabilityHandle(capability: "sample-source" | "sample-analysis" | "slice-playback" | "haptics", moduleInstanceId: string, slot = "primary") {
  return createModuleCapabilityHandle(capability, moduleInstanceId, slot);
}

export function createSampleCapabilityHandles(moduleInstanceId: string, slot = "primary") {
  return {
    haptics: createCapabilityHandle("haptics", moduleInstanceId, slot),
    sampleAnalysis: createCapabilityHandle("sample-analysis", moduleInstanceId, slot),
    sampleSource: createCapabilityHandle("sample-source", moduleInstanceId, slot),
    slicePlayback: createCapabilityHandle("slice-playback", moduleInstanceId, slot),
  };
}

export function encodeSampleSourceLoadRequest(value: Record<string, unknown>) {
  return encodePayload(SampleSourceLoadRequestSchema, create(SampleSourceLoadRequestSchema, value));
}

export function encodeSampleAnalysisRequest(value: Record<string, unknown>) {
  return encodePayload(SampleAnalysisRequestSchema, create(SampleAnalysisRequestSchema, value));
}

export function encodeSlicePlaybackState(value: Record<string, unknown>) {
  return encodePayload(SlicePlaybackStateSchema, create(SlicePlaybackStateSchema, value));
}

export function encodeSlicePlaybackTrigger(value: Record<string, unknown>) {
  return encodePayload(SlicePlaybackTriggerSchema, create(SlicePlaybackTriggerSchema, value));
}

export function encodeSliceEditIntent(value: Record<string, unknown>) {
  return encodePayload(SliceEditIntentSchema, create(SliceEditIntentSchema, value));
}

export function encodeHapticIntent(value: Record<string, unknown>) {
  return encodePayload(HapticIntentSchema, create(HapticIntentSchema, value));
}

export function decodeSampleEditorFrame(payloadBase64: string) {
  return decodePayload(SampleEditorFrameSchema, payloadBase64) as SampleEditorFrame;
}

export function createEmptySampleEditorFrame() {
  return create(SampleEditorFrameSchema, {
    activeSliceIndex: 0,
    analysisMode: 0,
    analysisRevision: 0n,
    analysisProgress: 0,
    armedPadIndex: 0,
    bpmConfidence: 0,
    bpmSource: 0,
    bpmSuggestedConfidence: 0,
    bpmSuggestedValue: 0,
    bpmValue: 0,
    candidateTransients: [],
    density: 0.5,
    heldPadIndices: [],
    lastSnapExact: false,
    loaded: false,
    padAssignments: [],
    playingPadIndices: [],
    playheadFrame: 0n,
    projectBpm: 120,
    sequence: 0n,
    sliceMarkers: [],
    waveformPeaks: [],
  });
}

type SampleSourceLoadFileInput = {
  sourcePath: string;
  sourceName?: string;
  sourceContentId?: string;
};

export const sampleCapabilities = {
  createHandles(moduleInstanceId: string, slot = "primary") {
    return createSampleCapabilityHandles(moduleInstanceId, slot);
  },
  loadFile(handle: string, request: SampleSourceLoadFileInput) {
    moduleSdk.sendCapabilityIntent("sample-source", handle, "load-file", encodeSampleSourceLoadRequest(request));
  },
  requestAnalysis(handle: string, request: Record<string, unknown>) {
    moduleSdk.sendCapabilityIntent("sample-analysis", handle, "request-analysis", encodeSampleAnalysisRequest(request));
  },
  openEditorFrameStream(handle: string, listener: (frame: SampleEditorFrame) => void) {
    return subscribeCapabilityStream("sample-analysis", handle, (frame) => {
      if (frame.payloadType !== "SampleEditorFrame" || frame.payloadBase64.length === 0) {
        return;
      }
      listener(decodeSampleEditorFrame(frame.payloadBase64));
    });
  },
  applySlicePlaybackState(handle: string, state: Record<string, unknown>) {
    moduleSdk.sendCapabilityIntent("slice-playback", handle, "apply-state", encodeSlicePlaybackState(state));
  },
  triggerPad(handle: string, padIndex: number, velocity = 1, pressed = true) {
    moduleSdk.sendCapabilityIntent("slice-playback", handle, "trigger-pad", encodeSlicePlaybackTrigger({ padIndex, velocity, pressed }));
  },
  editSlice(handle: string, intent: Record<string, unknown>) {
    moduleSdk.sendCapabilityIntent("slice-playback", handle, "edit-slice", encodeSliceEditIntent(intent));
  },
  pulse(handle: string, intent: Record<string, unknown>) {
    moduleSdk.sendCapabilityIntent("haptics", handle, "pulse", encodeHapticIntent(intent));
  },
};

export const publicSampleCapabilities = {
  sampleSource: {
    create(moduleInstanceId: string, slot = "primary") {
      return createCapabilityHandle("sample-source", moduleInstanceId, slot);
    },
    loadFile(handle: string, request: SampleSourceLoadFileInput) {
      sampleCapabilities.loadFile(handle, request);
    },
  },
  sampleAnalysis: {
    create(moduleInstanceId: string, slot = "primary") {
      return createCapabilityHandle("sample-analysis", moduleInstanceId, slot);
    },
    requestWaveform(handle: string, windowSize: number, options: Record<string, unknown> = {}) {
      sampleCapabilities.requestAnalysis(handle, {
        ...options,
        includeTransientSlices: false,
        waveformWindowSize: windowSize,
      });
    },
    requestTransientSlices(handle: string, windowSize: number, options: Record<string, unknown> = {}) {
      sampleCapabilities.requestAnalysis(handle, {
        ...options,
        includeTransientSlices: true,
        waveformWindowSize: windowSize,
      });
    },
    openEditorFrameStream(handle: string, listener: (frame: SampleEditorFrame) => void) {
      return sampleCapabilities.openEditorFrameStream(handle, listener);
    },
  },
  slicePlayback: {
    create(moduleInstanceId: string, slot = "primary") {
      return createCapabilityHandle("slice-playback", moduleInstanceId, slot);
    },
    applyState(handle: string, state: Record<string, unknown>) {
      sampleCapabilities.applySlicePlaybackState(handle, state);
    },
    triggerPad(handle: string, padIndex: number, velocity = 1, pressed = true) {
      sampleCapabilities.triggerPad(handle, padIndex, velocity, pressed);
    },
    editSlice(handle: string, intent: Record<string, unknown>) {
      sampleCapabilities.editSlice(handle, intent);
    },
  },
  haptics: {
    create(moduleInstanceId: string, slot = "primary") {
      return createCapabilityHandle("haptics", moduleInstanceId, slot);
    },
    pulse(handle: string, intent: Record<string, unknown>) {
      sampleCapabilities.pulse(handle, intent);
    },
  },
};
