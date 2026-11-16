import type { DevHostPublishCallbacks } from "./sample-runtime";
import { createDefaultAnalyzerModuleState, createEmptyAnalyzerFrame, summarizeAnalyzerTake } from "../modules/analyzer/analyzer-state";
import { createDefaultFxChainState } from "../modules/fx/fx-chain-state";
import { createDevHostSampleRuntime } from "./sample-runtime";
import {
  cloneFxState,
  filterAnalyzerNoteEventsForSensitivity,
  type PresetRecord,
  createSeedAnalyzerNoteEvents,
} from "./runtime-helpers";

export function createDevHostStateRuntime(callbacks: DevHostPublishCallbacks) {
  const base = createDevHostSampleRuntime(callbacks);
  const presetsById = new Map<string, PresetRecord>();
  const acceptedRevision = 1n;
  const canonicalFxState = createDefaultFxChainState();
  const liveFxState = cloneFxState(canonicalFxState);
  const analyzerState = createDefaultAnalyzerModuleState();
  const analyzerFrame = createEmptyAnalyzerFrame();
  const analyzerSourceNoteEvents: ReturnType<typeof createSeedAnalyzerNoteEvents> = [];
  const selectedModuleId = "fx";
  const selectedPresetId = "";
  const runtimeState = Object.assign(base, { presetsById, acceptedRevision, canonicalFxState, liveFxState, analyzerState, analyzerFrame, analyzerSourceNoteEvents, selectedModuleId, selectedPresetId });
  function seedPreset(name: string, stateBase64: string, forcedId?: string) {
    const id = forcedId ?? `preset-${Date.now()}-${runtimeState.presetsById.size + 1}`;
    const record: PresetRecord = { id, moduleId: "fx", name, stateBase64 };
    runtimeState.presetsById.set(id, record);
    return record;
  }
  function getActiveFxState() {
    return runtimeState.selectedModuleId === "fx" ? runtimeState.liveFxState : runtimeState.canonicalFxState;
  }
  function refreshAnalyzerTakeFromSource() {
    runtimeState.analyzerState.noteEvents = filterAnalyzerNoteEventsForSensitivity(
      runtimeState.analyzerSourceNoteEvents,
      runtimeState.analyzerState.detectionSensitivity
    );
    runtimeState.analyzerState.takeSummary = summarizeAnalyzerTake(
      runtimeState.analyzerState.noteEvents,
      36,
      runtimeState.settings.tempo
    );
    runtimeState.analyzerFrame = {
      ...runtimeState.analyzerFrame,
      recording: false,
      frameCount: runtimeState.analyzerState.takeSummary.frameCount,
      durationSeconds: runtimeState.analyzerState.takeSummary.durationSeconds,
      minMidiNote: runtimeState.analyzerState.takeSummary.minMidiNote,
      maxMidiNote: runtimeState.analyzerState.takeSummary.maxMidiNote,
      primaryMatch: runtimeState.analyzerState.takeSummary.topMatches[0],
      alternateMatches: runtimeState.analyzerState.takeSummary.topMatches.slice(1),
    };
  }
  return Object.assign(runtimeState, { seedPreset, getActiveFxState, refreshAnalyzerTakeFromSource });
}
