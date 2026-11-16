import { expect, test } from 'bun:test';
import { requireRecord } from '@hyperfocus/utilities/records';
import { createAuthoritativeRoom } from '@hyperfocus/engine/server';
import type { AuthoritativePlayer } from '@hyperfocus/engine/server';
import { combatMotionFixture } from '../../test/combat-fixture.ts';
import { createNetworkCombatSpectator } from '@hyperfocus/engine/project/runtime-3d';
import { readCommunitySnapshot } from '../../src/network/community-protocol.ts';
import { createCommunityRoom } from './room.ts';
import { communityProtocolVersion } from '../../src/network/community-protocol.ts';
import { createRoomSocialService } from './social.ts';
import { createDurableMmoServices, createMemoryDurableServiceStore } from '@hyperfocus/engine/server';

async function fixture(withSocial = false) {
  const f = await combatMotionFixture({ match: true });f.game.reset();
  let time = 1000, failSave = false;
  const records = new Map<string, unknown>();
  const persistence = { async loadRoom(id: string) { return structuredClone(records.get(id) ?? null); },
    async saveRoom(id: string, value: unknown) { if (failSave) throw new Error('disk unavailable');records.set(id, structuredClone(value)); } };
  const social = withSocial ? createRoomSocialService({ now: () => time,
    services: createDurableMmoServices(createMemoryDurableServiceStore(), { now: () => time, maxChatMessagesPerChannel: 32, maxChatMessageLength: 280 }),
    persistence: { loadPlayer: persistence.loadRoom, savePlayer: persistence.saveRoom },
  }) : undefined;
  const create = () => createAuthoritativeRoom({ id: 'friends', now: () => time, metrics: { record() {} },
    type: createCommunityRoom({ project: f.project, assets: f.assets, contentId: 'fixture', seed: 19, persistence, now: () => time, social }) });
  const room = create();
  const players = ['alice', 'bob', 'cara'].map((userId, index): AuthoritativePlayer => ({ id: `socket-${index}`, userId, sessionId: `auth-${index}`, roomId: 'friends', joinedAt: time, lastInputAt: time }));
  for (const player of players) expect(await room.join(player, { contentId: 'fixture', wantsQueue: true, communityVersion: communityProtocolVersion })).toEqual({ ok: true });
  const snapshot = () => readCommunitySnapshot(room.snapshotFor(players[0]!.id));
  async function ready() { const battleId = snapshot().community.battleId;for (const player of players.slice(0, 2)) await room.event(player.id, { type: 'community-ready', battleId }); }
  return { ...f, room, players, snapshot, ready, create, records, social, get failSave() { return failSave; }, set failSave(value: boolean) { failSave = value; }, advance(ms: number) { time += ms; } };
}

test('sustained bilateral quality failures interrupt with no winner or streak change', async () => {
  const f = await fixture();
  try {
    await f.ready();const id = f.snapshot().matchId;
    for (let step = 0; step < 55; step++) { f.advance(250);await f.room.update(0.016666666666666666);f.room.drainBroadcasts(); }
    expect(f.snapshot().community).toMatchObject({ lastBattleId: '', lastWinner: 255, streakWins: 0 });
    expect(f.snapshot().community.battleId).not.toBe(id);expect(f.snapshot().community.error).toContain('No contest');
    const saved = requireRecord(f.records.get('tod-community:friends'));
    expect(saved.results).toEqual([]);
  } finally { await f.room.dispose('test'); }
});

async function earnSet(f: Awaited<ReturnType<typeof fixture>>, stopAfterHit = false) {
  const first = f.snapshot();
  const spectator = createNetworkCombatSpectator({ project: f.project, runtime: f.runtime, match: first, contentId: 'fixture', onCursor() {} });
  const initialHealth = spectator.game.snapshot().combat!.state.fighters[1]!.health;
  let frame = 0;
  for (; frame < 5000 && spectator.confirmedMatch?.phase !== 'match-result'; frame++) {
    const a = f.runtime.physics.body('a')!, b = f.runtime.physics.body('b')!, dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    for (const seat of [0, 1]) await f.room.input(f.players[seat]!.id, { matchId: first.matchId, frame,
      actions: seat === 0 && frame % 30 === 0 ? ['jab'] : [], direction: seat === 0 && length > 1.3 ? { x: dx / length, y: 0, z: dz / length } : { x: 0, y: 0, z: 0 } });
    spectator.receive(f.snapshot());expect(spectator.tick()).toBe(true);
    if (stopAfterHit && spectator.game.snapshot().combat!.state.fighters[1]!.health < initialHealth) { expect(spectator.confirmedMatch?.phase).not.toBe('match-result');return frame + 1; }
  }
  expect(spectator.confirmedMatch).toMatchObject({ phase: 'match-result', playerWins: 3, opponentWins: 0 });
  return frame;
}

test('one room rotates three connected users only after an earned judged set and durable retry', async () => {
  const f = await fixture();await f.ready();
  const first = f.snapshot();expect(first.seats).toEqual(['socket-0', 'socket-1']);
  await f.room.input('socket-0', { matchId: first.matchId, frame: 0, actions: ['match:rematch'], direction: { x: 0, y: 0, z: 0 } });
  expect(f.room.drainBroadcasts().some(item => JSON.stringify(item).includes('invalid-actions'))).toBe(true);
  expect(f.snapshot().confirmedFrame).toBe(-1);
  const frame = await earnSet(f);
  expect(f.snapshot().community.lastBattleId).toBe('');
  const confirmed = f.snapshot().confirmedFrame;
  await f.room.input(f.players[0]!.id, { matchId: first.matchId, frame, actions: ['match:rematch'], direction: { x: 0, y: 0, z: 0 } });
  expect(f.snapshot().confirmedFrame).toBe(confirmed);
  f.advance(2999);await f.room.update(0.016666666666666666);expect(f.snapshot().community.battleId).toBe(first.matchId);
  f.failSave = true;f.advance(1);await f.room.update(0.016666666666666666);
  expect(f.snapshot().community.error).toContain('retry');expect(f.snapshot().community.battleId).toBe(first.matchId);
  f.failSave = false;await f.room.update(0.016666666666666666);
  const next = f.snapshot();expect(next.community.fighters).toEqual(['alice', 'cara']);expect(next.community.queue).toEqual(['bob']);
  expect(next.community.lastWinner).toBe(0);expect(next.community.lastBattleId).toBe(first.matchId);
  expect(next.community.members.map(member => member.playerId)).toEqual(f.players.map(player => player.id));
  for (const player of [f.players[0]!, f.players[2]!]) await f.room.event(player.id, { type: 'community-ready', battleId: next.community.battleId });
  expect(f.snapshot().seats).toEqual(['socket-0', 'socket-2']);expect(f.snapshot().confirmedFrame).toBe(-1);
  await f.room.input('socket-0', { matchId: first.matchId, frame: 0, actions: [], direction: { x: 0, y: 0, z: 0 } });
  expect(f.room.drainBroadcasts().some(item => JSON.stringify(item).includes('wrong-match'))).toBe(true);
  await f.room.event('socket-1', { type: 'combat-spectator-cursor', matchId: first.matchId, frame: 0 });
  expect(f.snapshot().confirmedFrame).toBe(-1);expect(f.snapshot().community.error).toBe('');
  for (const id of ['socket-0', 'socket-2']) await f.room.input(id, { matchId: next.community.battleId, frame: 0, actions: [], direction: { x: 0, y: 0, z: 0 } });
  expect(f.snapshot().confirmedFrame).toBe(0);
  const currentView = f.room.snapshotFor('socket-1');
  await f.room.event('socket-1', { type: 'combat-spectator-cursor', matchId: first.matchId, frame: 100000 });
  expect(f.room.snapshotFor('socket-1')).toEqual(currentView);
  await f.room.event('socket-1', { type: 'combat-spectator-cursor', matchId: first.matchId, frame: -1 });
  expect(f.snapshot().community.error).toBe('That room action is invalid.');
  expect(f.room.snapshotFor('socket-1').frames).toEqual(currentView.frames);
}, 30000);

test('quitting during result display cannot erase an earned loss even when its save must retry', async () => {
  const f = await fixture();await f.ready();const first = f.snapshot().matchId;
  await earnSet(f);f.failSave = true;await f.room.leave('socket-1');
  expect(f.snapshot().status).toBe('ready');expect(f.snapshot().community.error).toContain('retry');
  expect(f.snapshot().community.members.find(member => member.userId === 'bob')?.online).toBe(false);
  expect(f.snapshot().community.members.find(member => member.userId === 'bob')?.playerId).toBe('socket-1');
  expect(f.snapshot().community.lastBattleId).toBe('');
  f.failSave = false;await f.room.update(0.016666666666666666);
  expect(f.snapshot().community.lastBattleId).toBe(first);expect(f.snapshot().community.lastWinner).toBe(0);
  expect(f.snapshot().community.fighters).toEqual(['alice', 'cara']);
  expect(f.snapshot().community.streakWins).toBe(1);
  await f.room.update(0.016666666666666666);expect(f.snapshot().community.streakWins).toBe(1);
}, 30000);

test('terminal loss after physical contact awards the opponent once despite both departures and a failed save', async () => {
  const f = await fixture();await f.ready();const first = f.snapshot().matchId;await earnSet(f, true);
  f.failSave = true;await f.room.leave('socket-1', 'connection-close');await f.room.leave('socket-0', 'leave');
  const snapshot = () => readCommunitySnapshot(f.room.snapshotFor('socket-2'));
  expect(snapshot().community.lastBattleId).toBe('');f.failSave = false;await f.room.update(0.016666666666666666);
  expect(snapshot().community).toMatchObject({ lastBattleId: first, lastWinner: 0, streakUserId: 'alice', streakWins: 1 });
  await f.room.update(0.016666666666666666);expect(snapshot().community.streakWins).toBe(1);await f.room.dispose('test');
}, 30000);

test('disconnects interrupt fighters, preserve spectator bouts and recover durable membership on restart', async () => {
  const f = await fixture();await f.ready();const first = f.snapshot().matchId;
  await f.room.leave('socket-2');expect(f.snapshot().matchId).toBe(first);expect(f.snapshot().status).toBe('ready');
  f.failSave = true;await f.room.leave('socket-1', 'server-stop');expect(f.snapshot().status).toBe('interrupted');
  expect(f.snapshot().community.error).toContain('retry');
  f.failSave = false;await f.room.update(0.016666666666666666);expect(f.snapshot().community.lastBattleId).toBe('');expect(f.snapshot().status).toBe('waiting');
  const replacement = { ...f.players[1]!, id: 'replacement-bob' };await f.room.join(replacement, { contentId: 'fixture', wantsQueue: true, communityVersion: communityProtocolVersion });
  expect(f.snapshot().community.battleId).not.toBe(first);
  await f.room.dispose('host-restart');
  const reopened = f.create();await reopened.join({ ...f.players[0]!, id: 'new-alice' }, { contentId: 'fixture', wantsQueue: true, communityVersion: communityProtocolVersion });
  const recovered = readCommunitySnapshot(reopened.snapshotFor('new-alice'));
  expect(recovered.community.lastBattleId).toBe('');expect(recovered.community.phase).toBe('waiting');
  expect(recovered.community.members.find(member => member.userId === 'bob')?.online).toBe(false);
});

test('durable deadlines use epoch milliseconds independently of fractional server simulation time', async () => {
  const f = await combatMotionFixture({ match: true });
  for (const injected of [false, true]) {
    const epoch = 1_800_000_000_000, before = injected ? epoch : Date.now();
    const room = createAuthoritativeRoom({ id: `clock-${injected}`, now: () => 123.456, metrics: { record() {} },
      type: createCommunityRoom({ project: f.project, assets: f.assets, contentId: 'fixture', seed: 19,
        ...(injected ? { now: () => epoch } : {}), persistence: { async loadRoom() { return null; }, async saveRoom() {} } }) });
    const players = [0, 1].map(index => ({ id: `clock-player-${index}`, userId: `clock-user-${index}`, sessionId: `auth-${index}`,
      roomId: room.id, joinedAt: 123.456, lastInputAt: 123.456 }));
    for (const player of players) expect(await room.join(player, { contentId: 'fixture', wantsQueue: true, communityVersion: communityProtocolVersion })).toEqual({ ok: true });
    const snapshot = readCommunitySnapshot(room.snapshotFor(players[0]!.id));
    expect(Number.isSafeInteger(snapshot.community.deadline)).toBe(true);
    expect(snapshot.community.deadline).toBeGreaterThanOrEqual(before + 15000);
    expect(snapshot.community.deadline).toBeLessThanOrEqual((injected ? epoch : Date.now()) + 15000);
    for (const player of players) await room.event(player.id, { type: 'community-ready', battleId: snapshot.community.battleId });
    expect(room.snapshotFor(players[0]!.id).community.phase).toBe('playing');
    await room.dispose('test-finished');
  }
});

test('failed queue or ready writes request explicit retry without freezing combat or losing the error on ticks', async () => {
  const f = await fixture();const battleId = f.snapshot().community.battleId;
  await f.room.event('socket-0', { type: 'community-ready', battleId });
  f.failSave = true;await f.room.event('socket-1', { type: 'community-ready', battleId });
  expect(f.snapshot().community.phase).toBe('ready');expect(f.snapshot().community.ready).toEqual([true, false]);
  expect(f.snapshot().community.error).toContain('Try again');
  f.failSave = false;await f.room.update(0.016666666666666666);
  expect(f.snapshot().community.phase).toBe('ready');expect(f.snapshot().community.error).toContain('Try again');
  await f.room.event('socket-1', { type: 'community-ready', battleId });
  expect(f.snapshot().community.phase).toBe('playing');expect(f.snapshot().community.error).toBe('');
  f.failSave = true;await f.room.event('socket-2', { type: 'community-queue', enabled: false });
  expect(f.snapshot().community.queue).toEqual(['cara']);expect(f.snapshot().community.error).toContain('Try again');
  for (const id of ['socket-0', 'socket-1']) await f.room.input(id, { matchId: battleId, frame: 0, actions: [], direction: { x: 0, y: 0, z: 0 } });
  expect(f.snapshot().confirmedFrame).toBe(0);
  f.failSave = false;await f.room.update(0.016666666666666666);
  await f.room.event('socket-2', { type: 'combat-spectator-cursor', matchId: battleId, frame: 1 });
  expect(f.snapshot().community.error).toContain('Try again');expect(f.snapshot().community.queue).toEqual(['cara']);
  await f.room.event('socket-2', { type: 'community-queue', enabled: false });
  expect(f.snapshot().community.error).toBe('');expect(f.snapshot().community.queue).toEqual([]);
});

test('missing and old community versions reject clearly before admitting or changing queue membership', async () => {
  const f = await fixture(), before = f.snapshot();
  const newcomer = { ...f.players[0]!, id: 'new-socket', userId: 'new-user' };
  for (const version of [undefined, communityProtocolVersion - 1]) {
    expect(await f.room.join(newcomer, { contentId: 'fixture', wantsQueue: true, ...(version === undefined ? {} : { communityVersion: version }) }))
      .toEqual({ ok: false, reason: 'This room requires the latest game export.' });
    expect(f.snapshot()).toEqual(before);
  }
  expect(await f.room.join(newcomer, { contentId: 'fixture', wantsQueue: false, communityVersion: communityProtocolVersion })).toEqual({ ok: true });
  expect(f.snapshot().community.members).toHaveLength(4);expect(f.snapshot().social.messages).toEqual([]);
});

test('room social hooks use authenticated users and recipient filters without changing combat or queue state', async () => {
  const f = await fixture(true);await f.ready();
  const before = f.snapshot();
  await f.room.event('socket-0', { type: 'social-send', requestId: 'hello', text: 'Hello room' });
  const bob = () => readCommunitySnapshot(f.room.snapshotFor('socket-1'));
  expect(bob().social.messages).toMatchObject([{ senderId: 'alice', text: 'Hello room' }]);
  expect(f.snapshot().social.requestId).toBe('hello');expect(bob().social.requestId).toBe('');
  await f.room.event('socket-1', { type: 'social-mute', requestId: 'quiet', targetId: 'alice', enabled: true });
  expect(bob().social.messages).toEqual([]);expect(f.snapshot().social.messages).toHaveLength(1);
  await f.room.event('socket-0', { type: 'social-send', requestId: 'spoof', text: 'Forged', senderId: 'cara' });
  expect(f.snapshot().community.error).toContain('communication request is invalid');
  expect(f.snapshot().social.messages).toHaveLength(1);
  expect(f.snapshot().community.queue).toEqual(before.community.queue);
  expect(f.snapshot().community.fighters).toEqual(before.community.fighters);
  expect(f.snapshot().community.revision).toBe(before.community.revision);
  expect(f.snapshot().confirmedFrame).toBe(before.confirmedFrame);expect(f.snapshot().frames).toEqual(before.frames);
  for (const id of ['socket-0', 'socket-1']) await f.room.input(id, { matchId: before.matchId, frame: 0, actions: [], direction: { x: 0, y: 0, z: 0 } });
  expect(f.snapshot().confirmedFrame).toBe(0);
});

test('failed admission, failed departure saves and failed shutdown revoke room social membership', async () => {
  const f = await fixture(true), social = f.social!;
  const allowed = (userId: string) => social.allowCommunication({ roomId: 'friends', userId, otherUserId: 'alice' });
  const newcomer = { ...f.players[2]!, id: 'new-socket', userId: 'dana' };
  f.failSave = true;
  await expect(f.room.join(newcomer, { contentId: 'fixture', wantsQueue: false, communityVersion: communityProtocolVersion })).rejects.toThrow();
  expect(allowed('dana')).toBe(false);expect(() => social.view({ roomId: 'friends', userId: 'dana' })).toThrow('Join');
  expect(allowed('bob')).toBe(true);
  await f.room.leave('socket-1');
  expect(f.snapshot().community.error).toContain('retry');expect(allowed('bob')).toBe(false);
  expect(() => social.view({ roomId: 'friends', userId: 'bob' })).toThrow('Join');
  expect(allowed('cara')).toBe(true);
  await expect(f.room.dispose('test-failed-save')).rejects.toThrow();
  expect(allowed('cara')).toBe(false);expect(() => social.view({ roomId: 'friends', userId: 'alice' })).toThrow('Join');
  const shutdown = await fixture(true);shutdown.failSave = true;
  await expect(shutdown.room.dispose('shutdown-write-failed')).rejects.toThrow('disk unavailable');
  expect(shutdown.social!.allowCommunication({ roomId: 'friends', userId: 'alice', otherUserId: 'bob' })).toBe(false);
  expect(() => shutdown.social!.view({ roomId: 'friends', userId: 'bob' })).toThrow('Join');
});
