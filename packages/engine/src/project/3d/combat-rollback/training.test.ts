import { expect, test } from 'bun:test';
import type { CombatRoomInput } from '../../../combat/net/protocol.ts';
import { readCombatRecording } from '../../../combat/net/replay.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { createNetworkCombatSession } from './session.ts';
import { createNetworkCombatSpectator } from './spectator.ts';
import { createCombatReplay3D } from './replay.ts';
import { createGameplay3D } from '../gameplay.ts';
import { createCombatMatch3D } from '../combat-match/index.ts';

const match = { matchId: 'training', contentId: 'fixture', seed: 7, seats: ['one', 'two'] };
const neutral = (): Pick<CombatRoomInput, 'actions' | 'direction'> => ({ actions: [], direction: { x: 0, y: 0, z: 0 } });
async function fresh() { const f = await combatMotionFixture({ match: true });f.game.reset();return f; }

test('two human training inputs earn contacts and KO without rounds; delayed peers, spectator and recording agree', async () => {
  let commands = [neutral(), neutral()];
  const clients = await Promise.all([0, 1].map(async seat => {
    const f = await fresh(), packets: CombatRoomInput[] = [];
    const session = createNetworkCombatSession({ ...f, mode: 'training', match, contentId: match.contentId, localPeerId: match.seats[seat]!,
      getLocalInput: () => commands[seat]!, sendInput: input => { packets.push(input); } });
    return { ...f, session, packets };
  }));
  const [a, b] = clients;
  if (!a || !b || clients.length !== 2) throw Error('Training fixture needs two clients');
  const initialGuard = a.session.game.snapshot().combat!.state.fighters[1]!.guardMeter;
  const spectator = createNetworkCombatSpectator({ ...await fresh(), mode: 'training', match, contentId: match.contentId, onCursor() {} });
  const snapshot = (frame: number) => ({ ...match, status: 'ready' as const, confirmedFrame: frame, frames: {
    [`0:${frame}`]: { ...a.packets[frame]!, seat: 0 }, [`1:${frame}`]: { ...b.packets[frame]!, seat: 1 },
  } });
  let damaged = false, blocked = false;
  for (let frame = 0; frame < 950; frame++) {
    commands = [neutral(), neutral()];
    const actor = a.runtime.physics.body('a')!, target = a.runtime.physics.body('b')!;
    const dx = target.x - actor.x, dz = target.z - actor.z, length = Math.hypot(dx, dz);
    if (length > 1.3) commands[0]!.direction = { x: dx / length, y: 0, z: dz / length };
    if (frame % 30 === 0) commands[0]!.actions.push('jab');
    if (frame < 100) commands[1]!.actions.push('guard');
    a.session.tick();b.session.tick();
    if (frame >= 3) a.session.receive(snapshot(frame - 3));
    if (frame >= 7) b.session.receive(snapshot(frame - 7));
    spectator.receive(snapshot(frame));spectator.tick();
    const defender = a.session.game.snapshot().combat!.state.fighters[1]!;
    if (frame === 99) { expect(defender.health).toBeGreaterThan(90);expect(defender.health).toBeLessThan(100);blocked = defender.guardMeter < initialGuard; }
    damaged ||= defender.health < 100;
  }
  for (let frame = 943; frame < 950; frame++) { a.session.receive(snapshot(frame));b.session.receive(snapshot(frame)); }
  expect(blocked).toBe(true);expect(damaged).toBe(true);
  expect(a.session.game.snapshot().combat!.state.fighters[1]!.health).toBe(0);
  expect(a.session.confirmedMatch).toMatchObject({ phase: 'practice', playerWins: 0, opponentWins: 0, winner: '' });
  expect(a.session.game.snapshot()).toEqual(b.session.game.snapshot());
  expect(spectator.game.snapshot()).toEqual(a.session.game.snapshot());
  const recording = a.session.exportRecording();expect(recording).toMatchObject({ version: 2, mode: 'training' });
  const replay = createCombatReplay3D({ ...await fresh(), recording: JSON.parse(JSON.stringify(recording)), contentId: match.contentId });
  while (replay.tick()) {}
  expect(replay.game.snapshot()).toEqual(a.session.game.snapshot());
  replay.seek({ frame: 0 });expect(replay.game.snapshot().combat!.state.fighters.every(fighter => fighter.health === 100)).toBe(true);
}, 30000);

test('training rejects in-band reset, swap, menus and rematch; mode headers cannot masquerade as legacy sets', async () => {
  const f = await fresh();let actions: string[] = [];
  const session = createNetworkCombatSession({ ...f, mode: 'training', match, contentId: match.contentId, localPeerId: 'one', getLocalInput: () => ({ ...neutral(), actions }), sendInput() {} });
  const before = session.game.snapshot();
  for (const action of ['practice:reset', 'practice:swap', 'practice:guard', 'match:menu', 'match:rematch']) {
    actions = [action];expect(() => session.tick()).toThrow();expect(session.game.snapshot()).toEqual(before);
  }
  const recording = session.exportRecording();
  expect(() => readCombatRecording({ value: { ...recording, version: 1 } })).toThrow();
  expect(() => readCombatRecording({ value: { ...recording, mode: 'invented' } })).toThrow();
  const { mode: _mode, ...legacy } = recording;
  expect(readCombatRecording({ value: { ...legacy, version: 1 } }).version).toBe(1);
  const invalidMode = { online: true, mode: 'training' as const };Reflect.set(invalidMode, 'mode', 'invented');
  expect(() => createCombatMatch3D(invalidMode)).toThrow('Training requires');
  expect(() => createCombatMatch3D({ mode: 'training' })).toThrow('Training requires');
  const invalidSession = { ...f, mode: 'training' as const, match, contentId: match.contentId, localPeerId: 'one', getLocalInput: neutral, sendInput() {} };
  Reflect.set(invalidSession, 'mode', 'invented');expect(() => createNetworkCombatSession(invalidSession)).toThrow();expect(session.game.snapshot()).toEqual(before);
});

test('training preserves physical hit, held block and fresh parry rules for both fighter seats', async () => {
  for (const attacker of [0, 1]) {
    const outcomes = new Map<string, number>();
    for (const defense of ['hit', 'block', 'parry']) {
      const f = await fresh(), defender = 1 - attacker;
      const game = createGameplay3D({ ...f, independentCombatInputs: true, externalCombatMatch: true, externalCombatMode: 'training' });
      const sample = (actions: string[] = []) => ({ actions: new Set(actions), direction: neutral().direction });
      for (let frame = 0; frame < 30; frame++) game.step([], [sample(), sample()]);
      const guard = game.snapshot().combat!.state.fighters[defender]!.guardMeter;
      for (let frame = 0; frame < 40; frame++) {
        const pair = [sample(), sample()];
        if (frame === 0) pair[attacker] = sample(['jab']);
        if (defense === 'block' || defense === 'parry' && frame >= 9) pair[defender] = sample(['guard']);
        game.step([], pair);
      }
      const fighters = game.snapshot().combat!.state.fighters;outcomes.set(defense, fighters[defender]!.health);
      if (defense === 'block') expect(fighters[defender]!.guardMeter).toBeLessThan(guard);
      if (defense === 'parry') { expect(fighters[defender]!.health).toBe(100);expect(fighters[attacker]!.stunKind).toBe('parry'); }
    }
    expect(outcomes.get('hit')!).toBeLessThan(outcomes.get('block')!);expect(outcomes.get('block')!).toBeLessThan(100);
  }
});
