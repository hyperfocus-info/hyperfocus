import { type CollisionKernel } from "@hyperfocus/engine";
import { PLAYER_ABILITY_DEFS } from "./shared-ability-catalog.ts";
import { abilityCastMs, alliedPlayerNearAim, applyRewind, clampedAim, clearActiveAbility, damageNpcsInCone, damageNpcsInRadius, directionFromAim, firstLineHit, healPlayer, healPlayersNear, nearestHostileNearPoint, spawnBowLine, spawnPlayerEffectHazard, spawnPummelShockwave, spellDamage, targetInFrontCone, teleportPlayerByVector } from "./shared-combat-player.ts";
import { damageNpc } from "./shared-combat-resolution.ts";
import { addCombatFlag, addEnergy, addPlayerCombatFlag, aimPoint, hostileNpcs, npcFlagStacks, playerFlagStacks, removeCombatFlag, removePlayerCombatFlag, setNpcFlagStacks, setPlayerFlagStacks } from "./shared-combat-state.ts";
import { type MmoSkillDemoState, type PlayerEntity, type RuntimeInput } from "./shared-contracts.ts";
import { entitiesOfType } from "./shared-entity-registry.ts";
import { setSlotCooldown } from "./shared-loadout.ts";
import { PLAYER_PROJECTILE_DEFS, spawnPlayerProjectile, spawnPlayerTimedHazard } from "./shared-projectile-abilities.ts";
import { stableHash } from "./shared-quests.ts";
import { clamp, extendU16Ms, u16Ms } from "./shared-replication-projection.ts";
import { applyKnockback, bodyRadius, updateKnockback } from "./shared-world-physics.ts";

function fireArcaneBolt(state: MmoSkillDemoState, _kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["staff-arcane-bolt"];
  player.action = "lmb";
  spawnPlayerProjectile(state, player, "arcane-bolt", {
    dx: player.abilityVectorX,
    dy: player.abilityVectorY,
    width: 12,
    damage: spellDamage(player, 11),
    knockbackModifier: 0.25
  });
  setSlotCooldown(player, "LMB", def.cooldownMs);
  clearActiveAbility(player);
}

function tickSiphonBeam(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput, dt: number) {
  const def = PLAYER_ABILITY_DEFS["staff-siphon-beam"];
  if (input.action !== "lmb" && player.activeMs > 80) {
    clearActiveAbility(player);
    return;
  }
  const direction = directionFromAim(player, input);
  player.abilityVectorX = direction.x;
  player.abilityVectorY = direction.y;
  player.action = "lmb";
  player.abilityTickMs = u16Ms(player.abilityTickMs + Math.max(0, Math.floor(dt * 1000)));
  while (player.abilityTickMs >= 300) {
    player.abilityTickMs -= 300;
    spawnBowLine(state, player, player.abilityVectorX, player.abilityVectorY, 350, 10, "siphon", 260);
    const hit = firstLineHit(state, player, player.abilityVectorX, player.abilityVectorY, 350, 10);
    if (hit && damageNpc(state, kernel, player, hit.target, spellDamage(player, 4), { knockbackModifier: 0.05, energyGain: def.energyGain })) healPlayer(player, 3);
  }
  if (player.activeMs >= player.activeDurationMs) clearActiveAbility(player);
}

function finishMeteor(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["staff-meteor"];
  const aim = clampedAim(player, input, 500);
  player.action = "rmb";
  spawnPlayerTimedHazard(state, player, "meteor", aim.x, aim.y, 140, spellDamage(player, 32), 120, "meteor", 1000, 0);
  spawnPlayerTimedHazard(state, player, "meteor-burn", aim.x, aim.y, 140, 4, 2000, "meteor-burn", 1000, 0);
  spawnPlayerEffectHazard(state, player, "aoe", aim.x, aim.y, aim.x, aim.y, 140, "meteor", 1200);
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishHealingPulse(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["staff-healing-pulse"];
  const aim = clampedAim(player, input, 400);
  player.action = "rmb";
  healPlayersNear(state, player, aim.x, aim.y, 160, 28);
  spawnPlayerEffectHazard(state, player, "aoe", aim.x, aim.y, aim.x, aim.y, 160, "heal", 620);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishFrostChain(state: MmoSkillDemoState, _kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["staff-frost-chain"];
  const aim = { x: player.x + player.abilityVectorX * PLAYER_PROJECTILE_DEFS.frost.maxRange, y: player.y + player.abilityVectorY * PLAYER_PROJECTILE_DEFS.frost.maxRange };
  const target = nearestHostileNearPoint(state, player, aim.x, aim.y, 120) ?? firstLineHit(state, player, player.abilityVectorX, player.abilityVectorY, 400, 8)?.target;
  player.action = "rmb";
  spawnPlayerProjectile(state, player, "frost", {
    dx: player.abilityVectorX,
    dy: player.abilityVectorY,
    width: 8,
    damage: spellDamage(player, 14),
    knockbackModifier: 0.15,
    targetId: target?.id
  });
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishAstralWalk(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["staff-astral-walk"];
  const startX = player.x;
  const startY = player.y;
  const aim = aimPoint(player, input);
  teleportPlayerByVector(kernel, player, aim.x - player.x, aim.y - player.y, 450);
  player.action = "space";
  player.iframeMs = Math.max(player.iframeMs, 220);
  spawnPlayerTimedHazard(state, player, "astral-decoy", startX, startY, 120, spellDamage(player, 15), 120, "arcane", 1000, 0);
  spawnPlayerEffectHazard(state, player, "line", startX, startY, player.x, player.y, 8, "phase", 520);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "Space", def.cooldownMs);
  clearActiveAbility(player);
}

function tickZephyr(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, dt: number) {
  if (player.activeMs % 140 < Math.max(16, Math.floor(dt * 1000))) {
    spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 100, "zephyr", 220);
  }
  for (const target of hostileNpcs(state, player)) {
    if (Math.hypot(target.x - player.x, target.y - player.y) > 100 + bodyRadius(target)) continue;
    applyKnockback(target, player, 0.28, 2, false);
    updateKnockback(kernel, target, dt);
  }
  if (player.activeMs >= player.activeDurationMs) clearActiveAbility(player);
}

function finishIceWall(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["staff-ice-wall"];
  const aim = clampedAim(player, input, 450);
  const angle = Math.atan2(aim.y - player.y, aim.x - player.x) + Math.PI / 2;
  const half = 125;
  const x1 = aim.x + Math.cos(angle) * half;
  const y1 = aim.y + Math.sin(angle) * half;
  const x2 = aim.x - Math.cos(angle) * half;
  const y2 = aim.y - Math.sin(angle) * half;
  spawnPlayerTimedHazard(state, player, "icewall", x1, y1, 30, 0, 4000, "icewall", 0, 0, x2, y2, "line");
  spawnPlayerEffectHazard(state, player, "line", x1, y1, x2, y2, 30, "icewall", 4000);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "Q", def.cooldownMs);
  clearActiveAbility(player);
}

function tickArcaneBubble(state: MmoSkillDemoState, player: PlayerEntity, dt: number) {
  if (player.activeMs < abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-arcane-bubble"].castMs)) return;
  if (player.activeMs % 180 < Math.max(16, Math.floor(dt * 1000))) {
    spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 220, "bubble", 260);
  }
  if (player.activeMs >= player.activeDurationMs) clearActiveAbility(player);
}

function finishPetrify(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["staff-petrify"];
  player.action = "q";
  spawnPummelShockwave(state, player, 250, (60 * Math.PI) / 180, 520, "petrify");
  const hits = damageNpcsInCone(state, kernel, player, 250, (60 * Math.PI) / 180, spellDamage(player, 8), { knockbackModifier: 0.35, energyGain: def.energyGain });
  for (const target of hostileNpcs(state, player)) if (targetInFrontCone(player, target, 250, (60 * Math.PI) / 180)) target.stunMs = Math.max(target.stunMs, 1500);
  if (hits === 0) addEnergy(player, Math.floor(def.energyGain / 2));
  setSlotCooldown(player, "Q", def.cooldownMs);
  clearActiveAbility(player);
}

function finishGravityWell(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["staff-gravity-well"];
  const aim = clampedAim(player, input, 500);
  spawnPlayerTimedHazard(state, player, "gravity", aim.x, aim.y, 200, spellDamage(player, 4), 3000, "gravity", 0, 0);
  spawnPlayerEffectHazard(state, player, "aoe", aim.x, aim.y, aim.x, aim.y, 200, "gravity", 760);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "E", def.cooldownMs);
  clearActiveAbility(player);
}

function finishConsecration(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["staff-consecration"];
  const aim = clampedAim(player, input, 400);
  spawnPlayerTimedHazard(state, player, "consecrate", aim.x, aim.y, 220, spellDamage(player, 6), 4000, "consecrate", 0, 0);
  spawnPlayerEffectHazard(state, player, "aoe", aim.x, aim.y, aim.x, aim.y, 220, "consecrate", 760);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "E", def.cooldownMs);
  clearActiveAbility(player);
}

function finishDispelNova(state: MmoSkillDemoState, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["staff-dispel-nova"];
  player.action = "e";
  for (const ally of entitiesOfType(state, "player")) {
    if (ally.zoneId !== player.zoneId || Math.hypot(ally.x - player.x, ally.y - player.y) > 300) continue;
    ally.stunMs = 0;
    ally.slowMs = 0;
    ally.damageAmpMs = 0;
    removePlayerCombatFlag(ally, "stealth");
  }
  for (const target of hostileNpcs(state, player)) {
    if (Math.hypot(target.x - player.x, target.y - player.y) > 300 + bodyRadius(target)) continue;
    target.damageAmpMs = 0;
    removeCombatFlag(target, "bow-vulnerable");
    removeCombatFlag(target, "soulbound");
    removeCombatFlag(target, "enfeebled");
    setNpcFlagStacks(target, "hex", 0);
  }
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 300, "dispel", 620);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "E", def.cooldownMs);
  clearActiveAbility(player);
}

function tickMaelstrom(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput, dt: number) {
  const def = PLAYER_ABILITY_DEFS["staff-maelstrom"];
  const castMs = abilityCastMs(player, def.castMs);
  if (player.activeMs < castMs) {
    player.castMs = Math.max(player.castMs, Math.floor(castMs - player.activeMs));
    return;
  }
  player.abilityTickMs = u16Ms(player.abilityTickMs + Math.max(0, Math.floor(dt * 1000)));
  while (player.abilityTickMs >= 400) {
    player.abilityTickMs -= 400;
    const aim = clampedAim(player, input, 500);
    spawnPlayerEffectHazard(state, player, "aoe", aim.x, aim.y, aim.x, aim.y, 260, "maelstrom", 360);
    damageNpcsInRadius(state, kernel, player, aim.x, aim.y, 260, spellDamage(player, 13), { knockbackModifier: -0.12, ultimate: true });
  }
  if (player.activeMs >= player.activeDurationMs) clearActiveAbility(player);
}

function tickTranquility(state: MmoSkillDemoState, player: PlayerEntity, dt: number) {
  const def = PLAYER_ABILITY_DEFS["staff-tranquility"];
  const castMs = abilityCastMs(player, def.castMs);
  if (player.activeMs < castMs) {
    player.castMs = Math.max(player.castMs, Math.floor(castMs - player.activeMs));
    return;
  }
  player.abilityTickMs = u16Ms(player.abilityTickMs + Math.max(0, Math.floor(dt * 1000)));
  while (player.abilityTickMs >= 400) {
    player.abilityTickMs -= 400;
    healPlayersNear(state, player, player.x, player.y, 350, 15);
    spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 350, "tranquil", 340);
  }
  if (player.activeMs >= player.activeDurationMs) clearActiveAbility(player);
}

function fireMagicMissile(state: MmoSkillDemoState, _kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["wand-magic-missile"];
  const aim = clampedAim(player, input, PLAYER_PROJECTILE_DEFS.missile.maxRange);
  const target = nearestHostileNearPoint(state, player, aim.x, aim.y, 120) ?? firstLineHit(state, player, player.abilityVectorX, player.abilityVectorY, PLAYER_PROJECTILE_DEFS.missile.maxRange, 5)?.target;
  player.action = "lmb";
  spawnPlayerProjectile(state, player, "missile", {
    dx: player.abilityVectorX,
    dy: player.abilityVectorY,
    width: 5,
    damage: Math.max(1, Math.round(spellDamage(player, 6) * 1.1)),
    knockbackModifier: 0.18,
    targetId: target?.id
  });
  setSlotCooldown(player, "LMB", def.cooldownMs);
  clearActiveAbility(player);
}

function fireHex(state: MmoSkillDemoState, _kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["wand-hex"];
  player.action = "lmb";
  spawnPlayerProjectile(state, player, "hex", {
    dx: player.abilityVectorX,
    dy: player.abilityVectorY,
    width: 11,
    damage: spellDamage(player, 3),
    knockbackModifier: 0.05
  });
  setSlotCooldown(player, "LMB", def.cooldownMs);
  clearActiveAbility(player);
}

function fireMendingSpark(state: MmoSkillDemoState, _kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["wand-mending-spark"];
  const aim = { x: player.x + player.abilityVectorX * PLAYER_PROJECTILE_DEFS.mend.maxRange, y: player.y + player.abilityVectorY * PLAYER_PROJECTILE_DEFS.mend.maxRange };
  const hit = nearestHostileNearPoint(state, player, aim.x, aim.y, 120) ?? firstLineHit(state, player, player.abilityVectorX, player.abilityVectorY, PLAYER_PROJECTILE_DEFS.mend.maxRange, 16)?.target;
  player.action = "lmb";
  spawnPlayerProjectile(state, player, "mend", {
    dx: player.abilityVectorX,
    dy: player.abilityVectorY,
    width: 16,
    damage: spellDamage(player, 5),
    knockbackModifier: 0.08,
    targetId: hit?.id
  });
  setSlotCooldown(player, "LMB", def.cooldownMs);
  clearActiveAbility(player);
}

function fireFocusedRay(state: MmoSkillDemoState, _kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["wand-focused-ray"];
  player.action = "rmb";
  spawnPlayerProjectile(state, player, "focused-ray", {
    dx: player.abilityVectorX,
    dy: player.abilityVectorY,
    width: 12,
    damage: spellDamage(player, 26),
    knockbackModifier: 0.5
  });
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishSoulBind(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["wand-soul-bind"];
  const aim = clampedAim(player, input, 500);
  const first = nearestHostileNearPoint(state, player, aim.x, aim.y, 120);
  if (first) {
    const second = nearestHostileNearPoint(state, player, first.x, first.y, 260, new Set([first.id]));
    if (second) {
      addCombatFlag(first, "soulbound");
      addCombatFlag(second, "soulbound");
      first.damageAmpMs = Math.max(first.damageAmpMs, 4000);
      second.damageAmpMs = Math.max(second.damageAmpMs, 4000);
      spawnPlayerEffectHazard(state, player, "line", first.x, first.y, second.x, second.y, 10, "soulbind", 4000);
    }
  }
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishFlashHeal(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["wand-flash-heal"];
  const ally = alliedPlayerNearAim(state, player, input, 450);
  healPlayer(ally, 22);
  ally.berserkMs = Math.max(ally.berserkMs, 1000);
  spawnPlayerEffectHazard(state, player, "line", player.x, player.y, ally.x, ally.y, 8, "heal", 420);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishBlink(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["wand-blink"];
  const startX = player.x;
  const startY = player.y;
  const aim = aimPoint(player, input);
  teleportPlayerByVector(kernel, player, aim.x - player.x, aim.y - player.y, 350);
  spawnPlayerEffectHazard(state, player, "line", startX, startY, player.x, player.y, 5, "phase", 420);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "Space", def.cooldownMs);
  clearActiveAbility(player);
}

function tickPhaseShift(state: MmoSkillDemoState, player: PlayerEntity, dt: number) {
  player.iframeMs = Math.max(player.iframeMs, Math.max(0, player.activeDurationMs - player.activeMs));
  addPlayerCombatFlag(player, "stealth");
  player.damageAmpMs = Math.max(player.damageAmpMs, Math.max(0, player.activeDurationMs - player.activeMs));
  if (player.activeMs % 180 < Math.max(16, Math.floor(dt * 1000))) spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 54, "phase", 240);
  if (player.activeMs >= player.activeDurationMs) {
    removePlayerCombatFlag(player, "stealth");
    clearActiveAbility(player);
  }
}

function finishRewind(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["wand-rewind"];
  const startX = player.x;
  const startY = player.y;
  applyRewind(kernel, player);
  spawnPlayerEffectHazard(state, player, "line", startX, startY, player.x, player.y, 8, "rewind", 620);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "Space", def.cooldownMs);
  clearActiveAbility(player);
}

function tickMirrorShield(state: MmoSkillDemoState, player: PlayerEntity, dt: number) {
  if (player.activeMs % 180 < Math.max(16, Math.floor(dt * 1000))) spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 64, "mirror", 260);
  if (player.activeMs >= player.activeDurationMs) clearActiveAbility(player);
}

function finishNightmare(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["wand-nightmare"];
  player.action = "q";
  spawnPummelShockwave(state, player, 300, (45 * Math.PI) / 180, 520, "nightmare");
  for (const target of hostileNpcs(state, player)) {
    if (!targetInFrontCone(player, target, 300, (45 * Math.PI) / 180)) continue;
    damageNpc(state, kernel, player, target, spellDamage(player, 4), { knockbackModifier: 1.2, energyGain: def.energyGain });
    target.slowMs = Math.max(target.slowMs ?? 0, 1500);
    target.attackCooldownMs = extendU16Ms(target.attackCooldownMs, 500);
    applyKnockback(target, player, 1.4, 8, false);
  }
  setSlotCooldown(player, "Q", def.cooldownMs);
  clearActiveAbility(player);
}

function finishRupture(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["wand-rupture"];
  const aim = clampedAim(player, input, 450);
  player.action = "e";
  spawnPlayerEffectHazard(state, player, "aoe", aim.x, aim.y, aim.x, aim.y, 80, "rupture", 520);
  for (const target of hostileNpcs(state, player)) {
    if (Math.hypot(target.x - aim.x, target.y - aim.y) > 80 + bodyRadius(target)) continue;
    const stacks = npcFlagStacks(target, "hex");
    damageNpc(state, kernel, player, target, spellDamage(player, 12 + stacks * 7), { knockbackModifier: 0.4, energyGain: def.energyGain });
    setNpcFlagStacks(target, "hex", 0);
    if (stacks > 0) target.damageAmpMs = 0;
  }
  setSlotCooldown(player, "E", def.cooldownMs);
  clearActiveAbility(player);
}

function finishEnfeeble(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["wand-enfeeble"];
  const ratio = clamp(player.chargeMs / 1000, 0, 1);
  const radius = 90 + 90 * ratio;
  const aim = clampedAim(player, input, 400);
  for (const target of hostileNpcs(state, player)) {
    if (Math.hypot(target.x - aim.x, target.y - aim.y) > radius + bodyRadius(target)) continue;
    addCombatFlag(target, "enfeebled");
    target.slowMs = Math.max(target.slowMs ?? 0, 3000);
  }
  spawnPlayerTimedHazard(state, player, "enfeeble", aim.x, aim.y, radius, 0, 3000, "enfeeble", 0, 0);
  spawnPlayerEffectHazard(state, player, "aoe", aim.x, aim.y, aim.x, aim.y, radius, "enfeeble", 760);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "E", def.cooldownMs);
  clearActiveAbility(player);
}

function tickChaosVolley(state: MmoSkillDemoState, _kernel: CollisionKernel, player: PlayerEntity, dt: number) {
  const def = PLAYER_ABILITY_DEFS["wand-chaos-volley"];
  const castMs = abilityCastMs(player, def.castMs);
  if (player.activeMs < castMs) {
    player.castMs = Math.max(player.castMs, Math.floor(castMs - player.activeMs));
    return;
  }
  player.abilityTickMs = u16Ms(player.abilityTickMs + Math.max(0, Math.floor(dt * 1000)));
  while (player.abilityTickMs >= 125 && playerFlagStacks(player, "chaos") < 24) {
    player.abilityTickMs -= 125;
    const index = playerFlagStacks(player, "chaos");
    setPlayerFlagStacks(player, "chaos", index + 1);
    const candidates = hostileNpcs(state, player).filter((target) => targetInFrontCone(player, target, 500, (60 * Math.PI) / 180));
    const target = candidates.length ? candidates[stableHash(`${player.id}:${player.activeMs}:${index}`) % candidates.length] : undefined;
    if (!target) continue;
    spawnPlayerProjectile(state, player, "chaos", {
      dx: player.abilityVectorX,
      dy: player.abilityVectorY,
      width: 6,
      damage: spellDamage(player, 6),
      knockbackModifier: 0.05,
      targetId: target.id
    });
  }
  if (player.activeMs >= player.activeDurationMs || playerFlagStacks(player, "chaos") >= 24) clearActiveAbility(player);
}

function finishApotheosis(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const ally = alliedPlayerNearAim(state, player, input, 450);
  addPlayerCombatFlag(ally, "apotheosis");
  ally.damageAmpMs = Math.max(ally.damageAmpMs, 5000);
  ally.berserkMs = Math.max(ally.berserkMs, 1800);
  spawnPlayerEffectHazard(state, player, "line", player.x, player.y, ally.x, ally.y, 9, "apotheosis", 620);
  setSlotCooldown(player, "R", PLAYER_ABILITY_DEFS["wand-apotheosis"].cooldownMs);
  clearActiveAbility(player);
}

export {
  finishApotheosis,
  finishAstralWalk,
  finishBlink,
  finishConsecration,
  finishDispelNova,
  finishEnfeeble,
  finishFlashHeal,
  finishFrostChain,
  finishGravityWell,
  finishHealingPulse,
  finishIceWall,
  finishMeteor,
  finishNightmare,
  finishPetrify,
  finishRewind,
  finishRupture,
  finishSoulBind,
  fireArcaneBolt,
  fireFocusedRay,
  fireHex,
  fireMagicMissile,
  fireMendingSpark,
  tickArcaneBubble,
  tickChaosVolley,
  tickMaelstrom,
  tickMirrorShield,
  tickPhaseShift,
  tickSiphonBeam,
  tickTranquility,
  tickZephyr
};
