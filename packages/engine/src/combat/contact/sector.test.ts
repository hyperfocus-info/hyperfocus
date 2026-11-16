import { expect, test } from 'bun:test';
import { createCombatPreset } from '../config.ts';
import { readCombatConfig } from '../read.ts';
import { createCombatSimulation } from '../simulation.ts';

function fixture(x: number, z: number, y = 0, arc: number | null = 60) {
  const config = createCombatPreset(), move = config.moves[0]!;
  config.hurtRadius = .1;
  Object.assign(move, { reach: 2.4, hitRadius: .25, hitHeight: .2, startupFrames: 1, activeFrames: 4, impulse: 0, cancels: [] });
  if (arc !== null) move.hitArcDegrees = arc;
  const sim = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 0, z: 0 }, facing: { x: 1, y: 0, z: 0 } },
    { id: 'b', position: { x, y, z }, facing: { x: -x, y: 0, z: -z } }] });
  return { config, sim, start: () => sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }] }) };
}

test('sector attacks reach the lateral edge and near origin, while rejecting behind, beyond range and outside the rounded cone', () => {
  for (const angle of [0, 29, -29]) {
    const f = fixture(2 * Math.cos(angle * Math.PI / 180), 2 * Math.sin(angle * Math.PI / 180));
    f.start();expect(f.sim.step()[0]?.kind).toBe('hit');
  }
  const near = fixture(.4, .15);near.start();expect(near.sim.step()[0]?.kind).toBe('hit');
  for (const [x, z] of [[-1, 0], [2.51, 0], [1.7, 1.2], [0, 1.2]]) {
    const f = fixture(x!, z!);f.start();expect(f.sim.step()).toHaveLength(0);
  }
  // A hurt sphere can overlap the edge while its center sits slightly outside.
  const edge = fixture(2 * Math.cos(32 * Math.PI / 180), 2 * Math.sin(32 * Math.PI / 180));
  edge.start();expect(edge.sim.step()[0]?.kind).toBe('hit');
});

test('sector vertical thickness and upper extension reject above/below contacts without widening horizontal range', () => {
  for (const [y, hit] of [[.54, true], [.56, false], [-.34, true], [-.36, false]] as const) {
    const f = fixture(1.5, .5, y);f.start();expect(f.sim.step().length > 0).toBe(hit);
  }
});

test('sector contacts use ordinary block/parry and one contact per target, with host obstruction', () => {
  for (const fresh of [false, true]) {
    const f = fixture(1.7, .8), state = f.sim.capture();
    state.frame = 100;state.fighters[1]!.guarding = true;state.fighters[1]!.guardStarted = fresh ? 100 : 0;
    f.sim.restore({ snapshot: state });
    f.sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }, { fighterId: 'b', guard: true }] });
    expect(f.sim.step({ inputs: [{ fighterId: 'b', guard: true }] })[0]?.kind).toBe(fresh ? 'parry' : 'block');
    expect(f.sim.step({ inputs: [{ fighterId: 'b', guard: true }] })).toHaveLength(0);
  }
  const f = fixture(1.7, .8);f.start();const saved = f.sim.capture();
  expect(f.sim.step({ attackVisibility: () => false })).toHaveLength(0);
  f.sim.restore({ snapshot: saved });expect(f.sim.step({ attackVisibility: () => true })[0]?.kind).toBe('hit');
});

test('authored sectors roundtrip, per-fighter angle/reach overrides are deterministic and invalid values fail before mutation', () => {
  const f = fixture(1.7, .8);expect(readCombatConfig(f.config)).toEqual(f.config);
  f.start();const saved = f.sim.capture();
  expect(f.sim.step({ attackArcDegrees: { a: 10 } })).toHaveLength(0);
  f.sim.restore({ snapshot: saved });const hit = f.sim.step({ attackArcDegrees: { a: 90 } });expect(hit[0]?.kind).toBe('hit');
  f.sim.restore({ snapshot: saved });expect(f.sim.step({ attackArcDegrees: { a: 90 } })).toEqual(hit);
  f.sim.restore({ snapshot: saved });expect(f.sim.step({ attackReachScales: { a: .5 } })).toHaveLength(0);
  for (const arc of [0, -1, 181, Infinity]) {
    const invalid = structuredClone(f.config);invalid.moves[0]!.hitArcDegrees = arc;expect(() => readCombatConfig(invalid)).toThrow();
    const before = f.sim.capture();expect(() => f.sim.step({ attackArcDegrees: { a: arc } })).toThrow();expect(f.sim.capture()).toEqual(before);
  }
});

test('omitted sector angle preserves the existing tip capsule, including optional host visibility behavior', () => {
  const f = fixture(1.7, .8, 0, null);f.start();expect(f.sim.step()).toHaveLength(0);
  const g = fixture(2.4, 0, 0, null);g.start();expect(g.sim.step({ attackVisibility: () => false })[0]?.kind).toBe('hit');
});
