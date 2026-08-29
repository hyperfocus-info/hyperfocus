import { tileToWorld, type CollisionKernel } from "@hyperfocus/engine";
import { addMmoStatus, findMmoEntityNearAim, findNearestMmoEntity, hasMmoStatus, mmoStatusStacks, moveMmoCircle, pointSegmentDistance as mmoPointSegmentDistance, removeMmoStatus, setMmoStatusStacks, teleportMmoEntityToTile, useMmoConsumable } from "@hyperfocus/engine/mmo";
import { ACTION_COOLDOWN_MS, ACTION_TO_SLOT, MAX_ENERGY, type PlayerDashSpec, STAFF_WEAPON_ID, WAND_WEAPON_ID } from "./shared-ability-catalog.ts";
import { type HazardEntity, type MmoSkillDemoAction, type MmoSkillDemoState, type NpcEntity, type PlayerEntity, type RuntimeInput, type ZoneId } from "./shared-contracts.ts";
import { hasFactionReward } from "./shared-economy.ts";
import { entitiesOfType } from "./shared-entity-registry.ts";
import { abilityDefForSlot, addQuestBit, canonicalItemId, ensurePlayerCombatLoadout, equippedWeaponForPlayer, hasInventoryItem, setSlotCooldown, setUtilityCooldown, spendItem } from "./shared-loadout.ts";
import { hasAbility, hasGear, isPeaceNpc, progressDailyQuest } from "./shared-progression.ts";
import { clamp, normalizeWorldCoord, u16Ms, zoneForPoint } from "./shared-replication-projection.ts";
import { PLAYER_RADIUS, TILE } from "./shared-world-catalog.ts";
import { canOccupy } from "./shared-world-physics.ts";
import { ESCORT_REACH_RADIUS, ESCORT_SPEED, NATURE_ALLIANCE_BEAST_KINDS, mmoSkillDemoMap } from "./shared-world-runtime.ts";

function knockbackSourceForHazard(hazard: HazardEntity, owner: NpcEntity | undefined) {
  if (owner) return { ...owner, effectKind: hazard.effectKind };
  return { x: hazard.x, y: hazard.y, effectKind: hazard.effectKind };
}

function attackStyleForAction(action: MmoSkillDemoAction, player?: PlayerEntity) {
  const magicWeapon = player ? equippedWeaponForPlayer(player) === STAFF_WEAPON_ID || equippedWeaponForPlayer(player) === WAND_WEAPON_ID : false;
  if (magicWeapon && (action === "lmb" || action === "attack" || action === "rmb" || action === "space" || action === "q" || action === "e" || action === "r")) return "spell";
  if (action === "q" || action === "e") return "spell";
  if (action === "lmb" || action === "attack" || action === "rmb" || action === "space" || action === "r") return "melee";
  return "";
}

function addCombatFlag(npc: NpcEntity, flag: string) {
  npc.combatFlags = addMmoStatus(npc.combatFlags, flag, { maxLength: 96 });
}

function hasCombatFlag(npc: NpcEntity, flag: string) {
  return hasMmoStatus(npc.combatFlags, flag);
}

function removeCombatFlag(npc: NpcEntity, flag: string) {
  npc.combatFlags = removeMmoStatus(npc.combatFlags, flag, { maxLength: 96 });
}

function combatFlagParts(npc: NpcEntity) {
  return (npc.combatFlags || "").split("|").filter(Boolean);
}

function combatFlagValue(npc: NpcEntity, prefix: string) {
  const needle = `${prefix}:`;
  return combatFlagParts(npc).find((part) => part.startsWith(needle))?.slice(needle.length) ?? "";
}

function npcFlagStacks(npc: NpcEntity, prefix: string) {
  return mmoStatusStacks(npc.combatFlags, prefix);
}

function setNpcFlagStacks(npc: NpcEntity, prefix: string, stacks: number) {
  npc.combatFlags = setMmoStatusStacks(npc.combatFlags, prefix, stacks, { maxLength: 96, maxEntries: 8 });
}

function addTimedNpcFlag(npc: NpcEntity, flag: string, durationMs: number) {
  addCombatFlag(npc, flag);
  npc.damageAmpMs = Math.max(npc.damageAmpMs, durationMs);
}

function applyNpcPoison(npc: NpcEntity, stacks = 1, durationMs = 4000) {
  setNpcFlagStacks(npc, "poison", Math.min(3, npcFlagStacks(npc, "poison") + Math.max(1, Math.floor(stacks))));
  npc.damageAmpMs = Math.max(npc.damageAmpMs, durationMs);
}

function consumeNpcPoison(npc: NpcEntity) {
  const stacks = npcFlagStacks(npc, "poison");
  setNpcFlagStacks(npc, "poison", 0);
  return stacks;
}

function hasPlayerCombatFlag(player: PlayerEntity, flag: string) {
  return hasMmoStatus(player.combatFlags, flag);
}

function addPlayerCombatFlag(player: PlayerEntity, flag: string) {
  player.combatFlags = addMmoStatus(player.combatFlags, flag, { maxLength: 96 });
}

function removePlayerCombatFlag(player: PlayerEntity, flag: string) {
  player.combatFlags = removeMmoStatus(player.combatFlags, flag, { maxLength: 96 });
}

function playerCombatFlagParts(player: PlayerEntity) {
  return (player.combatFlags || "").split("|").filter(Boolean);
}

function playerFlagStacks(player: PlayerEntity, prefix: string) {
  return mmoStatusStacks(player.combatFlags, prefix);
}

function setPlayerFlagStacks(player: PlayerEntity, prefix: string, stacks: number) {
  player.combatFlags = setMmoStatusStacks(player.combatFlags, prefix, stacks, { maxLength: 96, maxEntries: 8 });
}

function hasTimedPlayerFlag(player: PlayerEntity, flag: string) {
  return hasPlayerCombatFlag(player, flag) && player.damageAmpMs > 0;
}

function addTimedPlayerFlag(player: PlayerEntity, flag: string, durationMs: number) {
  addPlayerCombatFlag(player, flag);
  player.damageAmpMs = Math.max(player.damageAmpMs, durationMs);
}

function addPlayerMsFlag(player: PlayerEntity, prefix: string, durationMs: number) {
  setPlayerFlagStacks(player, prefix, Math.max(playerFlagStacks(player, prefix), u16Ms(durationMs)));
}

function tickPlayerMsFlag(player: PlayerEntity, prefix: string, ms: number) {
  const remainingMs = playerFlagStacks(player, prefix);
  if (remainingMs <= 0) return;
  setPlayerFlagStacks(player, prefix, u16Ms(remainingMs - ms));
}

function consumePlayerFlagStack(player: PlayerEntity, prefix: string) {
  const stacks = playerFlagStacks(player, prefix);
  if (stacks <= 0) return false;
  setPlayerFlagStacks(player, prefix, stacks - 1);
  return true;
}

function setCooldown(player: PlayerEntity, action: keyof typeof ACTION_COOLDOWN_MS) {
  const slot = ACTION_TO_SLOT[action];
  const def = slot ? abilityDefForSlot(player, slot) : undefined;
  if (slot && def) setSlotCooldown(player, slot, def.cooldownMs);
  else setUtilityCooldown(player, action);
}

function playerHasTool(player: PlayerEntity, toolId: string) {
  return hasInventoryItem(player, toolId) || hasGear(player, toolId);
}

function spendMana(player: PlayerEntity, cost: number) {
  const effectiveCost = hasFactionReward(player, "high-reach-peaks-clear-mind") ? Math.max(1, Math.floor(cost * 0.9)) : cost;
  if (player.mana >= effectiveCost) {
    player.mana -= effectiveCost;
    return true;
  }
  if (spendItem(player, "cinder-ale")) {
    player.mana = Math.min(player.maxMana, player.mana + 36);
  }
  if (player.mana < effectiveCost) return false;
  player.mana -= effectiveCost;
  return true;
}

function useConsumable(player: PlayerEntity, itemId: string) {
  const id = canonicalItemId(itemId);
  const result = useMmoConsumable(player, player.inventory, id, {
    "glade-berries": {
      canUse: ({ actor }) => actor.hp < actor.maxHp,
      apply: ({ actor }) => {
        actor.hp = Math.min(actor.maxHp, actor.hp + 24);
      }
    },
    "cinder-ale": {
      canUse: ({ actor }) => actor.mana < actor.maxMana,
      apply: ({ actor }) => {
        actor.mana = Math.min(actor.maxMana, actor.mana + 36);
      }
    },
    "speed-potion": {
      canUse: ({ actor }) => actor.berserkMs < 800,
      apply: ({ actor }) => {
        actor.berserkMs = Math.max(actor.berserkMs, 2200);
      }
    }
  });
  return result.ok;
}

function playerDamageBonus(player: PlayerEntity) {
  const heavyStrike = hasFactionReward(player, "ironcrag-heavy-strike") && (player.action === "attack" || player.action === "lmb") ? 5 : 0;
  return Math.floor(player.masteryRank / 2) + (hasInventoryItem(player, "elite-weapon") ? 5 : 0) + heavyStrike;
}

function berserkFactor(player: PlayerEntity) {
  return clamp((player.berserkMs || 0) / 3000, 0, 1);
}

function factionMovementHaste(player: PlayerEntity, zoneId = player.zoneId) {
  let haste = 0;
  if ((zoneId === "ashwood" || zoneId === "ashwood-wilderness") && hasFactionReward(player, "oakhaven-forest-step")) haste += 0.1;
  if (zoneId === "port-marrow" && hasFactionReward(player, "port-marrow-wind-walker")) haste += 0.15;
  if ((zoneId === "crags" || zoneId === "whisperwind-ascent") && hasFactionReward(player, "high-reach-peaks-wind-leap")) haste += 0.08;
  return haste;
}

function shouldNpcIgnorePlayerForFaction(npc: NpcEntity, player: PlayerEntity) {
  return npc.role !== "boss" && NATURE_ALLIANCE_BEAST_KINDS.has(npc.kind) && hasFactionReward(player, "oakhaven-natures-alliance");
}

function isBazaarPressureZone(zoneId: ZoneId) {
  return zoneId === "bazaar" || zoneId === "canaan-desert" || zoneId === "void-rift";
}

function timedPlayerHasteFactor(player: PlayerEntity) {
  const shout = playerFlagStacks(player, "shout-haste") > 0 ? 0.2 : 0;
  const ironWill = clamp(playerFlagStacks(player, "ironwill-haste") / 5000, 0, 1);
  return shout + ironWill;
}

const PLAYER_MOMENTUM_MAX_FACTOR = 1.25;

const PLAYER_MOMENTUM_DAMP_SECONDS = 0.75;

function decayPlayerMomentum(player: PlayerEntity, dt: number) {
  const decay = clamp(dt / PLAYER_MOMENTUM_DAMP_SECONDS, 0, 1);
  player.momentumX = (player.momentumX ?? 0) * (1 - decay);
  player.momentumY = (player.momentumY ?? 0) * (1 - decay);
  if (Math.hypot(player.momentumX, player.momentumY) < 0.01) {
    player.momentumX = 0;
    player.momentumY = 0;
  }
}

function updatePlayerMomentum(player: PlayerEntity, dirX: number, dirY: number, speed: number, dt: number) {
  decayPlayerMomentum(player, dt);
  const maxMomentum = speed * PLAYER_MOMENTUM_MAX_FACTOR;
  const accel = clamp(dt / PLAYER_MOMENTUM_DAMP_SECONDS, 0, 1);
  player.momentumX = (player.momentumX ?? 0) + dirX * maxMomentum * accel;
  player.momentumY = (player.momentumY ?? 0) + dirY * maxMomentum * accel;
  const current = Math.hypot(player.momentumX, player.momentumY);
  if (current > maxMomentum && current > 0) {
    const scale = maxMomentum / current;
    player.momentumX *= scale;
    player.momentumY *= scale;
  }
}

function playerMovementSpeedPerSecond(player: PlayerEntity) {
  const boots = hasGear(player, "leather-boots") || hasGear(player, "mining-boots") ? 18 : 0;
  const mastery = Math.min(14, Math.max(0, player.masteryRank - 1) * 2);
  const stealthSpeed = hasPlayerCombatFlag(player, "stealth") ? 0.3 * clamp(player.damageAmpMs / 3000, 0, 1) : 0;
  const apotheosisSpeed = hasPlayerCombatFlag(player, "apotheosis") && player.damageAmpMs > 0 ? 0.18 : 0;
  const swiftSpeed = hasTimedPlayerFlag(player, "swift") ? 0.3 : 0;
  const bloodlustSpeed = hasTimedPlayerFlag(player, "bloodlust") ? 0.4 : 0;
  const juggernautSpeed = hasTimedPlayerFlag(player, "juggernaut") ? 0.3 : 0;
  const statusHaste = timedPlayerHasteFactor(player);
  const slowScale = (player.slowMs ?? 0) > 0 && !hasTimedPlayerFlag(player, "juggernaut") ? 0.5 : 1;
  return (118 + Math.min(38, player.combatLevel * 2) + mastery + boots) * (1 + berserkFactor(player) + stealthSpeed + apotheosisSpeed + swiftSpeed + bloodlustSpeed + juggernautSpeed + statusHaste + factionMovementHaste(player)) * slowScale;
}

function dashDistanceForPmsps(player: PlayerEntity, spec: PlayerDashSpec) {
  return playerMovementSpeedPerSecond(player) * spec.rangePmsps;
}

function addEnergy(player: PlayerEntity, amount: number) {
  ensurePlayerCombatLoadout(player);
  if (amount <= 0) return;
  player.energy = clamp(player.energy + amount, 0, player.maxEnergy || MAX_ENERGY);
}

function applyLifeSteal(player: PlayerEntity, amount: number) {
  const berserkHeal = Math.floor(amount * 0.25 * berserkFactor(player));
  const legacyHeal = hasAbility(player, "rmb-life-steal") ? amount : 0;
  const apotheosisHeal = hasPlayerCombatFlag(player, "apotheosis") && player.damageAmpMs > 0 ? Math.floor(amount * 0.2) : 0;
  const crimsonHeal = hasFactionReward(player, "port-marrow-crimson-tide") ? Math.floor(amount * 0.05) : 0;
  const heal = Math.max(0, berserkHeal + legacyHeal + apotheosisHeal + crimsonHeal);
  if (heal > 0) player.hp = Math.min(player.maxHp, player.hp + heal);
}

function nearestNpc(player: PlayerEntity, state: MmoSkillDemoState, role?: string, maxDistance = 72) {
  return findNearest(
    player,
    entitiesOfType(state, "npc"),
    (npc) => npc.hp > 0 && npc.zoneId === player.zoneId && (!role || npc.role === role),
    maxDistance
  );
}

function canReachNpc(player: PlayerEntity, npc: NpcEntity, maxDistance = 96) {
  return npc.hp > 0 && Math.hypot(npc.x - player.x, npc.y - player.y) <= maxDistance;
}

function clearEscort(player: PlayerEntity) {
  player.escortNpcId = "";
  player.escortTargetX = 0;
  player.escortTargetY = 0;
  player.escortTargetZoneId = player.zoneId;
  player.escortMs = 0;
}

function startEscort(player: PlayerEntity, npc: NpcEntity, tileX: number, tileY: number, zoneId: ZoneId, durationMs = 9000) {
  const target = tileToWorld(mmoSkillDemoMap, tileX, tileY, "center");
  player.escortNpcId = npc.id;
  player.escortTargetX = target.x;
  player.escortTargetY = target.y;
  player.escortTargetZoneId = zoneId;
  player.escortMs = durationMs;
  player.targetId = npc.id;
}

function updateEscort(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, dt: number) {
  if (!player.escortNpcId) return false;
  const npc = state.npcs[player.escortNpcId];
  if (!npc || npc.hp <= 0 || npc.zoneId !== player.zoneId || player.escortMs <= 0) {
    clearEscort(player);
    return false;
  }
  player.escortMs = u16Ms(player.escortMs - Math.max(0, Math.floor(dt * 1000)));
  const dx = player.escortTargetX - player.x;
  const dy = player.escortTargetY - player.y;
  const distance = Math.hypot(dx, dy);
  player.action = "travel";
  player.targetId = npc.id;
  if (distance <= ESCORT_REACH_RADIUS || player.escortMs <= 0) {
    player.x = player.escortTargetX;
    player.y = player.escortTargetY;
    player.zoneId = player.escortTargetZoneId;
    npc.x = player.x - 24;
    npc.y = player.y;
    if (npc.kind === "runner-kael") addQuestBit(player, "runner-escort");
    if (npc.kind === "navigator-kai") addQuestBit(player, "navigator-escort");
    progressDailyQuest(player, { kind: "escort", amount: 2, npcKind: npc.kind });
    clearEscort(player);
    return true;
  }
  const step = Math.min(distance, ESCORT_SPEED * dt);
  const moveX = (dx / distance) * step;
  const moveY = (dy / distance) * step;
  moveMmoCircle(
    player,
    moveX,
    moveY,
    {
      rectBlocked: () => false,
      circleBlocked: (circle) => !canOccupy(kernel, circle.x, circle.y, circle.radius),
      blockedAt: (x, y, radius) => !canOccupy(kernel, x, y, radius)
    },
    { radius: PLAYER_RADIUS }
  );
  npc.x = player.x - (dx >= 0 ? 22 : -22);
  npc.y = player.y - 2;
  return true;
}

function teleportPlayer(player: PlayerEntity, tileX: number, tileY: number, zoneId = zoneForPoint(tileX * TILE, tileY * TILE)) {
  teleportMmoEntityToTile(player, tileX, tileY, TILE);
  player.zoneId = zoneId;
  clearEscort(player);
}

function findNearest<T extends { id: string; x: number; y: number }>(
  source: { x: number; y: number },
  entities: Iterable<T>,
  predicate: (entity: T) => boolean,
  maxDistance: number
) {
  return findNearestMmoEntity(source, entities, { maxDistance, includeRadius: false, filter: predicate });
}

function pointSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  return mmoPointSegmentDistance({ x: px, y: py }, { x: ax, y: ay }, { x: bx, y: by });
}

function finiteSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0.0001) return { distance: Math.hypot(px - ax, py - ay), along: 0 };
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lengthSq, 0, 1);
  const x = ax + dx * t;
  const y = ay + dy * t;
  return { distance: Math.hypot(px - x, py - y), along: Math.sqrt(lengthSq) * t };
}

function aimPoint(player: PlayerEntity, input: RuntimeInput) {
  return {
    x: normalizeWorldCoord(input.aimX, player.aimX || player.x, mmoSkillDemoMap.pixelWidth),
    y: normalizeWorldCoord(input.aimY, player.aimY || player.y, mmoSkillDemoMap.pixelHeight)
  };
}

function isHostileNpcForPlayer(npc: NpcEntity, player: PlayerEntity) {
  return npc.hp > 0 && npc.zoneId === player.zoneId && !isPeaceNpc(npc) && npc.kind !== "player-decoy";
}

function hostileNpcs(state: MmoSkillDemoState, player: PlayerEntity) {
  return Array.from(entitiesOfType(state, "npc")).filter((npc) => isHostileNpcForPlayer(npc, player));
}

function damagedHostileNear(state: MmoSkillDemoState, source: NpcEntity, maxDistance: number) {
  return findNearest(
    source,
    entitiesOfType(state, "npc"),
    (npc) => npc.id !== source.id && npc.hp > 0 && npc.hp < npc.maxHp && npc.zoneId === source.zoneId && !isPeaceNpc(npc),
    maxDistance
  );
}

function findHostileNearAim(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput, aimRadius: number, playerRange: number) {
  const aim = aimPoint(player, input);
  return findMmoEntityNearAim(player, aim, hostileNpcs(state, player), { maxAimDistance: aimRadius, maxRange: playerRange, includeRadius: false });
}

export {
  PLAYER_MOMENTUM_DAMP_SECONDS,
  PLAYER_MOMENTUM_MAX_FACTOR,
  addCombatFlag,
  addEnergy,
  addPlayerCombatFlag,
  addPlayerMsFlag,
  addTimedNpcFlag,
  addTimedPlayerFlag,
  aimPoint,
  applyLifeSteal,
  applyNpcPoison,
  attackStyleForAction,
  berserkFactor,
  canReachNpc,
  clearEscort,
  combatFlagParts,
  combatFlagValue,
  consumeNpcPoison,
  consumePlayerFlagStack,
  damagedHostileNear,
  dashDistanceForPmsps,
  decayPlayerMomentum,
  factionMovementHaste,
  findHostileNearAim,
  findNearest,
  finiteSegmentDistance,
  hasCombatFlag,
  hasPlayerCombatFlag,
  hasTimedPlayerFlag,
  hostileNpcs,
  isBazaarPressureZone,
  isHostileNpcForPlayer,
  knockbackSourceForHazard,
  nearestNpc,
  npcFlagStacks,
  playerCombatFlagParts,
  playerDamageBonus,
  playerFlagStacks,
  playerHasTool,
  playerMovementSpeedPerSecond,
  pointSegmentDistance,
  removeCombatFlag,
  removePlayerCombatFlag,
  setCooldown,
  setNpcFlagStacks,
  setPlayerFlagStacks,
  shouldNpcIgnorePlayerForFaction,
  spendMana,
  startEscort,
  teleportPlayer,
  tickPlayerMsFlag,
  timedPlayerHasteFactor,
  updateEscort,
  updatePlayerMomentum,
  useConsumable
};
