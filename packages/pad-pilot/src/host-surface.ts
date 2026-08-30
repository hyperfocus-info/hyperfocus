import type {
  PadPilotInstalledModuleSummary,
  PadPilotModuleStateCodec,
} from "./module-ui-contract";

export const PADPILOT_HOST_SURFACE_VERSION = "0.1.0";

export type PadPilotAccessor<T> = () => T;
export type PadPilotStateUpdater<T> = (next: Partial<T>) => void;
export type PadPilotUnsubscribe = () => void;

export type PadPilotCloseableSubscription = {
  close: () => void;
  isClosed: () => boolean;
};

export type PadPilotControllerLayoutKind =
  | "auto"
  | "xbox"
  | "playstation"
  | "switch"
  | "generic"
  | "custom";

export type PadPilotGamepadState = {
  axes: number[];
  buttons: number[];
  connected: boolean;
  id: string;
};

export type PadPilotInputDeviceState = {
  activeLayoutKind: PadPilotControllerLayoutKind;
  axes: number[];
  buttons: number[];
  connected: boolean;
  detectedLayoutKind: PadPilotControllerLayoutKind;
  deviceId: string;
  deviceKind: "unknown" | "gamepad";
  displayName: string;
  frameIndex: number;
  hardwareId: string;
  rawAxes: number[];
  rawButtons: number[];
  runtimeDeviceId: string;
};

export type PadPilotHostFileImportOptions = {
  category?: string;
  maxBytes?: number;
};

export type PadPilotHostFilePickOptions = {
  patterns?: string;
  title?: string;
};

export type PadPilotHostImportedFile = {
  byteSize: number;
  contentId: string;
  mimeType: string;
  name: string;
  path: string;
};

export type PadPilotAnalyzerKeyMatch = {
  confidence: number;
  label: string;
};

export type PadPilotAnalyzerFeedNoteEvent = {
  confidence: number;
  corrected: boolean;
  detectedMidiNote: number;
  endFrame: number;
  eventId: string;
  intensity: number;
  meanFrequencyHz: number;
  midiNote: number;
  startFrame: number;
  velocity: number;
};

export type PadPilotAnalyzerFeedFrame = {
  alternateKeyMatches: PadPilotAnalyzerKeyMatch[];
  currentLevel: number;
  detectionSensitivity: number;
  frameCount: number;
  hasTake: boolean;
  laneEnergies: number[];
  maxMidiNote: number | null;
  minMidiNote: number | null;
  noteEvents: PadPilotAnalyzerFeedNoteEvent[];
  primaryKeyMatch: PadPilotAnalyzerKeyMatch | null;
  status: "idle" | "capturing";
  takeDurationSeconds: number | null;
  tuningHz: number;
};

export type PadPilotAgentProvider = string;

export type PadPilotAgentRequest<
  Signal = unknown,
  Provider extends string = PadPilotAgentProvider,
> = {
  agent?: string;
  endpoint?: string;
  model?: string;
  prompt: string;
  provider?: Provider;
  responseSchema?: unknown;
  responseSchemaName?: string;
  signal?: Signal;
  stream?: false;
  system?: string;
  timeoutMs?: number;
};

export type PadPilotAgentSource = "dev-agent" | "local-runtime" | "remote-agent";

export type PadPilotAgentResponse<
  Provider extends string = PadPilotAgentProvider,
  Source extends PadPilotAgentSource = PadPilotAgentSource,
> = {
  model: string;
  provider: Provider;
  source: Source;
  text: string;
};

export type PadPilotProducerMidiEvent = {
  channel: number;
  controller?: number;
  note?: number;
  sampleOffset?: number;
  type: "cc" | "note-off" | "note-on";
  value?: number;
  velocity?: number;
};

export type PadPilotProducerActionsOptions = {
  onMidiEvent?: (event: PadPilotProducerMidiEvent) => void;
  setProfile?: (profile: string) => void;
};

export type PadPilotProducerActions = {
  automation: {
    begin: (parameterId: string) => boolean;
    end: (parameterId: string) => boolean;
    releaseAll: () => void;
    update: (parameterId: string, normalizedValue: number) => boolean;
  };
  dispose: () => void;
  keyboard: { execute: (shortcuts: string[]) => boolean };
  midi: {
    cc: (controller: number, value: number, channel?: number, sampleOffset?: number) => boolean;
    noteOff: (note: number, velocity?: number, channel?: number, sampleOffset?: number) => boolean;
    noteOn: (note: number, velocity?: number, channel?: number, sampleOffset?: number) => boolean;
    releaseAll: () => void;
  };
  profile: { select: (profile: string) => boolean };
  stateComparison: {
    capture: (slot: "a" | "b") => boolean;
    recall: (slot: "a" | "b") => boolean;
    toggle: () => boolean;
  };
  transport: { executeShortcut: (shortcut: string) => boolean };
};

export type PadPilotFxAutomationBinding = {
  chainId: number;
  controlKey: string;
  displayName: string;
  maxValue: number;
  minValue: number;
  moduleId: string;
  nodeId: number;
  parameterId: number;
  slotIndex: number;
  targetKind: "masterInputGain" | "masterOutputGain" | "masterWetDry" | "fxChainMix" | "fxNodeMix" | "fxNodeParamFloat";
  valueKind: "float" | "boolean";
};

export type PadPilotModuleHostSurface = {
  hooks: {
    useEditorViewState: <T>(scopeId: string, fallback: T) => readonly [PadPilotAccessor<T>, PadPilotStateUpdater<T>];
    useModuleInteraction: (moduleId: string) => { begin: () => void; end: () => void };
    useModuleState: <T>(moduleId: string, fallback: T) => readonly [PadPilotAccessor<T>, PadPilotStateUpdater<T>];
  };
  modules: {
    getActiveModule: () => PadPilotInstalledModuleSummary | null;
    installBundle: (bundlePath?: string) => Promise<PadPilotInstalledModuleSummary | null>;
    listInstalled: () => PadPilotInstalledModuleSummary[];
  };
  registerModuleStateCodec: <T>(moduleId: string, codec: PadPilotModuleStateCodec<T>) => void;
};

export type PadPilotServiceHostSurface<
  FileInput = string,
  Signal = unknown,
  ControllerConfig = unknown,
  FxState = unknown,
  FxFrame = unknown,
  SampleFrame = unknown,
  AgentProvider extends string = PadPilotAgentProvider,
  AgentSource extends PadPilotAgentSource = PadPilotAgentSource,
> = PadPilotModuleHostSurface & {
  IO: {
    bindController: (callback: (state: PadPilotGamepadState) => void) => PadPilotUnsubscribe;
    bindInputDevices: (callback: (devices: PadPilotInputDeviceState[]) => void) => PadPilotUnsubscribe;
    importFile: (input: FileInput, options?: PadPilotHostFileImportOptions) => Promise<PadPilotHostImportedFile>;
    pickFile: (options?: PadPilotHostFilePickOptions) => Promise<string | null>;
  };
  agent: {
    ask: (
      request: PadPilotAgentRequest<Signal, AgentProvider>,
    ) => Promise<PadPilotAgentResponse<AgentProvider, AgentSource>>;
  };
  analyzer: {
    beginMidiDrag: (midiData?: Uint8Array, filename?: string) => void;
    correctNote: (eventId: string | bigint, midiNote: number) => void;
    getCachedFrame: () => PadPilotAnalyzerFeedFrame | null;
    resetNoteCorrection: (eventId: string | bigint) => void;
    saveMidi: () => void;
    setDetectionSensitivity: (value: number) => void;
    setTuningHz: (value: number) => void;
    startCapture: (options?: { mode?: "overwrite" | "append" }) => void;
    stopCapture: () => void;
    subscribe: (options: { onFrame: (frame: PadPilotAnalyzerFeedFrame) => void }) => PadPilotCloseableSubscription;
  };
  capabilities: {
    fxGraph: {
      applyState: (state: FxState, moduleId?: string) => void;
      beginAutomationTouch: (parameterId: string, moduleId?: string) => void;
      createPreset: (name: string, state: FxState, presetId?: string, moduleId?: string) => void;
      endAutomationTouch: (parameterId: string, moduleId?: string) => void;
      focusAutomationTarget: (binding: PadPilotFxAutomationBinding, moduleId?: string) => void;
      getActiveState: (moduleId?: string) => FxState | null;
      savePreset: (name: string, state: FxState, presetId?: string, moduleId?: string) => void;
      setMasterWetDry: (value: number, moduleId?: string) => void;
      setPreviewBypass: (bypassed: boolean, moduleId?: string) => void;
      updateAutomationTouch: (parameterId: string, normalizedValue: number, moduleId?: string) => void;
    };
    fxVisualizer: {
      getCachedFrame: () => FxFrame | null;
      subscribe: (options: { onFrame: (frame: FxFrame) => void }) => PadPilotCloseableSubscription;
    };
    haptics: {
      create: (moduleId: string, slot?: string) => string;
      pulse: (handle: string, intent: Record<string, unknown>) => void;
    };
    sampleAnalysis: {
      create: (moduleId: string, slot?: string) => string;
      openEditorFrameStream: (handle: string, listener: (frame: SampleFrame) => void) => PadPilotUnsubscribe;
      requestTransientSlices: (handle: string, windowSize: number, options?: Record<string, unknown>) => void;
      requestWaveform: (handle: string, windowSize: number, options?: Record<string, unknown>) => void;
    };
    sampleSource: {
      create: (moduleId: string, slot?: string) => string;
      loadFile: (handle: string, request: { sourceContentId?: string; sourceName?: string; sourcePath: string }) => void;
    };
    slicePlayback: {
      applyState: (handle: string, state: Record<string, unknown>) => void;
      create: (moduleId: string, slot?: string) => string;
      editSlice: (handle: string, intent: Record<string, unknown>) => void;
      triggerPad: (handle: string, padIndex: number, velocity?: number, pressed?: boolean) => void;
    };
  };
  createProducerActions: (moduleId: string, options?: PadPilotProducerActionsOptions) => PadPilotProducerActions;
  hooks: PadPilotModuleHostSurface["hooks"] & {
    useAnalyzerFeed: (options: { onFrame: (frame: PadPilotAnalyzerFeedFrame) => void }) => void;
    useControllerConfig: () => { config: PadPilotAccessor<ControllerConfig>; setConfig: (next: ControllerConfig) => void };
    useGamepad: () => PadPilotAccessor<PadPilotGamepadState>;
    useInputDevices: () => PadPilotAccessor<PadPilotInputDeviceState[]>;
    useProfile: () => { profile: PadPilotAccessor<string>; setProfile: (profile: string) => void };
  };
  host: { getProjectBpm: () => number; setTempo: (bpm: number) => boolean };
  midi: { beginDrag: (midiData: Uint8Array, filename?: string) => boolean };
};
