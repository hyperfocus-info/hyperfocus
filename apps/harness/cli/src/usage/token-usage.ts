import type { TokenUsageTotals } from "@hyperfocus/ai-core/protocol";

export function normalizeTokenCount(value: number | undefined) {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : 0;
}

export function createEmptyTokenUsageTotals(overrides: Partial<TokenUsageTotals> = {}): TokenUsageTotals {
  return { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, totalProcessedTokens: 0,
    totalTokensIncludingCached: 0, events: 0, ...overrides };
}

export function addTokenUsageTotals(left: TokenUsageTotals, right: TokenUsageTotals): TokenUsageTotals {
  const totalProcessedTokens = left.totalProcessedTokens + right.totalProcessedTokens;
  return { inputTokens: left.inputTokens + right.inputTokens, outputTokens: left.outputTokens + right.outputTokens,
    cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens, totalProcessedTokens,
    // Retained wire field; cached input is already contained in processed input.
    totalTokensIncludingCached: totalProcessedTokens, events: left.events + right.events,
    updatedAt: [left.updatedAt, right.updatedAt].filter(Boolean).sort().at(-1) };
}
