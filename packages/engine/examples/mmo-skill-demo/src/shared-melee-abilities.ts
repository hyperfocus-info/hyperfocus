import { type CollisionKernel } from "@hyperfocus/engine";
import { moveMmoCircle } from "@hyperfocus/engine/mmo";
import { type AbilitySlot, MOVEMENT_DASHES, PLAYER_ABILITY_DEFS, type PlayerAbilityDef } from "./shared-ability-catalog.ts";
import { abilityCastMs, activeHas, activeMark, beginActiveAbility, clampedAim, clearActiveAbility, coneTargets, damageNpcsInCone, damageNpcsInRadius, firstLineHit, healPlayer, lineHits, martialDamage, moveActiveLinearDash, moveMeleeDashBeforeFire, nearestHostileNearPoint, spawnBowLine, spawnCombatTextHazard, spawnPlayerEffectHazard, spawnPummelShockwave, targetInFrontCone } from "./shared-combat-player.ts";
import { damageNpc, damageNpcAmount } from "./shared-combat-resolution.ts";
import { addEnergy, addPlayerMsFlag, addTimedNpcFlag, addTimedPlayerFlag, applyNpcPoison, consumeNpcPoison, dashDistanceForPmsps, hostileNpcs, playerDamageBonus, playerFlagStacks, pointSegmentDistance, setPlayerFlagStacks } from "./shared-combat-state.ts";
import { type MmoSkillDemoState, type PlayerEntity, type RuntimeInput } from "./shared-contracts.ts";
import { entitiesOfType } from "./shared-entity-registry.ts";
import { setSlotCooldown } from "./shared-loadout.ts";
import { spawnPlayerPersistentHazard, spawnPlayerProjectile } from "./shared-projectile-abilities.ts";
import { stableHash } from "./shared-quests.ts";
import { clamp, extendU16Ms, u16Ms } from "./shared-replication-projection.ts";
import { PLAYER_RADIUS, PUMMEL_MAX_CHARGE_MS, WHIRLWIND_RADIUS } from "./shared-world-catalog.ts";
import { bodyRadius, canOccupy } from "./shared-world-physics.ts";
import { mmoSkillDemoMap } from "./shared-world-runtime.ts";

function pummelChargeRatio(player: PlayerEntity) {
  return clamp(player.chargeMs / PUMMEL_MAX_CHARGE_MS, 0, 1);
}

function pummelConeRange(ratio: number) {
  return 55 + clamp(ratio, 0, 1) * 57;
}

function pummelConeHalfAngle(ratio: number) {
  return ((50 + ratio * 40) * Math.PI) / 180;
}

function finishPummel(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["mace-pummel"];
  const ratio = pummelChargeRatio(player);
  const range = pummelConeRange(ratio);
  const halfAngle = pummelConeHalfAngle(ratio);
  const baseDamage = 7 + player.combatLevel * 2 + playerDamageBonus(player);
  const damage = Math.max(1, Math.floor(baseDamage * (1 + ratio * 5)));
  const kbm = 0.65 * (1 + ratio * 2);
  player.action = "lmb";
  player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
  const lungeDistance = range * (0.08 + ratio * 0.12);
  moveMmoCircle(
    player,
    player.abilityVectorX * lungeDistance,
    player.abilityVectorY * lungeDistance,
    { rectBlocked: () => false, circleBlocked: (circle) => !canOccupy(kernel, circle.x, circle.y, circle.radius), blockedAt: (x, y, radius) => !canOccupy(kernel, x, y, radius) },
    { radius: PLAYER_RADIUS }
  );
  spawnPummelShockwave(state, player, range, halfAngle);
  let hit = false;
  for (const target of hostileNpcs(state, player)) {
    if (!targetInFrontCone(player, target, range, halfAngle)) continue;
    if (damageNpc(state, kernel, player, target, damage, { knockbackModifier: kbm, isHeavyImpact: ratio > 0.5, energyGain: def.energyGain })) {
      hit = true;
      spawnCombatTextHazard(state, target, "damage", `-${damage}`);
    }
  }
  if (hit) spawnPlayerEffectHazard(state, player, "aoe", player.x + player.abilityVectorX * 34, player.y + player.abilityVectorY * 34, player.x, player.y, Math.floor(44 + ratio * 20), ratio >= 1 ? "whitehot" : "dust", 460);
  setSlotCooldown(player, "LMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishCrushingLeap(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["mace-crushing-leap"];
  player.action = "rmb";
  player.castMs = Math.max(player.castMs, 180);
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 72, "crater", 900);
  for (const target of hostileNpcs(state, player)) {
    if (Math.hypot(target.x - player.x, target.y - player.y) > 72 + bodyRadius(target)) continue;
    if (damageNpc(state, kernel, player, target, 14 + player.combatLevel * 2 + playerDamageBonus(player), { knockbackModifier: 1.85, isHeavyImpact: true, energyGain: def.energyGain })) {
      target.knockbackX += player.abilityVectorX * 90;
      target.knockbackY += player.abilityVectorY * 90;
      target.knockbackMs = Math.max(target.knockbackMs, 220);
      target.knockbackHeavy = true;
      target.stunMs = Math.max(target.stunMs, 1000);
      target.slowMs = Math.max(target.slowMs ?? 0, 3000);
      target.castMs = 0;
      target.attackCooldownMs = extendU16Ms(target.attackCooldownMs, 450);
      target.projectileCooldownMs = extendU16Ms(target.projectileCooldownMs, 250);
    }
  }
  clearActiveAbility(player);
}

function fireRockSmash(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["mace-rock-smash"];
  const ratio = clamp(player.chargeMs / 1000, 0, 1);
  const maxCharge = ratio >= 0.98;
  const baseAngle = Math.atan2(player.abilityVectorY, player.abilityVectorX);
  const shots = maxCharge ? 10 : 1;
  player.action = "e";
  player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
  let hitCount = 0;
  for (let i = 0; i < shots; i += 1) {
    const spread = shots === 1 ? 0 : -0.58 + (1.16 * i) / Math.max(1, shots - 1);
    const sizeSeed = shots === 1 ? 0.38 : ((stableHash(`${player.id}:${state.tick}:${i}`) % 100) / 100);
    const size = maxCharge ? 0.45 + sizeSeed * 1.25 : 0.55;
    const angle = baseAngle + spread;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const range = maxCharge ? 130 + (1.7 - size) * 60 : 220;
    const width = 10 + size * 10;
    const damage = Math.max(1, Math.floor(((maxCharge ? 9 : 11) + player.combatLevel * (maxCharge ? 1.2 : 1.6) + playerDamageBonus(player) + size * (maxCharge ? 13 : 4)) * 0.7));
    const kbm = (0.55 + size * (maxCharge ? 1.25 : 0.85)) * 0.8;
    const x2 = player.x + dx * range;
    const y2 = player.y + dy * range;
    spawnPlayerEffectHazard(state, player, "line", player.x + dx * 18, player.y + dy * 18, x2, y2, Math.floor(width), maxCharge ? "boulders" : "boulder", 720);
    for (const target of hostileNpcs(state, player)) {
      const distance = pointSegmentDistance(target.x, target.y, player.x, player.y, x2, y2);
      if (distance > width + bodyRadius(target)) continue;
      if (shots > 1 && activeHas(player, `rock:${target.id}:${i}`)) continue;
      if (damageNpc(state, kernel, player, target, damage, { knockbackModifier: kbm, isHeavyImpact: size > 1.1, energyGain: def.energyGain })) hitCount += 1;
      activeMark(player, `rock:${target.id}:${i}`);
    }
  }
  if (maxCharge) {
    player.knockbackX -= player.abilityVectorX * 52;
    player.knockbackY -= player.abilityVectorY * 52;
    player.knockbackMs = Math.max(player.knockbackMs, 130);
  }
  if (hitCount > 0) addEnergy(player, Math.min(12, hitCount * 2));
  setSlotCooldown(player, "E", def.cooldownMs);
  clearActiveAbility(player);
}

function tickWhirlwind(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, dt: number) {
  const channelMs = player.activeMs - Math.max(50, player.activeDurationMs - 2750);
  if (channelMs < 0) return;
  player.abilityTickMs = u16Ms(player.abilityTickMs + Math.max(0, Math.floor(dt * 1000)));
  if (player.abilityTickMs < 250) return;
  player.abilityTickMs = 0;
  player.action = "r";
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, WHIRLWIND_RADIUS, "whirlwind", 280);
  for (const target of hostileNpcs(state, player)) {
    if (Math.hypot(target.x - player.x, target.y - player.y) > WHIRLWIND_RADIUS + bodyRadius(target)) continue;
    damageNpc(state, kernel, player, target, Math.floor((22 + Math.floor(player.combatLevel * 1.2) + playerDamageBonus(player)) * 1.3), { knockbackModifier: -0.1, isHeavyImpact: false, ultimate: true });
  }
}

function finishTwinStrike(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["twin-strike"];
  player.action = "lmb";
  moveMeleeDashBeforeFire(state, kernel, player, "twin-strike");
  spawnPummelShockwave(state, player, 55, (45 * Math.PI) / 180, 260, "twinwave");
  damageNpcsInCone(state, kernel, player, 55, (45 * Math.PI) / 180, martialDamage(player, 8), { knockbackModifier: 0.25, energyGain: def.energyGain });
  setSlotCooldown(player, "LMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishToxicSlash(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["twin-toxic-slash"];
  player.action = "lmb";
  moveMeleeDashBeforeFire(state, kernel, player, "twin-toxic-slash");
  spawnPummelShockwave(state, player, 60, (50 * Math.PI) / 180, 300, "toxicwave");
  for (const target of coneTargets(state, player, 60, (50 * Math.PI) / 180)) {
    if (damageNpc(state, kernel, player, target, martialDamage(player, 5), { knockbackModifier: 0.2, energyGain: def.energyGain })) applyNpcPoison(target);
  }
  setSlotCooldown(player, "LMB", def.cooldownMs);
  clearActiveAbility(player);
}

function fireThrowingDirk(state: MmoSkillDemoState, _kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["twin-throwing-dirk"];
  player.action = "lmb";
  spawnPlayerProjectile(state, player, "dirk", {
    dx: player.abilityVectorX,
    dy: player.abilityVectorY,
    width: 6,
    damage: martialDamage(player, 6),
    knockbackModifier: 0.1
  });
  setSlotCooldown(player, "LMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishShadowLunge(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["twin-shadow-lunge"];
  player.action = "rmb";
  const { startX, startY } = moveMeleeDashBeforeFire(state, kernel, player, "twin-shadow-lunge");
  spawnPlayerEffectHazard(state, player, "line", startX, startY, player.x, player.y, 18, "phase", 420);
  const traveled = Math.hypot(player.x - startX, player.y - startY);
  for (const target of hostileNpcs(state, player)) {
    const distance = pointSegmentDistance(target.x, target.y, startX, startY, player.x, player.y);
    if (distance > 18 + bodyRadius(target)) continue;
    const projection = (target.x - startX) * player.abilityVectorX + (target.y - startY) * player.abilityVectorY;
    const crossed = projection > 0 && projection < traveled - bodyRadius(target);
    damageNpc(state, kernel, player, target, martialDamage(player, crossed ? 19 : 16), { knockbackModifier: 0.9, isHeavyImpact: true, energyGain: def.energyGain });
  }
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishExsanguinate(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["twin-exsanguinate"];
  player.action = "rmb";
  moveMeleeDashBeforeFire(state, kernel, player, "twin-exsanguinate");
  spawnPummelShockwave(state, player, 65, (60 * Math.PI) / 180, 360, "bloodwave");
  for (const target of coneTargets(state, player, 65, (60 * Math.PI) / 180)) {
    const stacks = consumeNpcPoison(target);
    damageNpc(state, kernel, player, target, martialDamage(player, 12 + stacks * 6), { knockbackModifier: 0.55, energyGain: def.energyGain });
  }
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function fireFanOfKnives(state: MmoSkillDemoState, _kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["twin-fan-of-knives"];
  const baseAngle = Math.atan2(player.abilityVectorY, player.abilityVectorX);
  player.action = "rmb";
  for (let i = 0; i < 5; i += 1) {
    const angle = baseAngle - (28 * Math.PI) / 180 + ((56 * Math.PI) / 180) * (i / 4);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    spawnPlayerProjectile(state, player, "knife", {
      dx,
      dy,
      width: 5,
      damage: martialDamage(player, 10),
      knockbackModifier: 0.2
    });
  }
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function tickSwiftStep(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, previousMs: number, dt: number) {
  const def = PLAYER_ABILITY_DEFS["twin-swift-step"];
  const castMs = abilityCastMs(player, def.castMs);
  moveActiveLinearDash(state, kernel, player, previousMs, dt, castMs, 200, 220, "phase");
  if (player.activeMs >= player.activeDurationMs) {
    addTimedPlayerFlag(player, "swift", 1500);
    clearActiveAbility(player);
  }
}

function finishSmokeBomb(state: MmoSkillDemoState, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["twin-smoke-bomb"];
  player.action = "space";
  addTimedPlayerFlag(player, "stealth", 3000);
  spawnPlayerPersistentHazard(state, player, "smoke", player.x, player.y, 130, 0, 3000, "smoke", 0);
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 130, "smoke", 700);
  for (const target of hostileNpcs(state, player)) {
    if (Math.hypot(target.x - player.x, target.y - player.y) <= 130 + bodyRadius(target)) addTimedNpcFlag(target, "blind", 3000);
  }
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "Space", def.cooldownMs);
  clearActiveAbility(player);
}

function applyBloodlust(state: MmoSkillDemoState, player: PlayerEntity, slot: AbilitySlot, def: PlayerAbilityDef, input: RuntimeInput) {
  beginActiveAbility(player, slot, def.id, input, 80);
  player.action = "space";
  addTimedPlayerFlag(player, "bloodlust", 2500);
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 60, "blood", 620);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, slot, def.cooldownMs);
  clearActiveAbility(player);
}

function applyBlur(player: PlayerEntity, slot: AbilitySlot, def: PlayerAbilityDef, input: RuntimeInput) {
  beginActiveAbility(player, slot, def.id, input, 80);
  player.iframeMs = Math.max(player.iframeMs, 750);
  player.castMs = 0;
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, slot, def.cooldownMs);
  clearActiveAbility(player);
}

function finishVanish(state: MmoSkillDemoState, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["twin-vanish"];
  player.action = "q";
  addTimedPlayerFlag(player, "stealth", 4000);
  addTimedPlayerFlag(player, "vanish", 4000);
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 56, "phase", 620);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "Q", def.cooldownMs);
  clearActiveAbility(player);
}

function finishNoxiousFlask(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["twin-noxious-flask"];
  const aim = clampedAim(player, input, 350);
  const dx = aim.x - player.x;
  const dy = aim.y - player.y;
  const travelDistance = Math.max(1, Math.hypot(dx, dy));
  player.action = "e";
  spawnPlayerProjectile(state, player, "noxious-flask", {
    dx,
    dy,
    width: 10,
    damage: martialDamage(player, 3),
    knockbackModifier: 0,
    travelDistance
  });
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "E", def.cooldownMs);
  clearActiveAbility(player);
}

function finishDeathsMark(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["twin-deaths-mark"];
  const aim = clampedAim(player, input, 350);
  const target = nearestHostileNearPoint(state, player, aim.x, aim.y, 90) ?? firstLineHit(state, player, player.abilityVectorX, player.abilityVectorY, 350, 12)?.target;
  player.action = "e";
  if (target) {
    spawnPlayerEffectHazard(state, player, "line", player.x, player.y, target.x, target.y, 8, "deathmark", 620);
    damageNpc(state, kernel, player, target, martialDamage(player, 4), { knockbackModifier: 0.05, energyGain: def.energyGain });
    addTimedNpcFlag(target, "deathmark", 3000);
  }
  setSlotCooldown(player, "E", def.cooldownMs);
  clearActiveAbility(player);
}

function tickBladeDance(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, dt: number) {
  const def = PLAYER_ABILITY_DEFS["twin-blade-dance"];
  const castMs = abilityCastMs(player, def.castMs);
  if (player.activeMs < castMs) {
    player.castMs = Math.max(player.castMs, Math.floor(castMs - player.activeMs));
    return;
  }
  player.action = "r";
  player.abilityTickMs = u16Ms(player.abilityTickMs + Math.max(0, Math.floor(dt * 1000)));
  while (player.abilityTickMs >= 250) {
    player.abilityTickMs -= 250;
    spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 110, "bladedance", 260);
    damageNpcsInRadius(state, kernel, player, player.x, player.y, 110, martialDamage(player, 8), { knockbackModifier: -0.05, ultimate: true });
  }
  if (player.activeMs >= player.activeDurationMs) clearActiveAbility(player);
}

function finishAssassinate(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["twin-assassinate"];
  const aim = clampedAim(player, input, 400);
  const target = nearestHostileNearPoint(state, player, aim.x, aim.y, 110) ?? firstLineHit(state, player, player.abilityVectorX, player.abilityVectorY, 400, 14)?.target;
  player.action = "r";
  const dashX = target ? target.x - player.x : player.abilityVectorX;
  const dashY = target ? target.y - player.y : player.abilityVectorY;
  const { startX, startY } = moveMeleeDashBeforeFire(state, kernel, player, "twin-assassinate", dashX, dashY);
  if (target) {
    spawnPlayerEffectHazard(state, player, "line", startX, startY, player.x, player.y, 8, "phase", 520);
    const before = target.hp;
    damageNpc(state, kernel, player, target, martialDamage(player, 48), { knockbackModifier: 0.2, ultimate: true });
    if (before > 0 && target.hp <= 0) addEnergy(player, 50);
  }
  setSlotCooldown(player, "R", def.cooldownMs);
  clearActiveAbility(player);
}

function finishBladeBasic(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, abilityId: "blade-cleave" | "blade-sever" | "blade-sunder") {
  const def = PLAYER_ABILITY_DEFS[abilityId];
  const params = abilityId === "blade-cleave"
    ? { range: 75, half: 65, damage: 12, flag: "" }
    : abilityId === "blade-sever"
      ? { range: 70, half: 55, damage: 10, flag: "mortal" }
      : { range: 72, half: 50, damage: 11, flag: "fractured" };
  player.action = "lmb";
  moveMeleeDashBeforeFire(state, kernel, player, abilityId);
  spawnPummelShockwave(state, player, params.range, (params.half * Math.PI) / 180, 340, abilityId === "blade-sever" ? "severwave" : abilityId === "blade-sunder" ? "sunderwave" : "bladewave");
  for (const target of coneTargets(state, player, params.range, (params.half * Math.PI) / 180)) {
    if (damageNpc(state, kernel, player, target, martialDamage(player, params.damage), { knockbackModifier: 0.45, energyGain: def.energyGain }) && params.flag) {
      addTimedNpcFlag(target, params.flag, 3000);
    }
  }
  setSlotCooldown(player, "LMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishBrutalStrike(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["blade-brutal-strike"];
  player.action = "rmb";
  moveMeleeDashBeforeFire(state, kernel, player, "blade-brutal-strike");
  spawnPummelShockwave(state, player, 85, (45 * Math.PI) / 180, 420, "brutalwave");
  for (const target of coneTargets(state, player, 85, (45 * Math.PI) / 180)) {
    if (damageNpc(state, kernel, player, target, martialDamage(player, 26), { knockbackModifier: 1.7, isHeavyImpact: true, energyGain: def.energyGain })) {
      target.stunMs = Math.max(target.stunMs, 550);
      target.castMs = 0;
      target.attackCooldownMs = extendU16Ms(target.attackCooldownMs, 250);
    }
  }
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishThrust(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["blade-thrust"];
  player.action = "rmb";
  moveMeleeDashBeforeFire(state, kernel, player, "blade-thrust");
  spawnBowLine(state, player, player.abilityVectorX, player.abilityVectorY, 180, 20, "pierceblade", 360);
  for (const hit of lineHits(state, player, player.abilityVectorX, player.abilityVectorY, 180, 20)) {
    damageNpc(state, kernel, player, hit.target, martialDamage(player, 15), { knockbackModifier: 0.55, energyGain: def.energyGain });
  }
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishBloodthirst(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["blade-bloodthirst"];
  player.action = "rmb";
  moveMeleeDashBeforeFire(state, kernel, player, "blade-bloodthirst");
  spawnPummelShockwave(state, player, 65, (60 * Math.PI) / 180, 360, "bloodwave");
  let dealt = 0;
  for (const target of coneTargets(state, player, 65, (60 * Math.PI) / 180)) {
    dealt += damageNpcAmount(state, kernel, player, target, martialDamage(player, 14), { knockbackModifier: 0.5, energyGain: def.energyGain });
  }
  healPlayer(player, Math.floor(dealt * 0.5));
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function tickCombatRoll(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, previousMs: number, dt: number) {
  const dash = MOVEMENT_DASHES["blade-combat-roll"];
  const castMs = abilityCastMs(player, PLAYER_ABILITY_DEFS["blade-combat-roll"].castMs);
  player.iframeMs = Math.max(player.iframeMs, Math.max(0, player.activeDurationMs - player.activeMs));
  moveActiveLinearDash(state, kernel, player, previousMs, dt, castMs, dash.durationMs, dashDistanceForPmsps(player, dash), dash.effectKind ?? "rushdust");
  if (player.activeMs >= player.activeDurationMs) clearActiveAbility(player);
}

function tickLeapAttack(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, previousMs: number, dt: number) {
  const dash = MOVEMENT_DASHES["blade-leap-attack"];
  const castMs = abilityCastMs(player, PLAYER_ABILITY_DEFS["blade-leap-attack"].castMs);
  moveActiveLinearDash(state, kernel, player, previousMs, dt, castMs, dash.durationMs, dashDistanceForPmsps(player, dash), dash.effectKind ?? "dust");
  if (player.activeMs < player.activeDurationMs) return;
  const def = PLAYER_ABILITY_DEFS["blade-leap-attack"];
  player.action = "space";
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 85, "crater", 620);
  for (const target of hostileNpcs(state, player)) {
    if (Math.hypot(target.x - player.x, target.y - player.y) > 85 + bodyRadius(target)) continue;
    damageNpc(state, kernel, player, target, martialDamage(player, 14), { knockbackModifier: 0.75, energyGain: def.energyGain });
  }
  clearActiveAbility(player);
}

function applyJuggernaut(state: MmoSkillDemoState, player: PlayerEntity, slot: AbilitySlot, def: PlayerAbilityDef, input: RuntimeInput) {
  beginActiveAbility(player, slot, def.id, input, 80);
  player.action = "space";
  addTimedPlayerFlag(player, "juggernaut", 3000);
  player.slowMs = 0;
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 60, "dust", 620);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, slot, def.cooldownMs);
  clearActiveAbility(player);
}

function tickRiposte(player: PlayerEntity) {
  if (player.activeMs >= player.activeDurationMs) {
    player.guardMs = 0;
    clearActiveAbility(player);
  }
}

function applyIronWill(state: MmoSkillDemoState, player: PlayerEntity, slot: AbilitySlot, def: PlayerAbilityDef, input: RuntimeInput) {
  beginActiveAbility(player, slot, def.id, input, 80);
  player.stunMs = 0;
  player.slowMs = 0;
  player.knockbackX = 0;
  player.knockbackY = 0;
  player.knockbackMs = 0;
  addTimedPlayerFlag(player, "ironwill", 2500);
  healPlayer(player, Math.max(1, Math.floor(player.maxHp * 0.25)));
  addPlayerMsFlag(player, "ironwill-haste", 5000);
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 64, "shield", 620);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, slot, def.cooldownMs);
  clearActiveAbility(player);
}

function finishIntimidatingShout(state: MmoSkillDemoState, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["blade-intimidating-shout"];
  const range = 192;
  player.action = "e";
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, range, "shout", 620);
  for (const target of hostileNpcs(state, player)) {
    if (Math.hypot(target.x - player.x, target.y - player.y) > range + bodyRadius(target)) continue;
    addTimedNpcFlag(target, "weakened", 4000);
    target.slowMs = Math.max(target.slowMs ?? 0, 3000);
  }
  for (const ally of entitiesOfType(state, "player")) {
    if (ally.hp <= 0 || ally.zoneId !== player.zoneId || Math.hypot(ally.x - player.x, ally.y - player.y) > range + PLAYER_RADIUS) continue;
    addPlayerMsFlag(ally, "shout-haste", 3000);
    setPlayerFlagStacks(ally, "shout-regen", Math.max(playerFlagStacks(ally, "shout-regen"), 5));
    setPlayerFlagStacks(ally, "shout-regen-step", playerFlagStacks(ally, "shout-regen-step") || 1000);
  }
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "E", def.cooldownMs);
  clearActiveAbility(player);
}

function finishRazorWind(state: MmoSkillDemoState, _kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["blade-razor-wind"];
  const ratio = clamp(player.chargeMs / 1000, 0.2, 1);
  const range = 350 + 200 * ratio;
  const width = 45 + 35 * ratio;
  const damage = martialDamage(player, 12 + Math.floor(13 * ratio));
  player.action = "e";
  spawnPlayerProjectile(state, player, "razor", {
    dx: player.abilityVectorX,
    dy: player.abilityVectorY,
    width,
    damage,
    knockbackModifier: 0.35,
    travelDistance: range,
    charged: ratio >= 0.98
  });
  setSlotCooldown(player, "E", def.cooldownMs);
  clearActiveAbility(player);
}

function tickOmnislash(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, dt: number) {
  const def = PLAYER_ABILITY_DEFS["blade-omnislash"];
  const castMs = abilityCastMs(player, def.castMs);
  player.iframeMs = Math.max(player.iframeMs, Math.max(0, player.activeDurationMs - player.activeMs));
  if (player.activeMs < castMs) {
    player.castMs = Math.max(player.castMs, Math.floor(castMs - player.activeMs));
    return;
  }
  player.abilityTickMs = u16Ms(player.abilityTickMs + Math.max(0, Math.floor(dt * 1000)));
  while (player.abilityTickMs >= 300 && playerFlagStacks(player, "omni") < 8) {
    player.abilityTickMs -= 300;
    const index = playerFlagStacks(player, "omni");
    const radius = index === 0 ? 350 : 200;
    const candidates = hostileNpcs(state, player).filter((target) => Math.hypot(target.x - player.x, target.y - player.y) <= radius + bodyRadius(target));
    if (!candidates.length) break;
    const target = candidates[stableHash(`${player.id}:${player.activeMs}:${index}`) % candidates.length];
    const angle = (stableHash(`${target.id}:${index}`) / 0xffffffff) * Math.PI * 2;
    const x = clamp(target.x - Math.cos(angle) * 24, PLAYER_RADIUS, mmoSkillDemoMap.pixelWidth - PLAYER_RADIUS);
    const y = clamp(target.y - Math.sin(angle) * 24, PLAYER_RADIUS, mmoSkillDemoMap.pixelHeight - PLAYER_RADIUS);
    if (canOccupy(kernel, x, y, PLAYER_RADIUS)) {
      spawnPlayerEffectHazard(state, player, "line", player.x, player.y, x, y, 6, "phase", 260);
      player.x = x;
      player.y = y;
    }
    damageNpc(state, kernel, player, target, martialDamage(player, 12), { knockbackModifier: 0.25, ultimate: true });
    setPlayerFlagStacks(player, "omni", index + 1);
  }
  if (player.activeMs >= player.activeDurationMs || playerFlagStacks(player, "omni") >= 8) clearActiveAbility(player);
}

function applyDuelistsTrance(state: MmoSkillDemoState, player: PlayerEntity, slot: AbilitySlot, def: PlayerAbilityDef, input: RuntimeInput) {
  beginActiveAbility(player, slot, def.id, input, 80);
  addTimedPlayerFlag(player, "trance", 8000);
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 70, "trance", 760);
  setSlotCooldown(player, slot, def.cooldownMs);
  clearActiveAbility(player);
}

export {
  applyBloodlust,
  applyBlur,
  applyDuelistsTrance,
  applyIronWill,
  applyJuggernaut,
  finishAssassinate,
  finishBladeBasic,
  finishBloodthirst,
  finishBrutalStrike,
  finishCrushingLeap,
  finishDeathsMark,
  finishExsanguinate,
  finishIntimidatingShout,
  finishNoxiousFlask,
  finishPummel,
  finishRazorWind,
  finishShadowLunge,
  finishSmokeBomb,
  finishThrust,
  finishToxicSlash,
  finishTwinStrike,
  finishVanish,
  fireFanOfKnives,
  fireRockSmash,
  fireThrowingDirk,
  pummelChargeRatio,
  pummelConeHalfAngle,
  pummelConeRange,
  tickBladeDance,
  tickCombatRoll,
  tickLeapAttack,
  tickOmnislash,
  tickRiposte,
  tickSwiftStep,
  tickWhirlwind
};
