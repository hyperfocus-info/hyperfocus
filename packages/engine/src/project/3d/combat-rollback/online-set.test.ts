import { expect, test } from 'bun:test';
import type { CombatRoomInput } from '../../../combat/net/protocol.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { createNetworkCombatSession } from './session.ts';
import { createGameplay3D } from '../gameplay.ts';

const neutral = (): Pick<CombatRoomInput, 'actions' | 'direction'> => ({ actions: [], direction: { x: 0, y: 0, z: 0 } });
const match = { matchId: 'set', contentId: 'fixture', seed: 19, seats: ['one', 'two'] };

test('online countdown ignores local menus and does not turn an early held attack into a fresh press', async () => {
  const f = await combatMotionFixture({ match: true });f.game.reset();
  const game = createGameplay3D({ project: f.project, runtime: f.runtime, independentCombatInputs: true, externalCombatMatch: true });
  let guard = true;
  const samples = (attack: boolean) => [{ actions: new Set(attack ? ['jab'] : []), direction: neutral().direction }, { actions: new Set(guard ? ['guard'] : []), direction: neutral().direction }];
  for (let frame = 0; frame < 180; frame++) game.step(['match:quit', 'match:practice', 'match:replay', 'pause'], samples(true));
  expect(game.snapshot().combat!.match).toMatchObject({ phase: 'fighting', playerWins: 0, opponentWins: 0 });
  expect(game.snapshot().combat!.state.fighters[0]!.attackSerial).toBe(0);
  expect(game.snapshot().combat!.state.fighters[1]!.guarding).toBe(true);expect(game.snapshot().combat!.state.fighters[1]!.guardStarted).toBe(-1);
  guard = false;game.step([], samples(false));guard = true;game.step([], samples(false));
  expect(game.snapshot().combat!.state.fighters[1]!.guardStarted).toBe(game.snapshot().combat!.state.frame - 1);
  for (let frame = 0; frame < 20; frame++) game.step([], samples(false));game.step([], samples(true));
  expect(game.snapshot().combat!.state.fighters[0]!.attackSerial).toBe(1);
  const saved = game.snapshot(), invalid = structuredClone(saved);invalid.combat!.match!.rematchVotes = [true, false];
  expect(() => game.restore(invalid)).toThrow('online combat match');expect(game.snapshot()).toEqual(saved);
});

test('physical first-to-three set confirms scores once and requires both rematch votes across rollback', async () => {
  let commands = [neutral(), neutral()];
  const clients = [];
  for (const seat of [0, 1]) {
    const fixture = await combatMotionFixture({ match: true });fixture.game.reset();
    // Online winner/score meaning follows seats even when authored local player is second.
    const project = { ...fixture.project, extensions: { ...fixture.project.extensions, hyperfocusCombat: { ...fixture.project.extensions.hyperfocusCombat,
      fighters: [{ entityId: 'a', actionPrefix: 'a:', control: 'dummy' }, { entityId: 'b', actionPrefix: 'b:', control: 'player' }],
    } } };
    const packets: CombatRoomInput[] = [], updates: Array<{ frame: number; phase: string; score: number }> = [];
    const session = createNetworkCombatSession({ project, runtime: fixture.runtime, match, contentId: match.contentId, localPeerId: match.seats[seat]!,
      getLocalInput: () => commands[seat]!, sendInput: input => { packets.push(input); },
      onConfirmedMatch: cue => { updates.push({ frame: cue.frame, phase: cue.event.phase, score: cue.event.playerWins }); },
    });
    clients.push({ session, packets, updates, runtime: fixture.runtime });
  }
  const a = clients[0]!, b = clients[1]!;
  function deliver(client: typeof a, frame: number) {
    if (frame < 0) return;
    client.session.receive({ ...match, status: 'ready', confirmedFrame: frame, frames: {
      [`0:${frame}`]: { ...a.packets[frame]!, seat: 0 }, [`1:${frame}`]: { ...b.packets[frame]!, seat: 1 },
    } });
  }
  let frame = 0;
  function step() {
    expect(a.session.tick()).toBe(true);expect(b.session.tick()).toBe(true);
    deliver(a, frame - 3);deliver(b, frame - 7);frame++;
  }
  // A rematch intent before a result neither restarts nor reserves a future vote.
  commands = [{ ...neutral(), actions: ['match:rematch'] }, { ...neutral(), actions: ['match:rematch'] }];step();
  expect(a.session.confirmedMatch).toBeUndefined();commands = [neutral(), neutral()];
  let contacts = 0, previousHealth = 100;
  while (frame < 5000 && a.session.confirmedMatch?.phase !== 'match-result') {
    commands = [neutral(), neutral()];
    if (a.session.game.combatMatch()!.phase === 'fighting') {
      const actor = a.runtime.physics.body('a')!, target = a.runtime.physics.body('b')!;
      const dx = target.x - actor.x, dz = target.z - actor.z, length = Math.hypot(dx, dz);
      if (length > 1.3) commands[0]!.direction = { x: dx / length, y: 0, z: dz / length };
      if (frame % 30 === 0) commands[0]!.actions.push('jab');
    }
    step();
    const health = a.session.game.combatState()!.fighters[1]!.health;
    if (health < previousHealth) contacts++;previousHealth = health;
  }
  for (let pending = Math.max(0, frame - 7); pending < frame; pending++) { deliver(a, pending);deliver(b, pending); }
  expect(contacts).toBeGreaterThanOrEqual(30);
  expect(a.session.confirmedMatch).toEqual(b.session.confirmedMatch);
  expect(a.session.confirmedMatch).toMatchObject({ phase: 'match-result', playerWins: 3, opponentWins: 0, winner: 'player', rematchVotes: [false, false] });
  expect(a.session.game.snapshot()).toEqual(b.session.game.snapshot());
  expect(new Set(a.updates.map(update => update.frame)).size).toBe(a.updates.length);
  expect(a.updates.filter(update => update.score === 3).every(update => update.phase === 'match-result')).toBe(true);
  const confirmed = a.session.confirmedMatch!;confirmed.playerWins = 0;expect(a.session.confirmedMatch!.playerWins).toBe(3);

  commands = [{ ...neutral(), actions: ['match:rematch'] }, neutral()];step();commands = [neutral(), neutral()];
  for (let tick = 0; tick < 25; tick++) step();
  expect(a.session.confirmedMatch).toMatchObject({ phase: 'match-result', rematchVotes: [true, false], playerWins: 3 });
  expect(a.session.game.snapshot().combat!.state.fighters[1]!.health).toBe(0);
  commands = [neutral(), { ...neutral(), actions: ['match:rematch'] }];step();commands = [neutral(), neutral()];
  // A second peer's speculative rematch does not update confirmed result UI yet.
  expect(b.session.confirmedMatch!.phase).toBe('match-result');
  for (let tick = 0; tick < 12; tick++) step();
  for (let pending = frame - 7; pending < frame; pending++) { deliver(a, pending);deliver(b, pending); }
  expect(a.session.confirmedMatch).toEqual(b.session.confirmedMatch);
  expect(a.session.confirmedMatch).toMatchObject({ phase: 'countdown', playerWins: 0, opponentWins: 0, winner: '', rematchVotes: [false, false] });
  for (const fighter of a.session.game.snapshot().combat!.state.fighters) {
    expect(fighter.health).toBe(100);expect(fighter.stamina).toBe(100);expect(fighter.guardMeter).toBe(100);expect(fighter.escapeCharges).toBe(1);expect(fighter.attackSerial).toBe(0);
  }
  expect(a.session.game.snapshot()).toEqual(b.session.game.snapshot());expect(a.session.stateHash(frame - 1)).toBe(b.session.stateHash(frame - 1));
}, 30000);
