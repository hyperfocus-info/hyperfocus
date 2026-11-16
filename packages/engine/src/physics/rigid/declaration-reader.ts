import { requireText } from '@hyperfocus/utilities/text';
import { optional, readArrayLike, readObject, readUnion, requireBoolean, requireNumber, requireOneOf, type ObjectReaders } from '@hyperfocus/utilities/validation';
import type { RigidBodyDefinition3D, RigidWorldOptions3D } from '../rigid-3d.ts';

export const rigidBodyFields3D: ObjectReaders<RigidBodyDefinition3D> = {
  id: requireText, type: optional(value => requireOneOf(value, ['static', 'dynamic', 'kinematic'])),
  shape: value => readUnion(value, [value => readObject(value, { kind: value => requireOneOf(value, ['sphere']), radius: requireNumber }), value => readObject(value, { kind: value => requireOneOf(value, ['box']), halfX: requireNumber, halfY: requireNumber, halfZ: requireNumber })]),
  x: optional(requireNumber), y: optional(requireNumber), z: optional(requireNumber), velocityX: optional(requireNumber), velocityY: optional(requireNumber), velocityZ: optional(requireNumber),
  mass: optional(requireNumber), restitution: optional(requireNumber), friction: optional(requireNumber), gravityScale: optional(requireNumber), collisionLayer: optional(requireNumber), collisionMask: optional(requireNumber), trigger: optional(requireBoolean), continuous: optional(requireBoolean),
  rotation: optional(value => readArrayLike(value, requireNumber, { minimum: 4, maximum: 4 })), angularVelocity: optional(value => readArrayLike(value, requireNumber, { minimum: 3, maximum: 3 })), linearDamping: optional(requireNumber), angularDamping: optional(requireNumber),
  impactResponse: optional(value => readObject(value, { fractureEnergyJoules: requireNumber, retainedEnergyRatio: optional(requireNumber) })),
};
let worldFields: ObjectReaders<RigidWorldOptions3D>;
export function readRigidBodyDefinition3D(value: unknown): RigidBodyDefinition3D { return structuredClone(readObject(value, rigidBodyFields3D)); }
export function readRigidWorldOptions3D(value: unknown): RigidWorldOptions3D { return structuredClone(readObject(value, (worldFields ??= {
  capacity: optional(requireNumber), maxContacts: optional(requireNumber), maxCandidatePairs: optional(requireNumber), maxCcdTests: optional(requireNumber),
  gravityX: optional(requireNumber), gravityY: optional(requireNumber), gravityZ: optional(requireNumber), velocityIterations: optional(requireNumber), positionIterations: optional(requireNumber), maxConstraints: optional(requireNumber), constraintIterations: optional(requireNumber), precision: optional(value => requireOneOf(value, ['float32', 'float64'])),
}))); }
