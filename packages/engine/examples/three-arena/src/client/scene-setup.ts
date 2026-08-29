import { requireRuntimeInstance, THREE } from "./boot-and-dom.ts";
import { CAMERA_BASE_DISTANCE, CAMERA_DEFAULT_PITCH, CAMERA_FOLLOW_SMOOTHING_SECONDS, CAMERA_LOOK_AT_HEIGHT, CAMERA_TARGET_HEIGHT, CAMERA_VIEW_RADIUS, COMBAT_VISUALS, FLOAT_TEXT_LIFE_SECONDS, MAGNET_PICKUP_SECONDS, PICKUP_COLLECT_RADIUS, PICKUP_LIGHT_POOL_SIZE, PLAYER_RADIUS } from "./constants.ts";
import { runtimeCallback } from "./runtime-ports.ts";
const clamp01 = runtimeCallback("hud", "clamp01");
const onResize = runtimeCallback("hud", "onResize");
const getPickupCollectRadius = runtimeCallback("progressionRuntime", "getPickupCollectRadius");
const getWeaponRuntime = runtimeCallback("progressionRuntime", "getWeaponRuntime");
const actorGroundHeight = runtimeCallback("terrain", "actorGroundHeight");
const terrainHeightAt = runtimeCallback("terrain", "terrainHeightAt");
const angleTo = runtimeCallback("worldMath", "angleTo");
const nearestEnemy = runtimeCallback("worldMath", "nearestEnemy");
const renderPosition = runtimeCallback("worldMath", "renderPosition");
const worldDelta = runtimeCallback("worldMath", "worldDelta");
const readCameraRigSnapshot = runtimeCallback("inputAndMenu", "readCameraRigSnapshot");
const resetCameraState = runtimeCallback("inputAndMenu", "resetCameraState");
const resolveCameraOffset = runtimeCallback("inputAndMenu", "resolveCameraOffset");
import { telemetry } from "./telemetry-core.ts";
import { createCameraRig, createThreeSkybox3D, createThreeWorldTextOverlay3D } from "@hyperfocus/engine/render/3d";
import type * as Three from "three";
import { state } from "./arena-state.ts";
import { texturePaths } from "./asset-catalog.ts";
import { threeView } from "./boot-context.ts";
import { data } from "./content-runtime.ts";
import { camera, cameraContext, pointer, remotePlayers, renderContext, renderer, scene, tempCameraTarget, tempCameraWorldSize, tempVec } from "./runtime-context.ts";
import { ui } from "./user-interface.ts";
import type { IndicatorMesh, Player, VisualIndicators } from "./runtime-types.ts";

export function setupScene(): void {
  renderContext.scene = requireRuntimeInstance(threeView.scene, THREE.Scene, "Three scene");
  scene.background = new THREE.Color(0x07100f);
  scene.fog = new THREE.FogExp2(0x08110f, 0.0095);
  const skyboxTexture = new THREE.TextureLoader().load(texturePaths.skybox);
  if ("colorSpace" in skyboxTexture && "SRGBColorSpace" in THREE) skyboxTexture.colorSpace = THREE.SRGBColorSpace;
  scene.add(requireRuntimeInstance(createThreeSkybox3D(threeView.THREE, { texture: skyboxTexture, radius: 1000, segments: 64 }), THREE.Object3D, "Skybox"));
  renderContext.camera = requireRuntimeInstance(threeView.camera, THREE.PerspectiveCamera, "Three camera");
  camera.fov = 54;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.near = 0.1;
  camera.far = 1400;
  camera.updateProjectionMatrix();
  resetCameraState(0, CAMERA_DEFAULT_PITCH, CAMERA_BASE_DISTANCE);
  const rig = createCameraRig(camera, {
    offset: resolveCameraOffset(),
    lookAtOffset: tempVec.set(0, CAMERA_LOOK_AT_HEIGHT, 0),
    influence: 1 / CAMERA_FOLLOW_SMOOTHING_SECONDS,
    worldSize: tempCameraWorldSize.set(data.arena.worldSize, data.arena.worldSize)
  });
  cameraContext.rig = rig;
  rig.setTarget(tempCameraTarget.set(0, CAMERA_TARGET_HEIGHT, 0)).update(0);
  cameraContext.snapshot = readCameraRigSnapshot();
  renderContext.renderer = requireRuntimeInstance(threeView.renderer, THREE.WebGLRenderer, "Three renderer");
  if (ui.hud) {
    renderContext.floatingTextLayer = createThreeWorldTextOverlay3D({
      THREE: threeView.THREE,
      camera: () => camera,
      container: ui.hud,
      viewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
      className: "float-text",
      baseFontPx: 15,
      lifeSeconds: FLOAT_TEXT_LIFE_SECONDS,
      referenceDistance: CAMERA_BASE_DISTANCE,
      minDistanceScale: 0.42,
      maxDistanceScale: 1.34,
      rise: 2.1,
      screenRisePx: 28,
      growScale: 0.18,
      resolvePosition: (position): [number, number, number] => {
        const projected = renderPosition(position[0], position[2]);
        return [projected.x, position[1], projected.z];
      }
    });
  }
  if ("toneMapping" in renderer && "ACESFilmicToneMapping" in THREE) renderer.toneMapping = THREE.ACESFilmicToneMapping;
  if ("toneMappingExposure" in renderer) renderer.toneMappingExposure = 1.32;
  threeView.resize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  renderContext.raycaster = new THREE.Raycaster();
  renderContext.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ambient = new THREE.HemisphereLight(0xc8ddcf, 0x17251f, 1.78);
  scene.add(ambient);
  const moon = new THREE.DirectionalLight(0xd8ecff, 5.1);
  moon.position.set(-22, 38, 21);
  moon.castShadow = true;
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 180;
  moon.shadow.camera.left = -82;
  moon.shadow.camera.right = 82;
  moon.shadow.camera.top = 82;
  moon.shadow.camera.bottom = -82;
  scene.add(moon);
  const rim = new THREE.PointLight(0x9ee6ff, 3.1, 82);
  rim.position.set(18, 10, -17);
  scene.add(rim);
  const sun = new THREE.DirectionalLight(0xffb16b, 1.75);
  sun.position.set(30, 20, -28);
  scene.add(sun);
  const cryptFill = new THREE.PointLight(0x8f7dff, 1.45, 98, 2);
  cryptFill.position.set(-28, 7, 26);
  scene.add(cryptFill);
  const muzzle = new THREE.PointLight(0xffd07a, 0, 18, 2);
  muzzle.position.set(0, 1.7, 0);
  scene.add(muzzle);
  const playerGlow = new THREE.PointLight(0xd7ff8d, 2.1, 24, 2);
  playerGlow.position.set(0, 2.2, 0);
  scene.add(playerGlow);
  const pickupLights: Three.PointLight[] = [];
  for (let i = 0; i < PICKUP_LIGHT_POOL_SIZE; i += 1) {
    const light = new THREE.PointLight(0xbaff73, 0, 12, 2);
    light.position.set(0, 1.2, 0);
    scene.add(light);
    pickupLights.push(light);
  }
  state.lights = { ambient, moon, rim, sun, cryptFill, muzzle, playerGlow, pickupLights };
  setupVisualIndicators();
  window.addEventListener("resize", onResize);
}

export function setupVisualIndicators(): void {
  const root = new THREE.Group();
  root.name = "combat-visual-indicators";
  root.frustumCulled = false;
  const playerRing = createGroundRing("#d7ff8d", 0.58, 1.15, 0.028);
  const targetLock = createTargetLockVisual();
  const aimCursor = createGroundRing("#e9ffbf", 0.72, 0.72, 0.024);
  const aimCone = createAimConeVisual();
  const magnetRing = createGroundRing("#9fe8ff", 0.52, PICKUP_COLLECT_RADIUS, 0.02);
  const offscreenArrows = Array.from({ length: COMBAT_VISUALS.maxOffscreenArrows }, () => createOffscreenArrowVisual());
  const cooldownRings = Array.from({ length: 6 }, (_, index) => createGroundRing(index % 2 ? "#7bd6ff" : "#ffd782", 0.5, 1, 0.016));
  const allyRings = new Map<string, IndicatorMesh>();
  root.add(playerRing, targetLock, aimCursor, aimCone, magnetRing, ...offscreenArrows, ...cooldownRings);
  scene.add(root);
  state.visualIndicators = { root, playerRing, allyRings, targetLock, aimCursor, aimCone, magnetRing, offscreenArrows, cooldownRings, lockedEnemy: null };
}

export function resetVisualIndicators(): void {
  const indicators = state.visualIndicators;
  if (!indicators) return;
  indicators.lockedEnemy = null;
  indicators.targetLock.visible = false;
  indicators.magnetRing.visible = false;
  for (const arrow of indicators.offscreenArrows) arrow.visible = false;
  for (const ring of indicators.cooldownRings) ring.visible = false;
  clearAllyRings();
}

export function clearAllyRings(): void {
  const indicators = state.visualIndicators;
  if (!indicators) return;
  for (const ring of indicators.allyRings.values()) indicators.root.remove(ring);
  indicators.allyRings.clear();
}

export function updateVisualIndicators(dt: number): void {
  const indicators = state.visualIndicators;
  const player = state.player;
  if (!indicators || !player) return;
  const playerPosition = renderPosition(player.x, player.z);
  const playerGroundY = actorGroundHeight(player);
  const pulse = 1 + Math.sin(state.time * 5.2) * 0.035;
  indicators.playerRing.visible = true;
  indicators.playerRing.position.set(playerPosition.x, playerGroundY + 0.105, playerPosition.z);
  indicators.playerRing.scale.setScalar(Math.max(0.82, player.radius) * pulse);
  updateAllyRadiusRings(indicators, dt);
  updateAimVisuals(indicators, player);
  updateTargetLockVisual(indicators, player);
  updateCooldownRings(indicators, player);
  updateMagnetFieldRing(indicators, player);
  updateOffscreenEnemyArrows(indicators, player);
}

export function updateAllyRadiusRings(indicators: VisualIndicators, dt: number): void {
  for (const ring of indicators.allyRings.values()) ring.visible = false;
  for (const [id, remote] of remotePlayers) {
    let ring = indicators.allyRings.get(id);
    if (!ring) {
      ring = createGroundRing("#7bd6ff", 0.48, 1.05, 0.022);
      indicators.allyRings.set(id, ring);
      indicators.root.add(ring);
    }
    ring.visible = true;
    ring.position.set(remote.mesh.position.x, (remote.mesh.position.y ?? 0) + 0.11, remote.mesh.position.z);
    ring.scale.setScalar(1 + Math.sin(state.time * 4.8 + dt) * 0.025);
  }
}

export function updateAimVisuals(indicators: VisualIndicators, player: Player): void {
  const aim = angleTo(player.x, player.z, pointer.worldX, pointer.worldZ);
  const aimPosition = renderPosition(pointer.worldX, pointer.worldZ);
  const playerGroundY = actorGroundHeight(player);
  indicators.aimCursor.visible = true;
  indicators.aimCursor.position.set(aimPosition.x, terrainHeightAt(pointer.worldX, pointer.worldZ) + 0.13, aimPosition.z);
  indicators.aimCursor.scale.setScalar(0.72 + Math.sin(state.time * 8) * 0.04);
  const playerPosition = renderPosition(player.x, player.z);
  indicators.aimCone.visible = true;
  indicators.aimCone.position.set(playerPosition.x, playerGroundY + 0.095, playerPosition.z);
  indicators.aimCone.rotation.z = -aim;
  indicators.aimCone.material.opacity = 0.16 + Math.sin(state.time * 7.5) * 0.035;
}

export function updateTargetLockVisual(indicators: VisualIndicators, player: Player): void {
  const target = nearestEnemy(player.x, player.z, COMBAT_VISUALS.targetLockRange);
  indicators.lockedEnemy = target;
  if (!target) {
    indicators.targetLock.visible = false;
    return;
  }
  const position = renderPosition(target.x, target.z);
  indicators.targetLock.visible = true;
  indicators.targetLock.position.set(position.x, actorGroundHeight(target) + 0.2, position.z);
  indicators.targetLock.rotation.y = state.time * 2.8;
  indicators.targetLock.scale.setScalar(Math.max(1.05, target.radius * 1.35) * (1 + Math.sin(state.time * 9) * 0.045));
}

export function updateCooldownRings(indicators: VisualIndicators, player: Player): void {
  const playerPosition = renderPosition(player.x, player.z);
  const playerGroundY = actorGroundHeight(player);
  indicators.cooldownRings.forEach((ring, index) => {
    const weaponId = state.weaponSlots[index];
    if (!weaponId) {
      ring.visible = false;
      return;
    }
    const weapon = getWeaponRuntime(weaponId);
    if (!weapon) {
      ring.visible = false;
      return;
    }
    const remaining = Math.max(0, state.weaponCooldowns.get(weaponId) ?? 0);
    const progress = remaining <= 0.001 ? 1 : 1 - clamp01(remaining / Math.max(0.001, weapon.cooldown));
    ring.visible = true;
    ring.position.set(playerPosition.x, playerGroundY + 0.12 + index * 0.003, playerPosition.z);
    ring.scale.setScalar((PLAYER_RADIUS + 0.64 + index * 0.18) * (0.22 + progress * 0.78));
    ring.material.color.set(weapon.color ?? "#d7ff8d");
    ring.material.opacity = progress >= 1 ? 0.58 + Math.sin(state.time * 10 + index) * 0.16 : 0.18 + progress * 0.24;
  });
}

export function updateMagnetFieldRing(indicators: VisualIndicators, player: Player): void {
  const remaining = Math.max(0, (state.magnetPullUntil ?? 0) - state.time);
  if (remaining <= 0) {
    indicators.magnetRing.visible = false;
    return;
  }
  const playerPosition = renderPosition(player.x, player.z);
  indicators.magnetRing.visible = true;
  indicators.magnetRing.position.set(playerPosition.x, actorGroundHeight(player) + 0.1, playerPosition.z);
  indicators.magnetRing.scale.setScalar((getPickupCollectRadius() / PICKUP_COLLECT_RADIUS) * (1 + Math.sin(state.time * 7) * 0.018));
  indicators.magnetRing.material.opacity = 0.18 + clamp01(remaining / MAGNET_PICKUP_SECONDS) * 0.38;
}

export function updateOffscreenEnemyArrows(indicators: VisualIndicators, player: Player): void {
  let used = 0;
  for (const enemy of state.enemies) {
    if (used >= indicators.offscreenArrows.length) break;
    const { dx, dz } = worldDelta(player.x, player.z, enemy.x, enemy.z);
    const distance = Math.hypot(dx, dz);
    if (distance < COMBAT_VISUALS.offscreenArrowRange) continue;
    const angle = Math.atan2(dz, dx);
    const arrow = indicators.offscreenArrows[used];
    if (!arrow) break;
    const markerDistance = CAMERA_VIEW_RADIUS * 0.72;
    const position = renderPosition(player.x + Math.cos(angle) * markerDistance, player.z + Math.sin(angle) * markerDistance);
    arrow.visible = true;
    arrow.position.set(position.x, actorGroundHeight(player) + 0.18, position.z);
    arrow.rotation.z = -angle;
    arrow.scale.setScalar(enemy.boss ? 1.55 : 1);
    arrow.material.opacity = enemy.boss ? 0.78 : 0.42;
    used += 1;
  }
  for (; used < indicators.offscreenArrows.length; used += 1) {
    const arrow = indicators.offscreenArrows[used];
    if (arrow) arrow.visible = false;
  }
}

export function createGroundRing(colorValue: Three.ColorRepresentation, opacity: number, radius: number, tube = 0.024): IndicatorMesh {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, 64), createIndicatorMaterial(colorValue, opacity));
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  ring.frustumCulled = false;
  return ring;
}

export function createTargetLockVisual(): Three.Group {
  const group = new THREE.Group();
  const outer = createGroundRing("#ffd782", 0.74, 1.2, 0.025);
  const inner = createGroundRing("#fff5c8", 0.38, 0.56, 0.018);
  group.add(outer, inner);
  for (let i = 0; i < 4; i += 1) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.03, 0.07), createIndicatorMaterial("#ffd782", 0.86));
    tick.position.set(Math.cos(i * Math.PI * 0.5) * 1.32, 0.01, Math.sin(i * Math.PI * 0.5) * 1.32);
    tick.rotation.y = -i * Math.PI * 0.5;
    group.add(tick);
  }
  group.visible = false;
  return group;
}

export function createAimConeVisual(): IndicatorMesh {
  const half = COMBAT_VISUALS.aimConeHalfAngle;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(Math.cos(-half) * COMBAT_VISUALS.aimConeLength, Math.sin(-half) * COMBAT_VISUALS.aimConeLength);
  shape.absarc(0, 0, COMBAT_VISUALS.aimConeLength, -half, half, false);
  shape.lineTo(0, 0);
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 24), createIndicatorMaterial("#7bd6ff", 0.16));
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  mesh.frustumCulled = false;
  return mesh;
}

export function createOffscreenArrowVisual(): IndicatorMesh {
  const shape = new THREE.Shape();
  shape.moveTo(1.1, 0);
  shape.lineTo(-0.52, -0.5);
  shape.lineTo(-0.22, 0);
  shape.lineTo(-0.52, 0.5);
  shape.lineTo(1.1, 0);
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), createIndicatorMaterial("#ffcf6d", 0.5));
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  mesh.frustumCulled = false;
  return mesh;
}

export function createIndicatorMaterial(colorValue: Three.ColorRepresentation, opacity: number): Three.MeshBasicMaterial {
  telemetry.materialCreates += 1;
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(colorValue),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  material.userData = { opacityBase: opacity };
  return material;
}
