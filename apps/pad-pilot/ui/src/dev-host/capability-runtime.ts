import type { DevHostPublishCallbacks } from "./sample-runtime";
import { create, fromBinary } from "@bufbuild/protobuf";
import { isValidAutomationParameterId } from "@hyperfocus/pad-pilot/automation-identity";
import { parseCapabilityHandle } from "@hyperfocus/pad-pilot/module-identity";
import { z } from "zod";
import type { HostIntent } from "../bridge";
import { createDefaultAnalyzerModuleState, createEmptyAnalyzerFrame, summarizeAnalyzerTake } from "../modules/analyzer/analyzer-state";
import { base64ToBytes, bytesToBase64 } from "../proto/base64";
import { PresetSaveRequestSchema } from "../proto/generated/bridge-pb";
import { SampleAnalysisMode, SampleBpmSource, SampleAnalysisRequestSchema, SampleSourceLoadRequestSchema, SlicePlaybackStateSchema, SlicePlaybackTriggerSchema } from "../proto/generated/capability-pb";
import { FxChainStateSchema } from "../proto/generated/fx-chain-pb";
import { ChokeGroupSchema, PadAssignmentSchema, RecutAnalysisMode, RecutBpmSource, SliceMarkerSchema } from "../proto/generated/recut-pb";
import { fileNameFromPath } from "../utils/file-path";
import { clamp } from "../utils/math";
import { DEFAULT_MODULES, cloneFxState, createSeedAnalyzerNoteEvents, ensureMasterState } from "./runtime-helpers";
import { createDevHostStateRuntime } from "./state-runtime";

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

export function createDevHostCapabilityRuntime(callbacks: DevHostPublishCallbacks) {
  const base = createDevHostStateRuntime(callbacks);
  const producerActionLog = ((): Array<{ action: string; capability: string; moduleId: string; payload: unknown }> => ([]))();
  const heldMidiNotes = new Map<string, Set<string>>();
  const activeAutomationTouches = new Map<string, Set<string>>();
  const analyzerStreamModuleId = "";
  const capabilityStreamHandle = "";
  const modules = [...DEFAULT_MODULES];
  const lastPublishedCapabilityFramePayload = "";
  const runtimeState = Object.assign(base, { producerActionLog, heldMidiNotes, activeAutomationTouches, analyzerStreamModuleId, capabilityStreamHandle, modules, lastPublishedCapabilityFramePayload });
  function isAuthorizedCapabilityHandle(capability: string, handle: string) {
    const parsed = parseCapabilityHandle(handle);
    if (!parsed.valid || parsed.capability !== capability || parsed.moduleInstanceId !== runtimeState.selectedModuleId) {
      return false;
    }
    const moduleItem = runtimeState.modules.find((candidate) => candidate.id === parsed.moduleInstanceId);
    return moduleItem?.loadStatus === "ready" && moduleItem.capabilities?.includes(capability) === true;
  }
  function releaseProducerActions(moduleId: string) {
    for (const key of runtimeState.heldMidiNotes.get(moduleId) ?? []) {
      const [channel, note] = key.split(":").map(Number);
      runtimeState.producerActionLog.push({
        action: "note-off",
        capability: "midi-output",
        moduleId,
        payload: { channel, note, velocity: 0 },
      });
    }
    runtimeState.heldMidiNotes.delete(moduleId);
    for (const parameterId of runtimeState.activeAutomationTouches.get(moduleId) ?? []) {
      runtimeState.producerActionLog.push({ action: "end-touch", capability: "automation", moduleId, payload: parameterId });
    }
    runtimeState.activeAutomationTouches.delete(moduleId);
  }
  function applyCapabilityIntent(intent: Extract<HostIntent, { type: "sendCapabilityIntent" }>) {
    if (!isAuthorizedCapabilityHandle(intent.capability, intent.handle)) {
      return;
    }
    const { moduleInstanceId } = parseCapabilityHandle(intent.handle);
    const readTextPayload = () => intent.payloadBase64.length > 0
      ? new TextDecoder().decode(base64ToBytes(intent.payloadBase64))
      : "";

    if (intent.capability === "analyzer-session") {
      const textPayload = readTextPayload();
      if (intent.action === "start-capture") {
        if (textPayload === "append" && runtimeState.analyzerState.noteEvents.length === 0) {
          runtimeState.analyzerState.recordEnabled = true;
        }
        if (textPayload !== "append") {
          runtimeState.analyzerState = createDefaultAnalyzerModuleState();
          runtimeState.analyzerSourceNoteEvents = [];
        }
        runtimeState.analyzerState.recordEnabled = true;
        runtimeState.analyzerFrame = createEmptyAnalyzerFrame();
        runtimeState.analyzerFrame.recording = true;
        runtimeState.analyzerFrame.tuningHz = runtimeState.analyzerState.tuningHz;
        runtimeState.analyzerFrame.detectionSensitivity = runtimeState.analyzerState.detectionSensitivity;
        runtimeState.analyzerState.revision += 1n;
        callbacks.publishActiveModuleState();
        callbacks.publishCapabilityFrame(true);
        return;
      }
      if (intent.action === "stop-capture") {
        runtimeState.analyzerState.recordEnabled = false;
        if (runtimeState.analyzerSourceNoteEvents.length === 0) {
          runtimeState.analyzerSourceNoteEvents = createSeedAnalyzerNoteEvents();
        }
        base.refreshAnalyzerTakeFromSource();
        runtimeState.analyzerState.revision += 1n;
        callbacks.publishActiveModuleState();
        callbacks.publishCapabilityFrame(true);
        return;
      }
      if (intent.action === "set-tuning-hz") {
        runtimeState.analyzerState.tuningHz = Number(textPayload);
        runtimeState.analyzerState.revision += 1n;
        runtimeState.analyzerFrame.tuningHz = runtimeState.analyzerState.tuningHz;
        callbacks.publishActiveModuleState();
        callbacks.publishCapabilityFrame(true);
        return;
      }
      if (intent.action === "set-detection-sensitivity") {
        runtimeState.analyzerState.detectionSensitivity = Number(textPayload);
        runtimeState.analyzerFrame.detectionSensitivity = runtimeState.analyzerState.detectionSensitivity;
        if (runtimeState.analyzerSourceNoteEvents.length > 0) {
          base.refreshAnalyzerTakeFromSource();
        }
        runtimeState.analyzerState.revision += 1n;
        callbacks.publishActiveModuleState();
        callbacks.publishCapabilityFrame(true);
        return;
      }
      if (intent.action === "correct-note") {
        const match = /^([1-9][0-9]{0,19}):([0-9]{1,3})$/.exec(textPayload);
        const eventId = match ? BigInt(match[1]!) : 0n;
        const midiNote = Number(match?.[2]);
        if (eventId === 0n || !Number.isInteger(midiNote) || midiNote < 0 || midiNote > 127) {
          return;
        }
        const sourceEvent = runtimeState.analyzerSourceNoteEvents.find((event) => event.eventId === eventId);
        const stateEvent = runtimeState.analyzerState.noteEvents.find((event) => event.eventId === eventId);
        if (!sourceEvent && !stateEvent) {
          return;
        }
        if (sourceEvent) {
          sourceEvent.midiNote = midiNote;
          base.refreshAnalyzerTakeFromSource();
        } else if (stateEvent) {
          stateEvent.midiNote = midiNote;
          runtimeState.analyzerState.takeSummary = summarizeAnalyzerTake(
            runtimeState.analyzerState.noteEvents,
            runtimeState.analyzerState.takeSummary?.frameCount ?? 0,
            runtimeState.settings.tempo,
          );
        }
        runtimeState.analyzerState.revision += 1n;
        callbacks.publishActiveModuleState();
        callbacks.publishCapabilityFrame(true);
        return;
      }
      if (intent.action === "reset-note-correction") {
        const eventId = /^[1-9][0-9]{0,19}$/.test(textPayload) ? BigInt(textPayload) : 0n;
        if (eventId === 0n) {
          return;
        }
        const sourceEvent = runtimeState.analyzerSourceNoteEvents.find((event) => event.eventId === eventId);
        const stateEvent = runtimeState.analyzerState.noteEvents.find((event) => event.eventId === eventId);
        if (!sourceEvent && !stateEvent) {
          return;
        }
        if (sourceEvent) {
          sourceEvent.midiNote = sourceEvent.detectedMidiNote;
          base.refreshAnalyzerTakeFromSource();
        } else if (stateEvent) {
          stateEvent.midiNote = stateEvent.detectedMidiNote;
          runtimeState.analyzerState.takeSummary = summarizeAnalyzerTake(
            runtimeState.analyzerState.noteEvents,
            runtimeState.analyzerState.takeSummary?.frameCount ?? 0,
            runtimeState.settings.tempo,
          );
        }
        runtimeState.analyzerState.revision += 1n;
        callbacks.publishActiveModuleState();
        callbacks.publishCapabilityFrame(true);
        return;
      }
    }

    if (intent.capability === "midi-export") {
      return;
    }

    if (intent.capability === "host-tempo" && intent.action === "set") {
      const bpm = Number(readTextPayload());
      if (Number.isFinite(bpm)) {
        callbacks.updateSettings({ tempo: clamp(bpm, 20, 320) });
      }
      return;
    }

    if (intent.capability === "midi-output") {
      const payload = parseJsonPayload(readTextPayload(), midiOutputPayloadSchema);
      if (!payload || ((intent.action === "note-on" || intent.action === "note-off") && payload.note === undefined)) {
        return;
      }
      runtimeState.producerActionLog.push({ action: intent.action, capability: intent.capability, moduleId: moduleInstanceId, payload });
      const noteKey = `${payload.channel}:${payload.note}`;
      const heldNotes = runtimeState.heldMidiNotes.get(moduleInstanceId) ?? new Set<string>();
      if (intent.action === "note-on") {
        heldNotes.add(noteKey);
        runtimeState.heldMidiNotes.set(moduleInstanceId, heldNotes);
      } else if (intent.action === "note-off") {
        heldNotes.delete(noteKey);
        if (heldNotes.size === 0) runtimeState.heldMidiNotes.delete(moduleInstanceId);
      }
      return;
    }

    if (intent.capability === "keyboard-output") {
      const payload = parseJsonPayload(readTextPayload(), keyboardOutputPayloadSchema);
      if (!payload) {
        return;
      }
      runtimeState.producerActionLog.push({ action: intent.action, capability: intent.capability, moduleId: moduleInstanceId, payload });
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
        ensureMasterState(runtimeState.liveFxState).wetDry = clamp(wetDry, 0, 1);
        callbacks.publishActiveModuleState();
        return;
      }
      if (intent.action === "apply-state") {
        runtimeState.canonicalFxState = fromBinary(FxChainStateSchema, base64ToBytes(intent.payloadBase64));
        runtimeState.liveFxState = cloneFxState(runtimeState.canonicalFxState);
        runtimeState.acceptedRevision = runtimeState.canonicalFxState.revision;
        callbacks.publishActiveModuleState();
        callbacks.publishDebugState();
        return;
      }
      if (intent.action === "create-preset" || intent.action === "save-preset") {
        const request = fromBinary(PresetSaveRequestSchema, base64ToBytes(intent.payloadBase64));
        const preset = request.preset;
        if (!preset) {
          return;
        }
        const stateBase64 = bytesToBase64(preset.state);
        const record = base.seedPreset(request.name || preset.name || "Preset", stateBase64, preset.id || undefined);
        runtimeState.selectedPresetId = record.id;
        runtimeState.canonicalFxState = fromBinary(FxChainStateSchema, preset.state);
        runtimeState.liveFxState = cloneFxState(runtimeState.canonicalFxState);
        runtimeState.acceptedRevision = runtimeState.canonicalFxState.revision;
        callbacks.publishNavigationState();
        callbacks.publishActiveModuleState();
        callbacks.publishDebugState();
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
      runtimeState.producerActionLog.push({ action: intent.action, capability: intent.capability, moduleId: moduleInstanceId, payload: parameterId });
      const touches = runtimeState.activeAutomationTouches.get(moduleInstanceId) ?? new Set<string>();
      if (intent.action === "begin-touch" && parameterId) {
        touches.add(parameterId);
        runtimeState.activeAutomationTouches.set(moduleInstanceId, touches);
      } else if (intent.action === "end-touch") {
        touches.delete(parameterId);
        if (touches.size === 0) runtimeState.activeAutomationTouches.delete(moduleInstanceId);
      }
      return;
    }

    if (moduleInstanceId && moduleInstanceId !== "recut") {
      return;
    }

    if (intent.capability === "sample-source" && intent.action === "load-file") {
      const payload = fromBinary(SampleSourceLoadRequestSchema, base64ToBytes(intent.payloadBase64));
      const loadGeneration = ++runtimeState.recutAudioLoadGeneration;
      for (const padIndex of [...runtimeState.recutVoices.keys()]) {
        base.stopRecutVoice(padIndex);
      }
      runtimeState.recutHeldPads.clear();
      runtimeState.recutAudioBuffer = null;
      runtimeState.recutMonoSamples = new Float32Array();
      runtimeState.recutState.sourceContentId = payload.sourceContentId;
      runtimeState.recutState.sourceName = payload.sourceName || fileNameFromPath(payload.sourcePath);
      runtimeState.recutState.sourcePath = payload.sourcePath;
      runtimeState.recutState.loaded = false;
      runtimeState.recutState.sampleRate = 0;
      runtimeState.recutState.channelCount = 0;
      runtimeState.recutState.lengthFrames = 0n;
      base.prepareRecutAudioBuffer(payload.sourceContentId, runtimeState.recutState.sourceName, loadGeneration).then((loaded) => {
        if (!loaded || loadGeneration !== runtimeState.recutAudioLoadGeneration) {
          return;
        }
        runtimeState.recutState.loaded = true;
        base.bumpRecutRevision();
        base.refreshRecutAnalysis();
        callbacks.publishActiveModuleState();
        callbacks.publishCapabilityFrame(true);
      }).catch((error) => {
        if (loadGeneration !== runtimeState.recutAudioLoadGeneration) {
          return;
        }
        console.error(`Dev host could not decode Recut sample "${runtimeState.recutState.sourceName}".`, error);
        runtimeState.recutState.loaded = false;
        runtimeState.recutAudioBuffer = null;
        runtimeState.recutMonoSamples = new Float32Array();
        base.bumpRecutRevision();
        base.refreshRecutAnalysis();
        callbacks.publishActiveModuleState();
        callbacks.publishCapabilityFrame(true);
      });
      return;
    }

    if (intent.capability === "sample-analysis" && intent.action === "request-analysis") {
      const payload = intent.payloadBase64.length > 0
        ? fromBinary(SampleAnalysisRequestSchema, base64ToBytes(intent.payloadBase64))
        : null;
      base.refreshRecutAnalysis(payload ? {
        analysisMode: payload.analysisMode,
        density: payload.density,
        projectBpm: payload.projectBpm,
        requestedBpm: payload.requestedBpm,
      } : undefined);
      runtimeState.completedAnalysisRequestId = payload?.requestId ?? 0n;
      base.bumpRecutRevision();
      callbacks.publishActiveModuleState();
      callbacks.publishCapabilityFrame(true);
      return;
    }

    if (intent.capability === "slice-playback" && intent.action === "apply-state") {
      const payload = fromBinary(SlicePlaybackStateSchema, base64ToBytes(intent.payloadBase64));
      runtimeState.recutState.pitchSemitones = payload.pitchSemitones;
      runtimeState.recutState.gainDb = payload.gainDb;
      runtimeState.recutState.stretchEnabled = payload.stretchEnabled;
      runtimeState.recutState.granularEnabled = payload.granularEnabled;
      runtimeState.recutState.grainSizeMs = payload.grainSizeMs;
      runtimeState.recutState.grainDensity = payload.grainDensity;
      runtimeState.recutState.analysisMode = payload.analysisMode === SampleAnalysisMode.BPM
        ? RecutAnalysisMode.BPM
        : payload.analysisMode === SampleAnalysisMode.CUSTOM
          ? RecutAnalysisMode.CUSTOM
          : RecutAnalysisMode.AUTO;
      runtimeState.recutState.density = payload.density;
      runtimeState.recutState.bpmValue = payload.bpmValue;
      runtimeState.recutState.bpmSource = payload.bpmSource === SampleBpmSource.METADATA
        ? RecutBpmSource.METADATA
        : payload.bpmSource === SampleBpmSource.ANALYZED
          ? RecutBpmSource.ANALYZED
          : payload.bpmSource === SampleBpmSource.PROJECT
            ? RecutBpmSource.PROJECT
            : payload.bpmSource === SampleBpmSource.USER
              ? RecutBpmSource.USER
              : RecutBpmSource.NONE;
      runtimeState.recutState.bpmConfidence = payload.bpmConfidence;
      runtimeState.recutState.bpmSuggestedValue = payload.bpmSuggestedValue;
      runtimeState.recutState.bpmSuggestedConfidence = payload.bpmSuggestedConfidence;
      runtimeState.recutState.manualEditRevision = payload.manualEditRevision;
      runtimeState.recutState.projectBpmSnapshot = payload.projectBpm;
      runtimeState.recutState.sliceMarkers = payload.sliceMarkers.map((marker) =>
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
      runtimeState.recutState.padAssignments = payload.padAssignments.map((assignment) =>
        create(PadAssignmentSchema, {
          bank: assignment.bank,
          chokeGroupId: assignment.chokeGroupId,
          faceButton: assignment.faceButton,
          isEmpty: assignment.isEmpty,
          padIndex: assignment.padIndex,
          sliceIndex: assignment.sliceIndex,
        }),
      );
      runtimeState.recutState.chokeGroups = payload.chokeGroups.map((group) =>
        create(ChokeGroupSchema, {
          accentHue: group.accentHue,
          id: group.id,
          name: group.name,
        }),
      );
      base.bumpRecutRevision();
      runtimeState.sampleEditorFrame = base.buildSampleEditorFrame();
      callbacks.publishActiveModuleState();
      callbacks.publishCapabilityFrame(true);
      return;
    }

    if (intent.capability === "slice-playback" && intent.action === "trigger-pad") {
      const payload = fromBinary(SlicePlaybackTriggerSchema, base64ToBytes(intent.payloadBase64));
      base.triggerRecutPad(payload.padIndex, payload.pressed);
      callbacks.publishCapabilityFrame(true);
      return;
    }

    if (intent.capability === "slice-playback" && intent.action === "edit-slice") {
      runtimeState.sampleEditorFrame = base.buildSampleEditorFrame();
      callbacks.publishCapabilityFrame(true);
      return;
    }
  }
  return Object.assign(runtimeState, { isAuthorizedCapabilityHandle, releaseProducerActions, applyCapabilityIntent });
}
