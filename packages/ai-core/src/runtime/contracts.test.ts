import { describe, expect, test } from "bun:test";
import {
  aiExecutionProfileSchema,
  aiRunResultSchema,
  aiRuntimeCatalogSchema,
  appActionPlanSchema,
  assertAiRuntimeCatalogConsistent,
  assertProfileAvailable,
  chooseAvailableAiProfile,
  chooseAiProfileConfiguration,
  getAiProfileReasoningOptions,
  type AiRuntimeCatalog
} from "./contracts";
import { extractAppActionPlan } from "./json";

const catalog: AiRuntimeCatalog = {
  agents: [
    {
      id: "direct",
      label: "Direct provider",
      providerIds: ["openai"],
      supportsReasoning: true,
      supportsStructuredOutput: true,
      available: true
    }
  ],
  providers: [
    {
      id: "openai",
      label: "OpenAI",
      authenticated: true,
      credentialSource: "environment",
      modelIds: ["gpt-5"]
    }
  ],
  models: [
    {
      id: "gpt-5",
      providerId: "openai",
      label: "GPT-5",
      reasoning: true,
      input: ["text", "image"]
    }
  ]
};

describe("portable AI contracts", () => {
  test("usage preserves estimated cost provenance independently of reported token counts", () => {
    const result = aiRunResultSchema.parse({ requestId: "subscription-turn", profile: { agentId: "codex-cli", providerId: "codex-account", modelId: "default" }, text: "Evidence", stopReason: "stop",
      usage: { inputTokens: 10_177, outputTokens: 10, costUsd: 0, costSource: "estimated" } });
    expect(result.usage).toEqual({ inputTokens: 10_177, outputTokens: 10, costUsd: 0, costSource: "estimated" });
    expect(aiRunResultSchema.safeParse({ ...result, usage: { ...result.usage, costSource: "unknown" } }).success).toBe(false);
    expect(aiRunResultSchema.safeParse({ ...result, usage: { inputTokens: 10, outputTokens: 1, costUsd: 0.01 } }).success).toBe(true);
  });
  test("declared defaults win over catalog order while explicit compatible selections win over defaults", () => {
    const declared = structuredClone(catalog);
    declared.providers[0]!.modelIds = ["specialist", "gpt-5", "other"];
    declared.providers[0]!.defaultModelId = "gpt-5";
    declared.models.push(...["specialist", "other"].map(id => ({ ...declared.models[0]!, id })));
    expect(chooseAvailableAiProfile({ catalog: declared })?.modelId).toBe("gpt-5");
    expect(chooseAvailableAiProfile({ catalog: declared, preferred: { agentId: "direct", providerId: "openai", modelId: "specialist", approvalPolicy: "never" } })?.modelId).toBe("specialist");
    declared.providers[0]!.defaultModelId = "missing";
    expect(chooseAvailableAiProfile({ catalog: declared })).toBeUndefined();
    const draft = chooseAiProfileConfiguration({ catalog: declared });
    expect(draft).toMatchObject({ providerId: "openai", modelId: "" });
    expect(aiExecutionProfileSchema.safeParse(draft).success).toBe(false);
    declared.providers[0]!.modelIds = ["other"];
    declared.providers[0]!.defaultModelId = "gpt-5";
    expect(chooseAvailableAiProfile({ catalog: declared })?.modelId).toBe("other");
  });
  test("accepts the credential persistence reported by app-local runtimes", () => {
    expect(aiRuntimeCatalogSchema.parse({ ...catalog, credentialPersistence: "memory-only" }).credentialPersistence).toBe("memory-only");
  });

  test("validates missing graph edges even when an agent is unavailable", () => {
    const unavailable = structuredClone(catalog);
    unavailable.agents[0]!.available = false;
    expect(() => assertAiRuntimeCatalogConsistent(unavailable)).not.toThrow();
    unavailable.models.length = 0;
    expect(() => assertAiRuntimeCatalogConsistent(unavailable)).toThrow("missing model");
  });

  test("accept a provider-qualified execution profile", () => {
    const profile = aiExecutionProfileSchema.parse({
      agentId: "direct",
      providerId: "openai",
      modelId: "gpt-5"
    });
    expect(profile.approvalPolicy).toBe("never");
    expect(() => assertProfileAvailable(catalog, profile)).not.toThrow();
  });

  test("reject an incompatible provider", () => {
    expect(() =>
      assertProfileAvailable(catalog, {
        agentId: "direct",
        providerId: "anthropic",
        modelId: "claude",
        approvalPolicy: "never"
      })
    ).toThrow("does not support provider");
  });

  test("repairs stale profile capabilities before returning a selection", () => {
    const selected = chooseAvailableAiProfile({
      catalog,
      preferred: {
        agentId: "direct",
        providerId: "openai",
        modelId: "gpt-5",
        reasoning: "xhigh",
        webSearch: true,
        approvalPolicy: "on-request"
      },
      approvalPolicy: "never"
    });

    expect(selected).toMatchObject({
      reasoning: "xhigh",
      webSearch: false,
      approvalPolicy: "never"
    });
    expect(() => assertProfileAvailable(catalog, selected!)).not.toThrow();
  });

  test("uses disabled reasoning for a non-reasoning model", () => {
    const nonReasoningCatalog = structuredClone(catalog);
    nonReasoningCatalog.agents[0]!.reasoningEfforts = ["low", "medium", "high", "xhigh"];
    nonReasoningCatalog.models[0]!.reasoning = false;

    const selected = chooseAvailableAiProfile({
      catalog: nonReasoningCatalog,
      preferred: {
        agentId: "direct",
        providerId: "openai",
        modelId: "gpt-5",
        reasoning: "xhigh",
        approvalPolicy: "never"
      }
    });

    expect(selected?.reasoning).toBe("minimal");
    expect(getAiProfileReasoningOptions({
      catalog: nonReasoningCatalog,
      profile: selected!
    })).toEqual(["minimal"]);
    expect(() => assertProfileAvailable(nonReasoningCatalog, selected!)).not.toThrow();
  });

  test("falls back through available agents, providers, and described models", () => {
    const fallbackCatalog = structuredClone(catalog);
    fallbackCatalog.providers.unshift({
      id: "stale",
      label: "Stale",
      authenticated: false,
      credentialSource: "missing",
      modelIds: []
    });

    expect(chooseAvailableAiProfile({
      catalog: fallbackCatalog,
      preferred: {
        agentId: "missing",
        providerId: "stale",
        modelId: "missing",
        reasoning: "minimal",
        approvalPolicy: "never"
      }
    })).toMatchObject({
      agentId: "direct",
      providerId: "openai",
      modelId: "gpt-5"
    });
  });

  test("searches past preferred agents and providers whose model routes are empty", () => {
    const fallbackCatalog = structuredClone(catalog);
    fallbackCatalog.agents.unshift({ ...catalog.agents[0]!, id: "empty", providerIds: ["empty"] });
    fallbackCatalog.providers.unshift({ ...catalog.providers[0]!, id: "empty", modelIds: [] });
    fallbackCatalog.agents[1]!.providerIds.unshift("empty");
    const selected = chooseAvailableAiProfile({
      catalog: fallbackCatalog,
      preferred: { agentId: "empty", providerId: "empty", modelId: "missing", approvalPolicy: "never" }
    });
    expect(selected).toMatchObject({ agentId: "direct", providerId: "openai", modelId: "gpt-5" });
    expect(() => assertProfileAvailable(fallbackCatalog, selected!)).not.toThrow();
    fallbackCatalog.providers[1]!.modelIds = [];
    expect(chooseAvailableAiProfile({ catalog: fallbackCatalog })).toBeUndefined();
  });

  test("extract a bounded action plan from a fenced response", () => {
    const plan = extractAppActionPlan(
      'Plan:\n```json\n{"schema":"hyperfocus-app-action-plan-v1","requestId":"r1","intent":"Rename","baseRevision":4,"atomic":true,"actions":[{"id":"entities.bulk-rename","input":{"prefix":"Enemy "}}]}\n```'
    );
    expect(plan.actions[0]?.id).toBe("entities.bulk-rename");
  });

  test("caps bulk plans", () => {
    expect(() =>
      appActionPlanSchema.parse({
        schema: "hyperfocus-app-action-plan-v1",
        requestId: "r1",
        intent: "Too much",
        baseRevision: 0,
        actions: Array.from({ length: 1_001 }, () => ({ id: "noop", input: {} }))
      })
    ).toThrow();
  });
});
