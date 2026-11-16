import { expect, test } from 'bun:test';
import { createGameplay3D, createHyperfocus3DRuntime } from '../../runtime-3d.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';

test('grab-tech recovery ends on the same legal frame for attacks or grabs, fresh or buffered, from either human seat', async () => {
  for (const mode of ['baseline', 'adaptive'] as const) for (const player of ['a', 'b']) for (const buffered of [false, true]) {
    const f = await combatMotionFixture({ match: true });
    const definition = f.project.extensions.hyperfocusCombat;
    definition.interactions = { weapons: [], grappleTechFrames: 12 };
    for (const fighter of definition.fighters) fighter.control = fighter.entityId === player ? 'player' : 'dummy';
    const runtime = await createHyperfocus3DRuntime(f.project, f.assets), game = createGameplay3D({ project: f.project, runtime,
      combatAiTuning: mode === 'baseline' ? [{ mode }, { mode }] : undefined });
    const saved = game.snapshot();saved.combat!.match = { ...saved.combat!.match!, phase: 'fighting', ticks: 0, held: [] };game.restore(saved);
    game.step([`${player}:interact`]);game.step([]);
    const originalTech = game.snapshot().combat!.interactions!.trace.find(event => event.kind === 'grapple-tech')!;
    expect(originalTech).toBeDefined();
    const firstLegalFrame = originalTech.frame + 12;
    expect(game.snapshot().combat!.state.fighters.map(fighter => fighter.stunFrames)).toEqual([11, 11]);
    while (game.snapshot().combat!.state.fighters[0]!.stunFrames > (buffered ? 2 : 0)) {
      expect(game.snapshot().combat!.state.fighters.every(fighter => !fighter.moveId)).toBe(true);
      const remaining = game.snapshot().combat!.state.fighters[0]!.stunFrames;
      expect(game.snapshot().combat!.state.fighters.map(fighter => fighter.stunFrames)).toEqual([remaining, remaining]);
      game.step([]);
    }
    const techs = game.snapshot().combat!.interactions!.trace.filter(event => event.kind === 'grapple-tech').length;
    game.step([`${player}:jab`]);
    if (buffered) { game.step([]);game.step([]); }
    const combat = game.snapshot().combat!, fighters = combat.state.fighters;
    expect(combat.state.frame).toBe(firstLegalFrame + 1);
    expect(combat.interactions!.trace.filter(event => event.kind === 'grapple-tech')).toHaveLength(techs);
    const newGrabs = combat.interactions!.trace.filter(event => event.kind === 'grapple-start' && event.frame > originalTech.frame);
    if (newGrabs.length) {
      // A chosen grip locks both seats before attack inputs resolve; public
      // acquisition must occur exactly after all twelve original recovery ticks.
      expect(newGrabs).toHaveLength(1);
      expect(newGrabs[0]).toMatchObject({ frame: firstLegalFrame, actor: player === 'a' ? 'b' : 'a', target: player });
      expect(combat.interactions!.grapples).toHaveLength(1);
      expect(combat.interactions!.grapples[0]!.remaining).toBe(12);
      expect(fighters.map(fighter => fighter.stunFrames)).toEqual([12, 12]);
      expect(fighters.every(fighter => fighter.stunKind === 'hit' && !fighter.moveId && fighter.moveFrame === 0)).toBe(true);
      continue;
    }
    expect(fighters.map(fighter => fighter.moveFrame)).toEqual([1, 1]);
    expect(fighters.find(fighter => fighter.id === player)!.moveId).toBe('jab');
    const opponent = fighters.find(fighter => fighter.id !== player)!;
    expect(definition.config.moves.find(move => move.id === opponent.moveId)!.damage).toBeGreaterThan(0);
    // The independent-input test below fixes both commands to jab.
  }
});

test('a real local AI techs a player grab during commitment and reproduces through checkpoint restore', async () => {
  for (const difficulty of [6, 9]) {
    const f = await combatMotionFixture({ match: true });
    const definition = f.project.extensions.hyperfocusCombat;
    definition.interactions = { weapons: [], grappleTechFrames: 12 };definition.match!.difficulty = difficulty;
    const runtime = await createHyperfocus3DRuntime(f.project, f.assets), game = createGameplay3D({ project: f.project, runtime });
    const saved = game.snapshot();saved.combat!.match = { ...saved.combat!.match!, phase: 'fighting', ticks: 0, held: [] };
    game.restore(saved);game.step(['a:interact']);
    expect(game.snapshot().combat!.interactions!.grapples).toHaveLength(1);
    const checkpoint = game.checkpoint();
    const run = () => { for (let i = 0; i < 12; i++) game.step([]);return game.snapshot(); };
    const after = run();
    expect(after.combat!.interactions!.trace.some(event => event.kind === 'grapple-tech' && event.actor === 'b')).toBe(true);
    expect(after.combat!.state.fighters[1]!.health).toBe(100);
    checkpoint.restore();expect(run()).toEqual(after);
  }
});

test('independent network input seats share grab-tech recovery and the same buffered first action', async () => {
  for (const attacker of [0, 1]) for (const buffer of [0, 1, 4]) {
    const f = await combatMotionFixture();
    const definition = f.project.extensions.hyperfocusCombat;definition.interactions = { weapons: [], grappleTechFrames: 12 };
    const runtime = await createHyperfocus3DRuntime(f.project, f.assets), game = createGameplay3D({ project: f.project, runtime, independentCombatInputs: true });
    const step = (a: string[] = [], b: string[] = []) => game.step([], [a, b].map(actions => ({ actions: new Set(actions), direction: { x: 0, y: 0, z: 0 } })));
    for (let tick = 0; tick < 30; tick++) step();
    step(attacker === 0 ? ['interact'] : [], attacker === 1 ? ['interact'] : []);
    step(attacker === 1 ? ['interact'] : [], attacker === 0 ? ['interact'] : []);
    expect(game.snapshot().combat!.state.fighters.map(fighter => fighter.stunFrames)).toEqual([11, 11]);
    while (game.snapshot().combat!.state.fighters[0]!.stunFrames > buffer) step();
    const checkpoint = game.checkpoint();
    const run = () => { step(['jab'], ['jab']);for (let tick = 0; tick < buffer; tick++) step();return game.snapshot(); };
    const after = run();expect(after.combat!.state.fighters.map(fighter => [fighter.moveId, fighter.moveFrame])).toEqual([['jab', 1], ['jab', 1]]);
    checkpoint.restore();expect(run()).toEqual(after);
  }
});
