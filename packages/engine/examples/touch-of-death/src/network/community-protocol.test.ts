import { expect, test } from 'bun:test';
import { decodeDelta, decodeSnapshot, encodeDelta, encodeSnapshot } from '@hyperfocus/engine/protocol';
import { combatRoomSnapshotSchema } from '@hyperfocus/engine/combat/net';
import { communityRoomSnapshotSchema, readCommunityCommand, readCommunitySnapshot, type CommunityRoomSnapshot } from './community-protocol.ts';
import { emptySocialSnapshot } from './social-protocol.ts';
import { emptyProfileMetadata } from '../appearance/profile.ts';
import { emptyVoiceSnapshot } from './voice/protocol.ts';

function fixture(): CommunityRoomSnapshot {
  return { ...emptyProfileMetadata(), matchId: 'battle', contentId: 'combat-v3:fixture', seed: 7, status: 'ready', seats: ['pa', 'pb'], confirmedFrame: 119, frames: {}, community: {
    revision: 1, members: ['a', 'b', 'c'].map(userId => ({ userId, playerId: `p${userId}`, online: true, wantsQueue: true })),
    queue: ['c'], battleId: 'battle', phase: 'playing', fighters: ['a', 'b'], ready: [true, true], deadline: 0,
    streakUserId: '', streakWins: 0, streakCap: 3, lastBattleId: '', lastFighters: [], lastWinner: 255, error: '',
  }, social: emptySocialSnapshot(), voice: emptyVoiceSnapshot() };
}

test('community reader rejects malformed nested combat frames before returning a typed snapshot', () => {
  const value = fixture();
  Reflect.set(value.frames, '0:0', { matchId: 'battle', frame: 0, seat: 0, actions: ['jab'], direction: { x: 'wrong', y: 0, z: 0 } });
  expect(() => readCommunitySnapshot(value)).toThrow();
});
test('community controls accept bounded intent and reject result claims, identities and unknown fields', () => {
  for (const command of [{ type: 'community-queue', enabled: true }, { type: 'community-ready', battleId: 'battle' },
    { type: 'combat-spectator-cursor', matchId: 'battle', frame: 0 }] as const) expect(readCommunityCommand(command)).toEqual(command);
  for (const invalid of [null, {}, { type: 'winner', winner: 'a' }, { type: 'community-queue', enabled: 1 },
    { type: 'community-queue', enabled: true, userId: 'a' }, { type: 'community-ready', battleId: 'é'.repeat(49) },
    { type: 'combat-spectator-cursor', frame: 0 }, { type: 'combat-spectator-cursor', matchId: 'battle', frame: -1 },
    { type: 'combat-spectator-cursor', matchId: 'battle', frame: .5 }, { type: 'combat-spectator-cursor', matchId: 'battle', frame: Infinity },
    { type: 'community-ready', battleId: 'battle', winner: 0 }]) expect(() => readCommunityCommand(invalid)).toThrow();
});

test('community snapshots detach valid state and reject contradictory bounded membership', () => {
  const source = fixture(), copy = readCommunitySnapshot(source);copy.community.queue.length = 0;expect(source.community.queue).toEqual(['c']);
  const mutate = (change: (snapshot: CommunityRoomSnapshot) => void) => { const value = fixture();change(value);expect(() => readCommunitySnapshot(value)).toThrow(); };
  mutate(value => { value.contentId = ''; });mutate(value => { value.community.revision = -1; });
  mutate(value => { value.community.members.push(value.community.members[0]!); });
  mutate(value => { value.community.members[1]!.playerId = 'pa'; });
  mutate(value => { value.community.queue = ['unknown']; });mutate(value => { value.community.queue = ['a']; });
  mutate(value => { value.community.queue = ['c', 'c']; });mutate(value => { value.community.ready = [true]; });
  mutate(value => { value.community.deadline = NaN; });mutate(value => { value.community.lastWinner = 2; });
  for (const cap of [0, -1, 101, 1.5, NaN]) mutate(value => { value.community.streakCap = cap; });
  const absentCap = fixture();Reflect.deleteProperty(absentCap.community, 'streakCap');expect(() => readCommunitySnapshot(absentCap)).toThrow();
  for (const cap of [1, 7, 100]) { const tuned = fixture();tuned.community.streakCap = cap;expect(readCommunitySnapshot(tuned).community.streakCap).toBe(cap); }
  mutate(value => { value.community.lastFighters = ['a']; });mutate(value => { value.community.error = 'x'.repeat(513); });
  mutate(value => { value.community.members = Array.from({ length: 33 }, (_, index) => ({ userId: `u${index}`, playerId: '', online: false, wantsQueue: false })); });
  const waiting = fixture();Object.assign(waiting.community, { battleId: '', phase: 'waiting', fighters: [], ready: [] });
  expect(readCommunitySnapshot(waiting)).toEqual(waiting);
  const history = fixture();Object.assign(history.community, { lastBattleId: 'prior', lastFighters: ['departed-a', 'departed-b'], lastWinner: 1 });
  expect(readCommunitySnapshot(history)).toEqual(history);
});

test('binary community metadata round-trips and unchanged metadata adds only bounded delta overhead', () => {
  const before = fixture();
  for (let frame = 0; frame < 120; frame++) for (const seat of [0, 1]) before.frames[`${seat}:${frame}`] = {
    matchId: 'battle', frame, seat, actions: ['jab'], direction: { x: 1, y: 0, z: 0 },
  };
  const full = encodeSnapshot(communityRoomSnapshotSchema, before);
  expect(readCommunitySnapshot(decodeSnapshot(communityRoomSnapshotSchema, full))).toEqual(before);
  const after = structuredClone(before);after.confirmedFrame = 120;
  for (const seat of [0, 1]) { delete after.frames[`${seat}:0`];after.frames[`${seat}:120`] = { ...after.frames[`${seat}:119`]!, frame: 120 }; }
  const community = encodeDelta(communityRoomSnapshotSchema, before, after), combat = encodeDelta(combatRoomSnapshotSchema, before, after);
  expect(decodeDelta(communityRoomSnapshotSchema, before, community)).toEqual(after);
  expect(community.byteLength - combat.byteLength).toBeLessThanOrEqual(8);expect(community.byteLength).toBeLessThan(250);
  const changed = structuredClone(after);changed.community.revision++;changed.community.queue = [];
  expect(decodeDelta(communityRoomSnapshotSchema, after, encodeDelta(communityRoomSnapshotSchema, after, changed))).toEqual(changed);
  console.info('Community steady input delta bytes', { combat: combat.byteLength, community: community.byteLength, unchangedMetadataOverhead: community.byteLength - combat.byteLength, full: full.byteLength });
});
