import { roundDecimal } from "@hyperfocus/utilities/math";
import {
  applyGltfAnimationClip,
  createGltfPoseOutput,
  resetGltfPose,
  type CookedGltfRig,
} from "../../assets/gltf-skin-animation.ts";
import { rebuildGltfPoseMatrices } from "../../assets/gltf-pose-overrides.ts";
import { normalizeRigBoneName } from "../mapping.ts";

export type HumanoidGaitClipAnalysis = Readonly<{
  version: 1;
  cycleSeconds: number;
  initialPhase: number;
  stanceRatio: number;
  confidence: number;
  sampleRate: number;
  leftFootBoneId: string;
  rightFootBoneId: string;
}>;

export type HumanoidGaitAnalysisDiagnostic = Readonly<{
  code: "invalid-samples" | "missing-foot-bones" | "missing-clip" | "insufficient-foot-motion" | "ambiguous-foot-contacts";
  message: string;
  alternatives: readonly string[];
}>;

export type HumanoidGaitAnalysisResult = Readonly<{
  ok: boolean;
  analysis?: HumanoidGaitClipAnalysis;
  diagnostics: readonly HumanoidGaitAnalysisDiagnostic[];
}>;

export type HumanoidGaitContactSamples = Readonly<{
  durationSeconds: number;
  sampleRate: number;
  leftFootBoneId: string;
  rightFootBoneId: string;
  leftFootPositions: ArrayLike<number>;
  rightFootPositions: ArrayLike<number>;
}>;

const LEFT_FOOT_ALIASES = new Set(["leftfoot", "lfoot", "footl", "leftankle", "anklel"]);
const RIGHT_FOOT_ALIASES = new Set(["rightfoot", "rfoot", "footr", "rightankle", "ankler"]);
const MAX_CLIP_SAMPLES = 1_200;

/** Finds stable foot identities without changing or augmenting the canonical rig. */
export function inferHumanoidFootBoneIds(nodeIds: readonly string[]): { leftFootBoneId: string; rightFootBoneId: string } | undefined {
  const leftFootBoneId = bestFoot(nodeIds, LEFT_FOOT_ALIASES, "left"), rightFootBoneId = bestFoot(nodeIds, RIGHT_FOOT_ALIASES, "right");
  return leftFootBoneId && rightFootBoneId && leftFootBoneId !== rightFootBoneId ? { leftFootBoneId, rightFootBoneId } : undefined;
}

/**
 * Reduces sampled foot motion to deterministic cadence, phase, and support share.
 * The result is compact authoring intent; sampled frame data is never persisted.
 */
export function analyzeHumanoidGaitContacts(samples: HumanoidGaitContactSamples): HumanoidGaitAnalysisResult {
  const count = samples.leftFootPositions.length / 3;
  if (!Number.isFinite(samples.durationSeconds) || samples.durationSeconds <= 0 || !Number.isFinite(samples.sampleRate) || samples.sampleRate <= 0 || !Number.isSafeInteger(count) || count < 8 || samples.rightFootPositions.length !== samples.leftFootPositions.length || !samples.leftFootBoneId || !samples.rightFootBoneId || samples.leftFootBoneId === samples.rightFootBoneId) {
    return failure("invalid-samples", "Gait analysis needs at least eight paired finite foot-position samples and two different stable foot identities.", ["Choose different left and right foot bones.", "Increase the clip sample rate or use a longer clip."]);
  }
  for (let index = 0; index < count * 3; index += 1) if (!Number.isFinite(samples.leftFootPositions[index]) || !Number.isFinite(samples.rightFootPositions[index])) return failure("invalid-samples", `Foot sample ${Math.floor(index / 3)} contains a non-finite position.`, ["Repair the source clip transforms and reimport it."]);
  const leftRange = verticalRange(samples.leftFootPositions, count), rightRange = verticalRange(samples.rightFootPositions, count), motionRange = Math.max(leftRange.range, rightRange.range);
  if (motionRange < 1e-4) return failure("insufficient-foot-motion", "The selected clip has no measurable alternating vertical foot motion, so cadence would be a guess.", ["Choose a walk, run, shuffle, or dash clip.", "Author cadence manually in Physical gait expert timing."]);
  const leftMask = contactMask(samples.leftFootPositions, count, leftRange.minimum, leftRange.range), rightMask = contactMask(samples.rightFootPositions, count, rightRange.minimum, rightRange.range);
  smoothCircularMask(leftMask); smoothCircularMask(rightMask);
  const leftCoverage = coverage(leftMask), rightCoverage = coverage(rightMask), leftOnsets = contactOnsets(leftMask), rightOnsets = contactOnsets(rightMask);
  if (!usableCoverage(leftCoverage) || !usableCoverage(rightCoverage) || !leftOnsets.length || !rightOnsets.length) return failure("ambiguous-foot-contacts", "The selected clip does not expose two bounded alternating foot-contact windows.", ["Choose a locomotion clip with visible foot lift and ground contact.", "Use manual cadence, phase, and grounded share."]);
  const periods = [...cyclicIntervals(leftOnsets, count), ...cyclicIntervals(rightOnsets, count)].filter((value) => value >= 4), periodSamples = median(periods);
  if (!Number.isFinite(periodSamples) || periodSamples < 4) return failure("ambiguous-foot-contacts", "The selected clip does not contain a stable repeating foot-contact cycle.", ["Choose a looping locomotion clip.", "Use manual cadence in Physical gait expert timing."]);
  const phaseSeparation = averageAlternatingSeparation(leftOnsets, rightOnsets, periodSamples), alternationScore = Math.max(0, 1 - Math.abs(phaseSeparation - .5) / .5), regularityScore = intervalRegularity(periods, periodSamples), coverageScore = Math.max(0, 1 - Math.abs(leftCoverage - rightCoverage) * 2), motionScore = Math.min(1, motionRange / .03), confidence = round(0.35 * alternationScore + 0.3 * regularityScore + 0.2 * coverageScore + 0.15 * motionScore, 4);
  if (alternationScore < .35 || confidence < .5) return failure("ambiguous-foot-contacts", `Foot contacts are not reliably alternating (confidence ${confidence.toFixed(2)}).`, ["Choose a cleaner looping locomotion clip.", "Use manual cadence, phase, and grounded share."]);
  const cycleSeconds = round(periodSamples / samples.sampleRate, 6), initialPhase = round(normalizePhase(-leftOnsets[0]! / periodSamples), 6), stanceRatio = round((leftCoverage + rightCoverage) * .5, 4);
  return { ok: true, diagnostics: [], analysis: { version: 1, cycleSeconds, initialPhase, stanceRatio, confidence, sampleRate: round(samples.sampleRate, 4), leftFootBoneId: samples.leftFootBoneId, rightFootBoneId: samples.rightFootBoneId } };
}

/** Samples the canonical cooked glTF clip used by gameplay, preview, and export. */
export function analyzeGltfHumanoidGaitClip(rig: CookedGltfRig, options: { animation: number; leftFootBoneId?: string; rightFootBoneId?: string; sampleRate?: number }): HumanoidGaitAnalysisResult {
  const inferred = inferHumanoidFootBoneIds(rig.nodeIds), leftFootBoneId = options.leftFootBoneId ?? inferred?.leftFootBoneId, rightFootBoneId = options.rightFootBoneId ?? inferred?.rightFootBoneId;
  if (!leftFootBoneId || !rightFootBoneId) return failure("missing-foot-bones", "The rig has no unambiguous stable left and right foot identities.", ["Name the feet with left/right foot or ankle semantics.", "Select stable foot bones explicitly in the gait editor."]);
  const leftNode = rig.nodeIds.indexOf(leftFootBoneId), rightNode = rig.nodeIds.indexOf(rightFootBoneId);
  if (leftNode < 0 || rightNode < 0 || leftNode === rightNode) return failure("missing-foot-bones", `The selected stable feet ${leftFootBoneId} and ${rightFootBoneId} do not both exist on the cooked rig.`, ["Choose two stable node IDs reported by the rig inspector."]);
  const clipIndex = rig.clips.findIndex((clip) => clip.animationIndex === options.animation), clip = rig.clips[clipIndex];
  if (!clip) return failure("missing-clip", `Animation ${options.animation} is not present on the cooked rig.`, rig.clips.map((candidate) => `Use animation ${candidate.animationIndex} (${candidate.label}).`));
  const requestedRate = options.sampleRate ?? 60;
  if (!Number.isFinite(requestedRate) || requestedRate < 15 || requestedRate > 240) return failure("invalid-samples", "Clip gait sample rate must be between 15 and 240 samples per second.", ["Use the default 60 Hz analysis."]);
  const sampleCount = Math.min(MAX_CLIP_SAMPLES, Math.max(8, Math.round(clip.duration * requestedRate))), sampleRate = sampleCount / clip.duration, pose = createGltfPoseOutput(rig), left = new Float32Array(sampleCount * 3), right = new Float32Array(sampleCount * 3);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    resetGltfPose(rig, pose); applyGltfAnimationClip(rig, clipIndex, sample / sampleRate, true, pose); rebuildGltfPoseMatrices(rig, pose);
    copyPosition(pose.worldMatrices, leftNode, left, sample); copyPosition(pose.worldMatrices, rightNode, right, sample);
  }
  return analyzeHumanoidGaitContacts({ durationSeconds: clip.duration, sampleRate, leftFootBoneId, rightFootBoneId, leftFootPositions: left, rightFootPositions: right });
}

function bestFoot(nodeIds: readonly string[], aliases: ReadonlySet<string>, side: "left" | "right") {
  let best: { id: string; score: number } | undefined;
  for (const id of nodeIds) {
    const normalized = normalizeRigBoneName(id); let score = aliases.has(normalized) ? 3 : 0;
    if (!score && [...aliases].some((alias) => normalized.endsWith(alias))) score = 2;
    if (!score && normalized.includes(side) && /(foot|ankle)/.test(normalized) && !/(toe|ik|control|socket)/.test(normalized)) score = 1;
    if (score > (best?.score ?? 0)) best = { id, score };
  }
  return best?.id;
}
function verticalRange(positions: ArrayLike<number>, count: number) { let minimum = Infinity, maximum = -Infinity; for (let sample = 0; sample < count; sample += 1) { const value = positions[sample * 3 + 1]!; minimum = Math.min(minimum, value); maximum = Math.max(maximum, value); } return { minimum, range: maximum - minimum }; }
function contactMask(positions: ArrayLike<number>, count: number, minimum: number, range: number) { const threshold = minimum + Math.max(2e-4, range * .12), result = new Uint8Array(count); for (let sample = 0; sample < count; sample += 1) result[sample] = positions[sample * 3 + 1]! <= threshold ? 1 : 0; return result; }
function smoothCircularMask(mask: Uint8Array) { if (mask.length < 3) return; const source = mask.slice(); for (let index = 0; index < mask.length; index += 1) { const previous = source[(index + source.length - 1) % source.length]!, current = source[index]!, next = source[(index + 1) % source.length]!; if (previous === next && current !== previous) mask[index] = previous; } }
function coverage(mask: Uint8Array) { let total = 0; for (const value of mask) total += value; return total / mask.length; }
function usableCoverage(value: number) { return value >= .12 && value <= .88; }
function contactOnsets(mask: Uint8Array) { const result: number[] = []; for (let index = 0; index < mask.length; index += 1) if (mask[index] && !mask[(index + mask.length - 1) % mask.length]) result.push(index); return result; }
function cyclicIntervals(onsets: readonly number[], count: number) { if (!onsets.length) return []; const result: number[] = []; for (let index = 0; index < onsets.length; index += 1) result.push((onsets[(index + 1) % onsets.length]! - onsets[index]! + count) % count || count); return result; }
function averageAlternatingSeparation(left: readonly number[], right: readonly number[], period: number) { let total = 0; for (const onset of left) { let nearest = Infinity; for (const candidate of right) { const phase = normalizePhase((candidate - onset) / period), distance = Math.min(phase, 1 - phase); nearest = Math.min(nearest, distance); } total += nearest; } return total / left.length; }
function intervalRegularity(intervals: readonly number[], medianValue: number) { if (!intervals.length) return 0; let error = 0; for (const interval of intervals) error += Math.abs(interval - medianValue) / medianValue; return Math.max(0, 1 - error / intervals.length); }
function median(values: readonly number[]) { if (!values.length) return Number.NaN; const sorted = [...values].sort((left, right) => left - right), middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) * .5; }
function normalizePhase(value: number) { return ((value % 1) + 1) % 1; }
function copyPosition(matrices: Float32Array, node: number, target: Float32Array, sample: number) { const source = node * 16 + 12, offset = sample * 3; target[offset] = matrices[source]!; target[offset + 1] = matrices[source + 1]!; target[offset + 2] = matrices[source + 2]!; }
function round(value: number, digits: number) { return roundDecimal(value, digits); }
function failure(code: HumanoidGaitAnalysisDiagnostic["code"], message: string, alternatives: readonly string[]): HumanoidGaitAnalysisResult { return { ok: false, diagnostics: [{ code, message, alternatives }] }; }
