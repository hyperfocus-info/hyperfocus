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
};

export type FootPlantQuery = {
  phase: number;
  proposedWorld: ArrayLike<number>;
  swingLift?: number;
  /** False while the character is airborne. Terrain sampling and constraints are bypassed. */
  grounded?: boolean;
  /** False while locomotion is blending in and no stable stance anchor exists yet. */
  allowPlant?: boolean;
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
  reset(): void;
};

export function createFootPlantSolver(options: FootPlantSolverOptions): FootPlantSolver {
  if (!options.ground || typeof options.ground.raycast !== "function") throw new Error("foot plant solver requires a ground raycast provider");
  const stanceRatio = finiteRange(options.stanceRatio ?? 0.55, 0.05, 0.95, "foot plant stanceRatio");
  const rayHeight = positiveFinite(options.rayHeight ?? 0.65, "foot plant rayHeight");
  const rayDistance = positiveFinite(options.rayDistance ?? 1.5, "foot plant rayDistance");
  const soleOffset = finiteNumber(options.soleOffset ?? 0.015, "foot plant soleOffset");
  const maxAnchorDistance = positiveFinite(options.maxAnchorDistance ?? 1.25, "foot plant maxAnchorDistance");
  const rayOrigin = { x: 0, y: 0, z: 0 };
  const rayDirection = { x: 0, y: -1, z: 0 };
  const rayHit: Physics3DRaycastHit = {
    point: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 1, z: 0 },
    distance: 0,
  };
  const result: FootPlantResult = {
    targetWorld: new Float32Array(3),
    groundNormal: new Float32Array([0, 1, 0]),
    anchorWorld: new Float32Array(3),
    planted: false,
    hit: false,
  };

  function sampleGround(proposed: ArrayLike<number>) {
    assertVector(proposed, "foot plant proposedWorld");
    rayOrigin.x = proposed[0];
    rayOrigin.y = proposed[1] + rayHeight;
    rayOrigin.z = proposed[2];
    return options.ground.raycast(rayOrigin, rayDirection, { maxDistance: rayDistance }, rayHit);
  }

  function writeHitTarget(hit: Physics3DRaycastHit, lift: number) {
    result.targetWorld[0] = hit.point.x;
    result.targetWorld[1] = hit.point.y + soleOffset + lift;
    result.targetWorld[2] = hit.point.z;
    result.groundNormal[0] = hit.normal.x;
    result.groundNormal[1] = hit.normal.y;
    result.groundNormal[2] = hit.normal.z;
  }

  const solver: FootPlantSolver = {
    result,
    update(query) {
      const phase = normalizeGaitPhase(query.phase);
      const swingLift = Math.max(0, finiteNumber(query.swingLift ?? 0, "foot plant swingLift"));
      assertVector(query.proposedWorld, "foot plant proposedWorld");
      if (query.grounded === false) {
        result.targetWorld[0] = query.proposedWorld[0];
        result.targetWorld[1] = query.proposedWorld[1];
        result.targetWorld[2] = query.proposedWorld[2];
        result.groundNormal[0] = 0;
        result.groundNormal[1] = 1;
        result.groundNormal[2] = 0;
        result.planted = false;
        result.hit = false;
        return result;
      }
      const inStance = query.allowPlant !== false && phase < stanceRatio;
      const anchorDistance = Math.hypot(
        query.proposedWorld[0] - result.anchorWorld[0],
        query.proposedWorld[1] - result.anchorWorld[1],
        query.proposedWorld[2] - result.anchorWorld[2],
      );
      if (!inStance) result.planted = false;
      const hit = sampleGround(query.proposedWorld);
      result.hit = Boolean(hit);

      if (inStance && hit && (!result.planted || anchorDistance > maxAnchorDistance)) {
        result.anchorWorld[0] = hit.point.x;
        result.anchorWorld[1] = hit.point.y + soleOffset;
        result.anchorWorld[2] = hit.point.z;
        result.planted = true;
      }

      if (result.planted && inStance) {
        result.targetWorld[0] = result.anchorWorld[0];
        result.targetWorld[1] = result.anchorWorld[1];
        result.targetWorld[2] = result.anchorWorld[2];
        if (hit) {
          result.groundNormal[0] = hit.normal.x;
          result.groundNormal[1] = hit.normal.y;
          result.groundNormal[2] = hit.normal.z;
        }
      } else if (hit) {
        writeHitTarget(hit, swingLift);
      } else {
        result.targetWorld[0] = query.proposedWorld[0];
        result.targetWorld[1] = query.proposedWorld[1] + swingLift;
        result.targetWorld[2] = query.proposedWorld[2];
        result.groundNormal[0] = 0;
        result.groundNormal[1] = 1;
        result.groundNormal[2] = 0;
      }
      return result;
    },
    reset() {
      result.targetWorld.fill(0);
      result.anchorWorld.fill(0);
      result.groundNormal[0] = 0;
      result.groundNormal[1] = 1;
      result.groundNormal[2] = 0;
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

function finiteRange(value: unknown, min: number, max: number, label: string) {
  const number = finiteNumber(value, label);
  if (number < min || number > max) throw new RangeError(`${label} must be between ${min} and ${max}`);
  return number;
}
