import { acos, hypot, sqrt } from '../math/simulation.ts';
import type { RigidBodyState3D, RigidShape3D, RigidWorldDiagnostics3D } from "./rigid-3d.ts";
import { createContactPairIndex } from "./rigid/contact-pair-index.ts";
import { refineSphereBoxSweep } from './rigid/sphere-box-sweep.ts';
import { createCcdBoundsTest } from './rigid/ccd-bounds.ts';
import { createRigidOrientedBoxContact3D } from "./rigid/box-contact.ts";
import {
  rigidQuaternionLength,
  CCD_EPSILON,
  FLAG_CONTINUOUS,
  FLAG_TRIGGER,
  HANDLE_STRIDE,
  POSITION_PERCENT,
  POSITION_SLOP,
  POSITION_ANGULAR_LIMIT,
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
export function rotateQuaternionVector(qx: number, qy: number, qz: number, qw: number, x: number, y: number, z: number, inverse: boolean, output: number[]): void {
  if (inverse) { qx = -qx; qy = -qy; qz = -qz; }
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  output[0] = x + qw * tx + qy * tz - qz * ty;
  output[1] = y + qw * ty + qz * tx - qx * tz;
  output[2] = z + qw * tz + qx * ty - qy * tx;
}
function writeQuaternionAxes(qx: number, qy: number, qz: number, qw: number, output: Float64Array): void {
  const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
  output[0] = 1 - 2 * (yy + zz); output[1] = 2 * (xy + wz); output[2] = 2 * (xz - wy);
  output[3] = 2 * (xy - wz); output[4] = 1 - 2 * (xx + zz); output[5] = 2 * (yz + wx);
  output[6] = 2 * (xz + wy); output[7] = 2 * (yz - wx); output[8] = 1 - 2 * (xx + yy);
}
export type RigidOperationContext = {
  config: {
    capacity: number; maxContacts: number; maxCandidatePairs: number; maxCcdTests: number;
    velocityIterations: number; positionIterations: number; gravityX: number; gravityY: number; gravityZ: number;
  };
  bodies: {
    alive: Uint8Array; bodyType: Uint8Array; shapeKind: Uint8Array; flags: Uint8Array; generation: Uint32Array; layer: Uint32Array; mask: Uint32Array;
    positionX: RigidFloatStorage; positionY: RigidFloatStorage; positionZ: RigidFloatStorage; previousX: RigidFloatStorage; previousY: RigidFloatStorage; previousZ: RigidFloatStorage;
    velocityX: RigidFloatStorage; velocityY: RigidFloatStorage; velocityZ: RigidFloatStorage; rotationX: RigidFloatStorage; rotationY: RigidFloatStorage; rotationZ: RigidFloatStorage; rotationW: RigidFloatStorage;
    previousRotationX: RigidFloatStorage; previousRotationY: RigidFloatStorage; previousRotationZ: RigidFloatStorage; previousRotationW: RigidFloatStorage;
    angularVelocityX: RigidFloatStorage; angularVelocityY: RigidFloatStorage; angularVelocityZ: RigidFloatStorage; linearDamping: RigidFloatStorage; angularDamping: RigidFloatStorage;
    extentX: RigidFloatStorage; extentY: RigidFloatStorage; extentZ: RigidFloatStorage; inverseMass: RigidFloatStorage;
    inverseInertiaX: RigidFloatStorage; inverseInertiaY: RigidFloatStorage; inverseInertiaZ: RigidFloatStorage;
    restitution: RigidFloatStorage; friction: RigidFloatStorage; gravityScale: RigidFloatStorage; fractureEnergyJoules: RigidFloatStorage; retainedEnergyRatio: RigidFloatStorage;
    aabbMinX: RigidFloatStorage; aabbMinY: RigidFloatStorage; aabbMinZ: RigidFloatStorage; aabbMaxX: RigidFloatStorage; aabbMaxY: RigidFloatStorage; aabbMaxZ: RigidFloatStorage;
    free: Int32Array; sort: Int32Array; sortScratch: Int32Array; ids: Array<string | undefined>; indexById: Map<string, number>;
  };
  contactStorage: {
    contactA: Int32Array; contactB: Int32Array; contactNormalX: RigidFloatStorage; contactNormalY: RigidFloatStorage; contactNormalZ: RigidFloatStorage;
    contactPenetration: RigidFloatStorage; contactPointX: RigidFloatStorage; contactPointY: RigidFloatStorage; contactPointZ: RigidFloatStorage; contactTrigger: Uint8Array;
    contactClosingSpeed: RigidFloatStorage; contactEffectiveMass: RigidFloatStorage; contactImpactEnergy: RigidFloatStorage; contactNormalImpulse: RigidFloatStorage; contactFailedBody: Int32Array;
    contactManifoldPointCount: Uint8Array; contactManifoldPointX: RigidFloatStorage; contactManifoldPointY: RigidFloatStorage; contactManifoldPointZ: RigidFloatStorage; contactImpactPoint: Uint8Array;
    contactManifoldClosingSpeed: RigidFloatStorage; contactManifoldNormalImpulse: RigidFloatStorage; contactManifoldFrictionX: RigidFloatStorage; contactManifoldFrictionY: RigidFloatStorage; contactManifoldFrictionZ: RigidFloatStorage;
    contactManifoldWarmStarted: Uint8Array; contactWarmStartedPointCount: Uint8Array;
    previousContactA: Int32Array; previousContactB: Int32Array; previousContactNormalX: RigidFloatStorage; previousContactNormalY: RigidFloatStorage; previousContactNormalZ: RigidFloatStorage; previousManifoldPointCount: Uint8Array;
    previousManifoldPointX: RigidFloatStorage; previousManifoldPointY: RigidFloatStorage; previousManifoldPointZ: RigidFloatStorage; previousManifoldNormalImpulse: RigidFloatStorage; previousManifoldFrictionX: RigidFloatStorage; previousManifoldFrictionY: RigidFloatStorage; previousManifoldFrictionZ: RigidFloatStorage; previousManifoldUsed: Uint8Array;
  };
  diagnostics: RigidWorldDiagnostics3D;
  contactScratch: ContactScratch;
  sweepScratch: SweepScratch;
  mutable: RigidMutableState;
};

export function createRigidBaseOperations(context: RigidOperationContext) {
const { config, bodies, contactStorage } = context;
const { capacity } = config;
const { alive, bodyType, shapeKind, flags, generation, layer, mask, positionX, positionY, positionZ, velocityX, velocityY, velocityZ, rotationX, rotationY, rotationZ, rotationW, angularVelocityX, angularVelocityY, angularVelocityZ, linearDamping, angularDamping, extentX, extentY, extentZ, inverseMass, inverseInertiaX, inverseInertiaY, inverseInertiaZ, restitution, friction, fractureEnergyJoules, retainedEnergyRatio, aabbMinX, aabbMinY, aabbMinZ, aabbMaxX, aabbMaxY, aabbMaxZ, ids, indexById } = bodies;
const { contactA, contactB, contactNormalX, contactNormalY, contactNormalZ, contactTrigger, contactClosingSpeed, contactEffectiveMass, contactImpactEnergy, contactNormalImpulse, contactFailedBody, contactManifoldPointCount, contactManifoldPointX, contactManifoldPointY, contactManifoldPointZ, contactImpactPoint, contactManifoldClosingSpeed, contactManifoldNormalImpulse, contactManifoldFrictionX, contactManifoldFrictionY, contactManifoldFrictionZ, contactManifoldWarmStarted, contactWarmStartedPointCount } = contactStorage;
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
      if (typeof value === 'string') {
        const index = indexById.get(value);
        return index === undefined || alive[index] === 0 ? undefined : index;
      }
      if (!Number.isSafeInteger(value) || value < HANDLE_STRIDE) return undefined;
      const index = value % HANDLE_STRIDE, expectedGeneration = Math.floor(value / HANDLE_STRIDE);
      return index >= capacity || alive[index] === 0 || generation[index] !== expectedGeneration ? undefined : index;
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
      const length = rigidQuaternionLength(x, y, z, w);
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
function dampLinearVelocity(index: number, seconds: number): void {
      const damping = Math.max(0, 1 - linearDamping[index]! * seconds);
      velocityX[index] *= damping; velocityY[index] *= damping; velocityZ[index] *= damping;
    }
function applyRotationDelta(index: number, x: number, y: number, z: number): void {
      if (bodyType[index] !== TYPE_DYNAMIC || Math.abs(x) + Math.abs(y) + Math.abs(z) <= 1e-14) return;
      const qx = rotationX[index]!, qy = rotationY[index]!, qz = rotationZ[index]!, qw = rotationW[index]!;
      setQuaternion(index,
        qx + 0.5 * (x * qw + y * qz - z * qy),
        qy + 0.5 * (-x * qz + y * qw + z * qx),
        qz + 0.5 * (x * qy - y * qx + z * qw),
        qw + 0.5 * (-x * qx - y * qy - z * qz));
    }
function filters(a: number, b: number): boolean {
      return (layer[a]! & mask[b]!) !== 0 && (layer[b]! & mask[a]!) !== 0;
    }
function activeInverseMass(index: number): number {
      return bodyType[index] === TYPE_DYNAMIC ? inverseMass[index]! : 0;
    }
function applyInverseInertia(index: number, worldX: number, worldY: number, worldZ: number, output: number[]): number[] {
      if (bodyType[index] !== TYPE_DYNAMIC) { output[0] = 0; output[1] = 0; output[2] = 0; return output; }
      const qx = rotationX[index]!, qy = rotationY[index]!, qz = rotationZ[index]!, qw = rotationW[index]!;
      const tx = 2 * (-qy * worldZ + qz * worldY);
      const ty = 2 * (-qz * worldX + qx * worldZ);
      const tz = 2 * (-qx * worldY + qy * worldX);
      const localX = worldX + qw * tx + (-qy * tz + qz * ty);
      const localY = worldY + qw * ty + (-qz * tx + qx * tz);
      const localZ = worldZ + qw * tz + (-qx * ty + qy * tx);
      const scaledX = localX * inverseInertiaX[index]!;
      const scaledY = localY * inverseInertiaY[index]!;
      const scaledZ = localZ * inverseInertiaZ[index]!;
      const ux = 2 * (qy * scaledZ - qz * scaledY);
      const uy = 2 * (qz * scaledX - qx * scaledZ);
      const uz = 2 * (qx * scaledY - qy * scaledX);
      output[0] = scaledX + qw * ux + (qy * uz - qz * uy);
      output[1] = scaledY + qw * uy + (qz * ux - qx * uz);
      output[2] = scaledZ + qw * uz + (qx * uy - qy * ux);
      return output;
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
        ...(fractureEnergyJoules[index]! > 0 ? { impactResponse: { fractureEnergyJoules: fractureEnergyJoules[index]!, retainedEnergyRatio: retainedEnergyRatio[index]! } } : {}),
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
const inertiaA = [0, 0, 0];
const inertiaB = [0, 0, 0];
const localSphere = [0, 0, 0];
const worldVector = [0, 0, 0];
const orientedBoxes = createRigidOrientedBoxContact3D(context);
function detect(a: number, b: number, output: ContactScratch): boolean {
      if (shapeKind[a] === SHAPE_SPHERE && shapeKind[b] === SHAPE_SPHERE) return sphereSphere(a, b, output);
      if (shapeKind[a] === SHAPE_BOX && shapeKind[b] === SHAPE_BOX) return orientedBoxes.boxBox(a, b, output);
      if (shapeKind[a] === SHAPE_SPHERE) return sphereBox(a, b, output, false);
      return sphereBox(b, a, output, true);
    }
function detectManifold(a: number, b: number, output: ContactScratch): number {
      if (shapeKind[a] === SHAPE_BOX && shapeKind[b] === SHAPE_BOX) return orientedBoxes.boxBoxManifold(a, b, output);
      if (!detect(a, b, output)) return 0;
      orientedBoxes.manifoldPoints[0] = output.pointX; orientedBoxes.manifoldPoints[1] = output.pointY; orientedBoxes.manifoldPoints[2] = output.pointZ;
      return 1;
    }
function sphereSphere(a: number, b: number, output: ContactScratch): boolean {
      const dx = positionX[b]! - positionX[a]!;
      const dy = positionY[b]! - positionY[a]!;
      const dz = positionZ[b]! - positionZ[a]!;
      const radius = extentX[a]! + extentX[b]!;
      const distanceSquared = dx * dx + dy * dy + dz * dz;
      if (distanceSquared > radius * radius) return false;
      const distance = sqrt(distanceSquared);
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
function sphereBox(sphere: number, box: number, output: ContactScratch, invert: boolean): boolean {
      rotateQuaternionVector(rotationX[box]!, rotationY[box]!, rotationZ[box]!, rotationW[box]!, positionX[sphere]! - positionX[box]!, positionY[sphere]! - positionY[box]!, positionZ[sphere]! - positionZ[box]!, true, localSphere);
      const localX = localSphere[0]!, localY = localSphere[1]!, localZ = localSphere[2]!;
      let closestX = clamp(localX, -extentX[box]!, extentX[box]!);
      let closestY = clamp(localY, -extentY[box]!, extentY[box]!);
      let closestZ = clamp(localZ, -extentZ[box]!, extentZ[box]!);
      let dx = closestX - localX;
      let dy = closestY - localY;
      let dz = closestZ - localZ;
      const distanceSquared = dx * dx + dy * dy + dz * dz;
      const radius = extentX[sphere]!;
      if (distanceSquared > radius * radius) return false;
      let penetration = 0;
      if (distanceSquared > 1e-20) {
        const distance = sqrt(distanceSquared);
        dx /= distance; dy /= distance; dz /= distance;
        penetration = radius - distance;
      } else {
        const faceX = extentX[box]! - Math.abs(localX);
        const faceY = extentY[box]! - Math.abs(localY);
        const faceZ = extentZ[box]! - Math.abs(localZ);
        dx = 0; dy = 0; dz = 0;
        if (faceX <= faceY && faceX <= faceZ) { const sign = localX >= 0 ? 1 : -1; dx = -sign; closestX = sign * extentX[box]!; penetration = radius + faceX; }
        else if (faceY <= faceZ) { const sign = localY >= 0 ? 1 : -1; dy = -sign; closestY = sign * extentY[box]!; penetration = radius + faceY; }
        else { const sign = localZ >= 0 ? 1 : -1; dz = -sign; closestZ = sign * extentZ[box]!; penetration = radius + faceZ; }
      }
      rotateQuaternionVector(rotationX[box]!, rotationY[box]!, rotationZ[box]!, rotationW[box]!, dx, dy, dz, false, worldVector);
      output.normalX = invert ? -worldVector[0]! : worldVector[0]!;
      output.normalY = invert ? -worldVector[1]! : worldVector[1]!;
      output.normalZ = invert ? -worldVector[2]! : worldVector[2]!;
      output.penetration = penetration;
      rotateQuaternionVector(rotationX[box]!, rotationY[box]!, rotationZ[box]!, rotationW[box]!, closestX, closestY, closestZ, false, worldVector);
      output.pointX = positionX[box]! + worldVector[0]!; output.pointY = positionY[box]! + worldVector[1]!; output.pointZ = positionZ[box]! + worldVector[2]!;
      return true;
    }
const contactVelocity = (index: number, rx: number, ry: number, rz: number, output: number[]) => {
      output[0] = velocityX[index]! + angularVelocityY[index]! * rz - angularVelocityZ[index]! * ry;
      output[1] = velocityY[index]! + angularVelocityZ[index]! * rx - angularVelocityX[index]! * rz;
      output[2] = velocityZ[index]! + angularVelocityX[index]! * ry - angularVelocityY[index]! * rx;
    };
const effectiveMassTerm = (rx: number, ry: number, rz: number, dx: number, dy: number, dz: number, index: number, scratch: number[]) => {
      applyInverseInertia(index, ry * dz - rz * dy, rz * dx - rx * dz, rx * dy - ry * dx, scratch);
      return dx * (scratch[1]! * rz - scratch[2]! * ry) + dy * (scratch[2]! * rx - scratch[0]! * rz) + dz * (scratch[0]! * ry - scratch[1]! * rx);
    };
const applyAtPoint = (index: number, inverse: number, rx: number, ry: number, rz: number, ix: number, iy: number, iz: number, scratch: number[]) => {
      velocityX[index] += ix * inverse; velocityY[index] += iy * inverse; velocityZ[index] += iz * inverse;
      applyInverseInertia(index, ry * iz - rz * iy, rz * ix - rx * iz, rx * iy - ry * ix, scratch);
      angularVelocityX[index] += scratch[0]!; angularVelocityY[index] += scratch[1]!; angularVelocityZ[index] += scratch[2]!;
    };
function clearCachedPoint(offset: number): void {
      contactManifoldNormalImpulse[offset] = 0;
      contactManifoldFrictionX[offset] = 0; contactManifoldFrictionY[offset] = 0; contactManifoldFrictionZ[offset] = 0;
      contactManifoldWarmStarted[offset] = 0;
    }
function prepareContact(contact: number): void {
      const a = contactA[contact]!, b = contactB[contact]!, nx = contactNormalX[contact]!, ny = contactNormalY[contact]!, nz = contactNormalZ[contact]!, pointCount = contactManifoldPointCount[contact]!;
      let bestClosing = 0, bestEffectiveMass = 0, bestEnergy = -1, bestPoint = 0;
      for (let point = 0; point < pointCount; point += 1) {
        const offset = contact * 4 + point, pointX = contactManifoldPointX[offset]!, pointY = contactManifoldPointY[offset]!, pointZ = contactManifoldPointZ[offset]!;
        const rax = pointX - positionX[a]!, ray = pointY - positionY[a]!, raz = pointZ - positionZ[a]!, rbx = pointX - positionX[b]!, rby = pointY - positionY[b]!, rbz = pointZ - positionZ[b]!;
        contactVelocity(a, rax, ray, raz, inertiaA); contactVelocity(b, rbx, rby, rbz, inertiaB);
        const closing = Math.max(0, -((inertiaB[0]! - inertiaA[0]!) * nx + (inertiaB[1]! - inertiaA[1]!) * ny + (inertiaB[2]! - inertiaA[2]!) * nz));
        contactManifoldClosingSpeed[offset] = closing;
        const denominator = activeInverseMass(a) + activeInverseMass(b) + effectiveMassTerm(rax, ray, raz, nx, ny, nz, a, inertiaA) + effectiveMassTerm(rbx, rby, rbz, nx, ny, nz, b, inertiaB), effectiveMass = denominator > 1e-12 ? 1 / denominator : 0, energy = .5 * effectiveMass * closing * closing;
        if (energy > bestEnergy) { bestClosing = closing; bestEffectiveMass = effectiveMass; bestEnergy = energy; bestPoint = point; }
      }
      contactClosingSpeed[contact] = bestClosing; contactEffectiveMass[contact] = bestEffectiveMass; contactImpactEnergy[contact] = Math.max(0, bestEnergy); contactNormalImpulse[contact] = 0; contactFailedBody[contact] = -1; contactImpactPoint[contact] = bestPoint;
      if (contactTrigger[contact]) {
        contactWarmStartedPointCount[contact] = 0;
        for (let point = 0; point < pointCount; point += 1) clearCachedPoint(contact * 4 + point);
        return;
      }
      if (bestClosing <= 0) return;
      const failsA = fractureEnergyJoules[a]! > 0 && bestEnergy >= fractureEnergyJoules[a]!, failsB = fractureEnergyJoules[b]! > 0 && bestEnergy >= fractureEnergyJoules[b]!;
      if (failsA && failsB) contactFailedBody[contact] = fractureEnergyJoules[a]! < fractureEnergyJoules[b]! || fractureEnergyJoules[a] === fractureEnergyJoules[b] && handleAt(a) < handleAt(b) ? a : b;
      else if (failsA) contactFailedBody[contact] = a;
      else if (failsB) contactFailedBody[contact] = b;
      if (contactFailedBody[contact]! >= 0) {
        contactWarmStartedPointCount[contact] = 0;
        for (let point = 0; point < pointCount; point += 1) clearCachedPoint(contact * 4 + point);
      }
    }
function warmStart(contact: number): void {
      if (contactTrigger[contact] || contactFailedBody[contact]! >= 0) return;
      const a = contactA[contact]!, b = contactB[contact]!, nx = contactNormalX[contact]!, ny = contactNormalY[contact]!, nz = contactNormalZ[contact]!, inverseA = activeInverseMass(a), inverseB = activeInverseMass(b);
      let totalNormalImpulse = 0;
      for (let point = 0; point < contactManifoldPointCount[contact]!; point += 1) {
        const offset = contact * 4 + point, normalImpulse = Math.max(0, contactManifoldNormalImpulse[offset]!);
        totalNormalImpulse += normalImpulse;
        if (!contactManifoldWarmStarted[offset] || inverseA + inverseB === 0) continue;
        let frictionX = contactManifoldFrictionX[offset]!, frictionY = contactManifoldFrictionY[offset]!, frictionZ = contactManifoldFrictionZ[offset]!;
        const normalProjection = frictionX * nx + frictionY * ny + frictionZ * nz;
        frictionX -= normalProjection * nx; frictionY -= normalProjection * ny; frictionZ -= normalProjection * nz;
        const frictionLength = hypot(frictionX, frictionY, frictionZ), maximumFriction = normalImpulse * sqrt(friction[a]! * friction[b]!);
        if (frictionLength > maximumFriction && frictionLength > 1e-12) { const scale = maximumFriction / frictionLength; frictionX *= scale; frictionY *= scale; frictionZ *= scale; }
        contactManifoldFrictionX[offset] = frictionX; contactManifoldFrictionY[offset] = frictionY; contactManifoldFrictionZ[offset] = frictionZ;
        const pointX = contactManifoldPointX[offset]!, pointY = contactManifoldPointY[offset]!, pointZ = contactManifoldPointZ[offset]!;
        const rax = pointX - positionX[a]!, ray = pointY - positionY[a]!, raz = pointZ - positionZ[a]!, rbx = pointX - positionX[b]!, rby = pointY - positionY[b]!, rbz = pointZ - positionZ[b]!;
        const impulseX = normalImpulse * nx + frictionX, impulseY = normalImpulse * ny + frictionY, impulseZ = normalImpulse * nz + frictionZ;
        applyAtPoint(a, inverseA, rax, ray, raz, -impulseX, -impulseY, -impulseZ, inertiaA); applyAtPoint(b, inverseB, rbx, rby, rbz, impulseX, impulseY, impulseZ, inertiaB);
      }
      contactNormalImpulse[contact] = totalNormalImpulse;
    }
function solveVelocityPoint(contact: number, point: number, firstIteration: boolean): void {
      const a = contactA[contact]!, b = contactB[contact]!, nx = contactNormalX[contact]!, ny = contactNormalY[contact]!, nz = contactNormalZ[contact]!, offset = contact * 4 + point, pointX = contactManifoldPointX[offset]!, pointY = contactManifoldPointY[offset]!, pointZ = contactManifoldPointZ[offset]!;
      const inverseA = activeInverseMass(a);
      const inverseB = activeInverseMass(b);
      if (inverseA + inverseB === 0) return;
      const rax = pointX - positionX[a]!, ray = pointY - positionY[a]!, raz = pointZ - positionZ[a]!;
      const rbx = pointX - positionX[b]!, rby = pointY - positionY[b]!, rbz = pointZ - positionZ[b]!;
      contactVelocity(a, rax, ray, raz, inertiaA); contactVelocity(b, rbx, rby, rbz, inertiaB);
      let relativeX = inertiaB[0]! - inertiaA[0]!;
      let relativeY = inertiaB[1]! - inertiaA[1]!;
      let relativeZ = inertiaB[2]! - inertiaA[2]!;
      const normalVelocity = relativeX * nx + relativeY * ny + relativeZ * nz;
      const failed = contactFailedBody[contact]!;
      if (failed >= 0) {
        if (normalVelocity >= 0) return;
        if (!firstIteration || point !== contactImpactPoint[contact]) return;
        const available = Math.max(0, contactImpactEnergy[contact]! - fractureEnergyJoules[failed]!), residualSpeed = sqrt(2 * available * retainedEnergyRatio[failed]! / contactEffectiveMass[contact]!), impulse = Math.max(0, (contactClosingSpeed[contact]! - residualSpeed) * contactEffectiveMass[contact]!);
        applyAtPoint(a, inverseA, rax, ray, raz, -impulse * nx, -impulse * ny, -impulse * nz, inertiaA); applyAtPoint(b, inverseB, rbx, rby, rbz, impulse * nx, impulse * ny, impulse * nz, inertiaB); contactNormalImpulse[contact] = impulse;
        return;
      }
      const bounce = Math.max(restitution[a]!, restitution[b]!);
      const normalMass = inverseA + inverseB
        + effectiveMassTerm(rax, ray, raz, nx, ny, nz, a, inertiaA)
        + effectiveMassTerm(rbx, rby, rbz, nx, ny, nz, b, inertiaB);
      if (normalMass <= 1e-12) return;
      const oldNormalImpulse = contactManifoldNormalImpulse[offset]!;
      const restitutionTarget = contactManifoldWarmStarted[offset] ? 0 : bounce * contactManifoldClosingSpeed[offset]!;
      const newNormalImpulse = Math.max(0, oldNormalImpulse + (restitutionTarget - normalVelocity) / normalMass);
      const normalImpulseDelta = newNormalImpulse - oldNormalImpulse;
      contactManifoldNormalImpulse[offset] = newNormalImpulse;
      const impulseX = normalImpulseDelta * nx;
      const impulseY = normalImpulseDelta * ny;
      const impulseZ = normalImpulseDelta * nz;
      applyAtPoint(a, inverseA, rax, ray, raz, -impulseX, -impulseY, -impulseZ, inertiaA);
      applyAtPoint(b, inverseB, rbx, rby, rbz, impulseX, impulseY, impulseZ, inertiaB);

      contactVelocity(a, rax, ray, raz, inertiaA); contactVelocity(b, rbx, rby, rbz, inertiaB);
      relativeX = inertiaB[0]! - inertiaA[0]!;
      relativeY = inertiaB[1]! - inertiaA[1]!;
      relativeZ = inertiaB[2]! - inertiaA[2]!;
      const tangentProjection = relativeX * nx + relativeY * ny + relativeZ * nz;
      let tangentX = relativeX - tangentProjection * nx;
      let tangentY = relativeY - tangentProjection * ny;
      let tangentZ = relativeZ - tangentProjection * nz;
      const tangentLength = hypot(tangentX, tangentY, tangentZ);
      if (tangentLength <= 1e-12) return;
      tangentX /= tangentLength; tangentY /= tangentLength; tangentZ /= tangentLength;
      const tangentMass = inverseA + inverseB
        + effectiveMassTerm(rax, ray, raz, tangentX, tangentY, tangentZ, a, inertiaA)
        + effectiveMassTerm(rbx, rby, rbz, tangentX, tangentY, tangentZ, b, inertiaB);
      if (tangentMass <= 1e-12) return;
      const frictionDelta = -(relativeX * tangentX + relativeY * tangentY + relativeZ * tangentZ) / tangentMass;
      const oldFrictionX = contactManifoldFrictionX[offset]!, oldFrictionY = contactManifoldFrictionY[offset]!, oldFrictionZ = contactManifoldFrictionZ[offset]!;
      let newFrictionX = oldFrictionX + frictionDelta * tangentX, newFrictionY = oldFrictionY + frictionDelta * tangentY, newFrictionZ = oldFrictionZ + frictionDelta * tangentZ;
      const maximumFriction = newNormalImpulse * sqrt(friction[a]! * friction[b]!), frictionLength = hypot(newFrictionX, newFrictionY, newFrictionZ);
      if (frictionLength > maximumFriction && frictionLength > 1e-12) { const scale = maximumFriction / frictionLength; newFrictionX *= scale; newFrictionY *= scale; newFrictionZ *= scale; }
      contactManifoldFrictionX[offset] = newFrictionX; contactManifoldFrictionY[offset] = newFrictionY; contactManifoldFrictionZ[offset] = newFrictionZ;
      const frictionX = newFrictionX - oldFrictionX, frictionY = newFrictionY - oldFrictionY, frictionZ = newFrictionZ - oldFrictionZ;
      applyAtPoint(a, inverseA, rax, ray, raz, -frictionX, -frictionY, -frictionZ, inertiaA);
      applyAtPoint(b, inverseB, rbx, rby, rbz, frictionX, frictionY, frictionZ, inertiaB);
    }
function solveVelocity(contact: number, firstIteration: boolean): void {
      for (let point = 0; point < contactManifoldPointCount[contact]!; point += 1) solveVelocityPoint(contact, point, firstIteration);
      if (contactFailedBody[contact]! < 0) {
        let totalNormalImpulse = 0;
        for (let point = 0; point < contactManifoldPointCount[contact]!; point += 1) totalNormalImpulse += contactManifoldNormalImpulse[contact * 4 + point]!;
        contactNormalImpulse[contact] = totalNormalImpulse;
      }
    }
function solvePosition(contact: number): void {
      const a = contactA[contact]!, b = contactB[contact]!;
      const pointCount = detectManifold(a, b, context.contactScratch);
      if (pointCount === 0) return;
      const { normalX: nx, normalY: ny, normalZ: nz, penetration } = context.contactScratch;
      const inverseA = activeInverseMass(a);
      const inverseB = activeInverseMass(b);
      const targetCorrection = Math.max(0, penetration - POSITION_SLOP) * POSITION_PERCENT;
      if (inverseA + inverseB === 0 || targetCorrection === 0) return;
      let angularAX = 0, angularAY = 0, angularAZ = 0, angularBX = 0, angularBY = 0, angularBZ = 0;
      for (let point = 0; point < pointCount; point += 1) {
        const pointOffset = point * 3, pointX = orientedBoxes.manifoldPoints[pointOffset]!, pointY = orientedBoxes.manifoldPoints[pointOffset + 1]!, pointZ = orientedBoxes.manifoldPoints[pointOffset + 2]!;
        const rax = pointX - positionX[a]!, ray = pointY - positionY[a]!, raz = pointZ - positionZ[a]!, rbx = pointX - positionX[b]!, rby = pointY - positionY[b]!, rbz = pointZ - positionZ[b]!;
        // Rotating a sphere cannot resolve positional overlap: its support
        // surface is orientation-invariant. Excluding that ineffective degree
        // of freedom prevents contact projection from visibly flipping small
        // spherical character limbs while preserving physical rolling in the
        // velocity solver.
        const angularMassA = shapeKind[a] === SHAPE_SPHERE ? 0 : effectiveMassTerm(rax, ray, raz, nx, ny, nz, a, inertiaA);
        const angularMassB = shapeKind[b] === SHAPE_SPHERE ? 0 : effectiveMassTerm(rbx, rby, rbz, nx, ny, nz, b, inertiaB);
        const denominator = inverseA + inverseB + angularMassA + angularMassB;
        if (denominator <= 1e-12) continue;
        const impulse = targetCorrection / (pointCount * denominator);
        if (shapeKind[a] !== SHAPE_SPHERE) {
          applyInverseInertia(a, -impulse * (ray * nz - raz * ny), -impulse * (raz * nx - rax * nz), -impulse * (rax * ny - ray * nx), inertiaA);
          angularAX += inertiaA[0]!; angularAY += inertiaA[1]!; angularAZ += inertiaA[2]!;
        }
        if (shapeKind[b] !== SHAPE_SPHERE) {
          applyInverseInertia(b, impulse * (rby * nz - rbz * ny), impulse * (rbz * nx - rbx * nz), impulse * (rbx * ny - rby * nx), inertiaB);
          angularBX += inertiaB[0]!; angularBY += inertiaB[1]!; angularBZ += inertiaB[2]!;
        }
      }
      const angularALength = hypot(angularAX, angularAY, angularAZ), angularBLength = hypot(angularBX, angularBY, angularBZ);
      if (angularALength > POSITION_ANGULAR_LIMIT) { const scale = POSITION_ANGULAR_LIMIT / angularALength; angularAX *= scale; angularAY *= scale; angularAZ *= scale; }
      if (angularBLength > POSITION_ANGULAR_LIMIT) { const scale = POSITION_ANGULAR_LIMIT / angularBLength; angularBX *= scale; angularBY *= scale; angularBZ *= scale; }
      let angularSeparation = 0;
      for (let point = 0; point < pointCount; point += 1) {
        const pointOffset = point * 3, pointX = orientedBoxes.manifoldPoints[pointOffset]!, pointY = orientedBoxes.manifoldPoints[pointOffset + 1]!, pointZ = orientedBoxes.manifoldPoints[pointOffset + 2]!;
        const rax = pointX - positionX[a]!, ray = pointY - positionY[a]!, raz = pointZ - positionZ[a]!, rbx = pointX - positionX[b]!, rby = pointY - positionY[b]!, rbz = pointZ - positionZ[b]!;
        const displacementAX = angularAY * raz - angularAZ * ray, displacementAY = angularAZ * rax - angularAX * raz, displacementAZ = angularAX * ray - angularAY * rax;
        const displacementBX = angularBY * rbz - angularBZ * rby, displacementBY = angularBZ * rbx - angularBX * rbz, displacementBZ = angularBX * rby - angularBY * rbx;
        angularSeparation += ((displacementBX - displacementAX) * nx + (displacementBY - displacementAY) * ny + (displacementBZ - displacementAZ) * nz) / pointCount;
      }
      const inverseSum = inverseA + inverseB, translation = Math.max(0, targetCorrection - angularSeparation);
      positionX[a] -= nx * translation * inverseA / inverseSum; positionY[a] -= ny * translation * inverseA / inverseSum; positionZ[a] -= nz * translation * inverseA / inverseSum;
      positionX[b] += nx * translation * inverseB / inverseSum; positionY[b] += ny * translation * inverseB / inverseSum; positionZ[b] += nz * translation * inverseB / inverseSum;
      applyRotationDelta(a, angularAX, angularAY, angularAZ); applyRotationDelta(b, angularBX, angularBY, angularBZ);
      updateAabb(a); updateAabb(b);
    }
const manifoldPoints = orientedBoxes.manifoldPoints;
const boxBox = orientedBoxes.boxBox;
return { handleAt, resolve, resolveOptional, updateAabb, setQuaternion, integrateRotation, dampLinearVelocity, applyRotationDelta, filters, activeInverseMass, applyInverseInertia, state, writeBoxEdges, detect, detectManifold, manifoldPoints, sphereSphere, boxBox, sphereBox, prepareContact, warmStart, solveVelocity, solvePosition };
}
export type RigidBaseOperationsSet = ReturnType<typeof createRigidBaseOperations>;


export type RigidCollisionOperationsSet = Pick<RigidBaseOperationsSet, "detect" | "detectManifold" | "manifoldPoints" | "sphereSphere" | "boxBox" | "sphereBox" | "prepareContact" | "warmStart" | "solveVelocity" | "solvePosition">;

function createRigidAngularCcdOperations(context: RigidOperationContext, operations: RigidBaseOperationsSet & RigidCollisionOperationsSet) {
  const { bodies, diagnostics, contactScratch } = context;
  const { shapeKind, positionX, positionY, positionZ, previousX, previousY, previousZ, rotationX, rotationY, rotationZ, rotationW, previousRotationX, previousRotationY, previousRotationZ, previousRotationW, extentX, extentY, extentZ } = bodies;
  function quaternionTravel(index: number): number {
    const dot = Math.abs(previousRotationX[index]! * rotationX[index]! + previousRotationY[index]! * rotationY[index]! + previousRotationZ[index]! * rotationZ[index]! + previousRotationW[index]! * rotationW[index]!);
    return 2 * acos(clamp(dot, -1, 1));
  }
  function axisAlignedBox(index: number): boolean {
    return Math.abs(rotationX[index]!) + Math.abs(rotationY[index]!) + Math.abs(rotationZ[index]!) <= CCD_EPSILON;
  }
  function setRotationAt(index: number, time: number, finalX: number, finalY: number, finalZ: number, finalW: number): void {
    const ax = previousRotationX[index]!, ay = previousRotationY[index]!, az = previousRotationZ[index]!, aw = previousRotationW[index]!;
    const sign = ax * finalX + ay * finalY + az * finalZ + aw * finalW < 0 ? -1 : 1, remaining = 1 - time;
    operations.setQuaternion(index, ax * remaining + finalX * sign * time, ay * remaining + finalY * sign * time, az * remaining + finalZ * sign * time, aw * remaining + finalW * sign * time);
  }
  function setTransformsAt(index: number, other: number, dx: number, dy: number, dz: number, otherDx: number, otherDy: number, otherDz: number, time: number, finalX: number, finalY: number, finalZ: number, finalW: number, otherFinalX: number, otherFinalY: number, otherFinalZ: number, otherFinalW: number): void {
    positionX[index] = previousX[index]! + dx * time; positionY[index] = previousY[index]! + dy * time; positionZ[index] = previousZ[index]! + dz * time;
    positionX[other] = previousX[other]! + otherDx * time; positionY[other] = previousY[other]! + otherDy * time; positionZ[other] = previousZ[other]! + otherDz * time;
    setRotationAt(index, time, finalX, finalY, finalZ, finalW); setRotationAt(other, time, otherFinalX, otherFinalY, otherFinalZ, otherFinalW);
  }
  function sweepAngularMotion(index: number, other: number, dx: number, dy: number, dz: number, otherDx: number, otherDy: number, otherDz: number, angularTravel: number, otherAngularTravel: number, finalX: number, finalY: number, finalZ: number, finalW: number, otherFinalX: number, otherFinalY: number, otherFinalZ: number, otherFinalW: number, output: SweepScratch): boolean {
    const radius = shapeKind[index] === SHAPE_BOX ? hypot(extentX[index]!, extentY[index]!, extentZ[index]!) : 0;
    const otherRadius = shapeKind[other] === SHAPE_BOX ? hypot(extentX[other]!, extentY[other]!, extentZ[other]!) : 0;
    const ownFeature = Math.min(extentX[index]!, extentY[index]!, extentZ[index]!);
    const otherFeature = shapeKind[other] === SHAPE_SPHERE ? extentX[other]! : Math.min(extentX[other]!, extentY[other]!, extentZ[other]!);
    const relativeTravel = hypot(dx - otherDx, dy - otherDy, dz - otherDz) + angularTravel * radius + otherAngularTravel * otherRadius;
    const samples = Math.min(128, Math.max(2, Math.ceil(relativeTravel / Math.max(1e-4, Math.min(ownFeature, otherFeature) * .5))));
    let low = 0;
    for (let sample = 1; sample <= samples; sample += 1) {
      const high = sample / samples;
      setTransformsAt(index, other, dx, dy, dz, otherDx, otherDy, otherDz, high, finalX, finalY, finalZ, finalW, otherFinalX, otherFinalY, otherFinalZ, otherFinalW); diagnostics.ccdAngularTests += 1;
      if (!operations.detect(index, other, contactScratch)) { low = high; continue; }
      let hit = high;
      for (let iteration = 0; iteration < 8; iteration += 1) {
        const middle = (low + hit) * .5;
        setTransformsAt(index, other, dx, dy, dz, otherDx, otherDy, otherDz, middle, finalX, finalY, finalZ, finalW, otherFinalX, otherFinalY, otherFinalZ, otherFinalW); diagnostics.ccdAngularTests += 1;
        if (operations.detect(index, other, contactScratch)) hit = middle; else low = middle;
      }
      setTransformsAt(index, other, dx, dy, dz, otherDx, otherDy, otherDz, hit, finalX, finalY, finalZ, finalW, otherFinalX, otherFinalY, otherFinalZ, otherFinalW); operations.detect(index, other, contactScratch);
      output.time = hit; output.normalX = contactScratch.normalX; output.normalY = contactScratch.normalY; output.normalZ = contactScratch.normalZ;
      return true;
    }
    return false;
  }
  return { quaternionTravel, axisAlignedBox, setRotationAt, setTransformsAt, sweepAngularMotion };
}

function createRigidOrientedBoxCcdOperations(context: RigidOperationContext) {
  const { rotationX, rotationY, rotationZ, rotationW, previousX, previousY, previousZ, extentX, extentY, extentZ } = context.bodies;
  const axesA = new Float64Array(9), axesB = new Float64Array(9);
  let movingIndex = 0, fixedIndex = 0, centerX = 0, centerY = 0, centerZ = 0, travelX = 0, travelY = 0, travelZ = 0;
  let enter = 0, exit = 1, normalX = 0, normalY = 0, normalZ = 0;
  const projectedRadius = (index: number, axes: Float64Array, axisX: number, axisY: number, axisZ: number) => extentX[index]! * Math.abs(axisX * axes[0]! + axisY * axes[1]! + axisZ * axes[2]!)
    + extentY[index]! * Math.abs(axisX * axes[3]! + axisY * axes[4]! + axisZ * axes[5]!)
    + extentZ[index]! * Math.abs(axisX * axes[6]! + axisY * axes[7]! + axisZ * axes[8]!);
  const testAxis = (axisX: number, axisY: number, axisZ: number): boolean => {
    const length = hypot(axisX, axisY, axisZ);
    if (length <= 1e-10) return true;
    axisX /= length; axisY /= length; axisZ /= length;
    const radius = projectedRadius(movingIndex, axesA, axisX, axisY, axisZ) + projectedRadius(fixedIndex, axesB, axisX, axisY, axisZ);
    const center = centerX * axisX + centerY * axisY + centerZ * axisZ, travel = travelX * axisX + travelY * axisY + travelZ * axisZ;
    if (Math.abs(travel) <= CCD_EPSILON) return Math.abs(center) <= radius + CCD_EPSILON;
    let first = (-radius - center) / travel, last = (radius - center) / travel;
    if (first > last) { const swap = first; first = last; last = swap; }
    if (first > enter) {
      enter = first;
      const sign = center + travel * first >= 0 ? 1 : -1;
      normalX = axisX * sign; normalY = axisY * sign; normalZ = axisZ * sign;
    }
    exit = Math.min(exit, last);
    return enter <= exit + CCD_EPSILON;
  };
  function sweep(moving: number, fixed: number, dx: number, dy: number, dz: number, otherDx: number, otherDy: number, otherDz: number, output: SweepScratch): boolean {
    movingIndex = moving; fixedIndex = fixed;
    writeQuaternionAxes(rotationX[moving]!, rotationY[moving]!, rotationZ[moving]!, rotationW[moving]!, axesA);
    writeQuaternionAxes(rotationX[fixed]!, rotationY[fixed]!, rotationZ[fixed]!, rotationW[fixed]!, axesB);
    centerX = previousX[fixed]! - previousX[moving]!; centerY = previousY[fixed]! - previousY[moving]!; centerZ = previousZ[fixed]! - previousZ[moving]!;
    travelX = otherDx - dx; travelY = otherDy - dy; travelZ = otherDz - dz; enter = 0; exit = 1; normalX = 0; normalY = 0; normalZ = 0;
    for (let axis = 0; axis < 3; axis += 1) if (!testAxis(axesA[axis * 3]!, axesA[axis * 3 + 1]!, axesA[axis * 3 + 2]!)) return false;
    for (let axis = 0; axis < 3; axis += 1) if (!testAxis(axesB[axis * 3]!, axesB[axis * 3 + 1]!, axesB[axis * 3 + 2]!)) return false;
    for (let axisA = 0; axisA < 3; axisA += 1) for (let axisB = 0; axisB < 3; axisB += 1) {
      const ax = axesA[axisA * 3]!, ay = axesA[axisA * 3 + 1]!, az = axesA[axisA * 3 + 2]!;
      const bx = axesB[axisB * 3]!, by = axesB[axisB * 3 + 1]!, bz = axesB[axisB * 3 + 2]!;
      if (!testAxis(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx)) return false;
    }
    if (enter < -CCD_EPSILON || enter > 1 + CCD_EPSILON) return false;
    output.time = clamp(enter, 0, 1); output.normalX = normalX; output.normalY = normalY; output.normalZ = normalZ;
    return true;
  }
  return { sweep };
}

export function createRigidCcdOperations(context: RigidOperationContext, operations: RigidBaseOperationsSet & RigidCollisionOperationsSet) {
const { config, bodies, diagnostics, contactScratch, sweepScratch, contactStorage, mutable } = context;
const { capacity, maxCcdTests, maxContacts, maxCandidatePairs } = config;
const { alive, bodyType, shapeKind, flags, positionX, positionY, positionZ, previousX, previousY, previousZ, rotationX, rotationY, rotationZ, rotationW, extentX, extentY, extentZ, aabbMinX, aabbMinY, aabbMinZ, aabbMaxX, aabbMaxY, aabbMaxZ, ids, sort, sortScratch } = bodies;
const { contactA, contactB, contactNormalX, contactNormalY, contactNormalZ, contactPenetration, contactPointX, contactPointY, contactPointZ, contactTrigger, contactManifoldPointCount, contactManifoldPointX, contactManifoldPointY, contactManifoldPointZ, contactManifoldNormalImpulse, contactManifoldFrictionX, contactManifoldFrictionY, contactManifoldFrictionZ, contactManifoldWarmStarted, contactWarmStartedPointCount, previousContactA, previousContactB, previousContactNormalX, previousContactNormalY, previousContactNormalZ, previousManifoldPointCount, previousManifoldPointX, previousManifoldPointY, previousManifoldPointZ, previousManifoldNormalImpulse, previousManifoldFrictionX, previousManifoldFrictionY, previousManifoldFrictionZ, previousManifoldUsed } = contactStorage;
const { detectManifold, manifoldPoints } = operations;
const { quaternionTravel, axisAlignedBox, setRotationAt, setTransformsAt, sweepAngularMotion } = createRigidAngularCcdOperations(context, operations);
const orientedBoxCcd = createRigidOrientedBoxCcdOperations(context);
const mayOverlap = createCcdBoundsTest(bodies);
function runCcd(index: number): void {
      const dx = positionX[index]! - previousX[index]!;
      const dy = positionY[index]! - previousY[index]!;
      const dz = positionZ[index]! - previousZ[index]!;
      const finalRotationX = rotationX[index]!, finalRotationY = rotationY[index]!, finalRotationZ = rotationZ[index]!, finalRotationW = rotationW[index]!;
      const angularTravel = shapeKind[index] === SHAPE_BOX ? quaternionTravel(index) : 0;
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) <= CCD_EPSILON && angularTravel <= CCD_EPSILON) return;
      let earliest = 1;
      let hitIndex = -1;
      let carryX = 0;
      let carryY = 0;
      let carryZ = 0;
      let angularHit = false;
      let hitNormalX = 0, hitNormalY = 0, hitNormalZ = 0;
      for (let other = 0; other < capacity; other += 1) {
        if (other === index || alive[other] === 0 || !operations.filters(index, other) || (flags[index]! & FLAG_TRIGGER) !== 0 || (flags[other]! & FLAG_TRIGGER) !== 0) continue;
        if (bodyType[other] === TYPE_DYNAMIC && (flags[other]! & FLAG_CONTINUOUS) !== 0 && operations.handleAt(other) < operations.handleAt(index)) continue;
        diagnostics.ccdEligiblePairs += 1;
        // Distant eligible pairs must not starve later bodies of contact tests.
        // Bounds cover both translations and every intermediate rotation.
        if (!mayOverlap(index, other)) {
          diagnostics.ccdBoundsRejects += 1;
          // The original pair path normalizes endpoint quaternions even on a
          // miss. Preserve that rounding and the final bounds while omitting
          // its unreachable contact tests and intermediate transforms.
          setRotationAt(index, 1, finalRotationX, finalRotationY, finalRotationZ, finalRotationW);
          setRotationAt(other, 1, rotationX[other]!, rotationY[other]!, rotationZ[other]!, rotationW[other]!);
          continue;
        }
        if (diagnostics.ccdTests >= maxCcdTests) { diagnostics.ccdTestOverflows += 1; break; }
        diagnostics.ccdTests += 1;
        const ax = positionX[index]!, ay = positionY[index]!, az = positionZ[index]!;
        const bx = positionX[other]!, by = positionY[other]!, bz = positionZ[other]!;
        const otherFinalRotationX = rotationX[other]!, otherFinalRotationY = rotationY[other]!, otherFinalRotationZ = rotationZ[other]!, otherFinalRotationW = rotationW[other]!;
        const otherAngularTravel = shapeKind[other] === SHAPE_BOX ? quaternionTravel(other) : 0;
        const pairAngularTravel = angularTravel + otherAngularTravel;
        const otherDx = bx - previousX[other]!, otherDy = by - previousY[other]!, otherDz = bz - previousZ[other]!;
        const relativeX = dx - otherDx, relativeY = dy - otherDy, relativeZ = dz - otherDz;
        positionX[index] = previousX[index]!; positionY[index] = previousY[index]!; positionZ[index] = previousZ[index]!;
        positionX[other] = previousX[other]!; positionY[other] = previousY[other]!; positionZ[other] = previousZ[other]!;
        setRotationAt(index, 0, finalRotationX, finalRotationY, finalRotationZ, finalRotationW);
        setRotationAt(other, 0, otherFinalRotationX, otherFinalRotationY, otherFinalRotationZ, otherFinalRotationW);
        if (operations.detect(index, other, contactScratch)) {
          // Resting overlap belongs to the discrete solver. Free tangential and
          // separating motion; retain CCD when the step crosses the entire solid.
          const side = (previousX[index]! - previousX[other]!) * contactScratch.normalX + (previousY[index]! - previousY[other]!) * contactScratch.normalY + (previousZ[index]! - previousZ[other]!) * contactScratch.normalZ;
          const travel = (relativeX * contactScratch.normalX + relativeY * contactScratch.normalY + relativeZ * contactScratch.normalZ) * (side >= 0 ? 1 : -1);
          const intoX = contactScratch.normalX * (side >= 0 ? -1 : 1), intoY = contactScratch.normalY * (side >= 0 ? -1 : 1), intoZ = contactScratch.normalZ * (side >= 0 ? -1 : 1);
          positionX[index] = ax; positionY[index] = ay; positionZ[index] = az;
          positionX[other] = bx; positionY[other] = by; positionZ[other] = bz;
          setRotationAt(index, 1, finalRotationX, finalRotationY, finalRotationZ, finalRotationW);
          setRotationAt(other, 1, otherFinalRotationX, otherFinalRotationY, otherFinalRotationZ, otherFinalRotationW);
          // A nearly tangent sphere may leave a shallow resting overlap at an
          // edge. Bound normal travel to 1% of its radius and 5% of this step.
          const grazing = Math.abs(travel) <= extentX[index]! * .01 && Math.abs(travel) <= hypot(relativeX, relativeY, relativeZ) * .05;
          const crossingDepth = shapeKind[index] === SHAPE_SPHERE && (shapeKind[other] === SHAPE_SPHERE || grazing) ? Math.abs(side) : 0;
          const endpointContact = operations.detect(index, other, contactScratch);
          // An overlapping endpoint can already be on the far side of a thin
          // solid. Only delegate contacts whose normal still faces the entry
          // side; otherwise the discrete solver ejects the body through it.
          const sameSide = endpointContact && contactScratch.normalX * intoX + contactScratch.normalY * intoY + contactScratch.normalZ * intoZ > 0;
          const crossedSide = !sameSide && travel < -Math.abs(side) - CCD_EPSILON;
          const crossesSolid = travel < -crossingDepth - CCD_EPSILON && (!endpointContact || crossedSide);
          if (crossesSolid && (earliest > 0 || (earliest === 0 && operations.handleAt(other) < (hitIndex < 0 ? Number.POSITIVE_INFINITY : operations.handleAt(hitIndex))))) {
            earliest = 0; hitIndex = other;
            carryX = otherDx; carryY = otherDy; carryZ = otherDz;
            hitNormalX = intoX; hitNormalY = intoY; hitNormalZ = intoZ;
            angularHit = false;
          }
          positionX[index] = ax; positionY[index] = ay; positionZ[index] = az;
          positionX[other] = bx; positionY[other] = by; positionZ[other] = bz;
          operations.updateAabb(index); operations.updateAabb(other);
          continue;
        }
        let hit = false;
        if (shapeKind[index] === SHAPE_SPHERE && shapeKind[other] === SHAPE_SPHERE) {
          hit = sweepSphereSphere(index, other, relativeX, relativeY, relativeZ, sweepScratch);
        } else if (shapeKind[index] !== shapeKind[other]) {
          hit = sweepSphereOrientedBox(index, other, relativeX, relativeY, relativeZ, sweepScratch);
        } else if (pairAngularTravel <= CCD_EPSILON) {
          hit = axisAlignedBox(index) && axisAlignedBox(other)
            ? sweepExpandedAabb(index, other, relativeX, relativeY, relativeZ, sweepScratch)
            : orientedBoxCcd.sweep(index, other, dx, dy, dz, otherDx, otherDy, otherDz, sweepScratch);
        }
        let hitTime = sweepScratch.time, pairAngularHit = false;
        const normalX = sweepScratch.normalX, normalY = sweepScratch.normalY, normalZ = sweepScratch.normalZ;
        if (hit && pairAngularTravel > CCD_EPSILON) {
          setTransformsAt(index, other, dx, dy, dz, otherDx, otherDy, otherDz, hitTime, finalRotationX, finalRotationY, finalRotationZ, finalRotationW, otherFinalRotationX, otherFinalRotationY, otherFinalRotationZ, otherFinalRotationW);
          hit = operations.detect(index, other, contactScratch);
        }
        if (pairAngularTravel > CCD_EPSILON && sweepAngularMotion(index, other, dx, dy, dz, otherDx, otherDy, otherDz, angularTravel, otherAngularTravel, finalRotationX, finalRotationY, finalRotationZ, finalRotationW, otherFinalRotationX, otherFinalRotationY, otherFinalRotationZ, otherFinalRotationW, sweepScratch)) {
          if (!hit || sweepScratch.time < hitTime - CCD_EPSILON) {
            hit = true; hitTime = sweepScratch.time; pairAngularHit = true;
          }
        }
        setRotationAt(index, 1, finalRotationX, finalRotationY, finalRotationZ, finalRotationW);
        setRotationAt(other, 1, otherFinalRotationX, otherFinalRotationY, otherFinalRotationZ, otherFinalRotationW);
        positionX[index] = ax; positionY[index] = ay; positionZ[index] = az;
        positionX[other] = bx; positionY[other] = by; positionZ[other] = bz;
        operations.updateAabb(index); operations.updateAabb(other);
        if (!hit) continue;
        // Connected slabs can repeatedly stop a sphere at the same rounded
        // corner. Let the discrete solver finish only a shallow contact on the
        // same face; a far-side endpoint must remain a swept collision. Do not
        // scale this tolerance by tangent speed: slow walking under gravity
        // otherwise repeatedly loses its entire tangential step at floor seams.
        const normalTravel = Math.abs(relativeX * normalX + relativeY * normalY + relativeZ * normalZ);
        if (!pairAngularHit && shapeKind[index] === SHAPE_SPHERE && bodyType[other] === TYPE_STATIC
          && normalTravel <= extentX[index]! * .01 && operations.detect(index, other, contactScratch)
          && contactScratch.normalX * normalX + contactScratch.normalY * normalY + contactScratch.normalZ * normalZ > .99) continue;
        if (hitTime < earliest - CCD_EPSILON || (Math.abs(hitTime - earliest) <= CCD_EPSILON && operations.handleAt(other) < (hitIndex < 0 ? Number.POSITIVE_INFINITY : operations.handleAt(hitIndex)))) {
          earliest = hitTime; hitIndex = other;
          carryX = otherDx; carryY = otherDy; carryZ = otherDz;
          angularHit = pairAngularHit;
          hitNormalX = pairAngularHit ? 0 : normalX; hitNormalY = pairAngularHit ? 0 : normalY; hitNormalZ = pairAngularHit ? 0 : normalZ;
        }
      }
      // Dynamic pairs stop together at impact. Carrying the target's remaining
      // displacement onto this body can drag it through a third collider (for
      // example, a falling fighter pushing a grounded fighter below the floor).
      if (hitIndex >= 0 && bodyType[hitIndex] === TYPE_DYNAMIC) {
        positionX[hitIndex] = previousX[hitIndex]! + carryX * earliest;
        positionY[hitIndex] = previousY[hitIndex]! + carryY * earliest;
        positionZ[hitIndex] = previousZ[hitIndex]! + carryZ * earliest;
        setRotationAt(hitIndex, earliest, rotationX[hitIndex]!, rotationY[hitIndex]!, rotationZ[hitIndex]!, rotationW[hitIndex]!);
        operations.updateAabb(hitIndex);
        carryX = 0; carryY = 0; carryZ = 0;
      }
      positionX[index] = finite(previousX[index]! + dx * earliest + carryX * (1 - earliest), `body ${ids[index]} x`);
      positionY[index] = finite(previousY[index]! + dy * earliest + carryY * (1 - earliest), `body ${ids[index]} y`);
      positionZ[index] = finite(previousZ[index]! + dz * earliest + carryZ * (1 - earliest), `body ${ids[index]} z`);
      if (hitIndex >= 0) {
        const relativeX = dx - carryX, relativeY = dy - carryY, relativeZ = dz - carryZ, length = hypot(relativeX, relativeY, relativeZ);
        const overlap = CCD_EPSILON * .25;
        // A near-tangent sweep can stop just outside the discrete contact
        // tolerance. Nudge into the actual surface, not along its tangent,
        // so the ordinary solver can resolve contact and release later motion.
        if (hitNormalX || hitNormalY || hitNormalZ) { positionX[index] += hitNormalX * overlap; positionY[index] += hitNormalY * overlap; positionZ[index] += hitNormalZ * overlap; }
        else if (length > CCD_EPSILON) { positionX[index] += relativeX / length * overlap; positionY[index] += relativeY / length * overlap; positionZ[index] += relativeZ / length * overlap; }
      }
      if (angularHit) setRotationAt(index, earliest, finalRotationX, finalRotationY, finalRotationZ, finalRotationW);
      operations.updateAabb(index);
      if (hitIndex >= 0) {
        diagnostics.ccdHits += 1;
        if (angularHit) diagnostics.ccdAngularHits += 1;
        // The bounded sweep places the body at exact contact. The shared contact pass
        // then measures pre-solve energy once and applies either solid or failure response.
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
      const time = (-b - sqrt(discriminant)) / (2 * a);
      if (time < 0 || time > 1) return false;
      const hitX = previousX[moving]! + dx * time;
      const hitY = previousY[moving]! + dy * time;
      const hitZ = previousZ[moving]! + dz * time;
      const nx = positionX[fixed]! - hitX;
      const ny = positionY[fixed]! - hitY;
      const nz = positionZ[fixed]! - hitZ;
      const length = hypot(nx, ny, nz);
      output.time = time; output.normalX = nx / length; output.normalY = ny / length; output.normalZ = nz / length;
      return true;
    }
function sweepSphereOrientedBox(moving: number, fixed: number, relativeX: number, relativeY: number, relativeZ: number, output: SweepScratch): boolean {
      const sphere = shapeKind[moving] === SHAPE_SPHERE ? moving : fixed, box = sphere === moving ? fixed : moving;
      const sphereRelativeX = previousX[sphere]! - previousX[box]!, sphereRelativeY = previousY[sphere]! - previousY[box]!, sphereRelativeZ = previousZ[sphere]! - previousZ[box]!;
      const sphereDeltaX = sphere === moving ? relativeX : -relativeX, sphereDeltaY = sphere === moving ? relativeY : -relativeY, sphereDeltaZ = sphere === moving ? relativeZ : -relativeZ;
      rotateQuaternionVector(rotationX[box]!, rotationY[box]!, rotationZ[box]!, rotationW[box]!, sphereRelativeX, sphereRelativeY, sphereRelativeZ, true, ccdVectorA);
      rotateQuaternionVector(rotationX[box]!, rotationY[box]!, rotationZ[box]!, rotationW[box]!, sphereDeltaX, sphereDeltaY, sphereDeltaZ, true, ccdVectorB);
      const radius = extentX[sphere]!;
      if (!rayAabbUnit(ccdVectorA[0]!, ccdVectorA[1]!, ccdVectorA[2]!, ccdVectorB[0]!, ccdVectorB[1]!, ccdVectorB[2]!, -extentX[box]! - radius, -extentY[box]! - radius, -extentZ[box]! - radius, extentX[box]! + radius, extentY[box]! + radius, extentZ[box]! + radius, output)) return false;
      if (!refineSphereBoxSweep(ccdVectorA, ccdVectorB, extentX[box]!, extentY[box]!, extentZ[box]!, radius, output)) return false;
      rotateQuaternionVector(rotationX[box]!, rotationY[box]!, rotationZ[box]!, rotationW[box]!, output.normalX, output.normalY, output.normalZ, false, ccdVectorA);
      const sign = sphere === moving ? -1 : 1;
      output.normalX = ccdVectorA[0]! * sign; output.normalY = ccdVectorA[1]! * sign; output.normalZ = ccdVectorA[2]! * sign;
      return true;
    }
const ccdVectorA = [0, 0, 0], ccdVectorB = [0, 0, 0];
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
      const distance = -projection - sqrt(discriminant);
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
let previousContactCount = 0;
const previousIndex = createContactPairIndex(previousContactA, previousContactB);
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
      previousContactCount = mutable.currentContacts;
      previousManifoldUsed.fill(0, 0, previousContactCount * 4);
      for (let contact = 0; contact < previousContactCount; contact += 1) {
        previousContactA[contact] = contactA[contact]!; previousContactB[contact] = contactB[contact]!;
        previousContactNormalX[contact] = contactNormalX[contact]!; previousContactNormalY[contact] = contactNormalY[contact]!; previousContactNormalZ[contact] = contactNormalZ[contact]!;
        const pointCount = contactManifoldPointCount[contact]!; previousManifoldPointCount[contact] = pointCount;
        for (let point = 0; point < pointCount; point += 1) {
          const offset = contact * 4 + point;
          previousManifoldPointX[offset] = contactManifoldPointX[offset]!; previousManifoldPointY[offset] = contactManifoldPointY[offset]!; previousManifoldPointZ[offset] = contactManifoldPointZ[offset]!;
          previousManifoldNormalImpulse[offset] = contactManifoldNormalImpulse[offset]!;
          previousManifoldFrictionX[offset] = contactManifoldFrictionX[offset]!; previousManifoldFrictionY[offset] = contactManifoldFrictionY[offset]!; previousManifoldFrictionZ[offset] = contactManifoldFrictionZ[offset]!;
        }
      }
      previousIndex.rebuild(previousContactCount);
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
          const manifoldPointCount = detectManifold(a, b, contactScratch);
          if (!manifoldPointCount) continue;
          if (mutable.currentContacts >= maxContacts) { diagnostics.contactOverflows += 1; continue; }
          contactA[mutable.currentContacts] = a; contactB[mutable.currentContacts] = b;
          contactNormalX[mutable.currentContacts] = contactScratch.normalX; contactNormalY[mutable.currentContacts] = contactScratch.normalY; contactNormalZ[mutable.currentContacts] = contactScratch.normalZ;
          contactPenetration[mutable.currentContacts] = contactScratch.penetration;
          contactPointX[mutable.currentContacts] = contactScratch.pointX; contactPointY[mutable.currentContacts] = contactScratch.pointY; contactPointZ[mutable.currentContacts] = contactScratch.pointZ;
          contactManifoldPointCount[mutable.currentContacts] = manifoldPointCount;
          contactWarmStartedPointCount[mutable.currentContacts] = 0;
          const manifoldOffset = mutable.currentContacts * 4;
          for (let point = 0; point < 4; point += 1) {
            const target = manifoldOffset + point;
            contactManifoldNormalImpulse[target] = 0; contactManifoldFrictionX[target] = 0; contactManifoldFrictionY[target] = 0; contactManifoldFrictionZ[target] = 0; contactManifoldWarmStarted[target] = 0;
            if (point < manifoldPointCount) { const source = point * 3; contactManifoldPointX[target] = manifoldPoints[source]!; contactManifoldPointY[target] = manifoldPoints[source + 1]!; contactManifoldPointZ[target] = manifoldPoints[source + 2]!; }
          }
          const matchDistance = Math.max(1e-5, Math.min(extentX[a]!, extentY[a]!, extentZ[a]!, extentX[b]!, extentY[b]!, extentZ[b]!) * .5), matchDistanceSquared = matchDistance * matchDistance;
          const previousStart = previousContactCount >= 128 ? previousIndex.find(a, b, mutable.currentContacts) : 0;
          for (let previousContact = previousStart < 0 ? previousContactCount : previousStart; previousContact < previousContactCount; previousContact += 1) {
            const sameOrder = previousContactA[previousContact] === a && previousContactB[previousContact] === b, reverseOrder = previousContactA[previousContact] === b && previousContactB[previousContact] === a;
            if (!sameOrder && !reverseOrder) continue;
            const normalSign = sameOrder ? 1 : -1;
            const normalAgreement = (previousContactNormalX[previousContact]! * contactScratch.normalX + previousContactNormalY[previousContact]! * contactScratch.normalY + previousContactNormalZ[previousContact]! * contactScratch.normalZ) * normalSign;
            if (normalAgreement < .95) break;
            for (let point = 0; point < manifoldPointCount; point += 1) {
              const target = manifoldOffset + point;
              let bestPreviousOffset = -1, bestDistanceSquared = matchDistanceSquared;
              for (let previousPoint = 0; previousPoint < previousManifoldPointCount[previousContact]!; previousPoint += 1) {
                const source = previousContact * 4 + previousPoint;
                if (previousManifoldUsed[source]) continue;
                const dx = contactManifoldPointX[target]! - previousManifoldPointX[source]!, dy = contactManifoldPointY[target]! - previousManifoldPointY[source]!, dz = contactManifoldPointZ[target]! - previousManifoldPointZ[source]!, distanceSquared = dx * dx + dy * dy + dz * dz;
                if (distanceSquared <= bestDistanceSquared) { bestDistanceSquared = distanceSquared; bestPreviousOffset = source; }
              }
              if (bestPreviousOffset < 0) continue;
              previousManifoldUsed[bestPreviousOffset] = 1; contactManifoldWarmStarted[target] = 1; contactWarmStartedPointCount[mutable.currentContacts] += 1;
              contactManifoldNormalImpulse[target] = previousManifoldNormalImpulse[bestPreviousOffset]!;
              contactManifoldFrictionX[target] = previousManifoldFrictionX[bestPreviousOffset]! * normalSign; contactManifoldFrictionY[target] = previousManifoldFrictionY[bestPreviousOffset]! * normalSign; contactManifoldFrictionZ[target] = previousManifoldFrictionZ[bestPreviousOffset]! * normalSign;
            }
            break;
          }
          contactTrigger[mutable.currentContacts] = (flags[a]! & FLAG_TRIGGER) !== 0 || (flags[b]! & FLAG_TRIGGER) !== 0 ? 1 : 0;
          operations.prepareContact(mutable.currentContacts);
          mutable.currentContacts += 1;
        }
      }
      diagnostics.contacts = mutable.currentContacts;
    }
const contactIndexStorageBytes = previousIndex.storageBytes;
return { runCcd, sweepSphereSphere, sweepExpandedAabb, raySphere, sortBodies, collectContacts, contactIndexStorageBytes };
}
export type RigidCcdOperationsSet = ReturnType<typeof createRigidCcdOperations>;


export type RigidBroadphaseOperationsSet = Pick<RigidCcdOperationsSet, "sortBodies" | "collectContacts" | "contactIndexStorageBytes">;

export type RigidOperations = RigidBaseOperationsSet & RigidCollisionOperationsSet & RigidCcdOperationsSet & RigidBroadphaseOperationsSet;
