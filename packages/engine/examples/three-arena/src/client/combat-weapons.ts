import { COMBAT_BULLET_CAP, HEALTH_BAR_VISIBLE_SECONDS, PROJECTILE_HEIGHT_OFFSET, SPECIAL_WEAPON_OBJECT_CAPS } from "./constants.ts";
import { PERF_FLAGS } from "./environment.ts";
import { runtimeCallback } from "./runtime-ports.ts";
const resolveProgressionStats = runtimeCallback("progressionData", "resolveProgressionStats");
const getWeaponRuntime = runtimeCallback("progressionRuntime", "getWeaponRuntime");
const passiveWeapon = runtimeCallback("progressionRuntime", "passiveWeapon");
const actorFeetY = runtimeCallback("terrain", "actorFeetY");
const actorVerticalHeight = runtimeCallback("terrain", "actorVerticalHeight");
const terrainHeightAt = runtimeCallback("terrain", "terrainHeightAt");
const verticalRangesOverlap = runtimeCallback("terrain", "verticalRangesOverlap");
const playActorAnimation = runtimeCallback("actorAnimation", "playActorAnimation");
const playSynthCue = runtimeCallback("audio", "playSynthCue");
const updateEnemyHealthBar = runtimeCallback("combatEntities", "updateEnemyHealthBar");
const clamp01 = runtimeCallback("hud", "clamp01");
const pulseShake = runtimeCallback("hud", "pulseShake");
const updatePlayerWeaponVisual = runtimeCallback("modelAssets", "updatePlayerWeaponVisual");
const spawnEffect = runtimeCallback("particles", "spawnEffect");
const spawnPulseRing = runtimeCallback("particles", "spawnPulseRing");
const removeFromList = runtimeCallback("pointerAndTextures", "removeFromList");
const getEffectMaterial = runtimeCallback("renderCache", "getEffectMaterial");
const actorFloatingTextHeight = runtimeCallback("rewardFeedback", "actorFloatingTextHeight");
const spawnFloatingText = runtimeCallback("rewardFeedback", "spawnFloatingText");
const fireWeapon = runtimeCallback("spawnAndDamage", "fireWeapon");
const resolveEnemySpawnRank = runtimeCallback("spawnAndDamage", "resolveEnemySpawnRank");
const createProjectileVisual = runtimeCallback("weaponVisuals", "createProjectileVisual");
const getPlayerWeaponMuzzlePosition = runtimeCallback("weaponVisuals", "getPlayerWeaponMuzzlePosition");
const projectileYAt = runtimeCallback("weaponVisuals", "projectileYAt");
const angleTo = runtimeCallback("worldMath", "angleTo");
const nearestEnemy = runtimeCallback("worldMath", "nearestEnemy");
const queryLiveEnemies = runtimeCallback("worldMath", "queryLiveEnemies");
const renderPosition = runtimeCallback("worldMath", "renderPosition");
const renderPositionInto = runtimeCallback("worldMath", "renderPositionInto");
const worldDeltaInto = runtimeCallback("worldMath", "worldDeltaInto");
const worldDistanceSquared = runtimeCallback("worldMath", "worldDistanceSquared");
const wrapWorld = runtimeCallback("worldMath", "wrapWorld");
import type * as Three from "three";
import { state } from "./arena-state.ts";
import { THREE } from "./boot-and-dom.ts";
import { MANUAL_AIM_PRIORITY_SECONDS } from "./input-constants.ts";
import { clusterTargetScratch, pointer, scene, tempRenderPosition, tempWorldDelta } from "./runtime-context.ts";
import { measureTelemetryPhase } from "./telemetry-core.ts";
import type { DamageWeapon, WeaponRuntime } from "./content-types.ts";
import type { AreaWeaponDamageOptions, CombatBullet, Enemy, Player, WeaponAim, WeaponDamageOptions, WeaponZoneSpec, WorldPoint } from "./runtime-types.ts";

export function updateWeapons(dt: number): void {
  if (PERF_FLAGS.benchWalkOnly || state.benchStress?.quietCombat) return;
  const origin = state.player;
  if (!origin) return;
  for (const weaponId of state.weaponSlots) {
    const weapon = getWeaponRuntime(weaponId);
    if (!weapon) continue;
    const remaining = (state.weaponCooldowns.get(weaponId) ?? 0) - dt;
    if (remaining > 0) {
      state.weaponCooldowns.set(weaponId, remaining);
      continue;
    }
    measureTelemetryPhase("weaponFire", () => fireWeapon(weapon, resolveWeaponAim(weapon, origin).angle));
    state.weaponCooldowns.set(weaponId, weapon.cooldown);
  }
}

export function resolveWeaponAim(weapon: WeaponRuntime, origin: Player): WeaponAim {
  const manualAngle = angleTo(origin.x, origin.z, pointer.worldX, pointer.worldZ);
  if (isManualAimActive()) return { angle: manualAngle, mode: "manual", target: null };
  const target = selectWeaponTarget(weapon, origin);
  return target
    ? { angle: angleTo(origin.x, origin.z, target.x, target.z), mode: "auto", target }
    : { angle: manualAngle, mode: "manual-fallback", target: null };
}

export function isManualAimActive(now = state.time): boolean {
  return now < (pointer.manualAimUntil ?? 0);
}

export function markManualAim(seconds = MANUAL_AIM_PRIORITY_SECONDS): void {
  pointer.manualAimUntil = Math.max(pointer.manualAimUntil ?? 0, state.time + seconds);
}

export function selectWeaponTarget(weapon: WeaponRuntime, origin: Player): WorldPoint | null {
  if (weapon.id === "plagueVial") return densestEnemyCluster(origin.x, origin.z, weapon.range);
  if (weapon.id === "batSwarm") return lowestHealthEnemy(origin.x, origin.z, weapon.range);
  if (weapon.id === "coffinLid") {
    const mx = origin.moveMomentumX ?? 0;
    const mz = origin.moveMomentumZ ?? 0;
    if (Math.hypot(mx, mz) > 0.08) return { x: wrapWorld(origin.x + mx * 10), z: wrapWorld(origin.z + mz * 10) };
  }
  return nearestEnemy(origin.x, origin.z, weapon.range);
}

export function densestEnemyCluster(x: number, z: number, range: number): Enemy | null {
  let best: Enemy | null = null;
  let bestScore = -1;
  const candidates = queryLiveEnemies(x, z, range);
  for (const enemy of candidates) {
    if (enemy.hp <= 0) continue;
    let score = enemy.boss ? 3 : 1;
    const nearby = queryLiveEnemies(enemy.x, enemy.z, 5.3, state.enemySelectionScratch);
    for (const other of nearby) {
      if (other === enemy || other.hp <= 0) continue;
      score += other.boss ? 2.4 : 1;
    }
    if (score > bestScore) {
      best = enemy;
      bestScore = score;
    }
  }
  return best ?? nearestEnemy(x, z, range);
}

export function lowestHealthEnemy(x: number, z: number, range: number): Enemy | null {
  let best: Enemy | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const rangeSq = range * range;
  const candidates = queryLiveEnemies(x, z, range);
  for (const enemy of candidates) {
    if (enemy.hp <= 0) continue;
    const d2 = worldDistanceSquared(x, z, enemy.x, enemy.z);
    const healthRatio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 1;
    const score = healthRatio + d2 / Math.max(1, rangeSq) * 0.18 - (enemy.boss ? 0.16 : 0);
    if (score < bestScore) {
      best = enemy;
      bestScore = score;
    }
  }
  return best;
}

export function countCombatObjects(kind: string | undefined, list: ReadonlyArray<{ kind?: string }> = state.bullets): number {
  let count = 0;
  for (const item of list) {
    if (item.kind === kind) count += 1;
  }
  return count;
}

export function addCombatBullet(bullet: CombatBullet): boolean {
  const cap = (bullet.kind ? SPECIAL_WEAPON_OBJECT_CAPS[bullet.kind] : undefined) ?? COMBAT_BULLET_CAP;
  if (state.bullets.length >= COMBAT_BULLET_CAP || countCombatObjects(bullet.kind) >= cap) {
    if (bullet.mesh) scene.remove(bullet.mesh);
    return false;
  }
  state.bullets.push(bullet);
  return true;
}

export function fireSpecialWeapon(weapon: WeaponRuntime, aimAngle: number): boolean {
  const player = state.player;
  if (!player) return false;
  if (!["graveLantern", "plagueVial", "coffinLid", "batSwarm", "funeralBell", "reaperScythe"].includes(weapon.id)) return false;
  state.activeWeaponId = weapon.id;
  updatePlayerWeaponVisual(aimAngle);
  player.animLock = Math.max(player.animLock ?? 0, Math.min(0.24, weapon.cooldown * 0.5));
  if (weapon.id === "graveLantern") return fireLanternAura(weapon);
  if (weapon.id === "plagueVial") return firePlaguePools(weapon);
  if (weapon.id === "coffinLid") return fireCoffinBoomerang(weapon, aimAngle);
  if (weapon.id === "batSwarm") return fireBatSwarm(weapon, aimAngle);
  if (weapon.id === "funeralBell") return fireFuneralBell(weapon);
  if (weapon.id === "reaperScythe") return fireReaperSweep(weapon, aimAngle);
  return false;
}

export function fireLanternAura(weapon: WeaponRuntime): boolean {
  const player = state.player;
  if (!player) return false;
  const radius = Math.min(18, Math.max(4.8, (weapon.specialRadius ?? weapon.range * 0.32) * (weapon.evolved ? 1.18 : 1)));
  const hits = applyAreaWeaponDamage(weapon, player.x, player.z, radius, {
    damageScale: weapon.evolved ? 1.18 : 0.82,
    slowSeconds: weapon.evolved ? 0.42 : 0.22,
    knockbackScale: 0.55,
    hitLimit: weapon.evolved ? Number.POSITIVE_INFINITY : Math.max(5, weapon.pellets * 3)
  });
  state.activeWeaponId = weapon.id;
  updatePlayerWeaponVisual(angleTo(player.x, player.z, pointer.worldX, pointer.worldZ));
  state.muzzleFlash = Math.max(state.muzzleFlash, weapon.evolved ? 1.1 : 0.72);
  playActorAnimation(player, "cast", 0.03);
  spawnPulseRing(player.x, player.z, weapon.color, weapon.evolved ? 0.54 : 0.36, 1, radius * 0.58);
  spawnOrbitFlames(weapon, radius, Math.min(8, Math.max(3, weapon.pellets + (weapon.evolved ? 2 : 0))));
  playSynthCue("shot", hits ? 1.1 : 0.75, { weaponId: weapon.id, color: weapon.color });
  return true;
}

export function spawnOrbitFlames(weapon: WeaponRuntime, radius: number, count: number): void {
  const player = state.player;
  if (!player) return;
  for (let i = 0; i < count; i += 1) {
    const angle = state.time * 2.1 + (i / count) * Math.PI * 2;
    spawnEffect("muzzle", player.x + Math.cos(angle) * radius * 0.58, player.z + Math.sin(angle) * radius * 0.58, 0.26, {
      angle,
      color: weapon.color,
      particles: 5,
      y: 1.05,
      speed: 2.1,
      size: 0.22
    });
  }
}

export function firePlaguePools(weapon: WeaponRuntime): boolean {
  const targets = selectClusterTargets(Math.min(6, Math.max(1, weapon.pellets)), weapon.range);
  const poolRadius = Math.min(8.5, weapon.poolRadius ?? (3.4 + weapon.level * 0.22));
  const poolLife = (weapon.poolSeconds ?? (weapon.evolved ? 5.8 : 4.2)) * ((state.progressionStats ?? resolveProgressionStats()).effectDurationMultiplier ?? 1);
  const tickEvery = Math.max(0.16, weapon.tickInterval ?? (weapon.evolved ? 0.24 : 0.35));
  for (const [index, target] of targets.entries()) {
    const offsetAngle = index * 2.399963229728653;
    const x = wrapWorld(target.x + Math.cos(offsetAngle) * Math.min(2.8, index * 0.7));
    const z = wrapWorld(target.z + Math.sin(offsetAngle) * Math.min(2.8, index * 0.7));
    addWeaponZone({
      kind: weapon.evolved ? "moldBloom" : "plaguePool",
      weaponId: weapon.id,
      x,
      z,
      radius: poolRadius + (weapon.evolved ? 1.2 : 0),
      ttl: poolLife,
      tickEvery: weapon.evolved ? Math.max(0.14, tickEvery * 0.8) : tickEvery,
      damage: weapon.damage * (weapon.evolved ? 0.34 : 0.26),
      slowSeconds: weapon.evolved ? 0.72 : 0.46,
      color: weapon.evolved ? "#5f4535" : weapon.color
    });
    spawnEffect("blast", x, z, 0.24, { color: weapon.color, particles: 9, speed: 3.2, size: 0.28 });
  }
  state.activeWeaponId = weapon.id;
  playActorAnimation(state.player, "grenadeThrow", 0.035);
  playSynthCue("shot", 0.95, { weaponId: weapon.id, color: weapon.color });
  return true;
}

export function selectClusterTargets(count: number, range: number): WorldPoint[] {
  const player = state.player;
  if (!player) return [];
  const candidates = queryLiveEnemies(player.x, player.z, range);
  const selected = clusterTargetScratch;
  const scores = state.enemyDistanceScratch;
  selected.length = 0;
  scores.length = 0;
  for (const enemy of candidates) {
    if (enemy.hp <= 0) continue;
    let nearby = enemy.boss ? 3 : 0;
    const cluster = queryLiveEnemies(enemy.x, enemy.z, 7.5, state.enemyClusterScratch);
    for (const other of cluster) {
      if (other !== enemy && other.hp > 0) nearby += other.boss ? 3 : 1;
    }
    insertScoredEnemy(enemy, nearby, count, selected, scores, true);
  }
  if (!selected.length) {
    selected.push({ x: pointer.worldX, z: pointer.worldZ });
  }
  return selected;
}

export function insertScoredEnemy<T>(
  enemy: T,
  score: number,
  limit: number,
  selected: T[],
  scores: number[],
  descending = false
): void {
  let index = selected.length;
  while (index > 0 && (descending ? score > scores[index - 1] : score < scores[index - 1])) index -= 1;
  if (index >= limit) return;
  selected.splice(index, 0, enemy);
  scores.splice(index, 0, score);
  if (selected.length > limit) {
    selected.length = limit;
    scores.length = limit;
  }
}

export function fireCoffinBoomerang(weapon: WeaponRuntime, aimAngle: number): boolean {
  const muzzle = getPlayerWeaponMuzzlePosition(aimAngle);
  const color = weapon.color;
  const count = Math.max(1, Math.min(3, weapon.pellets));
  const projectileSize = Math.max(0.45, weapon.projectileSizeMultiplier ?? 1);
  for (let i = 0; i < count; i += 1) {
    const spread = (i - (count - 1) / 2) * Math.min(0.42, Math.max(0.12, weapon.spread || 0.18));
    const angle = aimAngle + spread;
    const mesh = createBoomerangVisual(weapon, angle);
    mesh.scale.setScalar(projectileSize);
    const x = wrapWorld(muzzle.x + Math.cos(angle) * 0.24);
    const z = wrapWorld(muzzle.z + Math.sin(angle) * 0.24);
    const position = renderPosition(x, z);
    mesh.position.set(position.x, muzzle.y, position.z);
    scene.add(mesh);
    addCombatBullet({
      kind: "boomerang",
      weaponId: weapon.id,
      x,
      z,
      y: muzzle.y,
      heightOffset: PROJECTILE_HEIGHT_OFFSET,
      vx: Math.cos(angle) * weapon.speed,
      vz: Math.sin(angle) * weapon.speed,
      mesh,
      color,
      damage: weapon.damage,
      damageType: weapon.damageType,
      eliteDamageMultiplier: weapon.eliteDamageMultiplier,
      critChance: weapon.critChance,
      critMultiplier: weapon.critMultiplier,
      radius: Math.max(weapon.evolved ? 1.05 : 0.82, (weapon.width ?? 1.8) * 0.48),
      pierce: weapon.evolved ? 999 : Math.max(8, weapon.pierce),
      ttl: weapon.evolved ? 2.9 : 2.35,
      outboundSeconds: weapon.evolved ? 0.8 : 0.68,
      speed: weapon.speed,
      returnSpeed: weapon.returnSpeed,
      knockback: weapon.knockback * 1.2,
      splashDamageMultiplier: weapon.splashDamageMultiplier,
      splashRadius: weapon.splashRadius,
      hitEnemies: new Set()
    });
  }
  state.activeWeaponId = weapon.id;
  playActorAnimation(state.player, "shieldOneShot", 0.03);
  spawnEffect("muzzle", muzzle.x, muzzle.z, 0.18, { angle: aimAngle, color, particles: 8, worldY: muzzle.y, speed: 5.2 });
  playSynthCue("shot", 1, { weaponId: weapon.id, color });
  return true;
}

export function createBoomerangVisual(weapon: WeaponRuntime, angle: number): Three.Group {
  const group = new THREE.Group();
  const material = getEffectMaterial(new THREE.Color(weapon.color), 0.74);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.18, 0.62), material);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.05, 0.76), getEffectMaterial(new THREE.Color("#f4d5aa"), 0.46));
  group.add(lid, edge);
  group.rotation.y = -angle;
  group.rotation.z = Math.PI * 0.04;
  return group;
}

export function fireBatSwarm(weapon: WeaponRuntime, aimAngle: number): boolean {
  const muzzle = getPlayerWeaponMuzzlePosition(aimAngle);
  const count = Math.max(2, Math.min(9, weapon.pellets + (weapon.evolved ? 2 : 0)));
  const projectileSize = Math.max(0.45, weapon.projectileSizeMultiplier ?? 1);
  for (let i = 0; i < count; i += 1) {
    const angle = aimAngle + (i - (count - 1) / 2) * 0.28;
    const mesh = createBatProjectileVisual(weapon, angle);
    mesh.scale.multiplyScalar(projectileSize);
    const x = wrapWorld(muzzle.x + Math.cos(angle) * 0.35);
    const z = wrapWorld(muzzle.z + Math.sin(angle) * 0.35);
    const position = renderPosition(x, z);
    const heightOffset = PROJECTILE_HEIGHT_OFFSET + 0.18 + (i % 3) * 0.08;
    const y = projectileYAt(x, z, heightOffset);
    mesh.position.set(position.x, y, position.z);
    scene.add(mesh);
    addCombatBullet({
      kind: "homing",
      weaponId: weapon.id,
      x,
      z,
      y,
      heightOffset,
      vx: Math.cos(angle) * (weapon.summonSpeed ?? weapon.speed),
      vz: Math.sin(angle) * (weapon.summonSpeed ?? weapon.speed),
      mesh,
      color: weapon.evolved ? "#ff4f7b" : weapon.color,
      damage: weapon.damage * (weapon.evolved ? 1.14 : 0.92),
      damageType: weapon.damageType,
      eliteDamageMultiplier: weapon.eliteDamageMultiplier,
      critChance: (weapon.critChance ?? 0) + 0.04,
      critMultiplier: weapon.critMultiplier,
      radius: (weapon.evolved ? 0.56 : 0.42) * projectileSize,
      pierce: weapon.evolved ? 2 : 1,
      ttl: (weapon.summonSeconds ?? (weapon.evolved ? 4.8 : 3.8)) * (weapon.evolved ? 1.08 : 1),
      speed: (weapon.summonSpeed ?? weapon.speed) * (weapon.evolved ? 1.08 : 1),
      biteCooldown: weapon.biteCooldown,
      turnRate: weapon.evolved ? 9.5 : 7,
      knockback: weapon.knockback * 0.72,
      splashDamageMultiplier: weapon.splashDamageMultiplier,
      splashRadius: weapon.splashRadius,
      hitEnemies: new Set()
    });
  }
  state.activeWeaponId = weapon.id;
  playActorAnimation(state.player, "microDroneSpawn", 0.035);
  spawnEffect("muzzle", muzzle.x, muzzle.z, 0.24, { angle: aimAngle, color: weapon.color, particles: 15, worldY: muzzle.y, speed: 4.4 });
  playSynthCue("shot", 0.88, { weaponId: weapon.id, color: weapon.color });
  return true;
}

export function createBatProjectileVisual(weapon: WeaponRuntime, angle: number): Three.Group {
  const group = createProjectileVisual({ ...weapon, color: weapon.evolved ? "#ff4f7b" : "#7a3550" }, angle);
  group.scale.set(0.82, 0.62, 0.82);
  return group;
}

export function fireFuneralBell(weapon: WeaponRuntime): boolean {
  const player = state.player;
  if (!player) return false;
  const radius = Math.min(24, (weapon.pulseRadius ?? (7.2 + weapon.level * 0.72)) + (weapon.evolved ? 2.4 : 0));
  const hits = applyAreaWeaponDamage(weapon, player.x, player.z, radius, {
    damageScale: weapon.evolved ? 1.25 : 0.95,
    slowSeconds: weapon.evolved ? 0.95 : 0.58,
    knockbackScale: weapon.evolved ? 1.75 : 1.35
  });
  state.activeWeaponId = weapon.id;
  playActorAnimation(player, "singularityChannelStart", 0.035);
  spawnPulseRing(player.x, player.z, weapon.color, 0.5, 1.2, radius * 0.52);
  spawnPulseRing(player.x, player.z, "#fff2b8", 0.28, 0.7, radius * 0.32);
  for (let i = 1; i < Math.min(weapon.pellets, 4); i += 1) {
    spawnPulseRing(player.x, player.z, i % 2 ? "#fff2b8" : weapon.color, 0.32, 0.9 + i * 0.18, radius * (0.34 + i * 0.08));
  }
  playSynthCue("shot", hits ? 1.15 : 0.9, { weaponId: weapon.id, color: weapon.color });
  pulseShake(0.16, 0.18);
  return true;
}

export function fireReaperSweep(weapon: WeaponRuntime, aimAngle: number): boolean {
  const player = state.player;
  if (!player) return false;
  const range = Math.min(25, (weapon.sweepRadius ?? (10 + weapon.level * 0.72)) + (weapon.evolved ? 2.6 : 0));
  const halfAngle = Math.min(1.35, (weapon.sweepArc ?? (weapon.evolved ? 2.24 : 1.64)) * 0.5);
  let hits = 0;
  const candidates = queryLiveEnemies(player.x, player.z, range);
  for (const enemy of candidates) {
    if (enemy.hp <= 0) continue;
    const delta = worldDeltaInto(tempWorldDelta, player.x, player.z, enemy.x, enemy.z);
    const dx = delta.dx;
    const dz = delta.dz;
    const along = dx * Math.cos(aimAngle) + dz * Math.sin(aimAngle);
    if (along < -1 || along > range) continue;
    const angle = Math.abs(normalizeAngle(Math.atan2(dz, dx) - aimAngle));
    if (angle > halfAngle) continue;
    const executeDamage = enemy.hp <= (enemy.maxHp ?? enemy.hp) * (weapon.executeRatio ?? 0.08) ? enemy.hp + 1 : 0;
    const dealt = applyWeaponDamage(enemy, weapon, Math.max(executeDamage, weapon.damage * (weapon.evolved ? 1.28 : 1.05)), {
      hitX: Math.cos(aimAngle),
      hitZ: Math.sin(aimAngle),
      knockbackScale: weapon.evolved ? 1.4 : 1.05,
      slowSeconds: weapon.evolved ? 0.55 : 0.32
    });
    if (dealt > 0) hits += 1;
  }
  state.activeWeaponId = weapon.id;
  playActorAnimation(player, "swordAttack", 0.025);
  spawnSweepVisual(player.x, player.z, aimAngle, range, halfAngle, weapon.color);
  playSynthCue("shot", hits ? 1.2 : 0.82, { weaponId: weapon.id, color: weapon.color });
  return true;
}

export function updateWeaponZones(dt: number): void {
  for (let i = state.weaponZones.length - 1; i >= 0; i -= 1) {
    const zone = state.weaponZones[i];
    if (!zone) continue;
    zone.ttl -= dt;
    zone.age += dt;
    zone.tickClock -= dt;
    const position = renderPositionInto(tempRenderPosition, zone.x, zone.z);
    zone.mesh.position.set(position.x, terrainHeightAt(zone.x, zone.z) + 0.06, position.z);
    zone.mesh.material.opacity = (zone.opacity ?? 0.22) * clamp01(zone.ttl / Math.max(0.001, zone.life)) * (0.78 + Math.sin((zone.age + zone.seed) * 5) * 0.18);
    zone.mesh.rotation.z += dt * (zone.kind === "moldBloom" ? 0.38 : 0.18);
    if (zone.tickClock <= 0) {
      zone.tickClock += zone.tickEvery;
      const weapon = getWeaponRuntime(zone.weaponId) ?? passiveWeapon(zone.weaponId, zone.color, zone.damageType ?? "arcane");
      if (weapon) {
        applyAreaWeaponDamage(weapon, zone.x, zone.z, zone.radius, {
          damageOverride: zone.damage,
          slowSeconds: zone.slowSeconds,
          knockbackScale: 0.28,
          color: zone.color
        });
      }
    }
    if (zone.ttl <= 0) removeFromList(state.weaponZones, i);
  }
}

export function addWeaponZone(zone: WeaponZoneSpec): boolean {
  const cap = SPECIAL_WEAPON_OBJECT_CAPS[zone.kind] ?? SPECIAL_WEAPON_OBJECT_CAPS.plaguePool ?? 36;
  if (state.weaponZones.length >= cap || countCombatObjects(zone.kind, state.weaponZones) >= cap) return false;
  const color = new THREE.Color(zone.color ?? "#74c96b");
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(zone.radius, 48),
    getEffectMaterial(color, zone.kind === "moldBloom" ? 0.28 : 0.22)
  );
  mesh.rotation.x = -Math.PI / 2;
  const position = renderPositionInto(tempRenderPosition, zone.x, zone.z);
  mesh.position.set(position.x, terrainHeightAt(zone.x, zone.z) + 0.06, position.z);
  scene.add(mesh);
  state.weaponZones.push({
    ...zone,
    mesh,
    age: 0,
    life: zone.ttl,
    tickClock: 0.04,
    opacity: zone.kind === "moldBloom" ? 0.28 : 0.22,
    seed: Math.random() * 10
  });
  return true;
}

export function applyAreaWeaponDamage(
  weapon: DamageWeapon,
  x: number,
  z: number,
  radius: number,
  options: AreaWeaponDamageOptions = {}
): number {
  let hits = 0;
  const hitLimit = options.hitLimit ?? Number.POSITIVE_INFINITY;
  const candidates = queryLiveEnemies(x, z, radius);
  const selected = Number.isFinite(hitLimit) ? state.enemySelectionScratch : candidates;
  if (selected === state.enemySelectionScratch) {
    const distances = state.enemyDistanceScratch;
    selected.length = 0;
    distances.length = 0;
    for (const enemy of candidates) {
      if (enemy.hp <= 0 || !areaOverlapsEnemyY(x, z, enemy)) continue;
      const distanceSq = worldDistanceSquared(x, z, enemy.x, enemy.z);
      insertScoredEnemy(enemy, distanceSq, hitLimit, selected, distances);
    }
  }
  for (const enemy of selected) {
    if (hits >= (options.hitLimit ?? Number.POSITIVE_INFINITY)) break;
    if (enemy.hp <= 0 || !areaOverlapsEnemyY(x, z, enemy)) continue;
    const delta = worldDeltaInto(tempWorldDelta, x, z, enemy.x, enemy.z);
    const dx = delta.dx;
    const dz = delta.dz;
    const distance = Math.hypot(dx, dz) || 1;
    const dealt = applyWeaponDamage(enemy, weapon, options.damageOverride ?? weapon.damage * (options.damageScale ?? 1), {
      hitX: dx / distance,
      hitZ: dz / distance,
      knockbackScale: options.knockbackScale ?? 1,
      slowSeconds: options.slowSeconds ?? 0.2,
      color: options.color ?? weapon.color
    });
    if (dealt > 0) hits += 1;
  }
  return hits;
}

export function areaOverlapsEnemyY(x: number, z: number, enemy: Enemy, height = 4.8): boolean {
  const base = terrainHeightAt(x, z);
  const enemyBase = actorFeetY(enemy);
  return verticalRangesOverlap(base, base + height, enemyBase, enemyBase + actorVerticalHeight(enemy), 0.35);
}

export function applyWeaponDamage(
  enemy: Enemy,
  weapon: DamageWeapon,
  baseDamage: number,
  options: WeaponDamageOptions = {}
): number {
  const eliteTarget = enemy.boss || resolveEnemySpawnRank(enemy.typeId) >= 0.66;
  const crit = Math.random() < (weapon.critChance ?? 0);
  const dealtDamage = baseDamage * (eliteTarget ? (weapon.eliteDamageMultiplier ?? 1) : 1) * (crit ? (weapon.critMultiplier ?? 1.75) : 1);
  enemy.hp -= dealtDamage;
  enemy.slow = Math.max(enemy.slow ?? 0, options.slowSeconds ?? 0.12);
  const hitX = options.hitX ?? 0;
  const hitZ = options.hitZ ?? 0;
  const force = ((weapon.knockback ?? 2) * (options.knockbackScale ?? 1)) / Math.max(0.65, enemy.radius * (enemy.boss ? 2.1 : 0.82));
  enemy.knockX = (enemy.knockX ?? 0) + hitX * force;
  enemy.knockZ = (enemy.knockZ ?? 0) + hitZ * force;
  enemy.lastHit = { x: hitX, z: hitZ, force: Math.max(force, Math.min(7, dealtDamage / 5)) };
  enemy.healthBarTimer = HEALTH_BAR_VISIBLE_SECONDS;
  updateEnemyHealthBar(enemy, 0);
  if (dealtDamage >= 22 || crit || Math.random() < 0.12) {
    spawnFloatingText(`${crit ? "CRIT " : ""}${Math.round(dealtDamage)}`, enemy.x, enemy.z, crit ? "#fff4a6" : (options.color ?? weapon.color), crit ? 1.14 : 0.96, { targetHeight: actorFloatingTextHeight(enemy) });
  }
  if (crit || dealtDamage >= Math.max(24, enemy.maxHp * 0.32)) {
    const impactColor = crit ? "#fff2a8" : (options.color ?? weapon.color);
    spawnPulseRing(enemy.x, enemy.z, impactColor, crit ? 0.42 : 0.3, 0.78, crit ? 2.6 : 1.8);
    spawnEffect("hit", enemy.x, enemy.z, crit ? 0.48 : 0.36, { color: impactColor, particles: crit ? 15 : 10, speed: crit ? 7.2 : 5.8, size: crit ? 0.36 : 0.28 });
  }
  return dealtDamage;
}

export function spawnSweepVisual(
  x: number,
  z: number,
  angle: number,
  range: number,
  halfAngle: number,
  colorValue: Three.ColorRepresentation
): void {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(Math.cos(-halfAngle) * range, Math.sin(-halfAngle) * range);
  shape.absarc(0, 0, range, -halfAngle, halfAngle, false);
  shape.lineTo(0, 0);
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 32), getEffectMaterial(new THREE.Color(colorValue), 0.28));
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = -angle;
  const position = renderPosition(x, z);
  mesh.position.set(position.x, terrainHeightAt(x, z) + 0.12, position.z);
  scene.add(mesh);
  state.effects.push({ mesh, t: 0, life: 0.28, baseScale: 1, expand: 0.14 });
  spawnEffect("muzzle", wrapWorld(x + Math.cos(angle) * 2.2), wrapWorld(z + Math.sin(angle) * 2.2), 0.22, { angle, color: colorValue, particles: 12, y: 0.9, speed: 6.4, size: 0.24 });
}

export function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
