import type { RigidConstraintStore3D } from "./rigid-3d-constraints.ts";
import type { RigidPhysicsPrecision3D, RigidWorld3D } from "./rigid-3d.ts";
import {
  DEFAULT_LAYER,
  DEFAULT_MASK,
  FLAG_CONTINUOUS,
  FLAG_TRIGGER,
  MAX_GENERATION,
  RIGID_DEBUG_CONTACT_3D,
  RIGID_DEBUG_DYNAMIC_3D,
  RIGID_DEBUG_KINEMATIC_3D,
  RIGID_DEBUG_SEGMENT_STRIDE_3D,
  RIGID_DEBUG_STATIC_3D,
  RIGID_DEBUG_TRIGGER_3D,
  SHAPE_BOX,
  SHAPE_SPHERE,
  TYPE_DYNAMIC,
  TYPE_KINEMATIC,
  TYPE_STATIC,
  booleanOption,
  boundedInteger,
  finite,
  identifier,
  interval,
  nonnegative,
  positive,
  rayAabbUnit,
  uint32,
} from "./rigid-3d-internals.ts";
import type { RigidOperationContext, RigidOperations } from "./rigid-3d-operations.ts";

type RigidBodyApi = Pick<RigidWorld3D,
  "addBody" | "removeBody" | "hasBody" | "body" | "setPosition" | "setVelocity" | "setRotation"
  | "setAngularVelocity" | "applyTorqueImpulse" | "applyImpulse">;
type RigidSimulationApi = Pick<RigidWorld3D, "step" | "contactCount" | "contact">;
type RigidQueryApi = Pick<RigidWorld3D, "queryAabb" | "raycast">;
type RigidDebugApi = Pick<RigidWorld3D, "debugSegmentCount" | "writeDebugSegments">;

function createRigidBodyApi(context: RigidOperationContext, operations: RigidOperations, constraintStore: RigidConstraintStore3D): RigidBodyApi {
  const { config, bodies, contactStorage, diagnostics, mutable } = context;
  const { capacity,  } = config;
  const { alive, bodyType, shapeKind, flags, generation, layer, mask, positionX, positionY, positionZ, previousX, previousY, previousZ, velocityX, velocityY, velocityZ, rotationX, rotationY, rotationZ, rotationW, angularVelocityX, angularVelocityY, angularVelocityZ, angularDamping, extentX, extentY, extentZ, inverseMass, restitution, friction, gravityScale, free, ids, indexById } = bodies;
  const {  } = contactStorage;
  const { handleAt, resolve, resolveOptional, setQuaternion, state, updateAabb } = operations;
  const addBody: RigidWorld3D["addBody"] = (definition) => {
        if (!definition || typeof definition !== "object") throw new TypeError("Rigid body definition must be an object.");
        for (const key of ["constraints", "joints", "torque", "quaternion", "angle"]) if (Reflect.get(definition, key) !== undefined) {
          throw new Error(`${key} is not an inline body property; use the bounded rigid-world rotation/constraint methods.`);
        }
        const id = identifier(definition.id, "id");
        if (indexById.has(id)) throw new Error(`Rigid body id ${JSON.stringify(id)} already exists.`);
        if (mutable.freeCount === 0) throw new RangeError(`Rigid body capacity ${capacity} is exhausted.`);
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
        } else throw new Error(`Unsupported rigid shape kind ${JSON.stringify(Reflect.get(definition.shape, "kind"))}.`);
        const bodyRestitution = interval(definition.restitution ?? 0, 0, 1, "restitution");
        const bodyFriction = interval(definition.friction ?? 0.5, 0, 1, "friction");
        const bodyGravityScale = nonnegative(definition.gravityScale ?? 1, "gravityScale");
        const bodyLayer = uint32(definition.collisionLayer ?? DEFAULT_LAYER, "collisionLayer");
        const bodyMask = uint32(definition.collisionMask ?? DEFAULT_MASK, "collisionMask");
        finite(px - ex, "shape minimum x"); finite(px + ex, "shape maximum x");
        finite(py - ey, "shape minimum y"); finite(py + ey, "shape maximum y");
        finite(pz - ez, "shape minimum z"); finite(pz + ez, "shape maximum z");
        const index = free[--mutable.freeCount]!;
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
        mutable.bodyCount += 1; diagnostics.bodies = mutable.bodyCount;
        return handleAt(index);
      };
  const removeBody: RigidWorld3D["removeBody"] = (handleOrId) => {
        const index = resolveOptional(handleOrId);
        if (index === undefined) return false;
        indexById.delete(ids[index]!); ids[index] = undefined; alive[index] = 0; flags[index] = 0;
        constraintStore.removeBody(index);
        mutable.bodyCount -= 1; diagnostics.bodies = mutable.bodyCount;
        if (generation[index] !== MAX_GENERATION) {
          generation[index] += 1;
          free[mutable.freeCount++] = index;
        }
        return true;
      };
  const hasBody: RigidWorld3D["hasBody"] = (handleOrId) => { return resolveOptional(handleOrId) !== undefined; };
  const body: RigidWorld3D["body"] = (handleOrId) => {
        const index = resolveOptional(handleOrId);
        return index === undefined ? undefined : state(index);
      };
  const setPosition: RigidWorld3D["setPosition"] = (handleOrId, x, y, z) => {
        const index = resolve(handleOrId);
        x = finite(x, "x"); y = finite(y, "y"); z = finite(z, "z");
        finite(x - extentX[index]!, "shape minimum x"); finite(x + extentX[index]!, "shape maximum x");
        finite(y - extentY[index]!, "shape minimum y"); finite(y + extentY[index]!, "shape maximum y");
        finite(z - extentZ[index]!, "shape minimum z"); finite(z + extentZ[index]!, "shape maximum z");
        positionX[index] = x; positionY[index] = y; positionZ[index] = z;
        previousX[index] = positionX[index]!; previousY[index] = positionY[index]!; previousZ[index] = positionZ[index]!; updateAabb(index);
      };
  const setVelocity: RigidWorld3D["setVelocity"] = (handleOrId, x, y, z) => {
        const index = resolve(handleOrId);
        if (bodyType[index] === TYPE_STATIC) throw new Error("Static bodies cannot have velocity.");
        velocityX[index] = finite(x, "velocityX"); velocityY[index] = finite(y, "velocityY"); velocityZ[index] = finite(z, "velocityZ");
      };
  const setRotation: RigidWorld3D["setRotation"] = (handleOrId, x, y, z, w) => { setQuaternion(resolve(handleOrId), x, y, z, w); };
  const setAngularVelocity: RigidWorld3D["setAngularVelocity"] = (handleOrId, x, y, z) => {
        const index = resolve(handleOrId); if (bodyType[index] === TYPE_STATIC) throw new Error("Static bodies cannot have angular velocity.");
        angularVelocityX[index] = finite(x, "angularVelocityX"); angularVelocityY[index] = finite(y, "angularVelocityY"); angularVelocityZ[index] = finite(z, "angularVelocityZ");
      };
  const applyTorqueImpulse: RigidWorld3D["applyTorqueImpulse"] = (handleOrId, x, y, z) => {
        const index = resolve(handleOrId); if (bodyType[index] !== TYPE_DYNAMIC) throw new Error("Torque impulses can be applied only to dynamic bodies.");
        angularVelocityX[index] = finite(angularVelocityX[index]! + finite(x, "torqueImpulseX") * inverseMass[index]!, "resulting angularVelocityX");
        angularVelocityY[index] = finite(angularVelocityY[index]! + finite(y, "torqueImpulseY") * inverseMass[index]!, "resulting angularVelocityY");
        angularVelocityZ[index] = finite(angularVelocityZ[index]! + finite(z, "torqueImpulseZ") * inverseMass[index]!, "resulting angularVelocityZ");
      };
  const applyImpulse: RigidWorld3D["applyImpulse"] = (handleOrId, x, y, z) => {
        const index = resolve(handleOrId);
        if (bodyType[index] !== TYPE_DYNAMIC) throw new Error("Impulses can be applied only to dynamic bodies.");
        const nextX = velocityX[index]! + finite(x, "impulseX") * inverseMass[index]!;
        const nextY = velocityY[index]! + finite(y, "impulseY") * inverseMass[index]!;
        const nextZ = velocityZ[index]! + finite(z, "impulseZ") * inverseMass[index]!;
        velocityX[index] = finite(nextX, "resulting velocityX"); velocityY[index] = finite(nextY, "resulting velocityY"); velocityZ[index] = finite(nextZ, "resulting velocityZ");
      };
  return { addBody, removeBody, hasBody, body, setPosition, setVelocity, setRotation, setAngularVelocity, applyTorqueImpulse, applyImpulse };
}

function createRigidSimulationApi(context: RigidOperationContext, operations: RigidOperations, constraintStore: RigidConstraintStore3D): RigidSimulationApi {
  const { config, bodies, contactStorage, diagnostics, contactScratch, mutable } = context;
  const { capacity, velocityIterations, positionIterations, gravityX, gravityY, gravityZ } = config;
  const { alive, bodyType, flags, positionX, positionY, positionZ, previousX, previousY, previousZ, velocityX, velocityY, velocityZ, gravityScale, ids } = bodies;
  const { contactA, contactB, contactNormalX, contactNormalY, contactNormalZ, contactPenetration, contactPointX, contactPointY, contactPointZ, contactTrigger } = contactStorage;
  const { collectContacts, detect, handleAt, integrateRotation, runCcd, solvePosition, solveVelocity, updateAabb } = operations;
  const step: RigidWorld3D["step"] = (seconds) => {
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
          for (let contact = 0; contact < mutable.currentContacts; contact += 1) {
            if (!contactTrigger[contact]) solveVelocity(contactA[contact]!, contactB[contact]!, contactNormalX[contact]!, contactNormalY[contact]!, contactNormalZ[contact]!);
          }
        }
        for (let iteration = 0; iteration < positionIterations; iteration += 1) {
          for (let contact = 0; contact < mutable.currentContacts; contact += 1) {
            if (contactTrigger[contact]) continue;
            const a = contactA[contact]!; const b = contactB[contact]!;
            if (detect(a, b, contactScratch)) solvePosition(a, b, contactScratch.normalX, contactScratch.normalY, contactScratch.normalZ, contactScratch.penetration);
          }
        }
        constraintStore.solve();
        return mutable.currentContacts;
      };
  const contactCount: RigidWorld3D["contactCount"] = () => { return mutable.currentContacts; };
  const contact: RigidWorld3D["contact"] = (index, target) => {
        if (!target || typeof target !== "object") throw new TypeError("Contact target is required.");
        if (!Number.isInteger(index) || index < 0 || index >= mutable.currentContacts) throw new RangeError(`Contact index ${index} is out of range.`);
        const a = contactA[index]!; const b = contactB[index]!;
        target.a = handleAt(a); target.b = handleAt(b); target.aId = ids[a]!; target.bId = ids[b]!;
        target.normalX = contactNormalX[index]!; target.normalY = contactNormalY[index]!; target.normalZ = contactNormalZ[index]!;
        target.penetration = contactPenetration[index]!; target.pointX = contactPointX[index]!; target.pointY = contactPointY[index]!; target.pointZ = contactPointZ[index]!;
        target.trigger = contactTrigger[index] !== 0;
        return target;
      };
  return { step, contactCount, contact };
}

function createRigidQueryApi(context: RigidOperationContext, operations: RigidOperations): RigidQueryApi {
  const { config, bodies, contactStorage, diagnostics, sweepScratch } = context;
  const { capacity,  } = config;
  const { alive, shapeKind, layer, aabbMinX, aabbMinY, aabbMinZ, aabbMaxX, aabbMaxY, aabbMaxZ, ids } = bodies;
  const {  } = contactStorage;
  const { handleAt, raySphere, updateAabb } = operations;
  const queryAabb: RigidWorld3D["queryAabb"] = (minX, minY, minZ, maxX, maxY, maxZ, output) => {
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
      };
  const raycast: RigidWorld3D["raycast"] = (ox, oy, oz, dx, dy, dz, maxDistance, queryMask, target) => {
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
      };
  return { queryAabb, raycast };
}

function createRigidDebugApi(context: RigidOperationContext, operations: RigidOperations): RigidDebugApi {
  const { config, bodies, contactStorage, mutable } = context;
  const { capacity,  } = config;
  const { alive, bodyType, shapeKind, flags, positionX, positionY, positionZ, extentX,  } = bodies;
  const { contactNormalX, contactNormalY, contactNormalZ, contactPointX, contactPointY, contactPointZ } = contactStorage;
  const { writeBoxEdges } = operations;
  const debugSegmentCount: RigidWorld3D["debugSegmentCount"] = (sphereSegments = 12) => {
        sphereSegments = boundedInteger(sphereSegments, 4, 64, "sphereSegments");
        let count = mutable.currentContacts;
        for (let index = 0; index < capacity; index += 1) if (alive[index]) count += shapeKind[index] === SHAPE_SPHERE ? sphereSegments * 3 : 12;
        return count;
      };
  const writeDebugSegments: RigidWorld3D["writeDebugSegments"] = (output, sphereSegments = 12) => {
        sphereSegments = boundedInteger(sphereSegments, 4, 64, "sphereSegments");
        if (!(output instanceof Float32Array)) throw new TypeError("Debug output must be a Float32Array.");
        const required = debugSegmentCount(sphereSegments) * RIGID_DEBUG_SEGMENT_STRIDE_3D;
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
        for (let index = 0; index < mutable.currentContacts; index += 1) {
          write(contactPointX[index]!, contactPointY[index]!, contactPointZ[index]!, contactPointX[index]! + contactNormalX[index]!, contactPointY[index]! + contactNormalY[index]!, contactPointZ[index]! + contactNormalZ[index]!, RIGID_DEBUG_CONTACT_3D);
        }
        return segment;
      };
  return { debugSegmentCount, writeDebugSegments };
}

export function createRigidWorld3DApi(options: {
  context: RigidOperationContext;
  operations: RigidOperations;
  constraintStore: RigidConstraintStore3D;
  precision: RigidPhysicsPrecision3D;
  numericStorageBytes: number;
}): RigidWorld3D {
  const { context, operations, constraintStore, precision, numericStorageBytes } = options;
  const { capacity, maxContacts, maxCandidatePairs, maxCcdTests } = context.config;
  return {
    capacity,
    maxContacts,
    maxCandidatePairs,
    maxCcdTests,
    precision,
    numericStorageBytes,
    diagnostics: context.diagnostics,
    ...createRigidBodyApi(context, operations, constraintStore),
    addDistanceConstraint: constraintStore.add,
    removeConstraint: constraintStore.remove,
    constraint: constraintStore.get,
    constraintCount: constraintStore.count,
    ...createRigidSimulationApi(context, operations, constraintStore),
    ...createRigidQueryApi(context, operations),
    ...createRigidDebugApi(context, operations),
  };
}
