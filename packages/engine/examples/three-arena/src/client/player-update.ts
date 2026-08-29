import { runtimeCallback } from "./runtime-ports.ts";
const applyProceduralPose = runtimeCallback("actorAnimation", "applyProceduralPose");
const clearProceduralPoseOverlay = runtimeCallback("actorAnimation", "clearProceduralPoseOverlay");
const playActorAnimation = runtimeCallback("actorAnimation", "playActorAnimation");
const resolveAnimationSource = runtimeCallback("actorAnimation", "resolveAnimationSource");
const setActorDamageFlash = runtimeCallback("actorAnimation", "setActorDamageFlash");
const setActorOpacity = runtimeCallback("actorAnimation", "setActorOpacity");
const setActorPosition = runtimeCallback("actorAnimation", "setActorPosition");
const updatePlayerFacing = runtimeCallback("actorAnimation", "updatePlayerFacing");
const playSynthCue = runtimeCallback("audio", "playSynthCue");
const updateAudio = runtimeCallback("audio", "updateAudio");
const updateAttackIndicators = runtimeCallback("combatEntities", "updateAttackIndicators");
const updateBossAttacks = runtimeCallback("combatEntities", "updateBossAttacks");
const updateBullets = runtimeCallback("combatEntities", "updateBullets");
const updateEffects = runtimeCallback("combatEntities", "updateEffects");
const updateEnemies = runtimeCallback("combatEntities", "updateEnemies");
const updateHazards = runtimeCallback("combatEntities", "updateHazards");
const updatePickups = runtimeCallback("combatEntities", "updatePickups");
const updateRagdolls = runtimeCallback("combatEntities", "updateRagdolls");
const updateWeapons = runtimeCallback("combatWeapons", "updateWeapons");
const updateWeaponZones = runtimeCallback("combatWeapons", "updateWeaponZones");
const clamp = runtimeCallback("hud", "clamp");
const pulseShake = runtimeCallback("hud", "pulseShake");
const toast = runtimeCallback("hud", "toast");
const updateHud = runtimeCallback("hud", "updateHud");
const updateMinimap = runtimeCallback("minimap", "updateMinimap");
const spawnEffect = runtimeCallback("particles", "spawnEffect");
const spawnPulseRing = runtimeCallback("particles", "spawnPulseRing");
const resolveProgressionStats = runtimeCallback("progressionData", "resolveProgressionStats");
const updatePassiveEffects = runtimeCallback("progressionRuntime", "updatePassiveEffects");
const resolvePropCollisions = runtimeCallback("props", "resolvePropCollisions");
const pulseOverlay = runtimeCallback("rewardFeedback", "pulseOverlay");
const showCenterBanner = runtimeCallback("rewardFeedback", "showCenterBanner");
const updateCombo = runtimeCallback("rewardFeedback", "updateCombo");
const spawnEnemy = runtimeCallback("spawnAndDamage", "spawnEnemy");
const actorFeetY = runtimeCallback("terrain", "actorFeetY");
const terrainBaseHeightAt = runtimeCallback("terrain", "terrainBaseHeightAt");
const terrainGradientAt = runtimeCallback("terrain", "terrainGradientAt");
const terrainHeightAt = runtimeCallback("terrain", "terrainHeightAt");
const updateTraversalTools = runtimeCallback("terrain", "updateTraversalTools");
const weightedPick = runtimeCallback("worldMath", "weightedPick");
const worldAxisDelta = runtimeCallback("worldMath", "worldAxisDelta");
const worldDeltaInto = runtimeCallback("worldMath", "worldDeltaInto");
const wrapEntity = runtimeCallback("worldMath", "wrapEntity");
const wrapWorld = runtimeCallback("worldMath", "wrapWorld");
const waveBannerSubtitle = runtimeCallback("lobbyAndSettings", "waveBannerSubtitle");
const updatePlayerWeaponVisual = runtimeCallback("modelAssets", "updatePlayerWeaponVisual");
const updateNetwork = runtimeCallback("networkAndCamera", "updateNetwork");
import { BOSS_PACING, PLAYER_AIR_TRAIL_INTERVAL, PLAYER_AIRBORNE_HIT_CLEARANCE, PLAYER_DOUBLE_JUMP_VELOCITY, PLAYER_GRAVITY, PLAYER_JUMP_VELOCITY, PLAYER_KNOCKBACK_DECAY, PLAYER_KNOCKBACK_STOP_SPEED, PLAYER_MAX_JUMPS, PLAYER_MOMENTUM_BUILD_SECONDS, PLAYER_MOMENTUM_DAMP_SECONDS, PLAYER_MOMENTUM_DUST_INTERVAL, PLAYER_MOMENTUM_DUST_THRESHOLD, PLAYER_MOMENTUM_SPEED_BONUS_MULTIPLIER, SPAWN_PACING, TERRAIN_DOWNHILL_ACCELERATION, TERRAIN_DROP_AIR_HEIGHT, TERRAIN_PLATFORM_LAND_SNAP, TERRAIN_SLIDE_ACCELERATION, TERRAIN_UPHILL_POSITION_LOSS, TERRAIN_WALKABLE_SLOPE_RATIO, TERRAIN_WALL_RUN_SECONDS, TERRAIN_WALL_RUN_TRANSFER } from "./constants.ts";
import { PERF_FLAGS } from "./environment.ts";
import { measureTelemetryPhase } from "./telemetry-core.ts";
import type * as Three from "three";
import { state } from "./arena-state.ts";
import { data } from "./content-runtime.ts";
import { gamepadState } from "./input-context.ts";
import { cameraRigSnapshot, cameraYaw, keys, playerMotionAimTarget, playerMotionDesiredVelocity, playerMotionFacing, playerMotionGroundNormal, playerMotionPosition, playerMotionResolvedDelta, pointer, tempWorldDelta } from "./runtime-context.ts";
import type { WaveDefinition } from "./content-types.ts";
import type { ActorAnimationState, Player, PlayerJumpStats, TerrainGradient, WorldActor, WorldDelta } from "./runtime-types.ts";

export function updateGame(dt: number): void {
  state.time += dt;
  measureTelemetryPhase("wave", () => updateWave(dt));
  measureTelemetryPhase("player", () => updatePlayer(dt));
  measureTelemetryPhase("passive", () => updatePassiveEffects(dt));
  measureTelemetryPhase("weapons", () => updateWeapons(dt));
  measureTelemetryPhase("weaponZones", () => updateWeaponZones(dt));
  measureTelemetryPhase("enemies", () => updateEnemies(dt));
  measureTelemetryPhase("bullets", () => updateBullets(dt));
  measureTelemetryPhase("pickups", () => updatePickups(dt));
  measureTelemetryPhase("effects", () => updateEffects(dt));
  measureTelemetryPhase("ragdolls", () => updateRagdolls(dt));
  measureTelemetryPhase("bossAttacks", () => updateBossAttacks(dt));
  measureTelemetryPhase("attackIndicators", () => updateAttackIndicators(dt));
  measureTelemetryPhase("hazards", () => updateHazards(dt));
  measureTelemetryPhase("network", () => updateNetwork(dt));
  measureTelemetryPhase("combo", () => updateCombo(dt));
  measureTelemetryPhase("audio", () => updateAudio());
  measureTelemetryPhase("hud", () => updateHud(dt));
  measureTelemetryPhase("minimap", () => updateMinimap(dt));
}

export function updateWave(dt: number): void {
  const player = state.player;
  if (PERF_FLAGS.benchWalkOnly || !player || !data.waves.length) return;
  let next = state.waveIndex;
  for (let i = data.waves.length - 1; i >= 0; i -= 1) {
    const candidate = data.waves[i];
    if (candidate && state.time >= candidate.at) {
      next = i;
      break;
    }
  }
  if (next !== state.waveIndex) {
    state.waveIndex = next;
    const nextWave = data.waves[next];
    if (!nextWave) return;
    toast(nextWave.name);
    showCenterBanner(nextWave.name, waveBannerSubtitle(nextWave));
    pulseOverlay("level");
    playSynthCue("wave");
    spawnPulseRing(player.x, player.z, "#d8ff8d", 0.52, 1.4, 5.4);
    pulseShake(0.5, 0.45);
  }
  if (state.benchStress) return;
  const wave = data.waves[state.waveIndex];
  if (!wave) return;
  updateBossSpawns(wave);
  state.spawnClock -= dt;
  const ramp = Math.min(1, state.time / SPAWN_PACING.rampSeconds);
  const curseMultiplier = Math.max(0.25, (state.progressionStats ?? resolveProgressionStats()).curseMultiplier ?? 1);
  const spawnMultiplier = (SPAWN_PACING.minRateMultiplier + (SPAWN_PACING.maxRateMultiplier - SPAWN_PACING.minRateMultiplier) * ramp) * curseMultiplier;
  const activeCap = Math.min(
    SPAWN_PACING.hardActiveEnemyCap,
    Math.round(wave.cap * (1 + (SPAWN_PACING.activeCapMultiplierAtMax - 1) * ramp) * curseMultiplier)
  );
  if (state.enemies.length < activeCap && state.spawnClock <= 0) {
    state.spawnClock = Math.max(SPAWN_PACING.minSpawnIntervalSeconds, wave.rate / spawnMultiplier);
    measureTelemetryPhase("enemySpawn", () => spawnEnemy(weightedPick(wave.mix)));
  }
}

export function updateBossSpawns(wave: WaveDefinition): void {
  while (state.time >= state.nextBossAt) {
    const activeBosses = state.enemies.filter((enemy) => enemy.boss).length;
    if (activeBosses < BOSS_PACING.maxActiveBosses) {
      const boss = spawnEnemy(resolveBossType(wave), { boss: true });
      showCenterBanner("Boss Bell", `${data.enemies[boss.typeId]?.name ?? "Elite undead"} crossed the fence.`);
      pulseOverlay("danger");
      playSynthCue("boss");
      spawnPulseRing(boss.x, boss.z, "#ff5d4d", 0.72, 2.4, 6.8);
    }
    state.nextBossAt += BOSS_PACING.intervalSeconds;
  }
}

export function resolveBossType(wave: WaveDefinition): string {
  if (wave.eliteId && data.enemies[wave.eliteId]) return wave.eliteId;
  let bestId = wave.mix[0]?.[0] ?? Object.keys(data.enemies)[0] ?? "";
  let bestHp = 0;
  for (const [id] of wave.mix) {
    const hp = data.enemies[id]?.hp ?? 0;
    if (hp > bestHp) {
      bestHp = hp;
      bestId = id;
    }
  }
  return bestId;
}

export function updatePlayer(dt: number): void {
  const player = state.player;
  if (!player) return;
  let dx = 0;
  let dz = 0;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) dx -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) dx += 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) dz -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) dz += 1;
  if (gamepadState.moveActive) {
    dx += gamepadState.moveX;
    dz += gamepadState.moveZ;
  }
  const length = Math.hypot(dx, dz);
  let desiredVx = 0;
  let desiredVz = 0;
  if (length > 0.0001) {
    const yaw = cameraRigSnapshot?.yaw ?? cameraYaw;
    const strafe = dx / length;
    const forward = -dz / length;
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    desiredVx = (rightX * strafe + forwardX * forward) * player.speed;
    desiredVz = (rightZ * strafe + forwardZ * forward) * player.speed;
  }
  updatePlayerMomentum(player, desiredVx, desiredVz, length > 0.0001, dt);
  const terrainBeforeX = player.x;
  const terrainBeforeZ = player.z;
  const terrainBeforeFeetY = actorFeetY(player);
  player.x += (player.moveMomentumX ?? 0) * dt;
  player.z += (player.moveMomentumZ ?? 0) * dt;
  player.x += (player.knockX ?? 0) * dt;
  player.z += (player.knockZ ?? 0) * dt;
  const playerKnockDamping = Math.max(0, 1 - PLAYER_KNOCKBACK_DECAY * dt);
  player.knockX = Math.abs(player.knockX ?? 0) < PLAYER_KNOCKBACK_STOP_SPEED ? 0 : (player.knockX ?? 0) * playerKnockDamping;
  player.knockZ = Math.abs(player.knockZ ?? 0) < PLAYER_KNOCKBACK_STOP_SPEED ? 0 : (player.knockZ ?? 0) * playerKnockDamping;
  wrapEntity(player);
  resolvePlayerTerrainMotion(player, terrainBeforeX, terrainBeforeZ, terrainBeforeFeetY, dt);
  const collisionBeforeX = player.x;
  const collisionBeforeZ = player.z;
  const collisionBeforeFeetY = actorFeetY(player);
  resolvePropCollisions(player);
  resolvePlayerTerrainMotion(player, collisionBeforeX, collisionBeforeZ, collisionBeforeFeetY, dt, { collisionStep: true });
  updateTraversalTools(dt);
  player.invuln = Math.max(0, player.invuln - dt);
  player.animLock = Math.max(0, (player.animLock ?? 0) - dt);
  player.wallRunClock = Math.max(0, (player.wallRunClock ?? 0) - dt);
  updatePlayerJumpPhysics(player, dt);
  if (player.regenPerSecond > 0 && player.hp > 0 && player.hp < player.maxHp) {
    player.hp = Math.min(player.maxHp, player.hp + player.regenPerSecond * dt);
  }
  const moving = Math.hypot(player.moveMomentumX ?? 0, player.moveMomentumZ ?? 0) > player.speed * 0.08;
  setActorPosition(player, player.x, player.z);
  updatePlayerFacing(dt);
  updatePlayerAnimationState(player, dt, moving);
  const flash = player.invuln > 0 ? 0.5 + Math.sin(state.time * 42) * 0.5 : 0;
  setActorOpacity(player, player.invuln > 0 ? 0.56 + flash * 0.34 : 1);
  setActorDamageFlash(player, flash);
  updatePlayerWeaponVisual();
}

export function resolvePlayerTerrainMotion(
  player: Player,
  beforeX: number,
  beforeZ: number,
  beforeFeetY: number,
  dt: number,
  options: { collisionStep?: boolean } = {}
): void {
  const gradient = terrainGradientAt(player.x, player.z);
  player.terrainSlope = gradient.ratio;
  player.terrainBlocked = false;
  const moved = worldDeltaInto(tempWorldDelta, beforeX, beforeZ, player.x, player.z);
  const distance = Math.hypot(moved.dx, moved.dz);
  if (distance <= 0.0001) {
    if (player.grounded && gradient.ratio > TERRAIN_WALKABLE_SLOPE_RATIO) slideActorDownSlope(player, gradient, dt);
    return;
  }

  const beforeGround = terrainHeightAt(beforeX, beforeZ);
  const afterGround = terrainHeightAt(player.x, player.z);
  const heightDelta = afterGround - beforeGround;
  const pathSlope = heightDelta / distance;
  const dirX = moved.dx / distance;
  const dirZ = moved.dz / distance;
  const hasGradient = gradient.ratio > 0.001;
  const uphillX = hasGradient ? gradient.x / gradient.ratio : dirX;
  const uphillZ = hasGradient ? gradient.z / gradient.ratio : dirZ;
  const uphillMotion = dirX * uphillX + dirZ * uphillZ;
  const tooSteep = gradient.ratio > TERRAIN_WALKABLE_SLOPE_RATIO && uphillMotion > 0.04;

  if (!player.grounded) {
    const feetToGround = beforeFeetY - afterGround;
    const clearedLandingTop = feetToGround >= -TERRAIN_PLATFORM_LAND_SNAP;
    player.jumpY = Math.max(0, feetToGround);
    if (tooSteep && !clearedLandingTop && (player.jumpVelocityY > 0.2 || (player.jumpY ?? 0) > 0.55)) {
      transferVerticalMomentumIntoWallRun(player, beforeX, beforeZ, moved, distance, uphillX, uphillZ, dt);
      player.jumpY = Math.max(0, beforeFeetY - terrainHeightAt(player.x, player.z));
    }
    return;
  }

  if (tooSteep) {
    player.terrainBlocked = true;
    killUphillMomentum(player, uphillX, uphillZ);
    const lateralX = moved.dx - uphillX * Math.max(0, moved.dx * uphillX + moved.dz * uphillZ);
    const lateralZ = moved.dz - uphillZ * Math.max(0, moved.dx * uphillX + moved.dz * uphillZ);
    const slideStep = clamp(
      (player.speed ?? 8) * dt * 0.48 + (gradient.ratio - TERRAIN_WALKABLE_SLOPE_RATIO) * TERRAIN_SLIDE_ACCELERATION * dt * 0.08,
      0.035,
      Math.max(0.18, distance * 0.92)
    );
    player.x = wrapWorld(beforeX + lateralX * 0.72 - uphillX * slideStep);
    player.z = wrapWorld(beforeZ + lateralZ * 0.72 - uphillZ * slideStep);
    player.jumpY = 0;
    player.jumpVelocityY = Math.min(0, player.jumpVelocityY ?? 0);
    spawnSlopeDust(player, dt, "#9f8d72");
    return;
  }

  if (heightDelta <= -TERRAIN_DROP_AIR_HEIGHT) {
    player.grounded = false;
    player.jumpY = Math.max(0.04, beforeFeetY - afterGround);
    player.jumpVelocityY = Math.min(player.jumpVelocityY ?? 0, -0.35);
    return;
  }

  if (pathSlope > 0.015 && !options.collisionStep) {
    const loss = clamp(pathSlope * TERRAIN_UPHILL_POSITION_LOSS, 0, 0.42);
    player.x = wrapWorld(beforeX + moved.dx * (1 - loss));
    player.z = wrapWorld(beforeZ + moved.dz * (1 - loss));
    const uphillVelocity = (player.moveMomentumX ?? 0) * dirX + (player.moveMomentumZ ?? 0) * dirZ;
    if (uphillVelocity > 0) {
      player.moveMomentumX -= dirX * uphillVelocity * loss;
      player.moveMomentumZ -= dirZ * uphillVelocity * loss;
    }
  } else if (pathSlope < -0.015 && !options.collisionStep) {
    const boost = clamp(-pathSlope, 0, 1) * TERRAIN_DOWNHILL_ACCELERATION * dt;
    player.moveMomentumX = (player.moveMomentumX ?? 0) + dirX * boost;
    player.moveMomentumZ = (player.moveMomentumZ ?? 0) + dirZ * boost;
    capActorHorizontalSpeed(player, playerMomentumMaxSpeed(player) * 1.42);
  }

  player.jumpY = 0;
  player.jumpVelocityY = Math.max(0, player.jumpVelocityY ?? 0) * 0.14;
  player.grounded = true;
}

export function transferVerticalMomentumIntoWallRun(
  player: Player,
  beforeX: number,
  beforeZ: number,
  moved: WorldDelta,
  distance: number,
  uphillX: number,
  uphillZ: number,
  dt: number
): void {
  const tangentA = { x: -uphillZ, z: uphillX };
  const tangentB = { x: uphillZ, z: -uphillX };
  const velocityX = (player.moveMomentumX ?? 0) + (player.knockX ?? 0);
  const velocityZ = (player.moveMomentumZ ?? 0) + (player.knockZ ?? 0);
  const sign = velocityX * tangentA.x + velocityZ * tangentA.z >= velocityX * tangentB.x + velocityZ * tangentB.z ? 1 : -1;
  const tangentX = sign > 0 ? tangentA.x : tangentB.x;
  const tangentZ = sign > 0 ? tangentA.z : tangentB.z;
  const vertical = Math.max(0, player.jumpVelocityY ?? 0);
  const transfer = Math.max(2.2, vertical * TERRAIN_WALL_RUN_TRANSFER + Math.min(5, (player.jumpY ?? 0) * 0.36));
  killUphillMomentum(player, uphillX, uphillZ);
  player.moveMomentumX = (player.moveMomentumX ?? 0) + tangentX * transfer;
  player.moveMomentumZ = (player.moveMomentumZ ?? 0) + tangentZ * transfer;
  capActorHorizontalSpeed(player, playerMomentumMaxSpeed(player) * 1.65);
  player.jumpVelocityY = Math.min(player.jumpVelocityY ?? 0, vertical * 0.42);
  player.wallRunClock = TERRAIN_WALL_RUN_SECONDS;
  player.terrainBlocked = true;
  const wallRunStep = Math.min(distance * 1.12, Math.max(0.18, (player.speed ?? 8) * dt * 1.18));
  player.x = wrapWorld(beforeX + tangentX * wallRunStep - uphillX * 0.05);
  player.z = wrapWorld(beforeZ + tangentZ * wallRunStep - uphillZ * 0.05);
  spawnEffect("airTrail", player.x, player.z, 0.28, {
    particles: 4,
    color: "#bff7ff",
    y: 1.1 + Math.min(4, player.jumpY ?? 0),
    speed: 1.4,
    size: 0.16
  });
}

export function slideActorDownSlope(actor: WorldActor, gradient: TerrainGradient, dt: number): void {
  if (!actor || gradient.ratio <= 0.001) return;
  const downhillX = -gradient.x / gradient.ratio;
  const downhillZ = -gradient.z / gradient.ratio;
  const slide = clamp((actor.speed ?? 6) * dt * 0.36 + gradient.ratio * TERRAIN_SLIDE_ACCELERATION * dt * 0.035, 0.025, 0.42);
  actor.x = wrapWorld((actor.x ?? 0) + downhillX * slide);
  actor.z = wrapWorld((actor.z ?? 0) + downhillZ * slide);
  if (actor !== state.player) actor.groundY = terrainHeightAt(actor.x, actor.z);
  actor.moveMomentumX = (actor.moveMomentumX ?? 0) + downhillX * TERRAIN_SLIDE_ACCELERATION * dt * 0.18;
  actor.moveMomentumZ = (actor.moveMomentumZ ?? 0) + downhillZ * TERRAIN_SLIDE_ACCELERATION * dt * 0.18;
  if (actor === state.player) actor.terrainBlocked = true;
}

export function killUphillMomentum(actor: WorldActor, uphillX: number, uphillZ: number): void {
  const momentum = (actor.moveMomentumX ?? 0) * uphillX + (actor.moveMomentumZ ?? 0) * uphillZ;
  if (momentum > 0) {
    actor.moveMomentumX = (actor.moveMomentumX ?? 0) - uphillX * momentum;
    actor.moveMomentumZ = (actor.moveMomentumZ ?? 0) - uphillZ * momentum;
  }
  const knock = (actor.knockX ?? 0) * uphillX + (actor.knockZ ?? 0) * uphillZ;
  if (knock > 0) {
    actor.knockX -= uphillX * knock;
    actor.knockZ -= uphillZ * knock;
  }
}

export function capActorHorizontalSpeed(actor: WorldActor, maxSpeed: number): void {
  const speed = Math.hypot(actor.moveMomentumX ?? 0, actor.moveMomentumZ ?? 0);
  if (speed <= maxSpeed || speed <= 0.001) return;
  const scale = maxSpeed / speed;
  actor.moveMomentumX = (actor.moveMomentumX ?? 0) * scale;
  actor.moveMomentumZ = (actor.moveMomentumZ ?? 0) * scale;
}

export function spawnSlopeDust(actor: WorldActor, dt: number, color: Three.ColorRepresentation = "#b9a879"): void {
  actor.slopeDustClock = Math.max(0, (actor.slopeDustClock ?? 0) - dt);
  if (actor.slopeDustClock > 0) return;
  actor.slopeDustClock = 0.18;
  spawnEffect("jumpDust", actor.x, actor.z, 0.22, {
    particles: 5,
    color,
    y: 0.16,
    speed: 1.8,
    size: 0.15
  });
}

export function resolveGroundActorTerrainMotion(actor: WorldActor, beforeX: number, beforeZ: number, dt: number): void {
  if (!actor) return;
  const moved = worldDeltaInto(tempWorldDelta, beforeX, beforeZ, actor.x, actor.z);
  const distance = Math.hypot(moved.dx, moved.dz);
  const gradient = terrainGradientAt(actor.x, actor.z);
  if (distance <= 0.0001) {
    if (gradient.ratio > TERRAIN_WALKABLE_SLOPE_RATIO) slideActorDownSlope(actor, gradient, dt);
    return;
  }
  const dirX = moved.dx / distance;
  const dirZ = moved.dz / distance;
  const beforeGround = terrainHeightAt(beforeX, beforeZ);
  const afterGround = terrainHeightAt(actor.x, actor.z);
  actor.groundY = afterGround;
  const pathSlope = (afterGround - beforeGround) / distance;
  if (gradient.ratio > TERRAIN_WALKABLE_SLOPE_RATIO) {
    const uphillX = gradient.x / gradient.ratio;
    const uphillZ = gradient.z / gradient.ratio;
    const uphillMotion = dirX * uphillX + dirZ * uphillZ;
    if (uphillMotion > 0.04) {
      killUphillMomentum(actor, uphillX, uphillZ);
      actor.x = wrapWorld(beforeX - uphillX * Math.min(0.2, (actor.speed ?? 5) * dt * 0.32));
      actor.z = wrapWorld(beforeZ - uphillZ * Math.min(0.2, (actor.speed ?? 5) * dt * 0.32));
      return;
    }
  }
  if (pathSlope < -0.02) {
    actor.x = wrapWorld(actor.x + dirX * Math.min(0.18, -pathSlope * dt * TERRAIN_DOWNHILL_ACCELERATION * 0.12));
    actor.z = wrapWorld(actor.z + dirZ * Math.min(0.18, -pathSlope * dt * TERRAIN_DOWNHILL_ACCELERATION * 0.12));
  } else if (pathSlope > 0.02) {
    const loss = clamp(pathSlope * 0.18, 0, 0.28);
    actor.x = wrapWorld(beforeX + moved.dx * (1 - loss));
    actor.z = wrapWorld(beforeZ + moved.dz * (1 - loss));
  }
}

export function updatePlayerMomentum(player: Player, desiredVx: number, desiredVz: number, hasInput: boolean, dt: number): void {
  if (hasInput) {
    const merge = Math.min(1, dt / PLAYER_MOMENTUM_BUILD_SECONDS);
    player.moveMomentumX = (player.moveMomentumX ?? 0) + desiredVx * merge;
    player.moveMomentumZ = (player.moveMomentumZ ?? 0) + desiredVz * merge;
    capPlayerMomentum(player);
  } else {
    dampPlayerMomentum(player, dt);
  }
  updateMomentumDust(player, dt);
}

export function playerMomentumMaxSpeed(player: Player): number {
  return Math.max(0.001, (player.speed ?? 0) * (1 + PLAYER_MOMENTUM_SPEED_BONUS_MULTIPLIER));
}

export function capPlayerMomentum(player: Player): void {
  const maxSpeed = playerMomentumMaxSpeed(player);
  const speed = Math.hypot(player.moveMomentumX ?? 0, player.moveMomentumZ ?? 0);
  if (speed <= maxSpeed) return;
  const scale = maxSpeed / speed;
  player.moveMomentumX *= scale;
  player.moveMomentumZ *= scale;
}

export function dampPlayerMomentum(player: Player, dt: number): void {
  const vx = player.moveMomentumX ?? 0;
  const vz = player.moveMomentumZ ?? 0;
  const speed = Math.hypot(vx, vz);
  if (speed <= 0.001) {
    player.moveMomentumX = 0;
    player.moveMomentumZ = 0;
    return;
  }
  const nextSpeed = Math.max(0, speed - (playerMomentumMaxSpeed(player) / PLAYER_MOMENTUM_DAMP_SECONDS) * dt);
  const scale = nextSpeed / speed;
  player.moveMomentumX = vx * scale;
  player.moveMomentumZ = vz * scale;
}

export function updateMomentumDust(player: Player, dt: number): void {
  if (PERF_FLAGS.benchWalkOnly) return;
  const speed = Math.hypot(player.moveMomentumX ?? 0, player.moveMomentumZ ?? 0);
  if (!player.grounded || speed < (player.speed ?? 0) * PLAYER_MOMENTUM_DUST_THRESHOLD) {
    player.momentumDustClock = Math.min(player.momentumDustClock ?? 0, PLAYER_MOMENTUM_DUST_INTERVAL);
    return;
  }
  player.momentumDustClock = Math.max(0, (player.momentumDustClock ?? 0) - dt);
  if (player.momentumDustClock > 0) return;
  player.momentumDustClock = PLAYER_MOMENTUM_DUST_INTERVAL;
  const backX = speed > 0 ? -(player.moveMomentumX ?? 0) / speed : 0;
  const backZ = speed > 0 ? -(player.moveMomentumZ ?? 0) / speed : 0;
  spawnEffect("jumpDust", wrapWorld(player.x + backX * 0.5), wrapWorld(player.z + backZ * 0.5), 0.26, {
    particles: 9,
    color: "#d0b985",
    y: 0.16,
    speed: 2.05,
    size: 0.18
  });
}

export function updatePlayerAnimationState(player: Player, dt: number, moving: boolean): void {
  if ((player.animLock ?? 0) <= 0) player.overlayAnimation = null;
  const desired = resolvePlayerAnimationState(player, moving);
  const locked = (player.animLock ?? 0) > 0;
  const preserveLocked = locked && shouldPreserveLockedPlayerAnimation(player.activeAnimation, player.grounded);
  if (player.overlayAnimation && locked) {
    player.animator?.play(desired, { fadeSeconds: 0.08 });
    syncActorBaseAnimationState(player, desired);
  } else if (!player.grounded && desired === "fall" && !preserveLocked && player.activeAnimation !== "fall") {
    playActorAnimation(player, "fall", 0.12);
  } else if (player.activeAnimationSource === "procedural" && locked) {
    player.animator?.play(desired, { fadeSeconds: 0.08 });
    syncActorBaseAnimationState(player, desired);
  } else if (!preserveLocked && player.activeAnimation !== desired) {
    playActorAnimation(player, desired, desired === "fall" ? 0.12 : 0.08);
  }
  player.animationState = player.overlayAnimation && locked ? desired : preserveLocked ? player.activeAnimation : desired;
  if (player.engineMotion) {
    syncPlayerEngineMotion(player, dt);
    return;
  }
  clearProceduralPoseOverlay(player.proceduralPose);
  player.animator?.update(dt);
  applyProceduralPose(player, dt, moving);
}

export function syncPlayerEngineMotion(player: Player, dt: number): void {
  const motion = player.engineMotion;
  if (!motion) return;
  const rootY = actorFeetY(player);
  playerMotionPosition[0] = player.x;
  playerMotionPosition[1] = rootY;
  playerMotionPosition[2] = player.z;
  playerMotionResolvedDelta[0] = worldAxisDelta(player.engineMotionLastX, player.x);
  playerMotionResolvedDelta[1] = rootY - player.engineMotionLastY;
  playerMotionResolvedDelta[2] = worldAxisDelta(player.engineMotionLastZ, player.z);
  playerMotionDesiredVelocity[0] = player.moveMomentumX ?? 0;
  playerMotionDesiredVelocity[1] = 0;
  playerMotionDesiredVelocity[2] = player.moveMomentumZ ?? 0;
  const facingAngle = player.facingAngle ?? 0;
  playerMotionFacing[0] = Math.cos(facingAngle);
  playerMotionFacing[1] = 0;
  playerMotionFacing[2] = Math.sin(facingAngle);
  let aimX = worldAxisDelta(player.x, pointer.worldX);
  let aimZ = worldAxisDelta(player.z, pointer.worldZ);
  const aimLength = Math.hypot(aimX, aimZ);
  if (aimLength <= 1e-5) {
    aimX = playerMotionFacing[0];
    aimZ = playerMotionFacing[2];
  } else {
    aimX /= aimLength;
    aimZ /= aimLength;
  }
  const aimDistance = 8;
  playerMotionAimTarget[0] = player.x + aimX * aimDistance;
  playerMotionAimTarget[1] = rootY + player.engineMotionAimHeight;
  playerMotionAimTarget[2] = player.z + aimZ * aimDistance;
  const gradient = terrainGradientAt(player.x, player.z);
  playerMotionGroundNormal[0] = -gradient.x;
  playerMotionGroundNormal[1] = 1;
  playerMotionGroundNormal[2] = -gradient.z;
  motion.sync({
    position: playerMotionPosition,
    resolvedDelta: playerMotionResolvedDelta,
    desiredVelocity: playerMotionDesiredVelocity,
    facing: playerMotionFacing,
    aimTarget: playerMotionAimTarget,
    grounded: player.grounded,
    groundNormal: playerMotionGroundNormal
  }, dt);
  player.engineMotionLastX = player.x;
  player.engineMotionLastY = rootY;
  player.engineMotionLastZ = player.z;
  player.activeAnimationSource = "engine-motion";
  player.proceduralMode = "semantic";
}

export function syncActorBaseAnimationState(actor: ActorAnimationState, desired: string): void {
  actor.activeAnimation = actor.animator?.current ?? desired;
  actor.activeAnimationSource = resolveAnimationSource(actor.activeAnimation) ?? actor.activeAnimationSource;
}

export function resolvePlayerAnimationState(player: Player, moving: boolean): string {
  if (!player.grounded) {
    return player.activeAnimation === "jump" && (player.animLock ?? 0) > 0 ? "jump" : "fall";
  }
  return moving ? "run" : "idle";
}

export function shouldPreserveLockedPlayerAnimation(name: string | null | undefined, grounded: boolean): boolean {
  if (!name) return false;
  if (!grounded) return name === "jump" || name === "hit" || name === "death";
  return ["shoot", "cast", "land", "hit", "death", "celebrate", "interact"].includes(name);
}

export function playerJumpStats(): PlayerJumpStats {
  const stats = state.progressionStats ?? resolveProgressionStats();
  return {
    heightMultiplier: stats.jumpHeightMultiplier ?? 1,
    gravityMultiplier: stats.gravityMultiplier ?? 1,
    maxJumps: PLAYER_MAX_JUMPS + Math.max(0, Math.floor(stats.maxJumpsFlat ?? 0))
  };
}

export function playerJumpVelocity(doubleJump = false): number {
  const stats = playerJumpStats();
  const base = doubleJump ? PLAYER_DOUBLE_JUMP_VELOCITY : PLAYER_JUMP_VELOCITY;
  return base * Math.sqrt(Math.max(0.05, stats.heightMultiplier * stats.gravityMultiplier));
}

export function playerGravity(): number {
  return PLAYER_GRAVITY * playerJumpStats().gravityMultiplier;
}

export function attemptPlayerJump(): void {
  const player = state.player;
  const jumpStats = playerJumpStats();
  if (!player || player.hp <= 0 || player.jumpsUsed >= jumpStats.maxJumps) return;
  const doubleJump = !player.grounded;
  player.jumpVelocityY = playerJumpVelocity(doubleJump);
  player.grounded = false;
  player.jumpsUsed += 1;
  player.animLock = doubleJump ? 0.5 : 0.42;
  playActorAnimation(player, "jump", 0.04);
  spawnPulseRing(player.x, player.z, doubleJump ? "#bff7ff" : "#d7ff8d", 0.28, doubleJump ? 1 : 0.72, doubleJump ? 3.8 : 2.7);
  if (doubleJump) spawnAirPuff(player, 7);
  else spawnJumpDustBurst(player, 13);
  playSynthCue("jump", doubleJump ? 1.1 : 0.9);
}

export function updatePlayerJumpPhysics(player: Player, dt: number): void {
  const floatAssist = state.time < (player.floatAssistUntil ?? 0);
  const gravityScale = floatAssist ? 0.32 : 1;
  player.jumpVelocityY -= playerGravity() * gravityScale * dt;
  if (floatAssist && player.jumpVelocityY < -1.35) player.jumpVelocityY = -1.35;
  player.jumpY += player.jumpVelocityY * dt;
  if (player.jumpY > 0) {
    spawnAirborneTrail(player, dt);
    return;
  }
  const landed = !player.grounded;
  player.jumpY = 0;
  player.jumpVelocityY = 0;
  player.grounded = true;
  player.jumpsUsed = 0;
  player.jumpTrailClock = 0;
  if (landed) {
    player.animLock = Math.max(player.animLock ?? 0, 0.24);
    player.animationState = "land";
    playActorAnimation(player, "land", 0.035);
    spawnPulseRing(player.x, player.z, "#d7ff8d", 0.18, 0.52, 2.1);
    spawnJumpDustBurst(player, 12);
  }
}

export function playerClearsGroundHits(): boolean {
  const player = state.player;
  if (!player) return false;
  const elevation = terrainHeightAt(player.x, player.z) + (player.jumpY ?? 0) - terrainBaseHeightAt(player.x, player.z);
  return elevation >= PLAYER_AIRBORNE_HIT_CLEARANCE;
}

export function spawnJumpDustBurst(player: Player, particles = 12): void {
  spawnEffect("jumpDust", player.x, player.z, 0.42, {
    particles,
    color: "#b9a879",
    y: 0.18,
    speed: 2.7,
    size: 0.22
  });
}

export function spawnAirPuff(player: Player, particles = 6): void {
  spawnEffect("airTrail", player.x, player.z, 0.34, {
    particles,
    color: "#d8d1b4",
    y: 0.72 + player.jumpY * 0.72,
    speed: 1,
    size: 0.16
  });
}

export function spawnAirborneTrail(player: Player, dt: number): void {
  player.jumpTrailClock = Math.max(0, (player.jumpTrailClock ?? 0) - dt);
  if (player.jumpTrailClock > 0) return;
  player.jumpTrailClock = PLAYER_AIR_TRAIL_INTERVAL;
  spawnAirPuff(player, 1);
}
