import { type CollisionKernel } from "@hyperfocus/engine";
import { beginMmoAbility, clearMmoAbility, coneMmoTargetHits, firstMmoLineTargetHit, findNearestMmoEntity, hasMmoAbilityEvent, lineMmoTargetHits, markMmoAbilityEvent, markMmoAbilityEventMs, mmoAbilityEventMs, mmoTargetInCone, moveMmoCircle, radiusMmoTargetHits } from "@hyperfocus/engine/mmo";
import { spawnTransientEffect } from "@hyperfocus/engine/server";
import { awardGatheringXp, setGatheringLevelForDev } from "./server/gatheringEngine.ts";
import { HAZARD_SIZE } from "./data/entity-sizes.ts";
import {  ACTION_TO_SLOT, type AbilitySlot, MELEE_PREFIRE_DASHES, type MeleeDashAbilityId, PLAYER_ABILITY_DEFS, type PlayerDashSpec } from "./shared-ability-catalog.ts";
import { damageNpc } from "./shared-combat-resolution.ts";
import { aimPoint, berserkFactor, dashDistanceForPmsps, hasPlayerCombatFlag, hasTimedPlayerFlag, hostileNpcs, playerDamageBonus, playerFlagStacks, setPlayerFlagStacks, tickPlayerMsFlag, timedPlayerHasteFactor } from "./shared-combat-state.ts";
import { type HazardEntity, type MmoSkillDemoAction, type MmoSkillDemoState, type NpcEntity, type PlayerEntity, type RuntimeInput, type ZoneId } from "./shared-contracts.ts";
import { hasFactionReward } from "./shared-economy.ts";
import { entitiesOfType } from "./shared-entity-registry.ts";
import { addQuestBit, isAbilityId, isAbilitySlot, setItemQty, setSlotCooldown, syncLegacyCooldown, unlockAbility } from "./shared-loadout.ts";
import { clamp, cleanInputText, u16Ms } from "./shared-replication-projection.ts";
import { PLAYER_RADIUS, RUSH_BRAKE_MS } from "./shared-world-catalog.ts";
import { bodyRadius, canOccupy } from "./shared-world-physics.ts";
import { mmoSkillDemoMap } from "./shared-world-runtime.ts";

function applyDevCheat(player: PlayerEntity, input: RuntimeInput) {
  const numericFields = new Set([
    "hp",
    "maxHp",
    "mana",
    "maxMana",
    "combatXp",
    "combatLevel",
    "miningXp",
    "miningLevel",
    "woodcuttingXp",
    "woodcuttingLevel",
    "gold",
    "renown",
    "masteryRank",
    "contractKills",
    "contractStreak",
    "wolfKills",
    "batKills",
    "bazaarSurvivalMs",
    "dungeonBossKills"
  ]);
  const inventoryFields = new Set(["ash-logs", "iron-ore", "silk-thread", "glade-berries", "cinder-ale", "speed-potion"]);
  const bankFields = new Set(["bank:ash-logs", "bank:iron-ore"]);
  const textFields = new Set(["activeQuestId", "prestigeTitle", "contractId"]);
  if (numericFields.has(input.devField)) {
    const value = clamp(Math.floor(input.devValue), 0, input.devField.endsWith("Level") ? 99 : 999999);
    Reflect.set(player, input.devField, value);
    if (input.devField === "miningLevel") setGatheringLevelForDev(player, "mining", Math.max(1, value));
    if (input.devField === "woodcuttingLevel") setGatheringLevelForDev(player, "lumberjacking", Math.max(1, value));
    if (input.devField === "miningXp") awardGatheringXp(player, "mining", 0);
    if (input.devField === "woodcuttingXp") awardGatheringXp(player, "lumberjacking", 0);
    if (input.devField === "hp" || input.devField === "maxHp") player.hp = Math.min(player.hp, player.maxHp);
    if (input.devField === "mana" || input.devField === "maxMana") player.mana = Math.min(player.mana, player.maxMana);
  } else if (textFields.has(input.devField)) {
    Reflect.set(player, input.devField, cleanInputText(input.devText, input.devField === "activeQuestId" || input.devField === "prestigeTitle" ? 32 : 192));
  } else if (inventoryFields.has(input.devField)) {
    setItemQty(player, input.devField, input.devValue);
  } else if (bankFields.has(input.devField)) {
    const itemId = input.devField.slice("bank:".length);
    if (input.devValue <= 0) delete player.bank[itemId];
    else player.bank[itemId] = Math.floor(input.devValue);
  } else if (input.devField === "questFlag") {
    addQuestBit(player, cleanInputText(input.devText, 96));
  } else if (input.devField === "ability") {
    unlockAbility(player, cleanInputText(input.devText, 96));
  }
}

function devCheatsEnabled() {
  return process.env.MMO_SKILL_DEMO_DEV_CHEATS === "1";
}

function abilityCastMs(player: PlayerEntity, baseMs: number) {
  return Math.max(50, Math.floor(baseMs * animationDurationScale(player)));
}

function animationDurationScale(player: PlayerEntity) {
  const apotheosis = hasPlayerCombatFlag(player, "apotheosis") && player.damageAmpMs > 0 ? 0.33 : 0;
  const swift = hasTimedPlayerFlag(player, "swift") ? 0.23 : 0;
  const bloodlust = hasTimedPlayerFlag(player, "bloodlust") ? 0.29 : 0;
  const trance = hasTimedPlayerFlag(player, "trance") ? 0.2 : 0;
  return Math.max(0.35, 1 - 0.5 * berserkFactor(player) - apotheosis - swift - bloodlust - trance - timedPlayerHasteFactor(player));
}

function combatSlotForAction(action: MmoSkillDemoAction) {
  return ACTION_TO_SLOT[action];
}

function directionFromAim(player: PlayerEntity, input: RuntimeInput) {
  const aim = aimPoint(player, input);
  const dx = aim.x - player.x;
  const dy = aim.y - player.y;
  const aimLength = Math.hypot(dx, dy);
  if (aimLength < 1) {
    const fallbackLength = Math.hypot(player.abilityVectorX, player.abilityVectorY) || 1;
    return { x: (player.abilityVectorX || 1) / fallbackLength, y: (player.abilityVectorY || 0) / fallbackLength, aim };
  }
  const length = aimLength;
  return { x: dx / length, y: dy / length, aim };
}

function rotateVectorToward(x: number, y: number, targetX: number, targetY: number, maxRadians: number) {
  const fromAngle = Math.atan2(y, x);
  const toAngle = Math.atan2(targetY, targetX);
  let delta = ((toAngle - fromAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  delta = clamp(delta, -maxRadians, maxRadians);
  const angle = fromAngle + delta;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function rushProgress(activeMs: number, windupMs: number, durationMs: number) {
  return clamp((activeMs - windupMs) / Math.max(1, durationMs - windupMs), 0, 1);
}

function rushSpeedMultiplier(activeMs: number, windupMs: number, durationMs: number) {
  const progress = rushProgress(activeMs, windupMs, durationMs);
  const ramp = 1.2 + progress * 3.8;
  const remainingMs = Math.max(0, durationMs - activeMs);
  if (remainingMs >= RUSH_BRAKE_MS) return ramp;
  const brake = clamp(1 - remainingMs / RUSH_BRAKE_MS, 0, 1);
  return ramp + (1 - ramp) * brake;
}

function clearActiveAbility(player: PlayerEntity) {
  clearMmoAbility(player);
  player.rushDistance = 0;
  setPlayerFlagStacks(player, "flurry", 0);
  setPlayerFlagStacks(player, "chaos", 0);
  setPlayerFlagStacks(player, "blade", 0);
  setPlayerFlagStacks(player, "omni", 0);
}

function endRushAbility(player: PlayerEntity) {
  setSlotCooldown(player, "Space", PLAYER_ABILITY_DEFS["space-rush"].cooldownMs);
  clearActiveAbility(player);
}

function canInterruptActiveAbility(player: PlayerEntity, nextSlot: AbilitySlot) {
  if (!player.activeAbility || player.activeSlot === nextSlot) return false;
  if (!isAbilityId(player.activeAbility)) return false;
  const activeDef = PLAYER_ABILITY_DEFS[player.activeAbility];
  return player.castMs > 0 && player.activeMs < abilityCastMs(player, activeDef.castMs);
}

function interruptActiveAbility(player: PlayerEntity) {
  const slot = player.activeSlot;
  clearActiveAbility(player);
  if (isAbilitySlot(slot)) {
    player.cooldowns[slot] = 0;
    syncLegacyCooldown(player);
  }
}

function beginActiveAbility(player: PlayerEntity, slot: AbilitySlot, abilityId: string, input: RuntimeInput, durationMs: number) {
  const direction = directionFromAim(player, input);
  player.rushDistance = 0;
  beginMmoAbility(player, slot, abilityId, durationMs, direction);
}

function activeHas(player: PlayerEntity, value: string) {
  return hasMmoAbilityEvent(player, value);
}

function activeMark(player: PlayerEntity, value: string) {
  markMmoAbilityEvent(player, value);
}

function activeHitMs(player: PlayerEntity, prefix: string, id: string) {
  return mmoAbilityEventMs(player, prefix, id);
}

function activeMarkHitMs(player: PlayerEntity, prefix: string, id: string, ms: number) {
  markMmoAbilityEventMs(player, prefix, id, ms);
}

function targetInFrontCone(player: PlayerEntity, target: NpcEntity, range: number, halfAngleRad: number) {
  return mmoTargetInCone(
    { x: player.x, y: player.y },
    { x: player.abilityVectorX, y: player.abilityVectorY },
    { id: target.id, x: target.x, y: target.y, radius: bodyRadius(target) },
    { range, halfAngleRad, includeRadius: true }
  );
}

function spawnPlayerEffectHazard(state: MmoSkillDemoState, player: PlayerEntity, kind: HazardEntity["kind"], x: number, y: number, toX: number, toY: number, radius: number, effectKind: string, lifetimeMs = 620, pulse = 1) {
  const id = `${effectKind}-${state.tick}-${state.effects.length}`.slice(0, 32);
  spawnTransientEffect(
    state.effects,
    {
      id,
      kind,
      zoneId: player.zoneId,
      x,
      y,
      toX,
      toY,
      radius: u16Ms(radius),
      lifetimeMs: u16Ms(lifetimeMs),
      effectKind: effectKind.slice(0, 16),
      text: "",
      pulse: u16Ms(pulse),
      priority: effectKind === "cone" ? 36 : ["arrow", "root", "piercearrow"].includes(effectKind) ? 18 : 28
    },
    256
  );
}

function spawnCombatTextHazard(state: MmoSkillDemoState, target: NpcEntity, effectKind: "immune" | "dodge" | "damage", text?: string) {
  const id = `${effectKind}-${state.tick}-${state.effects.length}`.slice(0, 32);
  spawnTransientEffect(
    state.effects,
    {
      id,
      kind: "aoe",
      zoneId: target.zoneId,
      x: target.x,
      y: target.y - 22,
      toX: target.x,
      toY: target.y - 22,
      radius: target.role === "boss" ? HAZARD_SIZE.bossCombatTextRadius : HAZARD_SIZE.combatTextRadius,
      lifetimeMs: 720,
      effectKind,
      text: text ?? (effectKind === "immune" ? "Immune" : effectKind === "dodge" ? "Dodge" : "Hit"),
      pulse: 1,
      priority: effectKind === "damage" ? 72 : 80
    },
    256
  );
}

function spawnPummelShockwave(state: MmoSkillDemoState, player: PlayerEntity, range: number, halfAngle: number, lifetimeMs = 360, effectKind = "conewave") {
  spawnPlayerEffectHazard(
    state,
    player,
    "line",
    player.x,
    player.y,
    player.x + player.abilityVectorX * range,
    player.y + player.abilityVectorY * range,
    Math.floor(range),
    effectKind,
    lifetimeMs,
    Math.round((halfAngle * 180) / Math.PI)
  );
}

type LineHit = { target: NpcEntity; distance: number };

type NpcTargetable = { id: string; x: number; y: number; radius: number; target: NpcEntity };

function hostileTargetables(state: MmoSkillDemoState, player: PlayerEntity) {
  return hostileNpcs(state, player).map((target): NpcTargetable => ({ id: target.id, x: target.x, y: target.y, radius: bodyRadius(target), target }));
}

function bowMildDamage(player: PlayerEntity) {
  return Math.max(1, Math.floor(6 + player.combatLevel * 1.25 + playerDamageBonus(player)));
}

function bowDecentDamage(player: PlayerEntity) {
  return Math.max(1, Math.floor(14 + player.combatLevel * 1.8 + playerDamageBonus(player)));
}

function bowHighDamage(player: PlayerEntity) {
  return Math.max(1, Math.floor(24 + player.combatLevel * 3 + playerDamageBonus(player) * 2));
}

function spellDamage(player: PlayerEntity, base: number) {
  const chaosCatalyst = hasFactionReward(player, "obsidian-sanctum-chaos-catalyst") ? 2 : 0;
  return Math.max(1, Math.floor(base + Math.max(0, player.combatLevel - 1) * 0.65 + playerDamageBonus(player) + chaosCatalyst));
}

function martialDamage(player: PlayerEntity, base: number) {
  return Math.max(1, Math.floor(base + Math.max(0, player.combatLevel - 1) * 0.75 + playerDamageBonus(player)));
}

function healPlayer(player: PlayerEntity, amount: number) {
  player.hp = Math.min(player.maxHp, player.hp + Math.max(0, Math.floor(amount)));
}

function tickPlayerStatusEffects(player: PlayerEntity, ms: number) {
  tickPlayerMsFlag(player, "shout-haste", ms);
  tickPlayerMsFlag(player, "ironwill-haste", ms);

  if ((player.zoneId === "ashwood" || player.zoneId === "ashwood-wilderness") && hasFactionReward(player, "oakhaven-barkskin-infusion") && player.hp > 0 && player.hp < player.maxHp) {
    let nextBarkskinMs = playerFlagStacks(player, "barkskin-step") || 1000;
    nextBarkskinMs -= ms;
    while (nextBarkskinMs <= 0) {
      healPlayer(player, 2);
      nextBarkskinMs += 1000;
    }
    setPlayerFlagStacks(player, "barkskin-step", u16Ms(nextBarkskinMs));
  } else {
    setPlayerFlagStacks(player, "barkskin-step", 0);
  }

  let regenTicks = playerFlagStacks(player, "shout-regen");
  if (regenTicks <= 0) {
    setPlayerFlagStacks(player, "shout-regen-step", 0);
    return;
  }
  let nextTickMs = playerFlagStacks(player, "shout-regen-step") || 1000;
  nextTickMs -= ms;
  while (regenTicks > 0 && nextTickMs <= 0) {
    healPlayer(player, Math.max(1, Math.ceil(player.maxHp * 0.02)));
    regenTicks -= 1;
    nextTickMs += 1000;
  }
  setPlayerFlagStacks(player, "shout-regen", regenTicks);
  setPlayerFlagStacks(player, "shout-regen-step", regenTicks > 0 ? u16Ms(nextTickMs) : 0);
}

function healPlayersNear(state: MmoSkillDemoState, source: PlayerEntity, x: number, y: number, radius: number, amount: number) {
  let healed = 0;
  for (const target of entitiesOfType(state, "player")) {
    if (target.hp <= 0 || target.zoneId !== source.zoneId) continue;
    if (Math.hypot(target.x - x, target.y - y) > radius + PLAYER_RADIUS) continue;
    const before = target.hp;
    healPlayer(target, amount);
    if (target.hp > before) healed += 1;
  }
  return healed;
}

function damageNpcsInRadius(
  state: MmoSkillDemoState,
  kernel: CollisionKernel,
  player: PlayerEntity,
  x: number,
  y: number,
  radius: number,
  amount: number,
  options: { knockbackModifier?: number; isHeavyImpact?: boolean; energyGain?: number; ultimate?: boolean } = {}
) {
  let hits = 0;
  for (const hit of radiusMmoTargetHits({ x, y }, hostileTargetables(state, player), { radius, includeRadius: true })) {
    const target = hit.target.target;
    if (damageNpc(state, kernel, player, target, amount, options)) hits += 1;
  }
  return hits;
}

function damageNpcsInCone(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, range: number, halfAngle: number, amount: number, options: { knockbackModifier?: number; energyGain?: number } = {}) {
  let hits = 0;
  for (const hit of coneMmoTargetHits({ x: player.x, y: player.y }, { x: player.abilityVectorX, y: player.abilityVectorY }, hostileTargetables(state, player), { range, halfAngleRad: halfAngle, includeRadius: true })) {
    const target = hit.target.target;
    if (damageNpc(state, kernel, player, target, amount, options)) hits += 1;
  }
  return hits;
}

function coneTargets(state: MmoSkillDemoState, player: PlayerEntity, range: number, halfAngle: number) {
  return coneMmoTargetHits({ x: player.x, y: player.y }, { x: player.abilityVectorX, y: player.abilityVectorY }, hostileTargetables(state, player), { range, halfAngleRad: halfAngle, includeRadius: true })
    .map((hit) => hit.target.target);
}

function movePlayerDistance(kernel: CollisionKernel, player: PlayerEntity, dx: number, dy: number, distance: number) {
  const length = Math.hypot(dx, dy) || 1;
  const move = Math.max(0, distance);
  moveMmoCircle(
    player,
    (dx / length) * move,
    (dy / length) * move,
    { rectBlocked: () => false, circleBlocked: (circle) => !canOccupy(kernel, circle.x, circle.y, circle.radius), blockedAt: (x, y, radius) => !canOccupy(kernel, x, y, radius) },
    { radius: PLAYER_RADIUS }
  );
}

function movePlayerDashDistance(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, spec: PlayerDashSpec, dx = player.abilityVectorX, dy = player.abilityVectorY) {
  const startX = player.x;
  const startY = player.y;
  movePlayerDistance(kernel, player, dx, dy, dashDistanceForPmsps(player, spec));
  const traveled = Math.hypot(player.x - startX, player.y - startY);
  if (traveled > 1 && spec.effectKind) {
    spawnPlayerEffectHazard(state, player, "line", startX, startY, player.x, player.y, 8, spec.effectKind, Math.max(220, spec.durationMs * 2));
  }
  return { startX, startY, traveled };
}

function moveMeleeDashBeforeFire(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, abilityId: MeleeDashAbilityId, dx = player.abilityVectorX, dy = player.abilityVectorY) {
  return movePlayerDashDistance(state, kernel, player, MELEE_PREFIRE_DASHES[abilityId], dx, dy);
}

function moveActiveLinearDash(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, previousMs: number, dt: number, castMs: number, travelMs: number, distance: number, effectKind: string) {
  if (player.activeMs <= castMs) return;
  const previousTravel = clamp(previousMs - castMs, 0, travelMs);
  const currentTravel = clamp(player.activeMs - castMs, 0, travelMs);
  const move = distance * ((currentTravel - previousTravel) / Math.max(1, travelMs));
  movePlayerDistance(kernel, player, player.abilityVectorX, player.abilityVectorY, move);
  if (dt > 0) spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 20, effectKind, 220);
}

function clampedAim(player: PlayerEntity, input: RuntimeInput, range: number) {
  const aim = aimPoint(player, input);
  const dx = aim.x - player.x;
  const dy = aim.y - player.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= range || distance < 1) return aim;
  return {
    x: clamp(player.x + (dx / distance) * range, PLAYER_RADIUS, mmoSkillDemoMap.pixelWidth - PLAYER_RADIUS),
    y: clamp(player.y + (dy / distance) * range, PLAYER_RADIUS, mmoSkillDemoMap.pixelHeight - PLAYER_RADIUS)
  };
}

function teleportPlayerByVector(kernel: CollisionKernel, player: PlayerEntity, dx: number, dy: number, range: number) {
  const length = Math.hypot(dx, dy) || 1;
  const distance = Math.min(range, length);
  const step = Math.max(12, distance / 12);
  for (let travel = distance; travel >= 0; travel -= step) {
    const x = clamp(player.x + (dx / length) * travel, PLAYER_RADIUS, mmoSkillDemoMap.pixelWidth - PLAYER_RADIUS);
    const y = clamp(player.y + (dy / length) * travel, PLAYER_RADIUS, mmoSkillDemoMap.pixelHeight - PLAYER_RADIUS);
    if (canOccupy(kernel, x, y, PLAYER_RADIUS)) {
      player.x = x;
      player.y = y;
      return true;
    }
  }
  return false;
}

function nearestHostileNearPoint(state: MmoSkillDemoState, player: PlayerEntity, x: number, y: number, radius: number, exclude = new Set<string>()) {
  return findNearestMmoEntity({ x, y }, hostileTargetables(state, player), { maxDistance: radius, includeRadius: false, filter: (target) => !exclude.has(target.id) })?.target;
}

function alliedPlayerNearAim(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput, range: number) {
  const aim = clampedAim(player, input, range);
  let best: PlayerEntity = player;
  let bestDistance = Math.hypot(player.x - aim.x, player.y - aim.y);
  for (const ally of entitiesOfType(state, "player")) {
    if (ally.hp <= 0 || ally.zoneId !== player.zoneId) continue;
    const distance = Math.hypot(ally.x - aim.x, ally.y - aim.y);
    if (distance < bestDistance && Math.hypot(ally.x - player.x, ally.y - player.y) <= range) {
      best = ally;
      bestDistance = distance;
    }
  }
  return best;
}

type RewindSample = { ageMs: number; x: number; y: number; hp: number; zoneId: ZoneId };

const rewindHistory = new Map<string, RewindSample[]>();

function recordRewindSample(player: PlayerEntity, dt: number) {
  const ms = Math.max(0, Math.floor(dt * 1000));
  const samples = rewindHistory.get(player.id) ?? [];
  for (const sample of samples) sample.ageMs += ms;
  samples.unshift({ ageMs: 0, x: player.x, y: player.y, hp: player.hp, zoneId: player.zoneId });
  while (samples.length > 0 && samples[samples.length - 1].ageMs > 3400) samples.pop();
  rewindHistory.set(player.id, samples.slice(0, 90));
}

function applyRewind(kernel: CollisionKernel, player: PlayerEntity) {
  const samples = rewindHistory.get(player.id) ?? [];
  const sample = samples.find((entry) => entry.ageMs >= 2500) ?? samples[samples.length - 1];
  if (!sample) return false;
  const lostHp = Math.max(0, sample.hp - player.hp);
  const x = clamp(sample.x, PLAYER_RADIUS, mmoSkillDemoMap.pixelWidth - PLAYER_RADIUS);
  const y = clamp(sample.y, PLAYER_RADIUS, mmoSkillDemoMap.pixelHeight - PLAYER_RADIUS);
  if (canOccupy(kernel, x, y, PLAYER_RADIUS)) {
    player.x = x;
    player.y = y;
    player.zoneId = sample.zoneId;
  }
  healPlayer(player, lostHp);
  return true;
}

function lineHits(state: MmoSkillDemoState, player: PlayerEntity, dx: number, dy: number, range: number, width: number) {
  return lineMmoTargetHits({ x: player.x, y: player.y }, { x: dx, y: dy }, hostileTargetables(state, player), { range, width, includeRadius: true })
    .map((hit): LineHit => ({ target: hit.target.target, distance: hit.distance }));
}

function firstLineHit(state: MmoSkillDemoState, player: PlayerEntity, dx: number, dy: number, range: number, width: number) {
  const hit = firstMmoLineTargetHit({ x: player.x, y: player.y }, { x: dx, y: dy }, hostileTargetables(state, player), { range, width, includeRadius: true });
  return hit ? { target: hit.target.target, distance: hit.distance } : undefined;
}

function spawnBowLine(state: MmoSkillDemoState, player: PlayerEntity, dx: number, dy: number, range: number, width: number, effectKind = "arrow", lifetimeMs = 520) {
  spawnPlayerEffectHazard(state, player, "line", player.x, player.y, player.x + dx * range, player.y + dy * range, width, effectKind, lifetimeMs);
}

export {
  abilityCastMs,
  activeHas,
  activeHitMs,
  activeMark,
  activeMarkHitMs,
  alliedPlayerNearAim,
  animationDurationScale,
  applyDevCheat,
  applyRewind,
  beginActiveAbility,
  bowDecentDamage,
  bowHighDamage,
  bowMildDamage,
  canInterruptActiveAbility,
  clampedAim,
  clearActiveAbility,
  combatSlotForAction,
  coneTargets,
  damageNpcsInCone,
  damageNpcsInRadius,
  devCheatsEnabled,
  directionFromAim,
  endRushAbility,
  firstLineHit,
  healPlayer,
  healPlayersNear,
  hostileTargetables,
  interruptActiveAbility,
  lineHits,
  martialDamage,
  moveActiveLinearDash,
  moveMeleeDashBeforeFire,
  movePlayerDashDistance,
  movePlayerDistance,
  nearestHostileNearPoint,
  recordRewindSample,
  rewindHistory,
  rotateVectorToward,
  rushProgress,
  rushSpeedMultiplier,
  spawnBowLine,
  spawnCombatTextHazard,
  spawnPlayerEffectHazard,
  spawnPummelShockwave,
  spellDamage,
  targetInFrontCone,
  teleportPlayerByVector,
  tickPlayerStatusEffects
};

export type {
  LineHit,
  NpcTargetable,
  RewindSample
};
