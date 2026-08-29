import { expect, test } from "bun:test";
import { Group, Skeleton, SkinnedMesh } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { createThreeArenaPlayerMotion } from "./player-motion.ts";

const fixtureUrl = new URL("../assets/usable/characters/kenney/models/character-medium.fbx", import.meta.url);
const sidecarUrl = new URL("../assets/usable/characters/kenney/models/character-medium.t3rig", import.meta.url);

async function fixture() {
  const rigRoot = new FBXLoader().parse(await Bun.file(fixtureUrl).arrayBuffer(), "");
  rigRoot.scale.setScalar(0.03);
  const motionRoot = new Group();
  motionRoot.add(rigRoot);
  motionRoot.updateMatrixWorld(true);
  let skeleton: unknown = null;
  rigRoot.traverse((object) => {
    if (!skeleton && object instanceof SkinnedMesh) skeleton = object.skeleton;
  });
  if (!(skeleton instanceof Skeleton)) throw new Error("Kenney fixture has no skeleton");
  return { motionRoot, rigRoot, skeleton };
}

test("Three Arena adapter reconstructs a finite semantic pose from authoritative deltas", async () => {
  const model = await fixture();
  const motion = createThreeArenaPlayerMotion({
    ...model,
    t3rig: await Bun.file(sidecarUrl).text(),
    initialPosition: [0, 0, 0],
    initialFacing: [0, 0, 1],
    maxSpeed: 24,
    fullStrideSpeed: 6,
    heightField: { heightAt: () => 0 },
  });

  let snapshot = motion.snapshot();
  for (let frame = 1; frame <= 90; frame += 1) {
    snapshot = motion.sync({
      position: [0, 0, frame * 0.1],
      resolvedDelta: [0, 0, 0.1],
      desiredVelocity: [0, 0, 6],
      facing: [1, 0, 0],
      aimTarget: [6, 5.8, frame * 0.1],
      grounded: true,
      groundNormal: [0, 1, 0],
    }, 1 / 60);
  }

  expect(snapshot.active).toBe(true);
  expect(snapshot.mappingValidated).toBe(true);
  expect(snapshot.capabilities).toEqual({ aim: true, baseLocomotion: true, leftFootPlant: true, rightFootPlant: true });
  expect(snapshot.metrics.poseFinite).toBe(true);
  expect(snapshot.metrics.footSlipDistance).toBeLessThan(0.02);
  expect(snapshot.metrics.leftGripError).toBeLessThan(0.04);
  expect(snapshot.metrics.rightGripError).toBeLessThan(0.04);
  expect(snapshot.metrics.plantedVerticalError).toBeLessThanOrEqual(1e-4);
  expect(snapshot.metrics.headAboveHipsMeters).toBeGreaterThan(0.2);
  expect(motion.controller.state.locomotion.targetLocomotionWeight).toBe(1);
  for (const side of ["left", "right"] as const) {
    const contact = side === "left" ? motion.controller.state.leftFoot : motion.controller.state.rightFoot;
    if (!contact?.planted) continue;
    const foot = motion.controller.document.semantics[`${side}Foot`]!.boneIndex * 3;
    const toes = motion.controller.document.semantics[`${side}Toes`]!.boneIndex * 3;
    const positions = motion.controller.binding.world.translations;
    const dx = positions[toes] - positions[foot];
    const dy = positions[toes + 1] - positions[foot + 1];
    const dz = positions[toes + 2] - positions[foot + 2];
    expect(Math.abs(dy) / Math.hypot(dx, dy, dz)).toBeLessThan(0.2);
  }
  expect(model.motionRoot.position.z).toBeCloseTo(9, 4);
  expect(model.motionRoot.scale.toArray()).toEqual([1, 1, 1]);
  expect(model.rigRoot.scale.toArray()).toEqual([0.03, 0.03, 0.03]);
});

test("Three Arena adapter resets contacts on discontinuities and probes aim/recoil deterministically", async () => {
  const model = await fixture();
  const motion = createThreeArenaPlayerMotion({
    ...model,
    t3rig: await Bun.file(sidecarUrl).text(),
    initialPosition: [0, 0, 0],
    maxSpeed: 24,
    heightField: { heightAt: () => 0 },
  });

  motion.sync({
    position: [40, 0, 0],
    resolvedDelta: [0.1, 0, 0],
    desiredVelocity: [6, 0, 0],
    facing: [1, 0, 0],
    aimTarget: [46, 5.8, 0],
    grounded: true,
    groundNormal: [0, 1, 0],
  }, 1 / 60);
  expect(motion.controller.motor.state.position.x).toBeCloseTo(40, 5);

  const up = motion.probeAim(Math.PI * 0.4);
  const upReplay = motion.probeAim(Math.PI * 0.4);
  const down = motion.probeAim(-Math.PI * 0.4);
  expect(up.metrics.poseChecksum).toBe(upReplay.metrics.poseChecksum);
  expect(up.metrics.poseChecksum).not.toBe(down.metrics.poseChecksum);
  expect(up.metrics.torsoFoldRadians).toBeLessThan(1.2);
  expect(down.metrics.torsoFoldRadians).toBeLessThan(1.2);
  expect(up.metrics.hipsAimDeltaRadians).toBeLessThanOrEqual(0.05);

  const before = motion.snapshot().metrics.poseChecksum;
  const after = motion.recoil().metrics.poseChecksum;
  expect(after).not.toBe(before);
});
