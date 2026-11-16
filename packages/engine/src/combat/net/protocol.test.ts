import { expect, test } from 'bun:test';
import { combatRoomInputCodec, combatRoomSnapshotSchema, readCombatRoomInput, type CombatRoomSnapshot } from './protocol.ts';
import { encodeSnapshot } from '../../protocol/encode.ts';
import { encodeDelta, decodeDelta } from '../../protocol/delta.ts';

const input = { matchId: 'match', frame: 0, actions: ['jab', 'guard'], direction: { x: .6, y: 0, z: .8 } };
test('combat wire parser preserves aimed inputs and rejects unsafe or ambiguous samples', () => {
  expect(combatRoomInputCodec.decode(combatRoomInputCodec.encode(input))).toEqual({ ...input, actions: ['guard', 'jab'] });
  for (const invalid of [null, {}, { ...input, frame: -1 }, { ...input, frame: .5 }, { ...input, frame: 0x7fffffff },
    { ...input, actions: ['jab', 'jab'] }, { ...input, actions: ['x'.repeat(33)] },
    { ...input, direction: { x: 0, y: .1, z: 0 } }, { ...input, direction: { x: 1, y: 0, z: 1 } },
    { ...input, direction: { x: NaN, y: 0, z: 0 } }]) expect(() => readCombatRoomInput(invalid)).toThrow();
  const bytes = combatRoomInputCodec.encode(input);
  expect(() => combatRoomInputCodec.decode(bytes.subarray(0, bytes.length - 1))).toThrow();
});

test('two-peer120-frame history sends bounded map deltas instead of retransmitting the ring', () => {
  const before: CombatRoomSnapshot = { matchId: 'match', contentId: 'content', seed: 42, status: 'ready', seats: ['a', 'b'], confirmedFrame: 119, frames: {} };
  for (let frame = 0; frame < 120; frame++) for (const seat of [0, 1]) before.frames[`${seat}:${frame}`] = { ...input, frame, seat };
  const after = structuredClone(before);after.confirmedFrame = 120;
  for (const seat of [0, 1]) { delete after.frames[`${seat}:0`];after.frames[`${seat}:120`] = { ...input, frame: 120, seat }; }
  const delta = encodeDelta(combatRoomSnapshotSchema, before, after), snapshot = encodeSnapshot(combatRoomSnapshotSchema, after);
  expect(decodeDelta(combatRoomSnapshotSchema, before, delta)).toEqual(after);
  expect(delta.byteLength).toBeLessThan(250);expect(snapshot.byteLength).toBeLessThan(16000);
  console.info('Combat relay steady60Hz byte budget', JSON.stringify({ peers: 2, historyFrames: 120, entities: 2,
    snapshotBytes: snapshot.byteLength, deltaBytes: delta.byteLength, deltaBytesPerClientSecond: delta.byteLength * 60 }));
});
