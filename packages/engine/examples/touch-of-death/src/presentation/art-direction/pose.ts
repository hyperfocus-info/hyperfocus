import type { Hyperfocus3DEvaluatedFrame, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { sampleArtMotion, solveArtArm, solveArtLimb } from './motion.ts';
import { prepareRigTransforms, recordRigFrameMap, type RigFrameLookup, type RigPreparation, type RigPreparationWork } from './rig-preparation.ts';

type Point = [number, number, number];
type Entity = Hyperfocus3DEvaluatedFrame['entities'][number];
const rotate = (input: Point, yaw: number, pitch = 0, roll = 0): Point => {
  const p: Point = [input[0] * Math.cos(roll) - input[1] * Math.sin(roll), input[0] * Math.sin(roll) + input[1] * Math.cos(roll), input[2]];
  const y = p[1] * Math.cos(pitch) - p[2] * Math.sin(pitch), z = p[1] * Math.sin(pitch) + p[2] * Math.cos(pitch);
  return [p[0] * Math.cos(yaw) + z * Math.sin(yaw), y, -p[0] * Math.sin(yaw) + z * Math.cos(yaw)];
};
const quaternion = (yaw: number, pitch: number, roll = 0): [number, number, number, number] => {
  const x = Math.cos(yaw / 2) * Math.sin(pitch / 2), y = Math.sin(yaw / 2) * Math.cos(pitch / 2), z = -Math.sin(yaw / 2) * Math.sin(pitch / 2), w = Math.cos(yaw / 2) * Math.cos(pitch / 2), c = Math.cos(roll / 2), s = Math.sin(roll / 2);
  return [x * c + y * s, y * c - x * s, z * c + w * s, w * c - z * s];
};
const plus = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const rotateQuaternion = (v: Point, q: [number, number, number, number]): Point => {
  const tx = 2 * (q[1] * v[2] - q[2] * v[1]), ty = 2 * (q[2] * v[0] - q[0] * v[2]), tz = 2 * (q[0] * v[1] - q[1] * v[0]);
  return [v[0] + q[3] * tx + q[1] * tz - q[2] * ty, v[1] + q[3] * ty + q[2] * tx - q[0] * tz, v[2] + q[3] * tz + q[0] * ty - q[1] * tx];
};

/** Consumer-local rig proof; no production engine defaults change before acceptance. */
export function presentArtFighter(options: { frame: Hyperfocus3DEvaluatedFrame; declaration: Hyperfocus3DDeclaration; bindPose?: readonly { id: string; position: Point; scale: Point; rotationY: number }[]; id: string; root: Point; yaw: number; motion: ReturnType<typeof sampleArtMotion>; preparation?: RigPreparation; lookup?: RigFrameLookup; work?: RigPreparationWork }) {
  const { frame, declaration, id, root, yaw, motion: pose } = options;
  if (options.preparation !== undefined && options.preparation !== 'original' && options.preparation !== 'prepared') throw Error('Unsupported rig preparation strategy');
  const work = options.work;
  if (work) work.applications++;
  const source = new Map((options.bindPose ?? declaration.scenes.find(scene => scene.id === declaration.activeSceneId)!.entities).map(entity => [entity.id, entity]));
  const parts = options.lookup ?? new Map(frame.entities.filter(entity => entity.id.startsWith(`${id}:`)).map(entity => [entity.id, entity]));
  if (!options.lookup) recordRigFrameMap(frame.entities.length, parts.size, 2, work);
  if (work) { work.sourceMapBuilds++;work.sourceMapEntries += source.size;work.sourceMapTemporaryArrays++; }
  const part = (suffix: string) => parts.get(`${id}:${suffix}`);
  const rotatePoint = work ? (p: Point, y: number, pitch = 0, roll = 0) => { work.pointRotations++;work.trigCalls += 12;return rotate(p, y, pitch, roll); } : rotate;
  const sampleQuaternion = work ? (y: number, pitch: number, roll = 0) => { work.quaternions++;work.trigCalls += 10;return quaternion(y, pitch, roll); } : quaternion;
  const prepared = options.preparation === 'prepared' ? prepareRigTransforms(root, yaw, pose, work) : undefined;
  if (work && prepared) work.preparedApplications++;
  const world = prepared?.world ?? ((p: Point) => plus(root, rotatePoint(p, yaw)));
  const torso = (p: Point) => plus(pose.hip, rotatePoint([p[0], p[1] - 1.05, p[2]], pose.twist, pose.pitch, pose.roll));
  const bodyPosition = prepared?.bodyPosition ?? ((point: Point) => { if (work) work.bodyPivotCalculations++;return plus(world(torso([0, 0, 0])), rotatePoint(point, yaw + pose.twist, pose.pitch, pose.roll)); });
  const bodyQuaternion = prepared?.bodyQuaternion ?? ((angle: number) => sampleQuaternion(angle, pose.pitch, pose.roll));
  const headPosition = prepared?.headPosition ?? ((point: Point) => { if (work) work.headAnchorCalculations++;return world(plus(torso([0, 1.73, 0]), rotatePoint(point, pose.head!.twist, pose.head!.pitch, pose.head!.roll))); });
  const headQuaternion = prepared?.headQuaternion ?? ((angle: number) => sampleQuaternion(angle, pose.head!.pitch, pose.head!.roll));
  const limbs = new Set(['left-sleeve', 'right-sleeve', 'left-forearm', 'right-forearm', 'left-thigh', 'right-thigh', 'left-shin', 'right-shin', 'left-shoe', 'right-shoe', 'left-sole', 'right-sole', 'left-boot-detail', 'right-boot-detail', 'left-hand', 'right-hand', 'left-thumb', 'right-thumb', 'left-wrist-wrap', 'right-wrist-wrap', 'left-knuckle-folds', 'right-knuckle-folds']);
  for (const entity of frame.entities) {
    if (work) work.partVisits++;
    if (!entity.id.startsWith(`${id}:`)) continue;
    const suffix = entity.id.slice(id.length + 1);
    if (limbs.has(suffix)) continue;
    const authored = source.get(entity.id);
    if (!authored) continue;
    if (work) work.partWrites++;
    const headPart = /^(head|hair|nose|mouth|brow:|eye:|eye-light:)/.test(suffix);
    if (headPart && pose.head) {
      // Rotate the head assembly about the base of the neck, independently of
      // the chest. Absolute-coordinate models (hair) and local facial parts agree.
      entity.position = headPosition([authored.position[0], authored.position[1] - 1.73, authored.position[2]]);
      entity.rotation = headQuaternion(yaw + pose.head.twist + (authored.rotationY ?? 0));
      entity.scale = [...authored.scale]; entity.visible = true;
      continue;
    }
    entity.position = bodyPosition(authored.position);
    entity.rotation = bodyQuaternion(yaw + pose.twist + (authored.rotationY ?? 0));
    entity.scale = [...authored.scale]; entity.visible = true;
  }
  const limb = (entity: Entity | undefined, a: Point, b: Point, restLength: number) => {
    if (!entity) throw new Error('Missing articulated segment');
    if (work) work.partWrites++;
    const start = world(a), end = world(b), length = Math.hypot(...end.map((n, i) => n - start[i]!));
    const dx = (start[0] - end[0]) / length, dy = (start[1] - end[1]) / length, dz = (start[2] - end[2]) / length;
    const norm = Math.hypot(dz, -dx, 1 + dy);
    entity.position = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2];
    entity.rotation = norm < .00001 ? [1, 0, 0, 0] : [dz / norm, 0, -dx / norm, (1 + dy) / norm];
    entity.scale = [1, length / restLength, 1]; entity.visible = true;
  };
  const measurements = [];
  for (const sign of [-1, 1]) {
    const name = sign < 0 ? 'left' : 'right';
    const arm = solveArtArm({ pose, side: name }), shoulder = arm.shoulder;
    if (work) work.ikSolves++;
    limb(part(`${name}-sleeve`), shoulder, arm.joint, Math.hypot(.105, .255, .035));
    limb(part(`${name}-forearm`), arm.joint, arm.end, Math.hypot(.045, .26, .025));
    const direction: Point = [(arm.end[0] - arm.joint[0]) / .29, (arm.end[1] - arm.joint[1]) / .29, (arm.end[2] - arm.joint[2]) / .29];
    const handNorm = Math.hypot(direction[2], -direction[0], 1 + direction[1]);
    const localHand: [number, number, number, number] = handNorm < .00001 ? [1, 0, 0, 0] : [direction[2] / handNorm, 0, -direction[0] / handNorm, (1 + direction[1]) / handNorm];
    const sy = Math.sin(yaw / 2), cy = Math.cos(yaw / 2);
    const handRotation: [number, number, number, number] = [cy * localHand[0] + sy * localHand[2], cy * localHand[1] + sy * localHand[3], cy * localHand[2] - sy * localHand[0], cy * localHand[3] - sy * localHand[1]];
    for (const suffix of ['hand', 'thumb', 'wrist-wrap', 'knuckle-folds']) {
      const hand = part(`${name}-${suffix}`);
      if (!hand) continue;
      if (work) work.partWrites++;
      const anchor = world([arm.end[0] + direction[0] * .025, arm.end[1] + direction[1] * .025, arm.end[2] + direction[2] * .025]);
      hand.position = suffix === 'thumb' ? plus(anchor, rotateQuaternion([-sign * .054, .027, .037], handRotation)) : anchor;
      hand.rotation = handRotation; hand.scale = [1, 1, 1]; hand.visible = true;
    }
    const hip = plus(pose.hip, rotatePoint([sign * .125, 0, 0], pose.twist * .3));
    const foot = sign < 0 ? pose.leftFoot : pose.rightFoot;
    const authoredKnee = sign < 0 ? pose.authored?.leftKnee : pose.authored?.rightKnee;
    const stablePole = sign < 0 ? pose.authored?.leftKneePole : pose.authored?.rightKneePole;
    const kneePole: Point = stablePole ?? (authoredKnee ? [authoredKnee[0] - hip[0], authoredKnee[1] - hip[1], authoredKnee[2] - hip[2]] : [sign * .05, 0, 1]);
    const leg = solveArtLimb({ start: hip, target: foot, pole: kneePole, upper: .48, lower: .48 });
    if (work) work.ikSolves++;
    limb(part(`${name}-thigh`), hip, leg.joint, Math.hypot(.045, .4935, .02));
    limb(part(`${name}-shin`), leg.joint, leg.end, Math.hypot(.035, .4165, .02));
    const shoe = part(`${name}-shoe`);
    if (!shoe) throw new Error('Missing planted foot');
    const footPitch = (sign < 0 ? pose.feet?.leftPitch ?? pose.authored?.leftFootPitch : pose.feet?.rightPitch ?? pose.authored?.rightFootPitch) ?? 0;
    shoe.position = world(plus(leg.end, rotatePoint([0, -.10, 0], 0, footPitch))); shoe.rotation = sampleQuaternion(yaw + sign * .08, footPitch); shoe.scale = [1, 1, 1]; shoe.visible = true;
    if (work) work.partWrites++;
    for (const suffix of ['sole', 'boot-detail']) {
      const detail = part(`${name}-${suffix}`);
      if (detail) { detail.position = [...shoe.position]; detail.rotation = [...shoe.rotation]; detail.scale = [1, 1, 1]; detail.visible = true;if (work) work.partWrites++; }
    }
    const measuredFoot: Point = [...shoe.position];
    measurements.push({ side: name, foot: measuredFoot, ankle: world(leg.end), knee: world(leg.joint), hip: world(hip), wrist: world(arm.end), elbow: world(arm.joint), shoulder: world(shoulder), armClamped: arm.clamped, legClamped: leg.clamped });
  }
  return measurements;
}
