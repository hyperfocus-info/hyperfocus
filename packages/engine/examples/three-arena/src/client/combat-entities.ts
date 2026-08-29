import { runtimeCallback } from "./runtime-ports.ts";
const applyWeaponDamage = runtimeCallback("combatWeapons", "applyWeaponDamage");
const lowestHealthEnemy = runtimeCallback("combatWeapons", "lowestHealthEnemy");
const getPickupCollectRadius = runtimeCallback("progressionRuntime", "getPickupCollectRadius");
const actorFeetY = runtimeCallback("terrain", "actorFeetY");
const actorGroundHeight = runtimeCallback("terrain", "actorGroundHeight");
const actorsOverlapY = runtimeCallback("terrain", "actorsOverlapY");
const actorVerticalHeight = runtimeCallback("terrain", "actorVerticalHeight");
const terrainHeightAt = runtimeCallback("terrain", "terrainHeightAt");
const setActorFacing = runtimeCallback("actorAnimation", "setActorFacing");
const setActorPosition = runtimeCallback("actorAnimation", "setActorPosition");
const updateActorAnimation = runtimeCallback("actorAnimation", "updateActorAnimation");
const playSynthCue = runtimeCallback("audio", "playSynthCue");
const forEachObjectMaterial = runtimeCallback("contentUi", "forEachObjectMaterial");
const clamp = runtimeCallback("hud", "clamp");
const clamp01 = runtimeCallback("hud", "clamp01");
const pulseShake = runtimeCallback("hud", "pulseShake");
const setEffectOpacity = runtimeCallback("particles", "setEffectOpacity");
const spawnEffect = runtimeCallback("particles", "spawnEffect");
const spawnPulseRing = runtimeCallback("particles", "spawnPulseRing");
const updateBatchedParticles = runtimeCallback("particles", "updateBatchedParticles");
const playerClearsGroundHits = runtimeCallback("playerUpdate", "playerClearsGroundHits");
const resolveGroundActorTerrainMotion = runtimeCallback("playerUpdate", "resolveGroundActorTerrainMotion");
const removeFromList = runtimeCallback("pointerAndTextures", "removeFromList");
const resolvePropCollisions = runtimeCallback("props", "resolvePropCollisions");
const collectPickup = runtimeCallback("spawnAndDamage", "collectPickup");
const damagePlayer = runtimeCallback("spawnAndDamage", "damagePlayer");
const killEnemy = runtimeCallback("spawnAndDamage", "killEnemy");
const projectileYAt = runtimeCallback("weaponVisuals", "projectileYAt");
const angleTo = runtimeCallback("worldMath", "angleTo");
const nearestEnemy = runtimeCallback("worldMath", "nearestEnemy");
const nearestPlayer = runtimeCallback("worldMath", "nearestPlayer");
const queryLiveEnemies = runtimeCallback("worldMath", "queryLiveEnemies");
const rebuildEnemySpatialGrid = runtimeCallback("worldMath", "rebuildEnemySpatialGrid");
const renderPositionInto = runtimeCallback("worldMath", "renderPositionInto");
const worldDeltaInto = runtimeCallback("worldMath", "worldDeltaInto");
const worldDistanceSquared = runtimeCallback("worldMath", "worldDistanceSquared");
const wrapEntity = runtimeCallback("worldMath", "wrapEntity");
const wrapWorld = runtimeCallback("worldMath", "wrapWorld");
import { ANIMATED_ENEMY_DENSE_COUNT, ANIMATED_ENEMY_DENSE_MESH_BUDGET, ANIMATED_ENEMY_DENSE_MESH_RADIUS, BOSS_ANIMATION_STEP_SECONDS, BOSS_ATTACKS, ENEMY_ANIMATION_STEP_SECONDS, ENEMY_BILLBOARD_BATCH_CAPACITY, ENEMY_TERRAIN_STEP_SECONDS, HAZARD_DAMAGE_TICK_SECONDS, KNOCKBACK_DECAY, KNOCKBACK_STOP_SPEED, MAGNET_PICKUP_SECONDS, MAGNET_PICKUP_SPEED, PICKUP_BATCH_CAPACITY, PLAYER_HEIGHT_WORLD, PROJECTILE_HEIGHT_OFFSET, PROJECTILE_VERTICAL_HIT_PAD, SPAWN_PACING } from "./constants.ts";
import { PERF_FLAGS } from "./environment.ts";
import { updateTimedEffectQueue } from "@hyperfocus/engine/render";
import type * as Three from "three";
import { state } from "./arena-state.ts";
import { THREE, requireRuntimeInstance } from "./boot-and-dom.ts";
import { camera, remotePlayers, scene, tempMatrix, tempQuaternion, tempRenderPosition, tempScale, tempVec, tempWorldDelta } from "./runtime-context.ts";
import { measureTelemetryPhase, telemetry } from "./telemetry-core.ts";
import type { AttackIndicator, AttackIndicatorSpec, CombatBullet, Enemy, EnemyHealthBar, EnemyTarget, IndicatorMesh, InstanceBatch, Pickup, PickupInstanceBatch } from "./runtime-types.ts";

export function updateEnemies(dt: number): void {
  const player = state.player;
  if (!player) return;
  resetEnemyBillboardBatches();
  const enemyCount = state.enemies.length;
  const terrainNearRadius = enemyCount >= 260 ? PERF_FLAGS.enemyDenseTerrainNearRadius : PERF_FLAGS.enemyTerrainNearRadius;
  let terrainBudget = Math.min(enemyCount, Math.max(0, Math.floor(PERF_FLAGS.enemyTerrainBudget)));
  let animatedMeshBudget = enemyCount >= ANIMATED_ENEMY_DENSE_COUNT ? ANIMATED_ENEMY_DENSE_MESH_BUDGET : Number.POSITIVE_INFINITY;
  const useRemotePlayers = remotePlayers.size > 0;
  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = state.enemies[i];
    if (!enemy) continue;
    const movement: { target: EnemyTarget; dx: number; dz: number; distance: number } = measureTelemetryPhase("enemyMove", () => {
      const target = useRemotePlayers ? nearestPlayer(enemy.x, enemy.z, player) : player;
      const delta = worldDeltaInto(tempWorldDelta, enemy.x, enemy.z, target.x, target.z);
      const dx = delta.dx;
      const dz = delta.dz;
      const distance = Math.hypot(dx, dz) || 1;
      return { target, dx, dz, distance };
    });
    const { target, dx, dz, distance } = movement;
    if (enemy.animated && enemy.mesh) {
      const useMesh = enemy.boss
        || enemyCount < ANIMATED_ENEMY_DENSE_COUNT
        || (distance < ANIMATED_ENEMY_DENSE_MESH_RADIUS && animatedMeshBudget > 0);
      enemy.renderAsBillboard = !useMesh;
      enemy.mesh.visible = useMesh;
      if (useMesh && !enemy.boss && enemyCount >= ANIMATED_ENEMY_DENSE_COUNT) animatedMeshBudget -= 1;
    }
    const speed = enemy.speed * (enemy.slow > 0 ? 0.55 : 1);
    const beforeX = enemy.x;
    const beforeZ = enemy.z;
    enemy.x += (dx / distance) * speed * dt;
    enemy.z += (dz / distance) * speed * dt;
    enemy.x += (enemy.knockX ?? 0) * dt;
    enemy.z += (enemy.knockZ ?? 0) * dt;
    const knockDamping = Math.max(0, 1 - KNOCKBACK_DECAY * dt);
    enemy.knockX = Math.abs(enemy.knockX ?? 0) < KNOCKBACK_STOP_SPEED ? 0 : (enemy.knockX ?? 0) * knockDamping;
    enemy.knockZ = Math.abs(enemy.knockZ ?? 0) < KNOCKBACK_STOP_SPEED ? 0 : (enemy.knockZ ?? 0) * knockDamping;
    wrapEntity(enemy);
    const preciseTerrain = enemy.animated || enemy.boss || distance < terrainNearRadius || !enemy.batchKey;
    enemy.terrainClock = Math.max(0, (enemy.terrainClock ?? ((enemy.seed ?? i) % ENEMY_TERRAIN_STEP_SECONDS)) - dt);
    const refreshTerrain = preciseTerrain || (enemy.terrainClock <= 0 && terrainBudget > 0);
    if (refreshTerrain) {
      if (!preciseTerrain) terrainBudget -= 1;
      enemy.terrainClock = preciseTerrain ? 0 : Math.max(0.016, PERF_FLAGS.enemyTerrainStepSeconds) + ((enemy.seed ?? i) % 0.035);
      measureTelemetryPhase("enemyTerrainCollision", () => {
        resolveGroundActorTerrainMotion(enemy, beforeX, beforeZ, dt);
        if (PERF_FLAGS.farEnemyPropCollision || preciseTerrain) resolvePropCollisions(enemy);
      });
    } else if (typeof enemy.groundY !== "number" || !Number.isFinite(enemy.groundY)) {
      enemy.groundY = terrainHeightAt(enemy.x, enemy.z);
    }
    enemy.slow = Math.max(0, enemy.slow - dt);
    measureTelemetryPhase("enemyAnimation", () => updateEnemyAnimation(enemy, dt));
    setActorPosition(enemy, enemy.x, enemy.z);
    setActorFacing(enemy, Math.atan2(dz, dx));
    if (PERF_FLAGS.enemyHealthBars) measureTelemetryPhase("enemyHealthBars", () => updateEnemyHealthBar(enemy, dt));
    else removeEnemyHealthBar(enemy);
    if (!enemy.animated && enemy.mesh) enemy.mesh.scale.setScalar(enemy.scale * (1 + Math.sin(state.time * 5 + enemy.seed) * 0.035));
    if (distance < enemy.radius + target.radius) {
      if (target === player && actorsOverlapY(player, enemy)) damagePlayer(enemy.touch, { source: enemy });
      enemy.slow = 0.35;
    }
    if (enemy.hp <= 0) {
      killEnemy(i);
      continue;
    }
    measureTelemetryPhase("enemyBillboards", () => queueEnemyBillboardBatch(enemy));
  }
  measureTelemetryPhase("enemyBillboards", commitEnemyBillboardBatches);
  rebuildEnemySpatialGrid();
}

export function updateEnemyAnimation(enemy: Enemy, dt: number): void {
  if (!enemy.animated && !enemy.animator && !enemy.proceduralPose) {
    enemy.activeAnimation = "run";
    enemy.activeAnimationSource = "billboard";
    return;
  }
  if (enemy.renderAsBillboard) {
    enemy.activeAnimation = "run";
    enemy.activeAnimationSource = "billboard-lod";
    return;
  }
  const step = enemy.animStep ?? (enemy.boss ? BOSS_ANIMATION_STEP_SECONDS : ENEMY_ANIMATION_STEP_SECONDS);
  enemy.animClock = (enemy.animClock ?? ((enemy.seed ?? 0) % step)) - dt;
  if (enemy.animClock > 0) return;
  const elapsed = Math.min(step * 2.5, step + Math.max(0, -enemy.animClock));
  enemy.animClock += step;
  if (enemy.animClock < 0) enemy.animClock = ((enemy.seed ?? 0) % step);
  updateActorAnimation(enemy, elapsed, true);
}

export function resetEnemyBillboardBatches(): void {
  for (const batch of state.enemyBillboardBatches.values()) batch.count = 0;
}

export function commitEnemyBillboardBatches(): void {
  for (const batch of state.enemyBillboardBatches.values()) {
    batch.mesh.count = batch.count;
    batch.mesh.instanceMatrix.needsUpdate = true;
  }
}

export function queueEnemyBillboardBatch(enemy: Enemy): void {
  const batchKey = enemy.batchKey ?? (enemy.renderAsBillboard ? enemy.textureKey : null);
  if (!batchKey) return;
  const batch = getEnemyBillboardBatch(batchKey);
  if (batch.count >= batch.capacity) return;
  const position = renderPositionInto(tempRenderPosition, enemy.x, enemy.z);
  tempVec.set(position.x, actorGroundHeight(enemy) + PLAYER_HEIGHT_WORLD * enemy.scale * 0.5, position.z);
  tempQuaternion.copy(camera.quaternion);
  const pulse = 1 + Math.sin(state.time * 5 + enemy.seed) * 0.035;
  tempScale.set(2.7 * enemy.scale * pulse, PLAYER_HEIGHT_WORLD * enemy.scale * pulse, 1);
  tempMatrix.compose(tempVec, tempQuaternion, tempScale);
  batch.mesh.setMatrixAt(batch.count, tempMatrix);
  batch.count += 1;
}

export function getEnemyBillboardBatch(textureKey: string): InstanceBatch {
  let batch = state.enemyBillboardBatches.get(textureKey);
  if (batch) return batch;
  const texture = state.textures[textureKey] ?? state.textures.zombieA;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: false,
    alphaTest: 0.08,
    depthWrite: true,
    side: THREE.FrontSide
  });
  telemetry.materialCreates += 1;
  const mesh = new THREE.InstancedMesh(geometry, material, ENEMY_BILLBOARD_BATCH_CAPACITY);
  telemetry.meshCreates += 1;
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.instanceMatrix.setUsage?.(THREE.DynamicDrawUsage);
  scene.add(mesh);
  batch = { mesh, count: 0, capacity: ENEMY_BILLBOARD_BATCH_CAPACITY };
  state.enemyBillboardBatches.set(textureKey, batch);
  return batch;
}

export function updateEnemyHealthBar(enemy: Enemy, dt: number): void {
  if (!enemy?.maxHp || enemy.maxHp <= 0) return;
  enemy.healthBarTimer = Math.max(0, (enemy.healthBarTimer ?? 0) - dt);
  if (enemy.hp >= enemy.maxHp || enemy.healthBarTimer <= 0 || enemy.hp <= 0) {
    removeEnemyHealthBar(enemy);
    return;
  }
  const bar = ensureEnemyHealthBar(enemy);
  const ratio = clamp01(enemy.hp / enemy.maxHp);
  const position = renderPositionInto(tempRenderPosition, enemy.x, enemy.z);
  bar.root.position.set(position.x, actorGroundHeight(enemy) + PLAYER_HEIGHT_WORLD * enemy.scale + 0.56, position.z);
  bar.root.quaternion.copy(camera.quaternion);
  bar.root.scale.set(Math.max(1.25, enemy.scale * 1.8), 0.16, 1);
  bar.fill.scale.x = ratio;
  bar.fill.position.x = (ratio - 1) * 0.5;
  bar.fill.material.color.setHex(ratio > 0.55 ? 0xb9ff6e : ratio > 0.25 ? 0xffc45f : 0xff5f4d);
}

export function ensureEnemyHealthBar(enemy: Enemy): EnemyHealthBar {
  if (enemy.healthBar) return enemy.healthBar;
  const pooled = state.enemyHealthBarPool.pop();
  if (pooled) {
    pooled.root.visible = true;
    scene.add(pooled.root);
    enemy.healthBar = pooled;
    return enemy.healthBar;
  }
  const root = new THREE.Group();
  const back = new THREE.Mesh(getHealthBarGeometry(), getHealthBarBackMaterial());
  const fillMaterial = getHealthBarFillMaterial().clone();
  telemetry.materialCreates += 1;
  const fill = new THREE.Mesh(getHealthBarGeometry(), fillMaterial);
  back.position.z = -0.01;
  fill.position.z = 0.01;
  root.add(back, fill);
  scene.add(root);
  enemy.healthBar = { root, fill };
  return enemy.healthBar;
}

export function removeEnemyHealthBar(enemy: Enemy): void {
  if (!enemy?.healthBar) return;
  scene.remove(enemy.healthBar.root);
  enemy.healthBar.root.visible = false;
  state.enemyHealthBarPool.push(enemy.healthBar);
  enemy.healthBar = null;
}

export function getHealthBarGeometry(): Three.BufferGeometry {
  return requireRuntimeInstance(
    state.renderCache.get("geometry:enemyHealthBar", () => new THREE.PlaneGeometry(1, 1)),
    THREE.BufferGeometry,
    "Enemy health bar geometry"
  );
}

export function getHealthBarBackMaterial(): Three.MeshBasicMaterial {
  return requireRuntimeInstance(state.renderCache.get("material:enemyHealthBarBack", () => new THREE.MeshBasicMaterial({
    color: 0x160d0b,
    transparent: true,
    opacity: 0.82,
    depthWrite: false
  })), THREE.MeshBasicMaterial, "Enemy health bar back material");
}

export function getHealthBarFillMaterial(): Three.MeshBasicMaterial {
  return requireRuntimeInstance(state.renderCache.get("material:enemyHealthBarFill", () => new THREE.MeshBasicMaterial({
    color: 0xb9ff6e,
    transparent: true,
    opacity: 0.95,
    depthWrite: false
  })), THREE.MeshBasicMaterial, "Enemy health bar fill material");
}

export function resetPickupBatches(): void {
  for (const batch of state.pickupBatches.values()) batch.count = 0;
}

export function commitPickupBatches(): void {
  for (const batch of state.pickupBatches.values()) {
    batch.mesh.count = batch.count;
    batch.mesh.instanceMatrix.needsUpdate = true;
  }
}

export function queuePickupBatch(pickup: Pickup): void {
  const batch = getPickupBatch(pickup.kind, pickup.texture);
  if (batch.count >= batch.capacity) return;
  const pickupPosition = renderPositionInto(tempRenderPosition, pickup.x, pickup.z);
  const y = pickupY(pickup);
  tempVec.set(pickupPosition.x, y, pickupPosition.z);
  tempQuaternion.copy(camera.quaternion);
  const pulse = 1 + Math.sin(pickup.t * 5) * 0.06;
  tempScale.set(batch.width * pickup.scale * pulse, batch.height * pickup.scale * pulse, 1);
  tempMatrix.compose(tempVec, tempQuaternion, tempScale);
  batch.mesh.setMatrixAt(batch.count, tempMatrix);
  batch.count += 1;
}

export function getPickupBatch(kind: Pickup["kind"], texture: Three.Texture): PickupInstanceBatch {
  let batch = state.pickupBatches.get(kind);
  if (batch) return batch;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
    transparent: true,
    alphaTest: 0.04,
    depthWrite: false,
    blending: kind === "xp" || kind === "magnet" ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  telemetry.materialCreates += 1;
  const mesh = new THREE.InstancedMesh(geometry, material, PICKUP_BATCH_CAPACITY);
  telemetry.meshCreates += 1;
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.instanceMatrix.setUsage?.(THREE.DynamicDrawUsage);
  scene.add(mesh);
  const width = kind === "weapon" ? 1.25 : kind === "heal" ? 1.05 : kind === "magnet" ? 1.12 : 0.96;
  const height = kind === "weapon" ? 1.25 : kind === "heal" ? 1.05 : kind === "magnet" ? 1.12 : 0.96;
  batch = { mesh, count: 0, capacity: PICKUP_BATCH_CAPACITY, width, height };
  state.pickupBatches.set(kind, batch);
  return batch;
}

export function pickupY(pickup: Pickup): number {
  if (!Number.isFinite(pickup.groundY)) pickup.groundY = terrainHeightAt(pickup.x, pickup.z);
  return pickup.groundY + 1.15 + Math.sin(pickup.t * 5) * 0.18;
}

export function updateBullets(dt: number): void {
  const player = state.player;
  if (!player) return;
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const bullet = state.bullets[i];
    if (!bullet) continue;
    bullet.age = (bullet.age ?? 0) + dt;
    updateSpecialBulletMotion(bullet, dt);
    bullet.x += bullet.vx * dt;
    bullet.z += bullet.vz * dt;
    wrapEntity(bullet);
    bullet.ttl -= dt;
    bullet.y = projectileYAt(bullet.x, bullet.z, bullet.heightOffset ?? PROJECTILE_HEIGHT_OFFSET);
    const bulletPosition = renderPositionInto(tempRenderPosition, bullet.x, bullet.z);
    bullet.mesh.position.set(bulletPosition.x, bullet.y ?? 1.1, bulletPosition.z);
    bullet.mesh.rotation.y = -Math.atan2(bullet.vz, bullet.vx);
    let hit = false;
    const candidates = measureTelemetryPhase(
      "bulletTargeting",
      () => queryLiveEnemies(bullet.x, bullet.z, bullet.radius, state.enemyBulletScratch)
    );
    measureTelemetryPhase("bulletHits", () => {
      for (const enemy of candidates) {
        if (enemy.hp <= 0) continue;
        if (bullet.kind && bullet.hitEnemies.has(enemy)) continue;
        if (!bulletOverlapsEnemyY(bullet, enemy)) continue;
        if (worldDistanceSquared(enemy.x, enemy.z, bullet.x, bullet.z) < (enemy.radius + bullet.radius) ** 2) {
          const bulletSpeed = Math.max(1, bullet.speed ?? Math.hypot(bullet.vx, bullet.vz));
          const hitX = bullet.vx / bulletSpeed;
          const hitZ = bullet.vz / bulletSpeed;
          const dealtDamage = applyWeaponDamage(enemy, bullet, bullet.damage, { hitX, hitZ, knockbackScale: 1, slowSeconds: bullet.kind === "homing" ? 0.28 : 0.12, color: bullet.color });
          applyProjectileSplashDamage(bullet, enemy, dealtDamage, hitX, hitZ);
          if (bullet.kind) bullet.hitEnemies.add(enemy);
          bullet.pierce -= 1;
          spawnEffect("hit", enemy.x, enemy.z, 0.34, { angle: Math.atan2(bullet.vz, bullet.vx), color: bullet.color });
          playSynthCue("hit", Math.min(1.4, dealtDamage / 16), { color: bullet.color });
          hit = bullet.pierce <= 0;
          if (hit) break;
        }
      }
    });
    if (!hit && bullet.kind === "boomerang" && bullet.returning && worldDistanceSquared(bullet.x, bullet.z, player.x, player.z) <= 1.4 ** 2) hit = true;
    if (hit || bullet.ttl <= 0) removeFromList(state.bullets, i);
  }
}

export function bulletOverlapsEnemyY(bullet: CombatBullet, enemy: Enemy): boolean {
  const bulletY = bullet.y ?? projectileYAt(bullet.x, bullet.z, bullet.heightOffset ?? PROJECTILE_HEIGHT_OFFSET);
  const enemyBase = actorFeetY(enemy);
  const enemyTop = enemyBase + actorVerticalHeight(enemy);
  return bulletY >= enemyBase - PROJECTILE_VERTICAL_HIT_PAD && bulletY <= enemyTop + PROJECTILE_VERTICAL_HIT_PAD;
}

export function applyProjectileSplashDamage(
  bullet: CombatBullet,
  primaryEnemy: Enemy,
  dealtDamage: number,
  hitX: number,
  hitZ: number
): number {
  const splashRatio = Math.max(0, bullet.splashDamageMultiplier ?? 0);
  if (splashRatio <= 0) return 0;
  const radius = Math.max(1.2, bullet.splashRadius ?? 2.4);
  let hits = 0;
  const candidates = queryLiveEnemies(primaryEnemy.x, primaryEnemy.z, radius, state.enemySplashScratch);
  for (const enemy of candidates) {
    if (enemy === primaryEnemy || enemy.hp <= 0) continue;
    if (!actorsOverlapY(primaryEnemy, enemy, 0.6)) continue;
    if (worldDistanceSquared(enemy.x, enemy.z, primaryEnemy.x, primaryEnemy.z) > (radius + enemy.radius) ** 2) continue;
    applyWeaponDamage(enemy, bullet, Math.max(1, dealtDamage * splashRatio), {
      hitX,
      hitZ,
      knockbackScale: 0.35,
      slowSeconds: 0.08,
      color: bullet.color
    });
    hits += 1;
    if (hits >= 8) break;
  }
  if (hits > 0) {
    spawnPulseRing(primaryEnemy.x, primaryEnemy.z, bullet.color, 0.18, 0.45, radius * 0.72);
  }
  return hits;
}

export function updateSpecialBulletMotion(bullet: CombatBullet, dt: number): void {
  if (bullet.kind === "homing") {
    const target = lowestHealthEnemy(bullet.x, bullet.z, 34) ?? nearestEnemy(bullet.x, bullet.z, 34);
    if (!target) return;
    const delta = worldDeltaInto(tempWorldDelta, bullet.x, bullet.z, target.x, target.z);
    const dx = delta.dx;
    const dz = delta.dz;
    const distance = Math.hypot(dx, dz) || 1;
    const desiredVx = (dx / distance) * (bullet.speed ?? 16);
    const desiredVz = (dz / distance) * (bullet.speed ?? 16);
    const steer = clamp((bullet.turnRate ?? 6) * dt, 0, 1);
    bullet.vx += (desiredVx - bullet.vx) * steer;
    bullet.vz += (desiredVz - bullet.vz) * steer;
    return;
  }
  if (bullet.kind === "boomerang") {
    if (!bullet.returning && (bullet.age ?? 0) >= (bullet.outboundSeconds ?? 0.7)) {
      bullet.returning = true;
      bullet.hitEnemies.clear();
    }
    if (!bullet.returning) {
      bullet.mesh.rotation.z += dt * 8;
      return;
    }
    const player = state.player;
    if (!player) return;
    const delta = worldDeltaInto(tempWorldDelta, bullet.x, bullet.z, player.x, player.z);
    const dx = delta.dx;
    const dz = delta.dz;
    const distance = Math.hypot(dx, dz) || 1;
    const speed = bullet.returnSpeed ?? ((bullet.speed ?? 14) * 1.18);
    bullet.vx = (dx / distance) * speed;
    bullet.vz = (dz / distance) * speed;
    bullet.mesh.rotation.z -= dt * 10;
  }
}

export function updatePickups(dt: number): void {
  const player = state.player;
  if (!player) return;
  resetPickupBatches();
  for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
    const pickup = state.pickups[i];
    if (!pickup) continue;
    pickup.t += dt;
    pickup.ttl -= dt;
    if (pickup.ttl <= 0) {
      removeFromList(state.pickups, i);
      continue;
    }
    if (pickup.kind !== "magnet" && (pickup.magnetized || state.time < state.magnetPullUntil)) {
      pullPickupTowardPlayer(pickup, dt);
      updateMagnetPullVisual(pickup, dt);
    }
    const collectRadius = getPickupCollectRadius();
    if (worldDistanceSquared(pickup.x, pickup.z, player.x, player.z) < collectRadius ** 2) {
      collectPickup(pickup);
      removeFromList(state.pickups, i);
      continue;
    }
    if (pickup.mesh) {
      const pickupPosition = renderPositionInto(tempRenderPosition, pickup.x, pickup.z);
      pickup.mesh.position.set(pickupPosition.x, pickupY(pickup), pickupPosition.z);
      pickup.mesh.rotation.y += dt * (pickup.kind === "weapon" ? 1.5 : 1.05);
      forEachObjectMaterial(pickup.mesh, (material) => {
        if ("rotation" in material && typeof material.rotation === "number") material.rotation += dt * 0.8;
      });
      pickup.light?.position.set(pickupPosition.x, pickup.mesh.position.y, pickupPosition.z);
      if (pickup.light) pickup.light.intensity = (pickup.kind === "xp" ? 0.75 : 1.2) + Math.sin(pickup.t * 4) * 0.25;
    } else {
      queuePickupBatch(pickup);
    }
  }
  updatePickupLightPool();
  commitPickupBatches();
}

export function activatePickupMagnet(): void {
  const player = state.player;
  if (!player) return;
  state.magnetPullUntil = Math.max(state.magnetPullUntil ?? 0, state.time + MAGNET_PICKUP_SECONDS);
  for (const pickup of state.pickups) {
    if (pickup.kind !== "magnet") {
      pickup.magnetized = true;
      pickup.magnetTrailClock = 0;
    }
  }
  spawnPulseRing(player.x, player.z, "#9fe8ff", 0.22, 2.1, 8.8);
}

export function pullPickupTowardPlayer(pickup: Pickup, dt: number): void {
  const player = state.player;
  if (!player) return;
  const delta = worldDeltaInto(tempWorldDelta, pickup.x, pickup.z, player.x, player.z);
  const dx = delta.dx;
  const dz = delta.dz;
  const distance = Math.hypot(dx, dz);
  if (distance <= 0.001) return;
  const speed = MAGNET_PICKUP_SPEED * (pickup.kind === "weapon" ? 0.7 : 1);
  const step = Math.min(distance, speed * dt);
  pickup.x = wrapWorld(pickup.x + (dx / distance) * step);
  pickup.z = wrapWorld(pickup.z + (dz / distance) * step);
  pickup.groundY = terrainHeightAt(pickup.x, pickup.z);
}

export function updateMagnetPullVisual(pickup: Pickup, dt: number): void {
  pickup.magnetTrailClock = Math.max(0, (pickup.magnetTrailClock ?? 0) - dt);
  if (pickup.magnetTrailClock > 0) return;
  pickup.magnetTrailClock = 0.08;
  spawnEffect("airTrail", pickup.x, pickup.z, 0.26, {
    particles: 2,
    color: "#9fe8ff",
    y: 0.72,
    speed: 0.72,
    size: pickup.kind === "weapon" ? 0.2 : 0.16
  });
}

export function updatePickupLightPool(): void {
  const player = state.player;
  if (!player) return;
  const lights = state.lights.pickupLights ?? [];
  let lightIndex = 0;
  for (const light of lights) light.intensity = 0;
  for (const pickup of state.pickups) {
    if (lightIndex >= lights.length) break;
    const distanceSq = worldDistanceSquared(player.x, player.z, pickup.x, pickup.z);
    if (distanceSq > 55 ** 2) continue;
    if (pickup.kind === "xp" && lightIndex > Math.floor(lights.length / 2)) continue;
    const light = lights[lightIndex];
    if (!light) break;
    const pickupPosition = renderPositionInto(tempRenderPosition, pickup.x, pickup.z);
    const color = pickup.kind === "weapon" ? 0xffc45c : pickup.kind === "heal" ? 0xa5ff8e : pickup.kind === "magnet" ? 0x9fe8ff : 0x7bd6ff;
    light.color.setHex(color);
    light.position.set(pickupPosition.x, pickup.mesh?.position.y ?? pickupY(pickup), pickupPosition.z);
    light.intensity = pickup.kind === "weapon" ? 1.55 : pickup.kind === "heal" ? 1.1 : pickup.kind === "magnet" ? 1.35 : 0.68;
    lightIndex += 1;
  }
}

export function updateEffects(dt: number): void {
  measureTelemetryPhase("particleUpdateBatched", () => updateBatchedParticles(dt));
  measureTelemetryPhase("particleUpdateScene", () => updateSceneEffects(dt));
  state.muzzleFlash = Math.max(0, state.muzzleFlash - dt * 9);
  if (state.lights.muzzle) state.lights.muzzle.intensity = state.muzzleFlash * 10.5;
}

export function updateSceneEffects(dt: number): void {
  updateTimedEffectQueue(state.effects, dt, {
    getElapsed: (effect) => effect.t,
    setElapsed: (effect, elapsed) => {
      effect.t = elapsed;
    },
    getLifetime: (effect) => effect.life,
    onUpdate: ({ effect, delta, progress }) => {
      const fade = Math.max(0, 1 - progress);
      setEffectOpacity(effect.mesh, fade);
      if (effect.sparks) {
        for (const spark of effect.sparks) {
          spark.vy -= 9.5 * delta;
          spark.mesh.position.x += spark.vx * delta;
          spark.mesh.position.y = Math.max(0.08, spark.mesh.position.y + spark.vy * delta);
          spark.mesh.position.z += spark.vz * delta;
          spark.mesh.rotation.x += spark.rx * delta;
          spark.mesh.rotation.y += spark.ry * delta;
        }
      } else {
        effect.mesh.scale.setScalar(effect.baseScale * (1 + progress * effect.expand));
      }
    },
    onExpire: (effect) => {
      if (effect.mesh) scene.remove(effect.mesh);
      if (effect.light) scene.remove(effect.light);
    }
  });
}

export function updateRagdolls(dt: number): void {
  for (let i = state.ragdolls.length - 1; i >= 0; i -= 1) {
    const ragdoll = state.ragdolls[i];
    if (!ragdoll) continue;
    if (ragdoll.update(dt)) continue;
    scene.remove(ragdoll.root);
    state.ragdolls.splice(i, 1);
  }
}

export function updateBossAttacks(dt: number): void {
  for (const boss of state.enemies) {
    if (!boss.boss || boss.hp <= 0) continue;
    boss.nextAttack -= dt;
    if (boss.nextAttack > 0) continue;
    const kind = resolveBossAttackKind(boss);
    if (kind === "dash") spawnBossDash(boss);
    else if (kind === "nova") spawnBossNova(boss);
    else spawnBossSlam(boss);
    const ramp = Math.min(1, state.time / SPAWN_PACING.rampSeconds);
    boss.nextAttack = BOSS_ATTACKS.cooldownSeconds - (BOSS_ATTACKS.cooldownSeconds - BOSS_ATTACKS.cooldownMinSeconds) * ramp;
  }
}

export function resolveBossAttackKind(boss: Enemy): "slam" | "dash" | "nova" {
  const cycle = Math.floor(state.time / 6 + boss.seed) % 3;
  return cycle === 0 ? "slam" : cycle === 1 ? "dash" : "nova";
}

export function spawnBossSlam(boss: Enemy): void {
  const target = state.player;
  if (!target) return;
  const radius = Math.max(4.8, boss.radius * BOSS_ATTACKS.slamRadiusMultiplier);
  addAttackIndicator({
    kind: "slam",
    x: target.x,
    z: target.z,
    radius,
    damage: boss.touch * 2.2,
    windup: BOSS_ATTACKS.windupSeconds,
    ttl: BOSS_ATTACKS.windupSeconds + BOSS_ATTACKS.hitFlashSeconds
  });
}

export function spawnBossNova(boss: Enemy): void {
  addAttackIndicator({
    kind: "nova",
    x: boss.x,
    z: boss.z,
    radius: BOSS_ATTACKS.novaRadius + boss.radius * 1.4,
    damage: boss.touch * 1.7,
    windup: BOSS_ATTACKS.windupSeconds * 0.95,
    ttl: BOSS_ATTACKS.windupSeconds + BOSS_ATTACKS.hitFlashSeconds
  });
}

export function spawnBossDash(boss: Enemy): void {
  const player = state.player;
  if (!player) return;
  const angle = angleTo(boss.x, boss.z, player.x, player.z);
  const length = BOSS_ATTACKS.dashLength + boss.radius * 2.3;
  const width = Math.max(3.2, boss.radius * BOSS_ATTACKS.dashWidthMultiplier);
  addAttackIndicator({
    kind: "dash",
    x: wrapWorld(boss.x + Math.cos(angle) * length * 0.5),
    z: wrapWorld(boss.z + Math.sin(angle) * length * 0.5),
    originX: boss.x,
    originZ: boss.z,
    angle,
    length,
    width,
    damage: boss.touch * 2,
    windup: BOSS_ATTACKS.windupSeconds * 0.82,
    ttl: BOSS_ATTACKS.windupSeconds + BOSS_ATTACKS.hitFlashSeconds
  });
}

export function addAttackIndicator(indicator: AttackIndicatorSpec): void {
  let mesh: IndicatorMesh;
  if (indicator.kind === "dash") {
    mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(indicator.length, indicator.width),
      new THREE.MeshBasicMaterial({ color: 0xff5d4d, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -indicator.angle;
  } else {
    mesh = new THREE.Mesh(
      new THREE.CircleGeometry(indicator.radius, 48),
      new THREE.MeshBasicMaterial({ color: indicator.kind === "nova" ? 0xff9a45 : 0xff5d4d, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide })
    );
    mesh.rotation.x = -Math.PI / 2;
  }
  const position = renderPositionInto(tempRenderPosition, indicator.x, indicator.z);
  mesh.position.set(position.x, terrainHeightAt(indicator.x, indicator.z) + 0.07, position.z);
  scene.add(mesh);
  state.attackIndicators.push({ ...indicator, mesh, t: 0, applied: false });
  playSynthCue("telegraph", indicator.kind === "dash" ? 1.1 : 0.9);
}

export function updateAttackIndicators(dt: number): void {
  for (let i = state.attackIndicators.length - 1; i >= 0; i -= 1) {
    const indicator = state.attackIndicators[i];
    if (!indicator) continue;
    indicator.t += dt;
    const position = renderPositionInto(tempRenderPosition, indicator.x, indicator.z);
    indicator.mesh.position.set(position.x, terrainHeightAt(indicator.x, indicator.z) + 0.07, position.z);
    const armed = indicator.t >= indicator.windup;
    indicator.mesh.material.opacity = armed ? 0.72 : 0.18 + Math.sin(indicator.t * 18) * 0.12;
    if (armed && !indicator.applied) {
      indicator.applied = true;
      if (attackHitsPlayer(indicator)) {
        damagePlayer(indicator.damage, {
          sourceX: indicator.originX ?? indicator.x,
          sourceZ: indicator.originZ ?? indicator.z,
          knockbackForce: indicator.kind === "dash" ? 34 : 26
        });
        pulseShake(0.28, 0.5);
      }
      spawnEffect("blast", indicator.x, indicator.z, 0.26, { color: indicator.kind === "nova" ? "#ff9a45" : "#ff5d4d" });
      spawnPulseRing(indicator.x, indicator.z, indicator.kind === "nova" ? "#ff9a45" : "#ff5d4d", 0.34, indicator.kind === "dash" ? 1.5 : Math.max(1.2, indicator.radius * 0.25), 3.8);
      playSynthCue("slam", indicator.kind === "nova" ? 1.2 : 1);
    }
    if (indicator.t >= indicator.ttl) removeFromList(state.attackIndicators, i);
  }
}

export function attackHitsPlayer(indicator: AttackIndicator): boolean {
  const player = state.player;
  if (!player || playerClearsGroundHits()) return false;
  if (indicator.kind !== "dash") {
    return worldDistanceSquared(indicator.x, indicator.z, player.x, player.z) <= indicator.radius ** 2;
  }
  const delta = worldDeltaInto(tempWorldDelta, indicator.originX, indicator.originZ, player.x, player.z);
  const dx = delta.dx;
  const dz = delta.dz;
  const along = dx * Math.cos(indicator.angle) + dz * Math.sin(indicator.angle);
  const lateral = -dx * Math.sin(indicator.angle) + dz * Math.cos(indicator.angle);
  return along >= 0 && along <= indicator.length && Math.abs(lateral) <= indicator.width * 0.5;
}

export function updateHazards(dt: number): void {
  const player = state.player;
  if (!player) return;
  for (const hazard of state.hazards) {
    hazard.mesh.material.opacity = 0.18 + Math.sin(state.time * 2 + hazard.seed) * 0.04;
    hazard.damageClock = Math.max(0, (hazard.damageClock ?? 0) - dt);
    const playerInside = !playerClearsGroundHits() && worldDistanceSquared(player.x, player.z, hazard.x, hazard.z) < hazard.radius ** 2;
    if (playerInside && hazard.damageClock <= 0) {
      damagePlayer((hazard.dps ?? 0) * HAZARD_DAMAGE_TICK_SECONDS, {
        knockback: false,
        invulnSeconds: HAZARD_DAMAGE_TICK_SECONDS * 0.9,
        minDamage: 0.25
      });
      hazard.damageClock = HAZARD_DAMAGE_TICK_SECONDS;
    } else if (!playerInside) {
      hazard.damageClock = Math.min(hazard.damageClock, 0.08);
    }
    const candidates = queryLiveEnemies(hazard.x, hazard.z, hazard.radius);
    for (const enemy of candidates) {
      if (enemy.hp > 0) enemy.slow = Math.max(enemy.slow, 0.3);
    }
  }
}
