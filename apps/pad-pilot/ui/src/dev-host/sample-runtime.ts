import { create } from "@bufbuild/protobuf";
import { buildRecutAutoSlice, detectRecutTransientCandidates } from "../modules/recut/auto-slice";
import { createDefaultRecutModuleState } from "../modules/recut/recut-state";
import { createEmptySampleEditorFrame } from "../padpilot/sample-capabilities";
import { base64ToBytes } from "../proto/base64";
import {
  SampleAnalysisMode,
  SampleBpmSource,
  SamplePadAssignmentSchema,
  SampleSliceMarkerSchema,
} from "../proto/generated/capability-pb";
import {
  PadAssignmentSchema,
  RecutAnalysisMode,
  RecutBpmSource,
  SliceMarkerSchema,
} from "../proto/generated/recut-pb";
import { clamp } from "../utils/math";
import { buildBpmMarkers, buildPadAssignments, createRecutWaveformPeaks, inferBpm } from "./recut-simulator";
import type { DevSignalSettings } from "./types";
import { getDevImportedFile, loadSettings, type RecutPlaybackVoice } from "./runtime-helpers";

export function createDevHostSampleRuntime(callbacks: DevHostPublishCallbacks) {
  const recutState = createDefaultRecutModuleState();
  const sampleEditorFrame = createEmptySampleEditorFrame();
  const recutAudioBuffer = ((): AudioBuffer | null => (null))();
  const recutAudioContext = ((): AudioContext | null => (null))();
  const recutAudioLoadGeneration = 0;
  const recutMonoSamples = new Float32Array();
  const recutHeldPads = new Set<number>();
  const recutVoices = new Map<number, RecutPlaybackVoice>();
  const settings = loadSettings();
  const runtimeState = { completedAnalysisRequestId: 0n, recutState, sampleEditorFrame, recutAudioBuffer, recutAudioContext, recutAudioLoadGeneration, recutMonoSamples, recutHeldPads, recutVoices, settings };
  function bumpRecutRevision() {
    runtimeState.recutState.revision += 1n;
  }
  function getRecutAudioContext() {
    if (typeof window === "undefined") return null;
    const AudioContextCtor = window.AudioContext
      ?? window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    runtimeState.recutAudioContext ??= new AudioContextCtor();
    return runtimeState.recutAudioContext;
  }
  function stopRecutVoice(padIndex: number) {
    const voice = runtimeState.recutVoices.get(padIndex);
    if (!voice) return;
    const context = getRecutAudioContext();
    const now = context?.currentTime ?? 0;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + 0.008);
    voice.source.stop(now + 0.01);
    runtimeState.recutVoices.delete(padIndex);
  }
  function syncRecutPlayingState() {
    const heldPadIndices = [...runtimeState.recutHeldPads.keys()].sort((left, right) => left - right);
    const playingPadIndices = (runtimeState.recutVoices.size > 0 ? [...runtimeState.recutVoices.keys()] : heldPadIndices)
      .sort((left, right) => left - right);
    runtimeState.sampleEditorFrame = {
      ...runtimeState.sampleEditorFrame,
      heldPadIndices,
      playingPadIndices,
      sequence: runtimeState.recutState.revision,
    };
  }
  function getRecutMarkerForPad(padIndex: number) {
    const assignment = runtimeState.recutState.padAssignments.find((entry) => entry.padIndex === padIndex) ?? null;
    const marker = assignment?.isEmpty
      ? null
      : assignment
        ? runtimeState.recutState.sliceMarkers[assignment.sliceIndex]
        : runtimeState.recutState.sliceMarkers[padIndex];
    return { assignment, marker: marker ?? null };
  }
  function triggerRecutPad(padIndex: number, pressed: boolean) {
    if (!pressed) {
      runtimeState.recutHeldPads.delete(padIndex);
      stopRecutVoice(padIndex);
      syncRecutPlayingState();
      return;
    }

    runtimeState.recutHeldPads.add(padIndex);
    const audioBuffer = runtimeState.recutAudioBuffer;
    const audioContext = getRecutAudioContext();
    const { assignment, marker } = getRecutMarkerForPad(padIndex);
    if (!audioBuffer || !audioContext || !marker) {
      runtimeState.sampleEditorFrame = {
        ...runtimeState.sampleEditorFrame,
        armedPadIndex: padIndex,
        lastSnapExact: true,
        sequence: runtimeState.recutState.revision,
      };
      syncRecutPlayingState();
      return;
    }

    stopRecutVoice(padIndex);
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    const gain = audioContext.createGain();
    gain.gain.value = 1;
    source.connect(gain);
    gain.connect(audioContext.destination);
    const sampleRate = Math.max(1, runtimeState.recutState.sampleRate || audioBuffer.sampleRate);
    const offsetSeconds = marker.startFrame / sampleRate;
    const durationSeconds = Math.max(1 / sampleRate, (marker.endFrame - marker.startFrame) / sampleRate);
    source.start(0, offsetSeconds, durationSeconds);
    source.onended = () => {
      if (runtimeState.recutVoices.get(padIndex)?.source === source) {
        runtimeState.recutVoices.delete(padIndex);
        syncRecutPlayingState();
        callbacks.publishCapabilityFrame(true);
      }
    };
    runtimeState.recutVoices.set(padIndex, { gain, padIndex, source });
    runtimeState.sampleEditorFrame = {
      ...runtimeState.sampleEditorFrame,
      activeSliceIndex: assignment?.sliceIndex ?? marker.padIndex,
      armedPadIndex: padIndex,
      lastSnapExact: true,
      sequence: runtimeState.recutState.revision,
    };
    syncRecutPlayingState();
  }
  async function prepareRecutAudioBuffer(contentId: string, sourceName: string, loadGeneration: number) {
    const isCurrentLoad = () => loadGeneration === runtimeState.recutAudioLoadGeneration;
    const importedFile = getDevImportedFile(contentId);
    if (!importedFile) {
      if (!isCurrentLoad()) return false;
      runtimeState.recutAudioBuffer = null;
      runtimeState.recutMonoSamples = new Float32Array(96000)
        .map((_, index) => Math.sin((index / 48000) * Math.PI * 12) * 0.25);
      runtimeState.recutState.sampleRate = 48000;
      runtimeState.recutState.channelCount = 1;
      runtimeState.recutState.lengthFrames = BigInt(runtimeState.recutMonoSamples.length);
      return true;
    }

    const context = getRecutAudioContext();
    if (!context) {
      if (!isCurrentLoad()) return false;
      runtimeState.recutAudioBuffer = null;
      const rawBytes = base64ToBytes(importedFile.bytesBase64);
      runtimeState.recutMonoSamples = Float32Array.from(rawBytes, (value) => (value - 128) / 128);
      runtimeState.recutState.sampleRate = 48000;
      runtimeState.recutState.channelCount = 1;
      runtimeState.recutState.lengthFrames = BigInt(runtimeState.recutMonoSamples.length);
      runtimeState.recutState.sourceName = importedFile.name || sourceName;
      return true;
    }

    const bytes = base64ToBytes(importedFile.bytesBase64);
    const audioBytes = new Uint8Array(bytes.byteLength);
    audioBytes.set(bytes);
    const decoded = await context.decodeAudioData(audioBytes.slice().buffer);
    if (!isCurrentLoad()) return false;
    runtimeState.recutAudioBuffer = decoded;
    runtimeState.recutState.sampleRate = decoded.sampleRate;
    runtimeState.recutState.channelCount = decoded.numberOfChannels;
    runtimeState.recutState.lengthFrames = BigInt(decoded.length);
    runtimeState.recutState.sourceName = importedFile.name || sourceName;
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const channelData = decoded.getChannelData(channel);
      for (let index = 0; index < decoded.length; index += 1) {
        mono[index] += (channelData[index] ?? 0) / decoded.numberOfChannels;
      }
    }
    runtimeState.recutMonoSamples = mono;
    return true;
  }
  function refreshRecutAnalysis(request?: {
    analysisMode?: SampleAnalysisMode;
    density?: number;
    projectBpm?: number;
    requestedBpm?: number;
  }) {
    const projectBpm = clamp(request?.projectBpm ?? runtimeState.settings.tempo, 20, 320);
    const transientDetection = detectRecutTransientCandidates(
      runtimeState.recutMonoSamples,
      Math.max(1, runtimeState.recutState.sampleRate || 48000)
    );
    const candidateTransients = transientDetection.candidateFrames;
    const inferredBpm = inferBpm(
      candidateTransients,
      Math.max(1, runtimeState.recutState.sampleRate || 48000),
      projectBpm
    );
    const analysisMode = request?.analysisMode ?? runtimeState.recutState.analysisMode;
    const density = clamp(request?.density ?? runtimeState.recutState.density, 0, 1);
    const effectiveBpm = request?.requestedBpm && request.requestedBpm > 0
      ? request.requestedBpm
      : analysisMode === SampleAnalysisMode.BPM
        ? projectBpm
        : inferredBpm.value;

    runtimeState.recutState.analysisMode = analysisMode === SampleAnalysisMode.BPM
      ? RecutAnalysisMode.BPM
      : analysisMode === SampleAnalysisMode.CUSTOM
        ? RecutAnalysisMode.CUSTOM
        : RecutAnalysisMode.AUTO;
    runtimeState.recutState.density = density;
    runtimeState.recutState.projectBpmSnapshot = projectBpm;
    runtimeState.recutState.bpmConfidence = inferredBpm.confidence;
    runtimeState.recutState.bpmSuggestedConfidence = inferredBpm.suggestedConfidence;
    runtimeState.recutState.bpmSuggestedValue = inferredBpm.suggestedValue;
    runtimeState.recutState.bpmValue = effectiveBpm;
    runtimeState.recutState.bpmSource = request?.requestedBpm && request.requestedBpm > 0
      ? RecutBpmSource.USER
      : analysisMode === SampleAnalysisMode.BPM
        ? RecutBpmSource.PROJECT
        : inferredBpm.source;

    if (runtimeState.recutState.analysisMode !== RecutAnalysisMode.CUSTOM) {
      if (runtimeState.recutState.analysisMode === RecutAnalysisMode.BPM) {
        runtimeState.recutState.sliceMarkers = buildBpmMarkers(
          runtimeState.recutState.bpmValue || projectBpm,
          density,
          Number(runtimeState.recutState.lengthFrames || 0n) || runtimeState.recutMonoSamples.length,
          runtimeState.recutState.sampleRate || 48000,
          candidateTransients
        );
        runtimeState.recutState.padAssignments = buildPadAssignments(runtimeState.recutState.sliceMarkers.length);
      } else {
        const autoSlice = buildRecutAutoSlice(
          transientDetection.candidates,
          density,
          Number(runtimeState.recutState.lengthFrames || 0n) || runtimeState.recutMonoSamples.length
        );
        runtimeState.recutState.sliceMarkers = autoSlice.markers.map((marker) => create(SliceMarkerSchema, {
          chokeGroupId: 0,
          confidence: marker.confidence,
          endFrame: marker.endFrame,
          fadeMs: 8,
          padIndex: marker.padIndex,
          snapExact: true,
          startFrame: marker.startFrame,
          transientFrame: marker.transientFrame,
        }));
        runtimeState.recutState.padAssignments = autoSlice.padAssignments.map((assignment) => create(PadAssignmentSchema, {
          bank: assignment.bank,
          chokeGroupId: assignment.chokeGroupId,
          faceButton: assignment.faceButton,
          isEmpty: assignment.isEmpty,
          padIndex: assignment.padIndex,
          sliceIndex: assignment.sliceIndex,
        }));
      }
    }
    runtimeState.sampleEditorFrame = buildSampleEditorFrame(candidateTransients);
  }
  function buildSampleEditorFrame(candidateTransients = detectRecutTransientCandidates(
    runtimeState.recutMonoSamples,
    Math.max(1, runtimeState.recutState.sampleRate || 48000)
  ).candidateFrames) {
    const sliceMarkers = runtimeState.recutState.sliceMarkers;
    return {
      ...runtimeState.sampleEditorFrame,
      analysisMode: runtimeState.recutState.analysisMode === RecutAnalysisMode.BPM
        ? SampleAnalysisMode.BPM
        : runtimeState.recutState.analysisMode === RecutAnalysisMode.CUSTOM
          ? SampleAnalysisMode.CUSTOM
          : SampleAnalysisMode.AUTO,
      analysisRevision: runtimeState.recutState.manualEditRevision,
      completedAnalysisRequestId: runtimeState.completedAnalysisRequestId,
      analysisProgress: runtimeState.recutState.loaded ? 1 : 0.35,
      bpmConfidence: runtimeState.recutState.bpmConfidence,
      bpmSource: runtimeState.recutState.bpmSource === RecutBpmSource.METADATA
        ? SampleBpmSource.METADATA
        : runtimeState.recutState.bpmSource === RecutBpmSource.ANALYZED
          ? SampleBpmSource.ANALYZED
          : runtimeState.recutState.bpmSource === RecutBpmSource.PROJECT
            ? SampleBpmSource.PROJECT
            : runtimeState.recutState.bpmSource === RecutBpmSource.USER
              ? SampleBpmSource.USER
              : SampleBpmSource.NONE,
      bpmSuggestedConfidence: runtimeState.recutState.bpmSuggestedConfidence,
      bpmSuggestedValue: runtimeState.recutState.bpmSuggestedValue,
      bpmValue: runtimeState.recutState.bpmValue,
      candidateTransients,
      density: runtimeState.recutState.density,
      heldPadIndices: [...runtimeState.recutHeldPads.keys()],
      loaded: runtimeState.recutState.loaded,
      padAssignments: runtimeState.recutState.padAssignments.map((assignment) => create(SamplePadAssignmentSchema, {
        bank: assignment.bank,
        chokeGroupId: assignment.chokeGroupId,
        faceButton: assignment.faceButton,
        isEmpty: assignment.isEmpty,
        padIndex: assignment.padIndex,
        sliceIndex: assignment.sliceIndex,
      })),
      playingPadIndices: runtimeState.recutVoices.size > 0 ? [...runtimeState.recutVoices.keys()] : [...runtimeState.recutHeldPads.keys()],
      sequence: runtimeState.recutState.revision,
      projectBpm: runtimeState.settings.tempo,
      sliceMarkers: sliceMarkers.map((marker) => create(SampleSliceMarkerSchema, {
        chokeGroupId: marker.chokeGroupId,
        confidence: marker.confidence,
        endFrame: marker.endFrame,
        fadeMs: marker.fadeMs,
        padIndex: marker.padIndex,
        snapExact: marker.snapExact,
        startFrame: marker.startFrame,
        transientFrame: marker.transientFrame,
      })),
      waveformPeaks: runtimeState.recutMonoSamples.length > 0
        ? createRecutWaveformPeaks(runtimeState.recutMonoSamples, 128)
        : Array.from({ length: 128 }, (_, index) => Math.abs(Math.sin((index / 127) * Math.PI))),
    };
  }
  return Object.assign(runtimeState, { bumpRecutRevision, getRecutAudioContext, stopRecutVoice, syncRecutPlayingState, getRecutMarkerForPad, triggerRecutPad, prepareRecutAudioBuffer, refreshRecutAnalysis, buildSampleEditorFrame });
}

export type DevHostPublishCallbacks = { publishActiveModuleState: () => void; publishCapabilityFrame: (force?: boolean) => void; publishDebugState: () => void; publishNavigationState: () => void; updateSettings: (next: Partial<DevSignalSettings>) => void; };

declare global { interface Window { webkitAudioContext?: typeof AudioContext; } }
