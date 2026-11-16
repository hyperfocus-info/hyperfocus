import { encodeValue } from "@hyperfocus/serialization";
import { protobufContentType, readProtobufBody } from "@hyperfocus/serialization/http";
import { describe, expect, test } from "bun:test";
import { createLocalAiRuntime, type AiRuntimeAdapter } from "./runtime";
import { createAiRuntimeHttpHandler } from "./server";
import { createMemoryOnlyProviderCredentialStore } from "./credential-store";
import { aiRunResultSchema, type AiRunResult } from "@hyperfocus/ai-core/runtime";

const request = { requestId: "cancel", profile: { agentId: "fixture", providerId: "fixture", modelId: "fixture" }, messages: [{ role: "user", content: "hello" }] };

function fixture(run: AiRuntimeAdapter["run"], listCatalog?: AiRuntimeAdapter["listCatalog"]) {
  return createLocalAiRuntime({ credentialStore: createMemoryOnlyProviderCredentialStore(), adapters: [{
    descriptor: { id: "fixture", label: "Fixture", providerIds: ["fixture"], available: true, supportsReasoning: false, supportsStructuredOutput: false },
    listCatalog: listCatalog ?? (() => ({ providers: [{ id: "fixture", label: "Fixture", authenticated: true, credentialSource: "ambient", modelIds: ["fixture"] }], models: [{ id: "fixture", label: "Fixture", providerId: "fixture", reasoning: false, input: ["text"] }] })),
    run,
  }] });
}

describe("AI run lifetime", () => {
  test("host scope routes Editor obligations and retains the actual result before HTTP delivery", async () => {
    const runtime = fixture(async input => ({ requestId: input.requestId, profile: input.profile, text: "ok", stopReason: "stop" }));
    const received = Promise.withResolvers<void>(), retained = Promise.withResolvers<void>();
    let trace: AiRunResult["quality"], settled = false;
    const pending = createAiRuntimeHttpHandler(runtime, { qualityProject: "editor", onRunResult: async result => {
      trace = result.quality; received.resolve(); await retained.promise;
    } })(new Request("http://localhost/api/ai/v1/run", { method: "POST", headers: { "content-type": protobufContentType }, body: encodeValue(request) }));
    void pending.then(() => { settled = true; });
    await received.promise; expect(settled).toBe(false); retained.resolve();
    const response = await pending;
    expect(response?.ok).toBe(true);
    const result = aiRunResultSchema.parse(await readProtobufBody(response!));
    expect(result.quality).toEqual(trace);
    expect(result.quality!.rules.filter(rule => rule.eligible === "yes").map(rule => rule.id)).toEqual([
      "editor.project.applied-revision", "editor.preview.rendered", "editor.preview.edit-recovery",
    ]);
  });

  test.each(["catalog", "run"])("HTTP %s cancellation waits for discovery cleanup and never starts execution", async route => {
    const started = Promise.withResolvers<void>();
    const cleaned = Promise.withResolvers<void>();
    let discoverySignal: AbortSignal | undefined;
    let executions = 0;
    const runtime = fixture(async input => { executions++; return { requestId: input.requestId, profile: input.profile, text: "ok", stopReason: "stop" }; }, async (_store, options) => {
      discoverySignal = options?.signal;
      started.resolve();
      await cleaned.promise;
      return { providers: [], models: [] };
    });
    const controller = new AbortController();
    const pending = createAiRuntimeHttpHandler(runtime)(new Request(`http://localhost/api/ai/v1/${route}`, {
      ...(route === "run" ? { method: "POST", headers: { "content-type": protobufContentType }, body: encodeValue(request) } : {}), signal: controller.signal,
    }));
    let settled = false;
    void pending.then(() => settled = true);
    await started.promise;
    controller.abort(new Error("discovery cancelled"));
    expect(discoverySignal?.aborted).toBe(true);
    await Promise.resolve();
    expect(settled).toBe(false);
    cleaned.resolve();
    expect((await pending)?.ok).toBe(false);
    expect(executions).toBe(0);
  });

  test("pre-aborted and expired requests never start work", async () => {
    let starts = 0;
    const runtime = fixture(async input => { starts++; return { requestId: input.requestId, profile: input.profile, text: "ok", stopReason: "stop" }; });
    await expect(runtime.run(request, { signal: AbortSignal.abort(new Error("cancelled")) })).rejects.toThrow("cancelled");
    await expect(runtime.run({ ...request, deadlineAt: Date.now() - 1 })).rejects.toThrow("timed out");
    expect(starts).toBe(0);
  });

  test("waits for adapter cleanup and refuses late success after abort; retry is independent", async () => {
    const started = Promise.withResolvers<void>();
    const cleaned = Promise.withResolvers<void>();
    let signal: AbortSignal | undefined;
    let attempts = 0;
    const runtime = fixture(async (input, _store, options) => {
      if (++attempts === 1) { signal = options.signal; started.resolve(); await cleaned.promise; }
      return { requestId: input.requestId, profile: input.profile, text: "ok", stopReason: "stop" };
    });
    const controller = new AbortController();
    let settled = false;
    const pending = runtime.run(request, { signal: controller.signal });
    void pending.then(() => settled = true, () => settled = true);
    await started.promise;
    controller.abort(new Error("cancelled"));
    expect(signal?.aborted).toBe(true);
    await Promise.resolve();
    expect(settled).toBe(false);
    cleaned.resolve();
    await expect(pending).rejects.toThrow("cancelled");
    expect((await runtime.run(request)).text).toBe("ok");
  });

  test("HTTP cancellation reaches owned work and cannot return HTTP success", async () => {
    const started = Promise.withResolvers<void>();
    let stopped = false;
    const runtime = fixture(async (input, _store, { signal }) => {
      started.resolve();
      await new Promise<void>(resolve => signal.addEventListener("abort", () => { stopped = true; resolve(); }, { once: true }));
      return { requestId: input.requestId, profile: input.profile, text: "late", stopReason: "stop" };
    });
    const controller = new AbortController();
    const pending = createAiRuntimeHttpHandler(runtime)(new Request("http://localhost/api/ai/v1/run", {
      method: "POST", headers: { "content-type": protobufContentType }, body: encodeValue(request), signal: controller.signal,
    }));
    await started.promise;
    controller.abort(new Error("caller cancelled"));
    const response = await pending;
    expect(stopped).toBe(true);
    expect(response?.ok).toBe(false);
    expect(await readProtobufBody(response!)).toMatchObject({ error: "caller cancelled" });
  });

  test("deadline aborts a running adapter", async () => {
    const runtime = fixture(async (input, _store, { signal }) => {
      await new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true }));
      return { requestId: input.requestId, profile: input.profile, text: "late", stopReason: "stop" };
    });
    await expect(runtime.run({ ...request, deadlineAt: Date.now() + 40 })).rejects.toThrow("timed out");
  });
});
