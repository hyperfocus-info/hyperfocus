import { expect, test } from 'bun:test';
import { encodeSnapshot, decodeSnapshot, encodeDelta, decodeDelta } from '@hyperfocus/engine/protocol';
import { combatRoomSnapshotSchema } from '@hyperfocus/engine/combat/net';
import { quickPlayProtocolVersion, quickPlayRoomSnapshotSchema, readQuickPlayCommand, readQuickPlaySnapshot, type QuickPlayRoomSnapshot } from './protocol.ts';
import { emptyProfileMetadata } from '../../appearance/profile.ts';

function fixture(): QuickPlayRoomSnapshot {
  return { ...emptyProfileMetadata(), matchId: 'bout', contentId: 'combat-v3:test', seed: 7, status: 'ready', seats: ['p1', 'p2'], confirmedFrame: -1, frames: {},
    quickPlay: { connectionReady: true, uploadsEnabled: false, blockedUserIds: [], phase: 'playing', matchId: 'bout', users: ['u1', 'u2'], ready: [true, true], deadline: 0, rating: 1000, ratingDelta: 0, outcome: 'none', error: '' } };
}

test('Quick Play reader rejects malformed nested combat frames before returning a typed snapshot', () => {
  const value = fixture();
  Reflect.set(value.frames, '0:0', { matchId: 'bout', frame: 0, seat: 0, actions: ['jab'], direction: { x: 'wrong', y: 0, z: 0 } });
  expect(() => readQuickPlaySnapshot(value)).toThrow();
});
test('Quick Play accepts bounded intent without trusting client identity, ratings or outcomes', () => {
  expect(quickPlayProtocolVersion).toBe(10);
  for (const command of [{ type: 'quick-search', requestId: 'r' }, { type: 'quick-cancel', requestId: 'r' }, { type: 'quick-accept', matchId: 'm' }] as const) expect(readQuickPlayCommand(command)).toEqual(command);
  for (const value of [null, {}, { type: 'quick-search', requestId: '' }, { type: 'quick-search', requestId: 'é'.repeat(49) },
    { type: 'quick-search', requestId: 'r', userId: 'other' }, { type: 'quick-search', requestId: 'r', rating: 2000 },
    { type: 'quick-accept', matchId: 'm', outcome: 'win' }, { type: 'quick-probe', probeId: 'n', latencyMs: 1 }, { type: 'quick-probe', probeId: ' ' }]) expect(() => readQuickPlayCommand(value)).toThrow();
});
test('Quick Play snapshots detach state and validate phases, pairing and finite bounded fields', () => {
  const source = fixture(), copy = readQuickPlaySnapshot(source);copy.quickPlay.users.reverse();expect(source.quickPlay.users).toEqual(['u1', 'u2']);
  const invalid = (change: (value: QuickPlayRoomSnapshot) => void) => { const value = fixture();change(value);expect(() => readQuickPlaySnapshot(value)).toThrow(); };
  invalid(value => { value.quickPlay.rating = NaN; });invalid(value => { value.quickPlay.deadline = Infinity; });
  invalid(value => { value.quickPlay.users = ['same', 'same']; });invalid(value => { value.quickPlay.users.push('third'); });
  invalid(value => { value.quickPlay.ready = [true]; });invalid(value => { value.quickPlay.ready[1] = false; });
  invalid(value => { value.quickPlay.error = 'x'.repeat(513); });
  invalid(value => { value.quickPlay.outcome = 'win'; });invalid(value => { value.quickPlay.ratingDelta = 12; });
  invalid(value => { value.matchId = 'another'; });invalid(value => { value.contentId = ''; });
  invalid(value => { value.quickPlay.phase = 'result'; });
  for (const phase of ['idle', 'searching'] as const) { const value = fixture();Object.assign(value.quickPlay, { phase, matchId: '', users: [], ready: [] });expect(readQuickPlaySnapshot(value)).toEqual(value); }
  const result = fixture();Object.assign(result.quickPlay, { phase: 'result', outcome: 'win', ratingDelta: 12, rating: 1012 });expect(readQuickPlaySnapshot(result)).toEqual(result);
});
test('Quick Play metadata round-trips through existing binary schema and adds no steady input payload', () => {
  const before = fixture();expect(readQuickPlaySnapshot(decodeSnapshot(quickPlayRoomSnapshotSchema, encodeSnapshot(quickPlayRoomSnapshotSchema, before)))).toEqual(before);
  const after = structuredClone(before);after.confirmedFrame = 0;
  for (const seat of [0, 1]) after.frames[`${seat}:0`] = { matchId: 'bout', frame: 0, seat, actions: [], direction: { x: 0, y: 0, z: 0 } };
  const delta = encodeDelta(quickPlayRoomSnapshotSchema, before, after), plain = encodeDelta(combatRoomSnapshotSchema, before, after);
  expect(decodeDelta(quickPlayRoomSnapshotSchema, before, delta)).toEqual(after);expect(delta.byteLength - plain.byteLength).toBeLessThanOrEqual(1);
  console.info('Unchanged Quick Play metadata overhead', delta.byteLength - plain.byteLength);
});



test('Quick Play requires explicit picture support and bounded detached block preferences', () => {
  const value = fixture();value.quickPlay.uploadsEnabled = true;value.quickPlay.blockedUserIds = ['blocked'];
  const read = readQuickPlaySnapshot(value);value.quickPlay.blockedUserIds.push('later');expect(read.quickPlay.blockedUserIds).toEqual(['blocked']);
  for (const blockedUserIds of [Array(65).fill('x'), ['x','x'], [''], ['x'.repeat(129)]]) expect(() => readQuickPlaySnapshot({...fixture(),quickPlay:{...fixture().quickPlay,blockedUserIds}})).toThrow();
  expect(() => readQuickPlaySnapshot({...fixture(),quickPlay:{...fixture().quickPlay,connectionReady: true, uploadsEnabled:undefined}})).toThrow();
});
