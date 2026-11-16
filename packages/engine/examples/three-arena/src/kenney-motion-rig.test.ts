import { expect, test } from "bun:test";
import { Group, Skeleton, SkinnedMesh } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import {
  compileThreeHumanoidRig,
  createThreeHumanoidMotionController,
} from "@hyperfocus/engine/motion/three";
import {
  parseT3Rig,
  requiredHumanoidSemantics,
  serializeT3Rig,
} from "@hyperfocus/engine/motion";

const fixtureUrl = new URL("../assets/usable/characters/kenney/models/character-medium.fbx", import.meta.url);
const sidecarUrl = new URL("../assets/usable/characters/kenney/models/character-medium.t3rig", import.meta.url);

async function loadKenneyMotionFixture() {
  const bytes = await Bun.file(fixtureUrl).arrayBuffer();
  const rigRoot = new FBXLoader().parse(bytes, "");
  rigRoot.scale.setScalar(0.03);
  const motionRoot = new Group();
  motionRoot.name = "KenneyMotionRoot";
  motionRoot.add(rigRoot);
  motionRoot.updateMatrixWorld(true);
  let skeleton: unknown = null;
  rigRoot.traverse((object) => {
    if (!skeleton && object instanceof SkinnedMesh) skeleton = object.skeleton;
  });
  if (!(skeleton instanceof Skeleton)) throw new Error("Kenney motion fixture has no SkinnedMesh skeleton");
  return { motionRoot, rigRoot, skeleton };
}

test("Kenney sidecar is canonical and drives the scaled rig through an unscaled MotionRoot", async () => {
  const sidecar = await Bun.file(sidecarUrl).text();
  const document = parseT3Rig(sidecar);
  expect(serializeT3Rig(document)).toBe(sidecar);
  expect(document.semantics.leftToes).toMatchObject({ boneIndex: 40, confidence: 0, provenance: "manual", verified: true });
  expect(document.semantics.rightToes).toMatchObject({ boneIndex: 44, confidence: 0, provenance: "manual", verified: true });
  const fixture = await loadKenneyMotionFixture();
  const controller = createThreeHumanoidMotionController({
    root: fixture.rigRoot,
    motionRoot: fixture.motionRoot,
    skeleton: fixture.skeleton,
    t3rig: sidecar,
  });

  expect(controller.mappingDiagnostics).toEqual([]);
  expect(controller.rig.validated).toBe(true);
  expect(controller.rig.capabilities.leftFootPlant).toBe(true);
  expect(controller.rig.capabilities.rightFootPlant).toBe(true);
  for (const semantic of requiredHumanoidSemantics) {
    expect(controller.document.semantics[semantic]).not.toBeNull();
  }
  // This FBX's imported control root is already authoritative. Reconstructing
  // it through Skeleton.pose() expands this scale from ~3 to ~300 and moves
  // the hips hundreds of meters away before semantic evaluation begins.
  const hipsIndex = controller.document.semantics.hips!.boneIndex;
  const hipsOffset = hipsIndex * 3;
  expect(controller.rig.referenceScales[hipsOffset]).toBeGreaterThan(2.9);
  expect(controller.rig.referenceScales[hipsOffset]).toBeLessThan(3.1);
  expect(Math.abs(controller.rig.referenceTranslations[hipsOffset + 2])).toBeLessThan(1);

  controller.teleport({ x: 4, y: 0, z: -2 });
  controller.setFacing({ x: 1, y: 0, z: 0 });
  controller.move({ x: 3, y: 0, z: 0 });
  controller.update(0.016666666666666666);
  expect(fixture.motionRoot.scale.toArray()).toEqual([1, 1, 1]);
  expect(fixture.rigRoot.scale.toArray()).toEqual([0.03, 0.03, 0.03]);
  expect(fixture.motionRoot.position.x).toBeGreaterThan(4);
  expect(controller.state.metrics.poseFinite).toBe(true);
});

test("Kenney sidecar reconciles after all FBX bones are renamed", async () => {
  const sidecar = await Bun.file(sidecarUrl).text();
  const fixture = await loadKenneyMotionFixture();
  fixture.skeleton.bones.forEach((bone, index) => {
    bone.name = `opaque_${index}`;
  });
  const compilation = compileThreeHumanoidRig(fixture.skeleton, {
    coordinateRoot: fixture.motionRoot,
    t3rig: sidecar,
  });

  expect(compilation.reconciled).toBe(true);
  expect(compilation.diagnostics).toEqual([]);
  expect(compilation.rig.validated).toBe(true);
  for (const semantic of requiredHumanoidSemantics) {
    const binding = compilation.document.semantics[semantic];
    expect(binding).not.toBeNull();
    expect(binding?.provenance).toBe("reconciled");
    expect(binding?.confidence).toBeGreaterThanOrEqual(0.6);
  }
});
