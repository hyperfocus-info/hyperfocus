import { runtimeCallback } from "./runtime-ports.ts";
const markManualAim = runtimeCallback("combatWeapons", "markManualAim");
const clamp = runtimeCallback("hud", "clamp");
const roundToStep = runtimeCallback("hud", "roundToStep");
const setAimFromCamera = runtimeCallback("networkAndCamera", "setAimFromCamera");
const attemptPlayerJump = runtimeCallback("playerUpdate", "attemptPlayerJump");
const positionReticle = runtimeCallback("pointerAndTextures", "positionReticle");
const setAimWorld = runtimeCallback("pointerAndTextures", "setAimWorld");
const syncReticleToAimWorld = runtimeCallback("pointerAndTextures", "syncReticleToAimWorld");
const updatePointerWorld = runtimeCallback("pointerAndTextures", "updatePointerWorld");
const applyLevelChoice = runtimeCallback("progressionUi", "applyLevelChoice");
const banishSelectedLevelChoice = runtimeCallback("progressionUi", "banishSelectedLevelChoice");
const renderClassPicker = runtimeCallback("progressionUi", "renderClassPicker");
const rerollLevelChoices = runtimeCallback("progressionUi", "rerollLevelChoices");
const toggleLoadoutPanel = runtimeCallback("progressionUi", "toggleLoadoutPanel");
const requestRunPointerLock = runtimeCallback("runLifecycle", "requestRunPointerLock");
const startGame = runtimeCallback("runLifecycle", "startGame");
const bindSettingsControls = runtimeCallback("lobbyAndSettings", "bindSettingsControls");
const closePauseConfirm = runtimeCallback("lobbyAndSettings", "closePauseConfirm");
const closePauseSettings = runtimeCallback("lobbyAndSettings", "closePauseSettings");
const connectLobby = runtimeCallback("lobbyAndSettings", "connectLobby");
const openPauseConfirm = runtimeCallback("lobbyAndSettings", "openPauseConfirm");
const openPauseMenu = runtimeCallback("lobbyAndSettings", "openPauseMenu");
const openPauseSettings = runtimeCallback("lobbyAndSettings", "openPauseSettings");
const renderPauseUi = runtimeCallback("lobbyAndSettings", "renderPauseUi");
const resumeRunFromPause = runtimeCallback("lobbyAndSettings", "resumeRunFromPause");
const returnToMainMenuFromPause = runtimeCallback("lobbyAndSettings", "returnToMainMenuFromPause");
import { CAMERA_AIM_DISTANCE, CAMERA_BASE_DISTANCE, CAMERA_DEFAULT_PITCH, CAMERA_DISTANCE_SMOOTHING_SECONDS, CAMERA_LOOK_AT_HEIGHT, CAMERA_MAX_DISTANCE, CAMERA_MAX_PITCH, CAMERA_MIN_DISTANCE, CAMERA_MIN_PITCH, CAMERA_MOUSE_PITCH_SPEED, CAMERA_MOUSE_YAW_SPEED, CAMERA_ROTATION_SMOOTHING_SECONDS } from "./constants.ts";
import { PERF_FLAGS } from "./environment.ts";
import { telemetry } from "./telemetry-core.ts";
import type * as Three from "three";
import { state } from "./arena-state.ts";
import { CONTROL_HINTS, GAMEPAD_BUTTON, gamepadSession } from "./input-constants.ts";
import { gamepadState, menuFocus } from "./input-context.ts";
import { camera, cameraBlocked, cameraContext, cameraDistance, cameraPitch, cameraRig, cameraYaw, desiredCameraDistance, desiredCameraPitch, desiredCameraYaw, keys, networkClient, pointer, renderContext, renderer, tempCameraDesired, tempCameraOffset, tempCameraTarget } from "./runtime-context.ts";
import { ui } from "./user-interface.ts";
import type { ArenaGamepadState, FocusItem, MenuDirection, MenuMove } from "./input-context.ts";
import type { CameraRigSnapshot } from "./runtime-types.ts";

export function setupInput(): void {
  window.addEventListener("keydown", (event) => {
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
    if (state.levelChoice && /^Digit[1-3]$/.test(event.code)) {
      event.preventDefault();
      applyLevelChoice(Number(event.code.at(-1)) - 1);
      return;
    }
    if (state.levelChoice && !event.repeat && event.code === "KeyR") {
      event.preventDefault();
      rerollLevelChoices();
      return;
    }
    if (state.levelChoice && !event.repeat && event.code === "KeyB") {
      event.preventDefault();
      banishSelectedLevelChoice();
      return;
    }
    if (event.code === "Space" && !event.repeat && state.running) attemptPlayerJump();
    keys.add(event.code);
    setInputMode("keyboard");
    if (event.code === "Escape" && !event.repeat) {
      if (state.running) openPauseMenu();
      else if (state.paused && state.pausePanel === "root") resumeRunFromPause();
      else if (state.paused && state.pausePanel === "settings") closePauseSettings();
      else if (state.paused && state.pausePanel === "confirm") closePauseConfirm();
    }
  });
  window.addEventListener("keyup", (event) => keys.delete(event.code));
  window.addEventListener("pointermove", (event) => {
    setInputMode("keyboard");
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (state.running) {
      if (Math.hypot(event.movementX ?? 0, event.movementY ?? 0) > 0.5) markManualAim();
      orbitCameraFromMouse(event);
      setAimFromCamera();
      syncReticleToAimWorld();
      return;
    }
    positionReticle(event.clientX, event.clientY);
    updatePointerWorld(event.clientX, event.clientY);
  });
  renderer.domElement.addEventListener("pointerdown", () => {
    if (state.running) requestRunPointerLock();
  });
  window.addEventListener("gamepadconnected", (event) => registerGamepad(event.gamepad));
  window.addEventListener("gamepaddisconnected", (event) => {
    if (event.gamepad.index !== gamepadState.index) return;
    clearGamepadState();
  });
  updateControllerStatus();
  setInputMode("keyboard");
}

export function setupMenu(): void {
  renderClassPicker();
  ui.soloButton.addEventListener("click", () => startGame(false));
  ui.onlineButton.addEventListener("click", connectLobby);
  ui.loadoutConfigButton?.addEventListener("click", toggleLoadoutPanel);
  ui.createRoomButton.addEventListener("click", () => networkClient?.createRoom?.());
  ui.startRoomButton?.addEventListener("click", () => networkClient?.startRoom?.());
  ui.refreshRoomsButton.addEventListener("click", () => networkClient?.listRooms?.());
  ui.levelChoiceRerollButton?.addEventListener("click", rerollLevelChoices);
  ui.levelChoiceBanishButton?.addEventListener("click", banishSelectedLevelChoice);
  ui.pauseResumeButton?.addEventListener("click", resumeRunFromPause);
  ui.pauseSettingsButton?.addEventListener("click", openPauseSettings);
  ui.pauseMainMenuButton?.addEventListener("click", openPauseConfirm);
  ui.pauseConfirmLeaveButton?.addEventListener("click", returnToMainMenuFromPause);
  ui.pauseConfirmCancelButton?.addEventListener("click", closePauseConfirm);
  bindSettingsControls();
  renderPauseUi();
  setMenuFocus(0);
}

export function setupMinimap(): void {
  renderContext.minimapCtx = ui.minimapCanvas?.getContext?.("2d") ?? null;
  ui.telemetryPanel?.classList.toggle("hidden", !telemetry.enabled || !PERF_FLAGS.telemetryPanel);
}

export function pollGamepad(): void {
  const sample = gamepadSession.poll();
  const gamepad = sample.gamepad;
  if (!gamepad) {
    if (gamepadState.connected) clearGamepadState();
    return;
  }
  if (!gamepadState.connected || gamepadState.index !== gamepad.index) registerGamepad(gamepad);

  const frame = sample.frame;
  const pressedNow = (button: number): boolean => sample.pressedButtons.has(button);
  const move = {
    x: frame.movement.dx,
    y: frame.movement.dy,
    active: Math.hypot(frame.movement.dx, frame.movement.dy) > 0.001
  };
  const aim = {
    x: frame.aimOffset?.x ?? 0,
    y: frame.aimOffset?.y ?? 0,
    active: Boolean(frame.aimOffset)
  };

  gamepadState.moveX = move.x;
  gamepadState.moveZ = move.y;
  gamepadState.moveActive = move.active;
  gamepadState.lookX = aim.active ? clamp(aim.x, -1, 1) : 0;
  gamepadState.lookY = aim.active ? clamp(aim.y, -1, 1) : 0;
  if (frame.active) setInputMode("controller");

  if (aim.active) {
    gamepadState.aimX = aim.x;
    gamepadState.aimZ = aim.y;
  } else if (move.active && gamepadState.inputMode === "controller") {
    gamepadState.aimX = move.x;
    gamepadState.aimZ = move.y;
  }

  if (pressedNow(GAMEPAD_BUTTON.options)) {
    if (state.running) openPauseMenu();
    else if (state.paused && state.pausePanel === "root") resumeRunFromPause();
    else if (state.paused && state.pausePanel === "settings") closePauseSettings();
    else if (state.paused && state.pausePanel === "confirm") closePauseConfirm();
    else if ((isMenuVisible() || state.levelChoice) && menuFocus.targets().length) activateMenuFocus();
  }
  if (pressedNow(GAMEPAD_BUTTON.circle)) {
    if (state.paused && state.pausePanel === "root") resumeRunFromPause();
    else if (state.paused && state.pausePanel === "settings") closePauseSettings();
    else if (state.paused && state.pausePanel === "confirm") closePauseConfirm();
  }
  if (state.paused) {
    handleMenuGamepadNavigation(pressedNow, move);
    if (pressedNow(GAMEPAD_BUTTON.cross)) activateMenuFocus();
  } else if (state.levelChoice) {
    handleMenuGamepadNavigation(pressedNow, move);
    if (pressedNow(GAMEPAD_BUTTON.r1) || pressedNow(GAMEPAD_BUTTON.triangle)) rerollLevelChoices();
    if (pressedNow(GAMEPAD_BUTTON.square)) banishSelectedLevelChoice();
    if (pressedNow(GAMEPAD_BUTTON.cross)) activateMenuFocus();
  } else if (isMenuVisible()) {
    handleMenuGamepadNavigation(pressedNow, move);
    if (pressedNow(GAMEPAD_BUTTON.cross)) activateMenuFocus();
    if (pressedNow(GAMEPAD_BUTTON.r1) && !ui.refreshRoomsButton.disabled) networkClient?.listRooms?.();
  } else if (state.running && pressedNow(GAMEPAD_BUTTON.cross)) {
    attemptPlayerJump();
  }

}

export function clearGamepadState(): void {
  gamepadState.connected = false;
  gamepadState.index = null;
  gamepadState.id = "";
  gamepadState.moveX = 0;
  gamepadState.moveZ = 0;
  gamepadState.moveActive = false;
  gamepadState.lookX = 0;
  gamepadState.lookY = 0;
  gamepadSession.reset();
  gamepadState.stickNavX = false;
  gamepadState.stickNavY = false;
  setInputMode("keyboard");
  updateControllerStatus();
}

export function registerGamepad(gamepad: { index?: number; id?: string }): void {
  gamepadState.connected = true;
  gamepadState.index = gamepad.index ?? 0;
  gamepadState.id = gamepad.id ?? "Gamepad";
  setInputMode("controller");
  updateControllerStatus();
  if (isFocusSurfaceVisible()) setMenuFocus(gamepadState.menuIndex);
}

export function handleMenuGamepadNavigation(pressedNow: (button: number) => boolean, move: MenuMove): void {
  let direction: MenuDirection | null = null;
  if (pressedNow(GAMEPAD_BUTTON.up)) direction = "up";
  if (pressedNow(GAMEPAD_BUTTON.down)) direction = "down";
  if (pressedNow(GAMEPAD_BUTTON.left)) direction = "left";
  if (pressedNow(GAMEPAD_BUTTON.right)) direction = "right";
  if (Math.abs(move.y) > 0.72) {
    if (!direction && !gamepadState.stickNavY) direction = move.y > 0 ? "down" : "up";
    gamepadState.stickNavY = true;
  } else {
    gamepadState.stickNavY = false;
  }
  if (Math.abs(move.x) > 0.72) {
    if (!direction && !gamepadState.stickNavX) direction = move.x > 0 ? "right" : "left";
    gamepadState.stickNavX = true;
  } else {
    gamepadState.stickNavX = false;
  }
  if (direction) moveMenuFocus(direction);
}

export function menuTargets(): HTMLElement[] {
  return focusItems().map((item) => item.element);
}

export function setMenuFocus(index: number): void {
  if (!isFocusSurfaceVisible()) return;
  menuFocus.focus(index);
}

export function moveMenuFocus(direction: MenuDirection): void {
  const items = focusItems();
  if (!items.length) return;
  if (adjustFocusedSetting(direction, items)) return;
  const current = currentFocusItem(items) ?? items[Math.min(gamepadState.menuIndex, items.length - 1)] ?? items[0];
  const next = direction === "left" || direction === "right"
    ? nearestHorizontalFocusItem(items, current, direction)
    : nearestVerticalFocusItem(items, current, direction);
  if (next) focusMenuElement(next.element);
}

export function activateMenuFocus(): void {
  menuFocus.activate();
}

export function clearControllerFocus(): void {
  menuFocus.clear();
}

export function isMenuVisible(): boolean {
  return !ui.menu.classList.contains("hidden");
}

export function isPauseVisible(): boolean {
  return state.paused && !ui.pauseOverlay?.classList.contains("hidden");
}

export function isFocusSurfaceVisible(): boolean {
  return isMenuVisible() || isPauseVisible() || Boolean(state.levelChoice);
}

export function focusItems(): FocusItem[] {
  const items = state.paused ? pauseFocusItems() : state.levelChoice ? levelChoiceFocusItems() : mainMenuFocusItems();
  return items.filter((item) => !item.disabled && isFocusElementAvailable(item.element));
}

export function mainMenuFocusItems(): FocusItem[] {
  if (!isMenuVisible()) return [];
  const items: FocusItem[] = [];
  addFocusItem(items, ui.soloButton, "actions", 0, 0);
  addFocusItem(items, ui.onlineButton, "actions", 0, 1);
  addFocusItem(items, ui.loadoutConfigButton, "actions", 0, 2);
  Array.from(ui.classGrid?.querySelectorAll<HTMLElement>("button") ?? []).forEach((button, index) => addFocusItem(items, button, "classes", 1, index));
  if (state.loadoutPanelOpen) {
    Array.from(ui.loadoutWeaponGrid?.querySelectorAll<HTMLElement>("button") ?? []).forEach((button, index) => addFocusItem(items, button, "loadoutWeapons", 2, index));
    Array.from(ui.loadoutPassiveGrid?.querySelectorAll<HTMLElement>("button") ?? []).forEach((button, index) => addFocusItem(items, button, "loadoutPassives", 3, index));
  }
  const lobbyButtons = [
    ui.createRoomButton,
    ui.startRoomButton,
    ui.refreshRoomsButton,
    ...(ui.roomList?.querySelectorAll<HTMLElement>("button") ?? [])
  ];
  lobbyButtons.forEach((button, index) => addFocusItem(items, button, "lobby", index + 1, 8));
  return items;
}

export function pauseFocusItems(): FocusItem[] {
  if (!isPauseVisible()) return [];
  const items: FocusItem[] = [];
  if (state.pausePanel === "settings") {
    [
      ui.mouseSensitivityInput,
      ui.stickSensitivityInput,
      ui.invertYToggle,
      ui.masterVolumeInput,
      ui.musicVolumeInput,
      ui.sfxVolumeInput,
      ui.muteToggle
    ].forEach((input, index) => addFocusItem(items, input, "settings", index, 0));
    return items;
  }
  if (state.pausePanel === "confirm") {
    addFocusItem(items, ui.pauseConfirmLeaveButton, "confirm", 0, 0);
    addFocusItem(items, ui.pauseConfirmCancelButton, "confirm", 0, 1);
    return items;
  }
  addFocusItem(items, ui.pauseResumeButton, "pause", 0, 0);
  addFocusItem(items, ui.pauseSettingsButton, "pause", 0, 1);
  addFocusItem(items, ui.pauseMainMenuButton, "pause", 0, 2);
  return items;
}

export function levelChoiceFocusItems(): FocusItem[] {
  const items: FocusItem[] = [];
  Array.from(ui.levelChoiceGrid?.querySelectorAll<HTMLElement>("button") ?? []).forEach((button, index) => addFocusItem(items, button, "levelChoice", 0, index));
  addFocusItem(items, ui.levelChoiceRerollButton, "levelChoice", 1, 0);
  addFocusItem(items, ui.levelChoiceBanishButton, "levelChoice", 1, 1);
  return items;
}

export function addFocusItem(
  items: FocusItem[],
  element: HTMLElement | null | undefined,
  zone: FocusItem["zone"],
  row: number,
  col: number,
  disabled = false
): void {
  if (!element) return;
  items.push({ element, zone, row, col, disabled });
}

export function isFocusElementAvailable(element: HTMLElement | null | undefined): boolean {
  if (!element || !element.isConnected) return false;
  if ((element instanceof HTMLButtonElement || element instanceof HTMLInputElement) && element.disabled) return false;
  if (element.closest?.(".hidden")) return false;
  const style = globalThis.getComputedStyle?.(element);
  if (style && (style.display === "none" || style.visibility === "hidden")) return false;
  return (element.getClientRects?.().length ?? 0) > 0;
}

export function currentFocusItem(items: FocusItem[]): FocusItem | null {
  const active = document.activeElement;
  const focused = active ? items.find((item) => item.element === active) : null;
  if (focused) return focused;
  const byClass = items.find((item) => item.element.classList.contains("controller-focus"));
  return byClass ?? null;
}

export function focusMenuElement(element: HTMLElement): void {
  const targets = menuTargets();
  const index = targets.indexOf(element);
  if (index >= 0) menuFocus.focus(index);
}

export function nearestHorizontalFocusItem(items: FocusItem[], current: FocusItem, direction: "left" | "right"): FocusItem | null {
  const sign = direction === "right" ? 1 : -1;
  const candidates = items
    .filter((item) => item.row === current.row && (item.col - current.col) * sign > 0)
    .sort((a, b) => Math.abs(a.col - current.col) - Math.abs(b.col - current.col));
  return candidates[0] ?? null;
}

export function nearestVerticalFocusItem(items: FocusItem[], current: FocusItem, direction: "up" | "down"): FocusItem | null {
  const sign = direction === "down" ? 1 : -1;
  const rows = [...new Set(items.map((item) => item.row))]
    .filter((row) => (row - current.row) * sign > 0)
    .sort((a, b) => Math.abs(a - current.row) - Math.abs(b - current.row));
  for (const row of rows) {
    const candidates = items
      .filter((item) => item.row === row)
      .sort((a, b) => Math.abs(a.col - current.col) - Math.abs(b.col - current.col));
    if (candidates[0]) return candidates[0];
  }
  return null;
}

export function adjustFocusedSetting(direction: MenuDirection, items: FocusItem[]): boolean {
  if (!state.paused || state.pausePanel !== "settings" || (direction !== "left" && direction !== "right")) return false;
  const current = currentFocusItem(items);
  const element = current?.element;
  if (!(element instanceof HTMLInputElement) || element.type !== "range") return false;
  const step = Number(element.step) || 0.05;
  const min = Number(element.min) || 0;
  const max = Number(element.max) || 1;
  const next = clamp((Number(element.value) || 0) + (direction === "right" ? step : -step), min, max);
  element.value = String(roundToStep(next, step));
  element.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

export function setInputMode(mode: ArenaGamepadState["inputMode"]): void {
  if (gamepadState.inputMode === mode) return;
  gamepadState.inputMode = mode;
  updateControlHint();
  if (mode === "keyboard") clearControllerFocus();
  if (mode === "controller" && isFocusSurfaceVisible()) setMenuFocus(gamepadState.menuIndex);
}

export function updateControllerStatus(): void {
  if (!ui.controllerStatus) return;
  if (!gamepadState.connected) {
    ui.controllerStatus.textContent = "Controller line idle. Connect a pad any time.";
    return;
  }
  const label = /dualsense|dualshock|wireless controller|ps5/i.test(gamepadState.id) ? "PS5 controller" : "Controller";
  ui.controllerStatus.textContent = `${label} has the run.`;
}

export function updateControlHint(): void {
  if (!ui.controlHint) return;
  ui.controlHint.textContent = state.paused
    ? "PS5: Cross select, Circle back, Start resume."
    : CONTROL_HINTS[gamepadState.inputMode] ?? CONTROL_HINTS.keyboard;
}

export function updateControllerAim(x: number, z: number): void {
  if (!state.player) return;
  setAimWorld(state.player.x + x * CAMERA_AIM_DISTANCE, state.player.z + z * CAMERA_AIM_DISTANCE);
  syncReticleToAimWorld();
}

export function resetCameraState(yaw = 0, pitch = CAMERA_DEFAULT_PITCH, distance = CAMERA_BASE_DISTANCE): void {
  cameraContext.desiredYaw = yaw;
  cameraContext.desiredPitch = clamp(pitch, CAMERA_MIN_PITCH, CAMERA_MAX_PITCH);
  cameraContext.desiredDistance = clamp(distance, CAMERA_MIN_DISTANCE, CAMERA_MAX_DISTANCE);
  cameraContext.yaw = desiredCameraYaw;
  cameraContext.pitch = desiredCameraPitch;
  cameraContext.distance = desiredCameraDistance;
}

export function resolveCameraOffset(): Three.Vector3 {
  const pitchCos = Math.cos(cameraPitch);
  return tempCameraOffset.set(
    Math.sin(cameraYaw) * pitchCos * cameraDistance,
    Math.sin(cameraPitch) * cameraDistance,
    Math.cos(cameraYaw) * pitchCos * cameraDistance
  );
}

export function dampCameraRigState(dt: number): void {
  const rotationAmount = dampingAmount(dt, CAMERA_ROTATION_SMOOTHING_SECONDS);
  const distanceAmount = dampingAmount(dt, CAMERA_DISTANCE_SMOOTHING_SECONDS);
  cameraContext.yaw = cameraYaw + shortestAngleDelta(cameraYaw, desiredCameraYaw) * rotationAmount;
  cameraContext.pitch = cameraPitch + (desiredCameraPitch - cameraPitch) * rotationAmount;
  cameraContext.distance = cameraDistance + (desiredCameraDistance - cameraDistance) * distanceAmount;
}

export function dampingAmount(dt: number, smoothingSeconds: number): number {
  if (smoothingSeconds <= 0) return 1;
  return 1 - Math.exp(-dt / smoothingSeconds);
}

export function shortestAngleDelta(from: number, to: number): number {
  return ((((to - from + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}

export function readCameraRigSnapshot(): CameraRigSnapshot | null {
  if (!cameraRig) return null;
  cameraRig.getDesiredPosition(tempCameraDesired);
  return {
    lookAt: [tempCameraTarget.x, tempCameraTarget.y + CAMERA_LOOK_AT_HEIGHT, tempCameraTarget.z],
    desiredPosition: [tempCameraDesired.x, tempCameraDesired.y, tempCameraDesired.z],
    position: [camera.position.x, camera.position.y, camera.position.z],
    yaw: cameraYaw,
    pitch: cameraPitch,
    distance: cameraDistance,
    blocked: cameraBlocked
  };
}

export function orbitCameraFromMouse(event: PointerEvent): void {
  if (!cameraRig) return;
  const sensitivity = state.settings.mouseSensitivity;
  const pitchSign = state.settings.invertY ? -1 : 1;
  const yawDelta = -(event.movementX ?? 0) * CAMERA_MOUSE_YAW_SPEED * sensitivity;
  const pitchDelta = (event.movementY ?? 0) * CAMERA_MOUSE_PITCH_SPEED * sensitivity * pitchSign;
  cameraContext.desiredYaw = desiredCameraYaw + yawDelta;
  cameraContext.desiredPitch = clamp(desiredCameraPitch + pitchDelta, CAMERA_MIN_PITCH, CAMERA_MAX_PITCH);
}
