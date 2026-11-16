import type { RigidOperationContext } from '../rigid-3d-operations.ts';
import { CCD_EPSILON, SHAPE_SPHERE } from '../rigid-3d-internals.ts';

type Bounds = Pick<RigidOperationContext['bodies'], 'shapeKind' | 'extentX' | 'extentY' | 'extentZ'
  | 'positionX' | 'positionY' | 'positionZ' | 'previousX' | 'previousY' | 'previousZ'>;

/** Conservative for the entire relative translation and every intermediate rotation. */
export function createCcdBoundsTest(bodies: Bounds) {
  const { shapeKind, extentX, extentY, extentZ, positionX, positionY, positionZ, previousX, previousY, previousZ } = bodies;
  const radius = (index: number) => shapeKind[index] === SHAPE_SPHERE ? extentX[index]!
    : extentX[index]! + extentY[index]! + extentZ[index]!;
  return (index: number, other: number) => {
    // L1 half extent encloses a box at all orientations without sqrt or a cache.
    // Both endpoints outside the same slab prove the linear sweep cannot reach.
    const bound = radius(index) + radius(other) + CCD_EPSILON;
    const ax = previousX[index]! - previousX[other]!, bx = positionX[index]! - positionX[other]!;
    if (ax > bound && bx > bound || ax < -bound && bx < -bound) return false;
    const ay = previousY[index]! - previousY[other]!, by = positionY[index]! - positionY[other]!;
    if (ay > bound && by > bound || ay < -bound && by < -bound) return false;
    const az = previousZ[index]! - previousZ[other]!, bz = positionZ[index]! - positionZ[other]!;
    return !(az > bound && bz > bound || az < -bound && bz < -bound);
  };
}
