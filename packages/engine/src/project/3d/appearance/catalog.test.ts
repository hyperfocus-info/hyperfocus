import { expect, test } from 'bun:test';

test('rarity is optional, bounded portable metadata and never changes resolved mechanics or patches', () => {
  const legacy = catalog();
  expect(readAppearanceCatalog3D(legacy)!.slots[0]!.options[0]!.rarity).toBeUndefined();
  for (const rarity of ['common', 'uncommon', 'rare', 'legendary'] as const) {
    const value = structuredClone(legacy);value.slots[0]!.options[0]!.rarity = rarity;
    const parsed = readAppearanceCatalog3D(value)!;expect(parsed.slots[0]!.options[0]!.rarity).toBe(rarity);
    expect(resolveAppearance3D({ catalog: parsed, actorId: 'a' })).toEqual(resolveAppearance3D({ catalog: legacy, actorId: 'a' }));
  }
  const invalid = structuredClone(legacy);Reflect.set(invalid.slots[0]!.options[0]!, 'rarity', 'mythic');expect(() => readAppearanceCatalog3D(invalid)).toThrow('rarity');
});
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { readAppearanceCatalog3D, resolveAppearance3D, type AppearanceCatalog3D } from './catalog.ts';

function catalog(): AppearanceCatalog3D {
  return { version: 1, actors: [{ entityId: 'a' }, { entityId: 'b' }], slots: [{ id: 'top', label: 'Top', defaultOptionId: 'plain', options: [
    { id: 'plain', label: 'Plain', variants: [{ entitySuffix: '', variantId: 'plain' }], colors: [{ materialSuffix: ':appearance:top', baseColor: [.2, .3, .4, 1] }] },
    { id: 'coat', label: 'Coat', variants: [{ entitySuffix: '', variantId: 'coat' }], colors: [{ materialSuffix: ':appearance:top', baseColor: [.8, .7, .6, 1] }] },
  ] }] };
}

test('cosmetic channels validate curated styles and resolve without touching other slots', () => {
  const value = catalog();
  value.slots.push({ id: 'motion', label: 'Motion', defaultOptionId: 'loose', options: [{ id: 'loose', label: 'Loose', styles: [{ channel: 'movement', style: 'loose' }] }] });
  const parsed = readAppearanceCatalog3D(value)!;
  expect(resolveAppearance3D({ catalog: parsed, actorId: 'b' }).styles).toEqual([{ actorId: 'b', channel: 'movement', style: 'loose' }]);
  for (const styles of [[{ channel: 'movement', style: 'invisible' }], [{ channel: 'damage', style: 'loose' }], [{ channel: 'movement', style: 'loose', speed: 2 }], [{ channel: 'movement', style: 'loose' }, { channel: 'movement', style: 'compact' }]]) {
    const invalid = structuredClone(value);Reflect.set(invalid.slots[1]!.options[0]!, 'styles', styles);expect(() => readAppearanceCatalog3D(invalid)).toThrow();
  }
  expect(() => readAppearanceCatalog3D({ ...value, slots: [...value.slots, { ...value.slots[1], id: 'duplicate' }] })).toThrow('conflicting');
});

test('pose-only slots resolve detached actor choices, defaults and reject conflicting or live-phase targets', () => {
  const source: AppearanceCatalog3D = { version: 1, actors: [{ entityId: 'a' }, { entityId: 'b' }], slots: [{ id: 'intro', label: 'Intro', defaultOptionId: 'classic', options: [
    { id: 'classic', label: 'Classic', poses: [{ phase: 'intro', style: 'default' }] }, { id: 'bow', label: 'Bow', poses: [{ phase: 'intro', style: 'bow' }] },
  ] }] };
  const parsed = readAppearanceCatalog3D(source)!;
  expect(resolveAppearance3D({ catalog: parsed, actorId: 'a' }).poses).toEqual([{ actorId: 'a', phase: 'intro', style: 'default' }]);
  const resolved = resolveAppearance3D({ catalog: parsed, actorId: 'b', selections: { intro: 'bow' } });
  expect(resolved.poses).toEqual([{ actorId: 'b', phase: 'intro', style: 'bow' }]);resolved.poses![0]!.style = 'salute';
  expect(source.slots[0]!.options[1]!.poses![0]!.style).toBe('bow');
  for (const poses of [[{ phase: 'fighting', style: 'bow' }], [{ phase: 'intro', style: 'unknown' }], [{ phase: 'intro', style: 'bow', position: [0, 2, 0] }], [{ phase: 'intro', style: 'bow' }, { phase: 'intro', style: 'salute' }], [{ phase: 'victory', style: 'bow' }]]) {
    const value = structuredClone(source);Reflect.set(value.slots[0]!.options[1]!, 'poses', poses);expect(() => readAppearanceCatalog3D(value)).toThrow();
  }
  expect(() => readAppearanceCatalog3D({ ...source, slots: [...source.slots, { ...source.slots[0], id: 'duplicate-target' }] })).toThrow('conflicting');
});

test('appearance accepts JSON data only without invoking accessors or inherited selections', () => {
  let reads = 0;
  const source = catalog();
  const getter = { ...source };Object.defineProperty(getter, 'slots', { enumerable: true, get() { reads++;return source.slots; } });
  const hidden = { ...source };Object.defineProperty(hidden, 'hidden', { value: true });
  for (const value of [getter, hidden, Object.assign(Object.create(source), source), { ...source, [Symbol('extra')]: true }]) expect(() => readAppearanceCatalog3D(value)).toThrow();
  for (const mutate of [(items: unknown[]) => { delete items[0]; }, (items: unknown[]) => { Object.defineProperty(items, '0', { enumerable: true, get() { reads++;return source.actors[0]; } }); }, (items: unknown[]) => { Reflect.set(items, 'extra', true); }]) {
    const value = catalog();mutate(value.actors);expect(() => readAppearanceCatalog3D(value)).toThrow();
  }
  const selections = Object.defineProperty({}, 'top', { enumerable: true, get() { reads++;return 'coat'; } });
  for (const value of [selections, Object.create({ top: 'coat' }), Object.defineProperty({}, 'top', { value: 'coat' }), { [Symbol('top')]: 'coat' }]) expect(() => resolveAppearance3D({ catalog: source, actorId: 'a', selections: value })).toThrow();
  expect(reads).toBe(0);
  expect(readAppearanceCatalog3D(Object.assign(Object.create(null), source))).toEqual(source);
  expect(resolveAppearance3D({ catalog: source, actorId: 'a', selections: Object.assign(Object.create(null), { top: 'coat' }) }).variants[0]!.variantId).toBe('coat');
  for (const id of ['__proto__', 'constructor', 'prototype']) {
    const value = catalog();value.slots[0]!.id = id;expect(() => readAppearanceCatalog3D(value)).toThrow('Reserved');
    value.slots[0]!.id = '上着';value.slots[0]!.options[0]!.id = id;expect(() => readAppearanceCatalog3D(value)).toThrow('Reserved');
  }
});
test('appearance catalog resolves defaults and selections without sharing authored arrays', () => {
  const source = catalog(), read = readAppearanceCatalog3D(source)!;
  const result = resolveAppearance3D({ catalog: read, actorId: 'a', selections: { top: 'coat' } });
  expect(result.variants).toEqual([{ entityId: 'a', variantId: 'coat' }]);expect(result.colors[0]!.materialId).toBe('a:appearance:top');
  result.colors[0]!.baseColor[0] = 0;read.slots[0]!.label = 'changed';expect(source.slots[0]!.label).toBe('Top');
  expect(source.slots[0]!.options[1]!.colors![0]!.baseColor[0]).toBe(.8);
  expect(resolveAppearance3D({ catalog: read, actorId: 'b' }).variants[0]!.variantId).toBe('plain');
  const invalid: Array<{ actorId: string; selections?: Record<string, string> }> = [{ actorId: 'unknown' }, { actorId: 'a', selections: { missing: 'coat' } }, { actorId: 'a', selections: { top: 'missing' } }];
  for (const options of invalid) expect(() => resolveAppearance3D({ catalog: read, ...options })).toThrow();
  expect(readAppearanceCatalog3D(undefined)).toBeUndefined();expect(() => readAppearanceCatalog3D(null)).toThrow();
});
test('appearance authoring rejects unknown fields, bounds, conflicting targets, unsafe colors and incomplete options', () => {
  const invalid = (mutate: (value: AppearanceCatalog3D) => void) => { const value = catalog();mutate(value);expect(() => readAppearanceCatalog3D(value)).toThrow(); };
  for (const value of [{ ...catalog(), physics: {} }, { ...catalog(), version: 2 }, { ...catalog(), actors: [] }]) expect(() => readAppearanceCatalog3D(value)).toThrow();
  invalid(value => { value.actors.push({ entityId: 'a' }); });invalid(value => { value.actors[1]!.entityId = 'a:head'; });
  invalid(value => { value.slots[0]!.defaultOptionId = 'absent'; });invalid(value => { value.slots[0]!.label = 'x'.repeat(65); });
  invalid(value => { value.slots.push({ ...value.slots[0]!, id: 'conflict' }); });
  invalid(value => { value.slots[0]!.options[1]!.variants![0]!.entitySuffix = ':head'; });
  invalid(value => { value.slots[0]!.options[0]!.colors![0]!.baseColor[0] = NaN; });
  const transparent = catalog();Reflect.set(transparent.slots[0]!.options[0]!.colors![0]!.baseColor, '3', 0);expect(() => readAppearanceCatalog3D(transparent)).toThrow('opaque');
  invalid(value => { value.slots[0]!.options = Array(33).fill(value.slots[0]!.options[0]); });
});
test('appearance references require real actor variants and opaque materials scoped to that actor', async () => {
  const fixture = await combatMotionFixture(), declaration = structuredClone(fixture.runtime.declaration);
  for (const actor of ['a', 'b']) {
    declaration.materials.push({ ...declaration.materials[0]!, id: `${actor}:appearance:top` });
    const entity = declaration.scenes[0]!.entities.find(entity => entity.id === actor)!;
    entity.variants = ['plain', 'coat'].map(id => ({ id, meshId: entity.meshId, materialId: `${actor}:appearance:top` }));
  }
  expect(readAppearanceCatalog3D(catalog(), declaration)).toEqual(catalog());
  const missing = structuredClone(declaration);missing.scenes[0]!.entities[0]!.variants = [];expect(() => readAppearanceCatalog3D(catalog(), missing)).toThrow('variant');
  const shared = structuredClone(declaration);shared.scenes[0]!.entities.find(entity => entity.id === 'floor')!.materialId = 'a:appearance:top';expect(() => readAppearanceCatalog3D(catalog(), shared)).toThrow('shared');
  const blend = structuredClone(declaration);blend.materials.find(material => material.id === 'a:appearance:top')!.alphaMode = 'blend';expect(() => readAppearanceCatalog3D(catalog(), blend)).toThrow('opaque');
});
