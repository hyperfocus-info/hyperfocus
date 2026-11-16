export type QuickPlayCandidate = Readonly<{
  userId: string; rating: number; queuedAt: number; region: string; contentId: string; latencyMs: number;
}>;
export type QuickPlayTuning = Readonly<{
  maxLatencyMs: number; initialRatingWindow: number; ratingWindowStep: number; wideningIntervalMs: number; maximumRatingWindow: number;
}>;
export type QuickPlayPair = readonly [QuickPlayCandidate, QuickPlayCandidate];

/** Provisional product defaults, not measurements of queue population or network quality. */
export const quickPlayDefaults: QuickPlayTuning = Object.freeze({
  maxLatencyMs: 150, initialRatingWindow: 100, ratingWindowStep: 50, wideningIntervalMs: 10_000, maximumRatingWindow: 600,
});
export const quickPlayInitialRating = 1000;

function readTuning(value: Partial<QuickPlayTuning>): QuickPlayTuning {
  const tuning = { ...quickPlayDefaults, ...value };
  if (Object.values(tuning).some(number => !Number.isFinite(number) || number < 0)
    || tuning.wideningIntervalMs === 0 || tuning.maximumRatingWindow < tuning.initialRatingWindow) throw new Error('Invalid Quick Play tuning.');
  return tuning;
}
function nonempty(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function valid(candidate: QuickPlayCandidate, now: number): boolean {
  return !!candidate && nonempty(candidate.userId) && nonempty(candidate.region) && nonempty(candidate.contentId)
    && Number.isFinite(candidate.rating) && Number.isFinite(candidate.queuedAt) && candidate.queuedAt >= 0 && candidate.queuedAt <= now
    && Number.isFinite(candidate.latencyMs) && candidate.latencyMs >= 0;
}
function oldest(a: QuickPlayCandidate, b: QuickPlayCandidate): number {
  return a.queuedAt - b.queuedAt || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0);
}

/** Chooses real queued humans only; incompatible older tickets never block a later viable pair. */
export function selectQuickPlayPair(options: {
  candidates: readonly QuickPlayCandidate[]; now: number; tuning?: Partial<QuickPlayTuning>;
}): QuickPlayPair | undefined {
  if (!Number.isFinite(options.now) || options.now < 0) throw new Error('Invalid Quick Play clock.');
  const tuning = readTuning(options.tuning ?? {}), counts = new Map<string, number>();
  // Reject every duplicate identity, rather than trusting whichever conflicting ticket appears first.
  for (const candidate of options.candidates) if (candidate && nonempty(candidate.userId)) counts.set(candidate.userId, (counts.get(candidate.userId) ?? 0) + 1);
  const candidates = options.candidates.filter(candidate => valid(candidate, options.now)
    && counts.get(candidate.userId) === 1 && candidate.latencyMs <= tuning.maxLatencyMs).sort(oldest);
  const window = (candidate: QuickPlayCandidate) => Math.min(tuning.maximumRatingWindow,
    tuning.initialRatingWindow + Math.floor((options.now - candidate.queuedAt) / tuning.wideningIntervalMs) * tuning.ratingWindowStep);
  for (let index = 0; index < candidates.length; index++) {
    const first = candidates[index]!;
    const eligible = candidates.slice(index + 1).filter(second => first.region === second.region && first.contentId === second.contentId
      && Math.abs(first.rating - second.rating) <= Math.min(window(first), window(second)));
    eligible.sort((a, b) => Math.abs(first.rating - a.rating) - Math.abs(first.rating - b.rating) || oldest(a, b));
    if (eligible[0]) return [{ ...first }, { ...eligible[0] }];
  }
  return undefined;
}

/** Fixed-K24 Elo for host-confirmed results. This helper neither authorizes results nor persists ratings. */
export function updateQuickPlayRatings(options: { ratings: readonly [number, number]; result: 'win' | 'draw' | 'loss' }): {
  ratings: [number, number]; delta: number;
} {
  const [first, second] = options.ratings;
  if (!Number.isFinite(first) || !Number.isFinite(second) || !['win', 'draw', 'loss'].includes(options.result)) throw new Error('Invalid Quick Play rating result.');
  const expected = 1 / (1 + 10 ** ((second - first) / 400));
  const score = options.result === 'win' ? 1 : options.result === 'draw' ? .5 : 0;
  const change = 24 * (score - expected);
  // Symmetric half-away-from-zero rounding avoids seat bias in the integer delta.
  const delta = Math.sign(change) * Math.floor(Math.abs(change) + .5) || 0;
  return { ratings: [first + delta, second - delta], delta };
}
