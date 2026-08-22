import { canvasPointFromClient } from "@hyperfocus/engine";
import { connectAuthoritative, type AuthoritativeClient } from "@hyperfocus/engine/net";
import { applyEngineUiTheme, createMmoUiShell, showHtmlDialog, type MmoUiInventoryItem, type MmoUiToolbarAction } from "@hyperfocus/engine/ui";
import {
  createAssetLoadSnapshot,
  createCanvasAssetLoader,
  createSmoothedAssetProgress,
  runAssetLoaderRafLoop,
  type AssetLoadSnapshot
} from "@hyperfocus/engine/assets/loader";
import {
  attachMmoEntityViews,
  abilityOptionsForSlot,
  bankQty,
  equippedWeaponForPlayer,
  hasInventoryItem,
  hasQuestFlag,
  hasSlot,
  itemQty,
  mmoCatalog,
  mmoSkillDemoMultipartCodec,
  playerAbilityMetadata,
  selectedAbilityForSlot,
  type MmoSkillDemoInput,
  type MmoSkillDemoState,
  type MmoCatalogDef,
  type PlayerEntity,
  weaponMetadata
} from "../shared.ts";
import { clientImageSources, itemIcons, itemLabels, uiAssetBase } from "../data/assets.ts";
import { currentUtcDateString, dailyQuestArcForDate } from "../data/daily-quests.ts";
import { getMmoSkillDemoAnchorTile } from "../data/world.ts";
import { equipmentSlots, keyItemOrder } from "../data/ui.ts";
import { worldCraftingRecipes, type WorldCraftingRecipe } from "../data/world-recipes.ts";
import { abilityTooltipTitle } from "./ability-tooltips.ts";
import { loadImages } from "./assets.ts";
import { COMBAT_SLOTS, energyMax, energyValue, slotCooldownMs, type CombatSlot } from "./combat-view.ts";
import { earlyLoopAction, earlyLoopReturnBriefing } from "./early-loop.ts";
import { DEFAULT_CONTROLLER_DEADZONE, controllerAimOffset, controllerInputFromGamepad, createHeldNpcInteractionGate, createMmoSkillControllerSession, currentInput, type ControllerInputFrame } from "./input.ts";
import { createMmoStateInterpolator } from "./interpolation.ts";
import { applyLocalPrediction, createLocalPredictionState } from "./local-prediction.ts";
import { contractInfo } from "./progression.ts";
import { mainQuestGoalText, mainQuestOptions } from "./quest-guide.ts";
import { createRenderer } from "./render.ts";
import { createNpcMenuLayer } from "./render/ui/npc-menu-layer.ts";
import { mmoSkillDemoInputCodec } from "../input-codec.ts";
import { mmoSkillDemoClientSchema } from "./schema.ts";
import { createSfx } from "./sfx.ts";
import { createCompactPanelState, isCompactPanelName } from "./ui-shell.ts";
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
let client: AuthoritativeClient | undefined;
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
}, () => {
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
  client = connectAuthoritative({
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
  client.onSnapshot((state, meta) => applyAuthoritativeState(state as MmoSkillDemoState, meta));
  client.onDelta((state, meta) => applyAuthoritativeState(state as MmoSkillDemoState, meta));
  client.onMessage((message) => {
    if (message.type === "server_welcome") {
      const tickRate = (message.payload as { tickRate?: unknown } | undefined)?.tickRate;
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
  const gamepad = sample.gamepad as Gamepad | undefined;
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

const SLOT_NAMES: Record<CombatSlot, string> = {
  LMB: "Pummel",
  RMB: "Slam",
  Space: "Rush",
  Q: "Berserk",
  E: "Boulder",
  R: "Whirlwind"
};

function abilityNameForSlot(player: PlayerEntity | undefined, slot: CombatSlot) {
  const abilityId = selectedAbilityForSlot(player, slot);
  return playerAbilityMetadata[abilityId]?.name ?? SLOT_NAMES[slot];
}

type FieldSlotReveal = {
  unlocked: boolean;
  status: string;
  hint: string;
};

function fieldSlotReveal(player: PlayerEntity | undefined, slot: CombatSlot): FieldSlotReveal {
  if (!player) return { unlocked: true, status: "Ready", hint: "" };
  switch (slot) {
    case "LMB":
      return { unlocked: true, status: "Rowan's first lesson", hint: "Ashwood training" };
    case "RMB":
      return hasQuestFlag(player, "first-cut")
        ? { unlocked: true, status: "First Cut proof", hint: "First Cut" }
        : { unlocked: false, status: "First Cut", hint: "Bring Rowan 5 Ash Logs." };
    case "Space":
      return hasQuestFlag(player, "wolf-culling")
        ? { unlocked: true, status: "Road drill", hint: "Wolf Culling" }
        : { unlocked: false, status: "Wolf Culling", hint: "Secure the Ashwood road for Rowan." };
    case "Q":
      return hasQuestFlag(player, "silent-sands")
        ? { unlocked: true, status: "Silent Sands", hint: "Master Kael" }
        : { unlocked: false, status: "Silent Sands", hint: "Survive the Bazaar trial with Master Kael." };
    case "E":
      return hasQuestFlag(player, "root-of-the-problem") || player.dungeonBossKills > 0
        ? { unlocked: true, status: "Deep root proof", hint: "Overgrown Thicket" }
        : { unlocked: false, status: "Deep Root", hint: "Return with a dungeon relic." };
    case "R":
      return player.masteryRank >= 2 || hasQuestFlag(player, "breaking-golem") || hasQuestFlag(player, "kings-foil")
        ? { unlocked: true, status: "Mastery channel", hint: "Renown" }
        : { unlocked: false, status: "Mastery 2", hint: "Earn renown from quests and contracts." };
  }
}

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

function labelize(value: string) {
  return value.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function worldEventLine(state: MmoSkillDemoState) {
  const seconds = Math.max(0, Math.ceil(state.worldEventTimerMs / 1000));
  if (state.worldEventPhase === "active") {
    return `${state.worldEventName}: ${Math.min(state.worldEventGoal, state.worldEventProgress)}/${state.worldEventGoal} (${seconds}s)`;
  }
  return `${labelize(state.worldEventPhase)}: ${state.worldEventReward} (${seconds}s)`;
}

function nextGoal(player: PlayerEntity) {
  return mainQuestGoalText(player);
}

const ITEM_LABELS = itemLabels;
const KEY_ITEM_ORDER = keyItemOrder;
const EQUIPMENT_SLOTS = equipmentSlots;

function itemLabel(id: string) {
  return ITEM_LABELS[id] ?? labelize(id);
}

function itemMeta(id: string, player: PlayerEntity) {
  switch (id) {
    case "training-hatchet":
      return "Starter woodcut tool";
    case "iron-hatchet":
      return "Faster Ash cuts";
    case "pickaxe":
      return "Unlocks Crags ore";
    case "mace":
      return "Melee weapon";
    case "bow":
      return "Ranged weapon";
    case "staff":
      return "Caster weapon";
    case "wand":
      return "Fast caster weapon";
    case "twin-blades":
      return "Assassin weapon";
    case "blade":
      return "Duelist weapon";
    case "leather-boots":
    case "mining-boots":
      return "Move speed gear";
    case "iron-chest":
      return "Damage reduction";
    case "ring-focus":
      return "Cooldown reduction";
    case "captains-map":
      return `Routes from ${labelize(player.zoneId)}`;
    case "cursed-idol":
      return "Risk unlock";
    case "broken-hilt":
      return "Dungeon component";
    case "elite-weapon":
      return "Combat damage bonus";
    case "unique-cape":
      return player.prestigeTitle || "Prestige reward";
    default:
      return "Owned";
  }
}

type UiStringMap = Record<string, string>;
type UiBooleanMap = Record<string, boolean>;

const CATALOG_SECTIONS = [
  { id: "factions", label: "Factions", title: "Factions", groupBy: "zone" },
  { id: "expandedCreatures", label: "Bestiary", title: "Expanded Bestiary", groupBy: "zone" },
  { id: "reputationRewards", label: "Rep", title: "Reputation Rewards", groupBy: "zone" },
  { id: "craftingMaterials", label: "Mats", title: "Crafting Materials", groupBy: "role" }
] as const;

type CatalogSectionId = (typeof CATALOG_SECTIONS)[number]["id"];
type CatalogViewMode = "nearby" | "all";

type FieldJournalEntry = {
  id: string;
  title: string;
  zoneId: string;
  kind: "thread" | "rumor" | "proof";
  visible: (player: PlayerEntity) => boolean;
  complete: (player: PlayerEntity) => boolean;
  summary: (player: PlayerEntity) => string;
  unlock: string;
  clue: string;
};

const PROVING_CONTRACT_ID = "first-arms-proving";
const PROVING_WEAPONS = ["mace", "bow", "staff", "wand", "twin-blades", "blade"] as const;
const PROVING_LESSONS = [
  { id: "statuses", title: "Status Table", note: "Bleed, poison, slow, stun, shield, burn, and cleanse.", reward: "consumables + status field note" },
  { id: "crafting", title: "Craft Order", note: "Turn starter resources into first gear direction.", reward: "logs, ore, silk, gold" },
  { id: "buffs", title: "Buff Bench", note: "Practice food, potion, haste, regen, and safety timing.", reward: "potions + berries" },
  { id: "gathering", title: "Work Yard", note: "Try wood, ore, herb, and salvage reads.", reward: "tool voucher + common materials" },
  { id: "cities", title: "City Ledger", note: "Preview each city identity and what it unlocks.", reward: "route notes + faction intros" },
  { id: "travel", title: "Route Tickets", note: "Learn captain routes, escorts, and premium route costs.", reward: "map + travel purse" }
] as const;

function provingSampleFlag(weaponId: string) {
  return `${PROVING_CONTRACT_ID}-sampled-${weaponId}`;
}

function provingRewardFlag(weaponId: string) {
  return `${PROVING_CONTRACT_ID}-reward-${weaponId}`;
}

function provingLessonFlag(lessonId: string) {
  return `first-arms-lesson-${lessonId}`;
}

function provingSampleCount(player: PlayerEntity) {
  return PROVING_WEAPONS.filter((weaponId) => hasQuestFlag(player, provingSampleFlag(weaponId))).length;
}

function catalogSectionById(id: CatalogSectionId) {
  return CATALOG_SECTIONS.find((section) => section.id === id) ?? CATALOG_SECTIONS[0];
}

function catalogStoryZones(player: PlayerEntity) {
  const zones = new Set<string>(["ashwood", player.zoneId]);
  if (player.zoneId === "crags") zones.add("ironcrag");
  if (player.zoneId === "port-marrow") {
    zones.add("holy-reach");
    zones.add("whisperwind-ascent");
  }
  if (player.zoneId === "bazaar") zones.add("canaan-desert");
  if (hasQuestFlag(player, "first-cut")) zones.add("crags");
  if (hasQuestFlag(player, "wolf-culling")) zones.add("ashwood-wilderness");
  if (hasQuestFlag(player, "final-cut") || hasQuestFlag(player, "fast-travel-registered")) {
    zones.add("port-marrow");
    zones.add("holy-reach");
  }
  if (hasQuestFlag(player, "heavy-lifting")) {
    zones.add("canaan-desert");
    zones.add("bazaar");
    zones.add("whisperwind-ascent");
  }
  if (hasQuestFlag(player, "silent-sands") || hasInventoryItem(player, "void-resistant-cloak") || player.masteryRank >= 4) zones.add("void-rift");
  if (hasQuestFlag(player, "root-of-the-problem") || hasQuestFlag(player, "luminous-depths") || hasQuestFlag(player, "forbidden-scripts")) zones.add("dungeon");
  if (player.zoneId === "cottage" || hasQuestFlag(player, "lost-compass")) zones.add("cottage");
  return zones;
}

function catalogEntryDiscovered(player: PlayerEntity, entry: MmoCatalogDef) {
  if (catalogStoryZones(player).has(entry.zoneId)) return true;
  if (entry.role === "starter" || entry.role === "tool" || entry.role === "woodcutting") return true;
  if (entry.zoneId === "dungeon") return hasQuestFlag(player, "wolf-culling") || player.dungeonBossKills > 0;
  return false;
}

function catalogEntryHint(player: PlayerEntity, entry: MmoCatalogDef) {
  if (catalogEntryDiscovered(player, entry)) return entry.summary;
  if (entry.zoneId === "crags") return "Rowan's first proof points northwest toward ore and pickaxes.";
  if (entry.zoneId === "ashwood-wilderness") return "The wolf trail leaves the safe road after Rowan's culling work.";
  if (entry.zoneId === "port-marrow" || entry.zoneId === "holy-reach") return "Captain Marrow names this route after Ashwood is secured.";
  if (entry.zoneId === "canaan-desert" || entry.zoneId === "bazaar") return "Foreman work and dock rumors point toward desert survival trials.";
  if (entry.zoneId === "whisperwind-ascent") return "Mountain runners mention it once the Ironcrag route feels familiar.";
  if (entry.zoneId === "void-rift") return "Void work waits for cloak, relic, or mastery proof.";
  if (entry.zoneId === "dungeon") return "Dungeon names surface through Rowan, town relics, and boss trophies.";
  return "Locals will name this when its route matters.";
}

const FIELD_JOURNAL_ENTRIES: FieldJournalEntry[] = [
  {
    id: "first-arms-proving",
    title: "First Arms Board",
    zoneId: "ashwood",
    kind: "thread",
    visible: (player) => !hasQuestFlag(player, PROVING_CONTRACT_ID),
    complete: (player) => hasQuestFlag(player, PROVING_CONTRACT_ID),
    summary: (player) => hasQuestFlag(player, `${PROVING_CONTRACT_ID}-accepted`)
      ? `Loaner trials marked: ${provingSampleCount(player)}/3 before the board pays out.`
      : "Rowan's practice board pays for optional weapon trials before normal field work.",
    unlock: "chosen weapon, starter purse, lesson contracts",
    clue: "Practice Board"
  },
  {
    id: "first-arms-lessons",
    title: "Paid Lesson Contracts",
    zoneId: "ashwood",
    kind: "proof",
    visible: (player) => hasQuestFlag(player, PROVING_CONTRACT_ID),
    complete: (player) => PROVING_LESSONS.every((lesson) => hasQuestFlag(player, provingLessonFlag(lesson.id))),
    summary: (player) => {
      const done = PROVING_LESSONS.filter((lesson) => hasQuestFlag(player, provingLessonFlag(lesson.id))).length;
      return `${done}/${PROVING_LESSONS.length} follow-up lessons paid: statuses, crafting, buffs, gathering, cities, and travel.`;
    },
    unlock: "starter resources, route notes, tools, consumables",
    clue: "Field Journal"
  },
  {
    id: "rowan-first-proof",
    title: "Soft Root Proof",
    zoneId: "ashwood",
    kind: "thread",
    visible: () => true,
    complete: (player) => hasQuestFlag(player, "first-cut"),
    summary: (player) => hasQuestFlag(player, "first-cut")
      ? "Rowan trusts your cuts and points toward heavier lessons."
      : `Rowan wants clean Ash cuts: ${Math.min(5, itemQty(player, "ash-logs") + bankQty(player, "ash-logs"))}/5.`,
    unlock: "RMB lesson, Iron Hatchet, Ironcrag rumors",
    clue: "Elder Rowan"
  },
  {
    id: "road-rush",
    title: "Road Rush Drill",
    zoneId: "ashwood",
    kind: "thread",
    visible: (player) => hasQuestFlag(player, "first-cut"),
    complete: (player) => hasQuestFlag(player, "wolf-culling"),
    summary: (player) => hasQuestFlag(player, "wolf-culling")
      ? "The road is quiet enough for Rowan's movement drill."
      : `The pack still owns the path: ${Math.min(10, player.wolfKills)}/10.`,
    unlock: "Space movement slot, Ashwood Wilderness rumors",
    clue: "Elder Rowan"
  },
  {
    id: "captain-route",
    title: "Captain's Route Pledge",
    zoneId: "port-marrow",
    kind: "thread",
    visible: (player) => hasQuestFlag(player, "wolf-culling"),
    complete: (player) => hasQuestFlag(player, "fast-travel-registered"),
    summary: (player) => hasQuestFlag(player, "fast-travel-registered")
      ? "Marrow has Ashwood on the route slate."
      : hasQuestFlag(player, "final-cut")
        ? "Find Captain Marrow; register Ashwood before chasing new dock routes."
        : "Rowan wants one last pledge before the captain opens the road.",
    unlock: "Port Marrow, route board, broader Codex",
    clue: "Captain Marrow"
  },
  {
    id: "ironcrag-forge",
    title: "Ironcrag Forge Permit",
    zoneId: "crags",
    kind: "rumor",
    visible: (player) => hasQuestFlag(player, "final-cut") || hasQuestFlag(player, "fast-travel-registered") || player.zoneId === "crags",
    complete: (player) => hasInventoryItem(player, "pickaxe") || Boolean(player.equipment?.pickaxe),
    summary: (player) => hasInventoryItem(player, "pickaxe") || Boolean(player.equipment?.pickaxe)
      ? "Foreman Iron-Will sold you a proper pick."
      : hasQuestFlag(player, "fast-travel-registered") || player.zoneId === "crags"
        ? "Buy a Pickaxe from Foreman Iron-Will before desert rumors matter."
        : "Marrow's route pledge points northwest toward ore crews and pickaxes.",
    unlock: "Pickaxe, ore banking, mining gear",
    clue: "Foreman Iron-Will"
  },
  {
    id: "silent-sands",
    title: "Silent Sands Trial",
    zoneId: "bazaar",
    kind: "rumor",
    visible: (player) => hasQuestFlag(player, "heavy-lifting") || hasQuestFlag(player, "heavy-lifting-ready") || player.zoneId === "bazaar",
    complete: (player) => hasQuestFlag(player, "silent-sands"),
    summary: (player) => hasQuestFlag(player, "silent-sands")
      ? "Master Kael's ruin lesson is marked in your stance work."
      : `Bazaar pressure held: ${Math.min(120, Math.floor(player.bazaarSurvivalMs / 1000))}/120s.`,
    unlock: "Q stance lesson, elite survival rumors",
    clue: "Master Kael"
  },
  {
    id: "void-rumor",
    title: "Black Edge Rumor",
    zoneId: "void-rift",
    kind: "rumor",
    visible: (player) => hasQuestFlag(player, "silent-sands") || player.masteryRank >= 3 || hasInventoryItem(player, "void-resistant-cloak"),
    complete: (player) => hasInventoryItem(player, "void-resistant-cloak") || hasQuestFlag(player, "seal-the-rift"),
    summary: (player) => hasInventoryItem(player, "void-resistant-cloak") || hasQuestFlag(player, "seal-the-rift")
      ? "The rift route has protection marked beside it."
      : "Dock alchemists say the black edge burns anyone without proof or protection.",
    unlock: "Void route, cloak prep, endgame faction work",
    clue: "Alchemist Zora"
  }
];

type CraftRuntimeAction = "interact" | "trade";
type CraftRuntimeRoute = {
  action: CraftRuntimeAction;
  npcKinds: readonly string[];
  label: string;
  note: string;
};

const RUNTIME_CRAFT_ROUTES_BY_OUTPUT: Record<string, CraftRuntimeRoute> = {
  pickaxe: {
    action: "interact",
    npcKinds: ["foreman-iron-will"],
    label: "Foreman station",
    note: "Runtime can target the foreman, but exact recipe id is only carried as devText."
  },
  "iron-chest": {
    action: "interact",
    npcKinds: ["blacksmith-silas", "blacksmith"],
    label: "Blacksmith station",
    note: "Runtime blacksmith crafts the first available matching station recipe."
  },
  "ring-focus": {
    action: "interact",
    npcKinds: ["blacksmith-silas", "blacksmith"],
    label: "Blacksmith station",
    note: "Runtime blacksmith crafts the first available matching station recipe."
  },
  "speed-potion": {
    action: "trade",
    npcKinds: ["alchemist-zora", "merchant-kaya"],
    label: "Potion vendor",
    note: "Runtime trade uses the current alchemy or merchant craft queue."
  },
  "cinder-ale": {
    action: "trade",
    npcKinds: ["alchemist-zora", "merchant-kaya"],
    label: "Provision vendor",
    note: "Runtime trade uses the current alchemy or merchant craft queue."
  },
  "void-resistant-cloak": {
    action: "trade",
    npcKinds: ["alchemist-zora"],
    label: "Alchemist station",
    note: "Runtime alchemist can make the current Void cloak route."
  }
};

function primaryRecipeOutput(recipe: WorldCraftingRecipe) {
  return recipe.outputs[0]?.itemId ?? "";
}

function recordKey(record: Record<string, string | number | boolean | undefined> | undefined) {
  if (!record) return "";
  return Object.keys(record)
    .sort()
    .map((key) => `${key}:${String(record[key])}`)
    .join(",");
}

function playerEquipment(player: PlayerEntity) {
  return player.equipment ?? {};
}

function mutablePlayerEquipment(player: PlayerEntity) {
  return ((player as PlayerEntity & { equipment?: UiStringMap }).equipment ??= {});
}

function playerAbilitySlots(player: PlayerEntity) {
  return player.abilitySlots ?? {};
}

function playerQuestFlags(player: PlayerEntity) {
  return player.questFlags ?? {};
}

function panelRenderKey(activePanel: string, player: PlayerEntity, state: MmoSkillDemoState) {
  const equipment = recordKey(player.equipment);
  const inventory = recordKey(player.inventory);
  const bank = recordKey(player.bank);
  const abilitySlots = recordKey(player.abilitySlots);
  const questFlags = recordKey(player.questFlags);
  switch (activePanel) {
    case "quest":
      return [
        activePanel,
        player.zoneId,
        player.activeQuestId,
        player.dailyQuestDate,
        player.dailyQuestStep,
        player.dailyQuestProgress,
        player.dailyQuestCompleted,
        player.dailyQuestResult,
        player.contractId,
        player.contractKills,
        player.contractCooldownMs > 0 ? Math.ceil(player.contractCooldownMs / 1000) : 0,
        player.wolfKills,
        Math.floor(player.bazaarSurvivalMs / 1000),
        inventory,
        bank,
        questFlags
      ].join("|");
    case "event":
      return [
        activePanel,
        state.worldEventId,
        state.worldEventName,
        state.worldEventPhase,
        state.worldEventProgress,
        state.worldEventGoal,
        Math.ceil(state.worldEventTimerMs / 1000),
        state.worldEventReward,
        state.worldEventObjective
      ].join("|");
    case "bag":
      return [activePanel, player.zoneId, player.gold, player.renown, player.masteryRank, inventory, bank, equipment, player.prestigeTitle].join("|");
    case "gear":
    case "skills":
      return [activePanel, equipment, inventory, abilitySlots, questFlags, player.masteryRank, player.dungeonBossKills, player.wolfKills].join("|");
    case "stats":
      return [
        activePanel,
        player.hp,
        player.maxHp,
        player.mana,
        player.maxMana,
        player.combatLevel,
        player.combatXp,
        player.miningLevel,
        player.miningXp,
        player.woodcuttingLevel,
        player.woodcuttingXp,
        player.masteryRank,
        player.renown,
        equippedWeaponForPlayer(player),
        equipment,
        abilitySlots,
        Object.keys(state.entities).length
      ].join("|");
    case "catalog":
      return [activePanel, player.zoneId, player.masteryRank, player.dungeonBossKills, inventory, bank, questFlags].join("|");
    case "journal":
      return [
        activePanel,
        player.zoneId,
        player.activeQuestId,
        player.wolfKills,
        Math.floor(player.bazaarSurvivalMs / 1000),
        player.masteryRank,
        player.dungeonBossKills,
        inventory,
        bank,
        questFlags
      ].join("|");
    case "craft":
      return [
        activePanel,
        player.zoneId,
        Math.floor(player.x / 24),
        Math.floor(player.y / 24),
        player.gold,
        inventory,
        questFlags,
        Object.values(state.npcs).filter((npc) => npc.zoneId === player.zoneId && npc.hp > 0).map((npc) => `${npc.kind}:${Math.floor(npc.x / 24)}:${Math.floor(npc.y / 24)}`).sort().join(",")
      ].join("|");
    default:
      return activePanel;
  }
}

const LIVE_UI_STYLE_ID = "mmo-skill-demo-live-ui";

function svgIcon(paths: string) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

function toolbarIcons() {
  return {
    quest: svgIcon('<path d="M7 4h11v15H7z"/><path d="M5 6h2v15l2-2 2 2V6"/><path d="M10 8h5M10 12h6M10 16h4"/>'),
    event: svgIcon('<path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="M7 7l3 3"/><path d="M17 7l-3 3"/><path d="M7 17l3-3"/><path d="M17 17l-3-3"/>'),
    bag: svgIcon('<path d="M7 8h10l1 12H6L7 8z"/><path d="M9 8a3 3 0 0 1 6 0"/><path d="M9 13h6"/>'),
    gear: svgIcon('<path d="M12 3l7 4v5c0 4-2.7 7-7 9-4.3-2-7-5-7-9V7l7-4z"/><path d="M9 12l2 2 4-5"/>'),
    skills: svgIcon('<path d="M4 20l7-7"/><path d="M14 4l6 6"/><path d="M12 6l6 6-8 8H4v-6l8-8z"/><path d="M16 8l-8 8"/>'),
    stats: svgIcon('<path d="M5 19V9"/><path d="M12 19V5"/><path d="M19 19v-7"/><path d="M3 19h18"/>'),
    catalog: svgIcon('<path d="M5 5.5A3 3 0 0 1 8 3h12v17H8a3 3 0 0 0-3 3V5.5z"/><path d="M5 5.5A3 3 0 0 1 8 8h12"/><path d="M9 12h6"/>'),
    journal: svgIcon('<path d="M6 4h10l2 2v14H6z"/><path d="M16 4v4h4"/><path d="M9 10h6"/><path d="M9 14h7"/><path d="M9 18h4"/>'),
    craft: svgIcon('<path d="M14 4l6 6"/><path d="M4 20l6-6"/><path d="M12 6l6 6"/><path d="M7 17l-2-2 8-8 2 2-8 8z"/><path d="M17 3l4 4"/>'),
    map: svgIcon('<path d="M4 6l5-2 6 2 5-2v16l-5 2-6-2-5 2V6z"/><path d="M9 4v16"/><path d="M15 6v16"/><path d="M7 15l3-3 3 2 4-5"/>'),
    world: svgIcon('<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"/><path d="M3.6 9h16.8"/><path d="M3.6 15h16.8"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/>'),
    dungeon: svgIcon('<path d="M5 21V8l7-5 7 5v13"/><path d="M9 21v-7h6v7"/><path d="M8 10h2M14 10h2"/>'),
    cottage: svgIcon('<path d="M3 11l9-8 9 8"/><path d="M5 10v11h14V10"/><path d="M10 21v-6h4v6"/>'),
    heal: svgIcon('<path d="M12 5v14"/><path d="M5 12h14"/>')
  };
}

function ensureLiveUiStyle(doc: Document) {
  if (doc.getElementById(LIVE_UI_STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = LIVE_UI_STYLE_ID;
  style.textContent = `
#ui {
  inset: 18px 18px auto auto;
  justify-items: end;
  max-height: calc(100vh - 36px);
  overflow: visible;
  pointer-events: none;
  width: auto;
}
#ui .ce-mmo-shell {
  align-items: end;
  gap: 8px;
  min-height: 0;
  pointer-events: none;
}
#ui .ce-mmo-chrome {
  background: linear-gradient(180deg, rgba(15, 19, 16, 0.78), rgba(5, 8, 8, 0.62));
  border-color: rgba(216, 181, 106, 0.48);
  box-shadow: 0 14px 36px rgba(0,0,0,0.28), inset 0 0 0 1px rgba(255,238,174,0.08);
  pointer-events: auto;
}
#ui .ce-mmo-toolbar {
  display: grid;
  gap: 6px;
  grid-auto-flow: column;
  grid-auto-columns: 38px;
}
#ui .ce-mmo-tool {
  background: radial-gradient(circle at 50% 18%, rgba(245,211,118,0.20), rgba(10,14,13,0.88) 64%);
  border-color: rgba(216,181,106,0.52);
  box-shadow: inset 0 0 0 1px rgba(255,246,206,0.06), 0 8px 18px rgba(0,0,0,0.24);
  color: #f2dfaa;
  height: 38px;
  min-width: 38px;
  padding: 0;
}
#ui .ce-mmo-tool:hover,
#ui .ce-mmo-tool:focus-visible {
  border-color: rgba(255,233,154,0.9);
  color: #fff4bf;
  outline: none;
  transform: translateY(-1px);
}
#ui .ce-mmo-tool.is-active {
  color: #1b130d;
  box-shadow: 0 0 0 1px rgba(255,246,206,0.24), 0 0 22px rgba(216,181,106,0.24);
}
#ui .ce-mmo-tool-icon,
#ui .ce-mmo-tool-icon svg {
  height: 21px;
  width: 21px;
}
#ui .ce-mmo-tool-label {
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  height: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
  width: 1px;
}
#ui .ce-mmo-body,
#ui .ce-mmo-panels {
  width: min(410px, calc(100vw - 28px));
}
#ui .ce-mmo-body {
  pointer-events: auto;
}
#ui .ce-mmo-panel {
  background:
    linear-gradient(180deg, rgba(19, 19, 17, 0.96), rgba(7, 10, 10, 0.95)),
    radial-gradient(circle at 80% 12%, rgba(216,181,106,0.16), transparent 36%);
  border-color: rgba(216,181,106,0.58);
  box-shadow: 0 22px 60px rgba(0,0,0,0.46), inset 0 0 0 1px rgba(255,245,201,0.08);
  max-height: min(68vh, 620px);
}
#ui .ce-mmo-panel-header {
  color: #f1d68b;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 17px;
  letter-spacing: 0;
  padding: 10px 12px;
}
#ui .ce-mmo-panel-body {
  max-height: min(58vh, 540px);
  overflow: auto;
  padding: 10px;
  scrollbar-color: rgba(216,181,106,0.56) rgba(8,10,10,0.6);
}
main.is-map-open::after,
main.is-map-open > #status,
main.is-map-open > #client-log {
  display: none;
}
main::after {
  content: none !important;
  display: none !important;
}
.mmo-panel-stack,
.mmo-panel-section,
.mmo-card-grid,
.mmo-text-list,
.mmo-stat-grid {
  display: grid;
}
.mmo-panel-stack { gap: 10px; }
.mmo-panel-section {
  background: rgba(11, 14, 13, 0.54);
  border: 1px solid rgba(133, 102, 55, 0.46);
  border-radius: 7px;
  gap: 8px;
  padding: 9px;
}
.mmo-section-head {
  align-items: center;
  color: #f1d68b;
  display: flex;
  font: 800 11px/1 Inter, ui-sans-serif, system-ui, sans-serif;
  gap: 6px;
  justify-content: space-between;
  letter-spacing: 0;
  text-transform: uppercase;
}
.mmo-card-grid {
  gap: 7px;
  grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
}
.mmo-item-card,
.mmo-skill-card,
.mmo-stat-chip,
.mmo-choice-card {
  background: linear-gradient(180deg, rgba(26,31,27,0.82), rgba(10,13,12,0.88));
  border: 1px solid rgba(156,126,70,0.42);
  border-radius: 6px;
  color: #f3ead7;
}
.mmo-item-card,
.mmo-skill-card,
.mmo-choice-card {
  cursor: pointer;
  display: grid;
  gap: 7px;
  min-width: 0;
  padding: 7px;
  text-align: left;
}
.mmo-item-card {
  grid-template-columns: 36px minmax(0, 1fr) auto;
  min-height: 50px;
}
.mmo-item-body {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.mmo-item-card:hover:not(:disabled),
.mmo-skill-card:hover:not(:disabled),
.mmo-choice-card:hover:not(:disabled) {
  border-color: rgba(255,226,139,0.86);
  color: #fff2ba;
}
.mmo-item-card.is-active,
.mmo-skill-card.is-active,
.mmo-choice-card.is-active {
  border-color: rgba(244,211,107,0.95);
  box-shadow: inset 0 0 0 1px rgba(244,211,107,0.28), 0 0 18px rgba(244,211,107,0.16);
}
.mmo-item-card.is-locked,
.mmo-skill-card.is-locked {
  background: linear-gradient(180deg, rgba(20,24,23,0.68), rgba(8,11,11,0.78));
  border-color: rgba(137,162,128,0.26);
}
.mmo-skill-card.is-complete {
  border-color: rgba(120,214,180,0.50);
}
.mmo-status-badge {
  border: 1px solid rgba(216,181,106,0.34);
  border-radius: 999px;
  color: #e7d9b3;
  font-size: 10px;
  font-weight: 900;
  padding: 2px 6px;
  white-space: nowrap;
}
.mmo-item-card:disabled,
.mmo-skill-card:disabled,
.mmo-choice-card:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}
.mmo-item-icon {
  align-items: center;
  background: radial-gradient(circle at 45% 32%, rgba(216,181,106,0.28), rgba(11,14,13,0.92) 72%);
  border: 1px solid rgba(216,181,106,0.42);
  border-radius: 5px;
  display: grid;
  height: 36px;
  justify-items: center;
  overflow: hidden;
  width: 36px;
}
.mmo-item-icon img {
  height: 30px;
  object-fit: contain;
  width: 30px;
}
.mmo-item-name,
.mmo-skill-name {
  font-size: 12px;
  font-weight: 800;
  line-height: 1.16;
  min-width: 0;
  overflow-wrap: anywhere;
}
.mmo-item-meta,
.mmo-skill-meta,
.mmo-text-list {
  color: #cfc3a9;
  font-size: 11px;
  line-height: 1.28;
}
.mmo-item-count {
  align-self: center;
  background: #d8b56a;
  border-radius: 999px;
  color: #14100d;
  font-size: 11px;
  font-weight: 900;
  min-width: 28px;
  padding: 3px 6px;
  text-align: center;
}
.mmo-tab-strip {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.mmo-tab,
.mmo-compact-button {
  background: rgba(18,22,20,0.82);
  border: 1px solid rgba(156,126,70,0.44);
  border-radius: 6px;
  color: #e9dec4;
  cursor: pointer;
  font: 800 11px/1 Inter, ui-sans-serif, system-ui, sans-serif;
  min-height: 32px;
  padding: 6px 8px;
}
.mmo-tab.is-active,
.mmo-compact-button.is-active {
  background: linear-gradient(180deg, #d8b56a, #a97432);
  color: #18110c;
}
.mmo-stat-grid {
  gap: 7px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.mmo-stat-chip {
  display: grid;
  gap: 3px;
  min-height: 48px;
  padding: 7px 8px;
}
.mmo-stat-chip span:first-child {
  color: #b9a98e;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
}
.mmo-stat-chip strong {
  font-size: 13px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.mmo-progress-pill {
  display: grid;
  gap: 4px;
}
.mmo-progress-label {
  align-items: center;
  color: #e7d9bc;
  display: flex;
  font-size: 11px;
  gap: 8px;
  justify-content: space-between;
}
.mmo-progress-track {
  background: rgba(0,0,0,0.46);
  border: 1px solid rgba(216,181,106,0.20);
  border-radius: 999px;
  height: 7px;
  overflow: hidden;
}
.mmo-progress-fill {
  background: linear-gradient(90deg, #6fd18f, #f4d36b);
  height: 100%;
}
.mmo-text-list {
  gap: 6px;
}
.mmo-text-list > div {
  border-top: 1px solid rgba(185,169,142,0.16);
  padding-top: 6px;
}
.mmo-choice-card {
  grid-template-columns: minmax(0, 1fr);
}
.mmo-slider-row {
  align-items: center;
  color: #f3ead7;
  display: grid;
  font-size: 12px;
  font-weight: 800;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr) auto;
}
.mmo-slider-row input {
  grid-column: 1 / -1;
  width: 100%;
}
@media (max-width: 720px) {
  #ui {
    inset: auto 10px 10px 10px;
    justify-items: end;
  }
  #ui .ce-mmo-toolbar {
    grid-auto-flow: initial;
    grid-template-columns: repeat(6, 38px);
  }
  #ui .ce-mmo-panel {
    max-height: 52vh;
  }
  #ui .ce-mmo-panel-body {
    max-height: 44vh;
  }
  .mmo-tab-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .mmo-stat-grid {
    grid-template-columns: 1fr;
  }
}
`;
  (doc.head ?? doc.documentElement).append(style);
}

function itemIconSrc(id: string) {
  return `${uiAssetBase}${itemIcons[id] ?? itemIcons.empty}`;
}

function tooltipText(title: string, line?: string, meta?: string) {
  return [title, line, meta].filter((part): part is string => Boolean(part)).join("\n");
}

function setupUi(
  root: HTMLElement,
  showDevCheats: boolean,
  queueUiInput: (input: MmoSkillDemoInput) => void,
  confirmRouteChange: (label: string, apply: () => void) => void | Promise<void>,
  openWorldMap: () => void,
  closeExternalMenus: () => void = () => {}
) {
  root.replaceChildren();
  ensureLiveUiStyle(root.ownerDocument);
  root.style.pointerEvents = "none";
  root.style.width = "auto";
  root.style.maxHeight = "calc(100vh - 36px)";
  root.style.overflow = "visible";
  root.style.justifyItems = "end";

  const panelState = createCompactPanelState();
  let lastHidden: boolean | undefined;
  let lastStatus = "";
  let lastPanelKey = "";
  let lastUiKey = "";
  let latestPlayer: PlayerEntity | undefined;
  let latestState: MmoSkillDemoState | undefined;
  let catalogSection: CatalogSectionId = "factions";
  let catalogViewMode: CatalogViewMode = "nearby";
  let selectedRecipeId: string = worldCraftingRecipes[0]?.id ?? "";
  let noviceUiBypass = params.get("novice") === "0";

  function invalidateUi() {
    lastPanelKey = "";
    lastUiKey = "";
  }

  const shell = createMmoUiShell({
    root,
    login: false,
    title: "MMO Skill Demo",
    status: "Disconnected",
    toolbar: toolbarActions(),
    onToolbarAction(payload) {
      if (payload.id === "dev-heal") {
        queueUiInput({ action: "dev", devField: "hp", devValue: 100 });
        return;
      }
      if (payload.id === "map") {
        closeExternalMenus();
        openWorldMap();
        return;
      }
      if (isCompactPanelName(payload.id)) {
        panelState.toggle(payload.id);
        if (panelState.activePanel) closeExternalMenus();
        invalidateUi();
        shell.setToolbarActions(toolbarActions());
        renderPanel();
        return;
      }
      closeExternalMenus();
      const params = new URLSearchParams(location.search);
      let label = "Shared World";
      if (payload.id === "dungeon") {
        params.set("room", "dungeon-party-1");
        params.set("type", "mmo-skill-demo-dungeon");
        label = "Party Dungeon";
      } else if (payload.id === "cottage") {
        params.set("room", "cottage-demo");
        params.set("type", "mmo-skill-demo-cottage");
        label = "Player Cottage";
      } else {
        params.delete("room");
        params.set("type", "mmo-skill-demo");
      }
      void confirmRouteChange(label, () => {
        location.search = params.toString();
      });
    }
  });
  shell.root.classList.add("mmo-live-shell");
  shell.elements.toolbar.setAttribute("aria-label", "Utility panels");

  const panelBody = root.querySelector<HTMLElement>(".ce-mmo-body");
  const panelWrap = root.querySelector<HTMLElement>(".ce-mmo-panels");
  panelBody?.style.setProperty("grid-template-columns", "1fr");
  root.querySelector<HTMLElement>(".ce-mmo-topbar")!.style.display = "none";
  root.querySelector<HTMLElement>(".ce-mmo-sidebar")!.style.display = "none";
  root.querySelector<HTMLElement>(".ce-mmo-hotbar")!.style.display = "none";

  function setPanelWindowVisible(visible: boolean) {
    if (panelBody) panelBody.style.display = visible ? "grid" : "none";
    if (panelWrap) panelWrap.style.display = visible ? "grid" : "none";
  }

  setPanelWindowVisible(false);

  function toolbarActions(): MmoUiToolbarAction[] {
    const activePanel = panelState.activePanel;
    const icons = toolbarIcons();
    const actions: MmoUiToolbarAction[] = [
      { id: "quest", label: "Quest", icon: icons.quest, title: "Quest", active: activePanel === "quest" },
      { id: "event", label: "Event", icon: icons.event, title: "World Event", active: activePanel === "event" },
      { id: "bag", label: "Bag", icon: icons.bag, title: "Bag", active: activePanel === "bag" },
      { id: "gear", label: "Gear", icon: icons.gear, title: "Gear", active: activePanel === "gear" },
      { id: "skills", label: "Skills", icon: icons.skills, title: "Skills", active: activePanel === "skills" },
      { id: "stats", label: "Stats", icon: icons.stats, title: "Stats", active: activePanel === "stats" },
      { id: "catalog", label: "Codex", icon: icons.catalog, title: "Codex", active: activePanel === "catalog" },
      { id: "journal", label: "Journal", icon: icons.journal, title: "Field Journal", active: activePanel === "journal" },
      { id: "craft", label: "Craft", icon: icons.craft, title: "Craft", active: activePanel === "craft" },
      { id: "map", label: "Map", icon: icons.map, title: "World Map (M)" },
      { id: "world", label: "World", icon: icons.world, title: "Shared World" },
      { id: "dungeon", label: "Dungeon", icon: icons.dungeon, title: "Dungeon" },
      { id: "cottage", label: "Cottage", icon: icons.cottage, title: "Cottage" },
      ...(showDevCheats ? [{ id: "dev-heal", label: "Heal", icon: icons.heal, title: "Heal" }] : [])
    ];
    if (!latestPlayer || !noviceRevealActive(latestPlayer)) return actions;
    const noviceIds = new Set(["quest", "bag", "skills", "catalog", "journal", "map", "dev-heal"]);
    return actions.filter((action) => noviceIds.has(action.id));
  }

  function ownedItem(player: PlayerEntity, id: string) {
    const quantity = itemQty(player, id);
    return quantity > 0 ? { id, name: itemLabel(id), quantity, description: itemMeta(id, player) } : undefined;
  }

  function itemIcon(id: string, alt = "") {
    const frame = document.createElement("span");
    frame.className = "mmo-item-icon";
    const img = document.createElement("img");
    img.src = itemIconSrc(id);
    img.alt = alt;
    img.loading = "lazy";
    frame.append(img);
    return frame;
  }

  function namedBody(nameText: string, metaText = "") {
    const body = document.createElement("span");
    body.className = "mmo-item-body";
    const name = document.createElement("span");
    name.className = "mmo-item-name";
    name.textContent = nameText;
    const meta = document.createElement("span");
    meta.className = "mmo-item-meta";
    meta.textContent = metaText;
    body.append(name, meta);
    return body;
  }

  function panelStack(...children: HTMLElement[]) {
    const wrap = document.createElement("div");
    wrap.className = "mmo-panel-stack";
    wrap.replaceChildren(...children);
    return wrap;
  }

  function panelSection(titleText: string, ...children: HTMLElement[]) {
    const section = document.createElement("section");
    section.className = "mmo-panel-section";
    const header = document.createElement("div");
    header.className = "mmo-section-head";
    header.textContent = titleText;
    section.append(header, ...children);
    return section;
  }

  function progressPill(label: string, value: number, max: number, suffix = "") {
    const wrap = document.createElement("div");
    wrap.className = "mmo-progress-pill";
    const safeMax = Math.max(1, max);
    const clamped = Math.max(0, Math.min(safeMax, value));
    const top = document.createElement("div");
    top.className = "mmo-progress-label";
    const left = document.createElement("span");
    left.textContent = label;
    const right = document.createElement("strong");
    right.textContent = suffix || `${Math.floor(clamped)}/${Math.floor(safeMax)}`;
    top.append(left, right);
    const track = document.createElement("div");
    track.className = "mmo-progress-track";
    const fill = document.createElement("div");
    fill.className = "mmo-progress-fill";
    fill.style.width = `${clamped / safeMax * 100}%`;
    track.append(fill);
    wrap.append(top, track);
    return wrap;
  }

  function statChip(label: string, value: string | number, title?: string) {
    const chip = document.createElement("div");
    chip.className = "mmo-stat-chip";
    chip.title = title ?? `${label}: ${value}`;
    const labelNode = document.createElement("span");
    labelNode.textContent = label;
    const valueNode = document.createElement("strong");
    valueNode.textContent = String(value);
    chip.append(labelNode, valueNode);
    return chip;
  }

  function statGrid(chips: HTMLElement[]) {
    const grid = document.createElement("div");
    grid.className = "mmo-stat-grid";
    grid.replaceChildren(...chips);
    return grid;
  }

  function itemButton(item: MmoUiInventoryItem, player?: PlayerEntity) {
    const button = document.createElement("button");
    button.className = `mmo-item-card ce-rarity-${item.rarity ?? "common"}`;
    button.type = "button";
    button.disabled = item.disabled ?? false;
    const equippable = ["mace", "bow", "staff", "wand", "twin-blades", "blade"].includes(item.id);
    const consumable = ["glade-berries", "cinder-ale", "speed-potion"].includes(item.id);
    const actionText = equippable ? "Equip" : consumable ? "Use" : "Inspect";
    button.title = tooltipText(item.name, item.description, actionText);
    button.setAttribute("aria-label", `${actionText} ${item.name}`);
    const count = document.createElement("span");
    count.className = "mmo-item-count";
    count.textContent = String(item.quantity ?? 1);
    button.replaceChildren(itemIcon(item.id), namedBody(item.name, item.description ?? ""), count);
    button.addEventListener("click", () => {
      if (!button.disabled && equippable) {
        if (player) {
          mutablePlayerEquipment(player).weapon = item.id;
          player.equippedWeaponId = item.id;
          invalidateUi();
          renderPanel();
        }
        queueUiInput({ action: "config", devField: "weapon", devText: item.id });
        return;
      }
      if (!button.disabled && ["glade-berries", "cinder-ale", "speed-potion"].includes(item.id)) {
        queueUiInput({ action: "use-item", itemId: item.id });
      }
    });
    return button;
  }

  function gridPanel(children: HTMLElement[]) {
    const grid = document.createElement("div");
    grid.className = "mmo-card-grid";
    grid.replaceChildren(...children);
    return grid;
  }

  function textRows(rows: string[]) {
    const wrap = document.createElement("div");
    wrap.className = "mmo-text-list";
    for (const row of rows) {
      const line = document.createElement("div");
      line.textContent = row;
      wrap.append(line);
    }
    return wrap;
  }

  function catalogEntries(sectionId: CatalogSectionId): readonly MmoCatalogDef[] {
    return mmoCatalog[sectionId];
  }

  function catalogViewTabs() {
    const tabs = document.createElement("div");
    tabs.className = "mmo-tab-strip";
    tabs.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
    for (const mode of [
      { id: "nearby", label: "Nearby", title: "Known through the current route and local rumors" },
      { id: "all", label: "World", title: "All known names, including rumors" }
    ] as const) {
      const button = document.createElement("button");
      const active = catalogViewMode === mode.id;
      button.className = `mmo-tab${active ? " is-active" : ""}`;
      button.type = "button";
      button.textContent = mode.label;
      button.title = mode.title;
      button.addEventListener("click", () => {
        if (catalogViewMode === mode.id) return;
        catalogViewMode = mode.id;
        invalidateUi();
        renderPanel();
      });
      tabs.append(button);
    }
    return tabs;
  }

  function catalogTabs() {
    const tabs = document.createElement("div");
    tabs.className = "mmo-tab-strip";
    for (const section of CATALOG_SECTIONS) {
      const button = document.createElement("button");
      const active = section.id === catalogSection;
      button.className = `mmo-tab${active ? " is-active" : ""}`;
      button.type = "button";
      button.textContent = section.label;
      button.title = section.title;
      button.addEventListener("click", () => {
        if (catalogSection === section.id) return;
        catalogSection = section.id;
        invalidateUi();
        renderPanel();
      });
      tabs.append(button);
    }
    return tabs;
  }

  function catalogEntryRow(player: PlayerEntity, entry: MmoCatalogDef) {
    const row = document.createElement("div");
    const discovered = catalogEntryDiscovered(player, entry);
    row.className = `mmo-skill-card${discovered ? "" : " is-locked"}`;
    row.style.cursor = "default";

    const top = document.createElement("div");
    top.style.display = "grid";
    top.style.gridTemplateColumns = "minmax(0, 1fr) auto";
    top.style.gap = "8px";
    top.style.alignItems = "baseline";

    const name = document.createElement("strong");
    name.textContent = entry.name;
    name.style.color = "#f3ead7";
    name.style.fontSize = "12px";
    name.style.lineHeight = "1.2";
    name.style.minWidth = "0";
    name.style.overflowWrap = "anywhere";

    const meta = document.createElement("span");
    meta.textContent = discovered ? `${labelize(entry.zoneId)} | ${labelize(entry.role)}` : "Rumor";
    meta.style.color = "#b9a98e";
    meta.style.fontSize = "10px";
    meta.style.whiteSpace = "nowrap";

    const summary = document.createElement("div");
    summary.textContent = catalogEntryHint(player, entry);
    summary.style.color = "#d9cfb8";
    summary.style.fontSize = "11px";
    summary.style.lineHeight = "1.3";
    summary.style.overflowWrap = "anywhere";

    top.append(name, meta);
    row.append(top, summary);
    return row;
  }

  function catalogGroup(player: PlayerEntity, label: string, entries: readonly MmoCatalogDef[], open: boolean) {
    const details = document.createElement("details");
    details.className = "mmo-panel-section";
    details.open = open;

    const summary = document.createElement("summary");
    summary.textContent = `${label} (${entries.length})`;
    summary.style.cursor = "pointer";
    summary.style.color = "#d8b56a";
    summary.style.fontWeight = "800";
    summary.style.fontSize = "12px";

    const rows = document.createElement("div");
    rows.className = "mmo-card-grid";
    rows.style.marginTop = "6px";
    for (const entry of entries) rows.append(catalogEntryRow(player, entry));

    details.append(summary, rows);
    return details;
  }

  function groupedCatalogEntries(player: PlayerEntity, entries: readonly MmoCatalogDef[]) {
    const section = catalogSectionById(catalogSection);
    const groups = new Map<string, MmoCatalogDef[]>();
    for (const entry of entries) {
      const key = section.groupBy === "zone" ? entry.zoneId : entry.role;
      const group = groups.get(key) ?? [];
      group.push(entry);
      groups.set(key, group);
    }

    const keys = [...groups.keys()];
    if (section.groupBy === "zone") {
      keys.sort((left, right) => {
        if (left === player.zoneId) return -1;
        if (right === player.zoneId) return 1;
        return labelize(left).localeCompare(labelize(right));
      });
    }

    return keys.map((key, index) => ({
      label: section.groupBy === "zone" && key === player.zoneId ? `${labelize(key)} nearby` : labelize(key),
      entries: groups.get(key) ?? [],
      open: index === 0
    }));
  }

  function catalogContent(player: PlayerEntity) {
    const section = catalogSectionById(catalogSection);
    const entries = catalogEntries(catalogSection);
    const visibleEntries = catalogViewMode === "nearby" ? entries.filter((entry) => catalogEntryDiscovered(player, entry)) : entries;
    const groups = groupedCatalogEntries(player, visibleEntries);
    const title = document.createElement("div");
    title.className = "mmo-section-head";
    title.textContent = `${section.title} (${visibleEntries.length}/${entries.length})`;
    return panelStack(catalogViewTabs(), catalogTabs(), title, ...groups.map((group) => catalogGroup(player, group.label, group.entries, group.open)));
  }

  function journalEntryCard(player: PlayerEntity, entry: FieldJournalEntry) {
    const done = entry.complete(player);
    const row = document.createElement("div");
    row.className = `mmo-skill-card${done ? " is-complete" : ""}`;
    row.style.cursor = "default";

    const top = document.createElement("div");
    top.style.display = "grid";
    top.style.gridTemplateColumns = "minmax(0, 1fr) auto";
    top.style.gap = "8px";
    top.style.alignItems = "baseline";

    const name = document.createElement("span");
    name.className = "mmo-skill-name";
    name.textContent = entry.title;

    const badge = document.createElement("span");
    badge.className = "mmo-status-badge";
    badge.textContent = done ? "Marked" : labelize(entry.kind);

    const summary = document.createElement("span");
    summary.className = "mmo-skill-meta";
    summary.textContent = entry.summary(player);

    const unlock = document.createElement("span");
    unlock.className = "mmo-skill-meta";
    unlock.textContent = `Opens: ${entry.unlock}`;

    const clue = document.createElement("span");
    clue.className = "mmo-skill-meta";
    clue.textContent = `${labelize(entry.zoneId)} | ${entry.clue}`;

    top.append(name, badge);
    row.append(top, summary, unlock, clue);
    return row;
  }

  function fieldAdviceTitle(player: PlayerEntity) {
    if (hasQuestFlag(player, `${PROVING_CONTRACT_ID}-accepted`) && !hasQuestFlag(player, PROVING_CONTRACT_ID)) return "First Arms";
    if (!hasQuestFlag(player, "first-cut")) return "Rowan's Margin";
    if (!hasQuestFlag(player, "wolf-culling")) return "Road Note";
    if (!hasQuestFlag(player, "final-cut")) return "Rowan's Pledge";
    if (!hasQuestFlag(player, "fast-travel-registered")) return "Dock Note";
    if (!hasInventoryItem(player, "pickaxe") && !Boolean(player.equipment?.pickaxe)) return "Forge Note";
    if (!hasQuestFlag(player, "heavy-lifting")) return "Ore Ledger";
    if (!hasQuestFlag(player, "silent-sands")) return "Bazaar Note";
    return "Field Note";
  }

  function fieldAdviceRows(player: PlayerEntity) {
    const current = nextGoal(player);
    const early = latestState ? earlyLoopAction(latestState, player) : undefined;
    const returnRow = latestState ? earlyLoopReturnBriefing(latestState, player) : current;
    if (hasQuestFlag(player, `${PROVING_CONTRACT_ID}-accepted`) && !hasQuestFlag(player, PROVING_CONTRACT_ID)) {
      return [
        early?.hudText ?? current,
        returnRow,
        "The board pays after three loaner trials. Normal First Cut stays available."
      ];
    }
    if (!hasQuestFlag(player, "first-cut")) {
      return [
        early?.hudText ?? current,
        returnRow,
        "Rowan only names heavier lessons after five clean Ash cuts."
      ];
    }
    if (!hasQuestFlag(player, "wolf-culling")) {
      return [
        current,
        returnRow,
        "The road drill waits until the pack stops owning the path."
      ];
    }
    if (!hasQuestFlag(player, "final-cut")) {
      return [
        current,
        returnRow,
        "One last Ashwood pledge makes Marrow's route worth opening."
      ];
    }
    if (!hasQuestFlag(player, "fast-travel-registered")) {
      return [
        current,
        returnRow,
        "Captain Marrow is the next route source; register Ashwood before chasing dock rumors."
      ];
    }
    if (!hasInventoryItem(player, "pickaxe") && !Boolean(player.equipment?.pickaxe)) {
      return [
        current,
        "Ironcrag comes before desert trials. Foreman Iron-Will sells the pick that makes ore work real."
      ];
    }
    if (!hasQuestFlag(player, "heavy-lifting")) {
      return [
        current,
        returnRow,
        `Ore banked: ${Math.min(50, bankQty(player, "iron-ore"))}/50. Kael's desert stance stays a rumor until the foreman marks your work.`
      ];
    }
    if (!hasQuestFlag(player, "silent-sands")) {
      return [
        current,
        returnRow,
        "Master Kael's Q lesson is worth knowing about now; enter the Bazaar when you want pressure."
      ];
    }
    return [
      current,
      returnRow,
      "Marked proofs stay here so a returning route still has a trail."
    ];
  }

  function journalContent(player: PlayerEntity) {
    const entries = FIELD_JOURNAL_ENTRIES.filter((entry) => entry.visible(player));
    const active = entries.filter((entry) => !entry.complete(player));
    const marked = entries.filter((entry) => entry.complete(player));
    return panelStack(
      panelSection(fieldAdviceTitle(player), textRows(fieldAdviceRows(player))),
      ...(active.length ? [panelSection("Field Rumors", gridPanel(active.map((entry) => journalEntryCard(player, entry))))] : []),
      ...(marked.length ? [panelSection("Marked Proof", gridPanel(marked.map((entry) => journalEntryCard(player, entry))))] : [])
    );
  }

  function recipeTitle(recipe: WorldCraftingRecipe) {
    const output = primaryRecipeOutput(recipe);
    return output ? itemLabel(output) : labelize(recipe.id);
  }

  function selectedRecipe() {
    return worldCraftingRecipes.find((recipe) => recipe.id === selectedRecipeId) ?? worldCraftingRecipes[0];
  }

  function recipeRuntimeRoute(recipe: WorldCraftingRecipe) {
    return RUNTIME_CRAFT_ROUTES_BY_OUTPUT[primaryRecipeOutput(recipe)];
  }

  function nearestCraftTarget(player: PlayerEntity, state: MmoSkillDemoState, route: CraftRuntimeRoute | undefined) {
    if (!route) return undefined;
    return Object.values(state.npcs)
      .filter((npc) => npc.hp > 0 && npc.zoneId === player.zoneId && route.npcKinds.includes(npc.kind))
      .map((npc) => ({ npc, distance: Math.hypot(npc.x - player.x, npc.y - player.y) }))
      .sort((left, right) => left.distance - right.distance)[0];
  }

  function stackRows(player: PlayerEntity, stacks: WorldCraftingRecipe["inputs"], kind: "input" | "output") {
    const rows = document.createElement("div");
    rows.className = "mmo-card-grid";
    for (const stack of stacks) {
      const owned = itemQty(player, stack.itemId);
      const ready = kind === "output" || owned >= stack.amount;
      const row = document.createElement("div");
      row.className = `mmo-item-card${ready ? " is-active" : ""}`;
      const count = document.createElement("span");
      count.textContent = kind === "input" ? `bag ${owned}` : hasInventoryItem(player, stack.itemId) ? "owned" : "";
      count.className = "mmo-item-count";
      row.append(itemIcon(stack.itemId), namedBody(`${stack.amount}x ${itemLabel(stack.itemId)}`, ready ? "Ready" : "Needed"), count);
      rows.append(row);
    }
    return rows;
  }

  function recipeActionStatus(player: PlayerEntity, state: MmoSkillDemoState, recipe: WorldCraftingRecipe) {
    const route = recipeRuntimeRoute(recipe);
    const target = nearestCraftTarget(player, state, route);
    if (!route) return { route, target, ready: false, text: "Inspect only: no runtime station action for this output yet." };
    if (!target) return { route, target, ready: false, text: `${route.label} absent in ${labelize(player.zoneId)}.` };
    if (target.distance > 96) return { route, target, ready: false, text: `${route.label} too far: ${Math.round(target.distance)}px.` };
    return { route, target, ready: true, text: `${route.label} ready: ${labelize(target.npc.kind)}.` };
  }

  function craftContent(player: PlayerEntity, state: MmoSkillDemoState) {
    const recipe = selectedRecipe();
    if (!recipe) {
      return panelSection("Recipes", textRows(["No world recipes loaded."]));
    }

    const picker = document.createElement("select");
    picker.value = recipe.id;
    picker.title = "Recipe";
    picker.style.minHeight = "32px";
    picker.style.width = "100%";
    picker.style.minWidth = "0";
    picker.style.color = "#f5f3e8";
    picker.style.background = "#151c12";
    picker.style.border = "1px solid rgba(185, 169, 142, 0.48)";
    picker.style.borderRadius = "5px";
    picker.style.padding = "6px 8px";
    picker.style.font = "700 12px Inter, ui-sans-serif, system-ui, sans-serif";
    for (const optionRecipe of worldCraftingRecipes) {
      const option = document.createElement("option");
      option.value = optionRecipe.id;
      option.textContent = `${recipeTitle(optionRecipe)} - ${labelize(optionRecipe.factionId)}`;
      picker.append(option);
    }
    picker.addEventListener("change", () => {
      selectedRecipeId = picker.value;
      invalidateUi();
      renderPanel();
    });

    const actionStatus = recipeActionStatus(player, state, recipe);

    const button = document.createElement("button");
    button.className = "mmo-compact-button";
    button.type = "button";
    button.disabled = !actionStatus.ready || !actionStatus.route || !actionStatus.target;
    button.textContent = actionStatus.ready && actionStatus.route ? `${labelize(actionStatus.route.action)} station` : "Inspect";
    button.title = button.disabled ? actionStatus.text : `Send ${actionStatus.route?.action ?? "interact"} to ${labelize(actionStatus.target?.npc.kind ?? "station")}`;
    button.addEventListener("click", () => {
      if (!actionStatus.ready || !actionStatus.route || !actionStatus.target) return;
      queueUiInput({
        action: actionStatus.route.action,
        targetId: actionStatus.target.npc.id,
        devField: "recipe",
        devText: recipe.id
      });
    });

    return panelStack(
      picker,
      panelSection("Recipe", textRows([
        recipeTitle(recipe),
        `${labelize(recipe.station)} | ${labelize(recipe.factionId)}`,
        recipe.summary
      ])),
      panelSection("Inputs", stackRows(player, recipe.inputs, "input")),
      panelSection("Outputs", stackRows(player, recipe.outputs, "output")),
      panelSection("Station", textRows([
        actionStatus.text,
        actionStatus.route?.note ?? "Recipe remains visible for planning until runtime adds station support."
      ]), button)
    );
  }

  function inventoryContent(player: PlayerEntity) {
    const wallet: MmoUiInventoryItem[] = [
      { id: "gold", name: itemLabel("gold"), quantity: player.gold, description: "Spend at trainers" },
      { id: "renown", name: itemLabel("renown"), quantity: player.renown, description: `Mastery ${player.masteryRank}` }
    ];
    const resources: MmoUiInventoryItem[] = [
      { id: "ash-logs", name: itemLabel("ash-logs"), quantity: itemQty(player, "ash-logs"), description: `Bank ${bankQty(player, "ash-logs")}` },
      { id: "iron-ore", name: itemLabel("iron-ore"), quantity: itemQty(player, "iron-ore"), description: `Bank ${bankQty(player, "iron-ore")}` },
      { id: "silk-thread", name: itemLabel("silk-thread"), quantity: itemQty(player, "silk-thread"), description: "Bazaar drops" }
    ];
    const consumables: MmoUiInventoryItem[] = [
      { id: "glade-berries", name: itemLabel("glade-berries"), quantity: itemQty(player, "glade-berries"), description: "Use: heal", disabled: itemQty(player, "glade-berries") <= 0 },
      { id: "cinder-ale", name: itemLabel("cinder-ale"), quantity: itemQty(player, "cinder-ale"), description: "Use: mana", disabled: itemQty(player, "cinder-ale") <= 0 },
      { id: "speed-potion", name: itemLabel("speed-potion"), quantity: itemQty(player, "speed-potion"), description: "Use: speed", disabled: itemQty(player, "speed-potion") <= 0 }
    ];
    const owned = KEY_ITEM_ORDER.map((id) => ownedItem(player, id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const weapons = owned.filter((item) => ["bow", "staff", "wand", "twin-blades", "blade"].includes(item.id));
    const keyItems = owned.filter((item) => !weapons.includes(item));
    return panelStack(
      panelSection("Currencies", gridPanel(wallet.map((item) => itemButton(item, player)))),
      panelSection("Resources", gridPanel(resources.map((item) => itemButton(item, player)))),
      panelSection("Consumables", gridPanel(consumables.map((item) => itemButton(item, player)))),
      ...(weapons.length ? [panelSection("Weapons", gridPanel(weapons.map((item) => itemButton(item, player))))] : []),
      ...(keyItems.length ? [panelSection("Key Items", gridPanel(keyItems.map((item) => itemButton(item, player))))] : [])
    );
  }

  function gearContent(player: PlayerEntity) {
    return gridPanel(EQUIPMENT_SLOTS.map((slot) => {
      const equipment = playerEquipment(player);
      const equipped = slot.choices.find((id) => equipment[id] || Object.values(equipment).includes(id)) ?? slot.choices.find((id) => hasInventoryItem(player, id));
      const button = document.createElement("button");
      button.className = "mmo-item-card";
      button.type = "button";
      button.title = equipped ? itemMeta(equipped, player) : slot.empty;
      button.setAttribute("aria-label", `${slot.title}: ${equipped ? itemLabel(equipped) : "Empty"}`);
      button.replaceChildren(
        itemIcon(equipped ?? "empty"),
        namedBody(slot.title, equipped ? itemLabel(equipped) : slot.empty),
        document.createElement("span")
      );
      return button;
    }));
  }

  function noviceRevealActive(player: PlayerEntity) {
    return !noviceUiBypass && !hasQuestFlag(player, "heavy-lifting");
  }

  function weaponStoryStatus(player: PlayerEntity, weaponId: string, owned: boolean) {
    if (owned) return "Owned";
    switch (weaponId) {
      case "bow":
        return hasQuestFlag(player, "wolf-culling") ? "Scout Elara" : "Road rumor";
      case "staff":
      case "wand":
        return hasQuestFlag(player, "final-cut") ? "Aetheria rumor" : "Dock rumor";
      case "twin-blades":
        return hasQuestFlag(player, "fast-travel-registered") ? "Port Marrow" : "Captain rumor";
      case "blade":
        return hasQuestFlag(player, "first-cut") ? "Ironcrag rumor" : "Forge rumor";
      default:
        return "Rumor";
    }
  }

  function noviceCombatSlots(player: PlayerEntity): CombatSlot[] {
    const slots: CombatSlot[] = ["LMB", "RMB"];
    if (hasQuestFlag(player, "first-cut") || hasQuestFlag(player, "wolf-culling")) slots.push("Space");
    if (hasQuestFlag(player, "heavy-lifting") || hasQuestFlag(player, "heavy-lifting-ready") || player.zoneId === "bazaar") slots.push("Q");
    if (hasQuestFlag(player, "silent-sands") || hasQuestFlag(player, "root-of-the-problem") || player.dungeonBossKills > 0) slots.push("E");
    if (player.masteryRank >= 2 || hasQuestFlag(player, "breaking-golem") || hasQuestFlag(player, "kings-foil")) slots.push("R");
    return slots;
  }

  function noviceAbilityContent(player: PlayerEntity) {
    const weaponId = equippedWeaponForPlayer(player);
    const weaponRow = document.createElement("div");
    weaponRow.className = "mmo-card-grid";
    for (const weapon of Object.values(weaponMetadata)) {
      const owned = weapon.id === "mace" || hasInventoryItem(player, weapon.id) || Boolean(playerEquipment(player)[weapon.id]);
      const selectable = owned || weapon.id === weaponId;
      const button = document.createElement("button");
      button.className = `mmo-item-card${weapon.id === weaponId ? " is-active" : ""}${selectable ? "" : " is-locked"}`;
      button.type = "button";
      button.disabled = !selectable;
      button.title = selectable ? `Use ${weapon.name}` : weaponStoryStatus(player, weapon.id, owned);
      button.setAttribute("aria-label", selectable ? `Use ${weapon.name}` : `${weapon.name} ${weaponStoryStatus(player, weapon.id, owned)}`);
      button.replaceChildren(
        itemIcon(weapon.id),
        namedBody(weapon.name, selectable ? (weapon.id === weaponId ? "Equipped" : "Owned") : weaponStoryStatus(player, weapon.id, owned)),
        document.createElement("span")
      );
      button.addEventListener("click", () => {
        if (!button.disabled) {
          mutablePlayerEquipment(player).weapon = weapon.id;
          player.equippedWeaponId = weapon.id;
          queueUiInput({ action: "config", devField: "weapon", devText: weapon.id });
          invalidateUi();
          renderPanel();
        }
      });
      weaponRow.append(button);
    }

    const slotRow = document.createElement("div");
    slotRow.className = "mmo-card-grid";
    for (const slot of noviceCombatSlots(player)) {
      const reveal = fieldSlotReveal(player, slot);
      const button = document.createElement("button");
      button.className = `mmo-skill-card${reveal.unlocked ? " is-active" : " is-locked"}`;
      button.type = "button";
      button.disabled = !reveal.unlocked;
      const name = document.createElement("span");
      name.className = "mmo-skill-name";
      name.textContent = `${slot} ${abilityNameForSlot(player, slot)}`;
      const meta = document.createElement("span");
      meta.className = "mmo-skill-meta";
      meta.textContent = reveal.unlocked ? reveal.status : reveal.hint;
      button.replaceChildren(name, meta);
      button.title = reveal.unlocked ? abilityTooltipTitle(player, slot, selectedAbilityForSlot(player, slot), false) : reveal.hint;
      slotRow.append(button);
    }

    const fullLoadoutButton = document.createElement("button");
    fullLoadoutButton.className = "mmo-compact-button";
    fullLoadoutButton.type = "button";
    fullLoadoutButton.textContent = "Full Loadout";
    fullLoadoutButton.title = "Show every owned and locked combat slot.";
    fullLoadoutButton.addEventListener("click", () => {
      noviceUiBypass = true;
      const nextParams = new URLSearchParams(location.search);
      nextParams.set("novice", "0");
      history.replaceState(null, "", `${location.pathname}?${nextParams.toString()}${location.hash}`);
      invalidateUi();
      shell.setToolbarActions(toolbarActions());
      renderPanel();
    });

    return panelStack(
      panelSection(fieldAdviceTitle(player), textRows(fieldAdviceRows(player)), fullLoadoutButton),
      panelSection("Weapon", weaponRow),
      panelSection("Lessons", slotRow)
    );
  }

  function abilityContent(player: PlayerEntity) {
    if (noviceRevealActive(player)) return noviceAbilityContent(player);
    const weaponId = equippedWeaponForPlayer(player);
    const rows: HTMLElement[] = [];
    const weaponRow = document.createElement("div");
    weaponRow.className = "mmo-card-grid";
    for (const weapon of Object.values(weaponMetadata)) {
      const button = document.createElement("button");
      const owned = weapon.id === "mace" || hasInventoryItem(player, weapon.id) || Boolean(playerEquipment(player)[weapon.id]);
      button.className = `mmo-item-card${weapon.id === weaponId ? " is-active" : ""}`;
      button.type = "button";
      button.disabled = !owned;
      button.title = owned ? `Use ${weapon.name}` : "Not owned";
      button.setAttribute("aria-label", owned ? `Use ${weapon.name}` : `${weapon.name} locked`);
      button.replaceChildren(
        itemIcon(weapon.id),
        namedBody(weapon.name, owned ? (weapon.id === weaponId ? "Equipped" : "Owned") : "Locked"),
        document.createElement("span")
      );
      button.addEventListener("click", () => {
        if (!button.disabled) {
          mutablePlayerEquipment(player).weapon = weapon.id;
          player.equippedWeaponId = weapon.id;
          queueUiInput({ action: "config", devField: "weapon", devText: weapon.id });
          invalidateUi();
          renderPanel();
        }
      });
      weaponRow.append(button);
    }
    rows.push(panelSection("Weapon", weaponRow));
    for (const slot of COMBAT_SLOTS) {
      const wrap = document.createElement("div");
      wrap.className = "mmo-panel-section";
      const title = document.createElement("div");
      title.className = "mmo-section-head";
      title.textContent = slot;
      const options = document.createElement("div");
      options.className = "mmo-card-grid";
      const selected = selectedAbilityForSlot(player, slot);
      const reveal = fieldSlotReveal(player, slot);
      for (const abilityId of abilityOptionsForSlot(weaponId, slot)) {
        const ability = playerAbilityMetadata[abilityId];
        const knowsAbility = Boolean(playerAbilitySlots(player)[abilityId]);
        const known = knowsAbility && reveal.unlocked;
        const button = document.createElement("button");
        button.className = `mmo-skill-card${abilityId === selected && known ? " is-active" : ""}${known ? "" : " is-locked"}`;
        button.type = "button";
        button.disabled = !known;
        const abilityName = ability?.name ?? labelize(abilityId);
        const name = document.createElement("span");
        name.className = "mmo-skill-name";
        name.textContent = abilityName;
        const meta = document.createElement("span");
        meta.className = "mmo-skill-meta";
        meta.textContent = known ? (abilityId === selected ? "Slotted" : "Known") : (knowsAbility ? reveal.status : "Locked");
        button.replaceChildren(name, meta);
        button.title = known ? abilityTooltipTitle(player, slot, abilityId, false) : `${abilityName}\n${knowsAbility ? reveal.hint : "Find the matching trainer or route proof."}`;
        button.setAttribute("aria-label", `${slot} ${abilityName}`);
        button.addEventListener("click", () => {
          if (!button.disabled) {
            mutablePlayerEquipment(player)[`ability:${slot}`] = abilityId;
            queueUiInput({ action: "config", devField: slot, devText: abilityId });
            invalidateUi();
            renderPanel();
          }
        });
        options.append(button);
      }
      wrap.append(title, options);
      rows.push(wrap);
    }
    return panelStack(...rows);
  }

  function controllerSettingsContent() {
    const wrap = document.createElement("label");
    wrap.className = "mmo-slider-row";

    const title = document.createElement("span");
    title.textContent = "Controller deadzone";

    const value = document.createElement("span");
    value.textContent = `${Math.round(controllerDeadzone * 100)}%`;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "50";
    slider.step = "1";
    slider.value = String(Math.round(controllerDeadzone * 100));
    slider.title = "Controller deadzone";
    slider.style.width = "100%";
    slider.addEventListener("input", () => {
      setControllerDeadzone(Number(slider.value) / 100);
      slider.value = String(Math.round(controllerDeadzone * 100));
      value.textContent = `${Math.round(controllerDeadzone * 100)}%`;
    });

    wrap.append(title, value, slider);
    return wrap;
  }

  function statsContent(player: PlayerEntity, state: MmoSkillDemoState) {
    const selected = COMBAT_SLOTS.map((slot) => `${slot}:${abilityNameForSlot(player, slot)}`).join(" ");
    const weapon = weaponMetadata[equippedWeaponForPlayer(player) as keyof typeof weaponMetadata]?.name ?? equippedWeaponForPlayer(player);
    return panelStack(
      panelSection("Vitals", statGrid([
        statChip("HP", `${player.hp}/${player.maxHp}`),
        statChip("Mana", `${player.mana}/${player.maxMana}`),
        statChip("Energy", `${Math.floor(energyValue(player))}/${Math.floor(energyMax(player))}`),
        statChip("Online", state.activePlayers)
      ])),
      panelSection("Progress", statGrid([
        statChip("Combat", `${player.combatLevel} (${player.combatXp} XP)`),
        statChip("Mining", `${player.miningLevel} (${player.miningXp} XP)`),
        statChip("Woodcut", `${player.woodcuttingLevel} (${player.woodcuttingXp} XP)`),
        statChip("Mastery", `${player.masteryRank} (${player.renown})`)
      ])),
      panelSection("Loadout", textRows([`Weapon: ${weapon}`, `Slots: ${selected}`, `Entities: ${Object.keys(state.entities).length}`])),
      panelSection("Controls", controllerSettingsContent())
    );
  }

  function questRows(player: PlayerEntity) {
    const contract = contractInfo(player.contractId);
    const accepted = Object.keys(playerQuestFlags(player))
      .filter((flag) => flag.endsWith("-accepted") && !hasQuestFlag(player, flag.slice(0, -"accepted".length - 1)))
      .map((flag) => labelize(flag.slice(0, -"accepted".length - 1)))
      .join(", ");
    return [
      `Next: ${nextGoal(player)}`,
      ...(latestState && !hasQuestFlag(player, "heavy-lifting") ? [`Return: ${earlyLoopReturnBriefing(latestState, player)}`] : []),
      `Accepted: ${accepted || labelize(player.activeQuestId || "first-cut")}`,
      `Contract: ${contract.name} ${Math.min(contract.targetKills, player.contractKills)}/${contract.targetKills} (${contract.area})${player.contractCooldownMs > 0 ? ` cooldown ${Math.ceil(player.contractCooldownMs / 1000)}s` : ""}`,
      `First Cut: ${Math.min(5, itemQty(player, "ash-logs") + bankQty(player, "ash-logs"))}/5 ${hasQuestFlag(player, "first-cut-ready") ? "ready" : ""}`,
      `Second Cut: ${Math.min(12, itemQty(player, "ash-logs") + bankQty(player, "ash-logs"))}/12 ${hasQuestFlag(player, "second-cut-ready") ? "ready" : ""}`,
      `Wolf Culling: ${Math.min(10, player.wolfKills)}/10 ${hasQuestFlag(player, "wolf-culling-ready") ? "ready" : ""}`,
      `Final Cut: ${hasQuestFlag(player, "final-cut") ? "done" : hasQuestFlag(player, "final-cut-ready") ? "ready" : "locked"}`,
      `Heavy Lifting: ${Math.min(50, bankQty(player, "iron-ore"))}/50 ${hasQuestFlag(player, "heavy-lifting-ready") ? "ready" : ""}`,
      `Silent Sands: ${Math.min(120, Math.floor(player.bazaarSurvivalMs / 1000))}/120s ${hasQuestFlag(player, "silent-sands-ready") ? "ready" : ""}`
    ];
  }

  function mainQuestContent(player: PlayerEntity) {
    const grid = document.createElement("div");
    grid.className = "mmo-card-grid";
    for (const option of mainQuestOptions(player)) {
      const button = document.createElement("button");
      button.className = `mmo-choice-card${option.active ? " is-active" : ""}`;
      button.type = "button";
      button.disabled = !option.selectable || option.active;
      button.title = option.active ? option.summary : `Track ${option.label}`;
      const name = document.createElement("span");
      name.className = "mmo-item-name";
      name.textContent = option.label;
      const meta = document.createElement("span");
      meta.className = "mmo-item-meta";
      meta.textContent = `${option.status} ${Math.min(option.value, option.max)}/${Math.max(1, option.max)}`;
      button.replaceChildren(name, meta);
      button.addEventListener("click", () => {
        if (button.disabled) return;
        player.activeQuestId = option.id;
        queueUiInput({ action: "config", devField: "mainQuest", devText: option.id });
        invalidateUi();
        renderPanel();
      });
      grid.append(button);
    }
    return panelSection("Main Quest", grid);
  }

  function dailyQuestContent(player: PlayerEntity) {
    const arc = dailyQuestArcForDate(player.dailyQuestDate || currentUtcDateString());
    const step = arc.steps[player.dailyQuestStep || 0];
    const progress = step ? Math.min(step.targetCount, player.dailyQuestProgress || 0) : 0;
    const ready = Boolean(step && progress >= step.targetCount);
    const rows = [`Factions: ${labelize(arc.primaryFaction)} / ${labelize(arc.rivalFaction)}`];
    if (step && !player.dailyQuestCompleted) rows.push(step.instructions);
    if (step?.masteryGate && !player.dailyQuestCompleted) rows.push(`Gate: ${step.masteryGate}`);
    if (step?.progressionPayoff && !player.dailyQuestCompleted) rows.push(`Payoff: ${step.progressionPayoff}`);
    if (player.dailyQuestResult) rows.push(player.dailyQuestResult);

    const dailyProgress = player.dailyQuestCompleted || !step
      ? progressPill(arc.title, 1, 1, "complete")
      : progressPill(step.title, progress, step.targetCount);
    const wrap = panelSection("Daily", dailyProgress, textRows(rows));
    if (step && !player.dailyQuestCompleted) {
      const choices = document.createElement("div");
      choices.className = "mmo-card-grid";
      for (const choice of step.choices) {
        const button = document.createElement("button");
        button.className = "mmo-choice-card";
        button.type = "button";
        button.disabled = !ready;
        button.textContent = choice.text;
        button.title = ready ? choice.resultingText : "Finish the active daily objective first.";
        button.addEventListener("click", () => {
          if (button.disabled) return;
          queueUiInput({ action: "config", devField: "dailyChoice", devText: choice.id });
          invalidateUi();
          renderPanel();
        });
        choices.append(button);
      }
      wrap.append(choices);
    }
    return wrap;
  }

  function provingButton(label: string, command: string, disabled: boolean, title: string) {
    const button = document.createElement("button");
    button.className = "mmo-choice-card";
    button.type = "button";
    button.disabled = disabled;
    button.textContent = label;
    button.title = title;
    button.addEventListener("click", () => {
      if (button.disabled) return;
      queueUiInput({ action: "config", devField: "proving", devText: command });
      invalidateUi();
      renderPanel();
    });
    return button;
  }

  function provingContractContent(player: PlayerEntity) {
    const accepted = hasQuestFlag(player, `${PROVING_CONTRACT_ID}-accepted`);
    const complete = hasQuestFlag(player, PROVING_CONTRACT_ID);
    const sampleCount = provingSampleCount(player);
    const rows = complete
      ? [`First Arms paid out. Chosen weapon, starter purse, next action: ${nextGoal(player)}`]
      : accepted
        ? [`Loaner trials: ${sampleCount}/3. Choose one reward weapon after three trials. Fallback: cut Ash tree.`]
        : ["Optional paid contract: try loaner weapons, keep one, and take a starter purse."];
    const section = panelSection("First Arms", textRows(rows));

    if (!accepted && !complete) {
      section.append(provingButton("Accept Paid Trial", "accept", false, "Open the optional proving contract."));
      return section;
    }

    const samples = document.createElement("div");
    samples.className = "mmo-card-grid";
    for (const weaponId of PROVING_WEAPONS) {
      const name = weaponMetadata[weaponId]?.name ?? labelize(weaponId);
      const sampled = hasQuestFlag(player, provingSampleFlag(weaponId));
      const chosen = hasQuestFlag(player, provingRewardFlag(weaponId));
      if (!complete) {
        samples.append(provingButton(sampled ? `${name} Tried` : `Try ${name}`, `sample:${weaponId}`, false, sampled ? "Try this loaner again." : "Equip this loaner for the proving yard."));
        samples.append(provingButton(chosen ? `${name} Kept` : `Keep ${name}`, `choose:${weaponId}`, sampleCount < 3, sampleCount < 3 ? "Try three loaners first." : "Keep this weapon and claim the starter purse."));
      } else if (chosen) {
        samples.append(provingButton(`${name} Kept`, `choose:${weaponId}`, true, "Chosen First Arms reward."));
      }
    }
    if (samples.childElementCount) section.append(samples);
    return section;
  }

  function provingLessonsContent(player: PlayerEntity) {
    if (!hasQuestFlag(player, PROVING_CONTRACT_ID)) {
      return panelSection("Lesson Contracts", textRows(["Finish First Arms to open paid lessons for statuses, crafting, buffs, gathering, cities, and travel."]));
    }
    const grid = document.createElement("div");
    grid.className = "mmo-card-grid";
    for (const lesson of PROVING_LESSONS) {
      const complete = hasQuestFlag(player, provingLessonFlag(lesson.id));
      const button = provingButton(complete ? `${lesson.title} Paid` : lesson.title, `lesson:${lesson.id}`, complete, complete ? lesson.reward : `${lesson.note} Reward: ${lesson.reward}.`);
      grid.append(button);
    }
    return panelSection("Lesson Contracts", grid);
  }

  function questContent(player: PlayerEntity) {
    const contract = contractInfo(player.contractId);
    return panelStack(
      mainQuestContent(player),
      provingContractContent(player),
      provingLessonsContent(player),
      dailyQuestContent(player),
      panelSection("Next", textRows([nextGoal(player)])),
      panelSection("Contract", progressPill(contract.name, Math.min(contract.targetKills, player.contractKills), contract.targetKills, `${Math.min(contract.targetKills, player.contractKills)}/${contract.targetKills}`)),
      panelSection("Quest Log", textRows(questRows(player).slice(3)))
    );
  }

  function eventContent(state: MmoSkillDemoState) {
    return panelStack(
      panelSection("World Event", progressPill(state.worldEventName, Math.min(state.worldEventGoal, state.worldEventProgress), Math.max(1, state.worldEventGoal), `${Math.min(state.worldEventGoal, state.worldEventProgress)}/${state.worldEventGoal}`)),
      panelSection("Objective", textRows([state.worldEventObjective, worldEventLine(state), state.worldEventReward]))
    );
  }

  function renderPanel() {
    const player = latestPlayer;
    const state = latestState;
    const activePanel = panelState.activePanel;
    if (!player || !state || !activePanel) {
      shell.setPanels([]);
      setPanelWindowVisible(false);
      lastPanelKey = "";
      return;
    }

    const key = `${player.id}:${panelRenderKey(activePanel, player, state)}:${activePanel === "catalog" ? `${catalogSection}:${catalogViewMode}` : activePanel === "craft" ? selectedRecipeId : ""}`;
    if (key === lastPanelKey) return;

    const panel =
      activePanel === "quest"
        ? { id: "quest", title: "Quest", open: true, content: questContent(player) }
        : activePanel === "event"
          ? { id: "event", title: "Event", open: true, content: eventContent(state) }
          : activePanel === "bag"
            ? { id: "bag", title: "Bag", open: true, content: inventoryContent(player) }
            : activePanel === "gear"
              ? { id: "gear", title: "Gear", open: true, content: gearContent(player) }
              : activePanel === "skills"
                ? { id: "skills", title: "Skills", open: true, content: abilityContent(player) }
                : activePanel === "catalog"
                  ? { id: "catalog", title: "Codex", open: true, content: catalogContent(player) }
                  : activePanel === "journal"
                    ? { id: "journal", title: "Field Journal", open: true, content: journalContent(player) }
                    : activePanel === "craft"
                      ? { id: "craft", title: "Craft", open: true, content: craftContent(player, state) }
                      : { id: "stats", title: "Stats", open: true, content: statsContent(player, state) };
    shell.setPanels([panel]);
    setPanelWindowVisible(true);
    lastPanelKey = key;
  }

  function updateKey(player: PlayerEntity | undefined, state: MmoSkillDemoState) {
    if (!player) return "hidden";
    const activePanel = panelState.activePanel;
    const statusKey = `${labelize(player.zoneId)} | ${worldEventLine(state)}`;
    const panelKey = activePanel ? `${panelRenderKey(activePanel, player, state)}:${activePanel === "catalog" ? `${catalogSection}:${catalogViewMode}` : activePanel === "craft" ? selectedRecipeId : ""}` : "";
    return `visible:${player.id}:${statusKey}:${activePanel}:${panelKey}`;
  }

  return {
    open(name: string) {
      panelState.open(name);
      shell.setToolbarActions(toolbarActions());
      invalidateUi();
      renderPanel();
    },
    needsUpdate(player: PlayerEntity | undefined, state: MmoSkillDemoState) {
      return updateKey(player, state) !== lastUiKey;
    },
    update(player: PlayerEntity | undefined, state: MmoSkillDemoState) {
      const nextKey = updateKey(player, state);
      if (nextKey === lastUiKey) return;
      latestPlayer = player;
      latestState = state;
      const hidden = !player;
      if (hidden !== lastHidden) {
        root.hidden = hidden;
        lastHidden = hidden;
      }
      if (!player) {
        renderPanel();
        lastUiKey = nextKey;
        return;
      }
      const nextStatus = `${labelize(player.zoneId)} | ${worldEventLine(state)}`;
      if (nextStatus !== lastStatus) {
        shell.setStatus(nextStatus);
        lastStatus = nextStatus;
      }
      shell.setToolbarActions(toolbarActions());
      renderPanel();
      lastUiKey = nextKey;
    }
  };
}
