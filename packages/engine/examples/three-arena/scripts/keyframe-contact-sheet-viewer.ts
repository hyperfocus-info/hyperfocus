import { mean as average } from "@hyperfocus/utilities/math";
import { modulo } from "@hyperfocus/utilities/math";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { createThreeArenaPlayerMotion } from "../src/player-motion.ts";
import { getRigSemanticIndex, type HumanoidSemantic } from "@hyperfocus/engine/motion";

type AnimationId = "player-run" | "boss-run";

type ViewerOptions = {
  animations: AnimationId[];
  frames: number;
  width: number;
  panelHeight: number;
};

type PoseMetrics = {
  footPitchDegrees: [number, number];
  footSeparationMeters: number;
  handSeparationMeters: number;
};

type FrameMetrics = {
  phase: number;
  player?: PoseMetrics & { locomotionWeight: number; poseChecksum: string };
  boss?: PoseMetrics;
  semanticPoseDeltaDegrees?: number;
  lowerBodyPoseDeltaDegrees?: number;
  upperBodyPoseDeltaDegrees?: number;
  semanticPoseDeltasDegrees?: Partial<Record<HumanoidSemantic, number>>;
};

declare global {
  var __KEYFRAME_OPTIONS__: ViewerOptions | undefined;
}

const MODEL_PATH = "/assets/usable/characters/kenney/models/character-medium.fbx";
const RUN_PATH = "/assets/usable/characters/kenney/animations/run.fbx";
const RIG_PATH = "/assets/usable/characters/kenney/models/character-medium.t3rig";
const PLAYER_SKIN_PATH = "/assets/usable/characters/kenney/skins/survivor-female-a.png";
const BOSS_SKIN_PATH = "/assets/usable/characters/kenney/skins/zombie-c.png";
const MODEL_SCALE = 0.03;
const RUN_SPEED = 10.8;
const COMPARED_SEMANTICS: HumanoidSemantic[] = [
  "hips", "spine", "chest", "leftUpperArm", "leftLowerArm", "leftHand",
  "rightUpperArm", "rightLowerArm", "rightHand", "leftUpperLeg", "leftLowerLeg",
  "leftFoot", "leftToes", "rightUpperLeg", "rightLowerLeg", "rightFoot", "rightToes",
];
const LOWER_BODY_SEMANTICS: HumanoidSemantic[] = [
  "hips", "leftUpperLeg", "leftLowerLeg", "leftFoot", "leftToes",
  "rightUpperLeg", "rightLowerLeg", "rightFoot", "rightToes",
];
const UPPER_BODY_SEMANTICS: HumanoidSemantic[] = [
  "spine", "chest", "leftUpperArm", "leftLowerArm", "leftHand",
  "rightUpperArm", "rightLowerArm", "rightHand",
];

const options = globalThis.__KEYFRAME_OPTIONS__ ?? {
  animations: ["player-run", "boss-run"],
  frames: 8,
  width: 300,
  panelHeight: 360,
};

void renderContactSheet().catch(async (error) => {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  document.body.textContent = message;
  await fetch("/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ error: message }),
  }).catch(() => undefined);
});

async function renderContactSheet(): Promise<void> {
  const [baseModel, runAsset, t3rig, playerSkin, bossSkin] = await Promise.all([
    loadFbx(MODEL_PATH),
    loadFbx(RUN_PATH),
    fetch(RIG_PATH).then(requiredText),
    loadTexture(PLAYER_SKIN_PATH),
    loadTexture(BOSS_SKIN_PATH),
  ]);
  const runClip = selectRunClip(runAsset);
  const procedural = createProceduralActor(baseModel, playerSkin, t3rig);
  const boss = createBossActor(baseModel, bossSkin, runClip);
  const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(options.width, options.panelHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const headerHeight = 116;
  const footerHeight = 70;
  const labelHeight = 42;
  const sheet = document.createElement("canvas");
  sheet.width = options.width * options.frames;
  sheet.height = headerHeight + options.animations.length * (options.panelHeight + labelHeight) + footerHeight;
  const context = sheet.getContext("2d");
  if (!context) throw new Error("Could not create the contact-sheet canvas");
  context.fillStyle = "#080c0d";
  context.fillRect(0, 0, sheet.width, sheet.height);
  drawHeader(context, sheet.width, headerHeight, runClip.duration);

  const frameMetrics: FrameMetrics[] = [];
  for (let frameIndex = 0; frameIndex < options.frames; frameIndex += 1) {
    const phase = frameIndex / options.frames;
    advanceProceduralToPhase(procedural, phase);
    setBossPhase(boss, phase, runClip.duration);
    const playerMetrics = measurePose(procedural.skeleton, procedural.semanticIndex);
    const bossMetrics = measurePose(boss.skeleton, procedural.semanticIndex);
    const metrics: FrameMetrics = {
      phase,
      player: {
        ...playerMetrics,
        locomotionWeight: procedural.motion.controller.state.locomotion.locomotionWeight,
        poseChecksum: procedural.motion.snapshot().metrics.poseChecksum,
      },
      boss: bossMetrics,
      semanticPoseDeltaDegrees: semanticPoseDeltaDegrees(procedural.skeleton, boss.skeleton, procedural.semanticIndex, COMPARED_SEMANTICS),
      lowerBodyPoseDeltaDegrees: semanticPoseDeltaDegrees(procedural.skeleton, boss.skeleton, procedural.semanticIndex, LOWER_BODY_SEMANTICS),
      upperBodyPoseDeltaDegrees: semanticPoseDeltaDegrees(procedural.skeleton, boss.skeleton, procedural.semanticIndex, UPPER_BODY_SEMANTICS),
      semanticPoseDeltasDegrees: semanticPoseDeltasDegrees(procedural.skeleton, boss.skeleton, procedural.semanticIndex, COMPARED_SEMANTICS),
    };
    frameMetrics.push(metrics);

    for (const [row, animation] of options.animations.entries()) {
      const actor = animation === "player-run" ? procedural : boss;
      actor.root.visible = true;
      (animation === "player-run" ? boss : procedural).root.visible = false;
      if (animation === "player-run") updateCrossbow(procedural.crossbow, procedural.skeleton, procedural.semanticIndex);
      renderer.render(actor.scene, actor.camera);
      const x = frameIndex * options.width;
      const y = headerHeight + row * (options.panelHeight + labelHeight) + labelHeight;
      context.drawImage(renderer.domElement, x, y, options.width, options.panelHeight);
      drawPanelLabel(context, x, y - labelHeight, options.width, animation, phase, metrics);
    }
  }
  procedural.root.visible = true;
  boss.root.visible = true;
  drawFooter(context, sheet.width, sheet.height - footerHeight, frameMetrics);
  document.body.replaceChildren(sheet);

  const pngDataUrl = sheet.toDataURL("image/png");
  const evaluation = evaluateGap(frameMetrics);
  const response = await fetch("/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pngDataUrl,
      report: {
        schemaVersion: 1,
        proof: "three-arena-animation-keyframe-contact-sheet",
        generatedAt: new Date().toISOString(),
        animations: options.animations,
        frameCount: options.frames,
        normalizedPhases: frameMetrics.map((frame) => frame.phase),
        dimensions: { width: sheet.width, height: sheet.height },
        sources: {
          player: "examples/three-arena/src/player-motion.ts (engine procedural humanoid controller)",
          boss: "examples/three-arena/assets/usable/characters/kenney/animations/run.fbx",
          rig: "examples/three-arena/assets/usable/characters/kenney/models/character-medium.t3rig",
        },
        presentation: {
          camera: "fixed three-quarter diagnostic view",
          scale: "screen-normalized for pose comparison; gameplay boss size multiplier intentionally excluded",
          weapon: "diagnostic crossbow aligned between both mapped hand targets",
        },
        metricDefinitions: {
          footPitchDegrees: "signed heel-to-toe elevation atan2(deltaY, horizontalDistance); positive means toe-up",
          semanticPoseDeltaDegrees: "mean shortest local-quaternion angle across mapped torso and limb semantics",
          lowerBodyPoseDeltaDegrees: "mean shortest local-quaternion angle across hips, both leg chains, feet, and toes",
          upperBodyPoseDeltaDegrees: "mean shortest local-quaternion angle across spine, chest, and both arm chains; includes the deliberate crossbow grip",
        },
        evaluation,
        frames: frameMetrics,
      },
    }),
  });
  if (!response.ok) throw new Error(`Contact-sheet upload failed with HTTP ${response.status}`);
}

function createProceduralActor(baseModel: THREE.Group, skin: THREE.Texture, t3rig: string) {
  const root = new THREE.Group();
  const rigRoot = clone(baseModel);
  rigRoot.scale.setScalar(MODEL_SCALE);
  applySkin(rigRoot, skin);
  root.add(rigRoot);
  const skeleton = findSkeleton(rigRoot);
  const motion = createThreeArenaPlayerMotion({
    rigRoot,
    motionRoot: root,
    skeleton,
    t3rig,
    initialPosition: [0, 0, 0],
    initialFacing: [0, 0, 1],
    initialGrounded: true,
    maxSpeed: 24,
    fullStrideSpeed: RUN_SPEED * 0.82,
    heightField: { heightAt: () => 0, normalAt: () => ({ x: 0, y: 1, z: 0 }) },
  });
  let z = 0;
  for (let index = 0; index < 180; index += 1) {
    const dz = RUN_SPEED / 60;
    z += dz;
    motion.sync({
      position: [0, 0, z], resolvedDelta: [0, 0, dz], desiredVelocity: [0, 0, RUN_SPEED],
      facing: [0, 0, 1], aimTarget: [0, 4.4, z + 8], aimWeight: 1, grounded: true, groundNormal: [0, 1, 0],
    }, 0.016666666666666666);
  }
  const phaseBeforeCalibration = motion.controller.state.locomotion.gaitPhase;
  const calibrationDistance = 0.01;
  z += calibrationDistance;
  motion.sync({
    position: [0, 0, z], resolvedDelta: [0, 0, calibrationDistance], desiredVelocity: [0, 0, RUN_SPEED],
    facing: [0, 0, 1], aimTarget: [0, 4.4, z + 8], aimWeight: 1, grounded: true, groundNormal: [0, 1, 0],
  }, calibrationDistance / RUN_SPEED);
  const phaseAfterCalibration = motion.controller.state.locomotion.gaitPhase;
  const calibrationPhase = normalizePhase(phaseAfterCalibration - phaseBeforeCalibration);
  const cycleDistance = calibrationDistance / Math.max(1e-6, calibrationPhase);
  const semanticIndex = (semantic: HumanoidSemantic) => getRigSemanticIndex(motion.controller.rig, semantic);
  const crossbow = createCrossbow();
  root.parent?.add(crossbow);
  const view = createDiagnosticScene(root, "player");
  view.scene.add(crossbow);
  return { ...view, root, rigRoot, skeleton, motion, semanticIndex, crossbow, cycleDistance, z };
}

function createBossActor(baseModel: THREE.Group, skin: THREE.Texture, runClip: THREE.AnimationClip) {
  const root = new THREE.Group();
  const rigRoot = clone(baseModel);
  rigRoot.scale.setScalar(MODEL_SCALE);
  applySkin(rigRoot, skin);
  root.add(rigRoot);
  const skeleton = findSkeleton(rigRoot);
  const mixer = new THREE.AnimationMixer(rigRoot);
  const action = mixer.clipAction(runClip);
  action.play();
  const view = createDiagnosticScene(root, "boss");
  return { ...view, root, rigRoot, skeleton, mixer, action };
}

function createDiagnosticScene(root: THREE.Group, kind: "player" | "boss") {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(kind === "player" ? 0x111a19 : 0x181416);
  scene.fog = new THREE.Fog(scene.background, 11, 20);
  scene.add(root);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(4.4, 64),
    new THREE.MeshStandardMaterial({ color: kind === "player" ? 0x263a32 : 0x3a292b, roughness: 0.92 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(8, 16, 0x7fa891, 0x33463d);
  grid.position.y = 0.006;
  scene.add(grid);
  scene.add(new THREE.HemisphereLight(0xd9ecff, 0x44382f, 2.2));
  const key = new THREE.DirectionalLight(0xfff2d4, 4.2);
  key.position.set(4, 7, 5);
  key.castShadow = true;
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(43, options.width / options.panelHeight, 0.05, 50);
  camera.position.set(10.5, 5.8, 13.2);
  camera.lookAt(0, 3.8, 0);
  return { scene, camera };
}

function advanceProceduralToPhase(actor: ReturnType<typeof createProceduralActor>, phase: number): void {
  const current = actor.motion.controller.state.locomotion.gaitPhase;
  let remaining = normalizePhase(phase - current);
  while (remaining > 1e-6) {
    const phaseStep = Math.min(remaining, 0.008333333333333333);
    const dz = phaseStep * actor.cycleDistance;
    actor.z += dz;
    actor.motion.sync({
      position: [0, 0, actor.z], resolvedDelta: [0, 0, dz], desiredVelocity: [0, 0, RUN_SPEED],
      facing: [0, 0, 1], aimTarget: [0, 4.4, actor.z + 8], aimWeight: 1, grounded: true, groundNormal: [0, 1, 0],
    }, dz / RUN_SPEED);
    remaining -= phaseStep;
  }
  // The game places the visual root from gameplay coordinates after motion
  // evaluation. This diagnostic renders the same local pose at the origin.
  actor.root.position.set(0, 0, 0);
  actor.root.updateMatrixWorld(true);
}

function setBossPhase(actor: ReturnType<typeof createBossActor>, phase: number, duration: number): void {
  actor.mixer.setTime(phase * duration);
  actor.root.updateMatrixWorld(true);
}

function measurePose(skeleton: THREE.Skeleton, semanticIndex: (semantic: HumanoidSemantic) => number): PoseMetrics {
  const leftFoot = boneFor(skeleton, semanticIndex("leftFoot"));
  const rightFoot = boneFor(skeleton, semanticIndex("rightFoot"));
  const leftToes = boneFor(skeleton, semanticIndex("leftToes"));
  const rightToes = boneFor(skeleton, semanticIndex("rightToes"));
  const leftHand = boneFor(skeleton, semanticIndex("leftHand"));
  const rightHand = boneFor(skeleton, semanticIndex("rightHand"));
  return {
    footPitchDegrees: [heelToToeElevationDegrees(leftFoot, leftToes), heelToToeElevationDegrees(rightFoot, rightToes)],
    footSeparationMeters: worldDistance(leftFoot, rightFoot),
    handSeparationMeters: worldDistance(leftHand, rightHand),
  };
}

function semanticPoseDeltaDegrees(
  player: THREE.Skeleton,
  boss: THREE.Skeleton,
  semanticIndex: (semantic: HumanoidSemantic) => number,
  semantics: readonly HumanoidSemantic[],
): number {
  let sum = 0;
  let count = 0;
  for (const semantic of semantics) {
    const index = semanticIndex(semantic);
    if (index < 0 || !player.bones[index] || !boss.bones[index]) continue;
    sum += THREE.MathUtils.radToDeg(player.bones[index].quaternion.angleTo(boss.bones[index].quaternion));
    count += 1;
  }
  return count ? sum / count : 0;
}

function semanticPoseDeltasDegrees(
  player: THREE.Skeleton,
  boss: THREE.Skeleton,
  semanticIndex: (semantic: HumanoidSemantic) => number,
  semantics: readonly HumanoidSemantic[],
): Partial<Record<HumanoidSemantic, number>> {
  const result: Partial<Record<HumanoidSemantic, number>> = {};
  for (const semantic of semantics) {
    const index = semanticIndex(semantic);
    if (index < 0 || !player.bones[index] || !boss.bones[index]) continue;
    result[semantic] = THREE.MathUtils.radToDeg(player.bones[index].quaternion.angleTo(boss.bones[index].quaternion));
  }
  return result;
}

function evaluateGap(frames: FrameMetrics[]) {
  const poseDeltas = frames.map((frame) => frame.semanticPoseDeltaDegrees ?? 0);
  const lowerBodyDeltas = frames.map((frame) => frame.lowerBodyPoseDeltaDegrees ?? 0);
  const upperBodyDeltas = frames.map((frame) => frame.upperBodyPoseDeltaDegrees ?? 0);
  const playerFootPitch = frames.flatMap((frame) => frame.player?.footPitchDegrees ?? []).map(Math.abs);
  const bossFootPitch = frames.flatMap((frame) => frame.boss?.footPitchDegrees ?? []).map(Math.abs);
  return {
    meanSemanticPoseDeltaDegrees: average(poseDeltas),
    maxSemanticPoseDeltaDegrees: Math.max(...poseDeltas),
    meanLowerBodyPoseDeltaDegrees: average(lowerBodyDeltas),
    maxLowerBodyPoseDeltaDegrees: Math.max(...lowerBodyDeltas),
    meanUpperBodyPoseDeltaDegrees: average(upperBodyDeltas),
    maxUpperBodyPoseDeltaDegrees: Math.max(...upperBodyDeltas),
    meanAbsolutePlayerFootPitchDegrees: average(playerFootPitch),
    meanAbsoluteBossFootPitchDegrees: average(bossFootPitch),
    maxAbsolutePlayerFootPitchDegrees: Math.max(...playerFootPitch),
    largestGapPhase: frames[poseDeltas.indexOf(Math.max(...poseDeltas))]?.phase ?? 0,
    largestLowerBodyGapPhase: frames[lowerBodyDeltas.indexOf(Math.max(...lowerBodyDeltas))]?.phase ?? 0,
  };
}

function createCrossbow(): THREE.Group {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6f4629, roughness: 0.7 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xb8c0b8, roughness: 0.38, metalness: 0.72 });
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 1.05), wood);
  stock.position.z = 0.28;
  const bow = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.07, 0.09), metal);
  bow.position.z = 0.7;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, 0.14), wood);
  grip.position.set(0, -0.18, 0.03);
  group.add(stock, bow, grip);
  group.traverse((child) => { if (child instanceof THREE.Mesh) child.castShadow = true; });
  return group;
}

function updateCrossbow(group: THREE.Group, skeleton: THREE.Skeleton, semanticIndex: (semantic: HumanoidSemantic) => number): void {
  const leftHand = boneFor(skeleton, semanticIndex("leftHand"));
  const rightHand = boneFor(skeleton, semanticIndex("rightHand"));
  const left = new THREE.Vector3();
  const right = new THREE.Vector3();
  leftHand.getWorldPosition(left);
  rightHand.getWorldPosition(right);
  group.position.copy(left).add(right).multiplyScalar(0.5);
  group.position.y += 0.05;
  group.position.z += 0.18;
  const handAxis = right.sub(left);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), handAxis.lengthSq() > 1e-8 ? handAxis.normalize() : new THREE.Vector3(1, 0, 0));
  group.updateMatrixWorld(true);
}

function drawHeader(context: CanvasRenderingContext2D, width: number, height: number, duration: number): void {
  context.fillStyle = "#d7ff8d";
  context.font = "700 34px system-ui, sans-serif";
  context.fillText("Three Arena · Run Keyframe Gap", 28, 43);
  context.fillStyle = "#b7c6bd";
  context.font = "16px system-ui, sans-serif";
  context.fillText("Exact normalized phases · player engine procedural run vs boss Kenney run clip", 28, 72);
  context.fillText(`Boss source duration ${duration.toFixed(3)}s · silhouettes scale-normalized · fixed three-quarter camera`, 28, 97);
  context.strokeStyle = "#3c5147";
  context.beginPath(); context.moveTo(0, height - 1); context.lineTo(width, height - 1); context.stroke();
}

function drawPanelLabel(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  animation: AnimationId,
  phase: number,
  metrics: FrameMetrics,
): void {
  context.fillStyle = animation === "player-run" ? "#15251f" : "#281d20";
  context.fillRect(x, y, width, 42);
  context.fillStyle = animation === "player-run" ? "#a9f0c8" : "#ffc0bd";
  context.font = "700 14px system-ui, sans-serif";
  context.fillText(animation === "player-run" ? "PLAYER · PROCEDURAL + CROSSBOW" : "BOSS · RUN.FBX", x + 12, y + 17);
  context.fillStyle = "#d8dedb";
  context.font = "12px ui-monospace, monospace";
  const pose = animation === "player-run" ? metrics.player : metrics.boss;
  const pitch = pose?.footPitchDegrees.map((value) => value.toFixed(0)).join("°/") ?? "—";
  context.fillText(`phase ${phase.toFixed(3)} · feet ${pitch}°`, x + 12, y + 34);
  context.strokeStyle = "#3c5147";
  context.strokeRect(x + 0.5, y + 0.5, width - 1, 41);
}

function drawFooter(context: CanvasRenderingContext2D, width: number, y: number, frames: FrameMetrics[]): void {
  const evaluation = evaluateGap(frames);
  context.fillStyle = "#101718";
  context.fillRect(0, y, width, 70);
  context.fillStyle = "#f3dcc1";
  context.font = "700 15px system-ui, sans-serif";
  context.fillText(
    `Lower-body gap: mean ${evaluation.meanLowerBodyPoseDeltaDegrees.toFixed(1)}° · max ${evaluation.maxLowerBodyPoseDeltaDegrees.toFixed(1)}° at phase ${evaluation.largestLowerBodyGapPhase.toFixed(3)}`,
    28, y + 27,
  );
  context.fillStyle = "#aebbb4";
  context.font = "13px system-ui, sans-serif";
  context.fillText(
    `Player foot pitch: mean |${evaluation.meanAbsolutePlayerFootPitchDegrees.toFixed(1)}°| · max |${evaluation.maxAbsolutePlayerFootPitchDegrees.toFixed(1)}°| · numeric details in adjacent JSON report`,
    28, y + 51,
  );
}

function applySkin(root: THREE.Object3D, texture: THREE.Texture): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    child.material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.72, metalness: 0.02 });
  });
}

function findSkeleton(root: THREE.Object3D): THREE.Skeleton {
  let skeleton: THREE.Skeleton | null = null;
  root.traverse((child) => {
    if (!skeleton && child instanceof THREE.SkinnedMesh && child.skeleton) skeleton = child.skeleton;
  });
  if (!skeleton) throw new Error("Kenney character did not contain a skeleton");
  return skeleton;
}

function selectRunClip(asset: THREE.Group): THREE.AnimationClip {
  const clip = asset.animations.find((candidate) => /run/i.test(candidate.name))
    ?? asset.animations.find((candidate) => candidate.duration > 0.1)
    ?? asset.animations[0];
  if (!clip) throw new Error("Boss run FBX did not contain an animation clip");
  return clip;
}

function boneFor(skeleton: THREE.Skeleton, index: number): THREE.Bone {
  const bone = skeleton.bones[index];
  if (!bone) throw new Error(`Mapped bone index ${index} was unavailable`);
  return bone;
}

function heelToToeElevationDegrees(heel: THREE.Bone, toes: THREE.Bone): number {
  const heelPosition = new THREE.Vector3();
  const toePosition = new THREE.Vector3();
  heel.getWorldPosition(heelPosition);
  toes.getWorldPosition(toePosition);
  const dx = toePosition.x - heelPosition.x;
  const dy = toePosition.y - heelPosition.y;
  const dz = toePosition.z - heelPosition.z;
  return THREE.MathUtils.radToDeg(Math.atan2(dy, Math.hypot(dx, dz)));
}

function worldDistance(left: THREE.Object3D, right: THREE.Object3D): number {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  left.getWorldPosition(a);
  right.getWorldPosition(b);
  return a.distanceTo(b);
}



function normalizePhase(value: number): number {
  return modulo(value, 1);
}

function loadFbx(url: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => new FBXLoader().load(url, resolve, undefined, reject));
}

function loadTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => new THREE.TextureLoader().load(url, resolve, undefined, reject));
}

async function requiredText(response: Response): Promise<string> {
  if (!response.ok) throw new Error(`Asset request failed with HTTP ${response.status}: ${response.url}`);
  return response.text();
}
