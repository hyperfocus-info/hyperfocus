import { describe, expect, jest, test } from "bun:test";
import type { AiRuntimeAdapter } from "./runtime";
import { createMemoryOnlyProviderCredentialStore } from "./credential-store";
import { createDirectProviderAdapter, createLocalAiRuntime } from "./runtime";

const adapter: AiRuntimeAdapter = {
  descriptor: {
    id: "test-agent",
    label: "Test agent",
    providerIds: ["test-provider"],
    supportsReasoning: true,
    supportsStructuredOutput: true,
    available: true
  },
  listCatalog: (store) => ({
    providers: [
      {
        id: "test-provider",
        label: "Test provider",
        authenticated: Boolean(store.get("test-provider")),
        credentialSource: store.get("test-provider") ? "stored" : "missing",
        modelIds: ["test-model"]
      }
    ],
    models: [
      {
        id: "test-model",
        providerId: "test-provider",
        label: "Test model",
        reasoning: true,
        input: ["text"]
      }
    ]
  }),
  run: async (request) => ({
    requestId: request.requestId,
    profile: request.profile,
    text: "done",
    stopReason: "stop"
  })
};

describe("local AI runtime", () => {
  test("missing optional agents remain visible without blocking available agents", async () => {
    const unavailableRun = jest.fn(adapter.run);
    const optional: AiRuntimeAdapter = { ...adapter,
      descriptor: { ...adapter.descriptor, id: "missing-cli", available: false, unavailableReason: "Install the CLI" },
      run: unavailableRun };
    const runtime = createLocalAiRuntime({ credentialStore: createMemoryOnlyProviderCredentialStore(), adapters: [adapter, optional] });
    expect((await runtime.catalog()).agents[1]).toMatchObject({ available: false, unavailableReason: "Install the CLI" });
    const { run } = runtime;
    const request = { requestId: "available", messages: [{ role: "user", content: "Hello" }],
      profile: { agentId: "test-agent", providerId: "test-provider", modelId: "test-model" } };
    await expect(run(request)).resolves.toMatchObject({ text: "done" });
    await expect(run({ ...request, profile: { ...request.profile, agentId: "missing-cli" } })).rejects.toThrow("unavailable");
    expect(unavailableRun).not.toHaveBeenCalled();
    await runtime.setCredential("test-provider", "secret");
    expect((await runtime.catalog()).providers[0]?.authenticated).toBe(true);
    await runtime.deleteCredential("test-provider");
    expect((await runtime.catalog()).providers[0]?.authenticated).toBe(false);
  });

  test("hosts arbitrary agent adapters", async () => {
    const store = createMemoryOnlyProviderCredentialStore();
    const runtime = createLocalAiRuntime({ credentialStore: store, adapters: [adapter] });
    await runtime.setCredential("test-provider", "secret");
    expect((await runtime.catalog()).providers[0]?.authenticated).toBe(true);
    expect(
      (
        await runtime.run({
          requestId: "request-1",
          profile: {
            agentId: "test-agent",
            providerId: "test-provider",
            modelId: "test-model"
          },
          messages: [{ role: "user", content: "Do the thing" }]
        })
      ).text
    ).toBe("done");
  });

  test("never exposes credential values through the catalog", async () => {
    const store = createMemoryOnlyProviderCredentialStore();
    store.set("test-provider", "do-not-leak");
    const runtime = createLocalAiRuntime({ credentialStore: store, adapters: [adapter] });
    expect(JSON.stringify(await runtime.catalog())).not.toContain("do-not-leak");
  });

  test("rejects every catalog whose offered adapter/provider/model graph is inconsistent", async () => {
    const broken: AiRuntimeAdapter = {
      ...adapter,
      descriptor: { ...adapter.descriptor, providerIds: ["missing-provider"] },
    };
    const runtime = createLocalAiRuntime({ adapters: [broken] });
    await expect(runtime.catalog()).rejects.toThrow("missing-provider");
  });

  test("rejects incompatible Codex minimal-reasoning web-search profiles before launch", async () => {
    const run = jest.fn(adapter.run);
    const codex: AiRuntimeAdapter = {
      ...adapter,
      descriptor: {
        ...adapter.descriptor,
        id: "codex-cli",
        providerIds: ["codex-account"],
      },
      listCatalog: () => ({
        providers: [{
          id: "codex-account",
          label: "Codex account",
          authenticated: true,
          credentialSource: "ambient",
          modelIds: ["default"],
        }],
        models: [{
          id: "default",
          providerId: "codex-account",
          label: "Default",
          reasoning: true,
          input: ["text"],
        }],
      }),
      run,
    };
    const runtime = createLocalAiRuntime({ adapters: [codex] });
    await expect(runtime.run({
      requestId: "bad-profile",
      profile: {
        agentId: "codex-cli",
        providerId: "codex-account",
        modelId: "default",
        reasoning: "minimal",
        webSearch: true,
      },
      messages: [{ role: "user", content: "Search" }],
    })).rejects.toThrow("do not support reasoning 'minimal'");
    expect(run).not.toHaveBeenCalled();
  });

  test("marks missing adapter token metadata as usage unavailable", async () => {
    const runtime = createLocalAiRuntime({ adapters: [adapter] });
    const result = await runtime.run({
      requestId: "usage-unavailable",
      profile: {
        agentId: "test-agent",
        providerId: "test-provider",
        modelId: "test-model",
      },
      messages: [{ role: "user", content: "Do the thing" }],
    });
    expect(result.usage).toBeUndefined();
    expect(result.usageStatus).toBe("unavailable");
  });
});

test("direct adapters declare installed planning defaults and permit host overrides", async () => {
  const store = createMemoryOnlyProviderCredentialStore();
  const catalog = await createDirectProviderAdapter().listCatalog(store);
  for (const providerId of ["openai", "anthropic", "google"]) {
    const provider = catalog.providers.find(item => item.id === providerId)!;
    expect(provider.defaultModelId).toBeDefined();
    expect(provider.modelIds).toContain(provider.defaultModelId!);
  }
  const missing = await createDirectProviderAdapter({ defaultModelIds: { openai: "not-installed" } }).listCatalog(store);
  expect(missing.providers.find(item => item.id === "openai")?.defaultModelId).toBeUndefined();
});
