import { atan2, hypot } from '../math/simulation.ts';
import type { RigidAngularLimitConstraint3D, RigidAngularMotorConstraint3D, RigidAngularMotorUpdate3D, RigidAngularSwingTwistLimitConstraint3D, RigidConstraintState3D, RigidConstraintTelemetry3D, RigidDistanceConstraint3D, RigidPointConstraint3D } from "./rigid-3d.ts";

type NumericStorage = Float32Array | Float64Array;
type ConstraintRecord = RigidConstraintState3D & { aIndex: number; bIndex: number };
type StoredConstraint = ConstraintRecord & { error: number; appliedImpulse: number; saturated: boolean };
export type RigidConstraintStoreCheckpoint3D = { version: 1; capacity: number; constraints: Array<StoredConstraint | undefined>; freeHandles: number[]; activeCount: number };

// Constraint stiffness is a dimensionless authoring control. Convert it to a
// bounded angular response per second instead of asking the body to erase that
// fraction of its error in every simulation tick. The latter makes motors more
// violent as the fixed timestep gets smaller and can flip low-inertia limbs.
const MAXIMUM_ANGULAR_RESPONSE_PER_SECOND = 20;
const MAXIMUM_CORRECTION_SPEED_RADIANS_PER_SECOND = 8;

export type RigidConstraintStore3D = {
  add(definition: RigidDistanceConstraint3D): number;
  addPoint(definition: RigidPointConstraint3D): number;
  addAngularMotor(definition: RigidAngularMotorConstraint3D): number;
  addAngularLimit(definition: RigidAngularLimitConstraint3D): number;
  addAngularSwingTwistLimit(definition: RigidAngularSwingTwistLimitConstraint3D): number;
  configureAngularMotor(handleOrId: number | string, update: RigidAngularMotorUpdate3D): RigidConstraintState3D;
  remove(handleOrId: number | string): boolean;
  get(handleOrId: number | string): RigidConstraintState3D | undefined;
  telemetry(handleOrId: number | string, target: RigidConstraintTelemetry3D): RigidConstraintTelemetry3D | undefined;
  count(): number;
  checkpoint(): RigidConstraintStoreCheckpoint3D;
  restoreCheckpoint(checkpoint: Readonly<RigidConstraintStoreCheckpoint3D>): void;
  removeBody(bodyIndex: number): void;
  solve(seconds: number): void;
};

export function createRigidConstraintStore3D(options: {
  capacity: number;
  iterations: number;
  alive: Uint8Array;
  positionX: NumericStorage;
  positionY: NumericStorage;
  positionZ: NumericStorage;
  velocityX: NumericStorage;
  velocityY: NumericStorage;
  velocityZ: NumericStorage;
  rotationX: NumericStorage;
  rotationY: NumericStorage;
  rotationZ: NumericStorage;
  rotationW: NumericStorage;
  angularVelocityX: NumericStorage;
  angularVelocityY: NumericStorage;
  angularVelocityZ: NumericStorage;
  resolveBody(value: number | string): number;
  bodyHandle(index: number): number;
  activeInverseMass(index: number): number;
  applyInverseInertia(index: number, x: number, y: number, z: number, output: number[]): number[];
  applyRotationDelta(index: number, x: number, y: number, z: number): void;
  updateAabb(index: number): void;
  identifier(value: unknown, label: string): string;
  finite(value: number, label: string): number;
  nonnegative(value: number, label: string): number;
  interval(value: number, minimum: number, maximum: number, label: string): number;
  onCountChanged(count: number): void;
  onBreak(): void;
}): RigidConstraintStore3D {
  const constraints = new Array<StoredConstraint | undefined>(options.capacity);
  const handleById = new Map<string, number>();
  const freeHandles = Array.from({ length: options.capacity }, (_, index) => options.capacity - index - 1);
  const scratchA = [0, 0, 0];
  const scratchB = [0, 0, 0];
  const broken: number[] = [];
  let activeCount = 0;

  function handleFor(handleOrId: number | string): number | undefined {
    const handle = typeof handleOrId === "string" ? handleById.get(handleOrId) : handleOrId;
    return typeof handle === "number" && Number.isSafeInteger(handle) && handle >= 0 && handle < constraints.length ? handle : undefined;
  }

  function remove(handleOrId: number | string): boolean {
    const handle = handleFor(handleOrId);
    if (handle === undefined) return false;
    const item = constraints[handle];
    if (!item) return false;
    handleById.delete(item.id);
    constraints[handle] = undefined;
    freeHandles.push(handle);
    activeCount -= 1;
    options.onCountChanged(activeCount);
    return true;
  }

  function reserve(definition: RigidDistanceConstraint3D | RigidPointConstraint3D | RigidAngularMotorConstraint3D | RigidAngularLimitConstraint3D | RigidAngularSwingTwistLimitConstraint3D) {
    if (!definition || typeof definition !== "object") throw new TypeError("Constraint definition is required.");
    const id = options.identifier(definition.id, "constraint id");
    if (handleById.has(id)) throw new Error(`Constraint id ${JSON.stringify(id)} already exists.`);
    const handle = freeHandles.at(-1);
    if (handle === undefined) throw new RangeError(`Rigid constraint capacity ${options.capacity} is exhausted.`);
    const aIndex = options.resolveBody(definition.a), bIndex = options.resolveBody(definition.b);
    if (aIndex === bIndex) throw new Error("Constraint bodies must be different.");
    const stiffness = options.interval(definition.stiffness ?? 1, 0, 1, "constraint stiffness");
    const breakImpulse = "breakImpulse" in definition && definition.breakImpulse !== undefined ? options.nonnegative(definition.breakImpulse, "constraint breakImpulse") : undefined;
    return { id, handle, aIndex, bIndex, stiffness, breakImpulse };
  }

  function commit(item: ConstraintRecord) {
    const stored: StoredConstraint = Object.assign(item, { error: 0, appliedImpulse: 0, saturated: false });
    freeHandles.pop();
    constraints[stored.handle] = stored;
    handleById.set(stored.id, stored.handle);
    activeCount += 1;
    options.onCountChanged(activeCount);
    return stored.handle;
  }

  function record(item: StoredConstraint, error: number, impulse: number, saturated: boolean) { item.error = Math.max(item.error, error); item.appliedImpulse += Math.abs(impulse); item.saturated ||= saturated; }

  function vector(input: ArrayLike<number> | undefined, label: string): [number, number, number] {
    return [options.finite(input?.[0] ?? 0, `${label}[0]`), options.finite(input?.[1] ?? 0, `${label}[1]`), options.finite(input?.[2] ?? 0, `${label}[2]`)];
  }

  function quaternion(input: ArrayLike<number> | undefined, label: string): [number, number, number, number] {
    const x = options.finite(input?.[0] ?? 0, `${label}[0]`), y = options.finite(input?.[1] ?? 0, `${label}[1]`), z = options.finite(input?.[2] ?? 0, `${label}[2]`), w = options.finite(input?.[3] ?? 1, `${label}[3]`);
    const length = hypot(x, y, z, w); if (length <= 1e-12) throw new RangeError(`${label} must be non-zero.`);
    return [x / length, y / length, z / length, w / length];
  }

  function unitVector(input: ArrayLike<number>, label: string): [number, number, number] {
    const value = vector(input, label), length = hypot(value[0], value[1], value[2]);
    if (length <= 1e-12) throw new RangeError(`${label} must be non-zero.`);
    return [value[0] / length, value[1] / length, value[2] / length];
  }

  function rotate(index: number, local: readonly number[], output: number[]) {
    const qx = options.rotationX[index]!, qy = options.rotationY[index]!, qz = options.rotationZ[index]!, qw = options.rotationW[index]!;
    const x = local[0]!, y = local[1]!, z = local[2]!;
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    output[0] = x + qw * tx + (qy * tz - qz * ty);
    output[1] = y + qw * ty + (qz * tx - qx * tz);
    output[2] = z + qw * tz + (qx * ty - qy * tx);
  }

  function relativeRotation(a: number, b: number): [number, number, number, number] {
    const ax = -options.rotationX[a]!, ay = -options.rotationY[a]!, az = -options.rotationZ[a]!, aw = options.rotationW[a]!;
    const bx = options.rotationX[b]!, by = options.rotationY[b]!, bz = options.rotationZ[b]!, bw = options.rotationW[b]!;
    return quaternion([
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
      aw * bw - ax * bx - ay * by - az * bz,
    ], "relative rotation");
  }

  function angularMass(index: number, rx: number, ry: number, rz: number, nx: number, ny: number, nz: number, scratch: number[]) {
    options.applyInverseInertia(index, ry * nz - rz * ny, rz * nx - rx * nz, rx * ny - ry * nx, scratch);
    return nx * (scratch[1]! * rz - scratch[2]! * ry) + ny * (scratch[2]! * rx - scratch[0]! * rz) + nz * (scratch[0]! * ry - scratch[1]! * rx);
  }

  function applyPseudoImpulse(index: number, inverseMass: number, rx: number, ry: number, rz: number, ix: number, iy: number, iz: number, scratch: number[]) {
    options.positionX[index] += ix * inverseMass; options.positionY[index] += iy * inverseMass; options.positionZ[index] += iz * inverseMass;
    options.applyInverseInertia(index, ry * iz - rz * iy, rz * ix - rx * iz, rx * iy - ry * ix, scratch);
    options.applyRotationDelta(index, scratch[0]!, scratch[1]!, scratch[2]!);
    options.updateAabb(index);
  }

  function applyVelocityImpulse(index: number, inverseMass: number, rx: number, ry: number, rz: number, ix: number, iy: number, iz: number, scratch: number[]) {
    options.velocityX[index] += ix * inverseMass; options.velocityY[index] += iy * inverseMass; options.velocityZ[index] += iz * inverseMass;
    options.applyInverseInertia(index, ry * iz - rz * iy, rz * ix - rx * iz, rx * iy - ry * ix, scratch);
    options.angularVelocityX[index] += scratch[0]!; options.angularVelocityY[index] += scratch[1]!; options.angularVelocityZ[index] += scratch[2]!;
  }

  function solvePointVelocityAxis(item: Extract<StoredConstraint, { kind: "point" }>, a: number, b: number, inverseA: number, inverseB: number, rax: number, ray: number, raz: number, rbx: number, rby: number, rbz: number, nx: number, ny: number, nz: number) {
    if (item.damping <= 0 || item.maxImpulse <= 0) return;
    const effectiveMass = inverseA + inverseB + angularMass(a, rax, ray, raz, nx, ny, nz, scratchA) + angularMass(b, rbx, rby, rbz, nx, ny, nz, scratchB); if (effectiveMass <= 1e-12) return;
    const anchorVelocityX = options.velocityX[b]! - options.velocityX[a]! + options.angularVelocityY[b]! * rbz - options.angularVelocityZ[b]! * rby - options.angularVelocityY[a]! * raz + options.angularVelocityZ[a]! * ray;
    const anchorVelocityY = options.velocityY[b]! - options.velocityY[a]! + options.angularVelocityZ[b]! * rbx - options.angularVelocityX[b]! * rbz - options.angularVelocityZ[a]! * rax + options.angularVelocityX[a]! * raz;
    const anchorVelocityZ = options.velocityZ[b]! - options.velocityZ[a]! + options.angularVelocityX[b]! * rby - options.angularVelocityY[b]! * rbx - options.angularVelocityX[a]! * ray + options.angularVelocityY[a]! * rax;
    const relativeSpeed = anchorVelocityX * nx + anchorVelocityY * ny + anchorVelocityZ * nz;
    const impulse = Math.max(-item.maxImpulse, Math.min(item.maxImpulse, relativeSpeed * item.damping / effectiveMass)); if (Math.abs(impulse) <= 1e-12) return;
    applyVelocityImpulse(a, inverseA, rax, ray, raz, nx * impulse, ny * impulse, nz * impulse, scratchA);
    applyVelocityImpulse(b, inverseB, rbx, rby, rbz, -nx * impulse, -ny * impulse, -nz * impulse, scratchB);
  }

  function shouldBreak(item: Extract<StoredConstraint, { kind: "distance" }> | Extract<StoredConstraint, { kind: "point" }>, pseudoImpulse: number, seconds: number) {
    if (item.breakImpulse === undefined || pseudoImpulse / seconds <= item.breakImpulse) return false;
    if (!broken.includes(item.handle)) broken.push(item.handle);
    return true;
  }

  function solveDistance(item: Extract<StoredConstraint, { kind: "distance" }>, seconds: number) {
    const a = item.aIndex, b = item.bIndex;
    const dx = options.positionX[b]! - options.positionX[a]!, dy = options.positionY[b]! - options.positionY[a]!, dz = options.positionZ[b]! - options.positionZ[a]!;
    const length = hypot(dx, dy, dz); if (length <= 1e-12) return;
    const inverseA = options.activeInverseMass(a), inverseB = options.activeInverseMass(b), inverseSum = inverseA + inverseB; if (inverseSum === 0) return;
    const correction = (length - item.distance) * item.stiffness / inverseSum;
    record(item, Math.abs(length - item.distance), correction, false);
    if (shouldBreak(item, Math.abs(correction), seconds)) return;
    const nx = dx / length, ny = dy / length, nz = dz / length;
    options.positionX[a] += nx * correction * inverseA; options.positionY[a] += ny * correction * inverseA; options.positionZ[a] += nz * correction * inverseA;
    options.positionX[b] -= nx * correction * inverseB; options.positionY[b] -= ny * correction * inverseB; options.positionZ[b] -= nz * correction * inverseB;
    options.updateAabb(a); options.updateAabb(b);
  }

  function solvePoint(item: Extract<StoredConstraint, { kind: "point" }>, seconds: number) {
    const a = item.aIndex, b = item.bIndex;
    rotate(a, item.localAnchorA, scratchA); rotate(b, item.localAnchorB, scratchB);
    const rax = scratchA[0]!, ray = scratchA[1]!, raz = scratchA[2]!, rbx = scratchB[0]!, rby = scratchB[1]!, rbz = scratchB[2]!;
    const dx = options.positionX[b]! + rbx - options.positionX[a]! - rax;
    const dy = options.positionY[b]! + rby - options.positionY[a]! - ray;
    const dz = options.positionZ[b]! + rbz - options.positionZ[a]! - raz;
    const length = hypot(dx, dy, dz); if (length <= 1e-12) return;
    const nx = dx / length, ny = dy / length, nz = dz / length;
    const inverseA = options.activeInverseMass(a), inverseB = options.activeInverseMass(b);
    const effectiveMass = inverseA + inverseB + angularMass(a, rax, ray, raz, nx, ny, nz, scratchA) + angularMass(b, rbx, rby, rbz, nx, ny, nz, scratchB);
    if (effectiveMass <= 1e-12) return;
    const correction = length * item.stiffness / effectiveMass;
    record(item, length, correction, false);
    if (shouldBreak(item, correction, seconds)) return;
    applyPseudoImpulse(a, inverseA, rax, ray, raz, nx * correction, ny * correction, nz * correction, scratchA);
    applyPseudoImpulse(b, inverseB, rbx, rby, rbz, -nx * correction, -ny * correction, -nz * correction, scratchB);
    solvePointVelocityAxis(item, a, b, inverseA, inverseB, rax, ray, raz, rbx, rby, rbz, 1, 0, 0);
    solvePointVelocityAxis(item, a, b, inverseA, inverseB, rax, ray, raz, rbx, rby, rbz, 0, 1, 0);
    solvePointVelocityAxis(item, a, b, inverseA, inverseB, rax, ray, raz, rbx, rby, rbz, 0, 0, 1);
  }

  function solveAngularMotor(item: Extract<StoredConstraint, { kind: "angular-motor" }>) {
    const a = item.aIndex, b = item.bIndex, current = relativeRotation(a, b), target = item.targetRelativeRotation;
    const cx = -current[0], cy = -current[1], cz = -current[2], cw = current[3];
    let ex = target[3] * cx + target[0] * cw + target[1] * cz - target[2] * cy;
    let ey = target[3] * cy - target[0] * cz + target[1] * cw + target[2] * cx;
    let ez = target[3] * cz + target[0] * cy - target[1] * cx + target[2] * cw;
    let ew = target[3] * cw - target[0] * cx - target[1] * cy - target[2] * cz;
    if (ew < 0) { ex = -ex; ey = -ey; ez = -ez; ew = -ew; }
    const vectorLength = hypot(ex, ey, ez);
    const relativeX = options.angularVelocityX[b]! - options.angularVelocityX[a]!;
    const relativeY = options.angularVelocityY[b]! - options.angularVelocityY[a]!;
    const relativeZ = options.angularVelocityZ[b]! - options.angularVelocityZ[a]!;
    let localX: number, localY: number, localZ: number, angle: number;
    if (vectorLength > 1e-12) { localX = ex / vectorLength; localY = ey / vectorLength; localZ = ez / vectorLength; angle = 2 * atan2(vectorLength, Math.max(0, ew)); }
    else {
      const relativeLength = hypot(relativeX, relativeY, relativeZ); if (relativeLength <= 1e-12) return;
      localX = relativeX / relativeLength; localY = relativeY / relativeLength; localZ = relativeZ / relativeLength; angle = 0;
    }
    rotate(a, [localX, localY, localZ], scratchA);
    const nx = scratchA[0]!, ny = scratchA[1]!, nz = scratchA[2]!;
    options.applyInverseInertia(a, nx, ny, nz, scratchA); options.applyInverseInertia(b, nx, ny, nz, scratchB);
    const inverseAngularMass = nx * (scratchA[0]! + scratchB[0]!) + ny * (scratchA[1]! + scratchB[1]!) + nz * (scratchA[2]! + scratchB[2]!);
    if (inverseAngularMass <= 1e-12) return;
    const relativeSpeed = relativeX * nx + relativeY * ny + relativeZ * nz;
    const desiredDelta = angularCorrectionSpeed(angle, item.stiffness) - relativeSpeed * item.damping;
    const impulse = Math.max(-item.maxTorqueImpulse, Math.min(item.maxTorqueImpulse, desiredDelta / inverseAngularMass));
    record(item, angle, impulse, item.maxTorqueImpulse > 0 && Math.abs(impulse) >= item.maxTorqueImpulse - 1e-10);
    options.applyInverseInertia(a, -nx * impulse, -ny * impulse, -nz * impulse, scratchA);
    options.applyInverseInertia(b, nx * impulse, ny * impulse, nz * impulse, scratchB);
    options.angularVelocityX[a] += scratchA[0]!; options.angularVelocityY[a] += scratchA[1]!; options.angularVelocityZ[a] += scratchA[2]!;
    options.angularVelocityX[b] += scratchB[0]!; options.angularVelocityY[b] += scratchB[1]!; options.angularVelocityZ[b] += scratchB[2]!;
  }

  function solveAngularLimit(item: Extract<StoredConstraint, { kind: "angular-limit" }>) {
    const a = item.aIndex, b = item.bIndex, current = relativeRotation(a, b), reference = item.referenceRelativeRotation;
    const cx = -current[0], cy = -current[1], cz = -current[2], cw = current[3];
    let ex = reference[3] * cx + reference[0] * cw + reference[1] * cz - reference[2] * cy;
    let ey = reference[3] * cy - reference[0] * cz + reference[1] * cw + reference[2] * cx;
    let ez = reference[3] * cz + reference[0] * cy - reference[1] * cx + reference[2] * cw;
    let ew = reference[3] * cw - reference[0] * cx - reference[1] * cy - reference[2] * cz;
    if (ew < 0) { ex = -ex; ey = -ey; ez = -ez; ew = -ew; }
    const vectorLength = hypot(ex, ey, ez); if (vectorLength <= 1e-12) return;
    const angle = 2 * atan2(vectorLength, Math.max(0, ew)), excess = angle - item.maxAngleRadians; if (excess <= 0) return;
    rotate(a, [ex / vectorLength, ey / vectorLength, ez / vectorLength], scratchA);
    const nx = scratchA[0]!, ny = scratchA[1]!, nz = scratchA[2]!;
    options.applyInverseInertia(a, nx, ny, nz, scratchA); options.applyInverseInertia(b, nx, ny, nz, scratchB);
    const inverseAngularMass = nx * (scratchA[0]! + scratchB[0]!) + ny * (scratchA[1]! + scratchB[1]!) + nz * (scratchA[2]! + scratchB[2]!); if (inverseAngularMass <= 1e-12) return;
    const relativeSpeed = (options.angularVelocityX[b]! - options.angularVelocityX[a]!) * nx + (options.angularVelocityY[b]! - options.angularVelocityY[a]!) * ny + (options.angularVelocityZ[b]! - options.angularVelocityZ[a]!) * nz;
    const desiredDelta = angularCorrectionSpeed(excess, item.stiffness) - relativeSpeed * item.damping;
    const impulse = Math.max(0, Math.min(item.maxTorqueImpulse, desiredDelta / inverseAngularMass)); record(item, excess, impulse, item.maxTorqueImpulse > 0 && impulse >= item.maxTorqueImpulse - 1e-10); if (impulse <= 0) return;
    options.applyInverseInertia(a, -nx * impulse, -ny * impulse, -nz * impulse, scratchA); options.applyInverseInertia(b, nx * impulse, ny * impulse, nz * impulse, scratchB);
    options.angularVelocityX[a] += scratchA[0]!; options.angularVelocityY[a] += scratchA[1]!; options.angularVelocityZ[a] += scratchA[2]!;
    options.angularVelocityX[b] += scratchB[0]!; options.angularVelocityY[b] += scratchB[1]!; options.angularVelocityZ[b] += scratchB[2]!;
  }

  function solveAngularSwingTwistLimit(item: Extract<StoredConstraint, { kind: "angular-swing-twist-limit" }>) {
    const a = item.aIndex, b = item.bIndex, current = relativeRotation(a, b), reference = item.referenceRelativeRotation;
    let dx = reference[3] * current[0] - reference[0] * current[3] - reference[1] * current[2] + reference[2] * current[1];
    let dy = reference[3] * current[1] + reference[0] * current[2] - reference[1] * current[3] - reference[2] * current[0];
    let dz = reference[3] * current[2] - reference[0] * current[1] + reference[1] * current[0] - reference[2] * current[3];
    let dw = reference[3] * current[3] + reference[0] * current[0] + reference[1] * current[1] + reference[2] * current[2];
    if (dw < 0) { dx = -dx; dy = -dy; dz = -dz; dw = -dw; }
    const axis = item.twistAxis, projection = dx * axis[0] + dy * axis[1] + dz * axis[2], twistLength = hypot(projection, dw);
    const tx = twistLength <= 1e-12 ? 0 : axis[0] * projection / twistLength;
    const ty = twistLength <= 1e-12 ? 0 : axis[1] * projection / twistLength;
    const tz = twistLength <= 1e-12 ? 0 : axis[2] * projection / twistLength;
    const tw = twistLength <= 1e-12 ? 1 : dw / twistLength;
    let sx = -dw * tx + dx * tw - dy * tz + dz * ty;
    let sy = -dw * ty + dx * tz + dy * tw - dz * tx;
    let sz = -dw * tz - dx * ty + dy * tx + dz * tw;
    let sw = dw * tw + dx * tx + dy * ty + dz * tz;
    if (sw < 0) { sx = -sx; sy = -sy; sz = -sz; sw = -sw; }
    const swingLength = hypot(sx, sy, sz), swingAngle = 2 * atan2(swingLength, Math.max(0, sw)), swingExcess = swingAngle - item.maxSwingRadians;
    if (swingExcess > 0 && swingLength > 1e-12) solveAngularLimitAxis(item, reference, -sx / swingLength, -sy / swingLength, -sz / swingLength, swingExcess, swingExcess);
    const signedTwist = 2 * atan2(twistLength <= 1e-12 ? 0 : projection / twistLength, tw);
    const twistCorrection = signedTwist < item.minTwistRadians ? item.minTwistRadians - signedTwist : signedTwist > item.maxTwistRadians ? item.maxTwistRadians - signedTwist : 0;
    if (twistCorrection !== 0) solveAngularLimitAxis(item, reference, axis[0], axis[1], axis[2], twistCorrection, Math.abs(twistCorrection));
  }

  function solveAngularLimitAxis(item: Extract<StoredConstraint, { kind: "angular-swing-twist-limit" }>, reference: readonly number[], localX: number, localY: number, localZ: number, correction: number, error: number) {
    const qx = reference[0]!, qy = reference[1]!, qz = reference[2]!, qw = reference[3]!;
    const tx = 2 * (qy * localZ - qz * localY), ty = 2 * (qz * localX - qx * localZ), tz = 2 * (qx * localY - qy * localX);
    scratchB[0] = localX + qw * tx + qy * tz - qz * ty; scratchB[1] = localY + qw * ty + qz * tx - qx * tz; scratchB[2] = localZ + qw * tz + qx * ty - qy * tx;
    rotate(item.aIndex, scratchB, scratchA);
    const nx = scratchA[0]!, ny = scratchA[1]!, nz = scratchA[2]!;
    options.applyInverseInertia(item.aIndex, nx, ny, nz, scratchA); options.applyInverseInertia(item.bIndex, nx, ny, nz, scratchB);
    const inverseAngularMass = nx * (scratchA[0]! + scratchB[0]!) + ny * (scratchA[1]! + scratchB[1]!) + nz * (scratchA[2]! + scratchB[2]!); if (inverseAngularMass <= 1e-12) return;
    const relativeSpeed = (options.angularVelocityX[item.bIndex]! - options.angularVelocityX[item.aIndex]!) * nx + (options.angularVelocityY[item.bIndex]! - options.angularVelocityY[item.aIndex]!) * ny + (options.angularVelocityZ[item.bIndex]! - options.angularVelocityZ[item.aIndex]!) * nz;
    const desiredDelta = angularCorrectionSpeed(correction, item.stiffness) - relativeSpeed * item.damping;
    const impulse = Math.max(-item.maxTorqueImpulse, Math.min(item.maxTorqueImpulse, desiredDelta / inverseAngularMass)); record(item, error, impulse, item.maxTorqueImpulse > 0 && Math.abs(impulse) >= item.maxTorqueImpulse - 1e-10); if (impulse === 0) return;
    options.applyInverseInertia(item.aIndex, -nx * impulse, -ny * impulse, -nz * impulse, scratchA); options.applyInverseInertia(item.bIndex, nx * impulse, ny * impulse, nz * impulse, scratchB);
    options.angularVelocityX[item.aIndex] += scratchA[0]!; options.angularVelocityY[item.aIndex] += scratchA[1]!; options.angularVelocityZ[item.aIndex] += scratchA[2]!;
    options.angularVelocityX[item.bIndex] += scratchB[0]!; options.angularVelocityY[item.bIndex] += scratchB[1]!; options.angularVelocityZ[item.bIndex] += scratchB[2]!;
  }

  return {
    add(definition) {
      const reserved = reserve(definition);
      const currentDistance = hypot(options.positionX[reserved.bIndex]! - options.positionX[reserved.aIndex]!, options.positionY[reserved.bIndex]! - options.positionY[reserved.aIndex]!, options.positionZ[reserved.bIndex]! - options.positionZ[reserved.aIndex]!);
      return commit({ ...reserved, kind: "distance", a: options.bodyHandle(reserved.aIndex), b: options.bodyHandle(reserved.bIndex), distance: options.nonnegative(definition.distance ?? currentDistance, "constraint distance") });
    },
    addPoint(definition) {
      const reserved = reserve(definition);
      return commit({ ...reserved, kind: "point", a: options.bodyHandle(reserved.aIndex), b: options.bodyHandle(reserved.bIndex), localAnchorA: vector(definition.localAnchorA, "localAnchorA"), localAnchorB: vector(definition.localAnchorB, "localAnchorB"), damping: options.interval(definition.damping ?? 0, 0, 1, "point damping"), maxImpulse: options.nonnegative(definition.maxImpulse ?? 0, "point maxImpulse") });
    },
    addAngularMotor(definition) {
      const reserved = reserve(definition), target = definition.targetRelativeRotation ? quaternion(definition.targetRelativeRotation, "targetRelativeRotation") : relativeRotation(reserved.aIndex, reserved.bIndex);
      return commit({ id: reserved.id, handle: reserved.handle, aIndex: reserved.aIndex, bIndex: reserved.bIndex, kind: "angular-motor", a: options.bodyHandle(reserved.aIndex), b: options.bodyHandle(reserved.bIndex), targetRelativeRotation: target, stiffness: reserved.stiffness, damping: options.interval(definition.damping ?? 1, 0, 1, "motor damping"), maxTorqueImpulse: options.nonnegative(definition.maxTorqueImpulse ?? 100, "motor maxTorqueImpulse") });
    },
    addAngularLimit(definition) {
      const reserved = reserve(definition), reference = definition.referenceRelativeRotation ? quaternion(definition.referenceRelativeRotation, "referenceRelativeRotation") : relativeRotation(reserved.aIndex, reserved.bIndex);
      return commit({ id: reserved.id, handle: reserved.handle, aIndex: reserved.aIndex, bIndex: reserved.bIndex, kind: "angular-limit", a: options.bodyHandle(reserved.aIndex), b: options.bodyHandle(reserved.bIndex), referenceRelativeRotation: reference, maxAngleRadians: options.interval(definition.maxAngleRadians, 0, Math.PI, "limit maxAngleRadians"), stiffness: reserved.stiffness, damping: options.interval(definition.damping ?? 1, 0, 1, "limit damping"), maxTorqueImpulse: options.nonnegative(definition.maxTorqueImpulse ?? 100, "limit maxTorqueImpulse") });
    },
    addAngularSwingTwistLimit(definition) {
      const axis = unitVector(definition.twistAxis, "twistAxis"), maxSwingRadians = options.interval(definition.maxSwingRadians, 0, Math.PI, "maximum swing radians"), minTwistRadians = options.interval(definition.minTwistRadians, -Math.PI, Math.PI, "minimum twist radians"), maxTwistRadians = options.interval(definition.maxTwistRadians, -Math.PI, Math.PI, "maximum twist radians"), declaredReference = definition.referenceRelativeRotation ? quaternion(definition.referenceRelativeRotation, "referenceRelativeRotation") : undefined, damping = options.interval(definition.damping ?? 1, 0, 1, "limit damping"), maxTorqueImpulse = options.nonnegative(definition.maxTorqueImpulse ?? 100, "limit maxTorqueImpulse");
      if (minTwistRadians > maxTwistRadians) throw new RangeError("minimum twist radians must not exceed maximum twist radians.");
      const reserved = reserve(definition), reference = declaredReference ?? relativeRotation(reserved.aIndex, reserved.bIndex);
      return commit({ id: reserved.id, handle: reserved.handle, aIndex: reserved.aIndex, bIndex: reserved.bIndex, kind: "angular-swing-twist-limit", a: options.bodyHandle(reserved.aIndex), b: options.bodyHandle(reserved.bIndex), referenceRelativeRotation: reference, twistAxis: axis, maxSwingRadians, minTwistRadians, maxTwistRadians, stiffness: reserved.stiffness, damping, maxTorqueImpulse });
    },
    configureAngularMotor(handleOrId, update) {
      const handle = handleFor(handleOrId), item = handle === undefined ? undefined : constraints[handle];
      if (!item || item.kind !== "angular-motor") throw new Error(`Angular motor constraint ${JSON.stringify(handleOrId)} does not exist.`);
      if (!update || typeof update !== "object") throw new TypeError("Angular motor update is required.");
      if (update.targetRelativeRotation !== undefined) item.targetRelativeRotation = quaternion(update.targetRelativeRotation, "targetRelativeRotation");
      if (update.stiffness !== undefined) item.stiffness = options.interval(update.stiffness, 0, 1, "motor stiffness");
      if (update.damping !== undefined) item.damping = options.interval(update.damping, 0, 1, "motor damping");
      if (update.maxTorqueImpulse !== undefined) item.maxTorqueImpulse = options.nonnegative(update.maxTorqueImpulse, "motor maxTorqueImpulse");
      return { handle: item.handle, id: item.id, a: item.a, b: item.b, kind: item.kind, targetRelativeRotation: [...item.targetRelativeRotation], stiffness: item.stiffness, damping: item.damping, maxTorqueImpulse: item.maxTorqueImpulse };
    },
    remove,
    get(handleOrId) {
      const handle = handleFor(handleOrId), item = handle === undefined ? undefined : constraints[handle];
      if (!item) return undefined;
      if (item.kind === "distance") return { handle: item.handle, id: item.id, a: item.a, b: item.b, kind: item.kind, distance: item.distance, stiffness: item.stiffness, ...(item.breakImpulse === undefined ? {} : { breakImpulse: item.breakImpulse }) };
      if (item.kind === "point") return { handle: item.handle, id: item.id, a: item.a, b: item.b, kind: item.kind, localAnchorA: [...item.localAnchorA], localAnchorB: [...item.localAnchorB], stiffness: item.stiffness, damping: item.damping, maxImpulse: item.maxImpulse, ...(item.breakImpulse === undefined ? {} : { breakImpulse: item.breakImpulse }) };
      if (item.kind === "angular-motor") return { handle: item.handle, id: item.id, a: item.a, b: item.b, kind: item.kind, targetRelativeRotation: [...item.targetRelativeRotation], stiffness: item.stiffness, damping: item.damping, maxTorqueImpulse: item.maxTorqueImpulse };
      if (item.kind === "angular-limit") return { handle: item.handle, id: item.id, a: item.a, b: item.b, kind: item.kind, referenceRelativeRotation: [...item.referenceRelativeRotation], maxAngleRadians: item.maxAngleRadians, stiffness: item.stiffness, damping: item.damping, maxTorqueImpulse: item.maxTorqueImpulse };
      return { handle: item.handle, id: item.id, a: item.a, b: item.b, kind: item.kind, referenceRelativeRotation: [...item.referenceRelativeRotation], twistAxis: [...item.twistAxis], maxSwingRadians: item.maxSwingRadians, minTwistRadians: item.minTwistRadians, maxTwistRadians: item.maxTwistRadians, stiffness: item.stiffness, damping: item.damping, maxTorqueImpulse: item.maxTorqueImpulse };
    },
    telemetry(handleOrId, target) {
      if (!target || typeof target !== "object") throw new TypeError("Constraint telemetry target is required.");
      const handle = handleFor(handleOrId), item = handle === undefined ? undefined : constraints[handle]; if (!item) return undefined;
      target.handle = item.handle; target.id = item.id; target.kind = item.kind; target.error = item.error; target.appliedImpulse = item.appliedImpulse; target.saturated = item.saturated; return target;
    },
    count: () => activeCount,
    checkpoint() { return { version: 1, capacity: constraints.length, constraints: constraints.map((item) => item ? cloneStoredConstraint(item) : undefined), freeHandles: [...freeHandles], activeCount }; },
    restoreCheckpoint(checkpoint) {
      if (!checkpoint || checkpoint.version !== 1 || checkpoint.capacity !== constraints.length || checkpoint.constraints.length !== constraints.length) throw new Error("Rigid constraint checkpoint is incompatible with this store.");
      const restored = checkpoint.constraints.map((item, handle) => {
        if (!item) return undefined;
        if (item.handle !== handle || item.aIndex < 0 || item.aIndex >= options.alive.length || item.bIndex < 0 || item.bIndex >= options.alive.length || !options.alive[item.aIndex] || !options.alive[item.bIndex]) throw new Error(`Rigid constraint checkpoint handle ${handle} has invalid body topology.`);
        return cloneStoredConstraint(item);
      });
      const ids = new Set<string>(), free = new Set<number>();
      for (const item of restored) if (item) { if (ids.has(item.id)) throw new Error(`Rigid constraint checkpoint repeats id ${item.id}.`); ids.add(item.id); }
      for (const handle of checkpoint.freeHandles) { if (!Number.isSafeInteger(handle) || handle < 0 || handle >= constraints.length || restored[handle] || free.has(handle)) throw new Error("Rigid constraint checkpoint has invalid free handles."); free.add(handle); }
      const restoredCount = restored.reduce((count, item) => count + (item ? 1 : 0), 0);
      if (checkpoint.activeCount !== restoredCount || free.size + restoredCount !== constraints.length) throw new Error("Rigid constraint checkpoint counts are inconsistent.");
      constraints.splice(0, constraints.length, ...restored); handleById.clear();
      for (const item of constraints) if (item) handleById.set(item.id, item.handle);
      freeHandles.splice(0, freeHandles.length, ...checkpoint.freeHandles); broken.length = 0; activeCount = restoredCount; options.onCountChanged(activeCount);
    },
    removeBody(bodyIndex) { for (const item of constraints) if (item && (item.aIndex === bodyIndex || item.bIndex === bodyIndex)) remove(item.handle); },
    solve(seconds) {
      broken.length = 0;
      for (const item of constraints) if (item) { item.error = 0; item.appliedImpulse = 0; item.saturated = false; }
      for (let iteration = 0; iteration < options.iterations; iteration += 1) for (const item of constraints) {
        if (!item || options.alive[item.aIndex] === 0 || options.alive[item.bIndex] === 0 || broken.includes(item.handle)) continue;
        if (item.kind === "distance") solveDistance(item, seconds); else if (item.kind === "point") solvePoint(item, seconds); else if (item.kind === "angular-motor") solveAngularMotor(item); else if (item.kind === "angular-limit") solveAngularLimit(item); else solveAngularSwingTwistLimit(item);
      }
      for (const handle of broken) if (remove(handle)) options.onBreak();
    },
  };
}

function angularCorrectionSpeed(errorRadians: number, stiffness: number) {
  const requested = errorRadians * stiffness * MAXIMUM_ANGULAR_RESPONSE_PER_SECOND;
  return Math.max(-MAXIMUM_CORRECTION_SPEED_RADIANS_PER_SECOND, Math.min(MAXIMUM_CORRECTION_SPEED_RADIANS_PER_SECOND, requested));
}

function cloneStoredConstraint(item: Readonly<StoredConstraint>): StoredConstraint {
  if (item.kind === "distance") return { ...item };
  if (item.kind === "point") return { ...item, localAnchorA: [...item.localAnchorA], localAnchorB: [...item.localAnchorB] };
  if (item.kind === "angular-motor") return { ...item, targetRelativeRotation: [...item.targetRelativeRotation] };
  if (item.kind === "angular-limit") return { ...item, referenceRelativeRotation: [...item.referenceRelativeRotation] };
  return { ...item, referenceRelativeRotation: [...item.referenceRelativeRotation], twistAxis: [...item.twistAxis] };
}
