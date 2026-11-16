import { expect, test } from 'bun:test';
import { createCombatPreset } from '../../../combat/config.ts';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import type { CombatEvent } from '../../../combat/state.ts';
import { createCombatInteractions } from './session.ts';

function fixture() {
  const config = createCombatPreset();
  const simulation = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }, { id: 'b', position: { x: 1, y: 1, z: 0 } }] });
  const definition = { grappleTechFrames: 12, weapons: [{ entityId: 'wood', material: 'wood' as const, durability: 40, length: 2, lightMoveId: config.moves[0]!.id, heavyMoveId: config.moves[1]!.id }, { entityId: 'metal', material: 'metal' as const, durability: 80, length: 2, lightMoveId: config.moves[0]!.id, heavyMoveId: config.moves[1]!.id }] };
  const session = createCombatInteractions({ config, definition, fighterIds: ['a', 'b'], positions: new Map(definition.weapons.map(weapon => [weapon.entityId, { x: 20, y: 1, z: 0 }])) });
  return { config, session, state: simulation.capture() };
}

test('human fresh grab tech works on every advertised frame, including the last', () => {
  for (let delay = 0; delay < 11; delay++) {
    const { session, state } = fixture();
    session.before(state, [{ fighterId: 'a', pressed: ['interact'] }]);
    for (let tick = 0; tick < delay; tick++) session.before(state, []);
    expect(session.techWindow('b')).toEqual({ attacker: 'a', remaining: 11 - delay, total: 12 });
    const events = session.before(state, [{ fighterId: 'b', pressed: ['interact'] }]);
    expect(events[0]?.kind).toBe('tech');expect(state.fighters[1]!.health).toBe(100);
    expect(session.techWindow('b')).toBeUndefined();
  }
});

test('an attacker cannot regrab in the same tick as a successful break or grab a thrown body', () => {
  const { session, state } = fixture();
  session.before(state, [{ fighterId: 'a', pressed: ['interact'] }]);
  session.before(state, [{ fighterId: 'a', pressed: ['interact'] }, { fighterId: 'b', pressed: ['interact'] }]);
  expect(session.capture().grapples).toHaveLength(0);
  expect(state.fighters.map(fighter => fighter.stunFrames)).toEqual([12, 12]);
  state.fighters[0]!.stunFrames = 0;state.fighters[0]!.stunKind = '';
  state.fighters[1]!.stunFrames = 36;state.fighters[1]!.stunKind = 'hit';
  session.before(state, [{ fighterId: 'a', pressed: ['interact'] }]);
  expect(session.capture().grapples).toHaveLength(0);
});

test('wood splits against metal regardless of which holder attacks; metal keeps its reach', () => {
  for (const woodAttacks of [false, true]) {
    const { config, session, state } = fixture(), saved = session.capture();
    saved.weapons[0]!.owner = 'a';saved.weapons[1]!.owner = 'b';session.restore(saved);
    session.after(state, [], [{ id: 'contact', frame: 0, attackerId: woodAttacks ? 'a' : 'b', targetId: woodAttacks ? 'b' : 'a', moveId: config.moves[0]!.id, kind: 'parry', damage: 0, impulse: { x: 0, y: 0, z: 0 } }]);
    expect(session.capture().weapons.map(item => [item.length, item.durability])).toEqual([[1, 28], [2, 77]]);
    expect(session.capture().trace.some(row => row.kind === 'weapon-shortened')).toBe(true);
  }
});

test('wear alone splits wood at half strength; metal does not split at the same wear threshold', () => {
  const { config, session, state } = fixture(), saved = session.capture();
  saved.weapons[0]!.owner = 'a';saved.weapons[0]!.durability = 21;
  saved.weapons[1]!.owner = 'b';saved.weapons[1]!.durability = 41;session.restore(saved);
  for (const fighter of state.fighters) { fighter.moveId = config.moves[1]!.id;fighter.attackSerial = 1; }
  session.after(state, [], []);
  expect(session.capture().weapons.map(item => item.length)).toEqual([1, 2]);
});

test('blocking or parrying an unarmed strike wears the held defensive tool', () => {
  for (const kind of ['block', 'parry'] as const) {
    const { config, session, state } = fixture(), saved = session.capture();saved.weapons[0]!.owner = 'b';session.restore(saved);
    session.after(state, [], [{ id: 'contact', frame: 0, attackerId: 'a', targetId: 'b', moveId: config.moves[0]!.id, kind, damage: 0, impulse: { x: 0, y: 0, z: 0 } }]);
    expect(session.capture().weapons[0]!.durability).toBe(37);
  }
});

test('weapon chip rewards a successful parry over block, cannot kill, and keeps its parry event', () => {
  for (const health of [100, 1]) for (const kind of ['block', 'parry'] as const) {
    const { config, session, state } = fixture(), saved = session.capture();saved.weapons[1]!.owner = 'a';session.restore(saved);
    state.fighters[1]!.health = health;
    const event: CombatEvent = { id: 'contact', frame: 0, attackerId: 'a', targetId: 'b', moveId: config.moves[1]!.id, kind, damage: 0, impulse: { x: 0, y: 0, z: 0 } };
    session.after(state, [], [event]);
    expect(event.kind).toBe(kind);
    expect(event.damage).toBe(health === 1 ? 0 : config.moves[1]!.damage * (kind === 'parry' ? .1 : .3));
    expect(state.fighters[1]!.health).toBeGreaterThanOrEqual(1);
  }
});

test('new match positions reseed all available weapons without retaining old ownership or wear', () => {
  const { session } = fixture(), saved = session.capture();saved.weapons[0]!.owner = 'a';saved.weapons[0]!.durability = 1;session.restore(saved);
  session.reset(new Map([['wood', { x: 5, y: 10, z: -3 }]]));
  expect(session.capture().weapons[0]).toMatchObject({ owner: '', durability: 40, position: { x: 5, y: 10, z: -3 } });
});
