import { expect, test } from "bun:test";
import { autoMapHumanoidRig } from "./mapping.ts";
import {
  canonicalRigCoordinates,
  compileSemanticRig,
  getRigSemanticIndex,
  getRigTagIndices,
  humanoidSemantics,
  parseT3Rig,
  serializeT3Rig,
  type SourceRigDescriptor,
} from "./rig.ts";
import type { MotionQuaternion, MotionVec3 } from "./math.ts";

const identityRotation: MotionQuaternion = [0, 0, 0, 1];

function requireValue<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) throw new Error(`Expected ${label} in the rig fixture`);
  return value;
}

test("canonical rig basis fixes semantic sides for +Z-forward motion", () => {
  expect(canonicalRigCoordinates).toMatchObject({ up: "+y", forward: "+z", left: "+x", right: "-x", handedness: "right" });
});

function sourceRig(): SourceRigDescriptor {
  const definitions: Array<[string, number, MotionVec3]> = [
    ["Armature", -1, [0, 0, 0]],
    ["Hips", 0, [0, 1, 0]],
    ["Spine", 1, [0, 0.25, 0]],
    ["Chest", 2, [0, 0.25, 0]],
    ["Head", 3, [0, 0.35, 0]],
    ["LeftArm", 3, [0.2, 0.2, 0]],
    ["LeftForeArm", 5, [0.35, 0, 0]],
    ["LeftHand", 6, [0.3, 0, 0]],
    ["RightArm", 3, [-0.2, 0.2, 0]],
    ["RightForeArm", 8, [-0.35, 0, 0]],
    ["RightHand", 9, [-0.3, 0, 0]],
    ["LeftUpLeg", 1, [0.12, -0.15, 0]],
    ["LeftLeg", 11, [0, -0.45, 0]],
    ["LeftFoot", 12, [0, -0.45, 0.08]],
    ["RightUpLeg", 1, [-0.12, -0.15, 0]],
    ["RightLeg", 14, [0, -0.45, 0]],
    ["RightFoot", 15, [0, -0.45, 0.08]],
  ];
  const paths: string[] = [];
  const bones = definitions.map(([name, parentIndex, translation], index) => {
    const hierarchyPath = parentIndex < 0 ? name : `${paths[parentIndex]}/${name}`;
    paths[index] = hierarchyPath;
    return {
      index,
      parentIndex,
      name,
      hierarchyPath,
      siblingOrdinal: 0,
      skinJointOrdinal: index,
      bindTransform: { translation, rotation: identityRotation },
      structuralHash: { algorithm: "test", value: `bone-${index}` },
    };
  });
  return {
    assetFingerprint: { algorithm: "test", value: "asset" },
    skinFingerprint: { algorithm: "test", value: "skin" },
    normalization: {
      sourceUp: "+y",
      sourceForward: "+z",
      sourceHandedness: "right",
      metersPerUnit: 1,
      sourceToCanonicalRotation: identityRotation,
    },
    bones,
  };
}

test("compiled semantic rigs preserve deform slots and append virtual hubs", () => {
  const source = sourceRig();
  const mapped = autoMapHumanoidRig(source);
  expect(mapped.validated).toBe(true);
  const rig = compileSemanticRig(source, mapped.document, {
    virtualHubs: [{ id: "weaponGrip", parent: "leftHand", tags: ["Weapon"] }],
  });
  expect(rig.deformCount).toBe(source.bones.length);
  expect(rig.motionRootIndex).toBe(source.bones.length);
  expect(rig.totalCount).toBe(source.bones.length + 2);
  const hips = getRigSemanticIndex(rig, "hips");
  expect(rig.sourceParents[hips]).toBe(0);
  expect(rig.semanticParents[hips]).toBe(rig.motionRootIndex);
  expect(getRigTagIndices(rig, "Hips")?.[0]).toBe(hips);
  expect(getRigTagIndices(rig, "weaponGrip")?.[0]).toBe(source.bones.length + 1);
  expect(getRigTagIndices(rig, "Weapon")?.[0]).toBe(source.bones.length + 1);
  const orderPosition = new Map(Array.from(rig.evaluationOrder, (index, order) => [index, order]));
  for (let index = 0; index < rig.semanticParents.length; index += 1) {
    const parent = rig.semanticParents[index];
    if (parent >= 0) {
      const parentOrder = requireValue(orderPosition.get(parent), "parent evaluation order");
      const childOrder = requireValue(orderPosition.get(index), "child evaluation order");
      expect(parentOrder).toBeLessThan(childOrder);
    }
  }
});

test("incomplete humanoids compile with warnings and capability gating", () => {
  const complete = sourceRig();
  const source: SourceRigDescriptor = { ...complete, bones: complete.bones.slice(0, 5) };
  const mapped = autoMapHumanoidRig(source);
  const rig = compileSemanticRig(source, mapped.document);
  expect(rig.validated).toBe(false);
  expect(rig.capabilities.aim).toBe(true);
  expect(rig.capabilities.leftFootPlant).toBe(false);
  expect(rig.capabilities.rightReach).toBe(false);
  expect(rig.diagnostics.some((entry) => entry.code === "semantic-unresolved")).toBe(true);
  expect(rig.referenceRotations[rig.motionRootIndex * 4 + 3]).toBe(1);
});

test("t3rig parsing rejects malformed and non-normalized transforms", () => {
  const document = autoMapHumanoidRig(sourceRig()).document;
  const missing = structuredClone(document);
  Reflect.deleteProperty(missing.semantics, "head");
  expect(() => parseT3Rig(missing)).toThrow(/missing property.*head/);
  const malformed = structuredClone(document);
  requireValue(malformed.semantics.hips, "hips semantic").evidence.bindTransform.rotation = [0, 0, 0, 2];
  expect(() => parseT3Rig(malformed)).toThrow(/normalized/);
  expect(() => parseT3Rig({ ...document, unknown: true })).toThrow(/unsupported property/);
});

test("source identities allow duplicate paths only when sibling ordinals disambiguate them", () => {
  const source = sourceRig();
  const duplicatePath = source.bones[6].hierarchyPath;
  const disambiguated: SourceRigDescriptor = {
    ...source,
    bones: source.bones.map((bone, index) => index === 7 ? { ...bone, hierarchyPath: duplicatePath, siblingOrdinal: 1 } : bone),
  };
  expect(() => autoMapHumanoidRig(disambiguated)).not.toThrow();
  const ambiguous: SourceRigDescriptor = {
    ...source,
    bones: source.bones.map((bone, index) => index === 7 ? { ...bone, hierarchyPath: duplicatePath, siblingOrdinal: 0 } : bone),
  };
  expect(() => autoMapHumanoidRig(ambiguous)).toThrow(/duplicate source bone path/);
});

test("t3rig serialization is recursively canonical and does not mutate input", () => {
  const document = autoMapHumanoidRig(sourceRig()).document;
  document.tags.ZTag = [requireValue(document.semantics.head, "head semantic")];
  document.tags.ATag = [requireValue(document.semantics.leftHand, "left-hand semantic")];
  const reordered = structuredClone(document);
  const originalSemantics = structuredClone(reordered.semantics);
  for (const semantic of humanoidSemantics) Reflect.deleteProperty(reordered.semantics, semantic);
  for (const semantic of [...humanoidSemantics].reverse()) reordered.semantics[semantic] = originalSemantics[semantic];
  reordered.tags = { ZTag: reordered.tags.ZTag, ATag: reordered.tags.ATag };
  const before = JSON.stringify(reordered);
  expect(serializeT3Rig(reordered)).toBe(serializeT3Rig(document));
  expect(JSON.stringify(reordered)).toBe(before);
  expect(serializeT3Rig(document).endsWith("\n")).toBe(true);
});
