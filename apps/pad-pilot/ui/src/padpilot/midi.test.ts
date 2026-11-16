import { z } from "zod";
import { afterEach, expect, it } from "bun:test";
import { resetBridgeStateForTests } from "../bridge";
import { midi } from "./midi";
import { base64ToBytes } from "../proto/base64";

type NativeInvokePayload = {
  name: string;
  params?: unknown[];
};

const nativeInvocations: NativeInvokePayload[] = [];

function useNativeBridgeStub() {
  nativeInvocations.length = 0;
  window.__JUCE__ = {
    backend: {
      addEventListener: () => 0,
      emitEvent: (eventId, payload) => {
        if (eventId === "__juce__invoke") {
          nativeInvocations.push(z.object({name:z.string(),params:z.array(z.unknown()).optional()}).passthrough().parse(payload));
        }
      },
    },
    initializationData: {
      __juce__functions: ["padpilotBridge"],
    },
  };
}

function getSentIntents() {
  return nativeInvocations
    .filter((payload) => payload.name === "padpilotBridge")
    .map((payload) => JSON.parse(String(payload.params?.[0] ?? "{}")));
}

afterEach(() => {
  delete window.__JUCE__;
  nativeInvocations.length = 0;
  resetBridgeStateForTests();
});

it("sends generated MIDI through the generic public MIDI API", () => {
  useNativeBridgeStub();
  window.padpilotHostReceive?.({
    modules: [{ id: "generator", name: "Generator", loadStatus: "ready", capabilities: ["midi-export"] }],
    selectedModuleId: "generator",
  });

  const started = midi.beginDrag(new Uint8Array([77, 84, 104, 100]), "My Generated Clip");

  expect(started).toBe(true);
  const intent = getSentIntents()[0];
  expect(intent).toMatchObject({
    action: "begin-drag-bytes",
    capability: "midi-export",
    handle: "generator::midi-export::primary",
    type: "sendCapabilityIntent",
  });
  expect(JSON.parse(new TextDecoder().decode(base64ToBytes(intent.payloadBase64)))).toEqual({
    filename: "My-Generated-Clip.mid",
    midiBase64: "TVRoZA==",
  });
});

it("does not send empty MIDI payloads", () => {
  useNativeBridgeStub();
  window.padpilotHostReceive?.({
    modules: [{ id: "generator", name: "Generator", loadStatus: "ready", capabilities: ["midi-export"] }],
    selectedModuleId: "generator",
  });

  const started = midi.beginDrag(new Uint8Array(), "empty.mid");

  expect(started).toBe(false);
  expect(getSentIntents()).toEqual([]);
});

it("does not export MIDI for a module without the declared capability", () => {
  useNativeBridgeStub();
  window.padpilotHostReceive?.({
    modules: [{ id: "editor", name: "Editor", loadStatus: "ready", capabilities: ["module-state"] }],
    selectedModuleId: "editor",
  });

  expect(midi.beginDrag(new Uint8Array([1]), "blocked.mid")).toBe(false);
  expect(getSentIntents()).toEqual([]);
});
