import { tuple3 } from "../math/tuples.ts";
import { PHYSICAL_BODY_STATE_STRIDE_3D, samplePhysicalBodyMotion3D, type CompiledPhysicalPerformance3D, type PhysicalBodyReference3D, type PhysicalPerformance3D, type PhysicalPerformanceDiagnostic3D } from "../physics/physical-performance-3d.ts";
import { closestExpandedSupportPoint3D } from "../physics/ragdoll-3d-balance.ts";
import type { Hyperfocus3DTimeline, Hyperfocus3DVec3 } from "./3d.ts";

export type Hyperfocus3DPhysicalInspectionSettings = {
  enabled: boolean;
  ragdollId?: string;
  centerOfMass: boolean;
  supports: boolean;
  intentVectors: boolean;
  contacts: boolean;
  velocities: boolean;
  /** Missing legacy values default on so old inspection documents gain actionable evidence. */
  qualityFindings?: boolean;
  /** Missing legacy values default on so old inspection documents expose material failure evidence. */
  breakEnergy?: boolean;
  /** Checks state changes against integrated solver velocity instead of treating intentional speed as a pop. */
  motionQuality?: boolean;
  maximumTranslationResidualMeters?: number;
  maximumRotationResidualDegrees?: number;
  /** Shared bounded evidence window for contacts, quality findings, and breaks. */
  contactHistoryFrames: number;
};

type QualityCode3D = Extract<PhysicalPerformanceDiagnostic3D["code"], "severe-penetration" | "unforced-acceleration" | "joint-limit-saturation">;

export type Hyperfocus3DPhysicalInspection = {
  frameIndex: number;
  ragdolls: Array<{ id: string; centerOfMass: Hyperfocus3DVec3; predictedCenterOfMass: Hyperfocus3DVec3; velocity: Hyperfocus3DVec3; supportPoints: Array<{ cueId: string; boneId: string; position: Hyperfocus3DVec3; radius: number; status: "active" | "failed" }>; supportHull: Hyperfocus3DVec3[]; closestSupportPoint: Hyperfocus3DVec3; balanceDistance: number; predictedBalanceDistance: number }>;
  intents: Array<{ id: string; kind: "launch" | "effector-drive"; ragdollId: string; boneId: string; phase?: string; from: Hyperfocus3DVec3; actual: Hyperfocus3DVec3; plannedTo: Hyperfocus3DVec3; velocity: Hyperfocus3DVec3; angularVelocity: Hyperfocus3DVec3; contactFrame?: number }>;
  contacts: Array<{ id: string; frame: number; point: Hyperfocus3DVec3; normal: Hyperfocus3DVec3; speed: number; energy: number; impulse: number }>;
  qualityFindings: Array<{ code: QualityCode3D; frame: number; scopeId: string; pointer?: string; message: string; position: Hyperfocus3DVec3; secondaryPosition?: Hyperfocus3DVec3; location: string }>;
  motionFindings: Array<{ code: "position-pop" | "rotation-pop"; frame: number; reference: string; pointer: string; message: string; position: Hyperfocus3DVec3; value: number; threshold: number }>;
  breaks: Array<{ id: string; groupId?: string; frame: number; point: Hyperfocus3DVec3; cause: "stress" | "impact"; energy?: number; threshold?: number; retainedEnergyRatio?: number; speed?: number; impulse?: number }>;
};

/** Deterministic authoring evidence derived from the same compiled body states used by runtime rendering. */
export function sample3DPhysicalInspection(timeline: Readonly<Pick<Hyperfocus3DTimeline, "physicalInspection" | "physicalPerformance">> | undefined, source: Readonly<CompiledPhysicalPerformance3D> | undefined, frame: number): Hyperfocus3DPhysicalInspection | undefined {
  const settings = timeline?.physicalInspection, performance = timeline?.physicalPerformance?.simulation;
  if (!settings?.enabled || !performance || !source) return undefined;
  frame = Math.max(0, Math.min(source.durationFrames - 1, Math.floor(frame)));
  const indices = new Map(source.bodyReferences.map((reference, index) => [referenceKey(reference), index])), cache = new Map<number, Float32Array>();
  const state = (at: number) => { at = Math.max(0, Math.min(source.durationFrames - 1, at)); let value = cache.get(at); if (!value) { value = new Float32Array(source.frameStride); source.writeFrame(at, value); cache.set(at, value); } return value; };
  const body = (reference: PhysicalBodyReference3D, at = frame) => { const index = indices.get(referenceKey(reference)); if (index === undefined) throw new Error(`Physical inspection references missing body ${referenceKey(reference)}.`); const values = state(at), offset = index * PHYSICAL_BODY_STATE_STRIDE_3D; return { position: tuple3(values[offset]!, values[offset + 1]!, values[offset + 2]!), velocity: tuple3(values[offset + 7]!, values[offset + 8]!, values[offset + 9]!), angularVelocity: tuple3(values[offset + 10]!, values[offset + 11]!, values[offset + 12]!) }; };
  const bodyPosition = (reference: PhysicalBodyReference3D, at: number) => indices.has(referenceKey(reference)) ? body(reference, at).position : initialBodyPosition(performance, reference);
  const selected = (id: string) => !settings.ragdollId || settings.ragdollId === id;
  const ragdolls = performance.ragdolls.filter((ragdoll) => selected(ragdoll.id)).map((ragdoll) => {
    let mass = 0; const center: Hyperfocus3DVec3 = [0, 0, 0], velocity: Hyperfocus3DVec3 = [0, 0, 0];
    for (const item of ragdoll.bodies) { const weight = item.body.mass ?? 1, sampled = body({ ragdollId: ragdoll.id, boneId: item.boneId }); mass += weight; for (let axis = 0; axis < 3; axis += 1) { center[axis] += sampled.position[axis] * weight; velocity[axis] += sampled.velocity[axis] * weight; } }
    for (let axis = 0; axis < 3; axis += 1) { center[axis] /= mass; velocity[axis] /= mass; }
    const supportCues = performance.cues.filter((cue): cue is Extract<PhysicalPerformance3D["cues"][number], { kind: "support" | "step" }> => (cue.kind === "support" || cue.kind === "step") && cue.ragdollId === ragdoll.id && frame >= cue.frame && frame < cue.frame + cue.durationFrames + (cue.kind === "step" ? cue.holdFrames : 0));
    const supportPoints = supportCues.map((cue) => { const failed = source.diagnostics.some((item) => item.cueId === cue.id && item.frame <= frame && ["support-broke", "step-broke", "step-missed"].includes(item.code)), sampled = body({ ragdollId: ragdoll.id, boneId: cue.boneId }); return { cueId: cue.id, boneId: cue.boneId, position: sampled.position, radius: cue.kind === "support" ? cue.balanceRadiusMeters ?? .12 : cue.landingTolerance ?? .08, status: failed ? "failed" as const : "active" as const }; });
    const active = supportPoints.filter((item) => item.status === "active"), points = new Float64Array(active.flatMap((item) => [item.position[0], item.position[2]])), order = new Uint32Array(active.length), hull = new Uint32Array(Math.max(1, active.length * 2)), closest = new Float64Array(2), radius = active.reduce((maximum, item) => Math.max(maximum, item.radius), 0), prediction = supportCues.reduce((maximum, cue) => Math.max(maximum, cue.predictionSeconds ?? (cue.kind === "support" ? .18 : .25)), 0), predictedCenterOfMass: Hyperfocus3DVec3 = [center[0] + velocity[0] * prediction, center[1] + velocity[1] * prediction, center[2] + velocity[2] * prediction];
    const balanceDistance = active.length ? closestExpandedSupportPoint3D(points, active.length, center[0], center[2], radius, order, hull, closest) : -1, closestSupportPoint: Hyperfocus3DVec3 = [active.length ? closest[0] : center[0], active.reduce((sum, item) => sum + item.position[1], 0) / Math.max(1, active.length), active.length ? closest[1] : center[2]];
    const predictedBalanceDistance = active.length ? closestExpandedSupportPoint3D(points, active.length, predictedCenterOfMass[0], predictedCenterOfMass[2], radius, order, hull, new Float64Array(2)) : -1;
    return { id: ragdoll.id, centerOfMass: center, predictedCenterOfMass, velocity, supportPoints, supportHull: supportHull(active.map((item) => item.position)), closestSupportPoint, balanceDistance, predictedBalanceDistance };
  });
  const cueStart = (cue: Extract<PhysicalPerformance3D["cues"][number], { kind: "effector-drive" }>) => { const contact = cue.afterContact ? source.contacts.find((item) => item.cueId === cue.afterContact!.cueId) : undefined; return cue.afterContact ? contact === undefined ? undefined : contact.frame + cue.afterContact.offsetFrames : cue.frame; };
  const intents = performance.cues.flatMap((cue) => {
    if (cue.kind !== "launch" && cue.kind !== "effector-drive") return [];
    const ragdollId = cue.kind === "launch" ? cue.attacker.ragdollId : cue.ragdollId; if (!selected(ragdollId)) return [];
    const boneId = cue.kind === "launch" ? cue.attacker.boneId : cue.effectorBoneId, start = cue.kind === "launch" ? cue.frame : cueStart(cue); if (start === undefined) return [];
    const contact = cue.kind === "launch" ? source.contacts.find((item) => item.cueId === cue.id) : cue.stopAtContact ? source.contacts.find((item) => item.cueId === cue.stopAtContact!.cueId) : undefined, miss = cue.kind === "launch" ? source.diagnostics.find((item) => item.cueId === cue.id && item.code === "launch-missed") : undefined, end = cue.kind === "effector-drive" ? start + cue.durationFrames - 1 : contact?.frame ?? miss?.frame ?? start + Math.ceil(((cue.distanceMeters ?? .5) / cue.speedMetersPerSecond) * performance.frameRate * 2);
    if (frame < start || frame > end + settings.contactHistoryFrames) return [];
    const reference: PhysicalBodyReference3D = { ragdollId, boneId }, initial = body(reference, start), actual = body(reference), target = cue.kind === "launch" && cue.targeting === "target-at-launch" && cue.target ? body(cue.target, start).position : undefined, direction = target ? normalizedVector([target[0] - initial.position[0], target[1] - initial.position[1], target[2] - initial.position[2]]) : normalizedVector(cue.direction ?? [0, 0, 0]), distance = cue.kind === "launch" ? cue.distanceMeters ?? (target ? Math.hypot(target[0] - initial.position[0], target[1] - initial.position[1], target[2] - initial.position[2]) : 0) : cue.distanceMeters, plannedTo = target ?? tuple3(initial.position[0] + direction[0] * distance, initial.position[1] + direction[1] * distance, initial.position[2] + direction[2] * distance);
    return [{ id: cue.id, kind: cue.kind, ragdollId, boneId, ...(cue.kind === "effector-drive" && cue.phase ? { phase: cue.phase } : {}), from: initial.position, actual: actual.position, plannedTo, velocity: actual.velocity, angularVelocity: actual.angularVelocity, ...(contact ? { contactFrame: contact.frame } : {}) }];
  });
  const inHistory = (at: number) => frame - at >= 0 && frame - at <= settings.contactHistoryFrames;
  const contacts = source.contacts.filter((event) => inHistory(event.frame) && (!settings.ragdollId || referenceRagdoll(event.attacker) === settings.ragdollId || referenceRagdoll(event.target) === settings.ragdollId)).map((event) => ({ id: event.cueId, frame: event.frame, point: copy3(event.point), normal: copy3(event.normal), speed: event.closingSpeedMetersPerSecond, energy: event.impactEnergyJoules, impulse: event.normalImpulseNewtonSeconds }));
  const physicalReferences = new Map<string, PhysicalBodyReference3D>();
  for (const item of performance.bodies ?? []) physicalReferences.set(item.id, { bodyId: item.id });
  for (const ragdoll of performance.ragdolls) for (const item of ragdoll.bodies) physicalReferences.set(`${ragdoll.id}:${item.boneId}`, { ragdollId: ragdoll.id, boneId: item.boneId });
  const includeReference = (reference: PhysicalBodyReference3D | undefined) => !settings.ragdollId || referenceRagdoll(reference) === settings.ragdollId;
  const qualityFindings = source.diagnostics.flatMap<Hyperfocus3DPhysicalInspection["qualityFindings"][number]>((diagnostic) => {
    if (!isQualityCode(diagnostic.code) || !inHistory(diagnostic.frame)) return [];
    if (diagnostic.code === "unforced-acceleration") { const reference = physicalReferences.get(diagnostic.cueId); if (!reference || !includeReference(reference)) return []; const position = diagnostic.position ? copy3(diagnostic.position) : bodyPosition(reference, diagnostic.frame); return [{ ...copyFinding(diagnostic), position, location: referenceLabel(reference) }]; }
    if (diagnostic.code === "joint-limit-saturation") { const located = locateJoint(performance, diagnostic.cueId); if (!located || !selected(located.ragdollId)) return []; const parentReference = { ragdollId: located.ragdollId, boneId: located.parentBoneId } as const, childReference = { ragdollId: located.ragdollId, boneId: located.childBoneId } as const, parent = bodyPosition(parentReference, diagnostic.frame), child = diagnostic.secondaryPosition ? copy3(diagnostic.secondaryPosition) : bodyPosition(childReference, diagnostic.frame); return [{ ...copyFinding(diagnostic), position: diagnostic.position ? copy3(diagnostic.position) : midpoint(parent, child), secondaryPosition: child, location: `${located.ragdollId}/${located.jointId}` }]; }
    const pair = locatePhysicalPair(physicalReferences, diagnostic.cueId); if (!pair || !includeReference(pair[0]) && !includeReference(pair[1])) return []; const a = bodyPosition(pair[0], diagnostic.frame), b = bodyPosition(pair[1], diagnostic.frame); return [{ ...copyFinding(diagnostic), position: diagnostic.position ? copy3(diagnostic.position) : midpoint(a, b), secondaryPosition: b, location: `${referenceLabel(pair[0])} / ${referenceLabel(pair[1])} contact` }];
  });
  const motionFindings = (settings.motionQuality ?? true) && frame > 0 ? source.bodyReferences.flatMap<Hyperfocus3DPhysicalInspection["motionFindings"][number]>((reference) => {
    if (settings.ragdollId && referenceRagdoll(reference) !== settings.ragdollId) return [];
    const summary = samplePhysicalBodyMotion3D({ performance: source, reference, startFrame: Math.max(0, frame - Math.max(1, settings.contactHistoryFrames)), endFrame: frame }), pointer = referencePointer(performance, reference), label = referenceLabel(reference), findings: Hyperfocus3DPhysicalInspection["motionFindings"] = [], translationLimit = settings.maximumTranslationResidualMeters ?? .08, rotationLimit = settings.maximumRotationResidualDegrees ?? 12;
    if (summary.maximumFrameTranslationResidualMeters > translationLimit) findings.push({ code: "position-pop", frame: summary.maximumFrameTranslationResidualFrame, reference: label, pointer, message: `${label} moved ${summary.maximumFrameTranslationResidualMeters.toFixed(3)}m beyond its integrated solver velocity. Use a force, contact, constraint, or blended physical recovery instead of a direct state jump.`, position: bodyPosition(reference, summary.maximumFrameTranslationResidualFrame), value: summary.maximumFrameTranslationResidualMeters, threshold: translationLimit });
    if (summary.maximumFrameRotationResidualDegrees > rotationLimit) findings.push({ code: "rotation-pop", frame: summary.maximumFrameRotationResidualFrame, reference: label, pointer, message: `${label} rotated ${summary.maximumFrameRotationResidualDegrees.toFixed(1)}° beyond its integrated angular velocity. Drive rotation through torque, momentum, or a protected authority blend.`, position: bodyPosition(reference, summary.maximumFrameRotationResidualFrame), value: summary.maximumFrameRotationResidualDegrees, threshold: rotationLimit });
    return findings;
  }) : [];
  const breaks = source.breaks.filter((event) => inHistory(event.frame) && (!settings.ragdollId || referenceRagdoll(event.a) === settings.ragdollId || referenceRagdoll(event.b) === settings.ragdollId || source.contacts.some((contact) => contact.frame === event.frame && contact.failedBodyId && [physicalId(event.a), physicalId(event.b)].includes(contact.failedBodyId) && (referenceRagdoll(contact.attacker) === settings.ragdollId || referenceRagdoll(contact.target) === settings.ragdollId)))).map((event) => {
    const failedId = source.contacts.find((contact) => contact.breakthrough && contact.frame === event.frame && contact.failedBodyId && [physicalId(event.a), physicalId(event.b)].includes(contact.failedBodyId))?.failedBodyId;
    const impact = failedId ? impactResponse(performance, physicalReferences.get(failedId)) : impactResponse(performance, event.a) ?? impactResponse(performance, event.b);
    return { id: event.constraintId, ...(event.groupId ? { groupId: event.groupId } : {}), frame: event.frame, point: copy3(event.point), cause: event.cause ?? (event.impactEnergyJoules === undefined ? "stress" : "impact"), ...(event.impactEnergyJoules === undefined ? {} : { energy: event.impactEnergyJoules }), ...(impact ? { threshold: impact.fractureEnergyJoules, retainedEnergyRatio: impact.retainedEnergyRatio } : {}), ...(event.closingSpeedMetersPerSecond === undefined ? {} : { speed: event.closingSpeedMetersPerSecond }), ...(event.normalImpulseNewtonSeconds === undefined ? {} : { impulse: event.normalImpulseNewtonSeconds }) };
  });
  return { frameIndex: frame, ragdolls, intents, contacts, qualityFindings, motionFindings, breaks };
}

function copyFinding(diagnostic: PhysicalPerformanceDiagnostic3D) { if (!isQualityCode(diagnostic.code)) throw new Error(`Not a quality finding: ${diagnostic.code}`); return { code: diagnostic.code, frame: diagnostic.frame, scopeId: diagnostic.cueId, ...(diagnostic.pointer ? { pointer: diagnostic.pointer } : {}), message: diagnostic.message }; }
function isQualityCode(code: PhysicalPerformanceDiagnostic3D["code"]): code is QualityCode3D { return code === "severe-penetration" || code === "unforced-acceleration" || code === "joint-limit-saturation"; }
function locateJoint(performance: Readonly<PhysicalPerformance3D>, scopeId: string) { for (const ragdoll of performance.ragdolls) for (const joint of ragdoll.joints) if (`${ragdoll.id}/${joint.id}` === scopeId) return { ragdollId: ragdoll.id, jointId: joint.id, parentBoneId: joint.parentBoneId, childBoneId: joint.childBoneId }; return undefined; }
function locatePhysicalPair(references: ReadonlyMap<string, PhysicalBodyReference3D>, scopeId: string): [PhysicalBodyReference3D, PhysicalBodyReference3D] | undefined { const entries = [...references]; for (const [aId, a] of entries) for (const [bId, b] of entries) if (aId !== bId && (`${aId}/${bId}` === scopeId || `${bId}/${aId}` === scopeId)) return [a, b]; return undefined; }
function impactResponse(performance: Readonly<PhysicalPerformance3D>, reference: PhysicalBodyReference3D | undefined) { if (!reference) return undefined; if ("bodyId" in reference) return performance.bodies?.find((item) => item.id === reference.bodyId)?.impactResponse; return performance.ragdolls.find((item) => item.id === reference.ragdollId)?.bodies.find((item) => item.boneId === reference.boneId)?.body.impactResponse; }
function initialBodyPosition(performance: Readonly<PhysicalPerformance3D>, reference: PhysicalBodyReference3D): Hyperfocus3DVec3 { const definition = "bodyId" in reference ? performance.bodies?.find((item) => item.id === reference.bodyId) : performance.ragdolls.find((item) => item.id === reference.ragdollId)?.bodies.find((item) => item.boneId === reference.boneId)?.body; return [definition?.x ?? 0, definition?.y ?? 0, definition?.z ?? 0]; }
function supportHull(points: Hyperfocus3DVec3[]): Hyperfocus3DVec3[] { if (points.length <= 2) return points.map(copy3); const sorted = [...points].sort((a, b) => a[0] - b[0] || a[2] - b[2]), cross = (a: Hyperfocus3DVec3, b: Hyperfocus3DVec3, c: Hyperfocus3DVec3) => (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]), half = (values: Hyperfocus3DVec3[]) => { const output: Hyperfocus3DVec3[] = []; for (const point of values) { while (output.length >= 2 && cross(output.at(-2)!, output.at(-1)!, point) <= 0) output.pop(); output.push(point); } return output; }, lower = half(sorted), upper = half(sorted.reverse()); return [...lower.slice(0, -1), ...upper.slice(0, -1)].map(copy3); }
function normalizedVector(value: readonly number[]): Hyperfocus3DVec3 { const length = Math.hypot(value[0]!, value[1]!, value[2]!); return length <= 1e-12 ? [0, 0, 0] : [value[0]! / length, value[1]! / length, value[2]! / length]; }
function referenceRagdoll(reference: PhysicalBodyReference3D | undefined) { return reference && "ragdollId" in reference ? reference.ragdollId : undefined; }
function referenceLabel(reference: PhysicalBodyReference3D) { return "bodyId" in reference ? reference.bodyId : `${reference.ragdollId}/${reference.boneId}`; }
function physicalId(reference: PhysicalBodyReference3D) { return "bodyId" in reference ? reference.bodyId : `${reference.ragdollId}:${reference.boneId}`; }
function referenceKey(reference: PhysicalBodyReference3D) { return "bodyId" in reference ? `body:${reference.bodyId}` : `ragdoll:${reference.ragdollId}:${reference.boneId}`; }
function referencePointer(performance: Readonly<PhysicalPerformance3D>, reference: PhysicalBodyReference3D) { if ("bodyId" in reference) return `/extensions/hyperfocus3DVideo/physicalPerformance/simulation/bodies/${performance.bodies?.findIndex((item) => item.id === reference.bodyId) ?? -1}`; const ragdollIndex = performance.ragdolls.findIndex((item) => item.id === reference.ragdollId), bodyIndex = performance.ragdolls[ragdollIndex]?.bodies.findIndex((item) => item.boneId === reference.boneId) ?? -1; return `/extensions/hyperfocus3DVideo/physicalPerformance/simulation/ragdolls/${ragdollIndex}/bodies/${bodyIndex}`; }
function midpoint(a: Hyperfocus3DVec3, b: Hyperfocus3DVec3): Hyperfocus3DVec3 { return [(a[0] + b[0]) * .5, (a[1] + b[1]) * .5, (a[2] + b[2]) * .5]; }
function copy3(value: readonly number[]): Hyperfocus3DVec3 { return [value[0]!, value[1]!, value[2]!]; }
