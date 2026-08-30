import { create, fromBinary } from "@bufbuild/protobuf";
import { isValidAutomationParameterId } from "@hyperfocus/pad-pilot/automation-identity";
import { parseCapabilityHandle } from "@hyperfocus/pad-pilot/module-identity";
import { z } from "zod";
import type { HostIntent } from "../bridge";
import { createDefaultAnalyzerModuleState, createEmptyAnalyzerFrame, summarizeAnalyzerTake } from "../modules/analyzer/analyzer-state";
import { createDefaultFxChainState } from "../modules/fx/fx-chain-state";
import { base64ToBytes, bytesToBase64 } from "../proto/base64";
import { PresetSaveRequestSchema } from "../proto/generated/bridge-pb";
import { SampleAnalysisMode, SampleBpmSource, SampleAnalysisRequestSchema, SampleSourceLoadRequestSchema, SlicePlaybackStateSchema, SlicePlaybackTriggerSchema } from "../proto/generated/capability-pb";
import { FxChainStateSchema } from "../proto/generated/fx-chain-pb";
import { ChokeGroupSchema, PadAssignmentSchema, RecutAnalysisMode, RecutBpmSource, SliceMarkerSchema } from "../proto/generated/recut-pb";
import { fileNameFromPath } from "../utils/file-path";
import { clamp } from "../utils/math";
import { type DevSignalSettings } from "./types";
import { DEFAULT_MODULES, type PresetRecord, cloneFxState, createSeedAnalyzerNoteEvents, ensureMasterState, filterAnalyzerNoteEventsForSensitivity } from "./runtime-helpers";
import { DevHostStateRuntime } from "./state-runtime";

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

export abstract class DevHostCapabilityRuntime extends DevHostStateRuntime {
  protected readonly producerActionLog: Array<{ action: string; capability: string; moduleId: string; payload: unknown }> = [];
  protected readonly heldMidiNotes = new Map<string, Set<string>>();
  protected readonly activeAutomationTouches = new Map<string, Set<string>>();
  protected analyzerStreamModuleId = "";
  protected capabilityStreamHandle = "";
  protected modules = [...DEFAULT_MODULES];
  protected lastPublishedCapabilityFramePayload = "";

  protected isAuthorizedCapabilityHandle(capability: string, handle: string) {
    const parsed = parseCapabilityHandle(handle);
    if (!parsed.valid || parsed.capability !== capability || parsed.moduleInstanceId !== this.selectedModuleId) {
      return false;
    }
    const moduleItem = this.modules.find((candidate) => candidate.id === parsed.moduleInstanceId);
    return moduleItem?.loadStatus === "ready" && moduleItem.capabilities?.includes(capability) === true;
  }

  protected releaseProducerActions(moduleId: string) {
    for (const key of this.heldMidiNotes.get(moduleId) ?? []) {
      const [channel, note] = key.split(":").map(Number);
      this.producerActionLog.push({
        action: "note-off",
        capability: "midi-output",
        moduleId,
        payload: { channel, note, velocity: 0 },
      });
    }
    this.heldMidiNotes.delete(moduleId);
    for (const parameterId of this.activeAutomationTouches.get(moduleId) ?? []) {
      this.producerActionLog.push({ action: "end-touch", capability: "automation", moduleId, payload: parameterId });
    }
    this.activeAutomationTouches.delete(moduleId);
  }



  protected applyCapabilityIntent(intent: Extract<HostIntent, { type: "sendCapabilityIntent" }>) {
    if (!this.isAuthorizedCapabilityHandle(intent.capability, intent.handle)) {
      return;
    }
    const { moduleInstanceId } = parseCapabilityHandle(intent.handle);
    const readTextPayload = () => intent.payloadBase64.length > 0
      ? new TextDecoder().decode(base64ToBytes(intent.payloadBase64))
      : "";

    if (intent.capability === "analyzer-session") {
      const textPayload = readTextPayload();
      if (intent.action === "start-capture") {
        if (textPayload === "append" && this.analyzerState.noteEvents.length === 0) {
          this.analyzerState.recordEnabled = true;
        }
        if (textPayload !== "append") {
          this.analyzerState = createDefaultAnalyzerModuleState();
          this.analyzerSourceNoteEvents = [];
        }
        this.analyzerState.recordEnabled = true;
        this.analyzerFrame = createEmptyAnalyzerFrame();
        this.analyzerFrame.recording = true;
        this.analyzerFrame.tuningHz = this.analyzerState.tuningHz;
        this.analyzerFrame.detectionSensitivity = this.analyzerState.detectionSensitivity;
        this.analyzerState.revision += 1n;
        this.publishActiveModuleState();
        this.publishCapabilityFrame(true);
        return;
      }
      if (intent.action === "stop-capture") {
        this.analyzerState.recordEnabled = false;
        if (this.analyzerSourceNoteEvents.length === 0) {
          this.analyzerSourceNoteEvents = createSeedAnalyzerNoteEvents();
        }
        this.refreshAnalyzerTakeFromSource();
        this.analyzerState.revision += 1n;
        this.publishActiveModuleState();
        this.publishCapabilityFrame(true);
        return;
      }
      if (intent.action === "set-tuning-hz") {
        this.analyzerState.tuningHz = Number(textPayload);
        this.analyzerState.revision += 1n;
        this.analyzerFrame.tuningHz = this.analyzerState.tuningHz;
        this.publishActiveModuleState();
        this.publishCapabilityFrame(true);
        return;
      }
      if (intent.action === "set-detection-sensitivity") {
        this.analyzerState.detectionSensitivity = Number(textPayload);
        this.analyzerFrame.detectionSensitivity = this.analyzerState.detectionSensitivity;
        if (this.analyzerSourceNoteEvents.length > 0) {
          this.refreshAnalyzerTakeFromSource();
        }
        this.analyzerState.revision += 1n;
        this.publishActiveModuleState();
        this.publishCapabilityFrame(true);
        return;
      }
      if (intent.action === "correct-note") {
        const match = /^([1-9][0-9]{0,19}):([0-9]{1,3})$/.exec(textPayload);
        const eventId = match ? BigInt(match[1]!) : 0n;
        const midiNote = Number(match?.[2]);
        if (eventId === 0n || !Number.isInteger(midiNote) || midiNote < 0 || midiNote > 127) {
          return;
        }
        const sourceEvent = this.analyzerSourceNoteEvents.find((event) => event.eventId === eventId);
        const stateEvent = this.analyzerState.noteEvents.find((event) => event.eventId === eventId);
        if (!sourceEvent && !stateEvent) {
          return;
        }
        if (sourceEvent) {
          sourceEvent.midiNote = midiNote;
          this.refreshAnalyzerTakeFromSource();
        } else if (stateEvent) {
          stateEvent.midiNote = midiNote;
          this.analyzerState.takeSummary = summarizeAnalyzerTake(
            this.analyzerState.noteEvents,
            this.analyzerState.takeSummary?.frameCount ?? 0,
            this.settings.tempo,
          );
        }
        this.analyzerState.revision += 1n;
        this.publishActiveModuleState();
        this.publishCapabilityFrame(true);
        return;
      }
      if (intent.action === "reset-note-correction") {
        const eventId = /^[1-9][0-9]{0,19}$/.test(textPayload) ? BigInt(textPayload) : 0n;
        if (eventId === 0n) {
          return;
        }
        const sourceEvent = this.analyzerSourceNoteEvents.find((event) => event.eventId === eventId);
        const stateEvent = this.analyzerState.noteEvents.find((event) => event.eventId === eventId);
        if (!sourceEvent && !stateEvent) {
          return;
        }
        if (sourceEvent) {
          sourceEvent.midiNote = sourceEvent.detectedMidiNote;
          this.refreshAnalyzerTakeFromSource();
        } else if (stateEvent) {
          stateEvent.midiNote = stateEvent.detectedMidiNote;
          this.analyzerState.takeSummary = summarizeAnalyzerTake(
            this.analyzerState.noteEvents,
            this.analyzerState.takeSummary?.frameCount ?? 0,
            this.settings.tempo,
          );
        }
        this.analyzerState.revision += 1n;
        this.publishActiveModuleState();
        this.publishCapabilityFrame(true);
        return;
      }
    }

    if (intent.capability === "midi-export") {
      return;
    }

    if (intent.capability === "host-tempo" && intent.action === "set") {
      const bpm = Number(readTextPayload());
      if (Number.isFinite(bpm)) {
        this.updateSettings({ tempo: clamp(bpm, 20, 320) });
      }
      return;
    }

    if (intent.capability === "midi-output") {
      const payload = parseJsonPayload(readTextPayload(), midiOutputPayloadSchema);
      if (!payload || ((intent.action === "note-on" || intent.action === "note-off") && payload.note === undefined)) {
        return;
      }
      this.producerActionLog.push({ action: intent.action, capability: intent.capability, moduleId: moduleInstanceId, payload });
      const noteKey = `${payload.channel}:${payload.note}`;
      const heldNotes = this.heldMidiNotes.get(moduleInstanceId) ?? new Set<string>();
      if (intent.action === "note-on") {
        heldNotes.add(noteKey);
        this.heldMidiNotes.set(moduleInstanceId, heldNotes);
      } else if (intent.action === "note-off") {
        heldNotes.delete(noteKey);
        if (heldNotes.size === 0) this.heldMidiNotes.delete(moduleInstanceId);
      }
      return;
    }

    if (intent.capability === "keyboard-output") {
      const payload = parseJsonPayload(readTextPayload(), keyboardOutputPayloadSchema);
      if (!payload) {
        return;
      }
      this.producerActionLog.push({ action: intent.action, capability: intent.capability, moduleId: moduleInstanceId, payload });
      return;
    }

    if (intent.capability === "fx-graph") {
      if (intent.action === "set-preview-bypass") {
        return;
      }
      if (intent.action === "set-master-wet-dry") {
        const wetDry = Number(readTextPayload());
        if (!Number.isFinite(wetDry)) {
          return;
        }
        ensureMasterState(this.liveFxState).wetDry = clamp(wetDry, 0, 1);
        this.publishActiveModuleState();
        return;
      }
      if (intent.action === "apply-state") {
        this.canonicalFxState = fromBinary(FxChainStateSchema, base64ToBytes(intent.payloadBase64));
        this.liveFxState = cloneFxState(this.canonicalFxState);
        this.acceptedRevision = this.canonicalFxState.revision;
        this.publishActiveModuleState();
        this.publishDebugState();
        return;
      }
      if (intent.action === "create-preset" || intent.action === "save-preset") {
        const request = fromBinary(PresetSaveRequestSchema, base64ToBytes(intent.payloadBase64));
        const preset = request.preset;
        if (!preset) {
          return;
        }
        const stateBase64 = bytesToBase64(preset.state);
        const record = this.seedPreset(request.name || preset.name || "Preset", stateBase64, preset.id || undefined);
        this.selectedPresetId = record.id;
        this.canonicalFxState = fromBinary(FxChainStateSchema, preset.state);
        this.liveFxState = cloneFxState(this.canonicalFxState);
        this.acceptedRevision = this.canonicalFxState.revision;
        this.publishNavigationState();
        this.publishActiveModuleState();
        this.publishDebugState();
        return;
      }
    }

    if (intent.capability === "automation") {
      const parameterId = intent.action === "update-touch"
        ? parseJsonPayload(readTextPayload(), automationUpdatePayloadSchema)?.parameterId ?? ""
        : readTextPayload();
      if (!isValidAutomationParameterId(parameterId)) {
        return;
      }
      this.producerActionLog.push({ action: intent.action, capability: intent.capability, moduleId: moduleInstanceId, payload: parameterId });
      const touches = this.activeAutomationTouches.get(moduleInstanceId) ?? new Set<string>();
      if (intent.action === "begin-touch" && parameterId) {
        touches.add(parameterId);
        this.activeAutomationTouches.set(moduleInstanceId, touches);
      } else if (intent.action === "end-touch") {
        touches.delete(parameterId);
        if (touches.size === 0) this.activeAutomationTouches.delete(moduleInstanceId);
      }
      return;
    }

    if (moduleInstanceId && moduleInstanceId !== "recut") {
      return;
    }

    if (intent.capability === "sample-source" && intent.action === "load-file") {
      const payload = fromBinary(SampleSourceLoadRequestSchema, base64ToBytes(intent.payloadBase64));
      const loadGeneration = ++this.recutAudioLoadGeneration;
      for (const padIndex of [...this.recutVoices.keys()]) {
        this.stopRecutVoice(padIndex);
      }
      this.recutHeldPads.clear();
      this.recutAudioBuffer = null;
      this.recutMonoSamples = new Float32Array();
      this.recutState.sourceContentId = payload.sourceContentId;
      this.recutState.sourceName = payload.sourceName || fileNameFromPath(payload.sourcePath);
      this.recutState.sourcePath = payload.sourcePath;
      this.recutState.loaded = false;
      this.recutState.sampleRate = 0;
      this.recutState.channelCount = 0;
      this.recutState.lengthFrames = 0n;
      this.prepareRecutAudioBuffer(payload.sourceContentId, this.recutState.sourceName, loadGeneration).then((loaded) => {
        if (!loaded || loadGeneration !== this.recutAudioLoadGeneration) {
          return;
        }
        this.recutState.loaded = true;
        this.bumpRecutRevision();
        this.refreshRecutAnalysis();
        this.publishActiveModuleState();
        this.publishCapabilityFrame(true);
      }).catch((error) => {
        if (loadGeneration !== this.recutAudioLoadGeneration) {
          return;
        }
        console.error(`Dev host could not decode Recut sample "${this.recutState.sourceName}".`, error);
        this.recutState.loaded = false;
        this.recutAudioBuffer = null;
        this.recutMonoSamples = new Float32Array();
        this.bumpRecutRevision();
        this.refreshRecutAnalysis();
        this.publishActiveModuleState();
        this.publishCapabilityFrame(true);
      });
      return;
    }

    if (intent.capability === "sample-analysis" && intent.action === "request-analysis") {
      const payload = intent.payloadBase64.length > 0
        ? fromBinary(SampleAnalysisRequestSchema, base64ToBytes(intent.payloadBase64))
        : null;
      this.refreshRecutAnalysis(payload ? {
        analysisMode: payload.analysisMode,
        density: payload.density,
        projectBpm: payload.projectBpm,
        requestedBpm: payload.requestedBpm,
      } : undefined);
      this.bumpRecutRevision();
      this.publishActiveModuleState();
      this.publishCapabilityFrame(true);
      return;
    }

    if (intent.capability === "slice-playback" && intent.action === "apply-state") {
      const payload = fromBinary(SlicePlaybackStateSchema, base64ToBytes(intent.payloadBase64));
      this.recutState.pitchSemitones = payload.pitchSemitones;
      this.recutState.gainDb = payload.gainDb;
      this.recutState.stretchEnabled = payload.stretchEnabled;
      this.recutState.granularEnabled = payload.granularEnabled;
      this.recutState.grainSizeMs = payload.grainSizeMs;
      this.recutState.grainDensity = payload.grainDensity;
      this.recutState.analysisMode = payload.analysisMode === SampleAnalysisMode.BPM
        ? RecutAnalysisMode.BPM
        : payload.analysisMode === SampleAnalysisMode.CUSTOM
          ? RecutAnalysisMode.CUSTOM
          : RecutAnalysisMode.AUTO;
      this.recutState.density = payload.density;
      this.recutState.bpmValue = payload.bpmValue;
      this.recutState.bpmSource = payload.bpmSource === SampleBpmSource.METADATA
        ? RecutBpmSource.METADATA
        : payload.bpmSource === SampleBpmSource.ANALYZED
          ? RecutBpmSource.ANALYZED
          : payload.bpmSource === SampleBpmSource.PROJECT
            ? RecutBpmSource.PROJECT
            : payload.bpmSource === SampleBpmSource.USER
              ? RecutBpmSource.USER
              : RecutBpmSource.NONE;
      this.recutState.bpmConfidence = payload.bpmConfidence;
      this.recutState.bpmSuggestedValue = payload.bpmSuggestedValue;
      this.recutState.bpmSuggestedConfidence = payload.bpmSuggestedConfidence;
      this.recutState.manualEditRevision = payload.manualEditRevision;
      this.recutState.projectBpmSnapshot = payload.projectBpm;
      this.recutState.sliceMarkers = payload.sliceMarkers.map((marker) =>
        create(SliceMarkerSchema, {
          chokeGroupId: marker.chokeGroupId,
          confidence: marker.confidence,
          endFrame: marker.endFrame,
          fadeMs: marker.fadeMs,
          padIndex: marker.padIndex,
          snapExact: marker.snapExact,
          startFrame: marker.startFrame,
          transientFrame: marker.transientFrame,
        }),
      );
      this.recutState.padAssignments = payload.padAssignments.map((assignment) =>
        create(PadAssignmentSchema, {
          bank: assignment.bank,
          chokeGroupId: assignment.chokeGroupId,
          faceButton: assignment.faceButton,
          isEmpty: assignment.isEmpty,
          padIndex: assignment.padIndex,
          sliceIndex: assignment.sliceIndex,
        }),
      );
      this.recutState.chokeGroups = payload.chokeGroups.map((group) =>
        create(ChokeGroupSchema, {
          accentHue: group.accentHue,
          id: group.id,
          name: group.name,
        }),
      );
      this.bumpRecutRevision();
      this.sampleEditorFrame = this.buildSampleEditorFrame();
      this.publishActiveModuleState();
      this.publishCapabilityFrame(true);
      return;
    }

    if (intent.capability === "slice-playback" && intent.action === "trigger-pad") {
      const payload = fromBinary(SlicePlaybackTriggerSchema, base64ToBytes(intent.payloadBase64));
      this.triggerRecutPad(payload.padIndex, payload.pressed);
      this.publishCapabilityFrame(true);
      return;
    }

    if (intent.capability === "slice-playback" && intent.action === "edit-slice") {
      this.sampleEditorFrame = this.buildSampleEditorFrame();
      this.publishCapabilityFrame(true);
      return;
    }
  }



  protected abstract publishActiveModuleState(): void;
  protected abstract publishCapabilityFrame(force?: boolean): void;
  protected abstract publishDebugState(): void;
  protected abstract publishNavigationState(): void;
  abstract updateSettings(next: Partial<DevSignalSettings>): void;
}
