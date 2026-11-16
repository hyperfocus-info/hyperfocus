import { expect, test } from 'bun:test';
import type { CombatRoomFrame, CombatRoomInput, CombatRoomSnapshot } from '../../../combat/net/protocol.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { createNetworkCombatSession } from './session.ts';

const match = { matchId: 'bout', contentId: 'fixture-v1', seed: 7, seats: ['one', 'two'] };
const neutral: Pick<CombatRoomInput, 'actions' | 'direction'> = { actions: [], direction: { x: 0, y: 0, z: 0 } };
async function fixture(peer: string, history = 120) {
  const f = await combatMotionFixture({ match: true });f.game.reset();
  const project = { ...f.project, extensions: { ...f.project.extensions, hyperfocusCombat: { ...f.project.extensions.hyperfocusCombat,
    audio: { music: 'music', cues: { hit: 'hit', swing: 'swing' }, voices: { a: { attack: 'attack' } } },
  } } };
  const packets: CombatRoomInput[] = [], heard: string[] = [];
  const options = { project, runtime: f.runtime, match, contentId: match.contentId, localPeerId: peer,
    getLocalInput: () => ({ ...neutral, actions: packets.length === 210 && peer === 'one' ? ['jab'] : [] }),
    sendInput: (packet: CombatRoomInput) => { packets.push(packet); }, maxRollbackFrames: history,
    onConfirmedAudio: (cue: { frame: number; id: string; event: { assetId: string } }) => { heard.push(`${cue.frame}:${cue.id}:${cue.event.assetId}`); },
  };
  return { session: createNetworkCombatSession(options), packets, heard, options };
}

test('network runner agrees on an external bout and releases contact audio once after confirmation', async () => {
  const a = await fixture('one'), b = await fixture('two');
  const frames: Record<string, CombatRoomFrame> = {};
  const snapshot = (through: number): CombatRoomSnapshot => ({ ...match, status: 'ready', confirmedFrame: through,
    frames: Object.fromEntries(Object.entries(frames).filter(([, frame]) => frame.frame <= through && frame.frame >= through - 119)) });
  for (let frame = 0; frame < 270; frame++) {
    expect(a.session.tick()).toBe(true);expect(b.session.tick()).toBe(true);
    frames[`0:${frame}`] = { ...a.packets[frame]!, seat: 0 };frames[`1:${frame}`] = { ...b.packets[frame]!, seat: 1 };
    if (frame === 0) { expect(a.heard).toEqual([]);expect(b.heard).toEqual([]);expect(a.session.confirmedMatch).toBeUndefined(); }
    a.session.receive(snapshot(frame - 3));b.session.receive(snapshot(frame - 7));
  }
  a.session.receive(snapshot(269));b.session.receive(snapshot(269));
  expect(a.session.game.snapshot()).toEqual(b.session.game.snapshot());
  expect(a.session.game.snapshot().combat!.state.fighters[1]!.health).toBeLessThan(100);
  expect(a.heard).toEqual(b.heard);
  expect(a.session.confirmedMatch).toEqual(b.session.confirmedMatch);expect(a.session.confirmedMatch!.phase).toBe('fighting');
  expect(a.heard.some(cue => cue.endsWith(':hit'))).toBe(true);
  expect(a.heard.filter(cue => cue.endsWith(':music'))).toHaveLength(1);
  const heard = [...a.heard];a.session.receive(snapshot(269));expect(a.heard).toEqual(heard);
});

test('network runner stalls without advancing and resumes after missing input arrives', async () => {
  const f = await fixture('one', 2);
  expect(f.session.tick()).toBe(true);expect(f.session.tick()).toBe(true);
  const before = f.session.game.snapshot();
  expect(f.session.tick()).toBe(false);expect(f.session.status.status).toBe('waiting-for-input');
  expect(f.session.game.snapshot()).toEqual(before);expect(f.packets).toHaveLength(2);
  f.session.receive({ ...match, status: 'ready', confirmedFrame: 0, frames: { '1:0': { ...neutral, matchId: match.matchId, frame: 0, seat: 1 } } });
  expect(f.session.tick()).toBe(true);expect(f.session.status.status).toBe('running');
  expect(() => f.session.receive({ ...match, contentId: 'different', status: 'ready', confirmedFrame: 0, frames: {} })).toThrow('configuration changed');
  f.session.interrupt('Connection closed.');expect(f.session.tick()).toBe(false);
});

test('network runner rejects content mismatch, warm worlds and rewritten local input', async () => {
  const f = await fixture('one');
  expect(() => createNetworkCombatSession({ ...f.options, contentId: 'other' })).toThrow('matching content');
  const warm = await fixture('one');warm.options.runtime.step();
  expect(() => createNetworkCombatSession(warm.options)).toThrow('fresh runtime');
  f.session.tick();
  expect(() => f.session.receive({ ...match, status: 'ready', confirmedFrame: 0, frames: {
    '0:0': { ...neutral, matchId: match.matchId, frame: 0, seat: 0, actions: ['heavy'] },
  } })).toThrow('already submitted');
  const before = f.session.game.snapshot();
  expect(() => f.session.receive({ ...match, status: 'ready', confirmedFrame: 0, frames: {
    '1:0': { ...neutral, matchId: match.matchId, frame: 0, seat: 1 },
    '9:1': { ...neutral, matchId: match.matchId, frame: 1, seat: 9 },
  } })).toThrow('unassigned seat');
  expect(f.session.confirmedFrame()).toBe(-1);expect(f.session.game.snapshot()).toEqual(before);
});

test('live recovery after physical contact retains exact samples and matches uninterrupted state and recording', async () => {
  const a = await fixture('one'), b = await fixture('two');
  const frames: Record<string, CombatRoomFrame> = {};
  const snapshot = (status = 'ready'): CombatRoomSnapshot => ({ ...match, status, confirmedFrame: Math.min(a.session.frame(), b.session.frame()) - 1, frames: Object.fromEntries(Object.entries(frames).filter(([, input]) => input.frame >= a.session.frame() - 120)) });
  for (let frame = 0; frame < 270; frame++) {
    a.session.tick();b.session.tick();
    const local = structuredClone(a.packets.find(input => input.frame === frame)!);
    frames[`1:${frame}`] = { ...b.packets.find(input => input.frame === frame)!, seat: 1 };
    if (frame === 240) {
      expect(a.session.game.snapshot().combat!.state.fighters[1]!.health).toBeLessThan(100);
      const recovering = { ...snapshot('recovering'), confirmedFrame: frame - 1 };
      a.session.receive(recovering);const before = a.session.game.snapshot(), count = a.packets.length;
      for (let wait = 0; wait < 150; wait++) expect(a.session.tick()).toBe(false);
      expect(a.session.status.status).toBe('recovering');expect(a.session.game.snapshot()).toEqual(before);expect(a.packets).toHaveLength(count);
      expect(a.session.resendPendingInputs()).toBe(0);
      a.session.receive({ ...recovering, status: 'ready' });expect(a.session.resendPendingInputs()).toBe(1);expect(a.packets.at(-1)).toEqual(local);
    }
    frames[`0:${frame}`] = { ...local, seat: 0 };
    a.session.receive(snapshot());b.session.receive(snapshot());
  }
  expect(a.session.resendPendingInputs()).toBe(0);
  expect(a.session.game.snapshot()).toEqual(b.session.game.snapshot());expect(a.session.stateHash(269)).toBe(b.session.stateHash(269));
  expect(a.session.exportRecording()).toEqual(b.session.exportRecording());expect(a.heard).toEqual(b.heard);
});

test('recovery at rollback boundary neither resamples failed sends nor permits terminal revival', async () => {
  const f = await fixture('one', 2);let samples = 0, fail = true;const packets: CombatRoomInput[] = [];
  const session = createNetworkCombatSession({ ...f.options, getLocalInput() { samples++;return neutral; }, sendInput(input) { if (fail) throw new Error('transport unavailable');packets.push(input); } });
  expect(() => session.tick()).toThrow('transport unavailable');expect(samples).toBe(1);fail = false;
  session.tick();expect(samples).toBe(1);session.tick();expect(samples).toBe(2);expect(session.tick()).toBe(false);
  session.receive({ ...match, status: 'recovering', confirmedFrame: -1, frames: {} });expect(session.tick()).toBe(false);
  session.receive({ ...match, status: 'ready', confirmedFrame: -1, frames: {} });expect(session.resendPendingInputs()).toBe(2);expect(packets.slice(2)).toEqual(packets.slice(0, 2));
  expect(session.tick()).toBe(false);expect(samples).toBe(2);
  session.receive({ ...match, status: 'ready', confirmedFrame: 0, frames: { '1:0': { ...neutral, matchId: match.matchId, frame: 0, seat: 1 } } });expect(session.tick()).toBe(true);
  session.interrupt('Grace expired.');session.receive({ ...match, status: 'ready', confirmedFrame: 0, frames: {} });expect(session.tick()).toBe(false);expect(session.resendPendingInputs()).toBe(0);
});
