import {
  assertSourceRigDescriptor,
  createRigBinding,
  humanoidSemantics,
  parseT3Rig,
  type RigBoneEvidence,
  type RigDiagnostic,
  type RigFingerprint,
  type RigTransform,
  type SourceBoneDescriptor,
  type SourceRigDescriptor,
  type T3RigBoneBinding,
  type T3RigDocument,
} from "./rig.ts";

export type ReconcileT3RigOptions = {
  minimumScore?: number;
};

export type ReconcileT3RigResult = {
  document: T3RigDocument;
  diagnostics: readonly RigDiagnostic[];
  changed: boolean;
};

function fingerprintsEqual(a: RigFingerprint, b: RigFingerprint) {
  return a.algorithm === b.algorithm && a.value === b.value;
}

function vectorDistance(a: ArrayLike<number>, b: ArrayLike<number>) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function quaternionSimilarity(a: ArrayLike<number>, b: ArrayLike<number>) {
  return Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]));
}

function transformSimilarity(a: RigTransform, b: RigTransform) {
  const translation = Math.exp(-vectorDistance(a.translation, b.translation) / 0.025);
  const rotation = quaternionSimilarity(a.rotation, b.rotation);
  const aScale = a.scale ?? [1, 1, 1];
  const bScale = b.scale ?? [1, 1, 1];
  const scale = Math.exp(-vectorDistance(aScale, bScale) / 0.025);
  return translation * 0.45 + rotation * 0.45 + scale * 0.1;
}

export function scoreRigBoneEvidence(evidence: RigBoneEvidence, candidate: SourceBoneDescriptor): number {
  const pathMatch = evidence.hierarchyPath === candidate.hierarchyPath;
  let score = 0;
  if (pathMatch) score += 0.25;
  if (pathMatch && evidence.siblingOrdinal === candidate.siblingOrdinal) score += 0.1;
  score += transformSimilarity(evidence.bindTransform, candidate.bindTransform) * 0.3;
  if (evidence.skinJointOrdinal === candidate.skinJointOrdinal) score += 0.15;
  if (fingerprintsEqual(evidence.structuralHash, candidate.structuralHash)) score += 0.2;
  return Math.min(1, score);
}

function findBestBone(
  binding: T3RigBoneBinding,
  source: SourceRigDescriptor,
  minimumScore: number,
): { bone: SourceBoneDescriptor; score: number } | undefined {
  let best: { bone: SourceBoneDescriptor; score: number } | undefined;
  for (const bone of source.bones) {
    const score = scoreRigBoneEvidence(binding.evidence, bone);
    if (score < minimumScore) continue;
    if (!best || score > best.score || (score === best.score && bone.index < best.bone.index)) best = { bone, score };
  }
  return best;
}

function reconcileBinding(
  binding: T3RigBoneBinding,
  source: SourceRigDescriptor,
  minimumScore: number,
) {
  const matched = findBestBone(binding, source, minimumScore);
  if (!matched) return undefined;
  const replacement = createRigBinding(
    matched.bone,
    binding.provenance === "manual" ? "manual" : "reconciled",
    binding.provenance === "manual" ? binding.confidence : matched.score,
    binding.verified,
  );
  return { binding: replacement, score: matched.score };
}

function bindingChanged(a: T3RigBoneBinding, b: T3RigBoneBinding) {
  return a.boneIndex !== b.boneIndex
    || a.provenance !== b.provenance
    || a.confidence !== b.confidence
    || a.evidence.hierarchyPath !== b.evidence.hierarchyPath
    || a.evidence.siblingOrdinal !== b.evidence.siblingOrdinal
    || a.evidence.skinJointOrdinal !== b.evidence.skinJointOrdinal
    || !fingerprintsEqual(a.evidence.structuralHash, b.evidence.structuralHash);
}

export function reconcileT3Rig(
  source: SourceRigDescriptor,
  documentInput: T3RigDocument,
  options: ReconcileT3RigOptions = {},
): ReconcileT3RigResult {
  assertSourceRigDescriptor(source);
  const document = parseT3Rig(documentInput);
  const minimumScore = options.minimumScore ?? 0.45;
  if (!Number.isFinite(minimumScore) || minimumScore < 0 || minimumScore > 1) {
    throw new RangeError("reconciliation minimumScore must be between zero and one");
  }
  const diagnostics: RigDiagnostic[] = [];
  let changed = !fingerprintsEqual(document.assetFingerprint, source.assetFingerprint)
    || !fingerprintsEqual(document.skinFingerprint, source.skinFingerprint);

  for (const semantic of humanoidSemantics) {
    const binding = document.semantics[semantic];
    if (!binding) continue;
    const reconciled = reconcileBinding(binding, source, minimumScore);
    if (!reconciled) {
      diagnostics.push({
        code: "binding-reconciliation-failed",
        message: `${semantic} could not be reconciled and retains its prior unresolved binding`,
        severity: "warning",
        semantic,
        boneIndex: binding.boneIndex,
      });
      continue;
    }
    if (bindingChanged(binding, reconciled.binding)) changed = true;
    document.semantics[semantic] = reconciled.binding;
  }

  for (const [tag, bindings] of Object.entries(document.tags)) {
    const output: T3RigBoneBinding[] = [];
    for (const binding of bindings) {
      const reconciled = reconcileBinding(binding, source, minimumScore);
      if (!reconciled) {
        diagnostics.push({
          code: "tag-reconciliation-failed",
          message: `Tag ${tag} retains an unresolved bone binding`,
          severity: "warning",
          boneIndex: binding.boneIndex,
        });
        output.push(binding);
        continue;
      }
      if (bindingChanged(binding, reconciled.binding)) changed = true;
      output.push(reconciled.binding);
    }
    output.sort((a, b) => a.boneIndex - b.boneIndex);
    document.tags[tag] = output;
  }

  document.assetFingerprint = { ...source.assetFingerprint };
  document.skinFingerprint = { ...source.skinFingerprint };
  const normalization: T3RigDocument["normalization"] = {
    ...source.normalization,
    sourceToCanonicalRotation: [...source.normalization.sourceToCanonicalRotation],
  };
  document.normalization = normalization;
  return { document, diagnostics, changed };
}
