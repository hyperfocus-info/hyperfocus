import type { PhysicalPerformanceCue3D } from '../physics/physical-performance-3d.ts';

/** Complete structural union fixture. Mechanically meaningful scenarios stay in
 * the independent physics suites; these rows exercise every declared field. */
export function physicalCueStructureFixtures3D(): PhysicalPerformanceCue3D[] {
  const anchor = { cueId: 'contact', offsetFrames: 1 }, base = { frame: 0, ragdollId: 'rig' };
  return [
    { ...base, id: 'pose', kind: 'pose', pose: { rotations: [0, 0, 0, 1] } },
    { ...base, id: 'mode', kind: 'mode', mode: 'active', afterContact: anchor, durationSeconds: .2, discontinuous: false },
    { ...base, id: 'recovery', kind: 'recovery', afterContact: anchor, startCondition: 'after-settled', maximumWaitFrames: 20,
      getUp: { postureBoneId: 'root', clips: { upright: 'up', 'face-up': 'up', 'face-down': 'up', 'left-side': 'up', 'right-side': 'up' }, environment: { clips: { crouched: 'c', 'wall-supported': 'w', 'ledge-supported': 'l' }, proximityMeters: 1, standingHeadroomMeters: 2, ledgeProbeDistance: 1, ledgeHeightTolerance: .2 }, sourceStartSeconds: 0, speed: 1, loop: false },
      target: { pose: { rotations: [0, 0, 0, 1] }, positionMode: 'authored', rootPosition: [0, 0, 0], rootRotation: [0, 0, 0, 1], durationSeconds: 1, poseTransition: 'blend', poseBlendSeconds: .2, requireStableSupport: true, supportBoneIds: ['root'], groundLayerMask: 1, supportProbeDistance: 1, minimumSupportNormalY: .8, clearancePadding: .1 } },
    { ...base, id: 'support', kind: 'support', durationFrames: 10, boneId: 'root', groundLayerMask: 1, probeDistance: 1, minimumNormalY: .5, maximumPlantSpeed: 1, stiffness: 1, damping: 1, maxImpulse: 1, breakImpulse: 2, balanceRadiusMeters: .2, balanceStiffness: 1, balanceDamping: 1, maxBalanceImpulse: 1, predictionSeconds: .1, forceDistribution: 'whole-body' },
    { ...base, id: 'step', kind: 'step', durationFrames: 10, holdFrames: 2, boneId: 'root', direction: [1, 0, 0], speedMetersPerSecond: 1, predictionSeconds: .1, maximumDistance: 1, liftHeight: .1, groundLayerMask: 1, probeHeight: 1, probeDistance: 1, minimumNormalY: .5, stiffness: 1, damping: 1, maximumDriveImpulse: 1, landingTolerance: .1, maximumLandingSpeed: 1, allowFlight: true },
    { ...base, id: 'locomotion', kind: 'locomotion', durationFrames: 10, direction: [1, 0, 0], distanceMeters: 1, peakSpeedMetersPerSecond: 2, maxImpulse: 1, pace: 'walk', posture: 'crouch', cycleDistanceScale: 1 },
    { ...base, id: 'jump', kind: 'jump', supportBoneIds: ['root'], direction: [1, 0, 0], horizontalSpeedMetersPerSecond: 1, verticalSpeedMetersPerSecond: 3, groundLayerMask: 1, probeDistance: 1, minimumNormalY: .5, maximumGroundedVerticalSpeedMetersPerSecond: 1 },
    { ...base, id: 'joint', kind: 'joint-drive', durationFrames: 10, jointId: 'joint', axisParentLocal: [1, 0, 0], angularDistanceDegrees: 30, peakAngularSpeedDegreesPerSecond: 60, maxTorqueImpulse: 1, phase: 'contact', actionId: 'act', allowAuthorityOverride: true },
    ...(['turn', 'align-direction', 'aim-at-body'] as const).map((mode): Extract<PhysicalPerformanceCue3D, { kind: 'effector-drive' }> => ({
      ...base, id: mode, kind: 'effector-drive', durationFrames: 10, effectorBoneId: 'root', jointIds: ['joint'], direction: [1, 0, 0], distanceMeters: 1, peakSpeedMetersPerSecond: 2, trackingGainPerSecond: 1, velocityGain: 1, maxTorqueImpulse: 1,
      translationTarget: { bodyId: 'target' }, supportMode: 'auto', path: { mode: 'arc', plane: 'vertical', heightMeters: .2, side: -1 },
      orientation: mode === 'turn' ? { mode, axisWorld: [0, 1, 0], angularDistanceDegrees: 30, peakAngularSpeedDegreesPerSecond: 60, trackingGainPerSecond: 1, maxTorqueImpulse: 1 } : mode === 'align-direction' ? { mode, localAxis: [0, 1, 0], peakAngularSpeedDegreesPerSecond: 60, trackingGainPerSecond: 1, maxTorqueImpulse: 1 } : { mode, localAxis: [0, 1, 0], target: { ragdollId: 'rig', boneId: 'root' }, peakAngularSpeedDegreesPerSecond: 60, trackingGainPerSecond: 1, maxTorqueImpulse: 1 },
      phase: 'follow-through', actionId: 'act', afterContact: anchor, stopAtContact: { cueId: 'contact' }, allowAuthorityOverride: true,
    })),
    { id: 'bind', kind: 'bind', frame: 1, durationFrames: 10, a: { bodyId: 'a' }, b: { ragdollId: 'rig', boneId: 'root' }, anchorMode: 'contact', afterContact: anchor, localAnchorA: [0, 0, 0], localAnchorB: [0, 0, 0], rotationMode: 'preserve', stiffness: 1, damping: 1, maxImpulse: 1, breakImpulse: 2, rotationStiffness: 1, rotationDamping: 1, maxTorqueImpulse: 1 },
    { id: 'launch', kind: 'launch', frame: 1, attacker: { ragdollId: 'rig', boneId: 'root' }, target: { bodyId: 'target' }, targeting: 'target-at-launch', direction: [1, 0, 0], speedMetersPerSecond: 3, distanceMeters: 1, targetTravelPaddingMeters: .1, angularVelocityDegreesPerSecond: [0, 90, 0], localPoint: [0, 0, 0], actuation: 'whole-body', allowAirborneExternalActuation: true, allowAuthorityOverride: true, expectedContactFrame: 5, contactToleranceFrames: 1, attackerMode: 'active', targetModeOnContact: 'auto', actionId: 'act', consequenceFrames: 1, recoveryFrames: 1 },
  ];
}
