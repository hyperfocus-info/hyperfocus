import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runAiRuntimeEnvelope, runAiRuntimeFiles } from "../cli";
import { createMemoryOnlyProviderCredentialStore } from "../credential-store";
import { createLocalAiRuntime } from "../runtime";
import { createAiRuntimeHttpHandler } from "../server";
import { createSharedAiPreferencesStore } from "./store";
import { readStoredBytes, encodeValue } from "@hyperfocus/serialization";
import { protobufContentType, readProtobufBody } from "@hyperfocus/serialization/http";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "hyperfocus-ai-preferences-transport-"));
  directories.push(directory);
  const preferencesStore = createSharedAiPreferencesStore({ filePath: path.join(directory, "preferences.json") });
  const runtime = createLocalAiRuntime({ credentialStore: createMemoryOnlyProviderCredentialStore(), adapters: [] });
  return { directory, preferencesStore, runtime };
}

test("HTTP and native envelopes share validated preferences without credentials", async () => {
  const options = fixture();
  const handle = createAiRuntimeHttpHandler(options.runtime, { preferencesStore: options.preferencesStore });
  const url = "http://localhost/api/ai/v1/preferences";
  expect(await readProtobufBody((await handle(new Request(url)))!)).toEqual({ version: 1 });
  const value = { version: 1, providerId: "anthropic", reasoning: "high" } as const;
  expect(await readProtobufBody((await handle(new Request(url, { method: "PUT", headers: { "content-type": protobufContentType }, body: encodeValue(value) })))!)).toEqual(value);
  expect(await runAiRuntimeEnvelope({ operation: "getPreferences" }, options)).toEqual(value);
  await runAiRuntimeEnvelope({ operation: "setPreferences", payload: { version: 1, providerId: "google" } }, options);
  expect(await readProtobufBody((await handle(new Request(url)))!)).toEqual({ version: 1, providerId: "google" });
  const invalid = { version: 1, apiKey: "do-not-save" };
  expect((await handle(new Request(url, { method: "PUT", body: JSON.stringify(invalid) })))?.status).toBe(400);
  await expect(runAiRuntimeEnvelope({ operation: "setPreferences", payload: invalid }, options)).rejects.toThrow();
  expect(options.preferencesStore.read()).toEqual({ version: 1, providerId: "google" });
});

test("native file transport emits the same defaults and propagates corruption", async () => {
  const options = fixture();
  const requestPath = path.join(options.directory, "request.json");
  const responsePath = path.join(options.directory, "response.json");
  options.preferencesStore.write({ version: 1, reasoning: "medium" });
  for (const binary of [false, true]) {
    const request = { operation: "getPreferences" };
    writeFileSync(requestPath, binary ? encodeValue(request) : JSON.stringify(request));
    expect(await runAiRuntimeFiles({ ...options, requestPath, responsePath })).toBe(true);
    const response = readFileSync(responsePath);
    expect(response[0] === 72).toBe(binary);
    expect(readStoredBytes(response)).toEqual({ ok: true, value: { version: 1, reasoning: "medium" } });
  }
  writeFileSync(path.join(options.directory, "preferences.json"), "invalid");
  writeFileSync(requestPath, JSON.stringify({ operation: "getPreferences" }));
  expect(await runAiRuntimeFiles({ ...options, requestPath, responsePath })).toBe(false);
  expect(readStoredBytes(readFileSync(responsePath))).toMatchObject({ ok: false });
  const handle = createAiRuntimeHttpHandler(options.runtime, { preferencesStore: options.preferencesStore });
  expect((await handle(new Request("http://localhost/api/ai/v1/preferences")))?.status).toBe(400);
});
