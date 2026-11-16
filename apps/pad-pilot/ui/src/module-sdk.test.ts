import { z } from "zod";
import { afterEach, expect, it } from "bun:test";
import { resetBridgeStateForTests } from "./bridge";
import { moduleSdk } from "./module-sdk";
import { encodeControllerConfigRequestBase64, createDefaultControllerConfig } from "./padpilot/controller-config";

type NativeInvokePayload = {
  name: string;
  params?: unknown[];
  resultId?: number;
};

const nativeInvocations: NativeInvokePayload[] = [];

function useNativeBridgeStub() {
  nativeInvocations.length = 0;
  window.__JUCE__ = {
    backend: {
      addEventListener: () => 0,
      emitEvent: (eventId, payload) => {
        if (eventId === "__juce__invoke") {
          nativeInvocations.push(z.object({name:z.string(),params:z.array(z.unknown()).optional(),resultId:z.number().optional()}).passthrough().parse(payload));
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

async function flushQueuedIntents() {
  await new Promise((resolve) => window.setTimeout(resolve, 24));
}

afterEach(() => {
  delete window.__JUCE__;
  nativeInvocations.length = 0;
  resetBridgeStateForTests();
});

it("sends module state intents through bridge", async () => {
  useNativeBridgeStub();
  const controllerConfigPayload = encodeControllerConfigRequestBase64(createDefaultControllerConfig());

  moduleSdk.setModuleState("fx", "{\"chains\":[]}");
  moduleSdk.setModuleStateProto("fx", "cHJvdG8=", 42n);
  moduleSdk.setControllerConfig(controllerConfigPayload);
  await flushQueuedIntents();

  expect(getSentIntents()).toEqual([
    { type: "setModuleStateProto", moduleId: "fx", payloadBase64: "cHJvdG8=", revision: "42" },
    { type: "setControllerConfig", payloadBase64: controllerConfigPayload },
  ]);
});

it("sends capability intents with normalized payloads", () => {
  useNativeBridgeStub();

  moduleSdk.openCapabilityStream("sample-analysis", "recut-main");
  moduleSdk.sendCapabilityIntent("sample-source", "recut-main", "load-file", "c291cmNl");
  expect(getSentIntents()).toEqual([
    { type: "openCapabilityStream", capability: "sample-analysis", handle: "recut-main" },
    {
      type: "sendCapabilityIntent",
      capability: "sample-source",
      handle: "recut-main",
      action: "load-file",
      payloadBase64: "c291cmNl",
    },
  ]);
});

it("sends generic transport intents", () => {
  useNativeBridgeStub();

  moduleSdk.registerReady();
  moduleSdk.selectModule("editor");
  moduleSdk.setDiagnosticsVisible(true);

  expect(getSentIntents()).toEqual([
    { type: "ready" },
    { type: "selectModule", moduleId: "editor" },
    { type: "setDiagnosticsVisible", visible: true },
  ]);
});
