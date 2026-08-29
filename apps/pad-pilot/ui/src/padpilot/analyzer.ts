import { onCleanup } from "solid-js";
import { textToBase64 } from "../proto/base64";
import {
  getCachedCapabilityStreamPayload,
  getLatestHostState,
  isBoundedHostProtoPayload,
  subscribeCapabilityStream,
  subscribeHostState,
} from "../bridge";
import { moduleSdk } from "../module-sdk";
import { midi } from "./midi";
import { clamp01 } from "../utils/math";
import {
  ANALYZER_DEFAULT_DETECTION_SENSITIVITY,
  ANALYZER_DEFAULT_TUNING_HZ,
  clampDetectionSensitivity,
  clampTuningHz,
  decodeAnalyzerFrameBase64,
  decodeAnalyzerModuleStateBase64,
  formatScaleLabel,
  type AnalyzerFrame,
  type AnalyzerModuleState,
  type AnalyzerNoteEvent,
  type AnalyzerScaleMatch,
} from "../modules/analyzer/analyzer-state";
import {
  createCapabilityHandle,
  resolveSelectedCapabilityModuleId,
} from "@hyperfocus/pad-pilot/module-identity";

export type AnalyzerKeyMatch = {
  label: string;
  confidence: number;
};

export type AnalyzerFeedNoteEvent = {
  eventId: string;
  midiNote: number;
  detectedMidiNote: number;
  startFrame: number;
  endFrame: number;
  intensity: number;
  confidence: number;
  corrected: boolean;
  velocity: number;
  meanFrequencyHz: number;
};

export type AnalyzerFeedFrame = {
  status: "idle" | "capturing";
  currentLevel: number;
  tuningHz: number;
  detectionSensitivity: number;
  laneEnergies: number[];
  minMidiNote: number | null;
  maxMidiNote: number | null;
  primaryKeyMatch: AnalyzerKeyMatch | null;
  alternateKeyMatches: AnalyzerKeyMatch[];
  hasTake: boolean;
  takeDurationSeconds: number | null;
  frameCount: number;
  noteEvents: AnalyzerFeedNoteEvent[];
};

export type AnalyzerSubscription = {
  close: () => void;
  isClosed: () => boolean;
};

type AnalyzerStateCache = {
  frame: AnalyzerFrame | null;
  moduleState: AnalyzerModuleState | null;
  mappedFrame: AnalyzerFeedFrame | null;
};

const analyzerStateCache: AnalyzerStateCache = {
  frame: null,
  moduleState: null,
  mappedFrame: null,
};

const analyzerSubscribers = new Set<(frame: AnalyzerFeedFrame) => void>();
let analyzerStreamUnsubscribe: (() => void) | null = null;
let analyzerHostStateUnsubscribe: (() => void) | null = null;
let analyzerFeedHandle = "";

function decodeAnalyzerModuleStateSafely(payloadBase64: string) {
  if (!isBoundedHostProtoPayload(payloadBase64)) {
    return null;
  }
  try {
    return decodeAnalyzerModuleStateBase64(payloadBase64);
  } catch {
    return null;
  }
}

function decodeAnalyzerFrameSafely(payloadBase64: string) {
  if (!isBoundedHostProtoPayload(payloadBase64)) {
    return null;
  }
  try {
    return decodeAnalyzerFrameBase64(payloadBase64);
  } catch {
    return null;
  }
}

function getSelectedAnalyzerModuleId() {
  return resolveSelectedCapabilityModuleId(getLatestHostState(), [
    "analyzer-feed",
    "analyzer-session",
    "midi-export",
  ]);
}

function formatPitchClass(rootPitchClass: number) {
  const pitchClassNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return pitchClassNames[rootPitchClass] ?? "?";
}

function mapScaleMatch(match: AnalyzerScaleMatch | null | undefined) {
  if (!match || match.scaleId.length === 0) {
    return null;
  }

  return {
    confidence: match.confidence,
    label: `${formatPitchClass(match.rootPitchClass)} ${formatScaleLabel(match.scaleId)}`,
  } satisfies AnalyzerKeyMatch;
}

function mapNoteEvent(noteEvent: AnalyzerNoteEvent) {
  return {
    confidence: clamp01(noteEvent.confidence),
    corrected: noteEvent.midiNote !== noteEvent.detectedMidiNote,
    detectedMidiNote: noteEvent.detectedMidiNote,
    eventId: noteEvent.eventId.toString(),
    midiNote: noteEvent.midiNote,
    startFrame: noteEvent.startFrame,
    endFrame: noteEvent.endFrame,
    intensity: noteEvent.intensity,
    velocity: noteEvent.velocity,
    meanFrequencyHz: noteEvent.meanFrequencyHz,
  } satisfies AnalyzerFeedNoteEvent;
}

function resolveMinMidiNote(moduleState: AnalyzerModuleState | null, frame: AnalyzerFrame | null) {
  const candidates = [moduleState?.takeSummary?.minMidiNote ?? 0, frame?.minMidiNote ?? 0].filter((value) => value > 0);
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

function resolveMaxMidiNote(moduleState: AnalyzerModuleState | null, frame: AnalyzerFrame | null) {
  const candidates = [moduleState?.takeSummary?.maxMidiNote ?? 0, frame?.maxMidiNote ?? 0].filter((value) => value > 0);
  return candidates.length > 0 ? Math.max(...candidates) : null;
}

function mapAnalyzerFeedFrame() {
  const { frame, moduleState } = analyzerStateCache;
  const topMatches = moduleState?.takeSummary?.topMatches ?? [];
  const alternateMatches = frame?.alternateMatches.length ? frame.alternateMatches : topMatches.slice(1);
  const mappedAlternateKeyMatches: AnalyzerKeyMatch[] = [];
  const hasTake = (moduleState?.noteEvents.length ?? 0) > 0 || ((frame?.frameCount ?? 0) > 0 && !frame?.recording);
  for (const match of alternateMatches) {
    const mappedMatch = mapScaleMatch(match);
    if (mappedMatch) {
      mappedAlternateKeyMatches.push(mappedMatch);
    }
  }

  return {
    status: frame?.recording ? "capturing" : "idle",
    currentLevel: frame?.currentLevel ?? 0,
    tuningHz: clampTuningHz(frame?.tuningHz ?? moduleState?.tuningHz ?? ANALYZER_DEFAULT_TUNING_HZ),
    detectionSensitivity: clampDetectionSensitivity(
      frame?.detectionSensitivity ??
        moduleState?.detectionSensitivity ??
        ANALYZER_DEFAULT_DETECTION_SENSITIVITY,
    ),
    laneEnergies: [...(frame?.laneEnergies ?? [])],
    minMidiNote: resolveMinMidiNote(moduleState, frame),
    maxMidiNote: resolveMaxMidiNote(moduleState, frame),
    primaryKeyMatch: mapScaleMatch(frame?.primaryMatch ?? topMatches[0] ?? null),
    alternateKeyMatches: mappedAlternateKeyMatches,
    hasTake,
    takeDurationSeconds: moduleState?.takeSummary?.durationSeconds ?? frame?.durationSeconds ?? null,
    frameCount: Math.max(moduleState?.takeSummary?.frameCount ?? 0, frame?.frameCount ?? 0),
    noteEvents: (moduleState?.noteEvents ?? []).map(mapNoteEvent),
  } satisfies AnalyzerFeedFrame;
}

function publishMappedAnalyzerFrame() {
  analyzerStateCache.mappedFrame = mapAnalyzerFeedFrame();
  for (const listener of analyzerSubscribers) {
    try {
      listener(analyzerStateCache.mappedFrame!);
    } catch {
      // One Module subscriber cannot block the shared analyzer feed.
    }
  }
}

function ensureAnalyzerSnapshotFromHostState() {
  const hostState = getLatestHostState();
  const analyzerModuleId = getSelectedAnalyzerModuleId();
  if (!analyzerModuleId) {
    analyzerStateCache.frame = null;
    analyzerStateCache.moduleState = null;
    analyzerStateCache.mappedFrame = null;
    return;
  }
  const activeModuleId = hostState.activeModuleId ?? hostState.selectedModuleId ?? "";
  if (
    analyzerModuleId.length > 0 &&
    activeModuleId === analyzerModuleId &&
    hostState.activeModuleStateBase64
  ) {
    const moduleState = decodeAnalyzerModuleStateSafely(hostState.activeModuleStateBase64);
    if (moduleState) {
      analyzerStateCache.moduleState = moduleState;
    }
  }

  const capabilityHandle = createCapabilityHandle("analyzer-feed", analyzerModuleId);
  const capabilityFrame = capabilityHandle ? getCachedCapabilityStreamPayload("analyzer-feed", capabilityHandle) : null;
  const capabilityFrameBase64 =
    capabilityFrame?.payloadType === "AnalyzerFrame" && capabilityFrame.payloadBase64.length > 0
      ? capabilityFrame.payloadBase64
      : null;
  if (capabilityFrameBase64) {
    const frame = decodeAnalyzerFrameSafely(capabilityFrameBase64);
    if (frame) {
      analyzerStateCache.frame = frame;
    }
  }

  if (analyzerStateCache.moduleState || analyzerStateCache.frame) {
    analyzerStateCache.mappedFrame = mapAnalyzerFeedFrame();
  }
}

function syncAnalyzerFeedSubscription() {
  const nextModuleId = getSelectedAnalyzerModuleId();
  const nextHandle = createCapabilityHandle("analyzer-feed", nextModuleId);
  if (nextHandle === analyzerFeedHandle) {
    return;
  }

  analyzerStreamUnsubscribe?.();
  analyzerStreamUnsubscribe = null;
  analyzerFeedHandle = nextHandle;
  analyzerStateCache.frame = null;
  analyzerStateCache.moduleState = null;
  analyzerStateCache.mappedFrame = null;
  if (!nextHandle) {
    return;
  }

  analyzerStreamUnsubscribe = subscribeCapabilityStream("analyzer-feed", nextHandle, (frame) => {
    if (frame.payloadType !== "AnalyzerFrame" || frame.payloadBase64.length === 0) {
      return;
    }
    const decodedFrame = decodeAnalyzerFrameSafely(frame.payloadBase64);
    if (!decodedFrame) {
      return;
    }
    analyzerStateCache.frame = decodedFrame;
    publishMappedAnalyzerFrame();
  });
}

function ensureAnalyzerWiring() {
  if (analyzerHostStateUnsubscribe === null) {
    analyzerHostStateUnsubscribe = subscribeHostState((hostState) => {
      if (hostState.selectedModuleId !== undefined || hostState.modules !== undefined) {
        syncAnalyzerFeedSubscription();
      }
      const analyzerModuleId = getSelectedAnalyzerModuleId();
      const activeModuleId = hostState.activeModuleId ?? hostState.selectedModuleId ?? "";
      if (
        analyzerModuleId.length === 0 ||
        activeModuleId !== analyzerModuleId ||
        !hostState.activeModuleStateBase64
      ) {
        return;
      }
      const moduleState = decodeAnalyzerModuleStateSafely(hostState.activeModuleStateBase64);
      if (!moduleState) {
        return;
      }
      analyzerStateCache.moduleState = moduleState;
      publishMappedAnalyzerFrame();
    });
  }

  syncAnalyzerFeedSubscription();
}

function releaseAnalyzerWiringIfIdle() {
  if (analyzerSubscribers.size > 0) {
    return;
  }

  analyzerStreamUnsubscribe?.();
  analyzerStreamUnsubscribe = null;
  analyzerFeedHandle = "";
  analyzerHostStateUnsubscribe?.();
  analyzerHostStateUnsubscribe = null;
  analyzerStateCache.frame = null;
  analyzerStateCache.moduleState = null;
  analyzerStateCache.mappedFrame = null;
}

export const analyzer = {
  subscribe(options: { onFrame: (frame: AnalyzerFeedFrame) => void }) {
    ensureAnalyzerSnapshotFromHostState();
    ensureAnalyzerWiring();
    analyzerSubscribers.add(options.onFrame);

    if (analyzerStateCache.mappedFrame) {
      try {
        options.onFrame(analyzerStateCache.mappedFrame);
      } catch {
        // Public Module listener failure cannot leak analyzer wiring.
      }
    }

    let closed = false;
    return {
      close() {
        if (closed) {
          return;
        }
        closed = true;
        analyzerSubscribers.delete(options.onFrame);
        releaseAnalyzerWiringIfIdle();
      },
      isClosed() {
        return closed;
      },
    } satisfies AnalyzerSubscription;
  },
  startCapture(options?: { mode?: "overwrite" | "append" }) {
    ensureAnalyzerWiring();
    const moduleId = getSelectedAnalyzerModuleId();
    if (!moduleId) {
      return;
    }
    moduleSdk.sendCapabilityIntent(
      "analyzer-session",
      createCapabilityHandle("analyzer-session", moduleId),
      "start-capture",
      textToBase64(options?.mode ?? "overwrite"),
    );
  },
  stopCapture() {
    const moduleId = getSelectedAnalyzerModuleId();
    if (!moduleId) {
      return;
    }
    moduleSdk.sendCapabilityIntent(
      "analyzer-session",
      createCapabilityHandle("analyzer-session", moduleId),
      "stop-capture",
      "",
    );
  },
  setTuningHz(tuningHz: number) {
    const clampedTuningHz = clampTuningHz(tuningHz);
    const moduleId = getSelectedAnalyzerModuleId();
    if (!moduleId) {
      return;
    }
    moduleSdk.sendCapabilityIntent(
      "analyzer-session",
      createCapabilityHandle("analyzer-session", moduleId),
      "set-tuning-hz",
      textToBase64(String(clampedTuningHz)),
    );
  },
  setDetectionSensitivity(detectionSensitivity: number) {
    const clampedDetectionSensitivity = clampDetectionSensitivity(detectionSensitivity);
    const moduleId = getSelectedAnalyzerModuleId();
    if (!moduleId) {
      return;
    }
    moduleSdk.sendCapabilityIntent(
      "analyzer-session",
      createCapabilityHandle("analyzer-session", moduleId),
      "set-detection-sensitivity",
      textToBase64(String(clampedDetectionSensitivity)),
    );
  },
  correctNote(eventId: string | bigint, midiNote: number) {
    const normalizedEventId = String(eventId);
    if (!/^[1-9][0-9]{0,19}$/.test(normalizedEventId) ||
        BigInt(normalizedEventId) > 18_446_744_073_709_551_615n ||
        !Number.isInteger(midiNote) || midiNote < 0 || midiNote > 127) {
      return;
    }
    const moduleId = getSelectedAnalyzerModuleId();
    if (!moduleId) {
      return;
    }
    moduleSdk.sendCapabilityIntent(
      "analyzer-session",
      createCapabilityHandle("analyzer-session", moduleId),
      "correct-note",
      textToBase64(`${normalizedEventId}:${midiNote}`),
    );
  },
  resetNoteCorrection(eventId: string | bigint) {
    const normalizedEventId = String(eventId);
    if (!/^[1-9][0-9]{0,19}$/.test(normalizedEventId) ||
        BigInt(normalizedEventId) > 18_446_744_073_709_551_615n) {
      return;
    }
    const moduleId = getSelectedAnalyzerModuleId();
    if (!moduleId) {
      return;
    }
    moduleSdk.sendCapabilityIntent(
      "analyzer-session",
      createCapabilityHandle("analyzer-session", moduleId),
      "reset-note-correction",
      textToBase64(normalizedEventId),
    );
  },
  beginMidiDrag(midiData?: Uint8Array, filename = "padpilot.mid") {
    if (midiData && midiData.length > 0) {
      midi.beginDrag(midiData, filename);
      return;
    }

    const moduleId = getSelectedAnalyzerModuleId();
    if (!moduleId) {
      return;
    }
    moduleSdk.sendCapabilityIntent(
      "midi-export",
      createCapabilityHandle("midi-export", moduleId),
      "begin-drag",
      "",
    );
  },
  saveMidi() {
    const moduleId = getSelectedAnalyzerModuleId();
    if (!moduleId) {
      return;
    }
    moduleSdk.sendCapabilityIntent(
      "midi-export",
      createCapabilityHandle("midi-export", moduleId),
      "save-file",
      "",
    );
  },
  getCachedFrame() {
    ensureAnalyzerSnapshotFromHostState();
    return analyzerStateCache.mappedFrame;
  },
};

export function useAnalyzerFeed(options: { onFrame: (frame: AnalyzerFeedFrame) => void }) {
  const subscription = analyzer.subscribe(options);
  onCleanup(() => {
    subscription.close();
  });
}

export function resetAnalyzerForTests() {
  analyzerStreamUnsubscribe?.();
  analyzerStreamUnsubscribe = null;
  analyzerFeedHandle = "";
  analyzerHostStateUnsubscribe?.();
  analyzerHostStateUnsubscribe = null;
  analyzerSubscribers.clear();
  analyzerStateCache.frame = null;
  analyzerStateCache.moduleState = null;
  analyzerStateCache.mappedFrame = null;
}
