import { createCombatAi3D } from '../combat-ai.ts';
import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { createGameplay3D, createHyperfocus3DRuntime } from '../../runtime-3d.ts';
import { createCombatInteractions } from './session.ts';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';

test('ordinary Practice grab reaches non-overlapping bodies; Neutral allows throws and Attempt tech responds', async () => {
  for (const tech of [false, true]) {
  const base = await combatMotionFixture({ hurtRadius: 1, match: true });
  const project = { ...base.project, extensions: { ...base.project.extensions,
    hyperfocusCombat: { ...base.project.extensions.hyperfocusCombat, interactions: { grappleRange: 1.8, grappleTechFrames: 12, weapons: [] } },
    hyperfocus3D: { ...base.project.extensions.hyperfocus3D, scenes: base.project.extensions.hyperfocus3D.scenes.map(scene => ({ ...scene,
      entities: scene.entities.map(entity => entity.id === 'a' || entity.id === 'b' ? { ...entity, scale: [1, 1, 1], position: [entity.id === 'a' ? 0 : 3.4, 1.1, 0], physics: { ...entity.physics, shape: 'sphere' } } : entity),
    })) },
  } };
  const runtime = await createHyperfocus3DRuntime(project, base.assets), game = createGameplay3D({ project, runtime });
  game.step(['match:practice']);
  if (tech) game.step(['practice:tech']);
  for (let tick = 0; tick < 35; tick++) game.step(['move-right']);
  const before = game.snapshot().combat!.state.fighters;
  const distance = Math.hypot(before[0]!.position.x - before[1]!.position.x, before[0]!.position.z - before[1]!.position.z);
  expect(distance).toBeGreaterThan(1.8);expect(distance).toBeLessThanOrEqual(2.1);
  game.step(['a:interact']);
  expect(game.snapshot().combat!.interactions!.grapples).toHaveLength(1);
  for (let tick = 0; tick < 12; tick++) game.step([]);
  const after = game.snapshot().combat!;
  expect(after.interactions!.trace.some(entry => entry.kind === (tech ? 'grapple-tech' : 'grapple-throw'))).toBe(true);
  expect(after.state.fighters[1]!.health).toBe(tech ? 100 : 96);
  if (!tech) expect(runtime.physics.body('b')!.velocityX).toBeGreaterThan(0);
  }
});

function fixture(obstructed = false) {
  const config = { ...createTouchOfDeathPreset(), hurtRadius: 1 };
  const state = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }, { id: 'b', position: { x: 2, y: 1, z: 0 } }] }).capture();
  const interactions = createCombatInteractions({ config, definition: { weapons: [], grappleRange: 1.8 }, fighterIds: ['a', 'b'], positions: new Map(),
    surface: obstructed ? () => ({ id: 'solid-wall', position: { x: 1, y: 1, z: 0 } }) : undefined });
  return { config, state, interactions };
}

test('grapple cannot reach through an intact wall and failed presses explain range, facing and recovery', () => {
  const blocked = fixture(true);blocked.interactions.before(blocked.state, [{ fighterId: 'a', pressed: ['interact'] }]);
  expect(blocked.interactions.capture().grapples).toHaveLength(0);
  expect(blocked.interactions.capture().trace.at(-1)?.kind).toBe('grapple-obstructed');
  const { state, interactions } = fixture();
  state.fighters[1]!.position.x = 4;interactions.before(state, [{ fighterId: 'a', pressed: ['interact'] }]);
  expect(interactions.capture().trace.at(-1)?.kind).toBe('grapple-out-of-range');
  expect(state.fighters[0]!.stunFrames).toBe(18);
  state.fighters[0]!.stunFrames = 0;state.fighters[0]!.stunKind = '';
  state.fighters[1]!.position.x = -2;interactions.before(state, [{ fighterId: 'a', pressed: ['interact'] }]);
  expect(interactions.capture().trace.at(-1)?.kind).toBe('grapple-facing-away');
  state.fighters[0]!.stunFrames = 8;interactions.before(state, [{ fighterId: 'a', pressed: ['interact'] }]);
  expect(interactions.capture().trace.at(-1)?.kind).toBe('interaction-recovering');
});

test('same-frame fresh grabs tech independent of input order; AI uses the same reachable distance', () => {
  for (const reversed of [false, true]) {
    const { state, interactions } = fixture();state.fighters[1]!.guarding = true;state.fighters[1]!.facing.x = -1;
    expect(interactions.aiPress(state, 'a', 'b')).toBe(true);
    const inputs = ['a', 'b'].map(fighterId => ({ fighterId, pressed: ['interact'] }));
    const events = interactions.before(state, reversed ? inputs.reverse() : inputs);
    expect(events).toHaveLength(1);expect(events[0]!.defenseReason).toBe('grapple-teched');
    expect(interactions.capture().grapples).toHaveLength(0);
    expect(state.fighters.map(fighter => fighter.health)).toEqual([100, 100]);
  }
});

test('AI observes the real grapple window and techs through the ordinary delayed input queue', () => {
  for(const difficulty of [1,5,6,7,9]) {
    const { state, interactions }=fixture();const ai=createCombatAi3D({config:createTouchOfDeathPreset()});
    interactions.before(state,[{fighterId:'a',pressed:['interact']}]);let presses=0;
    for(let tick=0;tick<12;tick++) {
      const grapple=interactions.techWindow('b');
      const decision=ai.step({state,fighterId:'b',targetId:'a',difficulty,grounded:true,targetGrounded:true,
        body:{...state.fighters[1]!.position,velocityX:0,velocityY:0,velocityZ:0},targetBody:{...state.fighters[0]!.position,velocityX:0,velocityY:0,velocityZ:0},grapple});
      if(decision.input.pressed?.includes('interact'))presses++;
      state.frame++;interactions.before(state,[decision.input]);
      const saved=ai.capture();ai.restore(JSON.parse(JSON.stringify(saved)));expect(ai.capture()).toEqual(saved);
    }
    expect(presses).toBe(difficulty>=6?1:0);
    expect(state.fighters[1]!.health).toBe(difficulty>=6?100:96);
    expect(interactions.capture().trace.some(event=>event.kind==='grapple-tech')).toBe(difficulty>=6);
  }
});
