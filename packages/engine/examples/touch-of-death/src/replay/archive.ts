import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { readCombatRecording } from '@hyperfocus/engine/combat/net';
import { ArchiveSchema, type Fighter } from './proto/generated/replay-pb.ts';
import { readReplayAppearance, type ReplayFighterAppearance } from './appearance.ts';
import { boundReplayWire } from './bounds.ts';

import { replayMaxBytes } from './limits.ts';
export { replayMaxBytes, replayContentType } from './limits.ts';
const magic = new Uint8Array([72, 70, 82, 80, 1]); // HFRP, archive envelope version 1.
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
const invalidUnicode = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;

export function readReplayArchive(options: { value: unknown }) {
  const value = options.value;
  const wrapped = value !== null && typeof value === 'object' && 'recording' in value;
  const recording = readCombatRecording({ value: wrapped ? value.recording : value });
  const stoppedReason = wrapped && 'stoppedReason' in value ? value.stoppedReason : '';
  if (typeof stoppedReason !== 'string' || encoder.encode(stoppedReason).length > 4096 || invalidUnicode.test(stoppedReason)) throw new Error('Invalid replay stopped reason.');
  const appearance = readReplayAppearance(wrapped && 'appearance' in value ? value.appearance : undefined);
  const startFrame = wrapped && 'startFrame' in value ? value.startFrame : undefined;
  if (startFrame !== undefined && (typeof startFrame !== 'number' || !Number.isSafeInteger(startFrame) || startFrame < 0 || startFrame > recording.frames.length)) throw new Error('Invalid replay start frame.');
  // Protobuf strings are UTF-8; rejecting unpaired surrogates prevents silent replacement.
  const strings = [recording.matchId, recording.contentId, ...recording.seats];
  for (const pair of recording.frames) for (const input of pair) strings.push(...input.actions);
  if (strings.some(text => invalidUnicode.test(text))) throw new Error('Invalid replay Unicode.');
  return { recording, stoppedReason, ...(appearance ? { appearance } : {}), ...(startFrame !== undefined ? { startFrame } : {}) };
}

function fighterMessage(value: ReplayFighterAppearance | null) {
  return value === null ? undefined : { name: value.name, icon: value.icon,
    selections: Object.entries(value.selections).map(([slot, choice]) => ({ slot, choice })) };
}

function fighterValue(value: Fighter | undefined) {
  if (!value) return null;
  if (value.selections.length > 24 || new Set(value.selections.map(item => item.slot)).size !== value.selections.length) throw new Error('Invalid replay selections.');
  return { name: value.name, icon: value.icon, selections: Object.fromEntries(value.selections.map(item => [item.slot, item.choice])) };
}

/** Low-rate file boundary; the live engine input codec is unchanged. */
export function encodeReplayArchive(options: { value: unknown }): Uint8Array<ArrayBuffer> {
  const { recording, stoppedReason, appearance, startFrame } = readReplayArchive(options);
  const payload = toBinary(ArchiveSchema, create(ArchiveSchema, {
    recording: { ...recording, frames: recording.frames.map(([a, b]) => ({
      firstActions: a.actions, firstX: a.direction.x, firstZ: a.direction.z,
      secondActions: b.actions, secondX: b.direction.x, secondZ: b.direction.z,
    })) }, stoppedReason, startFrame,
    appearance: appearance && { version: appearance.version, first: fighterMessage(appearance.fighters[0]), second: fighterMessage(appearance.fighters[1]) },
  }));
  if (payload.byteLength + magic.length > replayMaxBytes) throw new Error('Replay files must be no larger than 20 MB.');
  const bytes = new Uint8Array(magic.length + payload.length);
  bytes.set(magic);bytes.set(payload, magic.length);return bytes;
}

/** Identified corrupt/unsupported protobuf never falls back to JSON. Unknown fields are ignored. */
export function decodeReplayArchive(options: { bytes: Uint8Array }) {
  const { bytes } = options;
  if (bytes.byteLength > replayMaxBytes) throw new Error('Replay files must be no larger than 20 MB.');
  if (!magic.every((byte, index) => bytes[index] === byte)) throw new Error('Unsupported replay protobuf envelope.');
  const payload = bytes.subarray(magic.length);boundReplayWire(payload);
  const archive = fromBinary(ArchiveSchema, payload, { recursionLimit: 8 });
  const recording = archive.recording;
  if (!recording || recording.frames.length > 36000) throw new Error('Invalid replay recording or frame count.');
  const appearance = archive.appearance;
  return readReplayArchive({ value: {
    recording: { ...recording, frames: recording.frames.map((frame, index) => [
      { matchId: recording.matchId, frame: index, seat: 0, actions: frame.firstActions, direction: { x: frame.firstX, y: 0, z: frame.firstZ } },
      { matchId: recording.matchId, frame: index, seat: 1, actions: frame.secondActions, direction: { x: frame.secondX, y: 0, z: frame.secondZ } },
    ]) }, stoppedReason: archive.stoppedReason, startFrame: archive.startFrame,
    appearance: appearance && { version: appearance.version, fighters: [fighterValue(appearance.first), fighterValue(appearance.second)] },
  } });
}

/** Reads legacy JSON recordings/envelopes and current binary archives. */
export function readReplayFile(options: { bytes: Uint8Array }) {
  if (options.bytes.byteLength > replayMaxBytes) throw new Error('Replay files must be no larger than 20 MB.');
  if (options.bytes[0] === magic[0]) return decodeReplayArchive(options);
  let value: unknown;
  try { value = JSON.parse(decoder.decode(options.bytes)); }
  catch { throw new Error('This replay file is not valid JSON or protobuf. Choose a downloaded recording.'); }
  return readReplayArchive({ value });
}
