import { cos, hypot, sin, sqrt } from '../math/simulation.ts';
import type { RigidConstraintStore3D } from "./rigid-3d-constraints.ts";
import { assertRigidCheckpointTopology3D } from './rigid/checkpoint-topology.ts';
import { createPortableRigidContacts } from './rigid/portable-contacts.ts';
import type { RigidPhysicsPrecision3D, RigidWorld3D, RigidWorldCheckpoint3D } from "./rigid-3d.ts";
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
  rigidQuaternionLength,
  uint32,
} from "./rigid-3d-internals.ts";
import { rotateQuaternionVector, type RigidOperationContext, type RigidOperations } from "./rigid-3d-operations.ts";

type RigidBodyApi = Pick<RigidWorld3D,
  "addBody" | "removeBody" | "hasBody" | "body" | "readVelocity" | "configureBody" | "setPosition" | "setVelocity" | "setRotation"
  | "setAngularVelocity" | "applyTorqueImpulse" | "applyImpulse" | "applyImpulseAtPoint">;
type RigidSimulationApi = Pick<RigidWorld3D, "step" | "contactCount" | "contact">;
type RigidQueryApi = Pick<RigidWorld3D, "queryAabb" | "raycast" | "sweepSphere">;
type RigidDebugApi = Pick<RigidWorld3D, "debugSegmentCount" | "writeDebugSegments">;
type RigidCheckpointApi = Pick<RigidWorld3D, "checkpoint" | "restoreCheckpoint">;

function createRigidBodyApi(context: RigidOperationContext, operations: RigidOperations, constraintStore: RigidConstraintStore3D): RigidBodyApi {
  const { config, bodies, contactStorage, diagnostics, mutable } = context;
  const { capacity,  } = config;
  const { alive, bodyType, shapeKind, flags, generation, layer, mask, positionX, positionY, positionZ, previousX, previousY, previousZ, velocityX, velocityY, velocityZ, rotationX, rotationY, rotationZ, rotationW, previousRotationX, previousRotationY, previousRotationZ, previousRotationW, angularVelocityX, angularVelocityY, angularVelocityZ, linearDamping, angularDamping, extentX, extentY, extentZ, inverseMass, inverseInertiaX, inverseInertiaY, inverseInertiaZ, restitution, friction, gravityScale, fractureEnergyJoules, retainedEnergyRatio, free, ids, indexById } = bodies;
  const {  } = contactStorage;
  const { handleAt, resolve, resolveOptional, setQuaternion, state, updateAabb } = operations;
  const torqueImpulseScratch = [0, 0, 0];
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
        if (definition.impactResponse !== undefined && (!definition.impactResponse || typeof definition.impactResponse !== "object")) throw new TypeError("impactResponse must be an object.");
        const fractureEnergy = definition.impactResponse ? positive(definition.impactResponse.fractureEnergyJoules, "impactResponse.fractureEnergyJoules") : 0;
        const retainedEnergy = definition.impactResponse ? interval(definition.impactResponse.retainedEnergyRatio ?? .85, 0, 1, "impactResponse.retainedEnergyRatio") : 0;
        const bodyLayer = uint32(definition.collisionLayer ?? DEFAULT_LAYER, "collisionLayer");
        const bodyMask = uint32(definition.collisionMask ?? DEFAULT_MASK, "collisionMask");
        finite(px - ex, "shape minimum x"); finite(px + ex, "shape maximum x");
        finite(py - ey, "shape minimum y"); finite(py + ey, "shape maximum y");
        finite(pz - ez, "shape minimum z"); finite(pz + ez, "shape maximum z");
        const bodyLinearDamping = nonnegative(definition.linearDamping ?? 0, "linearDamping");
        const bodyAngularDamping = nonnegative(definition.angularDamping ?? 0.05, "angularDamping");
        const orientation = definition.rotation;
        const rx = orientation?.[0] ?? 0, ry = orientation?.[1] ?? 0, rz = orientation?.[2] ?? 0, rw = orientation?.[3] ?? 1;
        const rotationLength = rigidQuaternionLength(rx, ry, rz, rw);
        const index = free[--mutable.freeCount]!;
        alive[index] = 1; bodyType[index] = type === "static" ? TYPE_STATIC : isDynamic ? TYPE_DYNAMIC : TYPE_KINEMATIC; shapeKind[index] = shape;
        flags[index] = (trigger ? FLAG_TRIGGER : 0) | (continuous ? FLAG_CONTINUOUS : 0);
        positionX[index] = previousX[index] = px; positionY[index] = previousY[index] = py; positionZ[index] = previousZ[index] = pz;
        velocityX[index] = vx; velocityY[index] = vy; velocityZ[index] = vz;
        rotationX[index] = 0; rotationY[index] = 0; rotationZ[index] = 0; rotationW[index] = 1;
        angularVelocityX[index] = avx; angularVelocityY[index] = avy; angularVelocityZ[index] = avz;
        linearDamping[index] = bodyLinearDamping;
        angularDamping[index] = bodyAngularDamping;
        extentX[index] = ex; extentY[index] = ey; extentZ[index] = ez;
        inverseMass[index] = isDynamic ? 1 / mass : 0;
        if (!isDynamic) inverseInertiaX[index] = inverseInertiaY[index] = inverseInertiaZ[index] = 0;
        else if (shape === SHAPE_SPHERE) inverseInertiaX[index] = inverseInertiaY[index] = inverseInertiaZ[index] = 5 / (2 * mass * ex * ex);
        else {
          inverseInertiaX[index] = 3 / (mass * (ey * ey + ez * ez));
          inverseInertiaY[index] = 3 / (mass * (ex * ex + ez * ez));
          inverseInertiaZ[index] = 3 / (mass * (ex * ex + ey * ey));
        }
        restitution[index] = bodyRestitution; friction[index] = bodyFriction; gravityScale[index] = bodyGravityScale; fractureEnergyJoules[index] = fractureEnergy; retainedEnergyRatio[index] = retainedEnergy;
        layer[index] = bodyLayer; mask[index] = bodyMask;
        ids[index] = id; indexById.set(id, index);
        rotationX[index] = rx / rotationLength; rotationY[index] = ry / rotationLength;
        rotationZ[index] = rz / rotationLength; rotationW[index] = rw / rotationLength;
        updateAabb(index);
        previousRotationX[index] = rotationX[index]!; previousRotationY[index] = rotationY[index]!; previousRotationZ[index] = rotationZ[index]!; previousRotationW[index] = rotationW[index]!;
        mutable.bodyCount += 1; diagnostics.bodies = mutable.bodyCount;
        return handleAt(index);
      };
  const removeBody: RigidWorld3D["removeBody"] = (handleOrId) => {
        const index = resolveOptional(handleOrId);
        if (index === undefined) return false;
        indexById.delete(ids[index]!); ids[index] = undefined; alive[index] = 0; flags[index] = 0;
        constraintStore.removeBody(index);
        // Slot reuse creates a new body generation; its contacts must start cold.
        for (let contact = 0; contact < mutable.currentContacts; contact += 1) {
          if (contactStorage.contactA[contact] === index || contactStorage.contactB[contact] === index) {
            contactStorage.contactManifoldPointCount[contact] = 0;
          }
        }
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
  const readVelocity: RigidWorld3D['readVelocity'] = (handleOrId, output) => {
        const index = resolveOptional(handleOrId);
        if (index === undefined) return undefined;
        output.x = velocityX[index]!;output.y = velocityY[index]!;output.z = velocityZ[index]!;
        return bodyType[index] === TYPE_STATIC ? 'static' : bodyType[index] === TYPE_DYNAMIC ? 'dynamic' : 'kinematic';
      };
  const configureBody: RigidWorld3D["configureBody"] = (handleOrId, update) => {
        const index = resolve(handleOrId);
        if (!update || typeof update !== "object") throw new TypeError("Rigid body runtime configuration must be an object.");
        const priorType = bodyType[index] === TYPE_STATIC ? "static" : bodyType[index] === TYPE_DYNAMIC ? "dynamic" : "kinematic";
        const type = update.type ?? priorType;
        if (type !== "static" && type !== "dynamic" && type !== "kinematic") throw new Error(`Unsupported rigid body type ${JSON.stringify(type)}.`);
        const isDynamic = type === "dynamic";
        if (!isDynamic && update.mass !== undefined) throw new Error(`${type} bodies have infinite mass and cannot declare mass.`);
        const priorMass = inverseMass[index]! > 0 ? 1 / inverseMass[index]! : undefined;
        if (isDynamic && update.mass === undefined && priorMass === undefined) throw new Error("Changing a non-dynamic body to dynamic requires mass.");
        const mass = isDynamic ? positive(update.mass ?? priorMass!, "mass") : Number.POSITIVE_INFINITY;
        const continuous = booleanOption(update.continuous, (flags[index]! & FLAG_CONTINUOUS) !== 0, "continuous");
        if (continuous && !isDynamic) throw new Error("Continuous collision detection is available only for dynamic bodies.");
        if (continuous && (flags[index]! & FLAG_TRIGGER) !== 0) throw new Error("Continuous trigger sweeps are not supported; use a discrete trigger or a ray/AABB query.");
        bodyType[index] = type === "static" ? TYPE_STATIC : isDynamic ? TYPE_DYNAMIC : TYPE_KINEMATIC;
        flags[index] = (flags[index]! & FLAG_TRIGGER) | (continuous ? FLAG_CONTINUOUS : 0);
        inverseMass[index] = isDynamic ? 1 / mass : 0;
        if (!isDynamic) inverseInertiaX[index] = inverseInertiaY[index] = inverseInertiaZ[index] = 0;
        else if (shapeKind[index] === SHAPE_SPHERE) inverseInertiaX[index] = inverseInertiaY[index] = inverseInertiaZ[index] = 5 / (2 * mass * extentX[index]! * extentX[index]!);
        else {
          inverseInertiaX[index] = 3 / (mass * (extentY[index]! * extentY[index]! + extentZ[index]! * extentZ[index]!));
          inverseInertiaY[index] = 3 / (mass * (extentX[index]! * extentX[index]! + extentZ[index]! * extentZ[index]!));
          inverseInertiaZ[index] = 3 / (mass * (extentX[index]! * extentX[index]! + extentY[index]! * extentY[index]!));
        }
        if (update.collisionLayer !== undefined) layer[index] = uint32(update.collisionLayer, "collisionLayer");
        if (update.collisionMask !== undefined) mask[index] = uint32(update.collisionMask, "collisionMask");
        updateAabb(index);
        return state(index);
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
        const angular = operations.applyInverseInertia(index, finite(x, "torqueImpulseX"), finite(y, "torqueImpulseY"), finite(z, "torqueImpulseZ"), torqueImpulseScratch);
        angularVelocityX[index] = finite(angularVelocityX[index]! + angular[0]!, "resulting angularVelocityX");
        angularVelocityY[index] = finite(angularVelocityY[index]! + angular[1]!, "resulting angularVelocityY");
        angularVelocityZ[index] = finite(angularVelocityZ[index]! + angular[2]!, "resulting angularVelocityZ");
      };
  const applyImpulse: RigidWorld3D["applyImpulse"] = (handleOrId, x, y, z) => {
        const index = resolve(handleOrId);
        if (bodyType[index] !== TYPE_DYNAMIC) throw new Error("Impulses can be applied only to dynamic bodies.");
        const nextX = velocityX[index]! + finite(x, "impulseX") * inverseMass[index]!;
        const nextY = velocityY[index]! + finite(y, "impulseY") * inverseMass[index]!;
        const nextZ = velocityZ[index]! + finite(z, "impulseZ") * inverseMass[index]!;
        velocityX[index] = finite(nextX, "resulting velocityX"); velocityY[index] = finite(nextY, "resulting velocityY"); velocityZ[index] = finite(nextZ, "resulting velocityZ");
      };
  const pointImpulseScratch = [0, 0, 0];
  const applyImpulseAtPoint: RigidWorld3D["applyImpulseAtPoint"] = (handleOrId, impulseX, impulseY, impulseZ, pointX, pointY, pointZ) => {
        const index = resolve(handleOrId);
        if (bodyType[index] !== TYPE_DYNAMIC) throw new Error("Point impulses can be applied only to dynamic bodies.");
        impulseX = finite(impulseX, "impulseX"); impulseY = finite(impulseY, "impulseY"); impulseZ = finite(impulseZ, "impulseZ");
        pointX = finite(pointX, "pointX"); pointY = finite(pointY, "pointY"); pointZ = finite(pointZ, "pointZ");
        const rx = pointX - positionX[index]!, ry = pointY - positionY[index]!, rz = pointZ - positionZ[index]!;
        velocityX[index] = finite(velocityX[index]! + impulseX * inverseMass[index]!, "resulting velocityX");
        velocityY[index] = finite(velocityY[index]! + impulseY * inverseMass[index]!, "resulting velocityY");
        velocityZ[index] = finite(velocityZ[index]! + impulseZ * inverseMass[index]!, "resulting velocityZ");
        operations.applyInverseInertia(index, ry * impulseZ - rz * impulseY, rz * impulseX - rx * impulseZ, rx * impulseY - ry * impulseX, pointImpulseScratch);
        angularVelocityX[index] = finite(angularVelocityX[index]! + pointImpulseScratch[0]!, "resulting angularVelocityX");
        angularVelocityY[index] = finite(angularVelocityY[index]! + pointImpulseScratch[1]!, "resulting angularVelocityY");
        angularVelocityZ[index] = finite(angularVelocityZ[index]! + pointImpulseScratch[2]!, "resulting angularVelocityZ");
      };
  return { addBody, removeBody, hasBody, body, readVelocity, configureBody, setPosition, setVelocity, setRotation, setAngularVelocity, applyTorqueImpulse, applyImpulse, applyImpulseAtPoint };
}

function createRigidSimulationApi(context: RigidOperationContext, operations: RigidOperations, constraintStore: RigidConstraintStore3D): RigidSimulationApi {
  const { config, bodies, contactStorage, diagnostics, mutable } = context;
  const { capacity, velocityIterations, positionIterations, gravityX, gravityY, gravityZ } = config;
  const { alive, bodyType, flags, positionX, positionY, positionZ, previousX, previousY, previousZ, velocityX, velocityY, velocityZ, rotationX, rotationY, rotationZ, rotationW, previousRotationX, previousRotationY, previousRotationZ, previousRotationW, gravityScale, ids } = bodies;
  const { contactA, contactB, contactNormalX, contactNormalY, contactNormalZ, contactPenetration, contactPointX, contactPointY, contactPointZ, contactTrigger, contactClosingSpeed, contactEffectiveMass, contactImpactEnergy, contactNormalImpulse, contactFailedBody, contactManifoldPointCount, contactWarmStartedPointCount } = contactStorage;
  const { collectContacts, dampLinearVelocity, handleAt, integrateRotation, runCcd, solvePosition, solveVelocity, updateAabb, warmStart } = operations;
  const step: RigidWorld3D["step"] = (seconds) => {
        seconds = interval(seconds, Number.EPSILON, 0.25, "seconds");
        diagnostics.steps += 1; diagnostics.candidatePairs = 0; diagnostics.contacts = 0; diagnostics.ccdTests = 0; diagnostics.ccdAngularTests = 0; diagnostics.ccdEligiblePairs = 0; diagnostics.ccdBoundsRejects = 0;
        for (let index = 0; index < capacity; index += 1) {
          if (!alive[index]) continue;
          previousX[index] = positionX[index]!; previousY[index] = positionY[index]!; previousZ[index] = positionZ[index]!;
          previousRotationX[index] = rotationX[index]!; previousRotationY[index] = rotationY[index]!; previousRotationZ[index] = rotationZ[index]!; previousRotationW[index] = rotationW[index]!;
          if (bodyType[index] === TYPE_DYNAMIC) {
            velocityX[index] = finite(velocityX[index]! + gravityX * gravityScale[index]! * seconds, `body ${ids[index]} velocityX`);
            velocityY[index] = finite(velocityY[index]! + gravityY * gravityScale[index]! * seconds, `body ${ids[index]} velocityY`);
            velocityZ[index] = finite(velocityZ[index]! + gravityZ * gravityScale[index]! * seconds, `body ${ids[index]} velocityZ`);
            dampLinearVelocity(index, seconds);
          }
        }
        for (let index = 0; index < capacity; index += 1) {
          if (!alive[index]) continue;
          if (bodyType[index] === TYPE_DYNAMIC || bodyType[index] === TYPE_KINEMATIC) {
            positionX[index] = finite(positionX[index]! + velocityX[index]! * seconds, `body ${ids[index]} x`);
            positionY[index] = finite(positionY[index]! + velocityY[index]! * seconds, `body ${ids[index]} y`);
            positionZ[index] = finite(positionZ[index]! + velocityZ[index]! * seconds, `body ${ids[index]} z`);
            integrateRotation(index, seconds);
            updateAabb(index);
          }
        }
        for (let index = 0; index < capacity; index += 1) if (alive[index] && bodyType[index] === TYPE_DYNAMIC && (flags[index]! & FLAG_CONTINUOUS) !== 0) runCcd(index);
        collectContacts();
        for (let contact = 0; contact < mutable.currentContacts; contact += 1) warmStart(contact);
        for (let iteration = 0; iteration < velocityIterations; iteration += 1) {
          for (let contact = 0; contact < mutable.currentContacts; contact += 1) {
            if (!contactTrigger[contact]) solveVelocity(contact, iteration === 0);
          }
        }
        for (let iteration = 0; iteration < positionIterations; iteration += 1) {
          for (let contact = 0; contact < mutable.currentContacts; contact += 1) {
            if (contactTrigger[contact] || contactFailedBody[contact]! >= 0) continue;
            solvePosition(contact);
          }
        }
        constraintStore.solve(seconds);
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
        target.manifoldPointCount = contactManifoldPointCount[index]!;
        target.warmStartedPointCount = contactWarmStartedPointCount[index]!;
        target.trigger = contactTrigger[index] !== 0;
        target.closingSpeedMetersPerSecond = contactClosingSpeed[index]!; target.effectiveMassKg = contactEffectiveMass[index]!; target.impactEnergyJoules = contactImpactEnergy[index]!; target.normalImpulseNewtonSeconds = contactNormalImpulse[index]!;
        const failed = contactFailedBody[index]!; target.breakthrough = failed >= 0;
        if (failed >= 0) { target.failedBody = handleAt(failed); target.failedBodyId = ids[failed]!; } else { delete target.failedBody; delete target.failedBodyId; }
        return target;
      };
  return { step, contactCount, contact };
}

function createRigidQueryApi(context: RigidOperationContext, operations: RigidOperations): RigidQueryApi {
  const { config, bodies, contactStorage, diagnostics, sweepScratch } = context;
  const { capacity,  } = config;
  const { alive, shapeKind, layer, positionX, positionY, positionZ, rotationX, rotationY, rotationZ, rotationW, extentX, extentY, extentZ, aabbMinX, aabbMinY, aabbMinZ, aabbMaxX, aabbMaxY, aabbMaxZ, ids } = bodies;
  const {  } = contactStorage;
  const { handleAt, raySphere } = operations;
  const rayLocalOrigin = [0, 0, 0], rayLocalDelta = [0, 0, 0], rayWorldNormal = [0, 0, 0];
  const queryAabb: RigidWorld3D["queryAabb"] = (minX, minY, minZ, maxX, maxY, maxZ, output) => {
        // Mutators, integration, solvers and restore keep bounds current. Reading
        // them need not recompute every unchanged prop for every weapon probe.
        minX = finite(minX, "minX"); minY = finite(minY, "minY"); minZ = finite(minZ, "minZ");
        maxX = finite(maxX, "maxX"); maxY = finite(maxY, "maxY"); maxZ = finite(maxZ, "maxZ");
        if (minX > maxX || minY > maxY || minZ > maxZ) throw new RangeError("AABB minimums must not exceed maximums.");
        if (!(output instanceof Float64Array)) throw new TypeError("AABB output must be a Float64Array of stable handles.");
        let written = 0; let truncated = false;
        for (let index = 0; index < capacity; index += 1) {
          if (!alive[index]) continue;
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
        const directionLength = hypot(dx, dy, dz);
        if (directionLength <= 1e-12) throw new RangeError("Raycast direction must be non-zero.");
        dx /= directionLength; dy /= directionLength; dz /= directionLength;
        let bestDistance = maxDistance + 1; let bestIndex = -1; let bestNx = 0; let bestNy = 0; let bestNz = 0;
        for (let index = 0; index < capacity; index += 1) {
          if (!alive[index] || (layer[index]! & queryMask) === 0) continue;
          let hit = false;
          if (shapeKind[index] === SHAPE_SPHERE) hit = raySphere(ox, oy, oz, dx, dy, dz, index, maxDistance, sweepScratch);
          else {
            rotateQuaternionVector(rotationX[index]!, rotationY[index]!, rotationZ[index]!, rotationW[index]!, ox - positionX[index]!, oy - positionY[index]!, oz - positionZ[index]!, true, rayLocalOrigin);
            rotateQuaternionVector(rotationX[index]!, rotationY[index]!, rotationZ[index]!, rotationW[index]!, dx * maxDistance, dy * maxDistance, dz * maxDistance, true, rayLocalDelta);
            hit = rayAabbUnit(rayLocalOrigin[0]!, rayLocalOrigin[1]!, rayLocalOrigin[2]!, rayLocalDelta[0]!, rayLocalDelta[1]!, rayLocalDelta[2]!, -extentX[index]!, -extentY[index]!, -extentZ[index]!, extentX[index]!, extentY[index]!, extentZ[index]!, sweepScratch);
            if (hit) {
              rotateQuaternionVector(rotationX[index]!, rotationY[index]!, rotationZ[index]!, rotationW[index]!, sweepScratch.normalX, sweepScratch.normalY, sweepScratch.normalZ, false, rayWorldNormal);
              sweepScratch.normalX = rayWorldNormal[0]!; sweepScratch.normalY = rayWorldNormal[1]!; sweepScratch.normalZ = rayWorldNormal[2]!;
            }
          }
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
  const sweepSphere: RigidWorld3D["sweepSphere"] = (ox, oy, oz, dx, dy, dz, radius, queryMask, target) => {
        ox = finite(ox, "originX"); oy = finite(oy, "originY"); oz = finite(oz, "originZ");
        dx = finite(dx, "deltaX"); dy = finite(dy, "deltaY"); dz = finite(dz, "deltaZ");
        radius = positive(radius, "radius"); queryMask = uint32(queryMask, "layerMask");
        if (!target || typeof target !== "object") throw new TypeError("Sphere sweep target is required.");
        const distance = hypot(dx, dy, dz);
        if (distance <= 1e-12) throw new RangeError("Sphere sweep displacement must be non-zero.");
        let bestTime = Number.POSITIVE_INFINITY; let bestIndex = -1; let bestNx = 0; let bestNy = 0; let bestNz = 0; let conservative = false;
        for (let index = 0; index < capacity; index += 1) {
          if (!alive[index] || (layer[index]! & queryMask) === 0) continue;
          let hit = false; let time = 0; let nx = 0; let ny = 0; let nz = 0; let approximate = false;
          if (shapeKind[index] === SHAPE_SPHERE) {
            const sx = ox - (aabbMinX[index]! + aabbMaxX[index]!) * 0.5;
            const sy = oy - (aabbMinY[index]! + aabbMaxY[index]!) * 0.5;
            const sz = oz - (aabbMinZ[index]! + aabbMaxZ[index]!) * 0.5;
            const combined = radius + (aabbMaxX[index]! - aabbMinX[index]!) * 0.5;
            const c = sx * sx + sy * sy + sz * sz - combined * combined;
            if (c <= 0) { hit = true; time = 0; }
            else {
              const a = dx * dx + dy * dy + dz * dz, b = 2 * (sx * dx + sy * dy + sz * dz), discriminant = b * b - 4 * a * c;
              if (discriminant >= 0) { const candidate = (-b - sqrt(discriminant)) / (2 * a); if (candidate >= 0 && candidate <= 1) { hit = true; time = candidate; } }
            }
            if (hit) {
              const cx = sx + dx * time, cy = sy + dy * time, cz = sz + dz * time, length = hypot(cx, cy, cz);
              if (length > 1e-12) { nx = cx / length; ny = cy / length; nz = cz / length; }
              else { nx = -dx / distance; ny = -dy / distance; nz = -dz / distance; }
            }
          } else {
            hit = rayAabbUnit(ox, oy, oz, dx, dy, dz, aabbMinX[index]! - radius, aabbMinY[index]! - radius, aabbMinZ[index]! - radius, aabbMaxX[index]! + radius, aabbMaxY[index]! + radius, aabbMaxZ[index]! + radius, sweepScratch);
            if (hit) { time = sweepScratch.time; nx = sweepScratch.normalX; ny = sweepScratch.normalY; nz = sweepScratch.normalZ; approximate = true; }
          }
          if (!hit || time > bestTime + 1e-10 || (Math.abs(time - bestTime) <= 1e-10 && bestIndex >= 0 && handleAt(index) >= handleAt(bestIndex))) continue;
          bestTime = time; bestIndex = index; bestNx = nx; bestNy = ny; bestNz = nz; conservative = approximate;
        }
        if (bestIndex < 0) return false;
        const centerX = ox + dx * bestTime, centerY = oy + dy * bestTime, centerZ = oz + dz * bestTime;
        target.handle = handleAt(bestIndex); target.id = ids[bestIndex]!; target.time = bestTime; target.distance = distance * bestTime;
        target.x = centerX - bestNx * radius; target.y = centerY - bestNy * radius; target.z = centerZ - bestNz * radius;
        target.normalX = bestNx; target.normalY = bestNy; target.normalZ = bestNz; target.conservative = conservative;
        return true;
      };
  return { queryAabb, raycast, sweepSphere };
}

function createRigidDebugApi(context: RigidOperationContext, operations: RigidOperations): RigidDebugApi {
  const { config, bodies, contactStorage, mutable } = context;
  const { capacity,  } = config;
  const { alive, bodyType, shapeKind, flags, positionX, positionY, positionZ, extentX,  } = bodies;
  const { contactNormalX, contactNormalY, contactNormalZ, contactManifoldPointCount, contactManifoldPointX, contactManifoldPointY, contactManifoldPointZ } = contactStorage;
  const { writeBoxEdges } = operations;
  const debugSegmentCount: RigidWorld3D["debugSegmentCount"] = (sphereSegments = 12) => {
        sphereSegments = boundedInteger(sphereSegments, 4, 64, "sphereSegments");
        let count = 0;
        for (let index = 0; index < mutable.currentContacts; index += 1) count += contactManifoldPointCount[index]!;
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
              const ca = cos(a) * radius; const sa = sin(a) * radius; const cb = cos(b) * radius; const sb = sin(b) * radius;
              if (plane === 0) write(positionX[index]! + ca, positionY[index]! + sa, positionZ[index]!, positionX[index]! + cb, positionY[index]! + sb, positionZ[index]!, tag);
              else if (plane === 1) write(positionX[index]! + ca, positionY[index]!, positionZ[index]! + sa, positionX[index]! + cb, positionY[index]!, positionZ[index]! + sb, tag);
              else write(positionX[index]!, positionY[index]! + ca, positionZ[index]! + sa, positionX[index]!, positionY[index]! + cb, positionZ[index]! + sb, tag);
            }
          } else writeBoxEdges(index, tag, write);
        }
        for (let index = 0; index < mutable.currentContacts; index += 1) {
          for (let point = 0; point < contactManifoldPointCount[index]!; point += 1) { const offset = index * 4 + point, x = contactManifoldPointX[offset]!, y = contactManifoldPointY[offset]!, z = contactManifoldPointZ[offset]!; write(x, y, z, x + contactNormalX[index]!, y + contactNormalY[index]!, z + contactNormalZ[index]!, RIGID_DEBUG_CONTACT_3D); }
        }
        return segment;
      };
  return { debugSegmentCount, writeDebugSegments };
}

function createRigidCheckpointApi(context: RigidOperationContext, operations: RigidOperations, constraintStore: RigidConstraintStore3D, precision: RigidPhysicsPrecision3D): RigidCheckpointApi {
  const { config, bodies, contactStorage, diagnostics, mutable } = context;
  const { capacity, maxContacts } = config;
  const { alive, generation, ids, positionX, positionY, positionZ, previousX, previousY, previousZ, velocityX, velocityY, velocityZ, rotationX, rotationY, rotationZ, rotationW, previousRotationX, previousRotationY, previousRotationZ, previousRotationW, angularVelocityX, angularVelocityY, angularVelocityZ } = bodies;
  const { contactA, contactB, contactNormalX, contactNormalY, contactNormalZ, contactPenetration, contactPointX, contactPointY, contactPointZ, contactTrigger, contactClosingSpeed, contactEffectiveMass, contactImpactEnergy, contactNormalImpulse, contactFailedBody, contactManifoldPointCount, contactManifoldPointX, contactManifoldPointY, contactManifoldPointZ, contactManifoldNormalImpulse, contactManifoldFrictionX, contactManifoldFrictionY, contactManifoldFrictionZ, contactWarmStartedPointCount } = contactStorage;
  const dynamicArrays = { positionX, positionY, positionZ, previousX, previousY, previousZ, velocityX, velocityY, velocityZ, rotationX, rotationY, rotationZ, rotationW, previousRotationX, previousRotationY, previousRotationZ, previousRotationW, angularVelocityX, angularVelocityY, angularVelocityZ };

  function checkpoint(): RigidWorldCheckpoint3D {
    const count = mutable.currentContacts;
    return {
      version: 1, capacity, maxContacts, precision,
      topology: { alive: alive.slice(), generation: generation.slice(), ids: [...ids] },
      bodies: structuredClone(dynamicArrays),
      contacts: { count, a: contactA.slice(0, count), b: contactB.slice(0, count), normalX: contactNormalX.slice(0, count), normalY: contactNormalY.slice(0, count), normalZ: contactNormalZ.slice(0, count), penetration: contactPenetration.slice(0, count), pointX: contactPointX.slice(0, count), pointY: contactPointY.slice(0, count), pointZ: contactPointZ.slice(0, count), trigger: contactTrigger.slice(0, count), manifoldPointCount: contactManifoldPointCount.slice(0, count), manifoldPointX: contactManifoldPointX.slice(0, count * 4), manifoldPointY: contactManifoldPointY.slice(0, count * 4), manifoldPointZ: contactManifoldPointZ.slice(0, count * 4), manifoldNormalImpulse: contactManifoldNormalImpulse.slice(0, count * 4), manifoldFrictionX: contactManifoldFrictionX.slice(0, count * 4), manifoldFrictionY: contactManifoldFrictionY.slice(0, count * 4), manifoldFrictionZ: contactManifoldFrictionZ.slice(0, count * 4), warmStartedPointCount: contactWarmStartedPointCount.slice(0, count), closingSpeedMetersPerSecond: contactClosingSpeed.slice(0, count), effectiveMassKg: contactEffectiveMass.slice(0, count), impactEnergyJoules: contactImpactEnergy.slice(0, count), normalImpulseNewtonSeconds: contactNormalImpulse.slice(0, count), failedBody: contactFailedBody.slice(0, count) },
      constraints: constraintStore.checkpoint(), diagnostics: { ...diagnostics },
    };
  }

  function restoreCheckpoint(value: Readonly<RigidWorldCheckpoint3D>) {
    assertRigidCheckpointTopology3D(value, { capacity, maxContacts, precision, topology: { alive, generation, ids } });
    const checkpointArrays: Partial<Record<string, typeof positionX>> = value.bodies;
    for (const [key, target] of Object.entries(dynamicArrays)) {
      const source = checkpointArrays[key]
        ?? (key === "previousRotationX" ? value.bodies.rotationX : key === "previousRotationY" ? value.bodies.rotationY : key === "previousRotationZ" ? value.bodies.rotationZ : key === "previousRotationW" ? value.bodies.rotationW : undefined);
      if (!source || source.length !== capacity) throw new Error(`Rigid world checkpoint ${key} has the wrong capacity.`);
      target.set(source);
    }
    const contacts = value.contacts;
    if (!Number.isSafeInteger(contacts.count) || contacts.count < 0 || contacts.count > maxContacts) throw new Error("Rigid world checkpoint contact count is invalid.");
    for (const source of [contacts.a, contacts.b, contacts.normalX, contacts.normalY, contacts.normalZ, contacts.penetration, contacts.pointX, contacts.pointY, contacts.pointZ, contacts.trigger, contacts.closingSpeedMetersPerSecond, contacts.effectiveMassKg, contacts.impactEnergyJoules, contacts.normalImpulseNewtonSeconds, contacts.failedBody]) if (source.length !== contacts.count) throw new Error("Rigid world checkpoint contact storage is inconsistent.");
    contactA.set(contacts.a); contactB.set(contacts.b); contactNormalX.set(contacts.normalX); contactNormalY.set(contacts.normalY); contactNormalZ.set(contacts.normalZ); contactPenetration.set(contacts.penetration); contactPointX.set(contacts.pointX); contactPointY.set(contacts.pointY); contactPointZ.set(contacts.pointZ); contactTrigger.set(contacts.trigger); contactClosingSpeed.set(contacts.closingSpeedMetersPerSecond); contactEffectiveMass.set(contacts.effectiveMassKg); contactImpactEnergy.set(contacts.impactEnergyJoules); contactNormalImpulse.set(contacts.normalImpulseNewtonSeconds); contactFailedBody.set(contacts.failedBody);
    const hasManifold = contacts.manifoldPointCount !== undefined || contacts.manifoldPointX !== undefined || contacts.manifoldPointY !== undefined || contacts.manifoldPointZ !== undefined;
    if (hasManifold) {
      if (!contacts.manifoldPointCount || !contacts.manifoldPointX || !contacts.manifoldPointY || !contacts.manifoldPointZ || contacts.manifoldPointCount.length !== contacts.count || contacts.manifoldPointX.length !== contacts.count * 4 || contacts.manifoldPointY.length !== contacts.count * 4 || contacts.manifoldPointZ.length !== contacts.count * 4) throw new Error("Rigid world checkpoint contact manifold storage is inconsistent.");
      contactManifoldPointCount.set(contacts.manifoldPointCount); contactManifoldPointX.set(contacts.manifoldPointX); contactManifoldPointY.set(contacts.manifoldPointY); contactManifoldPointZ.set(contacts.manifoldPointZ);
    } else for (let index = 0; index < contacts.count; index += 1) { contactManifoldPointCount[index] = 1; const offset = index * 4; contactManifoldPointX[offset] = contacts.pointX[index]!; contactManifoldPointY[offset] = contacts.pointY[index]!; contactManifoldPointZ[offset] = contacts.pointZ[index]!; }
    const hasContactCache = contacts.manifoldNormalImpulse !== undefined || contacts.manifoldFrictionX !== undefined || contacts.manifoldFrictionY !== undefined || contacts.manifoldFrictionZ !== undefined || contacts.warmStartedPointCount !== undefined;
    if (hasContactCache) {
      if (!hasManifold) throw new Error("Rigid world checkpoint contact cache requires manifold storage.");
      if (!contacts.manifoldNormalImpulse || !contacts.manifoldFrictionX || !contacts.manifoldFrictionY || !contacts.manifoldFrictionZ || !contacts.warmStartedPointCount || contacts.manifoldNormalImpulse.length !== contacts.count * 4 || contacts.manifoldFrictionX.length !== contacts.count * 4 || contacts.manifoldFrictionY.length !== contacts.count * 4 || contacts.manifoldFrictionZ.length !== contacts.count * 4 || contacts.warmStartedPointCount.length !== contacts.count) throw new Error("Rigid world checkpoint contact cache storage is inconsistent.");
      contactManifoldNormalImpulse.set(contacts.manifoldNormalImpulse); contactManifoldFrictionX.set(contacts.manifoldFrictionX); contactManifoldFrictionY.set(contacts.manifoldFrictionY); contactManifoldFrictionZ.set(contacts.manifoldFrictionZ); contactWarmStartedPointCount.set(contacts.warmStartedPointCount);
    } else {
      contactManifoldNormalImpulse.fill(0, 0, contacts.count * 4); contactManifoldFrictionX.fill(0, 0, contacts.count * 4); contactManifoldFrictionY.fill(0, 0, contacts.count * 4); contactManifoldFrictionZ.fill(0, 0, contacts.count * 4); contactWarmStartedPointCount.fill(0, 0, contacts.count);
    }
    mutable.currentContacts = contacts.count;
    const mutableDiagnostics: Record<string, number> = diagnostics, checkpointDiagnostics: Partial<Record<string, number>> = value.diagnostics;
    for (const key of Object.keys(diagnostics)) { const item = checkpointDiagnostics[key] ?? (key === "ccdAngularTests" || key === "ccdAngularHits" || key === "ccdEligiblePairs" || key === "ccdBoundsRejects" ? 0 : undefined); if (typeof item !== "number" || !Number.isSafeInteger(item) || item < 0) throw new Error(`Rigid world checkpoint diagnostic ${key} is invalid.`); mutableDiagnostics[key] = item; }
    constraintStore.restoreCheckpoint(value.constraints);
    for (let index = 0; index < capacity; index += 1) if (alive[index]) operations.updateAabb(index);
  }

  return { checkpoint, restoreCheckpoint };
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
    addPointConstraint: constraintStore.addPoint,
    addAngularMotorConstraint: constraintStore.addAngularMotor,
    addAngularLimitConstraint: constraintStore.addAngularLimit,
    addAngularSwingTwistLimitConstraint: constraintStore.addAngularSwingTwistLimit,
    configureAngularMotorConstraint: constraintStore.configureAngularMotor,
    removeConstraint: constraintStore.remove,
    constraint: constraintStore.get,
    constraintTelemetry: constraintStore.telemetry,
    constraintCount: constraintStore.count,
    ...createRigidCheckpointApi(context, operations, constraintStore, precision),
    ...createPortableRigidContacts(context, operations),
    ...createRigidSimulationApi(context, operations, constraintStore),
    ...createRigidQueryApi(context, operations),
    ...createRigidDebugApi(context, operations),
  };
}
