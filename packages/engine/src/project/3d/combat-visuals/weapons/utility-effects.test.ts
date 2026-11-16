import { expect, test } from 'bun:test';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import { createCombatPreset } from '../../../../combat/config.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../../frame/3d.ts';
import { createCombatInteractions } from '../../combat-interaction/session.ts';
import type { CombatInteractions } from '../../combat-interaction/config.ts';
import { presentWeaponUtilities } from './utility-effects.ts';

test('utility cues use declared assets, stay within capacity and reproduce from portable state', () => {
  const config = createCombatPreset(), simulation = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }] });
  const definition: CombatInteractions = { weapons: [{ entityId: 'tool', kit: 'spray', material: 'metal', length: .5, durability: 20, ammo: 2, lightMoveId: 'jab', heavyMoveId: 'heavy' }] };
  const state = createCombatInteractions({ config, definition, positions: new Map([['tool', { x: 0, y: .15, z: 0 }]]), fighterIds: ['a'] }).capture();
  state.weapons[0]!.owner = 'a';state.trace.push({ frame: 0, kind: 'weapon-sprayed', actor: 'a', target: 'tool', value: 1 });
  state.zones = [{ id: 'patch', weaponId: 'tool', position: { x: 2, y: 0, z: 0 }, radius: 1, remaining: 30, movementScale: .5 }];
  const combat = simulation.capture();combat.fighters[0]!.moveId = 'heavy';combat.fighters[0]!.moveFrame = 1;
  const frame: Hyperfocus3DEvaluatedFrame = { sceneId: 'arena', frameIndex: 0, timeSeconds: 0, tick: 0, deterministicSeed: 0,
    camera: { position: [0, 3, 5], target: [0, 0, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 },
    entities: [], materials: [], performances: [], poseCorrections: [], ikCorrections: [], socketAttachments: [], contacts: [], physicalBodies: [], physicalBreaks: [], audioEvents: [], effects: [], lights: [], renderGraph: { tier: 'gameplay', shadows: false, exposure: 1 }, localProgress: 0 };
  const options: Parameters<typeof presentWeaponUtilities>[0] = { frame, state, combat, definition, capacity: 4, entities: [{ id: 'tool:effect', meshId: 'foam-mesh', materialId: 'foam', position: [0, 0, 0], scale: [0, 0, 0], rotationY: 0 }] };
  const before = structuredClone(state);presentWeaponUtilities(options);
  expect(frame.effects.flatMap(effect => effect.particles)).toHaveLength(4);
  expect(frame.effects.every(effect => effect.meshId === 'foam-mesh' && effect.materialId === 'foam')).toBe(true);
  expect(frame.effects[0]!.particles[0]!.position).toEqual([2, .025, 0]);
  const visible = structuredClone(frame.effects);presentWeaponUtilities(options);expect(frame.effects).toEqual(visible);expect(state).toEqual(before);
  combat.frame = 15;state.zones = [];presentWeaponUtilities(options);expect(frame.effects).toHaveLength(0);
});
