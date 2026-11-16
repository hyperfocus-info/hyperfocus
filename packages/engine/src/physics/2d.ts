import {


  type PhysicsContact2D,
  type PhysicsRaycastHit2D,
  type PhysicsShapeCastHit2D
} from "./2d-query-targets.ts";
import {



  boundedInteger,
  finite,
  nonnegative,
  positive,
} from "./2d-internals.ts";
import { createPhysicsWorld2DApi } from "./2d-api.ts";
import { createPhysics2DHandles } from './lifecycle/handles-2d.ts';
import {
  createPhysics2DContactOperations,
  createPhysics2DGeometryOperations,
  createPhysics2DIntegrationOperations,
  createPhysics2DLifecycleOperations,
  createPhysics2DSolverOperations,
  type Physics2DMutableState,
  type Physics2DOperationContext,
  type Physics2DOperations,
} from "./2d-operations.ts";
export type { PhysicsContact2D, PhysicsRaycastHit2D, PhysicsShapeCastHit2D } from "./2d-query-targets.ts";

export type PhysicsBodyType2D = "static" | "dynamic" | "kinematic";
export type PhysicsPrecision = "float32" | "float64";

export type PhysicsShape2D =
  | { kind: "box"; halfWidth: number; halfHeight: number }
  | { kind: "circle"; radius: number };

export type PhysicsBody2DDefinition = {
  id: string;
  type?: PhysicsBodyType2D;
  shape: PhysicsShape2D;
  x?: number;
  y?: number;
  velocityX?: number;
  velocityY?: number;
  angle?: number;
  angularVelocity?: number;
  fixedRotation?: boolean;
  mass?: number;
  restitution?: number;
  friction?: number;
  gravityScale?: number;
  collisionLayer?: number;
  collisionMask?: number;
  trigger?: boolean;
  continuous?: boolean;
  allowSleep?: boolean;
};

export type PhysicsBodyState2D = {
  index: number;
  id: string;
  type: PhysicsBodyType2D;
  shape: PhysicsShape2D;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  angle: number;
  angularVelocity: number;
  trigger: boolean;
  continuous: boolean;
  awake: boolean;
};

export type PhysicsDistanceJoint2DDefinition = {
  id: string;
  a: string | number;
  b: string | number;
  length?: number;
  stiffness?: number;
  damping?: number;
  collideConnected?: boolean;
};

export type PhysicsDistanceJoint2DState = {
  kind: "distance";
  index: number;
  id: string;
  aIndex: number;
  bIndex: number;
  aId: string;
  bId: string;
  length: number;
  stiffness: number;
  damping: number;
  collideConnected: boolean;
};

export type PhysicsRevoluteJoint2DDefinition = {
  id: string;
  a: string | number;
  b: string | number;
  anchorX: number;
  anchorY: number;
  stiffness?: number;
  damping?: number;
  collideConnected?: boolean;
};

export type PhysicsRevoluteJoint2DState = {
  kind: "revolute";
  index: number;
  id: string;
  aIndex: number;
  bIndex: number;
  aId: string;
  bId: string;
  anchorX: number;
  anchorY: number;
  stiffness: number;
  damping: number;
  collideConnected: boolean;
};

export type PhysicsJoint2DState = PhysicsDistanceJoint2DState | PhysicsRevoluteJoint2DState;

export type PhysicsWorld2DDiagnostics = {
  steps: number;
  candidatePairs: number;
  contactOverflow: number;
  continuousHits: number;
  sleepingBodies: number;
};

export type PhysicsWorld2DOptions = {
  capacity?: number;
  maxContacts?: number;
  maxJoints?: number;
  gravityX?: number;
  gravityY?: number;
  positionIterations?: number;
  sleepLinearThreshold?: number;
  sleepAngularThreshold?: number;
  sleepAfterSeconds?: number;
  /** Float32 storage rounds persistent solver state to WASM-friendly precision. */
  precision?: PhysicsPrecision;
};

export type PhysicsWorld2D = {
  readonly capacity: number;
  readonly maxContacts: number;
  readonly maxJoints: number;
  readonly precision: PhysicsPrecision;
  /** Exact bytes reserved by numeric struct-of-arrays and contact buffers. */
  readonly numericStorageBytes: number;
  readonly diagnostics: PhysicsWorld2DDiagnostics;
  addBody(definition: PhysicsBody2DDefinition): number;
  removeBody(id: string): boolean;
  hasBody(id: string): boolean;
  bodyIndex(id: string): number;
  body(indexOrId: number | string): PhysicsBodyState2D | undefined;
  setPosition(indexOrId: number | string, x: number, y: number): void;
  setVelocity(indexOrId: number | string, x: number, y: number): void;
  setAwake(indexOrId: number | string, awake: boolean): void;
  applyImpulse(indexOrId: number | string, x: number, y: number): void;
  applyImpulseAtPoint(indexOrId: number | string, x: number, y: number, pointX: number, pointY: number): void;
  addDistanceJoint(definition: PhysicsDistanceJoint2DDefinition): number;
  addRevoluteJoint(definition: PhysicsRevoluteJoint2DDefinition): number;
  removeJoint(id: string): boolean;
  joint(indexOrId: number | string): PhysicsJoint2DState | undefined;
  jointCount(): number;
  step(seconds: number): number;
  contactCount(): number;
  contact(index: number, target?: PhysicsContact2D): PhysicsContact2D;
  /** Writes generation-checked body handles into caller-owned storage; returns count written. */
  queryAabb(minX: number, minY: number, maxX: number, maxY: number, output: Int32Array): number;
  /** Returns the closest hit; pass a target to keep the query allocation-free. */
  raycast(originX: number, originY: number, directionX: number, directionY: number, maxDistance: number, layerMask?: number, target?: PhysicsRaycastHit2D): PhysicsRaycastHit2D | undefined;
  /** Sweeps a box or circle center against static boxes and returns the earliest hit. */
  shapeCast(shape: PhysicsShape2D, startX: number, startY: number, angle: number, deltaX: number, deltaY: number, layerMask?: number, target?: PhysicsShapeCastHit2D): PhysicsShapeCastHit2D | undefined;
  /** Number of line segments required by writeDebugSegments for the current world. */
  debugSegmentCount(circleSegments?: number): number;
  /** Writes x1,y1,x2,y2,tag records into caller-owned storage. */
  writeDebugSegments(output: Float32Array, circleSegments?: number): number;
};

export {
  PHYSICS_DEBUG_CONTACT,
  PHYSICS_DEBUG_DYNAMIC,
  PHYSICS_DEBUG_JOINT,
  PHYSICS_DEBUG_KINEMATIC,
  PHYSICS_DEBUG_SEGMENT_STRIDE,
  PHYSICS_DEBUG_STATIC,
  PHYSICS_DEBUG_TRIGGER,
} from "./2d-internals.ts";

export function createPhysicsWorld2D(options: PhysicsWorld2DOptions = {}): PhysicsWorld2D {
const capacity = boundedInteger(options.capacity ?? 1_024, 1, 65_536, "capacity");
const maxContacts = boundedInteger(options.maxContacts ?? capacity * 4, 1, 262_144, "maxContacts");
const maxJoints = boundedInteger(options.maxJoints ?? capacity, 0, 65_536, "maxJoints");
const positionIterations = boundedInteger(options.positionIterations ?? 2, 1, 16, "positionIterations");
const gravityX = finite(options.gravityX ?? 0, "gravityX");
const gravityY = finite(options.gravityY ?? 980, "gravityY");
const sleepLinearThreshold = nonnegative(options.sleepLinearThreshold ?? 0.05, "sleepLinearThreshold");
const sleepAngularThreshold = nonnegative(options.sleepAngularThreshold ?? 0.05, "sleepAngularThreshold");
const sleepAfterSeconds = positive(options.sleepAfterSeconds ?? 0.5, "sleepAfterSeconds");
const precision = options.precision ?? "float64";
if (precision !== "float32" && precision !== "float64") throw new RangeError(`Unsupported physics precision: ${String(precision)}`);
const FloatStorage = precision === "float32" ? Float32Array : Float64Array;
const alive = new Uint8Array(capacity);
const bodyHandles = createPhysics2DHandles(alive);
const bodyType = new Uint8Array(capacity);
const shapeKind = new Uint8Array(capacity);
const flags = new Uint8Array(capacity);
const sleeping = new Uint8Array(capacity);
const sleepTime = new FloatStorage(capacity);
const x = new FloatStorage(capacity);
const y = new FloatStorage(capacity);
const velocityX = new FloatStorage(capacity);
const velocityY = new FloatStorage(capacity);
const angle = new FloatStorage(capacity);
const angularVelocity = new FloatStorage(capacity);
const inverseMass = new FloatStorage(capacity);
const inverseInertia = new FloatStorage(capacity);
const extentX = new FloatStorage(capacity);
const extentY = new FloatStorage(capacity);
const restitution = new FloatStorage(capacity);
const friction = new FloatStorage(capacity);
const gravityScale = new FloatStorage(capacity);
const layer = new Uint32Array(capacity);
const mask = new Uint32Array(capacity);
const ids = new Array<string | undefined>(capacity);
const indexById = new Map<string, number>();
const free = new Int32Array(capacity);
const sortIndices = new Int32Array(capacity);
let freeCount = capacity;
for (let index = 0; index < capacity; index += 1) free[index] = capacity - index - 1;
const contactA = new Int32Array(maxContacts);
const contactB = new Int32Array(maxContacts);
const contactNormalX = new FloatStorage(maxContacts);
const contactNormalY = new FloatStorage(maxContacts);
const contactPenetration = new FloatStorage(maxContacts);
const contactPointX = new FloatStorage(maxContacts);
const contactPointY = new FloatStorage(maxContacts);
const contactTrigger = new Uint8Array(maxContacts);
const rayScratch = new FloatStorage(3);
let contacts = 0;
const jointAlive = new Uint8Array(maxJoints);
const jointHandles = createPhysics2DHandles(jointAlive);
const jointKind = new Uint8Array(maxJoints);
const jointFlags = new Uint8Array(maxJoints);
const jointA = new Int32Array(maxJoints);
const jointB = new Int32Array(maxJoints);
const jointLength = new FloatStorage(maxJoints);
const jointStiffness = new FloatStorage(maxJoints);
const jointDamping = new FloatStorage(maxJoints);
const jointAnchorAX = new FloatStorage(maxJoints);
const jointAnchorAY = new FloatStorage(maxJoints);
const jointAnchorBX = new FloatStorage(maxJoints);
const jointAnchorBY = new FloatStorage(maxJoints);
const jointFree = new Int32Array(maxJoints);
const jointIds = new Array<string | undefined>(maxJoints);
const jointIndexById = new Map<string, number>();
const nonCollidingJointPairs = new Map<string, number>();
let jointFreeCount = maxJoints;
let activeJoints = 0;
for (let index = 0; index < maxJoints; index += 1) jointFree[index] = maxJoints - index - 1;
const diagnostics: PhysicsWorld2DDiagnostics = {
    steps: 0,
    candidatePairs: 0,
    contactOverflow: 0,
    continuousHits: 0,
    sleepingBodies: 0,
  };
const resolveIndex = (indexOrId: number | string) => {
    const index = typeof indexOrId === "string" ? indexById.get(indexOrId) : bodyHandles.resolve(indexOrId);
    if (index === undefined) {
      throw new RangeError(`Unknown physics body: ${String(indexOrId)}`);
    }
    return index;
  };
  const state: Physics2DMutableState = {
    get freeCount() { return freeCount; }, set freeCount(value) { freeCount = value; },
    get contacts() { return contacts; }, set contacts(value) { contacts = value; },
    get jointFreeCount() { return jointFreeCount; }, set jointFreeCount(value) { jointFreeCount = value; },
    get activeJoints() { return activeJoints; }, set activeJoints(value) { activeJoints = value; },
  };
  const operationContext: Physics2DOperationContext = {
    config: { capacity, maxContacts, maxJoints, positionIterations, gravityX, gravityY, sleepLinearThreshold, sleepAngularThreshold, sleepAfterSeconds },
    bodies: { alive, bodyType, shapeKind, flags, sleeping, sleepTime, x, y, velocityX, velocityY, angle, angularVelocity, inverseMass, inverseInertia, extentX, extentY, restitution, friction, gravityScale, layer, mask, ids, indexById, free, sortIndices },
    contactStorage: { contactA, contactB, contactNormalX, contactNormalY, contactPenetration, contactPointX, contactPointY, contactTrigger, rayScratch },
    joints: { jointAlive, jointKind, jointFlags, jointA, jointB, jointLength, jointStiffness, jointDamping, jointAnchorAX, jointAnchorAY, jointAnchorBX, jointAnchorBY, jointFree, jointIds, jointIndexById, nonCollidingJointPairs },
    diagnostics,
    bodyHandles,
    jointHandles,
    state,
    resolveIndex,
  };
  const physicsOperations1 = createPhysics2DLifecycleOperations(operationContext);
  const physicsOperations2 = createPhysics2DGeometryOperations(operationContext);
  const physicsOperations3 = createPhysics2DIntegrationOperations(operationContext, { ...physicsOperations1, ...physicsOperations2 });
  const physicsOperations4 = createPhysics2DContactOperations(operationContext, { ...physicsOperations2 });
  const physicsOperations5 = createPhysics2DSolverOperations(operationContext, { ...physicsOperations1 });
  const operations: Physics2DOperations = {
    ...physicsOperations1,
    ...physicsOperations2,
    ...physicsOperations3,
    ...physicsOperations4,
    ...physicsOperations5,
  };
  return createPhysicsWorld2DApi({
    context: operationContext,
    operations,
    precision,
    floatStorageBytes: FloatStorage.BYTES_PER_ELEMENT,
  });
}
