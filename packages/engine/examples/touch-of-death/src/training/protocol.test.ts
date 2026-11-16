import { expect, test } from 'bun:test';
import { encodeSnapshot, decodeSnapshot, encodeDelta } from '@hyperfocus/engine/protocol';
import { combatRoomSnapshotSchema } from '@hyperfocus/engine/combat/net';
import { emptyProfileMetadata } from '../appearance/profile.ts';
import { readTrainingCommand, readTrainingSnapshot, trainingRoomSnapshotSchema, type TrainingRoomSnapshot } from './protocol.ts';

const snapshot = (): TrainingRoomSnapshot => ({ ...emptyProfileMetadata(), matchId: 'attempt', contentId: 'content', seed: 7, seats: ['a', 'b'], status: 'ready', confirmedFrame: -1, frames: {},
  training: { version: 5, mode: 'training', revision: 1, phase: 'playing', users: ['u1', 'u2'], proposalId: '', action: 'none', requestedBy: '', deadline: 0, error: '' } });

test('training reader rejects malformed nested combat frames before returning a typed snapshot', () => {
  const value = snapshot();
  Reflect.set(value.frames, '0:0', { matchId: 'attempt', frame: 0, seat: 0, actions: ['jab'], direction: { x: 'wrong', y: 0, z: 0 } });
  expect(() => readTrainingSnapshot(value)).toThrow();
});
test('training accepts only bounded mutual-consent intent and coherent mode metadata', () => {
  const command = { type: 'training-propose', matchId: 'attempt', requestId: 'one', action: 'swap' } as const;
  expect(readTrainingCommand(command)).toEqual(command);
  for (const invalid of [{ ...command, userId: 'victim' }, { ...command, health: 100 }, { ...command, action: 'win' }, { ...command, matchId: '' }, { ...command, requestId: 'x'.repeat(129) }]) expect(() => readTrainingCommand(invalid)).toThrow();
  expect(readTrainingCommand({ type: 'training-respond', matchId: 'attempt', proposalId: 'one', accept: false }).type).toBe('training-respond');
  expect(readTrainingSnapshot(snapshot())).toEqual(snapshot());
  const recovering = { ...snapshot(), status: 'recovering' };
  expect(readTrainingSnapshot(recovering)).toEqual(recovering);
  expect(() => readTrainingSnapshot({ ...recovering, seats: ['a'] })).toThrow('lifecycle');
  expect(() => readTrainingSnapshot({ ...recovering, training: { ...recovering.training, phase: 'waiting' } })).toThrow('lifecycle');
  for (const training of [{ ...snapshot().training, mode: 'set' }, { ...snapshot().training, users: ['u1', 'u1'] }, { ...snapshot().training, revision: -1 }, { ...snapshot().training, proposalId: 'p' }, { ...snapshot().training, action: 'reset' }]) expect(() => readTrainingSnapshot({ ...snapshot(), training })).toThrow();
});
test('training binary metadata roundtrips without adding steady frame payload', () => {
  const before = readTrainingSnapshot(snapshot()), after = { ...before, confirmedFrame: 0 };
  expect(decodeSnapshot(trainingRoomSnapshotSchema, encodeSnapshot(trainingRoomSnapshotSchema, before))).toEqual(before);
  expect(encodeDelta(trainingRoomSnapshotSchema, before, after).byteLength).toBe(encodeDelta(combatRoomSnapshotSchema, before, after).byteLength);
});
