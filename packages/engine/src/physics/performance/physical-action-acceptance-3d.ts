import { tuple4 } from "../../math/tuples.ts";
import {
  PHYSICAL_BODY_STATE_STRIDE_3D,
  type CompiledPhysicalPerformance3D,
  type PhysicalBodyReference3D,
  type PhysicalContactEvent3D,
} from "../physical-performance-3d.ts";

export type PhysicalBodyMotionSample3D = {
  frame: number;
  position: [number, number, number];
  rotation: [number, number, number, number];
  velocity: [number, number, number];
  angularVelocity: [number, number, number];
};

export type PhysicalBodyMotionSummary3D = {
  reference: PhysicalBodyReference3D;
  startFrame: number;
  endFrame: number;
  samples: PhysicalBodyMotionSample3D[];
  displacementMeters: number;
  pathLengthMeters: number;
  maximumLateralDeviationMeters: number;
  maximumFrameTranslationMeters: number;
  maximumFrameRotationDegrees: number;
  maximumFrameTranslationResidualMeters: number;
  maximumFrameRotationResidualDegrees: number;
  maximumFrameTranslationResidualFrame: number;
  maximumFrameRotationResidualFrame: number;
};

export type PhysicalActionAcceptanceFinding3D = {
  code: "contact-missing" | "contact-timing" | "replay-divergence" | "position-pop" | "rotation-pop";
  frame: number;
  message: string;
};

export type PhysicalActionAcceptanceReport3D = {
  pass: boolean;
  launchCueId: string;
  contact?: PhysicalContactEvent3D;
  replayIdentical: boolean;
  attacker: PhysicalBodyMotionSummary3D;
  target: PhysicalBodyMotionSummary3D;
  findings: PhysicalActionAcceptanceFinding3D[];
};

export type PhysicalContactPoseEvidence3D = {
  role: "attacker" | "target";
  reference: PhysicalBodyReference3D;
  entityId: string;
  boneId: string;
  renderedWorldPosition: [number, number, number];
  contactReachMeters: number;
  visible: boolean;
  stableBoneExists: boolean;
  ikTargetWorldPosition?: [number, number, number];
};

export type PhysicalPoseAgreementFinding3D = {
  code: "pose-binding-missing" | "pose-bone-missing" | "pose-hidden" | "pose-contact-gap" | "ik-contact-gap";
  role: "attacker" | "target";
  message: string;
};

export type PhysicalContactPoseAgreement3D = {
  pass: boolean;
  contactFrame: number;
  maximumContactGapMeters: number;
  maximumIkGapMeters: number;
  evidence: PhysicalContactPoseEvidence3D[];
  findings: PhysicalPoseAgreementFinding3D[];
};

/** Proves the render-authoritative rig bindings and optional IK tell the same contact story as the solver. */
export function auditPhysicalContactPoseAgreement3D(options: {
  contact: Readonly<PhysicalContactEvent3D>;
  attacker?: Readonly<PhysicalContactPoseEvidence3D>;
  target?: Readonly<PhysicalContactPoseEvidence3D>;
  maximumSurfaceGapMeters?: number;
  maximumIkGapMeters?: number;
}): PhysicalContactPoseAgreement3D {
  const surfaceTolerance = nonnegative(options.maximumSurfaceGapMeters ?? .03, "maximumSurfaceGapMeters"), ikTolerance = nonnegative(options.maximumIkGapMeters ?? .08, "maximumIkGapMeters"), findings: PhysicalPoseAgreementFinding3D[] = [], evidence: PhysicalContactPoseEvidence3D[] = [];
  let maximumContactGapMeters = 0, maximumIkGapMeters = 0;
  for (const role of ["attacker", "target"] as const) {
    const item = options[role];
    if (!item) { findings.push({ code: "pose-binding-missing", role, message: `Solved ${role} ${referenceLabel(options.contact[role])} has no render-authoritative entity/bone binding.` }); continue; }
    const copied = copyPoseEvidence(item); evidence.push(copied);
    if (!sameReference(item.reference, options.contact[role])) findings.push({ code: "pose-binding-missing", role, message: `Rendered ${role} ${referenceLabel(item.reference)} does not match solved ${referenceLabel(options.contact[role])}.` });
    if (!item.stableBoneExists) findings.push({ code: "pose-bone-missing", role, message: `Rendered ${role} ${item.entityId}/${item.boneId} is not a stable bone on its bound rig.` });
    if (!item.visible) findings.push({ code: "pose-hidden", role, message: `Rendered ${role} entity ${item.entityId} is hidden at solved contact frame ${options.contact.frame}.` });
    const contactDistance = distance(item.renderedWorldPosition, options.contact.point), contactGap = Math.max(0, contactDistance - nonnegative(item.contactReachMeters, `${role}.contactReachMeters`)); maximumContactGapMeters = Math.max(maximumContactGapMeters, contactGap);
    if (contactGap > surfaceTolerance) findings.push({ code: "pose-contact-gap", role, message: `Rendered ${role} bone ${item.entityId}/${item.boneId} leaves ${contactGap.toFixed(3)}m between its visible contact envelope and the solved point.` });
    if (item.ikTargetWorldPosition) { const ikGap = distance(item.ikTargetWorldPosition, options.contact.point); maximumIkGapMeters = Math.max(maximumIkGapMeters, ikGap); if (ikGap > ikTolerance) findings.push({ code: "ik-contact-gap", role, message: `Rendered ${role} IK target is ${ikGap.toFixed(3)}m from the solved contact point.` }); }
  }
  return { pass: findings.length === 0, contactFrame: options.contact.frame, maximumContactGapMeters: clean(maximumContactGapMeters), maximumIkGapMeters: clean(maximumIkGapMeters), evidence, findings };
}

/** Samples one compiled physical body without depending on playback history. */
export function samplePhysicalBodyMotion3D(options: {
  performance: Readonly<CompiledPhysicalPerformance3D>;
  reference: PhysicalBodyReference3D;
  startFrame: number;
  endFrame: number;
}): PhysicalBodyMotionSummary3D {
  const startFrame = frame(options.startFrame, options.performance.durationFrames, "motion startFrame");
  const endFrame = frame(options.endFrame, options.performance.durationFrames, "motion endFrame");
  if (endFrame < startFrame) throw new RangeError("Physical motion endFrame must not precede startFrame.");
  const bodyIndex = options.performance.bodyReferences.findIndex((candidate) => sameReference(candidate, options.reference));
  if (bodyIndex < 0) throw new Error(`Physical motion body ${referenceLabel(options.reference)} is not an output of this performance.`);
  const output = new Float32Array(options.performance.frameStride), offset = bodyIndex * PHYSICAL_BODY_STATE_STRIDE_3D;
  const samples: PhysicalBodyMotionSample3D[] = [];
  for (let sampleFrame = startFrame; sampleFrame <= endFrame; sampleFrame += 1) {
    options.performance.writeFrame(sampleFrame, output);
    samples.push({
      frame: sampleFrame,
      position: finiteTuple(output, offset, 3, `${referenceLabel(options.reference)} position`),
      rotation: normalizedQuaternion(finiteTuple(output, offset + 3, 4, `${referenceLabel(options.reference)} rotation`)),
      velocity: finiteTuple(output, offset + 7, 3, `${referenceLabel(options.reference)} velocity`),
      angularVelocity: finiteTuple(output, offset + 10, 3, `${referenceLabel(options.reference)} angular velocity`),
    });
  }
  let pathLengthMeters = 0, maximumFrameTranslationMeters = 0, maximumFrameRotationDegrees = 0, maximumFrameTranslationResidualMeters = 0, maximumFrameRotationResidualDegrees = 0, maximumFrameTranslationResidualFrame = startFrame, maximumFrameRotationResidualFrame = startFrame;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]!, current = samples[index]!, translationDelta = subtract(current.position, previous.position), translation = length(translationDelta), seconds = 1 / options.performance.frameRate;
    pathLengthMeters += translation; maximumFrameTranslationMeters = Math.max(maximumFrameTranslationMeters, translation);
    const rotation = quaternionAngleDegrees(previous.rotation, current.rotation); maximumFrameRotationDegrees = Math.max(maximumFrameRotationDegrees, rotation);
    const predictedTranslation = scale(add(previous.velocity, current.velocity), seconds * .5), translationResidual = distance(translationDelta, predictedTranslation);
    if (translationResidual > maximumFrameTranslationResidualMeters) { maximumFrameTranslationResidualMeters = translationResidual; maximumFrameTranslationResidualFrame = current.frame; }
    const predictedRotation = (length(previous.angularVelocity) + length(current.angularVelocity)) * .5 * seconds * 180 / Math.PI, rotationResidual = Math.abs(rotation - predictedRotation);
    if (rotationResidual > maximumFrameRotationResidualDegrees) { maximumFrameRotationResidualDegrees = rotationResidual; maximumFrameRotationResidualFrame = current.frame; }
  }
  const first = samples[0]!, last = samples.at(-1)!, chord = subtract(last.position, first.position), chordLength = length(chord);
  let maximumLateralDeviationMeters = 0;
  for (const sample of samples) maximumLateralDeviationMeters = Math.max(maximumLateralDeviationMeters, pointLineDistance(sample.position, first.position, chord, chordLength));
  return {
    reference: structuredClone(options.reference), startFrame, endFrame, samples,
    displacementMeters: clean(distance(first.position, last.position)),
    pathLengthMeters: clean(pathLengthMeters),
    maximumLateralDeviationMeters: clean(maximumLateralDeviationMeters),
    maximumFrameTranslationMeters: clean(maximumFrameTranslationMeters),
    maximumFrameRotationDegrees: clean(maximumFrameRotationDegrees),
    maximumFrameTranslationResidualMeters: clean(maximumFrameTranslationResidualMeters),
    maximumFrameRotationResidualDegrees: clean(maximumFrameRotationResidualDegrees),
    maximumFrameTranslationResidualFrame,
    maximumFrameRotationResidualFrame,
  };
}

/** Audits actual simulated contact, continuity, and deterministic replay for one action. */
export function auditPhysicalActionAcceptance3D(options: {
  performance: CompiledPhysicalPerformance3D;
  replay: CompiledPhysicalPerformance3D;
  launchCueId: string;
  attacker: PhysicalBodyReference3D;
  target: PhysicalBodyReference3D;
  startFrame: number;
  endFrame: number;
  expectedContactFrame?: number;
  contactToleranceFrames?: number;
  maximumFrameTranslationMeters?: number;
  maximumFrameRotationDegrees?: number;
}): PhysicalActionAcceptanceReport3D {
  options.performance.ensureComplete(); options.replay.ensureComplete();
  const findings: PhysicalActionAcceptanceFinding3D[] = [], contact = options.performance.contacts.find((item) => item.cueId === options.launchCueId);
  if (!contact) findings.push({ code: "contact-missing", frame: options.startFrame, message: `${options.launchCueId} produced no simulated contact.` });
  if (contact && options.expectedContactFrame !== undefined) {
    const tolerance = nonnegativeInteger(options.contactToleranceFrames ?? 1, "contactToleranceFrames");
    if (Math.abs(contact.frame - options.expectedContactFrame) > tolerance) findings.push({ code: "contact-timing", frame: contact.frame, message: `${options.launchCueId} contacted at frame ${contact.frame}, outside ${options.expectedContactFrame} ± ${tolerance}.` });
  }
  const replayIdentical = equalCompiledPerformance(options.performance, options.replay);
  if (!replayIdentical) findings.push({ code: "replay-divergence", frame: firstDifferentFrame(options.performance, options.replay), message: `${options.launchCueId} differs between independent deterministic compilations.` });
  const attacker = samplePhysicalBodyMotion3D({ performance: options.performance, reference: options.attacker, startFrame: options.startFrame, endFrame: options.endFrame });
  const target = samplePhysicalBodyMotion3D({ performance: options.performance, reference: options.target, startFrame: options.startFrame, endFrame: options.endFrame });
  inspectContinuity(attacker, options.maximumFrameTranslationMeters, options.maximumFrameRotationDegrees, findings);
  inspectContinuity(target, options.maximumFrameTranslationMeters, options.maximumFrameRotationDegrees, findings);
  return { pass: findings.length === 0, launchCueId: options.launchCueId, ...(contact ? { contact: { ...contact, attacker: { ...contact.attacker }, target: structuredClone(contact.target), point: [...contact.point], normal: [...contact.normal] } } : {}), replayIdentical, attacker, target, findings };
}

export type PhysicalActionMechanicsComparison3D = {
  distinct: boolean;
  rootMeanSquarePositionDifferenceMeters: number;
  maximumPositionDifferenceMeters: number;
  pathLengthDifferenceMeters: number;
  curvatureDifferenceMeters: number;
};

/** Compares time-aligned simulated paths so named styles cannot pass with identical mechanics. */
export function comparePhysicalActionMechanics3D(options: {
  left: PhysicalBodyMotionSummary3D;
  right: PhysicalBodyMotionSummary3D;
  minimumRootMeanSquareDifferenceMeters?: number;
  minimumCurvatureDifferenceMeters?: number;
}): PhysicalActionMechanicsComparison3D {
  if (options.left.samples.length !== options.right.samples.length) throw new RangeError("Physical action mechanics comparisons need the same number of sampled frames.");
  let squared = 0, maximum = 0;
  for (let index = 0; index < options.left.samples.length; index += 1) {
    const difference = distance(options.left.samples[index]!.position, options.right.samples[index]!.position); squared += difference * difference; maximum = Math.max(maximum, difference);
  }
  const rootMeanSquarePositionDifferenceMeters = Math.sqrt(squared / options.left.samples.length);
  const pathLengthDifferenceMeters = Math.abs(options.left.pathLengthMeters - options.right.pathLengthMeters);
  const curvatureDifferenceMeters = Math.abs(options.left.maximumLateralDeviationMeters - options.right.maximumLateralDeviationMeters);
  const minimumRms = nonnegative(options.minimumRootMeanSquareDifferenceMeters ?? .03, "minimumRootMeanSquareDifferenceMeters"), minimumCurvature = nonnegative(options.minimumCurvatureDifferenceMeters ?? .015, "minimumCurvatureDifferenceMeters");
  return {
    distinct: rootMeanSquarePositionDifferenceMeters >= minimumRms && curvatureDifferenceMeters >= minimumCurvature,
    rootMeanSquarePositionDifferenceMeters: clean(rootMeanSquarePositionDifferenceMeters), maximumPositionDifferenceMeters: clean(maximum),
    pathLengthDifferenceMeters: clean(pathLengthDifferenceMeters), curvatureDifferenceMeters: clean(curvatureDifferenceMeters),
  };
}

function inspectContinuity(summary: PhysicalBodyMotionSummary3D, maximumTranslation: number | undefined, maximumRotation: number | undefined, findings: PhysicalActionAcceptanceFinding3D[]) {
  if (maximumTranslation !== undefined && summary.maximumFrameTranslationMeters > positive(maximumTranslation, "maximumFrameTranslationMeters")) findings.push({ code: "position-pop", frame: largestTranslationFrame(summary.samples), message: `${referenceLabel(summary.reference)} moves ${summary.maximumFrameTranslationMeters.toFixed(3)}m in one frame.` });
  if (maximumRotation !== undefined && summary.maximumFrameRotationDegrees > positive(maximumRotation, "maximumFrameRotationDegrees")) findings.push({ code: "rotation-pop", frame: largestRotationFrame(summary.samples), message: `${referenceLabel(summary.reference)} rotates ${summary.maximumFrameRotationDegrees.toFixed(1)}° in one frame.` });
}

function equalCompiledPerformance(left: CompiledPhysicalPerformance3D, right: CompiledPhysicalPerformance3D) {
  if (left.frameRate !== right.frameRate || left.durationFrames !== right.durationFrames || left.frameStride !== right.frameStride || left.states.length !== right.states.length) return false;
  for (let index = 0; index < left.states.length; index += 1) if (!Object.is(left.states[index], right.states[index])) return false;
  return JSON.stringify(left.contacts) === JSON.stringify(right.contacts) && JSON.stringify(left.breaks) === JSON.stringify(right.breaks) && JSON.stringify(left.characterStateEvents) === JSON.stringify(right.characterStateEvents);
}

function firstDifferentFrame(left: CompiledPhysicalPerformance3D, right: CompiledPhysicalPerformance3D) { const length = Math.min(left.states.length, right.states.length); for (let index = 0; index < length; index += 1) if (!Object.is(left.states[index], right.states[index])) return Math.floor(index / Math.max(1, left.frameStride)); return 0; }
function largestTranslationFrame(samples: readonly PhysicalBodyMotionSample3D[]) { let frame = samples[0]!.frame, maximum = -1; for (let index = 1; index < samples.length; index += 1) { const amount = distance(samples[index - 1]!.position, samples[index]!.position); if (amount > maximum) { maximum = amount; frame = samples[index]!.frame; } } return frame; }
function largestRotationFrame(samples: readonly PhysicalBodyMotionSample3D[]) { let frame = samples[0]!.frame, maximum = -1; for (let index = 1; index < samples.length; index += 1) { const amount = quaternionAngleDegrees(samples[index - 1]!.rotation, samples[index]!.rotation); if (amount > maximum) { maximum = amount; frame = samples[index]!.frame; } } return frame; }
function sameReference(left: PhysicalBodyReference3D, right: PhysicalBodyReference3D) { return "bodyId" in left && "bodyId" in right ? left.bodyId === right.bodyId : "ragdollId" in left && "ragdollId" in right && left.ragdollId === right.ragdollId && left.boneId === right.boneId; }
function copyPoseEvidence(value: Readonly<PhysicalContactPoseEvidence3D>): PhysicalContactPoseEvidence3D { return { ...value, reference: structuredClone(value.reference), renderedWorldPosition: [...value.renderedWorldPosition], ...(value.ikTargetWorldPosition ? { ikTargetWorldPosition: [...value.ikTargetWorldPosition] } : {}) }; }
function referenceLabel(reference: PhysicalBodyReference3D) { return "bodyId" in reference ? reference.bodyId : `${reference.ragdollId}/${reference.boneId}`; }
function finiteTuple(output: Float32Array, offset: number, count: 3, label: string): [number, number, number];
function finiteTuple(output: Float32Array, offset: number, count: 4, label: string): [number, number, number, number];
function finiteTuple(output: Float32Array, offset: number, count: 3 | 4, label: string) {
  for (let index = 0; index < count; index += 1) if (!Number.isFinite(output[offset + index])) throw new Error(`${label} contains a non-finite component.`);
  // Every requested component was checked above, including out-of-range access.
  return count === 3 ? [output[offset]!, output[offset + 1]!, output[offset + 2]!] : [output[offset]!, output[offset + 1]!, output[offset + 2]!, output[offset + 3]!];
}
function normalizedQuaternion(value: readonly number[]): [number, number, number, number] { const magnitude = Math.hypot(...value); if (magnitude <= 1e-12) throw new Error("Physical motion rotation is degenerate."); return tuple4((value[0]!) / magnitude, (value[1]!) / magnitude, (value[2]!) / magnitude, (value[3]!) / magnitude); }
function quaternionAngleDegrees(left: readonly number[], right: readonly number[]) { const dot = Math.min(1, Math.abs(left[0]! * right[0]! + left[1]! * right[1]! + left[2]! * right[2]! + left[3]! * right[3]!)); return 2 * Math.acos(dot) * 180 / Math.PI; }
function pointLineDistance(point: readonly number[], origin: readonly number[], direction: readonly number[], directionLength: number) { if (directionLength <= 1e-12) return distance(point, origin); const relative = subtract(point, origin), projection = dot(relative, direction) / (directionLength * directionLength), closest = add(origin, scale(direction, projection)); return distance(point, closest); }
function distance(left: readonly number[], right: readonly number[]) { return length(subtract(left, right)); }
function length(value: readonly number[]) { return Math.hypot(value[0]!, value[1]!, value[2]!); }
function subtract(left: readonly number[], right: readonly number[]): [number, number, number] { return [left[0]! - right[0]!, left[1]! - right[1]!, left[2]! - right[2]!]; }
function add(left: readonly number[], right: readonly number[]): [number, number, number] { return [left[0]! + right[0]!, left[1]! + right[1]!, left[2]! + right[2]!]; }
function scale(value: readonly number[], amount: number): [number, number, number] { return [value[0]! * amount, value[1]! * amount, value[2]! * amount]; }
function dot(left: readonly number[], right: readonly number[]) { return left[0]! * right[0]! + left[1]! * right[1]! + left[2]! * right[2]!; }
function clean(value: number) { const rounded = Math.round(value * 1e9) / 1e9; return Object.is(rounded, -0) ? 0 : rounded; }
function frame(value: number, durationFrames: number, label: string) { if (!Number.isSafeInteger(value) || value < 0 || value >= durationFrames) throw new RangeError(`${label} must be from 0 through ${durationFrames - 1}.`); return value; }
function positive(value: number, label: string) { if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be positive.`); return value; }
function nonnegative(value: number, label: string) { if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be non-negative.`); return value; }
function nonnegativeInteger(value: number, label: string) { if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative safe integer.`); return value; }
