import { expect, test } from 'bun:test';
import { createCombatRecording } from '../../../combat/net/replay.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { createGameplay3D } from '../gameplay.ts';
import { createCombatReplay3D } from './replay.ts';

async function recordedHit() {
  const fixture = await combatMotionFixture({ match: true });fixture.game.reset();
  const game = createGameplay3D({ project: fixture.project, runtime: fixture.runtime, independentCombatInputs: true, externalCombatMatch: true, combatQueueSeed: 7 });
  const recording = createCombatRecording({ matchId: 'fight', contentId: 'same-runtime', seed: 7, seats: ['a', 'b'] });
  for (let frame = 0; frame < 260; frame++) {
    const inputs = [0, 1].map(seat => ({ matchId: 'fight', frame, seat, actions: seat === 0 && frame === 210 ? ['jab'] : [], direction: { x: 0, y: 0, z: 0 } }));
    recording.append({ frames: inputs });game.step([], inputs.map(input => ({ actions: new Set(input.actions), direction: input.direction })));
  }
  expect(game.snapshot().combat!.state.fighters[1]!.health).toBeLessThan(100);
  const fresh = await combatMotionFixture({ match: true });fresh.game.reset();
  return { fresh, recording: recording.snapshot(), expected: game.snapshot() };
}

test('recorded physical contact replays exactly, seeks cleanly, and either fighter can change the exchange', async () => {
  const { fresh, recording, expected } = await recordedHit();
  const replay = createCombatReplay3D({ ...fresh, recording: JSON.parse(JSON.stringify(recording)), contentId: 'same-runtime' });
  while (replay.tick()) {}
  expect(replay.ended).toBe(true);expect(replay.game.snapshot()).toEqual(expected);
  expect(replay.tick()).toBe(false);expect(replay.frame).toBe(260);
  replay.seek({ frame: 210 });expect(replay.game.drainAudio()).toEqual([]);replay.takeOver({ seat: 0 });
  for (let frame = 210; frame < 260; frame++) replay.tick();
  expect(replay.game.snapshot().combat!.state.fighters[1]!.health).toBe(100);
  replay.seek({ frame: 210 });replay.takeOver({ seat: 1 });
  for (let frame = 210; frame < 260; frame++) replay.tick({ actions: ['guard'], direction: { x: 0, y: 0, z: 0 } });
  expect(replay.game.snapshot().combat!.state.fighters[1]!.health).toBeGreaterThan(expected.combat!.state.fighters[1]!.health);
  replay.seek({ frame: 260 });expect(replay.controlledSeat).toBeUndefined();expect(replay.game.snapshot()).toEqual(expected);
});

test('invalid replay versions, actions and seek/takeover requests do not mutate gameplay', async () => {
  const { fresh, recording } = await recordedHit();
  const options = { ...fresh, recording, contentId: 'same-runtime' };
  expect(() => createCombatReplay3D({ ...options, contentId: 'different' })).toThrow('same game content');
  const invalid = structuredClone(recording);invalid.frames[0]![0].actions = ['invented'];
  expect(() => createCombatReplay3D({ ...options, recording: invalid })).toThrow('unauthored');
  const replay = createCombatReplay3D(options), before = replay.game.snapshot();
  const invalidSeat = { seat: 0 as const };Object.assign(invalidSeat, { seat: 2 });
  expect(() => replay.seek({ frame: 261 })).toThrow();expect(() => replay.takeOver(invalidSeat)).toThrow();
  expect(replay.game.snapshot()).toEqual(before);
  replay.takeOver({ seat: 0 });expect(() => replay.tick({ actions: ['invented'], direction: { x: 0, y: 0, z: 0 } })).toThrow();
  expect(replay.frame).toBe(0);expect(replay.game.snapshot()).toEqual(before);
});
