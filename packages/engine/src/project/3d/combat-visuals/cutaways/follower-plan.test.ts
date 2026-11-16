import { expect, test } from 'bun:test';
import { materialPreset3D } from '../../../../render/materials/3d-presets.ts';
import { createFollowerPlan3D } from './follower-plan.ts';
import { cutawaySceneBindings } from './scene-bindings.ts';
import { isRecord } from '@hyperfocus/utilities/records';

type Frame = Parameters<ReturnType<typeof createFollowerPlan3D>['apply']>[0];
type Bindings = ReturnType<typeof cutawaySceneBindings>;
const parent = 'solid:occlusion-follow:piece', child = 'child:occlusion-follow:childpiece';
function fixture(): Frame {
  return { entities: ['solid', 'child', 'piece', 'childpiece', 'shared'].map(id => ({ id, position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true })),
    materials: [child, parent, 'solid:occlusion'].map(id => ({ id, look: structuredClone(materialPreset3D('aged-iron').look) })) };
}
const authored = () => new Map([['solid', 'solid:occlusion'], ['child', parent], ['piece', parent], ['shared', parent], ['childpiece', child]]);

// Both paths execute the actual owning opacity/fade/query body. Only static
// dependency traversal differs; the oracle is extracted from the original.
async function bodies() {
  const text = await Bun.file(new URL('../obstructions.ts', import.meta.url)).text();
  const start = text.indexOf('  const presentedFollowers ='), end = text.indexOf('  cullCityProps(', start);
  const original = text.slice(start, end), bodyStart = original.indexOf('    const ownerWeight ='), bodyEnd = original.indexOf('    visitingFollowers.delete(');
  const opacityStart = text.indexOf('function applyOpacity('), opacityEnd = text.indexOf('function opaqueGroups(', opacityStart);
  if (Math.min(start, end, bodyStart, bodyEnd, opacityStart, opacityEnd) < 0) throw Error('Follower oracle owner changed');
  const bindings = 'const {frame,options,bindings,entities,materials,followers,opacity,obstructs,cutaway}=context;';
  const program = `function run(context){${bindings}${original}}\nfunction callback(context){${bindings}return (material,entity,source,piece,pieces)=>{${original.slice(bodyStart, bodyEnd)}};}\n${text.slice(opacityStart, opacityEnd)}`;
  const result: unknown = new Function(`${new Bun.Transpiler({ loader: 'ts' }).transformSync(program)};return {run,callback};`)();
  if (!isRecord(result)) throw Error('Invalid follower oracle');
  const { run, callback } = result;
  if (typeof run !== 'function' || typeof callback !== 'function') throw Error('Invalid follower oracle operations');
  return {
    run(value: ReturnType<typeof context>): void { run(value); },
    callback(value: ReturnType<typeof context>): Parameters<ReturnType<typeof createFollowerPlan3D>['apply']>[3] {
      const apply: unknown = callback(value);
      if (typeof apply !== 'function') throw Error('Invalid follower oracle callback');
      return (...args) => { apply(...args); };
    },
  };
}
function context(frame: Frame, bindings: Bindings, ids?: ReadonlyMap<string, string>) {
  const log: unknown[][] = [], history = new Map<string, number>();
  return { frame: { ...frame, timeSeconds: 7 }, bindings, followers: bindings.followers,
    entities: { get: (id: string) => frame.entities[bindings.entities.get(id)!] },
    materials: { get: (id: string) => frame.materials[bindings.materials.get(id)!] },
    opacity: new Map(frame.materials.map(material => [material.id, material.look.opacity])),
    options: { materialIds: ids, fade: { sample(id: string, target: number, time: number) { log.push(['fade', id, target, time]);const next = (history.get(id) ?? target) * .25 + target * .75;history.set(id, next);return next; } } },
    obstructs(entity: Frame['entities'][number]) { log.push(['query', entity.id, ...entity.position]);return entity.visible && entity.position[0] > 0; },
    cutaway(entity: Frame['entities'][number]) { log.push(['cutaway', entity.id]);return .2; }, log,
  };
}
test('follower plan preserves exact current DFS, fade/query order and live material writes', async () => {
  const original = await bodies(), plan = createFollowerPlan3D(), ids = authored();
  const mutations: Array<(frame: Frame) => void> = [() => {}, f => { f.entities[2]!.position[0] = 1; }, f => { f.entities[0]!.visible = false; },
    f => { f.materials[2]!.look = { ...f.materials[2]!.look, opacity: .4 }; }, f => { f.materials[0]!.look = { ...f.materials[0]!.look, opacity: 0 }; }];
  for (const [index, mutate] of mutations.entries()) {
    const a = fixture();mutate(a);const b = structuredClone(a), binding = cutawaySceneBindings(a, ids);
    expect(cutawaySceneBindings(b, ids)).toBe(binding);
    const control = context(a, binding, ids), candidate = context(b, binding, ids);
    original.run(control);const work = plan.apply(b, binding, ids, original.callback(candidate));
    expect(b).toEqual(a);expect(candidate.log).toEqual(control.log);
    expect(work).toMatchObject({ followerApplications: 2, followerCalls: 2, followerPlanBuilds: Number(index === 0),
      followerPlanStorageBytes: 32, followerPlanRetainedFrameReferences: 0, followerPlanRetainedLookReferences: 0 });
    if (index) expect(work).toMatchObject({ followerPlanMapLookups: 0, followerPlanDependencyVisits: 0, followerPlanArrayAllocations: 0 });
  }
});

test('duplicate IDs, missing dependencies, empty groups and topology mutations match the original', async () => {
  const original = await bodies(), plan = createFollowerPlan3D(), ids = authored(), frame = fixture();
  frame.materials.unshift({ id: parent, look: structuredClone(frame.materials[0]!.look) });
  const mutations = [() => {}, () => frame.materials.reverse(), () => frame.entities.reverse(),
    () => ids.set('child', 'missing-material'), () => frame.materials.splice(frame.materials.findIndex(m => m.id === 'solid:occlusion'), 1),
    () => frame.entities.splice(frame.entities.findIndex(e => e.id === 'child'), 1), () => ids.set('child', parent)];
  for (const mutate of mutations) {
    mutate();const a = structuredClone(frame), b = structuredClone(frame), binding = cutawaySceneBindings(a, ids);
    const control = context(a, binding, ids), candidate = context(b, binding, ids);
    original.run(control);plan.apply(b, binding, ids, original.callback(candidate));
    expect(b).toEqual(a);expect(candidate.log).toEqual(control.log);
  }
  const a = fixture(), b = structuredClone(a), binding = cutawaySceneBindings(a);
  binding.followers.set(parent, []);plan.clear();
  const control = context(a, binding), candidate = context(b, binding);
  original.run(control);plan.apply(b, binding, undefined, original.callback(candidate));
  expect(b).toEqual(a);expect(candidate.log).toEqual(control.log);
});

test('unbound owner map edits invalidate even when validated scene bindings stay identical', async () => {
  const original = await bodies(), plan = createFollowerPlan3D(), ids = authored(), frame = fixture();
  frame.entities = frame.entities.filter(e => e.id !== 'child');
  let previous: Bindings | undefined;
  for (const source of [parent, 'missing', 'solid:occlusion', parent]) {
    ids.set('child', source);const a = structuredClone(frame), b = structuredClone(frame), binding = cutawaySceneBindings(a, ids);
    if (previous) expect(binding).toBe(previous);previous = binding;
    const control = context(a, binding, ids), candidate = context(b, binding, ids);
    original.run(control);const work = plan.apply(b, binding, ids, original.callback(candidate));
    expect(b).toEqual(a);expect(candidate.log).toEqual(control.log);expect(work.followerPlanBuilds).toBe(1);
  }
});

test('cycles preserve the completed acyclic prefix and exact error on every call', async () => {
  const original = await bodies(), plan = createFollowerPlan3D(), ids = authored(), frame = fixture();
  const cycleA = 'loop-a:occlusion-follow:a', cycleB = 'loop-b:occlusion-follow:b';
  frame.materials.push(...[cycleA, cycleB].map(id => ({ id, look: structuredClone(frame.materials[0]!.look) })));
  ids.set('loop-a', cycleB);ids.set('loop-b', cycleA);
  for (let index = 0; index < 2; index++) {
    const a = structuredClone(frame), b = structuredClone(frame), binding = cutawaySceneBindings(a, ids);
    const control = context(a, binding, ids), candidate = context(b, binding, ids);
    const message = `Cyclic scenery fade ownership: ${cycleA}.`;
    expect(() => original.run(control)).toThrow(message);
    expect(() => plan.apply(b, binding, ids, original.callback(candidate))).toThrow(message);
    expect(b).toEqual(a);expect(candidate.log).toEqual(control.log);expect(candidate.log.length).toBeGreaterThan(0);
  }
});

test('storage is bounded and callback failure/reentrancy never poisons the plan', () => {
  const plan = createFollowerPlan3D(), frame = fixture(), ids = authored(), binding = cutawaySceneBindings(frame, ids);
  expect(() => plan.apply(frame, binding, ids, () => { throw Error('query failed'); })).toThrow('query failed');
  expect(() => plan.apply(frame, binding, ids, () => plan.apply(frame, binding, ids, () => {}))).toThrow('not reentrant');
  for (let i = 0; i < 50; i++) expect(plan.apply(structuredClone(frame), binding, ids, () => {})).toMatchObject({ followerPlanBuilds: 0,
    followerPlanStorageBytes: 32, followerPlanPeakStorageBytes: 32, followerPlanArrayAllocations: 0, followerPlanTopologyReferences: 2 });
  plan.clear();expect(plan.apply(frame, binding, ids, () => {}).followerPlanBuilds).toBe(1);
});
