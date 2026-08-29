import { createRigidConstraintStore3D } from "./rigid-3d-constraints.ts";
import { createRigidWorld3DApi } from "./rigid-3d-api.ts";

export type RigidBodyType3D = "static" | "dynamic" | "kinematic";
export type RigidPhysicsPrecision3D = "float32" | "float64";

export type RigidShape3D =
  | { kind: "sphere"; radius: number }
  | { kind: "box"; halfX: number; halfY: number; halfZ: number };

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
  /** Normalized xyzw orientation. Rotated boxes use conservative world AABBs for collision. */
  rotation?: ArrayLike<number>;
  angularVelocity?: ArrayLike<number>;
  angularDamping?: number;
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
  trigger: boolean;
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

export type RigidWorldDiagnostics3D = {
  steps: number;
  bodies: number;
  candidatePairs: number;
  candidateOverflows: number;
  contacts: number;
  contactOverflows: number;
  ccdTests: number;
  ccdTestOverflows: number;
  ccdHits: number;
  /** Mixed sphere/box sweeps use a conservative expanded-AABB test. */
  ccdConservativeHits: number;
  queryTruncations: number;
  constraints: number;
};

export type RigidDistanceConstraint3D = { id: string; a: number | string; b: number | string; distance?: number; stiffness?: number };
export type RigidConstraintState3D = { handle: number; id: string; a: number; b: number; distance: number; stiffness: number };

export type RigidWorldOptions3D = {
  capacity?: number;
  maxContacts?: number;
  maxCandidatePairs?: number;
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
  setPosition(handleOrId: number | string, x: number, y: number, z: number): void;
  setVelocity(handleOrId: number | string, x: number, y: number, z: number): void;
  setRotation(handleOrId: number | string, x: number, y: number, z: number, w: number): void;
  setAngularVelocity(handleOrId: number | string, x: number, y: number, z: number): void;
  applyTorqueImpulse(handleOrId: number | string, x: number, y: number, z: number): void;
  applyImpulse(handleOrId: number | string, x: number, y: number, z: number): void;
  addDistanceConstraint(definition: RigidDistanceConstraint3D): number;
  removeConstraint(handleOrId: number | string): boolean;
  constraint(handleOrId: number | string): RigidConstraintState3D | undefined;
  constraintCount(): number;
  step(seconds: number): number;
  contactCount(): number;
  contact(index: number, target: RigidContact3D): RigidContact3D;
  /** Writes stable numeric handles and returns the number written. */
  queryAabb(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, output: Float64Array): number;
  /** Writes the closest hit into caller-owned target and returns whether one exists. */
  raycast(originX: number, originY: number, originZ: number, directionX: number, directionY: number, directionZ: number, maxDistance: number, layerMask: number, target: RigidRaycastHit3D): boolean;
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
  createRigidBroadphaseOperations,
  createRigidCcdOperations,
  createRigidCollisionOperations,
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
  RIGID_DEBUG_TRIGGER_3D,
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
  const angularVelocityX = new FloatStorage(capacity);
  const angularVelocityY = new FloatStorage(capacity);
  const angularVelocityZ = new FloatStorage(capacity);
  const angularDamping = new FloatStorage(capacity);
  const extentX = new FloatStorage(capacity);
  const extentY = new FloatStorage(capacity);
  const extentZ = new FloatStorage(capacity);
  const inverseMass = new FloatStorage(capacity);
  const restitution = new FloatStorage(capacity);
  const friction = new FloatStorage(capacity);
  const gravityScale = new FloatStorage(capacity);
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
  const numericArrays: Array<{ byteLength: number }> = [
      alive, bodyType, shapeKind, flags, generation, layer, mask,
      positionX, positionY, positionZ, previousX, previousY, previousZ,
      velocityX, velocityY, velocityZ, rotationX, rotationY, rotationZ, rotationW,
      angularVelocityX, angularVelocityY, angularVelocityZ, angularDamping, extentX, extentY, extentZ,
      inverseMass, restitution, friction, gravityScale,
      aabbMinX, aabbMinY, aabbMinZ, aabbMaxX, aabbMaxY, aabbMaxZ,
      free, sort, sortScratch,
      contactA, contactB, contactNormalX, contactNormalY, contactNormalZ,
      contactPenetration, contactPointX, contactPointY, contactPointZ, contactTrigger,
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
      ccdTests: 0,
      ccdTestOverflows: 0,
      ccdHits: 0,
      ccdConservativeHits: 0,
      queryTruncations: 0,
      constraints: 0,
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
    bodies: { alive, bodyType, shapeKind, flags, generation, layer, mask, positionX, positionY, positionZ, previousX, previousY, previousZ, velocityX, velocityY, velocityZ, rotationX, rotationY, rotationZ, rotationW, angularVelocityX, angularVelocityY, angularVelocityZ, angularDamping, extentX, extentY, extentZ, inverseMass, restitution, friction, gravityScale, aabbMinX, aabbMinY, aabbMinZ, aabbMaxX, aabbMaxY, aabbMaxZ, free, sort, sortScratch, ids, indexById },
    contactStorage: { contactA, contactB, contactNormalX, contactNormalY, contactNormalZ, contactPenetration, contactPointX, contactPointY, contactPointZ, contactTrigger },
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
      resolveBody: resolve,
      bodyHandle: handleAt,
      activeInverseMass,
      updateAabb,
      identifier,
      nonnegative,
      interval,
      onCountChanged(count) { diagnostics.constraints = count; },
    });
  const rigidOperations2 = createRigidCollisionOperations(operationContext, { ...rigidOperations1 });
  const rigidOperations3 = createRigidCcdOperations(operationContext, { ...rigidOperations1, ...rigidOperations2 });
  const rigidOperations4 = createRigidBroadphaseOperations(operationContext, { ...rigidOperations1, ...rigidOperations2 });
  const {  } = rigidOperations2;
  const {  } = rigidOperations3;
  const {  } = rigidOperations4;
    const operations: RigidOperations = {
    ...rigidOperations1,
    ...rigidOperations2,
    ...rigidOperations3,
    ...rigidOperations4,
  };
  return createRigidWorld3DApi({
    context: operationContext,
    operations,
    constraintStore,
    precision,
    numericStorageBytes,
  });
}
