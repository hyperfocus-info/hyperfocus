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

export abstract class DevHostSampleRuntime {
  protected recutState = createDefaultRecutModuleState();
  protected sampleEditorFrame = createEmptySampleEditorFrame();
  protected recutAudioBuffer: AudioBuffer | null = null;
  protected recutAudioContext: AudioContext | null = null;
  protected recutAudioLoadGeneration = 0;
  protected recutMonoSamples = new Float32Array();
  protected readonly recutHeldPads = new Set<number>();
  protected readonly recutVoices = new Map<number, RecutPlaybackVoice>();
  protected settings = loadSettings();

  protected bumpRecutRevision() {
    this.recutState.revision += 1n;
  }

  protected getRecutAudioContext() {
    if (typeof window === "undefined") return null;
    const AudioContextCtor = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    this.recutAudioContext ??= new AudioContextCtor();
    return this.recutAudioContext;
  }

  protected stopRecutVoice(padIndex: number) {
    const voice = this.recutVoices.get(padIndex);
    if (!voice) return;
    const context = this.getRecutAudioContext();
    const now = context?.currentTime ?? 0;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + 0.008);
    voice.source.stop(now + 0.01);
    this.recutVoices.delete(padIndex);
  }

  protected syncRecutPlayingState() {
    const heldPadIndices = [...this.recutHeldPads.keys()].sort((left, right) => left - right);
    const playingPadIndices = (this.recutVoices.size > 0 ? [...this.recutVoices.keys()] : heldPadIndices)
      .sort((left, right) => left - right);
    this.sampleEditorFrame = {
      ...this.sampleEditorFrame,
      heldPadIndices,
      playingPadIndices,
      sequence: this.recutState.revision,
    };
  }

  protected getRecutMarkerForPad(padIndex: number) {
    const assignment = this.recutState.padAssignments.find((entry) => entry.padIndex === padIndex) ?? null;
    const marker = assignment?.isEmpty
      ? null
      : assignment
        ? this.recutState.sliceMarkers[assignment.sliceIndex]
        : this.recutState.sliceMarkers[padIndex];
    return { assignment, marker: marker ?? null };
  }

  protected triggerRecutPad(padIndex: number, pressed: boolean) {
    if (!pressed) {
      this.recutHeldPads.delete(padIndex);
      this.stopRecutVoice(padIndex);
      this.syncRecutPlayingState();
      return;
    }

    this.recutHeldPads.add(padIndex);
    const audioBuffer = this.recutAudioBuffer;
    const audioContext = this.getRecutAudioContext();
    const { assignment, marker } = this.getRecutMarkerForPad(padIndex);
    if (!audioBuffer || !audioContext || !marker) {
      this.sampleEditorFrame = {
        ...this.sampleEditorFrame,
        armedPadIndex: padIndex,
        lastSnapExact: true,
        sequence: this.recutState.revision,
      };
      this.syncRecutPlayingState();
      return;
    }

    this.stopRecutVoice(padIndex);
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    const gain = audioContext.createGain();
    gain.gain.value = 1;
    source.connect(gain);
    gain.connect(audioContext.destination);
    const sampleRate = Math.max(1, this.recutState.sampleRate || audioBuffer.sampleRate);
    const offsetSeconds = marker.startFrame / sampleRate;
    const durationSeconds = Math.max(1 / sampleRate, (marker.endFrame - marker.startFrame) / sampleRate);
    source.start(0, offsetSeconds, durationSeconds);
    source.onended = () => {
      if (this.recutVoices.get(padIndex)?.source === source) {
        this.recutVoices.delete(padIndex);
        this.syncRecutPlayingState();
        this.publishCapabilityFrame(true);
      }
    };
    this.recutVoices.set(padIndex, { gain, padIndex, source });
    this.sampleEditorFrame = {
      ...this.sampleEditorFrame,
      activeSliceIndex: assignment?.sliceIndex ?? marker.padIndex,
      armedPadIndex: padIndex,
      lastSnapExact: true,
      sequence: this.recutState.revision,
    };
    this.syncRecutPlayingState();
  }

  protected async prepareRecutAudioBuffer(contentId: string, sourceName: string, loadGeneration: number) {
    const isCurrentLoad = () => loadGeneration === this.recutAudioLoadGeneration;
    const importedFile = getDevImportedFile(contentId);
    if (!importedFile) {
      if (!isCurrentLoad()) return false;
      this.recutAudioBuffer = null;
      this.recutMonoSamples = new Float32Array(48000 * 2)
        .map((_, index) => Math.sin((index / 48000) * Math.PI * 12) * 0.25);
      this.recutState.sampleRate = 48000;
      this.recutState.channelCount = 1;
      this.recutState.lengthFrames = BigInt(this.recutMonoSamples.length);
      return true;
    }

    const context = this.getRecutAudioContext();
    if (!context) {
      if (!isCurrentLoad()) return false;
      this.recutAudioBuffer = null;
      const rawBytes = base64ToBytes(importedFile.bytesBase64);
      this.recutMonoSamples = Float32Array.from(rawBytes, (value) => (value - 128) / 128);
      this.recutState.sampleRate = 48000;
      this.recutState.channelCount = 1;
      this.recutState.lengthFrames = BigInt(this.recutMonoSamples.length);
      this.recutState.sourceName = importedFile.name || sourceName;
      return true;
    }

    const bytes = base64ToBytes(importedFile.bytesBase64);
    const audioBytes = new Uint8Array(bytes.byteLength);
    audioBytes.set(bytes);
    const decoded = await context.decodeAudioData(audioBytes.buffer as ArrayBuffer);
    if (!isCurrentLoad()) return false;
    this.recutAudioBuffer = decoded;
    this.recutState.sampleRate = decoded.sampleRate;
    this.recutState.channelCount = decoded.numberOfChannels;
    this.recutState.lengthFrames = BigInt(decoded.length);
    this.recutState.sourceName = importedFile.name || sourceName;
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const channelData = decoded.getChannelData(channel);
      for (let index = 0; index < decoded.length; index += 1) {
        mono[index] += (channelData[index] ?? 0) / decoded.numberOfChannels;
      }
    }
    this.recutMonoSamples = mono;
    return true;
  }

  protected refreshRecutAnalysis(request?: {
    analysisMode?: SampleAnalysisMode;
    density?: number;
    projectBpm?: number;
    requestedBpm?: number;
  }) {
    const projectBpm = clamp(request?.projectBpm ?? this.settings.tempo, 20, 320);
    const transientDetection = detectRecutTransientCandidates(
      this.recutMonoSamples,
      Math.max(1, this.recutState.sampleRate || 48000)
    );
    const candidateTransients = transientDetection.candidateFrames;
    const inferredBpm = inferBpm(
      candidateTransients,
      Math.max(1, this.recutState.sampleRate || 48000),
      projectBpm
    );
    const analysisMode = request?.analysisMode ?? this.recutState.analysisMode;
    const density = clamp(request?.density ?? this.recutState.density, 0, 1);
    const effectiveBpm = request?.requestedBpm && request.requestedBpm > 0
      ? request.requestedBpm
      : analysisMode === SampleAnalysisMode.BPM
        ? projectBpm
        : inferredBpm.value;

    this.recutState.analysisMode = analysisMode === SampleAnalysisMode.BPM
      ? RecutAnalysisMode.BPM
      : analysisMode === SampleAnalysisMode.CUSTOM
        ? RecutAnalysisMode.CUSTOM
        : RecutAnalysisMode.AUTO;
    this.recutState.density = density;
    this.recutState.projectBpmSnapshot = projectBpm;
    this.recutState.bpmConfidence = inferredBpm.confidence;
    this.recutState.bpmSuggestedConfidence = inferredBpm.suggestedConfidence;
    this.recutState.bpmSuggestedValue = inferredBpm.suggestedValue;
    this.recutState.bpmValue = effectiveBpm;
    this.recutState.bpmSource = request?.requestedBpm && request.requestedBpm > 0
      ? RecutBpmSource.USER
      : analysisMode === SampleAnalysisMode.BPM
        ? RecutBpmSource.PROJECT
        : inferredBpm.source;

    if (this.recutState.analysisMode !== RecutAnalysisMode.CUSTOM) {
      if (this.recutState.analysisMode === RecutAnalysisMode.BPM) {
        this.recutState.sliceMarkers = buildBpmMarkers(
          this.recutState.bpmValue || projectBpm,
          density,
          Number(this.recutState.lengthFrames || 0n) || this.recutMonoSamples.length,
          this.recutState.sampleRate || 48000,
          candidateTransients
        );
        this.recutState.padAssignments = buildPadAssignments(this.recutState.sliceMarkers.length);
      } else {
        const autoSlice = buildRecutAutoSlice(
          transientDetection.candidates,
          density,
          Number(this.recutState.lengthFrames || 0n) || this.recutMonoSamples.length
        );
        this.recutState.sliceMarkers = autoSlice.markers.map((marker) => create(SliceMarkerSchema, {
          chokeGroupId: 0,
          confidence: marker.confidence,
          endFrame: marker.endFrame,
          fadeMs: 8,
          padIndex: marker.padIndex,
          snapExact: true,
          startFrame: marker.startFrame,
          transientFrame: marker.transientFrame,
        }));
        this.recutState.padAssignments = autoSlice.padAssignments.map((assignment) => create(PadAssignmentSchema, {
          bank: assignment.bank,
          chokeGroupId: assignment.chokeGroupId,
          faceButton: assignment.faceButton,
          isEmpty: assignment.isEmpty,
          padIndex: assignment.padIndex,
          sliceIndex: assignment.sliceIndex,
        }));
      }
    }
    this.sampleEditorFrame = this.buildSampleEditorFrame(candidateTransients);
  }

  protected buildSampleEditorFrame(candidateTransients = detectRecutTransientCandidates(
    this.recutMonoSamples,
    Math.max(1, this.recutState.sampleRate || 48000)
  ).candidateFrames) {
    const sliceMarkers = this.recutState.sliceMarkers;
    return {
      ...this.sampleEditorFrame,
      analysisMode: this.recutState.analysisMode === RecutAnalysisMode.BPM
        ? SampleAnalysisMode.BPM
        : this.recutState.analysisMode === RecutAnalysisMode.CUSTOM
          ? SampleAnalysisMode.CUSTOM
          : SampleAnalysisMode.AUTO,
      analysisRevision: this.recutState.manualEditRevision,
      analysisProgress: this.recutState.loaded ? 1 : 0.35,
      bpmConfidence: this.recutState.bpmConfidence,
      bpmSource: this.recutState.bpmSource === RecutBpmSource.METADATA
        ? SampleBpmSource.METADATA
        : this.recutState.bpmSource === RecutBpmSource.ANALYZED
          ? SampleBpmSource.ANALYZED
          : this.recutState.bpmSource === RecutBpmSource.PROJECT
            ? SampleBpmSource.PROJECT
            : this.recutState.bpmSource === RecutBpmSource.USER
              ? SampleBpmSource.USER
              : SampleBpmSource.NONE,
      bpmSuggestedConfidence: this.recutState.bpmSuggestedConfidence,
      bpmSuggestedValue: this.recutState.bpmSuggestedValue,
      bpmValue: this.recutState.bpmValue,
      candidateTransients,
      density: this.recutState.density,
      heldPadIndices: [...this.recutHeldPads.keys()],
      loaded: this.recutState.loaded,
      padAssignments: this.recutState.padAssignments.map((assignment) => create(SamplePadAssignmentSchema, {
        bank: assignment.bank,
        chokeGroupId: assignment.chokeGroupId,
        faceButton: assignment.faceButton,
        isEmpty: assignment.isEmpty,
        padIndex: assignment.padIndex,
        sliceIndex: assignment.sliceIndex,
      })),
      playingPadIndices: this.recutVoices.size > 0 ? [...this.recutVoices.keys()] : [...this.recutHeldPads.keys()],
      sequence: this.recutState.revision,
      projectBpm: this.settings.tempo,
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
      waveformPeaks: this.recutMonoSamples.length > 0
        ? createRecutWaveformPeaks(this.recutMonoSamples, 128)
        : Array.from({ length: 128 }, (_, index) => Math.abs(Math.sin((index / 127) * Math.PI))),
    };
  }

  protected abstract publishActiveModuleState(): void;
  protected abstract publishCapabilityFrame(force?: boolean): void;
  protected abstract publishDebugState(): void;
  protected abstract publishNavigationState(): void;
  abstract updateSettings(next: Partial<DevSignalSettings>): void;
}
