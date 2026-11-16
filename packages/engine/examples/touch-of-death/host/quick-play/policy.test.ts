import { expect, test } from 'bun:test';
import { quickPlayDefaults, quickPlayInitialRating, selectQuickPlayPair, updateQuickPlayRatings, type QuickPlayCandidate } from './policy.ts';

const candidate = (userId: string, overrides: Partial<QuickPlayCandidate> = {}): QuickPlayCandidate => ({ userId, rating: 1000, queuedAt: 0, region: 'east', contentId: 'v3', latencyMs: 50, ...overrides });
test('oldest viable candidate gets closest rating, then oldest deterministic tie without input mutation', () => {
  const candidates = [candidate('near-new', { rating: 990, queuedAt: 3 }), candidate('far', { rating: 1080, queuedAt: 1 }),
    candidate('oldest'), candidate('near-old', { rating: 1010, queuedAt: 2 })];
  const before = structuredClone(candidates), pair = selectQuickPlayPair({ candidates, now: 5 })!;
  expect(pair.map(value => value.userId)).toEqual(['oldest', 'near-old']);expect(candidates).toEqual(before);expect(pair[0]).not.toBe(candidates[2]);
  expect(selectQuickPlayPair({ candidates: [candidate('z'), candidate('b'), candidate('a')], now: 0 })!.map(value => value.userId)).toEqual(['a', 'b']);
});
test('region, content and individual latency limits preserve later viable pairs and never manufacture opponents', () => {
  const candidates = [candidate('old', { region: 'west' }), candidate('other-build', { contentId: 'v4' }),
    candidate('slow', { latencyMs: 150.001 }), candidate('one', { queuedAt: 1, latencyMs: 150 }), candidate('two', { queuedAt: 2 })];
  expect(selectQuickPlayPair({ candidates, now: 2 })!.map(value => value.userId)).toEqual(['one', 'two']);
  expect(selectQuickPlayPair({ candidates: candidates.slice(0, 3), now: 2 })).toBeUndefined();
  expect(selectQuickPlayPair({ candidates: [], now: 0 })).toBeUndefined();expect(selectQuickPlayPair({ candidates: [candidate('alone')], now: 0 })).toBeUndefined();
});
test('both rating windows widen at exact intervals and stop at the configured cap', () => {
  const candidates = [candidate('a'), candidate('b', { rating: 1150 })];
  expect(selectQuickPlayPair({ candidates, now: 9999 })).toBeUndefined();expect(selectQuickPlayPair({ candidates, now: 10000 })).toBeDefined();
  expect(selectQuickPlayPair({ candidates: [candidates[0]!, candidate('b', { rating: 1150, queuedAt: 10000 })], now: 10000 })).toBeUndefined();
  expect(selectQuickPlayPair({ candidates: [candidate('a'), candidate('b', { rating: 1600 })], now: 100000 })).toBeDefined();
  expect(selectQuickPlayPair({ candidates: [candidate('a'), candidate('b', { rating: 1601 })], now: 1e12 })).toBeUndefined();
  expect(selectQuickPlayPair({ candidates, now: 0, tuning: { initialRatingWindow: 150 } })).toBeDefined();
  expect(quickPlayDefaults.maximumRatingWindow).toBe(600);
});
test('invalid candidates and all duplicate identities are excluded; invalid tuning is rejected', () => {
  const bad = [candidate('dup'), candidate('dup'), candidate('nan', { rating: NaN }), candidate('future', { queuedAt: 1 }),
    candidate('negative-time', { queuedAt: -1 }), candidate('infinite', { latencyMs: Infinity }), candidate('negative-latency', { latencyMs: -1 }), candidate('')];
  expect(selectQuickPlayPair({ candidates: [...bad, candidate('only')], now: 0 })).toBeUndefined();
  for (const tuning of [{ maxLatencyMs: NaN }, { wideningIntervalMs: 0 }, { ratingWindowStep: -1 }, { maximumRatingWindow: 99 }, { maxLatencyMs: Infinity }]) {
    expect(() => selectQuickPlayPair({ candidates: [], now: 0, tuning })).toThrow();
  }
  for (const now of [-1, NaN, Infinity]) expect(() => selectQuickPlayPair({ candidates: [], now })).toThrow();
});
test('fixed-K Elo remains symmetric, zero-sum and explicit about draws and invalid outcomes', () => {
  expect(quickPlayInitialRating).toBe(1000);
  expect(updateQuickPlayRatings({ ratings: [1000, 1000], result: 'win' })).toEqual({ ratings: [1012, 988], delta: 12 });
  expect(updateQuickPlayRatings({ ratings: [1000, 1000], result: 'draw' })).toEqual({ ratings: [1000, 1000], delta: 0 });
  for (const result of ['win', 'draw', 'loss'] as const) {
    const first = updateQuickPlayRatings({ ratings: [900, 1250], result });
    const opposite = updateQuickPlayRatings({ ratings: [1250, 900], result: result === 'win' ? 'loss' : result === 'loss' ? 'win' : 'draw' });
    expect(first.ratings[0] + first.ratings[1]).toBe(2150);expect(first.ratings).toEqual([opposite.ratings[1], opposite.ratings[0]]);expect(Math.abs(first.delta)).toBeLessThanOrEqual(24);
  }
  expect(() => updateQuickPlayRatings({ ratings: [NaN, 1000], result: 'win' })).toThrow();
});
