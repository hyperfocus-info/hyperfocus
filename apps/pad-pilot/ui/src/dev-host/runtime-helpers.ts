import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { bytesToBase64 } from "../proto/base64";
import { CapabilityFrameEnvelopeSchema, type CapabilityFrameEnvelope } from "../proto/generated/capability-pb";
import { FxChainStateSchema, MasterStateSchema, type FxChainState } from "../proto/generated/fx-chain-pb";
import { encodeFxChainState } from "../modules/fx/fx-chain-state";
import { createAnalyzerNoteEvent } from "../modules/analyzer/analyzer-state";
import { PadPilotInputDeviceState } from "../padpilot/io/input-device";
import { clamp, clamp01Or } from "../utils/math";
import { HostState, InstalledModuleResult } from "../bridge";
import { DevHostDebugState, DevSignalProfile, DevSignalSettings } from "./types";
import { createFactoryModuleSummary, factoryModuleCatalog } from "@hyperfocus/pad-pilot/factory-modules";

export const DEV_HOST_STORAGE_KEY = "padpilot.dev-host.settings";
export const TICK_MS = Math.round(1000 / 15);
const DEV_SIGNAL_PROFILES = new Set<DevSignalProfile>(["idle", "steady-tone", "pulsed-groove", "noise-burst", "sweep"]);

function storedNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function normalizeDevSignalSettings(
  input: Partial<DevSignalSettings>,
  fallback: DevSignalSettings,
) {
  return {
    continuousHostSync: typeof input.continuousHostSync === "boolean" ? input.continuousHostSync : fallback.continuousHostSync,
    intensity: clamp01Or(storedNumber(input.intensity), fallback.intensity),
    profile: DEV_SIGNAL_PROFILES.has(input.profile as DevSignalProfile) ? input.profile as DevSignalProfile : fallback.profile,
    running: typeof input.running === "boolean" ? input.running : fallback.running,
    stereoWidth: clamp01Or(storedNumber(input.stereoWidth), fallback.stereoWidth),
    tempo: clamp(storedNumber(input.tempo) ?? fallback.tempo, 40, 220),
  } satisfies DevSignalSettings;
}

export type ModuleSummary = {
  id: string;
  name: string;
  version?: string;
  capabilities?: string[];
  loadStatus?: string;
  loadErrorMessage?: string;
  expectedModuleVersion?: string;
  resolvedModuleVersion?: string;
  uiEntryPath?: string;
  scriptEntryPath?: string;
};
export type PresetRecord = { id: string; moduleId: string; name: string; stateBase64: string };
export type HostStateListener = (state: HostState) => void;
export type DebugStateListener = (state: DevHostDebugState) => void;
export type RecutPlaybackVoice = {
  gain: GainNode;
  padIndex: number;
  source: AudioBufferSourceNode;
};

export const DEFAULT_MODULES: ModuleSummary[] = factoryModuleCatalog.map(createFactoryModuleSummary);

export function loadSettings() {
  const defaults: DevSignalSettings = {
    continuousHostSync: false,
    intensity: 0.72,
    profile: "pulsed-groove",
    running: true,
    stereoWidth: 0.58,
    tempo: 116,
  };

  try {
    const raw = window.localStorage.getItem(DEV_HOST_STORAGE_KEY);
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw) as Partial<DevSignalSettings>;
    return normalizeDevSignalSettings(parsed, defaults);
  } catch {
    return defaults;
  }
}

export function saveSettings(settings: DevSignalSettings) {
  try {
    window.localStorage.setItem(DEV_HOST_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage restrictions.
  }
}

export function cloneFxState(state: FxChainState) {
  return fromBinary(FxChainStateSchema, encodeFxChainState(state));
}

export function getDevImportedFile(contentId: string) {
  return window.__PADPILOT_DEV_IMPORTED_FILES__?.[contentId] ?? null;
}

export function createInstalledModuleResult(module: ModuleSummary) {
  return {
    capabilities: module.capabilities,
    id: module.id,
    loadErrorMessage: module.loadErrorMessage,
    loadStatus: module.loadStatus,
    name: module.name,
    expectedModuleVersion: module.expectedModuleVersion,
    resolvedModuleVersion: module.resolvedModuleVersion,
    scriptEntryPath: module.scriptEntryPath,
    uiEntryPath: module.uiEntryPath,
    version: module.version,
  } satisfies InstalledModuleResult;
}

export function encodeCapabilityFrameEnvelopeBase64(envelope: CapabilityFrameEnvelope) {
  return bytesToBase64(toBinary(CapabilityFrameEnvelopeSchema, envelope));
}

export function ensureMasterState(state: FxChainState) {
  state.master ??= create(MasterStateSchema, {
    gainReductionDb: 0,
    inputGainDb: 0,
    outputGainDb: 0,
    wetDry: 1,
  });

  return state.master;
}

export function createSeedAnalyzerNoteEvents() {
  return [
    createAnalyzerNoteEvent({ midiNote: 54, startFrame: 0, endFrame: 18, intensity: 0.74, velocity: 94, meanFrequencyHz: 184.99 }),
    createAnalyzerNoteEvent({ midiNote: 58, startFrame: 2, endFrame: 20, intensity: 0.62, velocity: 86, meanFrequencyHz: 233.08 }),
    createAnalyzerNoteEvent({ midiNote: 61, startFrame: 6, endFrame: 28, intensity: 0.66, velocity: 90, meanFrequencyHz: 277.18 }),
    createAnalyzerNoteEvent({ midiNote: 66, startFrame: 18, endFrame: 34, intensity: 0.57, velocity: 82, meanFrequencyHz: 369.99 }),
  ];
}

export function cloneInputDevice(device: PadPilotInputDeviceState) {
  return {
    activeLayoutKind: device.activeLayoutKind,
    axes: [...device.axes],
    buttons: [...device.buttons],
    connected: device.connected,
    detectedLayoutKind: device.detectedLayoutKind,
    deviceId: device.deviceId,
    deviceKind: device.deviceKind,
    displayName: device.displayName,
    frameIndex: device.frameIndex,
    hardwareId: device.hardwareId,
    rawAxes: [...device.rawAxes],
    rawButtons: [...device.rawButtons],
    runtimeDeviceId: device.runtimeDeviceId,
  } satisfies PadPilotInputDeviceState;
}

export function createEmptyControllerState() {
  return {
    axes: [],
    buttons: [],
    connected: false,
    deviceId: "",
    runtimeDeviceId: "",
    hardwareId: "",
    deviceKind: "unknown" as const,
    displayName: "",
    frameIndex: 0,
    rawAxes: [],
    rawButtons: [],
    detectedLayoutKind: "auto" as const,
    activeLayoutKind: "auto" as const,
  } satisfies PadPilotInputDeviceState;
}

export function filterAnalyzerNoteEventsForSensitivity(
  noteEvents: ReturnType<typeof createSeedAnalyzerNoteEvents>,
  detectionSensitivity: number,
) {
  const threshold = 0.7 - clamp(detectionSensitivity, 0, 1) * 0.55;
  return noteEvents.filter((event) => event.intensity >= threshold);
}
