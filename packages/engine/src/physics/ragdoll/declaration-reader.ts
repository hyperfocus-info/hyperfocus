import { requireText } from '@hyperfocus/utilities/text';
import { optional, readArrayLike, readList, readObject, requireNumber, requireOneOf, type ObjectReaders } from '@hyperfocus/utilities/validation';
import { rigidBodyFields3D } from '../rigid/declaration-reader.ts';
import type { RagdollDefinition3D, RagdollPose3D } from '../ragdoll-3d.ts';

export function readRagdollPose3D(value: unknown): RagdollPose3D { return readObject(value, { rotations: value => readArrayLike(value, requireNumber) }); }
const { id: _id, type: _type, ...boneBodyFields } = rigidBodyFields3D;
void _id;void _type;
let jointFields: ObjectReaders<RagdollDefinition3D['joints'][number]>;
let fields: ObjectReaders<RagdollDefinition3D>;
export function readRagdollDefinition3D(value: unknown): RagdollDefinition3D { return structuredClone(readObject(value, (fields ??= {
  id: requireText, activationFrame: optional(requireNumber), motorPoseSource: optional(value => requireOneOf(value, ['performance', 'initial'])), rootBoneId: requireText,
  bodies: value => readList(value, value => readObject(value, { boneId: requireText, body: value => readObject(value, boneBodyFields) })),
  joints: value => readList(value, value => readObject(value, (jointFields ??= {
  id: requireText, parentBoneId: requireText, childBoneId: requireText, poseJointIndex: requireNumber,
  localAnchorParent: optional(value => readArrayLike(value, requireNumber, { minimum: 3, maximum: 3 })), localAnchorChild: optional(value => readArrayLike(value, requireNumber, { minimum: 3, maximum: 3 })),
  anchorStiffness: optional(requireNumber), breakImpulse: optional(requireNumber), motorStiffness: optional(requireNumber), motorDamping: optional(requireNumber), maxTorqueImpulse: optional(requireNumber), angularLimitRadians: optional(requireNumber),
  swingTwistLimit: optional(value => readObject(value, { twistAxis: value => readArrayLike(value, requireNumber, { minimum: 3, maximum: 3 }), maxSwingRadians: requireNumber, minTwistRadians: requireNumber, maxTwistRadians: requireNumber })),
  angularLimitStiffness: optional(requireNumber), angularLimitDamping: optional(requireNumber), maxLimitTorqueImpulse: optional(requireNumber),
}))), initialPose: readRagdollPose3D,
  activeMotorWeight: optional(requireNumber), minimumTransitionSeconds: optional(requireNumber), settleLinearSpeed: optional(requireNumber), settleAngularSpeed: optional(requireNumber), settleDurationSeconds: optional(requireNumber), recoveryPositionTolerance: optional(requireNumber), recoveryAngularSpeed: optional(requireNumber), maxRootImpulse: optional(requireNumber), maxRootTorqueImpulse: optional(requireNumber),
  locomotion: optional(value => readObject(value, { supportBoneIds: value => readList(value, requireText), groundLayerMask: optional(requireNumber), probeDistance: optional(requireNumber), minimumNormalY: optional(requireNumber), maximumGroundedVerticalSpeedMetersPerSecond: optional(requireNumber), minimumLandingSpeedMetersPerSecond: optional(requireNumber), fullImpactLandingSpeedMetersPerSecond: optional(requireNumber), landingDurationSeconds: optional(requireNumber), landingMotorYield: optional(requireNumber) })),
  impactResponse: optional(value => readObject(value, { minimumStaggerSpeedMetersPerSecond: optional(requireNumber), knockdownSpeedMetersPerSecond: optional(requireNumber), staggerDurationSeconds: optional(requireNumber), staggerMotorYield: optional(requireNumber) })),
}))); }
