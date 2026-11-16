import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { createCombatHitstop3D } from '../combat-hitstop.ts';
import { combatInputActions3D, createCombatFighterInputs3D } from '../combat-fighter-inputs.ts';
import { readCombatProject3D } from '../combat-declaration.ts';

const input = (actions: string[] = [], x = 0, z = 0) => ({ actions: new Set(actions), direction: { x, y: 0, z } });
const fixture = () => combatMotionFixture({ independentCombatInputs: true });

test('physical inputs reject held-weapon internals while retaining ordinary custom commands', async () => {
  const { project } = await fixture(), definition = readCombatProject3D(project.extensions.hyperfocusCombat)!;
  const source = definition.config.moves.find(move => move.id === 'jab')!;
  definition.config.moves.push({ ...source, id: 'tool', command: ['tool-internal'] },
    { ...source, id: 'tool:variant', command: ['generated-weapon-variant-internal-command'], weaponBaseMoveId: 'tool', weaponSourceMoveId: 'jab', weaponAttack: 'light' },
    { ...source, id: 'custom', command: ['special'] });
  definition.interactions = { weapons: [{ entityId: 'tool', lightMoveId: 'tool', heavyMoveId: 'tool', durability: 5, length: 1, material: 'metal' }] };
  const allowed = combatInputActions3D({ definition });
  expect(allowed).toContain('special');expect(allowed).toContain('jab');expect(allowed).toContain('interact');
  expect(allowed).not.toContain('tool-internal');expect(allowed).not.toContain('generated-weapon-variant-internal-command');
  const inputs = createCombatFighterInputs3D(definition);
  expect(() => inputs.read([input(['jab', 'interact', 'special']), input()])).not.toThrow();
  for (const action of ['tool-internal', 'generated-weapon-variant-internal-command']) expect(() => inputs.read([input([action]), input()])).toThrow('Unknown independent combat action');
});

test('roster input rejects missing, foreign or unbounded data before advancing the world', async () => {
  const { game } = await fixture();const before = game.snapshot();
  for (const inputs of [undefined, [input()], [input(['b:jab']), input()], [input([], 2), input()], [input([], NaN), input()]]) {
    expect(() => game.step([], inputs)).toThrow();expect(game.snapshot()).toEqual(before);
  }
});

test('fighters move independently in world space regardless of camera and preserve attack commitment', async () => {
  const cameras: NonNullable<Parameters<typeof combatMotionFixture>[0]>['cameraPosition'][] = [[0, 4, 7], [7, 4, 0]];
  for (const cameraPosition of cameras) {
    const { game, runtime } = await combatMotionFixture({ independentCombatInputs: true, cameraPosition });
    for (let frame = 0; frame < 20; frame++) game.step([], [input([], -1), input([], 1)]);
    expect(runtime.physics.body('a')!.x).toBeLessThan(-1);expect(runtime.physics.body('b')!.x).toBeGreaterThan(2.4);
    expect(Math.abs(runtime.physics.body('a')!.z)).toBeLessThan(.01);
    game.step([], [input(['heavy']), input(['heavy'])]);game.step([], [input(['jab', 'guard']), input(['jab', 'guard'])]);
    for (const fighter of game.snapshot().combat!.state.fighters) expect(fighter.moveId).toBe('heavy');
  }
});

test('each fighter can toggle lock-on independently using the same fresh-press action', async () => {
  const { game } = await fixture();
  game.step([], [input(['lockon']), input()]);
  expect(game.snapshot().combat!.motion.map(fighter => fighter.locked)).toEqual([false, true]);
  game.step([], [input(['lockon']), input(['lockon'])]);
  expect(game.snapshot().combat!.motion.map(fighter => fighter.locked)).toEqual([false, false]);
  game.step([], [input(), input()]);game.step([], [input(['lockon']), input()]);
  expect(game.snapshot().combat!.motion.map(fighter => fighter.locked)).toEqual([true, false]);
});

test('both roster slots can earn physical hits, block and freshly parry with identical rules', async () => {
  for (const attacker of [0, 1]) for (const defense of ['hit', 'block', 'parry']) {
    const { game } = await fixture(), defender = 1 - attacker;
    for (let frame = 0; frame < 40; frame++) {
      const samples = [input(), input()];
      if (frame === 0) samples[attacker] = input(['jab']);
      if (defense === 'block' || defense === 'parry' && frame >= 9) samples[defender] = input(['guard']);
      game.step([], samples);
    }
    const state = game.snapshot().combat!.state;
    if (defense === 'hit') expect(state.fighters[defender]!.health).toBeLessThan(100);
    else if (defense === 'block') { expect(state.fighters[defender]!.guardMeter).toBeLessThan(100);expect(state.fighters[defender]!.health).toBeGreaterThan(92); }
    else { expect(state.fighters[defender]!.health).toBe(100);expect(state.fighters[attacker]!.stunKind).toBe('parry'); }
  }
});

test('match practice independent inputs replace the level-nine policy without inventing attacks', async () => {
  const { game } = await combatMotionFixture({ independentCombatInputs: true, match: true });
  game.step(['match:practice'], [input(), input()]);
  for (let frame = 0; frame < 120; frame++) game.step([], [input(), input()]);
  expect(game.snapshot().combat!.state.fighters.every(fighter => fighter.attackSerial === 0)).toBe(true);
  game.step([], [input(), input(['heavy'])]);expect(game.snapshot().combat!.state.fighters[1]!.moveId).toBe('heavy');
});

test('frozen world aim round-trips alongside prioritized guard', () => {
  const pause = createCombatHitstop3D();pause.restore({ remaining: 3, buffered: [], previous: ['a:guard'] });
  pause.begin(new Set(['a:heavy', 'a:drive']), { x: 1, y: 0, z: 0 });
  pause.begin(new Set(), { x: 0, y: 0, z: 1 });
  pause.begin(new Set(['a:guard']), { x: -1, y: 0, z: 0 });
  const restored = createCombatHitstop3D();restored.restore(restored.validate(JSON.parse(JSON.stringify(pause.capture()))));
  restored.begin(new Set(['a:guard']), { x: -1, y: 0, z: 0 });
  expect([...restored.resume(new Set())]).toEqual(['a:guard']);expect(restored.direction).toEqual({ x: 1, y: 0, z: 0 });
  expect([...restored.resume(new Set())]).toEqual(['a:guard']);
  expect([...restored.resume(new Set())]).toEqual(['a:guard']);
  expect(() => restored.validate({ ...pause.capture(), directions: [{ x: Infinity, y: 0, z: 0 }] })).toThrow();
});

test('real contact preserves frozen Drive aim across restoration without bypassing commitment', async () => {
  const { game } = await fixture();
  game.step([], [input(['jab']), input()]);
  for (let frame = 0; frame < 30 && game.snapshot().combat!.hitstop.remaining === 0; frame++) game.step([], [input(), input()]);
  expect(game.snapshot().combat!.state.fighters[1]!.health).toBeLessThan(100);
  expect(game.snapshot().combat!.hitstop.remaining).toBe(4);
  game.step([], [input(['heavy', 'drive'], 0, 1), input(['guard'])]);
  game.step([], [input(), input()]);
  game.step([], [input(), input(['guard'])]);
  while (game.snapshot().combat!.hitstop.remaining) game.step([], [input(), input(['guard'])]);
  const saved = JSON.parse(JSON.stringify(game.snapshot()));game.restore(saved);
  game.step([], [input(), input(['guard'])]);
  const channels = game.snapshot().combat!.fighterInputs!;
  expect(channels[0]!.held).toEqual(['a:heavy', 'a:drive']);
  expect(channels[0]!.hitstop.directions).toEqual([{ x: 0, y: 0, z: 0 }]);
  expect(game.snapshot().combat!.state.fighters[0]!.moveId).toBe('jab'); // Still committed; a buffered command is not a cancel.
  const before = game.snapshot();const invalid = structuredClone(before);invalid.combat!.fighterInputs![1]!.held = ['a:heavy'];
  expect(() => game.restore(invalid)).toThrow();expect(game.snapshot()).toEqual(before);
});

test('world-directed frozen jump retains dash direction when fresh neutral offense supersedes its sample', () => {
  const pause = createCombatHitstop3D();pause.restore({ remaining: 3, buffered: [], previous: [] });
  pause.begin(new Set(['b:jump']), { x: 0, y: 0, z: -1 });
  pause.begin(new Set(), { x: 0, y: 0, z: 0 });pause.begin(new Set(), { x: 0, y: 0, z: 0 });
  const restored = createCombatHitstop3D();restored.restore(restored.validate(JSON.parse(JSON.stringify(pause.capture()))));
  restored.begin(new Set(['b:jab']), { x: 0, y: 0, z: 0 });
  expect([...restored.resume(new Set())]).toEqual(['b:jab', 'b:jump-release']);
  expect(restored.direction).toEqual({ x: 0, y: 0, z: 0 });expect(restored.releaseDirection).toEqual({ x: 0, y: 0, z: -1 });
});
