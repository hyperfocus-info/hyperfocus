import type { MotionVec3, MutableMotionVector } from "../math.ts";

export type TwoBoneIKQuery = {
  root: ArrayLike<number>;
  target: ArrayLike<number>;
  poleDirection: ArrayLike<number>;
  upperLength: number;
  lowerLength: number;
  maxStretch?: number;
};

export type TwoBoneIKResult = {
  readonly knee: MutableMotionVector;
  readonly end: MutableMotionVector;
  distance: number;
  stretch: number;
  reached: boolean;
};

export function createTwoBoneIKResult(): TwoBoneIKResult {
  return {
    knee: new Float32Array(3),
    end: new Float32Array(3),
    distance: 0,
    stretch: 1,
    reached: false,
  };
}

export function solveTwoBoneIK(
  query: TwoBoneIKQuery,
  out: TwoBoneIKResult = createTwoBoneIKResult(),
): TwoBoneIKResult {
  assertVector(query.root, "two-bone IK root");
  assertVector(query.target, "two-bone IK target");
  assertVector(query.poleDirection, "two-bone IK pole direction");
  const upperLength = positiveFinite(query.upperLength, "two-bone IK upper length");
  const lowerLength = positiveFinite(query.lowerLength, "two-bone IK lower length");
  const maxStretch = finiteAtLeast(query.maxStretch ?? 1, 1, "two-bone IK maxStretch");
  if (out.knee.length < 3 || out.end.length < 3) throw new RangeError("two-bone IK outputs must contain three values");

  const rootX = query.root[0];
  const rootY = query.root[1];
  const rootZ = query.root[2];
  let directionX = query.target[0] - rootX;
  let directionY = query.target[1] - rootY;
  let directionZ = query.target[2] - rootZ;
  const requestedDistance = Math.hypot(directionX, directionY, directionZ);
  if (requestedDistance > 1e-8) {
    const inverseDistance = 1 / requestedDistance;
    directionX *= inverseDistance;
    directionY *= inverseDistance;
    directionZ *= inverseDistance;
  } else {
    directionX = 0;
    directionY = 0;
    directionZ = 1;
  }

  const naturalLength = upperLength + lowerLength;
  const stretch = Math.min(maxStretch, Math.max(1, requestedDistance / naturalLength));
  const stretchedUpper = upperLength * stretch;
  const stretchedLower = lowerLength * stretch;
  const maximumDistance = Math.max(1e-8, stretchedUpper + stretchedLower - 1e-7);
  const minimumDistance = Math.min(maximumDistance, Math.abs(stretchedUpper - stretchedLower) + 1e-7);
  const solvedDistance = Math.max(minimumDistance, Math.min(maximumDistance, requestedDistance));

  let bendX = query.poleDirection[0];
  let bendY = query.poleDirection[1];
  let bendZ = query.poleDirection[2];
  const poleProjection = bendX * directionX + bendY * directionY + bendZ * directionZ;
  bendX -= directionX * poleProjection;
  bendY -= directionY * poleProjection;
  bendZ -= directionZ * poleProjection;
  let bendLength = Math.hypot(bendX, bendY, bendZ);
  if (bendLength <= 1e-8) {
    const fallbackX = Math.abs(directionY) < 0.95 ? 0 : 1;
    const fallbackY = Math.abs(directionY) < 0.95 ? 1 : 0;
    bendX = fallbackY * directionZ;
    bendY = -fallbackX * directionZ;
    bendZ = fallbackX * directionY - fallbackY * directionX;
    bendLength = Math.hypot(bendX, bendY, bendZ);
  }
  const inverseBendLength = 1 / Math.max(1e-8, bendLength);
  bendX *= inverseBendLength;
  bendY *= inverseBendLength;
  bendZ *= inverseBendLength;

  const along = (solvedDistance * solvedDistance + stretchedUpper * stretchedUpper - stretchedLower * stretchedLower)
    / (2 * solvedDistance);
  const perpendicular = Math.sqrt(Math.max(0, stretchedUpper * stretchedUpper - along * along));
  out.knee[0] = rootX + directionX * along + bendX * perpendicular;
  out.knee[1] = rootY + directionY * along + bendY * perpendicular;
  out.knee[2] = rootZ + directionZ * along + bendZ * perpendicular;
  out.end[0] = rootX + directionX * solvedDistance;
  out.end[1] = rootY + directionY * solvedDistance;
  out.end[2] = rootZ + directionZ * solvedDistance;
  out.distance = solvedDistance;
  out.stretch = stretch;
  out.reached = requestedDistance <= maximumDistance + 1e-6 && requestedDistance >= minimumDistance - 1e-6;
  return out;
}

function assertVector(value: ArrayLike<number>, label: string): asserts value is MotionVec3 {
  if (!value || value.length < 3 || !Number.isFinite(value[0]) || !Number.isFinite(value[1]) || !Number.isFinite(value[2])) {
    throw new TypeError(`${label} must contain three finite values`);
  }
}

function positiveFinite(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new RangeError(`${label} must be greater than zero`);
  return number;
}

function finiteAtLeast(value: unknown, minimum: number, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum) throw new RangeError(`${label} must be at least ${minimum}`);
  return number;
}
