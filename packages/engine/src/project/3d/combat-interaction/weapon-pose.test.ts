import { expect, test } from 'bun:test';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { createCombatPreset } from '../../../combat/config.ts';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createCombatInteractions } from './session.ts';
import { createCombatInteractionPresenter, presentCombatInteractions } from './presentation.ts';
import { createCombatRoundRecovery3D } from '../combat-visuals/round-recovery.ts';
import { heldWeaponPose } from './weapon-pose.ts';
import { readCombatInteractions } from './config.ts';

function fixture() {
  const config = createCombatPreset(), combat = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }] }).capture();
  const definition = { weapons: [{ entityId: 'tool', material: 'wood' as const, durability: 40, length: 2, lightMoveId: config.moves[0]!.id, heavyMoveId: config.moves[1]!.id }] };
  const interaction = createCombatInteractions({ config, definition, fighterIds: ['a'], positions: new Map([['tool', { x: 0, y: 1, z: 0 }]]) });
  const state = interaction.capture();state.weapons[0]!.owner = 'a';
  const frame: Hyperfocus3DEvaluatedFrame = {
    sceneId: 'arena', frameIndex: 0, timeSeconds: 0, tick: 0, deterministicSeed: 0,
    camera: { position: [0, 2, 10], target: [0, 0, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 },
    entities: ['a', 'a:head', 'a:left-hand', 'a:right-hand', 'a:left-arm', 'a:right-arm', 'a:left-forearm', 'a:right-forearm', 'tool', ...[0, 1, 2].flatMap(index => [`tool:wear:${index}`, `tool:fragment:${index}`])].map(id => ({ id, position: [0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true })),
    materials: [], performances: [], poseCorrections: [], ikCorrections: [], socketAttachments: [], contacts: [], physicalBodies: [], physicalBreaks: [], audioEvents: [], effects: [], lights: [], renderGraph: { tier: 'gameplay', shadows: false, exposure: 1 }, localProgress: 0,
  };
  return { config, combat, definition, state, frame };
}

test('bound interaction presentation preserves attack, break and recovery poses without visiting scenery', () => {
  const { config, combat, definition, state, frame } = fixture();
  const irrelevant = { ...structuredClone(frame.entities[0]!), id: 'scenery' };
  frame.entities.push(irrelevant);
  const present = createCombatInteractionPresenter({ entities: frame.entities, fighterIds: ['a'], definition });
  for (const phase of ['attack', 'broken', 'recovery'] as const) {
    const full = structuredClone(frame), selected = structuredClone(frame);
    if (phase === 'attack') { combat.fighters[0]!.moveId = config.moves[0]!.id;combat.fighters[0]!.moveFrame = config.moves[0]!.startupFrames; }
    if (phase === 'broken') { state.weapons[0]!.durability = 0;state.weapons[0]!.owner = '';state.trace.push({ kind: 'weapon-broken', frame: 0, actor: 'a', target: 'tool', value: 0, position: { x: 0, y: 1, z: 0 } });combat.frame = 10; }
    if (phase === 'recovery') { state.weapons[0]!.durability = 40;state.weapons[0]!.owner = 'a';full.entities.reverse();selected.entities.reverse(); }
    const before = structuredClone({ state, combat });
    presentCombatInteractions(full, state, combat, config, definition, phase === 'recovery');
    present(selected, state, combat, config, phase === 'recovery');
    expect(selected).toEqual(full);expect({ state, combat }).toEqual(before);
  }
  present(frame, state, combat, config);
  Object.defineProperty(irrelevant, 'position', { get() { throw Error('Unrelated scenery pose read'); } });
  Object.defineProperty(irrelevant, 'id', { get() { throw Error('Unrelated scenery identity read'); } });
  expect(() => present(frame, state, combat, config)).not.toThrow();
});

test('light thrust and heavy overhead swing move the held shaft and both gripping hands', () => {
  for (const heavy of [false, true]) {
    const { config, combat, definition, state, frame } = fixture(), actor = combat.fighters[0]!, move = config.moves[heavy ? 1 : 0]!;
    actor.moveId = move.id;actor.moveFrame = Math.max(1, move.startupFrames - 4);
    presentCombatInteractions(frame, state, combat, config, definition);
    const chamber = structuredClone(frame.entities);
    actor.moveFrame = move.startupFrames;
    presentCombatInteractions(frame, state, combat, config, definition);
    expect(frame.entities.find(entity => entity.id === 'tool')!.position).not.toEqual(chamber.find(entity => entity.id === 'tool')!.position);
    for (const side of ['left', 'right']) expect(frame.entities.find(entity => entity.id === `a:${side}-hand`)!.position).not.toEqual(chamber.find(entity => entity.id === `a:${side}-hand`)!.position);
  }
});

test('weapon role attacks put the tool tip inside the actual enlarged or rising contact volume', () => {
  const { config, combat, definition, state, frame } = fixture(), fighter = combat.fighters[0]!, item = state.weapons[0]!;
  for (const pose of ['jolt', 'hook', 'uppercut', 'body-blows', 'retreat-jab'] as const) {
    const move = { ...config.moves[0]!, id: `weapon-${pose}`, weaponAttack: 'light' as const, weaponBaseMoveId: definition.weapons[0]!.lightMoveId, pose, startupFrames: 2, activeFrames: 5, recoveryFrames: 12, reach: 3, hitRadius: 1.2, hitHeight: pose === 'uppercut' ? 2 : 0 };
    config.moves.push(move);fighter.moveId = move.id;fighter.facing = { x: 1, y: 0, z: 0 };
    for (let index = 0; index < move.activeFrames; index++) {
      fighter.moveFrame = move.startupFrames + index;
      const [start, end] = heldWeaponPose(frame, item, fighter, config, definition.weapons[0]);
      const y = Math.max(fighter.position.y, Math.min(fighter.position.y + move.hitHeight, end[1]));
      expect(Math.hypot(end[0] - fighter.position.x - move.reach, end[1] - y, end[2] - fighter.position.z)).toBeLessThanOrEqual(move.hitRadius);
      expect(Math.hypot(...end.map((value, i) => value - start[i]!))).toBeCloseTo(item.length);
      const grip = frame.entities.find(entity => entity.id === 'a:right-hand')!.position;
      expect(Math.hypot(...grip.map((value, i) => value - start[i]!))).toBeCloseTo(.4);
    }
  }
});

test('held item follows the continuously blended terminal victory without replacing hands or combat state', () => {
  for (const style of ['fists-up', 'salute', 'bow'] as const) {
    const { config, combat, definition, state, frame } = fixture();
    const before = structuredClone({ combat, state }), base = structuredClone(frame), present = createCombatRoundRecovery3D();
    let previous: number[] | undefined;
    for (let elapsed = 0; elapsed <= 30; elapsed++) {
      const fresh = structuredClone(base);
      presentCombatInteractions(fresh, state, combat, config, definition);
      const baselineWeapon = structuredClone(fresh.entities.find(entity => entity.id === 'tool')!);
      present({ frame: fresh, state: combat, ticks: 180 - elapsed, winnerId: 'a', targets: new Map(), poses: [{ actorId: 'a', phase: 'victory', style }], celebrate: true, allowRecovery: false });
      const actorParts = structuredClone(fresh.entities.filter(entity => entity.id.startsWith('a:')));
      presentCombatInteractions(fresh, state, combat, config, definition, true);
      expect(fresh.entities.filter(entity => entity.id.startsWith('a:'))).toEqual(actorParts);
      const tool = fresh.entities.find(entity => entity.id === 'tool')!, hand = fresh.entities.find(entity => entity.id === 'a:right-hand')!;
      const [x, y, z, w] = tool.rotation, axis = [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
      for (let i = 0; i < 3; i++) expect(tool.position[i]! - axis[i]! * (state.weapons[0]!.length / 2 - .4)).toBeCloseTo(hand.position[i]!, 8);
      if (previous) expect(Math.hypot(...tool.position.map((value, index) => value - previous![index]!))).toBeLessThan(.06);
      else for (let i = 0; i < 3; i++) expect(tool.position[i]).toBeCloseTo(baselineWeapon.position[i]!, 8);
      previous = [...tool.position];
      if (elapsed === 30 && style !== 'bow') expect(hand.position[1]).toBeGreaterThan(1.8);
    }
    expect({ combat, state }).toEqual(before);
  }
});

test('damaged tools show scars, broken tools stay hidden, and splinters stay at the saved impact', () => {
  const { config, combat, definition, state, frame } = fixture();
  state.weapons[0]!.durability = 12;
  presentCombatInteractions(frame, state, combat, config, definition);
  expect(frame.entities.filter(entity => entity.id.includes(':wear:') && entity.visible)).toHaveLength(3);
  state.weapons[0]!.durability = 0;state.weapons[0]!.owner = '';
  state.trace.push({ kind: 'weapon-broken', frame: 0, actor: 'a', target: 'tool', value: 0, position: { x: 0, y: 1, z: 0 } });combat.frame = 10;
  presentCombatInteractions(frame, state, combat, config, definition);
  expect(frame.entities.find(entity => entity.id === 'tool')!.visible).toBe(false);
  expect(frame.entities.filter(entity => entity.id.includes(':wear:') && entity.visible)).toHaveLength(0);
  const splinters = structuredClone(frame.entities.filter(entity => entity.id.includes(':fragment:')));
  state.weapons[0]!.position.x = 50;
  presentCombatInteractions(frame, state, combat, config, definition);
  expect(frame.entities.filter(entity => entity.id.includes(':fragment:'))).toEqual(splinters);
  combat.frame = 46;presentCombatInteractions(frame, state, combat, config, definition);
  expect(frame.entities.filter(entity => entity.id.includes(':fragment:') && entity.visible)).toHaveLength(0);
});

test('portable resting poses keep stock and dropped props above floor and table support without changing state', () => {
  for (const restPose of ['upright', 'flat'] as const) for (const supportY of [0, .93, 6]) for (const serial of [0, 1]) {
    const { config, combat, definition, state, frame } = fixture(), item = state.weapons[0]!;
    const authored = { ...definition, weapons: definition.weapons.map(weapon => ({ ...weapon, restPose, name: 'Test prop' })) };
    item.owner = '';item.position = { x: 2, y: supportY, z: 3 };item.serial = serial;
    item.terrainContact = { ...item.position };
    const entity = frame.entities.find(entity => entity.id === item.id)!;
    entity.scale = [.12, 1, .08];
    const before = structuredClone({ combat, state });
    presentCombatInteractions(frame, state, combat, config, authored);
    const [x, y, z, w] = entity.rotation;
    const verticalExtent = Math.abs(2 * (x * y + z * w)) * entity.scale[0]
      + Math.abs(1 - 2 * (x * x + z * z)) * entity.scale[1] + Math.abs(2 * (y * z - x * w)) * entity.scale[2];
    expect(entity.position[1] - verticalExtent).toBeCloseTo(supportY, 6);
    expect(entity.position[0]).toBeCloseTo(item.position.x, 6);expect(entity.position[2]).toBeCloseTo(item.position.z, 6);
    expect(restPose === 'upright' ? Math.abs(1 - 2 * (x * x + z * z)) : Math.abs(2 * (x * y - z * w))).toBeCloseTo(1, 6);
    if (restPose === 'flat') expect(2 * (y * z - x * w)).toBeCloseTo(1, 6);
    const once = structuredClone(entity);presentCombatInteractions(frame, state, combat, config, authored);expect(entity).toEqual(once);
    expect({ combat, state }).toEqual(before);
    expect(readCombatInteractions(JSON.parse(JSON.stringify(authored)))!.weapons[0]!.restPose).toBe(restPose);
  }
});

test('resting pose never changes held or thrown presentation and rejects unknown authoring values', () => {
  for (const restPose of ['upright', 'flat'] as const) for (const held of [false, true]) {
    const { config, combat, definition, state, frame } = fixture();
    const legacy = { ...definition, weapons: definition.weapons.map(weapon => ({ ...weapon, name: 'Test prop' })) };
    const authored = { ...legacy, weapons: legacy.weapons.map(weapon => ({ ...weapon, restPose })) };
    if (!held) { state.weapons[0]!.owner = '';state.weapons[0]!.projectileOwner = 'a';state.weapons[0]!.velocity = { x: 8, y: 2, z: -3 }; }
    const previous = structuredClone(frame), next = structuredClone(frame);
    presentCombatInteractions(previous, state, combat, config, legacy);presentCombatInteractions(next, state, combat, config, authored);
    expect(next).toEqual(previous);
    expect(() => readCombatInteractions({ weapons: [{ ...legacy.weapons[0], restPose: 'sideways' }] })).toThrow('Invalid weapon resting pose');
  }
});
