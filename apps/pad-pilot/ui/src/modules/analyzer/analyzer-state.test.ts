import { expect, it } from "bun:test";
import {
  ANALYZER_DEFAULT_DETECTION_SENSITIVITY,
  clampDetectionSensitivity,
  createAnalyzerNoteEvent,
  createDefaultAnalyzerModuleState,
  createEmptyAnalyzerFrame,
  decodeAnalyzerModuleState,
  encodeAnalyzerModuleState,
  summarizeAnalyzerTake,
} from "./analyzer-state";

it("scores C major highest for a C-major note fixture", () => {
  const summary = summarizeAnalyzerTake(
    [
      createAnalyzerNoteEvent({ midiNote: 60, startFrame: 0, endFrame: 16, intensity: 0.8, velocity: 96, meanFrequencyHz: 261.63 }),
      createAnalyzerNoteEvent({ midiNote: 64, startFrame: 0, endFrame: 16, intensity: 0.74, velocity: 92, meanFrequencyHz: 329.63 }),
      createAnalyzerNoteEvent({ midiNote: 67, startFrame: 0, endFrame: 16, intensity: 0.7, velocity: 90, meanFrequencyHz: 392 }),
      createAnalyzerNoteEvent({ midiNote: 72, startFrame: 16, endFrame: 32, intensity: 0.76, velocity: 93, meanFrequencyHz: 523.25 }),
      createAnalyzerNoteEvent({ midiNote: 65, startFrame: 16, endFrame: 24, intensity: 0.52, velocity: 80, meanFrequencyHz: 349.23 }),
      createAnalyzerNoteEvent({ midiNote: 69, startFrame: 18, endFrame: 32, intensity: 0.55, velocity: 84, meanFrequencyHz: 440 }),
      createAnalyzerNoteEvent({ midiNote: 71, startFrame: 20, endFrame: 32, intensity: 0.48, velocity: 78, meanFrequencyHz: 493.88 }),
    ],
    32,
    120,
  );

  expect(summary.topMatches[0]?.rootPitchClass).toBe(0);
  expect(summary.topMatches[0]?.scaleId).toBe("major");
});

it("normalizes analyzer state during codec round-trips", () => {
  const state = createDefaultAnalyzerModuleState();
  state.tuningHz = 500;
  state.noteEvents = [
    createAnalyzerNoteEvent({ midiNote: 72, startFrame: 8, endFrame: 16, intensity: 0.6, velocity: 90, meanFrequencyHz: 523.25 }),
    createAnalyzerNoteEvent({ midiNote: 60, startFrame: 0, endFrame: 8, intensity: 0.8, velocity: 96, meanFrequencyHz: 261.63 }),
  ];

  const roundTrip = decodeAnalyzerModuleState(encodeAnalyzerModuleState(state));

  expect(roundTrip.tuningHz).toBe(465);
  expect(roundTrip.noteEvents[0]?.midiNote).toBe(60);
  expect(roundTrip.takeSummary?.frameCount).toBe(16);
  expect(roundTrip.detectionSensitivity).toBe(ANALYZER_DEFAULT_DETECTION_SENSITIVITY);
});

it("preserves stable analyzer event identity, confidence, and corrected pitch", () => {
  const state = createDefaultAnalyzerModuleState();
  state.noteEvents = [
    createAnalyzerNoteEvent({
      confidence: 0.73,
      detectedMidiNote: 60,
      endFrame: 16,
      eventId: 42n,
      intensity: 0.8,
      meanFrequencyHz: 261.63,
      midiNote: 62,
      startFrame: 0,
      velocity: 96,
    }),
  ];

  const roundTrip = decodeAnalyzerModuleState(encodeAnalyzerModuleState(state));
  const [event] = roundTrip.noteEvents;

  expect(roundTrip.schemaVersion).toBe(3);
  expect(event?.eventId).toBe(42n);
  expect(event?.detectedMidiNote).toBe(60);
  expect(event?.midiNote).toBe(62);
  expect(event?.confidence).toBeCloseTo(0.73, 2);
});

it("uses detection sensitivity defaults for analyzer state and frames", () => {
  expect(createDefaultAnalyzerModuleState().detectionSensitivity).toBe(ANALYZER_DEFAULT_DETECTION_SENSITIVITY);
  expect(createEmptyAnalyzerFrame().detectionSensitivity).toBe(ANALYZER_DEFAULT_DETECTION_SENSITIVITY);
});

it("clamps analyzer detection sensitivity", () => {
  expect(clampDetectionSensitivity(-1)).toBe(0);
  expect(clampDetectionSensitivity(0.25)).toBe(0.25);
  expect(clampDetectionSensitivity(2)).toBe(1);
});

it("defaults legacy analyzer payloads to the new detection sensitivity", () => {
  const legacyState = createDefaultAnalyzerModuleState();
  legacyState.schemaVersion = 1;
  legacyState.detectionSensitivity = 0;

  const roundTrip = decodeAnalyzerModuleState(encodeAnalyzerModuleState(legacyState));

  expect(roundTrip.detectionSensitivity).toBe(ANALYZER_DEFAULT_DETECTION_SENSITIVITY);
});

it("migrates v2 note events to stable identity and confidence fields", () => {
  const legacyState = createDefaultAnalyzerModuleState();
  legacyState.schemaVersion = 2;
  legacyState.noteEvents = [createAnalyzerNoteEvent({
    endFrame: 8,
    intensity: 0.64,
    meanFrequencyHz: 440,
    midiNote: 69,
    startFrame: 0,
    velocity: 82,
  })];
  legacyState.noteEvents[0]!.eventId = 0n;
  legacyState.noteEvents[0]!.confidence = 0;
  legacyState.noteEvents[0]!.detectedMidiNote = 0;

  const [event] = decodeAnalyzerModuleState(encodeAnalyzerModuleState(legacyState)).noteEvents;

  expect(event?.eventId).not.toBe(0n);
  expect(event?.detectedMidiNote).toBe(69);
  expect(event?.confidence).toBeCloseTo(0.64, 2);
});
