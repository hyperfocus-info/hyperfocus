import { runtimeCallback } from "./runtime-ports.ts";
const activatePickupMagnet = runtimeCallback("combatEntities", "activatePickupMagnet");
const addCombatBullet = runtimeCallback("combatWeapons", "addCombatBullet");
const fireSpecialWeapon = runtimeCallback("combatWeapons", "fireSpecialWeapon");
const grantXp = runtimeCallback("progressionChoices", "grantXp");
const rollChestStatReward = runtimeCallback("progressionChoices", "rollChestStatReward");
const applyProgressionStats = runtimeCallback("progressionData", "applyProgressionStats");
const resolveProgressionStats = runtimeCallback("progressionData", "resolveProgressionStats");
const triggerBloodHourglassDeathBloom = runtimeCallback("progressionRuntime", "triggerBloodHourglassDeathBloom");
const actorGroundHeight = runtimeCallback("terrain", "actorGroundHeight");
const terrainHeightAt = runtimeCallback("terrain", "terrainHeightAt");
const createActorVisual = runtimeCallback("actorAnimation", "createActorVisual");
const playActorAnimation = runtimeCallback("actorAnimation", "playActorAnimation");
const setActorPosition = runtimeCallback("actorAnimation", "setActorPosition");
const playSynthCue = runtimeCallback("audio", "playSynthCue");
const cachedMeshStandardMaterial = runtimeCallback("contentUi", "cachedMeshStandardMaterial");
const clamp = runtimeCallback("hud", "clamp");
const clamp01 = runtimeCallback("hud", "clamp01");
const pulseShake = runtimeCallback("hud", "pulseShake");
const round = runtimeCallback("hud", "round");
const toast = runtimeCallback("hud", "toast");
const clearControllerFocus = runtimeCallback("inputAndMenu", "clearControllerFocus");
const menuTargets = runtimeCallback("inputAndMenu", "menuTargets");
const renderPauseUi = runtimeCallback("lobbyAndSettings", "renderPauseUi");
const createPickupVisual = runtimeCallback("modelAssets", "createPickupVisual");
const updatePlayerWeaponVisual = runtimeCallback("modelAssets", "updatePlayerWeaponVisual");
const spawnBeamPreview = runtimeCallback("particles", "spawnBeamPreview");
const spawnDamageDirectionWedge = runtimeCallback("particles", "spawnDamageDirectionWedge");
const spawnEffect = runtimeCallback("particles", "spawnEffect");
const spawnPulseRing = runtimeCallback("particles", "spawnPulseRing");
const removeFromList = runtimeCallback("pointerAndTextures", "removeFromList");
const actorFloatingTextHeight = runtimeCallback("rewardFeedback", "actorFloatingTextHeight");
const pickupFloatingTextHeight = runtimeCallback("rewardFeedback", "pickupFloatingTextHeight");
const pulseOverlay = runtimeCallback("rewardFeedback", "pulseOverlay");
const registerComboKill = runtimeCallback("rewardFeedback", "registerComboKill");
const showCenterBanner = runtimeCallback("rewardFeedback", "showCenterBanner");
const spawnFloatingText = runtimeCallback("rewardFeedback", "spawnFloatingText");
const runRandom = runtimeCallback("runLifecycle", "runRandom");
const createProjectileVisual = runtimeCallback("weaponVisuals", "createProjectileVisual");
const getPlayerWeaponMuzzlePosition = runtimeCallback("weaponVisuals", "getPlayerWeaponMuzzlePosition");
const markEnemySpatialDirty = runtimeCallback("worldMath", "markEnemySpatialDirty");
const renderPosition = runtimeCallback("worldMath", "renderPosition");
const renderPositionInto = runtimeCallback("worldMath", "renderPositionInto");
const worldDeltaInto = runtimeCallback("worldMath", "worldDeltaInto");
const worldDistanceSquared = runtimeCallback("worldMath", "worldDistanceSquared");
const wrapWorld = runtimeCallback("worldMath", "wrapWorld");
import { BOSS_ANIMATION_STEP_SECONDS, BOSS_ATTACKS, BOSS_PACING, ENEMY_ANIMATION_STEP_SECONDS, ENEMY_CONTACT_DAMAGE_MAX, ENEMY_CONTACT_DAMAGE_MIN, HEALTH_BAR_VISIBLE_SECONDS, MAGNET_DROP_CHANCE, MAX_ANIMATED_ENEMIES, PICKUP_VISUAL_SCALE_MULTIPLIER, PLAYER_CONTACT_KNOCKBACK_BASE, PLAYER_DAMAGE_IMMUNE_SECONDS, PLAYER_HEIGHT_WORLD, PLAYER_MODEL_SCALE, PROJECTILE_HEIGHT_OFFSET } from "./constants.ts";
import { PERF_FLAGS } from "./environment.ts";
import type * as Three from "three";
import { state } from "./arena-state.ts";
import { THREE, requireRuntimeInstance } from "./boot-and-dom.ts";
import { threeView } from "./boot-context.ts";
import { POWERUP_DROP_MULTIPLIER, XP_DROP_CHANCE, data } from "./content-runtime.ts";
import { gamepadState } from "./input-context.ts";
import { scene, setLastWeaponHudKey, tempRenderPosition, tempWorldDelta } from "./runtime-context.ts";
import { telemetry } from "./telemetry-core.ts";
import { ui } from "./user-interface.ts";
import type { EnemyDefinition, StatLevelChoice, WeaponRuntime } from "./content-types.ts";
import type { ActorAnimationState, ArenaRagdoll, Enemy, Pickup, PlayerDamageOptions } from "./runtime-types.ts";

export function fireWeapon(weapon: WeaponRuntime, aimAngle: number): void {
  const player = state.player;
  if (!player || fireSpecialWeapon(weapon, aimAngle)) return;
  state.activeWeaponId = weapon.id;
  updatePlayerWeaponVisual(aimAngle);
  const projectileSize = Math.max(0.45, weapon.projectileSizeMultiplier ?? 1);
  const muzzle = getPlayerWeaponMuzzlePosition(aimAngle);
  const flashX = muzzle.x;
  const flashZ = muzzle.z;
  if (state.lights.muzzle) {
    const flashPosition = renderPosition(flashX, flashZ);
    state.lights.muzzle.position.set(flashPosition.x, muzzle.y, flashPosition.z);
  }
  state.muzzleFlash = Math.max(state.muzzleFlash, weapon.id === "shotgun" ? 1.4 : 0.85);
  player.animLock = Math.max(player.animLock ?? 0, Math.min(0.22, weapon.cooldown * 0.55));
  playActorAnimation(player, weapon.id === "flame" ? "cast" : "shoot", 0.025);
  for (let i = 0; i < weapon.pellets; i += 1) {
    const spread = (i - (weapon.pellets - 1) / 2) * (weapon.spread / Math.max(1, weapon.pellets - 1 || 1));
    const angle = aimAngle + spread + (Math.random() - 0.5) * weapon.spread * 0.22;
    const vx = Math.cos(angle) * weapon.speed;
    const vz = Math.sin(angle) * weapon.speed;
    const mesh = createProjectileVisual(weapon, angle);
    const x = wrapWorld(muzzle.x + Math.cos(angle) * 0.12);
    const z = wrapWorld(muzzle.z + Math.sin(angle) * 0.12);
    const bulletPosition = renderPositionInto(tempRenderPosition, x, z);
    mesh.position.set(bulletPosition.x, muzzle.y, bulletPosition.z);
    scene.add(mesh);
    addCombatBullet({
      x,
      z,
      y: muzzle.y,
      heightOffset: PROJECTILE_HEIGHT_OFFSET,
      vx,
      vz,
      mesh,
      color: weapon.color,
      damage: weapon.damage,
      damageType: weapon.damageType,
      eliteDamageMultiplier: weapon.eliteDamageMultiplier,
      critChance: weapon.critChance,
      critMultiplier: weapon.critMultiplier,
      radius: (weapon.evolved ? 0.44 : 0.35) * projectileSize,
      pierce: weapon.pierce,
      ttl: weapon.range / weapon.speed,
      speed: weapon.speed,
      knockback: weapon.knockback,
      splashDamageMultiplier: weapon.splashDamageMultiplier,
      splashRadius: weapon.splashRadius
    });
  }
  spawnEffect("muzzle", flashX, flashZ, 0.22, { angle: aimAngle, color: weapon.color, worldY: muzzle.y });
  spawnBeamPreview(muzzle, aimAngle, Math.min(weapon.range, weapon.id === "shotgun" ? 10 : 18), weapon.color);
  playSynthCue("shot", 1, { weaponId: weapon.id, color: weapon.color });
}

export function spawnEnemy(typeId: string, options: { boss?: boolean } = {}): Enemy {
  const spec = data.enemies[typeId] ?? Object.values(data.enemies)[0];
  if (!spec) throw new Error(`Cannot spawn enemy ${typeId}: no enemy definitions are loaded.`);
  const angle = runRandom() * Math.PI * 2;
  const radius = data.arena.spawnRadius + runRandom() * 10;
  const origin = state.player ?? { x: 0, z: 0 };
  const x = wrapWorld(origin.x + Math.cos(angle) * radius);
  const z = wrapWorld(origin.z + Math.sin(angle) * radius);
  const textureKey = pickEnemySkin(spec.texture ?? "zombieA");
  const baseScale = Math.max(1.05, spec.radius);
  const displayScale = baseScale * (options.boss ? BOSS_PACING.sizeMultiplier : 1);
  const actorScale = PLAYER_MODEL_SCALE * displayScale;
  const animatedEnemyCount = state.enemies.reduce((count, enemy) => count + (enemy.animated && !enemy.boss ? 1 : 0), 0);
  const useAnimatedActor = options.boss || animatedEnemyCount < MAX_ANIMATED_ENEMIES;
  const curseMultiplier = Math.max(0.25, (state.progressionStats ?? resolveProgressionStats()).curseMultiplier ?? 1);
  const maxHp = spec.hp * (1 + state.time / 340) * (options.boss ? BOSS_PACING.healthMultiplier : 1) * curseMultiplier;
  const actor: ActorAnimationState = useAnimatedActor
    ? createActorVisual(textureKey, state.textures[textureKey] ?? state.textures.zombieA, 2.7 * displayScale, PLAYER_HEIGHT_WORLD * displayScale, actorScale, {
      allowAnimated: true,
      castShadow: options.boss,
      receiveShadow: false
    })
    : {
      mesh: null,
      animator: null,
      animatorRoot: null,
      animated: false,
      proceduralPose: null,
      proceduralMode: "none",
      activeAnimation: "idle",
      activeAnimationSource: null,
      overlayAnimation: null,
      animationClock: 0
    };
  const enemy: Enemy = {
    typeId,
    boss: Boolean(options.boss),
    x,
    y: z,
    z,
    mesh: actor.mesh,
    batchKey: actor.mesh ? null : textureKey,
    animator: actor.animator,
    animatorRoot: actor.animatorRoot,
    animated: actor.animated,
    proceduralPose: actor.proceduralPose,
    proceduralMode: actor.proceduralMode,
    activeAnimation: actor.activeAnimation,
    activeAnimationSource: actor.activeAnimationSource,
    overlayAnimation: actor.overlayAnimation ?? null,
    animationClock: actor.animationClock,
    hp: maxHp,
    maxHp,
    speed: spec.speed * (1 + state.time / 520) * (options.boss ? BOSS_PACING.speedMultiplier : 1),
    touch: resolveEnemyTouchDamage(typeId, Boolean(options.boss)),
    radius: displayScale,
    score: spec.score * (options.boss ? 12 : 1),
    scale: displayScale,
    slow: 0,
    knockX: 0,
    knockZ: 0,
    textureKey,
    animClock: runRandom() * ENEMY_ANIMATION_STEP_SECONDS,
    animStep: options.boss ? BOSS_ANIMATION_STEP_SECONDS : ENEMY_ANIMATION_STEP_SECONDS,
    nextAttack: options.boss ? state.time + BOSS_ATTACKS.firstAttackDelaySeconds : Number.POSITIVE_INFINITY,
    seed: runRandom() * 99,
    lastHit: { x: -Math.cos(angle), z: -Math.sin(angle), force: 1 }
  };
  setActorPosition(enemy, x, z);
  playActorAnimation(enemy, "run", 0.02);
  if (enemy.mesh) scene.add(enemy.mesh);
  state.enemies.push(enemy);
  markEnemySpatialDirty();
  return enemy;
}

export function pickEnemySkin(textureKey: string): string {
  if (textureKey === "zombieA") return runRandom() < 0.48 ? "zombieA" : "zombieB";
  return textureKey;
}

export function resolveEnemyTouchDamage(typeId: string, boss = false): number {
  const rank = clamp01(resolveEnemySpawnRank(typeId) + (boss ? 0.12 : 0));
  return Math.round(ENEMY_CONTACT_DAMAGE_MIN + (ENEMY_CONTACT_DAMAGE_MAX - ENEMY_CONTACT_DAMAGE_MIN) * rank);
}

export function resolveEnemySpawnRank(typeId: string): number {
  const waves = data.waves ?? [];
  const waveCount = Math.max(1, waves.length - 1);
  const firstWave = waves.findIndex((wave) => {
    if (wave.eliteId === typeId) return true;
    return (wave.mix ?? []).some(([id]) => id === typeId);
  });
  if (firstWave >= 0) return waveCount <= 0 ? 0 : firstWave / waveCount;
  const sorted = Object.entries(data.enemies ?? {}).sort((a, b) => enemyRankWeight(a[1]) - enemyRankWeight(b[1]));
  const index = sorted.findIndex(([id]) => id === typeId);
  if (index < 0 || sorted.length <= 1) return 0;
  return index / (sorted.length - 1);
}

export function enemyRankWeight(enemy: EnemyDefinition): number {
  return (enemy.score ?? 1) * 7 + (enemy.hp ?? 1) * 0.08 + (enemy.speed ?? 1) * 1.6 + (enemy.radius ?? 1) * 2;
}

export function getEnemyDamageTable(): Record<string, { rank: number; touch: number; bossTouch: number }> {
  return Object.fromEntries(Object.keys(data.enemies ?? {}).map((id) => [
    id,
    {
      rank: round(resolveEnemySpawnRank(id)),
      touch: resolveEnemyTouchDamage(id, false),
      bossTouch: resolveEnemyTouchDamage(id, true)
    }
  ]));
}

export function powerupDropChance(baseChance: number, enemy: Enemy | null = null): number {
  const luck = Math.max(0, (state.progressionStats ?? resolveProgressionStats()).luckMultiplier ?? 1);
  const bossMultiplier = enemy?.boss ? 4 : 1;
  return clamp01((baseChance ?? 0) * POWERUP_DROP_MULTIPLIER * luck * bossMultiplier);
}

export function xpDropChance(): number {
  const luck = Math.max(0, (state.progressionStats ?? resolveProgressionStats()).luckMultiplier ?? 1);
  return clamp01(XP_DROP_CHANCE * luck);
}

export function killEnemy(index: number): void {
  const enemy = state.enemies[index];
  if (!enemy) return;
  const eliteDeath = enemy.boss || resolveEnemySpawnRank(enemy.typeId) >= 0.66;
  state.kills += 1;
  registerComboKill(enemy);
  triggerBloodHourglassDeathBloom(enemy);
  if (runRandom() < xpDropChance()) spawnPickup("xp", enemy.x, enemy.z);
  if (runRandom() < powerupDropChance(0.07, enemy)) spawnPickup("weapon", enemy.x, enemy.z);
  if (runRandom() < powerupDropChance(data.pickupChances.magnet ?? MAGNET_DROP_CHANCE, enemy)) spawnPickup("magnet", enemy.x, enemy.z);
  if (runRandom() < powerupDropChance(data.pickupChances.heal ?? 0, enemy)) spawnPickup("heal", enemy.x, enemy.z);
  spawnEnemyRagdoll(enemy);
  spawnEffect("blast", enemy.x, enemy.z, eliteDeath ? 0.56 : 0.42, { color: eliteDeath ? "#ffd27d" : "#bfff88", particles: eliteDeath ? 26 : 17, speed: eliteDeath ? 8.6 : 6.2, size: eliteDeath ? 0.58 : 0.42 });
  spawnPulseRing(enemy.x, enemy.z, enemy.boss ? "#ff5dff" : eliteDeath ? "#ffd27d" : "#caff78", enemy.boss ? 0.62 : eliteDeath ? 0.46 : 0.34, enemy.boss ? 2.7 : eliteDeath ? 1.75 : 1.1, enemy.boss ? 6.4 : eliteDeath ? 4.4 : 3.2);
  spawnFloatingText(enemy.boss ? "BOSS DOWN" : eliteDeath ? "ELITE DOWN" : "+1", enemy.x, enemy.z, enemy.boss ? "#ffd0ff" : eliteDeath ? "#ffd27d" : "#d7ff8d", enemy.boss ? 1.28 : eliteDeath ? 1.14 : 0.94, { targetHeight: actorFloatingTextHeight(enemy, 0.55) });
  playSynthCue(enemy.boss ? "bossKill" : "kill", enemy.boss ? 1.5 : 1);
  removeFromList(state.enemies, index);
  markEnemySpatialDirty();
  pulseShake(eliteDeath ? 0.26 : 0.16, eliteDeath ? 0.38 : 0.22);
}

export function spawnEnemyRagdoll(enemy: Enemy): void {
  try {
    const force = enemy.lastHit ?? { x: 0, z: 0, force: 1 };
    const position = renderPosition(enemy.x, enemy.z);
    const rawRagdoll = threeView.createRagdoll({
      position: [position.x, actorGroundHeight(enemy) + 0.05, position.z],
      incomingForce: [force.x * force.force, 1.6, force.z * force.force],
      color: enemy.typeId?.includes("brute") ? "#8d6f42" : "#6f9c61",
      material: getRagdollMaterial(enemy.textureKey ?? pickEnemySkin("zombieA")),
      scale: enemy.scale * 1.05,
      ttl: 3.2,
      spread: 4.2,
      bounce: 0.24
    });
    const root = requireRuntimeInstance(rawRagdoll.root, THREE.Object3D, "Arena ragdoll root");
    const ragdoll: ArenaRagdoll = { ...rawRagdoll, root };
    scene.add(root);
    state.ragdolls.push(ragdoll);
  } catch {
    // Ragdoll support is optional if the host swaps in a minimal Three build.
  }
}

export function getRagdollMaterial(textureKey: string): Three.MeshStandardMaterial {
  return cachedMeshStandardMaterial(`material:ragdoll:${textureKey}`, () => {
    telemetry.materialCreates += 1;
    return new THREE.MeshStandardMaterial({
      map: state.textures[textureKey] ?? state.textures.zombieA,
      color: 0xffffff,
      roughness: 0.82,
      metalness: 0.02
    });
  });
}

export function resolveWeaponDropPayload(): StatLevelChoice {
  return rollChestStatReward();
}

export function maxDropsOnGround(): number {
  return Math.max(1, Math.floor(Number(data.balance?.run?.maxDropsOnGround ?? 90) || 90));
}

export function pickupTtlSeconds(kind: Pickup["kind"]): number {
  const definitions = Object.values(data.pickups ?? {});
  const match = definitions.find((pickup) => {
    if (!pickup || typeof pickup !== "object") return false;
    if (kind === "xp") return pickup.tags?.includes?.("xp");
    if (kind === "heal") return pickup.tags?.includes?.("heal");
    if (kind === "magnet") return pickup.tags?.includes?.("magnet");
    if (kind === "weapon") return pickup.tags?.includes?.("upgrade") || pickup.tags?.includes?.("temporary-weapon");
    return pickup.id === kind;
  });
  const fallback = kind === "weapon" ? 120 : kind === "magnet" ? 24 : kind === "heal" ? 30 : 68;
  return Math.max(4, Number(match?.lifetimeSeconds ?? fallback) || fallback);
}

export function trimPickupOverflowForSpawn(): void {
  if (state.benchStress) return;
  const cap = maxDropsOnGround();
  while (state.pickups.length >= cap) {
    let removeIndex = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < state.pickups.length; i += 1) {
      const pickup = state.pickups[i];
      const age = state.time - (pickup.spawnedAt ?? state.time);
      const distanceScore = state.player ? worldDistanceSquared(state.player.x, state.player.z, pickup.x, pickup.z) / 10000 : 0;
      const score = age + distanceScore;
      if (score > bestScore) {
        bestScore = score;
        removeIndex = i;
      }
    }
    removeFromList(state.pickups, removeIndex);
  }
}

export function spawnPickup(kind: Pickup["kind"], x: number, z: number): void {
  trimPickupOverflowForSpawn();
  let texture = state.textures.shard;
  let scale = 1.4;
  let payload: StatLevelChoice | null = null;
  if (kind === "heal") {
    texture = state.textures.heal;
    scale = 1.55;
  } else if (kind === "magnet") {
    texture = state.textures.magnet;
    scale = 2.15;
  } else if (kind === "weapon") {
    texture = state.textures.crate;
    scale = 1.75;
    payload = resolveWeaponDropPayload();
  }
  scale *= PICKUP_VISUAL_SCALE_MULTIPLIER;
  x = wrapWorld(x);
  z = wrapWorld(z);
  const groundY = terrainHeightAt(x, z);
  let mesh = null;
  if (!PERF_FLAGS.batchPickups) {
    mesh = createPickupVisual(kind, texture, scale, payload);
    const pickupPosition = renderPosition(x, z);
    mesh.position.set(pickupPosition.x, groundY + 1.15, pickupPosition.z);
    scene.add(mesh);
  }
  state.pickups.push({
    kind,
    payload,
    x,
    z,
    mesh,
    light: null,
    groundY,
    texture,
    scale,
    t: Math.random() * 4,
    spawnedAt: state.time,
    ttl: state.benchStress ? Number.POSITIVE_INFINITY : pickupTtlSeconds(kind),
    magnetTrailClock: 0
  });
}

export function collectPickup(pickup: Pickup): void {
  const player = state.player;
  if (!player) return;
  if (pickup.kind === "xp") {
    grantXp(1);
    playSynthCue("pickup", 0.65, { kind: "xp" });
  } else if (pickup.kind === "heal") {
    const heal = Math.round(28 * ((state.progressionStats ?? resolveProgressionStats()).healMultiplier ?? 1));
    player.hp = Math.min(player.maxHp, player.hp + heal);
    toast("Field vial sealed the cut.");
    pulseOverlay("gold");
    spawnFloatingText("+HP", pickup.x, pickup.z, "#9dff8d", 1.1, { targetHeight: pickupFloatingTextHeight(pickup) });
    playSynthCue("pickup", 1.1, { kind: "heal" });
  } else if (pickup.kind === "magnet") {
    activatePickupMagnet();
    toast("Magnet bone called loose shards.");
    pulseOverlay("gold");
    spawnFloatingText("MAGNET", pickup.x, pickup.z, "#9fe8ff", 1.15, { targetHeight: pickupFloatingTextHeight(pickup) });
    spawnPulseRing(player.x, player.z, "#9fe8ff", 0.5, 1.1, 6.4);
    playSynthCue("pickup", 1.2, { kind: "magnet" });
  } else if (pickup.kind === "weapon") {
    const reward = pickup.payload ?? rollChestStatReward();
    state.statBonuses.push(reward.bonus);
    applyProgressionStats();
    player.animLock = 0.45;
    playActorAnimation(player, "interact", 0.04);
    toast(`${reward.title}: ${reward.description}`);
    showCenterBanner("Cursed Cache", `${reward.title}: ${reward.description}`);
    pulseOverlay("gold");
    spawnPulseRing(player.x, player.z, reward.color ?? "#ffd27a", 0.56, 1.2, 5.2);
    spawnFloatingText(reward.description, pickup.x, pickup.z, reward.color ?? "#ffd27a", 1.15, { targetHeight: pickupFloatingTextHeight(pickup) });
    playSynthCue("weapon");
    setLastWeaponHudKey("");
  }
}

export function damagePlayer(amount: number, options: PlayerDamageOptions = {}): void {
  const player = state.player;
  if (!player) return;
  if (amount <= 0) return;
  if (PERF_FLAGS.benchInvulnerable) return;
  if (player.invuln > 0 || player.hp <= 0) return;
  const stats = state.progressionStats ?? resolveProgressionStats();
  const reduction = Math.min(data.balance?.combat?.armorReductionCap ?? 0.55, player.armor * (data.balance?.combat?.armorDamageReductionPerPoint ?? 0.018));
  const effectiveAmount = Math.max(options.minDamage ?? 1, amount * (1 - reduction));
  player.hp -= effectiveAmount;
  player.invuln = options.invulnSeconds ?? PLAYER_DAMAGE_IMMUNE_SECONDS;
  applyPlayerDamageKnockback(options, effectiveAmount);
  if (options.source && stats.contactThornsDamage > 0) {
    options.source.hp -= stats.contactThornsDamage;
    options.source.healthBarTimer = HEALTH_BAR_VISIBLE_SECONDS;
    spawnFloatingText(`${Math.round(stats.contactThornsDamage)}`, options.source.x, options.source.z, "#d7ff8d", 0.94, { targetHeight: actorFloatingTextHeight(options.source) });
  }
  player.animLock = Math.max(player.animLock ?? 0, 0.28);
  playActorAnimation(player, "hit", 0.035);
  pulseOverlay("danger");
  playSynthCue("damage", Math.min(1.4, effectiveAmount / 16));
  spawnFloatingText(`-${Math.max(1, Math.round(effectiveAmount))}`, player.x, player.z, "#ff6b5e", 1.1, { targetHeight: actorFloatingTextHeight(player) });
  spawnDamageDirectionWedge(options);
  pulseShake(0.22, 0.34);
  if (player.hp <= 0) {
    player.hp = 0;
    player.animLock = 1.2;
    playActorAnimation(player, "death", 0.04);
    state.running = false;
    state.paused = false;
    state.pausePanel = "root";
    renderPauseUi();
    ui.menu.classList.remove("hidden");
    document.body.classList.add("menu-open");
    document.body.classList.remove("run-active", "pause-open");
    ui.soloButton.textContent = "Retry Solo";
    showCenterBanner("Overrun", `${state.kills} kills. The gate opens again.`);
    playSynthCue("death");
    focusRetryAction();
    toast("Overrun. Retry Solo is armed.");
  }
}

export function focusRetryAction(): void {
  clearControllerFocus();
  ui.soloButton?.classList.add("controller-focus");
  ui.soloButton?.focus?.({ preventScroll: true });
  const targets = menuTargets();
  const retryIndex = targets.indexOf(ui.soloButton);
  if (retryIndex >= 0) gamepadState.menuIndex = retryIndex;
}

export function applyPlayerDamageKnockback(options: PlayerDamageOptions, amount: number): void {
  if (options.knockback === false) return;
  const player = state.player;
  if (!player) return;
  const sourceX = options.sourceX ?? options.source?.x;
  const sourceZ = options.sourceZ ?? options.source?.z;
  if (typeof sourceX !== "number" || typeof sourceZ !== "number") return;
  const delta = worldDeltaInto(tempWorldDelta, sourceX, sourceZ, player.x, player.z);
  const dx = delta.dx;
  const dz = delta.dz;
  const distance = Math.hypot(dx, dz) || 1;
  const resist = clamp(player.knockbackResist ?? 0, 0, 0.8);
  const force = (options.knockbackForce ?? Math.min(36, PLAYER_CONTACT_KNOCKBACK_BASE + Math.max(0, amount) * 0.09)) * (1 - resist);
  player.knockX = (player.knockX ?? 0) + (dx / distance) * force;
  player.knockZ = (player.knockZ ?? 0) + (dz / distance) * force;
}
