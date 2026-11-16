import { readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { encodeValue, readStoredBytes } from "@hyperfocus/serialization";
import { aiRunRequestSchema, sharedAiPreferencesSchema } from "@hyperfocus/ai-core/runtime";
import { z } from "zod";
import { createLocalAiRuntime, type LocalAiRuntime } from "./runtime";
import { catalogQuerySchema } from "./catalog";
import { createSharedAiPreferencesStore, type SharedAiPreferencesStore } from "./preferences/store";

const envelopeSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("getPreferences") }).strict(),
  z.object({ operation: z.literal("setPreferences"), payload: sharedAiPreferencesSchema }).strict(),
  z.object({ operation: z.literal("catalog"), query: catalogQuerySchema.optional() }).strict(),
  z.object({ operation: z.literal("run"), payload: aiRunRequestSchema }).strict(),
  z.object({
    operation: z.literal("setCredential"),
    payload: z.object({ providerId: z.string().min(1).max(160), apiKey: z.string().min(1).max(32_000) }).strict()
  }).strict(),
  z.object({
    operation: z.literal("deleteCredential"),
    payload: z.object({ providerId: z.string().min(1).max(160) }).strict()
  }).strict()
]);

export async function runAiRuntimeEnvelope(input: unknown, options: { signal?: AbortSignal; runtime?: LocalAiRuntime; preferencesStore?: SharedAiPreferencesStore } = {}) {
  const envelope = envelopeSchema.parse(input);
  const runtime = options.runtime ?? createLocalAiRuntime();
  options.signal?.throwIfAborted();
  switch (envelope.operation) {
    case "getPreferences":
      return (options.preferencesStore ?? createSharedAiPreferencesStore()).read();
    case "setPreferences":
      return (options.preferencesStore ?? createSharedAiPreferencesStore()).write(envelope.payload);
    case "catalog":
      return { ...(await runtime.catalog(envelope.query, { signal: options.signal })), credentialPersistence: runtime.credentialPersistence() };
    case "run":
      return runtime.run(envelope.payload, { signal: options.signal });
    case "setCredential":
      await runtime.setCredential(envelope.payload.providerId, envelope.payload.apiKey);
      return { ok: true, providerId: envelope.payload.providerId };
    case "deleteCredential":
      await runtime.deleteCredential(envelope.payload.providerId);
      return { ok: true, providerId: envelope.payload.providerId };
  }
}

export async function runAiRuntimeFiles(options: {
  requestPath: string;
  responsePath: string;
  cancelPath?: string;
  runtime?: LocalAiRuntime;
  preferencesStore?: SharedAiPreferencesStore;
}) {
  const { requestPath, responsePath, cancelPath } = options;
  const controller = new AbortController();
  const checkCancellation = () => {
    if (cancelPath && existsSync(cancelPath)) controller.abort(new DOMException("AI request was cancelled.", "AbortError"));
  };
  checkCancellation();
  const poll = cancelPath ? setInterval(checkCancellation, 50) : undefined;
  let binary = false;
  const encodeResponse = (value: unknown) => binary ? encodeValue(value, { maxBytes: 2097152 }) : JSON.stringify(value);
  try {
    const raw = await readFile(requestPath);
    binary = raw[0] === 72;
    if (raw.length > 2097152) throw new Error("AI runtime request exceeds 2 MiB.");
    const value = await runAiRuntimeEnvelope(readStoredBytes(raw, { maxBytes: 2097152 }), { runtime: options.runtime, signal: controller.signal, preferencesStore: options.preferencesStore });
    checkCancellation();
    controller.signal.throwIfAborted();
    await writeFile(responsePath, encodeResponse({ ok: true, value }));
    return true;
  } catch (error) {
    await writeFile(responsePath, encodeResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return false;
  } finally {
    clearInterval(poll);
    await rm(requestPath, { force: true });
  }
}

async function main(args: string[]) {
  const requestIndex = args.indexOf("--request");
  const responseIndex = args.indexOf("--response");
  const cancelIndex = args.indexOf("--cancel");
  const requestPath = requestIndex >= 0 ? args[requestIndex + 1] : undefined;
  const responsePath = responseIndex >= 0 ? args[responseIndex + 1] : undefined;
  const cancelPath = cancelIndex >= 0 ? args[cancelIndex + 1] : undefined;
  if (!requestPath || !responsePath || requestPath === responsePath ||
      (cancelIndex >= 0 && (!cancelPath || cancelPath === requestPath || cancelPath === responsePath))) {
    throw new Error("Usage: padpilot-ai-runtime --request <path> --response <path>");
  }
  if (!await runAiRuntimeFiles({ requestPath, responsePath, cancelPath })) process.exitCode = 1;
}

if (import.meta.main) await main(process.argv.slice(2));
