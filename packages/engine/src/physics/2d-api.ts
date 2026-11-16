import {
  createContactTarget,
  createRaycastTarget,
  createShapeCastTarget,
} from "./2d-query-targets.ts";
import type { PhysicsPrecision, PhysicsWorld2D } from "./2d.ts";
import {
  BODY_DYNAMIC,
  BODY_STATIC,
  BOX_CORNER_X,
  BOX_CORNER_Y,
  DEFAULT_MASK,
  PHYSICS_DEBUG_CONTACT,
  PHYSICS_DEBUG_DYNAMIC,
  PHYSICS_DEBUG_JOINT,
  PHYSICS_DEBUG_KINEMATIC,
  PHYSICS_DEBUG_SEGMENT_STRIDE,
  PHYSICS_DEBUG_STATIC,
  PHYSICS_DEBUG_TRIGGER,
  SHAPE_BOX,
  boundedInteger,
  finite,
  nonnegative,
  rayBox,
  rayCircle,
  sweepPointAgainstBox,
  unsignedBits,
  validateShape,
} from "./2d-internals.ts";
import type { Physics2DOperationContext, Physics2DOperations } from "./2d-operations.ts";

type Physics2DCoreApi = Pick<PhysicsWorld2D,
  "body" | "setPosition" | "setVelocity" | "setAwake" | "applyImpulse" | "applyImpulseAtPoint" | "joint" | "step" | "contact">;
type Physics2DQueryApi = Pick<PhysicsWorld2D, "queryAabb" | "raycast" | "shapeCast">;
type Physics2DDebugApi = Pick<PhysicsWorld2D, "debugSegmentCount" | "writeDebugSegments">;

function createPhysics2DCoreApi(context: Physics2DOperationContext, operations: Physics2DOperations): Physics2DCoreApi {
  const { bodies, contactStorage, joints, diagnostics, state, resolveIndex, bodyHandles, jointHandles } = context;
  const { bodyType, shapeKind, flags, sleeping, x, y, velocityX, velocityY, angle, angularVelocity, inverseMass, inverseInertia, extentX, extentY, ids, indexById } = bodies;
  const { contactA, contactB, contactNormalX, contactNormalY, contactPenetration, contactPointX, contactPointY, contactTrigger } = contactStorage;
  const { jointKind, jointFlags, jointA, jointB, jointLength, jointStiffness, jointDamping, jointAnchorAX, jointAnchorAY, jointAnchorBX, jointAnchorBY, jointIds, jointIndexById } = joints;
  const { detectContacts, integrate, setBodyAwake, solveContacts, solveJoints, updateSleeping,  } = operations;
  const body: PhysicsWorld2D["body"] = (indexOrId) => {
      const index = typeof indexOrId === "string" ? indexById.get(indexOrId) : bodyHandles.resolve(indexOrId);
      if (index === undefined) return undefined;
      const id = ids[index]!;
      return {
        index: bodyHandles.at(index),
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
    };
  const setPosition: PhysicsWorld2D["setPosition"] = (indexOrId, nextX, nextY) => {
      const index = resolveIndex(indexOrId);
      x[index] = finite(nextX, "x");
      y[index] = finite(nextY, "y");
      setBodyAwake(index, true);
    };
  const setVelocity: PhysicsWorld2D["setVelocity"] = (indexOrId, nextX, nextY) => {
      const index = resolveIndex(indexOrId);
      velocityX[index] = finite(nextX, "velocityX");
      velocityY[index] = finite(nextY, "velocityY");
      setBodyAwake(index, true);
    };
  const setAwake: PhysicsWorld2D["setAwake"] = (indexOrId, nextAwake) => {
      const index = resolveIndex(indexOrId);
      if (typeof nextAwake !== "boolean") throw new TypeError("awake must be boolean");
      setBodyAwake(index, nextAwake);
    };
  const applyImpulse: PhysicsWorld2D["applyImpulse"] = (indexOrId, impulseX, impulseY) => {
      const index = resolveIndex(indexOrId);
      if (bodyType[index] !== BODY_DYNAMIC) return;
      setBodyAwake(index, true);
      velocityX[index] += finite(impulseX, "impulseX") * inverseMass[index];
      velocityY[index] += finite(impulseY, "impulseY") * inverseMass[index];
    };
  const applyImpulseAtPoint: PhysicsWorld2D["applyImpulseAtPoint"] = (indexOrId, impulseX, impulseY, pointX, pointY) => {
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
    };
  const joint: PhysicsWorld2D["joint"] = (indexOrId) => {
      const index = typeof indexOrId === "string" ? jointIndexById.get(indexOrId) : jointHandles.resolve(indexOrId);
      if (index === undefined) return undefined;
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
          index: jointHandles.at(index),
          id: jointIds[index]!,
          aIndex: bodyHandles.at(a),
          bIndex: bodyHandles.at(b),
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
        index: jointHandles.at(index),
        id: jointIds[index]!,
        aIndex: bodyHandles.at(a),
        bIndex: bodyHandles.at(b),
        aId: ids[a]!,
        bId: ids[b]!,
        length: jointLength[index]!,
        stiffness: jointStiffness[index]!,
        damping: jointDamping[index]!,
        collideConnected: (jointFlags[index] & 1) !== 0,
      };
    };
  const step: PhysicsWorld2D["step"] = (seconds) => {
      const dt = finite(seconds, "seconds");
      if (dt <= 0 || dt > 0.25) throw new RangeError("Physics step must be greater than zero and at most 0.25 seconds");
      diagnostics.steps += 1;
      diagnostics.candidatePairs = 0;
      integrate(dt);
      detectContacts();
      solveContacts();
      solveJoints();
      updateSleeping(dt);
      return state.contacts;
    };
  const contact: PhysicsWorld2D["contact"] = (index, target = createContactTarget()) => {
      if (!Number.isSafeInteger(index) || index < 0 || index >= state.contacts) throw new RangeError(`Unknown contact index: ${index}`);
      const a = contactA[index]!;
      const b = contactB[index]!;
      target.aIndex = bodyHandles.at(a);
      target.bIndex = bodyHandles.at(b);
      target.aId = ids[a]!;
      target.bId = ids[b]!;
      target.normalX = contactNormalX[index]!;
      target.normalY = contactNormalY[index]!;
      target.penetration = contactPenetration[index]!;
      target.pointX = contactPointX[index]!;
      target.pointY = contactPointY[index]!;
      target.trigger = contactTrigger[index] !== 0;
      return target;
    };
  return { body, setPosition, setVelocity, setAwake, applyImpulse, applyImpulseAtPoint, joint, step, contact };
}

function createPhysics2DQueryApi(context: Physics2DOperationContext, operations: Physics2DOperations): Physics2DQueryApi {
  const { bodyHandles } = context;
  const { config, bodies, contactStorage, joints,  } = context;
  const { capacity,  } = config;
  const { alive, bodyType, shapeKind, flags, x, y, angle, extentX, extentY, layer, ids } = bodies;
  const { rayScratch } = contactStorage;
  const {  } = joints;
  const { worldExtentX, worldExtentY } = operations;
  const queryAabb: PhysicsWorld2D["queryAabb"] = (minX, minY, maxX, maxY, output) => {
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
        output[count++] = bodyHandles.at(index);
      }
      return count;
    };
  const raycast: PhysicsWorld2D["raycast"] = (originX, originY, directionX, directionY, maxDistance, queryMask = DEFAULT_MASK, target = createRaycastTarget()) => {
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
      target.index = bodyHandles.at(closestIndex);
      target.id = ids[closestIndex]!;
      target.distance = closestDistance;
      target.x = startX + rayX * closestDistance;
      target.y = startY + rayY * closestDistance;
      target.normalX = closestNormalX;
      target.normalY = closestNormalY;
      return target;
    };
  const shapeCast: PhysicsWorld2D["shapeCast"] = (authoredShape, authoredStartX, authoredStartY, authoredAngle, authoredDeltaX, authoredDeltaY, layerMask = DEFAULT_MASK, target = createShapeCastTarget()) => {
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
      target.index = bodyHandles.at(closestIndex);
      target.id = ids[closestIndex]!;
      target.fraction = closestFraction;
      target.x = startX + deltaX * closestFraction;
      target.y = startY + deltaY * closestFraction;
      target.normalX = closestNormalX;
      target.normalY = closestNormalY;
      return target;
    };
  return { queryAabb, raycast, shapeCast };
}

function createPhysics2DDebugApi(context: Physics2DOperationContext): Physics2DDebugApi {
  const { config, bodies, contactStorage, joints, state } = context;
  const { capacity, maxJoints } = config;
  const { alive, bodyType, shapeKind, flags, x, y, angle, extentX, extentY,  } = bodies;
  const { contactNormalX, contactNormalY, contactPointX, contactPointY,  } = contactStorage;
  const { jointAlive, jointKind, jointA, jointB, jointAnchorAX, jointAnchorAY, jointAnchorBX, jointAnchorBY,  } = joints;
  const debugSegmentCount: PhysicsWorld2D["debugSegmentCount"] = (circleSegments = 12) => {
      const circleEdges = boundedInteger(circleSegments, 3, 128, "circleSegments");
      let count = state.contacts + state.activeJoints;
      for (let index = 0; index < capacity; index += 1) {
        if (!alive[index]) continue;
        count += shapeKind[index] === SHAPE_BOX ? 4 : circleEdges;
      }
      return count;
    };
  const writeDebugSegments: PhysicsWorld2D["writeDebugSegments"] = (output, circleSegments = 12) => {
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
      for (let contactIndex = 0; contactIndex < state.contacts; contactIndex += 1) {
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
    };
  return { debugSegmentCount, writeDebugSegments };
}

export function createPhysicsWorld2DApi(options: {
  context: Physics2DOperationContext;
  operations: Physics2DOperations;
  precision: PhysicsPrecision;
  floatStorageBytes: number;
}): PhysicsWorld2D {
  const { context, operations, precision, floatStorageBytes } = options;
  const { capacity, maxContacts, maxJoints } = context.config;
  const { diagnostics, state } = context;
  const core = createPhysics2DCoreApi(context, operations);
  const queries = createPhysics2DQueryApi(context, operations);
  const debug = createPhysics2DDebugApi(context);
  return {
    capacity,
    maxContacts,
    maxJoints,
    precision,
    numericStorageBytes: context.bodyHandles.storageBytes + context.jointHandles.storageBytes + capacity * (21 + floatStorageBytes * 14)
      + maxContacts * (9 + floatStorageBytes * 5)
      + maxJoints * (15 + floatStorageBytes * 7)
      + floatStorageBytes * 3,
    diagnostics,
    addBody: operations.addBody,
    removeBody: operations.removeBody,
    hasBody: (id) => context.bodies.indexById.has(id),
    bodyIndex: (id) => { const slot = context.bodies.indexById.get(id); return slot === undefined ? -1 : context.bodyHandles.at(slot); },
    ...core,
    addDistanceJoint: operations.addDistanceJoint,
    addRevoluteJoint: operations.addRevoluteJoint,
    removeJoint: operations.removeJoint,
    jointCount: () => state.activeJoints,
    contactCount: () => state.contacts,
    ...queries,
    ...debug,
  };
}
