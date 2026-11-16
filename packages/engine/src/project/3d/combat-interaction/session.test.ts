import { describe, expect, test } from 'bun:test';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createCombatPreset } from '../../../combat/config.ts';
import type { CombatEvent, CombatInput } from '../../../combat/state.ts';
import { createCombatInteractions } from './session.ts';

function setup(weapons = false) {
  const config = createCombatPreset();
  const simulation = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }, { id: 'b', position: { x: 1, y: 1, z: 0 }, facing: { x: -1, y: 0, z: 0 } }] });
  const interaction = createCombatInteractions({ config, fighterIds: ['a', 'b'], positions: new Map([['staff', { x: 0, y: 1, z: 1 }]]), definition: { grappleTechFrames: 2, weapons: weapons ? [{ entityId: 'staff', material: 'wood', durability: 30, length: 2, lightMoveId: config.moves[0]!.id, heavyMoveId: config.moves[1]!.id }] : [] } });
  const state = simulation.capture();
  return { interaction, state };
}
describe('physical interactions', () => {
  test('held throws aim at the opponent despite opposite stick and facing, from either seat', () => {
    for (const seat of [0, 1]) {
      const { interaction, state } = setup(true), actor = state.fighters[seat]!, target = state.fighters[1 - seat]!;
      target.position = { x: actor.position.x + 4, y: 3, z: actor.position.z };
      actor.facing = { x: -1, y: 0, z: 0 };
      const saved = interaction.capture();saved.weapons[0]!.owner = actor.id;interaction.restore(saved);
      interaction.before(state, [{ fighterId: actor.id, pressed: ['interact'], direction: { x: -1, y: 0, z: 0 } }]);
      const item = interaction.capture().weapons[0]!;
      expect(item.velocity.x).toBeGreaterThan(0);expect(item.velocity.y).toBeGreaterThan(1);expect(item.projectileOwner).toBe(actor.id);
    }
  });
  test('a nearby off-axis tool does not mislabel an aimed out-of-range grab as facing away', () => {
    const { interaction, state } = setup(true);state.fighters[1]!.position.x = 10;
    const saved = interaction.capture();saved.weapons[0]!.position = { x: -1, y: 1, z: -1.5 };interaction.restore(saved);
    interaction.before(state, [{ fighterId: 'a', pressed: ['interact'], direction: { x: 1, y: 0, z: 0 } }]);
    expect(interaction.capture().trace.at(-1)?.kind).toBe('grapple-out-of-range');
  });
  test('an empty-space grab commits a visible aimed attempt and cannot cancel immediately into a strike', () => {
    const { interaction, state } = setup();state.fighters[1]!.position.x = 20;
    const input: CombatInput = { fighterId: 'a', pressed: ['interact', 'jab'], direction: { x: 0, y: 0, z: -1 } };
    interaction.before(state, [input]);
    expect(state.fighters[0]!.stunFrames).toBe(18);expect(input.pressed).toEqual([]);
    const attempt = interaction.capture().trace.find(event => event.kind === 'grapple-whiff')!;
    expect(Math.abs(attempt.value)).toBeCloseTo(Math.PI);expect(interaction.capture().grapples).toHaveLength(0);
    const saved = interaction.validate(interaction.capture());interaction.reset();interaction.restore(saved);
    expect(interaction.capture().trace).toContainEqual(attempt);
    interaction.before(state, [{ fighterId: 'a', pressed: ['interact'] }]);
    expect(interaction.capture().trace.at(-1)?.kind).toBe('interaction-recovering');
  });
  test('grapple beats guard and a fresh interaction tech prevents throw', () => {
    const { interaction, state } = setup();state.fighters[1]!.guarding = true;
    interaction.before(state, [{ fighterId: 'a', pressed: ['interact'] }]);
    expect(interaction.capture().grapples.length).toBe(1);
    const events = interaction.before(state, [{ fighterId: 'b', pressed: ['interact'] }]);
    expect(events[0]?.kind).toBe('tech');expect(state.fighters[1]!.health).toBe(100);
    expect(interaction.capture().grapples).toHaveLength(0);
  });
  test('missed grapple tech creates surface-recoverable hitstun', () => {
    const { interaction, state } = setup();interaction.before(state, [{ fighterId: 'a', pressed: ['interact'] }]);
    interaction.before(state, []);const events = interaction.before(state, []);
    expect(events[0]?.damage).toBe(4);expect(events[0]?.impulse.x).toBe(0);expect(events[0]?.impulse.y).toBe(4);
    expect(events[0]?.hitstunFrames).toBe(36);
    expect(state.fighters[1]!.stunKind).toBe('hit');
  });
  test('stick chooses pickup over facing opponent and held input always throws', () => {
    const { interaction, state } = setup(true);
    interaction.before(state, [{ fighterId: 'a', pressed: ['interact'], direction: { x: 0, y: 0, z: 1 } }]);
    expect(interaction.capture().weapons[0]!.owner).toBe('a');
    interaction.before(state, [{ fighterId: 'a', pressed: ['interact'], direction: { x: 1, y: 0, z: 0 } }]);
    expect(interaction.capture().weapons[0]!.projectileOwner).toBe('a');expect(interaction.capture().grapples).toHaveLength(0);
  });
  test('fresh frontal parry deflects a thrown item and rollback retains ownership', () => {
    const { interaction, state } = setup(true);
    interaction.before(state, [{ fighterId: 'a', pressed: ['interact'], direction: { x: 0, y: 0, z: 1 } }]);
    interaction.before(state, [{ fighterId: 'a', pressed: ['interact'] }]);
    state.fighters[1]!.guarding = true;
    const input: CombatInput[] = [{ fighterId: 'b', guard: true, guardFresh: true }];
    const events: CombatEvent[] = [];interaction.after(state, input, events);interaction.after(state, input, events);
    expect(events.find(event => event.kind === 'parry')?.hitstunFrames).toBeUndefined();
    expect(interaction.capture().weapons[0]!.projectileOwner).toBe('b');
    const saved = interaction.validate(interaction.capture());interaction.reset();interaction.restore(saved);
    expect(interaction.capture().weapons[0]!.projectileOwner).toBe('b');
  });
  test('a thrown item interrupts an unguarded charging attack through ordinary hitstun', () => {
    const { interaction, state } = setup(true);
    interaction.before(state, [{ fighterId: 'a', pressed: ['interact'], direction: { x: 0, y: 0, z: 1 } }]);
    interaction.before(state, [{ fighterId: 'a', pressed: ['interact'] }]);
    Object.assign(state.fighters[1]!, { moveId: 'heavy', moveFrame: 2, charging: true });
    const events: CombatEvent[] = [];interaction.after(state, [], events);interaction.after(state, [], events);
    expect(events.find(event => event.kind === 'hit')?.hitstunFrames).toBe(18);
    expect(state.fighters[1]).toMatchObject({ health: 92, moveId: '', charging: false, stunKind: 'hit', stunFrames: 18 });
  });
  test('metal contact shortens a held wooden weapon and changes actual reach', () => {
    const config = createCombatPreset();
    const simulation = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }, { id: 'b', position: { x: 1, y: 1, z: 0 } }] });
    const interaction = createCombatInteractions({ config, fighterIds: ['a', 'b'], positions: new Map(['blade', 'staff'].map(id => [id, { x: 0, y: 1, z: 0 }])), definition: { weapons: ['blade', 'staff'].map((entityId, index) => ({ entityId, material: index ? 'wood' : 'metal', durability: 40, length: 2, lightMoveId: config.moves[0]!.id, heavyMoveId: config.moves[1]!.id })) } });
    const save = interaction.capture();save.weapons[0]!.owner = 'a';save.weapons[1]!.owner = 'b';interaction.restore(save);
    const state = simulation.capture(), health = state.fighters[1]!.health;
    const contact = { id: 'contact', frame: 0, attackerId: 'a', targetId: 'b', moveId: config.moves[0]!.id, kind: 'block' as const, damage: 1, impulse: { x: 0, y: 0, z: 0 } };
    interaction.after(state, [], [contact]);
    expect(interaction.capture().weapons[1]!.length).toBe(1);
    expect(interaction.capture().weapons[1]!.durability).toBe(28);
    expect(state.fighters[1]!.health).toBeLessThan(health);
    expect(interaction.reachScales(state, [])["b"]).toBe(1);
  });
  test('malformed state cannot restore forged attacks or trace', () => {
    const { interaction } = setup(true), saved = interaction.capture();saved.lastAttacks.intruder = 3;
    expect(() => interaction.validate(saved)).toThrow();
  });
});
