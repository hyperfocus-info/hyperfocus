import { isNormalizedQuaternion } from "./math.ts";

const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;

export type PoseBufferLayout = {
  readonly deformCount: number;
  readonly totalCount: number;
  readonly includeScales: boolean;
  readonly rotationByteOffset: number;
  readonly translationByteOffset: number;
  readonly scaleByteOffset: number | null;
  readonly byteLength: number;
};

export type PoseBuffer = {
  readonly buffer: ArrayBufferLike;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly deformCount: number;
  readonly totalCount: number;
  readonly rotations: Float32Array;
  readonly translations: Float32Array;
  readonly scales?: Float32Array;
};

export type PoseBufferOptions = {
  buffer?: ArrayBufferLike;
  byteOffset?: number;
  initialize?: boolean;
};

export type PoseBufferDiagnostic = {
  code: "buffer-length" | "non-finite-rotation" | "non-normalized-rotation" | "non-finite-translation" | "non-finite-scale";
  message: string;
  jointIndex?: number;
};

function assertCount(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative safe integer`);
}

function checkedFloatBytes(count: number, components: number, label: string) {
  const values = count * components;
  const bytes = values * FLOAT_BYTES;
  if (!Number.isSafeInteger(values) || !Number.isSafeInteger(bytes)) {
    throw new RangeError(`${label} exceeds typed-array addressable bounds`);
  }
  return bytes;
}

export function createPoseBufferLayout(
  deformCount: number,
  totalCount = deformCount,
  options: { includeScales?: boolean } = {},
): PoseBufferLayout {
  assertCount(deformCount, "pose deformCount");
  assertCount(totalCount, "pose totalCount");
  if (deformCount > totalCount) throw new RangeError("pose deformCount cannot exceed totalCount");
  const rotationBytes = checkedFloatBytes(totalCount, 4, "pose rotations");
  const translationBytes = checkedFloatBytes(totalCount, 3, "pose translations");
  const scaleBytes = options.includeScales ? checkedFloatBytes(totalCount, 3, "pose scales") : 0;
  const byteLength = rotationBytes + translationBytes + scaleBytes;
  if (!Number.isSafeInteger(byteLength)) throw new RangeError("pose layout exceeds addressable bounds");
  return Object.freeze({
    deformCount,
    totalCount,
    includeScales: options.includeScales ?? false,
    rotationByteOffset: 0,
    translationByteOffset: rotationBytes,
    scaleByteOffset: options.includeScales ? rotationBytes + translationBytes : null,
    byteLength,
  });
}

export function createPoseBuffer(layout: PoseBufferLayout, options: PoseBufferOptions = {}): PoseBuffer {
  const byteOffset = options.byteOffset ?? 0;
  if (!Number.isSafeInteger(byteOffset) || byteOffset < 0 || byteOffset % FLOAT_BYTES !== 0) {
    throw new RangeError("pose byteOffset must be a non-negative multiple of four");
  }
  const requiredEnd = byteOffset + layout.byteLength;
  if (!Number.isSafeInteger(requiredEnd)) throw new RangeError("pose buffer bounds exceed safe integer range");
  const buffer = options.buffer ?? new ArrayBuffer(requiredEnd);
  if (requiredEnd > buffer.byteLength) {
    throw new RangeError(`pose layout requires ${requiredEnd} bytes but buffer contains ${buffer.byteLength}`);
  }
  const rotations = new Float32Array(
    buffer,
    byteOffset + layout.rotationByteOffset,
    layout.totalCount * 4,
  );
  const translations = new Float32Array(
    buffer,
    byteOffset + layout.translationByteOffset,
    layout.totalCount * 3,
  );
  const scales = layout.scaleByteOffset === null
    ? undefined
    : new Float32Array(buffer, byteOffset + layout.scaleByteOffset, layout.totalCount * 3);
  const pose: PoseBuffer = {
    buffer,
    byteOffset,
    byteLength: layout.byteLength,
    deformCount: layout.deformCount,
    totalCount: layout.totalCount,
    rotations,
    translations,
    ...(scales ? { scales } : {}),
  };
  if (options.initialize ?? true) resetPoseBuffer(pose);
  return pose;
}

export function resetPoseBuffer(
  pose: PoseBuffer,
  reference?: Pick<PoseBuffer, "totalCount" | "rotations" | "translations" | "scales">,
): PoseBuffer {
  if (reference) {
    if (reference.totalCount !== pose.totalCount) throw new RangeError("reference pose totalCount must match target pose");
    pose.rotations.set(reference.rotations);
    pose.translations.set(reference.translations);
    if (pose.scales) {
      if (reference.scales) pose.scales.set(reference.scales);
      else pose.scales.fill(1);
    }
    return pose;
  }
  pose.rotations.fill(0);
  pose.translations.fill(0);
  pose.scales?.fill(1);
  for (let jointIndex = 0; jointIndex < pose.totalCount; jointIndex += 1) {
    pose.rotations[jointIndex * 4 + 3] = 1;
  }
  return pose;
}

export function copyPoseBuffer(source: PoseBuffer, target: PoseBuffer): PoseBuffer {
  if (source.deformCount !== target.deformCount || source.totalCount !== target.totalCount) {
    throw new RangeError("source and target pose counts must match");
  }
  target.rotations.set(source.rotations);
  target.translations.set(source.translations);
  if (target.scales) {
    if (source.scales) target.scales.set(source.scales);
    else target.scales.fill(1);
  }
  return target;
}

export function validatePoseBuffer(
  pose: PoseBuffer,
  options: { quaternionTolerance?: number } = {},
): readonly PoseBufferDiagnostic[] {
  const diagnostics: PoseBufferDiagnostic[] = [];
  if (pose.rotations.length !== pose.totalCount * 4
    || pose.translations.length !== pose.totalCount * 3
    || (pose.scales && pose.scales.length !== pose.totalCount * 3)) {
    diagnostics.push({ code: "buffer-length", message: "pose views do not match totalCount" });
    return diagnostics;
  }
  const tolerance = options.quaternionTolerance ?? 1e-4;
  for (let jointIndex = 0; jointIndex < pose.totalCount; jointIndex += 1) {
    const rotationOffset = jointIndex * 4;
    const rotation = pose.rotations.subarray(rotationOffset, rotationOffset + 4);
    if (!Number.isFinite(rotation[0]) || !Number.isFinite(rotation[1]) || !Number.isFinite(rotation[2]) || !Number.isFinite(rotation[3])) {
      diagnostics.push({ code: "non-finite-rotation", message: `joint ${jointIndex} rotation is not finite`, jointIndex });
    } else if (!isNormalizedQuaternion(rotation, tolerance)) {
      diagnostics.push({ code: "non-normalized-rotation", message: `joint ${jointIndex} rotation is not normalized`, jointIndex });
    }
    const translationOffset = jointIndex * 3;
    if (!Number.isFinite(pose.translations[translationOffset])
      || !Number.isFinite(pose.translations[translationOffset + 1])
      || !Number.isFinite(pose.translations[translationOffset + 2])) {
      diagnostics.push({ code: "non-finite-translation", message: `joint ${jointIndex} translation is not finite`, jointIndex });
    }
    if (pose.scales && (!Number.isFinite(pose.scales[translationOffset])
      || !Number.isFinite(pose.scales[translationOffset + 1])
      || !Number.isFinite(pose.scales[translationOffset + 2]))) {
      diagnostics.push({ code: "non-finite-scale", message: `joint ${jointIndex} scale is not finite`, jointIndex });
    }
  }
  return diagnostics;
}
