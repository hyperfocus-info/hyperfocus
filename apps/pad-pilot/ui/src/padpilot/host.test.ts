import { z } from "zod";
import { afterEach, expect, it } from "bun:test";
import { base64ToBytes } from "../proto/base64";
import { resetBridgeStateForTests } from "../bridge";
import { host } from "./host";

const invocations: Array<{ name?: string; params?: unknown[] }> = [];

function installNativeBridge() {
  window.__JUCE__ = {
    backend: {
      addEventListener: () => 0,
      emitEvent: (eventId, payload) => {
        if (eventId === "__juce__invoke") {
          invocations.push(z.object({name:z.string().optional(),params:z.array(z.unknown()).optional()}).passthrough().parse(payload));
        }
      },
    },
    initializationData: { __juce__functions: ["padpilotBridge"] },
  };
}

function sentIntent() {
  const invocation = invocations.find((candidate) => candidate.name === "padpilotBridge");
  return z.record(z.string()).parse(JSON.parse(String(invocation?.params?.[0] ?? "{}")));
}

afterEach(() => {
  delete window.__JUCE__;
  invocations.length = 0;
  resetBridgeStateForTests();
});

it("routes host tempo changes through a declared capability", () => {
  installNativeBridge();
  window.padpilotHostReceive?.({
    modules: [{ id: "generator", name: "Generator", loadStatus: "ready", capabilities: ["host-tempo"] }],
    selectedModuleId: "generator",
  });

  expect(host.setTempo(140)).toBe(true);
  const intent = sentIntent();
  expect(intent).toMatchObject({
    action: "set",
    capability: "host-tempo",
    handle: "generator::host-tempo::primary",
    type: "sendCapabilityIntent",
  });
  expect(new TextDecoder().decode(base64ToBytes(intent.payloadBase64))).toBe("140");
});

it("rejects host tempo changes without the capability", () => {
  installNativeBridge();
  window.padpilotHostReceive?.({
    modules: [{ id: "fx", name: "FX", loadStatus: "ready", capabilities: ["fx-graph"] }],
    selectedModuleId: "fx",
  });

  expect(host.setTempo(140)).toBe(false);
  expect(invocations).toHaveLength(0);
});

it("canonicalizes legacy selected module aliases", () => {
  installNativeBridge();
  window.padpilotHostReceive?.({
    modules: [{ id: "fx", name: "FX", loadStatus: "ready", capabilities: ["host-tempo"] }],
    selectedModuleId: "reverb",
  });

  expect(host.setTempo(128)).toBe(true);
  expect(sentIntent().handle).toBe("fx::host-tempo::primary");
});
