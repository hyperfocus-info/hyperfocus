import { expect, test } from "bun:test";
import { autoMapHumanoidRig } from "./mapping.ts";
import { reconcileT3Rig, scoreRigBoneEvidence } from "./reconciliation.ts";
import { requiredHumanoidSemantics, type SourceRigDescriptor } from "./rig.ts";

const names = [
  "Hips",
  "Head",
  "LeftArm",
  "LeftForeArm",
  "LeftHand",
  "RightArm",
  "RightForeArm",
  "RightHand",
  "LeftUpLeg",
  "LeftLeg",
  "LeftFoot",
  "RightUpLeg",
  "RightLeg",
  "RightFoot",
] as const;

function sourceRig(): SourceRigDescriptor {
  return {
    assetFingerprint: { algorithm: "test", value: "asset-a" },
    skinFingerprint: { algorithm: "test", value: "skin-a" },
    normalization: {
      sourceUp: "+y",
      sourceForward: "+z",
      sourceHandedness: "right",
      metersPerUnit: 1,
      sourceToCanonicalRotation: [0, 0, 0, 1],
    },
    bones: names.map((name, index) => ({
      index,
      parentIndex: -1,
      name,
      hierarchyPath: `Rig/${name}`,
      siblingOrdinal: index,
      skinJointOrdinal: index,
      bindTransform: { translation: [index * 0.07, index * 0.01, 0], rotation: [0, 0, 0, 1] },
      structuralHash: { algorithm: "test", value: `structure-${index}` },
    })),
  };
}

function renamedAndReordered(source: SourceRigDescriptor): SourceRigDescriptor {
  const permutation = source.bones.map((bone) => bone.index).reverse();
  return {
    ...source,
    assetFingerprint: { algorithm: "test", value: "asset-b" },
    skinFingerprint: { algorithm: "test", value: "skin-b" },
    bones: permutation.map((oldIndex, newIndex) => {
      const bone = source.bones[oldIndex];
      return {
        ...bone,
        index: newIndex,
        name: `renamed_${newIndex}`,
        hierarchyPath: `Changed/renamed_${newIndex}`,
        siblingOrdinal: newIndex,
      };
    }),
  };
}

test("reconciliation survives renamed and reordered bones without mutating inputs", () => {
  const source = sourceRig();
  const document = autoMapHumanoidRig(source).document;
  document.semantics.hips = { ...document.semantics.hips!, provenance: "manual", confidence: 0, verified: true };
  const nextSource = renamedAndReordered(source);
  const documentBefore = JSON.stringify(document);
  const sourceBefore = JSON.stringify(nextSource);
  const result = reconcileT3Rig(nextSource, document);
  expect(result.changed).toBe(true);
  expect(result.diagnostics).toEqual([]);
  for (const semantic of requiredHumanoidSemantics) {
    const oldIndex = document.semantics[semantic]!.boneIndex;
    expect(result.document.semantics[semantic]!.boneIndex).toBe(source.bones.length - oldIndex - 1);
  }
  expect(result.document.semantics.hips?.provenance).toBe("manual");
  expect(result.document.semantics.hips?.confidence).toBe(0);
  expect(result.document.semantics.hips?.verified).toBe(true);
  expect(JSON.stringify(document)).toBe(documentBefore);
  expect(JSON.stringify(nextSource)).toBe(sourceBefore);
});

test("sibling ordinals disambiguate otherwise duplicate hierarchy paths", () => {
  const source = sourceRig();
  const binding = autoMapHumanoidRig(source).document.semantics.leftHand!;
  const exact = { ...source.bones[binding.boneIndex], hierarchyPath: binding.evidence.hierarchyPath, siblingOrdinal: binding.evidence.siblingOrdinal };
  const sibling = { ...exact, siblingOrdinal: exact.siblingOrdinal + 1 };
  expect(scoreRigBoneEvidence(binding.evidence, exact) - scoreRigBoneEvidence(binding.evidence, sibling)).toBeCloseTo(0.1);
});

test("failed manual reconciliation retains the authoritative mapping with a warning", () => {
  const source = sourceRig();
  const document = autoMapHumanoidRig(source).document;
  document.semantics.hips = {
    ...document.semantics.hips!,
    boneIndex: 999,
    provenance: "manual",
    confidence: 0,
    verified: true,
    evidence: {
      ...document.semantics.hips!.evidence,
      hierarchyPath: "missing",
      skinJointOrdinal: 999,
      structuralHash: { algorithm: "test", value: "missing" },
      bindTransform: { translation: [999, 999, 999], rotation: [0, 0, 0, 1] },
    },
  };
  const result = reconcileT3Rig(source, document, { minimumScore: 0.9 });
  expect(result.document.semantics.hips?.boneIndex).toBe(999);
  expect(result.document.semantics.hips?.provenance).toBe("manual");
  expect(result.diagnostics[0]?.code).toBe("binding-reconciliation-failed");
});
