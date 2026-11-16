import { createRigidWorld3DApi } from "./rigid-3d-api.ts";
import type { RigidContactSnapshot3D } from './rigid/portable-contacts.ts';
import { createRigidConstraintStore3D, type RigidConstraintStoreCheckpoint3D } from "./rigid-3d-constraints.ts";
export { identifyRigidMaterialPreset3D,RIGID_MATERIAL_PRESET_IDS_3D,rigidMaterialPreset3D,type RigidMaterial3D,type RigidMaterialPresetId3D } from "./rigid/materials.ts";

export type RigidBodyType3D = "static" | "dynamic" | "kinematic";
export type RigidPhysicsPrecision3D = "float32" | "float64";

export type RigidShape3D =
  | { kind: "sphere"; radius: number }
  | { kind: "box"; halfX: number; halfY: number; halfZ: number };

export type RigidImpactResponse3D = {
  /** Normal-direction contact energy required before this body yields. */
  fractureEnergyJoules: number;
  /** Fraction of energy above fracture cost retained as through-motion. */
  retainedEnergyRatio?: number;
};

export type RigidBodyDefinition3D = {
  id: string;
  type?: RigidBodyType3D;
  shape: RigidShape3D;
  x?: number;
  y?: number;
  z?: number;
  velocityX?: number;
  velocityY?: number;
  velocityZ?: number;
  mass?: number;
  restitution?: number;
  friction?: number;
  gravityScale?: number;
  collisionLayer?: number;
  collisionMask?: number;
  trigger?: boolean;
  continuous?: boolean;
  /** Normalized xyzw orientation. Sphere/box and box/box contacts use oriented geometry. */
  rotation?: ArrayLike<number>;
  angularVelocity?: ArrayLike<number>;
  /** World-space linear drag coefficient in inverse seconds. */
  linearDamping?: number;
  angularDamping?: number;
  /** Deterministic opt-in material failure. Qualifying contacts preserve through-motion and report the failed body. */
  impactResponse?: RigidImpactResponse3D;
};

/** Bounded runtime reconfiguration used for deterministic authority handoffs. */
export type RigidBodyRuntimeConfiguration3D = {
  type?: RigidBodyType3D;
  /** Required when changing a non-dynamic body back to dynamic. */
  mass?: number;
  collisionLayer?: number;
  collisionMask?: number;
  continuous?: boolean;
};

export type RigidBodyState3D = {
  handle: number;
  id: string;
  type: RigidBodyType3D;
  shape: RigidShape3D;
  x: number;
  y: number;
  z: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  rotationW: number;
  angularVelocityX: number;
  angularVelocityY: number;
  angularVelocityZ: number;
  mass: number;
  restitution: number;
  friction: number;
  collisionLayer: number;
  collisionMask: number;
  trigger: boolean;
  continuous: boolean;
  impactResponse?: RigidImpactResponse3D;
};

export type RigidContact3D = {
  a: number;
  b: number;
  aId: string;
  bId: string;
  normalX: number;
  normalY: number;
  normalZ: number;
  penetration: number;
  pointX: number;
  pointY: number;
  pointZ: number;
  /** Solver points behind this one causal body-pair contact; currently one through four. */
  manifoldPointCount?: number;
  /** Solver points matched to the prior step and initialized from bounded cached impulses. */
  warmStartedPointCount?: number;
  trigger: boolean;
  /** Positive pre-solve normal closing speed at the contact point, including angular velocity. */
  closingSpeedMetersPerSecond: number;
  /** Point-contact effective mass along the contact normal. */
  effectiveMassKg: number;
  /** Pre-solve normal kinetic energy available to the impact. */
  impactEnergyJoules: number;
  /** Total normal impulse applied by the solver for this contact. */
  normalImpulseNewtonSeconds: number;
  /** True when an authored material failure preserved forward through-motion. */
  breakthrough: boolean;
  failedBody?: number;
  failedBodyId?: string;
};

export type RigidRaycastHit3D = {
  handle: number;
  id: string;
  distance: number;
  x: number;
  y: number;
  z: number;
  normalX: number;
  normalY: number;
  normalZ: number;
};

export type RigidSweepHit3D = RigidRaycastHit3D & {
  /** Normalized time along the submitted displacement, from zero through one. */
  time: number;
  /** True when a sphere-versus-box sweep used the expanded-AABB approximation. */
  conservative: boolean;
};

export type RigidWorldDiagnostics3D = {
  steps: number;
  bodies: number;
  candidatePairs: number;
  candidateOverflows: number;
  contacts: number;
  contactOverflows: number;
  /** Eligible pairs visited this step, before conservative swept-bounds rejection. */
  ccdEligiblePairs: number;
  /** Visited pairs proved disjoint for the entire sweep this step. */
  ccdBoundsRejects: number;
  /** Potential-contact pairs admitted to detailed CCD this step, bounded by maxCcdTests. */
  ccdTests: number;
  ccdTestOverflows: number;
  ccdHits: number;
  /** Narrow-phase samples used to preserve continuous collision during rotation. */
  ccdAngularTests: number;
  /** Continuous contacts whose earliest hit required rotational sampling. */
  ccdAngularHits: number;
  /** Contacts that required a conservative box/box swept-AABB approximation. */
  ccdConservativeHits: number;
  queryTruncations: number;
  constraints: number;
  constraintBreaks: number;
};

export type RigidDistanceConstraint3D = { id: string; a: number | string; b: number | string; distance?: number; stiffness?: number; breakImpulse?: number };
export type RigidPointConstraint3D = { id: string; a: number | string; b: number | string; localAnchorA?: ArrayLike<number>; localAnchorB?: ArrayLike<number>; stiffness?: number; damping?: number; maxImpulse?: number; breakImpulse?: number };
export type RigidAngularMotorConstraint3D = { id: string; a: number | string; b: number | string; targetRelativeRotation?: ArrayLike<number>; stiffness?: number; damping?: number; maxTorqueImpulse?: number };
export type RigidAngularMotorUpdate3D = { targetRelativeRotation?: ArrayLike<number>; stiffness?: number; damping?: number; maxTorqueImpulse?: number };
export type RigidAngularLimitConstraint3D = { id: string; a: number | string; b: number | string; referenceRelativeRotation?: ArrayLike<number>; maxAngleRadians: number; stiffness?: number; damping?: number; maxTorqueImpulse?: number };
export type RigidAngularSwingTwistLimitConstraint3D = { id: string; a: number | string; b: number | string; referenceRelativeRotation?: ArrayLike<number>; twistAxis: ArrayLike<number>; maxSwingRadians: number; minTwistRadians: number; maxTwistRadians: number; stiffness?: number; damping?: number; maxTorqueImpulse?: number };
export type RigidConstraintState3D =
  | { handle: number; id: string; a: number; b: number; kind: "distance"; distance: number; stiffness: number; breakImpulse?: number }
  | { handle: number; id: string; a: number; b: number; kind: "point"; localAnchorA: [number, number, number]; localAnchorB: [number, number, number]; stiffness: number; damping: number; maxImpulse: number; breakImpulse?: number }
  | { handle: number; id: string; a: number; b: number; kind: "angular-motor"; targetRelativeRotation: [number, number, number, number]; stiffness: number; damping: number; maxTorqueImpulse: number }
  | { handle: number; id: string; a: number; b: number; kind: "angular-limit"; referenceRelativeRotation: [number, number, number, number]; maxAngleRadians: number; stiffness: number; damping: number; maxTorqueImpulse: number }
  | { handle: number; id: string; a: number; b: number; kind: "angular-swing-twist-limit"; referenceRelativeRotation: [number, number, number, number]; twistAxis: [number, number, number]; maxSwingRadians: number; minTwistRadians: number; maxTwistRadians: number; stiffness: number; damping: number; maxTorqueImpulse: number };

export type RigidConstraintTelemetry3D = {
  handle: number;
  id: string;
  kind: RigidConstraintState3D["kind"];
  /** Maximum geometric error observed during the most recent solver step. */
  error: number;
  /** Sum of absolute corrective impulse applied during the most recent solver step. */
  appliedImpulse: number;
  /** True when at least one solver iteration reached the authored impulse cap. */
  saturated: boolean;
};

export type RigidWorldOptions3D = {
  capacity?: number;
  maxContacts?: number;
  maxCandidatePairs?: number;
  /** Detailed CCD pair budget per step; disjoint swept bounds do not consume it. */
  maxCcdTests?: number;
  gravityX?: number;
  gravityY?: number;
  gravityZ?: number;
  velocityIterations?: number;
  positionIterations?: number;
  maxConstraints?: number;
  constraintIterations?: number;
  /** Float32 storage rounds persistent solver state to WASM-friendly precision. */
  precision?: RigidPhysicsPrecision3D;
};

type RigidCheckpointFloatArray3D = Float32Array | Float64Array;
export type RigidWorldCheckpoint3D = {
  version: 1;
  capacity: number;
  maxContacts: number;
  precision: RigidPhysicsPrecision3D;
  topology: { alive: Uint8Array; generation: Uint32Array; ids: Array<string | undefined> };
  bodies: {
    positionX: RigidCheckpointFloatArray3D; positionY: RigidCheckpointFloatArray3D; positionZ: RigidCheckpointFloatArray3D;
    previousX: RigidCheckpointFloatArray3D; previousY: RigidCheckpointFloatArray3D; previousZ: RigidCheckpointFloatArray3D;
    velocityX: RigidCheckpointFloatArray3D; velocityY: RigidCheckpointFloatArray3D; velocityZ: RigidCheckpointFloatArray3D;
    rotationX: RigidCheckpointFloatArray3D; rotationY: RigidCheckpointFloatArray3D; rotationZ: RigidCheckpointFloatArray3D; rotationW: RigidCheckpointFloatArray3D;
    /** Added compatibly to v1 checkpoints; absent arrays fall back to the current rotation. */
    previousRotationX?: RigidCheckpointFloatArray3D; previousRotationY?: RigidCheckpointFloatArray3D; previousRotationZ?: RigidCheckpointFloatArray3D; previousRotationW?: RigidCheckpointFloatArray3D;
    angularVelocityX: RigidCheckpointFloatArray3D; angularVelocityY: RigidCheckpointFloatArray3D; angularVelocityZ: RigidCheckpointFloatArray3D;
  };
  contacts: {
    count: number; a: Int32Array; b: Int32Array;
    normalX: RigidCheckpointFloatArray3D; normalY: RigidCheckpointFloatArray3D; normalZ: RigidCheckpointFloatArray3D;
    penetration: RigidCheckpointFloatArray3D; pointX: RigidCheckpointFloatArray3D; pointY: RigidCheckpointFloatArray3D; pointZ: RigidCheckpointFloatArray3D; trigger: Uint8Array;
    /** Added compatibly to v1 checkpoints; absent storage restores one representative point per contact. */
    manifoldPointCount?: Uint8Array; manifoldPointX?: RigidCheckpointFloatArray3D; manifoldPointY?: RigidCheckpointFloatArray3D; manifoldPointZ?: RigidCheckpointFloatArray3D;
    /** Added compatibly to v1 checkpoints; absent storage restores a cold contact cache. */
    manifoldNormalImpulse?: RigidCheckpointFloatArray3D; manifoldFrictionX?: RigidCheckpointFloatArray3D; manifoldFrictionY?: RigidCheckpointFloatArray3D; manifoldFrictionZ?: RigidCheckpointFloatArray3D; warmStartedPointCount?: Uint8Array;
    closingSpeedMetersPerSecond: RigidCheckpointFloatArray3D; effectiveMassKg: RigidCheckpointFloatArray3D; impactEnergyJoules: RigidCheckpointFloatArray3D; normalImpulseNewtonSeconds: RigidCheckpointFloatArray3D; failedBody: Int32Array;
  };
  constraints: RigidConstraintStoreCheckpoint3D;
  diagnostics: RigidWorldDiagnostics3D;
};

export type { RigidContactSnapshot3D } from './rigid/portable-contacts.ts';
export type RigidWorld3D = {
  readonly capacity: number;
  readonly maxContacts: number;
  readonly maxCandidatePairs: number;
  readonly maxCcdTests: number;
  readonly precision: RigidPhysicsPrecision3D;
  /** Exact bytes reserved by numeric typed arrays, including fixed scratch space. */
  readonly numericStorageBytes: number;
  readonly diagnostics: RigidWorldDiagnostics3D;
  addBody(definition: RigidBodyDefinition3D): number;
  removeBody(handleOrId: number | string): boolean;
  hasBody(handleOrId: number | string): boolean;
  body(handleOrId: number | string): RigidBodyState3D | undefined;
  /** Copies velocity into caller-owned storage; missing ids leave it unchanged.
   * Returns body type; numeric handles retain the same stale-handle checks as body(). */
  readVelocity(handleOrId: number | string, output: { x: number; y: number; z: number }): RigidBodyType3D | undefined;
  /** Reconfigures simulation authority without replacing the body's stable handle. */
  configureBody(handleOrId: number | string, update: RigidBodyRuntimeConfiguration3D): RigidBodyState3D;
  setPosition(handleOrId: number | string, x: number, y: number, z: number): void;
  setVelocity(handleOrId: number | string, x: number, y: number, z: number): void;
  setRotation(handleOrId: number | string, x: number, y: number, z: number, w: number): void;
  setAngularVelocity(handleOrId: number | string, x: number, y: number, z: number): void;
  applyTorqueImpulse(handleOrId: number | string, x: number, y: number, z: number): void;
  applyImpulse(handleOrId: number | string, x: number, y: number, z: number): void;
  /** Applies a world-space impulse at a world-space point, changing linear and angular velocity. */
  applyImpulseAtPoint(handleOrId: number | string, impulseX: number, impulseY: number, impulseZ: number, pointX: number, pointY: number, pointZ: number): void;
  addDistanceConstraint(definition: RigidDistanceConstraint3D): number;
  /** Joins two local anchor points while allowing free relative rotation. */
  addPointConstraint(definition: RigidPointConstraint3D): number;
  /** Drives one body toward a target orientation relative to another through bounded torque impulses. */
  addAngularMotorConstraint(definition: RigidAngularMotorConstraint3D): number;
  /** Keeps relative orientation inside a cone around a canonical reference rotation. */
  addAngularLimitConstraint(definition: RigidAngularLimitConstraint3D): number;
  /** Separately bounds swing and signed longitudinal twist around a canonical relative rotation. */
  addAngularSwingTwistLimitConstraint(definition: RigidAngularSwingTwistLimitConstraint3D): number;
  configureAngularMotorConstraint(handleOrId: number | string, update: RigidAngularMotorUpdate3D): RigidConstraintState3D;
  removeConstraint(handleOrId: number | string): boolean;
  constraint(handleOrId: number | string): RigidConstraintState3D | undefined;
  /** Writes deterministic telemetry from the most recent solver step. */
  constraintTelemetry(handleOrId: number | string, target: RigidConstraintTelemetry3D): RigidConstraintTelemetry3D | undefined;
  constraintCount(): number;
  /** Captures deterministic dynamic state; restore requires identical body topology. */
  checkpoint(): RigidWorldCheckpoint3D;
  restoreCheckpoint(checkpoint: Readonly<RigidWorldCheckpoint3D>): void;
  step(seconds: number): number;
  contactCount(): number;
  /** Portable saves retain contact observations and manifold warm-start history. */
  captureContactState(): RigidContactSnapshot3D;
  validateContactState(value: unknown): RigidContactSnapshot3D;
  restoreContactState(value: unknown): void;
  contact(index: number, target: RigidContact3D): RigidContact3D;
  /** Writes stable numeric handles and returns the number written. */
  queryAabb(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, output: Float64Array): number;
  /** Writes the closest hit into caller-owned target and returns whether one exists. */
  raycast(originX: number, originY: number, originZ: number, directionX: number, directionY: number, directionZ: number, maxDistance: number, layerMask: number, target: RigidRaycastHit3D): boolean;
  /** Sweeps a sphere through a world-space displacement and writes the earliest stable hit. */
  sweepSphere(originX: number, originY: number, originZ: number, deltaX: number, deltaY: number, deltaZ: number, radius: number, layerMask: number, target: RigidSweepHit3D): boolean;
  debugSegmentCount(sphereSegments?: number): number;
  /** Writes x1,y1,z1,x2,y2,z2,tag records and returns the number written. */
  writeDebugSegments(output: Float32Array, sphereSegments?: number): number;
};

import {
boundedInteger,
finite,
identifier,
interval,
nonnegative,
type ContactScratch,
type SweepScratch,
} from "./rigid-3d-internals.ts";
import {
createRigidBaseOperations,

createRigidCcdOperations,

type RigidMutableState,
type RigidOperationContext,
type RigidOperations,
} from "./rigid-3d-operations.ts";

export {
RIGID_DEBUG_CONTACT_3D,
RIGID_DEBUG_DYNAMIC_3D,
RIGID_DEBUG_KINEMATIC_3D,
RIGID_DEBUG_SEGMENT_STRIDE_3D,
RIGID_DEBUG_STATIC_3D,
RIGID_DEBUG_TRIGGER_3D
} from "./rigid-3d-internals.ts";

export function createRigidWorld3D(options: RigidWorldOptions3D = {}): RigidWorld3D {
  const capacity = boundedInteger(options.capacity ?? 1_024, 1, 65_536, "capacity");
  const maxContacts = boundedInteger(options.maxContacts ?? Math.min(capacity * 4, 262_144), 1, 262_144, "maxContacts");
  const maxCandidatePairs = boundedInteger(options.maxCandidatePairs ?? Math.min(capacity * 16, 1_000_000), 1, 1_000_000, "maxCandidatePairs");
  const maxCcdTests = boundedInteger(options.maxCcdTests ?? Math.min(capacity * 8, 1_000_000), 1, 1_000_000, "maxCcdTests");
  const velocityIterations = boundedInteger(options.velocityIterations ?? 4, 1, 16, "velocityIterations");
  const positionIterations = boundedInteger(options.positionIterations ?? 2, 1, 16, "positionIterations");
  const maxConstraints = boundedInteger(options.maxConstraints ?? capacity, 0, 65_536, "maxConstraints");
  const constraintIterations = boundedInteger(options.constraintIterations ?? 4, 1, 32, "constraintIterations");
  const gravityX = finite(options.gravityX ?? 0, "gravityX");
  const gravityY = finite(options.gravityY ?? -9.81, "gravityY");
  const gravityZ = finite(options.gravityZ ?? 0, "gravityZ");
  const precision = options.precision ?? "float64";
  if (precision !== "float32" && precision !== "float64") throw new RangeError(`Unsupported rigid physics precision: ${String(precision)}`);
  const FloatStorage = precision === "float32" ? Float32Array : Float64Array;
  const alive = new Uint8Array(capacity);
  const bodyType = new Uint8Array(capacity);
  const shapeKind = new Uint8Array(capacity);
  const flags = new Uint8Array(capacity);
  const generation = new Uint32Array(capacity);
  const layer = new Uint32Array(capacity);
  const mask = new Uint32Array(capacity);
  const positionX = new FloatStorage(capacity);
  const positionY = new FloatStorage(capacity);
  const positionZ = new FloatStorage(capacity);
  const previousX = new FloatStorage(capacity);
  const previousY = new FloatStorage(capacity);
  const previousZ = new FloatStorage(capacity);
  const velocityX = new FloatStorage(capacity);
  const velocityY = new FloatStorage(capacity);
  const velocityZ = new FloatStorage(capacity);
  const rotationX = new FloatStorage(capacity);
  const rotationY = new FloatStorage(capacity);
  const rotationZ = new FloatStorage(capacity);
  const rotationW = new FloatStorage(capacity);
  const previousRotationX = new FloatStorage(capacity);
  const previousRotationY = new FloatStorage(capacity);
  const previousRotationZ = new FloatStorage(capacity);
  const previousRotationW = new FloatStorage(capacity);
  const angularVelocityX = new FloatStorage(capacity);
  const angularVelocityY = new FloatStorage(capacity);
  const angularVelocityZ = new FloatStorage(capacity);
  const linearDamping = new FloatStorage(capacity);
  const angularDamping = new FloatStorage(capacity);
  const extentX = new FloatStorage(capacity);
  const extentY = new FloatStorage(capacity);
  const extentZ = new FloatStorage(capacity);
  const inverseMass = new FloatStorage(capacity);
  const inverseInertiaX = new FloatStorage(capacity);
  const inverseInertiaY = new FloatStorage(capacity);
  const inverseInertiaZ = new FloatStorage(capacity);
  const restitution = new FloatStorage(capacity);
  const friction = new FloatStorage(capacity);
  const gravityScale = new FloatStorage(capacity);
  const fractureEnergyJoules = new FloatStorage(capacity);
  const retainedEnergyRatio = new FloatStorage(capacity);
  const aabbMinX = new FloatStorage(capacity);
  const aabbMinY = new FloatStorage(capacity);
  const aabbMinZ = new FloatStorage(capacity);
  const aabbMaxX = new FloatStorage(capacity);
  const aabbMaxY = new FloatStorage(capacity);
  const aabbMaxZ = new FloatStorage(capacity);
  const free = new Int32Array(capacity);
  const sort = new Int32Array(capacity);
  const sortScratch = new Int32Array(capacity);
  const contactA = new Int32Array(maxContacts);
  const contactB = new Int32Array(maxContacts);
  const contactNormalX = new FloatStorage(maxContacts);
  const contactNormalY = new FloatStorage(maxContacts);
  const contactNormalZ = new FloatStorage(maxContacts);
  const contactPenetration = new FloatStorage(maxContacts);
  const contactPointX = new FloatStorage(maxContacts);
  const contactPointY = new FloatStorage(maxContacts);
  const contactPointZ = new FloatStorage(maxContacts);
  const contactTrigger = new Uint8Array(maxContacts);
  const contactClosingSpeed = new FloatStorage(maxContacts);
  const contactEffectiveMass = new FloatStorage(maxContacts);
  const contactImpactEnergy = new FloatStorage(maxContacts);
  const contactNormalImpulse = new FloatStorage(maxContacts);
  const contactFailedBody = new Int32Array(maxContacts);
  const contactManifoldPointCount = new Uint8Array(maxContacts);
  const contactManifoldPointX = new FloatStorage(maxContacts * 4);
  const contactManifoldPointY = new FloatStorage(maxContacts * 4);
  const contactManifoldPointZ = new FloatStorage(maxContacts * 4);
  const contactImpactPoint = new Uint8Array(maxContacts);
  const contactManifoldClosingSpeed = new FloatStorage(maxContacts * 4);
  const contactManifoldNormalImpulse = new FloatStorage(maxContacts * 4);
  const contactManifoldFrictionX = new FloatStorage(maxContacts * 4);
  const contactManifoldFrictionY = new FloatStorage(maxContacts * 4);
  const contactManifoldFrictionZ = new FloatStorage(maxContacts * 4);
  const contactManifoldWarmStarted = new Uint8Array(maxContacts * 4);
  const contactWarmStartedPointCount = new Uint8Array(maxContacts);
  const previousContactA = new Int32Array(maxContacts);
  const previousContactB = new Int32Array(maxContacts);
  const previousContactNormalX = new FloatStorage(maxContacts);
  const previousContactNormalY = new FloatStorage(maxContacts);
  const previousContactNormalZ = new FloatStorage(maxContacts);
  const previousManifoldPointCount = new Uint8Array(maxContacts);
  const previousManifoldPointX = new FloatStorage(maxContacts * 4);
  const previousManifoldPointY = new FloatStorage(maxContacts * 4);
  const previousManifoldPointZ = new FloatStorage(maxContacts * 4);
  const previousManifoldNormalImpulse = new FloatStorage(maxContacts * 4);
  const previousManifoldFrictionX = new FloatStorage(maxContacts * 4);
  const previousManifoldFrictionY = new FloatStorage(maxContacts * 4);
  const previousManifoldFrictionZ = new FloatStorage(maxContacts * 4);
  const previousManifoldUsed = new Uint8Array(maxContacts * 4);
  contactFailedBody.fill(-1);
  const numericArrays: Array<{ byteLength: number }> = [
      alive, bodyType, shapeKind, flags, generation, layer, mask,
      positionX, positionY, positionZ, previousX, previousY, previousZ,
      velocityX, velocityY, velocityZ, rotationX, rotationY, rotationZ, rotationW,
      previousRotationX, previousRotationY, previousRotationZ, previousRotationW,
      angularVelocityX, angularVelocityY, angularVelocityZ, linearDamping, angularDamping, extentX, extentY, extentZ,
      inverseMass, inverseInertiaX, inverseInertiaY, inverseInertiaZ, restitution, friction, gravityScale, fractureEnergyJoules, retainedEnergyRatio,
      aabbMinX, aabbMinY, aabbMinZ, aabbMaxX, aabbMaxY, aabbMaxZ,
      free, sort, sortScratch,
      contactA, contactB, contactNormalX, contactNormalY, contactNormalZ,
      contactPenetration, contactPointX, contactPointY, contactPointZ, contactTrigger, contactClosingSpeed, contactEffectiveMass, contactImpactEnergy, contactNormalImpulse, contactFailedBody,
      contactManifoldPointCount, contactManifoldPointX, contactManifoldPointY, contactManifoldPointZ, contactImpactPoint,
      contactManifoldClosingSpeed, contactManifoldNormalImpulse, contactManifoldFrictionX, contactManifoldFrictionY, contactManifoldFrictionZ, contactManifoldWarmStarted, contactWarmStartedPointCount,
      previousContactA, previousContactB, previousContactNormalX, previousContactNormalY, previousContactNormalZ, previousManifoldPointCount, previousManifoldPointX, previousManifoldPointY, previousManifoldPointZ, previousManifoldNormalImpulse, previousManifoldFrictionX, previousManifoldFrictionY, previousManifoldFrictionZ, previousManifoldUsed,
    ];
  const numericStorageBytes = numericArrays.reduce((sum, value) => sum + value.byteLength, 0);
  const ids = new Array<string | undefined>(capacity);
  const indexById = new Map<string, number>();
  let freeCount = capacity;
  let bodyCount = 0;
  let currentContacts = 0;
  for (let index = 0; index < capacity; index += 1) {
      free[index] = capacity - index - 1;
      generation[index] = 1;
    }
  const diagnostics: RigidWorldDiagnostics3D = {
      steps: 0,
      bodies: 0,
      candidatePairs: 0,
      candidateOverflows: 0,
      contacts: 0,
      contactOverflows: 0,
      ccdEligiblePairs: 0,
      ccdBoundsRejects: 0,
      ccdTests: 0,
      ccdTestOverflows: 0,
      ccdHits: 0,
      ccdAngularTests: 0,
      ccdAngularHits: 0,
      ccdConservativeHits: 0,
      queryTruncations: 0,
      constraints: 0,
      constraintBreaks: 0,
    };
  const contactScratch: ContactScratch = { normalX: 0, normalY: 0, normalZ: 0, penetration: 0, pointX: 0, pointY: 0, pointZ: 0 };
  const sweepScratch: SweepScratch = { time: 0, normalX: 0, normalY: 0, normalZ: 0 };
  const mutable: RigidMutableState = {
    get freeCount() { return freeCount; }, set freeCount(value) { freeCount = value; },
    get bodyCount() { return bodyCount; }, set bodyCount(value) { bodyCount = value; },
    get currentContacts() { return currentContacts; }, set currentContacts(value) { currentContacts = value; },
  };
  const operationContext: RigidOperationContext = {
    config: { capacity, maxContacts, maxCandidatePairs, maxCcdTests, velocityIterations, positionIterations, gravityX, gravityY, gravityZ },
    bodies: { alive, bodyType, shapeKind, flags, generation, layer, mask, positionX, positionY, positionZ, previousX, previousY, previousZ, velocityX, velocityY, velocityZ, rotationX, rotationY, rotationZ, rotationW, previousRotationX, previousRotationY, previousRotationZ, previousRotationW, angularVelocityX, angularVelocityY, angularVelocityZ, linearDamping, angularDamping, extentX, extentY, extentZ, inverseMass, inverseInertiaX, inverseInertiaY, inverseInertiaZ, restitution, friction, gravityScale, fractureEnergyJoules, retainedEnergyRatio, aabbMinX, aabbMinY, aabbMinZ, aabbMaxX, aabbMaxY, aabbMaxZ, free, sort, sortScratch, ids, indexById },
    contactStorage: { contactA, contactB, contactNormalX, contactNormalY, contactNormalZ, contactPenetration, contactPointX, contactPointY, contactPointZ, contactTrigger, contactClosingSpeed, contactEffectiveMass, contactImpactEnergy, contactNormalImpulse, contactFailedBody, contactManifoldPointCount, contactManifoldPointX, contactManifoldPointY, contactManifoldPointZ, contactImpactPoint, contactManifoldClosingSpeed, contactManifoldNormalImpulse, contactManifoldFrictionX, contactManifoldFrictionY, contactManifoldFrictionZ, contactManifoldWarmStarted, contactWarmStartedPointCount, previousContactA, previousContactB, previousContactNormalX, previousContactNormalY, previousContactNormalZ, previousManifoldPointCount, previousManifoldPointX, previousManifoldPointY, previousManifoldPointZ, previousManifoldNormalImpulse, previousManifoldFrictionX, previousManifoldFrictionY, previousManifoldFrictionZ, previousManifoldUsed },
    diagnostics,
    contactScratch,
    sweepScratch,
    mutable,
  };
  const rigidOperations1 = createRigidBaseOperations(operationContext);
  const { handleAt, resolve, updateAabb, activeInverseMass,  } = rigidOperations1;
  const constraintStore = createRigidConstraintStore3D({
      capacity: maxConstraints,
      iterations: constraintIterations,
      alive,
      positionX,
      positionY,
      positionZ,
      velocityX,
      velocityY,
      velocityZ,
      resolveBody: resolve,
      bodyHandle: handleAt,
      activeInverseMass,
      applyInverseInertia: rigidOperations1.applyInverseInertia,
      applyRotationDelta: rigidOperations1.applyRotationDelta,
      rotationX,
      rotationY,
      rotationZ,
      rotationW,
      angularVelocityX,
      angularVelocityY,
      angularVelocityZ,
      updateAabb,
      identifier,
      nonnegative,
      finite,
      interval,
      onCountChanged(count) { diagnostics.constraints = count; },
      onBreak() { diagnostics.constraintBreaks += 1; },
    });
  const rigidOperations3 = createRigidCcdOperations(operationContext, rigidOperations1);
    const operations: RigidOperations = {
    ...rigidOperations1,
    ...rigidOperations3,
  };
  return createRigidWorld3DApi({
    context: operationContext,
    operations,
    constraintStore,
    precision,
    numericStorageBytes: numericStorageBytes + rigidOperations3.contactIndexStorageBytes,
  });
}
