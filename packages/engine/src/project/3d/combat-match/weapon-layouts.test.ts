import { expect, test } from 'bun:test';
import { createCombatProject3D } from '../combat-declaration.ts';
import { combatWeaponLayout, readCombatWeaponLayouts } from './weapon-layouts.ts';

test('district selections vary independently of ten fighter starts and every consecutive match', () => {
  const definition = createCombatProject3D();
  definition.weaponLayouts = Array.from({ length: 5 }, (_, district) => ({ id: `district-${district}`, variants: Array.from({ length: 3 }, (_, variant) => ({ id: `variant-${variant}`, props: [{ entityId: `weapon-${district}-${variant}`, position: [district, 0, variant] }] })) }));
  const sequences = new Set<string>();
  for (let seed = 0; seed < 300; seed++) {
    const selected = combatWeaponLayout(definition, seed)!;
    expect(combatWeaponLayout(definition, seed)).toEqual(selected);
    expect(selected.active.size).toBe(5);
    const next = combatWeaponLayout(definition, seed + 1)!;
    for (const prop of selected.props) expect(next.active.has(prop.entityId)).toBe(false);
    sequences.add(selected.props.map(prop => prop.entityId).join(','));
  }
  expect(sequences.size).toBeGreaterThan(30);
  expect(combatWeaponLayout(definition, 0)).not.toEqual(combatWeaponLayout(definition, 10));
  for (const seed of [4294967294, 4294967295]) expect(combatWeaponLayout(definition, seed)!.props).toHaveLength(5);
});

test('portable layout validation rejects unknown weapons, district aliasing and invalid positions', () => {
  const valid: NonNullable<ReturnType<typeof readCombatWeaponLayouts>> = [{ id: 'market', variants: [{ id: 'service', props: [{ entityId: 'glass', position: [0, .15, 2] }] }] }];
  expect(readCombatWeaponLayouts(valid, ['glass'])).toEqual(valid);
  expect(readCombatWeaponLayouts([], [])).toBeUndefined();
  expect(readCombatWeaponLayouts([{ id: 'market', variants: [{ id: 'empty', props: [] }] }], [])).toEqual([{ id: 'market', variants: [{ id: 'empty', props: [] }] }]);
  expect(() => readCombatWeaponLayouts(valid, [])).toThrow();
  expect(() => readCombatWeaponLayouts([...valid, { ...valid[0], id: 'utility' }], ['glass'])).toThrow();
  expect(() => readCombatWeaponLayouts([{ id: 'market', variants: [{ id: 'service', props: [{ entityId: 'glass', position: [NaN, 0, 2] }] }] }], ['glass'])).toThrow();
});
