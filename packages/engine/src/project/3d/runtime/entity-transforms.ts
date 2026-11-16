import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import type { BoundedScene3D } from '../../../render/3d-scene.ts';
import { cos, sin } from '../../../math/simulation.ts';
import { assertEntityInputLease3D, type EntityInputLease3D } from './entity-input-lease.ts';

type Entity = Hyperfocus3DEvaluatedFrame['entities'][number];
export type EntityTransformBinding = { transform: number; slot: number; rotation?: number[]; packedRotation?: Float32Array };
export type EntityApplicationStrategy3D = 'original' | 'retained-input' | 'leased-input';

export function setRuntimeRotationY3D(scene: BoundedScene3D, transform: number, radians: number) {
  scene.transforms.setRotationQuaternion(transform, 0, sin(radians / 2), 0, cos(radians / 2));
}

/** Retained-input owns detached inputs/results and rescans mutable caller values.
 * Leased-input requires an explicit immutable array lease from its exclusive
 * owner and stores packed results only. Both validate live transforms on reuse;
 * neither input revisions nor ownership promises grant trust to scene storage.
 */
export function createEntityTransformApplication3D(scene: BoundedScene3D, capacity: number, strategy: EntityApplicationStrategy3D = 'original', diagnostics = false) {
  if (strategy !== 'original' && strategy !== 'retained-input' && strategy !== 'leased-input') throw Error(`Unsupported entity application strategy: ${strategy}`);
  const work = { entityTransformComparisons: 0, entityInputRevisionScans: 0, entityInputRevisionChanges: 0,
    entityTransformReuses: 0, entityTransformLiveChecks: 0, entityTransformRepairs: 0, entityTransformWrites: 0,
    entityTransformCacheBytes: 0, entityTransformCacheEntries: 0 };
  const resetWork = () => {
    work.entityTransformComparisons = work.entityInputRevisionScans = work.entityInputRevisionChanges = 0;
    work.entityTransformReuses = work.entityTransformLiveChecks = work.entityTransformRepairs = work.entityTransformWrites = 0;
  };
  const original = (binding: EntityTransformBinding, entity: Entity, _inputIndex?: number) => {
    if (diagnostics) work.entityTransformComparisons++;
    const { transform } = binding, offset = transform * 3;
    if (!scene.transforms.active[transform] || !sameVector(scene.transforms.positions, offset, entity.position)) {
      scene.transforms.setPosition(transform, ...entity.position);if (diagnostics) work.entityTransformWrites++;
    }
    if (!sameVector(scene.transforms.scales, offset, entity.scale)) {
      scene.transforms.setScale(transform, ...entity.scale);if (diagnostics) work.entityTransformWrites++;
    }
    if (!sameRotation(scene, binding, entity.rotation)) {
      scene.transforms.setRotationQuaternion(transform, ...entity.rotation);if (diagnostics) work.entityTransformWrites++;
      binding.rotation ??= [0, 0, 0, 0];binding.packedRotation ??= new Float32Array(4);
      for (let axis = 0; axis < 4; axis++) { binding.rotation[axis] = entity.rotation[axis]!;binding.packedRotation[axis] = scene.transforms.rotations[transform * 4 + axis]!; }
    }
  };
  const rejectLease = (lease?: EntityInputLease3D) => { if (lease !== undefined) throw Error('Entity input leases require the leased-input strategy'); };
  if (strategy === 'original') return { apply: original, beginInput: (lease?: EntityInputLease3D) => { rejectLease(lease);return original; }, work, resetWork, resetHistory: resetWork };

  if (strategy === 'leased-input') {
    // Input ownership removes the prior candidate's Float64 input scan. Keep
    // packed live comparisons: packet readers, simulation and direct writes can
    // mutate the scene independently of an immutable endpoint.
    const packed = new Uint32Array(capacity * 10), epochs = new Uint32Array(capacity), inputIndices = new Uint32Array(capacity);
    const words = (array: Float32Array) => new Uint32Array(array.buffer, array.byteOffset, array.length);
    const positions = words(scene.transforms.positions), scales = words(scene.transforms.scales), rotations = words(scene.transforms.rotations);
    work.entityTransformCacheBytes = packed.byteLength + epochs.byteLength + inputIndices.byteLength;
    let currentLease: EntityInputLease3D | undefined, epoch = 0;
    const advanceEpoch = () => { if (++epoch > 0xffffffff) { epochs.fill(0);work.entityTransformCacheEntries = 0;epoch = 1; } };
    const leased = (binding: EntityTransformBinding, entity: Entity, inputIndex = binding.slot) => {
      const { slot, transform } = binding, offset = slot * 10, vectorOffset = transform * 3, quaternionOffset = transform * 4;
      if (epochs[slot] === epoch && inputIndices[slot] === inputIndex) {
        if (diagnostics) work.entityTransformLiveChecks++;
        let live = scene.transforms.active[transform] !== 0;
        for (let axis = 0; live && axis < 3; axis++) live = positions[vectorOffset + axis] === packed[offset + axis] && scales[vectorOffset + axis] === packed[offset + 3 + axis];
        for (let axis = 0; live && axis < 4; axis++) live = rotations[quaternionOffset + axis] === packed[offset + 6 + axis];
        if (live) { if (diagnostics) work.entityTransformReuses++;return; }
        if (diagnostics) work.entityTransformRepairs++;
      }
      original(binding, entity);
      if (!epochs[slot]) work.entityTransformCacheEntries++;
      epochs[slot] = epoch;
      inputIndices[slot] = inputIndex;
      for (let axis = 0; axis < 3; axis++) { packed[offset + axis] = positions[vectorOffset + axis]!;packed[offset + 3 + axis] = scales[vectorOffset + axis]!; }
      for (let axis = 0; axis < 4; axis++) packed[offset + 6 + axis] = rotations[quaternionOffset + axis]!;
    };
    const beginInput = (lease?: EntityInputLease3D, entities?: readonly Entity[]) => {
      if (lease !== undefined) {
        if (!entities) throw Error('Entity input lease requires its entity array');
        assertEntityInputLease3D(lease, entities);
      }
      if (lease !== currentLease) { currentLease = lease;advanceEpoch(); }
      return lease === undefined ? original : leased;
    };
    return { apply: original, beginInput, work, resetWork, resetHistory() {
      currentLease = undefined;epoch = 0;epochs.fill(0);inputIndices.fill(0);packed.fill(0);
      work.entityTransformCacheEntries = 0;resetWork();
    } };
  }

  // Fixed capacity, no input/frame retention and no allocations during application.
  const inputs = new Float64Array(capacity * 10), packed = new Uint32Array(capacity * 10), revisions = new Float64Array(capacity);
  const words = (array: Float32Array) => new Uint32Array(array.buffer, array.byteOffset, array.length);
  const positions = words(scene.transforms.positions), scales = words(scene.transforms.scales), rotations = words(scene.transforms.rotations);
  work.entityTransformCacheBytes = inputs.byteLength + packed.byteLength + revisions.byteLength;
  let serial = 0;
  const apply = (binding: EntityTransformBinding, entity: Entity) => {
    const { slot, transform } = binding, offset = slot * 10, vectorOffset = transform * 3, quaternionOffset = transform * 4;
    if (diagnostics) work.entityInputRevisionScans++;
    const unchanged = revisions[slot] !== 0 && sameInput(inputs, offset, entity);
    if (unchanged) {
      if (diagnostics) work.entityTransformLiveChecks++;
      let live = scene.transforms.active[transform] !== 0;
      for (let axis = 0; live && axis < 3; axis++) live = positions[vectorOffset + axis] === packed[offset + axis] && scales[vectorOffset + axis] === packed[offset + 3 + axis];
      for (let axis = 0; live && axis < 4; axis++) live = rotations[quaternionOffset + axis] === packed[offset + 6 + axis];
      if (live) { if (diagnostics) work.entityTransformReuses++;return; }
      if (diagnostics) work.entityTransformRepairs++;
    }
    // Failed validation never marks a partial application as a clean input.
    original(binding, entity);
    if (!unchanged) {
      if (serial === Number.MAX_SAFE_INTEGER) throw Error('Entity input revision exhausted');
      if (!revisions[slot]) work.entityTransformCacheEntries++;
      revisions[slot] = ++serial;if (diagnostics) work.entityInputRevisionChanges++;
      for (let axis = 0; axis < 3; axis++) { inputs[offset + axis] = entity.position[axis]!;inputs[offset + 3 + axis] = entity.scale[axis]!; }
      for (let axis = 0; axis < 4; axis++) inputs[offset + 6 + axis] = entity.rotation[axis]!;
    }
    for (let axis = 0; axis < 3; axis++) { packed[offset + axis] = positions[vectorOffset + axis]!;packed[offset + 3 + axis] = scales[vectorOffset + axis]!; }
    for (let axis = 0; axis < 4; axis++) packed[offset + 6 + axis] = rotations[quaternionOffset + axis]!;
  };
  return { apply, beginInput: (lease?: EntityInputLease3D) => { rejectLease(lease);return apply; }, work, resetWork, resetHistory() {
    inputs.fill(0);packed.fill(0);revisions.fill(0);serial = 0;
    work.entityTransformCacheEntries = 0;resetWork();
  } };
}

function sameInput(inputs: Float64Array, offset: number, entity: Entity) {
  for (let axis = 0; axis < 3; axis++) if (!Object.is(inputs[offset + axis], entity.position[axis]) || !Object.is(inputs[offset + 3 + axis], entity.scale[axis])) return false;
  for (let axis = 0; axis < 4; axis++) if (!Object.is(inputs[offset + 6 + axis], entity.rotation[axis])) return false;
  return true;
}
function sameVector(packed: Float32Array, offset: number, values: readonly number[]) {
  for (let axis = 0; axis < 3; axis++) if (!Number.isFinite(values[axis]) || !Object.is(packed[offset + axis], Math.fround(values[axis]!))) return false;
  return true;
}
function sameRotation(scene: BoundedScene3D, binding: EntityTransformBinding, rotation: readonly number[]) {
  if (!binding.rotation) return false;
  for (let axis = 0; axis < 4; axis++) if (!Object.is(binding.rotation[axis], rotation[axis])
    || !Object.is(scene.transforms.rotations[binding.transform * 4 + axis], binding.packedRotation![axis])) return false;
  return true;
}
