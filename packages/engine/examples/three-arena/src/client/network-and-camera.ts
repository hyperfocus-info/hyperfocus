import { runtimeCallback } from "./runtime-ports.ts";
const createActorVisual = runtimeCallback("actorAnimation", "createActorVisual");
const updateActorAnimation = runtimeCallback("actorAnimation", "updateActorAnimation");
const markManualAim = runtimeCallback("combatWeapons", "markManualAim");
const forEachObjectMaterial = runtimeCallback("contentUi", "forEachObjectMaterial");
const isRecord = runtimeCallback("contentUi", "isRecord");
const clamp = runtimeCallback("hud", "clamp");
const clamp01 = runtimeCallback("hud", "clamp01");
const round = runtimeCallback("hud", "round");
const setAimWorld = runtimeCallback("pointerAndTextures", "setAimWorld");
const syncReticleToAimWorld = runtimeCallback("pointerAndTextures", "syncReticleToAimWorld");
const passiveTeamworkEffectIds = runtimeCallback("progressionChoices", "passiveTeamworkEffectIds");
const getWeaponLevel = runtimeCallback("progressionRuntime", "getWeaponLevel");
const updatePropGlows = runtimeCallback("props", "updatePropGlows");
const updateWrappedStaticVisuals = runtimeCallback("props", "updateWrappedStaticVisuals");
const actorGroundHeight = runtimeCallback("terrain", "actorGroundHeight");
const terrainHeightAt = runtimeCallback("terrain", "terrainHeightAt");
const updateGroundTilePatch = runtimeCallback("terrain", "updateGroundTilePatch");
const angleTo = runtimeCallback("worldMath", "angleTo");
const distanceSquared = runtimeCallback("worldMath", "distanceSquared");
const renderPosition = runtimeCallback("worldMath", "renderPosition");
const dampCameraRigState = runtimeCallback("inputAndMenu", "dampCameraRigState");
const readCameraRigSnapshot = runtimeCallback("inputAndMenu", "readCameraRigSnapshot");
const resolveCameraOffset = runtimeCallback("inputAndMenu", "resolveCameraOffset");
const clearAllyRings = runtimeCallback("sceneSetup", "clearAllyRings");
import { THREE } from "./boot-and-dom.ts";
import { CAMERA_AIM_DISTANCE, CAMERA_LOOK_AT_HEIGHT, CAMERA_MAX_PITCH, CAMERA_MIN_PITCH, CAMERA_OCCLUDER_FADE_EXTRA_RADIUS, CAMERA_OCCLUDER_FADE_OPACITY, CAMERA_STICK_PITCH_SPEED, CAMERA_STICK_YAW_SPEED, CAMERA_TARGET_HEIGHT, CAMERA_VIEW_RADIUS } from "./constants.ts";
import { PERF_FLAGS } from "./environment.ts";
import { measureTelemetryPhase } from "./telemetry-core.ts";
import type * as Three from "three";
import { state } from "./arena-state.ts";
import { playerClassesById } from "./content-runtime.ts";
import { gamepadState } from "./input-context.ts";
import { camera, cameraContext, cameraDistance, cameraObstacleBuffer, cameraRig, cameraRigSnapshot, cameraYaw, desiredCameraPitch, desiredCameraYaw, networkClient, networkClock, networkContext, pointer, remotePlayers, scene, tempCameraDesired, tempCameraOffset, tempCameraTarget } from "./runtime-context.ts";
import type { PropCollider, RemotePassiveProgression, RemoteWeaponProgression } from "./runtime-types.ts";

export function updateNetwork(dt: number): void {
  const player = state.player;
  if (!networkClient || !state.online || !player) return;
  networkContext.clock = networkClock - dt;
  if (networkClock > 0) return;
  networkContext.clock = 0.08;
  const aim = angleTo(player.x, player.z, pointer.worldX, pointer.worldZ);
  const weapons = state.weaponSlots.map((id) => ({
    id,
    level: getWeaponLevel(id),
    evolved: state.evolvedWeapons.has(id)
  }));
  const passives = state.passiveSlots.map((id) => ({
    id,
    level: state.passiveLevels.get(id) ?? 1,
    effects: passiveTeamworkEffectIds(id)
  }));
  networkClient.sendInput?.({
    id: state.playerId,
    name: player.name,
    classId: state.selectedClassId,
    x: round(player.x),
    y: round(player.z),
    z: round(player.z),
    angle: aim,
    hp: Math.max(0, Math.round(player.hp)),
    alive: player.hp > 0,
    weapons,
    passives
  });
}

export function networkPlayerEntries(snapshot: unknown): Array<[string, Record<string, unknown>]> {
  if (!isRecord(snapshot)) return [];
  const nestedState = isRecord(snapshot.state) ? snapshot.state : null;
  const players = snapshot.players ?? nestedState?.players;
  const entries: Array<[string, Record<string, unknown>]> = [];
  if (Array.isArray(players)) {
    for (const player of players) {
      if (!isRecord(player)) continue;
      entries.push([typeof player.id === "string" ? player.id : "", player]);
    }
    return entries;
  }
  if (!isRecord(players)) return entries;
  for (const [id, player] of Object.entries(players)) {
    if (isRecord(player)) entries.push([id, player]);
  }
  return entries;
}

export function progressionItemIdentity(rawItem: unknown): { id: string; value: Record<string, unknown> | null } | null {
  if (typeof rawItem === "string") return { id: rawItem, value: null };
  if (!isRecord(rawItem)) return null;
  const id = rawItem.id ?? rawItem.weaponId ?? rawItem.passiveId;
  return typeof id === "string" ? { id, value: rawItem } : null;
}

export function progressionItemLevel(value: Record<string, unknown> | null): number {
  return Math.max(1, Math.min(99, Math.floor(Number(value?.level ?? value?.lvl ?? 1) || 1)));
}

export function normalizeRemoteWeapons(value: unknown): RemoteWeaponProgression[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: RemoteWeaponProgression[] = [];
  for (const rawItem of value.slice(0, 16)) {
    const identity = progressionItemIdentity(rawItem);
    if (!identity || seen.has(identity.id)) continue;
    seen.add(identity.id);
    const evolved = identity.value?.evolved;
    items.push({
      id: identity.id,
      level: progressionItemLevel(identity.value),
      evolved: evolved === true || evolved === 1 || evolved === "true"
    });
  }
  return items;
}

export function normalizeRemotePassives(value: unknown): RemotePassiveProgression[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: RemotePassiveProgression[] = [];
  for (const rawItem of value.slice(0, 16)) {
    const identity = progressionItemIdentity(rawItem);
    if (!identity || seen.has(identity.id)) continue;
    seen.add(identity.id);
    const effects = identity.value?.effects;
    items.push({
      id: identity.id,
      level: progressionItemLevel(identity.value),
      ...(Array.isArray(effects)
        ? { effects: effects.filter((effectId): effectId is string => typeof effectId === "string").slice(0, 8) }
        : {})
    });
  }
  return items;
}

export function applyNetworkSnapshot(snapshot: unknown): void {
  if (!state.online) {
    clearRemotePlayers();
    return;
  }
  const entries = networkPlayerEntries(snapshot);
  const localIds = new Set<string>();
  if (state.playerId) localIds.add(state.playerId);
  if (networkClient?.playerId) localIds.add(networkClient.playerId);
  const seen = new Set<string>();
  for (const [id, player] of entries) {
    const playerId = typeof player.id === "string" ? player.id : null;
    if ((playerId && localIds.has(playerId)) || localIds.has(id)) continue;
    const remoteId = playerId ?? id;
    if (!remoteId) continue;
    const progression = isRecord(player.progression) ? player.progression : {};
    const rawClassId = typeof player.classId === "string" ? player.classId
      : typeof player.selectedClassId === "string" ? player.selectedClassId
        : typeof progression.classId === "string" ? progression.classId
          : typeof progression.selectedClassId === "string" ? progression.selectedClassId
            : null;
    const weaponInput = player.weapons ?? progression.weapons;
    const passiveInput = player.passives ?? player.passiveItems ?? progression.passives ?? progression.passiveItems;
    seen.add(remoteId);
    let remote = remotePlayers.get(remoteId);
    if (!remote) {
      const actor = createActorVisual("ally", state.textures.ally, 2.7, 3.8, 0.030);
      remote = {
        mesh: actor.mesh,
        animator: actor.animator,
        animatorRoot: actor.animatorRoot,
        animated: actor.animated,
        proceduralPose: actor.proceduralPose,
        proceduralMode: actor.proceduralMode,
        activeAnimation: actor.activeAnimation,
        activeAnimationSource: actor.activeAnimationSource,
        overlayAnimation: actor.overlayAnimation ?? null,
        animationClock: actor.animationClock,
        lastX: null,
        lastZ: null,
        classId: null,
        classColor: "#7bd6ff",
        weapons: [],
        passives: [],
        appliedClassColor: null,
        appliedProgressionTintKey: null
      };
      scene.add(remote.mesh);
      remotePlayers.set(remoteId, remote);
    }
    const classId = rawClassId ?? remote.classId ?? null;
    const playerClass = classId ? playerClassesById.get(classId) : null;
    const classColor = playerClass?.color ?? "#7bd6ff";
    const weapons = weaponInput === undefined ? remote.weapons : normalizeRemoteWeapons(weaponInput);
    const passives = passiveInput === undefined ? remote.passives : normalizeRemotePassives(passiveInput);
    remote.classId = classId;
    remote.classColor = classColor;
    remote.weapons = weapons;
    remote.passives = passives;
    const progressionPower = clamp01((weapons.reduce((sum, weapon) => sum + weapon.level + (weapon.evolved ? 2 : 0), 0) + passives.reduce((sum, passive) => sum + passive.level, 0)) / 48);
    const progressionTintKey = `${classColor}|${weapons.map((weapon) => `${weapon.id}:${weapon.level}:${weapon.evolved ? 1 : 0}`).join(",")}|${passives.map((passive) => `${passive.id}:${passive.level}`).join(",")}`;
    remote.mesh.name = `remote-ally-${remoteId}`;
    remote.mesh.userData = {
      ...(remote.mesh.userData ?? {}),
      networkProgression: {
        classId,
        className: playerClass?.name ?? classId ?? "Ally",
        weapons,
        passives
      }
    };
    if (remote.appliedProgressionTintKey !== progressionTintKey) {
      remote.appliedClassColor = classColor;
      remote.appliedProgressionTintKey = progressionTintKey;
      const tint = new THREE.Color(classColor);
      const colorStrength = 0.16 + progressionPower * 0.12;
      const emissiveStrength = 0.10 + progressionPower * 0.08;
      const tintMaterial = (material: Three.Material): void => {
        const userData = isRecord(material.userData) ? material.userData : {};
        material.userData = userData;
        if ("color" in material && material.color instanceof THREE.Color) {
          const baseColor = userData.baseNetworkColor instanceof THREE.Color
            ? userData.baseNetworkColor
            : material.color.clone();
          userData.baseNetworkColor = baseColor;
          material.color.copy(baseColor).lerp(tint, colorStrength);
        }
        if ("emissive" in material && material.emissive instanceof THREE.Color) {
          const baseEmissive = userData.baseNetworkEmissive instanceof THREE.Color
            ? userData.baseNetworkEmissive
            : material.emissive.clone();
          userData.baseNetworkEmissive = baseEmissive;
          material.emissive.copy(baseEmissive).lerp(tint, emissiveStrength);
        }
      };
      remote.mesh.traverse((child) => forEachObjectMaterial(child, tintMaterial));
    }
    const x = Number(player.x ?? 0);
    const z = Number(player.z ?? player.y ?? 0);
    remote.mesh.position.set(x, terrainHeightAt(x, z) + (remote.animated ? 0 : 1.6), z);
    const moved = remote.lastX === null || remote.lastZ === null || distanceSquared(remote.lastX, remote.lastZ, x, z) > 0.01;
    updateActorAnimation(remote, 0.08, moved);
    remote.lastX = x;
    remote.lastZ = z;
  }
  for (const [id, remote] of remotePlayers) {
    if (seen.has(id)) continue;
    scene.remove(remote.mesh);
    remotePlayers.delete(id);
  }
}

export function clearRemotePlayers(): void {
  for (const remote of remotePlayers.values()) scene.remove(remote.mesh);
  remotePlayers.clear();
  clearAllyRings();
}

export function updateCamera(dt: number): void {
  const targetX = state.player?.x ?? 0;
  const targetZ = state.player?.z ?? 0;
  const shake = state.shake > 0 ? state.shakePower * state.shake * 0.4 : 0;
  state.shake = Math.max(0, state.shake - dt * 2.4);
  measureTelemetryPhase("cameraLights", () => {
    if (state.lights.moon) {
      const orbit = state.time * 0.045;
      state.lights.moon.position.set(Math.cos(orbit) * 34, 34 + Math.sin(orbit * 0.7) * 5, Math.sin(orbit) * 34);
    }
    if (state.lights.sun) {
      const orbit = state.time * 0.035 + Math.PI;
      state.lights.sun.position.set(Math.cos(orbit) * 30, 19 + Math.sin(orbit * 0.6) * 2, Math.sin(orbit) * 30);
    }
    if (state.lights.cryptFill) state.lights.cryptFill.intensity = 1.05 + Math.sin(state.time * 0.65) * 0.22;
    if (state.lights.rim) state.lights.rim.intensity = 1.55 + Math.sin(state.time * 0.9) * 0.42;
    if (state.lights.playerGlow && state.player) {
      state.lights.playerGlow.position.set(state.player.x, actorGroundHeight(state.player) + 2.15 + (state.player.jumpY ?? 0), state.player.z);
      state.lights.playerGlow.intensity = 1.45 + Math.sin(state.time * 5.4) * 0.28;
    }
  });
  measureTelemetryPhase("propGlows", updatePropGlows);
  measureTelemetryPhase("groundTiles", updateGroundTilePatch);
  measureTelemetryPhase("staticVisuals", () => updateWrappedStaticVisuals(dt));
  const rig = cameraRig;
  if (!rig) return;
  measureTelemetryPhase("cameraRig", () => {
    applyGamepadCameraOrbit(dt);
    dampCameraRigState(dt);
    updateCameraObstacles();
    rig
      .setOffset(resolveCameraOffset().x, tempCameraOffset.y, tempCameraOffset.z)
      .setTarget(tempCameraTarget.set(targetX, CAMERA_TARGET_HEIGHT + actorGroundHeight(state.player) + (state.player?.jumpY ?? 0), targetZ))
      .update(dt, cameraObstacleBuffer);
    rig.getDesiredPosition(tempCameraDesired);
    const cameraFocusX = tempCameraTarget.x;
    const cameraFocusY = tempCameraTarget.y + CAMERA_LOOK_AT_HEIGHT;
    const cameraFocusZ = tempCameraTarget.z;
    const actualCameraDistance = Math.hypot(camera.position.x - cameraFocusX, camera.position.y - cameraFocusY, camera.position.z - cameraFocusZ);
    cameraContext.blocked = actualCameraDistance < cameraDistance - 0.25;
    if (shake > 0) {
      rig.applyShake((Math.random() - 0.5) * shake, 0, (Math.random() - 0.5) * shake);
    }
    cameraContext.snapshot = readCameraRigSnapshot();
    setAimFromCamera();
    updateCameraOccluderFade();
    syncReticleToAimWorld();
  });
}

export function applyGamepadCameraOrbit(dt: number): void {
  if (!cameraRig || gamepadState.inputMode !== "controller") return;
  if (Math.abs(gamepadState.lookX) <= 0.001 && Math.abs(gamepadState.lookY) <= 0.001) return;
  markManualAim();
  const sensitivity = state.settings.stickSensitivity;
  const pitchSign = state.settings.invertY ? -1 : 1;
  cameraContext.desiredYaw = desiredCameraYaw - gamepadState.lookX * CAMERA_STICK_YAW_SPEED * dt * sensitivity;
  cameraContext.desiredPitch = clamp(desiredCameraPitch + gamepadState.lookY * CAMERA_STICK_PITCH_SPEED * dt * sensitivity * pitchSign, CAMERA_MIN_PITCH, CAMERA_MAX_PITCH);
}

export function updateCameraObstacles(): void {
  if (!cameraRig || !state.player) return;
  cameraObstacleBuffer.length = 0;
  const props = PERF_FLAGS.staticPropBsp ? state.visibleStaticProps : state.props;
  for (const prop of props) {
    if (prop.visible === false) continue;
    const collider = prop.userData?.collider;
    if (!collider?.blocking) continue;
    const worldX = prop.userData?.worldX;
    const worldZ = prop.userData?.worldZ;
    if (typeof worldX !== "number" || typeof worldZ !== "number") continue;
    const position = renderPosition(worldX, worldZ);
    if (distanceSquared(position.x, position.z, state.player.x, state.player.z) > CAMERA_VIEW_RADIUS * CAMERA_VIEW_RADIUS) continue;
    cameraObstacleBuffer.push(prop);
  }
}

export function updateCameraOccluderFade(): void {
  if (!cameraRigSnapshot || !state.player) return;
  const fromX = camera.position.x;
  const fromZ = camera.position.z;
  const toX = cameraRigSnapshot.lookAt[0];
  const toZ = cameraRigSnapshot.lookAt[2];
  const props = PERF_FLAGS.staticPropBsp ? state.visibleStaticProps : state.props;
  for (const prop of props) {
    const collider = prop.userData?.collider;
    if (!collider?.blocking || prop.visible === false) {
      setPropOccluderOpacity(prop, 1);
      continue;
    }
    const worldX = prop.userData?.worldX;
    const worldZ = prop.userData?.worldZ;
    if (typeof worldX !== "number" || typeof worldZ !== "number") {
      setPropOccluderOpacity(prop, 1);
      continue;
    }
    const position = renderPosition(worldX, worldZ);
    const radius = resolveCameraObstacleRadius(collider) + CAMERA_OCCLUDER_FADE_EXTRA_RADIUS;
    const distanceSq = pointSegmentDistanceSquared(position.x, position.z, fromX, fromZ, toX, toZ);
    setPropOccluderOpacity(prop, distanceSq <= radius * radius ? CAMERA_OCCLUDER_FADE_OPACITY : 1);
  }
}

export function resolveCameraObstacleRadius(collider: PropCollider): number {
  return collider.kind === "box"
    ? Math.hypot(collider.halfX ?? 1, collider.halfZ ?? 1)
    : collider.radius ?? 1;
}

export function pointSegmentDistanceSquared(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= 0.000001) return distanceSquared(px, pz, ax, az);
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / lengthSq, 0, 1);
  const x = ax + dx * t;
  const z = az + dz * t;
  return distanceSquared(px, pz, x, z);
}

export function setPropOccluderOpacity(prop: Three.Object3D, amount: number): void {
  const opacity = clamp(amount, 0, 1);
  prop.userData = prop.userData ?? {};
  if (Math.abs((prop.userData.occluderOpacity ?? 1) - opacity) < 0.001) return;
  prop.userData.occluderOpacity = opacity;
  prop.traverse((child) => forEachObjectMaterial(child, (material) => {
    preparePropOccluderMaterial(material, true);
    const baseOpacity = typeof material.userData.baseOccluderOpacity === "number"
      ? material.userData.baseOccluderOpacity
      : 1;
    material.opacity = baseOpacity * opacity;
  }));
}

export function preparePropOccluderMaterials(root: Three.Object3D): void {
  root.traverse((child) => forEachObjectMaterial(child, (material) => preparePropOccluderMaterial(material)));
}

export function preparePropOccluderMaterial(material: Three.Material, enableFade = false): void {
  material.userData = material.userData ?? {};
  if (material.userData.baseOccluderOpacity === undefined) material.userData.baseOccluderOpacity = material.opacity ?? 1;
  if (!enableFade) return;
  if (material.userData.occluderFadePrepared) return;
  material.userData.occluderFadePrepared = true;
  material.transparent = true;
  material.depthWrite = false;
  material.needsUpdate = true;
}

export function setAimFromCamera(): void {
  if (!state.player) return;
  const yaw = cameraRigSnapshot?.yaw ?? cameraYaw;
  const aimX = -Math.sin(yaw);
  const aimZ = -Math.cos(yaw);
  setAimWorld(state.player.x + aimX * CAMERA_AIM_DISTANCE, state.player.z + aimZ * CAMERA_AIM_DISTANCE);
}
