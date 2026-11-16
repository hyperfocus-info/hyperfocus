import { finiteOr as finiteNumberOr } from "@hyperfocus/utilities/math";
import { clampLowerFirst as clamp, clamp01Or as clamp01 } from "@hyperfocus/utilities/math";

import { atan2, cos, hypot, sin } from '../math/simulation.ts';
import { forceDurationMs, forceHandle, inactiveForceHandle, type MutableForce } from "./3d-force.ts";
import { groundYAt } from "./3d-overlap.ts";

export {
  colliderVerticalRange,
  collidersOverlap3D,
  groundYAt,
  isFullySubmerged,
  placeOnGround3D,
  submersionRatio,
  verticalRangesOverlap,
} from "./3d-overlap.ts";

export type Vec3Like = {
  x: number;
  y: number;
  z: number;
};

export type Vec3Tuple = readonly [number, number, number];
export type Vec3ArrayLike = ArrayLike<number>;
export type Vec3Input = Vec3Like | Vec3ArrayLike;

export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type Physics3DVerticalRange = {
  minY: number;
  maxY: number;
};

export type Physics3DSphereCollider = {
  kind: "sphere";
  center: Vec3Input;
  radius: number;
};

export type Physics3DCylinderCollider = {
  kind: "cylinder";
  center: Vec3Input;
  radius: number;
  height: number;
};

export type Physics3DBoxCollider = {
  kind: "box";
  center: Vec3Input;
  halfSize: Vec3Input;
  rotationY?: number;
};

export type Physics3DCapsuleCollider = {
  kind: "capsule";
  a: Vec3Input;
  b: Vec3Input;
  radius: number;
};

export type Physics3DCollider =
  | Physics3DSphereCollider
  | Physics3DCylinderCollider
  | Physics3DBoxCollider
  | Physics3DCapsuleCollider;

export type HeightField3D = {
  heightAt(x: number, z: number): number;
  normalAt?(x: number, z: number): Vec3Input;
};

export type Physics3DWaterVolume = {
  minY?: number;
  maxY: number;
};

export type PlaceOnGround3DOptions = {
  yOffset?: number;
  out?: Vec3;
};

export type OverTimeCallback = (ratio: number, isComplete: boolean) => boolean | void;

export type OverTimeTask = {
  readonly done: boolean;
  readonly elapsedMs: number;
  readonly durationMs: number;
  update(deltaSeconds: number): boolean;
  cancel(options?: { complete?: boolean }): void;
};

export type KinematicForce3DOptions = {
  id?: string;
  durationMs?: number;
  durationSeconds?: number;
  continuous?: boolean;
  damping?: number;
  mass?: number;
};

export type KinematicForce3DHandle = {
  readonly id: string;
  readonly active: boolean;
  cancel(): void;
};

export type KinematicCharacter3DState = {
  position: Vec3;
  velocity: Vec3;
  grounded: boolean;
  groundY: number | null;
};

export type KinematicCharacter3DOptions = {
  position?: Vec3Input;
  velocity?: Vec3Input;
  mass?: number;
  gravity?: number | Vec3Input;
  linearDamping?: number;
  maxFallSpeed?: number;
  heightField?: HeightField3D;
  groundSnap?: number;
};

export type KinematicCharacter3D = {
  readonly state: KinematicCharacter3DState;
  addForce(force: Vec3Input, options?: KinematicForce3DOptions): KinematicForce3DHandle;
  applyOverTime(durationMs: number, callback: OverTimeCallback): OverTimeTask;
  rubberBand(durationMs: number, callback: OverTimeCallback): OverTimeTask;
  step(deltaSeconds: number): KinematicCharacter3DState;
  teleport(position: Vec3Input): KinematicCharacter3DState;
  setVelocity(velocity: Vec3Input): KinematicCharacter3DState;
  cancelForce(id: string): boolean;
  clearForces(): void;
  clearTimers(options?: { complete?: boolean }): void;
};

export type Physics3DRaycastOptions = {
  maxDistance?: number;
  collisionMask?: number;
};

export type Physics3DRaycastHit = {
  point: Vec3;
  normal: Vec3;
  distance: number;
  collider?: unknown;
};

export type Physics3DRaycastBatch = {
  origins: ArrayLike<number>;
  directions: ArrayLike<number>;
  count?: number;
  maxDistance?: number | ArrayLike<number>;
  collisionMask?: number;
  hitMask: Uint8Array | number[];
  points: Float32Array | number[];
  normals: Float32Array | number[];
  distances: Float32Array | number[];
};

export type Physics3DRaycastProvider = {
  raycast(
    origin: Vec3Input,
    direction: Vec3Input,
    options?: Physics3DRaycastOptions,
    out?: Physics3DRaycastHit,
  ): Physics3DRaycastHit | null;
  raycastBatch?(batch: Physics3DRaycastBatch): number;
};

export type HeightFieldRaycast3DOptions = {
  normalSampleDistance?: number;
};

export type CharacterMotor3DPresetName = "humanoid-normal";

export type CharacterMotor3DPreset = {
  maxSpeed: number;
  acceleration: number;
  deceleration: number;
  maxTurnRate: number;
  capsuleHeight: number;
  capsuleRadius: number;
  groundSnap: number;
};

export type CharacterMotor3DResolveQuery = {
  position: Readonly<Vec3>;
  requestedDelta: Readonly<Vec3>;
  deltaSeconds: number;
};

export type CharacterMotor3DResolveResult = {
  delta: Vec3Input;
  grounded?: boolean;
  groundNormal?: Vec3Input;
};

export type CharacterMotor3DOptions = Partial<CharacterMotor3DPreset> & {
  preset?: CharacterMotor3DPresetName | CharacterMotor3DPreset;
  position?: Vec3Input;
  velocity?: Vec3Input;
  facing?: Vec3Input;
  heightField?: HeightField3D;
  stickToGround?: boolean;
  maxDeltaSeconds?: number;
  resolveDisplacement?: (query: CharacterMotor3DResolveQuery) => CharacterMotor3DResolveResult;
};

export type CharacterMotor3DState = {
  position: Vec3;
  velocity: Vec3;
  acceleration: Vec3;
  desiredVelocity: Vec3;
  facing: Vec3;
  resolvedDelta: Vec3;
  groundNormal: Vec3;
  grounded: boolean;
  turnRate: number;
};

export type CharacterMotor3D = {
  readonly preset: CharacterMotor3DPreset;
  readonly state: CharacterMotor3DState;
  move(desiredVelocity: Vec3Input): CharacterMotor3DState;
  requestRootMotion(delta: Vec3Input): CharacterMotor3DState;
  step(deltaSeconds: number): CharacterMotor3DState;
  teleport(position: Vec3Input): CharacterMotor3DState;
  setFacing(facing: Vec3Input): CharacterMotor3DState;
  reset(options?: { position?: Vec3Input; facing?: Vec3Input }): CharacterMotor3DState;
  clearRootMotion(): void;
};

export const characterMotor3DPresets: Readonly<Record<CharacterMotor3DPresetName, Readonly<CharacterMotor3DPreset>>> = Object.freeze({
  "humanoid-normal": Object.freeze({
    maxSpeed: 5,
    acceleration: 24,
    deceleration: 32,
    maxTurnRate: Math.PI * 3,
    capsuleHeight: 1.8,
    capsuleRadius: 0.35,
    groundSnap: 0.2,
  }),
});

const EPSILON = 1e-9;

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function cloneVec3(value: Vec3Input): Vec3 {
  return { x: vecX(value), y: vecY(value), z: vecZ(value) };
}

export function setVec3(out: Vec3, value: Vec3Input): Vec3 {
  out.x = vecX(value);
  out.y = vecY(value);
  out.z = vecZ(value);
  return out;
}

export function addVec3(a: Vec3Input, b: Vec3Input, out: Vec3 = vec3()): Vec3 {
  out.x = vecX(a) + vecX(b);
  out.y = vecY(a) + vecY(b);
  out.z = vecZ(a) + vecZ(b);
  return out;
}

export function scaleVec3(value: Vec3Input, scale: number, out: Vec3 = vec3()): Vec3 {
  out.x = vecX(value) * scale;
  out.y = vecY(value) * scale;
  out.z = vecZ(value) * scale;
  return out;
}

export function createHeightFieldRaycast3D(
  field: HeightField3D,
  options: HeightFieldRaycast3DOptions = {},
): Physics3DRaycastProvider {
  if (!field || typeof field.heightAt !== "function") throw new Error("height field raycast requires heightAt");
  const sampleDistance = assertPositiveFinite(options.normalSampleDistance ?? 0.05, "height field normal sample distance");
  const hit: Physics3DRaycastHit = { point: vec3(), normal: vec3(0, 1, 0), distance: 0 };
  const batchHit: Physics3DRaycastHit = { point: vec3(), normal: vec3(0, 1, 0), distance: 0 };
  const origin = vec3();
  const direction = vec3();

  function cast(
    rayOrigin: Vec3Input,
    rayDirection: Vec3Input,
    rayOptions: Physics3DRaycastOptions = {},
    out: Physics3DRaycastHit = hit,
  ) {
    const ox = vecX(rayOrigin);
    const oy = vecY(rayOrigin);
    const oz = vecZ(rayOrigin);
    const dx = vecX(rayDirection);
    const dy = vecY(rayDirection);
    const dz = vecZ(rayDirection);
    const length = hypot(dx, dy, dz);
    if (length <= EPSILON) throw new Error("3D ray direction must have non-zero length");
    const nx = dx / length;
    const ny = dy / length;
    const nz = dz / length;
    // Height fields provide an exact, allocation-free ground query for vertical rays.
    // General scene adapters can implement arbitrary ray directions behind the same contract.
    if (Math.abs(nx) > 1e-6 || Math.abs(nz) > 1e-6 || Math.abs(ny) <= EPSILON) return null;
    const groundY = assertFinite(field.heightAt(ox, oz), "height field raycast height");
    const distance = (groundY - oy) / ny;
    const maxDistance = raycastMaxDistance(rayOptions.maxDistance);
    if (distance < 0 || distance > maxDistance) return null;

    out.point.x = ox;
    out.point.y = groundY;
    out.point.z = oz;
    out.distance = distance;
    resolveHeightFieldNormal(field, ox, oz, sampleDistance, out.normal);
    out.collider = field;
    return out;
  }

  return {
    raycast: cast,
    raycastBatch(batch) {
      const count = validateRaycastBatch(batch);
      let hits = 0;
      for (let index = 0; index < count; index += 1) {
        const offset = index * 3;
        origin.x = assertFinite(batch.origins[offset], `raycast batch origin ${index} x`);
        origin.y = assertFinite(batch.origins[offset + 1], `raycast batch origin ${index} y`);
        origin.z = assertFinite(batch.origins[offset + 2], `raycast batch origin ${index} z`);
        direction.x = assertFinite(batch.directions[offset], `raycast batch direction ${index} x`);
        direction.y = assertFinite(batch.directions[offset + 1], `raycast batch direction ${index} y`);
        direction.z = assertFinite(batch.directions[offset + 2], `raycast batch direction ${index} z`);
        const result = cast(origin, direction, {
          maxDistance: batchMaxDistance(batch.maxDistance, index),
          collisionMask: batch.collisionMask,
        }, batchHit);
        batch.hitMask[index] = result ? 1 : 0;
        if (!result) {
          batch.distances[index] = Number.POSITIVE_INFINITY;
          batch.points[offset] = Number.NaN;
          batch.points[offset + 1] = Number.NaN;
          batch.points[offset + 2] = Number.NaN;
          batch.normals[offset] = 0;
          batch.normals[offset + 1] = 0;
          batch.normals[offset + 2] = 0;
          continue;
        }
        hits += 1;
        batch.distances[index] = result.distance;
        batch.points[offset] = result.point.x;
        batch.points[offset + 1] = result.point.y;
        batch.points[offset + 2] = result.point.z;
        batch.normals[offset] = result.normal.x;
        batch.normals[offset + 1] = result.normal.y;
        batch.normals[offset + 2] = result.normal.z;
      }
      return hits;
    },
  };
}

export function raycastBatch3D(provider: Physics3DRaycastProvider, batch: Physics3DRaycastBatch): number {
  const count = validateRaycastBatch(batch);
  if (provider.raycastBatch) return provider.raycastBatch(batch);
  const origin = vec3();
  const direction = vec3();
  const hit: Physics3DRaycastHit = { point: vec3(), normal: vec3(), distance: 0 };
  let hits = 0;
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    origin.x = assertFinite(batch.origins[offset], `raycast batch origin ${index} x`);
    origin.y = assertFinite(batch.origins[offset + 1], `raycast batch origin ${index} y`);
    origin.z = assertFinite(batch.origins[offset + 2], `raycast batch origin ${index} z`);
    direction.x = assertFinite(batch.directions[offset], `raycast batch direction ${index} x`);
    direction.y = assertFinite(batch.directions[offset + 1], `raycast batch direction ${index} y`);
    direction.z = assertFinite(batch.directions[offset + 2], `raycast batch direction ${index} z`);
    const result = provider.raycast(origin, direction, {
      maxDistance: batchMaxDistance(batch.maxDistance, index),
      collisionMask: batch.collisionMask,
    }, hit);
    batch.hitMask[index] = result ? 1 : 0;
    if (!result) {
      batch.distances[index] = Number.POSITIVE_INFINITY;
      batch.points[offset] = Number.NaN;
      batch.points[offset + 1] = Number.NaN;
      batch.points[offset + 2] = Number.NaN;
      batch.normals[offset] = 0;
      batch.normals[offset + 1] = 0;
      batch.normals[offset + 2] = 0;
      continue;
    }
    hits += 1;
    batch.distances[index] = result.distance;
    batch.points[offset] = result.point.x;
    batch.points[offset + 1] = result.point.y;
    batch.points[offset + 2] = result.point.z;
    batch.normals[offset] = result.normal.x;
    batch.normals[offset + 1] = result.normal.y;
    batch.normals[offset + 2] = result.normal.z;
  }
  return hits;
}

export function createCharacterMotor3D(options: CharacterMotor3DOptions = {}): CharacterMotor3D {
  const basePreset = typeof options.preset === "object"
    ? options.preset
    : characterMotor3DPresets[options.preset ?? "humanoid-normal"];
  const preset: CharacterMotor3DPreset = {
    maxSpeed: assertNonNegativeFinite(options.maxSpeed ?? basePreset.maxSpeed, "character motor maxSpeed"),
    acceleration: assertNonNegativeFinite(options.acceleration ?? basePreset.acceleration, "character motor acceleration"),
    deceleration: assertNonNegativeFinite(options.deceleration ?? basePreset.deceleration, "character motor deceleration"),
    maxTurnRate: assertNonNegativeFinite(options.maxTurnRate ?? basePreset.maxTurnRate, "character motor maxTurnRate"),
    capsuleHeight: assertPositiveFinite(options.capsuleHeight ?? basePreset.capsuleHeight, "character motor capsuleHeight"),
    capsuleRadius: assertPositiveFinite(options.capsuleRadius ?? basePreset.capsuleRadius, "character motor capsuleRadius"),
    groundSnap: assertNonNegativeFinite(options.groundSnap ?? basePreset.groundSnap, "character motor groundSnap"),
  };
  if (preset.capsuleHeight < preset.capsuleRadius * 2) {
    throw new Error("character motor capsuleHeight must be at least twice capsuleRadius");
  }
  const maxDeltaSeconds = assertPositiveFinite(options.maxDeltaSeconds ?? 0.1, "character motor maxDeltaSeconds");
  const position = cloneVec3(options.position ?? [0, 0, 0]);
  const motorVelocity = cloneVec3(options.velocity ?? [0, 0, 0]);
  clampVec3Length(motorVelocity, preset.maxSpeed, motorVelocity);
  const facing = horizontalDirection(options.facing ?? [0, 0, 1], vec3(0, 0, 1));
  const desiredVelocity = vec3();
  const pendingRootMotion = vec3();
  const priorVelocity = cloneVec3(motorVelocity);
  const requestDelta = vec3();
  const actualDelta = vec3();
  const state: CharacterMotor3DState = {
    position,
    velocity: cloneVec3(motorVelocity),
    acceleration: vec3(),
    desiredVelocity,
    facing,
    resolvedDelta: vec3(),
    groundNormal: vec3(0, 1, 0),
    grounded: false,
    turnRate: 0,
  };
  const stickToGround = options.stickToGround ?? true;

  function move(value: Vec3Input) {
    setVec3(desiredVelocity, value);
    clampVec3Length(desiredVelocity, preset.maxSpeed, desiredVelocity);
    return state;
  }

  function step(deltaSeconds: number) {
    const dt = Math.min(assertNonNegativeFinite(deltaSeconds, "character motor deltaSeconds"), maxDeltaSeconds);
    setVec3(priorVelocity, state.velocity);
    const changingSpeed = vectorLengthSquared(desiredVelocity) + EPSILON < vectorLengthSquared(motorVelocity);
    approachVec3(motorVelocity, desiredVelocity, (changingSpeed ? preset.deceleration : preset.acceleration) * dt);

    requestDelta.x = motorVelocity.x * dt + pendingRootMotion.x;
    requestDelta.y = motorVelocity.y * dt + pendingRootMotion.y;
    requestDelta.z = motorVelocity.z * dt + pendingRootMotion.z;
    setVec3(actualDelta, requestDelta);
    state.grounded = false;
    state.groundNormal.x = 0;
    state.groundNormal.y = 1;
    state.groundNormal.z = 0;

    if (options.resolveDisplacement) {
      const resolved = options.resolveDisplacement({ position: state.position, requestedDelta: requestDelta, deltaSeconds: dt });
      if (!resolved || !resolved.delta) throw new Error("character motor displacement resolver must return a delta");
      setVec3(actualDelta, resolved.delta);
      state.grounded = Boolean(resolved.grounded);
      if (resolved.groundNormal) normalizeVec3(resolved.groundNormal, state.groundNormal, [0, 1, 0]);
    }

    const previousPositionY = state.position.y;
    state.position.x += actualDelta.x;
    state.position.y += actualDelta.y;
    state.position.z += actualDelta.z;
    if (options.heightField && stickToGround) {
      state.position.y = groundYAt(options.heightField, state.position.x, state.position.z);
      actualDelta.y = state.position.y - previousPositionY;
      state.grounded = true;
      resolveHeightFieldNormal(options.heightField, state.position.x, state.position.z, 0.05, state.groundNormal);
    }

    setVec3(state.resolvedDelta, actualDelta);
    if (dt > 0) {
      state.velocity.x = actualDelta.x / dt;
      state.velocity.y = actualDelta.y / dt;
      state.velocity.z = actualDelta.z / dt;
      state.acceleration.x = (state.velocity.x - priorVelocity.x) / dt;
      state.acceleration.y = (state.velocity.y - priorVelocity.y) / dt;
      state.acceleration.z = (state.velocity.z - priorVelocity.z) / dt;
    } else {
      setVec3(state.velocity, motorVelocity);
      setVec3(state.acceleration, [0, 0, 0]);
    }

    const desiredFacing = horizontalDirection(
      vectorLengthSquared(desiredVelocity) > EPSILON ? desiredVelocity : state.velocity,
      state.facing,
    );
    state.turnRate = rotateFacingToward(state.facing, desiredFacing, preset.maxTurnRate, dt);
    pendingRootMotion.x = 0;
    pendingRootMotion.y = 0;
    pendingRootMotion.z = 0;
    return state;
  }

  return {
    preset,
    state,
    move,
    requestRootMotion(delta) {
      pendingRootMotion.x += vecX(delta);
      pendingRootMotion.y += vecY(delta);
      pendingRootMotion.z += vecZ(delta);
      return state;
    },
    step,
    teleport(value) {
      setVec3(state.position, value);
      return state;
    },
    setFacing(value) {
      horizontalDirection(value, state.facing, state.facing);
      return state;
    },
    reset(resetOptions = {}) {
      if (resetOptions.position) setVec3(state.position, resetOptions.position);
      if (resetOptions.facing) horizontalDirection(resetOptions.facing, state.facing, state.facing);
      motorVelocity.x = 0;
      motorVelocity.y = 0;
      motorVelocity.z = 0;
      desiredVelocity.x = 0;
      desiredVelocity.y = 0;
      desiredVelocity.z = 0;
      priorVelocity.x = 0;
      priorVelocity.y = 0;
      priorVelocity.z = 0;
      state.velocity.x = 0;
      state.velocity.y = 0;
      state.velocity.z = 0;
      state.acceleration.x = 0;
      state.acceleration.y = 0;
      state.acceleration.z = 0;
      state.resolvedDelta.x = 0;
      state.resolvedDelta.y = 0;
      state.resolvedDelta.z = 0;
      state.turnRate = 0;
      pendingRootMotion.x = 0;
      pendingRootMotion.y = 0;
      pendingRootMotion.z = 0;
      return state;
    },
    clearRootMotion() {
      pendingRootMotion.x = 0;
      pendingRootMotion.y = 0;
      pendingRootMotion.z = 0;
    },
  };
}

function resolveHeightFieldNormal(field: HeightField3D, x: number, z: number, sampleDistance: number, out: Vec3) {
  if (field.normalAt) return normalizeVec3(field.normalAt(x, z), out, [0, 1, 0]);
  const left = assertFinite(field.heightAt(x - sampleDistance, z), "height field left sample");
  const right = assertFinite(field.heightAt(x + sampleDistance, z), "height field right sample");
  const back = assertFinite(field.heightAt(x, z - sampleDistance), "height field back sample");
  const front = assertFinite(field.heightAt(x, z + sampleDistance), "height field front sample");
  out.x = left - right;
  out.y = sampleDistance * 2;
  out.z = back - front;
  return normalizeVec3(out, out, [0, 1, 0]);
}

function validateRaycastBatch(batch: Physics3DRaycastBatch) {
  if (!batch || typeof batch !== "object") throw new Error("3D raycast batch is required");
  const inferredCount = Math.min(Math.floor(batch.origins.length / 3), Math.floor(batch.directions.length / 3));
  const count = batch.count === undefined ? inferredCount : assertSafeCount(batch.count, "3D raycast batch count");
  if (batch.origins.length < count * 3 || batch.directions.length < count * 3) {
    throw new Error("3D raycast batch input arrays are shorter than count");
  }
  if (batch.hitMask.length < count || batch.distances.length < count || batch.points.length < count * 3 || batch.normals.length < count * 3) {
    throw new Error("3D raycast batch output arrays are shorter than count");
  }
  if (typeof batch.maxDistance !== "number" && batch.maxDistance !== undefined && batch.maxDistance.length < count) {
    throw new Error("3D raycast batch maxDistance array is shorter than count");
  }
  if (batch.collisionMask !== undefined && (!Number.isSafeInteger(batch.collisionMask) || batch.collisionMask < 0)) {
    throw new Error("3D raycast collisionMask must be a non-negative safe integer");
  }
  return count;
}

function batchMaxDistance(value: number | ArrayLike<number> | undefined, index: number) {
  return raycastMaxDistance(typeof value === "number" || value === undefined ? value : value[index]);
}

function raycastMaxDistance(value: number | undefined) {
  if (value === undefined) return Number.POSITIVE_INFINITY;
  const distance = Number(value);
  if (distance === Number.POSITIVE_INFINITY) return distance;
  return assertNonNegativeFinite(distance, "3D raycast maxDistance");
}

function assertSafeCount(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label} must be a non-negative safe integer`);
  return number;
}

function assertPositiveFinite(value: unknown, label: string) {
  const number = assertFinite(value, label);
  if (number <= 0) throw new Error(`${label} must be greater than zero`);
  return number;
}

function assertNonNegativeFinite(value: unknown, label: string) {
  const number = assertFinite(value, label);
  if (number < 0) throw new Error(`${label} must be non-negative`);
  return number;
}

function vectorLengthSquared(value: Vec3Input) {
  const x = vecX(value);
  const y = vecY(value);
  const z = vecZ(value);
  return x * x + y * y + z * z;
}

function normalizeVec3(value: Vec3Input, out: Vec3, fallback: Vec3Input) {
  const x = vecX(value);
  const y = vecY(value);
  const z = vecZ(value);
  const length = hypot(x, y, z);
  if (length <= EPSILON) return setVec3(out, fallback);
  out.x = x / length;
  out.y = y / length;
  out.z = z / length;
  return out;
}

function clampVec3Length(value: Vec3Input, maxLength: number, out: Vec3) {
  const x = vecX(value);
  const y = vecY(value);
  const z = vecZ(value);
  const length = hypot(x, y, z);
  if (length <= maxLength || length <= EPSILON) {
    out.x = x;
    out.y = y;
    out.z = z;
    return out;
  }
  const scale = maxLength / length;
  out.x = x * scale;
  out.y = y * scale;
  out.z = z * scale;
  return out;
}

function approachVec3(current: Vec3, target: Vec3Input, maxDelta: number) {
  const dx = vecX(target) - current.x;
  const dy = vecY(target) - current.y;
  const dz = vecZ(target) - current.z;
  const distance = hypot(dx, dy, dz);
  if (distance <= maxDelta || distance <= EPSILON) return setVec3(current, target);
  const scale = maxDelta / distance;
  current.x += dx * scale;
  current.y += dy * scale;
  current.z += dz * scale;
  return current;
}

function horizontalDirection(value: Vec3Input, fallback: Vec3Input, out: Vec3 = vec3()) {
  const x = vecX(value);
  const z = vecZ(value);
  const length = hypot(x, z);
  if (length <= EPSILON) {
    const fallbackX = vecX(fallback);
    const fallbackZ = vecZ(fallback);
    const fallbackLength = hypot(fallbackX, fallbackZ);
    out.x = fallbackLength <= EPSILON ? 0 : fallbackX / fallbackLength;
    out.y = 0;
    out.z = fallbackLength <= EPSILON ? 1 : fallbackZ / fallbackLength;
    return out;
  }
  out.x = x / length;
  out.y = 0;
  out.z = z / length;
  return out;
}

function rotateFacingToward(current: Vec3, desired: Vec3Input, maxTurnRate: number, dt: number) {
  if (dt <= 0 || maxTurnRate <= 0) return 0;
  const targetX = vecX(desired);
  const targetZ = vecZ(desired);
  const cross = current.x * targetZ - current.z * targetX;
  const dot = clamp(current.x * targetX + current.z * targetZ, -1, 1);
  const angle = atan2(cross, dot);
  const applied = clamp(angle, -maxTurnRate * dt, maxTurnRate * dt);
  const cosine = cos(applied);
  const sine = sin(applied);
  const x = current.x * cosine - current.z * sine;
  const z = current.x * sine + current.z * cosine;
  current.x = x;
  current.y = 0;
  current.z = z;
  normalizeVec3(current, current, [0, 0, 1]);
  return applied / dt;
}

export function applyOverTime(durationMs: number, callback: OverTimeCallback): OverTimeTask {
  const safeDurationMs = Math.max(0, finiteOr(durationMs, 0));
  let elapsedMs = 0;
  let done = false;

  function finish() {
    if (done) return;
    done = true;
    elapsedMs = safeDurationMs;
    callback(1, true);
  }

  return {
    get done() {
      return done;
    },
    get elapsedMs() {
      return elapsedMs;
    },
    durationMs: safeDurationMs,
    update(deltaSeconds) {
      if (done) return true;
      elapsedMs = Math.min(safeDurationMs, elapsedMs + Math.max(0, finiteOr(deltaSeconds, 0)) * 1000);
      const ratio = safeDurationMs <= 0 ? 1 : clamp01(elapsedMs / safeDurationMs);
      if (ratio >= 1) {
        done = true;
        callback(1, true);
        return true;
      }
      if (callback(ratio, false)) finish();
      return done;
    },
    cancel(options = {}) {
      if (done) return;
      if (options.complete) finish();
      else done = true;
    }
  };
}

export function rubberBand(durationMs: number, callback: OverTimeCallback): OverTimeTask {
  const safeDurationMs = Math.max(0, finiteOr(durationMs, 0));
  const halfMs = safeDurationMs * 0.5;
  let elapsedMs = 0;
  let done = false;

  function complete() {
    if (done) return;
    done = true;
    elapsedMs = safeDurationMs;
    callback(0, true);
  }

  return {
    get done() {
      return done;
    },
    get elapsedMs() {
      return elapsedMs;
    },
    durationMs: safeDurationMs,
    update(deltaSeconds) {
      if (done) return true;
      elapsedMs = Math.min(safeDurationMs, elapsedMs + Math.max(0, finiteOr(deltaSeconds, 0)) * 1000);
      let ratio: number;
      if (safeDurationMs <= 0) {
        ratio = 0;
      } else if (elapsedMs <= halfMs || halfMs <= 0) {
        ratio = halfMs <= 0 ? 1 : clamp01(elapsedMs / halfMs);
      } else {
        ratio = 1 - clamp01((elapsedMs - halfMs) / Math.max(EPSILON, safeDurationMs - halfMs));
      }
      if (elapsedMs >= safeDurationMs) {
        done = true;
        callback(0, true);
        return true;
      }
      if (callback(ratio, false)) complete();
      return done;
    },
    cancel(options = {}) {
      if (done) return;
      if (options.complete) complete();
      else done = true;
    }
  };
}

export function createKinematicCharacter3D(options: KinematicCharacter3DOptions = {}): KinematicCharacter3D {
  const state: KinematicCharacter3DState = {
    position: cloneVec3(options.position ?? [0, 0, 0]),
    velocity: cloneVec3(options.velocity ?? [0, 0, 0]),
    grounded: false,
    groundY: null
  };
  const mass = Math.max(EPSILON, finiteOr(options.mass, 1));
  const gravity = resolveGravity(options.gravity);
  const activeForces: MutableForce[] = [];
  const timers: OverTimeTask[] = [];
  let nextForceId = 1;

  function removeInactiveForces() {
    for (let i = activeForces.length - 1; i >= 0; i -= 1) {
      if (!activeForces[i].active) activeForces.splice(i, 1);
    }
  }

  function addForce(force: Vec3Input, forceOptions: KinematicForce3DOptions = {}) {
    const forceMass = Math.max(EPSILON, finiteOr(forceOptions.mass, mass));
    const vector = cloneVec3(force);
    const durationMs = forceDurationMs(forceOptions);
    const continuous = Boolean(forceOptions.continuous || durationMs > 0);
    if (!continuous) {
      state.velocity.x += vector.x / forceMass;
      state.velocity.y += vector.y / forceMass;
      state.velocity.z += vector.z / forceMass;
      return inactiveForceHandle(forceOptions.id ?? `force-${nextForceId++}`);
    }

    const entry: MutableForce = {
      id: forceOptions.id ?? `force-${nextForceId++}`,
      vector,
      remainingMs: durationMs,
      continuous,
      damping: Math.max(0, finiteOr(forceOptions.damping, 0)),
      mass: forceMass,
      active: true
    };
    activeForces.push(entry);
    return forceHandle(entry);
  }

  function step(deltaSeconds: number) {
    const dt = Math.max(0, finiteOr(deltaSeconds, 0));
    for (const timer of timers) timer.update(dt);
    for (let i = timers.length - 1; i >= 0; i -= 1) {
      if (timers[i].done) timers.splice(i, 1);
    }

    if (dt > 0) {
      state.velocity.x += gravity.x * dt;
      state.velocity.y += gravity.y * dt;
      state.velocity.z += gravity.z * dt;

      for (const force of activeForces) {
        if (!force.active) continue;
        state.velocity.x += (force.vector.x / force.mass) * dt;
        state.velocity.y += (force.vector.y / force.mass) * dt;
        state.velocity.z += (force.vector.z / force.mass) * dt;
        if (force.damping > 0) {
          const keep = Math.exp(-force.damping * dt);
          force.vector.x *= keep;
          force.vector.y *= keep;
          force.vector.z *= keep;
        }
        if (Number.isFinite(force.remainingMs)) {
          force.remainingMs -= dt * 1000;
          if (force.remainingMs <= 0) force.active = false;
        }
      }
      removeInactiveForces();

      const damping = Math.max(0, finiteOr(options.linearDamping, 0));
      if (damping > 0) {
        const keep = Math.exp(-damping * dt);
        state.velocity.x *= keep;
        state.velocity.y *= keep;
        state.velocity.z *= keep;
      }
      if (options.maxFallSpeed !== undefined && state.velocity.y < -Math.abs(options.maxFallSpeed)) {
        state.velocity.y = -Math.abs(options.maxFallSpeed);
      }

      state.position.x += state.velocity.x * dt;
      state.position.y += state.velocity.y * dt;
      state.position.z += state.velocity.z * dt;
    }

    const field = options.heightField;
    if (field) {
      const groundY = groundYAt(field, state.position.x, state.position.z);
      state.groundY = groundY;
      const snap = Math.max(0, finiteOr(options.groundSnap, 0));
      if (state.position.y <= groundY + snap && state.velocity.y <= 0) {
        state.position.y = groundY;
        state.velocity.y = 0;
        state.grounded = true;
      } else {
        state.grounded = false;
      }
    } else {
      state.groundY = null;
      state.grounded = false;
    }

    return state;
  }

  return {
    state,
    addForce,
    applyOverTime(durationMs, callback) {
      const task = applyOverTime(durationMs, callback);
      timers.push(task);
      return task;
    },
    rubberBand(durationMs, callback) {
      const task = rubberBand(durationMs, callback);
      timers.push(task);
      return task;
    },
    step,
    teleport(position) {
      setVec3(state.position, position);
      return state;
    },
    setVelocity(velocity) {
      setVec3(state.velocity, velocity);
      return state;
    },
    cancelForce(id) {
      const force = activeForces.find((entry) => entry.id === id && entry.active);
      if (!force) return false;
      force.active = false;
      removeInactiveForces();
      return true;
    },
    clearForces() {
      for (const force of activeForces) force.active = false;
      activeForces.length = 0;
    },
    clearTimers(clearOptions = {}) {
      for (const timer of timers) timer.cancel(clearOptions);
      timers.length = 0;
    }
  };
}

function resolveGravity(gravity: number | Vec3Input | undefined): Vec3 {
  if (gravity === undefined) return vec3(0, 0, 0);
  if (typeof gravity === "number") return vec3(0, -Math.abs(finiteOr(gravity, 0)), 0);
  return cloneVec3(gravity);
}

function vecX(value: Vec3Input) {
  return isVec3Tuple(value) ? assertFinite(value[0], "vec3 x") : assertFinite(value.x, "vec3 x");
}

function vecY(value: Vec3Input) {
  return isVec3Tuple(value) ? assertFinite(value[1], "vec3 y") : assertFinite(value.y, "vec3 y");
}

function vecZ(value: Vec3Input) {
  return isVec3Tuple(value) ? assertFinite(value[2], "vec3 z") : assertFinite(value.z, "vec3 z");
}

function isVec3Tuple(value: Vec3Input): value is Vec3ArrayLike {
  return Array.isArray(value) || ArrayBuffer.isView(value);
}

function finiteOr(value: unknown, fallback: number) { return finiteNumberOr(Number(value), fallback); }

function assertFinite(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
  return number;
}




export { capsuleIntersectsSphere3D, capsuleIntersectsBox3D, capsuleIntersectsTriangle3D } from './collision3d/capsule.ts';
export { createStaticTriangleQueries3D, createHeightfieldQueries3D } from './collision3d/static-mesh.ts';
