import type {
  PhysicsBody2DDefinition,
  PhysicsDistanceJoint2DDefinition,
  PhysicsRevoluteJoint2DDefinition,
  PhysicsWorld2DDiagnostics,
} from "./2d.ts";
import type { createPhysics2DHandles } from './lifecycle/handles-2d.ts';
import {
  BODY_DYNAMIC,
  BODY_KINEMATIC,
  BODY_STATIC,
  CONTINUOUS_EPSILON,
  DEFAULT_LAYER,
  DEFAULT_MASK,
  POSITION_PERCENT,
  POSITION_SLOP,
  SHAPE_BOX,
  SHAPE_CIRCLE,
  bodyPairKey,
  clamp,
  decrementPair,
  finite,
  incrementPair,
  nonnegative,
  normalizeAngle,
  sweepPointAgainstBox,
  unitInterval,
  unsignedBits,
  validateShape,
  type CollisionResult,
} from "./2d-internals.ts";

export type Physics2DFloatStorage = Float32Array | Float64Array;
export type Physics2DMutableState = { freeCount: number; contacts: number; jointFreeCount: number; activeJoints: number };
export type Physics2DOperationContext = {
  config: {
    capacity: number; maxContacts: number; maxJoints: number; positionIterations: number;
    gravityX: number; gravityY: number; sleepLinearThreshold: number; sleepAngularThreshold: number; sleepAfterSeconds: number;
  };
  bodies: {
    alive: Uint8Array; bodyType: Uint8Array; shapeKind: Uint8Array; flags: Uint8Array; sleeping: Uint8Array;
    sleepTime: Physics2DFloatStorage; x: Physics2DFloatStorage; y: Physics2DFloatStorage;
    velocityX: Physics2DFloatStorage; velocityY: Physics2DFloatStorage; angle: Physics2DFloatStorage;
    angularVelocity: Physics2DFloatStorage; inverseMass: Physics2DFloatStorage; inverseInertia: Physics2DFloatStorage;
    extentX: Physics2DFloatStorage; extentY: Physics2DFloatStorage; restitution: Physics2DFloatStorage;
    friction: Physics2DFloatStorage; gravityScale: Physics2DFloatStorage; layer: Uint32Array; mask: Uint32Array;
    ids: Array<string | undefined>; indexById: Map<string, number>; free: Int32Array; sortIndices: Int32Array;
  };
  contactStorage: {
    contactA: Int32Array; contactB: Int32Array; contactNormalX: Physics2DFloatStorage; contactNormalY: Physics2DFloatStorage;
    contactPenetration: Physics2DFloatStorage; contactPointX: Physics2DFloatStorage; contactPointY: Physics2DFloatStorage;
    contactTrigger: Uint8Array; rayScratch: Physics2DFloatStorage;
  };
  joints: {
    jointAlive: Uint8Array; jointKind: Uint8Array; jointFlags: Uint8Array; jointA: Int32Array; jointB: Int32Array;
    jointLength: Physics2DFloatStorage; jointStiffness: Physics2DFloatStorage; jointDamping: Physics2DFloatStorage;
    jointAnchorAX: Physics2DFloatStorage; jointAnchorAY: Physics2DFloatStorage; jointAnchorBX: Physics2DFloatStorage; jointAnchorBY: Physics2DFloatStorage;
    jointFree: Int32Array; jointIds: Array<string | undefined>; jointIndexById: Map<string, number>; nonCollidingJointPairs: Map<string, number>;
  };
  diagnostics: PhysicsWorld2DDiagnostics;
  bodyHandles: ReturnType<typeof createPhysics2DHandles>;
  jointHandles: ReturnType<typeof createPhysics2DHandles>;
  state: Physics2DMutableState;
  resolveIndex(indexOrId: number | string): number;
};

export function createPhysics2DLifecycleOperations(context: Physics2DOperationContext) {
  const { config, bodies, contactStorage, joints, state, resolveIndex, bodyHandles, jointHandles } = context;
  const { capacity, maxJoints, sleepAfterSeconds } = config;
  const { alive, bodyType, shapeKind, flags, sleeping, sleepTime, x, y, velocityX, velocityY, angle, angularVelocity, inverseMass, inverseInertia, extentX, extentY, restitution, friction, gravityScale, layer, mask, ids, indexById, free } = bodies;
  const {  } = contactStorage;
  const { jointAlive, jointKind, jointFlags, jointA, jointB, jointLength, jointStiffness, jointDamping, jointAnchorAX, jointAnchorAY, jointAnchorBX, jointAnchorBY, jointFree, jointIds, jointIndexById, nonCollidingJointPairs } = joints;
  function addBody(definition: PhysicsBody2DDefinition) {
      if (!definition.id || definition.id.length > 256) throw new RangeError("Physics body id must contain 1-256 characters");
      if (indexById.has(definition.id)) throw new Error(`Physics body id already exists: ${definition.id}`);
      if (state.freeCount === 0) throw new RangeError(`Physics body capacity ${capacity} is exhausted`);
      const type = definition.type ?? "dynamic";
      const typeCode = type === "static" ? BODY_STATIC : type === "dynamic" ? BODY_DYNAMIC : type === "kinematic" ? BODY_KINEMATIC : -1;
      if (typeCode < 0) throw new TypeError(`Unsupported physics body type: ${String(type)}`);
      const shape = validateShape(definition.shape);
      const mass = finite(definition.mass ?? 1, "mass");
      if (typeCode === BODY_DYNAMIC && mass <= 0) throw new RangeError("Dynamic body mass must be greater than zero");
      const bodyLayer = unsignedBits(definition.collisionLayer ?? DEFAULT_LAYER, "collisionLayer");
      const bodyMask = unsignedBits(definition.collisionMask ?? DEFAULT_MASK, "collisionMask");
      const px = finite(definition.x ?? 0, "x"), py = finite(definition.y ?? 0, "y");
      const vx = finite(definition.velocityX ?? 0, "velocityX"), vy = finite(definition.velocityY ?? 0, "velocityY");
      const rotation = finite(definition.angle ?? 0, "angle"), spin = finite(definition.angularVelocity ?? 0, "angularVelocity");
      const bounce = unitInterval(definition.restitution ?? 0, "restitution");
      const drag = nonnegative(definition.friction ?? 0.5, "friction");
      const gravity = finite(definition.gravityScale ?? 1, "gravityScale");
      const index = free[--state.freeCount]!;
  
      alive[index] = 1;
      bodyType[index] = typeCode;
      shapeKind[index] = shape.kind === "box" ? SHAPE_BOX : SHAPE_CIRCLE;
      flags[index] = (definition.trigger ? 1 : 0) | (definition.continuous ? 2 : 0) | (definition.allowSleep === false ? 4 : 0);
      sleeping[index] = 0;
      sleepTime[index] = 0;
      x[index] = px;
      y[index] = py;
      velocityX[index] = vx;
      velocityY[index] = vy;
      angle[index] = rotation;
      angularVelocity[index] = spin;
      inverseMass[index] = typeCode === BODY_DYNAMIC ? 1 / mass : 0;
      extentX[index] = shape.kind === "box" ? shape.halfWidth : shape.radius;
      extentY[index] = shape.kind === "box" ? shape.halfHeight : shape.radius;
      const inertia = shape.kind === "box" ? mass * (shape.halfWidth * shape.halfWidth + shape.halfHeight * shape.halfHeight) / 3 : mass * shape.radius * shape.radius / 2;
      inverseInertia[index] = typeCode === BODY_DYNAMIC && !definition.fixedRotation ? 1 / inertia : 0;
      restitution[index] = bounce;
      friction[index] = drag;
      gravityScale[index] = gravity;
      layer[index] = bodyLayer;
      mask[index] = bodyMask;
      ids[index] = definition.id;
      indexById.set(definition.id, index);
      return bodyHandles.at(index);
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
      state.contacts = 0;
      flags[index] = 0;
      sleeping[index] = 0;
      sleepTime[index] = 0;
      velocityX[index] = 0;
      velocityY[index] = 0;
      angularVelocity[index] = 0;
      if (bodyHandles.retire(index)) free[state.freeCount++] = index;
      return true;
    }
  function addDistanceJoint(definition: PhysicsDistanceJoint2DDefinition) {
      if (!definition.id || definition.id.length > 256) throw new RangeError("Physics joint id must contain 1-256 characters");
      if (jointIndexById.has(definition.id)) throw new Error(`Physics joint id already exists: ${definition.id}`);
      if (state.jointFreeCount === 0) throw new RangeError(`Physics joint capacity ${maxJoints} is exhausted`);
      const a = resolveIndex(definition.a);
      const b = resolveIndex(definition.b);
      if (a === b) throw new Error("A distance joint must connect two different bodies");
      if (inverseMass[a] + inverseMass[b] <= 0) throw new Error("A distance joint must include at least one dynamic body");
      const authoredLength = definition.length ?? Math.hypot(x[b] - x[a], y[b] - y[a]);
      const length = nonnegative(authoredLength, "joint length");
      const stiffness = unitInterval(definition.stiffness ?? 1, "joint stiffness");
      const damping = unitInterval(definition.damping ?? 0.15, "joint damping");
      const index = jointFree[--state.jointFreeCount]!;
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
      state.activeJoints += 1;
      if (!definition.collideConnected) incrementPair(nonCollidingJointPairs, bodyPairKey(a, b));
      return jointHandles.at(index);
    }
  function addRevoluteJoint(definition: PhysicsRevoluteJoint2DDefinition) {
      if (!definition.id || definition.id.length > 256) throw new RangeError("Physics joint id must contain 1-256 characters");
      if (jointIndexById.has(definition.id)) throw new Error(`Physics joint id already exists: ${definition.id}`);
      if (state.jointFreeCount === 0) throw new RangeError(`Physics joint capacity ${maxJoints} is exhausted`);
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
      const index = jointFree[--state.jointFreeCount]!;
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
      state.activeJoints += 1;
      if (!definition.collideConnected) incrementPair(nonCollidingJointPairs, bodyPairKey(a, b));
      return jointHandles.at(index);
    }
  function removeJoint(id: string) {
      const index = jointIndexById.get(id);
      if (index === undefined) return false;
      if ((jointFlags[index] & 1) === 0) decrementPair(nonCollidingJointPairs, bodyPairKey(jointA[index]!, jointB[index]!));
      jointIndexById.delete(id);
      jointIds[index] = undefined;
      jointAlive[index] = 0;
      if (jointHandles.retire(index)) jointFree[state.jointFreeCount++] = index;
      state.activeJoints -= 1;
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
  return {
    addBody,
    removeBody,
    addDistanceJoint,
    addRevoluteJoint,
    removeJoint,
    setBodyAwake,
  };
}
export type Physics2DLifecycleOperationsSet = ReturnType<typeof createPhysics2DLifecycleOperations>;

export function createPhysics2DGeometryOperations(context: Physics2DOperationContext) {
  const { config, bodies, contactStorage, joints,  } = context;
  const {  } = config;
  const { shapeKind, x, y, angle, extentX, extentY,  } = bodies;
  const {  } = contactStorage;
  const {  } = joints;
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
  return {
    collide,
    boxBox,
    circleCircle,
    circleBox,
    worldExtentX,
    worldExtentY,
    projectionRadiusOnAxis,
    supportProjectionX,
    supportProjectionY,
  };
}
export type Physics2DGeometryOperationsSet = ReturnType<typeof createPhysics2DGeometryOperations>;

export function createPhysics2DIntegrationOperations(context: Physics2DOperationContext, operations: Physics2DLifecycleOperationsSet & Physics2DGeometryOperationsSet) {
  const { config, bodies, contactStorage, joints, diagnostics,  } = context;
  const { capacity, gravityX, gravityY, sleepLinearThreshold, sleepAngularThreshold, sleepAfterSeconds } = config;
  const { alive, bodyType, shapeKind, flags, sleeping, sleepTime, x, y, velocityX, velocityY, angle, angularVelocity, extentX, extentY, gravityScale, layer, mask,  } = bodies;
  const {  } = contactStorage;
  const {  } = joints;
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
            operations.setBodyAwake(index, false);
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
          const movingExtentX = operations.projectionRadiusOnAxis(index, cosine, sine);
          const movingExtentY = operations.projectionRadiusOnAxis(index, -sine, cosine);
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
  return {
    updateSleeping,
    integrate,
    integrateContinuous,
  };
}
export type Physics2DIntegrationOperationsSet = ReturnType<typeof createPhysics2DIntegrationOperations>;

export function createPhysics2DContactOperations(context: Physics2DOperationContext, operations: Physics2DGeometryOperationsSet) {
  const { config, bodies, contactStorage, joints, diagnostics, state } = context;
  const { capacity, maxContacts,  } = config;
  const { alive, bodyType, flags, x, layer, mask, sortIndices } = bodies;
  const { contactA, contactB, contactNormalX, contactNormalY, contactPenetration, contactPointX, contactPointY, contactTrigger } = contactStorage;
  const { nonCollidingJointPairs } = joints;
  function buildSortedIndices() {
      let count = 0;
      for (let index = 0; index < capacity; index += 1) if (alive[index]) sortIndices[count++] = index;
      for (let cursor = 1; cursor < count; cursor += 1) {
        const value = sortIndices[cursor]!;
          const valueMin = x[value] - operations.worldExtentX(value);
        let position = cursor - 1;
        while (position >= 0) {
          const previous = sortIndices[position]!;
          const previousMin = x[previous] - operations.worldExtentX(previous);
          if (previousMin < valueMin || (previousMin === valueMin && previous < value)) break;
          sortIndices[position + 1] = previous;
          position -= 1;
        }
        sortIndices[position + 1] = value;
      }
      return count;
    }
  function detectContacts() {
      state.contacts = 0;
      const sortedCount = buildSortedIndices();
      for (let left = 0; left < sortedCount; left += 1) {
        const a = sortIndices[left]!;
        const aMaxX = x[a] + operations.worldExtentX(a);
        for (let right = left + 1; right < sortedCount; right += 1) {
          const b = sortIndices[right]!;
          if (x[b] - operations.worldExtentX(b) > aMaxX) break;
          if ((mask[a] & layer[b]) === 0 || (mask[b] & layer[a]) === 0) continue;
          if (nonCollidingJointPairs.has(bodyPairKey(a, b))) continue;
          if (bodyType[a] === BODY_STATIC && bodyType[b] === BODY_STATIC) continue;
          diagnostics.candidatePairs += 1;
          const hit = operations.collide(a, b);
          if (!hit) continue;
          if (state.contacts >= maxContacts) {
            diagnostics.contactOverflow += 1;
            continue;
          }
          contactA[state.contacts] = a;
          contactB[state.contacts] = b;
          contactNormalX[state.contacts] = hit.normalX;
          contactNormalY[state.contacts] = hit.normalY;
          contactPenetration[state.contacts] = hit.penetration;
          contactPointX[state.contacts] = hit.pointX;
          contactPointY[state.contacts] = hit.pointY;
          contactTrigger[state.contacts] = (flags[a] | flags[b]) & 1;
          state.contacts += 1;
        }
      }
    }
  return {
    buildSortedIndices,
    detectContacts,
  };
}
export type Physics2DContactOperationsSet = ReturnType<typeof createPhysics2DContactOperations>;

export function createPhysics2DSolverOperations(context: Physics2DOperationContext, operations: Physics2DLifecycleOperationsSet) {
  const { config, bodies, contactStorage, joints, state } = context;
  const { maxJoints, positionIterations, sleepLinearThreshold,  } = config;
  const { sleeping, x, y, velocityX, velocityY, angle, angularVelocity, inverseMass, inverseInertia, restitution, friction,  } = bodies;
  const { contactA, contactB, contactNormalX, contactNormalY, contactPenetration, contactPointX, contactPointY, contactTrigger } = contactStorage;
  const { jointAlive, jointKind, jointA, jointB, jointLength, jointStiffness, jointDamping, jointAnchorAX, jointAnchorAY, jointAnchorBX, jointAnchorBY,  } = joints;
  function solveContacts() {
      for (let contactIndex = 0; contactIndex < state.contacts; contactIndex += 1) {
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
          if (sleeping[a]) operations.setBodyAwake(a, true);
          if (sleeping[b]) operations.setBodyAwake(b, true);
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
        for (let contactIndex = 0; contactIndex < state.contacts; contactIndex += 1) {
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
            if (sleeping[a]) operations.setBodyAwake(a, true);
            if (sleeping[b]) operations.setBodyAwake(b, true);
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
          if (sleeping[a]) operations.setBodyAwake(a, true);
          if (sleeping[b]) operations.setBodyAwake(b, true);
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
    solveContacts,
    solveJoints,
  };
}
export type Physics2DSolverOperationsSet = ReturnType<typeof createPhysics2DSolverOperations>;

export type Physics2DOperations = Physics2DLifecycleOperationsSet
  & Physics2DGeometryOperationsSet
  & Physics2DIntegrationOperationsSet
  & Physics2DContactOperationsSet
  & Physics2DSolverOperationsSet;
