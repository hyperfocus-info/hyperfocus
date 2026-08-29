import type { RigidBodyState3D, RigidShape3D, RigidWorldDiagnostics3D } from "./rigid-3d.ts";
import {
  CCD_EPSILON,
  FLAG_CONTINUOUS,
  FLAG_TRIGGER,
  HANDLE_STRIDE,
  POSITION_PERCENT,
  POSITION_SLOP,
  SHAPE_BOX,
  SHAPE_SPHERE,
  TYPE_DYNAMIC,
  TYPE_STATIC,
  clamp,
  finite,
  rayAabbUnit,
  type ContactScratch,
  type SweepScratch,
} from "./rigid-3d-internals.ts";

export type RigidFloatStorage = Float32Array | Float64Array;
export type RigidMutableState = { freeCount: number; bodyCount: number; currentContacts: number };
export type RigidOperationContext = {
  config: {
    capacity: number; maxContacts: number; maxCandidatePairs: number; maxCcdTests: number;
    velocityIterations: number; positionIterations: number; gravityX: number; gravityY: number; gravityZ: number;
  };
  bodies: {
    alive: Uint8Array; bodyType: Uint8Array; shapeKind: Uint8Array; flags: Uint8Array; generation: Uint32Array; layer: Uint32Array; mask: Uint32Array;
    positionX: RigidFloatStorage; positionY: RigidFloatStorage; positionZ: RigidFloatStorage; previousX: RigidFloatStorage; previousY: RigidFloatStorage; previousZ: RigidFloatStorage;
    velocityX: RigidFloatStorage; velocityY: RigidFloatStorage; velocityZ: RigidFloatStorage; rotationX: RigidFloatStorage; rotationY: RigidFloatStorage; rotationZ: RigidFloatStorage; rotationW: RigidFloatStorage;
    angularVelocityX: RigidFloatStorage; angularVelocityY: RigidFloatStorage; angularVelocityZ: RigidFloatStorage; angularDamping: RigidFloatStorage;
    extentX: RigidFloatStorage; extentY: RigidFloatStorage; extentZ: RigidFloatStorage; inverseMass: RigidFloatStorage; restitution: RigidFloatStorage; friction: RigidFloatStorage; gravityScale: RigidFloatStorage;
    aabbMinX: RigidFloatStorage; aabbMinY: RigidFloatStorage; aabbMinZ: RigidFloatStorage; aabbMaxX: RigidFloatStorage; aabbMaxY: RigidFloatStorage; aabbMaxZ: RigidFloatStorage;
    free: Int32Array; sort: Int32Array; sortScratch: Int32Array; ids: Array<string | undefined>; indexById: Map<string, number>;
  };
  contactStorage: {
    contactA: Int32Array; contactB: Int32Array; contactNormalX: RigidFloatStorage; contactNormalY: RigidFloatStorage; contactNormalZ: RigidFloatStorage;
    contactPenetration: RigidFloatStorage; contactPointX: RigidFloatStorage; contactPointY: RigidFloatStorage; contactPointZ: RigidFloatStorage; contactTrigger: Uint8Array;
  };
  diagnostics: RigidWorldDiagnostics3D;
  contactScratch: ContactScratch;
  sweepScratch: SweepScratch;
  mutable: RigidMutableState;
};

export function createRigidBaseOperations(context: RigidOperationContext) {
  const { config, bodies, contactStorage,  } = context;
  const { capacity,  } = config;
  const { alive, bodyType, shapeKind, flags, generation, layer, mask, positionX, positionY, positionZ, velocityX, velocityY, velocityZ, rotationX, rotationY, rotationZ, rotationW, angularVelocityX, angularVelocityY, angularVelocityZ, angularDamping, extentX, extentY, extentZ, inverseMass, restitution, friction, aabbMinX, aabbMinY, aabbMinZ, aabbMaxX, aabbMaxY, aabbMaxZ, ids, indexById } = bodies;
  const {  } = contactStorage;
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
  function filters(a: number, b: number): boolean {
      return (layer[a]! & mask[b]!) !== 0 && (layer[b]! & mask[a]!) !== 0;
    }
  function activeInverseMass(index: number): number {
      return bodyType[index] === TYPE_DYNAMIC ? inverseMass[index]! : 0;
    }
  function state(index: number): RigidBodyState3D {
      const type = bodyType[index] === TYPE_STATIC ? "static" : bodyType[index] === TYPE_DYNAMIC ? "dynamic" : "kinematic";
      const shape: RigidShape3D = shapeKind[index] === SHAPE_SPHERE
        ? { kind: "sphere", radius: extentX[index]! }
        : { kind: "box", halfX: extentX[index]!, halfY: extentY[index]!, halfZ: extentZ[index]! };
      const id = ids[index];
      if (!id) throw new Error(`Rigid body index ${index} is missing its id.`);
      return {
        handle: handleAt(index), id, type, shape,
        x: positionX[index]!, y: positionY[index]!, z: positionZ[index]!,
        velocityX: velocityX[index]!, velocityY: velocityY[index]!, velocityZ: velocityZ[index]!,
        rotationX: rotationX[index]!, rotationY: rotationY[index]!, rotationZ: rotationZ[index]!, rotationW: rotationW[index]!,
        angularVelocityX: angularVelocityX[index]!, angularVelocityY: angularVelocityY[index]!, angularVelocityZ: angularVelocityZ[index]!,
        mass: inverseMass[index] === 0 ? Number.POSITIVE_INFINITY : 1 / inverseMass[index]!,
        restitution: restitution[index]!, friction: friction[index]!,
        collisionLayer: layer[index]!, collisionMask: mask[index]!,
        trigger: (flags[index]! & FLAG_TRIGGER) !== 0,
        continuous: (flags[index]! & FLAG_CONTINUOUS) !== 0,
      };
    }
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
  return {
    handleAt,
    resolve,
    resolveOptional,
    updateAabb,
    setQuaternion,
    integrateRotation,
    filters,
    activeInverseMass,
    state,
    writeBoxEdges,
  };
}
export type RigidBaseOperationsSet = ReturnType<typeof createRigidBaseOperations>;

export function createRigidCollisionOperations(context: RigidOperationContext, operations: RigidBaseOperationsSet) {
  const { config, bodies, contactStorage,  } = context;
  const {  } = config;
  const { shapeKind, positionX, positionY, positionZ, velocityX, velocityY, velocityZ, extentX, restitution, friction, aabbMinX, aabbMinY, aabbMinZ, aabbMaxX, aabbMaxY, aabbMaxZ,  } = bodies;
  const {  } = contactStorage;
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
        output.normalX = operations.handleAt(a) < operations.handleAt(b) ? 1 : -1; output.normalY = 0; output.normalZ = 0;
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
      let penetration = 0;
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
      output.penetration = penetration;
      output.pointX = closestX; output.pointY = closestY; output.pointZ = closestZ;
      return true;
    }
  function solveVelocity(a: number, b: number, nx: number, ny: number, nz: number): void {
      const inverseA = operations.activeInverseMass(a);
      const inverseB = operations.activeInverseMass(b);
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
      const inverseA = operations.activeInverseMass(a);
      const inverseB = operations.activeInverseMass(b);
      const inverseSum = inverseA + inverseB;
      if (inverseSum === 0) return;
      const correction = Math.max(0, penetration - POSITION_SLOP) * POSITION_PERCENT / inverseSum;
      positionX[a] -= nx * correction * inverseA; positionY[a] -= ny * correction * inverseA; positionZ[a] -= nz * correction * inverseA;
      positionX[b] += nx * correction * inverseB; positionY[b] += ny * correction * inverseB; positionZ[b] += nz * correction * inverseB;
      operations.updateAabb(a); operations.updateAabb(b);
    }
  return {
    detect,
    sphereSphere,
    boxBox,
    sphereBox,
    solveVelocity,
    solvePosition,
  };
}
export type RigidCollisionOperationsSet = ReturnType<typeof createRigidCollisionOperations>;

export function createRigidCcdOperations(context: RigidOperationContext, operations: RigidBaseOperationsSet & RigidCollisionOperationsSet) {
  const { config, bodies, contactStorage, diagnostics, contactScratch, sweepScratch } = context;
  const { capacity, maxCcdTests,  } = config;
  const { alive, bodyType, shapeKind, flags, positionX, positionY, positionZ, previousX, previousY, previousZ, velocityX, velocityY, velocityZ, extentX, restitution, aabbMinX, aabbMinY, aabbMinZ, aabbMaxX, aabbMaxY, aabbMaxZ, ids } = bodies;
  const {  } = contactStorage;
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
        if (alive[other] === 0 || bodyType[other] !== TYPE_STATIC || !operations.filters(index, other) || (flags[index]! & FLAG_TRIGGER) !== 0 || (flags[other]! & FLAG_TRIGGER) !== 0) continue;
        if (diagnostics.ccdTests >= maxCcdTests) { diagnostics.ccdTestOverflows += 1; break; }
        diagnostics.ccdTests += 1;
        positionX[index] = previousX[index]!; positionY[index] = previousY[index]!; positionZ[index] = previousZ[index]!;
        operations.updateAabb(index); operations.updateAabb(other);
        if (operations.detect(index, other, contactScratch)) {
          if (earliest > 0 || (earliest === 0 && operations.handleAt(other) < (hitIndex < 0 ? Number.POSITIVE_INFINITY : operations.handleAt(hitIndex)))) {
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
        if (sweepScratch.time < earliest - CCD_EPSILON || (Math.abs(sweepScratch.time - earliest) <= CCD_EPSILON && operations.handleAt(other) < (hitIndex < 0 ? Number.POSITIVE_INFINITY : operations.handleAt(hitIndex)))) {
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
      operations.updateAabb(index);
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
  return {
    runCcd,
    sweepSphereSphere,
    sweepExpandedAabb,
    raySphere,
  };
}
export type RigidCcdOperationsSet = ReturnType<typeof createRigidCcdOperations>;

export function createRigidBroadphaseOperations(context: RigidOperationContext, operations: RigidBaseOperationsSet & RigidCollisionOperationsSet) {
  const { config, bodies, contactStorage, diagnostics, contactScratch, mutable } = context;
  const { capacity, maxContacts, maxCandidatePairs,  } = config;
  const { alive, bodyType, flags, aabbMinX, aabbMinY, aabbMinZ, aabbMaxX, aabbMaxY, aabbMaxZ, sort, sortScratch,  } = bodies;
  const { contactA, contactB, contactNormalX, contactNormalY, contactNormalZ, contactPenetration, contactPointX, contactPointY, contactPointZ, contactTrigger } = contactStorage;
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
            if (aabbMinX[a]! < aabbMinX[b]! || (aabbMinX[a] === aabbMinX[b] && operations.handleAt(a) <= operations.handleAt(b))) sortScratch[write++] = sort[left++]!;
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
      mutable.currentContacts = 0;
      const count = sortBodies();
      let saturated = false;
      for (let orderA = 0; orderA < count && !saturated; orderA += 1) {
        const a = sort[orderA]!;
        for (let orderB = orderA + 1; orderB < count; orderB += 1) {
          const b = sort[orderB]!;
          if (aabbMinX[b]! > aabbMaxX[a]!) break;
          if (bodyType[a] === TYPE_STATIC && bodyType[b] === TYPE_STATIC) continue;
          if (!operations.filters(a, b) || aabbMaxY[a]! < aabbMinY[b]! || aabbMaxY[b]! < aabbMinY[a]! || aabbMaxZ[a]! < aabbMinZ[b]! || aabbMaxZ[b]! < aabbMinZ[a]!) continue;
          if (diagnostics.candidatePairs >= maxCandidatePairs) {
            diagnostics.candidateOverflows += 1; saturated = true; break;
          }
          diagnostics.candidatePairs += 1;
          if (!operations.detect(a, b, contactScratch)) continue;
          if (mutable.currentContacts >= maxContacts) { diagnostics.contactOverflows += 1; continue; }
          contactA[mutable.currentContacts] = a; contactB[mutable.currentContacts] = b;
          contactNormalX[mutable.currentContacts] = contactScratch.normalX; contactNormalY[mutable.currentContacts] = contactScratch.normalY; contactNormalZ[mutable.currentContacts] = contactScratch.normalZ;
          contactPenetration[mutable.currentContacts] = contactScratch.penetration;
          contactPointX[mutable.currentContacts] = contactScratch.pointX; contactPointY[mutable.currentContacts] = contactScratch.pointY; contactPointZ[mutable.currentContacts] = contactScratch.pointZ;
          contactTrigger[mutable.currentContacts] = (flags[a]! & FLAG_TRIGGER) !== 0 || (flags[b]! & FLAG_TRIGGER) !== 0 ? 1 : 0;
          mutable.currentContacts += 1;
        }
      }
      diagnostics.contacts = mutable.currentContacts;
    }
  return {
    sortBodies,
    collectContacts,
  };
}
export type RigidBroadphaseOperationsSet = ReturnType<typeof createRigidBroadphaseOperations>;

export type RigidOperations = RigidBaseOperationsSet & RigidCollisionOperationsSet & RigidCcdOperationsSet & RigidBroadphaseOperationsSet;
