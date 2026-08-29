import { runtimeCallback } from "./runtime-ports.ts";
const removeEnemyHealthBar = runtimeCallback("combatEntities", "removeEnemyHealthBar");
const terrainHeightAt = runtimeCallback("terrain", "terrainHeightAt");
const wrapWorld = runtimeCallback("worldMath", "wrapWorld");
const reportBootProgress = runtimeCallback("bootstrap", "reportBootProgress");
import { progressFromLoadEvent } from "@hyperfocus/engine/assets/loader";
import { createSolidThreeTexture, loadFirstThreeAsset, loadThreeLoaderAsset } from "@hyperfocus/engine/render/3d";
import type * as Three from "three";
import { THREE, requireRuntimeInstance } from "./boot-and-dom.ts";
import { threeView } from "./boot-context.ts";
import { camera, groundPlane, lastReticleX, lastReticleY, pointer, raycaster, scene, setLastReticlePosition, tempPointerNdc, tempVec } from "./runtime-context.ts";
import { isEnemySceneItem } from "./runtime-types.ts";
import { ui } from "./user-interface.ts";
import type { Pickup, SceneListItem } from "./runtime-types.ts";

export function updatePointerWorld(clientX: number, clientY: number): void {
  const nx = (clientX / window.innerWidth) * 2 - 1;
  const ny = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(tempPointerNdc.set(nx, ny), camera);
  raycaster.ray.intersectPlane(groundPlane, tempVec);
  setAimWorld(tempVec.x, tempVec.z);
}

export function setAimWorld(worldX: number, worldZ: number): void {
  pointer.worldX = wrapWorld(worldX);
  pointer.worldZ = wrapWorld(worldZ);
}

export function syncReticleToAimWorld(): void {
  tempVec.set(pointer.worldX, terrainHeightAt(pointer.worldX, pointer.worldZ) + 1, pointer.worldZ).project(camera);
  positionReticle((tempVec.x * 0.5 + 0.5) * window.innerWidth, (-tempVec.y * 0.5 + 0.5) * window.innerHeight);
}

export function positionReticle(clientX: number, clientY: number): void {
  if (!ui.reticle) return;
  if (Math.abs(clientX - lastReticleX) < 0.25 && Math.abs(clientY - lastReticleY) < 0.25) return;
  setLastReticlePosition(clientX, clientY);
  ui.reticle.style.transform = `translate3d(${clientX}px, ${clientY}px, 0)`;
}

export async function loadFirstTexture(
  textureLoader: Three.TextureLoader,
  paths: readonly string[],
  fallbackCanvas: Three.Texture,
  label = "Loading texture",
  startProgress = 0,
  endProgress = 1
): Promise<Three.Texture> {
  return loadFirstThreeAsset(
    paths,
    (path) => loadThreeLoaderAsset(textureLoader, path, {
      onProgress: (event) => {
        const progress = progressFromLoadEvent(event);
        if (progress === undefined) return;
        reportBootProgress(startProgress + (endProgress - startProgress) * progress, label);
      },
      prepare: (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        reportBootProgress(endProgress, label);
        return texture;
      }
    }),
    { fallback: fallbackCanvas }
  );
}

export function solidTexture(colorValue: Three.ColorRepresentation): Three.Texture {
  const normalizedColor = typeof colorValue === "string" || typeof colorValue === "number"
    ? colorValue
    : `#${new THREE.Color(colorValue).getHexString()}`;
  const texture = createSolidThreeTexture(threeView.THREE, normalizedColor, { colorSpace: THREE.SRGBColorSpace });
  return requireRuntimeInstance(texture, THREE.Texture, "Solid texture");
}

export function createPickupSpriteTexture(kind: Pickup["kind"]): Three.Texture {
  const fallback = kind === "weapon" ? "#ffd27a" : kind === "heal" ? "#c7ffae" : kind === "magnet" ? "#9fe8ff" : "#7bd6ff";
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return solidTexture(fallback);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const glow = ctx.createRadialGradient(64, 64, 8, 64, 64, 61);
  const glowColor = kind === "weapon" ? "255, 194, 92" : kind === "heal" ? "165, 255, 142" : kind === "magnet" ? "159, 232, 255" : "120, 214, 255";
  glow.addColorStop(0, `rgba(${glowColor}, 0.78)`);
  glow.addColorStop(0.5, `rgba(${glowColor}, 0.22)`);
  glow.addColorStop(1, `rgba(${glowColor}, 0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);
  if (kind === "weapon") drawWeaponPickupSprite(ctx);
  else if (kind === "heal") drawHealPickupSprite(ctx);
  else if (kind === "magnet") drawMagnetPickupSprite(ctx);
  else drawXpPickupSprite(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function drawMagnetPickupSprite(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.translate(64, 66);
  ctx.strokeStyle = "rgba(5, 14, 22, 0.72)";
  ctx.lineWidth = 25;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, 0, 35, Math.PI * 0.14, Math.PI * 0.86, true);
  ctx.stroke();
  ctx.strokeStyle = "#8ee8ff";
  ctx.lineWidth = 19;
  ctx.beginPath();
  ctx.arc(0, 0, 35, Math.PI * 0.14, Math.PI * 0.86, true);
  ctx.stroke();
  ctx.strokeStyle = "#f8fff2";
  ctx.lineWidth = 19;
  ctx.beginPath();
  ctx.arc(0, 0, 35, Math.PI * 0.14, Math.PI * 0.34, true);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 35, Math.PI * 0.66, Math.PI * 0.86, true);
  ctx.stroke();
  ctx.fillStyle = "#f8fff2";
  drawRoundRect(ctx, -43, -5, 18, 23, 4);
  ctx.fill();
  drawRoundRect(ctx, 25, -5, 18, 23, 4);
  ctx.fill();
  ctx.strokeStyle = "rgba(159, 232, 255, 0.82)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 47, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawXpPickupSprite(ctx: CanvasRenderingContext2D): void {
  const crystal = ctx.createLinearGradient(38, 22, 88, 104);
  crystal.addColorStop(0, "#f0fbff");
  crystal.addColorStop(0.38, "#7bd6ff");
  crystal.addColorStop(1, "#235cd8");
  ctx.save();
  ctx.translate(64, 64);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = "rgba(3, 11, 18, 0.42)";
  drawRoundRect(ctx, -24, -24, 48, 48, 7);
  ctx.fill();
  ctx.strokeStyle = "rgba(220, 251, 255, 0.92)";
  ctx.lineWidth = 4;
  ctx.fillStyle = crystal;
  drawRoundRect(ctx, -20, -20, 40, 40, 6);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.beginPath();
  ctx.arc(52, 42, 4, 0, Math.PI * 2);
  ctx.arc(76, 86, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(172, 236, 255, 0.76)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(64, 66, 34, 15, -0.45, 0, Math.PI * 2);
  ctx.stroke();
}

export function drawHealPickupSprite(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "rgba(5, 15, 7, 0.55)";
  ctx.beginPath();
  ctx.arc(64, 64, 31, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(224, 255, 205, 0.92)";
  ctx.lineWidth = 4;
  ctx.fillStyle = "#92f07b";
  ctx.beginPath();
  ctx.arc(64, 64, 27, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f7fff0";
  drawRoundRect(ctx, 57, 42, 14, 44, 4);
  ctx.fill();
  drawRoundRect(ctx, 42, 57, 44, 14, 4);
  ctx.fill();
}

export function drawWeaponPickupSprite(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "rgba(12, 8, 3, 0.62)";
  drawRoundRect(ctx, 30, 42, 68, 45, 8);
  ctx.fill();
  const chest = ctx.createLinearGradient(34, 38, 88, 90);
  chest.addColorStop(0, "#fff0a8");
  chest.addColorStop(0.46, "#d99134");
  chest.addColorStop(1, "#6f3d1e");
  ctx.fillStyle = chest;
  drawRoundRect(ctx, 35, 45, 58, 38, 7);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 245, 187, 0.92)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "rgba(70, 38, 21, 0.72)";
  ctx.fillRect(35, 60, 58, 6);
  ctx.fillStyle = "#fff0a8";
  drawRoundRect(ctx, 59, 55, 10, 17, 3);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 230, 137, 0.82)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(47, 33);
  ctx.lineTo(83, 92);
  ctx.stroke();
  ctx.fillStyle = "#f9fcff";
  ctx.beginPath();
  ctx.moveTo(43, 28);
  ctx.lineTo(52, 34);
  ctx.lineTo(44, 39);
  ctx.closePath();
  ctx.fill();
}

export function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function clearList<T extends SceneListItem>(list: T[]): void {
  for (const item of list) {
    if (item.mesh) scene.remove(item.mesh);
    if (item.light) scene.remove(item.light);
    if (item.userData?.light) scene.remove(item.userData.light);
    if (isEnemySceneItem(item)) removeEnemyHealthBar(item);
  }
  list.length = 0;
}

export function removeFromList<T extends SceneListItem>(list: T[], index: number): void {
  const [item] = list.splice(index, 1);
  if (item?.mesh) scene.remove(item.mesh);
  if (item?.light) scene.remove(item.light);
  if (item && isEnemySceneItem(item)) removeEnemyHealthBar(item);
}
