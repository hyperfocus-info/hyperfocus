import { expect, test } from "bun:test";
import type { AiRuntimeCatalog } from "./contracts";
import { applySharedAiPreferences, sharedAiPreferencesSchema } from "./user-preferences";

function fixture(): AiRuntimeCatalog {
  return {
    agents: [{ id: "direct", label: "Direct", providerIds: ["openai", "google"], available: true,
      supportsReasoning: true, supportsStructuredOutput: true, reasoningEfforts: ["minimal", "high"] }],
    providers: ["openai", "google"].map(id => ({ id, label: id, authenticated: true,
      credentialSource: "stored", modelIds: [`${id}-model`] })),
    models: ["openai", "google"].map(providerId => ({ id: `${providerId}-model`, label: providerId,
      providerId, reasoning: true, input: ["text"] }))
  };
}

test("shared defaults select a real provider graph and clamp unsupported effort", () => {
  const catalog = fixture();
  expect(applySharedAiPreferences({ catalog, preferences: { version: 1, providerId: "google", reasoning: "high" } }))
    .toMatchObject({ agentId: "direct", providerId: "google", modelId: "google-model", reasoning: "high", approvalPolicy: "never" });
  expect(applySharedAiPreferences({ catalog, preferences: { version: 1, reasoning: "xhigh" } })?.reasoning).toBe("minimal");
});

test("unset shared provider starts with OpenAI even when the runtime catalog lists another provider first", () => {
  const catalog = fixture();
  catalog.agents = catalog.agents.map(agent => ({ ...agent, providerIds: ["amazon-bedrock", ...agent.providerIds] }));
  catalog.providers.unshift({ id: "amazon-bedrock", label: "Bedrock", authenticated: true, credentialSource: "ambient", modelIds: ["bedrock-model"] });
  catalog.models.unshift({ id: "bedrock-model", providerId: "amazon-bedrock", label: "Bedrock model", reasoning: false, input: ["text"] });
  expect(applySharedAiPreferences({ catalog, preferences: { version: 1 } }))
    .toMatchObject({ providerId: "openai", modelId: "openai-model" });
  expect(applySharedAiPreferences({ catalog, preferences: { version: 1, providerId: "google" } })?.providerId).toBe("google");
  expect(applySharedAiPreferences({ catalog, preferences: { version: 1 },
    preferred: { agentId: "direct", providerId: "amazon-bedrock", modelId: "bedrock-model", approvalPolicy: "never" } })?.providerId).toBe("amazon-bedrock");
  catalog.providers = catalog.providers.filter(provider => provider.id !== "openai");
  expect(applySharedAiPreferences({ catalog, preferences: { version: 1 } })?.providerId).toBe("amazon-bedrock");
});

test("explicit app profiles retain their choices over shared defaults", () => {
  const preferred = { agentId: "direct", providerId: "openai", modelId: "openai-model", reasoning: "minimal" as const, approvalPolicy: "on-request" as const };
  expect(applySharedAiPreferences({ catalog: fixture(), preferred,
    preferences: { version: 1, providerId: "google", reasoning: "high" } }))
    .toMatchObject({ ...preferred, approvalPolicy: "never" });
});

test("missing providers fall back without inventing a model and empty catalogs have no profile", () => {
  expect(applySharedAiPreferences({ catalog: fixture(), preferences: { version: 1, providerId: "anthropic" } }))
    .toMatchObject({ providerId: "openai", modelId: "openai-model" });
  expect(applySharedAiPreferences({ catalog: { agents: [], providers: [], models: [] }, preferences: { version: 1 } })).toBeUndefined();
  const unavailable = fixture();
  unavailable.agents = unavailable.agents.map(agent => ({ ...agent, available: false }));
  expect(applySharedAiPreferences({ catalog: unavailable, preferences: { version: 1, providerId: "google" } })).toBeUndefined();
});

test("unauthenticated configured providers stay selectable for credential setup", () => {
  const catalog = fixture();
  catalog.providers = catalog.providers.map(provider => ({ ...provider, authenticated: false, credentialSource: "missing" }));
  expect(applySharedAiPreferences({ catalog, preferences: { version: 1, providerId: "google" } })?.providerId).toBe("google");
});

test("shared preference contract rejects secrets, app policies and invalid values", () => {
  expect(sharedAiPreferencesSchema.parse({ version: 1 })).toEqual({ version: 1 });
  expect(sharedAiPreferencesSchema.parse({ version: 1, providerId: "google", designGuidance: "none" })).toEqual({ version: 1, providerId: "google" });
  for (const value of [{ version: 2 }, { version: 1, providerId: "codex-account" }, { version: 1, reasoning: "maximum" },
    { version: 1, apiKey: "secret" }, { version: 1, approvalPolicy: "on-request" }, { version: 1, modelId: "other" }]) {
    expect(sharedAiPreferencesSchema.safeParse(value).success).toBe(false);
  }
});
