import { expect, test } from 'bun:test';
import { create, toBinary } from '@bufbuild/protobuf';
import { createCombatRecording } from '@hyperfocus/engine/combat/net';
import { ArchiveSchema } from './proto/generated/replay-pb.ts';
import { decodeReplayArchive, encodeReplayArchive, readReplayFile, readReplayArchive, replayMaxBytes } from './archive.ts';

function fixture(training = false) {
  const recording = createCombatRecording({ matchId: 'round', contentId: 'fixture', seed: 0xffffffff, seats: ['one', 'two'], ...(training ? { mode: 'training' as const } : {}) });
  for (let frame = 0; frame < 4; frame++) recording.append({ frames: [0, 1].map(seat => ({ matchId: 'round', frame, seat,
    actions: frame === 2 && seat === 0 ? ['jab'] : [], direction: { x: 0.123456789012345, y: 0, z: -0.3 } })) });
  return readReplayArchive({ value: { recording: recording.snapshot(), stoppedReason: 'history ended',
    appearance: { version: 1, fighters: [{ name: 'Jun', icon: 'star', selections: { top: 'jacket' } }, null] } } });
}

test('optional start frames are bounded, preserved by protobuf, and absent in older archives', () => {
  const value = fixture();expect(decodeReplayArchive({ bytes: encodeReplayArchive({ value }) }).startFrame).toBeUndefined();
  for (const startFrame of [0, 2, 4]) expect(decodeReplayArchive({ bytes: encodeReplayArchive({ value: { ...value, startFrame } }) }).startFrame).toBe(startFrame);
  for (const startFrame of [-1, 5, .5, NaN, '2']) expect(() => encodeReplayArchive({ value: { ...value, startFrame } })).toThrow('start frame');
});

test('archive preserves confirmed inputs, precision, training, appearance and partial reason; legacy JSON stays readable', () => {
  for (const training of [false, true]) {
    const value = fixture(training), bytes = encodeReplayArchive({ value });
    expect(readReplayFile({ bytes })).toEqual(value);
    expect(readReplayFile({ bytes: new TextEncoder().encode(JSON.stringify(value)) })).toEqual(value);
    expect(readReplayFile({ bytes: new TextEncoder().encode(JSON.stringify(value.recording)) })).toEqual({ recording: value.recording, stoppedReason: '' });
    const offset = new Uint8Array(bytes.length + 10);offset.set(bytes, 5);
    expect(decodeReplayArchive({ bytes: offset.subarray(5, -5) })).toEqual(value);
    expect(bytes.byteLength).toBeLessThan(new TextEncoder().encode(JSON.stringify(value)).length);
  }
});

test('empty recordings and absent appearance remain distinct from null fighter appearances', () => {
  const value = fixture();value.recording.frames = [];
  const bare = { recording: value.recording, stoppedReason: '' };
  expect(decodeReplayArchive({ bytes: encodeReplayArchive({ value: bare }) })).toEqual(bare);
  expect(decodeReplayArchive({ bytes: encodeReplayArchive({ value: { ...bare, appearance: { version: 1, fighters: [null, null] } } }) })).toEqual({ ...bare, appearance: { version: 1, fighters: [null, null] } });
});

test('corruption, unsupported versions, private appearance fields and excessive payloads reject without JSON fallback', () => {
  const bytes = encodeReplayArchive({ value: fixture() });
  for (const malformed of [bytes.subarray(0, 4), bytes.subarray(0, -1), new Uint8Array([72, 70, 82, 80, 2, ...bytes.subarray(5)])]) {
    expect(() => readReplayFile({ bytes: malformed })).toThrow();
  }
  expect(() => readReplayFile({ bytes: new Uint8Array(replayMaxBytes + 1) })).toThrow('20 MB');
  const value = fixture();
  expect(() => encodeReplayArchive({ value: { ...value, stoppedReason: 1 } })).toThrow();
  expect(() => encodeReplayArchive({ value: { ...value, recording: { ...value.recording, matchId: '\ud800' } } })).toThrow();
  expect(() => encodeReplayArchive({ value: { ...value, appearance: { ...value.appearance, privateId: 'secret' } } })).toThrow();
  const body = toBinary(ArchiveSchema, create(ArchiveSchema));
  expect(() => decodeReplayArchive({ bytes: new Uint8Array([...bytes.subarray(0, 5), ...body]) })).toThrow('recording');
});

test('additive protobuf fields can be read by the old archive reader, but domain export drops unknown fields', () => {
  const value = fixture(), bytes = encodeReplayArchive({ value });
  // Future field 100, varint 1; existing field tags and envelope version stay stable.
  const future = new Uint8Array([...bytes, 160, 6, 1]);
  expect(decodeReplayArchive({ bytes: future })).toEqual(readReplayArchive({ value }));
  expect(encodeReplayArchive({ value: decodeReplayArchive({ bytes: future }) })).toEqual(bytes);
});

test('excessive repeated messages are rejected before generated decoding', () => {
  const body = toBinary(ArchiveSchema, create(ArchiveSchema, { recording: { frames: Array.from({ length: 36001 }, () => ({})) } }));
  expect(() => decodeReplayArchive({ bytes: new Uint8Array([72, 70, 82, 80, 1, ...body]) })).toThrow('field count limit');
});
