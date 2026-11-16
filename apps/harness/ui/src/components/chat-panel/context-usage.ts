/** Cache is a subset of cumulative input; current context is a separate quantity. */
export function getCacheHitPercent(usage: { inputTokens?: number; tokens?: number; cachedInputTokens?: number }) {
  if (usage.inputTokens === undefined || usage.inputTokens <= 0 || usage.cachedInputTokens === undefined) return undefined;
  return Math.min(100, Math.max(0, Math.round(100 * usage.cachedInputTokens / usage.inputTokens)));
}
