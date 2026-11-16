import { expect, test } from 'bun:test';
import { materialPreset3D } from '../../../../render/materials/3d-presets.ts';
import { createMaterialAliasPlan3D } from './material-aliases.ts';
import { cutawaySceneBindings } from './scene-bindings.ts';
import { isRecord } from '@hyperfocus/utilities/records';

type Frame = Parameters<ReturnType<typeof createMaterialAliasPlan3D>['apply']>[0];
type Bindings = ReturnType<typeof cutawaySceneBindings>;
type Groups = readonly string[][];
type SameLook = Parameters<ReturnType<typeof createMaterialAliasPlan3D>['apply']>[3];
const ids = ['tod:city:a:occlusion', 'tod:city:b:occlusion', 'tod:city:c:occlusion'];
const authored = () => new Map([['a', ids[0]!], ['b', ids[1]!], ['c', ids[2]!]]);
function fixture(): Frame {
  return { entities: ['a', 'b', 'c'].map(id => ({ id, position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true })),
    materials: ids.map(id => ({ id, look: structuredClone(materialPreset3D('aged-iron').look) })) };
}

// Execute the exact current original owner and comparator; no parallel oracle.
async function oracle() {
  const source = await Bun.file(new URL('../obstructions.ts', import.meta.url)).text();
  const start = source.indexOf('function batchOpaqueCity('), end = source.indexOf('/** Conservative render-only culling;', start);
  if (start < 0 || end < 0) throw Error('Original material alias owner changed');
  const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(source.slice(start, end)
    .replace('representatives.find(candidate => sameLook(candidate.look, material.look))', 'representatives.find(candidate => (counts.comparisons++,sameLook(candidate.look, material.look)))'));
  const counts = { comparisons: 0 };
  const result: unknown = new Function('counts', `${body}\nreturn {apply:batchOpaqueCity,compare:sameLook};`)(counts);
  if (!isRecord(result)) throw Error('Invalid material alias oracle');
  const { apply, compare } = result;
  if (typeof apply !== 'function' || typeof compare !== 'function') throw Error('Invalid material alias oracle operations');
  return {
    apply(frame: Frame, bindings: Bindings, groups: Groups, materials: { get(id: string): Frame['materials'][number] | undefined }): void { apply(frame, bindings, groups, materials); },
    compare(a: Parameters<SameLook>[0], b: Parameters<SameLook>[1]) {
      const equal: unknown = compare(a, b);
      if (typeof equal !== 'boolean') throw Error('Invalid material alias comparison');
      return equal;
    },
    counts,
  };
}

test('numeric aliases retain current look, fade, variant and stale-property behavior', async () => {
  const original = await oracle(), writer = createMaterialAliasPlan3D(), map = authored(), groups = [[...ids]];
  const control = fixture(), candidate = structuredClone(control);
  const mutations: Array<(frame: Frame) => void> = [
    frame => { frame.materials[1]!.look = { ...frame.materials[1]!.look, opacity: .25 }; },
    frame => { frame.materials[1]!.look = { ...frame.materials[1]!.look, opacity: 1, cutaway: true }; },
    frame => { frame.materials[1]!.look = { ...frame.materials[1]!.look, cutaway: false }; },
    frame => { const look = frame.materials[1]!.look;frame.materials[1]!.look = { ...look, baseColor: [.375, look.baseColor[1], look.baseColor[2], look.baseColor[3]] }; },
    frame => { frame.materials[1]!.look = structuredClone(frame.materials[0]!.look); },
    frame => { const look = frame.materials[1]!.look;frame.materials[1]!.look = { ...look, textures: { ...look.textures, normal: 'changed-normal' } }; },
    frame => { const look = frame.materials[1]!.look, { normal: _normal, ...textures } = look.textures;frame.materials[1]!.look = { ...look, textures }; },
    frame => { frame.entities[1]!.variantId = 'broken'; },
    frame => { delete frame.entities[1]!.variantId; },
    frame => { for (const [index, rotation] of [[2, -0], [0, 0]]) { const look = frame.materials[index!]!.look;frame.materials[index!]!.look = { ...look, uv: { ...look.uv, rotation: rotation! } }; } },
    frame => { frame.materials[2]!.look = { ...frame.materials[2]!.look, roughness: NaN }; },
    frame => { frame.materials[0]!.look = { ...frame.materials[0]!.look, roughness: NaN }; },
    frame => { for (const index of [0, 2]) frame.materials[index]!.look = { ...frame.materials[index]!.look, roughness: .5 }; },
    frame => { frame.materials[1]!.look = { ...frame.materials[1]!.look, opacity: 0 };frame.entities[2]!.renderMaterialId = 'stale'; },
    frame => { frame.materials[1]!.look = { ...frame.materials[1]!.look, opacity: 1 }; },
  ];
  for (const mutate of [() => {}, ...mutations, ...mutations]) {
    mutate(control);mutate(candidate);
    const binding = cutawaySceneBindings(candidate, map);expect(cutawaySceneBindings(control, map)).toBe(binding);
    original.counts.comparisons = 0;
    original.apply(control, binding, groups, { get: id => control.materials[binding.materials.get(id)!] });
    const work = writer.apply(candidate, binding, groups, original.compare);
    expect(candidate).toEqual(control);
    expect(candidate.entities.map(entity => Object.hasOwn(entity, 'renderMaterialId'))).toEqual(control.entities.map(entity => Object.hasOwn(entity, 'renderMaterialId')));
    expect(work.aliasLookComparisons).toBe(original.counts.comparisons);
    expect(work.aliasEntityVisits).toBe(3);expect(work.aliasMaterialVisits).toBe(3);
  }
});

test('duplicate IDs use the Map last slot and preserve missing members and first representative order', async () => {
  const original = await oracle(), writer = createMaterialAliasPlan3D(), map = authored();
  const originalFrame = fixture();
  originalFrame.materials.unshift({ id: ids[0]!, look: { ...structuredClone(materialPreset3D('aged-iron').look), metallic: .123 } });
  let groups: string[][] = [[ids[1]!, 'missing', ids[0]!, ids[0]!, ids[2]!], [ids[2]!, ids[1]!]];
  let previous: Bindings | undefined;
  for (const mutate of [() => {}, () => originalFrame.materials.reverse(), () => originalFrame.entities.reverse(),
    () => originalFrame.materials.splice(originalFrame.materials.findIndex(material => material.id === ids[2]), 1),
    () => map.set('b', ids[0]!), () => { groups = groups.map(group => group.slice().reverse()); }]) {
    mutate();
    const control = structuredClone(originalFrame), candidate = structuredClone(originalFrame), binding = cutawaySceneBindings(candidate, map);
    original.counts.comparisons = 0;
    original.apply(control, binding, groups, { get: id => control.materials[binding.materials.get(id)!] });
    const work = writer.apply(candidate, binding, groups, original.compare);
    expect(candidate).toEqual(control);expect(work.aliasLookComparisons).toBe(original.counts.comparisons);
    expect(work.aliasPlanBuilds).toBe(1);previous = binding;
  }
  expect(previous).toBeDefined();
});

test('bounded storage replaces maps and representative arrays while counting rebuild and clear work', async () => {
  const original = await oracle(), writer = createMaterialAliasPlan3D(), frame = fixture(), map = authored(), groups = [[...ids, 'missing']];
  const binding = cutawaySceneBindings(frame, map);
  const first = writer.apply(frame, binding, groups, original.compare);
  expect(first).toEqual({ aliasGroupVisits: 1, aliasMaterialVisits: 4, aliasLookComparisons: 2, aliasEntries: 2,
    aliasMapBuilds: 0, aliasRepresentativeArrays: 0, aliasEntityVisits: 3, aliasWrites: 2,
    aliasMaterialMapLookups: 0, aliasMapLookups: 0, aliasMapSets: 0, aliasDeleteCalls: 3,
    aliasPlanBuilds: 1, aliasPlanMaterialLookups: 7, aliasPlanArrayAllocations: 5,
    aliasSlotLoads: 14, aliasSlotsCleared: 3, aliasStorageBytes: 64, aliasPeakStorageBytes: 64,
    aliasTopologyOwnerReferences: 2, aliasRetainedFrameReferences: 0, aliasRetainedLookReferences: 0 });
  for (let index = 0; index < 100; index++) {
    const next = structuredClone(frame);next.materials[1]!.look = { ...next.materials[1]!.look, opacity: index % 2 ? 1 : .3 };
    const work = writer.apply(next, cutawaySceneBindings(next, map), groups, original.compare);
    expect(work.aliasPlanBuilds).toBe(0);expect(work.aliasPlanMaterialLookups).toBe(0);
    expect(work.aliasPlanArrayAllocations).toBe(0);expect(work.aliasStorageBytes).toBe(64);expect(work.aliasSlotsCleared).toBe(3);
  }
  writer.clear();expect(writer.apply(frame, binding, groups, original.compare).aliasPlanBuilds).toBe(1);
});

test('a failed or reentrant comparator cannot poison subsequent plan use', async () => {
  const original = await oracle(), writer = createMaterialAliasPlan3D(), frame = fixture(), map = authored(), groups = [[...ids]];
  const binding = cutawaySceneBindings(frame, map);
  expect(() => writer.apply(frame, binding, groups, () => { throw Error('comparison failed'); })).toThrow('comparison failed');
  expect(() => writer.apply(frame, binding, groups, () => { writer.apply(frame, binding, groups, original.compare);return true; })).toThrow('not reentrant');
  expect(writer.apply(frame, binding, groups, original.compare).aliasWrites).toBe(2);
});
