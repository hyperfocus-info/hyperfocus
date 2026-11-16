import { expect, test } from 'bun:test';
import { createCombatPreset } from '../../../../combat/config.ts';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import type { CombatInput } from '../../../../combat/state.ts';
import { readCombatInteractions, type CombatInteractions } from '../config.ts';
import { createCombatInteractions } from '../session.ts';
import { synthesizeWeaponAttacks } from './attacks.ts';
import { createTouchOfDeathPreset } from '../../../../combat/touch-of-death.ts';
import { readCombatConfig } from '../../../../combat/read.ts';

function fixture(kit: NonNullable<CombatInteractions['weapons'][number]['kit']>, targetX = 20, ammo = 2) {
  const config = createCombatPreset();
  for (const [id, source] of [['tool-light', 'jab'], ['tool-heavy', 'heavy']] as const) {
    const base = config.moves.find(move => move.id === source)!;
    config.moves.push({ ...structuredClone(base), id, command: [id], startupFrames: 2, activeFrames: 2, recoveryFrames: 8,
      reach: 2, hitArcDegrees: kit === 'spray' && source === 'heavy' ? 60 : undefined, damage: kit === 'ground' ? 0 : 1, impulse: 0, hitstunFrames: kit === 'ground' ? 0 : 4, cancels: [] });
  }
  const weapon: CombatInteractions['weapons'][number] = { entityId: 'tool', material: 'metal', name: 'Tool', durability: 30, length: .6, lightMoveId: 'tool-light', heavyMoveId: 'tool-heavy', kit,
    ...(['ground', 'spray'].includes(kit) ? { effect: { durationFrames: 20, movementScale: .4, radius: 1.2, range: 2, arcDegrees: 65 } } : {}), ...(kit === 'spray' ? { ammo } : {}) };
  const simulation = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }, { id: 'b', position: { x: targetX, y: 1, z: 0 }, facing: { x: -1, y: 0, z: 0 } }] });
  const session = createCombatInteractions({ config, fighterIds: ['a', 'b'], positions: new Map([['tool', { x: 0, y: 1, z: 0 }]]), definition: { weapons: [weapon] } });
  const save = session.capture();save.weapons[0]!.owner = 'a';session.restore(save);
  const step = (pressed: string[] = [], target?: Partial<CombatInput>) => {
    const inputs: CombatInput[] = [{ fighterId: 'a', pressed, direction: { x: 1, y: 0, z: 0 }, held: pressed }, { fighterId: 'b', ...target }];
    const before = simulation.capture();session.before(before, inputs);simulation.restore({ snapshot: before });
    const events = simulation.step({ inputs, attackReachScales: session.reachScales(before, inputs), attackArcDegrees: session.arcDegrees(before, inputs), attackVisibility: session.attackVisibility });
    const after = simulation.capture();session.after(after, inputs, events);simulation.restore({ snapshot: after });
    return { state: simulation.capture(), interaction: session.capture(), events };
  };
  return { config, weapon, session, simulation, step };
}

test('single-use light and heavy consume exactly one attempted strike, including misses, without cancelling recovery or buffering a punch', () => {
  for (const command of ['jab', 'heavy']) {
    const f = fixture('single-use'), before = { combat: f.simulation.capture(), interactions: f.session.capture() };
    const first = f.step([command]);
    expect(first.state.fighters[0]!.moveId).toBe('tool-light');
    expect(first.interaction.weapons[0]).toMatchObject({ durability: 0, owner: 'a', spentSerial: 1 });
    expect(() => f.session.validate(first.interaction)).not.toThrow();
    for (let i = 0; i < 8; i++) {
      const next = f.step(['jab', 'heavy', 'interact']);
      expect(next.state.fighters[0]!.moveId).toBe('tool-light');
      expect(next.state.fighters[0]!.attackSerial).toBe(1);
    }
    f.simulation.restore({ snapshot: before.combat });f.session.restore(before.interactions);
    expect(f.step([command])).toEqual(first);
    for (let i = 0; i < 20; i++) f.step();
    expect(f.session.capture().weapons[0]).toMatchObject({ owner: '', durability: 0 });
    expect(f.step(['jab']).state.fighters[0]!.moveId).toBe('jab');
  }
});

test('spray uses finite ammo, slows only landed contacts without periodic stun, then heavy becomes the bash', () => {
  const f = fixture('spray', 1, 1), first = f.step(['heavy']);
  expect(first.interaction.weapons[0]).toMatchObject({ ammo: 0, durability: 30 });
  let contact = first;
  for (let i = 0; i < 3; i++) contact = f.step();
  expect(contact.interaction.slows).toHaveLength(1);
  expect(f.session.movementScales(contact.state, new Set(['a', 'b'])).get('b')).toBe(.4);
  const checkpoint = { combat: f.simulation.capture(), interactions: f.session.capture() };
  let after = contact;
  for (let i = 0; i < 9; i++) after = f.step();
  expect(after.state.fighters[1]!.stunFrames).toBe(0);
  expect(after.state.fighters[1]!.health).toBe(99);
  f.simulation.restore({ snapshot: checkpoint.combat });f.session.restore(checkpoint.interactions);
  for (let i = 0; i < 9; i++) contact = f.step();
  expect(contact).toEqual(after);
  expect(f.step(['heavy']).state.fighters[0]!.moveId).toBe('tool-light');
});

test('spent fragile props announce one real contact for fracture audio and stay quiet on a whiff', () => {
  for (const targetX of [2, 20]) {
    const f = fixture('single-use', targetX);f.weapon.acousticProfile = 'glass';
    f.step(['jab']);expect(f.session.transitions.some(event => event.kind === 'weapon-contact')).toBe(false);
    let contacts = 0;
    for (let tick = 0; tick < 12; tick++) { f.step();contacts += f.session.transitions.filter(event => event.kind === 'weapon-contact').length; }
    expect(contacts).toBe(targetX === 2 ? 1 : 0);
  }
});

test('blocked or parried spray does not apply movement restriction', () => {
  for (const fresh of [false, true]) {
    const f = fixture('spray', 1), state = f.simulation.capture();
    state.frame = 100;state.fighters[1]!.guarding = true;state.fighters[1]!.guardStarted = fresh ? 100 : 0;
    f.simulation.restore({ snapshot: state });
    f.step(['heavy'], { guard: true });
    for (let i = 0; i < 4; i++) f.step([], { guard: true });
    expect(f.session.capture().slows).toHaveLength(0);
  }
});

test('a held spray effect angle/range authoritatively select actual cone contacts and the same movement restriction', () => {
  for (const [degrees, hit] of [[10, false], [90, true]] as const) {
    const f = fixture('spray', 1.5), state = f.simulation.capture();state.fighters[1]!.position.z = .8;f.simulation.restore({ snapshot: state });
    f.weapon.effect!.arcDegrees = degrees;
    const result = f.step(['heavy']);
    expect(result.interaction.weapons[0]!.ammo).toBe(1);
    let after = result;for (let i = 0; i < 3; i++) after = f.step();
    expect(after.state.fighters[1]!.health < 100).toBe(hit);
    expect(after.interaction.slows?.length ?? 0).toBe(hit ? 1 : 0);
  }
  const short = fixture('spray', 1.7);short.weapon.effect!.range = .5;
  short.step(['heavy']);for (let i = 0; i < 3; i++) short.step();
  expect(short.simulation.capture().fighters[1]!.health).toBe(100);
});

test('ground deployment creates one saved shared zone, jumping bypasses it and it expires exactly', () => {
  const f = fixture('ground', 1);
  f.step(['heavy']);f.step();const deployed = f.step();
  expect(deployed.interaction.zones).toHaveLength(1);
  expect(deployed.interaction.weapons[0]!.durability).toBe(0);
  expect(deployed.state.fighters[1]!.health).toBe(100);
  expect(f.session.movementScales(deployed.state, new Set(['a', 'b']))).toEqual(new Map([['a', .4], ['b', .4]]));
  expect(f.session.movementScales(deployed.state, new Set(['a']))).toEqual(new Map([['a', .4]]));
  const save = f.session.validate(deployed.interaction);f.session.reset();f.session.restore(save);
  expect(f.session.capture()).toEqual(deployed.interaction);
  for (let i = 0; i < 19; i++) f.step();
  expect(f.session.capture().zones).toHaveLength(1);
  f.step();expect(f.session.capture().zones).toHaveLength(0);
});

test('inactive layouts cannot be picked up, and reset changes availability without manufacturing breakage', () => {
  const f = fixture('simple');
  f.session.reset(undefined, new Set());
  expect(f.session.selectedTarget(f.simulation.capture(), 'a', { x: 1, y: 0, z: 0 })).toBeUndefined();
  expect(f.session.capture().weapons[0]).toMatchObject({ active: false, durability: 30 });
  f.session.reset(undefined, new Set(['tool']));
  expect(f.session.selectedTarget(f.simulation.capture(), 'a', { x: 1, y: 0, z: 0 })).toBe('tool');
});

test('utility declarations and snapshots reject forged ammo, lifetimes and movement effects', () => {
  const f = fixture('spray');expect(readCombatInteractions({ weapons: [f.weapon] })!.weapons[0]).toEqual(f.weapon);
  for (const ammo of [-1, 0, 1.5, 121]) expect(() => readCombatInteractions({ weapons: [{ ...f.weapon, ammo }] })).toThrow();
  const save = f.session.capture();save.weapons[0]!.ammo = 3;expect(() => f.session.validate(save)).toThrow();
  save.weapons[0]!.ammo = 1;save.slows = [{ fighterId: 'b', weaponId: 'tool', remaining: 21, movementScale: .4 }];
  expect(() => f.session.validate(save)).toThrow();
});

test('explicit combat kits preserve primary fast/flurry tuning and validate scaled directional cancel windows', () => {
  const config = createTouchOfDeathPreset(), jab = config.moves.find(move => move.id === 'jab')!, heavy = config.moves.find(move => move.id === 'heavy')!;
  config.moves.push({ ...structuredClone(jab), id: 'fast-light', command: ['fast-light'], startupFrames: 2, activeFrames: 7, recoveryFrames: 8, hitstunFrames: 5, strikeFrames: [0, 3, 6], cancels: [] },
    { ...structuredClone(heavy), id: 'fast-heavy', command: ['fast-heavy'], startupFrames: 4, activeFrames: 2, recoveryFrames: 8, cancels: [] });
  const weapon = { lightMoveId: 'fast-light', heavyMoveId: 'fast-heavy', length: 1, kit: 'combat' as const };
  synthesizeWeaponAttacks({ config, weapons: [weapon] });
  expect(config.moves.find(move => move.id === 'fast-light')).toMatchObject({ startupFrames: 2, activeFrames: 7, recoveryFrames: 8, hitstunFrames: 5, strikeFrames: [0, 3, 6] });
  expect(() => readCombatConfig(config)).not.toThrow();
  const before = structuredClone(config);synthesizeWeaponAttacks({ config, weapons: [weapon] });expect(config).toEqual(before);
});
