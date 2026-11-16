import { expect, test } from 'bun:test';
import type { CombatRoomFrame, CombatRoomSnapshot } from '../../../combat/net/protocol.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { createCombatReplay3D } from './replay.ts';
import { createNetworkCombatSpectator } from './spectator.ts';

const match = { matchId: 'spectated', contentId: 'fixture-v2', seed: 7, seats: ['one', 'two'] };
function packet(frame: number, seat: number): CombatRoomFrame {
  return { matchId: match.matchId, frame, seat, actions: frame === 210 && seat === 0 ? ['jab'] : [], direction: { x: 0, y: 0, z: 0 } };
}
function window(start: number, end: number, head = end): CombatRoomSnapshot {
  return { ...match, status: 'ready', confirmedFrame: head, frames: Object.fromEntries(Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index)
    .flatMap(frame => [0, 1].map(seat => [`${seat}:${frame}`, packet(frame, seat)]))) };
}
async function fixture() {
  const f = await combatMotionFixture({ match: true });f.game.reset();
  const cursors: number[] = [], heard: string[] = [];
  const project = { ...f.project, extensions: { ...f.project.extensions, hyperfocusCombat: { ...f.project.extensions.hyperfocusCombat,
    audio: { cues: { hit: 'hit', swing: 'swing' } },
  } } };
  const options = { project, runtime: f.runtime, match, contentId: match.contentId, onCursor: ({ frame }: { frame: number }) => { cursors.push(frame); },
    onConfirmedAudio: ({ event }: { event: { assetId: string } }) => { heard.push(event.assetId); } };
  return { ...f, options, cursors, heard, session: createNetworkCombatSpectator(options) };
}

test('late spectator catches up through physical contact and exports exactly replayable confirmed inputs', async () => {
  const f = await fixture();
  for (let start = 0; start < 270; start += 120) {
    f.session.receive(window(start, Math.min(269, start + 119), 269));
    expect(f.session.tick({ maxFrames: 120 })).toBe(true);
  }
  expect(f.session.frame()).toBe(270);expect(f.session.confirmedFrame()).toBe(269);
  expect(f.session.game.snapshot().combat!.state.fighters[1]!.health).toBeLessThan(100);
  expect(f.heard).toEqual([]);expect(f.cursors).toEqual([0, 120, 240, 270]);
  expect(f.session.tick()).toBe(false);expect(f.session.recordingStatus.frames).toBe(270);
  const replayFixture = await combatMotionFixture({ match: true });replayFixture.game.reset();
  const replay = createCombatReplay3D({ project: f.options.project, runtime: replayFixture.runtime, recording: f.session.exportRecording(), contentId: match.contentId });
  while (replay.tick()) replay.game.drainAudio();
  expect(replay.game.snapshot()).toEqual(f.session.game.snapshot());
  const copy = f.session.confirmedMatch!;copy.playerWins = 99;expect(f.session.confirmedMatch!.playerWins).toBe(0);
});

test('live spectator releases actual contact audio once and never invents a missing pair', async () => {
  const f = await fixture();
  const incomplete = window(0, 0);delete incomplete.frames['1:0'];f.session.receive(incomplete);
  const before = f.session.game.snapshot();expect(f.session.tick()).toBe(false);expect(f.session.game.snapshot()).toEqual(before);
  f.session.receive(window(0, 0));expect(f.session.tick()).toBe(true);
  for (let frame = 1; frame < 249; frame += 2) {
    f.session.receive(window(frame, frame + 1));expect(f.session.status.status).toBe('running');
    expect(f.session.tick()).toBe(true);expect(f.session.tick()).toBe(true);
  }
  f.session.receive(window(249, 249));expect(f.session.tick()).toBe(true);
  expect(f.heard.filter(asset => asset === 'hit')).toHaveLength(1);
  const heard = [...f.heard];f.session.receive(window(249, 249));expect(f.session.tick()).toBe(false);expect(f.heard).toEqual(heard);
  f.session.receive(window(251, 251));expect(f.session.tick({ maxFrames: 120 })).toBe(false);expect(f.session.frame()).toBe(250);
  f.session.receive(window(250, 250, 251));expect(f.session.tick({ maxFrames: 120 })).toBe(true);expect(f.session.frame()).toBe(252);
});

test('spectator validates entire windows before mutation and obeys bounds, yields and interruption', async () => {
  const f = await fixture(), before = f.session.game.snapshot();
  const invalid = window(0, 1);invalid.frames['1:1']!.actions = ['cheat'];
  expect(() => f.session.receive(invalid)).toThrow('unauthored');expect(f.session.tick()).toBe(false);expect(f.session.game.snapshot()).toEqual(before);
  expect(() => f.session.receive({ ...window(0, 0), contentId: 'other' })).toThrow('configuration');
  expect(() => f.session.receive(window(256, 256))).toThrow('outside');
  expect(() => f.session.receive(window(0, 0, -1))).toThrow('not confirmed');
  const badSeat = window(0, 0);badSeat.frames['1:0']!.seat = 2;expect(() => f.session.receive(badSeat)).toThrow('seat');
  f.session.receive(window(0, 1));const conflict = window(0, 0);conflict.frames['0:0']!.actions = ['guard'];
  expect(() => f.session.receive(conflict)).toThrow('conflicts');
  expect(() => f.session.tick({ maxFrames: 121 })).toThrow('budget');
  expect(f.session.tick({ maxFrames: 120, shouldYield: () => true })).toBe(false);
  expect(f.session.tick()).toBe(true);expect(f.session.frame()).toBe(1);
  f.session.receive({ ...window(0, 1), status: 'archive-ended' });expect(f.session.status.status).toBe('interrupted');expect(f.session.tick()).toBe(false);
  expect(() => createNetworkCombatSpectator({ ...f.options, contentId: 'wrong' })).toThrow('matching');
  f.runtime.step();expect(() => createNetworkCombatSpectator(f.options)).toThrow('fresh');
});

test('spectator recovery drains only confirmed pairs and resumes the same cursor after a physical hit', async () => {
  const f = await fixture(), baseline = await fixture();
  for (let start = 0; start < 240; start += 120) {
    const snapshot = window(start, start + 119);
    f.session.receive(snapshot);baseline.session.receive(snapshot);f.session.tick({ maxFrames: 120 });baseline.session.tick({ maxFrames: 120 });
  }
  expect(f.session.game.snapshot().combat!.state.fighters[1]!.health).toBeLessThan(100);
  const recovery = { ...window(240, 241), status: 'recovering' };
  f.session.receive(recovery);expect(f.session.status.status).toBe('recovering');expect(f.session.tick({ maxFrames: 120 })).toBe(true);
  const before = f.session.game.snapshot();expect(f.session.tick()).toBe(false);expect(f.session.game.snapshot()).toEqual(before);
  const count = f.cursors.length;f.session.resendCursor();expect(f.cursors).toHaveLength(count + 1);expect(f.cursors.at(-1)).toBe(242);
  baseline.session.receive(window(240, 241));baseline.session.tick({ maxFrames: 120 });
  for (const session of [f.session, baseline.session]) { session.receive(window(242, 269));session.tick({ maxFrames: 120 }); }
  expect(f.session.status.status).toBe('running');expect(f.session.game.snapshot()).toEqual(baseline.session.game.snapshot());expect(f.session.exportRecording()).toEqual(baseline.session.exportRecording());
  f.session.interrupt('Grace expired.');const end = f.cursors.length;f.session.resendCursor();expect(f.cursors).toHaveLength(end);
});
