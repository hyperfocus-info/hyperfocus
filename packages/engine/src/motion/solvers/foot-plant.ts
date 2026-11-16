import type { Physics3DRaycastHit, Physics3DRaycastProvider } from "../../physics/3d.ts";
import { normalizeGaitPhase } from "../humanoid/gait-recipe.ts";
import type { MutableMotionVector } from "../math.ts";

export type FootPlantSolverOptions = {
  ground: Physics3DRaycastProvider;
  stanceRatio?: number;
  rayHeight?: number;
  rayDistance?: number;
  soleOffset?: number;
  maxAnchorDistance?: number;
  /** Critical response used to absorb discontinuous terrain height under a swinging foot. */
  swingTargetResponse?: number;
  /** Maximum vertical gap that may become a planted touchdown. */
  touchdownTolerance?: number;
};

export type FootPlantQuery = {
  phase: number;
  /** Optional per-frame gait override used when pace changes continuously. */
  stanceRatio?: number;
  proposedWorld: ArrayLike<number>;
  swingLift?: number;
  /** False while the character is airborne. Terrain sampling and constraints are bypassed. */
  grounded?: boolean;
  /** False while locomotion is blending in and no stable stance anchor exists yet. */
  allowPlant?: boolean;
  /** Omit to preserve immediate stateless sampling for one-shot tooling. */
  deltaSeconds?: number;
  /** Horizontal ankle-to-toe probe used to keep the whole foot above terrain. */
  soleForwardX?: number;
  soleForwardZ?: number;
  soleLength?: number;
};

export type FootPlantResult = {
  readonly targetWorld: MutableMotionVector;
  readonly groundNormal: MutableMotionVector;
  readonly anchorWorld: MutableMotionVector;
  planted: boolean;
  hit: boolean;
};

export type FootPlantSolver = {
  readonly result: FootPlantResult;
  update(query: FootPlantQuery): FootPlantResult;
  /** Ends an impossible stance and prevents replanting until the next gait cycle. */
  release(): void;
  reset(): void;
};

export function createFootPlantSolver(options: FootPlantSolverOptions): FootPlantSolver {
  if (!options.ground || typeof options.ground.raycast !== "function") throw new Error("foot plant solver requires a ground raycast provider");
  const stanceRatio = finiteRange(options.stanceRatio ?? 0.55, 0.05, 0.95, "foot plant stanceRatio");
  const rayHeight = positiveFinite(options.rayHeight ?? 0.65, "foot plant rayHeight");
  const rayDistance = positiveFinite(options.rayDistance ?? 1.5, "foot plant rayDistance");
  const soleOffset = finiteNumber(options.soleOffset ?? 0.015, "foot plant soleOffset");
  const maxAnchorDistance = positiveFinite(options.maxAnchorDistance ?? 1.25, "foot plant maxAnchorDistance");
  const swingTargetResponse = positiveFinite(options.swingTargetResponse ?? 24, "foot plant swingTargetResponse");
  const touchdownTolerance = positiveFinite(options.touchdownTolerance ?? .025, "foot plant touchdownTolerance");
  const rayOrigin = { x: 0, y: 0, z: 0 };
  const rayDirection = { x: 0, y: -1, z: 0 };
  const rayHit: Physics3DRaycastHit = {
    point: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 1, z: 0 },
    distance: 0,
  };
  const soleHit: Physics3DRaycastHit = {
    point: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 1, z: 0 },
    distance: 0,
  };
  const supportHit: Physics3DRaycastHit = {
    point: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 1, z: 0 },
    distance: 0,
  };
  const soleProbe = new Float32Array(3);
  const result: FootPlantResult = {
    targetWorld: new Float32Array(3),
    groundNormal: new Float32Array([0, 1, 0]),
    anchorWorld: new Float32Array(3),
    planted: false,
    hit: false,
  };
  const anchorNormal = new Float32Array([0, 1, 0]);
  const swingVelocity = new Float32Array(2);
  let swingGroundHeight = 0;
  let swingGroundVelocity = 0;
  let swingLiftHeight = 0;
  let swingLiftVelocity = 0;
  let swingTargetInitialized = false;
  let wasInSwing = false;
  let suppressPlantUntilSwing = false;
  let pendingTouchdown = false;

  function sampleGround(proposed: ArrayLike<number>, out: Physics3DRaycastHit) {
    assertVector(proposed, "foot plant proposedWorld");
    rayOrigin.x = proposed[0];
    rayOrigin.y = proposed[1] + rayHeight;
    rayOrigin.z = proposed[2];
    return options.ground.raycast(rayOrigin, rayDirection, { maxDistance: rayDistance }, out);
  }

  function sampleSoleGround(proposed: ArrayLike<number>, forwardX = 0, forwardZ = 0, soleLength = 0) {
    const ankle = sampleGround(proposed, rayHit);
    const forwardMagnitude = Math.hypot(forwardX, forwardZ);
    let toe: Physics3DRaycastHit | null = null;
    if (soleLength > 0 && forwardMagnitude > 1e-8) {
      soleProbe[0] = proposed[0]! + forwardX / forwardMagnitude * soleLength;
      soleProbe[1] = proposed[1]!;
      soleProbe[2] = proposed[2]! + forwardZ / forwardMagnitude * soleLength;
      toe = sampleGround(soleProbe, soleHit);
    }
    const selected = toe && (!ankle || toe.point.y > ankle.point.y) ? toe : ankle;
    if (!selected) return null;
    supportHit.point.x = proposed[0]!;
    supportHit.point.y = selected.point.y;
    supportHit.point.z = proposed[2]!;
    supportHit.normal.x = selected.normal.x;
    supportHit.normal.y = selected.normal.y;
    supportHit.normal.z = selected.normal.z;
    supportHit.distance = selected.distance;
    supportHit.collider = selected.collider;
    return supportHit;
  }

  function writeSwingTarget(x: number, groundY: number, z: number, lift: number, deltaSeconds: number) {
    if (!swingTargetInitialized || deltaSeconds <= 0) {
      result.targetWorld[0] = x;
      result.targetWorld[2] = z;
      swingGroundHeight = groundY;
      swingLiftHeight = lift;
      swingVelocity.fill(0);
      swingGroundVelocity = 0;
      swingLiftVelocity = 0;
      swingTargetInitialized = true;
    } else {
      writeSwingHorizontal(x, z, deltaSeconds);
      writeSwingVertical(groundY, lift, deltaSeconds);
    }
    // The authored swing arc is already C1-continuous and reaches zero at
    // touchdown. Only the discontinuous sampled terrain base is damped.
    result.targetWorld[1] = swingGroundHeight + swingLiftHeight;
  }

  function writeSwingHorizontal(x: number, z: number, deltaSeconds: number) {
    const decay = Math.exp(-swingTargetResponse * deltaSeconds);
    for (let axis = 0; axis < 2; axis += 1) {
      const outputAxis = axis === 0 ? 0 : 2, target = axis === 0 ? x : z;
      const error = result.targetWorld[outputAxis]! - target;
      const impulse = (swingVelocity[axis]! + swingTargetResponse * error) * deltaSeconds;
      result.targetWorld[outputAxis] = target + (error + impulse) * decay;
      swingVelocity[axis] = (swingVelocity[axis]! - swingTargetResponse * impulse) * decay;
    }
  }

  function writeSwingVertical(groundY: number, lift: number, deltaSeconds: number) {
    const decay = Math.exp(-swingTargetResponse * deltaSeconds);
    if (groundY > swingGroundHeight) {
      // Terrain is a unilateral constraint: smoothing upward through a step
      // means the visible sole spends several frames inside it. Resolve height
      // at the already-filtered horizontal target so this hard constraint does
      // not teleport a lagging foot to terrain that it has not reached yet.
      const rise = groundY - swingGroundHeight;
      swingGroundHeight = groundY;
      swingGroundVelocity = 0;
      // A swing arc is already clearance above the old surface. Spend that
      // clearance before moving the ankle upward, then critically restore the
      // requested lift. With a forward sole probe this turns a hard stair edge
      // into an anticipatory step instead of a one-frame hip/knee snap.
      swingLiftHeight = Math.max(0, swingLiftHeight - rise);
    } else {
      const groundError = swingGroundHeight - groundY;
      const groundImpulse = (swingGroundVelocity + swingTargetResponse * groundError) * deltaSeconds;
      swingGroundHeight = groundY + (groundError + groundImpulse) * decay;
      swingGroundVelocity = (swingGroundVelocity - swingTargetResponse * groundImpulse) * decay;
    }
    if (lift <= swingLiftHeight) {
      // The authored swing curve already eases into contact. Do not leave a
      // spring tail above the floor: that can consume the entire short
      // sprint stance and make the foot miss every support window.
      swingLiftHeight = lift;
      swingLiftVelocity = 0;
    } else {
      const liftError = swingLiftHeight - lift;
      const liftImpulse = (swingLiftVelocity + swingTargetResponse * liftError) * deltaSeconds;
      swingLiftHeight = lift + (liftError + liftImpulse) * decay;
      swingLiftVelocity = (swingLiftVelocity - swingTargetResponse * liftImpulse) * decay;
    }
  }

  const solver: FootPlantSolver = {
    result,
    update(query) {
      const phase = normalizeGaitPhase(query.phase);
      const swingLift = Math.max(0, finiteNumber(query.swingLift ?? 0, "foot plant swingLift"));
      assertVector(query.proposedWorld, "foot plant proposedWorld");
      if (query.grounded === false) {
        writeSwingTarget(
          query.proposedWorld[0],
          query.proposedWorld[1],
          query.proposedWorld[2],
          swingLift,
          query.deltaSeconds === undefined ? 0 : finiteNonNegative(query.deltaSeconds, "foot plant query deltaSeconds"),
        );
        result.groundNormal[0] = 0;
        result.groundNormal[1] = 1;
        result.groundNormal[2] = 0;
        result.planted = false;
        result.hit = false;
        wasInSwing = true;
        pendingTouchdown = true;
        return result;
      }
      const resolvedStanceRatio = query.stanceRatio === undefined
        ? stanceRatio
        : finiteRange(query.stanceRatio, 0.05, 0.95, "foot plant query stanceRatio");
      const deltaSeconds = query.deltaSeconds === undefined
        ? 0
        : finiteNonNegative(query.deltaSeconds, "foot plant query deltaSeconds");
      const cycleInStance = phase < resolvedStanceRatio;
      if (!cycleInStance) {
        suppressPlantUntilSwing = false;
        pendingTouchdown = false;
      } else if (wasInSwing) pendingTouchdown = true;
      const anchorDistance = Math.hypot(
        query.proposedWorld[0] - result.anchorWorld[0],
        query.proposedWorld[1] - result.anchorWorld[1],
        query.proposedWorld[2] - result.anchorWorld[2],
      );
      const wasPlanted = result.planted;
      if (wasPlanted && anchorDistance > maxAnchorDistance) {
        // An overextended stance is a loss of contact, not permission to move
        // the planted foot to a new point during the same stance. Re-anchoring
        // here creates the classic one-frame IK pop (and apparent foot skate).
        // Release into the already damped swing target and wait for the next
        // swing cycle before another touchdown can become authoritative.
        result.planted = false;
        suppressPlantUntilSwing = true;
        pendingTouchdown = false;
      }
      const hit = sampleSoleGround(query.proposedWorld, query.soleForwardX, query.soleForwardZ, query.soleLength);
      result.hit = Boolean(hit);
      const targetGroundY = hit ? hit.point.y + soleOffset : query.proposedWorld[1];
      const touchdownReady = !pendingTouchdown || !swingTargetInitialized
        || Math.abs(result.targetWorld[1] - targetGroundY) <= touchdownTolerance;
      const inStance = query.allowPlant !== false && cycleInStance && !suppressPlantUntilSwing && touchdownReady;
      if (!inStance) result.planted = false;

      if (inStance && hit && !result.planted) {
        // Touch down where the smoothed swing actually arrived. Sampling the
        // next raw gait point here would reintroduce a one-frame teleport at
        // the loop boundary on stairs and broken terrain.
        const contact = !wasPlanted && wasInSwing && swingTargetInitialized
          ? sampleSoleGround(result.targetWorld, query.soleForwardX, query.soleForwardZ, query.soleLength) ?? hit
          : hit;
        result.anchorWorld[0] = contact.point.x;
        result.anchorWorld[1] = contact.point.y + soleOffset;
        result.anchorWorld[2] = contact.point.z;
        anchorNormal[0] = contact.normal.x;
        anchorNormal[1] = contact.normal.y;
        anchorNormal[2] = contact.normal.z;
        result.planted = true;
        pendingTouchdown = false;
      }

      if (result.planted && inStance) {
        result.targetWorld[0] = result.anchorWorld[0];
        result.targetWorld[1] = result.anchorWorld[1];
        result.targetWorld[2] = result.anchorWorld[2];
        // A planted foot belongs to its captured contact, not whatever slope
        // happens to be beneath the moving body's next proposed stride point.
        result.groundNormal[0] = anchorNormal[0];
        result.groundNormal[1] = anchorNormal[1];
        result.groundNormal[2] = anchorNormal[2];
        swingVelocity.fill(0);
        swingGroundHeight = result.anchorWorld[1];
        swingGroundVelocity = 0;
        swingLiftHeight = 0;
        swingLiftVelocity = 0;
        swingTargetInitialized = true;
      } else if (hit) {
        if (swingTargetInitialized && deltaSeconds > 0) {
          writeSwingHorizontal(hit.point.x, hit.point.z, deltaSeconds);
          const filteredHit = sampleSoleGround(result.targetWorld, query.soleForwardX, query.soleForwardZ, query.soleLength) ?? hit;
          writeSwingVertical(filteredHit.point.y + soleOffset, swingLift, deltaSeconds);
          result.targetWorld[1] = swingGroundHeight + swingLiftHeight;
          result.groundNormal[0] = filteredHit.normal.x;
          result.groundNormal[1] = filteredHit.normal.y;
          result.groundNormal[2] = filteredHit.normal.z;
        } else {
          writeSwingTarget(hit.point.x, hit.point.y + soleOffset, hit.point.z, swingLift, deltaSeconds);
          result.groundNormal[0] = hit.normal.x;
          result.groundNormal[1] = hit.normal.y;
          result.groundNormal[2] = hit.normal.z;
        }
      } else {
        writeSwingTarget(query.proposedWorld[0], query.proposedWorld[1], query.proposedWorld[2], swingLift, deltaSeconds);
        result.groundNormal[0] = 0;
        result.groundNormal[1] = 1;
        result.groundNormal[2] = 0;
      }
      wasInSwing = phase >= resolvedStanceRatio;
      return result;
    },
    release() {
      result.planted = false;
      suppressPlantUntilSwing = true;
      swingVelocity.fill(0);
      swingGroundHeight = result.targetWorld[1];
      swingGroundVelocity = 0;
      swingLiftHeight = 0;
      swingLiftVelocity = 0;
      swingTargetInitialized = true;
    },
    reset() {
      result.targetWorld.fill(0);
      result.anchorWorld.fill(0);
      result.groundNormal[0] = 0;
      result.groundNormal[1] = 1;
      result.groundNormal[2] = 0;
      anchorNormal[0] = 0;
      anchorNormal[1] = 1;
      anchorNormal[2] = 0;
      swingVelocity.fill(0);
      swingGroundHeight = 0;
      swingGroundVelocity = 0;
      swingLiftHeight = 0;
      swingLiftVelocity = 0;
      swingTargetInitialized = false;
      wasInSwing = false;
      suppressPlantUntilSwing = false;
      pendingTouchdown = false;
      result.planted = false;
      result.hit = false;
    },
  };
  return solver;
}

function assertVector(value: ArrayLike<number>, label: string) {
  if (!value || value.length < 3 || !Number.isFinite(value[0]) || !Number.isFinite(value[1]) || !Number.isFinite(value[2])) {
    throw new TypeError(`${label} must contain three finite values`);
  }
}

function finiteNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite`);
  return number;
}

function positiveFinite(value: unknown, label: string) {
  const number = finiteNumber(value, label);
  if (number <= 0) throw new RangeError(`${label} must be greater than zero`);
  return number;
}

function finiteNonNegative(value: unknown, label: string) {
  const number = finiteNumber(value, label);
  if (number < 0) throw new RangeError(`${label} must be non-negative`);
  return number;
}

function finiteRange(value: unknown, min: number, max: number, label: string) {
  const number = finiteNumber(value, label);
  if (number < min || number > max) throw new RangeError(`${label} must be between ${min} and ${max}`);
  return number;
}
