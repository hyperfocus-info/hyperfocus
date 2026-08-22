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

export type PhysicsContact2D = {
  aIndex: number;
  bIndex: number;
  aId: string;
  bId: string;
  normalX: number;
  normalY: number;
  penetration: number;
  pointX: number;
  pointY: number;
  trigger: boolean;
};

export type PhysicsRaycastHit2D = {
  index: number;
  id: string;
  distance: number;
  x: number;
  y: number;
  normalX: number;
  normalY: number;
};

export type PhysicsShapeCastHit2D = {
  index: number;
  id: string;
  fraction: number;
  x: number;
  y: number;
  normalX: number;
  normalY: number;
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
  /** Writes stable body indices into caller-owned storage and returns the number written. */
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

export const PHYSICS_DEBUG_SEGMENT_STRIDE = 5;
export const PHYSICS_DEBUG_STATIC = 0;
export const PHYSICS_DEBUG_DYNAMIC = 1;
export const PHYSICS_DEBUG_KINEMATIC = 2;
export const PHYSICS_DEBUG_TRIGGER = 3;
export const PHYSICS_DEBUG_CONTACT = 4;
export const PHYSICS_DEBUG_JOINT = 5;

const BODY_STATIC = 0;
const BODY_DYNAMIC = 1;
const BODY_KINEMATIC = 2;
const SHAPE_BOX = 0;
const SHAPE_CIRCLE = 1;
const DEFAULT_LAYER = 1;
const DEFAULT_MASK = 0xffff_ffff;
const POSITION_SLOP = 0.0001;
const POSITION_PERCENT = 0.8;
const CONTINUOUS_EPSILON = 1e-7;
const BOX_CORNER_X = [-1, 1, 1, -1] as const;
const BOX_CORNER_Y = [-1, -1, 1, 1] as const;

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
    const index = typeof indexOrId === "string" ? indexById.get(indexOrId) ?? -1 : indexOrId;
    if (!Number.isSafeInteger(index) || index < 0 || index >= capacity || alive[index] === 0) {
      throw new RangeError(`Unknown physics body: ${String(indexOrId)}`);
    }
    return index;
  };

  function addBody(definition: PhysicsBody2DDefinition) {
    if (!definition.id || definition.id.length > 256) throw new RangeError("Physics body id must contain 1-256 characters");
    if (indexById.has(definition.id)) throw new Error(`Physics body id already exists: ${definition.id}`);
    if (freeCount === 0) throw new RangeError(`Physics body capacity ${capacity} is exhausted`);
    const index = free[--freeCount]!;
    const type = definition.type ?? "dynamic";
    const typeCode = type === "static" ? BODY_STATIC : type === "dynamic" ? BODY_DYNAMIC : type === "kinematic" ? BODY_KINEMATIC : -1;
    if (typeCode < 0) throw new TypeError(`Unsupported physics body type: ${String(type)}`);
    const shape = validateShape(definition.shape);
    const mass = finite(definition.mass ?? 1, "mass");
    if (typeCode === BODY_DYNAMIC && mass <= 0) throw new RangeError("Dynamic body mass must be greater than zero");
    const bodyLayer = unsignedBits(definition.collisionLayer ?? DEFAULT_LAYER, "collisionLayer");
    const bodyMask = unsignedBits(definition.collisionMask ?? DEFAULT_MASK, "collisionMask");

    alive[index] = 1;
    bodyType[index] = typeCode;
    shapeKind[index] = shape.kind === "box" ? SHAPE_BOX : SHAPE_CIRCLE;
    flags[index] = (definition.trigger ? 1 : 0) | (definition.continuous ? 2 : 0) | (definition.allowSleep === false ? 4 : 0);
    sleeping[index] = 0;
    sleepTime[index] = 0;
    x[index] = finite(definition.x ?? 0, "x");
    y[index] = finite(definition.y ?? 0, "y");
    velocityX[index] = finite(definition.velocityX ?? 0, "velocityX");
    velocityY[index] = finite(definition.velocityY ?? 0, "velocityY");
    angle[index] = finite(definition.angle ?? 0, "angle");
    angularVelocity[index] = finite(definition.angularVelocity ?? 0, "angularVelocity");
    inverseMass[index] = typeCode === BODY_DYNAMIC ? 1 / mass : 0;
    extentX[index] = shape.kind === "box" ? shape.halfWidth : shape.radius;
    extentY[index] = shape.kind === "box" ? shape.halfHeight : shape.radius;
    const inertia = shape.kind === "box" ? mass * (shape.halfWidth * shape.halfWidth + shape.halfHeight * shape.halfHeight) / 3 : mass * shape.radius * shape.radius / 2;
    inverseInertia[index] = typeCode === BODY_DYNAMIC && !definition.fixedRotation ? 1 / inertia : 0;
    restitution[index] = unitInterval(definition.restitution ?? 0, "restitution");
    friction[index] = nonnegative(definition.friction ?? 0.5, "friction");
    gravityScale[index] = finite(definition.gravityScale ?? 1, "gravityScale");
    layer[index] = bodyLayer;
    mask[index] = bodyMask;
    ids[index] = definition.id;
    indexById.set(definition.id, index);
    return index;
  }

  function removeBody(id: string) {
    const index = indexById.get(id);
    if (index === undefined) return false;
    for (let joint = 0; joint < maxJoints; joint += 1) {
      if (jointAlive[joint] && (jointA[joint] === index || jointB[joint] === index)) {
        throw new Error(`Physics body ${id} is still referenced by joint ${jointIds[joint]}`);
      }
    }
    indexById.delete(id);
    ids[index] = undefined;
    alive[index] = 0;
    flags[index] = 0;
    sleeping[index] = 0;
    sleepTime[index] = 0;
    velocityX[index] = 0;
    velocityY[index] = 0;
    angularVelocity[index] = 0;
    free[freeCount++] = index;
    return true;
  }

  function addDistanceJoint(definition: PhysicsDistanceJoint2DDefinition) {
    if (!definition.id || definition.id.length > 256) throw new RangeError("Physics joint id must contain 1-256 characters");
    if (jointIndexById.has(definition.id)) throw new Error(`Physics joint id already exists: ${definition.id}`);
    if (jointFreeCount === 0) throw new RangeError(`Physics joint capacity ${maxJoints} is exhausted`);
    const a = resolveIndex(definition.a);
    const b = resolveIndex(definition.b);
    if (a === b) throw new Error("A distance joint must connect two different bodies");
    if (inverseMass[a] + inverseMass[b] <= 0) throw new Error("A distance joint must include at least one dynamic body");
    const authoredLength = definition.length ?? Math.hypot(x[b] - x[a], y[b] - y[a]);
    const length = nonnegative(authoredLength, "joint length");
    const stiffness = unitInterval(definition.stiffness ?? 1, "joint stiffness");
    const damping = unitInterval(definition.damping ?? 0.15, "joint damping");
    const index = jointFree[--jointFreeCount]!;
    jointAlive[index] = 1;
    jointKind[index] = 0;
    jointFlags[index] = definition.collideConnected === true ? 1 : 0;
    jointA[index] = a;
    jointB[index] = b;
    jointLength[index] = length;
    jointStiffness[index] = stiffness;
    jointDamping[index] = damping;
    jointIds[index] = definition.id;
    jointIndexById.set(definition.id, index);
    activeJoints += 1;
    if (!definition.collideConnected) incrementPair(nonCollidingJointPairs, bodyPairKey(a, b));
    return index;
  }

  function addRevoluteJoint(definition: PhysicsRevoluteJoint2DDefinition) {
    if (!definition.id || definition.id.length > 256) throw new RangeError("Physics joint id must contain 1-256 characters");
    if (jointIndexById.has(definition.id)) throw new Error(`Physics joint id already exists: ${definition.id}`);
    if (jointFreeCount === 0) throw new RangeError(`Physics joint capacity ${maxJoints} is exhausted`);
    const a = resolveIndex(definition.a);
    const b = resolveIndex(definition.b);
    if (a === b) throw new Error("A revolute joint must connect two different bodies");
    if (inverseMass[a] + inverseMass[b] <= 0) throw new Error("A revolute joint must include at least one dynamic body");
    const anchorX = finite(definition.anchorX, "anchorX");
    const anchorY = finite(definition.anchorY, "anchorY");
    const stiffness = unitInterval(definition.stiffness ?? 1, "joint stiffness");
    const damping = unitInterval(definition.damping ?? 0.15, "joint damping");
    const cosineA = Math.cos(angle[a]);
    const sineA = Math.sin(angle[a]);
    const cosineB = Math.cos(angle[b]);
    const sineB = Math.sin(angle[b]);
    const offsetAX = anchorX - x[a];
    const offsetAY = anchorY - y[a];
    const offsetBX = anchorX - x[b];
    const offsetBY = anchorY - y[b];
    const index = jointFree[--jointFreeCount]!;
    jointAlive[index] = 1;
    jointKind[index] = 1;
    jointFlags[index] = definition.collideConnected === true ? 1 : 0;
    jointA[index] = a;
    jointB[index] = b;
    jointAnchorAX[index] = offsetAX * cosineA + offsetAY * sineA;
    jointAnchorAY[index] = offsetAX * -sineA + offsetAY * cosineA;
    jointAnchorBX[index] = offsetBX * cosineB + offsetBY * sineB;
    jointAnchorBY[index] = offsetBX * -sineB + offsetBY * cosineB;
    jointStiffness[index] = stiffness;
    jointDamping[index] = damping;
    jointIds[index] = definition.id;
    jointIndexById.set(definition.id, index);
    activeJoints += 1;
    if (!definition.collideConnected) incrementPair(nonCollidingJointPairs, bodyPairKey(a, b));
    return index;
  }

  function removeJoint(id: string) {
    const index = jointIndexById.get(id);
    if (index === undefined) return false;
    if ((jointFlags[index] & 1) === 0) decrementPair(nonCollidingJointPairs, bodyPairKey(jointA[index]!, jointB[index]!));
    jointIndexById.delete(id);
    jointIds[index] = undefined;
    jointAlive[index] = 0;
    jointFree[jointFreeCount++] = index;
    activeJoints -= 1;
    return true;
  }

  function setBodyAwake(index: number, nextAwake: boolean) {
    if (bodyType[index] !== BODY_DYNAMIC) return;
    sleeping[index] = nextAwake ? 0 : 1;
    sleepTime[index] = nextAwake ? 0 : sleepAfterSeconds;
    if (!nextAwake) {
      velocityX[index] = 0;
      velocityY[index] = 0;
      angularVelocity[index] = 0;
    }
  }

  function updateSleeping(seconds: number) {
    let count = 0;
    const linearThresholdSquared = sleepLinearThreshold * sleepLinearThreshold;
    for (let index = 0; index < capacity; index += 1) {
      if (!alive[index] || bodyType[index] !== BODY_DYNAMIC) continue;
      if ((flags[index] & 4) !== 0) {
        sleeping[index] = 0;
        sleepTime[index] = 0;
        continue;
      }
      if (sleeping[index]) {
        count += 1;
        continue;
      }
      const linearSpeedSquared = velocityX[index] * velocityX[index] + velocityY[index] * velocityY[index];
      if (linearSpeedSquared <= linearThresholdSquared && Math.abs(angularVelocity[index]) <= sleepAngularThreshold) {
        sleepTime[index] += seconds;
        if (sleepTime[index] >= sleepAfterSeconds) {
          setBodyAwake(index, false);
          count += 1;
        }
      } else {
        sleepTime[index] = 0;
      }
    }
    diagnostics.sleepingBodies = count;
  }

  function integrate(seconds: number) {
    for (let index = 0; index < capacity; index += 1) {
      if (!alive[index] || bodyType[index] === BODY_STATIC) continue;
      if (bodyType[index] === BODY_DYNAMIC && sleeping[index]) continue;
      if (bodyType[index] === BODY_DYNAMIC) {
        velocityX[index] += gravityX * gravityScale[index] * seconds;
        velocityY[index] += gravityY * gravityScale[index] * seconds;
      }
      angle[index] = normalizeAngle(angle[index] + angularVelocity[index] * seconds);
      if ((flags[index] & 2) !== 0) integrateContinuous(index, seconds);
      else {
        x[index] += velocityX[index] * seconds;
        y[index] += velocityY[index] * seconds;
      }
    }
  }

  function integrateContinuous(index: number, seconds: number) {
    let remaining = 1;
    for (let iteration = 0; iteration < 2 && remaining > CONTINUOUS_EPSILON; iteration += 1) {
      const dx = velocityX[index] * seconds * remaining;
      const dy = velocityY[index] * seconds * remaining;
      let hitTime = 1;
      let hitNormalX = 0;
      let hitNormalY = 0;
      for (let other = 0; other < capacity; other += 1) {
        if (!alive[other] || bodyType[other] !== BODY_STATIC || shapeKind[other] !== SHAPE_BOX) continue;
        if ((mask[index] & layer[other]) === 0 || (mask[other] & layer[index]) === 0) continue;
        if ((flags[index] & 1) !== 0 || (flags[other] & 1) !== 0) continue;
        const cosine = Math.cos(angle[other]);
        const sine = Math.sin(angle[other]);
        const offsetX = x[index] - x[other];
        const offsetY = y[index] - y[other];
        const localOriginX = offsetX * cosine + offsetY * sine;
        const localOriginY = offsetX * -sine + offsetY * cosine;
        const localDeltaX = dx * cosine + dy * sine;
        const localDeltaY = dx * -sine + dy * cosine;
        const movingExtentX = projectionRadiusOnAxis(index, cosine, sine);
        const movingExtentY = projectionRadiusOnAxis(index, -sine, cosine);
        const hit = sweepPointAgainstBox(
          localOriginX, localOriginY, localDeltaX, localDeltaY,
          -extentX[other] - movingExtentX,
          -extentY[other] - movingExtentY,
          extentX[other] + movingExtentX,
          extentY[other] + movingExtentY,
        );
        if (hit && hit.time < hitTime) {
          hitTime = hit.time;
          hitNormalX = hit.normalX * cosine - hit.normalY * sine;
          hitNormalY = hit.normalX * sine + hit.normalY * cosine;
        }
      }
      x[index] += dx * Math.max(0, hitTime - CONTINUOUS_EPSILON);
      y[index] += dy * Math.max(0, hitTime - CONTINUOUS_EPSILON);
      if (hitTime >= 1) return;
      diagnostics.continuousHits += 1;
      const intoSurface = velocityX[index] * hitNormalX + velocityY[index] * hitNormalY;
      if (intoSurface < 0) {
        velocityX[index] -= intoSurface * hitNormalX;
        velocityY[index] -= intoSurface * hitNormalY;
      }
      remaining *= 1 - hitTime;
    }
  }

  function buildSortedIndices() {
    let count = 0;
    for (let index = 0; index < capacity; index += 1) if (alive[index]) sortIndices[count++] = index;
    for (let cursor = 1; cursor < count; cursor += 1) {
      const value = sortIndices[cursor]!;
        const valueMin = x[value] - worldExtentX(value);
      let position = cursor - 1;
      while (position >= 0) {
        const previous = sortIndices[position]!;
        const previousMin = x[previous] - worldExtentX(previous);
        if (previousMin < valueMin || (previousMin === valueMin && previous < value)) break;
        sortIndices[position + 1] = previous;
        position -= 1;
      }
      sortIndices[position + 1] = value;
    }
    return count;
  }

  function detectContacts() {
    contacts = 0;
    const sortedCount = buildSortedIndices();
    for (let left = 0; left < sortedCount; left += 1) {
      const a = sortIndices[left]!;
      const aMaxX = x[a] + worldExtentX(a);
      for (let right = left + 1; right < sortedCount; right += 1) {
        const b = sortIndices[right]!;
        if (x[b] - worldExtentX(b) > aMaxX) break;
        if ((mask[a] & layer[b]) === 0 || (mask[b] & layer[a]) === 0) continue;
        if (nonCollidingJointPairs.has(bodyPairKey(a, b))) continue;
        if (bodyType[a] === BODY_STATIC && bodyType[b] === BODY_STATIC) continue;
        diagnostics.candidatePairs += 1;
        const hit = collide(a, b);
        if (!hit) continue;
        if (contacts >= maxContacts) {
          diagnostics.contactOverflow += 1;
          continue;
        }
        contactA[contacts] = a;
        contactB[contacts] = b;
        contactNormalX[contacts] = hit.normalX;
        contactNormalY[contacts] = hit.normalY;
        contactPenetration[contacts] = hit.penetration;
        contactPointX[contacts] = hit.pointX;
        contactPointY[contacts] = hit.pointY;
        contactTrigger[contacts] = (flags[a] | flags[b]) & 1;
        contacts += 1;
      }
    }
  }

  function collide(a: number, b: number): CollisionResult | undefined {
    if (shapeKind[a] === SHAPE_CIRCLE && shapeKind[b] === SHAPE_CIRCLE) return circleCircle(a, b);
    if (shapeKind[a] === SHAPE_BOX && shapeKind[b] === SHAPE_BOX) return boxBox(a, b);
    if (shapeKind[a] === SHAPE_CIRCLE) return circleBox(a, b);
    const result = circleBox(b, a);
    return result ? { normalX: -result.normalX, normalY: -result.normalY, penetration: result.penetration, pointX: result.pointX, pointY: result.pointY } : undefined;
  }

  function boxBox(a: number, b: number): CollisionResult | undefined {
    const deltaX = x[b] - x[a];
    const deltaY = y[b] - y[a];
    const cosA = Math.cos(angle[a]), sinA = Math.sin(angle[a]);
    const cosB = Math.cos(angle[b]), sinB = Math.sin(angle[b]);
    const axes = [cosA, sinA, -sinA, cosA, cosB, sinB, -sinB, cosB];
    let penetration = Infinity;
    let normalX = 0;
    let normalY = 0;
    for (let axisIndex = 0; axisIndex < 4; axisIndex += 1) {
      const axisX = axes[axisIndex * 2]!;
      const axisY = axes[axisIndex * 2 + 1]!;
      const radiusA = extentX[a] * Math.abs(axisX * cosA + axisY * sinA) + extentY[a] * Math.abs(axisX * -sinA + axisY * cosA);
      const radiusB = extentX[b] * Math.abs(axisX * cosB + axisY * sinB) + extentY[b] * Math.abs(axisX * -sinB + axisY * cosB);
      const signedDistance = deltaX * axisX + deltaY * axisY;
      const overlap = radiusA + radiusB - Math.abs(signedDistance);
      if (overlap <= 0) return undefined;
      if (overlap < penetration) {
        penetration = overlap;
        const sign = signedDistance < 0 ? -1 : 1;
        normalX = axisX * sign;
        normalY = axisY * sign;
      }
    }
    const supportAX = x[a] + supportProjectionX(a, normalX, normalY);
    const supportAY = y[a] + supportProjectionY(a, normalX, normalY);
    const supportBX = x[b] + supportProjectionX(b, -normalX, -normalY);
    const supportBY = y[b] + supportProjectionY(b, -normalX, -normalY);
    return { normalX, normalY, penetration, pointX: (supportAX + supportBX) / 2, pointY: (supportAY + supportBY) / 2 };
  }

  function circleCircle(a: number, b: number): CollisionResult | undefined {
    const deltaX = x[b] - x[a];
    const deltaY = y[b] - y[a];
    const radius = extentX[a] + extentX[b];
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;
    if (distanceSquared >= radius * radius) return undefined;
    if (distanceSquared <= Number.EPSILON) {
      const normalX = a < b ? 1 : -1;
      return { normalX, normalY: 0, penetration: radius, pointX: x[a] + normalX * extentX[a], pointY: y[a] };
    }
    const distance = Math.sqrt(distanceSquared);
    const normalX = deltaX / distance;
    const normalY = deltaY / distance;
    return { normalX, normalY, penetration: radius - distance, pointX: x[a] + normalX * extentX[a], pointY: y[a] + normalY * extentX[a] };
  }

  function circleBox(circle: number, box: number): CollisionResult | undefined {
    const cos = Math.cos(angle[box]);
    const sin = Math.sin(angle[box]);
    const worldDeltaX = x[circle] - x[box];
    const worldDeltaY = y[circle] - y[box];
    const localX = worldDeltaX * cos + worldDeltaY * sin;
    const localY = worldDeltaX * -sin + worldDeltaY * cos;
    const closestX = clamp(localX, -extentX[box], extentX[box]);
    const closestY = clamp(localY, -extentY[box], extentY[box]);
    const fromCircleToBoxX = closestX - localX;
    const fromCircleToBoxY = closestY - localY;
    const distanceSquared = fromCircleToBoxX * fromCircleToBoxX + fromCircleToBoxY * fromCircleToBoxY;
    const radius = extentX[circle];
    if (distanceSquared > radius * radius) return undefined;
    if (distanceSquared > Number.EPSILON) {
      const distance = Math.sqrt(distanceSquared);
      const localNormalX = fromCircleToBoxX / distance;
      const localNormalY = fromCircleToBoxY / distance;
      const normalX = localNormalX * cos - localNormalY * sin;
      const normalY = localNormalX * sin + localNormalY * cos;
      return { normalX, normalY, penetration: radius - distance, pointX: x[circle] + normalX * radius, pointY: y[circle] + normalY * radius };
    }
    const gapX = extentX[box] - Math.abs(localX);
    const gapY = extentY[box] - Math.abs(localY);
    const localNormalX = gapX <= gapY ? (localX < 0 ? 1 : -1) : 0;
    const localNormalY = gapX <= gapY ? 0 : (localY < 0 ? 1 : -1);
    const normalX = localNormalX * cos - localNormalY * sin;
    const normalY = localNormalX * sin + localNormalY * cos;
    return { normalX, normalY, penetration: radius + Math.min(gapX, gapY), pointX: x[circle] + normalX * radius, pointY: y[circle] + normalY * radius };
  }

  function worldExtentX(index: number) {
    if (shapeKind[index] === SHAPE_CIRCLE) return extentX[index];
    const cosine = Math.cos(angle[index]);
    const sine = Math.sin(angle[index]);
    return Math.abs(cosine) * extentX[index] + Math.abs(sine) * extentY[index];
  }

  function worldExtentY(index: number) {
    if (shapeKind[index] === SHAPE_CIRCLE) return extentY[index];
    const cosine = Math.cos(angle[index]);
    const sine = Math.sin(angle[index]);
    return Math.abs(sine) * extentX[index] + Math.abs(cosine) * extentY[index];
  }

  function projectionRadiusOnAxis(index: number, axisX: number, axisY: number) {
    if (shapeKind[index] === SHAPE_CIRCLE) return extentX[index];
    const cosine = Math.cos(angle[index]);
    const sine = Math.sin(angle[index]);
    return extentX[index] * Math.abs(axisX * cosine + axisY * sine)
      + extentY[index] * Math.abs(axisX * -sine + axisY * cosine);
  }

  function supportProjectionX(index: number, directionX: number, directionY: number) {
    if (shapeKind[index] === SHAPE_CIRCLE) return directionX * extentX[index];
    const cosine = Math.cos(angle[index]);
    const sine = Math.sin(angle[index]);
    const projectionX = directionX * cosine + directionY * sine;
    const projectionY = directionX * -sine + directionY * cosine;
    const alongX = projectionX < -Number.EPSILON ? -extentX[index] : projectionX > Number.EPSILON ? extentX[index] : 0;
    const alongY = projectionY < -Number.EPSILON ? -extentY[index] : projectionY > Number.EPSILON ? extentY[index] : 0;
    return cosine * alongX - sine * alongY;
  }

  function supportProjectionY(index: number, directionX: number, directionY: number) {
    if (shapeKind[index] === SHAPE_CIRCLE) return directionY * extentX[index];
    const cosine = Math.cos(angle[index]);
    const sine = Math.sin(angle[index]);
    const projectionX = directionX * cosine + directionY * sine;
    const projectionY = directionX * -sine + directionY * cosine;
    const alongX = projectionX < -Number.EPSILON ? -extentX[index] : projectionX > Number.EPSILON ? extentX[index] : 0;
    const alongY = projectionY < -Number.EPSILON ? -extentY[index] : projectionY > Number.EPSILON ? extentY[index] : 0;
    return sine * alongX + cosine * alongY;
  }

  function solveContacts() {
    for (let contactIndex = 0; contactIndex < contacts; contactIndex += 1) {
      if (contactTrigger[contactIndex]) continue;
      const a = contactA[contactIndex]!;
      const b = contactB[contactIndex]!;
      const normalX = contactNormalX[contactIndex]!;
      const normalY = contactNormalY[contactIndex]!;
      const pointX = contactPointX[contactIndex]!;
      const pointY = contactPointY[contactIndex]!;
      const radiusAX = pointX - x[a];
      const radiusAY = pointY - y[a];
      const radiusBX = pointX - x[b];
      const radiusBY = pointY - y[b];
      const centerRelativeX = velocityX[b] - velocityX[a];
      const centerRelativeY = velocityY[b] - velocityY[a];
      const wakeThresholdSquared = sleepLinearThreshold * sleepLinearThreshold;
      if (centerRelativeX * centerRelativeX + centerRelativeY * centerRelativeY > wakeThresholdSquared) {
        if (sleeping[a]) setBodyAwake(a, true);
        if (sleeping[b]) setBodyAwake(b, true);
      }
      const relativeX = velocityX[b] - angularVelocity[b] * radiusBY - (velocityX[a] - angularVelocity[a] * radiusAY);
      const relativeY = velocityY[b] + angularVelocity[b] * radiusBX - (velocityY[a] + angularVelocity[a] * radiusAX);
      const normalSpeed = relativeX * normalX + relativeY * normalY;
      const radiusNormalA = radiusAX * normalY - radiusAY * normalX;
      const radiusNormalB = radiusBX * normalY - radiusBY * normalX;
      const normalDenominator = inverseMass[a] + inverseMass[b] + radiusNormalA * radiusNormalA * inverseInertia[a] + radiusNormalB * radiusNormalB * inverseInertia[b];
      if (normalDenominator <= 0) continue;
      if (normalSpeed < 0) {
        const bounce = Math.max(restitution[a], restitution[b]);
        const normalImpulse = -(1 + bounce) * normalSpeed / normalDenominator;
        const impulseX = normalImpulse * normalX;
        const impulseY = normalImpulse * normalY;
        velocityX[a] -= impulseX * inverseMass[a];
        velocityY[a] -= impulseY * inverseMass[a];
        angularVelocity[a] -= (radiusAX * impulseY - radiusAY * impulseX) * inverseInertia[a];
        velocityX[b] += impulseX * inverseMass[b];
        velocityY[b] += impulseY * inverseMass[b];
        angularVelocity[b] += (radiusBX * impulseY - radiusBY * impulseX) * inverseInertia[b];

        const tangentX = relativeX - normalSpeed * normalX;
        const tangentY = relativeY - normalSpeed * normalY;
        const tangentLength = Math.hypot(tangentX, tangentY);
        if (tangentLength > Number.EPSILON) {
          const unitTangentX = tangentX / tangentLength;
          const unitTangentY = tangentY / tangentLength;
          const radiusTangentA = radiusAX * unitTangentY - radiusAY * unitTangentX;
          const radiusTangentB = radiusBX * unitTangentY - radiusBY * unitTangentX;
          const tangentDenominator = inverseMass[a] + inverseMass[b] + radiusTangentA * radiusTangentA * inverseInertia[a] + radiusTangentB * radiusTangentB * inverseInertia[b];
          const rawFriction = -(relativeX * unitTangentX + relativeY * unitTangentY) / tangentDenominator;
          const frictionLimit = normalImpulse * Math.sqrt(friction[a] * friction[b]);
          const frictionImpulse = clamp(rawFriction, -frictionLimit, frictionLimit);
          velocityX[a] -= frictionImpulse * unitTangentX * inverseMass[a];
          velocityY[a] -= frictionImpulse * unitTangentY * inverseMass[a];
          angularVelocity[a] -= (radiusAX * frictionImpulse * unitTangentY - radiusAY * frictionImpulse * unitTangentX) * inverseInertia[a];
          velocityX[b] += frictionImpulse * unitTangentX * inverseMass[b];
          velocityY[b] += frictionImpulse * unitTangentY * inverseMass[b];
          angularVelocity[b] += (radiusBX * frictionImpulse * unitTangentY - radiusBY * frictionImpulse * unitTangentX) * inverseInertia[b];
        }
      }
    }
    for (let iteration = 0; iteration < positionIterations; iteration += 1) {
      for (let contactIndex = 0; contactIndex < contacts; contactIndex += 1) {
        if (contactTrigger[contactIndex]) continue;
        const a = contactA[contactIndex]!;
        const b = contactB[contactIndex]!;
        const inverseMassSum = inverseMass[a] + inverseMass[b];
        if (inverseMassSum <= 0) continue;
        const correction = Math.max(0, contactPenetration[contactIndex]! - POSITION_SLOP) * POSITION_PERCENT / positionIterations / inverseMassSum;
        const correctionX = correction * contactNormalX[contactIndex]!;
        const correctionY = correction * contactNormalY[contactIndex]!;
        x[a] -= correctionX * inverseMass[a];
        y[a] -= correctionY * inverseMass[a];
        x[b] += correctionX * inverseMass[b];
        y[b] += correctionY * inverseMass[b];
      }
    }
  }

  function solveJoints() {
    for (let joint = 0; joint < maxJoints; joint += 1) {
      if (!jointAlive[joint]) continue;
      const a = jointA[joint]!;
      const b = jointB[joint]!;
      if (jointKind[joint] === 1) {
        const cosineA = Math.cos(angle[a]);
        const sineA = Math.sin(angle[a]);
        const cosineB = Math.cos(angle[b]);
        const sineB = Math.sin(angle[b]);
        const radiusAX = jointAnchorAX[joint] * cosineA - jointAnchorAY[joint] * sineA;
        const radiusAY = jointAnchorAX[joint] * sineA + jointAnchorAY[joint] * cosineA;
        const radiusBX = jointAnchorBX[joint] * cosineB - jointAnchorBY[joint] * sineB;
        const radiusBY = jointAnchorBX[joint] * sineB + jointAnchorBY[joint] * cosineB;
        const anchorAX = x[a] + radiusAX;
        const anchorAY = y[a] + radiusAY;
        const anchorBX = x[b] + radiusBX;
        const anchorBY = y[b] + radiusBY;
        const deltaX = anchorBX - anchorAX;
        const deltaY = anchorBY - anchorAY;
        const velocityAX = velocityX[a] - angularVelocity[a] * radiusAY;
        const velocityAY = velocityY[a] + angularVelocity[a] * radiusAX;
        const velocityBX = velocityX[b] - angularVelocity[b] * radiusBY;
        const velocityBY = velocityY[b] + angularVelocity[b] * radiusBX;
        const relativeX = velocityBX - velocityAX;
        const relativeY = velocityBY - velocityAY;
        if (Math.hypot(deltaX, deltaY) > POSITION_SLOP || Math.hypot(relativeX, relativeY) > sleepLinearThreshold) {
          if (sleeping[a]) setBodyAwake(a, true);
          if (sleeping[b]) setBodyAwake(b, true);
        }
        const denominatorX = inverseMass[a] + inverseMass[b] + radiusAY * radiusAY * inverseInertia[a] + radiusBY * radiusBY * inverseInertia[b];
        const denominatorY = inverseMass[a] + inverseMass[b] + radiusAX * radiusAX * inverseInertia[a] + radiusBX * radiusBX * inverseInertia[b];
        const impulseX = denominatorX > 0 ? relativeX * jointDamping[joint] / denominatorX : 0;
        const impulseY = denominatorY > 0 ? relativeY * jointDamping[joint] / denominatorY : 0;
        velocityX[a] += impulseX * inverseMass[a];
        velocityY[a] += impulseY * inverseMass[a];
        angularVelocity[a] += (radiusAX * impulseY - radiusAY * impulseX) * inverseInertia[a];
        velocityX[b] -= impulseX * inverseMass[b];
        velocityY[b] -= impulseY * inverseMass[b];
        angularVelocity[b] -= (radiusBX * impulseY - radiusBY * impulseX) * inverseInertia[b];
        const inverseMassSum = inverseMass[a] + inverseMass[b];
        if (inverseMassSum > 0) {
          const correctionX = deltaX * jointStiffness[joint] / positionIterations / inverseMassSum;
          const correctionY = deltaY * jointStiffness[joint] / positionIterations / inverseMassSum;
          for (let iteration = 0; iteration < positionIterations; iteration += 1) {
            x[a] += correctionX * inverseMass[a];
            y[a] += correctionY * inverseMass[a];
            x[b] -= correctionX * inverseMass[b];
            y[b] -= correctionY * inverseMass[b];
          }
        }
        continue;
      }
      const deltaX = x[b] - x[a];
      const deltaY = y[b] - y[a];
      const distance = Math.hypot(deltaX, deltaY);
      const normalX = distance > Number.EPSILON ? deltaX / distance : a < b ? 1 : -1;
      const normalY = distance > Number.EPSILON ? deltaY / distance : 0;
      const inverseMassSum = inverseMass[a] + inverseMass[b];
      if (Math.abs(distance - jointLength[joint]) > POSITION_SLOP
        || Math.hypot(velocityX[b] - velocityX[a], velocityY[b] - velocityY[a]) > sleepLinearThreshold) {
        if (sleeping[a]) setBodyAwake(a, true);
        if (sleeping[b]) setBodyAwake(b, true);
      }
      const relativeSpeed = (velocityX[b] - velocityX[a]) * normalX + (velocityY[b] - velocityY[a]) * normalY;
      const dampingImpulse = relativeSpeed * jointDamping[joint] / inverseMassSum;
      velocityX[a] += dampingImpulse * normalX * inverseMass[a];
      velocityY[a] += dampingImpulse * normalY * inverseMass[a];
      velocityX[b] -= dampingImpulse * normalX * inverseMass[b];
      velocityY[b] -= dampingImpulse * normalY * inverseMass[b];
      const totalCorrection = (distance - jointLength[joint]) * jointStiffness[joint] / inverseMassSum;
      for (let iteration = 0; iteration < positionIterations; iteration += 1) {
        const correction = totalCorrection / positionIterations;
        x[a] += correction * normalX * inverseMass[a];
        y[a] += correction * normalY * inverseMass[a];
        x[b] -= correction * normalX * inverseMass[b];
        y[b] -= correction * normalY * inverseMass[b];
      }
    }
  }

  return {
    capacity,
    maxContacts,
    maxJoints,
    precision,
    numericStorageBytes: capacity * (21 + FloatStorage.BYTES_PER_ELEMENT * 14)
      + maxContacts * (9 + FloatStorage.BYTES_PER_ELEMENT * 5)
      + maxJoints * (15 + FloatStorage.BYTES_PER_ELEMENT * 7)
      + FloatStorage.BYTES_PER_ELEMENT * 3,
    diagnostics,
    addBody,
    removeBody,
    hasBody: (id) => indexById.has(id),
    bodyIndex: (id) => indexById.get(id) ?? -1,
    body(indexOrId) {
      const index = typeof indexOrId === "string" ? indexById.get(indexOrId) ?? -1 : indexOrId;
      if (!Number.isSafeInteger(index) || index < 0 || index >= capacity || alive[index] === 0) return undefined;
      const id = ids[index]!;
      return {
        index,
        id,
        type: bodyType[index] === BODY_STATIC ? "static" : bodyType[index] === BODY_DYNAMIC ? "dynamic" : "kinematic",
        shape: shapeKind[index] === SHAPE_BOX
          ? { kind: "box", halfWidth: extentX[index], halfHeight: extentY[index] }
          : { kind: "circle", radius: extentX[index] },
        x: x[index],
        y: y[index],
        velocityX: velocityX[index],
        velocityY: velocityY[index],
        angle: angle[index],
        angularVelocity: angularVelocity[index],
        trigger: (flags[index] & 1) !== 0,
        continuous: (flags[index] & 2) !== 0,
        awake: sleeping[index] === 0,
      };
    },
    setPosition(indexOrId, nextX, nextY) {
      const index = resolveIndex(indexOrId);
      x[index] = finite(nextX, "x");
      y[index] = finite(nextY, "y");
      setBodyAwake(index, true);
    },
    setVelocity(indexOrId, nextX, nextY) {
      const index = resolveIndex(indexOrId);
      velocityX[index] = finite(nextX, "velocityX");
      velocityY[index] = finite(nextY, "velocityY");
      setBodyAwake(index, true);
    },
    setAwake(indexOrId, nextAwake) {
      const index = resolveIndex(indexOrId);
      if (typeof nextAwake !== "boolean") throw new TypeError("awake must be boolean");
      setBodyAwake(index, nextAwake);
    },
    applyImpulse(indexOrId, impulseX, impulseY) {
      const index = resolveIndex(indexOrId);
      if (bodyType[index] !== BODY_DYNAMIC) return;
      setBodyAwake(index, true);
      velocityX[index] += finite(impulseX, "impulseX") * inverseMass[index];
      velocityY[index] += finite(impulseY, "impulseY") * inverseMass[index];
    },
    applyImpulseAtPoint(indexOrId, impulseX, impulseY, pointX, pointY) {
      const index = resolveIndex(indexOrId);
      if (bodyType[index] !== BODY_DYNAMIC) return;
      setBodyAwake(index, true);
      const appliedX = finite(impulseX, "impulseX");
      const appliedY = finite(impulseY, "impulseY");
      const radiusX = finite(pointX, "pointX") - x[index];
      const radiusY = finite(pointY, "pointY") - y[index];
      velocityX[index] += appliedX * inverseMass[index];
      velocityY[index] += appliedY * inverseMass[index];
      angularVelocity[index] += (radiusX * appliedY - radiusY * appliedX) * inverseInertia[index];
    },
    addDistanceJoint,
    addRevoluteJoint,
    removeJoint,
    joint(indexOrId) {
      const index = typeof indexOrId === "string" ? jointIndexById.get(indexOrId) ?? -1 : indexOrId;
      if (!Number.isSafeInteger(index) || index < 0 || index >= maxJoints || !jointAlive[index]) return undefined;
      const a = jointA[index]!;
      const b = jointB[index]!;
      if (jointKind[index] === 1) {
        const cosineA = Math.cos(angle[a]);
        const sineA = Math.sin(angle[a]);
        const cosineB = Math.cos(angle[b]);
        const sineB = Math.sin(angle[b]);
        const anchorAX = x[a] + jointAnchorAX[index] * cosineA - jointAnchorAY[index] * sineA;
        const anchorAY = y[a] + jointAnchorAX[index] * sineA + jointAnchorAY[index] * cosineA;
        const anchorBX = x[b] + jointAnchorBX[index] * cosineB - jointAnchorBY[index] * sineB;
        const anchorBY = y[b] + jointAnchorBX[index] * sineB + jointAnchorBY[index] * cosineB;
        return {
          kind: "revolute",
          index,
          id: jointIds[index]!,
          aIndex: a,
          bIndex: b,
          aId: ids[a]!,
          bId: ids[b]!,
          anchorX: (anchorAX + anchorBX) / 2,
          anchorY: (anchorAY + anchorBY) / 2,
          stiffness: jointStiffness[index]!,
          damping: jointDamping[index]!,
          collideConnected: (jointFlags[index] & 1) !== 0,
        };
      }
      return {
        kind: "distance",
        index,
        id: jointIds[index]!,
        aIndex: a,
        bIndex: b,
        aId: ids[a]!,
        bId: ids[b]!,
        length: jointLength[index]!,
        stiffness: jointStiffness[index]!,
        damping: jointDamping[index]!,
        collideConnected: (jointFlags[index] & 1) !== 0,
      };
    },
    jointCount: () => activeJoints,
    step(seconds) {
      const dt = finite(seconds, "seconds");
      if (dt <= 0 || dt > 0.25) throw new RangeError("Physics step must be greater than zero and at most 0.25 seconds");
      diagnostics.steps += 1;
      diagnostics.candidatePairs = 0;
      integrate(dt);
      detectContacts();
      solveContacts();
      solveJoints();
      updateSleeping(dt);
      return contacts;
    },
    contactCount: () => contacts,
    contact(index, target = {} as PhysicsContact2D) {
      if (!Number.isSafeInteger(index) || index < 0 || index >= contacts) throw new RangeError(`Unknown contact index: ${index}`);
      const a = contactA[index]!;
      const b = contactB[index]!;
      target.aIndex = a;
      target.bIndex = b;
      target.aId = ids[a]!;
      target.bId = ids[b]!;
      target.normalX = contactNormalX[index]!;
      target.normalY = contactNormalY[index]!;
      target.penetration = contactPenetration[index]!;
      target.pointX = contactPointX[index]!;
      target.pointY = contactPointY[index]!;
      target.trigger = contactTrigger[index] !== 0;
      return target;
    },
    queryAabb(minX, minY, maxX, maxY, output) {
      const left = finite(minX, "minX");
      const top = finite(minY, "minY");
      const right = finite(maxX, "maxX");
      const bottom = finite(maxY, "maxY");
      if (right < left || bottom < top) throw new RangeError("Query maximums must not be smaller than minimums");
      let count = 0;
      for (let index = 0; index < capacity && count < output.length; index += 1) {
        if (!alive[index]) continue;
        const halfX = worldExtentX(index);
        const halfY = worldExtentY(index);
        if (x[index] + halfX < left || x[index] - halfX > right) continue;
        if (y[index] + halfY < top || y[index] - halfY > bottom) continue;
        output[count++] = index;
      }
      return count;
    },
    raycast(originX, originY, directionX, directionY, maxDistance, queryMask = DEFAULT_MASK, target = {} as PhysicsRaycastHit2D) {
      const startX = finite(originX, "originX");
      const startY = finite(originY, "originY");
      const rawX = finite(directionX, "directionX");
      const rawY = finite(directionY, "directionY");
      const length = Math.hypot(rawX, rawY);
      if (length <= Number.EPSILON) throw new RangeError("Ray direction must not be zero");
      const limit = nonnegative(maxDistance, "maxDistance");
      const filter = unsignedBits(queryMask, "layerMask");
      const rayX = rawX / length;
      const rayY = rawY / length;
      let closestIndex = -1;
      let closestDistance = limit + Number.EPSILON;
      let closestNormalX = 0;
      let closestNormalY = 0;
      for (let index = 0; index < capacity; index += 1) {
        if (!alive[index] || (layer[index] & filter) === 0) continue;
        let hit: boolean;
        if (shapeKind[index] === SHAPE_BOX) {
          const cosine = Math.cos(angle[index]);
          const sine = Math.sin(angle[index]);
          const offsetX = startX - x[index];
          const offsetY = startY - y[index];
          const localOriginX = offsetX * cosine + offsetY * sine;
          const localOriginY = offsetX * -sine + offsetY * cosine;
          const localDirectionX = rayX * cosine + rayY * sine;
          const localDirectionY = rayX * -sine + rayY * cosine;
          hit = rayBox(localOriginX, localOriginY, localDirectionX, localDirectionY, limit, 0, 0, extentX[index], extentY[index], rayScratch);
          if (hit) {
            const localNormalX = rayScratch[1]!;
            const localNormalY = rayScratch[2]!;
            rayScratch[1] = localNormalX * cosine - localNormalY * sine;
            rayScratch[2] = localNormalX * sine + localNormalY * cosine;
          }
        } else hit = rayCircle(startX, startY, rayX, rayY, limit, x[index], y[index], extentX[index], rayScratch);
        if (!hit || rayScratch[0]! >= closestDistance) continue;
        closestIndex = index;
        closestDistance = rayScratch[0]!;
        closestNormalX = rayScratch[1]!;
        closestNormalY = rayScratch[2]!;
      }
      if (closestIndex < 0) return undefined;
      target.index = closestIndex;
      target.id = ids[closestIndex]!;
      target.distance = closestDistance;
      target.x = startX + rayX * closestDistance;
      target.y = startY + rayY * closestDistance;
      target.normalX = closestNormalX;
      target.normalY = closestNormalY;
      return target;
    },
    shapeCast(authoredShape, authoredStartX, authoredStartY, authoredAngle, authoredDeltaX, authoredDeltaY, layerMask = DEFAULT_MASK, target = {} as PhysicsShapeCastHit2D) {
      const shape = validateShape(authoredShape);
      const startX = finite(authoredStartX, "startX");
      const startY = finite(authoredStartY, "startY");
      const castAngle = finite(authoredAngle, "angle");
      const deltaX = finite(authoredDeltaX, "deltaX");
      const deltaY = finite(authoredDeltaY, "deltaY");
      const castMask = unsignedBits(layerMask, "layerMask");
      let closestIndex = -1;
      let closestFraction = 1;
      let closestNormalX = 0;
      let closestNormalY = 0;
      for (let index = 0; index < capacity; index += 1) {
        if (!alive[index] || bodyType[index] !== BODY_STATIC || shapeKind[index] !== SHAPE_BOX || (flags[index] & 1) !== 0) continue;
        if ((layer[index] & castMask) === 0) continue;
        const cosine = Math.cos(angle[index]);
        const sine = Math.sin(angle[index]);
        const offsetX = startX - x[index];
        const offsetY = startY - y[index];
        const localOriginX = offsetX * cosine + offsetY * sine;
        const localOriginY = offsetX * -sine + offsetY * cosine;
        const localDeltaX = deltaX * cosine + deltaY * sine;
        const localDeltaY = deltaX * -sine + deltaY * cosine;
        let movingExtentX: number;
        let movingExtentY: number;
        if (shape.kind === "circle") {
          movingExtentX = shape.radius;
          movingExtentY = shape.radius;
        } else {
          const movingCosine = Math.cos(castAngle);
          const movingSine = Math.sin(castAngle);
          movingExtentX = shape.halfWidth * Math.abs(cosine * movingCosine + sine * movingSine)
            + shape.halfHeight * Math.abs(cosine * -movingSine + sine * movingCosine);
          movingExtentY = shape.halfWidth * Math.abs(-sine * movingCosine + cosine * movingSine)
            + shape.halfHeight * Math.abs(-sine * -movingSine + cosine * movingCosine);
        }
        const hit = sweepPointAgainstBox(
          localOriginX, localOriginY, localDeltaX, localDeltaY,
          -extentX[index] - movingExtentX,
          -extentY[index] - movingExtentY,
          extentX[index] + movingExtentX,
          extentY[index] + movingExtentY,
        );
        if (!hit || hit.time >= closestFraction) continue;
        closestIndex = index;
        closestFraction = hit.time;
        closestNormalX = hit.normalX * cosine - hit.normalY * sine;
        closestNormalY = hit.normalX * sine + hit.normalY * cosine;
      }
      if (closestIndex < 0) return undefined;
      target.index = closestIndex;
      target.id = ids[closestIndex]!;
      target.fraction = closestFraction;
      target.x = startX + deltaX * closestFraction;
      target.y = startY + deltaY * closestFraction;
      target.normalX = closestNormalX;
      target.normalY = closestNormalY;
      return target;
    },
    debugSegmentCount(circleSegments = 12) {
      const circleEdges = boundedInteger(circleSegments, 3, 128, "circleSegments");
      let count = contacts + activeJoints;
      for (let index = 0; index < capacity; index += 1) {
        if (!alive[index]) continue;
        count += shapeKind[index] === SHAPE_BOX ? 4 : circleEdges;
      }
      return count;
    },
    writeDebugSegments(output, circleSegments = 12) {
      const circleEdges = boundedInteger(circleSegments, 3, 128, "circleSegments");
      let written = 0;
      const write = (x1: number, y1: number, x2: number, y2: number, tag: number) => {
        const offset = written * PHYSICS_DEBUG_SEGMENT_STRIDE;
        if (offset + PHYSICS_DEBUG_SEGMENT_STRIDE > output.length) return false;
        output[offset] = x1;
        output[offset + 1] = y1;
        output[offset + 2] = x2;
        output[offset + 3] = y2;
        output[offset + 4] = tag;
        written += 1;
        return true;
      };
      for (let index = 0; index < capacity; index += 1) {
        if (!alive[index]) continue;
        const tag = (flags[index] & 1) !== 0
          ? PHYSICS_DEBUG_TRIGGER
          : bodyType[index] === BODY_STATIC ? PHYSICS_DEBUG_STATIC
            : bodyType[index] === BODY_DYNAMIC ? PHYSICS_DEBUG_DYNAMIC : PHYSICS_DEBUG_KINEMATIC;
        if (shapeKind[index] === SHAPE_BOX) {
          const cosine = Math.cos(angle[index]);
          const sine = Math.sin(angle[index]);
          for (let edge = 0; edge < 4; edge += 1) {
            const next = (edge + 1) % 4;
            const localStartX = BOX_CORNER_X[edge]! * extentX[index];
            const localStartY = BOX_CORNER_Y[edge]! * extentY[index];
            const localEndX = BOX_CORNER_X[next]! * extentX[index];
            const localEndY = BOX_CORNER_Y[next]! * extentY[index];
            const startX = x[index] + localStartX * cosine - localStartY * sine;
            const startY = y[index] + localStartX * sine + localStartY * cosine;
            const endX = x[index] + localEndX * cosine - localEndY * sine;
            const endY = y[index] + localEndX * sine + localEndY * cosine;
            if (!write(startX, startY, endX, endY, tag)) return written;
          }
        } else {
          let previousX = x[index] + extentX[index];
          let previousY = y[index];
          for (let edge = 1; edge <= circleEdges; edge += 1) {
            const angle = edge / circleEdges * Math.PI * 2;
            const nextX = x[index] + Math.cos(angle) * extentX[index];
            const nextY = y[index] + Math.sin(angle) * extentX[index];
            if (!write(previousX, previousY, nextX, nextY, tag)) return written;
            previousX = nextX;
            previousY = nextY;
          }
        }
      }
      for (let contactIndex = 0; contactIndex < contacts; contactIndex += 1) {
        const a = contactA[contactIndex]!;
        const b = contactB[contactIndex]!;
        const centerX = contactPointX[contactIndex]!;
        const centerY = contactPointY[contactIndex]!;
        if (!write(centerX, centerY, centerX + contactNormalX[contactIndex]! * 12, centerY + contactNormalY[contactIndex]! * 12, PHYSICS_DEBUG_CONTACT)) return written;
      }
      for (let joint = 0; joint < maxJoints; joint += 1) {
        if (!jointAlive[joint]) continue;
        const a = jointA[joint]!;
        const b = jointB[joint]!;
        if (jointKind[joint] === 1) {
          const cosineA = Math.cos(angle[a]);
          const sineA = Math.sin(angle[a]);
          const cosineB = Math.cos(angle[b]);
          const sineB = Math.sin(angle[b]);
          const anchorAX = x[a] + jointAnchorAX[joint] * cosineA - jointAnchorAY[joint] * sineA;
          const anchorAY = y[a] + jointAnchorAX[joint] * sineA + jointAnchorAY[joint] * cosineA;
          const anchorBX = x[b] + jointAnchorBX[joint] * cosineB - jointAnchorBY[joint] * sineB;
          const anchorBY = y[b] + jointAnchorBX[joint] * sineB + jointAnchorBY[joint] * cosineB;
          if (!write(anchorAX, anchorAY, anchorBX, anchorBY, PHYSICS_DEBUG_JOINT)) return written;
        } else if (!write(x[a], y[a], x[b], y[b], PHYSICS_DEBUG_JOINT)) return written;
      }
      return written;
    },
  };
}

type CollisionResult = { normalX: number; normalY: number; penetration: number; pointX: number; pointY: number };

function validateShape(shape: PhysicsShape2D): PhysicsShape2D {
  if (shape.kind === "box") {
    return { kind: "box", halfWidth: positive(shape.halfWidth, "halfWidth"), halfHeight: positive(shape.halfHeight, "halfHeight") };
  }
  if (shape.kind === "circle") return { kind: "circle", radius: positive(shape.radius, "radius") };
  throw new TypeError(`Unsupported 2D physics shape: ${String((shape as { kind?: unknown }).kind)}`);
}

function sweepPointAgainstBox(
  originX: number,
  originY: number,
  deltaX: number,
  deltaY: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
) {
  if (originX > minX && originX < maxX && originY > minY && originY < maxY) return undefined;
  let nearX = -Infinity;
  let farX = Infinity;
  if (deltaX === 0) {
    if (originX < minX || originX > maxX) return undefined;
  } else {
    nearX = (minX - originX) / deltaX;
    farX = (maxX - originX) / deltaX;
    if (nearX > farX) [nearX, farX] = [farX, nearX];
  }
  let nearY = -Infinity;
  let farY = Infinity;
  if (deltaY === 0) {
    if (originY < minY || originY > maxY) return undefined;
  } else {
    nearY = (minY - originY) / deltaY;
    farY = (maxY - originY) / deltaY;
    if (nearY > farY) [nearY, farY] = [farY, nearY];
  }
  const near = Math.max(nearX, nearY);
  const far = Math.min(farX, farY);
  if (near > far || far < 0 || near < 0 || near > 1) return undefined;
  if (nearX > nearY) return { time: near, normalX: deltaX > 0 ? -1 : 1, normalY: 0 };
  return { time: near, normalX: 0, normalY: deltaY > 0 ? -1 : 1 };
}

function rayBox(
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  maximum: number,
  centerX: number,
  centerY: number,
  halfWidth: number,
  halfHeight: number,
  output: Float32Array | Float64Array,
) {
  const minX = centerX - halfWidth;
  const maxX = centerX + halfWidth;
  const minY = centerY - halfHeight;
  const maxY = centerY + halfHeight;
  if (originX >= minX && originX <= maxX && originY >= minY && originY <= maxY) {
    output[0] = 0;
    output[1] = -directionX;
    output[2] = -directionY;
    return true;
  }
  let nearX = -Infinity;
  let farX = Infinity;
  if (directionX === 0) {
    if (originX < minX || originX > maxX) return false;
  } else {
    nearX = (minX - originX) / directionX;
    farX = (maxX - originX) / directionX;
    if (nearX > farX) [nearX, farX] = [farX, nearX];
  }
  let nearY = -Infinity;
  let farY = Infinity;
  if (directionY === 0) {
    if (originY < minY || originY > maxY) return false;
  } else {
    nearY = (minY - originY) / directionY;
    farY = (maxY - originY) / directionY;
    if (nearY > farY) [nearY, farY] = [farY, nearY];
  }
  const near = Math.max(nearX, nearY);
  if (near < 0 || near > maximum || near > Math.min(farX, farY)) return false;
  output[0] = near;
  if (nearX > nearY) {
    output[1] = directionX > 0 ? -1 : 1;
    output[2] = 0;
  } else {
    output[1] = 0;
    output[2] = directionY > 0 ? -1 : 1;
  }
  return true;
}

function rayCircle(
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  maximum: number,
  centerX: number,
  centerY: number,
  radius: number,
  output: Float32Array | Float64Array,
) {
  const offsetX = originX - centerX;
  const offsetY = originY - centerY;
  const inside = offsetX * offsetX + offsetY * offsetY <= radius * radius;
  if (inside) {
    output[0] = 0;
    output[1] = -directionX;
    output[2] = -directionY;
    return true;
  }
  const projection = offsetX * directionX + offsetY * directionY;
  const discriminant = projection * projection - (offsetX * offsetX + offsetY * offsetY - radius * radius);
  if (discriminant < 0) return false;
  const distance = -projection - Math.sqrt(discriminant);
  if (distance < 0 || distance > maximum) return false;
  const hitX = originX + directionX * distance;
  const hitY = originY + directionY * distance;
  output[0] = distance;
  output[1] = (hitX - centerX) / radius;
  output[2] = (hitY - centerY) / radius;
  return true;
}

function finite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}

function positive(value: number, label: string) {
  const checked = finite(value, label);
  if (checked <= 0) throw new RangeError(`${label} must be greater than zero`);
  return checked;
}

function nonnegative(value: number, label: string) {
  const checked = finite(value, label);
  if (checked < 0) throw new RangeError(`${label} must not be negative`);
  return checked;
}

function unitInterval(value: number, label: string) {
  const checked = finite(value, label);
  if (checked < 0 || checked > 1) throw new RangeError(`${label} must be between zero and one`);
  return checked;
}

function unsignedBits(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) throw new RangeError(`${label} must be an unsigned 32-bit integer`);
  return value >>> 0;
}

function boundedInteger(value: number, minimum: number, maximum: number, label: string) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeAngle(value: number) {
  const wrapped = (value + Math.PI) % (Math.PI * 2);
  return (wrapped < 0 ? wrapped + Math.PI * 2 : wrapped) - Math.PI;
}

function bodyPairKey(a: number, b: number) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function incrementPair(entries: Map<string, number>, key: string) {
  entries.set(key, (entries.get(key) ?? 0) + 1);
}

function decrementPair(entries: Map<string, number>, key: string) {
  const count = entries.get(key);
  if (count === undefined || count <= 1) entries.delete(key);
  else entries.set(key, count - 1);
}
