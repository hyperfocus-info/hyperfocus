import { requireText } from '@hyperfocus/utilities/text';
import { optional, readList, readObject, readTuple, requireNumber, requireOneOf, type ObjectReaders } from '@hyperfocus/utilities/validation';
import type { Hyperfocus3DSnapshot } from '../../../runtime-3d.ts';

let fields: ObjectReaders<Hyperfocus3DSnapshot>;
export function readRuntimeSnapshotStructure3D(value: unknown): Hyperfocus3DSnapshot { return structuredClone(readObject(value, (fields ??= {
  version: value => requireOneOf(value, [1]), sceneId: requireText, tick: value => requireNumber(value, { minimum: 0, integer: true }), motionSeed: optional(value => requireNumber(value, { minimum: 0, maximum: 4294967295, integer: true })),
  entities: value => readList(value, value => readObject(value, { id: requireText, position: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), rotationY: requireNumber, rotation: optional(value => readTuple(value, [requireNumber, requireNumber, requireNumber, requireNumber])) })),
}))); }
