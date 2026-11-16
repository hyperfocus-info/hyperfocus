import { expect, test } from 'bun:test';
import { readCombatRoomInput } from './input.ts';
import { readCombatRoomInput as publicInput, combatRoomInputCodec, combatRoomInputSchema } from './protocol.ts';

const input = { matchId: 'match', frame: 0, actions: ['jab', 'guard'], direction: { x: .6, y: 0, z: .8 } };

test('public combat protocol uses the canonical operational reader and unchanged wire schema', () => {
  expect(publicInput).toBe(readCombatRoomInput);
  expect(combatRoomInputSchema.definition).toEqual({ matchId: 'string:96', frame: 'u32',
    actions: { type: 'array', item: 'string:32', maxLength: 24 }, direction: { x: 'f64', y: 'f64', z: 'f64' } });
  expect(combatRoomInputCodec.decode(combatRoomInputCodec.encode(input))).toEqual(readCombatRoomInput(input));
});

test('operational input preserves ordering, normalization, UTF8 bounds and detached containers', () => {
  const source = { ...input, actions: ['z', 'a'], direction: { x: -0, y: -0, z: -0 }, extension: true };
  const result = readCombatRoomInput(source);
  expect(result).toEqual({ matchId: 'match', frame: 0, actions: ['a', 'z'], direction: { x: 0, y: 0, z: 0 } });
  expect(Object.keys(result)).toEqual(['matchId', 'frame', 'actions', 'direction']);
  expect(Object.keys(result.direction)).toEqual(['x', 'y', 'z']);
  expect(Object.is(result.direction.x, 0)).toBe(true);
  expect(Object.is(result.direction.y, 0)).toBe(true);
  expect(Object.is(result.direction.z, 0)).toBe(true);
  expect(source.actions).toEqual(['z', 'a']);
  expect(result.actions).not.toBe(source.actions);expect(result.direction).not.toBe(source.direction);
  result.actions.push('changed');result.direction.x = 1;
  expect(source.actions).toEqual(['z', 'a']);expect(Object.is(source.direction.x, -0)).toBe(true);
  expect(readCombatRoomInput({ ...input, matchId: 'é'.repeat(48), actions: ['é'.repeat(16)], frame: 0x7ffffffe }).frame).toBe(0x7ffffffe);
  expect(() => readCombatRoomInput({ ...input, matchId: 'é'.repeat(49) })).toThrow('Invalid combat input match.');
  expect(() => readCombatRoomInput({ ...input, actions: ['é'.repeat(17)] })).toThrow('Invalid combat input actions.');
  expect(readCombatRoomInput({ ...input, frame: -0 }).frame).toBe(-0);
  // The operational reader's existing Array.map/sort behavior is preserved.
  const sparse = readCombatRoomInput({ ...input, actions: Array(1) }).actions;
  expect(sparse.length).toBe(1);expect(Object.hasOwn(sparse, 0)).toBe(false);
});

test('operational admission keeps exact failure priority before reading later fields', () => {
  const cases: Array<{ value: unknown; message: string }> = [
    { value: null, message: 'Invalid combat input match.' },
    { value: { ...input, matchId: '', frame: -1, actions: null, direction: null }, message: 'Invalid combat input match.' },
    { value: { ...input, frame: -1, actions: null, direction: null }, message: 'Invalid combat input frame.' },
    { value: { ...input, actions: ['jab', 'jab'], direction: null }, message: 'Invalid combat input actions.' },
    { value: { ...input, direction: { x: 1, y: 0, z: 1 } }, message: 'Invalid combat input planar direction.' },
  ];
  for (const { value, message } of cases) {
    let thrown: unknown;
    try { readCombatRoomInput(value); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(Error);
    if (!(thrown instanceof Error)) throw new Error('Missing operational admission error.');
    expect(thrown.name).toBe('Error');expect(thrown.message).toBe(message);
  }
  let reads = 0;
  const invalid = { ...input, frame: -1, get actions() { reads++;throw new Error('later actions'); } };
  expect(() => readCombatRoomInput(invalid)).toThrow('Invalid combat input frame.');expect(reads).toBe(0);
  const duplicate = { ...input, actions: ['jab', 'jab'], get direction() { reads++;throw new Error('later direction'); } };
  expect(() => readCombatRoomInput(duplicate)).toThrow('Invalid combat input actions.');expect(reads).toBe(0);
});
