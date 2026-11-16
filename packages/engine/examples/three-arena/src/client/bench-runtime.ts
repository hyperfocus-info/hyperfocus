import { runtimeCallback } from "./runtime-ports.ts";
const playActorAnimation = runtimeCallback("actorAnimation", "playActorAnimation");
const setActorFacing = runtimeCallback("actorAnimation", "setActorFacing");
const setActorPosition = runtimeCallback("actorAnimation", "setActorPosition");
const commitEnemyBillboardBatches = runtimeCallback("combatEntities", "commitEnemyBillboardBatches");
const commitPickupBatches = runtimeCallback("combatEntities", "commitPickupBatches");
const queueEnemyBillboardBatch = runtimeCallback("combatEntities", "queueEnemyBillboardBatch");
const queuePickupBatch = runtimeCallback("combatEntities", "queuePickupBatch");
const resetEnemyBillboardBatches = runtimeCallback("combatEntities", "resetEnemyBillboardBatches");
const resetPickupBatches = runtimeCallback("combatEntities", "resetPickupBatches");
const updateHud = runtimeCallback("hud", "updateHud");
const updateMinimap = runtimeCallback("minimap", "updateMinimap");
const updateCamera = runtimeCallback("networkAndCamera", "updateCamera");
const addBatchedParticle = runtimeCallback("particles", "addBatchedParticle");
const clearBatchedParticles = runtimeCallback("particles", "clearBatchedParticles");
const spawnEffect = runtimeCallback("particles", "spawnEffect");
const updateBatchedParticles = runtimeCallback("particles", "updateBatchedParticles");
const updateGame = runtimeCallback("playerUpdate", "updateGame");
const clearList = runtimeCallback("pointerAndTextures", "clearList");
const closeLevelChoice = runtimeCallback("progressionChoices", "closeLevelChoice");
const xpForLevel = runtimeCallback("progressionData", "xpForLevel");
const getPickupCollectRadius = runtimeCallback("progressionRuntime", "getPickupCollectRadius");
const revealAllPendingProps = runtimeCallback("props", "revealAllPendingProps");
const clearFloatingTexts = runtimeCallback("rewardFeedback", "clearFloatingTexts");
const updateComboReadout = runtimeCallback("rewardFeedback", "updateComboReadout");
const updateFloatingTexts = runtimeCallback("rewardFeedback", "updateFloatingTexts");
const startGame = runtimeCallback("runLifecycle", "startGame");
const spawnEnemy = runtimeCallback("spawnAndDamage", "spawnEnemy");
const spawnPickup = runtimeCallback("spawnAndDamage", "spawnPickup");
const resetTelemetrySamples = runtimeCallback("telemetryStats", "resetTelemetrySamples");
const getTelemetrySnapshot = runtimeCallback("telemetry", "getTelemetrySnapshot");
const recordTelemetry = runtimeCallback("telemetry", "recordTelemetry");
const angleTo = runtimeCallback("worldMath", "angleTo");
const getWorldCenter = runtimeCallback("worldMath", "getWorldCenter");
const markEnemySpatialDirty = runtimeCallback("worldMath", "markEnemySpatialDirty");
const rebuildEnemySpatialGrid = runtimeCallback("worldMath", "rebuildEnemySpatialGrid");
const wrapWorld = runtimeCallback("worldMath", "wrapWorld");
const setInputMode = runtimeCallback("inputAndMenu", "setInputMode");
const renderPauseUi = runtimeCallback("lobbyAndSettings", "renderPauseUi");
const updateVisualIndicators = runtimeCallback("sceneSetup", "updateVisualIndicators");
import { PERF_FLAGS } from "./environment.ts";
import { measureTelemetryPhase, telemetry } from "./telemetry-core.ts";
import { state } from "./arena-state.ts";
import { threeView } from "./boot-context.ts";
import { data } from "./content-runtime.ts";
import { arenaFrameDriver } from "./frame-loop.ts";
import { keys, scene, tempColor } from "./runtime-context.ts";
import { ui } from "./user-interface.ts";
import type { BenchStress } from "./runtime-types.ts";

export async function runBenchWalkSimulation(options: { ms?: number; render?: boolean } = {}) {
  const ms = Math.max(0, Number(options.ms ?? 60_000));
  const renderScene = options.render !== false;
  const dt = 0.016666666666666666;
  const frameGapMs = 16.666666666666668;
  const frames = Math.ceil(ms / frameGapMs);
  keys.add("KeyW");
  setInputMode("keyboard");
  resetTelemetrySamples();
  for (let frame = 0; frame < frames; frame += 1) {
    const frameStart = performance.now();
    const updateStart = frameStart;
    if (state.running) updateGame(dt);
    const updateEnd = performance.now();
    updateCamera(dt);
    measureTelemetryPhase("visualIndicators", () => updateVisualIndicators(dt));
    measureTelemetryPhase("floatingTexts", () => updateFloatingTexts(dt));
    const cameraEnd = performance.now();
    if (renderScene) threeView.render();
    const renderEnd = performance.now();
    recordTelemetry({
      frameMs: renderEnd - frameStart,
      updateMs: updateEnd - updateStart,
      cameraMs: cameraEnd - updateEnd,
      renderMs: renderEnd - cameraEnd,
      dtMs: frameGapMs,
      rawDtMs: frameGapMs,
      frameGapMs
    }, dt);
    if ((frame & 63) === 63) await Promise.resolve();
  }
  keys.delete("KeyW");
  arenaFrameDriver.reset(performance.now());
  telemetry.lastFrameStart = performance.now();
  return getTelemetrySnapshot();
}

export function runBenchStress(config: Partial<BenchStress> & { time?: number } = {}) {
  if (!state.running) startGame(false);
  keys.clear();
  document.body.classList.add("run-active");
  document.body.classList.remove("menu-open", "pause-open");
  ui.menu.classList.add("hidden");
  state.paused = false;
  state.pausePanel = "root";
  renderPauseUi();
  state.pendingLevelChoices = 0;
  state.resumeAfterLevelChoice = false;
  closeLevelChoice();
  state.running = true;
  state.xp = 0;
  state.level = data.progression?.startLevel ?? 1;
  state.nextXp = xpForLevel(state.level);
  state.magnetPullUntil = 0;
  state.combo = 0;
  state.comboTimer = 0;
  updateComboReadout();
  clearFloatingTexts();
  if (state.player) {
    const center = getWorldCenter();
    state.player.x = center.x;
    state.player.z = center.z;
    state.player.hp = state.player.maxHp;
    state.player.invuln = 0;
    state.player.animLock = 0;
    state.player.jumpY = 0;
    state.player.jumpVelocityY = 0;
    state.player.jumpsUsed = 0;
    state.player.grounded = true;
    state.player.moveMomentumX = 0;
    state.player.moveMomentumZ = 0;
    state.player.knockX = 0;
    state.player.knockZ = 0;
    setActorPosition(state.player, center.x, center.z);
    playActorAnimation(state.player, "idle", 0.02);
  }
  state.benchStress = {
    quietCombat: config.quietCombat !== false,
    enemies: Math.max(0, Math.floor(config.enemies ?? 120)),
    pickups: Math.max(0, Math.floor(config.pickups ?? 36)),
    effects: Math.max(0, Math.floor(config.effects ?? 0)),
    allProps: Boolean(config.allProps)
  };
  if (state.benchStress.quietCombat) {
    state.weaponSlots = [];
    state.activeWeaponId = null;
    state.weaponCooldowns.clear();
    if (state.currentWeaponVisual?.mesh) state.currentWeaponVisual.mesh.visible = false;
  }
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
  for (const ragdoll of state.ragdolls) scene.remove(ragdoll.root);
  state.ragdolls.length = 0;
  if (state.benchStress.allProps) revealAllPendingProps();
  const count = state.benchStress.enemies;
  const mix = data.waves[state.waveIndex]?.mix ?? [["shambler", 1]];
  const center = state.player ?? getWorldCenter();
  for (let i = 0; i < count; i += 1) {
    const type = mix[i % mix.length]?.[0] ?? Object.keys(data.enemies)[0];
    spawnEnemy(type);
    const enemy = state.enemies[state.enemies.length - 1];
    const angle = i * 2.399963229728653;
    const radius = 16 + (i % 12) * 3.8 + Math.floor(i / 12) * 1.4;
    enemy.x = wrapWorld(center.x + Math.cos(angle) * radius);
    enemy.z = wrapWorld(center.z + Math.sin(angle) * radius);
    enemy.hp = 1_000_000;
    enemy.touch = 0;
    setActorPosition(enemy, enemy.x, enemy.z);
    setActorFacing(enemy, angleTo(enemy.x, enemy.z, center.x, center.z));
  }
  resetEnemyBillboardBatches();
  for (const enemy of state.enemies) queueEnemyBillboardBatch(enemy);
  commitEnemyBillboardBatches();
  rebuildEnemySpatialGrid();
  const pickups = state.benchStress.pickups;
  const pickupStartRadius = getPickupCollectRadius() + 8;
  while (state.pickups.length < pickups) {
    const i = state.pickups.length;
    const angle = i * 2.399963229728653;
    const radius = pickupStartRadius + 5 + (Math.floor(i / 40) % 8) * 3.2 + (i % 5) * 0.18;
    spawnPickup(i % 13 === 0 ? "magnet" : i % 11 === 0 ? "weapon" : i % 7 === 0 ? "heal" : "xp", center.x + Math.cos(angle) * radius, center.z + Math.sin(angle) * radius);
  }
  const effects = state.benchStress.effects;
  for (let i = 0; i < effects; i += 1) {
    const angle = i * 2.399963229728653;
    const radius = 6 + (i % 32) * 1.25;
    const color = i % 5 === 0 ? "#ff7842" : i % 3 === 0 ? "#ffd37d" : "#bfff88";
    if (PERF_FLAGS.batchParticles) {
      tempColor.set(color);
      addBatchedParticle({
        x: center.x + Math.cos(angle) * radius,
        y: 0.8 + (i % 6) * 0.13,
        z: center.z + Math.sin(angle) * radius,
        vx: Math.cos(angle) * (0.5 + (i % 7) * 0.08),
        vy: 0.4 + (i % 5) * 0.06,
        vz: Math.sin(angle) * (0.5 + (i % 7) * 0.08),
        life: 30,
        size: 0.26 + (i % 4) * 0.05,
        r: tempColor.r,
        g: tempColor.g,
        b: tempColor.b
      });
    } else {
      spawnEffect("hit", center.x + Math.cos(angle) * radius, center.z + Math.sin(angle) * radius, 30, { color, particles: 1 });
    }
  }
  resetPickupBatches();
  for (const pickup of state.pickups) {
    if (!pickup.mesh) queuePickupBatch(pickup);
  }
  commitPickupBatches();
  updateBatchedParticles(0);
  state.time = Math.max(state.time, config.time ?? 120);
  state.minimapClock = 0;
  state.hudClock = 0;
  resetTelemetrySamples();
  updateMinimap(0, true);
  updateHud(0, true);
  return getTelemetrySnapshot();
}
