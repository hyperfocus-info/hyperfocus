import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { base64ToBytes, bytesToBase64 } from "../proto/base64";
import { PresetSaveRequestSchema, SetControllerConfigRequestSchema } from "../proto/generated/bridge-pb";
import { SampleAnalysisMode, SampleBpmSource, CapabilityFrameEnvelopeSchema, SampleEditorFrameSchema, SamplePadAssignmentSchema, SampleAnalysisRequestSchema, SampleSourceLoadRequestSchema, SampleSliceMarkerSchema, SlicePlaybackStateSchema, SlicePlaybackTriggerSchema } from "../proto/generated/capability-pb";
import { FxChainStateSchema } from "../proto/generated/fx-chain-pb";
import { ChokeGroupSchema, PadAssignmentSchema, RecutAnalysisMode, RecutBpmSource, SliceMarkerSchema } from "../proto/generated/recut-pb";
import { createDefaultFxChainState, decodeFxChainStateBase64, encodeFxChainStateBase64 } from "../modules/fx/fx-chain-state";
import { createDefaultAnalyzerModuleState, createEmptyAnalyzerFrame, encodeAnalyzerFrameBase64, encodeAnalyzerModuleStateBase64, summarizeAnalyzerTake } from "../modules/analyzer/analyzer-state";
import { createDefaultRecutModuleState, decodeRecutModuleStateBase64, encodeRecutModuleStateBase64 } from "../modules/recut/recut-state";
import { buildRecutAutoSlice, detectRecutTransientCandidates } from "../modules/recut/auto-slice";
import { PadPilotInputDeviceState } from "../padpilot/io/input-device";
import { controllerBindingKindFromProto, controllerLayoutKindFromProto, createDefaultControllerConfig, normalizeControllerConfig } from "../padpilot/controller-config";
import { getPrimaryConfiguredInputDevice, remapInputDevices } from "../padpilot/controller-runtime";
import { createEmptySampleEditorFrame } from "../padpilot/sample-capabilities";
import { clamp } from "../utils/math";
import { fileNameFromPath } from "../utils/file-path";
import { parseCapabilityHandle } from "@hyperfocus/pad-pilot/module-identity";
import { HostIntent, HostState } from "../bridge";
import { browserGamepadsSupported, readBrowserGamepadDevices } from "./browser-gamepad-source";
import { createProceduralSignalFrame } from "./fx-simulator";
import { DevSignalSettings } from "./types";
import { buildBpmMarkers, buildPadAssignments, createRecutWaveformPeaks, inferBpm } from "./recut-simulator";
import { buildSyntheticVisualizerFrameBase64 } from "./visualizer-builders";
import { TICK_MS, ModuleSummary, PresetRecord, HostStateListener, DebugStateListener, RecutPlaybackVoice, DEFAULT_MODULES, loadSettings, saveSettings, cloneFxState, getDevImportedFile, createInstalledModuleResult, encodeCapabilityFrameEnvelopeBase64, ensureMasterState, createSeedAnalyzerNoteEvents, cloneInputDevice, createEmptyControllerState, filterAnalyzerNoteEventsForSensitivity, normalizeDevSignalSettings } from "./runtime-helpers";
import { z } from "zod";
import { isValidAutomationParameterId } from "@hyperfocus/pad-pilot/automation-identity";

const midiOutputPayloadSchema = z.object({
  channel: z.number().int().min(1).max(16),
  controller: z.number().int().min(0).max(127).optional(),
  note: z.number().int().min(0).max(127).optional(),
  sampleOffset: z.number().int().min(0).max(1_048_575).optional(),
  value: z.number().int().min(0).max(127).optional(),
  velocity: z.number().int().min(0).max(127).optional(),
});
const keyboardOutputPayloadSchema = z.array(z.string().trim().min(1).max(128)).min(1).max(64);
const automationUpdatePayloadSchema = z.object({
  normalizedValue: z.number().finite().min(0).max(1),
  parameterId: z.string(),
});

function parseJsonPayload<T>(payload: string, schema: z.ZodType<T>) {
  try {
    const parsed = schema.safeParse(JSON.parse(payload));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

class DevHostRuntimeImpl {
  private readonly editorViewStateJson = new Map<string, string>();
  private readonly debugListeners = new Set<DebugStateListener>();
  private readonly hostListeners = new Set<HostStateListener>();
  private readonly moduleStateJson = new Map<string, string>();
  private readonly presetsById = new Map<string, PresetRecord>();
  private readonly producerActionLog: Array<{ action: string; capability: string; moduleId: string; payload: unknown }> = [];
  private readonly heldMidiNotes = new Map<string, Set<string>>();
  private readonly activeAutomationTouches = new Map<string, Set<string>>();
  private acceptedRevision = 1n;
  private canonicalFxState = createDefaultFxChainState();
  private liveFxState = cloneFxState(this.canonicalFxState);
  private analyzerState = createDefaultAnalyzerModuleState();
  private analyzerFrame = createEmptyAnalyzerFrame();
  private recutState = createDefaultRecutModuleState();
  private sampleEditorFrame = createEmptySampleEditorFrame();
  private recutAudioBuffer: AudioBuffer | null = null;
  private recutAudioContext: AudioContext | null = null;
  private recutAudioLoadGeneration = 0;
  private recutMonoSamples = new Float32Array();
  private readonly recutHeldPads = new Set<number>();
  private readonly recutVoices = new Map<number, RecutPlaybackVoice>();
  private analyzerSourceNoteEvents = [] as ReturnType<typeof createSeedAnalyzerNoteEvents>;
  private analyzerStreamModuleId = "";
  private capabilityStreamHandle = "";
  private modules = [...DEFAULT_MODULES];
  private controllerConfig = createDefaultControllerConfig();
  private inputDevices: PadPilotInputDeviceState[] = [];
  private selectedModuleId = "fx";
  private selectedPresetId = "";
  private sequence = 0n;
  private settings = loadSettings();
  private tickHandle: number | null = null;
  private controllerFrameHandle: number | null = null;
  private browserInputFrameIndex = 0;
  private manualInputDevicesOverride: PadPilotInputDeviceState[] | null = null;
  private lastBrowserGamepadSupported = browserGamepadsSupported();
  private lastPublishedInputSignature = "";
  private lastPublishedCapabilityFramePayload = "";

  private isAuthorizedCapabilityHandle(capability: string, handle: string) {
    const parsed = parseCapabilityHandle(handle);
    if (!parsed.valid || parsed.capability !== capability || parsed.moduleInstanceId !== this.selectedModuleId) {
      return false;
    }
    const moduleItem = this.modules.find((candidate) => candidate.id === parsed.moduleInstanceId);
    return moduleItem?.loadStatus === "ready" && moduleItem.capabilities?.includes(capability) === true;
  }

  private releaseProducerActions(moduleId: string) {
    for (const key of this.heldMidiNotes.get(moduleId) ?? []) {
      const [channel, note] = key.split(":").map(Number);
      this.producerActionLog.push({
        action: "note-off",
        capability: "midi-output",
        moduleId,
        payload: { channel, note, velocity: 0 },
      });
    }
    this.heldMidiNotes.delete(moduleId);
    for (const parameterId of this.activeAutomationTouches.get(moduleId) ?? []) {
      this.producerActionLog.push({ action: "end-touch", capability: "automation", moduleId, payload: parameterId });
    }
    this.activeAutomationTouches.delete(moduleId);
  }

  private bumpRecutRevision() {
    this.recutState.revision += 1n;
  }

  private getRecutAudioContext() {
    if (typeof window === "undefined") {
      return null;
    }
    const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }
    this.recutAudioContext ??= new AudioContextCtor();
    return this.recutAudioContext;
  }

  private stopRecutVoice(padIndex: number) {
    const voice = this.recutVoices.get(padIndex);
    if (!voice) {
      return;
    }
    const context = this.getRecutAudioContext();
    const now = context?.currentTime ?? 0;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + 0.008);
    voice.source.stop(now + 0.01);
    this.recutVoices.delete(padIndex);
  }

  private syncRecutPlayingState() {
    const heldPadIndices = [...this.recutHeldPads.keys()].sort((left, right) => left - right);
    const playingPadIndices = (this.recutVoices.size > 0 ? [...this.recutVoices.keys()] : heldPadIndices).sort((left, right) => left - right);
    this.sampleEditorFrame = {
      ...this.sampleEditorFrame,
      heldPadIndices,
      playingPadIndices,
      sequence: this.recutState.revision,
    };
  }

  private getRecutMarkerForPad(padIndex: number) {
    const assignment = this.recutState.padAssignments.find((entry) => entry.padIndex === padIndex) ?? null;
    const marker = assignment?.isEmpty
      ? null
      : assignment
        ? this.recutState.sliceMarkers[assignment.sliceIndex]
        : this.recutState.sliceMarkers[padIndex];
    return {
      assignment,
      marker: marker ?? null,
    };
  }

  private triggerRecutPad(padIndex: number, pressed: boolean) {
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

  private async prepareRecutAudioBuffer(contentId: string, sourceName: string, loadGeneration: number) {
    const isCurrentLoad = () => loadGeneration === this.recutAudioLoadGeneration;
    const importedFile = getDevImportedFile(contentId);
    if (!importedFile) {
      if (!isCurrentLoad()) {
        return false;
      }
      this.recutAudioBuffer = null;
      this.recutMonoSamples = new Float32Array(48000 * 2).map((_, index) => Math.sin((index / 48000) * Math.PI * 12) * 0.25);
      this.recutState.sampleRate = 48000;
      this.recutState.channelCount = 1;
      this.recutState.lengthFrames = BigInt(this.recutMonoSamples.length);
      return true;
    }

    const context = this.getRecutAudioContext();
    if (!context) {
      if (!isCurrentLoad()) {
        return false;
      }
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
    if (!isCurrentLoad()) {
      return false;
    }
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

  private refreshRecutAnalysis(request?: {
    analysisMode?: SampleAnalysisMode;
    density?: number;
    projectBpm?: number;
    requestedBpm?: number;
  }) {
    const projectBpm = clamp(request?.projectBpm ?? this.settings.tempo, 20, 320);
    const transientDetection = detectRecutTransientCandidates(this.recutMonoSamples, Math.max(1, this.recutState.sampleRate || 48000));
    const candidateTransients = transientDetection.candidateFrames;
    const inferredBpm = inferBpm(candidateTransients, Math.max(1, this.recutState.sampleRate || 48000), projectBpm);
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
            candidateTransients,
          );
        this.recutState.padAssignments = buildPadAssignments(this.recutState.sliceMarkers.length);
      } else {
        const autoSlice = buildRecutAutoSlice(
          transientDetection.candidates,
          density,
          Number(this.recutState.lengthFrames || 0n) || this.recutMonoSamples.length,
        );
        this.recutState.sliceMarkers = autoSlice.markers.map((marker) =>
          create(SliceMarkerSchema, {
            chokeGroupId: 0,
            confidence: marker.confidence,
            endFrame: marker.endFrame,
            fadeMs: 8,
            padIndex: marker.padIndex,
            snapExact: true,
            startFrame: marker.startFrame,
            transientFrame: marker.transientFrame,
          }),
        );
        this.recutState.padAssignments = autoSlice.padAssignments.map((assignment) =>
          create(PadAssignmentSchema, {
            bank: assignment.bank,
            chokeGroupId: assignment.chokeGroupId,
            faceButton: assignment.faceButton,
            isEmpty: assignment.isEmpty,
            padIndex: assignment.padIndex,
            sliceIndex: assignment.sliceIndex,
          }),
        );
      }
    }

    this.sampleEditorFrame = this.buildSampleEditorFrame(candidateTransients);
  }

  constructor() {
    const defaultPreset = this.seedPreset("PadPilot Init", encodeFxChainStateBase64(this.canonicalFxState), "pad_pilot_init_default");
    this.selectedPresetId = defaultPreset.id;
  }

  subscribe(listener: HostStateListener) {
    this.hostListeners.add(listener);
    this.refreshLoopState();
    this.syncBrowserInputState();
    const state = this.buildHostState();
    this.lastPublishedInputSignature = JSON.stringify({
      controller: state.controller,
      inputDevices: state.inputDevices,
    });
    try {
      listener(state);
    } catch {
      // One host consumer cannot block runtime setup or other subscribers.
    }
    return () => {
      this.hostListeners.delete(listener);
      this.refreshLoopState();
    };
  }

  subscribeDebug(listener: DebugStateListener) {
    this.debugListeners.add(listener);
    this.refreshLoopState();
    this.syncBrowserInputState();
    try {
      listener(this.buildDebugState());
    } catch {
      // One diagnostics consumer cannot block runtime setup or other subscribers.
    }
    return () => {
      this.debugListeners.delete(listener);
      this.refreshLoopState();
    };
  }

  getDebugState() {
    return this.buildDebugState();
  }

  installModuleBundle(bundlePath: string) {
    const normalizedPath = bundlePath.trim().toLowerCase();
    const timestamp = Date.now();
    if (!normalizedPath) {
      throw new Error("Missing bundle archive path.");
    }
    if (normalizedPath.includes("missing-script") || normalizedPath.includes("install-error")) {
      throw new Error("Bundle is missing the script entry declared in padpilot-module.json.");
    }

    const moduleId = normalizedPath.includes("missing-ui")
      ? "dev-missing-ui"
      : normalizedPath.includes("incompatible")
        ? "dev-incompatible"
        : "dev-installed";
    const loadStatus = normalizedPath.includes("incompatible") ? "incompatible-host" : "ready";
    const version = normalizedPath.includes("v2") ? "2.0.0" : "1.0.0";
    const module: ModuleSummary = {
      id: moduleId,
      name: moduleId === "dev-installed"
        ? "Installed Module"
        : moduleId === "dev-missing-ui"
          ? "Broken UI Module"
          : "Incompatible Module",
      version,
      capabilities: moduleId === "dev-installed"
        ? ["module-state", "script-runtime"]
        : moduleId === "dev-missing-ui"
          ? ["module-state"]
          : ["module-state", "script-runtime"],
      loadStatus,
      loadErrorMessage: loadStatus === "incompatible-host"
        ? "Requires PadPilot host 9.9.9 or newer. Current host is 0.1.0-dev."
        : undefined,
      expectedModuleVersion: version,
      resolvedModuleVersion: version,
      scriptEntryPath: `C:/dev/${moduleId}/${version}/script/module.js`,
      uiEntryPath: moduleId === "dev-missing-ui"
        ? `/__padpilot/modules/${moduleId}/${version}/ui/missing-entry.js`
        : `builtin://starter/${moduleId}-${timestamp}`,
    };

    const existingIndex = this.modules.findIndex((moduleItem) => moduleItem.id === module.id);
    if (existingIndex >= 0) {
      this.modules = this.modules.map((moduleItem, index) => index === existingIndex ? module : moduleItem);
    } else {
      this.modules = [...this.modules, module];
    }
    this.selectedModuleId = module.id;
    this.publishNavigationState();
    this.publishActiveModuleState();
    this.publishCapabilityFrame(true);
    this.publishDebugState();
    return createInstalledModuleResult(module);
  }

  updateSettings(next: Partial<DevSignalSettings>) {
    this.settings = normalizeDevSignalSettings(next, this.settings);
    saveSettings(this.settings);
    this.refreshLoopState();
    this.publishDebugState();
    this.publishBootstrapState(true);
  }

  reset() {
    this.recutAudioLoadGeneration += 1;
    for (const padIndex of [...this.recutVoices.keys()]) {
      this.stopRecutVoice(padIndex);
    }
    this.recutHeldPads.clear();
    const recutAudioContext = this.recutAudioContext;
    this.recutAudioContext = null;
    recutAudioContext?.close().catch(() => {
      // Ignore teardown races in tests.
    });
    this.acceptedRevision = 1n;
    this.canonicalFxState = createDefaultFxChainState();
    this.liveFxState = cloneFxState(this.canonicalFxState);
    this.analyzerState = createDefaultAnalyzerModuleState();
    this.analyzerFrame = createEmptyAnalyzerFrame();
    this.recutState = createDefaultRecutModuleState();
    this.sampleEditorFrame = createEmptySampleEditorFrame();
    this.analyzerSourceNoteEvents = [];
    this.analyzerStreamModuleId = "";
    this.capabilityStreamHandle = "";
    this.editorViewStateJson.clear();
    this.moduleStateJson.clear();
    this.producerActionLog.length = 0;
    this.heldMidiNotes.clear();
    this.activeAutomationTouches.clear();
    this.modules = [...DEFAULT_MODULES];
    this.controllerConfig = createDefaultControllerConfig();
    this.inputDevices = [];
    this.manualInputDevicesOverride = null;
    this.browserInputFrameIndex = 0;
    this.lastBrowserGamepadSupported = browserGamepadsSupported();
    this.selectedModuleId = "fx";
    this.sequence = 0n;
    this.recutAudioBuffer = null;
    this.recutMonoSamples = new Float32Array();
    this.presetsById.clear();
    this.stopControllerLoop();
    this.stopSignalLoop();
    const preset = this.seedPreset("PadPilot Init", encodeFxChainStateBase64(this.canonicalFxState), "pad_pilot_init_default");
    this.selectedPresetId = preset.id;
    this.resetPublishedRealtimeState();
    this.refreshLoopState();
    this.syncBrowserInputState(true);
    this.publishBootstrapState(true);
    this.publishDebugState();
  }

  setInputDevices(inputDevices: Array<Partial<PadPilotInputDeviceState> & Pick<PadPilotInputDeviceState, "connected" | "deviceId" | "deviceKind" | "displayName" | "frameIndex" | "axes" | "buttons">>) {
    this.manualInputDevicesOverride = inputDevices.map((device) => ({
      axes: [...device.axes],
      buttons: [...device.buttons],
      connected: device.connected,
      deviceId: device.deviceId,
      runtimeDeviceId: device.runtimeDeviceId ?? device.deviceId,
      hardwareId: device.hardwareId ?? device.deviceId,
      deviceKind: device.deviceKind,
      displayName: device.displayName,
      frameIndex: device.frameIndex,
      rawAxes: [...(device.rawAxes ?? device.axes)],
      rawButtons: [...(device.rawButtons ?? device.buttons)],
      detectedLayoutKind: device.detectedLayoutKind ?? "auto",
      activeLayoutKind: device.activeLayoutKind ?? "auto",
    }));
    this.inputDevices = this.manualInputDevicesOverride.map(cloneInputDevice);
    this.publishInputState(true);
    this.publishDebugState();
  }

  getProducerActionLog() {
    return this.producerActionLog.map((entry) => ({ ...entry }));
  }

  sendIntent(intent: HostIntent) {
    switch (intent.type) {
      case "ready":
        this.resetPublishedRealtimeState();
        this.publishBootstrapState(true);
        return;
      case "selectModule":
        {
          const nextModuleId = intent.moduleId === "reverb" ? "fx" : intent.moduleId;
          if (nextModuleId !== this.selectedModuleId) this.releaseProducerActions(this.selectedModuleId);
          this.selectedModuleId = nextModuleId;
        }
        if (
          this.capabilityStreamHandle &&
          parseCapabilityHandle(this.capabilityStreamHandle).moduleInstanceId !== this.selectedModuleId
        ) {
          this.capabilityStreamHandle = "";
        }
        if (this.analyzerStreamModuleId && this.analyzerStreamModuleId !== this.selectedModuleId) {
          this.analyzerStreamModuleId = "";
          if (this.analyzerState.recordEnabled) {
            this.analyzerState.recordEnabled = false;
            this.analyzerState.revision += 1n;
            this.analyzerFrame.recording = false;
            this.analyzerFrame.currentLevel = 0;
          }
        }
        this.publishNavigationState();
        this.publishActiveModuleState();
        this.publishCapabilityFrame(true);
        this.publishDebugState();
        return;
      case "createModule": {
        const baseId = intent.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "module";
        let candidate = baseId;
        let suffix = 2;
        while (this.modules.some((moduleItem) => moduleItem.id === candidate)) {
          candidate = `${baseId}-${suffix}`;
          suffix += 1;
        }
        this.modules = [...this.modules, {
          id: candidate,
          name: intent.name.trim() || "Module",
          version: "0.1.0",
          capabilities: ["module-state", "script-runtime"],
          loadStatus: "ready",
          uiEntryPath: `builtin://starter/${candidate}`,
        }];
        this.selectedModuleId = candidate;
        this.publishNavigationState();
        this.publishActiveModuleState();
        this.publishCapabilityFrame(true);
        this.publishDebugState();
        return;
      }
      case "setModuleState":
        this.moduleStateJson.set(intent.moduleId, intent.payload);
        if ((intent.moduleId === "reverb" ? "fx" : intent.moduleId) === this.selectedModuleId) {
          this.publishActiveModuleState();
        }
        return;
      case "setControllerConfig": {
        const request = fromBinary(SetControllerConfigRequestSchema, base64ToBytes(intent.payloadBase64));
        this.controllerConfig = normalizeControllerConfig({
          rows: request.controllerConfig?.rows.map((row) => ({
            stableId: row.stableId,
            hardwareId: row.hardwareId,
            layoutKind: controllerLayoutKindFromProto(row.layoutKind),
            customLayoutId: row.customLayoutId,
            isPrimary: row.isPrimary,
          })) ?? [],
          customLayouts: request.controllerConfig?.customLayouts.map((layout) => ({
            id: layout.id,
            name: layout.name,
            buttonBindings: layout.buttonBindings.map((binding) => ({
              bindingKind: controllerBindingKindFromProto(binding.bindingKind),
              sourceIndex: binding.sourceIndex,
              threshold: binding.threshold,
            })),
            axisBindings: layout.axisBindings.map((binding) => ({
              sourceIndex: binding.sourceIndex,
              inverted: binding.inverted,
            })),
          })) ?? [],
        });
        if (this.manualInputDevicesOverride) {
          this.inputDevices = remapInputDevices(this.manualInputDevicesOverride, this.controllerConfig);
        } else {
          this.syncBrowserInputState(true);
        }
        this.publishBootstrapState(true);
        this.publishInputState(true);
        this.publishDebugState();
        return;
      }
      case "setEditorViewState":
        this.editorViewStateJson.set(intent.scopeId, intent.payload);
        return;
      case "setModuleStateProto": {
        if (intent.moduleId === "fx" || intent.moduleId === "reverb") {
          this.canonicalFxState = decodeFxChainStateBase64(intent.payloadBase64);
          this.liveFxState = cloneFxState(this.canonicalFxState);
          this.acceptedRevision = BigInt(intent.revision);
        }
        if (intent.moduleId === "recut") {
          this.recutState = decodeRecutModuleStateBase64(intent.payloadBase64);
          this.sampleEditorFrame = this.buildSampleEditorFrame();
        }
        if ((intent.moduleId === "reverb" ? "fx" : intent.moduleId) === this.selectedModuleId) {
          this.publishActiveModuleState();
        }
        if (intent.moduleId === "recut") {
          this.publishCapabilityFrame(true);
        }
        this.publishDebugState();
        return;
      }
      case "selectPreset": {
        const preset = this.presetsById.get(intent.presetId);
        if (!preset) {
          return;
        }
        this.selectedPresetId = preset.id;
        if (preset.moduleId === "fx") {
          this.canonicalFxState = decodeFxChainStateBase64(preset.stateBase64);
          this.liveFxState = cloneFxState(this.canonicalFxState);
          this.acceptedRevision = this.canonicalFxState.revision;
        }
        this.publishNavigationState();
        this.publishActiveModuleState();
        this.publishDebugState();
        return;
      }
      case "openCapabilityStream":
        if (!this.isAuthorizedCapabilityHandle(intent.capability, intent.handle)) {
          return;
        }
        if (intent.capability === "sample-analysis") {
          this.capabilityStreamHandle = intent.handle;
          this.publishCapabilityFrame(true);
          return;
        }
        if (intent.capability === "analyzer-feed") {
          this.capabilityStreamHandle = intent.handle;
          this.analyzerStreamModuleId = parseCapabilityHandle(intent.handle).moduleInstanceId;
          this.publishCapabilityFrame(true);
          return;
        }
        if (intent.capability === "fx-visualizer") {
          this.capabilityStreamHandle = intent.handle;
          this.publishCapabilityFrame(true);
        }
        return;
      case "closeCapabilityStream":
        if (!this.isAuthorizedCapabilityHandle(intent.capability, intent.handle)) {
          return;
        }
        if (
          (intent.capability === "sample-analysis"
            || intent.capability === "analyzer-feed"
            || intent.capability === "fx-visualizer")
          && this.capabilityStreamHandle === intent.handle
        ) {
          this.capabilityStreamHandle = "";
          if (intent.capability === "analyzer-feed") {
            this.analyzerStreamModuleId = "";
          }
          this.publishCapabilityFrame(true);
        }
        return;
      case "sendCapabilityIntent":
        try {
          this.applyCapabilityIntent(intent);
        } catch {
          // Dev-host capability ingress mirrors native fail-closed behavior.
        }
        return;
      case "setDiagnosticsVisible":
        return;
    }
  }

  private seedPreset(name: string, stateBase64: string, forcedId?: string) {
    const id = forcedId ?? `preset-${Date.now()}-${this.presetsById.size + 1}`;
    const record: PresetRecord = {
      id,
      moduleId: "fx",
      name,
      stateBase64,
    };
    this.presetsById.set(id, record);
    return record;
  }

  private getActiveFxState() {
    return this.selectedModuleId === "fx" ? this.liveFxState : this.canonicalFxState;
  }

  private refreshAnalyzerTakeFromSource() {
    this.analyzerState.noteEvents = filterAnalyzerNoteEventsForSensitivity(
      this.analyzerSourceNoteEvents,
      this.analyzerState.detectionSensitivity,
    );
    this.analyzerState.takeSummary = summarizeAnalyzerTake(this.analyzerState.noteEvents, 36, this.settings.tempo);
    this.analyzerFrame = {
      ...this.analyzerFrame,
      recording: false,
      frameCount: this.analyzerState.takeSummary.frameCount,
      durationSeconds: this.analyzerState.takeSummary.durationSeconds,
      minMidiNote: this.analyzerState.takeSummary.minMidiNote,
      maxMidiNote: this.analyzerState.takeSummary.maxMidiNote,
      primaryMatch: this.analyzerState.takeSummary.topMatches[0],
      alternateMatches: this.analyzerState.takeSummary.topMatches.slice(1),
    };
  }

  private resetPublishedRealtimeState() {
    this.lastPublishedInputSignature = "";
    this.lastPublishedCapabilityFramePayload = "__unset__";
  }

  private buildHostState(visualizerFrameBase64?: string) {
    const presetRecords = Array.from(this.presetsById.values()).filter((preset) => preset.moduleId === this.selectedModuleId);
    const activeFxState = this.getActiveFxState();
    const activeModuleStateBase64 = this.selectedModuleId === "fx"
      ? encodeFxChainStateBase64(activeFxState)
      : this.selectedModuleId === "recut"
        ? encodeRecutModuleStateBase64(this.recutState)
        : this.selectedModuleId === "analyzer"
          ? encodeAnalyzerModuleStateBase64(this.analyzerState)
        : this.moduleStateJson.get(this.selectedModuleId) ?? "";
    const primaryController = getPrimaryConfiguredInputDevice(this.inputDevices, this.controllerConfig) ?? createEmptyControllerState();

    const moduleStates = Object.fromEntries(
      Array.from(this.moduleStateJson.entries()).map(([moduleId, payload]) => {
        try {
          return [moduleId, JSON.parse(payload)];
        } catch {
          return [moduleId, payload];
        }
      }),
    );
    const editorViewStates = Object.fromEntries(
      Array.from(this.editorViewStateJson.entries()).map(([scopeId, payload]) => {
        try {
          return [scopeId, JSON.parse(payload)];
        } catch {
          return [scopeId, payload];
        }
      }),
    );

    return {
      acceptedRevision: this.selectedModuleId === "fx"
        ? this.acceptedRevision
        : this.selectedModuleId === "recut"
          ? this.recutState.revision
          : this.selectedModuleId === "analyzer"
            ? this.analyzerState.revision
          : 0n,
      activeModuleId: this.selectedModuleId,
      activeModuleStateBase64,
      controller: {
        axes: [...primaryController.axes],
        buttons: [...primaryController.buttons],
        connected: primaryController.connected,
        frameIndex: primaryController.frameIndex,
      },
      controllerConfig: normalizeControllerConfig(this.controllerConfig),
      inputDevices: this.inputDevices.map((device) => ({
        axes: [...device.axes],
        buttons: [...device.buttons],
        connected: device.connected,
        deviceId: device.deviceId,
        runtimeDeviceId: device.runtimeDeviceId,
        hardwareId: device.hardwareId,
        deviceKind: device.deviceKind,
        displayName: device.displayName,
        frameIndex: device.frameIndex,
        rawAxes: [...device.rawAxes],
        rawButtons: [...device.rawButtons],
        detectedLayoutKind: device.detectedLayoutKind,
        activeLayoutKind: device.activeLayoutKind,
      })),
      editorViewStates,
      moduleStates,
      modules: this.modules.map((moduleItem) => ({ ...moduleItem })),
      presets: presetRecords.map((preset) => ({ id: preset.id, name: preset.name })),
      projectBpm: this.settings.tempo,
      selectedModuleId: this.selectedModuleId,
      selectedPresetId: this.selectedPresetId,
      type: "hostSyncProto",
      visualizerFrameBase64,
    };
  }

  private buildNavigationState(): HostState {
    const presetRecords = Array.from(this.presetsById.values()).filter((preset) => preset.moduleId === this.selectedModuleId);
    return {
      modules: this.modules.map((moduleItem) => ({ ...moduleItem })),
      presets: presetRecords.map((preset) => ({ id: preset.id, name: preset.name })),
      projectBpm: this.settings.tempo,
      selectedModuleId: this.selectedModuleId,
      selectedPresetId: this.selectedPresetId,
      type: "navigationFrameProto",
    };
  }

  private buildActiveModuleState(): HostState {
    const activeFxState = this.getActiveFxState();
    return {
      acceptedRevision: this.selectedModuleId === "fx"
        ? this.acceptedRevision
        : this.selectedModuleId === "recut"
          ? this.recutState.revision
          : this.selectedModuleId === "analyzer"
            ? this.analyzerState.revision
          : 0n,
      activeModuleId: this.selectedModuleId,
      activeModuleStateBase64: this.selectedModuleId === "fx"
        ? encodeFxChainStateBase64(activeFxState)
        : this.selectedModuleId === "recut"
          ? encodeRecutModuleStateBase64(this.recutState)
          : this.selectedModuleId === "analyzer"
            ? encodeAnalyzerModuleStateBase64(this.analyzerState)
          : this.moduleStateJson.get(this.selectedModuleId) ?? "",
      projectBpm: this.settings.tempo,
      type: "activeModuleStateFrameProto",
    };
  }

  private buildInputState(): HostState {
    const primaryController = getPrimaryConfiguredInputDevice(this.inputDevices, this.controllerConfig) ?? createEmptyControllerState();
    return {
      controller: {
        axes: [...primaryController.axes],
        buttons: [...primaryController.buttons],
        connected: primaryController.connected,
        frameIndex: primaryController.frameIndex,
      },
      controllerConfig: normalizeControllerConfig(this.controllerConfig),
      inputDevices: this.inputDevices.map((device) => ({
        axes: [...device.axes],
        buttons: [...device.buttons],
        connected: device.connected,
        deviceId: device.deviceId,
        runtimeDeviceId: device.runtimeDeviceId,
        hardwareId: device.hardwareId,
        deviceKind: device.deviceKind,
        displayName: device.displayName,
        frameIndex: device.frameIndex,
        rawAxes: [...device.rawAxes],
        rawButtons: [...device.rawButtons],
        detectedLayoutKind: device.detectedLayoutKind,
        activeLayoutKind: device.activeLayoutKind,
      })),
      type: "inputStateFrameProto",
    };
  }

  private buildDebugState() {
    return {
      acceptedRevision: this.acceptedRevision,
      browserGamepadSupported: this.lastBrowserGamepadSupported,
      connectedControllerCount: this.inputDevices.filter((device) => device.connected && device.deviceKind === "gamepad").length,
      continuousHostSync: this.settings.continuousHostSync,
      intensity: this.settings.intensity,
      profile: this.settings.profile,
      running: this.settings.running,
      selectedModuleId: this.selectedModuleId,
      selectedPresetId: this.selectedPresetId,
      sequence: this.sequence,
      stereoWidth: this.settings.stereoWidth,
      tempo: this.settings.tempo,
    };
  }

  private applyCapabilityIntent(intent: Extract<HostIntent, { type: "sendCapabilityIntent" }>) {
    if (!this.isAuthorizedCapabilityHandle(intent.capability, intent.handle)) {
      return;
    }
    const { moduleInstanceId } = parseCapabilityHandle(intent.handle);
    const readTextPayload = () => intent.payloadBase64.length > 0
      ? new TextDecoder().decode(base64ToBytes(intent.payloadBase64))
      : "";

    if (intent.capability === "analyzer-session") {
      const textPayload = readTextPayload();
      if (intent.action === "start-capture") {
        if (textPayload === "append" && this.analyzerState.noteEvents.length === 0) {
          this.analyzerState.recordEnabled = true;
        }
        if (textPayload !== "append") {
          this.analyzerState = createDefaultAnalyzerModuleState();
          this.analyzerSourceNoteEvents = [];
        }
        this.analyzerState.recordEnabled = true;
        this.analyzerFrame = createEmptyAnalyzerFrame();
        this.analyzerFrame.recording = true;
        this.analyzerFrame.tuningHz = this.analyzerState.tuningHz;
        this.analyzerFrame.detectionSensitivity = this.analyzerState.detectionSensitivity;
        this.analyzerState.revision += 1n;
        this.publishActiveModuleState();
        this.publishCapabilityFrame(true);
        return;
      }
      if (intent.action === "stop-capture") {
        this.analyzerState.recordEnabled = false;
        if (this.analyzerSourceNoteEvents.length === 0) {
          this.analyzerSourceNoteEvents = createSeedAnalyzerNoteEvents();
        }
        this.refreshAnalyzerTakeFromSource();
        this.analyzerState.revision += 1n;
        this.publishActiveModuleState();
        this.publishCapabilityFrame(true);
        return;
      }
      if (intent.action === "set-tuning-hz") {
        this.analyzerState.tuningHz = Number(textPayload);
        this.analyzerState.revision += 1n;
        this.analyzerFrame.tuningHz = this.analyzerState.tuningHz;
        this.publishActiveModuleState();
        this.publishCapabilityFrame(true);
        return;
      }
      if (intent.action === "set-detection-sensitivity") {
        this.analyzerState.detectionSensitivity = Number(textPayload);
        this.analyzerFrame.detectionSensitivity = this.analyzerState.detectionSensitivity;
        if (this.analyzerSourceNoteEvents.length > 0) {
          this.refreshAnalyzerTakeFromSource();
        }
        this.analyzerState.revision += 1n;
        this.publishActiveModuleState();
        this.publishCapabilityFrame(true);
        return;
      }
      if (intent.action === "correct-note") {
        const match = /^([1-9][0-9]{0,19}):([0-9]{1,3})$/.exec(textPayload);
        const eventId = match ? BigInt(match[1]!) : 0n;
        const midiNote = Number(match?.[2]);
        if (eventId === 0n || !Number.isInteger(midiNote) || midiNote < 0 || midiNote > 127) {
          return;
        }
        const sourceEvent = this.analyzerSourceNoteEvents.find((event) => event.eventId === eventId);
        const stateEvent = this.analyzerState.noteEvents.find((event) => event.eventId === eventId);
        if (!sourceEvent && !stateEvent) {
          return;
        }
        if (sourceEvent) {
          sourceEvent.midiNote = midiNote;
          this.refreshAnalyzerTakeFromSource();
        } else if (stateEvent) {
          stateEvent.midiNote = midiNote;
          this.analyzerState.takeSummary = summarizeAnalyzerTake(
            this.analyzerState.noteEvents,
            this.analyzerState.takeSummary?.frameCount ?? 0,
            this.settings.tempo,
          );
        }
        this.analyzerState.revision += 1n;
        this.publishActiveModuleState();
        this.publishCapabilityFrame(true);
        return;
      }
      if (intent.action === "reset-note-correction") {
        const eventId = /^[1-9][0-9]{0,19}$/.test(textPayload) ? BigInt(textPayload) : 0n;
        if (eventId === 0n) {
          return;
        }
        const sourceEvent = this.analyzerSourceNoteEvents.find((event) => event.eventId === eventId);
        const stateEvent = this.analyzerState.noteEvents.find((event) => event.eventId === eventId);
        if (!sourceEvent && !stateEvent) {
          return;
        }
        if (sourceEvent) {
          sourceEvent.midiNote = sourceEvent.detectedMidiNote;
          this.refreshAnalyzerTakeFromSource();
        } else if (stateEvent) {
          stateEvent.midiNote = stateEvent.detectedMidiNote;
          this.analyzerState.takeSummary = summarizeAnalyzerTake(
            this.analyzerState.noteEvents,
            this.analyzerState.takeSummary?.frameCount ?? 0,
            this.settings.tempo,
          );
        }
        this.analyzerState.revision += 1n;
        this.publishActiveModuleState();
        this.publishCapabilityFrame(true);
        return;
      }
    }

    if (intent.capability === "midi-export") {
      return;
    }

    if (intent.capability === "host-tempo" && intent.action === "set") {
      const bpm = Number(readTextPayload());
      if (Number.isFinite(bpm)) {
        this.updateSettings({ tempo: clamp(bpm, 20, 320) });
      }
      return;
    }

    if (intent.capability === "midi-output") {
      const payload = parseJsonPayload(readTextPayload(), midiOutputPayloadSchema);
      if (!payload || ((intent.action === "note-on" || intent.action === "note-off") && payload.note === undefined)) {
        return;
      }
      this.producerActionLog.push({ action: intent.action, capability: intent.capability, moduleId: moduleInstanceId, payload });
      const noteKey = `${payload.channel}:${payload.note}`;
      const heldNotes = this.heldMidiNotes.get(moduleInstanceId) ?? new Set<string>();
      if (intent.action === "note-on") {
        heldNotes.add(noteKey);
        this.heldMidiNotes.set(moduleInstanceId, heldNotes);
      } else if (intent.action === "note-off") {
        heldNotes.delete(noteKey);
        if (heldNotes.size === 0) this.heldMidiNotes.delete(moduleInstanceId);
      }
      return;
    }

    if (intent.capability === "keyboard-output") {
      const payload = parseJsonPayload(readTextPayload(), keyboardOutputPayloadSchema);
      if (!payload) {
        return;
      }
      this.producerActionLog.push({ action: intent.action, capability: intent.capability, moduleId: moduleInstanceId, payload });
      return;
    }

    if (intent.capability === "fx-graph") {
      if (intent.action === "set-preview-bypass") {
        return;
      }
      if (intent.action === "set-master-wet-dry") {
        const wetDry = Number(readTextPayload());
        if (!Number.isFinite(wetDry)) {
          return;
        }
        ensureMasterState(this.liveFxState).wetDry = clamp(wetDry, 0, 1);
        this.publishActiveModuleState();
        return;
      }
      if (intent.action === "apply-state") {
        this.canonicalFxState = fromBinary(FxChainStateSchema, base64ToBytes(intent.payloadBase64));
        this.liveFxState = cloneFxState(this.canonicalFxState);
        this.acceptedRevision = this.canonicalFxState.revision;
        this.publishActiveModuleState();
        this.publishDebugState();
        return;
      }
      if (intent.action === "create-preset" || intent.action === "save-preset") {
        const request = fromBinary(PresetSaveRequestSchema, base64ToBytes(intent.payloadBase64));
        const preset = request.preset;
        if (!preset) {
          return;
        }
        const stateBase64 = bytesToBase64(preset.state);
        const record = this.seedPreset(request.name || preset.name || "Preset", stateBase64, preset.id || undefined);
        this.selectedPresetId = record.id;
        this.canonicalFxState = fromBinary(FxChainStateSchema, preset.state);
        this.liveFxState = cloneFxState(this.canonicalFxState);
        this.acceptedRevision = this.canonicalFxState.revision;
        this.publishNavigationState();
        this.publishActiveModuleState();
        this.publishDebugState();
        return;
      }
    }

    if (intent.capability === "automation") {
      const parameterId = intent.action === "update-touch"
        ? parseJsonPayload(readTextPayload(), automationUpdatePayloadSchema)?.parameterId ?? ""
        : readTextPayload();
      if (!isValidAutomationParameterId(parameterId)) {
        return;
      }
      this.producerActionLog.push({ action: intent.action, capability: intent.capability, moduleId: moduleInstanceId, payload: parameterId });
      const touches = this.activeAutomationTouches.get(moduleInstanceId) ?? new Set<string>();
      if (intent.action === "begin-touch" && parameterId) {
        touches.add(parameterId);
        this.activeAutomationTouches.set(moduleInstanceId, touches);
      } else if (intent.action === "end-touch") {
        touches.delete(parameterId);
        if (touches.size === 0) this.activeAutomationTouches.delete(moduleInstanceId);
      }
      return;
    }

    if (moduleInstanceId && moduleInstanceId !== "recut") {
      return;
    }

    if (intent.capability === "sample-source" && intent.action === "load-file") {
      const payload = fromBinary(SampleSourceLoadRequestSchema, base64ToBytes(intent.payloadBase64));
      const loadGeneration = ++this.recutAudioLoadGeneration;
      for (const padIndex of [...this.recutVoices.keys()]) {
        this.stopRecutVoice(padIndex);
      }
      this.recutHeldPads.clear();
      this.recutAudioBuffer = null;
      this.recutMonoSamples = new Float32Array();
      this.recutState.sourceContentId = payload.sourceContentId;
      this.recutState.sourceName = payload.sourceName || fileNameFromPath(payload.sourcePath);
      this.recutState.sourcePath = payload.sourcePath;
      this.recutState.loaded = false;
      this.recutState.sampleRate = 0;
      this.recutState.channelCount = 0;
      this.recutState.lengthFrames = 0n;
      this.prepareRecutAudioBuffer(payload.sourceContentId, this.recutState.sourceName, loadGeneration).then((loaded) => {
        if (!loaded || loadGeneration !== this.recutAudioLoadGeneration) {
          return;
        }
        this.recutState.loaded = true;
        this.bumpRecutRevision();
        this.refreshRecutAnalysis();
        this.publishActiveModuleState();
        this.publishCapabilityFrame(true);
      }).catch((error) => {
        if (loadGeneration !== this.recutAudioLoadGeneration) {
          return;
        }
        console.error(`Dev host could not decode Recut sample "${this.recutState.sourceName}".`, error);
        this.recutState.loaded = false;
        this.recutAudioBuffer = null;
        this.recutMonoSamples = new Float32Array();
        this.bumpRecutRevision();
        this.refreshRecutAnalysis();
        this.publishActiveModuleState();
        this.publishCapabilityFrame(true);
      });
      return;
    }

    if (intent.capability === "sample-analysis" && intent.action === "request-analysis") {
      const payload = intent.payloadBase64.length > 0
        ? fromBinary(SampleAnalysisRequestSchema, base64ToBytes(intent.payloadBase64))
        : null;
      this.refreshRecutAnalysis(payload ? {
        analysisMode: payload.analysisMode,
        density: payload.density,
        projectBpm: payload.projectBpm,
        requestedBpm: payload.requestedBpm,
      } : undefined);
      this.bumpRecutRevision();
      this.publishActiveModuleState();
      this.publishCapabilityFrame(true);
      return;
    }

    if (intent.capability === "slice-playback" && intent.action === "apply-state") {
      const payload = fromBinary(SlicePlaybackStateSchema, base64ToBytes(intent.payloadBase64));
      this.recutState.pitchSemitones = payload.pitchSemitones;
      this.recutState.gainDb = payload.gainDb;
      this.recutState.stretchEnabled = payload.stretchEnabled;
      this.recutState.granularEnabled = payload.granularEnabled;
      this.recutState.grainSizeMs = payload.grainSizeMs;
      this.recutState.grainDensity = payload.grainDensity;
      this.recutState.analysisMode = payload.analysisMode === SampleAnalysisMode.BPM
        ? RecutAnalysisMode.BPM
        : payload.analysisMode === SampleAnalysisMode.CUSTOM
          ? RecutAnalysisMode.CUSTOM
          : RecutAnalysisMode.AUTO;
      this.recutState.density = payload.density;
      this.recutState.bpmValue = payload.bpmValue;
      this.recutState.bpmSource = payload.bpmSource === SampleBpmSource.METADATA
        ? RecutBpmSource.METADATA
        : payload.bpmSource === SampleBpmSource.ANALYZED
          ? RecutBpmSource.ANALYZED
          : payload.bpmSource === SampleBpmSource.PROJECT
            ? RecutBpmSource.PROJECT
            : payload.bpmSource === SampleBpmSource.USER
              ? RecutBpmSource.USER
              : RecutBpmSource.NONE;
      this.recutState.bpmConfidence = payload.bpmConfidence;
      this.recutState.bpmSuggestedValue = payload.bpmSuggestedValue;
      this.recutState.bpmSuggestedConfidence = payload.bpmSuggestedConfidence;
      this.recutState.manualEditRevision = payload.manualEditRevision;
      this.recutState.projectBpmSnapshot = payload.projectBpm;
      this.recutState.sliceMarkers = payload.sliceMarkers.map((marker) =>
        create(SliceMarkerSchema, {
          chokeGroupId: marker.chokeGroupId,
          confidence: marker.confidence,
          endFrame: marker.endFrame,
          fadeMs: marker.fadeMs,
          padIndex: marker.padIndex,
          snapExact: marker.snapExact,
          startFrame: marker.startFrame,
          transientFrame: marker.transientFrame,
        }),
      );
      this.recutState.padAssignments = payload.padAssignments.map((assignment) =>
        create(PadAssignmentSchema, {
          bank: assignment.bank,
          chokeGroupId: assignment.chokeGroupId,
          faceButton: assignment.faceButton,
          isEmpty: assignment.isEmpty,
          padIndex: assignment.padIndex,
          sliceIndex: assignment.sliceIndex,
        }),
      );
      this.recutState.chokeGroups = payload.chokeGroups.map((group) =>
        create(ChokeGroupSchema, {
          accentHue: group.accentHue,
          id: group.id,
          name: group.name,
        }),
      );
      this.bumpRecutRevision();
      this.sampleEditorFrame = this.buildSampleEditorFrame();
      this.publishActiveModuleState();
      this.publishCapabilityFrame(true);
      return;
    }

    if (intent.capability === "slice-playback" && intent.action === "trigger-pad") {
      const payload = fromBinary(SlicePlaybackTriggerSchema, base64ToBytes(intent.payloadBase64));
      this.triggerRecutPad(payload.padIndex, payload.pressed);
      this.publishCapabilityFrame(true);
      return;
    }

    if (intent.capability === "slice-playback" && intent.action === "edit-slice") {
      this.sampleEditorFrame = this.buildSampleEditorFrame();
      this.publishCapabilityFrame(true);
      return;
    }
  }

  private publishDebugState() {
    const state = this.buildDebugState();
    for (const listener of this.debugListeners) {
      try {
        listener(state);
      } catch {
        // Diagnostics listeners are isolated from the realtime simulator loop.
      }
    }
  }

  private publishHostState(state: HostState) {
    for (const listener of this.hostListeners) {
      try {
        listener(state);
      } catch {
        // Public Module listeners cannot block remaining host consumers.
      }
    }
  }

  private publishBootstrapState(includeVisualizer: boolean) {
    const visualizerFrameBase64 = includeVisualizer
      ? buildSyntheticVisualizerFrameBase64(this.liveFxState, createProceduralSignalFrame(performance.now(), this.settings), this.sequence)
      : undefined;
    const state = this.buildHostState(visualizerFrameBase64);
    this.lastPublishedInputSignature = JSON.stringify({
      controller: state.controller,
      inputDevices: state.inputDevices,
    });
    this.lastPublishedCapabilityFramePayload = "__unset__";
    this.publishHostState(state);
  }

  private publishNavigationState() {
    this.publishHostState(this.buildNavigationState());
  }

  private publishActiveModuleState() {
    this.publishHostState(this.buildActiveModuleState());
  }

  private publishInputState(force = false) {
    const state = this.buildInputState();
    const signature = JSON.stringify({
      controller: state.controller,
      inputDevices: state.inputDevices,
    });
    if (!force && signature === this.lastPublishedInputSignature) {
      return;
    }
    this.lastPublishedInputSignature = signature;
    this.publishHostState(state);
  }

  private buildSampleEditorFrame(candidateTransients = detectRecutTransientCandidates(this.recutMonoSamples, Math.max(1, this.recutState.sampleRate || 48000)).candidateFrames) {
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
      padAssignments: this.recutState.padAssignments.map((assignment) =>
        create(SamplePadAssignmentSchema, {
          bank: assignment.bank,
          chokeGroupId: assignment.chokeGroupId,
          faceButton: assignment.faceButton,
          isEmpty: assignment.isEmpty,
          padIndex: assignment.padIndex,
          sliceIndex: assignment.sliceIndex,
        }),
      ),
      playingPadIndices: (this.recutVoices.size > 0 ? [...this.recutVoices.keys()] : [...this.recutHeldPads.keys()]),
      sequence: this.recutState.revision,
      projectBpm: this.settings.tempo,
      sliceMarkers: sliceMarkers.map((marker) =>
        create(SampleSliceMarkerSchema, {
          chokeGroupId: marker.chokeGroupId,
          confidence: marker.confidence,
          endFrame: marker.endFrame,
          fadeMs: marker.fadeMs,
          padIndex: marker.padIndex,
          snapExact: marker.snapExact,
          startFrame: marker.startFrame,
          transientFrame: marker.transientFrame,
        }),
      ),
      waveformPeaks: this.recutMonoSamples.length > 0
        ? createRecutWaveformPeaks(this.recutMonoSamples, 128)
        : Array.from({ length: 128 }, (_, index) => Math.abs(Math.sin((index / 127) * Math.PI))),
    };
  }

  private publishCapabilityFrame(force = false) {
    const { capability, moduleInstanceId } = parseCapabilityHandle(this.capabilityStreamHandle);
    const visible = this.capabilityStreamHandle.length > 0 && moduleInstanceId === this.selectedModuleId;
    if (visible && capability === "sample-analysis") {
      this.sampleEditorFrame = this.buildSampleEditorFrame();
    }
    const payloadBase64 = visible && capability === "sample-analysis"
      ? encodeCapabilityFrameEnvelopeBase64(create(CapabilityFrameEnvelopeSchema, {
          capability: "sample-analysis",
          handle: this.capabilityStreamHandle,
          payload: toBinary(SampleEditorFrameSchema, this.sampleEditorFrame),
          payloadType: "SampleEditorFrame",
          sequence: this.recutState.revision,
        }))
      : visible && capability === "analyzer-feed"
        ? encodeCapabilityFrameEnvelopeBase64(create(CapabilityFrameEnvelopeSchema, {
            capability: "analyzer-feed",
            handle: this.capabilityStreamHandle,
            payload: base64ToBytes(encodeAnalyzerFrameBase64(this.analyzerFrame)),
            payloadType: "AnalyzerFrame",
            sequence: this.analyzerState.revision,
          }))
        : visible && capability === "fx-visualizer"
          ? encodeCapabilityFrameEnvelopeBase64(create(CapabilityFrameEnvelopeSchema, {
              capability: "fx-visualizer",
              handle: this.capabilityStreamHandle,
              payload: base64ToBytes(buildSyntheticVisualizerFrameBase64(
                this.liveFxState,
                createProceduralSignalFrame(performance.now(), this.settings),
                this.sequence,
              )),
              payloadType: "VisualizerFrame",
              sequence: this.sequence,
            }))
      : "";
    if (!force && payloadBase64 === this.lastPublishedCapabilityFramePayload) {
      return;
    }
    this.lastPublishedCapabilityFramePayload = payloadBase64;
    this.publishHostState({
      capabilityFrameEnvelopeBase64: payloadBase64,
      type: "capabilityFrameEnvelopeProto",
    });
  }

  private publishVisualizerFrame() {
    this.publishHostState({
      type: "visualizerFrameProto",
      visualizerFrameBase64: buildSyntheticVisualizerFrameBase64(
        this.liveFxState,
        createProceduralSignalFrame(performance.now(), this.settings),
        this.sequence,
      ),
    });
  }

  private hasSubscribers() {
    return this.hostListeners.size > 0 || this.debugListeners.size > 0;
  }

  private startSignalLoop() {
    if (this.tickHandle !== null || typeof window === "undefined" || !this.settings.running || !this.hasSubscribers()) {
      return;
    }
    this.tickHandle = window.setInterval(this.tick, TICK_MS);
  }

  private stopSignalLoop() {
    if (this.tickHandle === null || typeof window === "undefined") {
      return;
    }
    window.clearInterval(this.tickHandle);
    this.tickHandle = null;
  }

  private startControllerLoop() {
    if (this.controllerFrameHandle !== null || typeof window === "undefined" || !this.hasSubscribers()) {
      return;
    }
    this.controllerFrameHandle = window.requestAnimationFrame(this.controllerTick);
  }

  private stopControllerLoop() {
    if (this.controllerFrameHandle === null || typeof window === "undefined") {
      return;
    }
    window.cancelAnimationFrame(this.controllerFrameHandle);
    this.controllerFrameHandle = null;
  }

  private refreshLoopState() {
    if (this.hasSubscribers()) {
      this.startControllerLoop();
      this.startSignalLoop();
      return;
    }

    this.stopControllerLoop();
    this.stopSignalLoop();
  }

  private syncBrowserInputState(force = false) {
    if (this.manualInputDevicesOverride) {
      if (force) {
        this.publishInputState(true);
        this.publishDebugState();
      }
      return;
    }

    const previousConnectedControllerCount = this.inputDevices.filter((device) => device.connected && device.deviceKind === "gamepad").length;
    const previousSupport = this.lastBrowserGamepadSupported;
    const snapshot = readBrowserGamepadDevices(this.browserInputFrameIndex + 1);
    this.browserInputFrameIndex += 1;
    this.lastBrowserGamepadSupported = snapshot.browserGamepadSupported;
    this.inputDevices = remapInputDevices(snapshot.devices, this.controllerConfig);
    const nextConnectedControllerCount = this.inputDevices.filter((device) => device.connected && device.deviceKind === "gamepad").length;
    this.publishInputState(force);
    if (
      force ||
      previousSupport !== this.lastBrowserGamepadSupported ||
      previousConnectedControllerCount !== nextConnectedControllerCount
    ) {
      this.publishDebugState();
    }
  }

  private tick = () => {
    if (!this.settings.running) {
      return;
    }
    this.sequence += 1n;
    this.publishVisualizerFrame();
    this.publishInputState();
    this.publishCapabilityFrame();
    this.publishDebugState();
  };

  private controllerTick = () => {
    this.controllerFrameHandle = null;
    this.syncBrowserInputState();
    if (this.hasSubscribers()) {
      this.startControllerLoop();
    }
  };
}

let runtimeInstance: DevHostRuntimeImpl | null = null;

export function getDevHostRuntime() {
  if (runtimeInstance === null) {
    runtimeInstance = new DevHostRuntimeImpl();
  }
  return runtimeInstance;
}





