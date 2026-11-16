import { z } from "zod";
import { expect, it } from "bun:test";
import { createProducerActions } from "./producer-actions";
import { moduleSdk } from "../module-sdk";
import { base64ToBytes } from "../proto/base64";

function readPayload(payloadBase64: string) {
  return z.record(z.unknown()).parse(JSON.parse(new TextDecoder().decode(base64ToBytes(payloadBase64))));
}

it("releases every held MIDI note when its owner is disposed", () => {
  const original = moduleSdk.sendCapabilityIntent;
  const actions: Array<{ action: string; payload: Record<string, unknown> }> = [];
  moduleSdk.sendCapabilityIntent = (capability, _handle, action, payloadBase64) => {
    if (capability === "midi-output") {
      actions.push({ action, payload: readPayload(payloadBase64) });
    }
  };

  try {
    const producer = createProducerActions("performance");
    producer.midi.noteOn(60, 110, 1);
    producer.dispose();

    expect(actions).toEqual([
      { action: "note-on", payload: { channel: 1, note: 60, velocity: 110 } },
      { action: "note-off", payload: { channel: 1, note: 60, velocity: 0 } },
    ]);
  } finally {
    moduleSdk.sendCapabilityIntent = original;
  }
});

it("rejects transport shortcuts after owner disposal", () => {
  const original = moduleSdk.sendCapabilityIntent;
  let intentCount = 0;
  moduleSdk.sendCapabilityIntent = () => {
    intentCount += 1;
  };

  try {
    const producer = createProducerActions("performance");
    producer.dispose();
    expect(producer.transport.executeShortcut("SPACE")).toBeFalse();
    expect(intentCount).toBe(0);
  } finally {
    moduleSdk.sendCapabilityIntent = original;
  }
});

it("forwards bounded sample offsets for sample-accurate MIDI scheduling", () => {
  const original = moduleSdk.sendCapabilityIntent;
  const payloads: Record<string, unknown>[] = [];
  moduleSdk.sendCapabilityIntent = (capability, _handle, _action, payloadBase64) => {
    if (capability === "midi-output") payloads.push(readPayload(payloadBase64));
  };

  try {
    const producer = createProducerActions("performance");
    producer.midi.noteOn(60, 100, 1, 127);
    producer.midi.noteOff(60, 0, 1, 63);
    producer.midi.cc(74, 80, 1, Number.POSITIVE_INFINITY);
    expect(payloads).toEqual([
      { channel: 1, note: 60, velocity: 100, sampleOffset: 127 },
      { channel: 1, note: 60, velocity: 0, sampleOffset: 63 },
      { channel: 1, controller: 74, value: 80 },
    ]);
  } finally {
    moduleSdk.sendCapabilityIntent = original;
  }
});

it("ends every active automation gesture during owner teardown", () => {
  const original = moduleSdk.sendCapabilityIntent;
  const actions: string[] = [];
  moduleSdk.sendCapabilityIntent = (capability, _handle, action) => {
    if (capability === "automation") actions.push(action);
  };

  try {
    const producer = createProducerActions("fx");
    expect(producer.automation.begin("macro_1")).toBeTrue();
    producer.dispose();
    expect(actions).toEqual(["begin-touch", "end-touch"]);
  } finally {
    moduleSdk.sendCapabilityIntent = original;
  }
});

it("rejects automation parameter ids that native cannot represent", () => {
  const original = moduleSdk.sendCapabilityIntent;
  let intentCount = 0;
  moduleSdk.sendCapabilityIntent = () => {
    intentCount += 1;
  };

  try {
    const producer = createProducerActions("fx");
    expect(producer.automation.begin("bad-id")).toBeFalse();
    expect(producer.automation.begin("a".repeat(65))).toBeFalse();
    expect(producer.automation.begin("valid.id_1")).toBeTrue();
    expect(intentCount).toBe(1);
  } finally {
    moduleSdk.sendCapabilityIntent = original;
  }
});

it("exposes native module-state A/B comparison through public producer actions", () => {
  const original = moduleSdk.sendCapabilityIntent;
  const actions: string[] = [];
  moduleSdk.sendCapabilityIntent = (capability, _handle, action) => {
    if (capability === "module-state") actions.push(action);
  };

  try {
    const producer = createProducerActions("fx");
    expect(producer.stateComparison.capture("a")).toBeTrue();
    expect(producer.stateComparison.capture("b")).toBeTrue();
    expect(producer.stateComparison.recall("a")).toBeTrue();
    expect(producer.stateComparison.toggle()).toBeTrue();
    expect(actions).toEqual(["capture-a", "capture-b", "recall-a", "toggle"]);
  } finally {
    moduleSdk.sendCapabilityIntent = original;
  }
});

it("releases held MIDI and automation before switching local profiles", () => {
  const original = moduleSdk.sendCapabilityIntent;
  const actions: string[] = [];
  moduleSdk.sendCapabilityIntent = (_capability, _handle, action) => actions.push(action);

  try {
    let selectedProfile = "Default";
    const producer = createProducerActions("editor", { setProfile: (profile) => { selectedProfile = profile; } });
    producer.midi.noteOn(60);
    producer.automation.begin("pp.macro.01");
    expect(producer.profile.select("New")).toBeTrue();
    expect(selectedProfile).toBe("New");
    expect(actions).toEqual(["note-on", "begin-touch", "note-off", "end-touch"]);
  } finally {
    moduleSdk.sendCapabilityIntent = original;
  }
});
