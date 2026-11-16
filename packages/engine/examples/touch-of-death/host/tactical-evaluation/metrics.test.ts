import { expect, test } from 'bun:test';
import { freshMetrics, sessionSetStatus, summarize } from './metrics.ts';

test('capped sets remain unscored and seat swapping changes candidate outcome correctly', () => {
  const metrics = [freshMetrics(), freshMetrics()];
  const result = summarize([
    { winner: 'player', candidateSeat: 0, ticks: 60, milliseconds: 1000, metrics },
    { winner: 'player', candidateSeat: 1, ticks: 60, milliseconds: 1000, metrics },
    { candidateSeat: 0, ticks: 60, milliseconds: 1000, metrics },
  ]);
  expect(result).toMatchObject({ completed: 2, capped: 1, wins: 1, losses: 1, winRate: .5, simulatedSeconds: 3, gamesPerMinute: 40 });
  expect(result.winRate95?.[0]).toBeLessThan(.5);expect(result.winRate95?.[1]).toBeGreaterThan(.5);
});

test('damage, punish and action diversity use only the candidate seat', () => {
  const candidate = freshMetrics(), other = freshMetrics();
  Object.assign(candidate, { damageDealt: 30, damageTaken: 10, hits: 4, punishes: 1, observations: 60, actions: { guard: 30, heavy: 30 }, hitsByMove: { heavy: 3, jab: 1 } });
  other.damageDealt = 900;
  const result = summarize([{ winner: 'opponent', candidateSeat: 1, ticks: 60, milliseconds: 1000, metrics: [other, candidate] }]);
  expect(result).toMatchObject({ damageDifferential: 20, punishRate: .25, distinctDamagingMoves: 2, requestedActionEntropy: 1, observationCallsPerSimulatedSecond: 60 });
});

test('a training session ending mid-set is partial, not an evaluation cap or scored draw', () => {
  const result = summarize([{ candidateSeat: 0, partial: true, ticks: 60, milliseconds: 1000, metrics: [freshMetrics(), freshMetrics()] }]);
  expect(result).toMatchObject({ completed: 0, capped: 0, partial: 1, winRate: null, gamesPerMinute: 0 });
});

test('full scoring frequency counts selections, not interleaved per-move timer intervals', () => {
  const candidate = freshMetrics();
  candidate.stages = { candidates: { calls: 10, milliseconds: 1 }, selection: { calls: 2, milliseconds: 1 } };
  const result = summarize([{ candidateSeat: 0, ticks: 60, milliseconds: 1000, metrics: [candidate, freshMetrics()] }]);
  expect(result.fullScoresPerSimulatedSecond).toBe(2);
});

test('session caps censor unfinished sets while a last-tick victory remains scored', () => {
  expect(sessionSetStatus(undefined, 12000, 12000)).toEqual({ capped: true, partial: false });
  expect(sessionSetStatus(undefined, 11999, 12000)).toEqual({ capped: false, partial: true });
  expect(sessionSetStatus('player', 12000, 12000)).toEqual({ capped: false, partial: false });
});
