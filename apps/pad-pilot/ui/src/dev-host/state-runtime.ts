import { createDefaultAnalyzerModuleState, createEmptyAnalyzerFrame, summarizeAnalyzerTake } from "../modules/analyzer/analyzer-state";
import { createDefaultFxChainState } from "../modules/fx/fx-chain-state";
import { DevHostSampleRuntime } from "./sample-runtime";
import {
  cloneFxState,
  filterAnalyzerNoteEventsForSensitivity,
  type PresetRecord,
  createSeedAnalyzerNoteEvents,
} from "./runtime-helpers";

export abstract class DevHostStateRuntime extends DevHostSampleRuntime {
  protected readonly presetsById = new Map<string, PresetRecord>();
  protected acceptedRevision = 1n;
  protected canonicalFxState = createDefaultFxChainState();
  protected liveFxState = cloneFxState(this.canonicalFxState);
  protected analyzerState = createDefaultAnalyzerModuleState();
  protected analyzerFrame = createEmptyAnalyzerFrame();
  protected analyzerSourceNoteEvents = [] as ReturnType<typeof createSeedAnalyzerNoteEvents>;
  protected selectedModuleId = "fx";
  protected selectedPresetId = "";

  protected seedPreset(name: string, stateBase64: string, forcedId?: string) {
    const id = forcedId ?? `preset-${Date.now()}-${this.presetsById.size + 1}`;
    const record: PresetRecord = { id, moduleId: "fx", name, stateBase64 };
    this.presetsById.set(id, record);
    return record;
  }

  protected getActiveFxState() {
    return this.selectedModuleId === "fx" ? this.liveFxState : this.canonicalFxState;
  }

  protected refreshAnalyzerTakeFromSource() {
    this.analyzerState.noteEvents = filterAnalyzerNoteEventsForSensitivity(
      this.analyzerSourceNoteEvents,
      this.analyzerState.detectionSensitivity
    );
    this.analyzerState.takeSummary = summarizeAnalyzerTake(
      this.analyzerState.noteEvents,
      36,
      this.settings.tempo
    );
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
}
