import { canvasPointFromClient } from "@hyperfocus/engine";
import { connectAuthoritative, type AuthoritativeClient } from "@hyperfocus/engine/net";
import { applyEngineUiTheme, showHtmlDialog } from "@hyperfocus/engine/ui";
import {
  createAssetLoadSnapshot,
  createCanvasAssetLoader,
  createSmoothedAssetProgress,
  runAssetLoaderRafLoop,
  type AssetLoadSnapshot
} from "@hyperfocus/engine/assets/loader";
import { attachMmoEntityViews } from "../shared-entity-registry.ts";
import { hasInventoryItem, hasQuestFlag } from "../shared-loadout.ts";
import { mmoSkillDemoMultipartCodec } from "../segmented-replication.ts";
import { type MmoSkillDemoInput, type MmoSkillDemoState, type PlayerEntity } from "../shared-contracts.ts";
import { clientImageSources } from "../data/assets.ts";
import { getMmoSkillDemoAnchorTile } from "../data/world.ts";
import { loadImages } from "./assets.ts";
import { energyMax, energyValue, slotCooldownMs, type CombatSlot } from "./combat-view.ts";
import { DEFAULT_CONTROLLER_DEADZONE, controllerAimOffset, controllerInputFromGamepad, createHeldNpcInteractionGate, createMmoSkillControllerSession, currentInput, type ControllerInputFrame } from "./input.ts";
import { createMmoStateInterpolator } from "./interpolation.ts";
import { applyLocalPrediction, createLocalPredictionState } from "./local-prediction.ts";
import { setupUi } from "./live-ui.ts";
import { abilityNameForSlot, fieldSlotReveal } from "./live-ui-model.ts";
import { createRenderer } from "./render.ts";
import { createNpcMenuLayer } from "./render/ui/npc-menu-layer.ts";
import { mmoSkillDemoInputCodec } from "../input-codec.ts";
import { mmoSkillDemoSchema as mmoSkillDemoClientSchema } from "../schema.ts";
import { createSfx } from "./sfx.ts";
import { buildTiles, TILE } from "./world.ts";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`MMO Skill Demo client markup is missing ${selector}.`);
  return element;
}

const canvas = requiredElement<HTMLCanvasElement>("#game");
const main = document.querySelector<HTMLElement>("main");
const status = requiredElement<HTMLElement>("#status");
const login = requiredElement<HTMLElement>("#login");
const loginForm = requiredElement<HTMLFormElement>("#login-form");
const characterName = requiredElement<HTMLInputElement>("#character-name");
const uiRoot = requiredElement<HTMLElement>("#ui");
const clientLog = document.querySelector<HTMLElement>("#client-log");

applyEngineUiTheme(document.documentElement, {
  surface: "#11160f",
  surfaceAlt: "#162012",
  border: "rgba(128, 150, 92, 0.72)",
  accent: "#e2c15f",
  accentText: "#161b11",
  text: "#f5f3e8",
  muted: "#dfe6ca",
  danger: "#ff9b72",
  success: "#a6d97b",
  focusRing: "rgba(243, 223, 145, 0.44)",
  controlSurface: "#26361f",
  controlSurfaceHover: "#e2c15f",
  controlBorder: "#667a4f",
  controlText: "#f5f3e8",
  inputSurface: "#10160e",
  radius: "4px",
  shadow: "0 12px 28px rgba(0, 0, 0, 0.36)"
});

login.hidden = true;
status.textContent = "Loading world art...";
main?.classList.add("is-boot-loading");

const keys = new Set<string>();
const params = new URLSearchParams(location.search);
const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""));
const inferredWsPort = location.port ? String(Math.max(1, Number(location.port) - 1)) : "8791";
const serverUrl = params.get("ws") || `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:${inferredWsPort}`;
const roomId = params.get("room") || undefined;
const roomType = params.get("type") || (roomId?.includes("dungeon") ? "mmo-skill-demo-dungeon" : roomId?.includes("cottage") ? "mmo-skill-demo-cottage" : "mmo-skill-demo");
const showDevCheats = params.get("dev") === "1";
const showTelemetry = params.get("telemetry") === "1" || params.get("debug") === "1";
const captureAreaId = params.get("area") ?? hashParams.get("area") ?? "";
const captureAreaTile = captureAreaId ? (() => {
  try {
    return getMmoSkillDemoAnchorTile(captureAreaId);
  } catch {
    return undefined;
  }
})() : undefined;
function numericParam(name: string) {
  const raw = params.get(name) ?? hashParams.get(name);
  if (raw === null) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}
const captureTileX = numericParam("tileX");
const captureTileY = numericParam("tileY");
const captureWorldX = numericParam("cameraX") ?? numericParam("x") ?? (captureTileX === undefined ? undefined : captureTileX * TILE + TILE * 0.5);
const captureWorldY = numericParam("cameraY") ?? numericParam("y") ?? (captureTileY === undefined ? undefined : captureTileY * TILE + TILE * 0.5);
const captureCameraPoint = captureAreaTile
  ? { x: captureAreaTile.x * TILE + TILE * 0.5, y: captureAreaTile.y * TILE + TILE * 0.5 }
  : captureWorldX !== undefined && captureWorldY !== undefined
    ? { x: captureWorldX, y: captureWorldY }
    : undefined;
const captureMapOpen = params.get("map") === "1" || hashParams.get("map") === "1";
const INPUT_SEND_INTERVAL_MS = 50;
const CONTROLLER_DEADZONE_STORAGE_KEY = "mmo-skill-demo.controllerDeadzone";

function readControllerDeadzone() {
  localStorage.setItem(CONTROLLER_DEADZONE_STORAGE_KEY, DEFAULT_CONTROLLER_DEADZONE.toFixed(3));
  return DEFAULT_CONTROLLER_DEADZONE;
}

let controllerDeadzone = readControllerDeadzone();

function setControllerDeadzone(value: number) {
  void value;
  controllerDeadzone = DEFAULT_CONTROLLER_DEADZONE;
  localStorage.setItem(CONTROLLER_DEADZONE_STORAGE_KEY, controllerDeadzone.toFixed(3));
  inputDirty = true;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.stack || error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function logClientError(label: string, error: unknown) {
  const text = `[${new Date().toLocaleTimeString()}] ${label}: ${errorMessage(error)}`;
  console.error(text);
  status.hidden = false;
  status.textContent = text;
  if (!clientLog) return;
  clientLog.hidden = false;
  clientLog.textContent = `${text}\n${clientLog.textContent ?? ""}`.slice(0, 6000);
}

window.addEventListener("error", (event) => {
  logClientError("client error", event.error ?? event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  logClientError("client rejection", event.reason);
});

const sfx = createSfx();
const bootCanvas = createCanvasAssetLoader(canvas, {
  title: "MMO Skill Demo",
  subtitle: "Loading world art"
});
const bootSmoother = createSmoothedAssetProgress({ speed: 6.8, completeSpeed: 13, minAdvancePerSecond: 0.04 });
let bootSnapshot: AssetLoadSnapshot = createAssetLoadSnapshot({
  status: "loading",
  total: Object.keys(clientImageSources).length,
  label: "Loading world art",
  activeLabel: "Finding sprites",
  startedAt: performance.now(),
  updatedAt: performance.now()
});
const bootLoop = runAssetLoaderRafLoop({
  read: () => bootSnapshot,
  smoother: bootSmoother,
  render: (snapshot) => bootCanvas.render(snapshot)
});
const images = await loadImages(clientImageSources, {
  onSnapshot(snapshot) {
    bootSnapshot = snapshot;
  }
});
bootSnapshot = {
  ...bootSnapshot,
  status: "loaded",
  label: "World art ready",
  activeLabel: "World art ready",
  actualProgress: 1,
  visibleProgress: 1,
  updatedAt: performance.now()
};
bootSmoother.set(1);
bootCanvas.render(bootSnapshot);
bootLoop.stop();
main?.classList.remove("is-boot-loading");
login.hidden = false;
const travelTransition = createTravelTransition(canvas);

let authoritative: MmoSkillDemoState = {
  tick: 0,
  mapRevision: "",
  roomKind: "world-zone",
  roomLabel: "Shared World Zones",
  activePlayers: 0,
  worldEventId: "ashwood-pack",
  worldEventName: "Ashwood Pack Rally",
  worldEventZoneId: "ashwood",
  worldEventPhase: "active",
  worldEventObjective: "Cull wolves or finish Ashwood cuts before the pack regroups.",
  worldEventProgress: 0,
  worldEventGoal: 12,
  worldEventTimerMs: 180000,
  worldEventReward: "+18 gold +28 renown +combat XP",
  effects: [],
  entities: {},
  players: {},
  npcs: {},
  resources: {},
  loots: {},
  hazards: {}
};
let client: AuthoritativeClient<MmoSkillDemoState> | undefined;
const interpolator = createMmoStateInterpolator();
let queuedUiInput: MmoSkillDemoInput | undefined;
let lastInputSentMs = Number.NEGATIVE_INFINITY;
let inputDirty = true;
let travelInputPending = false;
let travelInputBlockedUntilMs = Number.NEGATIVE_INFINITY;
const denialReadbackAt = new Map<string, number>();
const mouse = { x: canvas.width * 0.5, y: canvas.height * 0.5, active: false };
let controllerFrame: ControllerInputFrame = controllerInputFromGamepad(undefined);
const controllerSession = createMmoSkillControllerSession();
let controllerSignature = "";
let controllerPreferred = false;
let pointerHiddenForController = false;
const localPrediction = createLocalPredictionState();
const heldNpcInteractionGate = createHeldNpcInteractionGate();
const renderer = createRenderer(canvas, status, images, buildTiles(), () => client?.getDebugSnapshot().playerId, sfx);
let minimapOpen = true;
let worldMapOpen = captureMapOpen;
function queueStructuredUiInput(input: MmoSkillDemoInput) {
  queuedUiInput = input;
  inputDirty = true;
}
let closeNpcMenus = () => {};
const ui = setupUi(uiRoot, showDevCheats, queueStructuredUiInput, async (label, apply) => {
  if (!(await confirmTravelDialog("Travel", `Travel to ${label}?`, "Travel"))) return;
  travelTransition.play(`Traveling to ${label}`, apply);
}, () => {
  closeNpcMenus();
  worldMapOpen = true;
  inputDirty = true;
}, () => controllerDeadzone, setControllerDeadzone, () => {
  closeNpcMenus();
});
const npcMenus = createNpcMenuLayer(main ?? canvas.parentElement ?? document.body, {
  queueInput: queueStructuredUiInput,
  closeUtilityPanels: () => ui.open("")
});
closeNpcMenus = () => npcMenus.close();

function ownPlayer(state: MmoSkillDemoState, playerId = client?.getDebugSnapshot().playerId) {
  return playerId ? state.players?.[playerId] : undefined;
}

function syncControllerPointerVisibility() {
  if (pointerHiddenForController === controllerPreferred) return;
  pointerHiddenForController = controllerPreferred;
  const cursor = controllerPreferred ? "none" : "";
  document.documentElement.style.cursor = cursor;
  document.body.style.cursor = cursor;
  canvas.style.cursor = cursor;
}

function preferMouseInput() {
  if (!controllerPreferred && !pointerHiddenForController) return;
  controllerPreferred = false;
  syncControllerPointerVisibility();
  inputDirty = true;
}

const savedName = localStorage.getItem("mmo-skill-demo.characterName") ?? "";
characterName.value = savedName;
status.textContent = savedName ? `Ready for ${savedName}. Log in to continue.` : "Enter a character name to log in.";

async function connectAs(rawName: string) {
  const name = rawName.trim().replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 24);
  if (!name) return;
  localStorage.setItem("mmo-skill-demo.characterName", name);
  login.hidden = true;
  status.textContent = "Connecting...";
  interpolator.reset();
  client = connectAuthoritative<MmoSkillDemoState>({
    url: serverUrl,
    token: `dev:${name}`,
    roomId,
    roomType,
    schema: mmoSkillDemoClientSchema,
    multipartCodec: mmoSkillDemoMultipartCodec,
    inputCodec: mmoSkillDemoInputCodec
  });
  let lastObservedFrame = "";
  function applyAuthoritativeState(state: MmoSkillDemoState, meta: { kind: string; sequence: number }) {
    authoritative = attachMmoEntityViews(state);
    const frameKey = `${meta.kind}:${meta.sequence}:${state.tick}`;
    if (frameKey === lastObservedFrame) return;
    lastObservedFrame = frameKey;
    interpolator.observe(authoritative, performance.now());
  }
  client.onSnapshot((state, meta) => applyAuthoritativeState(state, meta));
  client.onDelta((state, meta) => applyAuthoritativeState(state, meta));
  client.onMessage((message) => {
    if (message.type === "server_welcome") {
      const tickRate = message.payload && typeof message.payload === "object" ? Reflect.get(message.payload, "tickRate") : undefined;
      if (typeof tickRate === "number") interpolator.setServerTickRate(tickRate);
    }
    if (message.type === "join_rejected" || message.type === "error") logClientError(message.type, message.payload);
  });
  try {
    await client.connect();
    status.hidden = !showTelemetry;
    if (!showTelemetry) status.textContent = "";
    ui.open(params.get("panel") ?? "");
  } catch (error) {
    login.hidden = false;
    logClientError("connect failed", error);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  sfx.unlock();
  await connectAs(characterName.value).catch((error) => logClientError("login failed", error));
});

if (params.has("login")) {
  await connectAs(params.get("login") || savedName || "dev").catch((error) => logClientError("auto login failed", error));
}

window.addEventListener("keydown", (event) => {
  sfx.unlock();
  preferMouseInput();
  if (npcMenus.handleKeyboard(event)) {
    inputDirty = true;
    return;
  }
  if (event.code === "Escape" && worldMapOpen) {
    worldMapOpen = false;
    inputDirty = true;
    event.preventDefault();
    return;
  }
  if (event.code === "KeyN" || event.code === "KeyM") {
    toggleMapOverlay(event.code);
    event.preventDefault();
  }
  if (!keys.has(event.code)) inputDirty = true;
  keys.add(event.code);
  maybeShowAbilityDenialForAction(actionForKeyCode(event.code), ownPlayer(authoritative), currentWorldAim(ownPlayer(authoritative)), performance.now());
});
window.addEventListener("keyup", (event) => {
  if (keys.delete(event.code)) inputDirty = true;
  if (event.code === "KeyZ") heldNpcInteractionGate.release();
});
window.addEventListener("gamepadconnected", () => {
  inputDirty = true;
});
window.addEventListener("gamepaddisconnected", () => {
  controllerSession.reset();
  controllerFrame = controllerInputFromGamepad(undefined);
  controllerSignature = controllerInputSignature(controllerFrame);
  controllerPreferred = false;
  syncControllerPointerVisibility();
  inputDirty = true;
});
window.addEventListener("mousemove", (event) => {
  if (event.movementX !== 0 || event.movementY !== 0 || pointerHiddenForController) preferMouseInput();
});
canvas.addEventListener("mousedown", (event) => {
  sfx.unlock();
  const point = canvasPointFromClient(canvas, event.clientX, event.clientY);
  mouse.x = point.x;
  mouse.y = point.y;
  mouse.active = true;
  preferMouseInput();
  if (event.button === 0 && !keys.has("Mouse0")) {
    keys.add("Mouse0");
    inputDirty = true;
    maybeShowAbilityDenialForAction("lmb", ownPlayer(authoritative), currentWorldAim(ownPlayer(authoritative)), performance.now());
  }
  if (event.button === 2 && !keys.has("Mouse2")) {
    keys.add("Mouse2");
    inputDirty = true;
    maybeShowAbilityDenialForAction("rmb", ownPlayer(authoritative), currentWorldAim(ownPlayer(authoritative)), performance.now());
  }
});
canvas.addEventListener("mousemove", (event) => {
  const point = canvasPointFromClient(canvas, event.clientX, event.clientY);
  mouse.x = point.x;
  mouse.y = point.y;
  mouse.active = true;
  preferMouseInput();
});
window.addEventListener("mouseup", (event) => {
  if (event.button === 0 && keys.delete("Mouse0")) inputDirty = true;
  if (event.button === 2 && keys.delete("Mouse2")) inputDirty = true;
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

function controllerInputSignature(frame: ControllerInputFrame) {
  const keysText = [...frame.keys].sort().join(",");
  const aimX = frame.aimOffset?.x ?? 0;
  const aimY = frame.aimOffset?.y ?? 0;
  return `${keysText}:${frame.movement.dx.toFixed(2)}:${frame.movement.dy.toFixed(2)}:${aimX.toFixed(1)}:${aimY.toFixed(1)}`;
}

function mergedInputKeys() {
  if (controllerFrame.keys.size <= 0) return keys;
  return new Set([...keys, ...controllerFrame.keys]);
}

function pollController(timeMs: number) {
  const previous = controllerFrame;
  const sample = controllerSession.poll({ deadzone: controllerDeadzone });
  const gamepad = sample.gamepad;
  const next = sample.frame;
  const signature = controllerInputSignature(next);
  if (signature !== controllerSignature) inputDirty = true;
  if (next.active) {
    controllerPreferred = true;
    syncControllerPointerVisibility();
  }
  controllerFrame = next;
  controllerSignature = signature;
  if (npcMenus.isActive()) {
    const handledFrameCommand =
      !previous.keys.has("Space") && next.keys.has("Space")
        ? npcMenus.handleControllerCommand("confirm")
        : !previous.keys.has("KeyR") && next.keys.has("KeyR")
          ? npcMenus.handleControllerCommand("back")
          : false;
    if (!handledFrameCommand) npcMenus.handleController(gamepad, timeMs);
    inputDirty = true;
    return;
  }
  if (!previous.keys.has("KeyN") && next.keys.has("KeyN")) toggleMapOverlay("KeyN");
  if (!previous.keys.has("KeyM") && next.keys.has("KeyM")) toggleMapOverlay("KeyM");
  for (const code of next.keys) {
    if (!previous.keys.has(code)) {
      maybeShowAbilityDenialForAction(actionForKeyCode(code), ownPlayer(authoritative), currentWorldAim(ownPlayer(authoritative)), timeMs);
    }
  }
}

function toggleMapOverlay(code: string) {
  if (code === "KeyN") {
    closeNpcMenus();
    minimapOpen = !minimapOpen;
    inputDirty = true;
    return;
  }
  if (code === "KeyM") {
    closeNpcMenus();
    worldMapOpen = !worldMapOpen;
    inputDirty = true;
  }
}

function controllerWorldAim(player: PlayerEntity | undefined) {
  const offset = controllerAimOffset(controllerFrame);
  return player && offset ? { x: player.x + offset.x, y: player.y + offset.y } : undefined;
}

function frame(timeMs: number) {
  pollController(timeMs);
  const debug = client?.getDebugSnapshot();
  const playerId = debug?.playerId;
  const rawPlayer = ownPlayer(authoritative, playerId);
  const visualState = interpolator.sample(authoritative, timeMs, playerId);
  let visualPlayer = ownPlayer(visualState, playerId);
  const cam = renderer.camera(visualPlayer);
  const aim = controllerWorldAim(rawPlayer) ?? (!controllerPreferred && mouse.active ? { x: cam.x + mouse.x, y: cam.y + mouse.y } : rawPlayer ? { x: rawPlayer.aimX, y: rawPlayer.aimY } : undefined);
  const menuActive = npcMenus.isActive();
  const inputKeys = menuActive ? new Set<string>() : mergedInputKeys();
  const liveInput = applyFieldSlotReveal(
    heldNpcInteractionGate.apply(currentInput(inputKeys, rawPlayer, authoritative, aim, menuActive ? { dx: 0, dy: 0 } : controllerFrame.movement), authoritative, inputKeys.has("KeyZ")),
    rawPlayer,
    aim,
    timeMs
  );
  if (client && (queuedUiInput || inputDirty || timeMs - lastInputSentMs >= INPUT_SEND_INTERVAL_MS)) {
    const input = queuedUiInput ?? liveInput;
    const queued = Boolean(queuedUiInput);
    if (!queued && inputDirty) maybeShowAbilityDenial(input, rawPlayer, aim, timeMs);
    if (!queued && confirmLongTravelInput(input, rawPlayer, authoritative, timeMs)) {
      inputDirty = false;
      lastInputSentMs = timeMs;
    } else {
      client.sendInput(input);
      queuedUiInput = undefined;
      inputDirty = false;
      lastInputSentMs = timeMs;
    }
  }
  visualPlayer = applyLocalPrediction(localPrediction, visualPlayer, rawPlayer, liveInput, authoritative, timeMs);
  if (ui.needsUpdate(rawPlayer, authoritative)) {
    ui.update(rawPlayer, authoritative);
  }
  npcMenus.update(authoritative, rawPlayer, controllerPreferred ? "controller" : "keyboard", timeMs, liveInput);
  if (uiRoot.hidden !== worldMapOpen) uiRoot.hidden = worldMapOpen;
  canvas.parentElement?.classList.toggle("is-map-open", worldMapOpen);
  const interpDebug = interpolator.debug();
  renderer.drawFrame(
    visualState,
    visualPlayer,
    {
      ...debug,
      connected: Boolean(client),
      interpDelayMs: Math.round(interpDebug.delayMs),
      interpBufferedFrames: interpDebug.bufferedFrames,
      interpMode: interpDebug.mode,
      telemetry: showTelemetry,
      inputDevice: controllerPreferred ? "controller" : "keyboard",
      inputAction: liveInput.action,
      rawAbility: rawPlayer?.activeAbility ?? "",
      rawSlot: rawPlayer?.activeSlot ?? "",
      rawChargeMs: rawPlayer?.chargeMs ?? 0,
      rawActiveMs: rawPlayer?.activeMs ?? 0,
      visualAbility: visualPlayer?.activeAbility ?? "",
      visualSlot: visualPlayer?.activeSlot ?? "",
      visualChargeMs: visualPlayer?.chargeMs ?? 0,
      visualActiveMs: visualPlayer?.activeMs ?? 0,
      stateEffects: visualState.effects?.length ?? 0,
      stateHazards: Object.keys(visualState.hazards ?? {}).length,
      minimapOpen,
      worldMapOpen,
      cameraX: captureCameraPoint?.x ?? 0,
      cameraY: captureCameraPoint?.y ?? 0,
      captureArea: captureAreaTile ? captureAreaId : captureCameraPoint ? "camera" : ""
    },
    timeMs,
    aim,
    !controllerPreferred && mouse.active ? { x: mouse.x, y: mouse.y } : undefined,
    controllerPreferred ? 0.28 : undefined,
    { minimapOpen, worldMapOpen }
  );
  if (captureCameraPoint) document.body.dataset.captureReady = captureAreaId || `${Math.round(captureCameraPoint.x)},${Math.round(captureCameraPoint.y)}`;
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

const ACTION_SLOT: Partial<Record<NonNullable<MmoSkillDemoInput["action"]>, CombatSlot>> = {
  attack: "LMB",
  lmb: "LMB",
  rmb: "RMB",
  space: "Space",
  q: "Q",
  e: "E",
  r: "R"
};



function actionForKeyCode(code: string): MmoSkillDemoInput["action"] | "" {
  if (code === "Mouse0") return "lmb";
  if (code === "Mouse2") return "rmb";
  if (code === "Digit1") return "lmb";
  if (code === "Digit2") return "rmb";
  if (code === "Space") return "space";
  if (code === "KeyQ") return "q";
  if (code === "KeyE") return "e";
  if (code === "KeyR") return "r";
  return "";
}

function currentWorldAim(player: PlayerEntity | undefined) {
  const controllerAim = controllerWorldAim(player);
  if (controllerAim) return controllerAim;
  if (!controllerPreferred && mouse.active) {
    const cam = renderer.camera(player);
    return { x: cam.x + mouse.x, y: cam.y + mouse.y };
  }
  return player ? { x: player.aimX, y: player.aimY } : undefined;
}

function maybeShowAbilityDenial(input: MmoSkillDemoInput, player: PlayerEntity | undefined, aim: { x: number; y: number } | undefined, timeMs: number) {
  maybeShowAbilityDenialForAction(input.action, player, aim, timeMs);
}

function maybeShowAbilityDenialForAction(action: MmoSkillDemoInput["action"] | "", player: PlayerEntity | undefined, aim: { x: number; y: number } | undefined, timeMs: number) {
  if (!player || !aim) return;
  const slot = action ? ACTION_SLOT[action] : undefined;
  if (!slot) return;
  const name = abilityNameForSlot(player, slot);
  const reveal = fieldSlotReveal(player, slot);
  const cooldownMs = slotCooldownMs(player, slot);
  let text = "";
  if (!reveal.unlocked) {
    text = `${slot} - ${reveal.hint}`;
  } else if (cooldownMs > 0) {
    text = `${name} - ${(Math.round(cooldownMs / 100) / 10).toFixed(1)}s`;
  } else if (slot === "R") {
    const needed = Math.max(0, Math.ceil(energyMax(player) - energyValue(player)));
    if (needed > 0) text = `${name} needs ${needed} more energy`;
  }
  if (!text) return;
  const key = `${slot}:${text}`;
  if ((denialReadbackAt.get(key) ?? Number.NEGATIVE_INFINITY) + 450 > timeMs) return;
  denialReadbackAt.set(key, timeMs);
  renderer.pushFloat(text, aim.x, aim.y - 18, "#fff3b8", timeMs, 12);
}

function applyFieldSlotReveal(input: MmoSkillDemoInput, player: PlayerEntity | undefined, aim: { x: number; y: number } | undefined, timeMs: number): MmoSkillDemoInput {
  const slot = input.action ? ACTION_SLOT[input.action] : undefined;
  if (!player || !slot || fieldSlotReveal(player, slot).unlocked) return input;
  maybeShowAbilityDenialForAction(input.action, player, aim, timeMs);
  return { ...input, action: "idle", targetId: "" };
}

function createTravelTransition(targetCanvas: HTMLCanvasElement) {
  const overlay = document.createElement("div");
  overlay.style.position = "absolute";
  overlay.style.inset = "18px";
  overlay.style.display = "grid";
  overlay.style.placeItems = "center";
  overlay.style.background = "#000";
  overlay.style.color = "#f5f3e8";
  overlay.style.font = "800 18px Inter, ui-sans-serif, system-ui, sans-serif";
  overlay.style.letterSpacing = "0";
  overlay.style.opacity = "0";
  overlay.style.pointerEvents = "none";
  overlay.style.transition = "opacity 260ms ease";
  overlay.style.zIndex = "4";
  targetCanvas.style.transition = "filter 260ms ease";
  targetCanvas.parentElement?.append(overlay);

  return {
    play(label: string, atBlack: () => void) {
      overlay.textContent = label;
      targetCanvas.style.filter = "blur(5px)";
      overlay.style.opacity = "1";
      setTimeout(atBlack, 320);
      setTimeout(() => {
        overlay.style.opacity = "0";
        targetCanvas.style.filter = "";
      }, 880);
    }
  };
}

function longTravelNpc(input: MmoSkillDemoInput, state: MmoSkillDemoState) {
  if (input.action !== "interact" && input.action !== "travel") return undefined;
  const target = input.targetId ? state.npcs?.[input.targetId] : undefined;
  if (target?.kind === "captain-marrow") return target;
  if (input.action !== "travel" || target) return undefined;
  return Object.values(state.npcs ?? {}).find((npc) => npc.kind === "captain-marrow");
}

function confirmLongTravelInput(input: MmoSkillDemoInput, player: PlayerEntity | undefined, state: MmoSkillDemoState, timeMs: number) {
  if (!player) return false;
  if (travelInputPending || timeMs < travelInputBlockedUntilMs) return true;
  const npc = longTravelNpc(input, state);
  if (!npc) return false;
  const confirmedInput = { ...input };
  travelInputPending = true;
  travelInputBlockedUntilMs = timeMs + 1200;
  void chooseCaptainRouteDialog(player).then((choice) => {
    if (!choice) {
      travelInputPending = false;
      travelInputBlockedUntilMs = performance.now() + 900;
      return;
    }
    confirmedInput.devText = choice.value;
    travelTransition.play(choice.label, () => {
      queuedUiInput = confirmedInput;
      inputDirty = true;
      travelInputPending = false;
    });
  }).catch(() => {
    travelInputPending = false;
    travelInputBlockedUntilMs = performance.now() + 900;
  });
  return true;
}

type TravelRouteChoice = {
  value: string;
  label: string;
  disabled?: boolean;
  title?: string;
};

function captainRouteChoices(player: PlayerEntity): TravelRouteChoice[] {
  if (player.zoneId === "port-marrow") {
    const readyForVoid = hasInventoryItem(player, "void-resistant-cloak") || hasQuestFlag(player, "seal-the-rift") || player.masteryRank >= 4;
    return [
      { value: "ashwood", label: "Ashwood" },
      { value: "void-rift", label: "Void Rift", disabled: !readyForVoid, title: readyForVoid ? "Travel to Void Rift" : "Requires Void route prep" }
    ];
  }
  if (player.zoneId === "ashwood") return [{ value: "ironcrag", label: "Ironcrag" }];
  return [{ value: "aetheria", label: "Aetheria" }];
}

async function chooseCaptainRouteDialog(player: PlayerEntity): Promise<TravelRouteChoice | undefined> {
  const choices = captainRouteChoices(player);
  const result = await showHtmlDialog({
    title: "Travel with Captain Marrow",
    content: `${choices.map((choice) => choice.label).join(" or ")} or Cancel`,
    buttons: [
      ...choices.map((choice) => ({
        value: choice.value,
        label: choice.label,
        disabled: choice.disabled,
        title: choice.title
      })),
      { value: "cancel", label: "Cancel" }
    ]
  });
  if (result.value === "cancel") return undefined;
  return choices.find((choice) => choice.value === result.value);
}

async function confirmTravelDialog(title: string, content: string, confirmLabel: string) {
  const result = await showHtmlDialog({
    title,
    content,
    buttons: [
      { value: "cancel", label: "Cancel" },
      { value: "confirm", label: confirmLabel }
    ]
  });
  return result.value === "confirm";
}
