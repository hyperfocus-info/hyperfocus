import { tuple3 } from "../../math/tuples.ts";
import type { RigidConstraintTelemetry3D, RigidContact3D, RigidWorld3D } from "../rigid-3d.ts";

export type PhysicalActionPhase3D = "anticipation" | "contact" | "follow-through" | "consequence" | "recovery";
export type PhysicalActionState3D = { id: string; phase: PhysicalActionPhase3D; contactTick?: number; recoveryTick?: number; releaseTick?: number };
export type PhysicalActionCueSpec3D = {
  cueId: string;
  kind: "drive" | "launch";
  ragdollId: string;
  frame: number;
  pointer: string;
  actionId?: string;
  phase?: Exclude<PhysicalActionPhase3D, "consequence">;
  contactCueId?: string;
  consequenceFrames?: number;
  recoveryFrames?: number;
};
export type PhysicalActionLifecycleCheckpoint3D = { version: 1; active: Array<{ ragdollId: string; state: PhysicalActionState3D }>; canceledActionIds: string[]; completedActionIds?: string[] };

/** Owns causal action commitment independently from rendering and authored clip playback. */
export function createPhysicalActionLifecycle3D(options: { cues: readonly PhysicalActionCueSpec3D[]; stepsPerFrame: number }) {
  const stepsPerFrame = positiveInteger(options.stepsPerFrame, "action lifecycle stepsPerFrame"), definitions = validateActionDefinitions(options.cues), active = new Map<string, PhysicalActionState3D>(), canceledActionIds = new Set<string>(), completedActionIds = new Set<string>();
  const cueById = new Map(options.cues.map((cue) => [cue.cueId, cue] as const));

  function begin(cueId: string, authority: string, allowAuthorityOverride = false) {
    const cue = cueById.get(cueId); if (cue === undefined) throw new Error(`Physical action lifecycle cue ${cueId} does not exist.`);
    if (!cue.actionId) { const current = active.get(cue.ragdollId); return current !== undefined ? { allowed: false, reason: "conflict" as const, activeActionId: current.id } : { allowed: allowAuthorityOverride || authority === "ready", reason: "authority" as const }; }
    if (canceledActionIds.has(cue.actionId)) return { allowed: false, reason: "canceled" as const, actionId: cue.actionId };
    if (completedActionIds.has(cue.actionId)) return { allowed: false, reason: "completed" as const, actionId: cue.actionId };
    if (!allowAuthorityOverride && authority !== "ready") { cancel(cue.actionId); return { allowed: false, reason: "authority" as const, actionId: cue.actionId }; }
    const current = active.get(cue.ragdollId);
    if (current !== undefined && current.id !== cue.actionId) { canceledActionIds.add(cue.actionId); return { allowed: false, reason: "conflict" as const, actionId: cue.actionId, activeActionId: current.id }; }
    if (current === undefined) active.set(cue.ragdollId, { id: cue.actionId, phase: cue.phase ?? "contact" });
    else if (current.contactTick === undefined && phaseOrder(cue.phase ?? "contact") > phaseOrder(current.phase)) current.phase = cue.phase ?? "contact";
    return { allowed: true, actionId: cue.actionId };
  }

  function contact(launchCueId: string, simulationTick: number) {
    const definition = [...definitions.values()].find((item) => item.launchCueId === launchCueId); if (definition === undefined) return;
    const state = active.get(definition.ragdollId); if (state === undefined || state.id !== definition.id) return;
    const nextTick = nonnegativeInteger(simulationTick, "action contact simulationTick") + 1;
    state.phase = "consequence"; state.contactTick = simulationTick; state.recoveryTick = nextTick + definition.consequenceFrames * stepsPerFrame; state.releaseTick = state.recoveryTick + definition.recoveryFrames * stepsPerFrame;
  }

  function miss(launchCueId: string, simulationTick: number) {
    const definition = [...definitions.values()].find((item) => item.launchCueId === launchCueId); if (definition === undefined) return;
    const state = active.get(definition.ragdollId); if (state === undefined || state.id !== definition.id) return;
    const nextTick = nonnegativeInteger(simulationTick, "action miss simulationTick") + 1;
    state.phase = "recovery"; state.recoveryTick = nextTick; state.releaseTick = nextTick + definition.recoveryFrames * stepsPerFrame;
  }

  function advance(simulationTick: number, authority: (ragdollId: string) => string) {
    const interrupted: Array<{ ragdollId: string; actionId: string; authority: string }> = [];
    for (const [ragdollId, state] of active) {
      if (state.releaseTick !== undefined && simulationTick >= state.releaseTick) { active.delete(ragdollId); completedActionIds.add(state.id); continue; }
      if (state.recoveryTick !== undefined && simulationTick >= state.recoveryTick) state.phase = "recovery";
      const currentAuthority = authority(ragdollId);
      if (currentAuthority !== "ready" && !(state.phase === "recovery" && currentAuthority === "recovering")) { cancel(state.id); interrupted.push({ ragdollId, actionId: state.id, authority: currentAuthority }); }
    }
    return interrupted;
  }

  function cancel(actionId: string) { canceledActionIds.add(actionId); for (const [ragdollId, state] of active) if (state.id === actionId) active.delete(ragdollId); }
  function state(ragdollId: string): PhysicalActionState3D | undefined { const value = active.get(ragdollId); return value !== undefined ? { ...value } : undefined; }
  function checkpoint(): PhysicalActionLifecycleCheckpoint3D { return { version: 1, active: [...active].map(([ragdollId, state]) => ({ ragdollId, state: { ...state } })), canceledActionIds: [...canceledActionIds], completedActionIds: [...completedActionIds] }; }
  function restoreCheckpoint(value: Readonly<PhysicalActionLifecycleCheckpoint3D>) {
    if (!value || value.version !== 1) throw new Error("Physical action lifecycle checkpoint is incompatible.");
    active.clear(); canceledActionIds.clear(); completedActionIds.clear();
    for (const item of value.active) { const definition = definitions.get(item.state.id); if (!definition || definition.ragdollId !== item.ragdollId || active.has(item.ragdollId)) throw new Error(`Physical action lifecycle checkpoint action ${item.state.id} is incompatible.`); active.set(item.ragdollId, restoreActionState(item.state)); }
    for (const actionId of value.canceledActionIds) { if (!definitions.has(actionId)) throw new Error(`Physical action lifecycle checkpoint canceled action ${actionId} is incompatible.`); canceledActionIds.add(actionId); }
    for (const actionId of value.completedActionIds ?? []) { if (!definitions.has(actionId)) throw new Error(`Physical action lifecycle checkpoint completed action ${actionId} is incompatible.`); completedActionIds.add(actionId); }
  }

  return { definitions, begin, contact, miss, advance, state, checkpoint, restoreCheckpoint };
}

function validateActionDefinitions(cues: readonly PhysicalActionCueSpec3D[]) {
  const definitions = new Map<string, { id: string; ragdollId: string; launchCueId: string; consequenceFrames: number; recoveryFrames: number }>();
  for (const cue of cues) {
    if (!cue.actionId && (cue.consequenceFrames !== undefined || cue.recoveryFrames !== undefined)) throw new Error(`${cue.cueId} action timing needs an actionId. Project pointer: ${cue.pointer}/actionId.`);
    if (!cue.actionId || cue.kind !== "launch") continue;
    const id = text(cue.actionId, `${cue.cueId} actionId`); if (definitions.has(id)) throw new Error(`${cue.cueId} repeats physical action ${id}. Project pointer: ${cue.pointer}/actionId. Each action needs exactly one lifecycle launch.`);
    const consequenceFrames = nonnegativeInteger(cue.consequenceFrames ?? 0, `${cue.cueId} consequenceFrames`), recoveryFrames = nonnegativeInteger(cue.recoveryFrames ?? 1, `${cue.cueId} recoveryFrames`);
    if (consequenceFrames + recoveryFrames < 1) throw new Error(`${cue.cueId} action lifecycle needs at least one consequence or recovery frame. Project pointer: ${cue.pointer}/recoveryFrames.`);
    definitions.set(id, { id, ragdollId: cue.ragdollId, launchCueId: cue.cueId, consequenceFrames, recoveryFrames });
  }
  for (const cue of cues) {
    if (!cue.actionId || cue.kind === "launch") continue;
    const definition = definitions.get(cue.actionId); if (definition === undefined) throw new Error(`${cue.cueId} action ${cue.actionId} has no lifecycle launch. Project pointer: ${cue.pointer}/actionId. Add one launch with the same action ID or clear this optional chain.`);
    if (definition.ragdollId !== cue.ragdollId) throw new Error(`${cue.cueId} action ${cue.actionId} belongs to ${definition.ragdollId}, not ${cue.ragdollId}. Project pointer: ${cue.pointer}/actionId.`);
    if (cue.contactCueId && cue.contactCueId !== definition.launchCueId) throw new Error(`${cue.cueId} action ${cue.actionId} anchors to ${cue.contactCueId}, not lifecycle launch ${definition.launchCueId}. Project pointer: ${cue.pointer}/afterContact/cueId.`);
  }
  return definitions;
}

function restoreActionState(value: Readonly<PhysicalActionState3D>): PhysicalActionState3D {
  const phase = value.phase; if (!["anticipation", "contact", "follow-through", "consequence", "recovery"].includes(phase)) throw new Error(`Physical action lifecycle checkpoint phase ${String(phase)} is incompatible.`);
  const optionalTick = (tick: number | undefined, label: string) => tick === undefined ? undefined : nonnegativeInteger(tick, label);
  return { id: text(value.id, "checkpoint action id"), phase, ...optional("contactTick", optionalTick(value.contactTick, "checkpoint action contactTick")), ...optional("recoveryTick", optionalTick(value.recoveryTick, "checkpoint action recoveryTick")), ...optional("releaseTick", optionalTick(value.releaseTick, "checkpoint action releaseTick")) };
}
function optional<Key extends string, Value>(key: Key, value: Value | undefined): { [K in Key]?: Value } { const result: { [K in Key]?: Value } = {}; if (value !== undefined) result[key] = value; return result; }
function phaseOrder(value: PhysicalActionPhase3D) { return value === "anticipation" ? 0 : value === "contact" ? 1 : value === "follow-through" ? 2 : value === "consequence" ? 3 : 4; }
function text(value: string, label: string) { if (typeof value !== "string" || !value.trim() || value.length > 160) throw new TypeError(`${label} must be non-empty text no longer than 160 characters.`); return value; }
function nonnegativeInteger(value: number, label: string) { if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) throw new RangeError(`${label} must be a non-negative safe integer.`); return value; }

export type PhysicalPerformanceQualityGates3D = {
  maximumPenetrationMeters?: number;
  maximumUnforcedAcceleration?: number;
  maximumJointLimitExcessRadians?: number;
  jointLimitSaturationFrames?: number;
};

export type PhysicalQualityBody3D = { handle: number; id: string; pointer: string; gravityScale: number; constrained: boolean };
export type PhysicalQualityLimit3D = { handle: number; id: string; pointer: string; aHandle: number; bHandle: number };
export type PhysicalQualityFinding3D = {
  code: "severe-penetration" | "unforced-acceleration" | "joint-limit-saturation";
  scopeId: string;
  frame: number;
  pointer: string;
  message: string;
  /** Exact solver-space evidence captured when the finding is emitted. */
  position: [number, number, number];
  /** Second body center for joint-span evidence. */
  secondaryPosition?: [number, number, number];
};
export type PhysicalPerformanceQualityCheckpoint3D = { version: 1; gates: ReturnType<typeof normalize>; previous: Array<[number, number, number, number]>; saturationTicks: Array<[number, number]>; reported: string[] };

export function validatePhysicalPerformanceQualityGates3D(value: PhysicalPerformanceQualityGates3D | undefined) { return normalize(value); }

export function createPhysicalPerformanceQualityMonitor3D(options: {
  world: RigidWorld3D;
  gates?: PhysicalPerformanceQualityGates3D;
  frameRate: number;
  simulationHz: number;
  gravity: readonly [number, number, number];
  bodies: readonly PhysicalQualityBody3D[];
  limits: readonly PhysicalQualityLimit3D[];
}) {
  const gates = normalize(options.gates), seconds = 1 / options.simulationHz, stepsPerFrame = options.simulationHz / options.frameRate;
  const previous = new Map(options.bodies.map((item) => { const body = requireBody(options.world, item.handle, item.id); return [item.handle, tuple3(body.velocityX, body.velocityY, body.velocityZ)] as const; }));
  const saturationTicks = new Map<number, number>(), reported = new Set<string>(), contact = emptyContact(), telemetry = emptyTelemetry();

  function inspectStep(frame: number, forcedHandles: ReadonlySet<number>): PhysicalQualityFinding3D[] {
    const findings: PhysicalQualityFinding3D[] = [], contactHandles = new Set<number>();
    for (let index = 0; index < options.world.contactCount(); index += 1) {
      options.world.contact(index, contact); contactHandles.add(contact.a); contactHandles.add(contact.b);
      const key = `penetration:${Math.min(contact.a, contact.b)}:${Math.max(contact.a, contact.b)}`;
      if (!contact.trigger && contact.penetration > gates.maximumPenetrationMeters && !reported.has(key)) {
        reported.add(key); const body = options.bodies.find((item) => item.handle === contact.a) ?? options.bodies.find((item) => item.handle === contact.b);
        findings.push({ code: "severe-penetration", scopeId: `${contact.aId}/${contact.bId}`, frame, pointer: body?.pointer ?? "/extensions/hyperfocus3DVideo/physicalPerformance/simulation", message: `${contact.aId} and ${contact.bId} overlap by ${contact.penetration.toFixed(3)}m, above the ${gates.maximumPenetrationMeters.toFixed(3)}m delivery gate. Separate the colliders, enable continuous collision on the fast body, or increase simulationHz.`, position: [contact.pointX, contact.pointY, contact.pointZ] });
      }
    }
    for (const item of options.bodies) {
      const body = requireBody(options.world, item.handle, item.id), prior = previous.get(item.handle)!;
      const ax = (body.velocityX - prior[0]) / seconds - options.gravity[0] * item.gravityScale, ay = (body.velocityY - prior[1]) / seconds - options.gravity[1] * item.gravityScale, az = (body.velocityZ - prior[2]) / seconds - options.gravity[2] * item.gravityScale;
      prior[0] = body.velocityX; prior[1] = body.velocityY; prior[2] = body.velocityZ;
      const acceleration = Math.hypot(ax, ay, az), key = `acceleration:${item.handle}`;
      if (acceleration > gates.maximumUnforcedAcceleration && !item.constrained && !contactHandles.has(item.handle) && !forcedHandles.has(item.handle) && !reported.has(key)) {
        reported.add(key); findings.push({ code: "unforced-acceleration", scopeId: item.id, frame, pointer: item.pointer, message: `${item.id} changes velocity at ${acceleration.toFixed(1)}m/s² without a contact, constraint, gravity, or authored actuator; the delivery gate is ${gates.maximumUnforcedAcceleration.toFixed(1)}m/s². Remove direct state mutation or author a launch/recovery force.`, position: [body.x, body.y, body.z] });
      }
    }
    for (const item of options.limits) {
      const state = options.world.constraintTelemetry(item.handle, telemetry), saturated = !!state?.saturated && state.error > gates.maximumJointLimitExcessRadians;
      const ticks = saturated ? (saturationTicks.get(item.handle) ?? 0) + 1 : 0; saturationTicks.set(item.handle, ticks);
      const key = `limit:${item.handle}`, required = gates.jointLimitSaturationFrames * stepsPerFrame;
      if (ticks >= required && !reported.has(key)) {
        const a = requireBody(options.world, item.aHandle, `${item.id} parent`), b = requireBody(options.world, item.bHandle, `${item.id} child`);
        reported.add(key); findings.push({ code: "joint-limit-saturation", scopeId: item.id, frame, pointer: item.pointer, message: `${item.id} remains ${((state?.error ?? 0) * 180 / Math.PI).toFixed(1)}° beyond its angular envelope while torque-limited for ${gates.jointLimitSaturationFrames} frames. Widen the envelope, increase limit torque, reduce the applied force, or revise the pose.`, position: [(a.x + b.x) * .5, (a.y + b.y) * .5, (a.z + b.z) * .5], secondaryPosition: [b.x, b.y, b.z] });
      }
    }
    return findings;
  }

  function checkpoint(): PhysicalPerformanceQualityCheckpoint3D { return { version: 1, gates: { ...gates }, previous: [...previous].map(([handle, velocity]) => [handle, velocity[0], velocity[1], velocity[2]]), saturationTicks: [...saturationTicks], reported: [...reported] }; }

  function restoreCheckpoint(value: Readonly<PhysicalPerformanceQualityCheckpoint3D>) {
    if (!value || value.version !== 1 || JSON.stringify(value.gates) !== JSON.stringify(gates)) throw new Error("Physical quality checkpoint uses incompatible gates.");
    const handles = new Set(options.bodies.map((item) => item.handle));
    if (value.previous.length !== handles.size || value.previous.some(([handle]) => !handles.has(handle))) throw new Error("Physical quality checkpoint body topology is incompatible.");
    previous.clear(); for (const [handle, x, y, z] of value.previous) previous.set(handle, [finite(x, "quality previous velocity"), finite(y, "quality previous velocity"), finite(z, "quality previous velocity")]);
    saturationTicks.clear(); for (const [handle, ticks] of value.saturationTicks) { if (!Number.isSafeInteger(ticks) || ticks < 0 || !options.limits.some((item) => item.handle === handle)) throw new Error("Physical quality checkpoint saturation state is invalid."); saturationTicks.set(handle, ticks); }
    reported.clear(); for (const key of value.reported) { if (typeof key !== "string" || !key) throw new Error("Physical quality checkpoint report key is invalid."); reported.add(key); }
  }

  return { gates, inspectStep, checkpoint, restoreCheckpoint };
}

function normalize(value: PhysicalPerformanceQualityGates3D | undefined) { const gates = value ?? {}; return { maximumPenetrationMeters: positive(gates.maximumPenetrationMeters ?? .12, "maximumPenetrationMeters"), maximumUnforcedAcceleration: positive(gates.maximumUnforcedAcceleration ?? 300, "maximumUnforcedAcceleration"), maximumJointLimitExcessRadians: positive(gates.maximumJointLimitExcessRadians ?? .12, "maximumJointLimitExcessRadians"), jointLimitSaturationFrames: positiveInteger(gates.jointLimitSaturationFrames ?? 6, "jointLimitSaturationFrames") }; }
function requireBody(world: RigidWorld3D, handle: number, id: string) { const body = world.body(handle); if (!body) throw new Error(`Physical quality body ${id} does not exist.`); return body; }
function emptyContact(): RigidContact3D { return { a: 0, b: 0, aId: "", bId: "", normalX: 0, normalY: 0, normalZ: 0, penetration: 0, pointX: 0, pointY: 0, pointZ: 0, trigger: false, closingSpeedMetersPerSecond: 0, effectiveMassKg: 0, impactEnergyJoules: 0, normalImpulseNewtonSeconds: 0, breakthrough: false }; }
function emptyTelemetry(): RigidConstraintTelemetry3D { return { handle: 0, id: "", kind: "distance", error: 0, appliedImpulse: 0, saturated: false }; }
function positive(value: number, label: string) { if (!Number.isFinite(value) || value <= 0 || value > 1e12) throw new RangeError(`${label} must be a positive finite number.`); return value; }
function positiveInteger(value: number, label: string) { if (!Number.isSafeInteger(value) || value <= 0 || value > 1_000_000) throw new RangeError(`${label} must be a positive safe integer.`); return value; }
function finite(value: number, label: string) { if (!Number.isFinite(value) || Math.abs(value) > 1e12) throw new RangeError(`${label} must be finite.`); return value; }
