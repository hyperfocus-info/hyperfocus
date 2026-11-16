import type { DevHostPublishCallbacks } from "./sample-runtime";
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { base64ToBytes } from "../proto/base64";
import {  SetControllerConfigRequestSchema } from "../proto/generated/bridge-pb";
import {   CapabilityFrameEnvelopeSchema, SampleEditorFrameSchema } from "../proto/generated/capability-pb";
import { createDefaultFxChainState, decodeFxChainStateBase64, encodeFxChainStateBase64 } from "../modules/fx/fx-chain-state";
import { createDefaultAnalyzerModuleState, createEmptyAnalyzerFrame, encodeAnalyzerFrameBase64, encodeAnalyzerModuleStateBase64 } from "../modules/analyzer/analyzer-state";
import { createDefaultRecutModuleState, decodeRecutModuleStateBase64, encodeRecutModuleStateBase64 } from "../modules/recut/recut-state";
import { PadPilotInputDeviceState } from "../padpilot/io/input-device";
import { controllerBindingKindFromProto, controllerLayoutKindFromProto, createDefaultControllerConfig, normalizeControllerConfig } from "../padpilot/controller-config";
import { getPrimaryConfiguredInputDevice, remapInputDevices } from "../padpilot/controller-runtime";
import { createEmptySampleEditorFrame } from "../padpilot/sample-capabilities";
import { parseCapabilityHandle } from "@hyperfocus/pad-pilot/module-identity";
import { HostIntent, HostState } from "../bridge";
import { browserGamepadsSupported, readBrowserGamepadDevices } from "./browser-gamepad-source";
import { createProceduralSignalFrame } from "./fx-simulator";
import { DevSignalSettings } from "./types";
import { buildSyntheticVisualizerFrameBase64 } from "./visualizer-builders";
import { TICK_MS, ModuleSummary, HostStateListener, DebugStateListener, DEFAULT_MODULES, saveSettings, cloneFxState, createInstalledModuleResult, encodeCapabilityFrameEnvelopeBase64, cloneInputDevice, createEmptyControllerState, normalizeDevSignalSettings } from "./runtime-helpers";
import { createDevHostCapabilityRuntime } from "./capability-runtime";

export function createDevHostPublishedRuntime(callbacks: DevHostPublishCallbacks) {
  const base = createDevHostCapabilityRuntime(callbacks);
  const editorViewStateJson = new Map<string, string>();
  const debugListeners = new Set<DebugStateListener>();
  const hostListeners = new Set<HostStateListener>();
  const moduleStateJson = new Map<string, string>();
  const controllerConfig = createDefaultControllerConfig();
  const inputDevices = ((): PadPilotInputDeviceState[] => ([]))();
  const sequence = 0n;
  const tickHandle = ((): number | null => (null))();
  const controllerFrameHandle = ((): number | null => (null))();
  const browserInputFrameIndex = 0;
  const manualInputDevicesOverride = ((): PadPilotInputDeviceState[] | null => (null))();
  const lastBrowserGamepadSupported = browserGamepadsSupported();
  const lastPublishedInputSignature = "";
  const runtimeState = Object.assign(base, { editorViewStateJson, debugListeners, hostListeners, moduleStateJson, controllerConfig, inputDevices, sequence, tickHandle, controllerFrameHandle, browserInputFrameIndex, manualInputDevicesOverride, lastBrowserGamepadSupported, lastPublishedInputSignature });
  function resetPublishedRealtimeState() {
    runtimeState.lastPublishedInputSignature = "";
    runtimeState.lastPublishedCapabilityFramePayload = "__unset__";
  }
  function buildHostState(visualizerFrameBase64?: string) {
    const presetRecords = Array.from(runtimeState.presetsById.values()).filter((preset) => preset.moduleId === runtimeState.selectedModuleId);
    const activeFxState = base.getActiveFxState();
    const activeModuleStateBase64 = runtimeState.selectedModuleId === "fx"
      ? encodeFxChainStateBase64(activeFxState)
      : runtimeState.selectedModuleId === "recut"
        ? encodeRecutModuleStateBase64(runtimeState.recutState)
        : runtimeState.selectedModuleId === "analyzer"
          ? encodeAnalyzerModuleStateBase64(runtimeState.analyzerState)
        : runtimeState.moduleStateJson.get(runtimeState.selectedModuleId) ?? "";
    const primaryController = getPrimaryConfiguredInputDevice(runtimeState.inputDevices, runtimeState.controllerConfig) ?? createEmptyControllerState();

    const moduleStates = Object.fromEntries(
      Array.from(runtimeState.moduleStateJson.entries()).map(([moduleId, payload]) => {
        try {
          return [moduleId, JSON.parse(payload)];
        } catch {
          return [moduleId, payload];
        }
      }),
    );
    const editorViewStates = Object.fromEntries(
      Array.from(runtimeState.editorViewStateJson.entries()).map(([scopeId, payload]) => {
        try {
          return [scopeId, JSON.parse(payload)];
        } catch {
          return [scopeId, payload];
        }
      }),
    );

    return {
      acceptedRevision: runtimeState.selectedModuleId === "fx"
        ? runtimeState.acceptedRevision
        : runtimeState.selectedModuleId === "recut"
          ? runtimeState.recutState.revision
          : runtimeState.selectedModuleId === "analyzer"
            ? runtimeState.analyzerState.revision
          : 0n,
      activeModuleId: runtimeState.selectedModuleId,
      activeModuleStateBase64,
      controller: {
        axes: [...primaryController.axes],
        buttons: [...primaryController.buttons],
        connected: primaryController.connected,
        frameIndex: primaryController.frameIndex,
      },
      controllerConfig: normalizeControllerConfig(runtimeState.controllerConfig),
      inputDevices: runtimeState.inputDevices.map((device) => ({
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
      modules: runtimeState.modules.map((moduleItem) => ({ ...moduleItem })),
      presets: presetRecords.map((preset) => ({ id: preset.id, name: preset.name })),
      projectBpm: runtimeState.settings.tempo,
      selectedModuleId: runtimeState.selectedModuleId,
      selectedPresetId: runtimeState.selectedPresetId,
      type: "hostSyncProto",
      visualizerFrameBase64,
    };
  }
  function buildNavigationState(): HostState {
    const presetRecords = Array.from(runtimeState.presetsById.values()).filter((preset) => preset.moduleId === runtimeState.selectedModuleId);
    return {
      modules: runtimeState.modules.map((moduleItem) => ({ ...moduleItem })),
      presets: presetRecords.map((preset) => ({ id: preset.id, name: preset.name })),
      projectBpm: runtimeState.settings.tempo,
      selectedModuleId: runtimeState.selectedModuleId,
      selectedPresetId: runtimeState.selectedPresetId,
      type: "navigationFrameProto",
    };
  }
  function buildActiveModuleState(): HostState {
    const activeFxState = base.getActiveFxState();
    return {
      acceptedRevision: runtimeState.selectedModuleId === "fx"
        ? runtimeState.acceptedRevision
        : runtimeState.selectedModuleId === "recut"
          ? runtimeState.recutState.revision
          : runtimeState.selectedModuleId === "analyzer"
            ? runtimeState.analyzerState.revision
          : 0n,
      activeModuleId: runtimeState.selectedModuleId,
      activeModuleStateBase64: runtimeState.selectedModuleId === "fx"
        ? encodeFxChainStateBase64(activeFxState)
        : runtimeState.selectedModuleId === "recut"
          ? encodeRecutModuleStateBase64(runtimeState.recutState)
          : runtimeState.selectedModuleId === "analyzer"
            ? encodeAnalyzerModuleStateBase64(runtimeState.analyzerState)
          : runtimeState.moduleStateJson.get(runtimeState.selectedModuleId) ?? "",
      projectBpm: runtimeState.settings.tempo,
      type: "activeModuleStateFrameProto",
    };
  }
  function buildInputState(): HostState {
    const primaryController = getPrimaryConfiguredInputDevice(runtimeState.inputDevices, runtimeState.controllerConfig) ?? createEmptyControllerState();
    return {
      controller: {
        axes: [...primaryController.axes],
        buttons: [...primaryController.buttons],
        connected: primaryController.connected,
        frameIndex: primaryController.frameIndex,
      },
      controllerConfig: normalizeControllerConfig(runtimeState.controllerConfig),
      inputDevices: runtimeState.inputDevices.map((device) => ({
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
  function buildDebugState() {
    return {
      acceptedRevision: runtimeState.acceptedRevision,
      browserGamepadSupported: runtimeState.lastBrowserGamepadSupported,
      connectedControllerCount: runtimeState.inputDevices.filter((device) => device.connected && device.deviceKind === "gamepad").length,
      continuousHostSync: runtimeState.settings.continuousHostSync,
      intensity: runtimeState.settings.intensity,
      profile: runtimeState.settings.profile,
      running: runtimeState.settings.running,
      selectedModuleId: runtimeState.selectedModuleId,
      selectedPresetId: runtimeState.selectedPresetId,
      sequence: runtimeState.sequence,
      stereoWidth: runtimeState.settings.stereoWidth,
      tempo: runtimeState.settings.tempo,
    };
  }
  function publishDebugState() {
    const state = buildDebugState();
    for (const listener of runtimeState.debugListeners) {
      try {
        listener(state);
      } catch {
        // Diagnostics listeners are isolated from the realtime simulator loop.
      }
    }
  }
  function publishHostState(state: HostState) {
    for (const listener of runtimeState.hostListeners) {
      try {
        listener(state);
      } catch {
        // Public Module listeners cannot block remaining host consumers.
      }
    }
  }
  function publishBootstrapState(includeVisualizer: boolean) {
    const visualizerFrameBase64 = includeVisualizer
      ? buildSyntheticVisualizerFrameBase64(runtimeState.liveFxState, createProceduralSignalFrame(performance.now(), runtimeState.settings), runtimeState.sequence)
      : undefined;
    const state = buildHostState(visualizerFrameBase64);
    runtimeState.lastPublishedInputSignature = JSON.stringify({
      controller: state.controller,
      inputDevices: state.inputDevices,
    });
    runtimeState.lastPublishedCapabilityFramePayload = "__unset__";
    publishHostState(state);
  }
  function publishNavigationState() {
    publishHostState(buildNavigationState());
  }
  function publishActiveModuleState() {
    publishHostState(buildActiveModuleState());
  }
  function publishInputState(force = false) {
    const state = buildInputState();
    const signature = JSON.stringify({
      controller: state.controller,
      inputDevices: state.inputDevices,
    });
    if (!force && signature === runtimeState.lastPublishedInputSignature) {
      return;
    }
    runtimeState.lastPublishedInputSignature = signature;
    publishHostState(state);
  }
  function publishCapabilityFrame(force = false) {
    const { capability, moduleInstanceId } = parseCapabilityHandle(runtimeState.capabilityStreamHandle);
    const visible = runtimeState.capabilityStreamHandle.length > 0 && moduleInstanceId === runtimeState.selectedModuleId;
    if (visible && capability === "sample-analysis") {
      runtimeState.sampleEditorFrame = base.buildSampleEditorFrame();
    }
    const payloadBase64 = visible && capability === "sample-analysis"
      ? encodeCapabilityFrameEnvelopeBase64(create(CapabilityFrameEnvelopeSchema, {
          capability: "sample-analysis",
          handle: runtimeState.capabilityStreamHandle,
          payload: toBinary(SampleEditorFrameSchema, runtimeState.sampleEditorFrame),
          payloadType: "SampleEditorFrame",
          sequence: runtimeState.recutState.revision,
        }))
      : visible && capability === "analyzer-feed"
        ? encodeCapabilityFrameEnvelopeBase64(create(CapabilityFrameEnvelopeSchema, {
            capability: "analyzer-feed",
            handle: runtimeState.capabilityStreamHandle,
            payload: base64ToBytes(encodeAnalyzerFrameBase64(runtimeState.analyzerFrame)),
            payloadType: "AnalyzerFrame",
            sequence: runtimeState.analyzerState.revision,
          }))
        : visible && capability === "fx-visualizer"
          ? encodeCapabilityFrameEnvelopeBase64(create(CapabilityFrameEnvelopeSchema, {
              capability: "fx-visualizer",
              handle: runtimeState.capabilityStreamHandle,
              payload: base64ToBytes(buildSyntheticVisualizerFrameBase64(
                runtimeState.liveFxState,
                createProceduralSignalFrame(performance.now(), runtimeState.settings),
                runtimeState.sequence,
              )),
              payloadType: "VisualizerFrame",
              sequence: runtimeState.sequence,
            }))
      : "";
    if (!force && payloadBase64 === runtimeState.lastPublishedCapabilityFramePayload) {
      return;
    }
    runtimeState.lastPublishedCapabilityFramePayload = payloadBase64;
    publishHostState({
      capabilityFrameEnvelopeBase64: payloadBase64,
      type: "capabilityFrameEnvelopeProto",
    });
  }
  function publishVisualizerFrame() {
    publishHostState({
      type: "visualizerFrameProto",
      visualizerFrameBase64: buildSyntheticVisualizerFrameBase64(
        runtimeState.liveFxState,
        createProceduralSignalFrame(performance.now(), runtimeState.settings),
        runtimeState.sequence,
      ),
    });
  }
  function hasSubscribers() {
    return runtimeState.hostListeners.size > 0 || runtimeState.debugListeners.size > 0;
  }
  function startSignalLoop() {
    if (runtimeState.tickHandle !== null || typeof window === "undefined" || !runtimeState.settings.running || !hasSubscribers()) {
      return;
    }
    runtimeState.tickHandle = window.setInterval(tick, TICK_MS);
  }
  function stopSignalLoop() {
    if (runtimeState.tickHandle === null || typeof window === "undefined") {
      return;
    }
    window.clearInterval(runtimeState.tickHandle);
    runtimeState.tickHandle = null;
  }
  function startControllerLoop() {
    if (runtimeState.controllerFrameHandle !== null || typeof window === "undefined" || !hasSubscribers()) {
      return;
    }
    runtimeState.controllerFrameHandle = window.requestAnimationFrame(controllerTick);
  }
  function stopControllerLoop() {
    if (runtimeState.controllerFrameHandle === null || typeof window === "undefined") {
      return;
    }
    window.cancelAnimationFrame(runtimeState.controllerFrameHandle);
    runtimeState.controllerFrameHandle = null;
  }
  function refreshLoopState() {
    if (hasSubscribers()) {
      startControllerLoop();
      startSignalLoop();
      return;
    }

    stopControllerLoop();
    stopSignalLoop();
  }
  function syncBrowserInputState(force = false) {
    if (runtimeState.manualInputDevicesOverride) {
      if (force) {
        publishInputState(true);
        callbacks.publishDebugState();
      }
      return;
    }

    const previousConnectedControllerCount = runtimeState.inputDevices.filter((device) => device.connected && device.deviceKind === "gamepad").length;
    const previousSupport = runtimeState.lastBrowserGamepadSupported;
    const snapshot = readBrowserGamepadDevices(runtimeState.browserInputFrameIndex + 1);
    runtimeState.browserInputFrameIndex += 1;
    runtimeState.lastBrowserGamepadSupported = snapshot.browserGamepadSupported;
    runtimeState.inputDevices = remapInputDevices(snapshot.devices, runtimeState.controllerConfig);
    const nextConnectedControllerCount = runtimeState.inputDevices.filter((device) => device.connected && device.deviceKind === "gamepad").length;
    publishInputState(force);
    if (
      force ||
      previousSupport !== runtimeState.lastBrowserGamepadSupported ||
      previousConnectedControllerCount !== nextConnectedControllerCount
    ) {
      callbacks.publishDebugState();
    }
  }
  const tick = () => {
    if (!runtimeState.settings.running) {
      return;
    }
    runtimeState.sequence += 1n;
    publishVisualizerFrame();
    publishInputState();
    callbacks.publishCapabilityFrame();
    callbacks.publishDebugState();
  };
  const controllerTick = () => {
    runtimeState.controllerFrameHandle = null;
    syncBrowserInputState();
    if (hasSubscribers()) {
      startControllerLoop();
    }
  };
  Object.assign(callbacks, { publishActiveModuleState, publishCapabilityFrame, publishDebugState, publishNavigationState });
  return Object.assign(runtimeState, { resetPublishedRealtimeState, buildHostState, buildNavigationState, buildActiveModuleState, buildInputState, buildDebugState, publishDebugState, publishHostState, publishBootstrapState, publishNavigationState, publishActiveModuleState, publishInputState, publishCapabilityFrame, publishVisualizerFrame, hasSubscribers, startSignalLoop, stopSignalLoop, startControllerLoop, stopControllerLoop, refreshLoopState, syncBrowserInputState, tick, controllerTick });
}


export function createDevHostRuntime() {
  const callbacks: DevHostPublishCallbacks = { publishActiveModuleState() {}, publishCapabilityFrame() {}, publishDebugState() {}, publishNavigationState() {}, updateSettings() {} };
  const base = createDevHostPublishedRuntime(callbacks);
  const runtimeState = Object.assign(base, {  });
  function subscribe(listener: HostStateListener) {
    runtimeState.hostListeners.add(listener);
    base.refreshLoopState();
    base.syncBrowserInputState();
    const state = base.buildHostState();
    runtimeState.lastPublishedInputSignature = JSON.stringify({
      controller: state.controller,
      inputDevices: state.inputDevices,
    });
    try {
      listener(state);
    } catch {
      // One host consumer cannot block runtime setup or other subscribers.
    }
    return () => {
      runtimeState.hostListeners.delete(listener);
      base.refreshLoopState();
    };
  }
  function subscribeDebug(listener: DebugStateListener) {
    runtimeState.debugListeners.add(listener);
    base.refreshLoopState();
    base.syncBrowserInputState();
    try {
      listener(base.buildDebugState());
    } catch {
      // One diagnostics consumer cannot block runtime setup or other subscribers.
    }
    return () => {
      runtimeState.debugListeners.delete(listener);
      base.refreshLoopState();
    };
  }
  function getDebugState() {
    return base.buildDebugState();
  }
  function installModuleBundle(bundlePath: string) {
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

    const existingIndex = runtimeState.modules.findIndex((moduleItem) => moduleItem.id === module.id);
    if (existingIndex >= 0) {
      runtimeState.modules = runtimeState.modules.map((moduleItem, index) => index === existingIndex ? module : moduleItem);
    } else {
      runtimeState.modules = [...runtimeState.modules, module];
    }
    runtimeState.selectedModuleId = module.id;
    callbacks.publishNavigationState();
    callbacks.publishActiveModuleState();
    callbacks.publishCapabilityFrame(true);
    callbacks.publishDebugState();
    return createInstalledModuleResult(module);
  }
  function updateSettings(next: Partial<DevSignalSettings>) {
    runtimeState.settings = normalizeDevSignalSettings(next, runtimeState.settings);
    saveSettings(runtimeState.settings);
    base.refreshLoopState();
    callbacks.publishDebugState();
    base.publishBootstrapState(true);
  }
  function reset() {
    runtimeState.recutAudioLoadGeneration += 1;
    for (const padIndex of [...runtimeState.recutVoices.keys()]) {
      base.stopRecutVoice(padIndex);
    }
    runtimeState.recutHeldPads.clear();
    const recutAudioContext = runtimeState.recutAudioContext;
    runtimeState.recutAudioContext = null;
    recutAudioContext?.close().catch(() => {
      // Ignore teardown races in tests.
    });
    runtimeState.acceptedRevision = 1n;
    runtimeState.canonicalFxState = createDefaultFxChainState();
    runtimeState.liveFxState = cloneFxState(runtimeState.canonicalFxState);
    runtimeState.analyzerState = createDefaultAnalyzerModuleState();
    runtimeState.analyzerFrame = createEmptyAnalyzerFrame();
    runtimeState.recutState = createDefaultRecutModuleState();
    runtimeState.sampleEditorFrame = createEmptySampleEditorFrame();
    runtimeState.analyzerSourceNoteEvents = [];
    runtimeState.analyzerStreamModuleId = "";
    runtimeState.capabilityStreamHandle = "";
    runtimeState.editorViewStateJson.clear();
    runtimeState.moduleStateJson.clear();
    runtimeState.producerActionLog.length = 0;
    runtimeState.heldMidiNotes.clear();
    runtimeState.activeAutomationTouches.clear();
    runtimeState.modules = [...DEFAULT_MODULES];
    runtimeState.controllerConfig = createDefaultControllerConfig();
    runtimeState.inputDevices = [];
    runtimeState.manualInputDevicesOverride = null;
    runtimeState.browserInputFrameIndex = 0;
    runtimeState.lastBrowserGamepadSupported = browserGamepadsSupported();
    runtimeState.selectedModuleId = "fx";
    runtimeState.sequence = 0n;
    runtimeState.recutAudioBuffer = null;
    runtimeState.recutMonoSamples = new Float32Array();
    runtimeState.presetsById.clear();
    base.stopControllerLoop();
    base.stopSignalLoop();
    const preset = base.seedPreset("PadPilot Init", encodeFxChainStateBase64(runtimeState.canonicalFxState), "pad_pilot_init_default");
    runtimeState.selectedPresetId = preset.id;
    base.resetPublishedRealtimeState();
    base.refreshLoopState();
    base.syncBrowserInputState(true);
    base.publishBootstrapState(true);
    callbacks.publishDebugState();
  }
  function setInputDevices(inputDevices: Array<Partial<PadPilotInputDeviceState> & Pick<PadPilotInputDeviceState, "connected" | "deviceId" | "deviceKind" | "displayName" | "frameIndex" | "axes" | "buttons">>) {
    runtimeState.manualInputDevicesOverride = inputDevices.map((device) => ({
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
    runtimeState.inputDevices = runtimeState.manualInputDevicesOverride.map(cloneInputDevice);
    base.publishInputState(true);
    callbacks.publishDebugState();
  }
  function getProducerActionLog() {
    return runtimeState.producerActionLog.map((entry) => ({ ...entry }));
  }
  function sendIntent(intent: HostIntent) {
    switch (intent.type) {
      case "ready":
        base.resetPublishedRealtimeState();
        base.publishBootstrapState(true);
        return;
      case "selectModule":
        {
          const nextModuleId = intent.moduleId === "reverb" ? "fx" : intent.moduleId;
          if (nextModuleId !== runtimeState.selectedModuleId) base.releaseProducerActions(runtimeState.selectedModuleId);
          runtimeState.selectedModuleId = nextModuleId;
        }
        if (
          runtimeState.capabilityStreamHandle &&
          parseCapabilityHandle(runtimeState.capabilityStreamHandle).moduleInstanceId !== runtimeState.selectedModuleId
        ) {
          runtimeState.capabilityStreamHandle = "";
        }
        if (runtimeState.analyzerStreamModuleId && runtimeState.analyzerStreamModuleId !== runtimeState.selectedModuleId) {
          runtimeState.analyzerStreamModuleId = "";
          if (runtimeState.analyzerState.recordEnabled) {
            runtimeState.analyzerState.recordEnabled = false;
            runtimeState.analyzerState.revision += 1n;
            runtimeState.analyzerFrame.recording = false;
            runtimeState.analyzerFrame.currentLevel = 0;
          }
        }
        callbacks.publishNavigationState();
        callbacks.publishActiveModuleState();
        callbacks.publishCapabilityFrame(true);
        callbacks.publishDebugState();
        return;
      case "createModule": {
        const baseId = intent.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "module";
        let candidate = baseId;
        let suffix = 2;
        while (runtimeState.modules.some((moduleItem) => moduleItem.id === candidate)) {
          candidate = `${baseId}-${suffix}`;
          suffix += 1;
        }
        runtimeState.modules = [...runtimeState.modules, {
          id: candidate,
          name: intent.name.trim() || "Module",
          version: "0.1.0",
          capabilities: ["module-state", "script-runtime"],
          loadStatus: "ready",
          uiEntryPath: `builtin://starter/${candidate}`,
        }];
        runtimeState.selectedModuleId = candidate;
        callbacks.publishNavigationState();
        callbacks.publishActiveModuleState();
        callbacks.publishCapabilityFrame(true);
        callbacks.publishDebugState();
        return;
      }
      case "setModuleState":
        runtimeState.moduleStateJson.set(intent.moduleId, intent.payload);
        if ((intent.moduleId === "reverb" ? "fx" : intent.moduleId) === runtimeState.selectedModuleId) {
          callbacks.publishActiveModuleState();
        }
        return;
      case "setControllerConfig": {
        const request = fromBinary(SetControllerConfigRequestSchema, base64ToBytes(intent.payloadBase64));
        runtimeState.controllerConfig = normalizeControllerConfig({
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
        if (runtimeState.manualInputDevicesOverride) {
          runtimeState.inputDevices = remapInputDevices(runtimeState.manualInputDevicesOverride, runtimeState.controllerConfig);
        } else {
          base.syncBrowserInputState(true);
        }
        base.publishBootstrapState(true);
        base.publishInputState(true);
        callbacks.publishDebugState();
        return;
      }
      case "setEditorViewState":
        runtimeState.editorViewStateJson.set(intent.scopeId, intent.payload);
        return;
      case "setModuleStateProto": {
        if (intent.moduleId === "fx" || intent.moduleId === "reverb") {
          runtimeState.canonicalFxState = decodeFxChainStateBase64(intent.payloadBase64);
          runtimeState.liveFxState = cloneFxState(runtimeState.canonicalFxState);
          runtimeState.acceptedRevision = BigInt(intent.revision);
        }
        if (intent.moduleId === "recut") {
          runtimeState.recutState = decodeRecutModuleStateBase64(intent.payloadBase64);
          runtimeState.sampleEditorFrame = base.buildSampleEditorFrame();
        }
        if ((intent.moduleId === "reverb" ? "fx" : intent.moduleId) === runtimeState.selectedModuleId) {
          callbacks.publishActiveModuleState();
        }
        if (intent.moduleId === "recut") {
          callbacks.publishCapabilityFrame(true);
        }
        callbacks.publishDebugState();
        return;
      }
      case "selectPreset": {
        const preset = runtimeState.presetsById.get(intent.presetId);
        if (!preset) {
          return;
        }
        runtimeState.selectedPresetId = preset.id;
        if (preset.moduleId === "fx") {
          runtimeState.canonicalFxState = decodeFxChainStateBase64(preset.stateBase64);
          runtimeState.liveFxState = cloneFxState(runtimeState.canonicalFxState);
          runtimeState.acceptedRevision = runtimeState.canonicalFxState.revision;
        }
        callbacks.publishNavigationState();
        callbacks.publishActiveModuleState();
        callbacks.publishDebugState();
        return;
      }
      case "openCapabilityStream":
        if (!base.isAuthorizedCapabilityHandle(intent.capability, intent.handle)) {
          return;
        }
        if (intent.capability === "sample-analysis") {
          runtimeState.capabilityStreamHandle = intent.handle;
          callbacks.publishCapabilityFrame(true);
          return;
        }
        if (intent.capability === "analyzer-feed") {
          runtimeState.capabilityStreamHandle = intent.handle;
          runtimeState.analyzerStreamModuleId = parseCapabilityHandle(intent.handle).moduleInstanceId;
          callbacks.publishCapabilityFrame(true);
          return;
        }
        if (intent.capability === "fx-visualizer") {
          runtimeState.capabilityStreamHandle = intent.handle;
          callbacks.publishCapabilityFrame(true);
        }
        return;
      case "closeCapabilityStream":
        if (!base.isAuthorizedCapabilityHandle(intent.capability, intent.handle)) {
          return;
        }
        if (
          (intent.capability === "sample-analysis"
            || intent.capability === "analyzer-feed"
            || intent.capability === "fx-visualizer")
          && runtimeState.capabilityStreamHandle === intent.handle
        ) {
          runtimeState.capabilityStreamHandle = "";
          if (intent.capability === "analyzer-feed") {
            runtimeState.analyzerStreamModuleId = "";
          }
          callbacks.publishCapabilityFrame(true);
        }
        return;
      case "sendCapabilityIntent":
        try {
          base.applyCapabilityIntent(intent);
        } catch {
          // Dev-host capability ingress mirrors native fail-closed behavior.
        }
        return;
      case "setDiagnosticsVisible":
        return;
    }
  }
  Object.assign(callbacks, { updateSettings });


    const defaultPreset = base.seedPreset("PadPilot Init", encodeFxChainStateBase64(runtimeState.canonicalFxState), "pad_pilot_init_default");
    runtimeState.selectedPresetId = defaultPreset.id;

  function dispose() {
    runtimeState.hostListeners.clear();
    runtimeState.debugListeners.clear();
    base.stopSignalLoop();
    base.stopControllerLoop();
    runtimeState.recutAudioLoadGeneration += 1;
    for (const pad of runtimeState.recutVoices.keys()) base.stopRecutVoice(pad);
    runtimeState.recutHeldPads.clear();
    const context = runtimeState.recutAudioContext;
    runtimeState.recutAudioContext = null;
    if (context) void context.close().catch(() => undefined);
  }
  return Object.assign(runtimeState, { dispose, subscribe, subscribeDebug, getDebugState, installModuleBundle, updateSettings, reset, setInputDevices, getProducerActionLog, sendIntent });
}

let runtimeInstance: ReturnType<typeof createDevHostRuntime> | null = null;

export function getDevHostRuntime() {
  if (runtimeInstance === null) {
    runtimeInstance = createDevHostRuntime();
  }
  return runtimeInstance;
}
