import { expect, test } from 'bun:test';
import { createDurableMmoServices, createMemoryDurableServiceStore } from '@hyperfocus/engine/server';
import { createQuickPlayRatings } from './ratings.ts';
import { createQuickPlayMatchmaker } from './matchmaker.ts';
import { createQuickPlayCoordinator } from './coordinator.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function fixture(path = ':memory:', onResult?: Parameters<typeof createQuickPlayCoordinator>[0]['onResult']) {
  let time = 1000, failRelease = false, failCancel = false;
  const services = createDurableMmoServices(createMemoryDurableServiceStore(), { now: () => time });
  const ratings = createQuickPlayRatings({ path, now: () => time });
  const matchmaker = createQuickPlayMatchmaker({ services: { matchmaking: { ...services.matchmaking,
    async release(request) { if (failRelease) throw new Error('storage unavailable');return services.matchmaking.release(request); },
    async cancel(...args) { if (failCancel) throw new Error('cancel unavailable');return services.matchmaking.cancel(...args); },
  } }, ratings, region: 'local', contentId: 'fixture', latency: () => 20, now: () => time });
  const options = { matchmaker, ratings, now: () => time, onResult }, coordinator = createQuickPlayCoordinator(options);
  const alice = { userId: 'alice', connectionId: 'a' }, bob = { userId: 'bob', connectionId: 'b' };
  await coordinator.join(alice);await coordinator.join(bob);
  async function pair() {
    await coordinator.search({ ...alice, requestId: `a-${time}` });await coordinator.search({ ...bob, requestId: `b-${time}` });await coordinator.tick();
    return coordinator.view(alice).matchId;
  }
  async function play() { const matchId = await pair();await coordinator.accept({ ...alice, matchId });await coordinator.accept({ ...bob, matchId });return matchId; }
  return { services, ratings, matchmaker, options, coordinator, alice, bob, pair, play, advance(ms: number) { time += ms; },
    get failRelease() { return failRelease; }, set failRelease(value: boolean) { failRelease = value; },
    get failCancel() { return failCancel; }, set failCancel(value: boolean) { failCancel = value; } };
}

test('committed match rewards retry after failure without applying ratings twice', async () => {
  let attempts = 0;
  const f = await fixture(':memory:', async result => { expect(result.userIds).toEqual(['alice', 'bob']);expect(result.winnerId).toBe('alice');if (++attempts === 1) throw new Error('reward storage unavailable'); });
  try {
    const matchId = await f.play();
    await expect(f.coordinator.complete({ matchId, winner: 0 })).rejects.toThrow('reward storage unavailable');
    expect(f.coordinator.view(f.alice).phase).toBe('saving');expect(f.ratings.get({ userId: 'alice' })).toBe(1012);
    await f.coordinator.tick();expect(attempts).toBe(2);expect(f.coordinator.view(f.alice).phase).toBe('result');
    expect(f.ratings.get({ userId: 'alice' })).toBe(1012);
  } finally { await f.coordinator.shutdown();f.ratings.close(); }
});

test('waiting cancellation, stale connections and explicit two-person acceptance preserve ownership', async () => {
  const f = await fixture();
  try {
    await f.coordinator.search({ ...f.alice, requestId: 'initial' });expect(f.coordinator.view(f.alice).phase).toBe('searching');
    await f.coordinator.cancel({ ...f.alice, requestId: 'cancel' });expect(f.coordinator.view(f.alice).phase).toBe('idle');
    await expect(f.coordinator.search({ ...f.alice, requestId: 'initial' })).rejects.toThrow('finished');expect(f.coordinator.view(f.alice).phase).toBe('idle');
    const replacement = { ...f.alice, connectionId: 'replacement' };await f.coordinator.join(replacement);
    await expect(f.coordinator.search({ ...f.alice, requestId: 'stale' })).rejects.toThrow('stale');
    await f.coordinator.leave(f.alice);
    await f.coordinator.search({ ...replacement, requestId: 'new' });await f.coordinator.search({ ...f.bob, requestId: 'bob' });await f.coordinator.tick();
    const ready = f.coordinator.view(replacement);expect(ready.phase).toBe('ready');expect(ready.deadline).toBe(16000);
    await f.coordinator.accept({ ...replacement, matchId: ready.matchId });expect(f.coordinator.view(replacement).phase).toBe('ready');
    await expect(f.coordinator.accept({ ...f.alice, matchId: ready.matchId })).rejects.toThrow('stale');
    await f.coordinator.accept({ ...f.bob, matchId: ready.matchId });expect(f.coordinator.view(replacement).phase).toBe('playing');
    await expect(f.coordinator.cancel({ ...replacement, requestId: 'playing-cancel' })).rejects.toThrow('playing');
    await f.coordinator.abort({ matchId: ready.matchId });expect(f.coordinator.view(replacement).lastReceipt?.status).toBe('aborted');
  } finally { f.ratings.close(); }
});

test('ready timeout and decline abort once; the willing player explicitly searches again', async () => {
  const f = await fixture();
  try {
    const matchId = await f.pair();await f.coordinator.accept({ ...f.alice, matchId });f.advance(15000);
    await expect(f.coordinator.accept({ ...f.bob, matchId })).rejects.toThrow('expired');
    expect(f.coordinator.view(f.alice)).toMatchObject({ phase: 'result', lastReceipt: { status: 'aborted' }, rating: 1000 });
    await f.coordinator.tick();expect(f.ratings.pending()).toEqual([]);
    await f.coordinator.search({ ...f.alice, requestId: 'willing' });await f.coordinator.tick();expect(f.coordinator.view(f.alice).phase).toBe('searching');
    expect(f.coordinator.view(f.alice).lastReceipt).toBeNull();
    await f.coordinator.search({ ...f.bob, requestId: 'returned' });await f.coordinator.tick();
    expect(f.coordinator.view(f.alice)).toMatchObject({ phase: 'ready', lastReceipt: null });
    await f.coordinator.cancel({ ...f.bob, requestId: 'decline' });expect(f.coordinator.view(f.alice).lastReceipt?.status).toBe('aborted');
    expect(f.coordinator.view(f.alice).phase).toBe('result');
  } finally { f.ratings.close(); }
});

// Trusted result calls here test backend receipts, not earned physical combat.
test('terminal reason policy concedes playing sets, preserves ready cancellation and ignores stale departures', async () => {
  for (const reason of ['leave', 'duplicate-login', 'reconnect-timeout', 'connection-close', 'server-stop', 'disconnect']) {
    const f = await fixture();
    try {
      const matchId = await f.play();await f.coordinator.leave({ ...f.bob, connectionId: 'old', reason });expect(f.coordinator.view(f.alice).phase).toBe('playing');
      await f.coordinator.leave({ ...f.bob, reason });await f.coordinator.leave({ ...f.alice, reason: 'leave' });
      const concede = ['leave', 'duplicate-login', 'reconnect-timeout', 'connection-close'].includes(reason);
      expect(f.coordinator.view(f.alice).lastReceipt).toMatchObject({ matchId, status: concede ? 'complete' : 'aborted', winner: concede ? 0 : null, after: concede ? [1012, 988] : [1000, 1000] });
    } finally { f.ratings.close(); }
  }
  for (const reason of ['leave', 'connection-close']) {
    const f = await fixture();try { await f.pair();await f.coordinator.leave({ ...f.bob, reason });expect(f.coordinator.view(f.alice).lastReceipt?.status).toBe('aborted'); } finally { f.ratings.close(); }
  }
});

test('replacement concedes and its rating receipt survives SQLite reopen; host shutdown aborts unfinished play', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tod-concession-')), path = join(directory, 'ratings.sqlite');const f = await fixture(path);
  try {
    const matchId = await f.play();await f.coordinator.join({ ...f.bob, connectionId: 'new-bob' });const receipt = f.coordinator.view(f.alice).lastReceipt!;expect(receipt).toMatchObject({ winner: 0, status: 'complete' });f.ratings.close();
    const reopened = createQuickPlayRatings({ path });try { expect(reopened.complete({ matchId, winner: 0 })).toEqual(receipt);expect(reopened.get({ userId: 'bob' })).toBe(988);expect(reopened.pending()).toEqual([]); } finally { reopened.close(); }
  } finally { f.ratings.close();rmSync(directory, { recursive: true, force: true }); }
  const next = await fixture();try { await next.play();await next.coordinator.shutdown();expect(next.coordinator.view(next.alice).lastReceipt).toMatchObject({ status: 'aborted', after: [1000, 1000] }); } finally { next.ratings.close(); }
});

test('failed result finalization survives disconnect and host abort, then retries without another rating change', async () => {
  const f = await fixture();
  try {
    const matchId = await f.play();f.failRelease = true;
    await expect(f.coordinator.complete({ matchId, winner: 0 })).rejects.toThrow('unavailable');
    expect(f.coordinator.view(f.alice).phase).toBe('saving');expect(f.coordinator.view(f.alice).lastReceipt).toBeNull();
    await expect(f.coordinator.search({ ...f.alice, requestId: 'early' })).rejects.toThrow('Finish');
    await expect(f.coordinator.leave({ ...f.alice, reason: 'connection-close' })).rejects.toThrow('unavailable');
    f.failRelease = false;await f.coordinator.abort({ matchId });
    const receipt = f.coordinator.view(f.alice).lastReceipt!;expect(receipt.status).toBe('complete');expect(receipt.after).toEqual([1012, 988]);
    expect(await f.coordinator.complete({ matchId, winner: 0 })).toEqual(receipt);
    await expect(f.coordinator.complete({ matchId, winner: 1 })).rejects.toThrow('Conflicting');
    await f.coordinator.tick();expect(f.ratings.get({ userId: receipt.users[0] })).toBe(1012);
  } finally { f.ratings.close(); }
});

test('restart aborts unfinished assignments and finalizes durable terminal receipts instead of starting gameplay', async () => {
  const f = await fixture();
  try {
    await f.play();const restarted = createQuickPlayCoordinator(f.options);
    expect((await restarted.join({ ...f.alice, connectionId: 'new-a' })).lastReceipt?.status).toBe('aborted');
    expect((await restarted.join({ ...f.bob, connectionId: 'new-b' })).phase).toBe('result');expect(f.ratings.pending()).toEqual([]);
    const a = { ...f.alice, connectionId: 'new-a' }, b = { ...f.bob, connectionId: 'new-b' };
    await restarted.search({ ...a, requestId: 'again-a' });await restarted.search({ ...b, requestId: 'again-b' });await restarted.tick();
    const matchId = restarted.view(a).matchId;await restarted.accept({ ...a, matchId });await restarted.accept({ ...b, matchId });
    f.failRelease = true;await expect(restarted.complete({ matchId, winner: null })).rejects.toThrow('unavailable');
    f.failRelease = false;const finalHost = createQuickPlayCoordinator(f.options);
    const recovered = await finalHost.join({ ...a, connectionId: 'third-a' });expect(recovered.phase).toBe('result');expect(recovered.lastReceipt?.status).toBe('complete');
    expect(recovered.lastReceipt?.winner).toBeNull();expect(recovered.rating).toBe(1000);
  } finally { f.ratings.close(); }
});

test('failed waiting departure cancellation retries on tick without reviving a disconnected search', async () => {
  const f = await fixture();
  try {
    await f.coordinator.search({ ...f.alice, requestId: 'wait' });f.failCancel = true;
    await expect(f.coordinator.leave(f.alice)).rejects.toThrow('unavailable');
    f.failCancel = false;await f.coordinator.tick();expect(f.coordinator.view(f.alice).phase).toBe('idle');
    expect(await f.matchmaker.resume(f.alice)).toBeUndefined();
    await expect(f.coordinator.search({ ...f.alice, requestId: 'ghost' })).rejects.toThrow('stale');
  } finally { f.ratings.close(); }
});

test('expired waiting searches become idle and stale result or departure history stays bounded', async () => {
  const f = await fixture();
  try {
    await f.coordinator.search({ ...f.alice, requestId: 'expires' });f.advance(300000);await f.coordinator.tick();
    expect(f.coordinator.view(f.alice)).toMatchObject({ phase: 'idle', lastReceipt: null });expect(f.coordinator.view(f.alice).message).toContain('expired');
    for (let index = 0; index < 130; index++) {
      const identity = { userId: `departed-${index}`, connectionId: `connection-${index}` };
      await f.coordinator.join(identity);await f.coordinator.leave(identity);
    }
    await f.coordinator.tick();expect(() => f.coordinator.view({ userId: 'departed-0' })).toThrow('Join');
    expect(f.coordinator.view({ userId: 'departed-129' }).phase).toBe('idle');
    let oldest = '';
    for (let index = 0; index < 130; index++) { f.advance(1);const matchId = await f.pair();oldest ||= matchId;await f.coordinator.abort({ matchId }); }
    await f.coordinator.tick();await expect(f.coordinator.abort({ matchId: oldest })).rejects.toThrow('Unknown');
    expect(f.coordinator.view(f.alice).lastReceipt?.status).toBe('aborted');
  } finally { f.ratings.close(); }
});
