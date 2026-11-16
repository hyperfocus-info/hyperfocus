import { expect, test } from "bun:test";
import { getCacheHitPercent } from "../../components/chat-panel/context-usage";

test("cache percentage uses cumulative input rather than context occupancy", () => {
  expect(getCacheHitPercent({ inputTokens: 40105, cachedInputTokens: 29184 })).toBe(73);
  expect(getCacheHitPercent({ tokens: 500, cachedInputTokens: 29184 })).toBeUndefined();
  expect(getCacheHitPercent({ inputTokens: 100, cachedInputTokens: 0 })).toBe(0);
});
