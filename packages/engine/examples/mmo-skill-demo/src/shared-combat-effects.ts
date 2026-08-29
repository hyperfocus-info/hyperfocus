import { spawnTransientEffect } from "@hyperfocus/engine/server";
import { HAZARD_SIZE } from "./data/entity-sizes.ts";
import type { MmoSkillDemoState, NpcEntity, PlayerEntity } from "./shared-contracts.ts";
import { entitiesOfType } from "./shared-entity-registry.ts";
import { PLAYER_RADIUS } from "./shared-world-catalog.ts";

export function spawnCombatTextHazard(state: MmoSkillDemoState, target: NpcEntity, effectKind: "immune" | "dodge" | "damage", text?: string) {
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

export function healPlayer(player: PlayerEntity, amount: number) {
  player.hp = Math.min(player.maxHp, player.hp + Math.max(0, Math.floor(amount)));
}

export function healPlayersNear(state: MmoSkillDemoState, source: PlayerEntity, x: number, y: number, radius: number, amount: number) {
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
