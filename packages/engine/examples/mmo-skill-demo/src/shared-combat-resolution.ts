import type { CollisionKernel } from "@hyperfocus/engine";
import { createMmoCombatModule, hasMmoStatusBit, mmoStatusBitmask } from "@hyperfocus/engine/mmo";
import { healPlayer, spawnCombatTextHazard } from "./shared-combat-effects.ts";
import {
  hasCombatFlag,
  hasTimedPlayerFlag,
  removePlayerCombatFlag
} from "./shared-combat-flags.ts";
import {
  addEnergy,
  applyLifeSteal,
  attackStyleForAction,
  hostileNpcs
} from "./shared-combat-state.ts";
import type { MmoSkillDemoState, NpcEntity, PlayerEntity } from "./shared-contracts.ts";
import { entitiesOfType } from "./shared-entity-registry.ts";
import { awardXp } from "./shared-progression.ts";
import { handleNpcKill } from "./shared-quests.ts";
import { applyKnockback, updateKnockback } from "./shared-world-physics.ts";
import { isNpcInvulnerable } from "./shared-world-runtime.ts";

export function isNpcDefending(npc: NpcEntity) {
  if (npc.hp <= 0) return false;
  if (isNpcInvulnerable(npc)) return true;
  if (npc.kind === "crystal-beetle") return npc.phaseMs > 1300 && npc.phaseMs < 2900;
  return false;
}

export const GOLEM_POWER_NODE_LINK_RADIUS = 300;
export const GOLEM_OVERDRIVE_PLAYER_RADIUS = 360;
export const GOLEM_OVERDRIVE_RADIAL_COUNT = 6;
export const GOLEM_OVERDRIVE_COOLDOWN_MS = 1350;

export function isPowerNodeForGolem(node: NpcEntity, golem: NpcEntity) {
  return node.kind === "power-node" && node.zoneId === golem.zoneId && (node.summonedBy === golem.id || Math.hypot(node.x - golem.x, node.y - golem.y) <= GOLEM_POWER_NODE_LINK_RADIUS);
}

export function powerNodesForGolem(state: MmoSkillDemoState, golem: NpcEntity) {
  return Array.from(entitiesOfType(state, "npc")).filter((node) => isPowerNodeForGolem(node, golem));
}

export function activePowerNodesForGolem(state: MmoSkillDemoState, golem: NpcEntity) {
  return powerNodesForGolem(state, golem).filter((node) => node.hp > 0);
}

export function canDamageNpc(state: MmoSkillDemoState, player: PlayerEntity, target: NpcEntity) {
  if (target.zoneId !== player.zoneId) return false;
  if (target.kind === "great-ash-lord") {
    for (const npc of entitiesOfType(state, "npc")) {
      if (npc.kind === "spore-pod" && npc.hp > 0) {
        player.targetId = target.id;
        return false;
      }
    }
  }
  if (target.kind === "iron-core-golem" && activePowerNodesForGolem(state, target).length > 0) {
    player.targetId = target.id;
    return false;
  }
  if (target.kind === "iron-core-golem") target.iframeMs = 0;
  if (target.kind === "mirror-king") {
    for (const npc of entitiesOfType(state, "npc")) {
      if (npc.kind === "glass-clone" && npc.hp > 0) {
        player.targetId = target.id;
        return false;
      }
    }
  }
  if (target.kind === "glass-clone") {
    const style = attackStyleForAction(player.action, player);
    const needsSpell = player.lastAttackStyle === "melee";
    const needsMelee = player.lastAttackStyle === "spell";
    if ((needsSpell && style !== "spell") || (needsMelee && style !== "melee")) return false;
  }
  return true;
}

export const NPC_DAMAGE_STATUS_BITS = {
  BOW_VULNERABLE: 1 << 0,
  DEATHMARK: 1 << 1,
  FRACTURED: 1 << 2,
  SOULBOUND: 1 << 3,
  HEX: 1 << 4
} as const;

export const PLAYER_DAMAGE_SOURCE_BITS = {
  BLIND: 1 << 0,
  WEAKENED: 1 << 1,
  ENFEEBLED: 1 << 2
} as const;

export const NPC_DAMAGE_STATUS_MASK = {
  exact: {
    "bow-vulnerable": NPC_DAMAGE_STATUS_BITS.BOW_VULNERABLE,
    deathmark: NPC_DAMAGE_STATUS_BITS.DEATHMARK,
    fractured: NPC_DAMAGE_STATUS_BITS.FRACTURED,
    soulbound: NPC_DAMAGE_STATUS_BITS.SOULBOUND
  },
  prefixes: { hex: NPC_DAMAGE_STATUS_BITS.HEX }
};

export const PLAYER_DAMAGE_SOURCE_MASK = {
  exact: {
    blind: PLAYER_DAMAGE_SOURCE_BITS.BLIND,
    weakened: PLAYER_DAMAGE_SOURCE_BITS.WEAKENED,
    enfeebled: PLAYER_DAMAGE_SOURCE_BITS.ENFEEBLED
  }
};

const npcCombat = createMmoCombatModule<PlayerEntity, NpcEntity, MmoSkillDemoState>({
  canDamage: ({ attacker, target, context }) => Boolean(context && canDamageNpc(context, attacker, target) && !isNpcInvulnerable(target)),
  mitigate: ({ target, amount }) => {
    const defendScale = target.kind === "crystal-beetle" && isNpcDefending(target) ? 0.1 : isNpcDefending(target) ? 0.42 : 1;
    const statusMask = mmoStatusBitmask(target.combatFlags, NPC_DAMAGE_STATUS_MASK);
    const bowVulnerable = target.damageAmpMs > 0 && hasMmoStatusBit(statusMask, NPC_DAMAGE_STATUS_BITS.BOW_VULNERABLE);
    const deathMarked = target.damageAmpMs > 0 && hasMmoStatusBit(statusMask, NPC_DAMAGE_STATUS_BITS.DEATHMARK);
    const fractured = target.damageAmpMs > 0 && hasMmoStatusBit(statusMask, NPC_DAMAGE_STATUS_BITS.FRACTURED);
    const curseAmp = target.damageAmpMs > 0 && (hasMmoStatusBit(statusMask, NPC_DAMAGE_STATUS_BITS.HEX) || hasMmoStatusBit(statusMask, NPC_DAMAGE_STATUS_BITS.SOULBOUND));
    const ampScale = (deathMarked ? 1.25 : bowVulnerable ? 1.2 : curseAmp || target.stunMs > 0 && target.kind === "iron-core-golem" ? 2 : 1) * (fractured ? 1.15 : 1);
    return Math.max(1, Math.floor(amount * defendScale * ampScale));
  },
  onHit: ({ attacker, target, killed }) => {
    awardXp(attacker, "combat", killed ? (target.role === "boss" ? 90 : target.elite ? 36 : 18) : 4);
  },
  onKilled: ({ attacker, target, context }) => {
    if (context) handleNpcKill(context, attacker, target);
  }
});

type DamageNpcOptions = {
  knockbackModifier?: number;
  isHeavyImpact?: boolean;
  energyGain?: number;
  ultimate?: boolean;
  shared?: boolean;
};

export function damageNpc(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, target: NpcEntity, amount: number, options: DamageNpcOptions = {}) {
  player.targetId = target.id;
  const canDamage = canDamageNpc(state, player, target);
  const invulnerable = isNpcInvulnerable(target);
  if (!canDamage || invulnerable) {
    spawnCombatTextHazard(state, target, invulnerable && target.iframeMs > 0 ? "dodge" : "immune");
    return false;
  }
  const vanishStrike = hasTimedPlayerFlag(player, "vanish");
  const result = npcCombat.damage(player, target, vanishStrike ? amount + 12 : amount, state);
  if (!result.ok) {
    spawnCombatTextHazard(state, target, "dodge");
    return false;
  }
  const style = attackStyleForAction(player.action, player);
  if (style) player.lastAttackStyle = style;
  if (target.kind === "glass-clone") {
    const mirror = Array.from(entitiesOfType(state, "npc")).find((npc) => npc.kind === "mirror-king" && npc.zoneId === target.zoneId && npc.hp > 0);
    if (target.combatState === "real" && mirror) {
      for (const clone of entitiesOfType(state, "npc")) if (clone.kind === "glass-clone" && clone.zoneId === target.zoneId) clone.hp = 0;
      mirror.iframeMs = 0;
      mirror.stunMs = Math.max(mirror.stunMs, 2200);
      mirror.combatState = "shattered";
    }
  }
  if (!options.shared && hasCombatFlag(target, "soulbound") && target.damageAmpMs > 0) {
    const partner = hostileNpcs(state, player).find((npc) => npc.id !== target.id && hasCombatFlag(npc, "soulbound") && npc.damageAmpMs > 0);
    if (partner) damageNpc(state, kernel, player, partner, Math.max(1, Math.floor(result.amount * 0.5)), { knockbackModifier: 0, ultimate: true, shared: true });
  }
  const modifier = options.knockbackModifier ?? (player.action === "e" ? 2.2 : player.action === "rmb" ? 1.7 : player.action === "space" ? 1.15 : 0.55);
  applyKnockback(target, player, modifier, result.amount, options.isHeavyImpact ?? (player.action === "rmb" || player.action === "e"));
  updateKnockback(kernel, target, 0);
  if (!options.ultimate) addEnergy(player, options.energyGain ?? 4);
  applyLifeSteal(player, Math.max(1, Math.floor(result.amount * 0.25)));
  if (vanishStrike) {
    removePlayerCombatFlag(player, "vanish");
    removePlayerCombatFlag(player, "stealth");
    player.damageAmpMs = 0;
  }
  if (hasTimedPlayerFlag(player, "trance") && player.action === "lmb") healPlayer(player, 4);
  return true;
}

export function damageNpcAmount(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, target: NpcEntity, amount: number, options: DamageNpcOptions = {}) {
  const before = target.hp;
  return damageNpc(state, kernel, player, target, amount, options) ? Math.max(0, before - target.hp) : 0;
}
