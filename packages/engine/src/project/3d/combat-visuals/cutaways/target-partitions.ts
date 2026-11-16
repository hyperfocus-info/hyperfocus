import { aabbIntersectsFrustum3D } from '../../../../render/3d-core.ts';
import { anyTargetIntersects } from "../../../../physics/target-rays.ts";
import { createSightVolumePlanes3D } from './sight-volume.ts';

type Vec = readonly [number, number, number];
type Box = { position: Vec; rotation: readonly [number, number, number, number]; scale: Vec };
type Query = (eye: Vec, targets: readonly Vec[], count: number, box: Box, padding: number) => boolean;
type RangeQuery = (eye: Vec, targets: readonly Vec[], count: number, box: Box, padding: number, offset: number) => boolean;
/** Untimed numeric traversal evidence: kind (0 begin, 1 group, 2 fallback,
 * 3 end), query ordinal, offset, clipped count, plane tested, rejected, hit. */
export type TargetPartitionObserver = (kind: number, query: number, offset: number, count: number, tested: number, rejected: number, hit: number) => void;
export type TargetPartitionWork = {
  builds: number; groups: number; preparedTargets: number; referenceSlots: number; planeBytes: number;
  queries: number; groupTests: number; groupRejects: number; rayGroups: number; rayTargetsOffered: number; fallbacks: number;
};

/** One synchronous presentation's borrowed sight samples. Inputs must remain
 * unchanged until its queries finish; discard this object before changing them.
 * Small conservative cones reject groups, while the supplied exact ray query
 * preserves target order and segment semantics. No arrays are allocated per box.
 */
export function createPartitionedTargetRayQuery3D(eye: Vec, aim: Vec, targets: readonly Vec[], options: {
  groupSize?: number; query?: Query; diagnostics?: boolean;
  /** Same borrowed group records/prefix, plus their offset in the prepared full
   * target array. Allows a separately owned packed range without copying each
   * surviving group. The full-array exceptional path supplies offset zero. */
  queryRange?: RangeQuery;
  observe?: TargetPartitionObserver;
} = {}) {
  const groupSize = options.groupSize ?? 16;
  if (!Number.isInteger(groupSize) || groupSize < 1) throw new RangeError('Target partition group size must be a positive integer');
  if (options.query && options.queryRange) throw new TypeError('Select one target partition query owner');
  const prefixQuery = options.query ?? anyTargetIntersects;
  // The leaf's optional sixth argument is its diagnostic owner, not an offset.
  // Keep legacy callbacks at exactly five arguments; select this adapter once.
  const query: RangeQuery = options.queryRange ?? ((eye, samples, count, box, padding) => prefixQuery(eye, samples, count, box, padding));
  const groups: Array<{ offset: number; targets: readonly Vec[]; planes: Float64Array | undefined }> = [];
  for (let offset = 0; offset < targets.length; offset += groupSize) {
    const samples = targets.slice(offset, offset + groupSize);
    groups.push({ offset, targets: samples, planes: createSightVolumePlanes3D(eye, aim, samples) });
  }
  const work: TargetPartitionWork = {
    builds: 1, groups: groups.length, preparedTargets: targets.length, referenceSlots: targets.length,
    planeBytes: groups.reduce((bytes, group) => bytes + (group.planes?.byteLength ?? 0), 0),
    queries: 0, groupTests: 0, groupRejects: 0, rayGroups: 0, rayTargetsOffered: 0, fallbacks: 0,
  };
  const observed = options.diagnostics ? work : undefined;
  const observe = options.observe;let queryOrdinal = 0;
  const min: [number, number, number] = [0, 0, 0], max: [number, number, number] = [0, 0, 0];
  return {
    work,
    test(localEye: Vec, count: number, box: Box, padding: number) {
      if (!Number.isInteger(count) || count < 0 || count > targets.length) throw new RangeError('Invalid target prefix count');
      if (observed) observed.queries++;
      const ordinal = observe ? ++queryOrdinal : 0;
      observe?.(0, ordinal, 0, count, 0, 0, 0);
      if (!count) { observe?.(3, ordinal, 0, count, 0, 0, 0);return false; }
      // Keep arbitrary/rotated quaternion semantics in the existing oracle.
      // The common unrotated scenery path has exact world/local axis agreement.
      let eligible = box.rotation[0] === 0 && box.rotation[1] === 0 && box.rotation[2] === 0
        && Number.isFinite(box.rotation[3]) && Number.isFinite(padding) && padding >= 0;
      if (eligible) for (let axis = 0; axis < 3; axis++) {
        const position = box.position[axis]!, half = box.scale[axis]!, local = localEye[axis]!;
        if (!Number.isFinite(position) || !Number.isFinite(half) || half < 0 || !Number.isFinite(local)
          || local !== eye[axis]! - position) { eligible = false;break; }
        // Retain boundary hits despite translation and plane-dot roundoff.
        const extent = half + padding + (1 + Math.abs(position) + half + padding) * 1e-8;
        min[axis] = position - extent;max[axis] = position + extent;
        if (!Number.isFinite(min[axis]) || !Number.isFinite(max[axis])) { eligible = false;break; }
      }
      if (!eligible) {
        if (observed) { observed.fallbacks++;observed.rayGroups++;observed.rayTargetsOffered += count; }
        const hit = query(localEye, targets, count, box, padding, 0);
        observe?.(2, ordinal, 0, count, 0, 0, Number(hit));observe?.(3, ordinal, 0, count, 0, 0, Number(hit));return hit;
      }
      for (const group of groups) {
        const length = Math.min(group.targets.length, count - group.offset);
        if (length <= 0) break;
        if (group.planes) {
          if (observed) observed.groupTests++;
          if (!aabbIntersectsFrustum3D(group.planes, min, max)) { if (observed) observed.groupRejects++;observe?.(1, ordinal, group.offset, length, 1, 1, 0);continue; }
        }
        if (observed) { observed.rayGroups++;observed.rayTargetsOffered += length; }
        const hit = query(localEye, group.targets, length, box, padding, group.offset);
        observe?.(1, ordinal, group.offset, length, Number(!!group.planes), 0, Number(hit));
        if (hit) { observe?.(3, ordinal, 0, count, 0, 0, 1);return true; }
      }
      observe?.(3, ordinal, 0, count, 0, 0, 0);return false;
    },
  };
}
