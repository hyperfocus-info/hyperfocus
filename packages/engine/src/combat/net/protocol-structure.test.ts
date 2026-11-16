import { expect, test } from 'bun:test';
import { combatRoomSnapshotDefinition, combatRoomSnapshotSchema, readCombatRoomFrame, readCombatRoomSnapshot, readCombatRoomInput } from './protocol.ts';
import { encodeSnapshot, decodeSnapshot } from '../../protocol/encode.ts';
import { corruptStructuralLeaves } from '../../test-support/structural-corruption.ts';

const frame = { matchId: '', frame: 0xffffffff, actions: ['z', 'a', ''], direction: { x: 2, y: -3, z: 4 }, seat: 255 };
const snapshot = { matchId: '', contentId: '', seed: 0xffffffff, status: '', seats: ['', 'a'], confirmedFrame: -0x80000000, frames: { z: frame } };

test('structural collection bounds reject before reading oversized nested elements', () => {
  let reads = 0;
  const actions = Array(25).fill('');Object.defineProperty(actions, '0', { get() { reads++;return ''; }, enumerable: true });
  expect(() => readCombatRoomFrame({ ...frame, actions })).toThrow();expect(reads).toBe(0);
  const seats = Array(3).fill('');Object.defineProperty(seats, '0', { get() { reads++;return ''; }, enumerable: true });
  expect(() => readCombatRoomSnapshot({ ...snapshot, seats })).toThrow();expect(reads).toBe(0);
  const frames = Object.fromEntries(Array.from({ length: 513 }, (_, index) => [index, frame]));
  Object.defineProperty(frames, '0', { get() { reads++;return frame; }, enumerable: true });
  expect(() => readCombatRoomSnapshot({ ...snapshot, frames })).toThrow();expect(reads).toBe(0);
});

test('structural combat readers preserve the frozen wire definition, bytes, sentinels and action order', () => {
  expect(new Bun.CryptoHasher('sha256').update(JSON.stringify(combatRoomSnapshotDefinition)).digest('hex')).toBe('73bc760762deca564a1c30c07b3c6ac0128c0e5be1773a84efeacae397102304');
  expect(combatRoomSnapshotSchema.definition).toBe(combatRoomSnapshotDefinition);
  const bytes = encodeSnapshot(combatRoomSnapshotSchema, snapshot);
  expect(Buffer.from(bytes).toString('hex')).toBe('00000000ffffffff00000200000001006100000080010001007a0000ffffffff030001007a0100610000000000000000004000000000000008c00000000000001040ff');
  expect(readCombatRoomSnapshot(decodeSnapshot(combatRoomSnapshotSchema, bytes))).toEqual(snapshot);
  expect(readCombatRoomFrame(frame)).toEqual(frame);
  expect(() => readCombatRoomInput(frame)).toThrow();
  const ordered = { ...snapshot, frames: { b: frame, a: frame }, extension: { nested: [1] } };
  const read = readCombatRoomSnapshot(ordered);
  expect(Object.keys(read.frames)).toEqual(['b', 'a']);expect(read.frames.b!.actions).toEqual(['z', 'a', '']);
  expect(read).toEqual(ordered);read.frames.b!.actions.push('changed');ordered.extension.nested.push(2);
  expect(ordered.frames.b.actions).toEqual(['z', 'a', '']);expect(read).toMatchObject({ extension: { nested: [1] } });
});

test('structural combat readers reject nested wrong types, absent fields and exact wire bound violations', () => {
  for (const invalid of corruptStructuralLeaves(snapshot)) expect(() => readCombatRoomSnapshot(invalid.value), invalid.path).toThrow();
  for (const key of Object.keys(frame)) { const invalid = { ...frame };Reflect.deleteProperty(invalid, key);expect(() => readCombatRoomFrame(invalid), key).toThrow(); }
  for (const invalid of [{ ...frame, frame: -1 }, { ...frame, frame: 0x100000000 }, { ...frame, seat: 256 }, { ...frame, actions: Array(25).fill('') },
    { ...frame, actions: ['é'.repeat(17)] }, { ...frame, direction: { x: Infinity, y: 0, z: 0 } }]) expect(() => readCombatRoomFrame(invalid)).toThrow();
  for (const invalid of [{ ...snapshot, seed: -1 }, { ...snapshot, confirmedFrame: -0x80000001 }, { ...snapshot, confirmedFrame: 0x80000000 },
    { ...snapshot, seats: ['', '', ''] }, { ...snapshot, frames: Object.fromEntries(Array.from({ length: 513 }, (_, index) => [index, frame])) }]) expect(() => readCombatRoomSnapshot(invalid)).toThrow();
  expect(readCombatRoomSnapshot({ ...snapshot, confirmedFrame: 0x7fffffff }).confirmedFrame).toBe(0x7fffffff);
});
