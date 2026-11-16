import { expect, test } from 'bun:test';
import { createBoundedScene3D, createRenderCommandBuffer3D, MATERIAL_FLAG_ALPHA_BLEND_3D, type RenderCommandBuffer3D } from '../3d-scene.ts';
import { createTransparencySorter3D } from './transparency.ts';

const camera = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function fixture(appearance = false) {
  const source = createRenderCommandBuffer3D({ instances: 16, commands: 16, lights: 2 });
  source.commandCount = 4;source.instanceCount = 12;source.lightCount = 1;
  source.commandFirstInstances.set([0, 3, 6, 9]);source.commandInstanceCounts.set([3, 3, 3, 3]);
  source.commandMaterialHandles.set([0, 1, 2, 3]);source.commandMeshHandles.set([2, 3, 4, 5]);
  const flags = new Uint32Array([0, 0, MATERIAL_FLAG_ALPHA_BLEND_3D, MATERIAL_FLAG_ALPHA_BLEND_3D]);
  for (let instance = 0; instance < 16; instance++) {
    source.instanceSceneHandles[instance] = 100 + instance;
    source.instanceMatrices.set(camera(), instance * 16);
    source.instanceMatrices[instance * 16 + 12] = instance;
    source.instanceMatrices[instance * 16 + 14] = Math.floor(instance / 3);
  }
  // Copy paths must preserve signed zero and noncanonical NaN payloads in
  // non-depth words, without scalar float read/write canonicalization.
  const words = new Uint32Array(source.instanceMatrices.buffer);
  words[1] = 0x80000000;words[17] = 0x7fc12345;words[33] = 0xffc12346;
  if (appearance) {
    source.instanceAppearance = new Float32Array(128);
    new Uint32Array(source.instanceAppearance.buffer).set(words.subarray(0, 128));
  }
  const scene = createBoundedScene3D({ transforms: 1, meshes: 1, materials: 4, instances: 16, lights: 2 });
  scene.materialFlags.set(flags);
  return { source, scene };
}
function bytes(value: ArrayBufferView) { return new Uint8Array(value.buffer, value.byteOffset, value.byteLength); }
function equalBuffers(a: RenderCommandBuffer3D, b: RenderCommandBuffer3D) {
  expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
  const left: Record<string, unknown> = a, right: Record<string, unknown> = b;
  for (const key of Object.keys(a)) {
    const av = left[key], bv = right[key];
    if (ArrayBuffer.isView(av)) { expect(ArrayBuffer.isView(bv)).toBe(true);if (!ArrayBuffer.isView(bv)) throw Error(`Missing buffer ${key}`);expect(bytes(bv)).toEqual(bytes(av)); }
    else expect(bv).toEqual(av);
  }
}
const pair = () => ({ original: createTransparencySorter3D({ strategy: 'original', diagnostics: true }),
  runs: createTransparencySorter3D({ strategy: 'runs', diagnostics: true }) });

test('copy runs preserve complete ordered buffers, NaN payloads, appearance and mutable-output repair', () => {
  for (const appearance of [false, true]) {
    const a = fixture(appearance), b = fixture(appearance), sort = pair();
    const originalInput = bytes(a.source.instanceMatrices).slice();
    let left = sort.original(a.scene, a.source, camera()), right = sort.runs(b.scene, b.source, camera());equalBuffers(left, right);
    expect(bytes(a.source.instanceMatrices)).toEqual(originalInput);expect(bytes(b.source.instanceMatrices)).toEqual(originalInput);
    const original = { ...sort.original.readWork() }, candidate = { ...sort.runs.readWork() };
    expect(original.matrixSetCalls).toBe(12);expect(candidate.matrixSetCalls).toBe(3);
    expect(candidate.matrixSubarrayCalls).toBe(3);expect(candidate.matrixValuesCopied).toBe(192);
    expect(candidate.handleWrites).toBe(12);expect(candidate.commandCount).toBe(original.commandCount);
    expect(candidate.appearanceValuesCopied).toBe(appearance ? 96 : 0);expect(candidate.fallbacks).toBe(0);
    expect(candidate.scratchCapacityBytes).toBe(original.scratchCapacityBytes);expect(candidate.retainedSourceReferences).toBe(0);
    left.instanceMatrices.fill(123);right.instanceMatrices.fill(123);
    a.source.instanceMatrices[14] = b.source.instanceMatrices[14] = 99;
    left = sort.original(a.scene, a.source, camera());right = sort.runs(b.scene, b.source, camera());equalBuffers(left, right);
    if (appearance) {
      a.source.instanceAppearance = b.source.instanceAppearance = undefined;
      equalBuffers(sort.original(a.scene, a.source, camera()), sort.runs(b.scene, b.source, camera()));
      expect(sort.runs.readWork().appearanceDefaultArrays).toBe(12);
    }
  }
});

test('no blended command returns caller source and reports no copy work across reversals', () => {
  const a = fixture(), b = fixture(), sort = pair();
  a.scene.materialFlags.fill(0);b.scene.materialFlags.fill(0);
  expect(sort.original(a.scene, a.source, camera())).toBe(a.source);expect(sort.runs(b.scene, b.source, camera())).toBe(b.source);
  expect(sort.runs.readWork().scratchCapacityBytes).toBe(0);
  for (const selected of [sort.original, sort.runs]) {
    const work = selected.readWork();expect(work.observed).toBe(1);
    for (const key of ['copiedInstances', 'copyRuns', 'matrixSetCalls', 'matrixSubarrayCalls', 'matrixValuesCopied', 'handleWrites', 'appearanceSetCalls', 'appearanceValuesCopied', 'commandCount'] as const) expect(work[key]).toBe(0);
  }
  a.scene.materialFlags[2] = b.scene.materialFlags[2] = MATERIAL_FLAG_ALPHA_BLEND_3D;
  equalBuffers(sort.original(a.scene, a.source, camera()), sort.runs(b.scene, b.source, camera()));
  a.scene.materialFlags.fill(0);b.scene.materialFlags.fill(0);
  sort.original(a.scene, a.source, camera());sort.runs(b.scene, b.source, camera());
  expect(sort.runs.readWork().matrixSetCalls).toBe(0);expect(sort.runs.readWork().scratchCapacityBytes).toBeGreaterThan(0);
});

test('noncontiguous, repeated and overlapping ranges retain original duplicate ownership and tie ordering', () => {
  for (const ranges of [[0, 6, 3, 9], [0, 0, 3, 3], [1, 2, 4, 5]]) {
    const a = fixture(true), b = fixture(true), sort = pair();
    a.source.commandFirstInstances.set(ranges);b.source.commandFirstInstances.set(ranges);
    a.scene.materialFlags.fill(MATERIAL_FLAG_ALPHA_BLEND_3D);b.scene.materialFlags.fill(MATERIAL_FLAG_ALPHA_BLEND_3D);
    equalBuffers(sort.original(a.scene, a.source, camera()), sort.runs(b.scene, b.source, camera()));
    expect(sort.runs.readWork().fallbacks).toBe(0);expect(sort.runs.readWork().copiedInstances).toBe(12);
  }
});

test('observable camera reads/mutations and exceptions use the exact original path', () => {
  for (const fail of [false, true]) {
    const a = fixture(), b = fixture(), sort = pair(), logs: number[][] = [[], []];
    const projection = (source: RenderCommandBuffer3D, log: number[]) => new Proxy(camera(), {
      get(target, key) {
        if (typeof key === 'string' && /^\d+$/.test(key)) { log.push(Number(key));source.instanceMatrices[1] = log.length;if (fail && log.length === 4) throw Error('camera stop'); }
        return Reflect.get(target, key, target);
      },
    });
    if (fail) {
      expect(() => sort.original(a.scene, a.source, projection(a.source, logs[0]!))).toThrow('camera stop');
      expect(() => sort.runs(b.scene, b.source, projection(b.source, logs[1]!))).toThrow('camera stop');
      expect(sort.runs.readWork().observed).toBe(0);
    } else {
      equalBuffers(sort.original(a.scene, a.source, projection(a.source, logs[0]!)), sort.runs(b.scene, b.source, projection(b.source, logs[1]!)));
      expect(sort.runs.readWork().fallbacks).toBe(1);
    }
    expect(logs[1]).toEqual(logs[0]);expect(bytes(a.source.instanceMatrices)).toEqual(bytes(b.source.instanceMatrices));
  }
});

test('overridden typed-array methods, overflow and cached-output cross-field aliases fall back explicitly', () => {
  const a = fixture(), b = fixture(), sort = pair();let callsA = 0, callsB = 0;
  a.source.instanceMatrices.subarray = (...args) => { callsA++;return Float32Array.prototype.subarray.apply(a.source.instanceMatrices, args); };
  b.source.instanceMatrices.subarray = (...args) => { callsB++;return Float32Array.prototype.subarray.apply(b.source.instanceMatrices, args); };
  equalBuffers(sort.original(a.scene, a.source, camera()), sort.runs(b.scene, b.source, camera()));
  expect(callsB).toBe(callsA);expect(sort.runs.readWork().fallbacks).toBe(1);
  const c = fixture(), d = fixture(), overflow = pair();c.source.commandInstanceCounts.fill(8, 0, 4);d.source.commandInstanceCounts.fill(8, 0, 4);
  expect(() => overflow.original(c.scene, c.source, camera())).toThrow();expect(() => overflow.runs(d.scene, d.source, camera())).toThrow();
  expect(overflow.runs.readWork().observed).toBe(0);
  const e = fixture(), f = fixture(), aliases = pair();
  const oldA = aliases.original(e.scene, e.source, camera()), oldB = aliases.runs(f.scene, f.source, camera());
  Object.defineProperty(oldA, 'instanceSceneHandles', { value: new Uint32Array(e.source.instanceMatrices.buffer, 0, 16) });
  Object.defineProperty(oldB, 'instanceSceneHandles', { value: new Uint32Array(f.source.instanceMatrices.buffer, 0, 16) });
  equalBuffers(aliases.original(e.scene, e.source, camera()), aliases.runs(f.scene, f.source, camera()));
  expect(aliases.runs.readWork().fallbacks).toBe(1);
});

test('borrowed output alias/write overrides retain the original scratch and operation order', () => {
  for (const override of [false, true]) {
    const a = fixture(), b = fixture(), sort = pair();
    const left = sort.original(a.scene, a.source, camera()), right = sort.runs(b.scene, b.source, camera());
    let firstCalls = 0, secondCalls = 0;
    if (override) {
      left.instanceMatrices.set = (...args) => { firstCalls++;Float32Array.prototype.set.apply(left.instanceMatrices, args); };
      right.instanceMatrices.set = (...args) => { secondCalls++;Float32Array.prototype.set.apply(right.instanceMatrices, args); };
    } else {
      Object.defineProperty(left, 'instanceSceneHandles', { value: new Uint32Array(left.instanceMatrices.buffer, 0, 16) });
      Object.defineProperty(right, 'instanceSceneHandles', { value: new Uint32Array(right.instanceMatrices.buffer, 0, 16) });
    }
    expect(sort.original(a.scene, a.source, camera())).toBe(left);expect(sort.runs(b.scene, b.source, camera())).toBe(right);
    equalBuffers(left, right);expect(firstCalls).toBe(secondCalls);expect(sort.runs.readWork().fallbacks).toBe(1);
  }
});

test('inherited constructor species overrides preserve original subarray observation counts', () => {
  const a = fixture(), b = fixture(), sort = pair(), originalDescriptor = Object.getOwnPropertyDescriptor(Float32Array, Symbol.species);
  let calls = 0;
  try {
    Object.defineProperty(Float32Array, Symbol.species, { configurable: true, get() { calls++;return Float32Array; } });
    const left = sort.original(a.scene, a.source, camera()), firstCalls = calls;calls = 0;
    const right = sort.runs(b.scene, b.source, camera());expect(calls).toBe(firstCalls);
    equalBuffers(left, right);expect(sort.runs.readWork().fallbacks).toBe(1);
  } finally {
    if (originalDescriptor) Object.defineProperty(Float32Array, Symbol.species, originalDescriptor);else Reflect.deleteProperty(Float32Array, Symbol.species);
  }
});

test('varied ordered ranges and depth permutations preserve full binary output', () => {
  let seed = 0x514ac7;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  for (let trial = 0; trial < 32; trial++) {
    const a = fixture(trial % 2 === 0), b = fixture(trial % 2 === 0), sort = pair();
    for (let command = 0; command < 4; command++) {
      const first = random() % 12, count = random() % 4, flag = random() % 2 ? MATERIAL_FLAG_ALPHA_BLEND_3D : 0;
      a.source.commandFirstInstances[command] = b.source.commandFirstInstances[command] = first;
      a.source.commandInstanceCounts[command] = b.source.commandInstanceCounts[command] = count;
      a.scene.materialFlags[command] = b.scene.materialFlags[command] = flag;
    }
    for (let instance = 0; instance < 16; instance++) a.source.instanceMatrices[instance * 16 + 14] = b.source.instanceMatrices[instance * 16 + 14] = random() % 5;
    equalBuffers(sort.original(a.scene, a.source, camera()), sort.runs(b.scene, b.source, new Float64Array(camera())));
  }
});
