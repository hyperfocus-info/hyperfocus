import { prepareEulerPointRotation3D, prepareEulerQuaternion3D, type Hyperfocus3DEvaluatedFrame } from '@hyperfocus/engine/project/runtime-3d';
import type { ArtMotion } from './motion.ts';

type Point = [number, number, number];
export type RigPreparation = 'original' | 'prepared';
export type RigFrameLookup = ReadonlyMap<string, Hyperfocus3DEvaluatedFrame['entities'][number]>;
export function createRigPreparationWork() {
  return { applications: 0, preparedApplications: 0, standingFighters: 0, knockoutFighters: 0, frameMapBuilds: 0, frameMapInputVisits: 0, frameMapEntries: 0, frameMapTemporaryArrays: 0,
    sourceMapBuilds: 0, sourceMapEntries: 0, sourceMapTemporaryArrays: 0, partVisits: 0, partWrites: 0, ikSolves: 0,
    rotationPreparations: 0, pointRotations: 0, quaternionPreparations: 0, quaternions: 0, trigCalls: 0,
    bodyPivotCalculations: 0, headAnchorCalculations: 0, peakLookupEntries: 0, preparedRetainedFrameReferences: 0 };
}
export type RigPreparationWork = ReturnType<typeof createRigPreparationWork>;

/** Only the built-in synchronous standing presenter may share this lookup. Its
 * writers mutate record properties, never membership or IDs. It is local to one
 * invocation, has Map's last-duplicate semantics, and must not be retained.
 * Existing find-first paths (including knockout) do not consume this lookup. */
export function createRigFrameLookup(frame: Hyperfocus3DEvaluatedFrame, work?: RigPreparationWork): RigFrameLookup {
  const entries = new Map<string, Hyperfocus3DEvaluatedFrame['entities'][number]>();
  for (const entity of frame.entities) entries.set(entity.id, entity);
  recordRigFrameMap(frame.entities.length, entries.size, 0, work);
  return entries;
}
export function recordRigFrameMap(input: number, entries: number, arrays: number, work?: RigPreparationWork) {
  if (!work) return;
  work.frameMapBuilds++;work.frameMapInputVisits += input;work.frameMapEntries += entries;work.frameMapTemporaryArrays += arrays;
  work.peakLookupEntries = Math.max(work.peakLookupEntries, entries);
}

/** These derived values stay inside one pose application. In particular, the
 * shared pivot/anchor are only read by fresh-output additions, never published. */
export function prepareRigTransforms(root: Point, yaw: number, pose: ArtMotion, work?: RigPreparationWork) {
  const rotation = (y: number, p = 0, r = 0) => {
    const rotate = prepareEulerPointRotation3D(y, p, r);
    if (work) { work.rotationPreparations++;work.trigCalls += 6; }
    return work ? (point: Point) => { work.pointRotations++;return rotate(point); } : rotate;
  };
  const quaternion = (pitch: number, roll = 0) => {
    const sample = prepareEulerQuaternion3D(pitch, roll);
    if (work) { work.quaternionPreparations++;work.trigCalls += 4; }
    return work ? (angle: number) => { work.quaternions++;work.trigCalls += 2;return sample(angle); } : sample;
  };
  const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const worldRotation = rotation(yaw), torsoRotation = rotation(pose.twist, pose.pitch, pose.roll);
  const world = (point: Point) => add(root, worldRotation(point));
  const torso = (point: Point) => add(pose.hip, torsoRotation([point[0], point[1] - 1.05, point[2]]));
  const bodyRotation = rotation(yaw + pose.twist, pose.pitch, pose.roll), bodyQuaternion = quaternion(pose.pitch, pose.roll);
  const bodyOrigin = world(torso([0, 0, 0]));
  if (work) work.bodyPivotCalculations++;
  const head = pose.head;
  const headRotation = head ? rotation(head.twist, head.pitch, head.roll) : undefined;
  const headQuaternion = head ? quaternion(head.pitch, head.roll) : undefined;
  const headAnchor = head ? torso([0, 1.73, 0]) : undefined;
  if (work && head) work.headAnchorCalculations++;
  return { world, bodyPosition: (point: Point) => add(bodyOrigin, bodyRotation(point)), bodyQuaternion,
    headPosition: headRotation ? (point: Point) => world(add(headAnchor!, headRotation(point))) : undefined, headQuaternion };
}
