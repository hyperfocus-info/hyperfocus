import { type Bone, type Group, type SkinnedMesh } from "three";
import { createFrameMetrics } from "@hyperfocus/engine";
import { createThreeHumanoidMotionController, type ThreeHumanoidMotionController } from "@hyperfocus/engine/motion/three";
import { requiredHumanoidSemantics } from "@hyperfocus/engine/motion";
import type { MotionLabFixtureEntry, MotionLabFixtureId } from "./fixture-repository.ts";
import { terrainHeightAt, type LabSignals, type LabTerrainKind } from "./scenarios.ts";

export type MotionPreviewCapabilities = {
  aim: boolean;
  armReach: boolean;
  extraBonePassthrough: boolean;
  footPlanting: boolean;
  leftArmReach: boolean;
  leftFootPlanting: boolean;
  mappingValidated: boolean;
  proceduralLocomotion: boolean;
  rightArmReach: boolean;
  rightFootPlanting: boolean;
};

export type MotionPreviewMetrics = {
  evaluationLastMs: number;
  evaluationP95Ms: number;
  evaluationSamples: number;
  footSlipMeters: number | null;
  gaitPhase: number;
  nanCount: number;
  plantedVerticalErrorMeters: number | null;
  poseChecksum: string;
};

export type MotionPreviewSnapshot = {
  adapter: "engine-motion-v1";
  capabilities: MotionPreviewCapabilities;
  metrics: MotionPreviewMetrics;
  warnings: readonly string[];
};

export type MotionPreviewAdapter = {
  readonly capabilities: MotionPreviewCapabilities;
  readonly warnings: readonly string[];
  reset(): void;
  snapshot(): MotionPreviewSnapshot;
  step(deltaSeconds: number, signals: LabSignals): void;
};

export type MotionPreviewAdapterOptions = {
  actorRoot: Group;
  canonicalJointNames: readonly string[];
  fixture: MotionLabFixtureEntry;
  fixtureId: MotionLabFixtureId;
  rigRoot: Group;
};

const MAX_EVALUATION_SAMPLES = 240;

function findSkinnedMesh(root: Group): SkinnedMesh {
  let mesh: SkinnedMesh | null = null;
  root.traverse((object) => {
    if (!mesh && (object as SkinnedMesh).isSkinnedMesh) mesh = object as SkinnedMesh;
  });
  if (!mesh) throw new Error("Motion preview requires one skinned fixture mesh.");
  return mesh;
}

function checksumNumber(hash: number, value: number): number {
  return Math.imul((hash ^ Math.round(value * 100_000)) >>> 0, 16_777_619) >>> 0;
}

function poseChecksum(player: ThreeHumanoidMotionController): string {
  let hash = 2_166_136_261;
  for (const value of player.state.pose.rotations) hash = checksumNumber(hash, value);
  for (const value of player.state.pose.translations) hash = checksumNumber(hash, value);
  return hash.toString(16).padStart(8, "0");
}

function boneNanCount(bones: readonly Bone[]) {
  let count = 0;
  for (const bone of bones) {
    if (![bone.position.x, bone.position.y, bone.position.z,
      bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w,
      bone.scale.x, bone.scale.y, bone.scale.z].every(Number.isFinite)) count += 1;
  }
  return count;
}

function mappingConfidence(player: ThreeHumanoidMotionController) {
  let minimum = 1;
  for (const semantic of requiredHumanoidSemantics) {
    const binding = player.document.semantics[semantic];
    if (!binding) return 0;
    minimum = Math.min(minimum, binding.confidence);
  }
  return minimum;
}

function warningsFor(player: ThreeHumanoidMotionController) {
  const warnings = new Set<string>();
  for (const diagnostic of player.mappingDiagnostics) {
    if (diagnostic.code === "capability-disabled"
      || diagnostic.code.includes("reconciliation")
      || diagnostic.code.includes("fingerprint")) warnings.add(diagnostic.message);
  }
  if (mappingConfidence(player) < 0.9 && player.rig.validated) {
    warnings.add("Topology-based assignments have reduced confidence; review and save the generated .t3rig mapping.");
  }
  return [...warnings];
}

export function createMotionPreviewAdapter(options: MotionPreviewAdapterOptions): MotionPreviewAdapter {
  const mesh = findSkinnedMesh(options.rigRoot);
  let terrain: LabTerrainKind = "flat";
  const heightField = {
    heightAt(x: number, z: number) {
      return terrainHeightAt(terrain, x, z);
    },
  };
  options.actorRoot.position.set(0, 0, 0);
  options.actorRoot.quaternion.identity();
  options.actorRoot.scale.set(1, 1, 1);
  const player = createThreeHumanoidMotionController({
    root: options.actorRoot,
    motionRoot: options.actorRoot,
    skeleton: mesh.skeleton,
    heightField,
    motorOptions: { maxTurnRate: 0 },
  });
  const rigCapabilities = player.state.capabilities;
  const capabilities: MotionPreviewCapabilities = {
    aim: rigCapabilities.aim,
    armReach: rigCapabilities.leftReach && rigCapabilities.rightReach,
    extraBonePassthrough: options.fixture.expected.extraBonePassthrough,
    footPlanting: rigCapabilities.leftFootPlant && rigCapabilities.rightFootPlant,
    leftArmReach: rigCapabilities.leftReach,
    leftFootPlanting: rigCapabilities.leftFootPlant,
    mappingValidated: player.rig.validated && mappingConfidence(player) >= 0.9,
    proceduralLocomotion: rigCapabilities.baseLocomotion,
    rightArmReach: rigCapabilities.rightReach,
    rightFootPlanting: rigCapabilities.rightFootPlant,
  };
  const warnings = warningsFor(player);
  const hasFootPlanting = capabilities.leftFootPlanting || capabilities.rightFootPlanting;
  const evaluationMetrics = createFrameMetrics({ capacity: MAX_EVALUATION_SAMPLES, maxSeries: 1 });
  let evaluationLastMs = 0;
  let maximumFootSlip = 0;
  let maximumPlantedVerticalError = 0;
  let nanCount = 0;

  function reset() {
    terrain = "flat";
    evaluationLastMs = 0;
    evaluationMetrics.reset();
    maximumFootSlip = 0;
    maximumPlantedVerticalError = 0;
    nanCount = 0;
    player.teleport([0, 0, 0]);
    player.setFacing([0, 0, 1]);
    player.reset();
    player.update(0);
    options.actorRoot.position.set(0, 0, 0);
    options.actorRoot.updateMatrixWorld(true);
  }

  function step(deltaSeconds: number, signals: LabSignals) {
    const dt = Math.min(0.1, Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0));
    terrain = signals.terrain;
    player.move(signals.desiredVelocity);
    player.setFacing([0, 0, 1]);
    const motorPosition = player.state.motor.position;
    const horizontal = Math.cos(signals.aimPitch) * 2.7;
    player.setAimTarget([
      motorPosition.x + Math.sin(signals.aimYaw) * horizontal,
      motorPosition.y + 1.28 + Math.sin(signals.aimPitch) * 2.7,
      motorPosition.z + Math.cos(signals.aimYaw) * horizontal,
    ], signals.aimWeight);
    const endEvaluation = evaluationMetrics.start("motion.evaluate.ms");
    player.update(dt);
    evaluationLastMs = endEvaluation();
    maximumFootSlip = Math.max(maximumFootSlip, player.state.metrics.footSlipDistance);
    maximumPlantedVerticalError = Math.max(
      maximumPlantedVerticalError,
      player.state.metrics.plantedVerticalError,
    );
    nanCount = (player.state.metrics.poseFinite ? 0 : 1) + boneNanCount(mesh.skeleton.bones);

    // Keep the proof actor centered while its motor continues accumulating real
    // resolved distance for phase and contact determinism.
    options.actorRoot.position.set(0, terrainHeightAt(terrain, 0, 0), 0);
    options.actorRoot.updateMatrixWorld(true);
  }

  function snapshot(): MotionPreviewSnapshot {
    const evaluation = evaluationMetrics.snapshot().series["motion.evaluate.ms"];
    return {
      adapter: "engine-motion-v1",
      capabilities,
      metrics: {
        evaluationLastMs,
        evaluationP95Ms: evaluation?.p95 ?? 0,
        evaluationSamples: evaluation?.count ?? 0,
        footSlipMeters: hasFootPlanting ? maximumFootSlip : null,
        gaitPhase: player.state.locomotion.gaitPhase,
        nanCount,
        plantedVerticalErrorMeters: hasFootPlanting ? maximumPlantedVerticalError : null,
        poseChecksum: poseChecksum(player),
      },
      warnings,
    };
  }

  reset();
  return { capabilities, warnings, reset, snapshot, step };
}
