import { expect, test } from 'bun:test';
import { createCombatSimulation } from '../simulation.ts';

const fighters = [{ id: 'a', position: { x: 0, y: 0, z: 0 } }, { id: 'b', position: { x: 1, y: 0, z: 0 } }];

test('combat captures detach every nested container and retain optional history fields', () => {
  const simulation = createCombatSimulation({ fighters }), initial = simulation.capture();
  const fighter = initial.fighters[0]!;
  fighter.hitTargets.push('b');fighter.history.push({ key: 'jab', frame: 0, direction: 'neutral', side: 1, dashing: true, drive: false, airborne: false });
  simulation.restore({ snapshot: initial });
  const before = simulation.capture(), detached = simulation.capture();
  expect(detached).toEqual(structuredClone(before));
  const changed = detached.fighters[0]!;
  changed.position.x = 100;changed.facing.z = 100;changed.influenceDirection.x = 100;changed.techDirection.y = 100;
  changed.hitTargets.push('a');changed.history[0]!.key = 'heavy';changed.history.push({ ...changed.history[0]!, frame: 1 });
  changed.health = 0;detached.fighters.reverse();detached.frame = 100;detached.configKey = 'changed';
  expect(simulation.capture()).toEqual(before);
  initial.fighters[0]!.history[0]!.key = 'external';expect(simulation.capture()).toEqual(before);
});

test('detached captures and JSON restore preserve future events and complete snapshots', () => {
  const original = createCombatSimulation({ fighters }), restored = createCombatSimulation({ fighters });
  for (let frame = 0; frame < 360; frame++) {
    const inputs = [{ fighterId: 'a', pressed: frame % 30 === 0 ? ['jab'] : [], guard: frame % 80 < 15 }, { fighterId: 'b', guard: frame % 70 < 20 }];
    const events = original.step({ inputs });
    if (frame === 90) restored.restore({ snapshot: JSON.parse(JSON.stringify(original.capture())) });
    else if (frame > 90) expect(restored.step({ inputs })).toEqual(events);
    if (frame >= 90) expect(restored.capture()).toEqual(original.capture());
    const snapshot = original.capture();expect(snapshot).toEqual(structuredClone(snapshot));
  }
});
