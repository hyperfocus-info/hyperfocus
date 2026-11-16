import { expect, test } from "bun:test";
import { assertAiRuntimeCatalogConsistent } from "@hyperfocus/ai-core/runtime";
import { createLocalAiRuntime } from "./runtime";
import { createAiRuntimeHttpHandler } from "./server";
import { createMemoryOnlyProviderCredentialStore } from "./credential-store";
import { parseCodexModelIds } from "./process/codex-models";

test("catalog filters preserve a consistent graph and omit unrelated provider models", async () => {
  const runtime = createLocalAiRuntime({ credentialStore: createMemoryOnlyProviderCredentialStore() });
  const full = await runtime.catalog();
  const filtered = await runtime.catalog({ agentId: "codex-cli", search: "luna" });
  expect(filtered.agents.map(agent => agent.id)).toEqual(["codex-cli"]);
  expect(filtered.models.every(model => model.providerId === "codex-account" && model.id.includes("luna"))).toBe(true);
  expect(JSON.stringify(filtered).length).toBeLessThan(JSON.stringify(full).length / 10);
  expect(() => assertAiRuntimeCatalogConsistent(filtered)).not.toThrow();
  const handle = createAiRuntimeHttpHandler(runtime);
  const response = await handle(new Request("http://localhost/api/ai/v1/catalog?agentId=codex-cli&availableOnly=true"));
  expect(response?.status).toBe(200);
  const invalid = await handle(new Request("http://localhost/api/ai/v1/catalog?availableOnly=perhaps"));
  expect(invalid?.status).toBe(400);
});
test("CLI discovery reflects visible runtime models instead of a dated static list", () => {
  expect(parseCodexModelIds(JSON.stringify({ models: [
    { slug: "gpt-5.6-luna", visibility: "list" }, { slug: "hidden", visibility: "hide" },
    { slug: "gpt-5.6-luna", visibility: "list" }, { slug: 1, visibility: "list" }
  ] }))).toEqual(["gpt-5.6-luna"]);
  expect(parseCodexModelIds("invalid")).toEqual([]);
});
