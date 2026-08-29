import { moduleSdk } from "../module-sdk";
import { jsonToBase64, textToBase64 } from "../proto/base64";
import { createCapabilityHandle } from "@hyperfocus/pad-pilot/module-identity";
import { clamp01, clampInteger } from "../utils/math";
import { isValidAutomationParameterId } from "@hyperfocus/pad-pilot/automation-identity";

export type ProducerMidiEvent = {
  channel: number;
  note?: number;
  controller?: number;
  value?: number;
  velocity?: number;
  sampleOffset?: number;
  type: "cc" | "note-off" | "note-on";
};

type ProducerActionsOptions = {
  onMidiEvent?: (event: ProducerMidiEvent) => void;
  setProfile?: (profile: string) => void;
};

export function createProducerActions(moduleId: string, options: ProducerActionsOptions = {}) {
  const heldNotes = new Map<string, { channel: number; note: number }>();
  const automationTouches = new Set<string>();
  let disposed = false;

  const sendMidi = (action: string, payload: Record<string, number>) => {
    if (disposed) return false;
    moduleSdk.sendCapabilityIntent(
      "midi-output",
      createCapabilityHandle("midi-output", moduleId, "producer-actions"),
      action,
      jsonToBase64(payload),
    );
    return true;
  };

  const noteOff = (noteValue: number, velocityValue = 0, channelValue = 1, sampleOffsetValue = 0) => {
    const note = clampInteger(noteValue, 0, 127);
    const velocity = clampInteger(velocityValue, 0, 127);
    const channel = clampInteger(channelValue, 1, 16);
    const sampleOffset = clampInteger(sampleOffsetValue, 0, 1_048_575);
    const key = `${channel}:${note}`;
    if (!heldNotes.delete(key)) return false;
    const payload: Record<string, number> = { channel, note, velocity };
    if (sampleOffset > 0) payload.sampleOffset = sampleOffset;
    const sent = sendMidi("note-off", payload);
    if (sent) options.onMidiEvent?.({ type: "note-off", channel, note, velocity, sampleOffset });
    return sent;
  };

  const endAutomationTouch = (parameterId: string) => {
    if (!isValidAutomationParameterId(parameterId) || !automationTouches.delete(parameterId) || disposed) return false;
    moduleSdk.sendCapabilityIntent(
      "automation",
      createCapabilityHandle("automation", moduleId, "producer-actions"),
      "end-touch",
      textToBase64(parameterId),
    );
    return true;
  };

  return {
    midi: {
      noteOn(noteValue: number, velocityValue = 100, channelValue = 1, sampleOffsetValue = 0) {
        const note = clampInteger(noteValue, 0, 127);
        const velocity = clampInteger(velocityValue, 1, 127);
        const channel = clampInteger(channelValue, 1, 16);
        const sampleOffset = clampInteger(sampleOffsetValue, 0, 1_048_575);
        const key = `${channel}:${note}`;
        if (disposed || heldNotes.has(key)) return false;
        const payload: Record<string, number> = { channel, note, velocity };
        if (sampleOffset > 0) payload.sampleOffset = sampleOffset;
        const sent = sendMidi("note-on", payload);
        if (!sent) return false;
        heldNotes.set(key, { channel, note });
        options.onMidiEvent?.({ type: "note-on", channel, note, velocity, sampleOffset });
        return true;
      },
      noteOff,
      cc(controllerValue: number, valueValue: number, channelValue = 1, sampleOffsetValue = 0) {
        const controller = clampInteger(controllerValue, 0, 127);
        const value = clampInteger(valueValue, 0, 127);
        const channel = clampInteger(channelValue, 1, 16);
        const sampleOffset = clampInteger(sampleOffsetValue, 0, 1_048_575);
        const payload: Record<string, number> = { channel, controller, value };
        if (sampleOffset > 0) payload.sampleOffset = sampleOffset;
        const sent = sendMidi("cc", payload);
        if (sent) options.onMidiEvent?.({ type: "cc", channel, controller, value, sampleOffset });
        return sent;
      },
      releaseAll() {
        for (const { channel, note } of [...heldNotes.values()]) noteOff(note, 0, channel);
      },
    },
    keyboard: {
      execute(shortcuts: string[]) {
        if (disposed || shortcuts.length === 0) return false;
        moduleSdk.sendCapabilityIntent(
          "keyboard-output",
          createCapabilityHandle("keyboard-output", moduleId, "producer-actions"),
          "execute",
          jsonToBase64(shortcuts),
        );
        return true;
      },
    },
    transport: {
      executeShortcut(shortcut: string) {
        if (disposed || !shortcut.trim()) return false;
        moduleSdk.sendCapabilityIntent(
          "keyboard-output",
          createCapabilityHandle("keyboard-output", moduleId, "producer-actions"),
          "execute",
          jsonToBase64([shortcut]),
        );
        return true;
      },
    },
    profile: {
      select(profile: string) {
        if (disposed || !profile.trim() || !options.setProfile) return false;
        for (const { channel, note } of [...heldNotes.values()]) noteOff(note, 0, channel);
        for (const parameterId of [...automationTouches]) endAutomationTouch(parameterId);
        options.setProfile(profile.trim());
        return true;
      },
    },
    stateComparison: {
      capture(slot: "a" | "b") {
        if (disposed) return false;
        moduleSdk.sendCapabilityIntent(
          "module-state",
          createCapabilityHandle("module-state", moduleId, "producer-actions"),
          `capture-${slot}`,
          "",
        );
        return true;
      },
      recall(slot: "a" | "b") {
        if (disposed) return false;
        moduleSdk.sendCapabilityIntent(
          "module-state",
          createCapabilityHandle("module-state", moduleId, "producer-actions"),
          `recall-${slot}`,
          "",
        );
        return true;
      },
      toggle() {
        if (disposed) return false;
        moduleSdk.sendCapabilityIntent(
          "module-state",
          createCapabilityHandle("module-state", moduleId, "producer-actions"),
          "toggle",
          "",
        );
        return true;
      },
    },
    automation: {
      begin(parameterId: string) {
        if (disposed || !isValidAutomationParameterId(parameterId) || automationTouches.has(parameterId)) return false;
        moduleSdk.sendCapabilityIntent(
          "automation",
      createCapabilityHandle("automation", moduleId, "producer-actions"),
          "begin-touch",
          textToBase64(parameterId),
        );
        automationTouches.add(parameterId);
        return true;
      },
      update(parameterId: string, normalizedValue: number) {
        if (disposed || !isValidAutomationParameterId(parameterId) || !automationTouches.has(parameterId) || !Number.isFinite(normalizedValue)) return false;
        moduleSdk.sendCapabilityIntent(
          "automation",
      createCapabilityHandle("automation", moduleId, "producer-actions"),
          "update-touch",
          jsonToBase64({ parameterId, normalizedValue: clamp01(normalizedValue) }),
        );
        return true;
      },
      end: endAutomationTouch,
      releaseAll() {
        for (const parameterId of [...automationTouches]) endAutomationTouch(parameterId);
      },
    },
    dispose() {
      if (disposed) return;
      for (const { channel, note } of [...heldNotes.values()]) noteOff(note, 0, channel);
      for (const parameterId of [...automationTouches]) endAutomationTouch(parameterId);
      disposed = true;
    },
  };
}
