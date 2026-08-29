import { expect, test } from "bun:test";
import { createAudioWorkletWasmHost } from "./audio-worklet-wasm.ts";

test("AudioWorklet WASM host loads, connects, controls, and disconnects injected nodes", async () => {
  const calls: unknown[] = [];
  const context = {
    destination: {},
    audioWorklet: { async addModule(url: string) { calls.push(["module", url]); } }
  };
  const host = createAudioWorkletWasmHost({
    context,
    processorModuleUrl: "/dsp.js",
    processorName: "catalog-dsp",
    wasm: new ArrayBuffer(8),
    createNode(_context, name, options) {
      calls.push(["node", name, Boolean(options.processorOptions?.wasm)]);
      return {
        port: { postMessage(message) { calls.push(["message", message]); } },
        connect(destination) { calls.push(["connect", destination]); },
        disconnect() { calls.push(["disconnect"]); }
      };
    }
  });
  expect(host.supported).toBe(true);
  await host.start();
  host.control({ gain: 0.5 });
  host.stop();
  expect(host.state).toBe("stopped");
  expect(calls.map((call) => Array.isArray(call) ? call[0] : undefined)).toEqual(["module", "node", "connect", "message", "disconnect"]);
});

test("AudioWorklet WASM host reports unsupported contexts without creating a node", async () => {
  const host = createAudioWorkletWasmHost({
    context: { destination: {} }, processorModuleUrl: "/dsp.js", processorName: "dsp", wasm: new ArrayBuffer(0),
    createNode() { throw new Error("must not run"); }
  });
  expect(host.supported).toBe(false);
  expect(host.start()).rejects.toThrow("unavailable");
});
