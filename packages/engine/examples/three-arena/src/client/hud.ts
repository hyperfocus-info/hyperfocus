import { HUD_UPDATE_INTERVAL } from "./constants.ts";
import { PERF_QUERY } from "./environment.ts";
import { runtimeCallback } from "./runtime-ports.ts";
const passiveTeamworkEffectIds = runtimeCallback("progressionChoices", "passiveTeamworkEffectIds");
const selectedClass = runtimeCallback("progressionData", "selectedClass");
const selectedClassLevel = runtimeCallback("progressionData", "selectedClassLevel");
const getWeaponLevel = runtimeCallback("progressionRuntime", "getWeaponLevel");
const getWeaponRuntime = runtimeCallback("progressionRuntime", "getWeaponRuntime");
const passiveIconPath = runtimeCallback("contentUi", "passiveIconPath");
const weaponIconPath = runtimeCallback("contentUi", "weaponIconPath");
import { state } from "./arena-state.ts";
import { threeView } from "./boot-context.ts";
import { PASSIVE_TEAMWORK_EFFECTS, data, passiveItemsById } from "./content-runtime.ts";
import { lastPassiveHudKey, lastWeaponHudKey, setLastPassiveHudKey, setLastWeaponHudKey, setToastTimeout, toastTimeout } from "./runtime-context.ts";
import { ui } from "./user-interface.ts";

export function updateHud(dt = 0, force = false): void {
  const player = state.player;
  if (!player) return;
  state.hudClock -= dt;
  if (!force && state.hudClock > 0) return;
  state.hudClock = HUD_UPDATE_INTERVAL;
  const wave = data.waves[state.waveIndex] ?? data.waves[0];
  ui.hpText.textContent = `${Math.ceil(player.hp)}/${player.maxHp}`;
  if (ui.hpFill) ui.hpFill.style.transform = `scaleX(${clamp01(player.hp / Math.max(1, player.maxHp))})`;
  ui.killsText.textContent = String(state.kills);
  ui.waveText.textContent = `${state.waveIndex + 1}: ${wave.name}`;
  ui.levelText.textContent = String(state.level);
  if (ui.xpText) ui.xpText.textContent = `${state.xp}/${state.nextXp}`;
  if (ui.xpFill) ui.xpFill.style.transform = `scaleX(${clamp01(state.xp / Math.max(1, state.nextXp))})`;
  if (ui.classText) {
    ui.classText.textContent = `${selectedClass()?.name ?? "Survivor"} L${selectedClassLevel()}`;
    ui.classText.closest<HTMLElement>(".pill")?.style.setProperty("--class-color", selectedClass()?.color ?? "#d7ff8d");
  }
  ui.objectiveText.textContent = data.objectives[Math.min(state.waveIndex, data.objectives.length - 1)] ?? "Survive.";
  const weaponKey = `${state.weaponSlots.map((id) => `${id}:${getWeaponLevel(id)}:${state.evolvedWeapons.has(id) ? "e" : ""}`).join("|")}@${state.activeWeaponId ?? ""}`;
  if (force || weaponKey !== lastWeaponHudKey) {
    setLastWeaponHudKey(weaponKey);
    ui.weaponText.textContent = "";
    for (const id of state.weaponSlots) {
      const weapon = getWeaponRuntime(id);
      const item = document.createElement("div");
      item.className = `pill weapon-pill${id === state.activeWeaponId ? " active-weapon" : ""}`;
      item.style.setProperty("--weapon-color", weapon?.color ?? "#d5ff8d");
      item.dataset.weaponId = id;
      item.dataset.weaponIcon = weaponIconPath(id, Boolean(weapon?.evolved));
      item.dataset.weaponLevel = String(getWeaponLevel(id));
      item.dataset.weaponState = weapon?.evolved ? "EVO" : (weapon?.stateLabel ?? "");
      item.title = `${weapon?.name ?? id} L${getWeaponLevel(id)}${weapon?.evolved ? " EVO" : ""}`;
      const glyph = document.createElement("span");
      glyph.className = "weapon-glyph";
      glyph.textContent = weapon?.label ?? (weapon?.name ?? id).slice(0, 2).toUpperCase();
      const strong = document.createElement("strong");
      strong.textContent = weapon?.name ?? id;
      item.append(glyph);
      item.append(strong);
      ui.weaponText.append(item);
    }
  }
  const passiveKey = state.passiveSlots.map((id) => `${id}:${state.passiveLevels.get(id) ?? 0}:${passiveTeamworkEffectIds(id).join(",")}`).join("|");
  if (ui.passiveText && (force || passiveKey !== lastPassiveHudKey)) {
    setLastPassiveHudKey(passiveKey);
    ui.passiveText.textContent = "";
    for (const id of state.passiveSlots) {
      const passive = passiveItemsById.get(id);
      const chip = document.createElement("div");
      chip.className = "passive-chip";
      chip.style.setProperty("--passive-color", passive?.visual?.color ?? "#d7ff8d");
      const effects = passiveTeamworkEffectIds(id)
        .map((effectId) => PASSIVE_TEAMWORK_EFFECTS.find((effect) => effect.id === effectId)?.title)
        .filter(Boolean);
      chip.title = `${passive?.name ?? id} L${state.passiveLevels.get(id) ?? 1}${effects.length ? `: ${effects.join(", ")}` : ""}`;
      chip.setAttribute("aria-label", chip.title);
      const icon = document.createElement("span");
      icon.className = "passive-icon";
      icon.setAttribute("aria-hidden", "true");
      const image = document.createElement("img");
      image.alt = "";
      image.src = passiveIconPath(id);
      icon.append(image);
      const level = document.createElement("span");
      level.textContent = `L${state.passiveLevels.get(id) ?? 1}`;
      chip.append(icon, level);
      ui.passiveText.append(chip);
    }
  }
}

export function toast(text: string): void {
  ui.toast.textContent = text;
  ui.toast.classList.add("show");
  clearTimeout(toastTimeout);
  setToastTimeout(setTimeout(() => ui.toast.classList.remove("show"), 1700));
}

export function pulseShake(duration: number, power: number): void {
  state.shake = Math.max(state.shake, duration);
  state.shakePower = Math.max(state.shakePower, power);
}

export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function roundToStep(value: number, step: number): number {
  const decimals = Math.max(0, String(step).split(".")[1]?.length ?? 0);
  return Number(value.toFixed(decimals));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function onResize(): void {
  threeView.resize(window.innerWidth, window.innerHeight);
}

export function defaultWsUrl(): string {
  const explicit = PERF_QUERY.get("ws") || PERF_QUERY.get("server");
  if (explicit) return explicit;
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const staticPort = Number(location.port || (location.protocol === "https:" ? 443 : 80));
  const wsPort = Number.isFinite(staticPort) && staticPort > 0 ? staticPort + 1 : 8794;
  return `${protocol}://${location.hostname}:${wsPort}`;
}
