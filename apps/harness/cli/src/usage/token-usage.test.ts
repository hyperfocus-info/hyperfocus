import { expect, test } from "bun:test";
import { createTokenUsageDelta } from "../server/transport/events";
import { addTokenUsageTotals, createEmptyTokenUsageTotals } from "./token-usage";
import { normalizeTokenUsageTotals } from "../persistence/workspace-repository/models";
import { testExports } from "../agent-runtimes/codex-sdk-adapter";

test("Codex repeated or cumulative turn completion snapshots are counted once", () => {
  const totals = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
  const event = { type: "turn.completed", usage: { input_tokens: 1200, cached_input_tokens: 1000, output_tokens: 80 } };
  testExports.accumulateCodexUsage(event, totals);
  testExports.accumulateCodexUsage(event, totals);
  testExports.accumulateCodexUsage({ ...event, usage: { ...event.usage, output_tokens: 90 } }, totals);
  expect(totals).toEqual({ inputTokens: 1200, outputTokens: 90, cachedInputTokens: 1000 });
});

test("provider input and cached subset are not current context or additive usage", () => {
  const sdk = testExports.createCodexContextUsage("openai/gpt-5.6-luna", { inputTokens: 1200, outputTokens: 80, cachedInputTokens: 1000 })!;
  expect(sdk.tokens).toBeUndefined(); expect(sdk.usagePercent).toBeUndefined();
  const delta = createTokenUsageDelta({ sourceKind: "main", sourceLabel: "main", modelId: "openai/gpt-5.6-luna",
    tokens: 200, inputTokens: 1200, contextWindow: 400000, totalProcessedTokens: sdk.sessionStats.tokens.total,
    cachedInputTokens: 1000, updatedAt: new Date().toISOString() });
  expect(delta.inputTokens).toBe(1200); expect(delta.outputTokens).toBe(80);
  expect(delta.totalTokensIncludingCached).toBe(1280);
  expect(addTokenUsageTotals(createEmptyTokenUsageTotals(), delta).cachedInputTokens).toBe(1000);
  expect(normalizeTokenUsageTotals({ ...delta, totalTokensIncludingCached: 2280 }).totalTokensIncludingCached).toBe(1280);
});
