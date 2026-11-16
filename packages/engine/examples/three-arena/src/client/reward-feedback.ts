import { runtimeCallback } from "./runtime-ports.ts";
const playSynthCue = runtimeCallback("audio", "playSynthCue");
const terrainHeightAt = runtimeCallback("terrain", "terrainHeightAt");
const queryLiveEnemies = runtimeCallback("worldMath", "queryLiveEnemies");
const worldDistanceSquared = runtimeCallback("worldMath", "worldDistanceSquared");
const wrapWorld = runtimeCallback("worldMath", "wrapWorld");
import { COMBO_TIMEOUT_SECONDS, PLAYER_HEIGHT_WORLD } from "./constants.ts";
import type * as Three from "three";
import { state } from "./arena-state.ts";
import { THREE } from "./boot-and-dom.ts";
import { centerBannerTimeout, floatingTextLayer, setCenterBannerTimeout } from "./runtime-context.ts";
import { ui } from "./user-interface.ts";
import type { Enemy, FloatingTextOptions, Pickup, WorldActor } from "./runtime-types.ts";

export function pulseOverlay(kind: "danger" | "gold" | "level"): void {
  if (!ui.fxOverlay) return;
  const className = `flash-${kind}`;
  ui.fxOverlay.classList.remove("flash-danger", "flash-gold", "flash-level");
  void ui.fxOverlay.offsetWidth;
  ui.fxOverlay.classList.add(className);
}

export function showCenterBanner(title: string, subtitle = ""): void {
  if (!ui.centerBanner) return;
  if (shouldSuppressNonCriticalReward(title)) return;
  ui.centerBanner.textContent = "";
  const strong = document.createElement("strong");
  strong.textContent = title;
  ui.centerBanner.append(strong);
  if (subtitle) {
    const span = document.createElement("span");
    span.textContent = subtitle;
    ui.centerBanner.append(span);
  }
  ui.centerBanner.classList.add("show");
  clearTimeout(centerBannerTimeout);
  setCenterBannerTimeout(setTimeout(() => ui.centerBanner?.classList.remove("show"), 1900));
}

export function spawnFloatingText(
  text: string,
  x: number,
  z: number,
  colorValue: Three.ColorRepresentation = "#fff3a0",
  scale = 1,
  options: FloatingTextOptions = {}
): void {
  if (shouldSuppressNonCriticalReward(text)) return;
  const color = typeof colorValue === "string"
    ? colorValue
    : `#${new THREE.Color(colorValue).getHexString()}`;
  floatingTextLayer?.spawn({
    text,
    position: [wrapWorld(x), terrainHeightAt(x, z) + (options.y ?? 0), wrapWorld(z)],
    color,
    scale,
    targetHeight: options.targetHeight ?? PLAYER_HEIGHT_WORLD + 0.35,
    baseFontPx: options.baseFontPx,
    lifeSeconds: options.lifeSeconds,
    rise: options.rise,
    screenRisePx: options.screenRisePx,
    growScale: options.growScale
  });
}

export function shouldSuppressNonCriticalReward(text: string): boolean {
  if (!state.running || !isHighCombatPressure()) return false;
  return /^(NEW WEAPON|UPGRADE|MAGNET|LEVEL UP|\+4 shards|Weapon Upgrade|Weapon Unlocked)$/i.test(String(text ?? "").trim());
}

export function isHighCombatPressure(): boolean {
  if (!state.player) return false;
  let close = 0;
  let near = 0;
  const candidates = queryLiveEnemies(state.player.x, state.player.z, 32);
  for (const enemy of candidates) {
    if (enemy.hp <= 0) continue;
    const distanceSq = worldDistanceSquared(state.player.x, state.player.z, enemy.x, enemy.z);
    if (distanceSq <= 324) close += 1;
    if (distanceSq <= 1024) near += 1;
    if (close >= 3 || near >= 10) return true;
  }
  return false;
}

export function updateFloatingTexts(dt: number): void {
  floatingTextLayer?.update(dt);
}

export function clearFloatingTexts(): void {
  floatingTextLayer?.clear();
}

export function actorFloatingTextHeight(actor: WorldActor, extra = 0.35): number {
  return Math.max(1.5, PLAYER_HEIGHT_WORLD * (actor?.scale ?? 1) + (actor?.jumpY ?? 0) + extra);
}

export function pickupFloatingTextHeight(pickup: Pickup): number {
  return Math.max(1.55, 1.15 + (pickup?.scale ?? 1) * 0.55);
}

export function registerComboKill(enemy: Enemy): void {
  state.combo += 1;
  state.comboTimer = COMBO_TIMEOUT_SECONDS;
  if (state.combo > 0 && state.combo % 8 === 0) {
    spawnFloatingText(`${state.combo} CHAIN`, enemy.x, enemy.z, "#ffd86a", 1.18, { targetHeight: actorFloatingTextHeight(enemy, 0.62) });
    playSynthCue("pickup", 1.15, { kind: "xp" });
  }
  updateComboReadout();
}

export function updateCombo(dt: number): void {
  if (state.combo <= 0) return;
  state.comboTimer -= dt;
  if (state.comboTimer <= 0) {
    state.combo = 0;
    state.comboTimer = 0;
  }
  updateComboReadout();
}

export function updateComboReadout(): void {
  if (!ui.comboText) return;
  if (state.combo < 3) {
    ui.comboText.classList.remove("show");
    ui.comboText.textContent = "";
    return;
  }
  ui.comboText.textContent = `${state.combo}x chain`;
  ui.comboText.classList.add("show");
}
