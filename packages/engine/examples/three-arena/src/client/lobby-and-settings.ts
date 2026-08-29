import * as lobbyNetwork from "../network.ts";
import { runtimeCallback } from "./runtime-ports.ts";
const applyAudioSettings = runtimeCallback("audio", "applyAudioSettings");
const bootErrorLabel = runtimeCallback("bootstrap", "bootErrorLabel");
const isRecord = runtimeCallback("contentUi", "isRecord");
const saveSettings = runtimeCallback("contentUi", "saveSettings");
const clamp = runtimeCallback("hud", "clamp");
const defaultWsUrl = runtimeCallback("hud", "defaultWsUrl");
const toast = runtimeCallback("hud", "toast");
const clearControllerFocus = runtimeCallback("inputAndMenu", "clearControllerFocus");
const focusMenuElement = runtimeCallback("inputAndMenu", "focusMenuElement");
const setMenuFocus = runtimeCallback("inputAndMenu", "setMenuFocus");
const updateControlHint = runtimeCallback("inputAndMenu", "updateControlHint");
const applyNetworkSnapshot = runtimeCallback("networkAndCamera", "applyNetworkSnapshot");
const clearRemotePlayers = runtimeCallback("networkAndCamera", "clearRemotePlayers");
const requestRunPointerLock = runtimeCallback("runLifecycle", "requestRunPointerLock");
const startGame = runtimeCallback("runLifecycle", "startGame");
import { state } from "./arena-state.ts";
import { DEFAULT_SETTINGS, data } from "./content-runtime.ts";
import { WAVE_BANNER_SUBTITLES } from "./input-constants.ts";
import { gamepadState } from "./input-context.ts";
import { lobbyRoomStatus, networkClient, networkContext, networkModule } from "./runtime-context.ts";
import { ui } from "./user-interface.ts";
import type { NumericSettingKey, SettingKey } from "./content-runtime.ts";
import type { WaveDefinition } from "./content-types.ts";

export async function loadNetworkModule(): Promise<void> {
  try {
    networkContext.module = lobbyNetwork;
    ui.onlineButton.disabled = false;
    ui.lobbyStatus.textContent = "Lobby bell ready. Start the server, then call a room.";
  } catch {
    ui.lobbyStatus.textContent = "Lobby bell missing. Solo gate is open.";
  }
}

export async function connectLobby(): Promise<void> {
  if (!networkModule?.connectLobby) return toast("Lobby bell missing. Solo gate is open.");
  try {
    ui.onlineButton.disabled = true;
    networkContext.roomStatus = null;
    if (ui.startRoomButton) ui.startRoomButton.disabled = true;
    const client = await networkModule.connectLobby({ url: defaultWsUrl(), name: ui.playerName.value.trim() || "Hunter" });
    networkContext.client = client;
    client.onLobby?.(handleLobbyMessage);
    client.onState?.(applyNetworkSnapshot);
    ui.createRoomButton.disabled = false;
    if (ui.startRoomButton) ui.startRoomButton.disabled = true;
    ui.refreshRoomsButton.disabled = false;
    ui.lobbyStatus.textContent = "Lobby bell answered. Create or join a room.";
  } catch (error) {
    ui.onlineButton.disabled = false;
    ui.lobbyStatus.textContent = `Lobby call failed: ${bootErrorLabel(error)}`;
  }
}

export function handleLobbyMessage(message: Record<string, unknown>): void {
  if (message?.type === "disconnect") {
    state.online = false;
    networkContext.roomStatus = null;
    if (ui.startRoomButton) ui.startRoomButton.disabled = true;
    clearRemotePlayers();
  }
  if (message?.type === "joined") {
    networkContext.roomStatus = message;
    updateStartRoomButton();
    ui.lobbyStatus.textContent = message.hostId === networkClient?.playerId
      ? `Hosting ${message.roomId ?? "room"}. Wait for friends, then start the lobby game.`
      : `Joined ${message.roomId ?? "room"}. Waiting for the host to start.`;
    toast(`Joined ${message.roomId ?? "room"}.`);
  }
  if (message?.type === "room_status") {
    networkContext.roomStatus = message;
    updateStartRoomButton();
    if (!state.running) {
      const players = Number(message.players ?? 0);
      ui.lobbyStatus.textContent = message.status === "running"
        ? `${message.roomId ?? "Room"} already started. Joining run...`
        : `${message.roomId ?? "Room"} waiting: ${players} player${players === 1 ? "" : "s"}.`;
    }
  }
  if (message?.type === "room_started") {
    networkContext.roomStatus = { ...(lobbyRoomStatus ?? {}), ...message, status: "running" };
    updateStartRoomButton();
    if (!state.running || !state.online) {
      startGame(true, message);
      toast(`Started ${message.roomId ?? "room"}. Hold near your allies.`);
    }
  }
  if (Array.isArray(message.rooms)) renderRoomList(message.rooms.filter(isRecord));
}

export function updateStartRoomButton(): void {
  if (!ui.startRoomButton) return;
  const host = lobbyRoomStatus?.hostId === networkClient?.playerId;
  const waiting = lobbyRoomStatus?.status !== "running" && Boolean(lobbyRoomStatus?.roomId ?? networkClient?.roomId);
  ui.startRoomButton.disabled = !(host && waiting);
}

export function renderRoomList(rooms: Array<Record<string, unknown>>): void {
  ui.roomList.textContent = "";
  if (!rooms.length) {
    const empty = document.createElement("p");
    empty.className = "small";
    empty.textContent = "No rooms on the bell yet.";
    ui.roomList.append(empty);
    setMenuFocus(gamepadState.menuIndex);
    return;
  }
  for (const room of rooms) {
    const roomId = typeof room.id === "string" ? room.id : null;
    if (!roomId) continue;
    const row = document.createElement("div");
    row.className = "room-row";
    const label = document.createElement("span");
    const status = room.status === "running" ? "running" : "waiting";
    label.textContent = `${typeof room.name === "string" ? room.name : roomId} (${Number(room.players ?? 0)}) ${status}`;
    const join = document.createElement("button");
    join.textContent = room.status === "running" ? "Join Run" : "Join Lobby";
    join.addEventListener("click", () => networkClient?.joinRoom?.(roomId));
    row.append(label, join);
    ui.roomList.append(row);
  }
  setMenuFocus(gamepadState.menuIndex);
}

export function bindSettingsControls(): void {
  const bindings: Array<[HTMLInputElement | null | undefined, SettingKey]> = [
    [ui.mouseSensitivityInput, "mouseSensitivity"],
    [ui.stickSensitivityInput, "stickSensitivity"],
    [ui.invertYToggle, "invertY"],
    [ui.masterVolumeInput, "masterVolume"],
    [ui.musicVolumeInput, "musicVolume"],
    [ui.sfxVolumeInput, "sfxVolume"],
    [ui.muteToggle, "muted"]
  ];
  for (const [input, key] of bindings) {
    if (!input) continue;
    const eventName = input.type === "checkbox" ? "change" : "input";
    input.addEventListener(eventName, () => updateSettingFromControl(key, input));
  }
  renderSettingsControls();
  applyAudioSettings();
  saveSettings();
}

export function isNumericSettingKey(key: SettingKey): key is NumericSettingKey {
  return key !== "invertY" && key !== "muted";
}

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key);
}

export function updateSettingFromControl(key: SettingKey, input: HTMLInputElement): void {
  if (input.type === "checkbox" && (key === "invertY" || key === "muted")) {
    state.settings[key] = Boolean(input.checked);
  } else if (isNumericSettingKey(key)) {
    const [min, max] = settingRange(key);
    state.settings[key] = clamp(Number(input.value), min, max);
  }
  renderSettingsControls();
  applyAudioSettings();
  saveSettings();
}

export function settingRange(key: NumericSettingKey): [number, number] {
  if (key === "mouseSensitivity" || key === "stickSensitivity") return [0.5, 2];
  return [0, 1];
}

export function renderSettingsControls(): void {
  setSettingsInput(ui.mouseSensitivityInput, state.settings.mouseSensitivity);
  setSettingsInput(ui.stickSensitivityInput, state.settings.stickSensitivity);
  setSettingsInput(ui.masterVolumeInput, state.settings.masterVolume);
  setSettingsInput(ui.musicVolumeInput, state.settings.musicVolume);
  setSettingsInput(ui.sfxVolumeInput, state.settings.sfxVolume);
  setSettingsToggle(ui.invertYToggle, state.settings.invertY);
  setSettingsToggle(ui.muteToggle, state.settings.muted);
  document.querySelectorAll<HTMLElement>("[data-setting-value]").forEach((output) => {
    const key = output.getAttribute("data-setting-value");
    output.textContent = settingReadback(key);
  });
}

export function setSettingsInput(input: HTMLInputElement | null | undefined, value: number): void {
  if (!input) return;
  input.value = String(value);
}

export function setSettingsToggle(input: HTMLInputElement | null | undefined, value: boolean): void {
  if (!input) return;
  input.checked = Boolean(value);
}

export function settingReadback(key: string | null): string {
  if (key === "invertY") return state.settings.invertY ? "On" : "Off";
  if (key === "muted") return state.settings.muted ? "On" : "Off";
  if (!key || !(key in state.settings)) return "";
  const settingKey: SettingKey = key === "mouseSensitivity" || key === "stickSensitivity" || key === "invertY"
    || key === "masterVolume" || key === "musicVolume" || key === "sfxVolume" || key === "muted"
    ? key
    : "masterVolume";
  const value = Number(state.settings[settingKey]);
  return Number.isFinite(value) ? value.toFixed(2) : "1.00";
}

export function openPauseMenu(): void {
  if (!state.running || state.paused) return;
  state.running = false;
  state.paused = true;
  state.pausePanel = "root";
  document.exitPointerLock?.();
  ui.menu?.classList.add("hidden");
  document.body.classList.add("pause-open", "run-active");
  document.body.classList.remove("menu-open");
  clearControllerFocus();
  renderPauseUi();
  focusPauseElement(ui.pauseResumeButton);
}

export function resumeRunFromPause(): void {
  if (!state.paused) return;
  state.paused = false;
  state.running = true;
  state.pausePanel = "root";
  document.body.classList.remove("pause-open", "menu-open");
  document.body.classList.add("run-active");
  renderPauseUi();
  clearControllerFocus();
  requestRunPointerLock();
}

export function openPauseSettings(): void {
  if (!state.paused) return;
  state.pausePanel = "settings";
  renderPauseUi();
  focusPauseElement(ui.mouseSensitivityInput);
}

export function closePauseSettings(): void {
  if (!state.paused || state.pausePanel !== "settings") return;
  state.pausePanel = "root";
  renderPauseUi();
  focusPauseElement(ui.pauseSettingsButton);
}

export function openPauseConfirm(): void {
  if (!state.paused) return;
  state.pausePanel = "confirm";
  renderPauseUi();
  focusPauseElement(ui.pauseConfirmCancelButton);
}

export function closePauseConfirm(): void {
  if (!state.paused || state.pausePanel !== "confirm") return;
  state.pausePanel = "root";
  renderPauseUi();
  focusPauseElement(ui.pauseMainMenuButton);
}

export function returnToMainMenuFromPause(): void {
  if (!state.paused || state.pausePanel !== "confirm") return;
  state.running = false;
  state.paused = false;
  state.pausePanel = "root";
  document.exitPointerLock?.();
  ui.menu?.classList.remove("hidden");
  if (ui.soloButton) ui.soloButton.textContent = "Singleplayer";
  document.body.classList.add("menu-open");
  document.body.classList.remove("run-active", "pause-open");
  renderPauseUi();
  clearControllerFocus();
  focusPauseElement(ui.soloButton);
  toast("Run abandoned at the gate.");
}

export function renderPauseUi(): void {
  const open = state.paused;
  ui.pauseOverlay?.classList.toggle("hidden", !open);
  ui.pauseRootPanel?.classList.toggle("hidden", !open || state.pausePanel !== "root");
  ui.pauseSettingsPanel?.classList.toggle("hidden", !open || state.pausePanel !== "settings");
  ui.pauseConfirmDialog?.classList.toggle("hidden", !open || state.pausePanel !== "confirm");
  if (open) renderSettingsControls();
  updateControlHint();
}

export function focusPauseElement(element: HTMLElement | null | undefined): void {
  if (!element) return;
  focusMenuElement(element);
  if (gamepadState.inputMode !== "controller") element.focus?.({ preventScroll: true });
}

export function waveCopyKey(wave: WaveDefinition | null | undefined): string {
  return String(wave?.id ?? wave?.name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function waveBannerSubtitle(wave: WaveDefinition | null | undefined): string {
  const key = waveCopyKey(wave);
  if (WAVE_BANNER_SUBTITLES[key]) return WAVE_BANNER_SUBTITLES[key];
  if (wave?.eliteId && data.enemies?.[wave.eliteId]?.name) return `${data.enemies[wave.eliteId].name} signs spotted. Watch the floor.`;
  return "The yard changed shape. Keep one lane open.";
}
