import { expect, test } from "bun:test";
import { createCodexCliAdapter } from "../cli-adapters";
import { createMemoryOnlyProviderCredentialStore } from "../credential-store";
import { aiRunRequestSchema } from "@hyperfocus/ai-core/runtime";
import { codexSubscriptionEnvironment, qualifyCodexSubscription } from "./codex-account";
import { parseCodexSubscriptionResult } from "./codex-subscription";
import { createLocalAiRuntime } from "../runtime";

const request = aiRunRequestSchema.parse({ requestId: "subscription", profile: { agentId: "codex-cli", providerId: "codex-account", modelId: "default", reasoning: "low" }, messages: [{ role: "user", content: "reason about a remote task" }] });
const ready = qualifyCodexSubscription("pro", { primary: { usedPercent: 6 }, secondary: null });
const events = [{ type: "item.completed", item: { type: "agent_message", text: '{"action":"finish"}' } }, { type: "turn.completed", usage: { input_tokens: 120, cached_input_tokens: 50, output_tokens: 9 } }].map(value => JSON.stringify(value)).join("\n");

test("subscription child receives no ambient paid provider or Railway credentials", () => {
  const env = codexSubscriptionEnvironment("/private/codex", { PATH: "/bin", HOME: "/home/worker", OPENAI_API_KEY: "paid", CODEX_API_KEY: "paid", ANTHROPIC_API_KEY: "paid", RAILWAY_API_TOKEN: "cloud", HTTPS_PROXY: "credential-bearing", CODEX_HOME: "/ignored" });
  expect(env).toEqual({ PATH: "/bin", HOME: "/home/worker", CODEX_HOME: "/private/codex" });
});

test("unknown and exhausted subscription windows fail closed even when another window is available", () => {
  expect(qualifyCodexSubscription("pro", { primary: null, secondary: null }).available).toBe(false);
  expect(qualifyCodexSubscription("pro", { primary: { usedPercent: 1 }, secondary: { usedPercent: 100 } }).available).toBe(false);
  expect(qualifyCodexSubscription("pro", { primary: { usedPercent: 1 }, secondary: null, rateLimitReachedType: "credits" }).available).toBe(false);
  expect(ready.available).toBe(true);
  expect(qualifyCodexSubscription("pro", { primary: { usedPercent: 90 }, secondary: null, credits: { hasCredits: true, unlimited: false, balance: "100" } }).available).toBe(false);
  expect(qualifyCodexSubscription("pro", { primary: { usedPercent: 8 }, secondary: null, credits: { hasCredits: true, unlimited: false, balance: "100" } }).available).toBe(true);
});

test("subscription adapter uses ChatGPT-only auth, reported tokens and estimated subscription cost", async () => {
  let calls = 0;
  const adapter = createCodexCliAdapter({ executable: "fixture-codex", subscriptionOnly: true, readSubscription: async () => ready, runProcess: async input => {
    calls++;
    expect(input.command).toContain('forced_login_method="chatgpt"');
    expect(input.command).toContain("features.shell_tool=false");
    expect(input.command).toContain("features.plugins=false");
    expect(input.command).toContain("--ignore-user-config");
    expect(input.env).not.toHaveProperty("OPENAI_API_KEY");
    return { requestId: request.requestId, profile: request.profile, text: events, stopReason: "stop" };
  } });
  const result = await adapter.run(request, createMemoryOnlyProviderCredentialStore(), { signal: new AbortController().signal });
  expect(calls).toBe(1);
  expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 9, costUsd: 0, costSource: "estimated" });
  expect(result.text).toBe('{"action":"finish"}');
});

test("unavailable subscription never invokes inference and host tool responses are rejected", async () => {
  let calls = 0;
  const adapter = createCodexCliAdapter({ executable: "fixture-codex", subscriptionOnly: true, readSubscription: async () => ({ ...ready, available: false }), runProcess: async () => { calls++; throw Error("Must not run"); } });
  await expect(adapter.run(request, createMemoryOnlyProviderCredentialStore(), { signal: new AbortController().signal })).rejects.toThrow("unavailable");
  expect(calls).toBe(0);
  expect(() => parseCodexSubscriptionResult({ requestId: request.requestId, profile: request.profile, text: JSON.stringify({ type: "item.completed", item: { type: "command_execution", command: "unsafe" } }), stopReason: "stop" })).toThrow("unsupported item");
});

test("host allowlisted subscription profiles reach the exact CLI model without API fallback", async () => {
  const adapter = createCodexCliAdapter({ executable: "fixture-codex", subscriptionOnly: true, subscriptionModels: ["gpt-6-astra"], readSubscription: async () => ready, runProcess: async input => {
    expect(input.command[input.command.indexOf("--model") + 1]).toBe("gpt-6-astra");
    expect(input.command).toContain('model_reasoning_effort="xhigh"');
    return { requestId: request.requestId, profile: input.request.profile, text: events, stopReason: "stop" };
  } });
  const runtime = createLocalAiRuntime({ adapters: [adapter], credentialStore: createMemoryOnlyProviderCredentialStore() });
  const result = await runtime.run({ ...request, profile: { ...request.profile, modelId: "gpt-6-astra", reasoning: "xhigh" } });
  expect(result.usage?.costUsd).toBe(0);
  await expect(runtime.run({ ...request, profile: { ...request.profile, modelId: "unconfigured-model" } })).rejects.toThrow();
});
