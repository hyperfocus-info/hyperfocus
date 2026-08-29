import type { PadPilotControllerConfigState } from "./padpilot/controller-config";
import type { PadPilotInputDeviceState } from "./padpilot/io/input-device";

// Bridge messages stay UI-agnostic; button/accessibility policy belongs in shared UI elements.
export type HostIntent =
  | { type: "ready" }
  | { type: "createModule"; name: string }
  | { type: "selectModule"; moduleId: string }
  | { type: "selectPreset"; presetId: string }
  | { type: "setModuleState"; moduleId: string; payload: string }
  | { type: "setModuleStateProto"; moduleId: string; payloadBase64: string; revision: string }
  | { type: "setControllerConfig"; payloadBase64: string }
  | { type: "setEditorViewState"; scopeId: string; payload: string }
  | { type: "setDiagnosticsVisible"; visible: boolean }
  | { type: "openCapabilityStream"; capability: CapabilityKind; handle: string }
  | { type: "closeCapabilityStream"; capability: CapabilityKind; handle: string }
  | { type: "sendCapabilityIntent"; capability: CapabilityKind; handle: string; action: string; payloadBase64: string };

export type CapabilityKind =
  | "sample-source"
  | "sample-analysis"
  | "slice-playback"
  | "haptics"
  | "analyzer-feed"
  | "analyzer-session"
  | "midi-export"
  | "host-tempo"
  | "fx-graph"
  | "fx-visualizer"
  | "automation"
  | "keyboard-output"
  | "midi-output"
  | "module-state";

export type CoalescedCapabilityIntent = Extract<HostIntent, { type: "sendCapabilityIntent" }> & {
  capability: "automation";
  action: "update-touch";
};

export type NativePromiseListener = {
  reject: (error: Error) => void;
  resolve: (payload: unknown) => void;
  timeoutHandle?: number;
};

export type HostState = {
  acceptedRevision?: bigint;
  activeModuleId?: string;
  activeModuleStateBase64?: string;
  controller?: {
    connected: boolean;
    frameIndex: number;
    axes: number[];
    buttons: number[];
  };
  controllerConfig?: PadPilotControllerConfigState;
  inputDevices?: PadPilotInputDeviceState[];
  editorViewStates?: Record<string, unknown>;
  moduleStates?: Record<string, unknown>;
  modules?: Array<{
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
  }>;
  path?: string;
  contentId?: string;
  name?: string;
  pathSelectionSequence?: number;
  presets?: Array<{ id: string; name: string }>;
  runtimeDiagnostics?: {
    avgBlockUs: number;
    avgConvolverUs: number;
    avgDelayUs: number;
    avgEqUs: number;
    avgModulationUs: number;
    avgReverbCoreUs: number;
    avgReverbMixUs: number;
    avgReverbPreDelayUs: number;
    avgReverbUs: number;
    audioCommandsRejected: number;
    analyzerAudioSlicesDropped: number;
    analyzerAudioSlicesPushed: number;
    chains: Array<{
      active: boolean;
      activeNodeCount: number;
      avgChainUs: number;
      chainId: number;
      inputPeakDb: number;
      muted: boolean;
      outputPeakDb: number;
      solo: boolean;
    }>;
    convolverPeakDb: number;
    delayPeakDb: number;
    eqPeakDb: number;
    inputCommandsDropped: number;
    inputCommandsPushed: number;
    inputEventsDropped: number;
    inputEventsPushed: number;
    inputWakeups: number;
    modulationPeakDb: number;
    outputPeakDb: number;
    profiledBlocks: number;
    profilingEnabled: boolean;
    reverbPeakDb: number;
    scriptCommandsDropped: number;
    scriptCommandsPushed: number;
    scriptEventsProcessed: number;
    scriptWakeups: number;
    uiAudioCommandsDropped: number;
    uiAudioCommandsPushed: number;
  };
  selectedModuleId?: string;
  selectedPresetId?: string;
  projectBpm?: number;
  type?: string;
  visualizerFrameBase64?: string;
  capabilityFrameEnvelopeBase64?: string;
};

export type RuntimeHostMode = "plugin" | "standalone";

export type PadPilotRuntimeInfo = {
  arch: string;
  canApplyUpdates: boolean;
  currentVersion: string;
  defaultInstallPath: string | null;
  hostMode: RuntimeHostMode;
  installPath: string | null;
  platform: string;
};

export type StagePluginUpdateInput = {
  artifactChecksumSha256: string;
  artifactUrl: string;
  currentVersion: string;
  manifestChecksumSha256: string;
  manifestSignature: string | null;
  manifestUrl: string;
  releaseNotes: string;
  targetVersion: string;
};

export type StagedPluginUpdate = {
  hostMode: RuntimeHostMode;
  logPath: string;
  message: string;
  targetVersion: string;
};

export type HostFilePickOptions = {
  initialPath?: string;
  patterns?: string;
  title?: string;
};

export type HostFilePickResult = {
  cancelled: boolean;
  path: string;
};

export type HostFileImportOptions = {
  category?: string;
  maxBytes?: number;
};

export type HostImportedFile = {
  byteSize: number;
  contentId: string;
  mimeType: string;
  name: string;
  path: string;
};

export type InstalledModuleResult = {
  capabilities?: string[];
  id: string;
  loadStatus?: string;
  loadErrorMessage?: string;
  name: string;
  expectedModuleVersion?: string;
  resolvedModuleVersion?: string;
  scriptEntryPath?: string;
  uiEntryPath?: string;
  version?: string;
};

export type HostTransport = {
  isAvailable: () => boolean;
  sendIntent: (intent: HostIntent) => void;
  subscribe: (listener: (state: HostState) => void) => () => void;
};

export type CapabilityStreamFrame = {
  capability: CapabilityKind;
  handle: string;
  payloadBase64: string;
  payloadType: string;
  sequence: bigint;
};
