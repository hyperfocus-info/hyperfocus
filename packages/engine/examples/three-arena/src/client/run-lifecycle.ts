import { runtimeCallback } from "./runtime-ports.ts";
const playActorAnimation = runtimeCallback("actorAnimation", "playActorAnimation");
const setActorFacing = runtimeCallback("actorAnimation", "setActorFacing");
const setActorOpacity = runtimeCallback("actorAnimation", "setActorOpacity");
const setActorPosition = runtimeCallback("actorAnimation", "setActorPosition");
const ensureAudio = runtimeCallback("audio", "ensureAudio");
const playSynthCue = runtimeCallback("audio", "playSynthCue");
const commitEnemyBillboardBatches = runtimeCallback("combatEntities", "commitEnemyBillboardBatches");
const commitPickupBatches = runtimeCallback("combatEntities", "commitPickupBatches");
const resetEnemyBillboardBatches = runtimeCallback("combatEntities", "resetEnemyBillboardBatches");
const resetPickupBatches = runtimeCallback("combatEntities", "resetPickupBatches");
const toast = runtimeCallback("hud", "toast");
const updateHud = runtimeCallback("hud", "updateHud");
const updateMinimap = runtimeCallback("minimap", "updateMinimap");
const clearBatchedParticles = runtimeCallback("particles", "clearBatchedParticles");
const clearList = runtimeCallback("pointerAndTextures", "clearList");
const closeLevelChoice = runtimeCallback("progressionChoices", "closeLevelChoice");
const levelChoiceCharge = runtimeCallback("progressionChoices", "levelChoiceCharge");
const applyProgressionStats = runtimeCallback("progressionData", "applyProgressionStats");
const selectedClass = runtimeCallback("progressionData", "selectedClass");
const xpForLevel = runtimeCallback("progressionData", "xpForLevel");
const applyClassLoadout = runtimeCallback("progressionRuntime", "applyClassLoadout");
const resetLazyProps = runtimeCallback("props", "resetLazyProps");
const updateWrappedStaticVisuals = runtimeCallback("props", "updateWrappedStaticVisuals");
const clearFloatingTexts = runtimeCallback("rewardFeedback", "clearFloatingTexts");
const showCenterBanner = runtimeCallback("rewardFeedback", "showCenterBanner");
const updateComboReadout = runtimeCallback("rewardFeedback", "updateComboReadout");
const spawnEnemy = runtimeCallback("spawnAndDamage", "spawnEnemy");
const spawnPickup = runtimeCallback("spawnAndDamage", "spawnPickup");
const resetTelemetrySamples = runtimeCallback("telemetryStats", "resetTelemetrySamples");
const updateGroundTilePatch = runtimeCallback("terrain", "updateGroundTilePatch");
const angleTo = runtimeCallback("worldMath", "angleTo");
const getWorldCenter = runtimeCallback("worldMath", "getWorldCenter");
const markEnemySpatialDirty = runtimeCallback("worldMath", "markEnemySpatialDirty");
const weightedPick = runtimeCallback("worldMath", "weightedPick");
const wrapWorld = runtimeCallback("worldMath", "wrapWorld");
const clearControllerFocus = runtimeCallback("inputAndMenu", "clearControllerFocus");
const readCameraRigSnapshot = runtimeCallback("inputAndMenu", "readCameraRigSnapshot");
const resetCameraState = runtimeCallback("inputAndMenu", "resetCameraState");
const resolveCameraOffset = runtimeCallback("inputAndMenu", "resolveCameraOffset");
const setMenuFocus = runtimeCallback("inputAndMenu", "setMenuFocus");
const renderPauseUi = runtimeCallback("lobbyAndSettings", "renderPauseUi");
const clearRemotePlayers = runtimeCallback("networkAndCamera", "clearRemotePlayers");
const setAimFromCamera = runtimeCallback("networkAndCamera", "setAimFromCamera");
const resetVisualIndicators = runtimeCallback("sceneSetup", "resetVisualIndicators");
import { BOSS_PACING, CAMERA_BASE_DISTANCE, CAMERA_DEFAULT_PITCH, CAMERA_TARGET_HEIGHT, HEALTH_VIAL_DROP_MULTIPLIER } from "./constants.ts";
import { PERF_FLAGS } from "./environment.ts";
import { state } from "./arena-state.ts";
import { data } from "./content-runtime.ts";
import { gamepadState } from "./input-context.ts";
import { cameraContext, cameraRig, hudContext, networkClient, pointer, renderer, scene, tempCameraOffset, tempCameraTarget } from "./runtime-context.ts";
import { ui } from "./user-interface.ts";

export function normalizeRunSeed(value: unknown): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric >>> 0;
  const text = String(value ?? "");
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function resetRunRandom(seed = state.runSeed): void {
  state.runRandomState = normalizeRunSeed(seed) || 0x6d2b79f5;
}

export function runRandom(): number {
  state.runRandomState = (state.runRandomState + 0x6d2b79f5) >>> 0;
  let value = state.runRandomState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function startGame(online: boolean, options: Record<string, unknown> = {}): void {
  state.runSeed = online ? normalizeRunSeed(options.seed ?? options.roomId ?? networkClient?.roomId ?? Date.now()) : normalizeRunSeed(crypto.randomUUID?.() ?? `${Date.now()}:${Math.random()}`);
  resetRun();
  state.online = online;
  state.running = true;
  state.paused = false;
  state.pausePanel = "root";
  ui.modeText.textContent = online ? "Lobby" : "Solo";
  ui.menu.classList.add("hidden");
  renderPauseUi();
  document.body.classList.remove("menu-open", "pause-open");
  document.body.classList.add("run-active");
  ensureAudio();
  playSynthCue("start");
  showCenterBanner(selectedClass()?.name ?? "Graveyard Wake", "Take shards fast. Spend the next cache.");
  toast(online ? "Room entered. Stay near your allies." : `${selectedClass()?.name ?? "Class"} entered the yard.`);
  clearControllerFocus();
  requestRunPointerLock();
  resetTelemetrySamples();
}

export function requestRunPointerLock(): void {
  try {
    const request = renderer?.domElement?.requestPointerLock?.();
    request?.catch?.(() => {});
  } catch {
    // Pointer lock can throw synchronously in headless or embedded documents.
  }
}

export function pauseToMenu(): void {
  state.running = false;
  state.paused = false;
  state.pausePanel = "root";
  document.exitPointerLock?.();
  renderPauseUi();
  ui.menu.classList.remove("hidden");
  document.body.classList.add("menu-open");
  document.body.classList.remove("run-active", "pause-open");
  setMenuFocus(gamepadState.menuIndex);
}

export function resetRun(): void {
  const player = state.player;
  if (!player) throw new Error("Cannot reset the run before the player is initialized.");
  resetRunRandom();
  clearList(state.enemies);
  resetEnemyBillboardBatches();
  commitEnemyBillboardBatches();
  markEnemySpatialDirty();
  clearList(state.bullets);
  clearList(state.weaponZones);
  clearList(state.pickups);
  resetPickupBatches();
  commitPickupBatches();
  clearList(state.effects);
  clearBatchedParticles();
  clearList(state.attackIndicators);
  if (state.currentWeaponVisual?.mesh) scene.remove(state.currentWeaponVisual.mesh);
  state.currentWeaponVisual = null;
  for (const ragdoll of state.ragdolls) scene.remove(ragdoll.root);
  state.ragdolls.length = 0;
  state.time = 0;
  state.waveIndex = 0;
  state.spawnClock = 0;
  state.nextBossAt = BOSS_PACING.firstBossSecond;
  state.kills = 0;
  state.level = data.progression?.startLevel ?? 1;
  state.xp = 0;
  state.nextXp = xpForLevel(state.level);
  state.pendingLevelChoices = 0;
  state.levelChoice = null;
  state.classLevelNotice = null;
  state.levelChoiceRerolls = levelChoiceCharge(data.progression?.rerollsStart ?? 0);
  state.levelChoiceBanishes = levelChoiceCharge(data.progression?.banishesStart ?? 0);
  state.banishedLevelChoices.clear();
  state.resumeAfterLevelChoice = false;
  closeLevelChoice();
  applyClassLoadout();
  state.benchStress = null;
  player.name = ui.playerName.value.trim() || "Hunter";
  const start = getWorldCenter();
  player.x = start.x;
  player.z = start.z;
  applyProgressionStats({ fullHeal: true });
  player.jumpY = 0;
  player.jumpVelocityY = 0;
  player.jumpsUsed = 0;
  player.grounded = true;
  player.jumpTrailClock = 0;
  player.floatAssistUntil = 0;
  player.wallRunClock = 0;
  player.terrainSlope = 0;
  player.terrainBlocked = false;
  player.moveMomentumX = 0;
  player.moveMomentumZ = 0;
  player.momentumDustClock = 0;
  player.animationState = "idle";
  player.knockX = 0;
  player.knockZ = 0;
  player.invuln = 0;
  player.animLock = 0;
  for (const tool of state.traversalTools) tool.cooldown = 0;
  state.minimapClock = 0;
  state.hudClock = 0;
  state.staticWrapClock = 0;
  state.lastStaticWrapX = Number.POSITIVE_INFINITY;
  state.lastStaticWrapZ = Number.POSITIVE_INFINITY;
  state.combo = 0;
  state.comboTimer = 0;
  state.magnetPullUntil = 0;
  resetVisualIndicators();
  clearRemotePlayers();
  state.animationPlayCounts = {};
  state.lastAnimationPlay = null;
  clearFloatingTexts();
  updateComboReadout();
  hudContext.lastWeaponKey = "";
  hudContext.lastPassiveKey = "";
  setActorPosition(player, start.x, start.z);
  setActorOpacity(player, 1);
  playActorAnimation(player, "idle", 0.02);
  resetCameraState(0, CAMERA_DEFAULT_PITCH, CAMERA_BASE_DISTANCE);
  cameraRig?.setOffset(resolveCameraOffset().x, tempCameraOffset.y, tempCameraOffset.z);
  cameraRig?.setTarget(tempCameraTarget.set(start.x, CAMERA_TARGET_HEIGHT, start.z)).update(0);
  cameraContext.snapshot = readCameraRigSnapshot();
  pointer.manualAimUntil = 0;
  setAimFromCamera();
  resetLazyProps();
  updateGroundTilePatch(true);
  updateWrappedStaticVisuals(0, true);
  if (!PERF_FLAGS.benchWalkOnly) {
    spawnOpeningPack();
    spawnOpeningLoot();
  }
  updateMinimap(0, true);
  updateHud(0, true);
}

export function spawnOpeningPack(): void {
  const wave = data.waves[0];
  if (!wave) return;
  const start = getWorldCenter();
  for (let i = 0; i < 8; i += 1) {
    spawnEnemy(weightedPick(wave.mix));
    const enemy = state.enemies[state.enemies.length - 1];
    if (!enemy) continue;
    const angle = (Math.PI * 2 * i) / 8 + 0.2;
    const radius = 18 + (i % 3) * 4;
    enemy.x = wrapWorld(start.x + Math.cos(angle) * radius);
    enemy.z = wrapWorld(start.z + Math.sin(angle) * radius);
    setActorPosition(enemy, enemy.x, enemy.z);
    setActorFacing(enemy, angleTo(enemy.x, enemy.z, start.x, start.z));
  }
}

export function spawnOpeningLoot(): void {
  const start = getWorldCenter();
  spawnPickup("weapon", start.x + 5.5, start.z - 4.5);
  if (runRandom() < HEALTH_VIAL_DROP_MULTIPLIER) spawnPickup("heal", start.x - 6.5, start.z + 4.5);
  spawnPickup("xp", start.x + 3.5, start.z + 6);
  spawnPickup("xp", start.x - 4, start.z - 6);
}
