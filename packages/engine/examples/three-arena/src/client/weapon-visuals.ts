import { PROJECTILE_HEIGHT_OFFSET } from "./constants.ts";
import { runtimeCallback } from "./runtime-ports.ts";
const actorGroundHeight = runtimeCallback("terrain", "actorGroundHeight");
const terrainHeightAt = runtimeCallback("terrain", "terrainHeightAt");
const getBulletGeometry = runtimeCallback("renderCache", "getBulletGeometry");
const getBulletMaterial = runtimeCallback("renderCache", "getBulletMaterial");
const getBulletTrailGeometry = runtimeCallback("renderCache", "getBulletTrailGeometry");
const getEffectGeometry = runtimeCallback("renderCache", "getEffectGeometry");
const getEffectMaterial = runtimeCallback("renderCache", "getEffectMaterial");
const getTrailMaterial = runtimeCallback("renderCache", "getTrailMaterial");
const wrapWorld = runtimeCallback("worldMath", "wrapWorld");
import { clonePreparedThreeObject } from "@hyperfocus/engine/render/3d";
import type * as Three from "three";
import { state } from "./arena-state.ts";
import { weaponVisualProfiles } from "./asset-catalog.ts";
import { THREE } from "./boot-and-dom.ts";
import { weaponsById } from "./content-runtime.ts";
import { tempVec } from "./runtime-context.ts";
import { telemetry } from "./telemetry-core.ts";
import type { WeaponVisualProfile } from "./asset-catalog.ts";
import type { WeaponRuntime } from "./content-types.ts";
import type { WorldPosition3D } from "./runtime-types.ts";

export function getPlayerWeaponHandPosition(angle: number): Three.Vector3 {
  const player = state.player;
  if (!player) return tempVec.set(0, PROJECTILE_HEIGHT_OFFSET, 0);
  const hand = player.handAnchor;
  if (player.animated && hand) {
    hand.getWorldPosition(tempVec);
    tempVec.x += Math.cos(angle) * 0.12;
    tempVec.y += 0.04;
    tempVec.z += Math.sin(angle) * 0.12;
    return tempVec;
  }
  tempVec.set(
    player.x + Math.cos(angle) * 0.46,
    actorGroundHeight(player) + 1.34 + player.jumpY,
    player.z + Math.sin(angle) * 0.46
  );
  return tempVec;
}

export function getPlayerWeaponMuzzlePosition(angle: number): WorldPosition3D {
  const handPosition = getPlayerWeaponHandPosition(angle);
  const x = wrapWorld(handPosition.x + Math.cos(angle) * 0.46);
  const z = wrapWorld(handPosition.z + Math.sin(angle) * 0.46);
  return {
    x,
    y: projectileYAt(x, z),
    z
  };
}

export function projectileYAt(x: number, z: number, heightOffset = PROJECTILE_HEIGHT_OFFSET): number {
  return terrainHeightAt(x, z) + heightOffset;
}

export function createWeaponVisual(weaponId: string): Three.Group {
  const group = new THREE.Group();
  const weapon = weaponsById.get(weaponId);
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a2d1d, roughness: 0.76, metalness: 0.04 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x59616a, roughness: 0.34, metalness: 0.72 });
  const cord = new THREE.LineBasicMaterial({ color: 0xc6bda5 });
  const stock = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.18), wood);
  stock.position.set(0.28, -0.02, 0);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.055, 0.075), steel);
  rail.position.set(0.4, 0.09, 0);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.4, 0.16), wood);
  grip.position.set(-0.08, -0.2, 0);
  grip.rotation.z = -0.24;
  const bow = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 1.45), steel);
  bow.position.set(0.86, 0.08, 0);
  const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.35, 6), steel);
  bolt.rotation.z = Math.PI / 2;
  bolt.position.set(0.58, 0.16, 0);
  const stringGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0.86, 0.08, -0.72),
    new THREE.Vector3(0.18, 0.11, 0),
    new THREE.Vector3(0.86, 0.08, 0.72)
  ]);
  const string = new THREE.Line(stringGeometry, cord);
  group.add(stock, rail, grip, bow, bolt, string);
  const glowColor = new THREE.Color(weapon?.color ?? (weaponId === "flame" ? "#ff743d" : "#ffe09a"));
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6), getEffectMaterial(glowColor, 0.72));
  glow.position.set(0.94, 0.14, 0);
  group.add(glow);
  group.scale.setScalar(1.08);
  return group;
}

export function getWeaponVisualProfile(weaponId: string): WeaponVisualProfile {
  const profile = weaponVisualProfiles[weaponId] ?? weaponVisualProfiles.default;
  if (!profile) throw new Error("Default weapon visual profile is missing.");
  return profile;
}

export function cloneCachedModel(key: string, scale = 1): Three.Object3D | null {
  const source = state.modelCache.get(key);
  if (!source) return null;
  return clonePreparedThreeObject(source, {
    scale,
    castShadow: true,
    receiveShadow: true
  });
}

export function createProjectileVisual(weapon: WeaponRuntime, angle: number): Three.Group {
  const group = new THREE.Group();
  telemetry.meshCreates += 1;
  const color = new THREE.Color(weapon.color);
  const trail = new THREE.Mesh(getBulletTrailGeometry(), getTrailMaterial(weapon.color));
  trail.rotation.z = Math.PI / 2;
  trail.position.x = -0.92;
  trail.scale.set(weapon.id === "shotgun" ? 0.86 : 1.2, weapon.id === "rifle" ? 1.8 : 1.18, 1.18);
  const core = new THREE.Mesh(getBulletGeometry(), getBulletMaterial(weapon.color));
  const halo = new THREE.Mesh(getEffectGeometry("muzzle"), getEffectMaterial(color, 0.28));
  halo.scale.setScalar(weapon.id === "flame" ? 1.7 : 1.05);
  group.add(trail, core, halo);
  group.rotation.y = -angle;
  group.scale.setScalar(Math.max(0.45, weapon.projectileSizeMultiplier ?? 1));
  return group;
}
