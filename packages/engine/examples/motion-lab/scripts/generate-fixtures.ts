import { isFiniteNumber } from "@hyperfocus/utilities/math";
import { isRecord as isJsonRecord } from "@hyperfocus/utilities/records";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  Bone,
  Box3,
  Group,
  MeshStandardMaterial,
  Skeleton,
  type Object3D,
  type SkinnedMesh,
  Vector3,
} from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const FIXTURE_IDS = [
  "canonical",
  "renamed-bones",
  "ape-proportions",
  "extra-bones",
  "incomplete",
] as const;

export type MotionLabFixtureId = (typeof FIXTURE_IDS)[number];

export const FIXTURE_FILE_NAMES: Record<MotionLabFixtureId, string> = {
  "ape-proportions": "ape_proportions_rig.glb",
  canonical: "canonical_rig.glb",
  "extra-bones": "extra_bones_rig.glb",
  incomplete: "incomplete_rig.glb",
  "renamed-bones": "renamed_bones_rig.glb",
};

export const ASSET_BUDGET_BYTES = 1_048_576;
export const TARGET_HEIGHT_METERS = 1.8;
export const SOURCE_SHA256 = "18835fef534eede635b081ee7fe647d01a885550a591d2e6bf071010906167d8";

const ENGINE_ROOT = resolve(import.meta.dir, "..", "..", "..");
const SOURCE_REPOSITORY_PATH = "examples/three-arena/assets/source/kenney/animated-characters-survivors/Model/characterMedium.fbx";
const LICENSE_REPOSITORY_PATH = "examples/three-arena/assets/source/kenney/animated-characters-survivors/License.txt";
const SOURCE_PATH = resolve(ENGINE_ROOT, SOURCE_REPOSITORY_PATH);
const LICENSE_PATH = resolve(ENGINE_ROOT, LICENSE_REPOSITORY_PATH);
const DEFAULT_OUTPUT_DIRECTORY = resolve(import.meta.dir, "..", "assets");
const SOURCE_OUTPUT_PATH = "source/kenney-character-medium.fbx";
const LICENSE_OUTPUT_PATH = "source/LICENSE.txt";
const PROVENANCE_OUTPUT_PATH = "source/PROVENANCE.json";
const MANIFEST_OUTPUT_PATH = "manifest.json";

type JsonRecord = Record<string, unknown>;

export type GlbInspection = {
  animations: number;
  assetVersion: string | null;
  jointNames: string[];
  joints: number;
  meshes: number;
  nodeNames: string[];
  nodes: number;
  scenes: number;
  skins: number;
};

export type MotionLabFixtureManifestEntry = {
  byteLength: number;
  expected: {
    completeArmChains: boolean;
    completeLegChains: boolean;
    extraBonePassthrough: boolean;
    nameBasedMapping: boolean;
  };
  file: string;
  id: MotionLabFixtureId;
  inspection: GlbInspection;
  sha256: string;
  transform: string;
};

export type MotionLabFixtureManifest = {
  budget: {
    limitBytes: number;
    remainingBytes: number;
    scope: string;
    totalBytes: number;
  };
  coordinateSystem: {
    forward: "+Z";
    handedness: "right";
    targetHeightMeters: number;
    units: "meters";
    up: "+Y";
  };
  fixtures: MotionLabFixtureManifestEntry[];
  generator: {
    path: string;
    version: number;
  };
  license: {
    id: "CC0-1.0";
    localFile: string;
    sourceUrl: string;
  };
  schemaVersion: number;
  source: {
    copiedFile: string;
    name: string;
    repositoryPath: string;
    sha256: string;
  };
};

export type GenerateMotionLabFixturesOptions = {
  outputDirectory?: string;
};

type FixtureSpec = {
  expected: MotionLabFixtureManifestEntry["expected"];
  id: MotionLabFixtureId;
  transform: string;
  transformModel?: (root: Group, mesh: SkinnedMesh) => void;
};

const FIXTURE_SPECS: readonly FixtureSpec[] = [
  {
    id: "canonical",
    transform: "Canonical Kenney hierarchy with exact indexed geometry and clips removed.",
    expected: {
      completeArmChains: true,
      completeLegChains: true,
      extraBonePassthrough: false,
      nameBasedMapping: true,
    },
  },
  {
    id: "renamed-bones",
    transform: "Every bone receives a stable opaque joint identifier; topology and skinning are unchanged.",
    transformModel: renameBones,
    expected: {
      completeArmChains: true,
      completeLegChains: true,
      extraBonePassthrough: false,
      nameBasedMapping: false,
    },
  },
  {
    id: "ape-proportions",
    transform: "Arm bind segments are lengthened and leg bind segments shortened, with the rest mesh baked coherently.",
    transformModel: applyApeProportions,
    expected: {
      completeArmChains: true,
      completeLegChains: true,
      extraBonePassthrough: false,
      nameBasedMapping: true,
    },
  },
  {
    id: "extra-bones",
    transform: "Zero-weight wing and ponytail bone chains are appended to semantic hubs and included in the skin joint table.",
    transformModel: appendExtraBones,
    expected: {
      completeArmChains: true,
      completeLegChains: true,
      extraBonePassthrough: true,
      nameBasedMapping: true,
    },
  },
  {
    id: "incomplete",
    transform: "Knee and forearm deform joints are removed; children are reparented and affected weights degrade to surviving parents.",
    transformModel: removeIntermediateLimbBones,
    expected: {
      completeArmChains: false,
      completeLegChains: false,
      extraBonePassthrough: false,
      nameBasedMapping: true,
    },
  },
];

function BunFileReader() {
  const reader: {
    result: ArrayBuffer | string | null;
    onloadend: (() => void) | null;
    readAsArrayBuffer(blob: Blob): void;
    readAsDataURL(blob: Blob): void;
  } = {
    result: null,
    onloadend: null,
    readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then((result) => {
      reader.result = result;
      queueMicrotask(() => reader.onloadend?.());
    });
    },
    readAsDataURL(blob: Blob): void {
    void blob.arrayBuffer().then((result) => {
      reader.result = `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(result).toString("base64")}`;
      queueMicrotask(() => reader.onloadend?.());
    });
    }
  };
  return reader;
}

function installFileReaderPolyfill(): void {
  if (typeof globalThis.FileReader !== "function") {
    Object.defineProperty(globalThis, "FileReader", { configurable: true, writable: true, value: BunFileReader });
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function stableJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

async function writeBytes(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function isSkinnedMesh(object: Object3D): object is SkinnedMesh {
  return "isSkinnedMesh" in object && object.isSkinnedMesh === true;
}

function isBone(object: Object3D): object is Bone {
  return "isBone" in object && object.isBone === true;
}





function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isFixtureId(value: unknown): value is MotionLabFixtureId {
  return typeof value === "string" && FIXTURE_IDS.some((id) => id === value);
}

function isFixtureManifestEntry(value: unknown): value is MotionLabFixtureManifestEntry {
  if (!isJsonRecord(value) || !isFixtureId(value.id)) return false;
  if (typeof value.byteLength !== "number" || typeof value.file !== "string" || typeof value.sha256 !== "string" || typeof value.transform !== "string") return false;
  const expected = value.expected;
  const inspection = value.inspection;
  return isJsonRecord(expected)
    && [expected.completeArmChains, expected.completeLegChains, expected.extraBonePassthrough, expected.nameBasedMapping].every((entry) => typeof entry === "boolean")
    && isJsonRecord(inspection)
    && [inspection.animations, inspection.joints, inspection.meshes, inspection.nodes, inspection.scenes, inspection.skins].every(isFiniteNumber)
    && (inspection.assetVersion === null || typeof inspection.assetVersion === "string")
    && isStringArray(inspection.jointNames)
    && isStringArray(inspection.nodeNames);
}

export function parseMotionLabFixtureManifest(value: unknown): MotionLabFixtureManifest {
  if (!isJsonRecord(value) || !Array.isArray(value.fixtures) || !value.fixtures.every(isFixtureManifestEntry)) {
    throw new Error("Motion Lab fixture manifest is invalid.");
  }
  const budget = value.budget;
  const coordinateSystem = value.coordinateSystem;
  const generator = value.generator;
  const license = value.license;
  const source = value.source;
  if (!isJsonRecord(budget) || !isFiniteNumber(budget.limitBytes) || !isFiniteNumber(budget.remainingBytes) || !isFiniteNumber(budget.totalBytes) || typeof budget.scope !== "string"
    || !isJsonRecord(coordinateSystem) || coordinateSystem.forward !== "+Z" || coordinateSystem.handedness !== "right" || coordinateSystem.units !== "meters" || coordinateSystem.up !== "+Y" || !isFiniteNumber(coordinateSystem.targetHeightMeters)
    || !isJsonRecord(generator) || typeof generator.path !== "string" || !isFiniteNumber(generator.version)
    || !isJsonRecord(license) || license.id !== "CC0-1.0" || typeof license.localFile !== "string" || typeof license.sourceUrl !== "string"
    || !isJsonRecord(source) || typeof source.copiedFile !== "string" || typeof source.name !== "string" || typeof source.repositoryPath !== "string" || typeof source.sha256 !== "string"
    || !isFiniteNumber(value.schemaVersion)) {
    throw new Error("Motion Lab fixture manifest metadata is invalid.");
  }
  return {
    budget: { limitBytes: budget.limitBytes, remainingBytes: budget.remainingBytes, scope: budget.scope, totalBytes: budget.totalBytes },
    coordinateSystem: {
      forward: coordinateSystem.forward,
      handedness: coordinateSystem.handedness,
      targetHeightMeters: coordinateSystem.targetHeightMeters,
      units: coordinateSystem.units,
      up: coordinateSystem.up,
    },
    fixtures: value.fixtures,
    generator: { path: generator.path, version: generator.version },
    license: { id: license.id, localFile: license.localFile, sourceUrl: license.sourceUrl },
    schemaVersion: value.schemaVersion,
    source: { copiedFile: source.copiedFile, name: source.name, repositoryPath: source.repositoryPath, sha256: source.sha256 },
  };
}

function findSkinnedMesh(root: Object3D): SkinnedMesh {
  const matches: SkinnedMesh[] = [];
  root.traverse((object) => {
    if (isSkinnedMesh(object)) matches.push(object);
  });
  if (matches.length !== 1 || !matches[0]) {
    throw new Error(`Expected one skinned mesh in the Kenney source, found ${matches.length}.`);
  }
  return matches[0];
}

function findBone(root: Object3D, name: string): Bone {
  let match: Bone | null = null;
  root.traverse((object) => {
    if (!match && isBone(object) && object.name === name) match = object;
  });
  if (!match) throw new Error(`Required source bone is missing: ${name}`);
  return match;
}

function clearExportNoise(root: Object3D): void {
  root.animations = [];
  root.userData = {};
  root.traverse((object) => {
    object.animations = [];
    object.userData = {};
  });
}

function compactGeometry(mesh: SkinnedMesh): void {
  const geometry = mergeVertices(mesh.geometry, 0.0001);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  mesh.geometry = geometry;
  mesh.normalizeSkinWeights();
  mesh.material = new MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.82,
    vertexColors: geometry.getAttribute("color") !== undefined,
  });
  mesh.material.name = "FixtureMaterial";
  mesh.name = "HumanoidMesh";
}

function renameBones(root: Group): void {
  let index = 0;
  root.traverse((object) => {
    if (!isBone(object)) return;
    object.name = `joint_${String(index).padStart(3, "0")}`;
    index += 1;
  });
}

function applyApeProportions(root: Group, mesh: SkinnedMesh): void {
  const segmentFactors: Readonly<Record<string, number>> = {
    LeftFoot: 0.68,
    LeftForeArm: 1.62,
    LeftHand: 1.58,
    LeftLeg: 0.72,
    RightFoot: 0.68,
    RightForeArm: 1.62,
    RightHand: 1.58,
    RightLeg: 0.72,
  };

  root.updateMatrixWorld(true);
  for (const [name, factor] of Object.entries(segmentFactors)) {
    findBone(root, name).position.multiplyScalar(factor);
  }
  root.updateMatrixWorld(true);

  const positions = mesh.geometry.getAttribute("position");
  const transformed = new Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    transformed.fromBufferAttribute(positions, index);
    mesh.applyBoneTransform(index, transformed);
    positions.setXYZ(index, transformed.x, transformed.y, transformed.z);
  }
  positions.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingBox();
  mesh.geometry.computeBoundingSphere();

  root.updateMatrixWorld(true);
  mesh.skeleton.calculateInverses();
}

function makeBone(name: string, x: number, y: number, z: number): Bone {
  const bone = new Bone();
  bone.name = name;
  bone.position.set(x, y, z);
  return bone;
}

function appendExtraBones(root: Group, mesh: SkinnedMesh): void {
  const upperChest = findBone(root, "UpperChest");
  const head = findBone(root, "Head");
  const wingLeft = makeBone("Wing_L_01", 0.11, 0.09, -0.06);
  const wingLeftTip = makeBone("Wing_L_02", 0, 0.32, 0);
  const wingRight = makeBone("Wing_R_01", -0.11, 0.09, -0.06);
  const wingRightTip = makeBone("Wing_R_02", 0, 0.32, 0);
  const ponytail = makeBone("Ponytail_01", 0, 0.08, -0.12);
  const ponytailTip = makeBone("Ponytail_02", 0, 0.3, 0);
  wingLeft.add(wingLeftTip);
  wingRight.add(wingRightTip);
  ponytail.add(ponytailTip);
  upperChest.add(wingLeft, wingRight);
  head.add(ponytail);

  root.updateMatrixWorld(true);
  const skeleton = new Skeleton([
    ...mesh.skeleton.bones,
    wingLeft,
    wingLeftTip,
    wingRight,
    wingRightTip,
    ponytail,
    ponytailTip,
  ]);
  skeleton.calculateInverses();
  mesh.bind(skeleton, mesh.bindMatrix.clone());
}

function removeIntermediateLimbBones(root: Group, mesh: SkinnedMesh): void {
  const removedNames = ["LeftLeg", "RightLeg", "LeftForeArm", "RightForeArm"] as const;
  const oldBones = [...mesh.skeleton.bones];
  const removedToReplacement = new Map<number, number>();

  root.updateMatrixWorld(true);
  for (const name of removedNames) {
    const bone = findBone(root, name);
    const oldIndex = oldBones.indexOf(bone);
    const parent = bone.parent;
    if (!parent || !isBone(parent)) {
      throw new Error(`Cannot remove ${name}; its deforming parent is unavailable.`);
    }
    const replacement = oldBones.indexOf(parent);
    if (oldIndex < 0 || replacement < 0) throw new Error(`Cannot remove ${name}; its deforming parent is unavailable.`);
    root.updateMatrixWorld(true);
    for (const child of [...bone.children]) parent.attach(child);
    bone.removeFromParent();
    removedToReplacement.set(oldIndex, replacement);
  }

  let auxiliaryIndex = 0;
  root.traverse((object) => {
    if (!isBone(object) || !/knee/i.test(object.name)) return;
    object.name = `aux_leg_control_${String(auxiliaryIndex).padStart(2, "0")}`;
    auxiliaryIndex += 1;
  });

  const survivors = oldBones.filter((_bone, index) => !removedToReplacement.has(index));
  const oldToNew = new Map<number, number>();
  for (const [newIndex, bone] of survivors.entries()) oldToNew.set(oldBones.indexOf(bone), newIndex);

  const skinIndex = mesh.geometry.getAttribute("skinIndex");
  const values = skinIndex.array;
  for (let index = 0; index < values.length; index += 1) {
    const oldIndex = values[index] ?? 0;
    const survivingOldIndex = removedToReplacement.get(oldIndex) ?? oldIndex;
    const newIndex = oldToNew.get(survivingOldIndex);
    if (newIndex === undefined) throw new Error(`Skin influence ${oldIndex} has no surviving joint.`);
    values[index] = newIndex;
  }
  skinIndex.needsUpdate = true;

  root.updateMatrixWorld(true);
  const skeleton = new Skeleton(survivors);
  skeleton.calculateInverses();
  mesh.bind(skeleton, mesh.bindMatrix.clone());
  mesh.normalizeSkinWeights();
}

function normalizeFixture(root: Group, imported: Group): void {
  root.updateMatrixWorld(true);
  const initialBounds = new Box3().setFromObject(root, true);
  const initialSize = initialBounds.getSize(new Vector3());
  const initialCenter = initialBounds.getCenter(new Vector3());
  if (!Number.isFinite(initialSize.y) || initialSize.y <= 0) throw new Error("Fixture source has invalid bounds.");

  imported.position.x -= initialCenter.x;
  imported.position.y -= initialBounds.min.y;
  imported.position.z -= initialCenter.z;
  root.updateMatrixWorld(true);

  const centeredBounds = new Box3().setFromObject(root, true);
  const centeredHeight = centeredBounds.getSize(new Vector3()).y;
  root.scale.setScalar(TARGET_HEIGHT_METERS / centeredHeight);
  root.updateMatrixWorld(true);

  const finalBounds = new Box3().setFromObject(root, true);
  const finalHeight = finalBounds.getSize(new Vector3()).y;
  if (Math.abs(finalHeight - TARGET_HEIGHT_METERS) > 0.0001 || Math.abs(finalBounds.min.y) > 0.0001) {
    throw new Error(`Fixture normalization failed: minY=${finalBounds.min.y}, height=${finalHeight}.`);
  }
}

async function buildFixture(sourceBytes: Uint8Array, spec: FixtureSpec): Promise<Uint8Array> {
  const loader = new FBXLoader();
  const imported = loader.parse(exactArrayBuffer(sourceBytes), `${dirname(SOURCE_PATH).replaceAll("\\", "/")}/`);
  imported.name = "KenneyHumanoid";
  clearExportNoise(imported);
  const mesh = findSkinnedMesh(imported);
  compactGeometry(mesh);
  spec.transformModel?.(imported, mesh);
  clearExportNoise(imported);

  const root = new Group();
  root.name = "FixtureRoot";
  root.add(imported);
  normalizeFixture(root, imported);

  installFileReaderPolyfill();
  const exported = await new GLTFExporter().parseAsync(root, {
    animations: [],
    binary: true,
    includeCustomExtensions: false,
    onlyVisible: false,
    trs: true,
  });
  if (!(exported instanceof ArrayBuffer)) throw new Error(`GLTFExporter did not emit binary output for ${spec.id}.`);
  return new Uint8Array(exported);
}

function jsonRecord(value: unknown): JsonRecord {
  return isJsonRecord(value) ? value : {};
}

export function inspectGlb(bytes: Uint8Array): GlbInspection {
  if (bytes.byteLength < 20) throw new Error("GLB is shorter than its header and first chunk prefix.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("GLB magic header is invalid.");
  if (view.getUint32(4, true) !== 2) throw new Error("Only GLB version 2 is supported.");
  if (view.getUint32(8, true) !== bytes.byteLength) throw new Error("GLB header length does not match the file length.");

  let offset = 12;
  let document: JsonRecord | null = null;
  while (offset + 8 <= bytes.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    if (chunkEnd > bytes.byteLength) throw new Error("GLB chunk extends beyond the file length.");
    if (chunkType === 0x4e4f534a && document === null) {
      const source = new TextDecoder().decode(bytes.subarray(chunkStart, chunkEnd)).trimEnd();
      document = jsonRecord(JSON.parse(source));
    }
    offset = chunkEnd;
  }
  if (offset !== bytes.byteLength) throw new Error("GLB has trailing or truncated chunk data.");
  if (!document) throw new Error("GLB JSON chunk is missing.");

  const nodes = Array.isArray(document.nodes) ? document.nodes.map(jsonRecord) : [];
  const skins = Array.isArray(document.skins) ? document.skins.map(jsonRecord) : [];
  const candidateJoints = skins[0]?.joints;
  const firstSkinJoints: unknown[] = Array.isArray(candidateJoints) ? candidateJoints : [];
  const nodeNames = nodes.map((node) => typeof node.name === "string" ? node.name : "");
  const jointNames = firstSkinJoints.map((joint) => {
    const index = typeof joint === "number" ? joint : -1;
    return index >= 0 ? nodeNames[index] ?? "" : "";
  });
  const asset = jsonRecord(document.asset);
  return {
    animations: Array.isArray(document.animations) ? document.animations.length : 0,
    assetVersion: typeof asset.version === "string" ? asset.version : null,
    jointNames,
    joints: firstSkinJoints.length,
    meshes: Array.isArray(document.meshes) ? document.meshes.length : 0,
    nodeNames,
    nodes: nodes.length,
    scenes: Array.isArray(document.scenes) ? document.scenes.length : 0,
    skins: skins.length,
  };
}

function assertFixtureShape(id: MotionLabFixtureId, inspection: GlbInspection): void {
  if (inspection.assetVersion !== "2.0" || inspection.scenes !== 1 || inspection.meshes !== 1 || inspection.skins !== 1) {
    throw new Error(`${id} did not export as one valid glTF 2.0 skinned humanoid scene.`);
  }
  if (inspection.animations !== 0) throw new Error(`${id} unexpectedly contains animation clips.`);
  if (inspection.joints <= 0) throw new Error(`${id} has no skin joints.`);

  const names = new Set(inspection.nodeNames);
  if (id === "canonical" && !["Hips", "Head", "LeftHand", "RightHand", "LeftFoot", "RightFoot"].every((name) => names.has(name))) {
    throw new Error("Canonical fixture lost mandatory semantic bones.");
  }
  if (id === "renamed-bones" && inspection.nodeNames.some((name) => /hips|head|hand|foot|arm|leg/i.test(name))) {
    throw new Error("Renamed fixture still exposes semantic bone names.");
  }
  if (id === "extra-bones" && !["Wing_L_01", "Wing_L_02", "Wing_R_01", "Wing_R_02", "Ponytail_01", "Ponytail_02"].every((name) => inspection.jointNames.includes(name))) {
    throw new Error("Extra-bones fixture did not retain its appended passthrough joints.");
  }
  if (id === "incomplete" && ["LeftLeg", "RightLeg", "LeftForeArm", "RightForeArm"].some((name) => names.has(name))) {
    throw new Error("Incomplete fixture still contains an intermediate deform limb bone.");
  }
}

export async function generateMotionLabFixtures(
  options: GenerateMotionLabFixturesOptions = {},
): Promise<MotionLabFixtureManifest> {
  const outputDirectory = resolve(options.outputDirectory ?? DEFAULT_OUTPUT_DIRECTORY);
  const sourceBytes = new Uint8Array(await readFile(SOURCE_PATH));
  const licenseBytes = new Uint8Array(await readFile(LICENSE_PATH));
  const sourceHash = sha256(sourceBytes);
  if (sourceHash !== SOURCE_SHA256) {
    throw new Error(`Kenney source hash changed: expected ${SOURCE_SHA256}, received ${sourceHash}.`);
  }

  const provenance = {
    asset: "Kenney Animated Characters Survivors 1.1 - characterMedium.fbx",
    copiedFile: SOURCE_OUTPUT_PATH,
    license: "CC0-1.0",
    licenseFile: LICENSE_OUTPUT_PATH,
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    repositorySource: SOURCE_REPOSITORY_PATH,
    sha256: sourceHash,
    sourceUrl: "https://kenney.nl/assets/animated-characters-survivors",
  } as const;
  const provenanceBytes = stableJson(provenance);

  await writeBytes(resolve(outputDirectory, SOURCE_OUTPUT_PATH), sourceBytes);
  await writeBytes(resolve(outputDirectory, LICENSE_OUTPUT_PATH), licenseBytes);
  await writeBytes(resolve(outputDirectory, PROVENANCE_OUTPUT_PATH), provenanceBytes);

  const fixtures: MotionLabFixtureManifestEntry[] = [];
  for (const spec of FIXTURE_SPECS) {
    const bytes = await buildFixture(sourceBytes, spec);
    const inspection = inspectGlb(bytes);
    assertFixtureShape(spec.id, inspection);
    const file = `fixtures/${FIXTURE_FILE_NAMES[spec.id]}`;
    await writeBytes(resolve(outputDirectory, file), bytes);
    fixtures.push({
      byteLength: bytes.byteLength,
      expected: spec.expected,
      file,
      id: spec.id,
      inspection,
      sha256: sha256(bytes),
      transform: spec.transform,
    });
  }

  const totalBytes = sourceBytes.byteLength
    + licenseBytes.byteLength
    + provenanceBytes.byteLength
    + fixtures.reduce((sum, fixture) => sum + fixture.byteLength, 0);
  if (totalBytes > ASSET_BUDGET_BYTES) {
    throw new Error(`Motion lab assets use ${totalBytes} bytes, exceeding the ${ASSET_BUDGET_BYTES}-byte budget.`);
  }

  const manifest: MotionLabFixtureManifest = {
    budget: {
      limitBytes: ASSET_BUDGET_BYTES,
      remainingBytes: ASSET_BUDGET_BYTES - totalBytes,
      scope: "Copied source FBX, copied CC0 license, provenance JSON, and five runtime GLBs; manifest excluded.",
      totalBytes,
    },
    coordinateSystem: {
      forward: "+Z",
      handedness: "right",
      targetHeightMeters: TARGET_HEIGHT_METERS,
      units: "meters",
      up: "+Y",
    },
    fixtures,
    generator: {
      path: "examples/motion-lab/scripts/generate-fixtures.ts",
      version: 1,
    },
    license: {
      id: "CC0-1.0",
      localFile: LICENSE_OUTPUT_PATH,
      sourceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    },
    schemaVersion: 1,
    source: {
      copiedFile: SOURCE_OUTPUT_PATH,
      name: "Kenney Animated Characters Survivors 1.1 / characterMedium.fbx",
      repositoryPath: SOURCE_REPOSITORY_PATH,
      sha256: sourceHash,
    },
  };
  await writeBytes(resolve(outputDirectory, MANIFEST_OUTPUT_PATH), stableJson(manifest));
  return manifest;
}

function parseOutputDirectory(argv: readonly string[]): string | undefined {
  let outputDirectory: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== "--out-dir") throw new Error(`Unknown fixture generator argument: ${argument}`);
    const value = argv[index + 1];
    if (!value) throw new Error("--out-dir requires a path.");
    outputDirectory = value;
    index += 1;
  }
  return outputDirectory;
}

if (import.meta.main) {
  const outputDirectory = parseOutputDirectory(process.argv.slice(2));
  const manifest = await generateMotionLabFixtures({ outputDirectory });
  console.info(`Generated ${manifest.fixtures.length} motion-lab fixtures (${manifest.budget.totalBytes} budgeted bytes).`);
}
