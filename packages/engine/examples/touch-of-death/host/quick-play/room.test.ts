import { expect, test } from 'bun:test';
import { isObject } from '@hyperfocus/utilities/records';
import type { CombatRoomInput } from '@hyperfocus/engine/combat/net';
import { createAuthoritativeRoom } from '@hyperfocus/engine/server';
import type { AuthoritativePlayer } from '@hyperfocus/engine/server';
import { createDurableMmoServices, createMemoryDurableServiceStore } from '@hyperfocus/engine/server';
import { combatMotionFixture } from '../../test/combat-fixture.ts';
import { createNetworkCombatSpectator } from '@hyperfocus/engine/project/runtime-3d';
import { quickPlayProtocolVersion, readQuickPlaySnapshot } from '../../src/network/quick-play/protocol.ts';
import { createQuickPlayRatings } from './ratings.ts';
import { createQuickPlayRoom } from './room.ts';
import { createRoomSocialService } from '../community/social.ts';
import { createUploadService } from '../uploads/service.ts';
import { readUploadResponse } from '../../src/uploads/protocol.ts';

async function fixture(images = false) {
  const f = await combatMotionFixture({ match: true });f.game.reset();
  let time = 1000, failRelease = false, sequence = 0;
  const base = createDurableMmoServices(createMemoryDurableServiceStore(), { now: () => time });
  const services = { matchmaking: { ...base.matchmaking, async release(request: Parameters<typeof base.matchmaking.release>[0]) {
    if (failRelease) throw new Error('release unavailable');return base.matchmaking.release(request);
  } } };
  const ratings = createQuickPlayRatings({ path: ':memory:', now: () => time });
  const records = new Map<string, unknown>(), persistence = { async loadPlayer(id: string) { return structuredClone(records.get(id) ?? null); }, async savePlayer(id: string, value: unknown) { records.set(id, structuredClone(value)); } };
  const social = createRoomSocialService({ services: base, persistence, now: () => time });
  const uploads = createUploadService({ persistence, allowedSlots: ['badge'], now: () => time, allowView: ({ roomId, viewerId, ownerId }) => social.allowCommunication({ roomId, userId: viewerId, otherUserId: ownerId }) });
  const room = createAuthoritativeRoom({ id: 'quick-play', now: () => time, metrics: { record() {} }, type: createQuickPlayRoom({
    project: f.project, assets: f.assets, contentId: 'fixture', seed: 19, services, ratings, now: () => time,
    ...(images ? { social, uploads } : {}),
  }) });
  const request = { contentId: 'fixture', quickPlayVersion: quickPlayProtocolVersion };
  const players = ['alice', 'bob', 'cara', 'dan'].map((userId, index): AuthoritativePlayer => ({ id: `socket-${index}`, userId, sessionId: `session-${index}`, roomId: room.id, joinedAt: time, lastInputAt: time }));
  for (const player of players) expect(await room.join(player, request)).toEqual({ ok: true });
  const snapshot = (id = players[0]!.id) => readQuickPlaySnapshot(room.snapshotFor(id));
  function measure(peers = players) {
    for (let sample = 0; sample < 2; sample++) {
      const seq = ++sequence;
      for (const peer of peers) room.replicationSent(peer.id, { sequence: seq, baseline: 0, kind: 'snapshot', now: time });
      time += 20;for (const peer of peers) room.replicationAck(peer.id, seq);
    }
  }
  async function pair() {
    measure();for (const player of players) await room.event(player.id, { type: 'quick-search', requestId: `search-${player.id}` });
    await room.update(0.016666666666666666);
    for (const player of players) { const value = snapshot(player.id);expect(value.quickPlay.phase).toBe('ready');await room.event(player.id, { type: 'quick-accept', matchId: value.matchId }); }
    for (const player of players) expect(snapshot(player.id).quickPlay.phase).toBe('playing');
  }
  return { ...f, room, ratings, request, players, snapshot, measure, pair, social, uploads, advance(ms: number) { time += ms; },
    get failRelease() { return failRelease; }, set failRelease(value: boolean) { failRelease = value; } };
}
const neutral = (matchId: string, frame: number): CombatRoomInput => ({ matchId, frame, actions: [], direction: { x: 0, y: 0, z: 0 } });

test('bilateral host quality timeout saves an unrated no-contest, retries release, and leaves the other pair playing', async () => {
  const f = await fixture();
  try {
    await f.pair();f.failRelease = true;
    const matchId = f.snapshot().matchId;
    for (let step = 0; step < 55; step++) {
      for (const broadcast of f.room.drainBroadcasts()) {
        const event = broadcast.event;
        const peer = broadcast.recipients?.[0];
        if (isObject(event) && event.type === 'tod-quality-probe' && peer && peer !== 'socket-0' && peer !== 'socket-1') await f.room.event(peer, { ...event, type: 'tod-quality-ack' });
      }
      f.advance(250);await f.room.update(0.016666666666666666);
    }
    expect(f.snapshot().quickPlay.phase).toBe('saving');
    f.failRelease = false;f.advance(250);await f.room.update(0.016666666666666666);
    expect(f.snapshot().quickPlay).toMatchObject({ phase: 'result', outcome: 'aborted', ratingDelta: 0 });
    expect(f.snapshot().quickPlay.error).toContain('No contest');
    expect(f.snapshot('socket-1').quickPlay.outcome).toBe('aborted');
    expect(f.snapshot('socket-2').quickPlay.phase).toBe('playing');
    f.advance(250);await f.room.update(0.016666666666666666);
    expect(f.snapshot().quickPlay.matchId).toBe(matchId);expect(f.ratings.get({ userId: 'alice' })).toBe(1000);
  } finally { f.failRelease = false;await f.room.dispose('test');f.ratings.close(); }
});

test('Quick Play shares unreviewed images only with current opponents and restricts equipment changes to idle/result', async () => {
  const f = await fixture(true);
  const request = async (playerId: string, command: unknown) => { f.room.drainBroadcasts();await f.room.event(playerId, command);return readUploadResponse(f.room.drainBroadcasts().find(value => (isObject(value.event) ? value.event.type : undefined) === 'upload-result')!.event); };
  try {
    expect(f.snapshot().quickPlay.uploadsEnabled).toBe(true);
    const saved = await f.uploads.submit({ ownerId: 'alice', requestId: 'submit', expectedRevision: 0, raster: { width: 1, height: 1, rgba: 'AQEBAQ==' } }), uploadId = saved.uploads[0]!.id;
    await f.uploads.review({ ownerId: 'alice', reviewerId: 'host', requestId: 'approve', expectedRevision: 1, uploadId, status: 'approved', reason: '' });
    const equip = { type: 'upload-equip', requestId: 'equip', expectedRevision: 2, slotId: 'badge', uploadId };
    expect((await request('socket-0', equip)).equipment).toEqual({ badge: uploadId });
    const read = { type: 'upload-read', requestId: 'read', ownerId: 'alice', uploadId };
    expect((await request('socket-1', read)).raster).toBeNull();
    f.measure();await f.room.event('socket-0', { type: 'quick-search', requestId: 'alice-search' });
    expect(f.snapshot().quickPlay.phase).toBe('searching');expect((await request('socket-0', { ...equip, requestId: 'search-equip', expectedRevision: 3 })).error).toContain('between fights');
    for (const player of f.players.slice(1)) await f.room.event(player.id, { type: 'quick-search', requestId: `search-${player.id}` });
    await f.room.update(0.016666666666666666);expect(f.snapshot().quickPlay.phase).toBe('ready');
    const opponent = f.players.find(player => player.userId !== 'alice' && f.snapshot().quickPlay.users.includes(player.userId))!;
    const outsider = f.players.find(player => !f.snapshot().quickPlay.users.includes(player.userId))!;
    expect((await request(opponent.id, read)).raster).not.toBeNull();expect((await request(outsider.id, read))).toMatchObject({ uploads: [], equipment: {}, raster: null });
    expect((await request('socket-0', { ...equip, requestId: 'ready-equip', expectedRevision: 3 })).error).toContain('between fights');
    for (const player of f.players) await f.room.event(player.id, { type: 'quick-accept', matchId: f.snapshot(player.id).matchId });
    expect((await request('socket-0', { ...equip, requestId: 'playing-equip', expectedRevision: 3 })).error).toContain('between fights');
    await f.room.event(opponent.id, { type: 'social-block', requestId: 'block-alice', targetId: 'alice', enabled: true });
    expect(f.snapshot(opponent.id).quickPlay.blockedUserIds).toEqual(['alice']);expect((await request(opponent.id, read)).raster).toBeNull();
    await f.room.event(opponent.id, { type: 'social-block', requestId: 'unblock-alice', targetId: 'alice', enabled: false });
    expect((await request(opponent.id, read)).raster).not.toBeNull();
    await f.uploads.review({ ownerId: 'alice', reviewerId: 'host', requestId: 'revoke', expectedRevision: 3, uploadId, status: 'rejected', reason: 'Removed' });
    expect((await request(opponent.id, read))).toMatchObject({ raster: null, equipment: {} });
    const pending = await f.uploads.submit({ ownerId: 'alice', requestId: 'pending', expectedRevision: 4, raster: { width: 1, height: 1, rgba: 'AgICAg==' } });
    expect((await request(opponent.id, { ...read, uploadId: pending.uploads.find(image => image.status === 'pending')!.id })).raster).toEqual({ width: 1, height: 1, rgba: 'AgICAg==' });
    await f.room.leave('socket-0');expect(f.social.allowCommunication({ roomId: 'quick-play', userId: opponent.userId, otherUserId: 'alice' })).toBe(false);
    expect((await request(opponent.id, read)).raster).toBeNull();
  } finally { await f.room.dispose('test-complete');f.ratings.close(); }
});

test('saving blocks equipment until the terminal receipt commits, then result permits changes', async () => {
  const f = await fixture(true);
  try {
    await f.pair();const opponent = f.snapshot().seats[1]!;f.failRelease = true;await f.room.leave(opponent);
    expect(f.snapshot().quickPlay.phase).toBe('saving');
    const equip = { type: 'upload-equip', requestId: 'clear', expectedRevision: 0, slotId: 'badge', uploadId: '' };
    f.room.drainBroadcasts();await f.room.event('socket-0', equip);
    expect(readUploadResponse(f.room.drainBroadcasts().find(value => (isObject(value.event) ? value.event.type : undefined) === 'upload-result')!.event).error).toContain('between fights');
    f.failRelease = false;f.advance(300);await f.room.update(0.016666666666666666);expect(f.snapshot().quickPlay.phase).toBe('result');
    f.room.drainBroadcasts();await f.room.event('socket-0', equip);
    expect(readUploadResponse(f.room.drainBroadcasts().find(value => (isObject(value.event) ? value.event.type : undefined) === 'upload-result')!.event).error).toBe('');
  } finally { f.failRelease = false;await f.room.dispose('test-complete');f.ratings.close(); }
});

async function earnSet(f: Awaited<ReturnType<typeof fixture>>, initial: ReturnType<typeof f.snapshot>, stopAfterHit = false) {
  const observer = createNetworkCombatSpectator({ project: f.project, runtime: f.runtime, match: initial, contentId: 'fixture', onCursor() {} });
  const initialHealth = observer.game.snapshot().combat!.state.fighters[1]!.health;
  let frame = 0;
  while (frame < 5000 && observer.confirmedMatch?.phase !== 'match-result') {
    const a = f.runtime.physics.body('a')!, b = f.runtime.physics.body('b')!, dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    for (const seat of [0, 1]) {
      const input = neutral(initial.matchId, frame);
      if (seat === 0) { if (frame % 30 === 0) input.actions.push('jab');if (length > 1.3) input.direction = { x: dx / length, y: 0, z: dz / length }; }
      await f.room.input(initial.seats[seat]!, input);
    }
    observer.receive(f.snapshot(initial.seats[0]!));expect(observer.tick()).toBe(true);frame++;
    if (stopAfterHit && observer.game.snapshot().combat!.state.fighters[1]!.health < initialHealth) { expect(observer.confirmedMatch?.phase).not.toBe('match-result');return; }
  }
  expect(observer.confirmedMatch).toMatchObject({ phase: 'match-result', playerWins: 3, opponentWins: 0 });
}

test('four measured humans fight in isolated pairs; an actual first-to-three set changes ratings once', async () => {
  const f = await fixture();
  try {
    await f.pair();const first = f.snapshot(), other = f.players.find(player => !first.seats.includes(player.id))!, second = f.snapshot(other.id);
    expect(first.matchId).not.toBe(second.matchId);
    await f.room.input(other.id, neutral(first.matchId, 0));
    await f.room.input(first.seats[0]!, { ...neutral(first.matchId, 0), actions: [42] });
    expect(f.snapshot().confirmedFrame).toBe(-1);expect(f.snapshot(other.id).confirmedFrame).toBe(-1);
    for (const [seat, id] of second.seats.entries()) await f.room.input(id, { ...neutral(second.matchId, 0), seat: 1 - seat, fighterId: 'forged-target' });
    expect(f.snapshot(other.id).frames['0:0']!.seat).toBe(0);expect(f.snapshot(other.id).frames['1:0']!.seat).toBe(1);
    expect(f.snapshot(other.id).confirmedFrame).toBe(0);expect(f.snapshot().frames).toEqual({});
    await earnSet(f, first);
    expect(f.snapshot(first.seats[0]!).quickPlay.outcome).toBe('none');f.advance(3000);await f.room.update(0.016666666666666666);
    const winner = f.snapshot(first.seats[0]!), loser = f.snapshot(first.seats[1]!);
    expect(winner.quickPlay).toMatchObject({ phase: 'result', outcome: 'win', rating: 1012, ratingDelta: 12 });
    expect(loser.quickPlay).toMatchObject({ phase: 'result', outcome: 'loss', rating: 988, ratingDelta: -12 });
    f.advance(250);await f.room.update(0.016666666666666666);expect(f.snapshot(first.seats[0]!).quickPlay.rating).toBe(1012);
    expect(f.snapshot(other.id).confirmedFrame).toBe(0);expect(f.snapshot(other.id).quickPlay.rating).toBe(1000);
    await f.room.leave(second.seats[1]!, 'server-stop');expect(f.snapshot(second.seats[0]!).quickPlay).toMatchObject({ phase: 'result', outcome: 'aborted', rating: 1000, ratingDelta: 0 });
  } finally { await f.room.dispose('test');f.ratings.close(); }
}, 30000);

test('departure after an earned result cannot erase it when finalization storage fails', async () => {
  const f = await fixture();
  try {
    await f.pair();const first = f.snapshot();await earnSet(f, first);
    f.failRelease = true;
    expect(await f.room.leave(first.seats[1]!)).toBe(true);
    expect(f.snapshot(first.seats[0]!).quickPlay.phase).toBe('saving');
    f.failRelease = false;f.advance(3000);await f.room.update(0.016666666666666666);
    expect(f.snapshot(first.seats[0]!).quickPlay).toMatchObject({ phase: 'result', outcome: 'win', rating: 1012 });
    const losingUser = first.quickPlay.users[1]!;expect(f.ratings.get({ userId: losingUser })).toBe(988);
    f.advance(250);await f.room.update(0.016666666666666666);expect(f.ratings.get({ userId: losingUser })).toBe(988);
  } finally { await f.room.dispose('test');f.ratings.close(); }
}, 30000);

test('a terminal departure after physical contact concedes once even if both fighters leave during save retry', async () => {
  const f = await fixture();
  try {
    await f.pair();const first = f.snapshot();await earnSet(f, first, true);expect(f.snapshot().quickPlay.phase).toBe('playing');
    f.failRelease = true;await f.room.leave(first.seats[1]!, 'connection-close');await f.room.leave(first.seats[0]!, 'leave');
    f.failRelease = false;f.advance(250);await f.room.update(0.016666666666666666);
    expect(f.ratings.get({ userId: first.quickPlay.users[0]! })).toBe(1012);expect(f.ratings.get({ userId: first.quickPlay.users[1]! })).toBe(988);
    expect(f.ratings.complete({ matchId: first.matchId, winner: 0 }).after).toEqual([1012, 988]);
    expect(() => f.ratings.complete({ matchId: first.matchId, winner: 1 })).toThrow('Conflicting');
  } finally { await f.room.dispose('test');f.ratings.close(); }
}, 30000);

test('old exports and spoofed search claims reject, and stale acknowledgements cannot measure a replacement connection', async () => {
  const f = await fixture();
  try {
    const newcomer = { ...f.players[0]!, id: 'old-export', userId: 'new-user' };
    for (const quickPlayVersion of [undefined, quickPlayProtocolVersion - 1]) expect(await f.room.join(newcomer, { contentId: 'fixture', quickPlayVersion }))
      .toMatchObject({ ok: false, reason: 'Quick Play requires this host queue and the latest matching game export.' });
    await f.room.event('socket-0', { type: 'quick-search', requestId: 'spoof', rating: 9000, latencyMs: 0, userId: 'bob' });
    expect(f.snapshot().quickPlay.phase).toBe('idle');expect(f.snapshot().quickPlay.error).toContain('Invalid');
    const old = f.players[0]!;
    for (const sequence of [40, 41]) f.room.replicationSent(old.id, { sequence, baseline: 0, kind: 'snapshot', now: 1000 });
    await f.room.leave(old.id);const replacement = { ...old, id: 'replacement' };await f.room.join(replacement, f.request);
    f.advance(20);for (const sequence of [40, 41]) f.room.type.onReplicationAck!(f.room.ctx, old, sequence);
    expect(f.snapshot(replacement.id).quickPlay.connectionReady).toBe(false);
    await f.room.event(replacement.id, { type: 'quick-search', requestId: 'unmeasured' });
    expect(f.snapshot(replacement.id).quickPlay.phase).toBe('idle');expect(f.snapshot(replacement.id).quickPlay.error).toContain('measurement');
    f.measure([replacement]);await f.room.event(replacement.id, { type: 'quick-search', requestId: 'measured' });
    expect(f.snapshot(replacement.id).quickPlay.connectionReady).toBe(true);
    expect(f.snapshot(replacement.id).quickPlay.phase).toBe('searching');expect(f.snapshot(replacement.id).quickPlay.rating).toBe(1000);
  } finally { await f.room.dispose('test');f.ratings.close(); }
});
