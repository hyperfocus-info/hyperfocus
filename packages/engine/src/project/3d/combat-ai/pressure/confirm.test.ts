import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../../combat/touch-of-death.ts';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import { createCombatAi3D } from '../../combat-ai.ts';

function fixture(difficulty = 9) {
  const config = createTouchOfDeathPreset();
  const sim = createCombatSimulation({ config, fighters: [{ id: 'ai', position: { x: 0, y: 1, z: 0 }, facing: { x: 1, y: 0, z: 0 } }, { id: 'target', position: { x: 1.4, y: 1, z: 0 }, facing: { x: -1, y: 0, z: 0 } }] });
  const ai = createCombatAi3D({ config });
  const options = { seed: 7, state: sim.capture(), fighterId: 'ai', targetId: 'target', difficulty, grounded: true, targetGrounded: true,
    body: { x: 0, y: 1, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 }, targetBody: { x: 1.4, y: 1, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 } };
  return { config, sim, ai, options };
}

function landedJab(f: ReturnType<typeof fixture>) {
  const jab = f.config.moves.find(move => move.id === 'jab')!;
  f.sim.step({ inputs: [{ fighterId: 'ai', pressed: ['jab'] }] });
  while (f.sim.capture().fighters[0]!.moveFrame < jab.startupFrames + jab.activeFrames) f.sim.step();
  f.options.state = f.sim.capture();expect(f.options.state.fighters[0]!.hitConfirmed).toBe(true);
}

test('parry reward does not blindly re-jab into an expired stun window', () => {
  const { ai, options } = fixture();
  Object.assign(options.state.fighters[1]!, { stunKind: 'hit', stunFrames: 9 });
  expect(ai.step(options).input.pressed).toEqual([]);
  options.state.fighters[1]!.stunFrames = 24;
  options.targetBody.x = 2;
  expect(ai.step(options).input.pressed).toEqual(['jab']);
});

test('string confirms account for delivery delay and live DI escape trajectory', () => {
  const f = fixture(8);landedJab(f);const { ai, options } = f;
  Object.assign(options.state.fighters[1]!, { stunKind: 'hit', stunFrames: 12 });
  for (let i = 0; i < 4; i++) expect(ai.step(options).input.pressed).toEqual([]);
  ai.reset();options.difficulty = 9;options.state.fighters[1]!.stunFrames = 50;
  options.targetBody.velocityZ = 25;
  expect(ai.step(options).input.pressed).toEqual([]);
  options.targetBody.velocityZ = 0;
  expect(ai.step(options).input.pressed).toEqual(['jab']);
});

test('actual parry followup recovers too late for a guaranteed ordinary flurry', () => {
  const { config, sim, ai, options } = fixture();
  const initial = sim.capture();initial.fighters[0]!.followupFrames = config.parryFollowupFrames ?? 0;sim.restore({ snapshot: initial });
  sim.step({ inputs: [{ fighterId: 'ai', pressed: ['followup'] }] });
  let sawHit = false;
  for (let i = 0; i < 40; i++) {
    const state = sim.capture(), attacker = state.fighters[0]!, defender = state.fighters[1]!;
    sawHit ||= defender.stunKind === 'hit';
    if (sawHit && !attacker.moveId && defender.stunKind === 'hit') {
      options.state = state;
      expect(defender.stunFrames).toBeLessThan(config.moves.find(move => move.id === 'drive-jab')!.startupFrames);
      expect(ai.step(options).input.pressed).toEqual([]);
      return;
    }
    sim.step({ inputs: [] });
  }
  throw Error('Parry followup did not reach its real recovery boundary');
});

test('a confirmed lethal cancel takes priority over the preferred sustained string', () => {
  const f = fixture();landedJab(f);const { config, sim, ai, options } = f;
  Object.assign(options.state.fighters[1]!, { health: 9, stunKind: 'hit', stunFrames: 50 });
  const action = ai.step(options);
  sim.restore({ snapshot: options.state });
  sim.step({ inputs: [action.input] });
  const selected = config.moves.find(move => move.id === sim.inspect().fighters[0]!.moveId)!;
  expect(selected.stringOnly).toBe(true);
  expect(selected.damage).toBeGreaterThanOrEqual(9);
  for (let i = 0; i < selected.startupFrames + selected.activeFrames; i++) sim.step({ inputs: [] });
  expect(sim.inspect().fighters[1]!.health).toBe(0);
});

test('a fast lethal link uses a short real stun window but refuses an expired one', () => {
  for (const stunFrames of [5, 7]) {
    const f = fixture();landedJab(f);const { sim, ai, options } = f;
    Object.assign(options.state.fighters[1]!, { health: 9, stunKind: 'hit', stunFrames });
    const saved = ai.capture(), action = ai.step(options);
    ai.restore(saved);expect(ai.step(options)).toEqual(action);
    if (stunFrames === 5) { expect(action.input.pressed).toEqual([]);continue; }
    sim.restore({ snapshot: options.state });sim.step({ inputs: [action.input] });
    expect(sim.inspect().fighters[0]!.moveId).toBe('jab-link');
    for (let tick = 0; tick < 6; tick++) sim.step({ inputs: [] });
    expect(sim.inspect().fighters[1]!.health).toBe(0);
  }
});
