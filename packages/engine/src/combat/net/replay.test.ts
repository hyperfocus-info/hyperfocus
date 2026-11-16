import { expect, test } from 'bun:test';
import { combatRoomInputCodec, type CombatRoomFrame } from './protocol.ts';
import { createCombatRecording, readCombatRecording } from './replay.ts';

const header = { matchId: 'set-1', contentId: 'combat-v2:fixture', seed: 7, seats: ['alice-connection', 'bob-connection'] };

test('charge holds survive consecutive network and replay frames until explicit release', () => {
  const recording = createCombatRecording(header);
  for (let frame = 0; frame < 4; frame++) {
    const pair = inputs(frame);
    pair[0].actions = frame < 3 ? ['heavy'] : [];
    recording.append({ frames: pair.map(input => ({ ...combatRoomInputCodec.decode(combatRoomInputCodec.encode(input)), seat: input.seat })) });
  }
  const replay = readCombatRecording({ value: JSON.parse(JSON.stringify(recording.snapshot())) });
  expect(replay.frames.map(pair => pair[0].actions)).toEqual([['heavy'], ['heavy'], ['heavy'], []]);
});
function inputs(frame: number): [CombatRoomFrame, CombatRoomFrame] {
  return [
    { matchId: header.matchId, frame, seat: 0, actions: ['jab'], direction: { x: 1, y: 0, z: 0 } },
    { matchId: header.matchId, frame, seat: 1, actions: ['guard'], direction: { x: -1, y: 0, z: 0 } },
  ];
}

test('paired accepted inputs round-trip JSON and existing binary codec with detached ownership', () => {
  const recording = createCombatRecording(header), source = inputs(0);
  recording.append({ frames: source });source[0].actions.push('heavy');header.seats[0] = 'changed';
  const snapshot = recording.snapshot();expect(snapshot.seats[0]).toBe('alice-connection');header.seats[0] = 'alice-connection';
  expect(snapshot.frames[0]![0].actions).toEqual(['jab']);
  recording.append({ frames: inputs(1).reverse() });
  const parsed = readCombatRecording({ value: JSON.parse(JSON.stringify(recording.snapshot())) });
  expect(parsed).toEqual(recording.snapshot());
  for (const pair of parsed.frames) for (const { seat, ...input } of pair) {
    expect(combatRoomInputCodec.decode(combatRoomInputCodec.encode(input))).toEqual(input);expect([0, 1]).toContain(seat);
  }
  snapshot.frames[0]![0].actions.length = 0;parsed.seats[0] = 'other';
  expect(recording.snapshot().frames[0]![0].actions).toEqual(['jab']);expect(recording.snapshot().seats[0]).toBe('alice-connection');
});

test('duplicates are harmless, conflicts and invalid pairs fail atomically', () => {
  const recording = createCombatRecording(header);recording.append({ frames: inputs(0) });
  const before = recording.snapshot();recording.append({ frames: inputs(0).reverse() });expect(recording.frameCount).toBe(1);
  const bad: CombatRoomFrame[][] = [inputs(2), [inputs(1)[0]], [inputs(1)[0], inputs(1)[0]], inputs(1), inputs(1), inputs(1), inputs(0), inputs(1)];
  bad[3]![1]!.matchId = 'wrong';bad[4]![1]!.seat = 2;bad[5]![1]!.direction.x = Infinity;bad[6]![0]!.actions = ['heavy'];bad[7]![1]!.frame = 2;
  for (const frames of bad) { expect(() => recording.append({ frames })).toThrow();expect(recording.snapshot()).toEqual(before); }
  recording.append({ frames: inputs(1) });expect(recording.frameCount).toBe(2);
});

test('bounded archive does not evict history or reject exact duplicates when full', () => {
  const recording = createCombatRecording({ ...header, maxFrames: 1 });recording.append({ frames: inputs(0) });
  expect(() => recording.append({ frames: inputs(1) })).toThrow('limit');
  recording.append({ frames: inputs(0) });expect(recording.snapshot().frames).toEqual([inputs(0)]);
  for (const maxFrames of [0, -1, 1.5, Infinity, 216001]) expect(() => createCombatRecording({ ...header, maxFrames })).toThrow();
});

test('storage reader rejects unsupported versions, identity, gaps, duplicate rows and oversized data', () => {
  const recording = createCombatRecording(header);recording.append({ frames: inputs(0) });const valid = recording.snapshot();
  for (const value of [null, {}, { ...valid, version: 2 }, { ...valid, seed: -1 }, { ...valid, contentId: '' },
    { ...valid, seats: ['same', 'same'] }, { ...valid, frames: [inputs(1)] }, { ...valid, frames: [inputs(0), inputs(0)] },
    { ...valid, frames: [null] }, { ...valid, frames: [inputs(0), inputs(1)] }]) {
    expect(() => readCombatRecording({ value, maxFrames: 1 })).toThrow();
  }
  expect(readCombatRecording({ value: valid })).toEqual(valid);
  expect(() => readCombatRecording({ value: { ...valid, frames: [inputs(0), inputs(0)] }, maxFrames: 2 })).toThrow('once in order');
  expect(() => readCombatRecording({ value: { ...valid, frames: [inputs(0), inputs(2)] }, maxFrames: 2 })).toThrow('once in order');
  expect(readCombatRecording({ value: { ...valid, frames: [] } }).frames).toEqual([]);
});
