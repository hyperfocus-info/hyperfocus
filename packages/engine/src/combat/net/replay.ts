import { readCombatRoomInput } from './input.ts';
import type { CombatRoomFrame } from './protocol.ts';
import { isObject } from '@hyperfocus/utilities/records';
import { requireNumber, requireArray } from '@hyperfocus/utilities/validation';
import { requireText } from '@hyperfocus/utilities/text';

type RecordingBody = {
  matchId: string; contentId: string; seed: number;
  seats: [string, string]; frames: Array<[CombatRoomFrame, CombatRoomFrame]>;
};
export type CombatRecording = RecordingBody & ({ version: 1; mode?: never } | { version: 2; mode: 'set' | 'training' });
type Identity = Pick<CombatRecording, 'matchId' | 'contentId' | 'seed' | 'mode'> & { seats: readonly string[] };
const encoder = new TextEncoder();
const defaultMaxFrames = 36000;

function frameLimit(value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 216000) throw new Error('Combat recording frame limit must be between 1 and 216000.');
  return value;
}

function identity(value: Identity): Omit<RecordingBody, 'frames'> & ({ version: 1; mode?: never } | { version: 2; mode: 'set' | 'training' }) {
  if (value.mode !== undefined && value.mode !== 'set' && value.mode !== 'training') throw new Error('Invalid combat recording mode.');
  const validText = (text: unknown, limit: number): text is string => typeof text === 'string' && text.length > 0 && encoder.encode(text).length <= limit;
  if (!validText(value.matchId, 96) || !validText(value.contentId, 128)
    || !Number.isSafeInteger(value.seed) || value.seed < 0 || value.seed > 0xffffffff
    || !Array.isArray(value.seats) || value.seats.length !== 2 || value.seats.some(seat => !validText(seat, 128)) || value.seats[0] === value.seats[1]) {
    throw new Error('Invalid combat recording identity.');
  }
  return { ...(value.mode === 'training' ? { version: 2 as const, mode: 'training' as const } : { version: 1 as const }), matchId: value.matchId, contentId: value.contentId, seed: value.seed, seats: [value.seats[0]!, value.seats[1]!] };
}

function pair(values: readonly unknown[], matchId: string): [CombatRoomFrame, CombatRoomFrame] {
  if (!Array.isArray(values) || values.length !== 2) throw new Error('Combat recording requires two inputs per frame.');
  const frames = values.map(value => {
    const input = readCombatRoomInput(value);
    if (!isObject(value) || input.matchId !== matchId || (value.seat !== 0 && value.seat !== 1)) throw new Error('Combat recording input identity or seat differs.');
    return { ...input, seat: value.seat };
  }).sort((a, b) => a.seat - b.seat);
  if (frames[0]!.seat !== 0 || frames[1]!.seat !== 1 || frames[0]!.frame !== frames[1]!.frame) throw new Error('Combat recording frame pair is incomplete.');
  return [frames[0]!, frames[1]!];
}

/** Records accepted paired inputs, never predictions. Reaching the bound rejects without truncating history. */
export function createCombatRecording(options: Identity & { maxFrames?: number }) {
  const header = identity(options), maxFrames = frameLimit(options.maxFrames ?? defaultMaxFrames);
  const frames: CombatRecording['frames'] = [];
  return {
    get frameCount() { return frames.length; },
    append(options: { frames: readonly CombatRoomFrame[] }) {
      const next = pair(options.frames, header.matchId), frame = next[0].frame;
      if (frame < frames.length) {
        if (JSON.stringify(frames[frame]) !== JSON.stringify(next)) throw new Error('Combat recording input conflicts with an accepted frame.');
        return;
      }
      if (frame !== frames.length) throw new Error('Combat recording inputs must be contiguous from frame zero.');
      if (frames.length >= maxFrames) throw new Error('Combat recording frame limit reached.');
      frames.push(next);
    },
    snapshot(): CombatRecording { return structuredClone({ ...header, frames }); },
  };
}

/** Low-rate JSON/storage boundary. Validates the entire recording before returning detached canonical inputs. */
export function readCombatRecording(options: { value: unknown; maxFrames?: number }): CombatRecording {
  const value = isObject(options.value) ? options.value : undefined;
  const maxFrames = frameLimit(options.maxFrames ?? defaultMaxFrames);
  if (!value || value.version !== 1 && value.version !== 2 || value.version === 1 && value.mode !== undefined || value.version === 2 && value.mode !== 'set' && value.mode !== 'training' || !Array.isArray(value.frames) || value.frames.length > maxFrames) throw new Error('Invalid combat recording version, mode or frame count.');
  const header = identity({ matchId: requireText(value.matchId), contentId: requireText(value.contentId), seed: requireNumber(value.seed),
    seats: requireArray(value.seats).map(value => requireText(value)), mode: value.mode === 'set' || value.mode === 'training' ? value.mode : undefined });
  const frames: RecordingBody['frames'] = [];
  for (const [index, row] of value.frames.entries()) {
    if (!Array.isArray(row) || !isObject(row[0]) || row[0].frame !== index) throw new Error('Combat recording frames must appear once in order.');
    const next = pair(row, header.matchId);
    if (next[0].frame !== index) throw new Error('Combat recording frames must appear once in order.');
    frames.push(next);
  }
  return { ...header, frames };
}
