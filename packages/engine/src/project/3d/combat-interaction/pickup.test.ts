import { expect, test } from 'bun:test';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import { createRigidWorld3D } from '../../../physics/rigid-3d.ts';
import { createCombatInteractions } from './session.ts';
import { createWeaponSurfaceProbe } from './surfaces.ts';

function fixture(position = { x: 1.75, y: .15, z: 0 }, surface?: Parameters<typeof createCombatInteractions>[0]['surface'], restPose?: 'upright' | 'flat') {
  const config = { ...createTouchOfDeathPreset(), hurtRadius: 1 };
  const state = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }, { id: 'b', position: { x: 10, y: 1, z: 0 } }] }).capture();
  const interactions = createCombatInteractions({ config, fighterIds: ['a', 'b'], positions: new Map([['tool', position]]), surface,
    definition: { grappleRange: 1.8, weapons: [{ entityId: 'tool', material: 'wood', durability: 48, length: 2.2, lightMoveId: 'jab', heavyMoveId: 'heavy', ...(restPose ? { restPose } : {}) }] } });
  return { state, interactions };
}

test('floor-height pickups use bounded planar reach and a forgiving front aim cone', () => {
  for (const angle of [0, 72]) {
    const { state, interactions } = fixture();
    const direction = { x: Math.cos(angle * Math.PI / 180), y: 0, z: Math.sin(angle * Math.PI / 180) };
    expect(interactions.selectedTarget(state, 'a', direction)).toBe('tool');
    expect(interactions.aiPress(state, 'a', 'b', false, direction)).toBe(true);
    interactions.before(state, [{ fighterId: 'a', pressed: ['interact'], direction }]);
    expect(interactions.capture().weapons[0]!.owner).toBe('a');
  }
  for (const position of [{ x: 2.91, y: .15, z: 0 }, { x: 1, y: 3, z: 0 }, { x: -2.5, y: .15, z: 0 }]) {
    const { state, interactions } = fixture(position);
    expect(interactions.selectedTarget(state, 'a')).toBeUndefined();
    expect(interactions.aiPress(state, 'a', 'b')).toBe(false);
  }
});

test('standing over a tool remains selectable while a clearly aimed opponent wins', () => {
  const { state, interactions } = fixture({ x: 0, y: .15, z: 0 });
  expect(interactions.selectedTarget(state, 'a')).toBe('tool');
  state.fighters[1]!.position.x = 2;
  expect(interactions.selectedTarget(state, 'a', { x: 1, y: 0, z: 0 })).toBe('b');
  interactions.before(state, [{ fighterId: 'a', pressed: ['interact'], direction: { x: 0, y: 0, z: -1 } }]);
  expect(interactions.capture().weapons[0]!.owner).toBe('a');
});

test('either visible end and nearby sideways shafts are reachable without precise center aim', () => {
  for (const position of [{ x: 2.85, y: .15, z: 0 }, { x: -.6, y: .15, z: .8 }, { x: 0, y: .15, z: -1 }]) {
    const { state, interactions } = fixture(position);
    expect(interactions.selectedTarget(state, 'a')).toBe('tool');
    interactions.before(state, [{ fighterId: 'a', pressed: ['interact'] }]);
    expect(interactions.capture().weapons[0]!.owner).toBe('a');
  }
});

test('AI aims at a reachable tool using the same input instead of repeatedly whiffing behind itself', () => {
  const { state, interactions } = fixture({ x: -2.5, y: .15, z: 0 });
  expect(interactions.aiPress(state, 'a', 'b')).toBe(false);
  const direction = interactions.aiPickupDirection(state, 'a', 'b')!;
  expect(direction.x).toBe(-1);
  expect(interactions.aiPress(state, 'a', 'b', false, direction)).toBe(true);
  interactions.before(state, [{ fighterId: 'a', pressed: ['interact'], direction }]);
  expect(interactions.capture().weapons[0]!.owner).toBe('a');
  expect(interactions.capture().trace.some(event => event.kind === 'grapple-whiff')).toBe(false);
});

test('a resting floor contact permits pickup but an intervening wall blocks both controllers', () => {
  const world = createRigidWorld3D({ capacity: 2, gravityY: 0 });
  world.addBody({ id: 'floor', type: 'static', y: -.5, shape: { kind: 'box', halfX: 10, halfY: .5, halfZ: 10 } });
  const ids = ['floor', 'wall'], probe = createWeaponSurfaceProbe(world, ids);
  const { state, interactions } = fixture({ x: 1.4, y: .065, z: 0 }, probe);
  expect(interactions.selectedTarget(state, 'a')).toBe('tool');
  world.addBody({ id: 'wall', type: 'static', x: 1.35, y: 1, shape: { kind: 'box', halfX: .015, halfY: 1, halfZ: 1 } });
  expect(interactions.selectedTarget(state, 'a')).toBeUndefined();
  expect(interactions.aiPickupDirection(state, 'a', 'b')).toBeUndefined();
  expect(interactions.aiPress(state, 'a', 'b')).toBe(false);
  interactions.before(state, [{ fighterId: 'a', pressed: ['interact'] }]);
  expect(interactions.capture().weapons[0]!.owner).toBe('');
  expect(interactions.capture().trace.at(-1)?.kind).toBe('grapple-obstructed');
});


test('item preference can decline a pickup without removing held throws or guard grabs', () => {
  const { state, interactions } = fixture();
  expect(interactions.aiPress(state, 'a', 'b', false, { x: 1, y: 0, z: 0 }, false)).toBe(false);
  interactions.before(state, [{ fighterId: 'a', pressed: ['interact'], direction: { x: 1, y: 0, z: 0 } }]);
  state.fighters[1]!.position.x = 5;
  expect(interactions.aiPress(state, 'a', 'b', false, undefined, false)).toBe(true);
  const other = fixture({ x: 20, y: 0, z: 0 });
  other.state.fighters[1]!.position.x = 1;
  other.state.fighters[1]!.guarding = true;
  expect(other.interactions.aiPress(other.state, 'a', 'b', false, undefined, false)).toBe(true);
});

test('support-plane tabletop objects remain reachable across their support while walls still block them', () => {
  const world = createRigidWorld3D({ capacity: 2, gravityY: 0 });
  world.addBody({ id: 'table', type: 'static', x: 1.4, y: .465, shape: { kind: 'box', halfX: .5, halfY: .465, halfZ: 1 } });
  const probe = createWeaponSurfaceProbe(world, ['table', 'wall']);
  const { state, interactions } = fixture({ x: 1.4, y: .93, z: 0 }, probe, 'upright');
  expect(interactions.selectedTarget(state, 'a', { x: 1, y: 0, z: 0 })).toBe('tool');
  world.addBody({ id: 'wall', type: 'static', x: .7, y: 1, shape: { kind: 'box', halfX: .015, halfY: 1, halfZ: 1 } });
  expect(interactions.selectedTarget(state, 'a', { x: 1, y: 0, z: 0 })).toBeUndefined();
  expect(interactions.aiPickupDirection(state, 'a', 'b')).toBeUndefined();
});
