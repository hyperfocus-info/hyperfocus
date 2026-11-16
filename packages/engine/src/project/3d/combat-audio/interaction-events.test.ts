import { expect, test } from 'bun:test';
import { createCombatPreset } from '../../../combat/config.ts';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createCombatInteractions } from '../combat-interaction/session.ts';
import type { CombatInteractions } from '../combat-interaction/config.ts';

test('loose and thrown material drops emit only on physical terrain contact and retain checkpoint parity', () => {
  const config = createCombatPreset(), state = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }, { id: 'b', position: { x: 20, y: 1, z: 0 } }] }).capture();
  const session = createCombatInteractions({ config, definition: { weapons: [{ entityId: 'wood', material: 'wood', durability: 30, length: 1, lightMoveId: 'jab', heavyMoveId: 'heavy' }] }, positions: new Map([['wood', { x: 0, y: 2, z: 0 }]]), fighterIds: ['a', 'b'], surface: (from, to) => from.y >= 0 && to.y <= 0 ? { id: 'floor', position: { x: to.x, y: 0, z: to.z }, normal: { x: 0, y: 1, z: 0 } } : undefined });
  const saved = session.capture();
  const fall = () => {
    const heard: string[] = [];
    for (let frame = 1; frame <= 90; frame++) { state.frame = frame;session.before(state, []);session.after(state, [], []);heard.push(...session.transitions.filter(event => event.kind === 'weapon-dropped').map(event => `${event.frame}:${event.target}`)); }
    return heard;
  };
  const first = fall();expect(first).toHaveLength(1);const final = session.capture();session.restore(saved);expect(fall()).toEqual(first);expect(session.capture()).toEqual(final);
  const thrown = session.capture();thrown.weapons[0]!.position.y = .01;thrown.weapons[0]!.projectileOwner = 'a';thrown.weapons[0]!.velocity.y = -1;session.restore(thrown);
  session.before(state, []);session.after(state, [], []);expect(session.transitions.filter(event => event.kind === 'weapon-dropped')).toHaveLength(1);
  session.before(state, []);session.after(state, [], []);expect(session.transitions.filter(event => event.kind === 'weapon-dropped')).toHaveLength(0);
});

test('ground kit emits deployment only when the validated visible zone is created, after consumption', () => {
  for (const airborne of [false, true]) {
    const config = createCombatPreset(), state = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }] }).capture();
    config.moves.push({ ...config.moves[0]!, id: 'ground', command: ['ground'], damage: 0, impulse: 0, startupFrames: 2 });
    const weapon: CombatInteractions['weapons'][number] = { entityId: 'tool', material: 'metal', durability: 30, length: 1, lightMoveId: 'ground', heavyMoveId: 'ground', kit: 'ground', effect: { durationFrames: 20, movementScale: .4, radius: 1 } };
    const session = createCombatInteractions({ config, definition: { weapons: [weapon] }, positions: new Map([['tool', { x: 0, y: 0, z: 0 }]]), fighterIds: ['a'] });
    const saved = session.capture();saved.weapons[0]!.owner = 'a';session.restore(saved);
    const actor = state.fighters[0]!;actor.wasAirborne = airborne;actor.attackSerial = 1;actor.moveId = 'ground';actor.moveFrame = 1;
    session.before(state, []);session.after(state, [], []);expect(session.transitions.map(event => event.kind)).toEqual(['weapon-consumed']);
    actor.moveFrame = 3;state.frame++;
    const checkpoint = session.capture();session.before(state, []);session.after(state, [], []);
    const events = structuredClone(session.transitions);expect(events.map(event => event.kind)).toEqual(airborne ? [] : ['weapon-deployed']);
    const after = session.capture();session.restore(checkpoint);session.before(state, []);session.after(state, [], []);expect(session.transitions).toEqual(events);expect(session.capture()).toEqual(after);
  }
});
