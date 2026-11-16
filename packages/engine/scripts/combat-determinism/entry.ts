import { hypot } from '../../src/math/simulation.ts';
import { combatMotionFixture } from '../../src/project/3d/combat-motion-fixture.ts';
import { surfaceScenario } from './surface.ts';

export const scenarios = ['launch', 'steering', 'block', 'parry', 'knockout', 'ground-tech', 'wall-tech', 'missed-tech'] as const;
export type Scenario = typeof scenarios[number];

/** Fixtures author initial geometry only. Every subsequent change comes from inputs and physical contacts. */
export async function createScenario(name: Scenario) {
  if (name.endsWith('tech')) return surfaceScenario(name === 'wall-tech', name === 'missed-tech' ? 1 : 9);
  const { game, runtime } = await combatMotionFixture({ independentCombatInputs: true });
  const start = game.snapshot().combat!.state.frame;
  let ticks = 0, launched = false, chased = false, followup = false, blocked = false, parried = false, steered = false, corpseTicks = 0;
  return {
    step() {
      const frame = game.snapshot().combat!.state.frame - start;
      const inputs = [0, 1].map(() => ({ actions: new Set<string>(), direction: { x: 0, y: 0, z: 0 } }));
      if (name === 'block' || name === 'parry') {
        if (ticks === 0) inputs[0]!.actions.add('jab');
        if (name === 'block' || ticks >= 9) inputs[1]!.actions.add('guard');
      } else if (name === 'knockout') {
        const a = runtime.physics.body('a')!, b = runtime.physics.body('b')!;
        const dx = b.x - a.x, dz = b.z - a.z, length = hypot(dx, dz);
        if (length > 1.3) inputs[0]!.direction = { x: dx / length, y: 0, z: dz / length };
        if (ticks % 30 === 0) inputs[0]!.actions.add('jab');
      } else {
        if (frame === 0) inputs[0]!.actions.add('heavy');
        if (frame === 62) { inputs[0]!.actions.add('dash');inputs[0]!.direction.x = 1; }
        if (frame === 77) { inputs[0]!.actions.add('jab');inputs[0]!.actions.add('drive'); }
        if (name === 'steering' && frame >= 35) inputs[1]!.direction.z = .4;
      }
      game.step([], inputs);game.drainAudio();ticks++;
      const state = game.snapshot().combat!.state, a = state.fighters[0]!, b = state.fighters[1]!;
      launched ||= runtime.physics.body('b')!.velocityY > 5;
      chased ||= runtime.physics.body('a')!.velocityY > 8;
      followup ||= b.health < 76;
      blocked ||= b.guardMeter < 100;parried ||= a.stunKind === 'parry';
      steered ||= b.stunKind === 'hit' && Math.abs(runtime.physics.body('b')!.velocityZ) > .01;
      if (b.health === 0) corpseTicks++;
      const done = name === 'knockout' ? corpseTicks >= 80 : ticks >= (name === 'block' || name === 'parry' ? 40 : 180);
      if (ticks > 2400) throw new Error(`${name}: physical scenario exceeded its input budget`);
      const metrics = { launched, chased, followup, blocked, parried, steered, health: b.health, corpseTicks };
      if (done) {
        const valid = name === 'launch' ? launched && chased && followup : name === 'steering' ? launched && steered
          : name === 'block' ? blocked && b.health > 92 : name === 'parry' ? parried && b.health === 100 : corpseTicks >= 80;
        if (!valid) throw new Error(`${name}: intended interaction did not occur: ${JSON.stringify(metrics)}`);
      }
      return { done, metrics, state: game.checkpoint().state };
    },
  };
}
Reflect.set(globalThis, '__combatDeterminismScenario', createScenario);
