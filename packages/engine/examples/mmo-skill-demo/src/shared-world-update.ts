import { WORLD_MAP_SCALE } from "./data/world.ts";
import { RESOURCE_SIZE_BY_KIND } from "./data/entity-sizes.ts";
import { isBazaarPressureZone } from "./shared-combat-state.ts";
import { MMO_SKILL_DEMO_ENTITY_BUCKETS, type MmoSkillDemoEntityKind, type MmoSkillDemoState } from "./shared-contracts.ts";
import { MMO_SKILL_DEMO_ACCESSOR_CACHE_ENABLED, entitiesInState, entitiesOfType, removeMmoEntityForReuse, snapshotEntitiesOfType } from "./shared-entity-registry.ts";
import { addQuestBit, ensurePlayerCombatLoadout, hasQuestFlag } from "./shared-loadout.ts";
import { awardXp, ensureDailyQuestState, progressDailyQuest } from "./shared-progression.ts";
import { refreshQuestProgress } from "./shared-quests.ts";
import { u16Ms, u32Ms } from "./shared-replication-projection.ts";
import { type ZoneRuntime, updateLootScratch } from "./shared-runtime-contracts.ts";
import { PLAYER_RADIUS, TILE } from "./shared-world-catalog.ts";
import { bodyRadius } from "./shared-world-physics.ts";

function updateResources(state: MmoSkillDemoState, dt: number) {
  const ms = Math.max(0, Math.floor(dt * 1000));
  for (const resource of entitiesOfType(state, "resource")) {
    if (!resource.depleted) continue;
    resource.respawnMs = u32Ms(resource.respawnMs - ms);
    if (resource.respawnMs === 0) {
      resource.depleted = false;
      resource.hp = resource.maxHp;
    }
  }
}

function isMmoSkillDemoEntityKind(value: string): value is MmoSkillDemoEntityKind {
  return MMO_SKILL_DEMO_ENTITY_BUCKETS.some((entityType) => entityType === value);
}

function updateLoots(state: MmoSkillDemoState, dt: number) {
  const ms = Math.max(0, Math.floor(dt * 1000));
  for (const loot of snapshotEntitiesOfType(state, "loot", updateLootScratch)) {
    if (state.entities[loot.id] !== loot) continue;
    loot.expiresMs = u16Ms(loot.expiresMs - ms);
    if (loot.expiresMs <= 0) removeMmoEntityForReuse(state, loot.id);
  }
}

function updatePlayerProgression(state: MmoSkillDemoState, dt: number) {
  const ms = Math.max(0, Math.floor(dt * 1000));
  for (const player of entitiesOfType(state, "player")) {
    ensurePlayerCombatLoadout(player);
    ensureDailyQuestState(player);
    player.mana = Math.min(player.maxMana, player.mana + Math.ceil(dt * 3));
    player.contractCooldownMs = u16Ms(player.contractCooldownMs - ms);
    if (player.hp > 0 && player.hp < player.maxHp && state.tick % 20 === 0) player.hp = Math.min(player.maxHp, player.hp + 1 + Math.floor(player.combatLevel / 18));
    if (isBazaarPressureZone(player.zoneId) && player.hp > 0) player.bazaarSurvivalMs += Math.floor(dt * 1000);
    if (isBazaarPressureZone(player.zoneId) && player.activeQuestId === "ghostly-trade" && player.bazaarSurvivalMs > 45000) {
      addQuestBit(player, "ghostly-trade");
      player.gold += 35;
      awardXp(player, "combat", 30);
    }
    if (player.zoneId === "crags" && player.x < 9 * WORLD_MAP_SCALE * TILE && player.y > 24 * WORLD_MAP_SCALE * TILE) {
      addQuestBit(player, "hidden-vein");
      player.gold += hasQuestFlag(player, "hidden-vein-paid") ? 0 : 30;
      addQuestBit(player, "hidden-vein-paid");
    }
    if (state.tick % 20 === 0) progressDailyQuest(player, { kind: "zone", amount: 1 });
    refreshQuestProgress(player);
  }
}

function upsertInterestEntities(runtime: ZoneRuntime, state: MmoSkillDemoState) {
  const nextIds = runtime.nextInterestIds;
  const nextLogicIds = runtime.nextLogicIds;
  const scratch = runtime.interestScratch;
  nextIds.clear();
  nextLogicIds.clear();
  const upsert = (id: string, type: string, x: number, y: number, radius: number, priority: number) => {
    nextIds.add(id);
    nextLogicIds.add(id);
    const previous = runtime.interestCache.get(id);
    if (previous && previous.type === type && previous.x === x && previous.y === y && previous.radius === radius && previous.priority === priority && previous.global === undefined) return;
    scratch.id = id;
    scratch.type = type;
    scratch.x = x;
    scratch.y = y;
    scratch.radius = radius;
    scratch.priority = priority;
    scratch.global = undefined;
    runtime.grid.upsert(scratch);
    if (!isMmoSkillDemoEntityKind(type)) throw new Error(`Unknown MMO entity type: ${type}`);
    runtime.logicHash.upsert({ id, type, x, y, radius });
    runtime.interestCache.set(id, { id, type, x, y, radius, priority });
  };
  for (const entity of entitiesInState(state)) {
    if (entity.entityType === "player") {
      if (!MMO_SKILL_DEMO_ACCESSOR_CACHE_ENABLED) {
        upsert(entity.id, "player", entity.x, entity.y, PLAYER_RADIUS, 100);
        continue;
      }
      const x = entity.x;
      const y = entity.y;
      upsert(entity.id, "player", x, y, PLAYER_RADIUS, 100);
    } else if (entity.entityType === "npc") {
      if (!MMO_SKILL_DEMO_ACCESSOR_CACHE_ENABLED) {
        upsert(entity.id, "npc", entity.x, entity.y, bodyRadius(entity), entity.hp > 0 ? 50 : 10);
        continue;
      }
      const x = entity.x;
      const y = entity.y;
      const hp = entity.hp;
      upsert(entity.id, "npc", x, y, bodyRadius(entity), hp > 0 ? 50 : 10);
    } else if (entity.entityType === "resource") {
      if (!MMO_SKILL_DEMO_ACCESSOR_CACHE_ENABLED) {
        upsert(entity.id, "resource", entity.x, entity.y, (RESOURCE_SIZE_BY_KIND[entity.kind] ?? RESOURCE_SIZE_BY_KIND.ore)!.interestRadius, entity.depleted ? 5 : 25);
        continue;
      }
      const x = entity.x;
      const y = entity.y;
      upsert(entity.id, "resource", x, y, (RESOURCE_SIZE_BY_KIND[entity.kind] ?? RESOURCE_SIZE_BY_KIND.ore)!.interestRadius, entity.depleted ? 5 : 25);
    } else if (entity.entityType === "loot") {
      if (!MMO_SKILL_DEMO_ACCESSOR_CACHE_ENABLED) {
        upsert(entity.id, "loot", entity.x, entity.y, entity.pickupRadius, 35);
        continue;
      }
      const x = entity.x;
      const y = entity.y;
      upsert(entity.id, "loot", x, y, entity.pickupRadius, 35);
    } else if (entity.entityType === "hazard") {
      if (!MMO_SKILL_DEMO_ACCESSOR_CACHE_ENABLED) {
        const isLine = entity.kind === "line";
        const centerX = isLine ? (entity.x + entity.toX) * 0.5 : entity.x;
        const centerY = isLine ? (entity.y + entity.toY) * 0.5 : entity.y;
        const lineReach = isLine ? Math.hypot(entity.toX - entity.x, entity.toY - entity.y) * 0.5 : 0;
        const priority = entity.damage > 0 || entity.windupMs > 0 ? 45 : entity.effectKind === "cone" ? 30 : 18;
        upsert(entity.id, "hazard", centerX, centerY, Math.max(16, entity.radius + lineReach), priority);
        continue;
      }
      const x = entity.x;
      const y = entity.y;
      const isLine = entity.kind === "line";
      const toX = entity.toX;
      const toY = entity.toY;
      const centerX = isLine ? (x + toX) * 0.5 : x;
      const centerY = isLine ? (y + toY) * 0.5 : y;
      const lineReach = isLine ? Math.hypot(toX - x, toY - y) * 0.5 : 0;
      const priority = entity.damage > 0 || entity.windupMs > 0 ? 45 : entity.effectKind === "cone" ? 30 : 18;
      upsert(entity.id, "hazard", centerX, centerY, Math.max(16, entity.radius + lineReach), priority);
    }
  }
  for (const id of runtime.interestIds) {
    if (!nextIds.has(id)) {
      runtime.grid.remove(id);
      runtime.logicHash.remove(id);
      runtime.interestCache.delete(id);
    }
  }
  for (const id of runtime.logicIds) {
    if (!nextLogicIds.has(id)) runtime.logicHash.remove(id);
  }
  runtime.nextInterestIds = runtime.interestIds;
  runtime.interestIds = nextIds;
  runtime.nextLogicIds = runtime.logicIds;
  runtime.logicIds = nextLogicIds;
}

export {
  updateLoots,
  updatePlayerProgression,
  updateResources,
  upsertInterestEntities
};
