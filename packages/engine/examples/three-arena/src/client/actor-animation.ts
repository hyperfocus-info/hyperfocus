import { createThreeArenaPlayerMotion } from "../player-motion.ts";
import { THREE } from "./boot-and-dom.ts";
import { PLAYER_HEIGHT_WORLD, PLAYER_MODEL_SCALE, PLAYER_RADIUS } from "./constants.ts";
import { runtimeCallback } from "./runtime-ports.ts";
const clamp01 = runtimeCallback("hud", "clamp01");
const actorGroundHeight = runtimeCallback("terrain", "actorGroundHeight");
const terrainGradientAt = runtimeCallback("terrain", "terrainGradientAt");
const terrainHeightAt = runtimeCallback("terrain", "terrainHeightAt");
const angleTo = runtimeCallback("worldMath", "angleTo");
const getWorldCenter = runtimeCallback("worldMath", "getWorldCenter");
const renderPositionInto = runtimeCallback("worldMath", "renderPositionInto");
const wrapWorld = runtimeCallback("worldMath", "wrapWorld");
const findSkinnedMesh = runtimeCallback("actorAssets", "findSkinnedMesh");
const shortestAngleDelta = runtimeCallback("inputAndMenu", "shortestAngleDelta");
const makeBillboard = runtimeCallback("modelAssets", "makeBillboard");
const syncActorBaseAnimationState = runtimeCallback("playerUpdate", "syncActorBaseAnimationState");
import { prepareThreeObject3D } from "@hyperfocus/engine/render/3d";
import type * as Three from "three";
import { state } from "./arena-state.ts";
import { PROCEDURAL_ACTION_ANIMATION_NAMES } from "./asset-catalog.ts";
import { threeView } from "./boot-context.ts";
import { WORLD_HALF_SIZE, data } from "./content-runtime.ts";
import { pointer, scene, tempRenderPosition } from "./runtime-context.ts";
import { ui } from "./user-interface.ts";
import type { ActorAnimationState, ActorVisual, Player, ProceduralPose, ProceduralPosePart, RenderableObject, WorldActor } from "./runtime-types.ts";

export function setupPlayer(): void {
  const actor = createActorVisual("survivor", state.textures.survivor, 2.7, PLAYER_HEIGHT_WORLD, PLAYER_MODEL_SCALE);
  const rigRoot = actor.mesh;
  const playerRoot: RenderableObject = new THREE.Group();
  playerRoot.name = "ThreeArenaPlayerMotionRoot";
  playerRoot.add(rigRoot);
  const start = getWorldCenter();
  const player: Player = {
    id: state.playerId,
    name: ui.playerName.value.trim() || "Hunter",
    x: start.x,
    z: start.z,
    hp: data.player.startHealth ?? 100,
    maxHp: data.player.startHealth ?? 100,
    regenPerSecond: data.player.healthRegenPerSecond,
    speed: data.player.moveSpeed ?? 10.8,
    armor: 0,
    knockbackResist: 0,
    radius: PLAYER_RADIUS,
    jumpY: 0,
    jumpVelocityY: 0,
    jumpsUsed: 0,
    grounded: true,
    jumpTrailClock: 0,
    floatAssistUntil: 0,
    wallRunClock: 0,
    terrainSlope: 0,
    terrainBlocked: false,
    moveMomentumX: 0,
    moveMomentumZ: 0,
    momentumDustClock: 0,
    animationState: "idle",
    facingAngle: 0,
    knockX: 0,
    knockZ: 0,
    invuln: 0,
    mesh: playerRoot,
    animator: actor.animator,
    animatorRoot: actor.animatorRoot,
    animated: actor.animated,
    proceduralPose: actor.proceduralPose,
    proceduralMode: actor.proceduralMode,
    handAnchor: findActorHandAnchor(playerRoot),
    activeAnimation: actor.activeAnimation,
    activeAnimationSource: actor.activeAnimationSource,
    overlayAnimation: null,
    animationClock: actor.animationClock,
    animLock: 0,
    engineMotion: null,
    engineMotionLastX: start.x,
    engineMotionLastY: terrainHeightAt(start.x, start.z),
    engineMotionLastZ: start.z,
    engineMotionAimHeight: PLAYER_HEIGHT_WORLD,
    engineMotionLandSource: null,
    engineMotionRecoilSource: null
  };
  state.player = player;
  setActorPosition(player, start.x, start.z);
  const skeleton = findSkinnedMesh(rigRoot)?.skeleton ?? null;
  if (skeleton && state.actorAssets?.rigSidecar) {
    try {
      actor.animator?.stop();
      // The Kenney FBX is already in its imported bind pose. Skeleton.pose()
      // reconstructs its control-root transform from inverse binds and expands
      // this particular FBX hierarchy by 100x before semantic compilation.
      rigRoot.updateMatrixWorld(true);
      player.engineMotion = createThreeArenaPlayerMotion({
        rigRoot,
        motionRoot: playerRoot,
        skeleton,
        t3rig: state.actorAssets.rigSidecar,
        initialPosition: [start.x, player.engineMotionLastY, start.z],
        initialFacing: [0, 0, 1],
        initialGrounded: true,
        maxSpeed: Math.max(24, player.speed * 2),
        // The motor ceiling includes dash/knockback bursts; normal movement
        // should still reach a fully expressed run rather than a half blend.
        fullStrideSpeed: Math.max(1, player.speed * 0.82),
        discontinuityDistance: WORLD_HALF_SIZE,
        heightField: {
          heightAt(x, z) {
            return terrainHeightAt(wrapWorld(x), wrapWorld(z));
          },
          normalAt(x, z) {
            const gradient = terrainGradientAt(wrapWorld(x), wrapWorld(z));
            return { x: -gradient.x, y: 1, z: -gradient.z };
          }
        }
      });
      const semanticHead = player.engineMotion.controller.document.semantics.head;
      if (semanticHead) {
        player.engineMotionAimHeight = player.engineMotion.controller.binding.world.translations[semanticHead.boneIndex * 3 + 1]
          - player.engineMotion.controller.motor.state.position.y;
      }
      player.animator = null;
      player.proceduralPose = null;
      player.proceduralMode = "semantic";
      player.activeAnimation = "idle";
      player.activeAnimationSource = "engine-motion";
    } catch (error) {
      console.warn("Semantic player motion unavailable; retaining the legacy presentation fallback.", error);
      actor.animator?.play("idle", { fadeSeconds: 0 });
    }
  }
  scene.add(player.mesh);
}

export function createActorVisual(
  skinKey: string,
  fallbackTexture: Three.Texture,
  width: number,
  height: number,
  scale: number,
  options: { allowAnimated?: boolean; castShadow?: boolean; receiveShadow?: boolean } = {}
): ActorVisual {
  const actorAssets = state.actorAssets;
  if (options.allowAnimated !== false && actorAssets?.baseModel && actorAssets.clone) {
    const mesh = actorAssets.clone(actorAssets.baseModel);
    mesh.scale.setScalar(scale);
    prepareThreeObject3D(mesh, {
      castShadow: options.castShadow ?? true,
      receiveShadow: options.receiveShadow ?? true,
      material: () => {
        const map = actorAssets.skins[skinKey] ?? fallbackTexture;
        return new THREE.MeshStandardMaterial({
          map,
          roughness: 0.72,
          metalness: 0.02
        });
      }
    });
    const animatorRoot = mesh;
    const animator = threeView.createAnimationController(animatorRoot, actorAssets.clips, { initial: "idle", fadeSeconds: 0.08 });
    return {
      mesh,
      animator,
      animatorRoot,
      animated: true,
      proceduralPose: createProceduralPose(mesh),
      proceduralMode: "additive",
      activeAnimation: "idle",
      activeAnimationSource: resolveAnimationSource("idle"),
      overlayAnimation: null,
      animationClock: Math.random() * 10
    };
  }
  return {
    mesh: makeBillboard(fallbackTexture, width, height),
    animator: null,
    animatorRoot: null,
    animated: false,
    proceduralPose: null,
    proceduralMode: "none",
    activeAnimation: "idle",
    activeAnimationSource: "billboard",
    overlayAnimation: null,
    animationClock: 0
  };
}

export function findActorHandAnchor(root: Three.Object3D | null | undefined): Three.Object3D | null {
  const matches: Array<{ object: Three.Object3D; exact: boolean }> = [];
  root?.traverse?.((child) => {
    if (!child.name) return;
    const key = child.name.toLowerCase();
    const compact = key.replace(/[^a-z0-9]/g, "");
    const exact = key === "righthand" || key === "right_hand" || key === "hand_r" || compact === "righthand" || compact === "handr";
    if (exact || (compact.includes("right") && compact.includes("hand"))) matches.push({ object: child, exact });
  });
  return matches.find((match) => match.exact)?.object ?? matches[0]?.object ?? null;
}

export function setActorPosition(actor: WorldActor, x: number, z: number): void {
  if (!actor.mesh || actor.renderAsBillboard) return;
  const position = renderPositionInto(tempRenderPosition, x, z);
  actor.mesh.position.set(position.x, actorGroundHeight(actor) + (actor.animated ? 0 : 1.65) + (actor.jumpY ?? 0), position.z);
}

export function setActorFacing(actor: WorldActor, angle: number): void {
  if (!actor.mesh || actor.renderAsBillboard) return;
  actor.facingAngle = angle;
  if (actor.animated) actor.mesh.rotation.y = -angle + Math.PI / 2;
  else {
    const material = actor.mesh.material;
    if (material && !Array.isArray(material) && "rotation" in material && typeof material.rotation === "number") {
      material.rotation = -angle + Math.PI / 2;
    }
  }
}

export function updatePlayerFacing(dt: number): void {
  const player = state.player;
  if (!player) return;
  const targetAngle = angleTo(player.x, player.z, pointer.worldX, pointer.worldZ);
  const currentAngle = player.facingAngle ?? targetAngle;
  const amount = 1 - Math.exp(-18 * Math.max(0, dt));
  setActorFacing(player, currentAngle + shortestAngleDelta(currentAngle, targetAngle) * amount);
}

export function setActorOpacity(actor: ActorAnimationState, opacity: number): void {
  if (!actor.mesh) return;
  actor.mesh.traverse?.((child) => {
    if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.Sprite)) return;
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      material.transparent = opacity < 1;
      material.opacity = opacity;
    }
  });
  if (actor.mesh.material) {
    const materials = Array.isArray(actor.mesh.material) ? actor.mesh.material : [actor.mesh.material];
    for (const material of materials) {
      material.transparent = opacity < 1;
      material.opacity = opacity;
    }
  }
}

export function setActorDamageFlash(actor: ActorAnimationState | null | undefined, strength: number): void {
  if (!actor?.mesh) return;
  const flash = clamp01(strength);
  actor.mesh.traverse?.((child) => {
    if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.Sprite)) return;
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) applyDamageFlashToMaterial(material, flash);
  });
  if (actor.mesh.material) {
    const materials = Array.isArray(actor.mesh.material) ? actor.mesh.material : [actor.mesh.material];
    for (const material of materials) applyDamageFlashToMaterial(material, flash);
  }
}

export function applyDamageFlashToMaterial(material: Three.Material, strength: number): void {
  material.userData = material.userData ?? {};
  const color = "color" in material && material.color instanceof THREE.Color ? material.color : null;
  const emissive = "emissive" in material && material.emissive instanceof THREE.Color ? material.emissive : null;
  if (color && !(material.userData.baseDamageFlashColor instanceof THREE.Color)) material.userData.baseDamageFlashColor = color.clone();
  if (emissive && !(material.userData.baseDamageFlashEmissive instanceof THREE.Color)) material.userData.baseDamageFlashEmissive = emissive.clone();
  if (color && material.userData.baseDamageFlashColor instanceof THREE.Color) {
    color.copy(material.userData.baseDamageFlashColor).lerp(new THREE.Color(0xffffff), strength * 0.55);
  }
  if (emissive) {
    if (strength > 0) emissive.setRGB(1.0 * strength, 0.24 * strength, 0.18 * strength);
    else if (material.userData.baseDamageFlashEmissive instanceof THREE.Color) emissive.copy(material.userData.baseDamageFlashEmissive);
  }
}

export function playActorAnimation(actor: ActorAnimationState | null | undefined, name: string, fadeSeconds = 0.08): boolean {
  if (!actor) return false;
  if (actor.engineMotion) {
    const isOverlay = PROCEDURAL_ACTION_ANIMATION_NAMES.has(name);
    actor.overlayAnimation = isOverlay ? name : null;
    if (!isOverlay) actor.activeAnimation = name;
    actor.activeAnimationSource = "engine-motion";
    actor.proceduralMode = "semantic";
    if (name === "shoot" || name === "cast") {
      actor.engineMotion.recoil(name === "cast" ? 0.72 : 1);
      if (actor === state.player && state.player) state.player.engineMotionRecoilSource = "engine-motion";
    }
    if (name === "land" && actor === state.player && state.player) state.player.engineMotionLandSource = "engine-motion";
    const key = `engine-motion:${name}`;
    state.animationPlayCounts[key] = (state.animationPlayCounts[key] ?? 0) + 1;
    state.lastAnimationPlay = { name, source: "engine-motion", at: state.time };
    return true;
  }
  const animator = actor.animator;
  const played = animator?.play(name, { fadeSeconds }) === true;
  const fallbackSource = actor.animated ? resolveProceduralAnimationSource(name) ?? "missing" : "billboard";
  if (played) {
    actor.overlayAnimation = null;
    actor.activeAnimation = animator?.current ?? name;
    actor.activeAnimationSource = resolveAnimationSource(actor.activeAnimation);
    actor.proceduralMode = actor.proceduralPose ? "additive" : "none";
  } else if (fallbackSource === "procedural") {
    actor.overlayAnimation = name;
    actor.activeAnimation = animator?.current ?? actor.activeAnimation ?? name;
    actor.activeAnimationSource = resolveAnimationSource(actor.activeAnimation) ?? (animator?.current ? "unknown" : "procedural");
    actor.proceduralMode = actor.proceduralPose ? (animator?.current ? "additive" : "full") : "none";
  } else {
    actor.overlayAnimation = null;
    actor.activeAnimation = name;
    actor.activeAnimationSource = fallbackSource;
    actor.proceduralMode = actor.proceduralPose ? "full" : "none";
  }
  if (played || fallbackSource === "procedural") {
    const source = played ? actor.activeAnimationSource ?? "unknown" : fallbackSource;
    const key = `${source}:${name}`;
    state.animationPlayCounts[key] = (state.animationPlayCounts[key] ?? 0) + 1;
    state.lastAnimationPlay = { name, source, at: state.time };
  }
  return played;
}

export function resolveAnimationSource(name: string): string | null {
  return state.actorAssets?.clipSources?.get(name) ?? null;
}

export function resolveProceduralAnimationSource(name: string): "procedural" | null {
  return PROCEDURAL_ACTION_ANIMATION_NAMES.has(name) ? "procedural" : null;
}

export function createProceduralPose(root: Three.Object3D): ProceduralPose {
  const parts = new Map<string, ProceduralPosePart>();
  root.traverse?.((child) => {
    if (!child.name) return;
    parts.set(child.name.toLowerCase(), {
      object: child,
      rotation: child.rotation.clone(),
      position: child.position.clone(),
      overlayRotation: { x: 0, y: 0, z: 0 }
    });
  });
  return { parts, time: Math.random() * 10 };
}

export function getPosePart(pose: ProceduralPose | null | undefined, names: string[]): ProceduralPosePart | null {
  if (!pose) return null;
  for (const name of names) {
    const part = pose.parts.get(name.toLowerCase());
    if (part) return part;
  }
  return null;
}

export function resetPosePart(part: ProceduralPosePart | null | undefined): void {
  if (!part) return;
  part.object.rotation.copy(part.rotation);
  part.object.position.copy(part.position);
}

export function addPoseRotation(part: ProceduralPosePart | null | undefined, x: number, y: number, z: number): void {
  if (!part) return;
  part.object.rotation.x += x;
  part.object.rotation.y += y;
  part.object.rotation.z += z;
  part.overlayRotation.x += x;
  part.overlayRotation.y += y;
  part.overlayRotation.z += z;
}

export function clearProceduralPoseOverlay(pose: ProceduralPose | null | undefined): void {
  if (!pose) return;
  for (const part of pose.parts.values()) {
    const overlay = part.overlayRotation;
    if (!overlay || (!overlay.x && !overlay.y && !overlay.z)) continue;
    part.object.rotation.x -= overlay.x;
    part.object.rotation.y -= overlay.y;
    part.object.rotation.z -= overlay.z;
    overlay.x = 0;
    overlay.y = 0;
    overlay.z = 0;
  }
}

export function applyProceduralPose(actor: ActorAnimationState, dt: number, moving: boolean): void {
  const pose = actor?.proceduralPose;
  if (!pose) return;
  if (actor.animator?.current) {
    applyProceduralOverlay(actor, dt, moving);
    return;
  }
  actor.proceduralMode = "full";
  const animation = actor.activeAnimation ?? "idle";
  const runAmount = moving || animation === "run" ? 1 : 0;
  pose.time += dt * (runAmount ? 7.8 : 2.2);
  const hips = getPosePart(pose, ["HipsCtrl", "Hips"]);
  const spine = getPosePart(pose, ["Spine"]);
  const head = getPosePart(pose, ["Head"]);
  const leftArm = getPosePart(pose, ["LeftArm"]);
  const rightArm = getPosePart(pose, ["RightArm"]);
  const leftForeArm = getPosePart(pose, ["LeftForeArm"]);
  const rightForeArm = getPosePart(pose, ["RightForeArm"]);
  const leftUpLeg = getPosePart(pose, ["LeftUpLeg"]);
  const rightUpLeg = getPosePart(pose, ["RightUpLeg"]);
  const leftLeg = getPosePart(pose, ["LeftLeg"]);
  const rightLeg = getPosePart(pose, ["RightLeg"]);
  for (const part of [hips, spine, head, leftArm, rightArm, leftForeArm, rightForeArm, leftUpLeg, rightUpLeg, leftLeg, rightLeg]) resetPosePart(part);
  const phase = pose.time;
  const stride = Math.sin(phase);
  const counterStride = Math.sin(phase + Math.PI);
  const bob = runAmount ? Math.abs(stride) * 0.13 : Math.sin(phase) * 0.025;
  addPoseRotation(leftArm, 0, 0, -1.05);
  addPoseRotation(rightArm, 0, 0, 1.05);
  addPoseRotation(leftForeArm, 0, 0, -0.22);
  addPoseRotation(rightForeArm, 0, 0, 0.22);
  if (hips) hips.object.position.y += bob;
  if (animation === "fall") {
    if (hips) hips.object.position.y += 0.18;
    addPoseRotation(spine, 0.24, 0, 0);
    addPoseRotation(head, -0.16, 0, 0);
    addPoseRotation(leftArm, -0.42, 0, 0.36);
    addPoseRotation(rightArm, -0.42, 0, -0.36);
    addPoseRotation(leftUpLeg, 0.2, 0, 0.08);
    addPoseRotation(rightUpLeg, 0.2, 0, -0.08);
    addPoseRotation(leftLeg, 0.35, 0, 0);
    addPoseRotation(rightLeg, 0.35, 0, 0);
    return;
  }
  if (animation === "land") {
    if (hips) hips.object.position.y -= 0.18;
    addPoseRotation(spine, 0.38, 0, 0);
    addPoseRotation(head, -0.18, 0, 0);
    addPoseRotation(leftArm, 0.32, 0, 0.32);
    addPoseRotation(rightArm, 0.32, 0, -0.32);
    addPoseRotation(leftUpLeg, 0.48, 0, 0.06);
    addPoseRotation(rightUpLeg, 0.48, 0, -0.06);
    addPoseRotation(leftLeg, -0.5, 0, 0);
    addPoseRotation(rightLeg, -0.5, 0, 0);
    return;
  }
  if (animation === "jump") {
    if (hips) hips.object.position.y += 0.36 + Math.sin(phase * 2.4) * 0.06;
    addPoseRotation(leftArm, -0.55, 0, 0.72);
    addPoseRotation(rightArm, -0.55, 0, -0.72);
    addPoseRotation(leftUpLeg, 0.36, 0, 0);
    addPoseRotation(rightUpLeg, 0.36, 0, 0);
    return;
  }
  if (!runAmount) {
    addPoseRotation(spine, Math.sin(phase) * 0.025, 0, Math.cos(phase * 0.7) * 0.018);
    addPoseRotation(head, Math.sin(phase * 0.7) * 0.018, 0, 0);
    return;
  }
  addPoseRotation(hips, -0.08, Math.sin(phase * 0.5) * 0.04, 0);
  addPoseRotation(spine, 0.16, 0, stride * 0.045);
  addPoseRotation(head, -0.08, 0, -stride * 0.035);
  addPoseRotation(leftArm, stride * 0.72, 0, -0.18);
  addPoseRotation(rightArm, counterStride * 0.72, 0, 0.18);
  addPoseRotation(leftForeArm, -0.18 + counterStride * 0.22, 0, 0);
  addPoseRotation(rightForeArm, -0.18 + stride * 0.22, 0, 0);
  addPoseRotation(leftUpLeg, counterStride * 0.78, 0, 0.04);
  addPoseRotation(rightUpLeg, stride * 0.78, 0, -0.04);
  addPoseRotation(leftLeg, Math.max(0, stride) * 0.5, 0, 0);
  addPoseRotation(rightLeg, Math.max(0, counterStride) * 0.5, 0, 0);
}

export function applyProceduralOverlay(actor: ActorAnimationState, dt: number, moving: boolean): void {
  const pose = actor?.proceduralPose;
  if (!pose) return;
  actor.proceduralMode = "additive";
  const animation = actor.overlayAnimation ?? actor.activeAnimation ?? "idle";
  if (animation === "hit" || animation === "death") return;
  pose.time += dt * (moving ? 7.8 : 2.2);
  const phase = pose.time;
  const leftArm = getPosePart(pose, ["LeftArm"]);
  const rightArm = getPosePart(pose, ["RightArm"]);
  const leftForeArm = getPosePart(pose, ["LeftForeArm"]);
  const rightForeArm = getPosePart(pose, ["RightForeArm"]);
  const head = getPosePart(pose, ["Head"]);
  const recoil = animation === "shoot" || animation === "cast" ? Math.sin(phase * 18) * 0.08 : 0;
  if (animation === "shoot" || animation === "cast" || animation === "aim") {
    addPoseRotation(leftArm, -0.08, 0, -0.14);
    addPoseRotation(rightArm, -0.16 - recoil, 0, 0.18);
    addPoseRotation(leftForeArm, -0.08, 0, -0.05);
    addPoseRotation(rightForeArm, -0.12 - recoil, 0, 0.04);
    addPoseRotation(head, -0.015, 0, 0);
    return;
  }
  if (moving) {
    const sway = Math.sin(phase) * 0.055;
    addPoseRotation(leftArm, sway, 0, -0.04);
    addPoseRotation(rightArm, -sway, 0, 0.04);
  }
}

export function updateActorAnimation(actor: ActorAnimationState | null | undefined, dt: number, moving: boolean): void {
  if (!actor) return;
  if (!actor.animated && !actor.animator && !actor.proceduralPose) {
    actor.activeAnimation = moving ? "run" : "idle";
    actor.activeAnimationSource = "billboard";
    return;
  }
  if ((actor.animLock ?? 0) <= 0) actor.overlayAnimation = null;
  const desired = moving ? "run" : "idle";
  if (actor.overlayAnimation && (actor.animLock ?? 0) > 0) {
    actor.animator?.play(desired, { fadeSeconds: 0.08 });
    syncActorBaseAnimationState(actor, desired);
  } else if (actor.activeAnimationSource === "procedural" && (actor.animLock ?? 0) > 0) {
    actor.animator?.play(desired, { fadeSeconds: 0.08 });
    syncActorBaseAnimationState(actor, desired);
  } else if ((actor.animLock ?? 0) <= 0 && actor.activeAnimation !== desired) {
    playActorAnimation(actor, desired);
  }
  clearProceduralPoseOverlay(actor.proceduralPose);
  actor.animator?.update(dt);
  applyProceduralPose(actor, dt, moving);
}
