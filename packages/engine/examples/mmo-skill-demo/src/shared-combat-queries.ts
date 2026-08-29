import { findNearestMmoEntity } from "@hyperfocus/engine/mmo";
import type { MmoSkillDemoState, NpcEntity, PlayerEntity } from "./shared-contracts.ts";
import { entitiesOfType } from "./shared-entity-registry.ts";

export function findNearest<T extends { id: string; x: number; y: number }>(
  source: { x: number; y: number },
  entities: Iterable<T>,
  predicate: (entity: T) => boolean,
  maxDistance: number
) {
  return findNearestMmoEntity(source, entities, { maxDistance, includeRadius: false, filter: predicate });
}

export function nearestNpc(player: PlayerEntity, state: MmoSkillDemoState, role?: string, maxDistance = 72) {
  return findNearest(
    player,
    entitiesOfType(state, "npc"),
    (npc) => npc.hp > 0 && npc.zoneId === player.zoneId && (!role || npc.role === role),
    maxDistance
  );
}

export function canReachNpc(player: PlayerEntity, npc: NpcEntity, maxDistance = 96) {
  return npc.hp > 0 && Math.hypot(npc.x - player.x, npc.y - player.y) <= maxDistance;
}
