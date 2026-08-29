import {
  ParentProps,
  createContext,
  createEffect,
  createMemo,
  onCleanup,
  useContext,
} from "solid-js";
import { createStore } from "solid-js/store";
import { PadPilot } from "../../padpilot/index";
import {
  ANALYZER_DEFAULT_DETECTION_SENSITIVITY,
  ANALYZER_MAX_DETECTION_SENSITIVITY,
  ANALYZER_MAX_TUNING_HZ,
  ANALYZER_MIN_DETECTION_SENSITIVITY,
  ANALYZER_MIN_TUNING_HZ,
  clampDetectionSensitivity,
  detectionSensitivityLabel,
  midiNoteLabel,
  tuningLabel,
} from "./analyzer-state";
import type { AnalyzerFeedFrame } from "../../padpilot/analyzer";

const ANALYZER_SENSITIVITY_DEBOUNCE_MS = 180;

function createEmptyFeedFrame() {
  return {
    status: "idle",
    currentLevel: 0,
    tuningHz: 440,
    detectionSensitivity: ANALYZER_DEFAULT_DETECTION_SENSITIVITY,
    laneEnergies: [],
    minMidiNote: null,
    maxMidiNote: null,
    primaryKeyMatch: null,
    alternateKeyMatches: [],
    hasTake: false,
    takeDurationSeconds: null,
    frameCount: 0,
    noteEvents: [],
  } satisfies AnalyzerFeedFrame;
}

function resolveLaneRange(frame: AnalyzerFeedFrame) {
  const minMidiNote = frame.minMidiNote === null ? 24 : Math.max(0, frame.minMidiNote - 1);
  const maxMidiNote = frame.maxMidiNote === null ? 108 : Math.min(127, frame.maxMidiNote + 1);
  return { minMidiNote, maxMidiNote };
}

function createAnalyzerModuleStore() {
  let detectionSensitivityTimeout: number | null = null;
  const [viewState, setViewState] = PadPilot.hooks.useEditorViewState<{ appendEnabled: boolean }>("analyzer-controls", {
    appendEnabled: false,
  });
  const [state, setState] = createStore({
    host: {
      frame: PadPilot.analyzer.getCachedFrame() ?? createEmptyFeedFrame(),
    },
    ui: {
      autoCaptureIssued: false,
      hostReady: false,
      pendingDetectionSensitivity: null as number | null,
    },
  });

  const clearDetectionSensitivityTimeout = () => {
    if (detectionSensitivityTimeout === null) {
      return;
    }
    window.clearTimeout(detectionSensitivityTimeout);
    detectionSensitivityTimeout = null;
  };

  const clearPendingDetectionSensitivity = () => {
    clearDetectionSensitivityTimeout();
    setState("ui", "pendingDetectionSensitivity", null);
  };

  const queueDetectionSensitivityCommit = (value: number) => {
    clearDetectionSensitivityTimeout();
    detectionSensitivityTimeout = window.setTimeout(() => {
      detectionSensitivityTimeout = null;
      PadPilot.analyzer.setDetectionSensitivity(value);
    }, ANALYZER_SENSITIVITY_DEBOUNCE_MS);
  };

  PadPilot.hooks.useAnalyzerFeed({
    onFrame(frame) {
      setState("host", "frame", {
        ...frame,
        laneEnergies: [...frame.laneEnergies],
        alternateKeyMatches: [...frame.alternateKeyMatches],
        noteEvents: [...frame.noteEvents],
      });
      setState("ui", "hostReady", true);
    },
  });

  onCleanup(() => {
    clearDetectionSensitivityTimeout();
  });

  createEffect(() => {
    if (state.ui.autoCaptureIssued) {
      return;
    }
    if (!state.ui.hostReady) {
      return;
    }
    if (state.host.frame.status === "capturing" || state.host.frame.hasTake) {
      return;
    }
    setState("ui", "autoCaptureIssued", true);
    PadPilot.analyzer.startCapture({ mode: "overwrite" });
  });

  const hasTake = createMemo(() => state.host.frame.hasTake);
  const recordEnabled = createMemo(() => state.host.frame.status === "capturing");
  const exportEnabled = createMemo(() => state.host.frame.status === "idle" && hasTake());
  const appendEnabled = createMemo(() => viewState().appendEnabled);
  const effectiveDetectionSensitivity = createMemo(() => state.ui.pendingDetectionSensitivity ?? state.host.frame.detectionSensitivity);
  const reanalyzing = createMemo(() => state.ui.pendingDetectionSensitivity !== null && hasTake() && !recordEnabled());

  createEffect(() => {
    const pendingDetectionSensitivity = state.ui.pendingDetectionSensitivity;
    if (pendingDetectionSensitivity === null) {
      return;
    }
    if (Math.abs(state.host.frame.detectionSensitivity - pendingDetectionSensitivity) > 0.001) {
      return;
    }
    setState("ui", "pendingDetectionSensitivity", null);
  });

  createEffect(() => {
    if (recordEnabled() || hasTake() || !appendEnabled()) {
      return;
    }
    setViewState({ appendEnabled: false });
  });

  const appendToggleDisabledReason = createMemo(() => {
    if (recordEnabled()) {
      return "Stop recording to change capture mode.";
    }
    if (!hasTake()) {
      return "Append needs an existing take.";
    }
    return undefined;
  });
  const exportDisabledReason = createMemo(() => {
    if (recordEnabled()) {
      return "Stop recording to export MIDI.";
    }
    if (!hasTake()) {
      return "Record a take to enable MIDI export.";
    }
    return undefined;
  });

  const actions = {
    correctNote(eventId: string, midiNote: number) {
      if (recordEnabled() || !Number.isInteger(midiNote) || midiNote < 0 || midiNote > 127) {
        return;
      }
      PadPilot.analyzer.correctNote(eventId, midiNote);
    },
    requestMidiDrag() {
      if (!exportEnabled()) {
        return;
      }
      PadPilot.analyzer.beginMidiDrag();
    },
    requestMidiSave() {
      if (!exportEnabled()) {
        return;
      }
      PadPilot.analyzer.saveMidi();
    },
    setAppendEnabled(enabled: boolean) {
      if (recordEnabled() || (enabled && !hasTake())) {
        return;
      }
      setViewState({ appendEnabled: enabled });
    },
    setDetectionSensitivity(value: number) {
      const nextValue = clampDetectionSensitivity(value);
      setState("ui", "pendingDetectionSensitivity", nextValue);
      queueDetectionSensitivityCommit(nextValue);
    },
    setTuning(value: number) {
      PadPilot.analyzer.setTuningHz(value);
    },
    resetNoteCorrection(eventId: string) {
      if (recordEnabled()) {
        return;
      }
      PadPilot.analyzer.resetNoteCorrection(eventId);
    },
    toggleRecord() {
      if (recordEnabled()) {
        PadPilot.analyzer.stopCapture();
        return;
      }
      clearPendingDetectionSensitivity();
      PadPilot.analyzer.startCapture({
        mode: appendEnabled() && hasTake() ? "append" : "overwrite",
      });
    },
  };

  const derived = {
    alternateMatchLabels: createMemo(() =>
      state.host.frame.alternateKeyMatches.map((match) => ({
        confidence: `${Math.round(match.confidence * 100)}%`,
        label: match.label,
      })),
    ),
    appendEnabled,
    appendToggleDisabledReason,
    detectedKeyLabel: createMemo(() => (reanalyzing() ? "Reanalyzing..." : state.host.frame.primaryKeyMatch?.label ?? "No key detected")),
    detectionSensitivityLabel: createMemo(() => detectionSensitivityLabel(effectiveDetectionSensitivity())),
    detectionSensitivityMax: ANALYZER_MAX_DETECTION_SENSITIVITY,
    detectionSensitivityMin: ANALYZER_MIN_DETECTION_SENSITIVITY,
    detectionSensitivityPercent: createMemo(() => Math.round(effectiveDetectionSensitivity() * 100)),
    exportDisabledReason,
    exportEnabled,
    frameCount: createMemo(() => Math.max(state.host.frame.frameCount, 1)),
    hasTake,
    laneRange: createMemo(() => resolveLaneRange(state.host.frame)),
    levelPercent: createMemo(() => Math.round(state.host.frame.currentLevel * 100)),
    primaryConfidence: createMemo(() => `${Math.round((state.host.frame.primaryKeyMatch?.confidence ?? 0) * 100)}%`),
    reviewEvents: createMemo(() =>
      [...state.host.frame.noteEvents]
        .sort((left, right) => left.confidence - right.confidence || left.startFrame - right.startFrame)
        .slice(0, 8)
        .map((event) => ({
          ...event,
          confidenceLabel: `${Math.round(event.confidence * 100)}% confidence`,
          detectedNoteLabel: midiNoteLabel(event.detectedMidiNote),
          noteLabel: midiNoteLabel(event.midiNote),
        })),
    ),
    reanalyzing,
    recordEnabled,
    tuningLabel: createMemo(() => tuningLabel(state.host.frame.tuningHz)),
    tuningMax: ANALYZER_MAX_TUNING_HZ,
    tuningMin: ANALYZER_MIN_TUNING_HZ,
  };

  return {
    actions,
    derived,
    state,
  };
}

const AnalyzerModuleStoreContext = createContext<ReturnType<typeof createAnalyzerModuleStore>>();

export function AnalyzerModuleStoreProvider(props: ParentProps) {
  const store = createAnalyzerModuleStore();
  return (
    <AnalyzerModuleStoreContext.Provider value={store}>
      {props.children}
    </AnalyzerModuleStoreContext.Provider>
  );
}

export function useAnalyzerModuleStore() {
  const value = useContext(AnalyzerModuleStoreContext);
  if (!value) {
    throw new Error("useAnalyzerModuleStore must be used inside AnalyzerModuleStoreProvider.");
  }
  return value;
}
