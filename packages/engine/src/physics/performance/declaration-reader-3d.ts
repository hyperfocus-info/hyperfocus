import { requireText } from '@hyperfocus/utilities/text';
import { optional, readList, readObject, readTuple, readUnion, requireNumber, requireOneOf, type ObjectReaders } from '@hyperfocus/utilities/validation';
import { readRigidBodyDefinition3D, readRigidWorldOptions3D } from '../rigid/declaration-reader.ts';
import { readRagdollDefinition3D } from '../ragdoll/declaration-reader.ts';
import { readPhysicalBodyReference3D, readPhysicalPerformanceCue3D } from './cue-reader-3d.ts';
import type { PhysicalConstraint3D, PhysicalPerformance3D } from '../physical-performance-3d.ts';

const constraintBase = { id: requireText, breakGroupId: optional(requireText), a: readPhysicalBodyReference3D, b: readPhysicalBodyReference3D, stiffness: optional(requireNumber), breakImpulse: optional(requireNumber) };
let pointFields: ObjectReaders<Extract<PhysicalConstraint3D, { kind: 'point' }>>;
let distanceFields: ObjectReaders<Extract<PhysicalConstraint3D, { kind: 'distance' }>>;
let fields: ObjectReaders<PhysicalPerformance3D>;
/** Parses structure only; preflight owns topology, mechanics and authored references. */
export function readPhysicalPerformance3D(value: unknown): PhysicalPerformance3D { return structuredClone(readObject(value, (fields ??= {
  frameRate: requireNumber, simulationHz: optional(requireNumber), durationFrames: requireNumber, world: optional(readRigidWorldOptions3D),
  quality: optional(value => readObject(value, { maximumPenetrationMeters: optional(requireNumber), maximumUnforcedAcceleration: optional(requireNumber), maximumJointLimitExcessRadians: optional(requireNumber), jointLimitSaturationFrames: optional(requireNumber) })),
  bodies: optional(value => readList(value, readRigidBodyDefinition3D)), ragdolls: value => readList(value, readRagdollDefinition3D),
  constraints: optional(value => readList(value, value => readUnion(value, [value => readObject(value, (pointFields ??= { ...constraintBase, kind: value => requireOneOf(value, ['point']), localAnchorA: optional(value => readTuple(value, [requireNumber, requireNumber, requireNumber])), localAnchorB: optional(value => readTuple(value, [requireNumber, requireNumber, requireNumber])) })), value => readObject(value, (distanceFields ??= { ...constraintBase, kind: value => requireOneOf(value, ['distance']), distance: optional(requireNumber) }))]))),
  cues: value => readList(value, readPhysicalPerformanceCue3D), outputs: optional(value => readList(value, readPhysicalBodyReference3D)),
}))); }
