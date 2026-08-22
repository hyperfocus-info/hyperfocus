import { expect, test } from "bun:test";
import { Matrix4, Quaternion, Vector3, type SkinnedMesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { autoMapHumanoidRig } from "./mapping.ts";
import { requiredHumanoidSemantics, type HumanoidSemantic, type SourceRigDescriptor } from "./rig.ts";

const semanticNames: Record<(typeof requiredHumanoidSemantics)[number], string> = {
  hips: "Hips",
  head: "Head",
  leftUpperArm: "LeftArm",
  leftLowerArm: "LeftForeArm",
  leftHand: "LeftHand",
  rightUpperArm: "RightArm",
  rightLowerArm: "RightForeArm",
  rightHand: "RightHand",
  leftUpperLeg: "LeftUpLeg",
  leftLowerLeg: "LeftLeg",
  leftFoot: "LeftFoot",
  rightUpperLeg: "RightUpLeg",
  rightLowerLeg: "RightLeg",
  rightFoot: "RightFoot",
};

function mapperSource(options: { mixamo?: boolean; scrambled?: boolean; vrm?: boolean } = {}): SourceRigDescriptor {
  const semantics = [...requiredHumanoidSemantics];
  const bones = semantics.map((semantic, index) => {
    const baseName = options.scrambled ? `joint_${index}` : semanticNames[semantic];
    const name = options.mixamo ? `mixamorig:${baseName}` : baseName;
    return {
      index,
      parentIndex: -1,
      name,
      hierarchyPath: `Rig/${name}`,
      siblingOrdinal: index,
      skinJointOrdinal: index,
      bindTransform: { translation: [index * 0.1, 0, 0] as const, rotation: [0, 0, 0, 1] as const },
      structuralHash: { algorithm: "test", value: `bone-${semantic}` },
    };
  });
  const vrmHumanoid: Partial<Record<HumanoidSemantic, number>> = {};
  if (options.vrm) for (const [index, semantic] of semantics.entries()) vrmHumanoid[semantic] = index;
  return {
    assetFingerprint: { algorithm: "test", value: "asset" },
    skinFingerprint: { algorithm: "test", value: "skin" },
    normalization: {
      sourceUp: "+y",
      sourceForward: "+z",
      sourceHandedness: "right",
      metersPerUnit: 1,
      sourceToCanonicalRotation: [0, 0, 0, 1],
    },
    bones,
    ...(options.vrm ? { vrmHumanoid } : {}),
  };
}

type OpaqueBoneDefinition = {
  parent: number;
  translation: readonly [number, number, number];
};

const opaqueHumanoidDefinitions: readonly OpaqueBoneDefinition[] = [
  { parent: -1, translation: [0, 0, 0] },
  { parent: 0, translation: [0, 0.95, 0] },
  { parent: 1, translation: [0, 0.23, 0] },
  { parent: 2, translation: [0, 0.22, 0] },
  { parent: 3, translation: [0, 0.18, 0] },
  { parent: 4, translation: [0, 0.12, 0] },
  { parent: 5, translation: [0, 0.17, 0] },
  { parent: 4, translation: [0.13, 0.08, 0] },
  { parent: 7, translation: [0.22, 0, 0] },
  { parent: 8, translation: [0.25, 0, 0] },
  { parent: 9, translation: [0.22, 0, 0] },
  { parent: 10, translation: [0.08, 0, 0] },
  { parent: 4, translation: [-0.13, 0.08, 0] },
  { parent: 12, translation: [-0.22, 0, 0] },
  { parent: 13, translation: [-0.25, 0, 0] },
  { parent: 14, translation: [-0.22, 0, 0] },
  { parent: 15, translation: [-0.08, 0, 0] },
  { parent: 1, translation: [0.09, -0.08, 0] },
  { parent: 17, translation: [0, -0.43, 0] },
  { parent: 18, translation: [0, -0.42, 0.08] },
  { parent: 19, translation: [0, 0, 0.12] },
  { parent: 1, translation: [-0.09, -0.08, 0] },
  { parent: 21, translation: [0, -0.43, 0] },
  { parent: 22, translation: [0, -0.42, 0.08] },
  { parent: 23, translation: [0, 0, 0.12] },
];

function opaqueName(ordinal: number) {
  return `q${((ordinal + 17) * 7919).toString(36)}`;
}

function opaqueCanonicalHumanoid(order = opaqueHumanoidDefinitions.map((_entry, index) => index)): SourceRigDescriptor {
  const newIndexByOrdinal = new Map(order.map((ordinal, index) => [ordinal, index] as const));
  const paths = new Map<number, string>();
  const pathFor = (ordinal: number): string => {
    const cached = paths.get(ordinal);
    if (cached) return cached;
    const definition = opaqueHumanoidDefinitions[ordinal];
    const name = opaqueName(ordinal);
    const path = definition.parent < 0 ? name : `${pathFor(definition.parent)}/${name}`;
    paths.set(ordinal, path);
    return path;
  };
  return {
    assetFingerprint: { algorithm: "test", value: "opaque-asset" },
    skinFingerprint: { algorithm: "test", value: "opaque-skin" },
    normalization: {
      sourceUp: "+y",
      sourceForward: "+z",
      sourceHandedness: "right",
      metersPerUnit: 1,
      sourceToCanonicalRotation: [0, 0, 0, 1],
    },
    bones: order.map((ordinal, index) => {
      const definition = opaqueHumanoidDefinitions[ordinal];
      return {
        index,
        parentIndex: definition.parent < 0 ? -1 : newIndexByOrdinal.get(definition.parent)!,
        name: opaqueName(ordinal),
        hierarchyPath: pathFor(ordinal),
        siblingOrdinal: ordinal,
        skinJointOrdinal: ordinal,
        bindTransform: { translation: definition.translation, rotation: [0, 0, 0, 1] as const },
        structuralHash: { algorithm: "test", value: `s${((ordinal + 31) * 3571).toString(36)}` },
      };
    }),
  };
}

class MappingTestFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;

  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then((result) => {
      this.result = result;
      queueMicrotask(() => this.onloadend?.());
    });
  }

  readAsDataURL(blob: Blob): void {
    void blob.arrayBuffer().then((result) => {
      this.result = `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(result).toString("base64")}`;
      queueMicrotask(() => this.onloadend?.());
    });
  }
}

async function renamedLabFixtureSource(): Promise<SourceRigDescriptor> {
  const runtime = globalThis as unknown as { FileReader?: unknown };
  if (typeof runtime.FileReader !== "function") runtime.FileReader = MappingTestFileReader;
  const bytes = await Bun.file(new URL("../../examples/motion-lab/assets/fixtures/renamed_bones_rig.glb", import.meta.url)).arrayBuffer();
  const gltf = await new GLTFLoader().parseAsync(bytes, "");
  let mesh: SkinnedMesh | undefined;
  gltf.scene.traverse((object) => {
    if (!mesh && "isSkinnedMesh" in object && object.isSkinnedMesh) mesh = object as SkinnedMesh;
  });
  if (!mesh) throw new Error("renamed motion-lab fixture has no skinned mesh");
  gltf.scene.updateMatrixWorld(true);
  const bones = mesh.skeleton.bones;
  const indices = new Map(bones.map((bone, index) => [bone, index] as const));
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  return {
    assetFingerprint: { algorithm: "test", value: "renamed-lab-asset" },
    skinFingerprint: { algorithm: "test", value: "renamed-lab-skin" },
    normalization: {
      sourceUp: "+y",
      sourceForward: "+z",
      sourceHandedness: "right",
      metersPerUnit: 1,
      sourceToCanonicalRotation: [0, 0, 0, 1],
    },
    bones: bones.map((bone, index) => {
      const parentIndex = indices.get(bone.parent as (typeof bones)[number]) ?? -1;
      const canonicalLocal = parentIndex < 0
        ? bone.matrixWorld.clone()
        : new Matrix4().copy(bones[parentIndex].matrixWorld).invert().multiply(bone.matrixWorld);
      canonicalLocal.decompose(position, rotation, scale);
      const siblingOrdinal = bone.parent?.children.filter((child) => indices.has(child as (typeof bones)[number])).indexOf(bone) ?? 0;
      return {
        index,
        parentIndex,
        name: bone.name,
        hierarchyPath: `opaque/${bone.name}`,
        siblingOrdinal,
        skinJointOrdinal: index,
        bindTransform: {
          translation: [position.x, position.y, position.z],
          rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
          scale: [scale.x, scale.y, scale.z],
        },
        structuralHash: { algorithm: "test", value: `opaque-${index}` },
      };
    }),
  };
}

function isDescendant(source: SourceRigDescriptor, descendant: number, ancestor: number) {
  let cursor = descendant;
  while (cursor >= 0) {
    if (cursor === ancestor) return true;
    cursor = source.bones[cursor]?.parentIndex ?? -1;
  }
  return false;
}

test("Mixamo auto-mapping recognizes namespace-prefixed standard bones", () => {
  const source = mapperSource({ mixamo: true });
  const before = JSON.stringify(source);
  const result = autoMapHumanoidRig(source, { profile: "mixamo" });
  expect(result.validated).toBe(true);
  for (const semantic of requiredHumanoidSemantics) {
    expect(result.document.semantics[semantic]?.provenance).toBe("mixamo");
    expect(result.document.semantics[semantic]?.confidence).toBe(1);
  }
  expect(JSON.stringify(source)).toBe(before);
});

test("VRM hints authoritatively map arbitrary names", () => {
  const result = autoMapHumanoidRig(mapperSource({ scrambled: true, vrm: true }), { profile: "vrm" });
  expect(result.validated).toBe(true);
  for (const semantic of requiredHumanoidSemantics) {
    expect(result.document.semantics[semantic]?.provenance).toBe("vrm");
    expect(result.document.semantics[semantic]?.confidence).toBe(1);
  }
});

test("common glTF naming heuristics map required humanoid roles", () => {
  const result = autoMapHumanoidRig(mapperSource(), { profile: "gltf" });
  expect(result.validated).toBe(true);
  expect(result.document.semantics.leftLowerArm?.provenance).toBe("gltf-heuristic");
});

test("unrecognized rigs remain importable with unresolved warnings", () => {
  const source = mapperSource({ scrambled: true });
  const result = autoMapHumanoidRig(source);
  expect(result.validated).toBe(false);
  expect(result.diagnostics).toHaveLength(requiredHumanoidSemantics.length);
  expect(result.document.semantics.hips).toBeNull();
});

test("opaque humanoids map mandatory semantics from canonical bind geometry and topology", () => {
  const source = opaqueCanonicalHumanoid();
  const result = autoMapHumanoidRig(source);
  const expectedOrdinals: Record<(typeof requiredHumanoidSemantics)[number], number> = {
    hips: 1,
    head: 6,
    leftUpperArm: 8,
    leftLowerArm: 9,
    leftHand: 10,
    rightUpperArm: 13,
    rightLowerArm: 14,
    rightHand: 15,
    leftUpperLeg: 17,
    leftLowerLeg: 18,
    leftFoot: 19,
    rightUpperLeg: 21,
    rightLowerLeg: 22,
    rightFoot: 23,
  };
  for (const semantic of requiredHumanoidSemantics) {
    const binding = result.document.semantics[semantic];
    expect(binding).not.toBeNull();
    expect(binding?.evidence.skinJointOrdinal).toBe(expectedOrdinals[semantic]);
    expect(binding?.provenance).toBe("gltf-heuristic");
    expect(binding?.confidence).toBeLessThan(0.96);
  }
  expect(result.validated).toBe(false);
  expect(result.diagnostics.map((entry) => entry.code)).toEqual(["topology-mapping-review"]);
});

test("topology mapping is stable across source-array order and uses skin ordinals as tie-breaks", () => {
  const order = [24, 7, 2, 18, 12, 1, 23, 10, 4, 21, 0, 16, 8, 20, 13, 6, 22, 3, 14, 11, 17, 9, 19, 5, 15];
  const ordered = autoMapHumanoidRig(opaqueCanonicalHumanoid());
  const shuffled = autoMapHumanoidRig(opaqueCanonicalHumanoid(order));
  for (const semantic of requiredHumanoidSemantics) {
    expect(shuffled.document.semantics[semantic]?.evidence.skinJointOrdinal).toBe(
      ordered.document.semantics[semantic]?.evidence.skinJointOrdinal,
    );
  }
  expect(shuffled.diagnostics.map((entry) => entry.code)).toEqual(["topology-mapping-review"]);
});

test("generated renamed-bones laboratory fixture resolves without fixture IDs or canonical names", async () => {
  const source = await renamedLabFixtureSource();
  expect(source.bones.every((bone) => /^joint_\d+$/.test(bone.name))).toBe(true);
  const result = autoMapHumanoidRig(source);
  for (const semantic of requiredHumanoidSemantics) expect(result.document.semantics[semantic]).not.toBeNull();
  const semantics = result.document.semantics;
  expect(isDescendant(source, semantics.head!.boneIndex, semantics.hips!.boneIndex)).toBe(true);
  for (const side of ["left", "right"] as const) {
    const upperArm = semantics[`${side}UpperArm`];
    const lowerArm = semantics[`${side}LowerArm`];
    const hand = semantics[`${side}Hand`];
    const upperLeg = semantics[`${side}UpperLeg`];
    const lowerLeg = semantics[`${side}LowerLeg`];
    const foot = semantics[`${side}Foot`];
    expect(isDescendant(source, lowerArm!.boneIndex, upperArm!.boneIndex)).toBe(true);
    expect(isDescendant(source, hand!.boneIndex, lowerArm!.boneIndex)).toBe(true);
    expect(isDescendant(source, upperLeg!.boneIndex, semantics.hips!.boneIndex)).toBe(true);
    expect(isDescendant(source, lowerLeg!.boneIndex, upperLeg!.boneIndex)).toBe(true);
    expect(isDescendant(source, foot!.boneIndex, lowerLeg!.boneIndex)).toBe(true);
  }
  expect(result.validated).toBe(false);
  expect(result.diagnostics.map((entry) => entry.code)).toEqual(["topology-mapping-review"]);
});
