import { BLACK_GARLIC_COOLDOWN_MULTIPLIER, BLACK_GARLIC_RANGE_MULTIPLIER, PICKUP_COLLECT_RADIUS, PICKUP_COLLECT_RADIUS_MULTIPLIER } from "./constants.ts";
import { runtimeCallback } from "./runtime-ports.ts";
const classUnlockedPassiveIds = runtimeCallback("progressionData", "classUnlockedPassiveIds");
const classUnlockedWeaponIds = runtimeCallback("progressionData", "classUnlockedWeaponIds");
const configuredLoadoutForClass = runtimeCallback("progressionData", "configuredLoadoutForClass");
const resolveProgressionStats = runtimeCallback("progressionData", "resolveProgressionStats");
const selectedClass = runtimeCallback("progressionData", "selectedClass");
const addWeaponZone = runtimeCallback("combatWeapons", "addWeaponZone");
const applyAreaWeaponDamage = runtimeCallback("combatWeapons", "applyAreaWeaponDamage");
const applyWeaponDamage = runtimeCallback("combatWeapons", "applyWeaponDamage");
const clamp = runtimeCallback("hud", "clamp");
const spawnBeamPreview = runtimeCallback("particles", "spawnBeamPreview");
const spawnEffect = runtimeCallback("particles", "spawnEffect");
const spawnPulseRing = runtimeCallback("particles", "spawnPulseRing");
const actorFloatingTextHeight = runtimeCallback("rewardFeedback", "actorFloatingTextHeight");
const spawnFloatingText = runtimeCallback("rewardFeedback", "spawnFloatingText");
const resolveEnemySpawnRank = runtimeCallback("spawnAndDamage", "resolveEnemySpawnRank");
const angleTo = runtimeCallback("worldMath", "angleTo");
const queryLiveEnemies = runtimeCallback("worldMath", "queryLiveEnemies");
const worldDelta = runtimeCallback("worldMath", "worldDelta");
const worldDistanceSquared = runtimeCallback("worldMath", "worldDistanceSquared");
const wrapWorld = runtimeCallback("worldMath", "wrapWorld");
import { state } from "./arena-state.ts";
import { MAX_LOADOUT_PASSIVES, data, passiveItemsById, weaponsById } from "./content-runtime.ts";
import type { DamageWeapon, ProgressionBonus, WeaponDefinition, WeaponRuntime } from "./content-types.ts";
import type { Enemy, ProgressionStats } from "./runtime-types.ts";

export function getWeaponLevel(id: string): number {
  return state.weaponLevels.get(id) ?? (state.weaponSlots.includes(id) ? 1 : 0);
}

export function setWeaponLevel(id: string, level: number): number {
  const weapon = weaponsById.get(id);
  if (!weapon) return 0;
  const nextLevel = clamp(Math.floor(level), 1, weapon.maxLevel ?? 1);
  state.weaponLevels.set(id, nextLevel);
  return nextLevel;
}

export function addWeaponToLoadout(id: string | null | undefined, level = 1): boolean {
  if (typeof id !== "string" || !weaponsById.has(id)) return false;
  if (!state.weaponSlots.includes(id) && state.weaponSlots.length >= getMaxWeaponSlots()) return false;
  if (!state.weaponSlots.includes(id)) state.weaponSlots.push(id);
  setWeaponLevel(id, Math.max(level, getWeaponLevel(id) || 1));
  state.activeWeaponId = state.activeWeaponId ?? id;
  return true;
}

export function addPassiveToLoadout(id: string | null | undefined, level = 1): boolean {
  if (typeof id !== "string" || !passiveItemsById.has(id)) return false;
  if (!state.passiveSlots.includes(id) && state.startingPassiveIds.size > 0 && !state.startingPassiveIds.has(id)) return false;
  if (!state.passiveSlots.includes(id) && state.passiveSlots.length >= getMaxPassiveSlots()) return false;
  if (!state.passiveSlots.includes(id)) state.passiveSlots.push(id);
  const passive = passiveItemsById.get(id);
  const nextLevel = clamp(Math.floor(level), 1, passive?.maxLevel ?? 1);
  state.passiveLevels.set(id, Math.max(nextLevel, state.passiveLevels.get(id) ?? 0));
  return true;
}

export function applyClassLoadout(): void {
  state.weaponSlots = [];
  state.weaponCooldowns.clear();
  state.weaponLevels.clear();
  state.passiveSlots = [];
  state.passiveLevels.clear();
  state.passiveTimers.clear();
  state.startingPassiveIds.clear();
  state.passiveTeamworkEffects.clear();
  state.evolvedWeapons.clear();
  state.statBonuses = [];
  const klass = selectedClass();
  const loadout = configuredLoadoutForClass(klass);
  const starterWeapon = loadout.weaponId ?? klass?.starterWeapon ?? data.levelUpPools?.starterWeapons?.[0] ?? data.weapons[0]?.id;
  addWeaponToLoadout(starterWeapon, 1);
  for (const passiveId of loadout.passiveIds ?? []) addPassiveToLoadout(passiveId, 1);
  state.startingPassiveIds = new Set(state.passiveSlots);
  if (!state.weaponSlots.length && data.weapons[0]) addWeaponToLoadout(data.weapons[0].id, 1);
  state.activeWeaponId = state.weaponSlots[0] ?? null;
}

export function getMaxWeaponSlots(): number {
  return 1;
}

export function getMaxPassiveSlots(): number {
  return Math.max(1, state.startingPassiveIds.size || MAX_LOADOUT_PASSIVES);
}

export function getPassiveLevel(id: string): number {
  return state.passiveLevels.get(id) ?? 0;
}

export function passiveTimerReady(id: string, cooldown: number, dt: number): boolean {
  const remaining = (state.passiveTimers.get(id) ?? 0) - dt;
  if (remaining > 0) {
    state.passiveTimers.set(id, remaining);
    return false;
  }
  state.passiveTimers.set(id, cooldown);
  return true;
}

export function updatePassiveEffects(dt: number): void {
  if (!state.player || state.benchStress?.quietCombat) return;
  if (getPassiveLevel("blackGarlic") > 0 && passiveTimerReady("blackGarlic", Math.max(0.16, (0.74 - getPassiveLevel("blackGarlic") * 0.045) * BLACK_GARLIC_COOLDOWN_MULTIPLIER), dt)) {
    triggerBlackGarlicAura();
  }
  if (getPassiveLevel("graveBoots") > 0) updateGraveBootTrail(dt);
  if (getPassiveLevel("silverRosary") > 0 && passiveTimerReady("silverRosary", Math.max(0.8, 1.85 - getPassiveLevel("silverRosary") * 0.09), dt)) {
    triggerSilverRosaryMark();
  }
  if (getPassiveLevel("funeralBellClapper") > 0 && passiveTimerReady("funeralBellClapper", Math.max(2.8, 6.2 - getPassiveLevel("funeralBellClapper") * 0.42), dt)) {
    triggerTempoChime();
  }
}

export function passiveWeapon(id: string, color: string, damageType = "holy"): DamageWeapon {
  const level = getPassiveLevel(id);
  return {
    id,
    color,
    damageType,
    damage: 4 + level * 2.2,
    knockback: 1.6 + level * 0.5,
    eliteDamageMultiplier: 1 + level * 0.035,
    critChance: (state.progressionStats?.critChanceFlat ?? 0) * 0.5,
    critMultiplier: state.progressionStats?.critMultiplier ?? 1.75
  };
}

export function triggerBlackGarlicAura(): void {
  const player = state.player;
  if (!player) return;
  const level = getPassiveLevel("blackGarlic");
  const radius = (3.6 + level * 0.58) * BLACK_GARLIC_RANGE_MULTIPLIER + ((state.progressionStats ?? resolveProgressionStats()).auraRadiusMultiplier - 1) * 4;
  const weapon = passiveWeapon("blackGarlic", "#d6c0a4", "shadow");
  const hits = applyAreaWeaponDamage(weapon, player.x, player.z, radius, {
    damageScale: 0.55 + level * 0.08,
    slowSeconds: 0.24 + level * 0.025,
    knockbackScale: 0.25,
    hitLimit: 10 + level * 3
  });
  if (!hits) return;
  spawnPulseRing(player.x, player.z, "#d6c0a4", 0.18, 0.7, radius * 0.75);
}

export function updateGraveBootTrail(dt: number): void {
  const player = state.player;
  if (!player) return;
  const speed = Math.hypot(player.moveMomentumX, player.moveMomentumZ);
  if (speed < player.speed * 0.74) {
    state.passiveTimers.set("graveBootsTrail", Math.min(state.passiveTimers.get("graveBootsTrail") ?? 0, 0.12));
    return;
  }
  if (!passiveTimerReady("graveBootsTrail", Math.max(0.14, 0.34 - getPassiveLevel("graveBoots") * 0.025), dt)) return;
  const backX = -(player.moveMomentumX / Math.max(0.001, speed));
  const backZ = -(player.moveMomentumZ / Math.max(0.001, speed));
  const x = wrapWorld(player.x + backX * 1.15);
  const z = wrapWorld(player.z + backZ * 1.15);
  const weapon = passiveWeapon("graveBoots", "#9f8d72", "physical");
  applyAreaWeaponDamage(weapon, x, z, 2.2 + getPassiveLevel("graveBoots") * 0.16, {
    damageScale: 0.22,
    slowSeconds: 0.36,
    knockbackScale: 0.08,
    hitLimit: 5
  });
  spawnEffect("jumpDust", x, z, 0.22, { particles: 5, color: "#9f8d72", y: 0.14, speed: 1.6, size: 0.14 });
}

export function triggerSilverRosaryMark(): void {
  const player = state.player;
  if (!player) return;
  let target: Enemy | null = null;
  let best = -Infinity;
  const candidates = queryLiveEnemies(player.x, player.z, 42);
  for (const enemy of candidates) {
    if (enemy.hp <= 0) continue;
    const distanceSq = worldDistanceSquared(player.x, player.z, enemy.x, enemy.z);
    const score = (enemy.boss ? 80 : 0) + resolveEnemySpawnRank(enemy.typeId) * 40 + (enemy.hp / Math.max(1, enemy.maxHp)) * 10 - distanceSq * 0.001;
    if (score > best) {
      best = score;
      target = enemy;
    }
  }
  if (!target) return;
  const weapon = passiveWeapon("silverRosary", "#f2f4df", "holy");
  const { dx, dz } = worldDelta(player.x, player.z, target.x, target.z);
  const distance = Math.hypot(dx, dz) || 1;
  applyWeaponDamage(target, weapon, weapon.damage * 1.8, { hitX: dx / distance, hitZ: dz / distance, knockbackScale: 0.42, slowSeconds: 0.5, color: "#f2f4df" });
  spawnPulseRing(target.x, target.z, "#f2f4df", 0.3, 0.55, 2.5);
  spawnBeamPreview({ x: player.x, y: 1.4, z: player.z }, angleTo(player.x, player.z, target.x, target.z), Math.min(18, distance), "#f2f4df");
}

export function triggerTempoChime(): void {
  const player = state.player;
  if (!player) return;
  const level = getPassiveLevel("funeralBellClapper");
  const refund = 0.12 + level * 0.08;
  for (const [weaponId, remaining] of state.weaponCooldowns) {
    state.weaponCooldowns.set(weaponId, Math.max(0, remaining - refund));
  }
  spawnPulseRing(player.x, player.z, "#c8b784", 0.22, 0.75, 3.4 + level * 0.42);
  spawnFloatingText("TEMPO", player.x, player.z, "#f3de9a", 0.88, { targetHeight: actorFloatingTextHeight(player, 0.8), lifeSeconds: 0.55 });
}

export function triggerBloodHourglassDeathBloom(enemy: Enemy): void {
  const level = getPassiveLevel("bloodHourglass");
  if (level <= 0 || Math.random() > 0.28 + level * 0.08) return;
  addWeaponZone({
    kind: "bloodBloom",
    weaponId: "bloodHourglass",
    x: enemy.x,
    z: enemy.z,
    radius: 2.7 + level * 0.26,
    ttl: 2.1 + level * 0.2,
    tickEvery: 0.42,
    damage: 2.2 + level * 1.3,
    slowSeconds: 0.24,
    color: "#9f2635"
  });
}

export function unlockedWeaponPool(): string[] {
  const ids = new Set(classUnlockedWeaponIds());
  for (const id of state.weaponSlots) ids.add(id);
  return [...ids].filter((id) => weaponsById.has(id));
}

export function unlockedPassivePool(): string[] {
  const ids = new Set(classUnlockedPassiveIds());
  for (const id of state.passiveSlots) ids.add(id);
  return [...ids].filter((id) => passiveItemsById.has(id));
}

export function getWeaponRuntime(idOrWeapon: string | WeaponDefinition): WeaponRuntime | null {
  const base = typeof idOrWeapon === "string" ? weaponsById.get(idOrWeapon) : idOrWeapon;
  if (!base) return null;
  const level = Math.max(1, getWeaponLevel(base.id));
  const stats = state.progressionStats ?? resolveProgressionStats();
  const runtime: WeaponRuntime = {
    ...base,
    name: base.name,
    cooldown: base.cooldown,
    damage: base.damage,
    speed: base.speed,
    range: base.range,
    pellets: base.pellets,
    spread: base.spread,
    pierce: base.pierce,
    knockback: base.knockback,
    level,
    evolved: state.evolvedWeapons.has(base.id),
    eliteDamageMultiplier: 1,
    critChance: stats.critChanceFlat,
    critMultiplier: stats.critMultiplier,
    projectileSizeMultiplier: stats.projectileSizeMultiplier,
    splashDamageMultiplier: stats.splashDamageFlat,
    splashRadius: stats.splashDamageFlat > 0 ? 2.4 + (stats.projectileSizeMultiplier - 1) * 1.6 : 0
  };
  applySpecialWeaponRuntimeDefaults(runtime);
  for (const bonus of base.levels ?? []) {
    if ((bonus.level ?? 0) <= level) applyWeaponLevelBonus(runtime, bonus);
  }
  runtime.cooldown *= stats.cooldownMultiplier;
  runtime.damage *= stats.damageMultiplier * damageTypeMultiplier(runtime.damageType, stats);
  runtime.speed *= stats.projectileSpeedMultiplier;
  if (runtime.returnSpeed) runtime.returnSpeed *= stats.projectileSpeedMultiplier;
  if (runtime.summonSpeed) runtime.summonSpeed *= stats.projectileSpeedMultiplier;
  if (runtime.waveSpeed) runtime.waveSpeed *= stats.projectileSpeedMultiplier;
  runtime.pellets += stats.projectileCountFlat;
  runtime.projectileSizeMultiplier = Math.max(0.45, runtime.projectileSizeMultiplier ?? 1);
  runtime.splashDamageMultiplier = Math.max(0, runtime.splashDamageMultiplier ?? 0);
  runtime.knockback *= stats.knockbackForceMultiplier;
  if (runtime.tags?.some((tag) => ["aura", "orbit", "area"].includes(tag))) {
    runtime.range *= stats.auraRadiusMultiplier;
    if (runtime.specialRadius) runtime.specialRadius *= stats.auraRadiusMultiplier;
    if (runtime.poolRadius) runtime.poolRadius *= stats.auraRadiusMultiplier;
    if (runtime.pulseRadius) runtime.pulseRadius *= stats.auraRadiusMultiplier;
    if (runtime.sweepRadius) runtime.sweepRadius *= stats.auraRadiusMultiplier;
  }
  if (runtime.specialRadius) runtime.specialRadius *= runtime.projectileSizeMultiplier;
  if (runtime.poolRadius) runtime.poolRadius *= runtime.projectileSizeMultiplier;
  if (runtime.pulseRadius) runtime.pulseRadius *= runtime.projectileSizeMultiplier;
  if (runtime.sweepRadius) runtime.sweepRadius *= runtime.projectileSizeMultiplier;
  if (runtime.width) runtime.width *= runtime.projectileSizeMultiplier;
  if (runtime.orbitalSize) runtime.orbitalSize *= runtime.projectileSizeMultiplier;
  runtime.range = Math.max(runtime.range, runtime.speed * 0.45);
  runtime.eliteDamageMultiplier *= stats.eliteDamageMultiplier;
  if (runtime.evolved) applyEvolutionRuntime(runtime);
  runtime.cooldown = Math.max(data.balance?.combat?.globalCooldownFloor ?? 0.12, runtime.cooldown);
  runtime.damage = Math.max(1, runtime.damage);
  runtime.speed = Math.max(1, runtime.speed);
  runtime.pellets = Math.max(1, Math.round(runtime.pellets));
  runtime.pierce = Math.max(1, Math.round(runtime.pierce));
  runtime.spread = Math.max(0, runtime.spread);
  runtime.knockback = Math.max(0, runtime.knockback);
  return runtime;
}

export function applySpecialWeaponRuntimeDefaults(weapon: WeaponRuntime): void {
  if (weapon.id === "graveLantern") {
    weapon.specialRadius = 4.8;
    weapon.orbitSpeed = 1.65;
    weapon.orbitalSize = 1.1;
  } else if (weapon.id === "plagueVial") {
    weapon.poolRadius = 2.8;
    weapon.poolSeconds = 4.2;
    weapon.tickInterval = 0.35;
    weapon.arcHeight = 4;
  } else if (weapon.id === "coffinLid") {
    weapon.returnSpeed = 18;
    weapon.width = 1.8;
  } else if (weapon.id === "batSwarm") {
    weapon.summonSpeed = 15;
    weapon.summonSeconds = 4.5;
    weapon.biteCooldown = 0.55;
  } else if (weapon.id === "funeralBell") {
    weapon.pulseRadius = 8;
    weapon.waveSpeed = 18;
    weapon.staggerSeconds = 0.45;
    weapon.pulseDelaySeconds = 0.28;
  } else if (weapon.id === "reaperScythe") {
    weapon.sweepRadius = 5.8;
    weapon.sweepArc = (105 * Math.PI) / 180;
    weapon.executeRatio = 0.08;
  }
}

export function applyWeaponLevelBonus(weapon: WeaponRuntime, bonus: ProgressionBonus): void {
  if (bonus.damage) weapon.damage += bonus.damage;
  if (bonus.pierce) weapon.pierce += bonus.pierce;
  if (bonus.projectiles) weapon.pellets += bonus.projectiles;
  if (bonus.orbitals) weapon.pellets += bonus.orbitals;
  if (bonus.summons) weapon.pellets += bonus.summons;
  if (bonus.pulseCount) weapon.pellets += bonus.pulseCount;
  if (bonus.cooldownMultiplier) weapon.cooldown *= bonus.cooldownMultiplier;
  if (bonus.projectileSpeedMultiplier) {
    weapon.speed *= bonus.projectileSpeedMultiplier;
    weapon.range *= bonus.projectileSpeedMultiplier;
  }
  if (bonus.spreadDegrees) weapon.spread += (bonus.spreadDegrees * Math.PI) / 180;
  if (bonus.knockback) weapon.knockback += bonus.knockback;
  if (bonus.eliteDamageMultiplier) weapon.eliteDamageMultiplier *= bonus.eliteDamageMultiplier;
  if (bonus.radius) {
    weapon.range += bonus.radius * 1.8;
    if (weapon.specialRadius) weapon.specialRadius += bonus.radius;
    if (weapon.pulseRadius) weapon.pulseRadius += bonus.radius;
    if (weapon.sweepRadius) weapon.sweepRadius += bonus.radius;
  }
  if (bonus.poolRadius) {
    weapon.range += bonus.poolRadius * 1.4;
    if (weapon.poolRadius) weapon.poolRadius += bonus.poolRadius;
  }
  const damageOverTime = bonus.bleedDamagePerSecond ?? bonus.burnDamagePerSecond;
  if (damageOverTime) weapon.damage += damageOverTime * 0.35;
  if (bonus.rotationSpeedMultiplier && weapon.orbitSpeed) weapon.orbitSpeed *= bonus.rotationSpeedMultiplier;
  if (bonus.orbitalSize && weapon.orbitalSize) weapon.orbitalSize += bonus.orbitalSize;
  if (bonus.poolSeconds && weapon.poolSeconds) weapon.poolSeconds += bonus.poolSeconds;
  if (bonus.tickRateMultiplier && weapon.tickInterval) weapon.tickInterval *= bonus.tickRateMultiplier;
  if (bonus.returnSpeedMultiplier && weapon.returnSpeed) weapon.returnSpeed *= bonus.returnSpeedMultiplier;
  if (bonus.width && weapon.width) weapon.width += bonus.width;
  if (bonus.summonSeconds && weapon.summonSeconds) weapon.summonSeconds += bonus.summonSeconds;
  if (bonus.biteCooldownMultiplier && weapon.biteCooldown) weapon.biteCooldown *= bonus.biteCooldownMultiplier;
  if (bonus.staggerSeconds && weapon.staggerSeconds) weapon.staggerSeconds += bonus.staggerSeconds;
  if (bonus.pulseDelaySeconds && weapon.pulseDelaySeconds) weapon.pulseDelaySeconds = bonus.pulseDelaySeconds;
  if (bonus.arcDegrees && weapon.sweepArc) weapon.sweepArc += (bonus.arcDegrees * Math.PI) / 180;
  if (bonus.executeHealthRatio && weapon.executeRatio) weapon.executeRatio += bonus.executeHealthRatio;
}

export function damageTypeMultiplier(type: string, stats: ProgressionStats): number {
  if (type === "silver" || type === "holy") return stats.silverDamageMultiplier;
  if (type === "fire") return stats.fireDamageMultiplier * stats.auraDamageMultiplier;
  if (type === "plague") return stats.plagueDamageMultiplier;
  if (type === "bleed") return stats.bleedDamageMultiplier;
  return 1;
}

export function applyEvolutionRuntime(weapon: WeaponRuntime): void {
  const evolution = weaponsById.get(weapon.id)?.evolution;
  weapon.name = evolution?.name ?? `${weapon.name}+`;
  weapon.color = evolution?.color ?? weapon.color;
  weapon.damage *= 1.28;
  weapon.cooldown *= 0.88;
  weapon.pellets += 1;
  weapon.pierce += 1;
  weapon.range *= 1.12;
  weapon.knockback *= 1.12;
  if (weapon.specialRadius) weapon.specialRadius *= 1.12;
  if (weapon.poolRadius) weapon.poolRadius *= 1.12;
  if (weapon.poolSeconds) weapon.poolSeconds *= 1.12;
  if (weapon.pulseRadius) weapon.pulseRadius *= 1.12;
  if (weapon.sweepRadius) weapon.sweepRadius *= 1.12;
  if (weapon.summonSeconds) weapon.summonSeconds *= 1.12;
  if (weapon.executeRatio) weapon.executeRatio += 0.03;
}

export function getPickupCollectRadius(): number {
  const stats = state.progressionStats ?? resolveProgressionStats();
  return PICKUP_COLLECT_RADIUS + Math.max(0, stats.pickupRadiusFlat) * PICKUP_COLLECT_RADIUS_MULTIPLIER;
}
