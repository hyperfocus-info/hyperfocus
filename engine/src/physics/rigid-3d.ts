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

export const RIGID_DEBUG_SEGMENT_STRIDE_3D = 7;
export const RIGID_DEBUG_STATIC_3D = 0;
export const RIGID_DEBUG_DYNAMIC_3D = 1;
export const RIGID_DEBUG_KINEMATIC_3D = 2;
export const RIGID_DEBUG_TRIGGER_3D = 3;
export const RIGID_DEBUG_CONTACT_3D = 4;

const TYPE_STATIC = 0;
const TYPE_DYNAMIC = 1;
const TYPE_KINEMATIC = 2;
const SHAPE_SPHERE = 0;
const SHAPE_BOX = 1;
const FLAG_TRIGGER = 1;
const FLAG_CONTINUOUS = 2;
const DEFAULT_LAYER = 1;
const DEFAULT_MASK = 0xffff_ffff;
const HANDLE_STRIDE = 65_536;
const MAX_GENERATION = 0xffff_ffff;
const POSITION_SLOP = 1e-5;
const POSITION_PERCENT = 0.8;
const CCD_EPSILON = 1e-8;
const MAX_ABSOLUTE_SCALAR = 1e12;
const MIN_POSITIVE_SCALAR = 1e-12;

type ContactScratch = {
  normalX: number;
  normalY: number;
  normalZ: number;
  penetration: number;
  pointX: number;
  pointY: number;
  pointZ: number;
};

type SweepScratch = { time: number; normalX: number; normalY: number; normalZ: number };

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
  const constraints = new Array<(RigidConstraintState3D & { aIndex: number; bIndex: number }) | undefined>(maxConstraints);
  const constraintById = new Map<string, number>();
  const freeConstraints: number[] = Array.from({ length: maxConstraints }, (_, index) => maxConstraints - index - 1);
  let activeConstraints = 0;
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

  function handleAt(index: number): number {
    return generation[index]! * HANDLE_STRIDE + index;
  }

  function resolve(value: number | string): number {
    if (typeof value === "string") {
      const index = indexById.get(value);
      if (index === undefined || alive[index] === 0) throw new Error(`Rigid body ${JSON.stringify(value)} does not exist.`);
      return index;
    }
    if (!Number.isSafeInteger(value) || value < HANDLE_STRIDE) throw new Error(`Rigid body handle ${value} is invalid or stale.`);
    const index = value % HANDLE_STRIDE;
    const expectedGeneration = Math.floor(value / HANDLE_STRIDE);
    if (index >= capacity || alive[index] === 0 || generation[index] !== expectedGeneration) throw new Error(`Rigid body handle ${value} is invalid or stale.`);
    return index;
  }

  function resolveOptional(value: number | string): number | undefined {
    try { return resolve(value); }
    catch { return undefined; }
  }

  function updateAabb(index: number): void {
    let worldX = extentX[index]!, worldY = extentY[index]!, worldZ = extentZ[index]!;
    if (shapeKind[index] === SHAPE_BOX) {
      const x = rotationX[index]!, y = rotationY[index]!, z = rotationZ[index]!, w = rotationW[index]!;
      const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
      const m00 = 1 - 2 * (yy + zz), m01 = 2 * (xy - wz), m02 = 2 * (xz + wy);
      const m10 = 2 * (xy + wz), m11 = 1 - 2 * (xx + zz), m12 = 2 * (yz - wx);
      const m20 = 2 * (xz - wy), m21 = 2 * (yz + wx), m22 = 1 - 2 * (xx + yy);
      const ex = extentX[index]!, ey = extentY[index]!, ez = extentZ[index]!;
      worldX = Math.abs(m00) * ex + Math.abs(m01) * ey + Math.abs(m02) * ez;
      worldY = Math.abs(m10) * ex + Math.abs(m11) * ey + Math.abs(m12) * ez;
      worldZ = Math.abs(m20) * ex + Math.abs(m21) * ey + Math.abs(m22) * ez;
    }
    aabbMinX[index] = positionX[index]! - worldX; aabbMaxX[index] = positionX[index]! + worldX;
    aabbMinY[index] = positionY[index]! - worldY; aabbMaxY[index] = positionY[index]! + worldY;
    aabbMinZ[index] = positionZ[index]! - worldZ; aabbMaxZ[index] = positionZ[index]! + worldZ;
  }

  function setQuaternion(index: number, x: number, y: number, z: number, w: number): void {
    x = finite(x, "rotationX"); y = finite(y, "rotationY"); z = finite(z, "rotationZ"); w = finite(w, "rotationW");
    const length = Math.hypot(x, y, z, w);
    if (length <= 1e-12) throw new RangeError("rotation quaternion must be non-zero.");
    rotationX[index] = x / length; rotationY[index] = y / length; rotationZ[index] = z / length; rotationW[index] = w / length;
    updateAabb(index);
  }

  function integrateRotation(index: number, seconds: number): void {
    const wx = angularVelocityX[index]!, wy = angularVelocityY[index]!, wz = angularVelocityZ[index]!;
    if (Math.abs(wx) + Math.abs(wy) + Math.abs(wz) <= 1e-14) return;
    const x = rotationX[index]!, y = rotationY[index]!, z = rotationZ[index]!, w = rotationW[index]!;
    setQuaternion(index,
      x + 0.5 * (wx * w + wy * z - wz * y) * seconds,
      y + 0.5 * (-wx * z + wy * w + wz * x) * seconds,
      z + 0.5 * (wx * y - wy * x + wz * w) * seconds,
      w + 0.5 * (-wx * x - wy * y - wz * z) * seconds);
    const damping = Math.max(0, 1 - angularDamping[index]! * seconds);
    angularVelocityX[index] *= damping; angularVelocityY[index] *= damping; angularVelocityZ[index] *= damping;
  }

  function solveConstraints(): void {
    for (let iteration = 0; iteration < constraintIterations; iteration += 1) for (const item of constraints) {
      if (!item || alive[item.aIndex] === 0 || alive[item.bIndex] === 0) continue;
      const a = item.aIndex, b = item.bIndex, dx = positionX[b]! - positionX[a]!, dy = positionY[b]! - positionY[a]!, dz = positionZ[b]! - positionZ[a]!;
      const length = Math.hypot(dx, dy, dz); if (length <= 1e-12) continue;
      const inverseA = activeInverseMass(a), inverseB = activeInverseMass(b), inverseSum = inverseA + inverseB; if (inverseSum === 0) continue;
      const correction = (length - item.distance) * item.stiffness / inverseSum;
      const nx = dx / length, ny = dy / length, nz = dz / length;
      positionX[a] += nx * correction * inverseA; positionY[a] += ny * correction * inverseA; positionZ[a] += nz * correction * inverseA;
      positionX[b] -= nx * correction * inverseB; positionY[b] -= ny * correction * inverseB; positionZ[b] -= nz * correction * inverseB;
      updateAabb(a); updateAabb(b);
    }
  }

  function filters(a: number, b: number): boolean {
    return (layer[a]! & mask[b]!) !== 0 && (layer[b]! & mask[a]!) !== 0;
  }

  function activeInverseMass(index: number): number {
    return bodyType[index] === TYPE_DYNAMIC ? inverseMass[index]! : 0;
  }

  function detect(a: number, b: number, output: ContactScratch): boolean {
    if (shapeKind[a] === SHAPE_SPHERE && shapeKind[b] === SHAPE_SPHERE) return sphereSphere(a, b, output);
    if (shapeKind[a] === SHAPE_BOX && shapeKind[b] === SHAPE_BOX) return boxBox(a, b, output);
    if (shapeKind[a] === SHAPE_SPHERE) return sphereBox(a, b, output, false);
    return sphereBox(b, a, output, true);
  }

  function sphereSphere(a: number, b: number, output: ContactScratch): boolean {
    const dx = positionX[b]! - positionX[a]!;
    const dy = positionY[b]! - positionY[a]!;
    const dz = positionZ[b]! - positionZ[a]!;
    const radius = extentX[a]! + extentX[b]!;
    const distanceSquared = dx * dx + dy * dy + dz * dz;
    if (distanceSquared > radius * radius) return false;
    const distance = Math.sqrt(distanceSquared);
    if (distance > 1e-12) {
      output.normalX = dx / distance; output.normalY = dy / distance; output.normalZ = dz / distance;
    } else {
      output.normalX = handleAt(a) < handleAt(b) ? 1 : -1; output.normalY = 0; output.normalZ = 0;
    }
    output.penetration = radius - distance;
    output.pointX = positionX[a]! + output.normalX * (extentX[a]! - output.penetration * 0.5);
    output.pointY = positionY[a]! + output.normalY * (extentX[a]! - output.penetration * 0.5);
    output.pointZ = positionZ[a]! + output.normalZ * (extentX[a]! - output.penetration * 0.5);
    return true;
  }

  function boxBox(a: number, b: number, output: ContactScratch): boolean {
    const dx = positionX[b]! - positionX[a]!;
    const dy = positionY[b]! - positionY[a]!;
    const dz = positionZ[b]! - positionZ[a]!;
    const overlapX = Math.min(aabbMaxX[a]!, aabbMaxX[b]!) - Math.max(aabbMinX[a]!, aabbMinX[b]!);
    const overlapY = Math.min(aabbMaxY[a]!, aabbMaxY[b]!) - Math.max(aabbMinY[a]!, aabbMinY[b]!);
    const overlapZ = Math.min(aabbMaxZ[a]!, aabbMaxZ[b]!) - Math.max(aabbMinZ[a]!, aabbMinZ[b]!);
    if (overlapX < 0 || overlapY < 0 || overlapZ < 0) return false;
    output.normalX = 0; output.normalY = 0; output.normalZ = 0;
    if (overlapX <= overlapY && overlapX <= overlapZ) { output.normalX = dx >= 0 ? 1 : -1; output.penetration = overlapX; }
    else if (overlapY <= overlapZ) { output.normalY = dy >= 0 ? 1 : -1; output.penetration = overlapY; }
    else { output.normalZ = dz >= 0 ? 1 : -1; output.penetration = overlapZ; }
    output.pointX = clamp((positionX[a]! + positionX[b]!) * 0.5, Math.max(aabbMinX[a]!, aabbMinX[b]!), Math.min(aabbMaxX[a]!, aabbMaxX[b]!));
    output.pointY = clamp((positionY[a]! + positionY[b]!) * 0.5, Math.max(aabbMinY[a]!, aabbMinY[b]!), Math.min(aabbMaxY[a]!, aabbMaxY[b]!));
    output.pointZ = clamp((positionZ[a]! + positionZ[b]!) * 0.5, Math.max(aabbMinZ[a]!, aabbMinZ[b]!), Math.min(aabbMaxZ[a]!, aabbMaxZ[b]!));
    return true;
  }

  function sphereBox(sphere: number, box: number, output: ContactScratch, invert: boolean): boolean {
    const sx = positionX[sphere]!;
    const sy = positionY[sphere]!;
    const sz = positionZ[sphere]!;
    const closestX = clamp(sx, aabbMinX[box]!, aabbMaxX[box]!);
    const closestY = clamp(sy, aabbMinY[box]!, aabbMaxY[box]!);
    const closestZ = clamp(sz, aabbMinZ[box]!, aabbMaxZ[box]!);
    let dx = closestX - sx;
    let dy = closestY - sy;
    let dz = closestZ - sz;
    const distanceSquared = dx * dx + dy * dy + dz * dz;
    const radius = extentX[sphere]!;
    if (distanceSquared > radius * radius) return false;
    let penetration: number;
    if (distanceSquared > 1e-20) {
      const distance = Math.sqrt(distanceSquared);
      dx /= distance; dy /= distance; dz /= distance;
      penetration = radius - distance;
    } else {
      const localX = sx - positionX[box]!;
      const localY = sy - positionY[box]!;
      const localZ = sz - positionZ[box]!;
      const faceX = (aabbMaxX[box]! - aabbMinX[box]!) * 0.5 - Math.abs(localX);
      const faceY = (aabbMaxY[box]! - aabbMinY[box]!) * 0.5 - Math.abs(localY);
      const faceZ = (aabbMaxZ[box]! - aabbMinZ[box]!) * 0.5 - Math.abs(localZ);
      dx = 0; dy = 0; dz = 0;
      if (faceX <= faceY && faceX <= faceZ) { dx = localX >= 0 ? -1 : 1; penetration = radius + faceX; }
      else if (faceY <= faceZ) { dy = localY >= 0 ? -1 : 1; penetration = radius + faceY; }
      else { dz = localZ >= 0 ? -1 : 1; penetration = radius + faceZ; }
    }
    output.normalX = invert ? -dx : dx;
    output.normalY = invert ? -dy : dy;
    output.normalZ = invert ? -dz : dz;
    output.penetration = penetration!;
    output.pointX = closestX; output.pointY = closestY; output.pointZ = closestZ;
    return true;
  }

  function solveVelocity(a: number, b: number, nx: number, ny: number, nz: number): void {
    const inverseA = activeInverseMass(a);
    const inverseB = activeInverseMass(b);
    const inverseSum = inverseA + inverseB;
    if (inverseSum === 0) return;
    let relativeX = velocityX[b]! - velocityX[a]!;
    let relativeY = velocityY[b]! - velocityY[a]!;
    let relativeZ = velocityZ[b]! - velocityZ[a]!;
    const normalVelocity = relativeX * nx + relativeY * ny + relativeZ * nz;
    if (normalVelocity >= 0) return;
    const bounce = Math.max(restitution[a]!, restitution[b]!);
    const impulse = -(1 + bounce) * normalVelocity / inverseSum;
    const impulseX = impulse * nx;
    const impulseY = impulse * ny;
    const impulseZ = impulse * nz;
    velocityX[a] -= impulseX * inverseA; velocityY[a] -= impulseY * inverseA; velocityZ[a] -= impulseZ * inverseA;
    velocityX[b] += impulseX * inverseB; velocityY[b] += impulseY * inverseB; velocityZ[b] += impulseZ * inverseB;

    relativeX = velocityX[b]! - velocityX[a]!;
    relativeY = velocityY[b]! - velocityY[a]!;
    relativeZ = velocityZ[b]! - velocityZ[a]!;
    const tangentProjection = relativeX * nx + relativeY * ny + relativeZ * nz;
    let tangentX = relativeX - tangentProjection * nx;
    let tangentY = relativeY - tangentProjection * ny;
    let tangentZ = relativeZ - tangentProjection * nz;
    const tangentLength = Math.hypot(tangentX, tangentY, tangentZ);
    if (tangentLength <= 1e-12) return;
    tangentX /= tangentLength; tangentY /= tangentLength; tangentZ /= tangentLength;
    let frictionImpulse = -(relativeX * tangentX + relativeY * tangentY + relativeZ * tangentZ) / inverseSum;
    const maximumFriction = impulse * Math.sqrt(friction[a]! * friction[b]!);
    frictionImpulse = clamp(frictionImpulse, -maximumFriction, maximumFriction);
    velocityX[a] -= frictionImpulse * tangentX * inverseA; velocityY[a] -= frictionImpulse * tangentY * inverseA; velocityZ[a] -= frictionImpulse * tangentZ * inverseA;
    velocityX[b] += frictionImpulse * tangentX * inverseB; velocityY[b] += frictionImpulse * tangentY * inverseB; velocityZ[b] += frictionImpulse * tangentZ * inverseB;
  }

  function solvePosition(a: number, b: number, nx: number, ny: number, nz: number, penetration: number): void {
    const inverseA = activeInverseMass(a);
    const inverseB = activeInverseMass(b);
    const inverseSum = inverseA + inverseB;
    if (inverseSum === 0) return;
    const correction = Math.max(0, penetration - POSITION_SLOP) * POSITION_PERCENT / inverseSum;
    positionX[a] -= nx * correction * inverseA; positionY[a] -= ny * correction * inverseA; positionZ[a] -= nz * correction * inverseA;
    positionX[b] += nx * correction * inverseB; positionY[b] += ny * correction * inverseB; positionZ[b] += nz * correction * inverseB;
    updateAabb(a); updateAabb(b);
  }

  function runCcd(index: number, seconds: number): void {
    const dx = velocityX[index]! * seconds;
    const dy = velocityY[index]! * seconds;
    const dz = velocityZ[index]! * seconds;
    if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) <= CCD_EPSILON) return;
    let earliest = 1;
    let hitIndex = -1;
    let normalX = 0;
    let normalY = 0;
    let normalZ = 0;
    let conservativeHit = false;
    for (let other = 0; other < capacity; other += 1) {
      if (alive[other] === 0 || bodyType[other] !== TYPE_STATIC || !filters(index, other) || (flags[index]! & FLAG_TRIGGER) !== 0 || (flags[other]! & FLAG_TRIGGER) !== 0) continue;
      if (diagnostics.ccdTests >= maxCcdTests) { diagnostics.ccdTestOverflows += 1; break; }
      diagnostics.ccdTests += 1;
      positionX[index] = previousX[index]!; positionY[index] = previousY[index]!; positionZ[index] = previousZ[index]!;
      updateAabb(index); updateAabb(other);
      if (detect(index, other, contactScratch)) {
        if (earliest > 0 || (earliest === 0 && handleAt(other) < (hitIndex < 0 ? Number.POSITIVE_INFINITY : handleAt(hitIndex)))) {
          earliest = 0; hitIndex = other;
          normalX = contactScratch.normalX; normalY = contactScratch.normalY; normalZ = contactScratch.normalZ;
          conservativeHit = false;
        }
        continue;
      }
      let hit = false;
      if (shapeKind[index] === SHAPE_SPHERE && shapeKind[other] === SHAPE_SPHERE) {
        hit = sweepSphereSphere(index, other, dx, dy, dz, sweepScratch);
      } else {
        hit = sweepExpandedAabb(index, other, dx, dy, dz, sweepScratch);
      }
      if (!hit) continue;
      if (sweepScratch.time < earliest - CCD_EPSILON || (Math.abs(sweepScratch.time - earliest) <= CCD_EPSILON && handleAt(other) < (hitIndex < 0 ? Number.POSITIVE_INFINITY : handleAt(hitIndex)))) {
        earliest = sweepScratch.time; hitIndex = other;
        normalX = sweepScratch.normalX; normalY = sweepScratch.normalY; normalZ = sweepScratch.normalZ;
        conservativeHit = shapeKind[index] !== shapeKind[other];
      }
    }
    positionX[index] = finite(previousX[index]! + dx * earliest, `body ${ids[index]} x`);
    positionY[index] = finite(previousY[index]! + dy * earliest, `body ${ids[index]} y`);
    positionZ[index] = finite(previousZ[index]! + dz * earliest, `body ${ids[index]} z`);
    if (hitIndex >= 0) {
      diagnostics.ccdHits += 1;
      if (conservativeHit) diagnostics.ccdConservativeHits += 1;
      const approach = velocityX[index]! * normalX + velocityY[index]! * normalY + velocityZ[index]! * normalZ;
      if (approach > 0) {
        const bounce = Math.max(restitution[index]!, restitution[hitIndex]!);
        velocityX[index] -= (1 + bounce) * approach * normalX;
        velocityY[index] -= (1 + bounce) * approach * normalY;
        velocityZ[index] -= (1 + bounce) * approach * normalZ;
      }
    }
    updateAabb(index);
  }

  function sweepSphereSphere(moving: number, fixed: number, dx: number, dy: number, dz: number, output: SweepScratch): boolean {
    const ox = previousX[moving]! - positionX[fixed]!;
    const oy = previousY[moving]! - positionY[fixed]!;
    const oz = previousZ[moving]! - positionZ[fixed]!;
    const radius = extentX[moving]! + extentX[fixed]!;
    const a = dx * dx + dy * dy + dz * dz;
    const b = 2 * (ox * dx + oy * dy + oz * dz);
    const c = ox * ox + oy * oy + oz * oz - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0 || a <= CCD_EPSILON) return false;
    const time = (-b - Math.sqrt(discriminant)) / (2 * a);
    if (time < 0 || time > 1) return false;
    const hitX = previousX[moving]! + dx * time;
    const hitY = previousY[moving]! + dy * time;
    const hitZ = previousZ[moving]! + dz * time;
    const nx = positionX[fixed]! - hitX;
    const ny = positionY[fixed]! - hitY;
    const nz = positionZ[fixed]! - hitZ;
    const length = Math.hypot(nx, ny, nz);
    output.time = time; output.normalX = nx / length; output.normalY = ny / length; output.normalZ = nz / length;
    return true;
  }

  function sweepExpandedAabb(moving: number, fixed: number, dx: number, dy: number, dz: number, output: SweepScratch): boolean {
    const movingHalfX = (aabbMaxX[moving]! - aabbMinX[moving]!) * 0.5;
    const movingHalfY = (aabbMaxY[moving]! - aabbMinY[moving]!) * 0.5;
    const movingHalfZ = (aabbMaxZ[moving]! - aabbMinZ[moving]!) * 0.5;
    const minX = aabbMinX[fixed]! - movingHalfX;
    const minY = aabbMinY[fixed]! - movingHalfY;
    const minZ = aabbMinZ[fixed]! - movingHalfZ;
    const maxX = aabbMaxX[fixed]! + movingHalfX;
    const maxY = aabbMaxY[fixed]! + movingHalfY;
    const maxZ = aabbMaxZ[fixed]! + movingHalfZ;
    if (!rayAabbUnit(previousX[moving]!, previousY[moving]!, previousZ[moving]!, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ, output)) return false;
    output.normalX *= -1; output.normalY *= -1; output.normalZ *= -1;
    return true;
  }

  function raySphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, index: number, maxDistance: number, output: SweepScratch): boolean {
    const mx = ox - positionX[index]!;
    const my = oy - positionY[index]!;
    const mz = oz - positionZ[index]!;
    const radius = extentX[index]!;
    const c = mx * mx + my * my + mz * mz - radius * radius;
    if (c <= 0) {
      output.time = 0; output.normalX = -dx; output.normalY = -dy; output.normalZ = -dz;
      return true;
    }
    const projection = mx * dx + my * dy + mz * dz;
    if (projection > 0) return false;
    const discriminant = projection * projection - c;
    if (discriminant < 0) return false;
    const distance = -projection - Math.sqrt(discriminant);
    if (distance < 0 || distance > maxDistance) return false;
    const hitX = ox + dx * distance;
    const hitY = oy + dy * distance;
    const hitZ = oz + dz * distance;
    output.time = distance;
    output.normalX = (hitX - positionX[index]!) / radius;
    output.normalY = (hitY - positionY[index]!) / radius;
    output.normalZ = (hitZ - positionZ[index]!) / radius;
    return true;
  }

  function sortBodies(): number {
    let count = 0;
    for (let index = 0; index < capacity; index += 1) if (alive[index]) sort[count++] = index;
    for (let width = 1; width < count; width *= 2) {
      for (let start = 0; start < count; start += width * 2) {
        const middle = Math.min(start + width, count);
        const end = Math.min(start + width * 2, count);
        let left = start; let right = middle; let write = start;
        while (left < middle && right < end) {
          const a = sort[left]!; const b = sort[right]!;
          if (aabbMinX[a]! < aabbMinX[b]! || (aabbMinX[a] === aabbMinX[b] && handleAt(a) <= handleAt(b))) sortScratch[write++] = sort[left++]!;
          else sortScratch[write++] = sort[right++]!;
        }
        while (left < middle) sortScratch[write++] = sort[left++]!;
        while (right < end) sortScratch[write++] = sort[right++]!;
      }
      for (let index = 0; index < count; index += 1) sort[index] = sortScratch[index]!;
    }
    return count;
  }

  function collectContacts(): void {
    currentContacts = 0;
    const count = sortBodies();
    let saturated = false;
    for (let orderA = 0; orderA < count && !saturated; orderA += 1) {
      const a = sort[orderA]!;
      for (let orderB = orderA + 1; orderB < count; orderB += 1) {
        const b = sort[orderB]!;
        if (aabbMinX[b]! > aabbMaxX[a]!) break;
        if (bodyType[a] === TYPE_STATIC && bodyType[b] === TYPE_STATIC) continue;
        if (!filters(a, b) || aabbMaxY[a]! < aabbMinY[b]! || aabbMaxY[b]! < aabbMinY[a]! || aabbMaxZ[a]! < aabbMinZ[b]! || aabbMaxZ[b]! < aabbMinZ[a]!) continue;
        if (diagnostics.candidatePairs >= maxCandidatePairs) {
          diagnostics.candidateOverflows += 1; saturated = true; break;
        }
        diagnostics.candidatePairs += 1;
        if (!detect(a, b, contactScratch)) continue;
        if (currentContacts >= maxContacts) { diagnostics.contactOverflows += 1; continue; }
        contactA[currentContacts] = a; contactB[currentContacts] = b;
        contactNormalX[currentContacts] = contactScratch.normalX; contactNormalY[currentContacts] = contactScratch.normalY; contactNormalZ[currentContacts] = contactScratch.normalZ;
        contactPenetration[currentContacts] = contactScratch.penetration;
        contactPointX[currentContacts] = contactScratch.pointX; contactPointY[currentContacts] = contactScratch.pointY; contactPointZ[currentContacts] = contactScratch.pointZ;
        contactTrigger[currentContacts] = (flags[a]! & FLAG_TRIGGER) !== 0 || (flags[b]! & FLAG_TRIGGER) !== 0 ? 1 : 0;
        currentContacts += 1;
      }
    }
    diagnostics.contacts = currentContacts;
  }

  function state(index: number): RigidBodyState3D {
    const type = bodyType[index] === TYPE_STATIC ? "static" : bodyType[index] === TYPE_DYNAMIC ? "dynamic" : "kinematic";
    const shape: RigidShape3D = shapeKind[index] === SHAPE_SPHERE
      ? { kind: "sphere", radius: extentX[index]! }
      : { kind: "box", halfX: extentX[index]!, halfY: extentY[index]!, halfZ: extentZ[index]! };
    return {
      handle: handleAt(index), id: ids[index]!, type, shape,
      x: positionX[index]!, y: positionY[index]!, z: positionZ[index]!,
      velocityX: velocityX[index]!, velocityY: velocityY[index]!, velocityZ: velocityZ[index]!,
      rotationX: rotationX[index]!, rotationY: rotationY[index]!, rotationZ: rotationZ[index]!, rotationW: rotationW[index]!,
      angularVelocityX: angularVelocityX[index]!, angularVelocityY: angularVelocityY[index]!, angularVelocityZ: angularVelocityZ[index]!,
      mass: inverseMass[index] === 0 ? Number.POSITIVE_INFINITY : 1 / inverseMass[index]!,
      restitution: restitution[index]!, friction: friction[index]!,
      collisionLayer: layer[index]!, collisionMask: mask[index]!,
      trigger: (flags[index]! & FLAG_TRIGGER) !== 0,
      continuous: (flags[index]! & FLAG_CONTINUOUS) !== 0,
    } as RigidBodyState3D;
  }

  const world: RigidWorld3D = {
    capacity,
    maxContacts,
    maxCandidatePairs,
    maxCcdTests,
    precision,
    numericStorageBytes,
    diagnostics,
    addBody(definition) {
      if (!definition || typeof definition !== "object") throw new TypeError("Rigid body definition must be an object.");
      const rawDefinition = definition as unknown as Record<string, unknown>;
      for (const key of ["constraints", "joints", "torque", "quaternion", "angle"] as const) if (rawDefinition[key] !== undefined) {
        throw new Error(`${key} is not an inline body property; use the bounded rigid-world rotation/constraint methods.`);
      }
      const id = identifier(definition.id, "id");
      if (indexById.has(id)) throw new Error(`Rigid body id ${JSON.stringify(id)} already exists.`);
      if (freeCount === 0) throw new RangeError(`Rigid body capacity ${capacity} is exhausted.`);
      const type = definition.type ?? "dynamic";
      if (type !== "static" && type !== "dynamic" && type !== "kinematic") throw new Error(`Unsupported rigid body type ${JSON.stringify(type)}.`);
      const isDynamic = type === "dynamic";
      if (!isDynamic && definition.mass !== undefined) throw new Error(`${type} bodies have infinite mass and cannot declare mass.`);
      const mass = isDynamic ? positive(definition.mass ?? 1, "mass") : Number.POSITIVE_INFINITY;
      const px = finite(definition.x ?? 0, "x"); const py = finite(definition.y ?? 0, "y"); const pz = finite(definition.z ?? 0, "z");
      const vx = finite(definition.velocityX ?? 0, "velocityX"); const vy = finite(definition.velocityY ?? 0, "velocityY"); const vz = finite(definition.velocityZ ?? 0, "velocityZ");
      const avx = finite(definition.angularVelocity?.[0] ?? 0, "angularVelocity[0]"); const avy = finite(definition.angularVelocity?.[1] ?? 0, "angularVelocity[1]"); const avz = finite(definition.angularVelocity?.[2] ?? 0, "angularVelocity[2]");
      if (type === "static" && (vx !== 0 || vy !== 0 || vz !== 0)) throw new Error("Static bodies cannot have velocity.");
      if (type === "static" && (avx !== 0 || avy !== 0 || avz !== 0)) throw new Error("Static bodies cannot have angular velocity.");
      const trigger = booleanOption(definition.trigger, false, "trigger");
      const continuous = booleanOption(definition.continuous, false, "continuous");
      if (continuous && !isDynamic) throw new Error("Continuous collision detection is available only for dynamic bodies.");
      if (continuous && trigger) throw new Error("Continuous trigger sweeps are not supported; use a discrete trigger or a ray/AABB query.");
      if (!definition.shape || typeof definition.shape !== "object") throw new TypeError("Rigid body shape must be an object.");
      let ex: number; let ey: number; let ez: number; let shape: number;
      if ("rotation" in definition.shape || "quaternion" in definition.shape) throw new Error("Declare body rotation, not shape-local rotation.");
      if (definition.shape.kind === "sphere") {
        ex = ey = ez = positive(definition.shape.radius, "shape.radius"); shape = SHAPE_SPHERE;
      } else if (definition.shape.kind === "box") {
        ex = positive(definition.shape.halfX, "shape.halfX"); ey = positive(definition.shape.halfY, "shape.halfY"); ez = positive(definition.shape.halfZ, "shape.halfZ"); shape = SHAPE_BOX;
      } else throw new Error(`Unsupported rigid shape kind ${JSON.stringify((definition.shape as { kind?: unknown }).kind)}.`);
      const bodyRestitution = interval(definition.restitution ?? 0, 0, 1, "restitution");
      const bodyFriction = interval(definition.friction ?? 0.5, 0, 1, "friction");
      const bodyGravityScale = nonnegative(definition.gravityScale ?? 1, "gravityScale");
      const bodyLayer = uint32(definition.collisionLayer ?? DEFAULT_LAYER, "collisionLayer");
      const bodyMask = uint32(definition.collisionMask ?? DEFAULT_MASK, "collisionMask");
      finite(px - ex, "shape minimum x"); finite(px + ex, "shape maximum x");
      finite(py - ey, "shape minimum y"); finite(py + ey, "shape maximum y");
      finite(pz - ez, "shape minimum z"); finite(pz + ez, "shape maximum z");
      const index = free[--freeCount]!;
      alive[index] = 1; bodyType[index] = type === "static" ? TYPE_STATIC : isDynamic ? TYPE_DYNAMIC : TYPE_KINEMATIC; shapeKind[index] = shape;
      flags[index] = (trigger ? FLAG_TRIGGER : 0) | (continuous ? FLAG_CONTINUOUS : 0);
      positionX[index] = previousX[index] = px; positionY[index] = previousY[index] = py; positionZ[index] = previousZ[index] = pz;
      velocityX[index] = vx; velocityY[index] = vy; velocityZ[index] = vz;
      rotationX[index] = 0; rotationY[index] = 0; rotationZ[index] = 0; rotationW[index] = 1;
      angularVelocityX[index] = avx; angularVelocityY[index] = avy; angularVelocityZ[index] = avz;
      angularDamping[index] = nonnegative(definition.angularDamping ?? 0.05, "angularDamping");
      extentX[index] = ex; extentY[index] = ey; extentZ[index] = ez;
      inverseMass[index] = isDynamic ? 1 / mass : 0;
      restitution[index] = bodyRestitution; friction[index] = bodyFriction; gravityScale[index] = bodyGravityScale;
      layer[index] = bodyLayer; mask[index] = bodyMask;
      ids[index] = id; indexById.set(id, index);
      const orientation = definition.rotation; setQuaternion(index, orientation?.[0] ?? 0, orientation?.[1] ?? 0, orientation?.[2] ?? 0, orientation?.[3] ?? 1);
      bodyCount += 1; diagnostics.bodies = bodyCount;
      return handleAt(index);
    },
    removeBody(handleOrId) {
      const index = resolveOptional(handleOrId);
      if (index === undefined) return false;
      indexById.delete(ids[index]!); ids[index] = undefined; alive[index] = 0; flags[index] = 0;
      for (let constraint = 0; constraint < constraints.length; constraint += 1) {
        const item = constraints[constraint]; if (item && (item.aIndex === index || item.bIndex === index)) world.removeConstraint(constraint);
      }
      bodyCount -= 1; diagnostics.bodies = bodyCount;
      if (generation[index] !== MAX_GENERATION) {
        generation[index] += 1;
        free[freeCount++] = index;
      }
      return true;
    },
    hasBody(handleOrId) { return resolveOptional(handleOrId) !== undefined; },
    body(handleOrId) {
      const index = resolveOptional(handleOrId);
      return index === undefined ? undefined : state(index);
    },
    setPosition(handleOrId, x, y, z) {
      const index = resolve(handleOrId);
      x = finite(x, "x"); y = finite(y, "y"); z = finite(z, "z");
      finite(x - extentX[index]!, "shape minimum x"); finite(x + extentX[index]!, "shape maximum x");
      finite(y - extentY[index]!, "shape minimum y"); finite(y + extentY[index]!, "shape maximum y");
      finite(z - extentZ[index]!, "shape minimum z"); finite(z + extentZ[index]!, "shape maximum z");
      positionX[index] = x; positionY[index] = y; positionZ[index] = z;
      previousX[index] = positionX[index]!; previousY[index] = positionY[index]!; previousZ[index] = positionZ[index]!; updateAabb(index);
    },
    setVelocity(handleOrId, x, y, z) {
      const index = resolve(handleOrId);
      if (bodyType[index] === TYPE_STATIC) throw new Error("Static bodies cannot have velocity.");
      velocityX[index] = finite(x, "velocityX"); velocityY[index] = finite(y, "velocityY"); velocityZ[index] = finite(z, "velocityZ");
    },
    setRotation(handleOrId, x, y, z, w) { setQuaternion(resolve(handleOrId), x, y, z, w); },
    setAngularVelocity(handleOrId, x, y, z) {
      const index = resolve(handleOrId); if (bodyType[index] === TYPE_STATIC) throw new Error("Static bodies cannot have angular velocity.");
      angularVelocityX[index] = finite(x, "angularVelocityX"); angularVelocityY[index] = finite(y, "angularVelocityY"); angularVelocityZ[index] = finite(z, "angularVelocityZ");
    },
    applyTorqueImpulse(handleOrId, x, y, z) {
      const index = resolve(handleOrId); if (bodyType[index] !== TYPE_DYNAMIC) throw new Error("Torque impulses can be applied only to dynamic bodies.");
      angularVelocityX[index] = finite(angularVelocityX[index]! + finite(x, "torqueImpulseX") * inverseMass[index]!, "resulting angularVelocityX");
      angularVelocityY[index] = finite(angularVelocityY[index]! + finite(y, "torqueImpulseY") * inverseMass[index]!, "resulting angularVelocityY");
      angularVelocityZ[index] = finite(angularVelocityZ[index]! + finite(z, "torqueImpulseZ") * inverseMass[index]!, "resulting angularVelocityZ");
    },
    applyImpulse(handleOrId, x, y, z) {
      const index = resolve(handleOrId);
      if (bodyType[index] !== TYPE_DYNAMIC) throw new Error("Impulses can be applied only to dynamic bodies.");
      const nextX = velocityX[index]! + finite(x, "impulseX") * inverseMass[index]!;
      const nextY = velocityY[index]! + finite(y, "impulseY") * inverseMass[index]!;
      const nextZ = velocityZ[index]! + finite(z, "impulseZ") * inverseMass[index]!;
      velocityX[index] = finite(nextX, "resulting velocityX"); velocityY[index] = finite(nextY, "resulting velocityY"); velocityZ[index] = finite(nextZ, "resulting velocityZ");
    },
    addDistanceConstraint(definition) {
      if (!definition || typeof definition !== "object") throw new TypeError("Distance constraint definition is required.");
      const id = identifier(definition.id, "constraint id"); if (constraintById.has(id)) throw new Error(`Constraint id ${JSON.stringify(id)} already exists.`);
      if (freeConstraints.length === 0) throw new RangeError(`Rigid constraint capacity ${maxConstraints} is exhausted.`);
      const aIndex = resolve(definition.a), bIndex = resolve(definition.b); if (aIndex === bIndex) throw new Error("Distance constraint bodies must be different.");
      const currentDistance = Math.hypot(positionX[bIndex]! - positionX[aIndex]!, positionY[bIndex]! - positionY[aIndex]!, positionZ[bIndex]! - positionZ[aIndex]!);
      const distance = nonnegative(definition.distance ?? currentDistance, "constraint distance");
      const stiffness = interval(definition.stiffness ?? 1, 0, 1, "constraint stiffness");
      const handle = freeConstraints.pop()!; constraints[handle] = { handle, id, a: handleAt(aIndex), b: handleAt(bIndex), aIndex, bIndex, distance, stiffness };
      constraintById.set(id, handle); activeConstraints += 1; diagnostics.constraints = activeConstraints; return handle;
    },
    removeConstraint(handleOrId) {
      const handle = typeof handleOrId === "string" ? constraintById.get(handleOrId) : handleOrId;
      if (!Number.isSafeInteger(handle) || (handle as number) < 0 || (handle as number) >= constraints.length || !constraints[handle as number]) return false;
      const item = constraints[handle as number]!; constraintById.delete(item.id); constraints[handle as number] = undefined; freeConstraints.push(handle as number);
      activeConstraints -= 1; diagnostics.constraints = activeConstraints; return true;
    },
    constraint(handleOrId) {
      const handle = typeof handleOrId === "string" ? constraintById.get(handleOrId) : handleOrId;
      if (!Number.isSafeInteger(handle) || (handle as number) < 0 || (handle as number) >= constraints.length) return undefined;
      const item = constraints[handle as number]; if (!item) return undefined;
      return { handle: item.handle, id: item.id, a: item.a, b: item.b, distance: item.distance, stiffness: item.stiffness };
    },
    constraintCount() { return activeConstraints; },
    step(seconds) {
      seconds = interval(seconds, Number.EPSILON, 0.25, "seconds");
      diagnostics.steps += 1; diagnostics.candidatePairs = 0; diagnostics.contacts = 0; diagnostics.ccdTests = 0;
      for (let index = 0; index < capacity; index += 1) {
        if (!alive[index]) continue;
        previousX[index] = positionX[index]!; previousY[index] = positionY[index]!; previousZ[index] = positionZ[index]!;
        if (bodyType[index] === TYPE_DYNAMIC) {
          velocityX[index] = finite(velocityX[index]! + gravityX * gravityScale[index]! * seconds, `body ${ids[index]} velocityX`);
          velocityY[index] = finite(velocityY[index]! + gravityY * gravityScale[index]! * seconds, `body ${ids[index]} velocityY`);
          velocityZ[index] = finite(velocityZ[index]! + gravityZ * gravityScale[index]! * seconds, `body ${ids[index]} velocityZ`);
          if ((flags[index]! & FLAG_CONTINUOUS) !== 0) runCcd(index, seconds);
          else {
            positionX[index] = finite(positionX[index]! + velocityX[index]! * seconds, `body ${ids[index]} x`);
            positionY[index] = finite(positionY[index]! + velocityY[index]! * seconds, `body ${ids[index]} y`);
            positionZ[index] = finite(positionZ[index]! + velocityZ[index]! * seconds, `body ${ids[index]} z`);
            updateAabb(index);
          }
          integrateRotation(index, seconds);
        } else if (bodyType[index] === TYPE_KINEMATIC) {
          positionX[index] = finite(positionX[index]! + velocityX[index]! * seconds, `body ${ids[index]} x`);
          positionY[index] = finite(positionY[index]! + velocityY[index]! * seconds, `body ${ids[index]} y`);
          positionZ[index] = finite(positionZ[index]! + velocityZ[index]! * seconds, `body ${ids[index]} z`);
          integrateRotation(index, seconds);
          updateAabb(index);
        } else updateAabb(index);
      }
      collectContacts();
      for (let iteration = 0; iteration < velocityIterations; iteration += 1) {
        for (let contact = 0; contact < currentContacts; contact += 1) {
          if (!contactTrigger[contact]) solveVelocity(contactA[contact]!, contactB[contact]!, contactNormalX[contact]!, contactNormalY[contact]!, contactNormalZ[contact]!);
        }
      }
      for (let iteration = 0; iteration < positionIterations; iteration += 1) {
        for (let contact = 0; contact < currentContacts; contact += 1) {
          if (contactTrigger[contact]) continue;
          const a = contactA[contact]!; const b = contactB[contact]!;
          if (detect(a, b, contactScratch)) solvePosition(a, b, contactScratch.normalX, contactScratch.normalY, contactScratch.normalZ, contactScratch.penetration);
        }
      }
      solveConstraints();
      return currentContacts;
    },
    contactCount() { return currentContacts; },
    contact(index, target) {
      if (!target || typeof target !== "object") throw new TypeError("Contact target is required.");
      if (!Number.isInteger(index) || index < 0 || index >= currentContacts) throw new RangeError(`Contact index ${index} is out of range.`);
      const a = contactA[index]!; const b = contactB[index]!;
      target.a = handleAt(a); target.b = handleAt(b); target.aId = ids[a]!; target.bId = ids[b]!;
      target.normalX = contactNormalX[index]!; target.normalY = contactNormalY[index]!; target.normalZ = contactNormalZ[index]!;
      target.penetration = contactPenetration[index]!; target.pointX = contactPointX[index]!; target.pointY = contactPointY[index]!; target.pointZ = contactPointZ[index]!;
      target.trigger = contactTrigger[index] !== 0;
      return target;
    },
    queryAabb(minX, minY, minZ, maxX, maxY, maxZ, output) {
      minX = finite(minX, "minX"); minY = finite(minY, "minY"); minZ = finite(minZ, "minZ");
      maxX = finite(maxX, "maxX"); maxY = finite(maxY, "maxY"); maxZ = finite(maxZ, "maxZ");
      if (minX > maxX || minY > maxY || minZ > maxZ) throw new RangeError("AABB minimums must not exceed maximums.");
      if (!(output instanceof Float64Array)) throw new TypeError("AABB output must be a Float64Array of stable handles.");
      let written = 0; let truncated = false;
      for (let index = 0; index < capacity; index += 1) {
        if (!alive[index]) continue;
        updateAabb(index);
        if (aabbMaxX[index]! < minX || aabbMinX[index]! > maxX || aabbMaxY[index]! < minY || aabbMinY[index]! > maxY || aabbMaxZ[index]! < minZ || aabbMinZ[index]! > maxZ) continue;
        if (written < output.length) output[written++] = handleAt(index);
        else truncated = true;
      }
      if (truncated) diagnostics.queryTruncations += 1;
      return written;
    },
    raycast(ox, oy, oz, dx, dy, dz, maxDistance, queryMask, target) {
      ox = finite(ox, "originX"); oy = finite(oy, "originY"); oz = finite(oz, "originZ");
      dx = finite(dx, "directionX"); dy = finite(dy, "directionY"); dz = finite(dz, "directionZ");
      maxDistance = positive(maxDistance, "maxDistance"); queryMask = uint32(queryMask, "layerMask");
      if (!target || typeof target !== "object") throw new TypeError("Raycast target is required.");
      const directionLength = Math.hypot(dx, dy, dz);
      if (directionLength <= 1e-12) throw new RangeError("Raycast direction must be non-zero.");
      dx /= directionLength; dy /= directionLength; dz /= directionLength;
      let bestDistance = maxDistance + 1; let bestIndex = -1; let bestNx = 0; let bestNy = 0; let bestNz = 0;
      for (let index = 0; index < capacity; index += 1) {
        if (!alive[index] || (layer[index]! & queryMask) === 0) continue;
        let hit = false;
        if (shapeKind[index] === SHAPE_SPHERE) hit = raySphere(ox, oy, oz, dx, dy, dz, index, maxDistance, sweepScratch);
        else hit = rayAabbUnit(ox, oy, oz, dx * maxDistance, dy * maxDistance, dz * maxDistance, aabbMinX[index]!, aabbMinY[index]!, aabbMinZ[index]!, aabbMaxX[index]!, aabbMaxY[index]!, aabbMaxZ[index]!, sweepScratch);
        if (!hit) continue;
        const distance = shapeKind[index] === SHAPE_SPHERE ? sweepScratch.time : sweepScratch.time * maxDistance;
        if (distance < bestDistance - 1e-10 || (Math.abs(distance - bestDistance) <= 1e-10 && handleAt(index) < (bestIndex < 0 ? Number.POSITIVE_INFINITY : handleAt(bestIndex)))) {
          bestDistance = distance; bestIndex = index; bestNx = sweepScratch.normalX; bestNy = sweepScratch.normalY; bestNz = sweepScratch.normalZ;
        }
      }
      if (bestIndex < 0) return false;
      target.handle = handleAt(bestIndex); target.id = ids[bestIndex]!; target.distance = bestDistance;
      target.x = ox + dx * bestDistance; target.y = oy + dy * bestDistance; target.z = oz + dz * bestDistance;
      target.normalX = bestNx; target.normalY = bestNy; target.normalZ = bestNz;
      return true;
    },
    debugSegmentCount(sphereSegments = 12) {
      sphereSegments = boundedInteger(sphereSegments, 4, 64, "sphereSegments");
      let count = currentContacts;
      for (let index = 0; index < capacity; index += 1) if (alive[index]) count += shapeKind[index] === SHAPE_SPHERE ? sphereSegments * 3 : 12;
      return count;
    },
    writeDebugSegments(output, sphereSegments = 12) {
      sphereSegments = boundedInteger(sphereSegments, 4, 64, "sphereSegments");
      if (!(output instanceof Float32Array)) throw new TypeError("Debug output must be a Float32Array.");
      const required = world.debugSegmentCount(sphereSegments) * RIGID_DEBUG_SEGMENT_STRIDE_3D;
      if (output.length < required) throw new RangeError(`Debug output needs ${required} floats.`);
      let segment = 0;
      const write = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, tag: number) => {
        const offset = segment++ * RIGID_DEBUG_SEGMENT_STRIDE_3D;
        output[offset] = x1; output[offset + 1] = y1; output[offset + 2] = z1;
        output[offset + 3] = x2; output[offset + 4] = y2; output[offset + 5] = z2; output[offset + 6] = tag;
      };
      for (let index = 0; index < capacity; index += 1) {
        if (!alive[index]) continue;
        const tag = (flags[index]! & FLAG_TRIGGER) !== 0 ? RIGID_DEBUG_TRIGGER_3D : bodyType[index] === TYPE_STATIC ? RIGID_DEBUG_STATIC_3D : bodyType[index] === TYPE_DYNAMIC ? RIGID_DEBUG_DYNAMIC_3D : RIGID_DEBUG_KINEMATIC_3D;
        if (shapeKind[index] === SHAPE_SPHERE) {
          const radius = extentX[index]!;
          for (let plane = 0; plane < 3; plane += 1) for (let part = 0; part < sphereSegments; part += 1) {
            const a = part / sphereSegments * Math.PI * 2; const b = (part + 1) / sphereSegments * Math.PI * 2;
            const ca = Math.cos(a) * radius; const sa = Math.sin(a) * radius; const cb = Math.cos(b) * radius; const sb = Math.sin(b) * radius;
            if (plane === 0) write(positionX[index]! + ca, positionY[index]! + sa, positionZ[index]!, positionX[index]! + cb, positionY[index]! + sb, positionZ[index]!, tag);
            else if (plane === 1) write(positionX[index]! + ca, positionY[index]!, positionZ[index]! + sa, positionX[index]! + cb, positionY[index]!, positionZ[index]! + sb, tag);
            else write(positionX[index]!, positionY[index]! + ca, positionZ[index]! + sa, positionX[index]!, positionY[index]! + cb, positionZ[index]! + sb, tag);
          }
        } else writeBoxEdges(index, tag, write);
      }
      for (let index = 0; index < currentContacts; index += 1) {
        write(contactPointX[index]!, contactPointY[index]!, contactPointZ[index]!, contactPointX[index]! + contactNormalX[index]!, contactPointY[index]! + contactNormalY[index]!, contactPointZ[index]! + contactNormalZ[index]!, RIGID_DEBUG_CONTACT_3D);
      }
      return segment;
    },
  };
  return world;

  function writeBoxEdges(index: number, tag: number, write: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, tag: number) => void): void {
    const minX = aabbMinX[index]!; const maxX = aabbMaxX[index]!;
    const minY = aabbMinY[index]!; const maxY = aabbMaxY[index]!;
    const minZ = aabbMinZ[index]!; const maxZ = aabbMaxZ[index]!;
    write(minX, minY, minZ, maxX, minY, minZ, tag); write(minX, maxY, minZ, maxX, maxY, minZ, tag);
    write(minX, minY, maxZ, maxX, minY, maxZ, tag); write(minX, maxY, maxZ, maxX, maxY, maxZ, tag);
    write(minX, minY, minZ, minX, maxY, minZ, tag); write(maxX, minY, minZ, maxX, maxY, minZ, tag);
    write(minX, minY, maxZ, minX, maxY, maxZ, tag); write(maxX, minY, maxZ, maxX, maxY, maxZ, tag);
    write(minX, minY, minZ, minX, minY, maxZ, tag); write(maxX, minY, minZ, maxX, minY, maxZ, tag);
    write(minX, maxY, minZ, minX, maxY, maxZ, tag); write(maxX, maxY, minZ, maxX, maxY, maxZ, tag);
  }
}

function rayAabbUnit(
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number,
  output: SweepScratch,
): boolean {
  if (ox >= minX && ox <= maxX && oy >= minY && oy <= maxY && oz >= minZ && oz <= maxZ) {
    const length = Math.hypot(dx, dy, dz) || 1;
    output.time = 0; output.normalX = -dx / length; output.normalY = -dy / length; output.normalZ = -dz / length;
    return true;
  }
  let entry = 0; let exit = 1; let nx = 0; let ny = 0; let nz = 0;
  const axis = (origin: number, delta: number, minimum: number, maximum: number, axisX: number, axisY: number, axisZ: number) => {
    if (Math.abs(delta) <= CCD_EPSILON) return origin >= minimum && origin <= maximum;
    let near = (minimum - origin) / delta; let far = (maximum - origin) / delta;
    let sign = -1;
    if (near > far) { const swap = near; near = far; far = swap; sign = 1; }
    if (near > entry) { entry = near; nx = axisX * sign; ny = axisY * sign; nz = axisZ * sign; }
    exit = Math.min(exit, far);
    return entry <= exit;
  };
  if (!axis(ox, dx, minX, maxX, 1, 0, 0) || !axis(oy, dy, minY, maxY, 0, 1, 0) || !axis(oz, dz, minZ, maxZ, 0, 0, 1) || entry < 0 || entry > 1) return false;
  output.time = entry; output.normalX = nx; output.normalY = ny; output.normalZ = nz;
  return true;
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || value.length > 256 || new TextEncoder().encode(value).byteLength > 256 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label} must be non-empty bounded text without control characters.`);
  return value;
}

function booleanOption(value: unknown, fallback: boolean, label: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new TypeError(`${label} must be boolean.`);
  return value;
}

function boundedInteger(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError(`${label} must be an integer from ${minimum} through ${maximum}.`);
  return value;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_ABSOLUTE_SCALAR) throw new RangeError(`${label} must be finite with magnitude no greater than ${MAX_ABSOLUTE_SCALAR}.`);
  return value;
}

function positive(value: number, label: string): number {
  value = finite(value, label);
  if (value < MIN_POSITIVE_SCALAR) throw new RangeError(`${label} must be at least ${MIN_POSITIVE_SCALAR}.`);
  return value;
}

function nonnegative(value: number, label: string): number {
  value = finite(value, label);
  if (value < 0) throw new RangeError(`${label} must be non-negative.`);
  return value;
}

function interval(value: number, minimum: number, maximum: number, label: string): number {
  value = finite(value, label);
  if (value < minimum || value > maximum) throw new RangeError(`${label} must be between ${minimum} and ${maximum}.`);
  return value;
}

function uint32(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) throw new RangeError(`${label} must be a uint32 integer.`);
  return value >>> 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
