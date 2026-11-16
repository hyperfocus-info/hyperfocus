import { expect, test } from 'bun:test';
import { createCombatSimulation } from './simulation.ts';
import { createTouchOfDeathPreset } from './touch-of-death.ts';

const config = createTouchOfDeathPreset();
const make = () => createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 0, z: 0 }, facing: { x: 1, y: 0, z: 0 } }] });

test('attack startup, active and recovery reject implicit special escape, guard, surface tech and unrelated attacks', () => {
  for (const id of ['jab', 'heavy', 'dash-jab-toward']) {
    const move = config.moves.find(entry => entry.id === id)!;
    for (const frame of [1, move.startupFrames, move.startupFrames + move.activeFrames + 8]) for (const pressed of [['evade'], ['heavy'], []]) {
      const sim = make(), saved = sim.capture();saved.frame = 100;Object.assign(saved.fighters[0]!, { moveId: id, moveFrame: frame, attackSerial: 1 });sim.restore({ snapshot: saved });
      sim.step({ inputs: [{ fighterId: 'a', pressed, guard: true, tech: true, locomotionCost: 12 }] });
      expect(sim.inspect().fighters[0]).toMatchObject({ moveId: id, attackSerial: 1, techWindowFrames: 0, locomotionAllowed: false });
    }
  }
});

test('stun blocks offense and locomotion while hitstun alone accepts surface recovery', () => {
  for (const kind of ['hit', 'block', 'parry'] as const) {
    const sim = make(), saved = sim.capture();saved.frame = 100;Object.assign(saved.fighters[0]!, { stunKind: kind, stunFrames: 20 });sim.restore({ snapshot: saved });
    sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'], guard: true, tech: true, locomotionCost: 12 }] });
    expect(sim.inspect().fighters[0]).toMatchObject({ moveId: '', attackSerial: 0, locomotionAllowed: false });
    expect(sim.inspect().fighters[0]!.techWindowFrames > 0).toBe(kind === 'hit');
  }
});

test('explicit link, startup feint and once-per-round armored escape retain their legal exceptions', () => {
  for (const [source, target] of [['jab', 'jab-link'], ['heavy', 'feint']] as const) {
    const move = config.moves.find(entry => entry.id === source)!, window = move.cancels.find(entry => entry.moveId === target)!;
    const sim = make(), saved = sim.capture();saved.frame = 100;Object.assign(saved.fighters[0]!, { moveId: source, moveFrame: window.fromFrame, attackSerial: 1, hitConfirmed: source === 'jab' });sim.restore({ snapshot: saved });
    sim.step({ inputs: [{ fighterId: 'a', pressed: config.moves.find(entry => entry.id === target)!.command }] });expect(sim.inspect().fighters[0]!.moveId).toBe(target);
  }
  const sim = make(), saved = sim.capture();saved.frame = 100;Object.assign(saved.fighters[0]!, { stunKind: 'hit', stunFrames: 20 });sim.restore({ snapshot: saved });
  const escape = config.moves.find(move => move.armoredEscape)!;sim.step({ inputs: [{ fighterId: 'a', pressed: escape.command }] });expect(sim.inspect().fighters[0]!.moveId).toBe(escape.id);expect(sim.inspect().fighters[0]!.escapeCharges).toBe(0);
});

test('an unused armored escape charge can interrupt recovery without hitstun', () => {
  const heavy = config.moves.find(move => move.id === 'heavy')!;
  const escape = config.moves.find(move => move.armoredEscape)!;
  for (const charges of [0, 1]) {
    const sim = make(), saved = sim.capture();saved.frame = 100;
    Object.assign(saved.fighters[0]!, { moveId: heavy.id, moveFrame: heavy.startupFrames + heavy.activeFrames, attackSerial: 1, escapeCharges: charges, stunKind: '', stunFrames: 0 });
    sim.restore({ snapshot: saved });
    sim.step({ inputs: [{ fighterId: 'a', pressed: escape.command }] });
    expect(sim.inspect().fighters[0]).toMatchObject({ moveId: charges ? escape.id : heavy.id, attackSerial: charges ? 2 : 1, escapeCharges: 0, stunFrames: 0 });
  }
});



test('guard input never blocks actual contacts during attack commitment or hitstun', () => {
  for (const attacking of [true, false]) {
    const sim = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 0, z: 0 }, facing: { x: 1, y: 0, z: 0 } }, { id: 'b', position: { x: 1, y: 0, z: 0 }, facing: { x: -1, y: 0, z: 0 } }] });
    const saved = sim.capture();saved.frame = 100;Object.assign(saved.fighters[0]!, { moveId: 'jab', moveFrame: config.moves.find(move => move.id === 'jab')!.startupFrames });
    if (attacking) Object.assign(saved.fighters[1]!, { moveId: 'heavy', moveFrame: 1 });else Object.assign(saved.fighters[1]!, { stunKind: 'hit', stunFrames: 12 });
    sim.restore({ snapshot: saved });expect(sim.step({ inputs: [{ fighterId: 'b', guard: true }], contacts: [{ attackerId: 'a', targetId: 'b' }] })[0]!.kind).toBe('hit');
  }
});
