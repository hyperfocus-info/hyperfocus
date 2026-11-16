import { expect, test } from 'bun:test';
import { readVoiceReportResult } from '../../src/network/voice/protocol.ts';
import { defineSchema } from '@hyperfocus/engine/protocol';
import { createAuthoritativeRoom } from '@hyperfocus/engine/server';
import type { RoomType } from '@hyperfocus/engine/server';
import { createDurableMmoServices, createMemoryDurableServiceStore } from '@hyperfocus/engine/server';
import { createRoomSocialService } from '../community/social.ts';
import { readVoiceSnapshot, voiceSnapshotDefinition, type VoiceIceServer, type VoiceSnapshot } from '../../src/network/voice/protocol.ts';
import { withRoomVoice } from './room.ts';
import { createVoiceReportService } from './report-service.ts';

async function fixture(count = 3, iceServers: VoiceIceServer[] = [], reports?: ReturnType<typeof createVoiceReportService>) {
  let time = 1000;const records = new Map<string, unknown>();
  const social = createRoomSocialService({ services: createDurableMmoServices(createMemoryDurableServiceStore()), persistence: {
    async loadPlayer(id) { return records.get(id) ?? null; }, async savePlayer(id, value) { records.set(id, structuredClone(value)); },
  } });
  const type: RoomType<{ round: number }, unknown, unknown, { round: number }> = { name: 'voice-test', schema: defineSchema({ round: 'u32' }), maxPlayers: 32,
    createState: () => ({ round: 0 }), async onJoin(ctx, player) { await social.join({ roomId: ctx.roomId, userId: player.userId }); },
    async onEvent(ctx, player, command) { await social.handle({ roomId: ctx.roomId, userId: player.userId, command }); }, getSnapshot(ctx) { return { round: ctx.state.round }; } };
  const schema = defineSchema<{ round: number; voice: VoiceSnapshot }>({ round: 'u32', voice: voiceSnapshotDefinition });
  const room = createAuthoritativeRoom({ id: 'friends', type: withRoomVoice({ room: type, schema, social, now: () => time, iceServers, reports }), now: () => time, metrics: { record() {} } });
  const join = async (id: string, userId = id) => room.join({ id, userId, sessionId: `auth-${id}`, roomId: 'friends', joinedAt: time, lastInputAt: time });
  for (let n = 0; n < count; n++) await join(`p${n}`);
  const view = (id = 'p0') => readVoiceSnapshot(room.snapshotFor(id)!.voice);
  const opt = (id: string, requestId = `join-${id}`) => room.event(id, { type: 'voice-join', requestId });
  const signal = (from = 'p0', to = 'p1', kind = 'offer', data = 'v=0\r\n') => ({ type: 'voice-signal', sessionId: view(from).sessionId, targetPlayerId: to, targetSessionId: view(to).sessionId, kind, data });
  return { room, view, opt, signal, join, social, advance(ms: number) { time += ms; } };
}
test('voice is opt-in, privately targets authenticated sessions and revokes bilateral blocked peers', async () => {
  const f = await fixture();expect(f.view().peers).toEqual([]);
  await f.opt('p0');await f.opt('p1');expect(f.view('p2').peers).toEqual([]);
  const command = f.signal();await f.room.event('p0', command);
  const messages = f.room.drainBroadcasts();expect(messages).toHaveLength(1);expect(messages[0]?.recipients).toEqual(['p1']);
  expect(messages[0]?.event).toMatchObject({ fromPlayerId: 'p0', fromUserId: 'p0', sessionId: f.view().sessionId });
  await f.room.event('p0', { ...command, fromUserId: 'spoof' });expect(f.room.drainBroadcasts()).toEqual([]);
  const revision = f.view().revision;
  await f.room.event('p0', { type: 'social-block', requestId: 'block', targetId: 'p1', enabled: true });
  expect(f.social.allowCommunication({ roomId: 'friends', userId: 'p1', otherUserId: 'p0' })).toBe(false);
  expect(f.view().peers.map(peer => peer.playerId)).toEqual(['p0']);expect(f.view('p1').peers.map(peer => peer.playerId)).toEqual(['p1']);expect(f.view().revision).toBeGreaterThan(revision);
  await f.room.event('p1', f.signal('p1', 'p0'));expect(f.room.drainBroadcasts()).toEqual([]);
  await f.room.event('p0', { type: 'social-block', requestId: 'unblock', targetId: 'p1', enabled: false });
  await f.room.event('p0', { type: 'social-mute', requestId: 'mute', targetId: 'p1', enabled: true });
  expect(f.view().peers).toHaveLength(2);expect(f.social.allowCommunication({ roomId: 'friends', userId: 'p0', otherUserId: 'p1' })).toBe(true);
  expect(f.social.allowCommunication({ roomId: 'friends', userId: 'p0', otherUserId: 'unknown' })).toBe(false);
});

test('voice reports authenticate observed sessions, survive blocking and return private durable receipts', async () => {
  const records = new Map<string, unknown>();let fail = false;
  const reports = createVoiceReportService({ now: () => 1000, persistence: { async loadPlayer(id) { return records.get(id) ?? null; }, async savePlayer(id, value) { if (fail) throw Error('private disk detail');records.set(id, structuredClone(value)); } } });
  const f = await fixture(3, [], reports);await f.opt('p0');await f.opt('p1');await f.opt('p2');
  expect(f.view().reportingEnabled).toBe(true);
  const micReceipt = f.view().requestId;
  const command = { type: 'voice-report', requestId: 'incident', sessionId: f.view().sessionId, targetPlayerId: 'p1', targetSessionId: f.view('p1').sessionId, reason: 'harassment' };
  await f.room.event('p0', { type: 'social-block', requestId: 'block', targetId: 'p1', enabled: true });
  expect(f.view().peers.some(peer => peer.playerId === 'p1')).toBe(false);
  fail = true;await f.room.event('p0', command);
  expect(f.room.drainBroadcasts()[0]).toMatchObject({ recipients: ['p0'], event: { type: 'voice-report-result', requestId: 'incident', error: 'Could not save this report. Retry the same report.' } });
  expect(await reports.read({ reporterId: 'p0' })).toEqual([]);fail = false;
  await f.room.event('p0', command);
  expect(f.room.drainBroadcasts()[0]).toMatchObject({ recipients: ['p0'], event: { requestId: 'incident', error: '' } });
  expect(await reports.read({ reporterId: 'p0' })).toEqual([{ reporterId: 'p0', targetId: 'p1', roomId: 'friends', reporterSessionId: command.sessionId, targetSessionId: command.targetSessionId, requestId: 'incident', reason: 'harassment', createdAt: 1000 }]);
  expect(f.view().requestId).toBe(micReceipt);
  await f.room.leave('p1', 'leave');await f.room.event('p0', command);
  expect(f.room.drainBroadcasts()[0]).toMatchObject({ recipients: ['p0'], event: { error: '' } });
  for (const invalid of [{ ...command, requestId: 'stale' }, { ...command, requestId: 'self', targetPlayerId: 'p0', targetSessionId: command.sessionId }, { ...command, requestId: 'forged', reporterId: 'p2' }]) {
    await f.room.event('p0', invalid);expect(readVoiceReportResult(f.room.drainBroadcasts()[0]?.event).error).not.toBe('');
  }
  expect(await reports.read({ reporterId: 'p0' })).toHaveLength(1);
  await f.room.event('p0', { type: 'voice-leave', sessionId: command.sessionId });expect(f.view().sessionId).toBe('');
});

test('unobserved blocked peers cannot be reported and unconfigured hosts advertise no reporting', async () => {
  const records = new Map<string, unknown>();
  const reports = createVoiceReportService({ persistence: { async loadPlayer(id) { return records.get(id) ?? null; }, async savePlayer(id, value) { records.set(id, value); } } });
  const f = await fixture(2, [], reports);
  await f.room.event('p0', { type: 'social-block', requestId: 'block', targetId: 'p1', enabled: true });
  await f.opt('p0');await f.opt('p1');
  await f.room.event('p0', { type: 'voice-report', requestId: 'unknown', sessionId: f.view().sessionId, targetPlayerId: 'p1', targetSessionId: f.view('p1').sessionId, reason: 'other' });
  expect(readVoiceReportResult(f.room.drainBroadcasts()[0]?.event).error).toContain('no longer available');
  expect(await reports.read({ reporterId: 'p0' })).toEqual([]);
  const unsupported = await fixture();expect(unsupported.view().reportingEnabled).toBe(false);
});
test('session fences reject departed targets, stale rejoin requests and superseded mic grants', async () => {
  const f = await fixture();await f.opt('p0');await f.opt('p1');const old = f.signal(), self = f.view().sessionId;
  await f.room.event('p0', { type: 'voice-mic', sessionId: self, requestId: 'enable', enabled: true });expect(f.view()).toMatchObject({ requestId: 'enable', mic: true, error: '' });
  await f.room.event('p0', { type: 'voice-mic', sessionId: self, requestId: 'disable', enabled: false });
  await f.room.event('p0', { type: 'voice-mic', sessionId: self, requestId: 'enable', enabled: true });expect(f.view()).toMatchObject({ requestId: 'enable', mic: false });expect(f.view().error).toContain('superseded');
  await f.room.event('p1', { type: 'voice-leave', sessionId: f.view('p1').sessionId });await f.opt('p1');
  expect(f.view('p1').sessionId).toBe('');expect(f.view('p1').error).toContain('ended');
  await f.opt('p1', 'new-join');expect(f.view('p1').sessionId).not.toBe(old.targetSessionId);
  await f.room.event('p0', old);expect(f.room.drainBroadcasts()).toEqual([]);
  await f.room.leave('p1', 'disconnect');await f.join('replacement', 'p1');await f.opt('replacement');
  expect(f.view().peers.map(peer => peer.playerId)).toEqual(['p0', 'replacement']);
  await f.room.event('p0', old);expect(f.room.drainBroadcasts()).toEqual([]);
});
test('eight-person capacity, negotiation budgets and joined-only ICE configuration remain bounded', async () => {
  const ice = [{ urls: ['turns:relay.example:5349?transport=tcp'], username: 'user', credential: 'secret' }];
  const f = await fixture(9, ice);expect(f.view().iceServers).toEqual([]);
  for (let n = 0; n < 9; n++) await f.opt(`p${n}`);
  expect(f.view().peers).toHaveLength(8);expect(f.view('p8').sessionId).toBe('');expect(f.view('p8').error).toContain('full');expect(f.view().iceServers).toEqual(ice);
  for (let n = 0; n < 9; n++) await f.room.event('p0', f.signal());expect(f.room.drainBroadcasts()).toHaveLength(8);expect(f.view().error).toContain('busy');
  f.advance(10000);for (let n = 0; n < 121; n++) await f.room.event('p0', f.signal('p0', 'p1', 'ice', '{}'));
  expect(f.room.drainBroadcasts()).toHaveLength(120);expect(f.view().error).toContain('busy');
  await f.room.event('p0', { type: 'voice-leave', sessionId: f.view().sessionId });expect(f.view().sessionId).toBe('');expect(f.view().iceServers).toEqual([]);
});
