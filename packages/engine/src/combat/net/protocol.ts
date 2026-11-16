import { readCombatRoomInput, type CombatRoomInput } from './input.ts';
import { defineSchema } from '../../protocol/schema.ts';
import { decodeSnapshot, encodeSnapshot } from '../../protocol/encode.ts';
import type { BinaryPayloadCodec } from '../../protocol/messages.ts';
import { requireRecord } from '@hyperfocus/utilities/records';
import { readObject, readDictionary, requireArray, requireNumber, type ObjectReaders } from '@hyperfocus/utilities/validation';
import { requireText } from '@hyperfocus/utilities/text';
export { createCombatRecording, readCombatRecording, type CombatRecording } from './replay.ts';
export { readCombatRoomInput, type CombatRoomInput } from './input.ts';

export type CombatRoomFrame = CombatRoomInput & { seat: number };
export type CombatRoomSnapshot = {
  matchId: string; contentId: string; seed: number; status: string;
  seats: string[]; confirmedFrame: number; frames: Record<string, CombatRoomFrame>;
};
const fields = { matchId: 'string:96', frame: 'u32', actions: { type: 'array', item: 'string:32', maxLength: 24 },
  direction: { x: 'f64', y: 'f64', z: 'f64' } } as const;
export const combatRoomInputSchema = defineSchema<CombatRoomInput>(fields);
export const combatRoomSnapshotDefinition = {
  matchId: 'string:96', contentId: 'string:128', seed: 'u32', status: 'string:16',
  seats: { type: 'array', item: 'string:128', maxLength: 2 }, confirmedFrame: 'i32',
  frames: { type: 'map', key: 'string', value: { ...fields, seat: 'u8' }, maxEntries: 512 },
} as const;
export const combatRoomSnapshotSchema = defineSchema<CombatRoomSnapshot>(combatRoomSnapshotDefinition);
export const combatRoomInputCodec: BinaryPayloadCodec<CombatRoomInput> = {
  encode: input => encodeSnapshot(combatRoomInputSchema, readCombatRoomInput(input)),
  decode: bytes => readCombatRoomInput(decodeSnapshot(combatRoomInputSchema, bytes)),
};

const wireText = (value: unknown, max: number) => requireText(value, { max, unit: 'utf8' });
const u32 = (value: unknown) => requireNumber(value, { minimum: 0, maximum: 0xffffffff, integer: true });
const directionFields = { x: requireNumber, y: requireNumber, z: requireNumber };
const action = (value: unknown) => wireText(value, 32);
const seat = (value: unknown) => wireText(value, 128);
const frameFields: ObjectReaders<CombatRoomFrame> = {
  matchId: value => wireText(value, 96), frame: u32,
  actions: value => requireArray(value, { maximum: 24, label: 'combat frame actions' }).map(action),
  direction: value => readObject(value, directionFields),
  seat: value => requireNumber(value, { minimum: 0, maximum: 255, integer: true }),
};
function readFrame(value: unknown) { return readObject(value, frameFields); }
const snapshotFields: ObjectReaders<CombatRoomSnapshot> = {
  matchId: value => wireText(value, 96), contentId: value => wireText(value, 128), seed: u32, status: value => wireText(value, 16),
  seats: value => requireArray(value, { maximum: 2, label: 'combat seats' }).map(seat),
  confirmedFrame: value => requireNumber(value, { minimum: -0x80000000, maximum: 0x7fffffff, integer: true }),
  frames: value => { const input = requireRecord(value);if (Object.keys(input).length > 512) throw new Error('Combat history bound exceeded.');return readDictionary(input, readFrame); },
};

/** Structural wire boundary only: no action sorting, planar norm, seat assignment or match policy. */
export function readCombatRoomFrame(value: unknown): CombatRoomFrame { return structuredClone(readFrame(value)); }

/** Detached low-rate snapshot reader. Operational combat sessions own relationship validation. */
export function readCombatRoomSnapshot(value: unknown): CombatRoomSnapshot {
  return structuredClone(readObject(value, snapshotFields));
}
