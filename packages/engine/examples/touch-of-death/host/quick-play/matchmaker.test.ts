import { expect, test } from 'bun:test';
import { createDurableMmoServices, createMemoryDurableServiceStore } from '@hyperfocus/engine/server';
import { createQuickPlayRatings } from './ratings.ts';
import { createQuickPlayMatchmaker } from './matchmaker.ts';

function fixture(tuning = {}) {
  let now = 1000;
  const services = createDurableMmoServices(createMemoryDurableServiceStore(), { now: () => now });
  const ratings = createQuickPlayRatings({ path: ':memory:', now: () => now });
  const measurements = new Map<string, number | undefined>();
  const options = { services, ratings, now: () => now, region: 'local', contentId: 'fixture', tuning, latency: (userId: string) => measurements.get(userId) };
  const matchmaker = createQuickPlayMatchmaker(options);
  async function search(userId: string, requestId = `search-${userId}`) {
    if (!measurements.has(userId)) measurements.set(userId, 30);
    return matchmaker.search({ userId, requestId });
  }
  return { services, ratings, measurements, options, matchmaker, search, advance(ms: number) { now += ms; } };
}

// These are backend receipt/lifecycle tests. Result calls below do not claim physical combat validation.
test('four authenticated humans pair by stored ratings, never caller attributes', async () => {
  const f = fixture({ initialRatingWindow: 5 });
  try {
    for (const user of ['alice', 'bob']) {
      f.ratings.reserve({ matchId: `seed-${user}`, users: [user, `fixture-${user}`] });f.ratings.complete({ matchId: `seed-${user}`, winner: 0 });
    }
    for (const userId of ['alice', 'cara', 'bob', 'dan']) {
      f.measurements.set(userId, 30);
      const intent = { userId, requestId: `search-${userId}`, attributes: { rating: -9999, latencyMs: 0, region: 'spoofed' } };
      const ticket = await f.matchmaker.search(intent);
      expect(ticket.attributes).toEqual({ region: 'local', contentId: 'fixture', rating: f.ratings.get({ userId }) });
    }
    const first = await f.matchmaker.reserveNext(), second = await f.matchmaker.reserveNext();
    expect(new Set(first!.match.users)).toEqual(new Set(['alice', 'bob']));
    expect(new Set(second!.match.users)).toEqual(new Set(['cara', 'dan']));
    expect(first!.match.before).toEqual([1012, 1012]);expect(second!.match.before).toEqual([1000, 1000]);
    expect(first!.match.matchId).not.toBe(second!.match.matchId);expect(await f.matchmaker.reserveNext()).toBeUndefined();
    await expect(f.search('alice', 'another')).rejects.toThrow('assigned match');
  } finally { f.ratings.close(); }
});

test('host measurements and content exclude unavailable peers while viable later humans still pair', async () => {
  const f = fixture();
  try {
    await expect(f.matchmaker.search({ userId: 'unknown', requestId: 'unknown' })).rejects.toThrow('measurement');
    f.measurements.set('slow', 999);await f.search('slow');
    await f.search('disconnected');f.measurements.set('disconnected', undefined);
    f.measurements.set('foreign', 1);
    await f.services.matchmaking.enqueue('foreign', 'tod-quick-play', { idempotencyKey: 'foreign', attributes: { region: 'local', contentId: 'other', rating: 1000 } });
    await f.search('alice');await f.search('bob');const assigned = await f.matchmaker.reserveNext();
    expect(new Set(assigned!.match.users)).toEqual(new Set(['alice', 'bob']));
    expect((await f.services.matchmaking.ticketForPlayer('slow'))?.state).toBe('waiting');
    expect((await f.services.matchmaking.ticketForPlayer('disconnected'))?.state).toBe('waiting');
    expect(await f.matchmaker.reserveNext()).toBeUndefined();
  } finally { f.ratings.close(); }
});

test('waiting cancellation differs from assigned cancellation; completion and interruption finalize once before new search', async () => {
  const f = fixture();
  try {
    await f.search('waiting');expect(await f.matchmaker.cancel({ userId: 'waiting', requestId: 'cancel' })).toEqual({ cancelled: true });
    await f.search('alice');await f.search('bob');const assignment = (await f.matchmaker.reserveNext())!;
    expect(await f.matchmaker.cancel({ userId: 'alice', requestId: 'too-late' })).toEqual({ cancelled: false, matchId: assignment.match.matchId });
    const result = await f.matchmaker.complete({ matchId: assignment.match.matchId, winner: 0 });
    expect(await f.matchmaker.complete({ matchId: assignment.match.matchId, winner: 0 })).toEqual(result);
    await expect(f.matchmaker.complete({ matchId: assignment.match.matchId, winner: 1 })).rejects.toThrow('Conflicting');
    expect(await f.matchmaker.resume({ userId: 'alice' })).toBeUndefined();
    expect((await f.search('alice', 'next-alice')).state).toBe('waiting');await f.search('bob', 'next-bob');
    const next = (await f.matchmaker.reserveNext())!, before = next.match.before;
    const aborted = await f.matchmaker.abort({ matchId: next.match.matchId });expect(aborted.status).toBe('aborted');expect(aborted.after).toEqual(before);
    expect(await f.matchmaker.abort({ matchId: next.match.matchId })).toEqual(aborted);
    expect((await f.search('alice', 'after-abort')).state).toBe('waiting');
  } finally { f.ratings.close(); }
});

test('a service recreated after rating reservation failure reconstructs the immutable pair from durable tickets', async () => {
  const f = fixture();
  try {
    await f.search('alice');await f.search('bob');
    const failing = createQuickPlayMatchmaker({ ...f.options, ratings: { ...f.ratings, reserve() { throw new Error('rating database unavailable'); } } });
    await expect(failing.reserveNext()).rejects.toThrow('unavailable');expect(f.ratings.pending()).toEqual([]);
    const ticket = (await f.services.matchmaking.ticketForPlayer('alice'))!;expect(ticket.state).toBe('matched');
    f.advance(360000);
    await expect(f.matchmaker.search({ userId: 'alice', requestId: 'expired-search' })).rejects.toThrow('assigned match');
    expect((await f.services.matchmaking.ticketForPlayer('alice'))?.handoff).toEqual(ticket.handoff);
    const restored = createQuickPlayMatchmaker(f.options), recovered = (await restored.resume({ userId: 'alice' }))!;
    expect(recovered.match.matchId).toBe(ticket.handoff!.roomId);expect(new Set(recovered.match.users)).toEqual(new Set(['alice', 'bob']));
    expect(await restored.resume({ userId: 'bob' })).toEqual(recovered);expect(f.ratings.pending()).toHaveLength(1);
    const result = await restored.complete({ matchId: recovered.match.matchId, winner: null });expect(result.after).toEqual([1000, 1000]);
    expect((await restored.search({ userId: 'alice', requestId: 'again' })).state).toBe('waiting');
  } finally { f.ratings.close(); }
});

test('a failed ticket release preserves the rating receipt and prevents a second search until finalization retries', async () => {
  const f = fixture();let fail = true;
  try {
    await f.search('alice');await f.search('bob');const assigned = (await f.matchmaker.reserveNext())!;
    const matchmaker = createQuickPlayMatchmaker({ ...f.options, services: { matchmaking: { ...f.services.matchmaking,
      async release(request) { if (fail) { fail = false;throw new Error('release unavailable'); }return f.services.matchmaking.release(request); },
    } } });
    await expect(matchmaker.complete({ matchId: assigned.match.matchId, winner: 0 })).rejects.toThrow('unavailable');
    const rating = f.ratings.get({ userId: assigned.match.users[0] });expect(rating).toBe(1012);
    await expect(matchmaker.search({ userId: 'alice', requestId: 'premature' })).rejects.toThrow('assigned match');
    const receipt = await matchmaker.complete({ matchId: assigned.match.matchId, winner: 0 });expect(receipt.after[0]).toBe(rating);
    expect(f.ratings.get({ userId: assigned.match.users[0] })).toBe(rating);
    expect((await matchmaker.search({ userId: 'alice', requestId: 'finished' })).state).toBe('waiting');
  } finally { f.ratings.close(); }
});
