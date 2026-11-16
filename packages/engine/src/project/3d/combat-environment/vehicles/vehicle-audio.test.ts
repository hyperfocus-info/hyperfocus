import { expect, test } from 'bun:test';
import { vehicleFixture } from './vehicle-fixture.ts';

test('secondary crash emits the existing break cue once next tick and discards stale presentation on restore', async () => {
  const { game } = await vehicleFixture({ audio: true });game.step(['match:practice']);
  game.step(['a:jab']);for (let frame = 0; frame < 30; frame++) game.step([]);
  expect(game.drainAudio().filter(cue => cue.assetId === 'crash')).toHaveLength(1);
  const clear = game.snapshot();clear.combat!.state.fighters[0]!.position.z = 10;
  clear.entities.find(entity => entity.id === 'a')!.position[2] = 10;game.restore(clear);
  const beforeCrash = game.checkpoint();
  for (let frame = 0; frame < 180 && game.snapshot().combat!.environment!.surfaces[1]!.phase !== 'removed'; frame++) {
    game.step([]);expect(game.drainAudio()).toEqual([]);
  }
  const crashed = game.snapshot();expect(crashed.combat!.environment!.surfaces[1]!.phase).toBe('removed');
  const atCrash = game.checkpoint();
  game.step([]);expect(game.drainAudio().map(cue => cue.assetId)).toEqual(['crash']);
  game.step([]);expect(game.drainAudio()).toEqual([]);
  // Neither portable restoration nor a trusted checkpoint re-announces a wreck.
  game.restore(crashed);game.step([]);expect(game.drainAudio()).toEqual([]);
  atCrash.restore();game.step([]);expect(game.drainAudio()).toEqual([]);
  // Rewinding before impact produces one fresh collision and one fresh cue.
  beforeCrash.restore();const heard: string[] = [];
  for (let frame = 0; frame < 180; frame++) { game.step([]);heard.push(...game.drainAudio().map(cue => cue.assetId)); }
  expect(heard).toEqual(['crash']);
});
