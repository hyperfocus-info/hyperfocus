import { tuple3 } from "../../math/tuples.ts";
import type { RigidBodyState3D, RigidWorld3D } from "../rigid-3d.ts";
import type { PhysicalBindEvent3D, PhysicalBodyReference3D, PhysicalContactEvent3D, PhysicalPerformanceCue3D, PhysicalPerformanceDiagnostic3D } from "../physical-performance-3d.ts";

type BindCue = Extract<PhysicalPerformanceCue3D, { kind: "bind" }>;
type ActiveBind = { cue: BindCue; endTick: number; pointConstraintId: string; rotationConstraintId?: string; point: [number, number, number] };
export type PhysicalContactBindCheckpoint3D = { cueId: string; endTick: number; point: [number, number, number] };

export function createPhysicalContactBindManager3D(options: {
  world: RigidWorld3D;
  stepsPerFrame: number;
  cues: readonly BindCue[];
  resolveBody: (reference: PhysicalBodyReference3D) => number;
  contactSource: (cueId: string) => PhysicalContactEvent3D | undefined;
  cueIndex: (cueId: string) => number | undefined;
  events: PhysicalBindEvent3D[];
  diagnostics: PhysicalPerformanceDiagnostic3D[];
}) {
  const cues = new Map(options.cues.map((cue) => [cue.id, cue] as const)), active = new Map<string, ActiveBind>();
  function event(item: ActiveBind, state: PhysicalBindEvent3D["state"], tick: number, phase: "start" | "after" = "after"): void {
    options.events.push({ cueId: item.cue.id, state, frame: Math.floor(tick / options.stepsPerFrame), simulationTick: tick, subframe: (tick % options.stepsPerFrame + (phase === "after" ? 1 : 0)) / options.stepsPerFrame, a: copyReference(item.cue.a), b: copyReference(item.cue.b), point: [...item.point] });
  }
  function begin(cue: BindCue, activationTick: number): void {
    if (active.has(cue.id)) return;
    const a = options.resolveBody(cue.a), b = options.resolveBody(cue.b), aState = requireBody(options.world, a, cue.id), bState = requireBody(options.world, b, cue.id), contact = cue.anchorMode === "contact" ? options.contactSource(cue.afterContact!.cueId) : undefined;
    const point = contact ? tuple3(...contact.point) : authoredPoint(aState, bState, cue.localAnchorA, cue.localAnchorB);
    const localAnchorA = cue.anchorMode === "contact" ? localPoint(aState, point) : cue.localAnchorA;
    const localAnchorB = cue.anchorMode === "contact" ? localPoint(bState, point) : cue.localAnchorB;
    const pointConstraintId = `${cue.id}__position`, rotationConstraintId = cue.rotationMode === "pivot" ? undefined : `${cue.id}__rotation`;
    options.world.addPointConstraint({ id: pointConstraintId, a, b, localAnchorA, localAnchorB, stiffness: cue.stiffness ?? .9, damping: cue.damping ?? .9, maxImpulse: cue.maxImpulse ?? 100, breakImpulse: cue.breakImpulse });
    try {
      if (rotationConstraintId) options.world.addAngularMotorConstraint({ id: rotationConstraintId, a, b, stiffness: cue.rotationStiffness ?? .9, damping: cue.rotationDamping ?? .9, maxTorqueImpulse: cue.maxTorqueImpulse ?? 20 });
    } catch (error) { options.world.removeConstraint(pointConstraintId); throw error; }
    const startTick = contact && cue.afterContact?.offsetFrames === 0 ? contact.simulationTick : activationTick;
    const item: ActiveBind = { cue, endTick: startTick + cue.durationFrames * options.stepsPerFrame, pointConstraintId, ...(rotationConstraintId ? { rotationConstraintId } : {}), point };
    active.set(cue.id, item);
    if (contact) options.events.push({ cueId: cue.id, state: "bound", frame: contact.frame, simulationTick: contact.simulationTick, subframe: contact.subframe, a: copyReference(cue.a), b: copyReference(cue.b), point: [...point] });
    else event(item, "bound", activationTick, "start");
  }
  function releaseDue(tick: number): void {
    for (const [id, item] of active) if (tick >= item.endTick) { removeConstraints(item); active.delete(id); event(item, "released", tick, "start"); }
  }
  function verify(tick: number): void {
    for (const [id, item] of active) if (!options.world.constraint(item.pointConstraintId)) {
      if (item.rotationConstraintId) options.world.removeConstraint(item.rotationConstraintId);
      active.delete(id); event(item, "broken", tick);
      const index = options.cueIndex(id); options.diagnostics.push({ severity: "warning", code: "bind-broke", cueId: id, frame: Math.floor(tick / options.stepsPerFrame), ...(index === undefined ? {} : { pointer: `/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/${index}/breakImpulse` }), message: `${id} released early because its positional bind exceeded the authored break impulse.` });
    }
  }
  function checkpoint(): PhysicalContactBindCheckpoint3D[] { return [...active.values()].map((item) => ({ cueId: item.cue.id, endTick: item.endTick, point: [...item.point] })); }
  function restore(saved: readonly PhysicalContactBindCheckpoint3D[] | undefined): void {
    active.clear();
    for (const item of saved ?? []) {
      const cue = cues.get(item.cueId); if (cue === undefined) throw new Error(`Physical performance checkpoint bind ${item.cueId} is incompatible.`);
      const pointConstraintId = `${cue.id}__position`, rotationConstraintId = cue.rotationMode === "pivot" ? undefined : `${cue.id}__rotation`;
      if (!options.world.constraint(pointConstraintId) || rotationConstraintId && !options.world.constraint(rotationConstraintId)) throw new Error(`Physical performance checkpoint bind ${item.cueId} is missing its restored constraints.`);
      active.set(cue.id, { cue, endTick: nonnegativeInteger(item.endTick, "checkpoint bind endTick"), pointConstraintId, ...(rotationConstraintId ? { rotationConstraintId } : {}), point: vector(item.point, "checkpoint bind point") });
    }
  }
  function removeConstraints(item: ActiveBind): void { options.world.removeConstraint(item.pointConstraintId); if (item.rotationConstraintId) options.world.removeConstraint(item.rotationConstraintId); }
  return { begin, releaseDue, verify, checkpoint, restore };
}

function localPoint(body: RigidBodyState3D, point: readonly [number, number, number]): [number, number, number] {
  const x = point[0] - body.x, y = point[1] - body.y, z = point[2] - body.z, qx = -body.rotationX, qy = -body.rotationY, qz = -body.rotationZ, qw = body.rotationW;
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + qy * tz - qz * ty, y + qw * ty + qz * tx - qx * tz, z + qw * tz + qx * ty - qy * tx];
}
function authoredPoint(a: RigidBodyState3D, b: RigidBodyState3D, localA?: readonly [number, number, number], localB?: readonly [number, number, number]): [number, number, number] { const first = worldPoint(a, localA ?? [0, 0, 0]), second = worldPoint(b, localB ?? [0, 0, 0]); return [(first[0] + second[0]) * .5, (first[1] + second[1]) * .5, (first[2] + second[2]) * .5]; }
function worldPoint(body: RigidBodyState3D, point: readonly [number, number, number]): [number, number, number] { const [x, y, z] = point, qx = body.rotationX, qy = body.rotationY, qz = body.rotationZ, qw = body.rotationW, tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x); return [body.x + x + qw * tx + qy * tz - qz * ty, body.y + y + qw * ty + qz * tx - qx * tz, body.z + z + qw * tz + qx * ty - qy * tx]; }
function requireBody(world: RigidWorld3D, handle: number, cueId: string) { const body = world.body(handle); if (!body) throw new Error(`Physical bind ${cueId} references a missing body.`); return body; }
function copyReference(reference: PhysicalBodyReference3D): PhysicalBodyReference3D { return "bodyId" in reference ? { bodyId: reference.bodyId } : { ragdollId: reference.ragdollId, boneId: reference.boneId }; }
function vector(input: ArrayLike<number>, label: string): [number, number, number] { const value: [number, number, number] = [Number(input?.[0]), Number(input?.[1]), Number(input?.[2])]; if (!value.every(Number.isFinite)) throw new TypeError(`${label} must contain three finite numbers.`); return value; }
function nonnegativeInteger(value: number, label: string) { if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative integer.`); return value; }
