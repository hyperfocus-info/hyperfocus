import { expect, test } from 'bun:test';
import type { AppearanceCatalog3D } from '@hyperfocus/engine/project/runtime-3d';
import { clothPalette, migrateCosmeticPalette } from './palette.ts';

test('upgrade removes only generated placeholder colors and preserves custom palette edits', () => {
  const catalog: AppearanceCatalog3D = { version: 1, actors: [{ entityId: 'actor' }], slots: ['top', 'bottom', 'shoes'].map(role => ({ id: `${role}-color`, label: role, defaultOptionId: 'teal', options: [
    { id: 'teal', label: 'Lagoon', colors: [{ materialSuffix: `:appearance:${role}`, baseColor: [.08,.66,.7,1] }] },
    { id: 'red', label: 'My red', colors: [{ materialSuffix: `:appearance:${role}`, baseColor: [.6,.23,.2,1] }] },
  ] })) };
  migrateCosmeticPalette(catalog);
  expect(catalog.slots[0]!.options[0]!.colors![0]!.baseColor).toEqual(clothPalette[0]![2]);
  expect(catalog.slots[1]!.options[0]!.colors![0]!.baseColor[1]).toBeLessThan(catalog.slots[0]!.options[0]!.colors![0]!.baseColor[1]);
  for (const slot of catalog.slots) expect(slot.options[1]!.colors![0]!.baseColor).toEqual([.6,.23,.2,1]);
  const migrated = structuredClone(catalog);migrateCosmeticPalette(catalog);expect(catalog).toEqual(migrated);
});

test('new swatches extend all four clothing slots exactly once and retain authored overrides', () => {
  const catalog: AppearanceCatalog3D = { version: 1, actors: [{ entityId: 'actor' }], slots: ['top', 'bottom', 'shoes', 'belt'].map(role => ({ id: `${role}-color`, label: role, defaultOptionId: 'teal', options: [
    { id: 'teal', label: 'Lagoon', colors: [{ materialSuffix: `:appearance:${role}`, baseColor: [.12,.38,.43,1] }] },
  ] })) };
  migrateCosmeticPalette(catalog);
  expect(catalog.slots.flatMap(slot => slot.options)).toHaveLength(28);
  for (const slot of catalog.slots) expect(slot.options.slice(1).map(option => option.id)).toEqual(['slate', 'moss', 'clay', 'plum', 'cobalt', 'ash']);
  catalog.slots[0]!.options[1]!.colors![0]!.baseColor = [.11,.22,.33,1];
  const authored = structuredClone(catalog);migrateCosmeticPalette(catalog);expect(catalog).toEqual(authored);
});
