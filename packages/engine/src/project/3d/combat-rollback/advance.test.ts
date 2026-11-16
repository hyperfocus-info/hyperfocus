import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { createGameplay3D } from '../gameplay.ts';
import type { GameplayContext3D } from '../gameplay-contracts.ts';

test('advance preserves physical combat, hitstop, audio and checkpoint state without returning snapshots', async () => {
  const regular = await combatMotionFixture({ independentCombatInputs: true });
  const batched = await combatMotionFixture({ independentCombatInputs: true });
  for (let frame = 0; frame < 240; frame++) {
    const inputs = [0, 1].map(seat => ({ actions: new Set(seat === 0 && frame % 60 === 0 ? ['heavy'] : []), direction: { x: seat === 1 ? -.2 : 0, y: 0, z: 0 } }));
    const expected = regular.game.step([], inputs);
    expect(batched.game.advance({ fighterInputs: inputs })).toBeUndefined();
    expect(batched.game.snapshot()).toEqual(expected);
    expect(batched.game.drainAudio()).toEqual(regular.game.drainAudio());
  }
  expect(batched.runtime.physics.checkpoint()).toEqual(regular.runtime.physics.checkpoint());
  expect(batched.game.checkpoint().state).toEqual(regular.game.checkpoint().state);
});

test('advance avoids unused world snapshots and lightweight match reads are detached', async () => {
  const { runtime, game } = await combatMotionFixture({ match: true });
  const match = game.combatMatch()!;match.playerWins = 99;
  expect(game.combatMatch()!.playerWins).not.toBe(99);
  let captures = 0;
  const measured = createGameplay3D({ project: { activeSceneId: 'empty', scenes: [] }, runtime: { ...runtime, snapshot() { captures++;return runtime.snapshot(); } } });
  captures = 0;
  for (let index = 0; index < 100; index++) measured.advance();
  expect(captures).toBe(0);
  measured.step();expect(captures).toBe(1);
});

test('script contexts, pressed inputs and state remain identical through advance', async () => {
  async function client() {
    const { runtime } = await combatMotionFixture();
    const contexts: GameplayContext3D[] = [];
    const game = createGameplay3D({ runtime, project: { activeSceneId: 'logic', scenes: [{ id: 'logic', entities: [{ components: [
      { id: 'script', type: 'behavior', enabled: true, values: { module: 'script' } },
    ] }] }] }, behaviors: { 'script#update': (context: GameplayContext3D) => {
      contexts.push(context);return { state: { count: Number(context.state.count ?? 0) + 1 }, commands: context.pressed.includes('jump') ? [{ type: 'impulse', entityId: 'a', value: [0, 3, 0] }] : [] };
    } } });
    return { game, contexts };
  }
  const regular = await client(), batched = await client();
  for (const actions of [[], ['jump'], ['jump'], [], ['jump']]) {
    regular.game.step(actions);batched.game.advance({ actions });
    expect(batched.game.snapshot()).toEqual(regular.game.snapshot());
  }
  expect(batched.contexts).toEqual(regular.contexts);
});
