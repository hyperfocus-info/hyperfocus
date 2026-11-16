import { expect, test } from 'bun:test';
import { createCombatPreset } from '../../../combat/config.ts';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createCombatInteractions } from './session.ts';
import type { CombatEvent } from '../../../combat/state.ts';
import { readCombatInteractions } from './config.ts';

test('interaction hitstun tuning roundtrips and rejects fractional or invalid frames', () => {
  const definition = { weapons: [], grappleHitstunFrames: 47, projectileHitstunFrames: 23 };
  expect(readCombatInteractions(definition)).toEqual(definition);
  for (const key of ['grappleHitstunFrames', 'projectileHitstunFrames']) for (const value of [0, -1, 1.5, Infinity, 121]) expect(() => readCombatInteractions({ ...definition, [key]: value })).toThrow();
});

function fixture() {
  const config = createCombatPreset();
  const sim = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }, { id: 'b', position: { x: 1, y: 1, z: 0 }, facing: { x: -1, y: 0, z: 0 } }] });
  const session = createCombatInteractions({ config, fighterIds: ['a', 'b'], positions: new Map([['staff', { x: 1, y: 1, z: 0 }]]), definition: { grappleTechFrames: 2, weapons: [{ entityId: 'staff', material: 'wood', durability: 40, length: 2, lightMoveId: config.moves[0]!.id, heavyMoveId: config.moves[1]!.id }] } });
  return { config, sim, session, state: sim.capture() };
}
test('stick picks weapon opposite facing; holding interaction cannot tech a later grapple', () => {
  const { session, state } = fixture();
  state.fighters[0]!.facing = { x: -1, y: 0, z: 0 };state.fighters[1]!.position.z = 1;
  session.before(state, [{ fighterId: 'a', pressed: ['interact'], direction: { x: 1, y: 0, z: 0 } }]);
  expect(session.capture().weapons[0]!.owner).toBe('a');
  session.reset();state.fighters[0]!.facing.x = 1;state.fighters[1]!.position.z = 0;
  const memory = session.capture();memory.weapons[0]!.position.x = 8;session.restore(memory);
  state.fighters[1]!.techHeld = true;
  session.before(state, [{ fighterId: 'a', pressed: ['interact'] }]);
  session.before(state, [{ fighterId: 'b', tech: true }]);
  const events = session.before(state, [{ fighterId: 'b', tech: true }]);
  expect(events[0]?.kind).toBe('hit');
});
test('throw hitstun reaches the existing surface tech and missed tech bounce rules', () => {
  for (const tech of [true, false]) {
    const { session, sim, state } = fixture();
    const memory = session.capture();memory.weapons[0]!.position.x = 8;session.restore(memory);
    session.before(state, [{ fighterId: 'a', pressed: ['interact'] }]);session.before(state, []);session.before(state, []);
    sim.restore({ snapshot: state });
    const events = sim.step({ inputs: [{ fighterId: 'b', tech }], collisions: [{ fighterId: 'b', normal: { x: -1, y: 0, z: 0 }, impulse: 6 }] });
    expect(events.some(event => event.kind === (tech ? 'tech' : 'bounce'))).toBe(true);
    expect(sim.capture().fighters[1]!.stunFrames === 0).toBe(tech);
  }
});
test('heavy attacks wear more than light; any confirmed contact adds wear', () => {
  const amounts: number[] = [];
  for (const heavy of [false, true]) for (const contact of [false, true]) {
    const { config, session, state } = fixture();
    const memory = session.capture();memory.weapons[0]!.owner = 'a';session.restore(memory);
    const actor = state.fighters[0]!;actor.moveId = config.moves[heavy ? 1 : 0]!.id;actor.attackSerial = 1;
    const events: CombatEvent[] = contact ? [{ id: 'hit', frame: 0, attackerId: 'a', targetId: 'b', moveId: actor.moveId, kind: 'hit', damage: 3, impulse: { x: 0, y: 0, z: 0 } }] : [];
    session.after(state, [], events);amounts.push(40 - session.capture().weapons[0]!.durability);
  }
  expect(amounts).toEqual([1, 4, 5, 8]);
});
test('projectile fresh-press window expires into chip block at the exact boundary', () => {
  for (const age of [0, 2, 3]) {
    const { config, session, state } = fixture();config.parryFrames = 3;
    const memory = session.capture(), item = memory.weapons[0]!;
    item.position = { x: .5, y: 1, z: 0 };item.projectileOwner = 'a';item.velocity = { x: 18, y: 0, z: 0 };session.restore(memory);
    const defender = state.fighters[1]!;defender.guarding = true;defender.guardStarted = 0;state.frame = age + 1;
    const events: CombatEvent[] = [];session.after(state, [{ fighterId: 'b', guard: true, guardFresh: false }], events);
    expect(events[0]?.kind).toBe(age < 3 ? 'parry' : 'block');
    expect(events[0]?.damage).toBe(age < 3 ? .8 : 2);
  }
});
test('weapon snapshot rejects empty vectors, dual ownership, bad serials and forged grapple vectors', () => {
  const { session } = fixture();
  for (const patch of [{ position: {} }, { velocity: { x: 0, y: 0 } }, { owner: 'a', projectileOwner: 'b' }, { serial: -1 }]) {
    const memory = session.capture();Object.assign(memory.weapons[0]!, patch);expect(() => session.validate(memory)).toThrow();
  }
  const memory = session.capture();memory.grapples.push({ attacker: 'a', target: 'b', remaining: 2, direction: { x: 8, y: 0, z: 0 } });expect(() => session.validate(memory)).toThrow();
});
test('same-material clashes wear both weapons without shortening them', () => {
  const { config, state } = fixture();
  const session = createCombatInteractions({ config, fighterIds: ['a', 'b'], positions: new Map(['one', 'two'].map(id => [id, { x: 0, y: 1, z: 0 }])), definition: { weapons: ['one', 'two'].map(entityId => ({ entityId, material: 'wood', durability: 40, length: 2, lightMoveId: config.moves[0]!.id, heavyMoveId: config.moves[1]!.id })) } });
  const memory = session.capture();memory.weapons[0]!.owner = 'a';memory.weapons[1]!.owner = 'b';session.restore(memory);
  session.after(state, [], [{ id: 'clash', frame: 0, attackerId: 'a', targetId: 'b', moveId: config.moves[0]!.id, kind: 'block', damage: 0, impulse: { x: 0, y: 0, z: 0 } }]);
  expect(session.capture().weapons.map(item => [item.length, item.durability])).toEqual([[2, 37], [2, 37]]);
});
test('projectile parry restores the same defender resources and followup window as melee', () => {
  const { config, session, state } = fixture();
  config.maxStamina = 100;config.maxGuard = 100;config.parryStaminaRestore = 12;config.parryGuardRestore = .25;config.parryFollowupFrames = 18;
  const memory = session.capture(), item = memory.weapons[0]!;
  item.position = { x: .5, y: 1, z: 0 };item.projectileOwner = 'a';item.velocity = { x: 18, y: 0, z: 0 };session.restore(memory);
  const defender = state.fighters[1]!;defender.guarding = true;defender.guardStarted = 0;defender.stamina = 20;defender.guardMeter = 40;state.frame = 1;
  session.after(state, [], []);
  expect([defender.stamina, defender.guardMeter, defender.followupFrames]).toEqual([32, 65, 18]);
});
