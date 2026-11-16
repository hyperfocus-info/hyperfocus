import { expect, test } from 'bun:test';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import { combatPresentation3D } from '../combat-presentation.ts';
import { readGameplayPresentation3D } from '../gameplay-contracts.ts';
import type { CombatProject3D } from '../combat-declaration.ts';

test('HUD exposes stamina and timed string opportunities without duplicate variant buttons', () => {
  const config = createTouchOfDeathPreset();
  const definition: CombatProject3D = { version: 1, config, fighters: [{ entityId: 'a', control: 'player', actionPrefix: 'a:' }, { entityId: 'b', control: 'dummy', actionPrefix: 'b:' }] };
  const simulation = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 0, z: 0 } }, { id: 'b', position: { x: 1, y: 0, z: 0 } }] });
  const present = () => readGameplayPresentation3D(combatPresentation3D({ state: simulation.capture(), definition }));
  simulation.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }] });
  expect(present().status).toContain('winding up');
  expect(present().status).not.toContain('Follow up');
  const jab = config.moves.find(move => move.id === 'jab')!;
  const links = jab.cancels.filter(link => !config.moves.find(move => move.id === link.moveId)?.special);
  expect(links.length).toBeGreaterThan(0);
  const opening = Math.min(...links.map(link => link.fromFrame)), closing = Math.max(...links.map(link => link.toFrame));
  const advanceTo = (moveFrame: number) => {
    const current = simulation.capture().fighters[0]!.moveFrame;
    for (let frame = current; frame < moveFrame; frame++) simulation.step();
    expect(simulation.capture().fighters[0]!.moveFrame).toBe(moveFrame);
  };
  advanceTo(opening - 1);expect(present().status).not.toContain('Follow up');
  advanceTo(opening);expect(simulation.capture().fighters[0]!.hitConfirmed).toBe(true);expect(present().status).toContain('Follow up now');
  advanceTo(closing);expect(present().status).toContain('Follow up now');
  const hud = present();
  expect(hud.status).toContain('Follow up now');
  expect(hud.metrics?.filter(metric => metric.label.includes('stamina'))).toHaveLength(2);
  expect(new Set(hud.actions?.map(action => action.action)).size).toBe(hud.actions?.length ?? 0);
  expect(hud.actions?.find(action => action.action === 'a:drive')?.held).toBe(true);
  advanceTo(closing + 1);expect(present().status).not.toContain('Follow up');
  expect(present().status).toContain('recovering');
});

test('HUD never advertises a confirmed-hit continuation during actual whiff recovery', () => {
  const config = createTouchOfDeathPreset(), jab = config.moves.find(move => move.id === 'jab')!;
  const definition: CombatProject3D = { version: 1, config, fighters: [{ entityId: 'a', control: 'player', actionPrefix: 'a:' }, { entityId: 'b', control: 'dummy', actionPrefix: 'b:' }] };
  const simulation = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 0, z: 0 } }, { id: 'b', position: { x: 20, y: 0, z: 0 } }] });
  simulation.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }] });
  for (let tick = 1; tick < jab.startupFrames + jab.activeFrames + jab.recoveryFrames; tick++) {
    simulation.step();const state = simulation.capture();
    expect(state.fighters[0]!.hitConfirmed).toBe(false);
    expect(combatPresentation3D({ state, definition }).status).not.toContain('Follow up');
  }
});
