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
import { DevHostCapabilityRuntime } from "./capability-runtime";

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

abstract class DevHostPublishedRuntime extends DevHostCapabilityRuntime {
  protected readonly editorViewStateJson = new Map<string, string>();
  protected readonly debugListeners = new Set<DebugStateListener>();
  protected readonly hostListeners = new Set<HostStateListener>();
  protected readonly moduleStateJson = new Map<string, string>();
  protected controllerConfig = createDefaultControllerConfig();
  protected inputDevices: PadPilotInputDeviceState[] = [];
  protected sequence = 0n;
  protected tickHandle: number | null = null;
  protected controllerFrameHandle: number | null = null;
  protected browserInputFrameIndex = 0;
  protected manualInputDevicesOverride: PadPilotInputDeviceState[] | null = null;
  protected lastBrowserGamepadSupported = browserGamepadsSupported();
  protected lastPublishedInputSignature = "";

  protected resetPublishedRealtimeState() {
    this.lastPublishedInputSignature = "";
    this.lastPublishedCapabilityFramePayload = "__unset__";
  }

  protected buildHostState(visualizerFrameBase64?: string) {
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

  protected buildNavigationState(): HostState {
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

  protected buildActiveModuleState(): HostState {
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

  protected buildInputState(): HostState {
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

  protected buildDebugState() {
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

  protected publishDebugState() {
    const state = this.buildDebugState();
    for (const listener of this.debugListeners) {
      try {
        listener(state);
      } catch {
        // Diagnostics listeners are isolated from the realtime simulator loop.
      }
    }
  }

  protected publishHostState(state: HostState) {
    for (const listener of this.hostListeners) {
      try {
        listener(state);
      } catch {
        // Public Module listeners cannot block remaining host consumers.
      }
    }
  }

  protected publishBootstrapState(includeVisualizer: boolean) {
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

  protected publishNavigationState() {
    this.publishHostState(this.buildNavigationState());
  }

  protected publishActiveModuleState() {
    this.publishHostState(this.buildActiveModuleState());
  }

  protected publishInputState(force = false) {
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

  protected publishCapabilityFrame(force = false) {
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

  protected publishVisualizerFrame() {
    this.publishHostState({
      type: "visualizerFrameProto",
      visualizerFrameBase64: buildSyntheticVisualizerFrameBase64(
        this.liveFxState,
        createProceduralSignalFrame(performance.now(), this.settings),
        this.sequence,
      ),
    });
  }

  protected hasSubscribers() {
    return this.hostListeners.size > 0 || this.debugListeners.size > 0;
  }

  protected startSignalLoop() {
    if (this.tickHandle !== null || typeof window === "undefined" || !this.settings.running || !this.hasSubscribers()) {
      return;
    }
    this.tickHandle = window.setInterval(this.tick, TICK_MS);
  }

  protected stopSignalLoop() {
    if (this.tickHandle === null || typeof window === "undefined") {
      return;
    }
    window.clearInterval(this.tickHandle);
    this.tickHandle = null;
  }

  protected startControllerLoop() {
    if (this.controllerFrameHandle !== null || typeof window === "undefined" || !this.hasSubscribers()) {
      return;
    }
    this.controllerFrameHandle = window.requestAnimationFrame(this.controllerTick);
  }

  protected stopControllerLoop() {
    if (this.controllerFrameHandle === null || typeof window === "undefined") {
      return;
    }
    window.cancelAnimationFrame(this.controllerFrameHandle);
    this.controllerFrameHandle = null;
  }

  protected refreshLoopState() {
    if (this.hasSubscribers()) {
      this.startControllerLoop();
      this.startSignalLoop();
      return;
    }

    this.stopControllerLoop();
    this.stopSignalLoop();
  }

  protected syncBrowserInputState(force = false) {
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

  protected tick = () => {
    if (!this.settings.running) {
      return;
    }
    this.sequence += 1n;
    this.publishVisualizerFrame();
    this.publishInputState();
    this.publishCapabilityFrame();
    this.publishDebugState();
  };

  protected controllerTick = () => {
    this.controllerFrameHandle = null;
    this.syncBrowserInputState();
    if (this.hasSubscribers()) {
      this.startControllerLoop();
    }
  };
}


class DevHostRuntimeImpl extends DevHostPublishedRuntime {

  constructor() {
    super();
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
}

let runtimeInstance: DevHostRuntimeImpl | null = null;

export function getDevHostRuntime() {
  if (runtimeInstance === null) {
    runtimeInstance = new DevHostRuntimeImpl();
  }
  return runtimeInstance;
}





