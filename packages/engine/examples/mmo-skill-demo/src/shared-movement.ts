import { type CollisionKernel } from "@hyperfocus/engine";
import { moveMmoCircle } from "@hyperfocus/engine/mmo";
import { PLAYER_ABILITY_DEFS } from "./shared-ability-catalog.ts";
import { updateActiveAbility } from "./shared-active-ability.ts";
import { clearActiveAbility, endRushAbility, tickPlayerStatusEffects } from "./shared-combat-player.ts";
import { aimPoint, berserkFactor, decayPlayerMomentum, factionMovementHaste, hasPlayerCombatFlag, hasTimedPlayerFlag, removePlayerCombatFlag, teleportPlayer, timedPlayerHasteFactor, updateEscort, updatePlayerMomentum } from "./shared-combat-state.ts";
import { type MmoSkillDemoState, type PlayerEntity, type RuntimeInput } from "./shared-contracts.ts";
import { entitiesOfType } from "./shared-entity-registry.ts";
import { abilityDefForSlot, ensurePlayerCombatLoadout, isSlotReady } from "./shared-loadout.ts";
import { hasAbility, hasGear } from "./shared-progression.ts";
import { TRAVEL_ROUTES, readyForVoidRoute, teleportToRoute } from "./shared-quests.ts";
import { clamp, normalizeWorldCoord, u16Ms, zoneForPoint } from "./shared-replication-projection.ts";
import { PLAYER_RADIUS } from "./shared-world-catalog.ts";
import { canOccupy, decayCombatTimers, updateKnockback } from "./shared-world-physics.ts";
import { mmoSkillDemoMap } from "./shared-world-runtime.ts";

function applyMovement(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput, dt: number) {
  ensurePlayerCombatLoadout(player);
  player.aimX = normalizeWorldCoord(input.aimX, player.aimX || player.x, mmoSkillDemoMap.pixelWidth);
  player.aimY = normalizeWorldCoord(input.aimY, player.aimY || player.y, mmoSkillDemoMap.pixelHeight);
  const ms = Math.max(0, Math.floor(dt * 1000));
  player.guardMs = u16Ms(player.guardMs - ms);
  player.berserkMs = u16Ms(player.berserkMs - ms);
  player.slowMs = u16Ms((player.slowMs ?? 0) - ms);
  decayCombatTimers(player, dt);
  tickPlayerStatusEffects(player, ms);
  if (hasTimedPlayerFlag(player, "juggernaut")) player.slowMs = 0;
  if (player.damageAmpMs <= 0) {
    for (const flag of ["stealth", "apotheosis", "swift", "bloodlust", "vanish", "ironwill", "juggernaut", "trance"]) removePlayerCombatFlag(player, flag);
  }
  if (updateKnockback(kernel, player, dt) || player.stunMs > 0) {
    decayPlayerMomentum(player, dt);
    if (player.stunMs > 0) {
      if (player.activeAbility === "space-rush") endRushAbility(player);
      else clearActiveAbility(player);
      player.castMs = 0;
    }
    if (state.roomKind === "dungeon-instance") player.zoneId = "dungeon";
    else if (state.roomKind === "cottage-instance") player.zoneId = "cottage";
    else player.zoneId = zoneForPoint(player.x, player.y);
    state.players[player.id] = player;
    return;
  }
  if (player.hp > 0 && updateEscort(state, kernel, player, dt)) {
    decayPlayerMomentum(player, dt);
    if (state.roomKind === "dungeon-instance") player.zoneId = "dungeon";
    else if (state.roomKind === "cottage-instance") player.zoneId = "cottage";
    else if (!player.escortNpcId) player.zoneId = zoneForPoint(player.x, player.y);
    state.players[player.id] = player;
    return;
  }
  if (updateActiveAbility(state, kernel, player, input, dt)) {
    decayPlayerMomentum(player, dt);
    if (state.roomKind === "dungeon-instance") player.zoneId = "dungeon";
    else if (state.roomKind === "cottage-instance") player.zoneId = "cottage";
    else player.zoneId = zoneForPoint(player.x, player.y);
    state.players[player.id] = player;
    return;
  }
  const aim = aimPoint(player, input);
  const spaceRushInput = input.action === "space" && abilityDefForSlot(player, "Space")?.id === "space-rush";
  const spaceSlotReady = input.action === "space" && isSlotReady(player, "Space");
  const spaceVector = input.action === "space" && !spaceRushInput && spaceSlotReady ? { dx: aim.x - player.x, dy: aim.y - player.y } : undefined;
  const rawDx = spaceVector ? spaceVector.dx : input.dx;
  const rawDy = spaceVector ? spaceVector.dy : input.dy;
  const length = Math.hypot(rawDx, rawDy) || 1;
  const mobility =
    input.action === "space" && !spaceRushInput && spaceSlotReady && hasAbility(player, "space-ghost-walk")
      ? 190
      : input.action === "space" && !spaceRushInput && spaceSlotReady && hasAbility(player, "space-dash")
        ? 165
        : input.action === "space" && !spaceRushInput && spaceSlotReady && hasAbility(player, "space-jump")
          ? 132
          : 0;
  const boots = hasGear(player, "leather-boots") || hasGear(player, "mining-boots") ? 18 : 0;
  const berserk = berserkFactor(player);
  const whirlwindCastMs = player.activeAbility === "mace-whirlwind" ? Math.max(50, player.activeDurationMs - 2750) : PLAYER_ABILITY_DEFS["mace-whirlwind"].castMs;
  const whirlwindChannel = player.activeAbility === "mace-whirlwind" && player.activeMs > whirlwindCastMs
    ? clamp(1 - (player.activeMs - whirlwindCastMs) / 2750, 0, 1) * 1.4
    : 0;
  const mastery = Math.min(14, Math.max(0, player.masteryRank - 1) * 2);
  let tethered = false;
  for (const npc of entitiesOfType(state, "npc")) {
    if (npc.kind === "void-sent-sentinel" && npc.hp > 0 && npc.zoneId === player.zoneId && Math.hypot(npc.x - player.x, npc.y - player.y) < 150) {
      tethered = true;
      break;
    }
  }
  const stealthSpeed = hasPlayerCombatFlag(player, "stealth") ? 0.3 * clamp(player.damageAmpMs / 3000, 0, 1) : 0;
  const zephyrSpeed = player.activeAbility === "staff-zephyr" ? 0.4 : 0;
  const phaseSpeed = player.activeAbility === "wand-phase-shift" ? 0.5 : 0;
  const apotheosisSpeed = hasPlayerCombatFlag(player, "apotheosis") && player.damageAmpMs > 0 ? 0.18 : 0;
  const swiftSpeed = hasTimedPlayerFlag(player, "swift") ? 0.3 : 0;
  const bloodlustSpeed = hasTimedPlayerFlag(player, "bloodlust") ? 0.4 : 0;
  const juggernautSpeed = hasTimedPlayerFlag(player, "juggernaut") ? 0.3 : 0;
  const statusHaste = timedPlayerHasteFactor(player);
  const factionSpeed = factionMovementHaste(player);
  const slowScale = (player.slowMs ?? 0) > 0 && !hasTimedPlayerFlag(player, "juggernaut") ? 0.5 : 1;
  const speed = (118 + Math.min(38, player.combatLevel * 2) + mastery + boots + mobility) * (1 + berserk + whirlwindChannel + stealthSpeed + zephyrSpeed + phaseSpeed + apotheosisSpeed + swiftSpeed + bloodlustSpeed + juggernautSpeed + statusHaste + factionSpeed) * (tethered ? 0.72 : 1) * slowScale;
  const gatheringLocked = Boolean(player.activeGatherNodeId);
  if (gatheringLocked) {
    player.momentumX = 0;
    player.momentumY = 0;
  }
  const moving = !gatheringLocked && Math.hypot(rawDx, rawDy) > 0.05;
  const dirX = moving ? rawDx / length : 0;
  const dirY = moving ? rawDy / length : 0;
  if (moving) updatePlayerMomentum(player, dirX, dirY, speed, dt);
  else if (!gatheringLocked) decayPlayerMomentum(player, dt);
  const dx = (dirX * speed + (player.momentumX ?? 0)) * dt;
  const dy = (dirY * speed + (player.momentumY ?? 0)) * dt;
  const ghostWalk = input.action === "space" && !spaceRushInput && spaceSlotReady && hasAbility(player, "space-ghost-walk");
  if (ghostWalk) {
    player.x = clamp(player.x + dx, PLAYER_RADIUS, mmoSkillDemoMap.pixelWidth - PLAYER_RADIUS);
    player.y = clamp(player.y + dy, PLAYER_RADIUS, mmoSkillDemoMap.pixelHeight - PLAYER_RADIUS);
  } else {
    moveMmoCircle(
      player,
      dx,
      dy,
      {
        rectBlocked: () => false,
        circleBlocked: (circle) => !canOccupy(kernel, circle.x, circle.y, circle.radius),
        blockedAt: (x, y, radius) => !canOccupy(kernel, x, y, radius)
      },
      { radius: PLAYER_RADIUS }
    );
  }
  if (player.hp <= 0) {
    const homeRoute = player.homeZoneId === "crags"
      ? TRAVEL_ROUTES.ironcrag
      : player.homeZoneId === "ashwood"
        ? TRAVEL_ROUTES.oakhaven
        : player.homeZoneId === "ashwood-wilderness"
          ? TRAVEL_ROUTES["ashwood-wilderness"]
          : player.homeZoneId === "holy-reach"
            ? TRAVEL_ROUTES["holy-reach"]
            : player.homeZoneId === "canaan-desert" || player.homeZoneId === "bazaar"
              ? TRAVEL_ROUTES["canaan-desert"]
              : player.homeZoneId === "void-rift"
                ? TRAVEL_ROUTES["void-rift"]
                : player.homeZoneId === "whisperwind-ascent"
                  ? TRAVEL_ROUTES["whisperwind-ascent"]
                  : undefined;
    if (player.homeZoneId === "cottage") teleportPlayer(player, 32, 18, "cottage");
    else if (homeRoute && (!homeRoute.requiresVoidReady || readyForVoidRoute(player))) teleportToRoute(player, homeRoute);
    else teleportToRoute(player, TRAVEL_ROUTES["port-marrow"]);
    player.hp = player.maxHp;
    player.mana = player.maxMana;
  }
  if (state.roomKind === "dungeon-instance") player.zoneId = "dungeon";
  else if (state.roomKind === "cottage-instance") player.zoneId = "cottage";
  else player.zoneId = zoneForPoint(player.x, player.y);
  state.players[player.id] = player;
}

export {
  applyMovement
};
