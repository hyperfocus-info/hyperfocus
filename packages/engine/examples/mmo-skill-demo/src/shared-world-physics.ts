import { type CollisionKernel } from "@hyperfocus/engine";
import type { RectLike } from "@hyperfocus/engine";
import { moveMmoCircle } from "@hyperfocus/engine/mmo";
import { NPC_DEFAULT_SIZE, NPC_SIZE_BY_KIND, NPC_SIZE_BY_ROLE, RESOURCE_SIZE_BY_KIND } from "./data/entity-sizes.ts";
import { clearActiveAbility } from "./shared-active-ability-state.ts";
import { type MmoSkillDemoState, type NpcEntity, type PlayerEntity, type ResourceEntity } from "./shared-contracts.ts";
import { entitiesOfType } from "./shared-entity-registry.ts";
import { u16Ms } from "./shared-replication-projection.ts";
import { PLAYER_RADIUS } from "./shared-world-catalog.ts";
import { mmoSkillDemoMap, mmoSkillDemoSolidRectIndex } from "./shared-world-runtime.ts";

function rectAround(entity: { x: number; y: number }, w: number, h: number): RectLike {
  return { x: entity.x - w * 0.5, y: entity.y - h * 0.5, w, h };
}

function canOccupy(kernel: CollisionKernel, x: number, y: number, radius: number = PLAYER_RADIUS) {
  if (x < radius || y < radius || x > mmoSkillDemoMap.pixelWidth - radius || y > mmoSkillDemoMap.pixelHeight - radius) {
    return false;
  }
  return !mmoSkillDemoSolidRectIndex.collidesCircle(x, y, radius, (rect) =>
    kernel.testCircleRectOverlap(x, y, radius, rect.x, rect.y, rect.w, rect.h)
  );
}

function rushEntityRadius(entity: ResourceEntity | NpcEntity) {
  if (entity.entityType === "resource") return (RESOURCE_SIZE_BY_KIND[entity.kind] ?? RESOURCE_SIZE_BY_KIND.ore)!.collisionRadius;
  return bodyRadius(entity);
}

function rushBlockedAt(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, x: number, y: number, radius: number = PLAYER_RADIUS) {
  if (!canOccupy(kernel, x, y, radius)) return true;
  for (const resource of entitiesOfType(state, "resource")) {
    if (resource.zoneId !== player.zoneId || resource.depleted) continue;
    if (Math.hypot(resource.x - x, resource.y - y) < radius + rushEntityRadius(resource)) return true;
  }
  for (const npc of entitiesOfType(state, "npc")) {
    if (npc.zoneId !== player.zoneId || npc.hp <= 0) continue;
    if (Math.hypot(npc.x - x, npc.y - y) < radius + rushEntityRadius(npc)) return true;
  }
  return false;
}

function moveRushSwept(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, dx: number, dy: number) {
  const distance = Math.hypot(dx, dy);
  if (distance <= 0) return { movedX: 0, movedY: 0, blocked: false };
  const startX = player.x;
  const startY = player.y;
  const steps = Math.max(1, Math.ceil(distance / Math.max(4, PLAYER_RADIUS * 0.45)));
  const stepX = dx / steps;
  const stepY = dy / steps;
  let blocked = false;
  for (let i = 0; i < steps; i += 1) {
    const nextX = player.x + stepX;
    const nextY = player.y + stepY;
    if (rushBlockedAt(state, kernel, player, nextX, nextY, PLAYER_RADIUS)) {
      blocked = true;
      break;
    }
    player.x = nextX;
    player.y = nextY;
  }
  return { movedX: player.x - startX, movedY: player.y - startY, blocked };
}

type KnockbackBody = Pick<
  PlayerEntity | NpcEntity,
  "x" | "y" | "knockbackX" | "knockbackY" | "knockbackMs" | "knockbackHeavy" | "stunMs" | "iframeMs" | "castMs" | "damageAmpMs"
>;

function bodyRadius(entity: PlayerEntity | NpcEntity) {
  if (entity.entityType === "player") return PLAYER_RADIUS;
  return (NPC_SIZE_BY_KIND[entity.kind] ?? NPC_SIZE_BY_ROLE[entity.role] ?? (entity.elite ? NPC_SIZE_BY_ROLE.elite : NPC_DEFAULT_SIZE)).radius;
}

function decayCombatTimers(entity: KnockbackBody, dt: number) {
  const ms = Math.max(0, Math.floor(dt * 1000));
  entity.stunMs = u16Ms((entity.stunMs || 0) - ms);
  entity.iframeMs = u16Ms((entity.iframeMs || 0) - ms);
  entity.castMs = u16Ms((entity.castMs || 0) - ms);
  entity.damageAmpMs = u16Ms((entity.damageAmpMs || 0) - ms);
}

function applyKnockback(
  target: PlayerEntity | NpcEntity,
  source: { x: number; y: number },
  modifier: number,
  power: number,
  heavyImpact = false
) {
  if (!modifier) return;
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.hypot(dx, dy) || 1;
  const minForce = modifier >= 0 ? (modifier >= 0.3 ? 18 : modifier * 60) : 0;
  const force = Math.max(minForce, Math.min(190, Math.abs(modifier) * (18 + power * 2.8)));
  const sign = modifier >= 0 ? 1 : -1;
  target.knockbackX += (dx / length) * force * sign;
  target.knockbackY += (dy / length) * force * sign;
  target.knockbackMs = Math.max(target.knockbackMs || 0, heavyImpact ? 240 : 160);
  target.knockbackHeavy = target.knockbackHeavy || heavyImpact;
}

function updateKnockback(kernel: CollisionKernel, entity: PlayerEntity | NpcEntity, dt: number) {
  if ((entity.knockbackMs || 0) <= 0) return false;
  const duration = Math.max(1, entity.knockbackMs);
  const scale = Math.min(1, (dt * 1000) / duration);
  const moveX = entity.knockbackX * scale;
  const moveY = entity.knockbackY * scale;
  const result = moveMmoCircle(
    entity,
    moveX,
    moveY,
    {
      rectBlocked: () => false,
      circleBlocked: (circle) => !canOccupy(kernel, circle.x, circle.y, circle.radius),
      blockedAt: (x, y, radius) => !canOccupy(kernel, x, y, radius)
    },
    { radius: bodyRadius(entity) }
  );
  if ((result.blockedX || result.blockedY) && entity.knockbackHeavy) {
    entity.stunMs = Math.max(entity.stunMs || 0, 1500);
    entity.castMs = 0;
    if (entity.entityType === "player") clearActiveAbility(entity);
    entity.knockbackX = 0;
    entity.knockbackY = 0;
    entity.knockbackMs = 0;
    entity.knockbackHeavy = false;
    return true;
  }
  entity.knockbackX -= moveX;
  entity.knockbackY -= moveY;
  entity.knockbackMs = u16Ms(entity.knockbackMs - Math.max(0, Math.floor(dt * 1000)));
  if (entity.knockbackMs <= 0) {
    entity.knockbackX = 0;
    entity.knockbackY = 0;
    entity.knockbackHeavy = false;
  }
  return true;
}

export {
  applyKnockback,
  bodyRadius,
  canOccupy,
  decayCombatTimers,
  moveRushSwept,
  rectAround,
  rushBlockedAt,
  rushEntityRadius,
  updateKnockback
};

export type {
  KnockbackBody
};
